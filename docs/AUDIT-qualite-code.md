# Audit de qualité du code

> Complète `README.md`, `docs/DOCUMENTATION_TECHNIQUE.md` et `docs/CDC-accessibilite-ux.md`.
> Périmètre : **la santé du code lui-même** - duplication, invariants, code mort, cohérence,
> complexité, couverture de test. Aucun changement de comportement métier n'est proposé ici.
>
> Audit du 13/08/2026, sur `main` à `dcf18bb` + le lot L1 en cours. Méthode : lecture ciblée,
> recensement mécanique (exports, écritures, `catch`, motifs répétés) et **couverture réellement
> mesurée** (`vitest --coverage`, `lcov.info`). Toutes les valeurs citées sont mesurées.

---

## 1. Verdict

Le code est **au-dessus de la moyenne de ce qu'on trouve dans un projet de cette taille**, et les
mesures le disent plutôt que l'impression :

| Indicateur | Mesure |
|---|---|
| `any` explicites hors tests | **0** |
| `@ts-ignore` / `@ts-expect-error` | **0** |
| `TODO` / `FIXME` / `HACK` | **0** |
| `eslint-disable` en code applicatif | **2**, tous deux commentés et justifiés |
| Erreurs ESLint | **0** (20 avertissements, tous assumés par `eslint.config.js`) |
| `URL.createObjectURL` sans `revoke` correspondant | **0** sur 8 paires |
| Tests | **489** en 47 fichiers, 18 s |

Il n'y a donc **aucun défaut grave à corriger en urgence**. Ce qui suit relève de trois familles :
des **invariants tenus par convention plutôt que par le code**, une **duplication localisée** que le
projet s'interdit pourtant par principe (décision n°5 du CDC accessibilité), et une **couverture de
test dont la répartition ne suit pas celle du risque**.

---

## 2. Ce qui est bon (à ne pas défaire)

| Point | Constat |
|---|---|
| Commentaires | Ils expliquent **pourquoi**, souvent en citant l'incident d'origine (`journal.ts:75-81` sur `setTimeout` vs `queueMicrotask`, `db.ts:216-220` sur `ReadOnlyError`). C'est rare et précieux |
| Typage | Aucun `any`, aucun `ts-ignore`. Les 23 assertions `!` sont concentrées dans le rendu PDF, où la donnée est validée en amont |
| Gestion d'erreur | `decrireErreur` traduit les fautes navigateur (quota, mode privé, clé) en français lisible - pensé pour la tablette, où la console est inaccessible |
| Couverture du métier | `src/lib/sync` **87 %**, `src/lib` **74 %**, `src/lib/pdf` **74 %**. Les calculs légaux, le protocole de synchronisation et le rendu PDF sont sérieusement testés |
| Nommage | Français cohérent de bout en bout, y compris dans les identifiants internes. Aucun franglais |
| Libération des ressources | Les 8 `createObjectURL` ont tous leur `revoke` |
| Frontières de modules | `lib/` ne dépend jamais de `features/`. Aucun cycle d'import |

---

## 3. Lot Q1 - Invariants tenus par convention

C'est la famille la plus intéressante : rien ne casse aujourd'hui, mais **la règle vit dans la tête
du développeur, pas dans le code**.

### Q1.1 - « Signé = figé » n'est pas garanti à l'écriture

`EdlTerrainPage.tsx` compte **9 écritures en base**. Une seule porte la garde :

```ts
const maj = (m: Partial<EtatDesLieux>) => {
  if (signe) return;                                    // :98 - la garde
  void db.edls.put({ ...edl, ...m, updatedAt: nowISO() });
};
```

Les huit autres écrivent en direct. Trois le font **à dessein et le documentent** :
`rattacherBail` (`:146`, un classement, pas une rectification), `rectifier` (`:271`, rouvre
justement un EDL signé), `ajouterAvenant` (`:288`, un avenant se pose après signature).

