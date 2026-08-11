# CDC — État des lieux rapide (sans bail)

> Complète `README.md` et `docs/DOCUMENTATION_TECHNIQUE.md`. Périmètre : **découpler l'état des
> lieux du bail**. Un état des lieux doit pouvoir être créé, rempli, signé et archivé sans
> qu'aucun bail n'existe dans l'application — à l'entrée comme à la sortie.
> Touche le schéma Dexie (`bailId` devient optionnel, deux champs apparaissent), les quatre
> écrans EDL, `EdlPdf`, `LettreRestitutionPdf`, la suppression RGPD et les CTA du site vitrine.

## 1. Besoin

Aujourd'hui, `EtatDesLieux.bailId` est **obligatoire** (`types.ts:351`) et c'est le bail qui porte
tout le contexte : `chargerContexteEdl` (`features/edl/edlPdfUtils.ts:73`) remonte
`bail → bien → locataires` et **lève une erreur** si le bail manque. Conséquence : pour constater
l'état d'un logement, il faut d'abord rédiger un contrat de location dans Bailiz.

C'est une exigence de l'outil, pas du droit. L'état des lieux est un acte **autonome** : il est
établi contradictoirement entre les parties (art. 3-2 de la loi n°89-462, décret n°2016-382), il
vaut inventaire du mobilier (décret n°2015-981), et rien n'impose que le contrat auquel il sera
annexé ait été rédigé avec le même outil. Trois situations concrètes sont aujourd'hui impossibles :

1. **Le bail existe déjà, sur papier** — signé l'an dernier, ou rédigé par une agence, ou repris
   d'un modèle Word. Le bailleur veut Bailiz pour l'état des lieux seulement. Il doit
   actuellement ressaisir intégralement un bail qu'il n'imprimera jamais.
2. **La sortie arrive en premier** — on découvre l'outil au moment de rendre le dépôt de
   garantie. L'entrée a été faite à la main, il y a trois ans. Il faut aujourd'hui inventer un
   bail *et* un état des lieux d'entrée fictif pour accéder au comparatif et aux retenues.
3. **Le visiteur venu du site vitrine** — le CTA « Faire un état des lieux » de `bailiz.fr` pointe
   sur `/app/#/edl`. Le commentaire de `EdlListePage.tsx:28` documente déjà la fuite : l'écran
   n'offre aucune action et renvoie **rédiger un bail**. La promesse de la page d'atterrissage
   n'est pas tenue par l'écran d'atterrissage.

L'objectif : **« Nouvel état des lieux » devient une action de premier niveau**, au même rang que
« Rédiger un bail ». Le logement et les locataires se saisissent dans le formulaire, comme le
formulaire de bail sait déjà le faire. Le bail, s'il existe un jour, se rattache après coup.

## 2. Ce qui existe déjà (à réutiliser, ne pas refaire)

| Brique | État |
|---|---|
| Mode terrain, sélecteur d'état, photos, compteurs, clés, autosave | ✅ `EdlTerrainPage` — ne lit du bail que le lien de retour (`:282`) |
| Parcours de signature (relecture → nom → tracé → horodatage → SHA-256 → verrouillage) | ✅ `SignatureFlow` + `EdlSignaturePage` |
| Comparatif entrée/sortie, dégradations, vétusté, retenues | ✅ `lib/etat.ts`, `lib/calculs.ts`, `EdlSynthesePage` |
| Duplication de la structure d'entrée vers la sortie | ✅ `construirePiecesSortie` (`lib/etat.ts:15`) |
| Bibliothèque de pièces et mobilier obligatoire | ✅ `BIBLIOTHEQUE_PIECES`, `MOBILIER_OBLIGATOIRE` (`lib/defauts.ts`) |
| Création d'un logement à la volée | ✅ `BienRapideModal` + `construireBienInline` — écrit un vrai `Bien` réutilisable |
| Création d'un locataire à la volée | ✅ `LocataireFormModal`, déjà partagé entre la fiche Locataires et le formulaire de bail |
| Brouillon de formulaire écrit en continu | ✅ `db.brouillons` (clé `bien:nouveau`…) — s'applique tel quel à `edl:nouveau` |
| Pipeline document (référence, rendu, hash, archivage) | ✅ `lib/pdf/generer.ts` — `bailId` y est **déjà optionnel** (`:53`, `:130`) |
| Photo détachée de l'EDL | ✅ Précédent exact : `Photo.edlId` est devenu optionnel pour la fiche de visite |
| Sauvegarde / synchronisation des EDL | ✅ `edls` figure dans `COLLECTIONS` (`backup.ts:123`) et `TABLES_SYNCHRONISEES` (`sync/journal.ts:20`) |
| **Rattachement de l'EDL** | ❌ `bailId: string` **obligatoire** — verrou principal |
| **Contexte de l'EDL (logement, parties)** | ❌ N'existe que par transitivité du bail |
| **Montant du dépôt de garantie** | ❌ N'existe que sur `Bail.depotGarantie` — lu par la synthèse, la lettre de restitution et l'alerte du tableau de bord |
| **Création d'un EDL** | ❌ Le seul point d'entrée est `creerEdl` dans `BailDetailPage.tsx:240`, non factorisé |
| **Sortie sans entrée** | ❌ `creerEdl` refuse (`:241`) et `construirePiecesSortie` exige un EDL d'entrée |

