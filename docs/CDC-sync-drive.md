# CDC — Synchronisation Google Drive par fichiers (lot B)

> Suite du lot A (`docs/CDC-drive-divergence.md`), qui **détecte** la divergence sans la résoudre.
> Ce lot la **supprime** : les deux appareils convergent vers un même état, sans jamais perdre les
> modifications faites en parallèle.

## 1. Besoin

Le lot A a mis un garde-fou : quand l'autre appareil a sauvegardé, on n'envoie plus rien et on
prévient. C'est un pansement — il faut ensuite choisir *quelle version jeter*.

Ce qui est demandé : **une seule version, toujours à jour**, alimentée par les deux appareils.
Concrètement, si l'iPad ajoute un état des lieux pendant que l'ordinateur modifie un bail, les
deux doivent se retrouver, sans arbitrage manuel et sans perte.

Deux contraintes non négociables héritées de l'application :

- **Le travail hors-ligne reste possible** (état des lieux en cave, en parking). Le Drive ne peut
  donc pas être la référence au moment de l'écriture : on écrit en local, on converge ensuite.
- **La suppression RGPD d'un locataire doit rester définitive**, y compris après convergence.
  C'est le piège principal (§3, §4.4).

## 2. Pourquoi des fichiers et non le ZIP

Fusionner deux ZIP imposerait, à chaque modification, de télécharger l'archive distante, la
décompresser, comparer, recompresser et tout ré-envoyer — plusieurs dizaines de mégaoctets dans
les deux sens, à cause des photos. Intenable en 4G, et impossible à faire de façon incrémentale.

En fichiers séparés :

| | ZIP | Fichiers |
|---|---|---|
| Envoi d'une modification d'EDL | toute l'archive | un JSON de quelques Ko |
| Photos | ré-envoyées à chaque push | envoyées **une seule fois** (elles sont immuables) |
| Fusion | impossible sans tout décompresser | comparaison fichier par fichier |
| Reprise après coupure | tout est à refaire | seuls les fichiers manquants repartent |

Le ZIP n'est pas abandonné pour autant : il devient le **filet hebdomadaire** (§4.8).

## 3. Ce qui manque dans le modèle actuel

| Brique | État |
|---|---|
| Identité d'appareil, marquage Drive | ✅ Lot A (`lib/appareil.ts`, `appProperties`) |
| Dossier Drive, jeton, upload multipart, rotation | ✅ `lib/gdrive.ts` |
| Hooks Dexie sur toutes les tables métier | ✅ `initAutosaveSurModifications` (utilisés pour le debounce) |
| Import/export ZIP | ✅ Conservé pour l'export manuel et le filet hebdomadaire |
| `updatedAt` sur les entités | ⚠️ Présent sur `Bien`, `Locataire`, `Bail`, `EtatDesLieux` — **absent** sur `Photo` et `DocumentGenere` (immuables, cf. §4.3) |
| **Journal des modifications** | ❌ Rien ne dit ce qui a changé depuis la dernière synchronisation |
| **Marqueurs de suppression** | ❌ Une suppression est invisible pour l'autre appareil : une fusion naïve la **ressusciterait** |
| **Index local ↔ Drive** | ❌ Aucun lien entre un enregistrement et son fichier distant |
| **Séquence de références** | ❌ Deux appareils hors-ligne peuvent attribuer la même référence `BAIL-2026-0007` |

## 4. Spécifications

### 4.1 Disposition sur le Drive

Dans le dossier `Bailiz` existant :

```
Bailiz/
  donnees/      <table>__<id>.json      un fichier par enregistrement
  photos/       <id>.jpg                blobs, immuables
  documents/    <id>.pdf                blobs, immuables
  tombstones/   <table>__<id>.json      marqueurs de suppression
  archives/     bailiz-sauvegarde-*.zip filet hebdomadaire (§4.8)
```

Dossiers **plats** volontairement : Drive interroge par parent, et une requête
`'<dossier>' in parents and modifiedTime > '<date>'` suffit alors à obtenir tout ce qui a changé
depuis la dernière synchronisation. Chaque fichier porte
`appProperties: { table, cle, modifieLe, appareil }` — l'identité du lot A sert ici à savoir
qui a écrit quoi.

Contenu d'un fichier de `donnees/` :

```json
{ "table": "baux", "cle": "<uuid>", "modifieLe": "2026-08-08T14:32:00.000Z",
  "appareil": "<uuid>", "donnees": { …l'enregistrement… } }
```

### 4.2 Journal local des modifications

Nouvelle table Dexie `changements` (version 4), alimentée par les hooks déjà en place :

```ts
{ id: ++, table: string, cle: string, type: 'maj' | 'suppr', horodatage: string }
```