Les trois autres ne le documentent pas, et ne sont protégées que par le JSX :

| Écriture | Ligne | Garde |
|---|---|---|
| `ajouterElement` | `:207`, `:213` | `{!signe && !sortie && (` au rendu, `:730` |
| `ajouterPiece` | `:247`, `:253` | `{!signe && !sortie && (` au rendu, `:388` |
| `majCompteurs` (écriture sur `bien`) | `:115` | **aucune** - `maj({ compteurs })` est neutralisé, mais la ligne suivante écrit dans `db.biens` sans condition |

La valeur juridique du produit repose entièrement sur « un état des lieux signé ne bouge plus ».
Faire dépendre cet invariant d'une condition de rendu, c'est le confier à celui qui écrira le
prochain bouton.

**Correctif** : une garde unique au point d'écriture. Soit `maj` reçoit une option
`memeSigne: true` pour les trois cas légitimes, soit un helper `ecrireEdl(patch, { memeSigne })`
remplace les 9 appels. Le second est préférable : il supprime aussi la duplication de Q2.1.

### Q1.2 - Trois façons de lire les paramètres, dont une qui saute la normalisation

`db.ts` expose deux lectures aux sémantiques distinctes, et le commentaire de `:216-220` est
explicite : *« Lecture **sans écriture** des paramètres : la seule forme utilisable dans un
`useLiveQuery` »* - un `liveQuery` s'exécute en transaction lecture seule, `getParametres` y lèverait
une `ReadOnlyError`.

| Forme | Normalise ? | Crée la ligne ? | Usages |
|---|---|---|---|
| `lireParametres()` | ✅ | non | 6 |
| `getParametres()` | ✅ | ✅ | 20 |
| `db.parametres.get('singleton')` brut | ❌ | non | **8**, dont **6 dans un `useLiveQuery`** |

`normaliser()` (`db.ts:207`) complète `ficheVisite` et `clausesBail`, *« les champs apparus après
leur création (ou après une restauration de sauvegarde plus ancienne) »*. Les 5 sites bruts
(`AppLayout.tsx:73`, `:166`, `:323`, `TableauDeBordPage.tsx:33`, `SauvegardeAutoPanels.tsx:147`,
plus `EdlSynthesePage.tsx:50`) ne l'appliquent pas.

**Vérifié : aucun bug aujourd'hui.** Ces sites ne lisent que `sauvegardeGDrive`,
`disclaimerAccepte`, `derniereSauvegarde`, `grilleVetuste` et `bailleur` - jamais les deux champs
normalisés (les deux derniers appels bruts, `backup.ts:46` et `cycle.ts:153`, sont hors React et ne
lisent que `bailleur` et `sauvegardeGDrive`). Le jour où l'un d'eux lit `clausesBail`, il obtiendra
`undefined` sur une base restaurée depuis une vieille sauvegarde, **sans erreur**.

**Un cas est porteur et mérite un commentaire plutôt qu'un correctif** : `AppLayout.tsx:323`
(`DisclaimerPremiereUtilisation`) teste `params === undefined` pour distinguer « ligne pas encore
créée » de « ligne créée, disclaimer non accepté ». `lireParametres()` rendrait les valeurs par
défaut immédiatement et **ferait apparaître la modale avant la création de la ligne**. La forme
brute est ici volontaire, mais rien ne le dit.

**Correctif** : basculer les 6 sites sur `lireParametres()`, sauf `:323` où l'on ajoute le
commentaire qui manque. Et faire dire au commentaire de `lireParametres` qu'elle normalise, ce qui
est sa seconde raison d'être.

### Q1.3 - Le nettoyage « au démontage » qui s'exécute à chaque aperçu

`BailRapidePage.tsx:135-138` :

```ts
// Libère l'URL au démontage.
useEffect(() => () => {
  if (apercu) URL.revokeObjectURL(apercu.url);
}, [apercu]);
```