**Conclusion** : le cœur métier (terrain, signature, comparatif, PDF) est **déjà indépendant du
bail**. Le travail porte sur le **rattachement**, un **formulaire de création**, la **sortie
autonome** et les **retombées transverses** (RGPD, tableau de bord, migration).

## 3. Décisions actées

- **Nom** : « État des lieux rapide » côté produit ; côté code, pas de type ni d'écran séparé —
  c'est **le même état des lieux**, simplement sans bail. Aucun `type: 'rapide'`, aucune
  duplication du mode terrain. Un EDL sans bail se reconnaît à `bailId === undefined`.
- **Le logement et les locataires sont de vraies fiches** (`db.biens`, `db.locataires`), créées à
  la volée avec les modales existantes. Un état des lieux nomme des parties et un logement : ces
  données ont vocation à resservir (sortie, relocation, bail rédigé plus tard). On ne crée pas un
  second modèle de données en texte libre à côté du premier.
- **Le contexte est porté par l'EDL, pas déduit du bail** : `bienId` et `locataireIds` passent
  **sur l'`EtatDesLieux`**, pour *tous* les EDL, y compris ceux nés d'un bail (§4.1). Ce n'est pas
  une dénormalisation de confort : un état des lieux signé est une **preuve figée à une date**.
  Un colocataire ajouté au bail six mois plus tard n'a rien à faire dans l'état des lieux
  d'entrée qu'il n'a pas signé — c'est pourtant ce que produit la lecture actuelle via le bail.
- **Le dépôt de garantie est saisi sur l'EDL** (`depotGarantie?`), et lu en priorité sur lui. Toute
  la chaîne existante (vétusté, retenues, lettre de restitution, alerte de délai légal) fonctionne
  alors à l'identique sans bail.
- **La sortie autonome est possible** : sans EDL d'entrée dans l'application, l'utilisateur
  déclare d'où vient l'état d'entrée et le **reporte** élément par élément depuis son exemplaire
  papier (§5.4). L'application **avertit sans bloquer** : sans état des lieux d'entrée, la
  présomption de l'art. 1731 du code civil ne peut pas être invoquée (art. 3-2 al. 4 de la loi de
  1989), et un comparatif sans référence d'entrée ne fonde aucune retenue.
- **Le bail se rattache après coup**, jamais avant : action « Rattacher à un bail » sur la fiche
  de l'EDL, et l'EDL apparaît alors dans la fiche du bail. Le rattachement d'un EDL **déjà signé**
  est un simple lien de classement : **le PDF archivé n'est pas régénéré** (§6.3).
- **Aucun bail fantôme, aucun statut inventé** : un EDL d'entrée signé sans bail ne rend pas le
  logement « loué » au tableau de bord. L'application ne sait pas s'il l'est ; elle ne l'affirme
  pas. Le logement reste « vacant », l'EDL est visible dans sa fiche.