- C'est à la fois le **suivi des changements** et la **file d'attente hors-ligne** : une entrée
  n'est retirée qu'après confirmation de l'envoi. Une coupure réseau, un onglet fermé, un iPad en
  veille : rien n'est perdu, tout repart au prochain cycle.
- Les écritures faites **par la synchronisation elle-même** ne doivent pas produire d'entrée,
  sinon chaque pull relancerait un push (boucle). Un drapeau `synchronisationEnCours` neutralise
  les hooks pendant l'application des données distantes.
- Compaction : plusieurs `maj` sur la même clé se réduisent à une seule au moment du push.

### 4.3 Enregistrements immuables

`Photo` et `DocumentGenere` n'ont pas de date de modification, et n'en ont pas besoin : une photo
n'est jamais modifiée après capture, un PDF archivé est remplacé (supprimé + recréé) et non
réécrit. Conséquence : **aucun conflit possible**, la règle se simplifie à « si le blob n'est pas
en face, l'envoyer / le récupérer ». C'est aussi ce qui rend la synchronisation économe : les
photos ne remontent qu'une fois.

### 4.4 Suppressions

Une suppression locale produit :

1. la suppression du fichier de `donnees/` (ou du blob) ;
2. la création d'un fichier dans `tombstones/`, contenant `{ table, cle, supprimeLe, appareil }`
   — **aucune donnée personnelle**, seulement une clé technique.

À la réception, un tombstone plus récent que l'enregistrement local le supprime. Sans ce
mécanisme, la suppression RGPD d'un locataire serait annulée au prochain push de l'autre
appareil : c'est la raison d'être de ce lot le plus difficile à voir et le plus grave à manquer.

Les tombstones sont purgés au-delà de **six mois** : passé ce délai, un appareil qui n'a pas
synchronisé depuis six mois ne doit de toute façon pas être fusionné à l'aveugle (§4.9).

### 4.5 Règle de convergence