Avec `[apercu]` en dépendance, le nettoyage ne s'exécute pas qu'au démontage : **il s'exécute à
chaque changement d'aperçu**, c'est-à-dire à chaque frappe débattue du formulaire. La révocation y
fait double emploi avec `:116`, qui libère déjà l'URL précédente au moment de la remplacer.

Sans conséquence en production (révoquer deux fois est un no-op). Mais `main.tsx:36` monte
l'application en `React.StrictMode`, qui joue *montage → nettoyage → montage* : au second montage,
l'URL encore affichée a déjà été révoquée. **L'aperçu peut apparaître vide en développement**, ce
qui envoie chercher un bug de génération PDF là où il n'y en a pas.

**Correctif** : dépendances `[]` avec une référence pour l'URL courante, ou supprimer l'effet et ne
garder que la libération de `:116` plus une au démontage.

---

## 4. Lot Q2 - Duplication et simplification

Le CDC accessibilité pose en décision n°5 : *« Zéro duplication de code et de champs. Principe
directeur, qui prime sur le confort d'un parcours. »* Ces trois points sont les endroits où le code
ne suit pas encore son propre principe.

### Q2.1 - La mise à jour d'une pièce, écrite quatre fois

Le motif `edl.pieces.map((p) => p.id !== X ? p : { ...p, elements: … })` apparaît dans
`majElement` (`:118`), `renseignerRestants` (`:170`), `ajouterElement` (`:207`) et
`supprimerElement` (`:225`). Deux d'entre eux imbriquent un second `map` sur `elements`, ce qui
donne des expressions de 12 à 18 lignes pour une opération d'une ligne conceptuelle.

**Correctif** : deux helpers dans le fichier, `majPiece(pieceId, fn)` et
`majElements(pieceId, fn)`. Quatre appels d'une ligne à la place, et la garde de Q1.1 trouve un
point unique où se poser.

### Q2.2 - Le motif « action en cours » écrit neuf fois

`const [enCours, setEnCours] = useState(false)` apparaît **9 fois**, systématiquement suivi du même
`try / catch → toast(decrireErreur) / finally → setEnCours(false)`. Sept occurrences sont
rigoureusement identiques à la formulation du message près.

**Correctif possible, à arbitrer** : un `useAction()` qui rend `{ enCours, lancer }`, où `lancer`
prend l'action et le préfixe du message d'erreur. Gain réel mais modeste (≈ 40 lignes), et le motif
actuel a le mérite d'être lisible sans indirection. **Recommandation : ne pas le faire maintenant** -
à retenir si un dixième cas apparaît.

### Q2.3 - `EdlTerrainPage` : un composant de 1 048 lignes

Le plus gros composant du projet, et de loin :

| Composant | Lignes |
|---|---|
| `EdlTerrainPage` | **1 048** |
| `BailRapidePage` | 715 |
| `BienFormPage` | 694 |
| `BailDetailPage` | 496 |

Il porte 9 états locaux, 4 `useLiveQuery`, 14 gestionnaires et 5 modales. Ce n'est pas du code
mauvais - il est bien commenté et sa logique est juste - mais c'est le fichier où toute
modification demande de tenir 1 000 lignes en tête, et c'est aussi **l'écran le plus critique du
produit**.

**Découpe naturelle, sans changer un comportement** : `CarteElement` (le bloc élément : état,
quantité, dégradation, commentaire, photos - environ 200 lignes de JSX répétées par élément),
`BarreOnglets`, et les 4 modales en composants frères. Le corps retomberait autour de 400 lignes.

**À traiter après Q1.1** : la garde d'écriture doit être posée avant de disperser les appels.

✅ **Livré**, cf. §10. Le corps est descendu à **693 lignes** et non 400 : l'onglet « Infos » et les
bandeaux contextuels ont été laissés en place, faute d'un découpage qui apporte plus qu'il ne
disperse. Les trois blocs qui pesaient vraiment sont sortis.

---

## 5. Lot Q3 - Code mort et surface d'API