- **Le bailleur est demandé à la création s'il n'est pas encore renseigné** dans les Paramètres.
  C'est le cas du visiteur qui arrive de `bailiz.fr` sur une base neuve : sans cela, son PDF signé
  porterait un bailleur vide. Bloc replié, écrit dans `Parametres.bailleur`.
- **La version du format de sauvegarde n'est pas incrémentée** : `importerSauvegarde` refuse
  `data.version < VERSION_SAUVEGARDE` (`backup.ts:155`), donc un passage à 2 rendrait
  **illisibles toutes les sauvegardes déjà produites**. Les champs nouveaux sont normalisés à la
  lecture (§7.3).

## 4. Modèle de données

### 4.1 `EtatDesLieux` (`types.ts`)

```ts
export interface EtatDesLieux {
  id: string;
  reference: string;
  /**
   * Bail auquel l'état des lieux est annexé. **Optionnel** : un état des lieux
   * est un acte autonome (art. 3-2 de la loi du 6 juillet 1989), établi
   * contradictoirement entre les parties. Le bail peut avoir été rédigé
   * ailleurs, ou être rattaché plus tard.
   */
  bailId?: string;
  /** Logement constaté. Source directe : ne dépend plus du bail. */
  bienId: string;
  /**
   * Parties présentes au constat, **figées à la date de l'état des lieux**.
   * Lire les locataires du bail ferait apparaître dans un document signé des
   * personnes qui ne l'ont pas signé (colocataire entré depuis).
   */
  locataireIds: string[];
  /**
   * Dépôt de garantie retenu pour le calcul des retenues et la lettre de
   * restitution. Prioritaire sur `bail.depotGarantie` : c'est le montant que
   * l'utilisateur a déclaré au moment du constat.
   */
  depotGarantie?: number;
  /**
   * Contrat de location non enregistré dans l'application (bail papier, agence,
   * modèle tiers) : simplement cité en tête du PDF, pour que le document puisse
   * y être annexé sans ambiguïté.
   */
  bailExterne?: { reference?: string; dateEffet?: string };
  /**
   * EDL de sortie uniquement — provenance des états d'entrée servant de
   * référence au comparatif :
   * - `edl_app`    : `edlEntreeLieId` renseigné, états dupliqués (cas actuel) ;
   * - `edl_papier` : état des lieux d'entrée établi hors application, reporté
   *                  à la main dans la colonne « à l'entrée » ;
   * - `aucun`      : aucun état des lieux d'entrée n'a été établi. Le document
   *                  constate l'état à la sortie, sans comparatif opposable.
   */
  origineEtatEntree?: 'edl_app' | 'edl_papier' | 'aucun';
  /** `origineEtatEntree === 'edl_papier'` : date de l'EDL d'entrée papier, citée au PDF. */
  dateEdlEntreePapier?: string;
  // … champs existants inchangés (type, date, edlEntreeLieId, compteurs, cles,
  //   pieces, signatures, statut, avenants, pdfHash, rectifications…)
}
```

`ElementEDL` est **inchangé** : `etatEntree`, `commentaireEntree` et `photoIdsEntree` existent
déjà et servent exactement au report manuel (§5.4). C'est le point qui rend la sortie autonome
peu coûteuse.

### 4.2 Schéma Dexie — version 6 (`lib/db.ts`)

```ts
// v6 : l'état des lieux porte son propre contexte. `bailId` devient optionnel
// (EDL rapide, sans bail rédigé dans l'application) ; `bienId` et
// `locataireIds` deviennent la source directe du logement et des parties.
this.version(6)
  .stores({
    edls: 'id, reference, bailId, bienId, type, statut, updatedAt, *locataireIds',
  })
  .upgrade(async (tx) => {
    const baux = await tx.table('baux').toArray();
    const parBail = new Map(baux.map((b) => [b.id, b]));
    await tx.table('edls').toCollection().modify((edl) => {
      const bail = parBail.get(edl.bailId);
      edl.bienId ??= bail?.bienId;
      edl.locataireIds ??= bail?.locataireIds ?? [];
    });
  });
```

