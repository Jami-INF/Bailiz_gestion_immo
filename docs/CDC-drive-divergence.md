# CDC — Détection de divergence entre appareils (sauvegarde Google Drive)

> Lot **A** d'un chantier en deux temps. Objectif : ne plus jamais travailler sur deux versions
> divergentes sans le savoir. La **fusion** des modifications (lot B, synchronisation par
> fichiers) fera l'objet d'un CDC distinct ; ce lot ne fusionne rien.

## 1. Besoin

Deux appareils poussent aujourd'hui dans le même dossier Drive **sans jamais se regarder**. Le
scénario réel :

1. L'iPad travaille lundi sur le terrain et pousse son archive.
2. L'ordinateur, resté sur les données de la semaine précédente, est utilisé mardi. Trente
   secondes après la première modification, il pousse **son** archive, qui devient la plus
   récente du dossier.
3. Rien ne le signale. Les deux versions ont divergé, et c'est la moins à jour qui a l'air d'être
   la bonne.

Le travail de lundi n'est pas perdu — la rotation conserve les dix dernières archives — mais
personne ne sait qu'il faut aller le rechercher, et une journée de terrain intense sur
l'ordinateur peut faire sortir l'archive de l'iPad de la fenêtre de rotation.

Le push étant **automatique et silencieux** (30 s après chaque écriture), l'utilisateur n'a
aujourd'hui aucun moment où il pourrait s'en apercevoir.

## 2. Ce qui existe déjà (à réutiliser, ne pas refaire)

| Brique | État |
|---|---|
| Push Drive complet | ✅ `pousserSauvegardeGDrive` : jeton, dossier « Bailiz », upload multipart, rotation |
| Rotation 10 archives | ✅ `fichiersASupprimer` (fonction pure testée), partagée dossier local / Drive |
| Garde-fou « base vide » | ✅ Un appareil neuf ne pousse jamais une archive vide (précédent exact du garde-fou demandé ici) |
| Codes de résultat | ✅ `ResultatGDrive` / `ResultatPush` remontés jusqu'aux toasts |
| Push à l'ouverture | ✅ `AppLayout`, si la dernière sauvegarde date de plus de 7 jours |
| Push à chaque modification | ✅ `initAutosaveSurModifications` (debounce 30 s) + reprise au retour du réseau |
| Import d'archive | ✅ `lireSauvegarde` + `importerSauvegarde` (modes « remplacer » / « fusionner ») |
| Panneau Drive | ✅ `SauvegardeGDrivePanel` (connexion, push manuel, diagnostic d'erreur) |
| **Identité de l'appareil** | ❌ Rien ne distingue l'origine d'une archive |
| **Lecture de l'état distant** | ❌ Le dossier n'est listé que pour la rotation, jamais pour se comparer |
| **Restauration depuis le Drive** | ❌ Il faut passer par l'interface Google et importer le ZIP à la main |

## 3. Décisions actées

- **Bloquer plutôt que pousser.** À la détection d'une archive distante plus récente venue d'un
  autre appareil, le push Drive **s'interrompt** et l'utilisateur est prévenu. Rien ne part sans
  son accord explicite.
- **Trois moments de vérification** : avant chaque push, à l'ouverture de l'application, et sur
  demande depuis les Paramètres.
- **La rotation reste à 10 archives.** Passer à une archive unique n'a de sens qu'**avec** la
  fusion du lot B : tant qu'on ne fusionne pas, l'historique est précisément ce qui permet de
  récupérer le travail de l'appareil resté en arrière. Ce point est rouvert au lot B.
- **Aucune fusion, aucune résolution automatique.** Ce lot informe et protège ; il ne décide pas.
- **L'horloge fait foi côté serveur** : les comparaisons utilisent `createdTime` renvoyé par
  Drive (UTC), jamais le nom de fichier ni l'horloge locale, qui diffèrent d'un appareil à
  l'autre.

## 4. Spécifications

### 4.1 Identité de l'appareil

- Un identifiant stable par appareil (`crypto.randomUUID()`) et un nom lisible sont conservés
  dans **`localStorage`**, sous les clés `bailiz.appareil.id` et `bailiz.appareil.nom`.
- **Impérativement hors de la sauvegarde** : stockés dans `Parametres`, ils seraient exportés
  dans le ZIP, et un appareil restauré hériterait de l'identité de l'autre — la détection ne
  fonctionnerait plus jamais.
- Nom par défaut déduit de la plateforme (« iPad », « iPhone », « Mac », « Windows »,
  « Android », sinon « Cet appareil »), **modifiable** dans le panneau Drive : c'est ce nom qui
  s'affichera dans l'avertissement.
- Perte du `localStorage` : l'appareil se voit attribuer une nouvelle identité et considérera ses
  propres archives comme étrangères. Conséquence acceptée — un avertissement de trop, jamais un
  écrasement silencieux.

### 4.2 Marquage des archives poussées

À l'upload, les métadonnées Drive portent :

```
appProperties: { appareil: <uuid>, appareilNom: <nom>, exporteLe: <ISO 8601> }
```

`appProperties` est propre à l'application (invisible pour l'utilisateur dans Drive) et limité à
124 octets par valeur : le nom d'appareil est tronqué en conséquence.