### Q3.1 - Une fonction morte

`src/lib/sync/journal.ts:37` - `estApplicationDistante()` : **une seule occurrence dans tout le
dépôt, sa propre définition.** Jamais appelée, pas même par les tests. À supprimer (le drapeau
`applicationDistante` reste utilisé par `sansJournaliser` et `journaliser`).

### Q3.2 - `journaliser` n'est utilisée que par les tests

`journaliser()` (`journal.ts:52`) compte **~60 appels, tous dans des fichiers `.test.ts`**. La
production passe exclusivement par `noterChangement()` (`:70`), branché sur les hooks Dexie dans
`autosave.ts:286-294`.

Les deux ne font pas la même chose : `journaliser` écrit directement et se laisse attendre,
`noterChangement` accumule en mémoire et vide la file dans un `setTimeout` - précisément pour sortir
de la transaction Dexie, comme l'explique le commentaire de `:75-81`.

Ce n'est pas du code mort : c'est une **couture de test** légitime, et `journal.test.ts:203-204`
exerce bien le vrai chemin des hooks. Mais rien ne le dit, et `journaliser` se lit comme l'API de
production. Les 7 fichiers de test de synchronisation valident donc le protocole à travers un
chemin que la production ne prend jamais.

**Correctif** : une phrase de doc sur `journaliser` (« couture de test : la production passe par
`noterChangement` »), et vérifier que le chemin différé est couvert ailleurs qu'en un point.

### Q3.3 - Exports internes inutiles

**32 identifiants exportés ne sont utilisés que dans leur propre fichier** : 8 constantes ou
fonctions (`SUPPRESSIONS_TOLEREES`, `INTERVALLE_SIGNATURE_MS`, `SEUIL_QUOTA_CRITIQUE_PCT`,
`FAMILLES_CLAUSE`, `LIEN_DOSSIER_FACILE`, `construirePiecesNeuves`, `pieceDepuisModele`,
`clausePertinente`) et 24 types.

Sans gravité, mais chaque `export` est une promesse de stabilité : il élargit la surface à maintenir
et brouille la lecture de ce qui est vraiment l'interface d'un module. Les types exportés pour la
documentation sont légitimes ; les **constantes et fonctions** le sont moins.

### Q3.4 - Faute de frappe dans un identifiant

`journal.ts:68, 73, 74, 95` : `videngeProgrammee` → `vidangeProgrammee`. Quatre occurrences, un
`sed`.

---

## 6. Lot Q4 - Cohérence

### Q4.1 - Un `catch` qui n'utilise pas `decrireErreur`

`ParametresPage.tsx:80`, sur l'**import d'une sauvegarde** :

```ts
toast('error', e instanceof Error ? e.message : "Fichier de sauvegarde illisible.");
```

Les 9 autres `catch` applicatifs passent par `decrireErreur(e)`, qui traduit `QuotaExceededError`,
`ConstraintError`, `InvalidStateError` et `DataCloneError` en français actionnable. Ici, un quota
saturé pendant une restauration affichera le message brut du navigateur, souvent en anglais - sur
le parcours où l'utilisateur a le plus besoin d'être guidé.

### Q4.2 - Un `catch` silencieux non documenté

`BailRapidePage.tsx:119-120` : `console.error(e)` sans `toast`, sur la régénération de l'aperçu.
Le silence est défendable - un aperçu qui échoue ne doit pas alerter à chaque frappe - mais c'est le
**seul silence non commenté** du projet : `CarteRepliable.tsx:56`, `SauvegardeAutoPanels.tsx:57` et
`BailRapidePage.tsx:196` expliquent tous le leur.

Conséquence concrète : si la génération PDF casse durablement (ce qui est arrivé, cf. commit
`24e7205` sur la CSP), l'utilisateur voit un aperçu vide **sans aucune indication**. Un état
« aperçu indisponible » dans le panneau coûterait peu.

---

## 7. Lot Q5 - Couverture de test