- `*locataireIds` (multiEntry) est **requis** par la suppression RGPD (§7.1), qui ne peut plus
  passer par le bail.
- `bienId` est indexé : la fiche du bien liste ses états des lieux (`where('bienId')`).
- Un EDL dont le bail a disparu (base incohérente) sort de la migration avec `bienId` indéfini :
  il reste lisible, la liste affiche `?` comme aujourd'hui, et la fiche propose de le rattacher.

### 4.3 Ce qui ne change pas

`Bien`, `Locataire`, `Bail`, `Photo`, `DocumentGenere` : **aucune modification**. `generer.ts`
accepte déjà `bailId?`. `Photo.edlId` reste le rattachement des clichés.

## 5. Parcours et écrans

### 5.1 `/edl` — la liste devient un point de départ

`EdlListePage` porte aujourd'hui un sous-titre qui *interdit* (« Les états des lieux se créent
depuis la fiche d'un bail ») et un `EmptyState` qui renvoie ailleurs. Les deux disparaissent.

- **Bouton primaire permanent** dans le `PageHeader` : « Nouvel état des lieux » → `/edl/nouveau`.
  Présent aussi quand la liste est pleine — c'est l'action principale de l'écran.
- `EmptyState` : message unique, orienté action (« Constatez l'état d'un logement à l'entrée ou à
  la sortie. Le bail n'est pas nécessaire : vous pourrez le rattacher plus tard, ou le rédiger
  ensuite depuis le logement. »), action = « Nouvel état des lieux ».
- Chaque ligne lit désormais `edl.bienId` directement (une jointure de moins) et affiche un badge
  discret « sans bail » le cas échéant.

### 5.2 `/edl/nouveau` — `EdlRapidePage`

Formulaire **d'une seule page**, dans l'esprit de `BailRapidePage`, avec brouillon continu
(`db.brouillons`, clé `edl:nouveau`). Cinq blocs, tout ce qui peut être déduit l'est :

| Bloc | Contenu | Notes |
|---|---|---|
| **1. Type** | Entrée / Sortie (deux gros boutons) | Le choix « Sortie » déplie le bloc 5 |
| **2. Logement** | Liste des biens enregistrés + « Nouveau logement » (`BienRapideModal`) | Sélection obligatoire |
| **3. Locataire(s)** | Liste des locataires + « Nouveau locataire » (`LocataireFormModal`), multi-sélection (colocation) | Au moins un |
| **4. Constat** | Date, dépôt de garantie (€), référence et date du bail papier (facultatives) | Le dépôt est pré-rempli depuis `bien.conditionsLocation.depotGarantie`, puis depuis le bail si un bail est rattaché |
| **5. Sortie** | Référence d'entrée : EDL d'entrée de l'app (liste des EDL d'entrée signés du même bien) / EDL papier (+ date) / aucun | Voir §5.4 |
| **Bloc bailleur** | Affiché **uniquement si** `parametres.bailleur.nom` est vide. Civilité, nom, prénom, adresse, e-mail | Écrit dans `Parametres` à la validation |

**Trame des pièces** : aucune étape supplémentaire dans le cas courant.
- Le bien a des `piecesModele` → elles sont reprises, comme aujourd'hui.
- Le bien n'en a pas (créé à la volée) → une **sélection de pièces** issue de
  `BIBLIOTHEQUE_PIECES` est proposée, **présélectionnée d'après `type` et `nbPieces`** du bien
  (ex. T2 → entrée, séjour, chambre, cuisine, SDB, WC). Elle est modifiable, et **écrite dans
  `bien.piecesModele`** à la validation — exactement ce que fait déjà l'ajout de pièce à la volée
  en mode terrain (`EdlTerrainPage.tsx:214`). Le logement s'enrichit du terrain, l'utilisateur ne
  remplit pas deux fois.

Validation : bien + au moins un locataire. Tout le reste est facultatif — le principe de l'app
(produire un document à compléter, jamais bloquer) est conservé. Bouton **« Commencer l'état des
lieux »** → création puis navigation vers `/edl/:id`.

### 5.3 Factorisation de la création

`creerEdl` et `compteursInitiaux` (`BailDetailPage.tsx:216-270`) sortent de l'écran et deviennent
`lib/edl.ts` :