**Dernier écrivain gagne, enregistrement par enregistrement**, en comparant `modifieLe` (issu de
`updatedAt` pour les entités qui en ont, sinon de l'horodatage du journal).

- Égalité d'horodatage : la version distante l'emporte — l'utilisateur a dit faire davantage
  confiance au Drive, et cela rend la convergence déterministe des deux côtés.
- **Décalage d'horloge** : c'est la limite assumée de la règle. Un appareil dont l'horloge
  retarde de dix minutes peut perdre une modification récente. Atténuation : à chaque
  synchronisation, l'écart entre l'horloge locale et l'heure serveur de Drive est mesuré ; au-delà
  de **deux minutes**, un avertissement invite à corriger l'heure de l'appareil.
- Les enregistrements ne sont **jamais fusionnés champ par champ** (sauf §4.6) : un EDL à moitié
  d'un appareil et à moitié de l'autre n'aurait aucun sens juridique.

### 4.6 Cas particuliers du singleton `parametres`

Le dernier-écrivain-gagne ne convient pas : ce document unique mélange des données de natures
différentes.

| Champ | Règle | Pourquoi |
|---|---|---|
| `bailleur`, `grilleVetuste`, `ficheVisite`, `clausesBail` | dernier écrivain gagne | Réglages, modifiés rarement et volontairement |
| `compteursSequence` | **maximum par compteur** | Deux appareils hors-ligne attribueraient sinon la même référence `BAIL-2026-0007` à deux baux différents |
| `sauvegardeGDrive` | **jamais synchronisé** | Contient l'état de synchronisation propre à l'appareil (`derniereArchiveVue`, `dossierId`) |
| `derniereSauvegarde` | le plus récent | Information d'affichage |

**La numérotation reste le point faible** — traité par la détection : le maximum évite les doublons *après* convergence,
mais deux baux créés hors-ligne le même jour sur deux appareils porteront la même référence
jusqu'à la première synchronisation. Détection prévue : à la convergence, une référence en double
est signalée à l'utilisateur, qui renumérote depuis la fiche du bail. Aucune renumérotation
automatique — une référence figure sur un document déjà imprimé.

### 4.7 Cycle de synchronisation

Un cycle = **pull puis push**, dans cet ordre (on part de l'état distant pour ne pas écraser).

1. **Pull** : lister `donnees/`, `photos/`, `documents/`, `tombstones/` avec
   `modifiedTime > derniereSync`, télécharger, appliquer selon §4.4 et §4.5.
2. **Push** : compacter le journal, envoyer les créations/modifications, créer les tombstones,
   vider les entrées confirmées.
3. Enregistrer `derniereSync` (heure **serveur**, pas locale) et l'écart d'horloge constaté.

Déclencheurs, repris de l'existant : après chaque signature, 30 s après la dernière modification
(debounce), à l'ouverture, au retour du réseau, et manuellement.

**Concurrence** : deux appareils qui synchronisent en même temps ne se corrompent pas — chaque
fichier est indépendant et la règle est déterministe. Le seul risque est un aller-retour
supplémentaire, résolu au cycle suivant.

**Interruption** : un cycle coupé au milieu laisse le Drive partiellement à jour. Comme chaque
enregistrement est autonome, l'état reste cohérent ; les entrées non confirmées restent dans le
journal et repartent. Les seules références croisées (bail → bien, EDL → bail) tolèrent une
absence temporaire, l'interface affichant déjà les entités manquantes sans planter.

### 4.8 Filet de sécurité

Une seule version vivante qui se met à jour toute seule, c'est une version qu'un défaut de fusion
peut abîmer définitivement. Le ZIP est conservé comme **instantané hebdomadaire**, jamais
fusionné, jamais modifié : `archives/bailiz-sauvegarde-*.zip`, un par semaine, quatre conservés.
C'est ce qui réconcilie « une seule à jour » et « garante des données ».

### 4.9 Garde-fous

- **Première synchronisation d'un appareil vide** : aucun traitement particulier n'est requis.
  Le cycle rapatrie tout, ce qui *est* la restauration attendue ; et aucune suppression ne peut
  partir, le journal ayant été effacé en même temps que les données.
- **Appareil désynchronisé depuis plus de six mois** (au-delà de la purge des tombstones) :
  fusion refusée, restauration complète proposée.
- **Écart d'horloge supérieur à deux minutes** : avertissement avant de synchroniser.
- **Suppression massive** : si un cycle s'apprête à supprimer plus de la moitié des
  enregistrements locaux, il s'arrête et demande confirmation. Un tombstone erroné ne doit pas
  pouvoir vider la base en silence.

### 4.10 Un seul mode

Brancher le Drive, **c'est** synchroniser. Il n'y a plus d'interrupteur, plus de mode « archive
complète » vers Drive, et plus de garde-fou de divergence : pour ne pas synchroniser, on
déconnecte le Drive. Le dossier local synchronisé (File System Access) continue de recevoir des
ZIP, inchangé.

> Deux révisions successives, le 9 août 2026. La version initiale prévoyait un déploiement
> progressif, interrupteur désactivé par défaut. Il a d'abord été inversé (activé par défaut),
> puis retiré : les deux modes ne coexistaient qu'en apparence, et **chaque couture entre eux
> avait produit un défaut** — date de sauvegarde partagée qui réduisait la synchro d'ouverture à
> une fois par semaine, vocabulaires de résultat mélangés, garde-fou de divergence devenu sans
> objet mais toujours évalué à la connexion, où il accueillait un second appareil par un faux
> avertissement de conflit.

Ce que la suppression emporte : `pousserSauvegardeGDrive`, `verifierArchiveDistante`,
`comparerArchives`, `marquerArchiveVue`, `telechargerArchiveGDrive`, le type `ArchiveDrive`, les
champs `syncActive` / `derniereArchiveVue` / `dernierPush`, l'état `conflit`, et le panneau
`SyncPanel` — fondu dans le panneau Drive.

La restauration, elle, est **conservée et améliorée** : elle ne vise plus l'archive concurrente
détectée par le garde-fou, mais la liste des instantanés de `archives/` (§4.9), présentée dans le
panneau Drive.

### 4.11 Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/lib/sync/journal.ts` | **nouveau** : table `changements`, hooks, compaction |
| `src/lib/sync/protocole.ts` | **nouveau** : format des fichiers, encodage/décodage, règles de convergence (pur, testé) |
| `src/lib/sync/drive.ts` | **nouveau** : opérations Drive de bas niveau (lister, lire, écrire, supprimer) |
| `src/lib/sync/cycle.ts` | **nouveau** : pull, push, garde-fous, état |
| `src/lib/db.ts` | version 4 : `changements`, `syncEtat` |
| `src/lib/gdrive.ts` | réutilisation du jeton et du dossier ; retrait du garde-fou quand la sync est active |
| `src/lib/autosave.ts` | déclenche un cycle au lieu d'un push ZIP quand la sync est active |
| `src/features/parametres/SyncPanel.tsx` | **nouveau** : activation, état, dernier cycle, conflits signalés |
| `README.md`, `docs/` | mise à jour |

## 5. Découpage

| Lot | Contenu | Vérification |
|---|---|---|
| **B1** | Journal des modifications + table `syncEtat` (Dexie v4), neutralisation pendant la sync | Tests : chaque écriture produit une entrée, aucune pendant l'application distante, compaction correcte |
| **B2** | Protocole : format de fichier, règles de convergence, fusion de `parametres` | Tests unitaires exhaustifs (fonctions pures) — c'est le cœur, il doit être couvert avant tout branchement réseau |
| **B3** | Opérations Drive (lister par date, lire, écrire, supprimer) | Tests avec `fetch` simulé |
| **B4** | Cycle pull/push + garde-fous §4.9 | Tests de scénarios : création parallèle, modification concurrente, suppression, reprise après coupure |
| **B5** | Interface : activation, état, avertissements | Parcours réel |
| **B6** | Instantané hebdomadaire + retrait du garde-fou A | Contrôle manuel |
| **B7** | README, documentation technique | Relecture |

## 6. Critères d'acceptation

- [x] Une modification faite sur un appareil apparaît sur l'autre après un cycle, sans écraser les
      modifications faites en parallèle sur d'autres enregistrements.
- [x] Une suppression (dont la suppression RGPD d'un locataire) se propage et **ne revient jamais**.
- [x] Une photo déjà synchronisée n'est jamais renvoyée, et son contenu local n'est jamais
      écrasé par la réception des métadonnées.
- [x] Un cycle interrompu (réseau coupé) reprend sans perte au cycle suivant.
- [x] Deux baux créés hors-ligne avec la même référence sont signalés, jamais renumérotés en silence.
- [x] Les compteurs de séquence convergent vers le maximum, sans régression.
- [x] `sauvegardeGDrive` n'est jamais écrasé par la version distante.
- [x] Une base locale vide ne « supprime » pas les données du Drive — **par construction** :
      effacer les données du navigateur efface aussi le journal, donc aucune suppression n'est
      en attente. Le garde-fou dédié, d'abord écrit puis retiré à l'épreuve des tests, bloquait
      en réalité la suppression volontaire de toutes ses données (cf. `cycle.ts`).
- [x] Un instantané ZIP hebdomadaire reste disponible et n'est jamais fusionné.
- [x] Synchronisation désactivée : comportement strictement identique à aujourd'hui.
- [x] `npm run lint`, `npm test` et `npm run build` sortent en code 0.

## 5 bis. Journalisation : le piège des hooks Dexie

Un hook Dexie s'exécute **à l'intérieur** de la transaction de la table modifiée. Y écrire dans
`changements` échoue — cette table n'appartient pas à la transaction — et l'échec est
silencieux. Deux précautions, cumulées :

- les écritures sont **accumulées en mémoire** puis versées au journal par un minuteur, hors de la
  transaction ;
- le versement passe par `Dexie.ignoreTransaction`, qui détache explicitement. Ne pas s'en
  remettre au seul minuteur : la propagation de zone dépend de l'environnement, et **les tests
  Node ne la reproduisent pas** — le défaut n'a été vu qu'en exécutant l'application.

En complément, `rattraperChangements` compare la base à l'état de synchronisation et journalise
ce qui manque : première activation sur une base déjà remplie, ou écriture perdue entre le hook et
le journal. Les **suppressions** échappent à ce filet (rien à comparer) : elles dépendent
entièrement des hooks.

## 6 bis. Défauts trouvés à l'épreuve des tests

Consignés ici pour ne pas être réintroduits : tous étaient invisibles à la relecture et n'ont
été révélés que par les scénarios.

| Défaut | Conséquence si non corrigé |
|---|---|
| Le contenu binaire n'était jamais rapatrié (condition impossible dans la boucle) | Photos et PDF absents sur le second appareil |
| La réception des métadonnées écrasait le blob local | Photo réduite à sa légende, contenu perdu |
| Les métadonnées d'un blob étaient réécrites sans réutiliser le fichier existant | Un doublon sur le Drive à chaque envoi |
| La suppression ne retirait pas le contenu binaire distant | Photo d'un locataire supprimé conservée sur le Drive — contraire à l'effacement RGPD |
| Les réglages distants l'emportaient à chaque cycle (comparaison de dates sans signification) | Bailleur, grille de vétusté, catalogue de clauses et modèle de fiche de visite écrasés à chaque synchronisation |
| Le singleton `parametres` passait par la boucle de réception générique | Configuration Drive de l'appareil effacée, déconnexion à chaque cycle |
| Le garde-fou « suppression massive » se déclenchait dès 1 suppression sur 1 | Usage quotidien bloqué |

## 7. Hors périmètre

- Fusion champ par champ d'un même enregistrement (deux appareils modifiant le même EDL).
- Résolution interactive de conflit : la règle est automatique et déterministe.
- Synchronisation temps réel : le cycle reste déclenché, pas continu.
- Partage multi-utilisateurs (un second bailleur, un gestionnaire) : autre sujet, autre modèle.