**51 % des lignes instrumentées**, mais la moyenne cache l'essentiel : la répartition ne suit pas
celle du risque.

| Domaine | Couverture | Lignes |
|---|---|---|
| `src/lib/sync` | **87 %** | 857 |
| `src/lib` | **74 %** | 1 583 |
| `src/lib/pdf` | **74 %** | 1 901 |
| `src/components` | 43 % | 1 162 |
| `src/features` | **37 %** | 7 402 |

La logique pure est bien tenue. Les parcours ne le sont pas - et parmi eux, **quatre fichiers à
0 % portent des actes à conséquence** :

| Fichier | Lignes | Couverture | Ce qui n'est pas testé |
|---|---|---|---|
| `BailRapidePage.tsx` | 609 | **0 %** | **Le parcours principal du produit** : rédiger un bail. Le CDC le décrit comme « 5 clics, ~20 champs » |
| `SignatureFlow.tsx` | 150 | **0 %** | L'acte de signature : tracé, « Lu et approuvé », horodatage |
| `EdlSignaturePage.tsx` | 217 | **0 %** | Signature, calcul de l'empreinte PDF, archivage |
| `SauvegardeAutoPanels.tsx` | 356 | **0 %** | Restauration d'une sauvegarde - le chemin qui peut effacer des données |

À l'inverse, cinq pages ont déjà leur test (`BiensPage`, `BailDetailPage`, `BienFormPage`,
`LocatairesPage`, `EdlRapidePage`, `EdlTerrainPage`, `TableauDeBordPage`) : **le harnais existe et
fonctionne**, il n'a simplement pas été étendu aux quatre écrans ci-dessus.

**Correctif proposé, par ordre de valeur** :

1. `BailRapidePage` - un test de parcours : saisir, générer, vérifier l'enregistrement en base.
2. `SauvegardeAutoPanels` - restaurer une sauvegarde et vérifier qu'aucune donnée n'est perdue
   (relié au point 1 du hors-périmètre du CDC accessibilité, `importerSauvegarde` sans
   `sansJournaliser`).
3. `EdlSignaturePage` + `SignatureFlow` - signer, vérifier que l'empreinte est calculée et que le
   document devient non modifiable (ce qui vérifie aussi Q1.1).

Viser un pourcentage global n'a pas de sens ici ; couvrir ces quatre fichiers vaut mieux que
10 points de moyenne.

✅ **Livré** (cf. §10). Reste `SignatureFlow` couvert **indirectement**, par le parcours de
`EdlSignaturePage` : ses deux garde-fous sont testés, mais pas le dessin lui-même - c'est un acte
graphique, et la décision n°6 du CDC accessibilité assume de ne pas le rendre pilotable autrement.

---

## 8. Ce qui n'est *pas* un problème

Relevé pour éviter qu'on y revienne :

- **`synchroniser()` fait 408 lignes** (`cycle.ts:149`) et imbrique huit fermetures. C'est la
  fonction la plus dense du projet, mais la complexité est celle du protocole lui-même, elle est
  documentée pas à pas, et elle est couverte à **87 %** par 7 fichiers de test. Découper serait un
  risque pour un gain de lisibilité incertain. **Ne pas y toucher sans raison.**
- **Les 23 assertions `!`** sont concentrées dans `BailPdf.tsx` (12) où les données sont validées en
  amont par Zod. Acceptable.
- **Les 20 avertissements ESLint** sont assumés : le commentaire de `eslint.config.js:34-39`
  explique pourquoi `react-hooks/set-state-in-effect` est en `warn`.
- **Le français dans les identifiants** est un choix cohérent tenu partout. Ne pas l'angliciser par
  réflexe.

---

## 9. Phasage proposé