```ts
export async function creerEtatDesLieux(p: {
  type: 'entree' | 'sortie';
  bien: Bien;
  locataireIds: string[];
  bail?: Bail;
  edlEntree?: EtatDesLieux;
  depotGarantie?: number;
  bailExterne?: EtatDesLieux['bailExterne'];
  origineEtatEntree?: EtatDesLieux['origineEtatEntree'];
  dateEdlEntreePapier?: string;
  piecesModele?: PieceModele[]; // trame choisie quand le bien n'en a pas
}): Promise<EtatDesLieux>
```

`BailDetailPage` l'appelle avec `bail` et `locataireIds: bail.locataireIds` ; `EdlRapidePage`
l'appelle sans bail. **Un seul chemin de création**, testable hors composant.

Entrées supplémentaires vers ce formulaire :
- `BienDetailPage` : bouton « État des lieux » → `/edl/nouveau?bien=<id>` (bloc 2 pré-rempli) ;
- `BailDetailPage` : **inchangé** — les boutons existants créent directement l'EDL, sans passer
  par le formulaire (le bail connaît déjà tout).

### 5.4 Sortie sans état des lieux d'entrée

Trois cas, choisis au bloc 5 et mémorisés dans `origineEtatEntree` :

| Choix | Construction des pièces | Colonne « à l'entrée » | Comparatif |
|---|---|---|---|
| **EDL d'entrée de l'application** (`edl_app`) | `construirePiecesSortie(edlEntree)` — inchangé | Pré-remplie, en lecture seule | Automatique |
| **EDL d'entrée sur papier** (`edl_papier`) | Trame du bien (`piecesModele`) | **Saisissable** : un second sélecteur d'état par élément, à recopier du papier | Automatique dès que l'état d'entrée est saisi |
| **Aucun EDL d'entrée** (`aucun`) | Trame du bien | Masquée | Aucun ; `degradation` reste manuel |

Le mode terrain doit donc savoir afficher **deux sélecteurs** par élément. C'est le seul ajout
réel à `EdlTerrainPage` : le sélecteur existe déjà, il est instancié une seconde fois, écrivant
`etatEntree` / `commentaireEntree` au lieu de `etat` / `commentaire`. `estDegradation` et
`construirePiecesSortie` sont inchangés — le comparatif ne sait pas, et n'a pas à savoir, d'où
vient l'état d'entrée.

**Avertissements (jamais bloquants)** :
- `aucun` — bandeau permanent sur le mode terrain, la synthèse et une mention au PDF : « Aucun
  état des lieux d'entrée n'a été établi. À défaut d'état des lieux d'entrée, le logement est
  réputé avoir été reçu en bon état (art. 1731 du code civil), sauf si le bailleur a été empêché
  de l'établir (art. 3-2 de la loi du 6 juillet 1989). Ce document constate l'état à la sortie ;
  il ne fonde à lui seul aucune retenue sur le dépôt de garantie. »
- `edl_papier` — mention au PDF : « Les états d'entrée figurant en colonne de référence sont
  reportés de l'état des lieux d'entrée établi contradictoirement le JJ/MM/AAAA, hors
  application. » La synthèse rappelle que l'exemplaire papier doit être conservé.

### 5.5 Rattachement d'un bail, et bail rédigé ensuite

Sur la fiche d'un EDL sans bail, deux actions :
- **« Rattacher à un bail »** — liste des baux du même bien ; écrit `bailId`. Refusé si le bail
  porte un autre `bienId`.
- **« Rédiger le bail de ce logement »** — `/baux/nouveau?bien=<id>&locataires=<ids>`, puis
  proposition de rattacher l'EDL au bail créé.

Ce sont des **suggestions offertes, jamais des alertes** : ne pas rédiger de bail dans Bailiz est
un usage légitime, pas un oubli à signaler (§7.4).

## 6. Documents PDF

### 6.1 `EdlPdf` (`lib/pdf/EdlPdf.tsx`)