### 4.3 Mémoire de ce que l'appareil a vu

Nouveau champ `Parametres.sauvegardeGDrive.derniereArchiveVue` :

```ts
{ id: string; nom: string; createdTime: string; appareil?: string; appareilNom?: string }
```

Il est mis à jour dans **quatre** cas, et seulement ceux-là :

1. après un upload réussi (l'archive que l'on vient de pousser devient la référence) ;
2. après une restauration depuis le Drive (§4.6) ;
3. quand l'utilisateur choisit explicitement « sauvegarder quand même » (§4.5) ;
4. à la **première** vérification, si l'archive la plus récente ne porte pas de marquage
   d'appareil — voir la migration ci-dessous.

**Migration des archives existantes.** Les archives poussées avant cette fonctionnalité n'ont pas
d'`appProperties`. Sans précaution, la première vérification les signalerait comme « venues d'un
autre appareil » : un faux positif à chaque mise à jour de l'application. Règle retenue :

- aucune `derniereArchiveVue` enregistrée **et** archive distante non marquée → adoptée
  silencieusement comme référence (on ne peut rien prouver, et rien n'est en danger) ;
- une `derniereArchiveVue` existe **et** une archive non marquée plus récente apparaît →
  **conflit** (un autre appareil, encore sur l'ancienne version, a poussé).

### 4.4 Vérification

Nouvelle fonction `verifierArchiveDistante(interactif)` dans `lib/gdrive.ts`, qui liste le dossier
(`orderBy=createdTime desc`, `fields=files(id,name,createdTime,appProperties)`) et renvoie :

| État | Signification |
|---|---|
| `a_jour` | L'archive la plus récente est celle que cet appareil connaît (ou qu'il a poussée) |
| `aucune` | Le dossier ne contient aucune archive |
| `divergence` | Une archive plus récente, poussée par un autre appareil, existe — avec sa date, son nom d'appareil et son identifiant Drive |
| `indisponible` | Pas de jeton, hors-ligne, ou Drive inactif : la vérification est simplement reportée, ce n'est pas une erreur |

La fonction ne modifie rien, hors le cas de migration du §4.3.

### 4.5 Comportement du push

Dans `pousserSauvegardeGDrive`, **avant l'upload** et après l'obtention du jeton :

- si `verifierArchiveDistante` renvoie `divergence` et que le push n'est pas forcé →
  **aucun upload**, nouveau code de résultat `'conflit'` ;
- `pousserSauvegardeGDrive(interactif, { forcer: true })` passe outre, après avoir marqué
  l'archive distante comme vue.

Conséquences sur l'agrégation de `pousserSiActive` : `'conflit'` est **prioritaire sur `'ok'`**.
Le dossier local a pu être sauvegardé avec succès, mais l'utilisateur doit être averti de l'état
du Drive — c'est le seul état à la fois actionnable et dangereux.

Notification (`planifierPush`) : avertissement **une seule fois par session** — comme
`reconnexionSignalee` — sans quoi chaque modification déclencherait le même message toutes les
30 secondes.

### 4.6 Interface

**Bandeau de conflit** dans le panneau Google Drive des Paramètres, affiché tant que la
divergence n'est pas résolue :

> Une sauvegarde plus récente existe sur le Drive, envoyée depuis « iPad » le 8 août 2026 à
> 14 h 32. La sauvegarde automatique de cet appareil est suspendue pour ne pas la recouvrir.

Trois actions :

1. **Restaurer cette sauvegarde** — télécharge l'archive (`alt=media`), l'ouvre avec
   `lireSauvegarde`, puis `importerSauvegarde(..., 'remplacer')` après confirmation explicite
   rappelant que **les modifications locales absentes de cette archive seront perdues**. Met à
   jour `derniereArchiveVue`.
2. **Sauvegarder quand même** — marque l'archive distante comme vue et pousse. L'archive de
   l'autre appareil reste dans l'historique de rotation.
3. **Vérifier le Drive** — relance la vérification (bouton également disponible hors conflit,
   avec affichage de l'état : à jour, aucune archive, ou date de la dernière).

**À l'ouverture de l'application** : vérification silencieuse si une autorisation valide existe.
En cas de divergence, un avertissement persistant renvoie vers les Paramètres. Sur Safari/iPad,
le renouvellement silencieux du jeton échoue souvent : la vérification est alors reportée au
prochain push, sans message d'erreur.

### 4.7 Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/lib/appareil.ts` | **nouveau** : identité de l'appareil (localStorage), nom par défaut |
| `src/lib/gdrive.ts` | marquage `appProperties`, `verifierArchiveDistante`, `telechargerArchive`, garde-fou dans `pousserSauvegardeGDrive`, code `'conflit'` |
| `src/lib/autosave.ts` | propagation de `'conflit'` (priorité sur `'ok'`), avertissement une fois par session |
| `src/types.ts` | + `derniereArchiveVue` dans `sauvegardeGDrive` |
| `src/features/parametres/SauvegardeAutoPanels.tsx` | bandeau de conflit, restauration, bouton de vérification, nom de l'appareil |
| `src/components/AppLayout.tsx` | vérification à l'ouverture |
| `README.md` | mise à jour de la section sauvegarde |

## 5. Contraintes

- **Ne rien casser du push existant.** Le garde-fou s'insère en un seul point ; tous les autres
  chemins (base vide, hors-ligne, jeton expiré, retry) restent inchangés.
- **Un appel Drive supplémentaire par push** (liste du dossier, `pageSize=1`) : négligeable, et
  déjà nécessaire pour la rotation.
- **Hors-ligne** : la vérification échoue proprement en `indisponible` et **n'empêche pas** le
  push local vers le dossier synchronisé.
- **Jeton non persisté** : aucune vérification n'est possible sans autorisation valide. Ce n'est
  jamais une erreur affichée à l'utilisateur, seulement un report.
- **Sécurité** : le scope reste `drive.file` ; l'application ne voit que les fichiers qu'elle a
  créés, quel que soit l'appareil d'origine.
- **Aucune donnée personnelle supplémentaire** ne quitte l'appareil : le nom d'appareil est
  choisi par l'utilisateur et n'identifie pas une personne.

## 6. Découpage

| Lot | Contenu | Vérification |
|---|---|---|
| **A1** | `lib/appareil.ts` + marquage des uploads | Test unitaire : identité stable, nom par défaut par plateforme |
| **A2** | `verifierArchiveDistante` + règles de comparaison et de migration | Tests unitaires de la fonction de décision (pure), tous états couverts |
| **A3** | Garde-fou dans le push + code `'conflit'` + agrégation | Test : push bloqué en divergence, forcé quand demandé, inchangé sinon |
| **A4** | Interface : bandeau, restauration, bouton de vérification, nom d'appareil | Parcours réel dans l'application |
| **A5** | Vérification à l'ouverture + README | Contrôle manuel |

## 7. Critères d'acceptation

- [x] Une archive poussée porte l'identifiant et le nom de l'appareil d'origine.
- [x] Un push dont l'archive distante est plus récente et étrangère **n'envoie rien** et remonte
      `'conflit'`.
- [x] Le même push, forcé depuis l'interface, envoie l'archive et cesse d'avertir.
- [x] Un push normal (aucune divergence) se comporte exactement comme avant.
- [x] Une archive antérieure à la fonctionnalité n'entraîne pas de faux conflit au premier usage.
- [ ] La restauration depuis le Drive remplace les données locales après confirmation explicite,
      et fait disparaître l'avertissement.
- [x] Sans autorisation Google valide, aucune erreur n'est affichée : la vérification est
      reportée.
- [x] Un conflit sur le Drive n'empêche pas la sauvegarde vers le dossier local.
- [x] L'avertissement n'apparaît qu'une fois par session, pas à chaque modification.
- [x] `npm run lint`, `npm test` et `npm run build` sortent en code 0.

## 8. Hors périmètre (lot B)

- Fusion des modifications entre appareils, synchronisation par fichiers, marqueurs de
  suppression, file d'attente hors-ligne par enregistrement.
- Abandon du ZIP au profit d'un miroir de fichiers, et politique de rétention associée.
- Résolution automatique d'un conflit, quelle qu'elle soit.