| Lot | Contenu | Coût | Effet | État |
|---|---|---|---|---|
| **Q3** | Supprimer `estApplicationDistante`, corriger `videngeProgrammee`, documenter `journaliser`, dé-exporter les constantes internes | très faible | Nettoyage, aucun risque | ✅ livré |
| **Q4** | Erreurs d'import distinguées, état « aperçu indisponible » | très faible | Cohérence, diagnostic | ✅ livré |
| **Q1** | Garde d'écriture unique sur l'EDL, `lireParametres` sur les 6 sites, correction de l'effet d'aperçu | faible | **Invariants tenus par le code** | ✅ livré |
| **Q2.1** | Helpers `pieceModifiee` / `elementsModifies` | faible | Prépare Q2.3 | ✅ livré |
| **Q5** | 4 tests de parcours (bail, sauvegarde, signature) | moyen | Couvre les actes à conséquence | ✅ livré |
| **Q2.3** | Découper `EdlTerrainPage` | moyen | Maintenabilité de l'écran critique | ✅ livré |

**Ordre recommandé** : Q3 → Q4 → Q1 → Q2.1 → Q5 → Q2.3. Q5 avant Q2.3 : on ne découpe pas un écran
de 1 000 lignes sans filet.

**Q2.2 (`useAction`) est explicitement écarté** pour l'instant : gain réel mais inférieur au coût
d'indirection.

---

## 10. Journal de correction

### Q3 - livré

`estApplicationDistante` supprimée. `videngeProgrammee` → `vidangeProgrammee` (4 occurrences).
`journaliser` porte désormais une doc qui dit qu'elle est la **couture de test** du module et
renvoie au bloc « journalisation depuis un hook Dexie » de `journal.test.ts`, qui couvre le chemin
réel. Les 8 constantes et fonctions internes ne sont plus exportées ; les 24 types le restent, ils
documentent l'interface des modules.

Effet secondaire mesuré : dé-exporter `clausePertinente` a fait tomber un avertissement
`react-refresh/only-export-components`. **20 → 19 avertissements**, toujours 0 erreur.

### Q4 - livré, avec un écart

**L'écart** : le correctif proposé - « passer `ParametresPage:80` à `decrireErreur` » - **aurait
dégradé le cas courant**. Les 7 messages de `validerSauvegarde` sont rédigés pour être lus
(« Mettez l'application à jour avant de l'importer »), et `decrireErreur` les aurait préfixés d'un
`Error : ` sans rien traduire.

Ce qui a été fait à la place : une classe `ErreurSauvegarde` (`backup.ts`) distingue le **refus
motivé d'archive** de la **panne technique**. Le premier s'affiche tel quel, le second passe par
`decrireErreur` - c'est le second qui était mal traité, un quota saturé pendant une restauration
affichant jusqu'ici le message brut du navigateur. Les tests de validation, qui assèrent sur le
message par expression régulière, passent inchangés.

`ApercuBailPanel` reçoit un prop `echec`. L'aperçu reste silencieux frappe après frappe, mais une
panne durable affiche « Aperçu indisponible », sa cause, et le rappel que la saisie est conservée.

### Q1 - livré

`ecrireEdl(patch, { memeSigne })` est le **point d'écriture unique** de l'état des lieux : les 7
écritures passent par lui, et les 3 opérations légitimes sur un document signé (rattacher,
rectifier, avenant) demandent explicitement la dérogation et disent pourquoi. `majCompteurs`,
`ajouterElement` et `ajouterPiece` portent en plus une garde en tête, qui couvre leur écriture sur
la fiche du **bien** - celle de `majCompteurs` n'était protégée par rien.

Les 6 lectures brutes en `useLiveQuery` passent à `lireParametres()`, **sauf `AppLayout:323`**, qui
garde la forme brute et gagne le commentaire qui manquait : c'est l'absence de la ligne qui y porte
l'information, et normaliser ferait apparaître la modale d'avertissement avant sa création.

L'effet « libère l'URL au démontage » de `BailRapidePage` passe par une référence et des
dépendances vides. Il ne se rejoue plus à chaque aperçu, et ne révoque plus l'URL affichée au
second montage de `React.StrictMode`.