> **Réalisé** : les deux mentions ci-dessous vivent dans `lib/pdf/edlMentions.ts`, pas dans le
> composant. Ce sont elles qui portent la valeur juridique du document, elles doivent être
> vérifiables sans rendre un PDF — dont les flux sont compressés, donc illisibles à l'assertion.

- `bail: Bail` → **`bail?: Bail`**.
- Sous-titre : `Bail {bail.reference}.` devient
  - avec bail : inchangé ;
  - `bailExterne.reference` renseignée : « Bail {référence}{, prenant effet le JJ/MM/AAAA} (contrat
    établi hors application) — à annexer au contrat de location. » ;
  - sinon : « Établi contradictoirement entre les parties désignées ci-dessous, à annexer au
    contrat de location. »
- Bloc « Parties » : lit `locataires` (déjà passé en props, désormais issu de `edl.locataireIds`)
  — **aucun changement**.
- Mentions §5.4 pour `origineEtatEntree` à `edl_papier` / `aucun`.
- Le tableau de sortie garde ses cinq colonnes quelle que soit l'origine de l'état d'entrée ; en
  `aucun`, la colonne « à l'entrée » affiche « non établi » plutôt qu'une case vide.

### 6.2 `chargerContexteEdl` (`features/edl/edlPdfUtils.ts`)

Devient la **source unique** du contexte et cesse de jeter sur bail absent :

```ts
export async function chargerContexteEdl(edl: EtatDesLieux) {
  const bail = edl.bailId ? await db.baux.get(edl.bailId) : undefined;
  const bien = await db.biens.get(edl.bienId);
  if (!bien) throw new Error('Logement introuvable');
  const locataires = await db.locataires.where('id').anyOf(edl.locataireIds).toArray();
  const parametres = await getParametres();
  const edlEntree = edl.edlEntreeLieId ? await db.edls.get(edl.edlEntreeLieId) : undefined;
  const depotGarantie = edl.depotGarantie ?? bail?.depotGarantie ?? 0;
  return { bail, bien, locataires, parametres, edlEntree, depotGarantie };
}
```

