# Bailiz — Gestion locative LMNP (Baux & États des lieux)

Application web 100 % côté client pour bailleur particulier en LMNP : rédaction de baux
meublés conformes, inventaire du mobilier, états des lieux d'entrée/sortie comparatifs avec
photos, signatures sur écran horodatées et hachées (SHA-256), calcul des retenues sur dépôt
de garantie avec grille de vétusté.

**Aucun backend, aucun compte** : toutes les données restent dans le navigateur (IndexedDB).
PWA installable, fonctionne entièrement hors-ligne après le premier chargement (EDL en cave,
parking, immeuble mal couvert…).

## Stack

- React 18 + Vite + TypeScript strict
- Tailwind CSS 3 (design system interne, aucun kit de composants)
- IndexedDB via Dexie.js (photos stockées en Blob, compressées à la capture)
- PWA : `vite-plugin-pwa` (précache complet + fonctionnement hors-ligne)
- PDF côté client : `@react-pdf/renderer`
- `react-router-dom`, `react-hook-form` + `zod`, `dexie-react-hooks`, `signature_pad`,
  `date-fns` (locale fr), `jszip`, `lucide-react`

## Démarrer

```bash
npm install
npm run dev        # serveur de développement
npm test           # tests unitaires (Vitest)
npm run build      # build de production + PWA
```

## Fonctionnalités

### Biens (M1)
- CRUD avec formulaire multi-étapes : identité → surfaces/équipements → diagnostics → pièces.
- Éditeur de structure de pièces avec bibliothèque de modèles (séjour, chambre, cuisine, SDB,
  WC, entrée, cave, parking) : cette trame est réutilisée pour chaque état des lieux.
- Tableau de bord des diagnostics avec badges de validité (vert / orange < 3 mois / rouge
  expiré) et durées par défaut (DPE 10 ans, élec/gaz 6 ans, ERP 6 mois, CREP illimité).
- Zone d'encadrement des loyers activable par bien (loyer de référence, référence majorée).

### Locataires (M2)
- CRUD avec garant (personne physique, Visale). Un locataire peut être lié à plusieurs baux.
- RGPD : suppression définitive (bloquée si un bail actif est lié), mention d'information sur
  la conservation locale des données.

### Baux (M3)
- Assistant en 7 étapes : bien → locataire(s) (colocation + clause de solidarité) → type de
  bail (meublé 1 an / étudiant 9 mois / mobilité, avec explications) → conditions financières
  → clauses → annexes (checklist) → aperçu → génération PDF.
- Validations bloquantes : dépôt ≤ 2 mois HC (interdit en mobilité), durée cohérente avec le
  type, encadrement des loyers (loyer ≤ référence majorée sauf complément justifié).
- PDF conforme à la trame complète du bail type (décret n°2015-587 modifié, parties I à XI) :
  identifiant fiscal du logement (décret 2023-796), type d'habitat, période de construction,
  classe DPE avec rappel des seuils de décence (loi Climat et résilience), accès aux
  technologies, zone tendue (évolution des loyers à la relocation), IRL, charges
  forfait/provisions, assurance colocataires, rubrique travaux, dépôt de garantie en toutes
  lettres, **clause résolutoire** (impayés, dépôt, assurance, troubles de voisinage), dernier
  loyer de l'ancien locataire, honoraires « néant », SIRET LMNP…
- Garde-fou décence énergétique : création de bail bloquée pour un logement classé G
  (interdit depuis 2025), avertissement pour F (2028) et E (2034).
- Inventaire du mobilier généré conjointement, pré-rempli avec les 11 postes obligatoires du
  décret n°2015-981 (alerte si un poste est marqué absent), signable sur écran.
- Cycle de vie : brouillon → généré → signé → actif → terminé (déclenché par l'EDL de
  sortie signé). Trois voies de signature : impression manuscrite, prestataire eIDAS
  (recommandé), ou **signature sur écran dans l'app** (mêmes renforts probatoires que les
  EDL : nom tapé, « lu et approuvé », horodatage, empreinte SHA-256, verrouillage).
- Calculateurs : prorata du premier loyer, révision IRL avec courrier PDF.

### États des lieux (M4 — cœur de l'app, optimisé tablette)
- Mode terrain plein écran : une pièce à la fois, onglets, sélecteur d'état en 5 gros boutons
  colorés (Neuf / Très bon / Bon / Usagé / Mauvais), commentaires, photos (caméra du device,
  compression 1600 px JPEG 0,7), écrans compteurs (avec photo) et clés, barre de progression,
  **sauvegarde automatique en continu** dans IndexedDB.
- EDL de sortie : duplication automatique de la structure et des états de l'entrée, état
  d'entrée affiché en référence, marquage automatique des dégradations (état sortie < état
  entrée), décochable (usure normale).
- Synthèse comparative : éléments dégradés avec photos entrée/sortie côte à côte, coût de
  remise en état × coefficient de vétusté (grille paramétrable), total des retenues, lettre
  de restitution du dépôt en PDF (délais légaux 1 mois/2 mois, majoration 10 %/mois).
- Signature sur écran : relecture obligatoire → nom tapé + case « lu et approuvé » +
  signature au doigt/stylet → horodatage ISO 8601 → PDF final → **empreinte SHA-256** (Web
  Crypto) en pied de page → **verrouillage** (document immuable, corrections par avenant daté).
- Rappel des 10 jours pour compléter l'EDL d'entrée, avenants datés (confirmation au-delà du
  délai), écran « Transmettre une copie » (téléchargement + mailto pré-rempli).

### Documents & sauvegarde (M5)
- Bibliothèque de tous les PDF générés, filtrable par bien / bail / type, numérotation
  `TYPE-ANNEE-XXXX`, re-génération possible tant que non signé.
- Export sauvegarde ZIP (data.json + photos + PDF) / import avec détection de conflits
  (« remplacer tout » ou « fusionner par id »). Rappel si la sauvegarde date de plus de 30 jours.
- Persistance du stockage demandée au navigateur (`navigator.storage.persist()`).

### Tableau de bord (M6)
- Biens avec statut loué/vacant, alertes (diagnostics expirants, EDL signé sans bail signé,
  dépôt à restituer sous X jours, sauvegarde ancienne), échéancier (fins de bail, révisions IRL).

## Structure

```
src/
  components/ui/        design system (Button, Input, Select, Modal, Toast, Badge, Stepper…)
  components/           AppLayout (nav, indicateurs hors-ligne/persistance), SignatureFlow
  features/
    biens/  locataires/  baux/  edl/  documents/  dashboard/  parametres/
  lib/
    db.ts               schéma Dexie + séquences de références
    calculs.ts          prorata, IRL, dépôt de garantie, vétusté, retenues
    etat.ts             comparatif entrée/sortie, dégradations, progression
    crypto.ts           SHA-256 (Web Crypto)
    images.ts           compression photos
    backup.ts           export/import ZIP
    defauts.ts          mobilier décret 2015-981, bibliothèque de pièces, grille de vétusté
    pdf/                bail, inventaire, EDL, lettre de restitution, courrier IRL
  types.ts              modèle de données complet
```

## Avertissement

Cet outil est une aide à la rédaction. Il ne constitue pas un conseil juridique. Vérifiez les
évolutions légales sur service-public.fr. Pour la signature du bail, un prestataire de
signature électronique qualifié eIDAS est recommandé.