### Q2.1 - livré

`pieceModifiee(pieceId, fn)` et `elementsModifies(pieceId, fn)`. Les quatre expressions de 12 à
18 lignes tombent à une ligne chacune. `EdlTerrainPage` perd une trentaine de lignes nettes.

### Q5 - livré

**17 tests de parcours** sur les trois écrans qui portent des actes à conséquence, tous à 0 %
auparavant. La couverture passe de **50,9 % à 65,8 %** de lignes (branches stables à ~80 %).

| Fichier | Ce qu'il verrouille |
|---|---|
| `BailRapidePage.test.tsx` (5) | Le parcours principal : bail écrit, **deux** PDF archivés et rattachés, conditions reportées sur le logement, aucun bien en double. Les avertissements (DPE G, dépôt > 2 mois) signalent **sans bloquer** - le test fige ce parti pris |
| `EdlSignaturePage.test.tsx` (6) | Le constat figé, l'empreinte SHA-256 réellement calculée, le PDF archivé en `signe`, le bail qui passe `actif` à l'entrée et `termine` à la sortie, le refus de re-signer. Plus les deux garde-fous du `SignatureFlow` : lieu + relecture, puis « lu et approuvé » + tracé |
| `ParametresPage.restauration.test.tsx` (6) | L'aller-retour export → import, la différence **irréversible** entre « fusionner » et « tout remplacer », et les deux branches du correctif Q4.1 : refus d'archive affiché tel quel, panne technique passée par `decrireErreur` |

Les archives ne sont pas fabriquées à la main : chaque cas exporte pour de bon avec
`exporterSauvegarde` puis réimporte. Un test qui écrirait lui-même le `data.json` attendu ne
vérifierait que sa propre idée du format.

**Les tests ont été éprouvés par mutation**, un défaut injecté à la fois : ne plus archiver la
grille de vétusté, ne plus reporter les conditions sur le bien, ne plus rendre le bail actif à la
signature, archiver le PDF sans `signe`, faire fusionner « tout remplacer », désarmer le contrôle de
version d'archive. **Chaque mutation est tombée sur le test qui la vise, et sur lui seul.**

Trois pièges d'environnement rencontrés, consignés dans les fichiers pour qui les recroisera :
`rendrePdfAvecHash` appelle `rendrePdf` par sa référence interne au module (doubler l'export ne
suffit pas) ; le `crypto.subtle` de Node refuse l'`ArrayBuffer` d'un `Blob` jsdom, mais accepte un
`Uint8Array` ; et greffer une méthode sur un `Blob` le rend non clonable, donc **non
enregistrable en base, sans erreur visible**.

**Seuil de couverture recalé** (`vite.config.ts`), avec son explication : le fournisseur
n'instrumente que les modules chargés, si bien qu'un test d'écran fait entrer d'un coup tous les
gestionnaires des composants importés. Mesuré : +207 fonctions au dénominateur pour 51 appelées,
donc `functions` **baisse** (52,2 → 44,6 %) quand la couverture réelle monte. `lines` et
`statements` passent de 45 à **62** pour retenir le gain ; `functions` suit le niveau atteint plutôt
que de décourager l'écriture de tests.

**Un défaut trouvé dans mes propres tests** et corrigé : le cas principal du bail attendait
l'écriture du bail (étape E5) avant de lire les documents, écrits en E6. La course ne s'est révélée
que sous instrumentation. Le rendez-vous est désormais pris sur la dernière étape.

### Q2.3 - livré

**`EdlTerrainPage` passe de 1 079 à 693 lignes**, sans qu'un seul comportement change. Trois
composants frères en sortent :

| Fichier | Lignes | Ce qu'il porte |
|---|---|---|
| `CarteElement.tsx` | 280 | Un élément relevé : état, quantité, dégradation, commentaire, photos. Le bloc le plus répété du produit, quelques dizaines par constat |
| `ModalesTerrain.tsx` | 235 | Les quatre modales : oublis, rectification, ajout de pièce, avenant |
| `EnteteTerrain.tsx` | 141 | Barre collante : sortie, titre, progression, onglets |