`bien` reste obligatoire : sans logement, il n'y a pas d'état des lieux. `locataires` peut être
vide (constat établi en l'absence du locataire) — le PDF imprime alors la zone de signature
manuscrite vide, comportement déjà en place.

### 6.3 `LettreRestitutionPdf` et `EdlSynthesePage`

- `LettreRestitutionPdf` : prop `bail: Bail` → `depotGarantie: number` + `bienAdresse: string` +
  `bailReference?: string`. Le document ne dépendait du bail que pour ces trois valeurs.
- `EdlSynthesePage` : les deux lectures de `bail.depotGarantie` (`:159`, `:253`) passent par
  `contexte.depotGarantie`. Si le dépôt vaut 0 et qu'aucun bail n'est rattaché, un encart invite
  à le saisir plutôt que d'annoncer un solde faux — **saisissable sur place, y compris après
  signature** : `maj()` du mode terrain refuse toute écriture sur un EDL signé, or c'est
  précisément au moment du décompte que l'oubli se remarque. Le montant ne fait pas partie du
  constat signé, seulement du décompte, comme les coûts de remise en état.
- `enregistrerDocument({ bailId: bail?.id })` — déjà toléré (`generer.ts:53`).

### 6.4 Signature (`EdlSignaturePage`)

- `bail` devient optionnel dans les appels ; `bienId: bien.id`, `bailId: bail?.id`.
- Les bascules de statut du bail (`:88-100` : sortie → `termine`, entrée → `actif`) sont
  **conditionnées à la présence d'un bail**. Sans bail, aucun statut n'est inventé (§3).
- Le reste — hash, verrouillage, archivage, `pousserSiActive`, écran « Transmettre une copie » —
  est inchangé.

**Rattachement post-signature** : écrire `bailId` sur un EDL signé ne régénère **pas** le PDF
archivé. Le document signé et haché fait foi ; il porte la mention du bail telle qu'elle était au
moment de la signature. Le rattachement est un classement, pas une rectification — la
rectification, elle, exige la re-signature des deux parties et reste inchangée.

## 7. Retombées transverses

### 7.1 Suppression RGPD (`lib/rgpd.ts`) — impact le plus sensible

`perimetreSuppressionLocataire` et `supprimerLocataireEtDonnees` trouvent aujourd'hui les EDL
**par le bail**. Un EDL rapide, qui porte le nom, la signature manuscrite et l'horodatage du
locataire, passerait donc **entièrement au travers de la suppression définitive**. C'est un
manquement au droit à l'effacement, pas un détail d'implémentation.

Les deux fonctions interrogent désormais `db.edls.where('locataireIds').anyOf([locataireId])`
en plus de la recherche par bail (union dédupliquée), et appliquent la **règle déjà retenue pour
les baux** :
- l'EDL n'a pas d'autre locataire → **supprimé**, avec ses photos et ses PDF archivés ;
- l'EDL est partagé (colocation) → **conservé**. Un état des lieux signé est immuable : on n'en
  retire pas un signataire. Le périmètre annoncé avant confirmation le dit explicitement
  (`edlsPartages`, à côté de `bauxPartages`), pour que l'utilisateur sache ce qui subsiste.

`supprimerBailEtDonnees` : un EDL rattaché à un bail supprimé **n'est plus supprimé avec lui** si
son `bienId`/`locataireIds` le rendent autonome ? **Non** — comportement inchangé : supprimer un
bail supprime ses EDL. Le périmètre est annoncé, l'utilisateur décide en connaissance de cause,
et changer cette règle en cours de route surprendrait pour un gain nul.

### 7.2 Synchronisation (`lib/sync/`)

Aucun changement de protocole : `edls` est déjà une table synchronisée et les nouveaux champs
suivent. Deux points de vigilance :
- **Ordre d'arrivée** : un EDL peut être reçu avant le `Bien` qu'il référence. La situation
  existait déjà pour `bailId` ; les écrans doivent continuer à tolérer un bien absent
  (`?` en liste, encart « logement pas encore synchronisé » sur la fiche) plutôt que de planter.
  À vérifier explicitement sur `EdlRapidePage`, `EdlListePage` et `EdlTerrainPage`.
- **Photos** : inchangé, `Photo.edlId` reste la clé.

### 7.3 Sauvegarde (`lib/backup.ts`)

`VERSION_SAUVEGARDE` **reste à 1** (§3). Les EDL relus depuis une archive sont normalisés avant
`bulkPut` — l'import court-circuite les hooks de migration Dexie, la migration v6 seule ne
suffirait pas :

```ts
function normaliserEdlImporte(edl, baux) { /* bienId/locataireIds depuis le bail, comme en v6 */ }
```

Cette normalisation et l'`upgrade` de la v6 partagent la même fonction pure, testée une fois.

### 7.4 Tableau de bord (`features/dashboard/TableauDeBordPage.tsx`)

- **Alerte « EDL d'entrée signé mais bail non signé »** (`:39`) : ignore les EDL sans bail. Ne pas
  avoir de bail dans Bailiz est un choix, pas une anomalie — transformer ce choix en alerte
  orange permanente serait du harcèlement.
- **Alerte « dépôt de garantie à restituer »** (`:53`) : fonctionne désormais **aussi sans bail**,
  en lisant `edl.depotGarantie ?? bail?.depotGarantie`. Le libellé cite la référence de l'EDL
  quand il n'y a pas de bail. C'est l'alerte la plus utile de l'application (délai légal
  d'un/deux mois, majoration de 10 % par mois de retard) : elle ne doit pas être réservée à ceux
  qui ont rédigé leur bail ici.
- **Statut d'un bien** : inchangé — « loué » reste déduit de l'existence d'un bail (§3).

### 7.5 Fiche du bien

`BienDetailPage` liste les états des lieux du logement (`where('bienId')`, index v6) et porte le
bouton « État des lieux ». C'est le nouveau point d'entrée naturel pour qui gère un logement sans
bail dans l'application.

## 8. Site vitrine (`site/`)

Périmètre volontairement minimal — aucune refonte SEO, qui relève de `CDC-site-vitrine-seo.md`.

- `site/src/pages/index.astro:87` et `:364` — CTA « Faire un état des lieux » : `/app/#/edl` →
  **`/app/#/edl/nouveau`**.
- `site/src/pages/etat-des-lieux.astro:51` et `:150` — même changement. Le visiteur atterrit sur
  un formulaire de trois champs, pas sur une liste vide qui le renvoie rédiger un bail.
- Le texte de `etat-des-lieux.astro` ne pose aucun prérequis de bail : **rien à corriger**. Un
  paragraphe est ajouté pour dire ce qui est désormais vrai — l'état des lieux fonctionne sans
  bail, y compris avec un contrat signé ailleurs.
- `README.md` : la section « États des lieux » gagne le point « sans bail » ; la mention
  « Les états des lieux se créent depuis la fiche d'un bail » disparaît partout.

## 9. Tests

| Fichier | Ce qui est couvert |
|---|---|
| `lib/edl.test.ts` *(nouveau)* | `creerEtatDesLieux` : avec bail / sans bail, compteurs repris du bien puis de l'entrée, trame issue de `piecesModele` puis de la bibliothèque, sortie `edl_papier` (colonne d'entrée vide et saisissable) et `aucun` |
| `lib/db.migration.test.ts` *(nouveau)* | Migration v6 : `bienId` et `locataireIds` reconstruits depuis le bail ; EDL orphelin toléré ; idempotence |
| `lib/backup.test.ts` | Archive écrite avant la v6 : import normalisé, `VERSION_SAUVEGARDE` inchangée, aucune archive existante refusée |
| `lib/rgpd.test.ts` | **Suppression d'un locataire dont l'EDL n'a aucun bail** : EDL, photos et PDF effacés ; EDL en colocation conservé et annoncé ; périmètre exact |
| `features/edl/EdlRapidePage.test.tsx` *(nouveau)* | Création complète sans aucune donnée préalable (bien + locataire + bailleur à la volée) ; brouillon repris ; validation minimale (bien + un locataire) |
| `features/edl/EdlTerrainPage.test.tsx` | Double sélecteur en mode `edl_papier` ; absence de la colonne d'entrée en mode `aucun` ; EDL sans bail : lien de retour vers `/edl` |
| `lib/pdf/EdlPdf.test.ts` *(nouveau)* | Rendu sans bail et en sortie sans entrée ; `mentionBail` et `mentionOrigineEntree` vérifiées sur le texte (les flux PDF sont compressés) |
| `features/dashboard/TableauDeBordPage.test.tsx` | Alerte dépôt déclenchée sur un EDL sans bail ; alerte « bail non signé » **non** déclenchée |

Les seuils de couverture par domaine (`vite.config.ts`) sont conservés : `lib/edl.ts` rejoint le
domaine `lib` déjà couvert.

## 10. Lots

1. **Socle** — types, migration Dexie v6, normalisation à l'import, `lib/edl.ts` factorisé,
   `chargerContexteEdl` tolérant au bail absent, `EdlPdf`/`LettreRestitutionPdf` en `bail?`.
   *À l'issue de ce lot, rien ne change pour l'utilisateur et tout est prêt.*
2. **Entrée rapide** — `EdlRapidePage`, refonte de `EdlListePage`, entrée depuis `BienDetailPage`,
   bloc bailleur, trame de pièces déduite. *Le parcours du site vitrine est tenu.*
3. **Sortie autonome** — bloc 5 du formulaire, double sélecteur en mode terrain, avertissements,
   dépôt saisi sur l'EDL, synthèse et lettre de restitution sans bail.
4. **Finitions** — rattachement a posteriori, RGPD, tableau de bord, CTA du site, README.

## 11. Hors périmètre

- **Signature électronique du bail** : inchangée, toujours refusée par conception.
- **Gestion locative sans bail** (quittances, encaissements, révision IRL) : reste attachée au bail.
- **État des lieux par un tiers** (agent, mandataire) : le signataire bailleur reste celui des
  Paramètres. Un mode « mandataire » relèverait d'un autre lot.
- **Import d'un EDL d'entrée papier par photo ou OCR** : le report reste manuel.
- **Modèles de trame de pièces personnalisés** hors bibliothèque : l'éditeur de pièces de la fiche
  du bien couvre déjà le besoin.
