# Bailiz — Documentation technique de maintenance

> Public : développeur reprenant le projet. Complète le [README](../README.md) (présentation
> fonctionnelle) et le [cahier des charges](../cdc.md) (référence contractuelle : cadre
> juridique §2, modèle de données §4, critères d'acceptation §8).

## 1. Vue d'ensemble

Bailiz est une SPA React **100 % côté client** : aucun backend, aucune API, aucun compte.
Toutes les données (biens, baux, EDL, photos, PDF générés) vivent dans **IndexedDB** du
navigateur. L'app est une **PWA installable** qui fonctionne hors-ligne après le premier
chargement — contrainte forte : toute nouvelle fonctionnalité doit fonctionner sans réseau.

```
UI (React + Tailwind)
  └─ features/*  ── pages et panneaux par domaine métier
       └─ lib/*  ── logique pure : calculs légaux, comparatif EDL, crypto, images, backup
            └─ lib/db.ts  ── Dexie (IndexedDB) : source de vérité unique
            └─ lib/pdf/*  ── rendu des documents (@react-pdf/renderer)
```

Principes structurants :

- **Dexie est la source de vérité.** Les pages lisent via `useLiveQuery` (re-rendu réactif
  automatique quand la table change) et écrivent directement (`db.table.put`). Il n'y a pas
  de store global (pas de Redux/Zustand) : l'état partagé, c'est la base.
- **La logique métier est dans `src/lib`**, en fonctions pures testées (Vitest). Les
  composants ne contiennent que de l'orchestration UI.
- **Français intégral** dans l'UI et les PDF ; montants via `formatEuros`
  (`Intl.NumberFormat fr-FR`), dates via `date-fns` + locale `fr`.

## 2. Dépendances npm et leur rôle

| Dépendance | Rôle | Où c'est utilisé |
|---|---|---|
| `react`, `react-dom` (18) | UI | partout |
| `react-router-dom` (7) | Routing (**HashRouter** — pas de config serveur nécessaire, compatible `file://` et PWA) | `App.tsx` |
| `dexie` (4) + `dexie-react-hooks` | IndexedDB + hook réactif `useLiveQuery` | `lib/db.ts`, toutes les pages |
| `@react-pdf/renderer` (4) | Génération PDF déclarative côté client | `lib/pdf/*` |
| `signature_pad` (5) | Capture de signature sur canvas | `components/SignatureFlow.tsx` |
| `jszip` (3) | Export/import de sauvegarde ZIP | `lib/backup.ts` |
| `zod` (3) | Validation de formulaires | `BienFormPage`, `LocatairesPage` |
| `react-hook-form` + `@hookform/resolvers` | Formulaire locataire (les autres formulaires utilisent du state local + zod à la transition d'étape) | `LocatairesPage` |
| `date-fns` (4) | Dates, locale fr, arithmétique (`addMonths`, `differenceInDays`…) | partout |
| `lucide-react` | Icônes | partout |
| `tailwindcss` (3) + `postcss` + `autoprefixer` | Styles (aucune autre lib CSS) | `tailwind.config.js` |
| `vite` (5) + `@vitejs/plugin-react` | Build | `vite.config.ts` |
| `vite-plugin-pwa` | Manifest + service worker Workbox (précache) | `vite.config.ts` |
| `vitest` + `fake-indexeddb` | Tests unitaires (env. node ; `fake-indexeddb/auto` simule IndexedDB pour tester Dexie) | `src/lib/*.test.ts` |
| `typescript` (strict) | `strict: true`, aucun `any` non justifié | `tsconfig.app.json` |

Points de vigilance en cas de montée de version :

- **`@react-pdf/renderer`** : c'est la dépendance la plus lourde (~2 Mo du bundle) et la plus
  sensible. Vérifier après upgrade : pagination (`wrap`/`fixed`), `render={({pageNumber,
  totalPages})}` du pied de page, rendu des `Image` en data-URL. La v4 est compatible React 18.
- **`signature_pad`** : l'app s'appuie sur l'événement `endStroke` (v4+) et sur le binding
  pointer events. Voir §7.3.
- **`dexie`** : le schéma utilise `EntityTable` (Dexie 4). Toute évolution de schéma exige une
  migration versionnée (§4.3) — ne jamais modifier `version(1)` en place une fois déployé.
- **Tailwind** : le projet est en v3 (config `tailwind.config.js` + directives `@tailwind`).
  Une migration v4 changerait la config (CSS-first) — non triviale, sans bénéfice immédiat.

## 3. Arborescence et responsabilités

```
src/
  main.tsx                 Bootstrap : registerSW (PWA), navigator.storage.persist()
  App.tsx                  Routes (HashRouter) — table de routage unique
  types.ts                 TOUT le modèle de données + labels FR (ETAT_LABELS, etc.)
  index.css                Tailwind + import police Inter (cache runtime Workbox)

  components/
    ui/                    Design system : Button, Input/Textarea/Select/Checkbox/Field,
                           DateInput (saisie JJ/MM/AAAA masquée + calendrier natif),
                           Modal/ConfirmModal, Toast (ToastProvider + useToast), Badge,
                           Stepper, Card/PageHeader/EmptyState. Export groupé via index.ts.
    AppLayout.tsx          Navigation (sidebar desktop / barre basse mobile), indicateurs
                           hors-ligne + persistance, disclaimer 1re utilisation.
                           Exporte DISCLAIMER_JURIDIQUE (réutilisé en Paramètres).
    SignatureFlow.tsx      Parcours de signature générique (relecture → n signataires →
                           SignatureBloc). Utilisé par EDL ET inventaire.

  hooks/useStatuts.ts      useEnLigne (online/offline), usePersistanceStockage

  lib/
    db.ts                  Schéma Dexie, getParametres(), prochaineReference()
    ids.ts                 uid() (uuid v4), nowISO()
    calculs.ts             RÈGLES LÉGALES : prorata, IRL, plafond dépôt, durées par type
                           de bail, vétusté, retenues, délais de restitution
    dates.ts               parserDateFr / versDateFr / masquerSaisieDate (DateInput)
    lettres.ts             montantEnLettres (dépôt de garantie en toutes lettres sur le bail)
    etat.ts                Logique EDL : estDegradation, construirePiecesSortie,
                           progressionEDL, elementsDegrades
    crypto.ts              sha256Hex (Web Crypto), formatHash
    images.ts              compresserImage (canvas 1600px JPEG 0,7), blobVersDataUrl
    backup.ts              Export/import ZIP, détection de conflits, telechargerBlob
    rgpd.ts                Suppression complète d'un locataire (baux, EDL, photos, PDF) et
                           calcul préalable du périmètre effacé
    erreurs.ts             decrireErreur : cause exploitable (quota, permission, contrainte)
    adresse.ts             formatAdresse (adresse sur une ligne, parties vides ignorées)
    liens.ts               Liens du projet + urlExterneSure (filtre http/https)
    defauts.ts             DONNÉES LÉGALES/MÉTIER : MOBILIER_OBLIGATOIRE (décret 2015-981),
                           BIBLIOTHEQUE_PIECES, GRILLE_VETUSTE_DEFAUT, VALIDITE_DIAGNOSTICS,
                           LIEN_NOTICE_INFORMATION
    pdf/
      commun.tsx           Styles partagés, EntetePdf, PiedDePagePdf (pagination + hash),
                           SignaturesPdf, ZoneSignatureManuscrite, formatDateFr
      generer.ts           rendrePdf, rendrePdfAvecHash (2 passes), enregistrerDocument,
                           telechargerDocument
      BailPdf.tsx          Bail type décret 2015-587 (parties I à XI), champs manquants
                           rendus en zones pointillées, QR code du dossier technique,
                           checklist des pièces à remettre
      ActeCautionnementPdf.tsx  Acte de cautionnement solidaire (art. 22-1), pré-rempli
                           depuis le bail ; ne s'applique pas à Visale
      EdlPdf.tsx           EDL entrée/sortie + tableau comparatif + annexe photos
      LettreRestitutionPdf.tsx  Décompte dépôt de garantie
      CourrierIrlPdf.tsx   Courrier de révision annuelle
      GrilleVetustePdf.tsx Grille de vétusté + mode d'emploi et exemple chiffré (annexe
                           générée avec chaque bail, et à la demande depuis Paramètres)
      FicheAidePdf.tsx     Fiche d'aide juridique : préavis/congés, formes de notification,
                           impayés (6 semaines post-2023 / 2 mois avant), dépôt, prescription,
                           ADIL/conciliation (générée depuis Paramètres)

  features/
    legal/MentionsLegalesPage.tsx      Mentions légales, confidentialité, infos techniques
                                       (créateur/LinkedIn/repo via lib/liens.ts ; lien dans le
                                       footer global rendu par AppLayout sur toutes les pages)
    dashboard/TableauDeBordPage.tsx    Alertes + échéancier (logique inline, voir §5.6)
    biens/     BiensPage, BienFormPage (4 étapes), BienDetailPage,
               PiecesEditeur, BienRapideModal (création rapide depuis le bail)
    locataires/LocatairesPage.tsx      Liste + suppression RGPD (périmètre annoncé)
               LocataireFormModal.tsx  Formulaire partagé (RHF+zod), utilisé aussi par le bail
    baux/      BauxPage (+ STATUT_BAIL_UI), BailRapidePage (formulaire unifié mono-écran
               avec aperçu PDF ; création et édition), SectionLocataires, ApercuBailPanel,
               BailDetailPage (cycle de vie, calculateurs, documents utiles),
               annexes.ts (checklist des annexes par défaut)
    biens/     … + BienRapideModal (création d'un logement sans quitter le bail)
    edl/       EdlListePage, EdlTerrainPage (mode terrain), SectionsReleves (compteurs/clés),
               EdlSignaturePage, EdlSynthesePage, PhotoCapture, edlPdfUtils.ts
    documents/DocumentsPage.tsx        Bibliothèque filtrable
    parametres/ParametresPage.tsx      Bailleur, grille vétusté, sauvegarde, RGPD
```

Alias d'import : `@/` → `src/` (défini dans `vite.config.ts` **et** `tsconfig.app.json` —
maintenir les deux synchrones).

## 4. Persistance (Dexie / IndexedDB)

### 4.1 Tables et index (`lib/db.ts`, base `bailiz`, version 1)

| Table | Index | Contenu |
|---|---|---|
| `biens` | `id, nom, updatedAt` | Bien + lien du dossier technique + `piecesModele` (trame des EDL) |
| `locataires` | `id, nom, updatedAt` | Locataire + garant |
| `baux` | `id, reference, bienId, statut, updatedAt, *locataireIds` | `*locataireIds` = multi-entry (recherche des baux d'un locataire) |
| `inventaires` | `id, reference, bailId, statut` | Lignes de mobilier + signatures |
| `edls` | `id, reference, bailId, type, statut, updatedAt` | Structure complète (pièces/éléments/compteurs/clés/avenants) |
| `photos` | `id, edlId` | **Blob JPEG** + dateCapture + légende. Jamais en base64 en base. |
| `documents` | `id, reference, type, bienId, bailId, edlId, createdAt` | **Blob PDF** de chaque document généré |
| `parametres` | `id` | Singleton `id='singleton'` : bailleur, grille vétusté, séquences, dernière sauvegarde, disclaimer |

Seuls les champs indexés sont déclarés dans `stores()` ; le reste de l'objet est stocké tel
quel (comportement Dexie standard).

### 4.2 Références `TYPE-ANNEE-XXXX`

`prochaineReference('bail'|'edl'|'inventaire'|'document')` incrémente la séquence
correspondante dans `parametres.compteursSequence` **dans une transaction** (pas de doublon
en cas d'appels concurrents) et **remet tout à zéro au changement d'année**. Les lettres et
courriers utilisent le préfixe générique `DOC-`.

### 4.3 Migration de schéma (procédure)

Ne jamais éditer `version(1)`. Ajouter :

```ts
this.version(2).stores({ /* uniquement les tables dont les INDEX changent */ })
  .upgrade(async (tx) => {
    // transformation des données existantes si besoin
    await tx.table('edls').toCollection().modify((edl) => { /* ... */ });
  });
```

Les champs non indexés peuvent être ajoutés aux interfaces de `types.ts` **sans** migration
(les objets existants les auront simplement `undefined` — coder défensivement, ex.
`edl.avenants ?? []`). Penser à l'impact sur `lib/backup.ts` : le format d'export porte un
champ `version` (actuellement `1`) — incrémenter et gérer la rétro-compatibilité dans
`lireSauvegarde` si la forme des entités change.

### 4.3 bis Schéma v2 — table `sauvegardeAuto`

La v2 ajoute la table `sauvegardeAuto` (une seule ligne, id `'dossier'`) qui stocke le
**FileSystemDirectoryHandle** du dossier de sauvegarde automatique (les handles sont
structured-cloneables, donc persistables dans IndexedDB). Cette table est **volontairement
exclue de l'export ZIP** : un handle est propre à l'appareil et n'aurait aucun sens restauré
ailleurs.

### 4.4 Sauvegarde ZIP (`lib/backup.ts`)

Format de l'archive :

```
bailiz-sauvegarde-YYYY-MM-DD-HHmm.zip
├── data.json          { version: 1, exporteLe, biens[], locataires[], baux[], inventaires[],
│                        edls[], photos[{meta, fichier}], documents[{meta, fichier}], parametres }
├── photos/<id>.jpg
└── documents/<id>.pdf
```

- Les Blob sont convertis en **ArrayBuffer** avant `zip.file(...)` et relus en
  `async('arraybuffer')` : JSZip ne gère pas les Blob dans tous les environnements (c'est ce
  qui permet aussi de tester sous Node). Ne pas « simplifier » en repassant à `type: 'blob'`.
- Import : `detecterConflits` compte les ids déjà présents, puis `importerSauvegarde` en mode
  `'remplacer'` (clear complet puis bulkPut) ou `'fusionner'` (bulkPut = upsert par id).
- `exporterSauvegarde` met à jour `parametres.derniereSauvegarde` ; le tableau de bord alerte
  si > 30 jours (`sauvegardeAncienne`).

### 4.5 Sauvegarde automatique « push ZIP » (`lib/autosave.ts`)

Zéro infrastructure : l'utilisateur choisit une fois un dossier local **synchronisé par son
cloud** (Google Drive, OneDrive, iCloud…) via `showDirectoryPicker` (File System Access API —
Chrome/Edge desktop uniquement ; le panneau Paramètres affiche un repli explicite sinon).

- **Déclencheurs** : après chaque signature (EDL, bail, inventaire — appel
  `pousserSiActive(true)` dans les trois pages) ; à l'ouverture de l'app si le dernier push
  date de plus de 7 jours (`AppLayout`, `pousserSiActive(false)` : silencieux, ne re-demande
  pas la permission) ; et **à chaque modification d'entité** :
  `initAutosaveSurModifications` pose des hooks Dexie (`creating`/`updating`/`deleting`) sur
  les 7 tables métier et regroupe les écritures (debounce 30 s après la dernière) avant un
  push silencieux avec toast de confirmation. Garde-fous : le flag `pushEnCours` empêche les
  pushs concurrents ET la boucle infinie (le push écrit lui-même dans `parametres`) ; les
  tables `parametres`/`sauvegardeAuto` ne sont pas observées ; l'init est idempotente
  (StrictMode). Attention : les hooks ne voient que les écritures passant par Dexie.
- **UI** : composant `SauvegardeStatut` (pied de la barre latérale, `AppLayout`) — affiche
  « Dernière sauvegarde à XXhXX » (source unique : `parametres.derniereSauvegarde`, mise à
  jour par tout export réussi, manuel ou auto) + bouton « Sauvegarder » quand au moins une
  destination est configurée (`pousserSiActive(true)`, donc capable de re-demander la
  permission).

### 4.6 Sauvegarde Google Drive (`lib/gdrive.ts`) — le cas iPad

Deuxième destination de push, cumulable avec le dossier local, qui fonctionne sur **tous**
les navigateurs (Safari/iPad inclus) puisqu'elle passe par l'API Drive et non par File
System Access :

- **Auth** : Google Identity Services (script `gsi/client` chargé à la demande, jamais au
  démarrage — l'app reste 100 % hors-ligne tant qu'on ne pousse pas), flux « token client »,
  scope non sensible **`drive.file`** (l'app ne voit que ses propres fichiers). Le jeton
  (~1 h) vit en mémoire uniquement, jamais persisté ; renouvellement silencieux
  (`prompt: ''`) sinon interaction requise. Types ambiants dans `src/types/gsi.d.ts`.
- **Config** dans `parametres.sauvegardeGDrive` (`clientId` public, `actif`, `dossierId`,
  `dernierPush`) — voyage donc avec l'export ZIP, ce qui est voulu (restauration sur un
  nouvel appareil : il ne reste qu'à se reconnecter). Le Client ID OAuth est saisi par
  l'utilisateur dans les Paramètres (créé sur console.cloud.google.com, origines autorisées
  = domaine GitHub Pages + localhost:5273).
- **Upload** : dossier « Bailiz » retrouvé/créé à la racine (`assurerDossier`), upload
  `multipart/related` (`construireCorpsMultipart`, pure et testée), rotation identique au
  dossier local (`lib/rotation.ts`, partagé — `fichiersASupprimer` y a été déplacé et est
  ré-exporté par `autosave.ts`).
- **Agrégation** : `pousserSiActive` pousse vers les deux destinations et renvoie `ok` si au
  moins une a réussi, sinon l'état le plus actionnable (`permission_requise` > `hors_ligne` >
  `erreur`). Nouveau statut `hors_ligne` : l'écouteur `online` posé par
  `initAutosaveSurModifications` replanifie automatiquement le push au retour du réseau
  (EDL signé à la cave → poussé en remontant). Attention : l'init de l'observateur n'est
  **plus** conditionnée à `autosaveSupportee()` (sinon iPad n'aurait aucun push).
- Un jeton expirant en plein push (401) est re-demandé une fois puis l'opération est rejouée.
- **Permissions** : après un redémarrage du navigateur, la permission repasse à `prompt` ;
  la re-demande (`requestPermission`) exige un geste utilisateur — c'est pourquoi le push
  d'ouverture n'insiste pas et les pushs post-signature (qui suivent un clic) peuvent, eux,
  rouvrir la demande.
- **Rotation** : seules les 10 archives `bailiz-sauvegarde-*.zip` les plus récentes sont
  conservées (`fichiersASupprimer`, pure et testée — le tri lexical des noms datés équivaut
  au tri chronologique). L'échec de la rotation n'empêche jamais le push.
- Les types de l'API sont déclarés dans `src/types/fs-access.d.ts` (absents de lib.dom).
- Astuce de test : un handle OPFS (`navigator.storage.getDirectory()`) expose la même
  interface qu'un dossier réel et permet de tester le push sans dialogue natif.

## 5. Fonctionnalités : implémentation et points d'attention

### 5.1 Biens

- `BienFormPage` : 4 étapes, état local `Bien` complet + validation zod à la transition
  (`schemaIdentite`, `schemaSurfaces`). Sert aussi à la modification (route
  `/biens/:id/modifier`, préchargement via `db.biens.get`).
- Champs légaux du bail type portés par le bien (tous optionnels, pas de migration Dexie) :
  `identifiantFiscal` (12 chiffres, décret 2023-796, baux depuis le 01/01/2024),
  `typeHabitat` (collectif/individuel), `periodeConstruction`, `classeDPE`,
  `equipementsTIC` (rubrique II.E), `zoneTendue` (décret d'évolution des loyers à la
  relocation — distinct de `zoneEncadrementLoyers`, le plafond au m²). La décence
  énergétique est validée par `validerDecenceDPE` (`lib/calculs.ts`) : G bloquant depuis
  2025, F en 2028, E en 2034 — alerte dans le formulaire ET blocage dans l'assistant de bail.
- `PiecesEditeur` édite `bien.piecesModele` : c'est la **trame copiée dans chaque EDL
  d'entrée** (copie profonde avec nouveaux ids — modifier la trame ne touche jamais un EDL
  existant). La bibliothèque de modèles est dans `defauts.ts` (`BIBLIOTHEQUE_PIECES`) :
  ajouter une pièce type = ajouter une entrée là-bas, rien d'autre.
- **Dossier technique** : plus de saisie de diagnostics datés (le suivi des validités a été
  retiré, il faisait double emploi avec les fichiers eux-mêmes). Le bien porte simplement
  `dossierTechniqueUrl` — un lien vers le dossier en ligne (Drive, cloud) — dont un **QR code**
  est imprimé sur le bail. L'URL passe par `urlExterneSure` (http/https uniquement) avant
  d'être rendue cliquable ou encodée : le QR est scanné par un tiers.
- Les éléments de catégorie `mobilier` des pièces (avec leur `quantite`) alimentent la partie
  inventaire de l'état des lieux d'entrée.

### 5.2 Locataires

- CRUD en modal avec react-hook-form + zod (`schema`). Le garant est aplati dans le
  formulaire (`avecGarant`, `garantNom`…) et reconstruit en objet `Garant` à l'enregistrement.
- **Suppression RGPD** (`lib/rgpd.ts`) : refusée si un bail lié est en statut `genere`,
  `signe` ou `actif`. Sinon `supprimerLocataireEtDonnees` efface, dans une transaction, le
  locataire **et tout ce qui porte ses données personnelles** : baux dont il est seul
  titulaire, EDL de ces baux, photos et **PDF archivés** (rattachés par `bailId` ou `edlId`).
  En colocation le bail est conservé, le locataire seulement retiré de `locataireIds`.
  `perimetreSuppressionLocataire` calcule ce périmètre sans rien modifier, pour l'annoncer
  dans la confirmation. Toute nouvelle table portant des données personnelles doit être
  ajoutée ici (et couverte dans `rgpd.test.ts`).

### 5.3 Baux

- `BailRapidePage` : **formulaire unifié mono-écran** (création et édition) avec aperçu PDF
  débattu à 500 ms. La saisie vit dans le type transitoire `SaisieBail` (aucune table Dexie) ;
  `lib/pdf/bailRapide.ts` la convertit en entités (`construireDocs`) et sait la recharger
  depuis un bail existant (`bailVersSaisie`). Bien et locataires sont **résolus depuis la base
  si sélectionnés**, sinon construits inline.
- **Validation non bloquante** : les incohérences (DPE G, dépôt > 2 mois, durée atypique)
  s'affichent en avertissements, jamais en blocage — l'outil produit un document à compléter.
  Les règles légales restent dans `lib/calculs.ts` : ne jamais en dupliquer une dans un
  composant, l'ajouter là avec un test.
- **Champs manquants** : `Rempl` (dans `pdf/commun.tsx`) rend une valeur ou, en mode
  `brouillon`, une zone pointillée à compléter à la main. `0` est traité comme vide.
- Le PDF suit la trame complète I–XI du contrat type : I désignation (mandataire « sans
  objet »), II objet (identifiant fiscal, habitat, période de construction, classe DPE +
  rappel des seuils de décence, TIC), III durée, IV conditions financières (zone tendue à la
  relocation, encadrement, IRL, assurance colocataires récupérable par douzième), V travaux
  (3 sous-rubriques, « néant » par défaut — champ `bail.travaux`), VI garanties (dépôt en
  chiffres ET en toutes lettres via `montantEnLettres`), VII solidarité, VIII **clause
  résolutoire** (`bail.clauseResolutoire`, défaut true — coder `!== false` pour les baux
  antérieurs au champ), IX honoraires (néant), X clauses particulières, XI annexes (dont
  attestation d'assurance du locataire dans la checklist).
- L'enregistrement fait, dans l'ordre : références (bail + grille) → construction des entités
  → rendu des PDF → transaction d'insertion → `enregistrerDocument` → navigation. Chaque
  étape porte un **code (E1…E6)** affiché en cas d'échec avec la cause réelle
  (`decrireErreur`) : sur tablette, la console n'est pas consultable.
- **Aucun inventaire séparé n'est créé** : l'EDL vaut inventaire (voir §5.4).
- **Pas de signature électronique du bail** : il est destiné à être imprimé et signé à la
  main (le PDF porte les zones de signature manuscrite). Le bail reste donc **modifiable et
  régénérable sans limite** — « Modifier » recharge le formulaire, l'enregistrement met à jour
  l'entité et régénère le PDF sous la **même référence**. « Télécharger le PDF » le reconstruit
  toujours depuis les données courantes : aucun écart possible entre l'écran et le document.
- **Cycle de vie** (`BailDetailPage`) : `genere` → `actif` (bouton « Marquer le logement
  loué ») → `termine` (bouton, ou **automatiquement** à la signature de l'EDL de sortie). Le
  statut `signe` n'est plus attribué ; il reste dans `StatutBail` pour lire les baux antérieurs.
- **Documents utiles** de la fiche bail : fiche d'aide juridique, acte de cautionnement
  (pré-rempli, non archivé car modèle à signer), grille de vétusté, courrier IRL, lettre de
  restitution. Tous passent par `genererEtArchiver` (référence + rendu + archivage +
  téléchargement) — utiliser ce helper pour tout nouveau document annexe.
- La checklist d'annexes est figée dans le bail à la création (`annexesParDefaut(bien)` —
  l'extrait de copropriété ne s'ajoute que si `regimeJuridique === 'copropriete'`).
- Calculateurs : prorata affiché en permanence (`prorataPremierLoyer` — jour d'effet inclus) ;
  révision IRL en modal (`revisionIRL` = loyer × nouvel indice / indice de référence),
  génère `CourrierIrlPdf` avec date d'application = anniversaire de l'année courante.

### 5.4 États des lieux (cœur de l'app — vaut inventaire)

**L'EDL vaut inventaire** (décret n°2015-981) : il n'existe plus d'entité `Inventaire`
distincte. Le mobilier porte une `quantite` en plus de son `etat`, et les 11 postes
obligatoires forment une pièce dédiée « Mobilier obligatoire », marquée `obligatoireDecret`
(non supprimable ; quantité 0 ⇒ alerte de non-conformité du meublé).

**Création** (depuis `BailDetailPage.creerEdl`) :
- entrée : pièces copiées depuis `bien.piecesModele` (nouveaux ids) + la pièce des 11 postes
  obligatoires (`MOBILIER_OBLIGATOIRE`) ;
- sortie : exige un EDL d'entrée **signé** ; structure dupliquée par
  `construirePiecesSortie(edlEntree)` qui reporte `etat→etatEntree`,
  `commentaire→commentaireEntree`, `photoIds→photoIdsEntree` et remet à zéro les champs de
  saisie.

**Mode terrain** (`EdlTerrainPage`) :
- Plein écran : `AppLayout` masque la navigation quand l'URL matche `/edl/:id` (regex
  `pleinEcran`). Onglets = Compteurs, Clés, une entrée par pièce, Infos. Le changement
  d'onglet ramène en haut de page.
- **Enrichissement du logement depuis le terrain (entrée uniquement)** : ajouter un élément ou
  une pièce l'écrit dans l'EDL **et** dans `bien.piecesModele`, pour les états des lieux
  suivants. En **sortie**, aucun ajout n'est possible : un élément absent se marque
  `manquant: true`, ce qui vaut dégradation (l'état d'entrée y est mis en évidence).
- **Photos** : par élément, et aussi sur les observations générales (`edl.photoIds`) ; toutes
  sont reprises dans l'annexe photographique du PDF (`chargerPhotosPourPdf`).
- **Autosauvegarde** : il n'y a PAS d'état local du document. Chaque interaction appelle
  `maj()` → `db.edls.put(...)` → `useLiveQuery` re-rend. Deux conséquences à respecter :
  1. les boutons/selects sont contrôlés (valeur lue de la base) ;
  2. les champs texte/nombre sont **non contrôlés** (`defaultValue` + `onBlur`) pour éviter
     une écriture IndexedDB par frappe et la perte de focus au re-rendu. Ils sont `key`-és
     par id d'élément pour être réinitialisés au changement d'entité. Si vous ajoutez un
     champ texte dans cette page, suivez ce motif.
- Dégradation (sortie) : `choisirEtat` recalcule `degradation = estDegradation(etatEntree,
  etat)` à chaque sélection (ordre : neuf > très bon > bon > usagé > mauvais, cf.
  `ETAT_ORDRE`), et la case reste décochable manuellement (usure normale).
- Verrouillage : si `statut === 'signe'`, `maj()` ne fait rien et tous les contrôles sont
  `disabled`. Seuls restent possibles : création d'**avenant** (texte daté, poussé dans
  `edl.avenants`, avec avertissement si les 10 jours sont dépassés) et l'accès à la synthèse.

**Photos** (`PhotoCapture`) :
- `<input type="file" accept="image/*" capture="environment" multiple>` →
  `compresserImage` (bitmap → canvas ≤ 1600 px → JPEG 0,7) → `db.photos.add` avec
  `dateCapture` stockée à part (les EXIF sont perdus au réencodage, c'est assumé).
- Les vignettes utilisent des object URLs révoqués au démontage. La suppression d'une photo
  supprime le Blob ET retire l'id de l'élément.
- Attention : la suppression d'un EDL n'est pas implémentée dans l'UI ; si vous l'ajoutez,
  supprimer aussi `db.photos.where('edlId').equals(id)` pour ne pas laisser de Blob orphelins.

**Signature** (`EdlSignaturePage` + `SignatureFlow`) :
1. relecture obligatoire (récap complet + lieu + case « relu ») ;
2. pour chaque signataire (bailleur puis locataires) : nom tapé, case « lu et approuvé »,
   tracé sur canvas (signature_pad ; bouton effacer) ;
3. `onTermine(SignatureBloc)` → `signer()` : EDL cloné avec signatures + `statut:'signe'` →
   photos chargées en data-URL (`chargerPhotosPourPdf`) → `rendrePdfAvecHash` → sauvegarde +
   `enregistrerDocument(signe:true)` → **si sortie : bail passé à `termine`** ;
4. écran final : hash affiché, téléchargement, `mailto:` pré-rempli (texte réglementaire de
   remise dématérialisée + hash ; l'utilisateur joint le PDF téléchargé), rappel des 10 jours.

**Synthèse comparative** (`EdlSynthesePage`, sortie uniquement) :
- Liste `elementsDegrades(edl)` avec photos entrée/sortie côte à côte.
- Saisie par élément : `coutRemiseEnEtat`, `posteVetuste` (référence une ligne de
  `parametres.grilleVetuste` **par son libellé `poste`** — renommer un poste de la grille
  casse le lien : les éléments pointant vers l'ancien nom retombent à 100 %), `ageEquipementAnnees`.
- **Rectification d'un EDL signé** : un document contradictoire ne se modifie pas
  unilatéralement, mais les deux parties peuvent convenir d'une version corrigée. « Rectifier »
  repasse l'EDL en `brouillon`, **archive la version signée** (date + `pdfHash`) dans
  `edl.rectifications[]` et impose une **nouvelle signature des deux parties**. Le PDF
  re-signé porte « annule et remplace la version signée du … » et le document s'intitule
  « (rectificatif n°X, signé) ». Le PDF signé précédent reste dans la bibliothèque.
- **Exception au verrouillage, volontaire** : ces trois champs restent modifiables après
  signature car ils appartiennent au décompte de restitution, pas au constat signé (le PDF
  signé n'en dépend pas).
- Calcul : `coefficientVetuste` (franchise → abattement annuel → plancher résiduel 10 % →
  0 % au-delà de la durée de vie) × coût = retenue ; délai légal 30/60 jours selon présence
  de retenues ; génération `LettreRestitutionPdf`.

### 5.5 Documents

- **Nommage** : les fichiers téléchargés passent tous par `telechargerDocument` →
  `nomFichierDocument` (`generer.ts`, testé) : `RÉF - titre - AAAA-MM-JJ.pdf`, caractères
  interdits nettoyés. Les titres incluent systématiquement le bien et le(s) locataire(s)
  (`nomsPersonnes` : « Marie Dupont et Jean Martin », « … et 2 autres »). Toute nouvelle
  génération de document doit suivre ce motif (titre construit une fois, passé à
  `enregistrerDocument` ET à `telechargerDocument`).
- Chaque PDF généré est persisté en Blob dans `documents` par `enregistrerDocument`.
  Règle de remplacement : une nouvelle génération **supprime les versions non signées** de la
  même référence ; les versions signées sont immuables et conservées.
- `DocumentsPage` : filtres par bien / bail / type, téléchargement direct du Blob stocké.

### 5.6 Tableau de bord

Toute la logique d'alertes est dans `TableauDeBordPage` (pas de lib dédiée) :
- EDL d'entrée signé alors que le bail est encore `brouillon`/`genere` ;
- dépôt à restituer : EDL de sortie signé → date limite = signature + 30 ou 60 jours selon
  dégradations, alerte affichée à ≤ 45 jours de l'échéance (rouge à ≤ 7 jours) ;
- sauvegarde > 30 jours.
Échéancier : fins de bail (`dateEffet + dureeMois`) et prochain anniversaire de révision IRL
des baux révisables. Si vous ajoutez un type d'alerte, suivez l'interface `Alerte` existante.

### 5.7 Paramètres

- Bailleur (affiché sur tous les PDF), grille de vétusté (tableau éditable, champs
  `defaultValue`+`onBlur`, bouton reset vers `GRILLE_VETUSTE_DEFAUT`), export/import (§4.4),
  mention RGPD, disclaimer.
- `getParametres()` crée le singleton au premier accès ; `AppLayout` l'appelle au montage,
  ce qui déclenche l'affichage du disclaimer tant que `disclaimerAccepte` n'est pas vrai.

## 6. Génération PDF

### 6.1 Pipeline

```
rendrePdf(<XxxPdf .../>)            → Blob (documents non signés)
rendrePdfAvecHash((hash?) => <XxxPdf hash={hash}/>)
   passe 1 : rendu SANS hash  → sha256Hex(blob)
   passe 2 : rendu AVEC hash inscrit en pied de page → Blob final
```

**Important** : l'empreinte affichée sur le PDF (et stockée dans `pdfHash` + `documents.hash`)
est celle du **PDF de première passe** (le contenu signé, sans le pied de page hash). Pour
vérifier une empreinte a posteriori, il faut donc régénérer la passe 1 à partir des données —
ou comparer avec le hash stocké en base. C'est un choix assumé (impossible d'inclure un hash
dans le document qu'il hache). Le second rendu de `@react-pdf/renderer` étant déterministe à
contenu identique, les deux passes ne diffèrent que par le pied de page.

### 6.2 Conventions communes (`commun.tsx`)

- En-tête fixe (titre du document + référence), pied de page fixe (pagination `x/y` +
  empreinte ou mention « Document généré par Bailiz »).
- `SignaturesPdf` : image PNG du canvas + nom tapé + mention « lu et approuvé » + horodatage
  (format lisible **et** ISO 8601). `ZoneSignatureManuscrite` : cadres vides pour signature
  papier (utilisée quand `signatures` est absent — bail, documents non signés sur écran).
- Polices : Helvetica intégrée (pas de font embarquée → PDF légers et pas de fetch réseau,
  compatible hors-ligne). Si vous embarquez une police, `Font.register` avec un fichier local.
- Ajouter un document = créer `lib/pdf/MonDocPdf.tsx` + un `TypeDocument` dans `types.ts`
  (+ son label dans `TYPE_DOCUMENT_LABELS`) + appeler `rendrePdf`/`enregistrerDocument`.

### 6.3 Photos dans l'EDL

`chargerPhotosPourPdf` convertit chaque Blob en data-URL (obligatoire pour
`@react-pdf/renderer`) avec légende « pièce — élément — date ». Elles sont rendues en annexe
(3 colonnes). Gros EDL = beaucoup de mémoire au moment du rendu ; si cela devient un problème,
paginer l'annexe ou réduire la taille de compression dans `lib/images.ts`.

## 7. Pièges connus / dette technique assumée

1. **Immutabilité applicative seulement.** Le verrouillage d'un EDL signé est garanti par
   l'UI (`maj()` no-op) et par convention — rien n'empêche un code d'écrire dans la table.
   Toute nouvelle fonctionnalité qui écrit dans `edls`/`inventaires` doit vérifier
   `statut !== 'signe'` (exception documentée : champs de vétusté, §5.4).
2. **Bundle monolithique (~2,1 Mo minifié)** dominé par `@react-pdf/renderer`. Amélioration
   possible sans risque : `import()` dynamique de `lib/pdf/*` aux points de génération
   (attention à garder le precache PWA cohérent). Le warning Rollup à ce sujet est connu.
3. **`signature_pad`** : `pointermove`/`pointerup` sont écoutés sur `window` ; le composant
   redimensionne le canvas au `devicePixelRatio` au montage. Il n'y a **pas** de gestion du
   resize/rotation pendant une signature (le tracé serait décalé) — cas accepté ; si besoin,
   ré-instancier le pad sur l'événement `resize`.
4. **Champs non contrôlés `defaultValue`+`onBlur`** (EDL terrain, synthèse, grille de
   vétusté) : un test automatisé doit déclencher `focusout` (pas `blur` non bubblant) pour
   valider la saisie. Les états/boutons sont contrôlés, eux. Dans les listes supprimables
   (compteurs, clés, grille de vétusté), les `key` incluent la longueur de la liste
   (`` `${i}-${liste.length}` ``) pour forcer le remontage après suppression — sinon les
   `defaultValue` affichés seraient décalés d'une ligne. Conserver ce motif.
4bis. **Dates** : tous les champs de date passent par `DateInput` (saisie clavier
   JJ/MM/AAAA avec masque + calendrier natif superposé à l'icône), qui échange en ISO
   `yyyy-MM-dd` et renvoie `''` si vide — les appelants doivent ignorer la valeur vide
   (`onChange={(d) => d && ...}`) pour ne jamais construire de `Date` invalide. Ne pas
   réintroduire d'`<input type="date">` nu.
5. **Police Inter via Google Fonts** (`index.css`) : disponible en ligne, mise en cache
   runtime par Workbox (`CacheFirst`) après la première visite en ligne ; au tout premier
   chargement hors-ligne on retombe proprement sur `system-ui`. Pour une garantie totale,
   embarquer les fichiers woff2 dans `public/` et remplacer l'`@import`.
6. **HashRouter** : les URL sont en `/#/...`. Ne pas remplacer par `BrowserRouter` sans
   configurer le fallback SPA de l'hébergeur ET la `navigateFallback` du service worker.
7. **`.claude/launch.json` du repo portfolio** contient une entrée `bailiz` (port 5273,
   `npm --prefix`) utilisée pour le développement piloté depuis l'autre workspace — anecdote
   d'outillage, pas une dépendance du projet.
8. **Suppression d'entités** : bien supprimable seulement sans baux liés ; locataire cf.
   RGPD, via `lib/rgpd.ts` qui gère déjà la cascade (baux, EDL, photos, PDF). Baux/EDL/
   documents n'ont pas de suppression UI directe (choix : traçabilité). Si vous en ajoutez
   une, réutiliser cette cascade et les références croisées (`edlEntreeId`, `edlSortieId`).

## 8. Tests et qualité

```bash
npm run lint        # ESLint (flat config) — exécuté en CI avant les tests
npm test            # Vitest, environnement node, src/**/*.test.ts
npx tsc -b          # type-check strict (aussi exécuté par npm run build)
```

**ESLint** (`eslint.config.js`) vise les vrais défauts, pas le style : règles des hooks,
variables/imports morts, `no-explicit-any`, `eqeqeq`, `no-console` (sauf `warn`/`error`).
Les règles du React Compiler (`set-state-in-effect`, `incompatible-library`) sont laissées en
**avertissement** : elles signalent ici des synchronisations d'état légitimes (réinitialiser un
formulaire à l'ouverture d'une modale, amorcer une saisie depuis des données asynchrones).
La CI échoue sur toute **erreur** ESLint.

| Fichier | Couvre |
|---|---|
| `lib/calculs.test.ts` | prorata (mois entier / partiel), IRL (formule + indice invalide), plafond dépôt (2 mois, refus 3 mois, interdiction mobilité), durées par type, coefficient de vétusté (franchise, abattement, plancher 10 %, 0 % fin de vie), total retenues, délais 30/60 j |
| `lib/etat.test.ts` | ordre des états, `construirePiecesSortie` (report entrée→référence, nouveaux ids), progression, extraction des dégradés |
| `lib/crypto.test.ts` | vecteurs SHA-256 connus (chaîne vide, "abc"), formatage |
| `lib/dates.test.ts` | parsing JJ/MM/AAAA (dates inexistantes rejetées), formatage, masque de saisie |
| `lib/lettres.test.ts` | nombres en lettres (règles françaises : 71, 80, 200, accords), montants en euros |
| `lib/autosave.test.ts` | rotation des archives (seuil, tri chronologique, fichiers étrangers ignorés) |
| `lib/gdrive.test.ts` | configuration Google Drive (activation, état, rotation des archives distantes) |
| `lib/pdf/generer.test.ts` | nommage des fichiers téléchargés, remplacement des versions non signées |
| `lib/pdf/BailPdf.test.ts` | rendu smoke du bail complet (fixtures avec toutes les mentions légales) via `renderToBuffer` |
| `lib/pdf/bailRapide.test.ts` | `construireDocs` (bien/locataire résolus ou inline), défauts de saisie, mobilité (dépôt interdit, IRL désactivée), colocation, clauses, `bailVersSaisie` |
| `lib/pdf/ActeCautionnementPdf.test.ts` | rendu vierge, rendu pré-rempli, loyer à 0 (montants laissés à compléter), garant sans adresse |
| `lib/db.test.ts` | numérotation `TYPE-ANNEE-XXXX`, séquences indépendantes par type, remise à zéro annuelle, absence de collision en concurrence |
| `lib/rgpd.test.ts` | suppression complète (bail, EDL, photos, PDF), conservation d'un bail en colocation, isolation des autres locataires |
| `lib/erreurs.test.ts` | traduction des causes (quota, contrainte de clé, erreur inconnue, valeur non-`Error`) |
| `lib/adresse.test.ts` | assemblage d'adresse, complément, parties manquantes sans séparateur orphelin |
| `lib/liens.test.ts` | `urlExterneSure` : http/https acceptés, schéma ajouté, `javascript:`/`data:`/`file:` rejetés |
| `features/baux/annexes.test.ts` | annexes générées cochées d'office, pièces externes à fournir, règlement de copropriété conditionnel, EDL valant inventaire |
| `validerDecenceDPE` (dans calculs.test) | calendrier loi Climat : G bloquant 2025, F 2028, E 2034, classe absente signalée |
| `lib/backup.test.ts` | export→import sur base vierge (100 % données+photos restaurées, octets identiques), détection de conflits, fusion sans perte (via `fake-indexeddb`) |

Non couvert automatiquement (vérifié manuellement, cf. critères §8 du cdc) : rendu des PDF,
parcours UI, PWA hors-ligne. **Règle de maintenance : toute règle légale ajoutée ou modifiée
dans `calculs.ts`/`etat.ts` doit arriver avec son test** — ce sont les fonctions qui engagent
la conformité juridique des documents.

## 9. Build, PWA et déploiement

- `npm run build` → `tsc -b` puis Vite → `dist/` avec `sw.js` (Workbox `generateSW`,
  précache de tous les assets `js/css/html/svg/png/woff2`, limite 6 Mo par fichier) et
  `manifest.webmanifest` (icônes SVG `any` + `maskable`).
- `registerType: 'autoUpdate'` : le SW se met à jour seul au rechargement suivant un déploiement.
- Déploiement = hébergement statique quelconque (HTTPS obligatoire pour PWA/`getUserMedia`).
  Aucune variable d'environnement, aucun secret.
- **GitHub Pages** : déploiement automatisé par `.github/workflows/deploy.yml` (push sur
  `main` → tests → build → artifact Pages → deploy). Le site étant servi sous
  `/<nom-du-repo>/`, `vite.config.ts` fixe **`base: './'`** (chemins relatifs partout :
  assets, manifest `start_url`/`scope`, precache Workbox). Ne pas retirer cette base, et ne
  pas passer à `BrowserRouter` : le `HashRouter` évite d'avoir à configurer un fallback 404.
- Test hors-ligne : build + `npm run preview`, charger une fois, couper le réseau (onglet
  Network → Offline), recharger : l'app démarre et toutes les données IndexedDB sont là.

## 10. Évolutions prévues (hors périmètre V1, architecture prête)

| Évolution | Point d'accroche |
|---|---|
| Signature eIDAS (Yousign/DocuSign) | Hors périmètre : le bail est volontairement signé sur papier. Le PDF « prêt à signer » existe (`documents`) si l'on souhaitait brancher un prestataire |
| Quittances / suivi des paiements | Nouvelle table Dexie + type de document ; les séquences et la bibliothèque absorbent un nouveau `TypeDocument` sans refonte |
| Synchronisation multi-appareils | Le format d'export ZIP (§4.4) est le pivot : mêmes ids partout, fusion par id déjà implémentée |
| Comptabilité LMNP | Hors périmètre — ne pas mélanger avec ce code, prévoir un module séparé |