**Aucun n'écrit en base ni ne décide de rien** : la page reste seule à tenir l'état et à écrire, les
composants reçoivent des données et remontent des gestes. `CarteElement` ne connaît même pas
l'identifiant de sa pièce - l'appelant lie l'identité, les rappels ne prennent que ce qui change.

**Méthode** : six tests de caractérisation ont été écrits **avant** de toucher au fichier, sur
exactement ce que l'extraction allait déplacer - choix d'état et `aria-pressed`, exclusivité de
l'état, commentaire enregistré au `blur`, retrait d'un élément, ajout d'élément mémorisé sur le
logement, ajout de pièce, complétion annoncée dans le nom de l'onglet. Le filet est passé de 62 % à
**69 % de lignes** (81 % de branches) sur cet écran avant le premier déplacement de code.

Vérifié ensuite en direct : rendu identique au pixel près, écriture d'un état persistée, modale
« Ajouter une pièce » avec son champ nommé et son bouton désarmé tant que le nom est vide, Échap
qui referme, et la modale des oublis qui bascule sur la pièce concernée puis se ferme.

### Hors lot - téléchargement d'un document archivé

Signalé à l'usage : télécharger un PDF depuis la page Documents rapportait une archive au lieu du
document.

**Cause** : `ouvrirBlob` et `telechargerBlob` (`backup.ts`) créaient l'ancre de téléchargement sans
jamais l'insérer dans le document. Chrome accepte une ancre détachée, **Safari l'ignore** - et
Safari, c'est l'iPad, la cible principale du produit. `download` sans effet, le navigateur se
rabat sur une navigation vers l'URL `blob:`, qui n'a ni nom ni extension : le fichier arrive sous un
identifiant opaque auquel l'appareil invente un type.

**Aggravant, mesuré dans un vrai navigateur** : `window.open` est refusé **y compris sur un clic
utilisateur authentique**. Le repli n'était donc pas un cas de bord, c'était le chemin normal - et
c'était celui qui était cassé.

**Correctif** : une fonction unique `enregistrerSousLeNom`, qui attache l'ancre au `body`, clique,
puis la retire. Les deux points d'entrée y passent. Quatre tests
(`backup.telechargement.test.tsx`) vérifient ce que jsdom ne regarde pas seul : **où se trouve
l'ancre à l'instant du clic**. Éprouvés par mutation - le retour à l'ancre détachée fait tomber
deux d'entre eux.

Vérifié en direct sur la page Documents : ancre attachée au `body`, nom `.pdf` complet, aucune ancre
laissée derrière.

### Vérification

**512 tests verts** (489 + 17 de parcours + 6 de caractérisation), `tsc` propre, **0 erreur
ESLint**, seuils de couverture tenus sur deux exécutions instrumentées consécutives. Vérifié en
direct dans le navigateur, sur les données réelles de l'application :

- écriture d'un état sur une pièce → persistée, **les autres pièces intactes** (c'était le risque
  de l'extraction des helpers) ;
- « Renseigner d'un coup » → les 10 éléments vierges renseignés, **l'élément déjà statué non
  écrasé**, conformément à l'invariant documenté ;
- ajout d'un élément → écrit dans l'EDL **et** mémorisé sur la fiche du logement, les 6 autres
  pièces inchangées ;
- EDL basculé en `signe` : commandes désactivées, et **après réactivation forcée des boutons dans
  le DOM, le clic n'écrit rien en base** - la garde tient au point d'écriture, plus au rendu ;
- aperçu du bail : `blob:` valide, régénéré à la saisie, URL renouvelée, aucune erreur console,
  aucun bandeau d'échec parasite ;
- page Paramètres : les 11 panneaux rendent après le passage à `lireParametres()`.
