# Bailiz — Gestion locative LMNP (Baux & États des lieux)

Application web 100 % côté client pour bailleur particulier en LMNP : rédaction de baux
meublés conformes prêts à imprimer, états des lieux d'entrée/sortie comparatifs avec photos —
l'état des lieux valant **inventaire du mobilier** —, signature sur écran horodatée et hachée
(SHA-256), calcul des retenues sur dépôt de garantie avec grille de vétusté.

**Aucun backend, aucun compte** : toutes les données restent dans le navigateur (IndexedDB).
PWA installable, fonctionne entièrement hors-ligne après le premier chargement (EDL en cave,
parking, immeuble mal couvert…).

https://jami-inf.github.io/Bailiz_gestion_immo/

## Principe : le document fait foi, pas l'outil

- **Le bail** se signe **sur papier**, après impression : l'application ne propose aucune
  signature électronique du bail. Il reste donc **modifiable et régénérable à volonté**, et son
  PDF est toujours reconstruit à partir des données courantes (jamais de version périmée).
- **L'état des lieux** (et l'inventaire qu'il contient) se remplit et se signe **sur place, sur
  tablette** : la signature électronique y est admise (décret n°2016-382). Après signature il est
  verrouillé, mais peut être **rectifié** si les deux parties re-signent — la version précédente
  est alors conservée et le nouveau document porte la mention « annule et remplace ».
- Les champs laissés vides deviennent des **zones pointillées à compléter à la main** : on peut
  imprimer un bail partiellement rempli et finir sur place.

## Stack

- React 18 + Vite + TypeScript strict
- Tailwind CSS 3 (design system interne, aucun kit de composants)
- IndexedDB via Dexie.js (photos stockées en Blob, compressées à la capture)
- PWA : `vite-plugin-pwa` (précache complet + fonctionnement hors-ligne)
- PDF côté client : `@react-pdf/renderer`
- `react-router-dom` v7, `react-hook-form` + `zod`, `dexie-react-hooks`, `signature_pad`,
  `date-fns` (locale fr), `jszip`, `lucide-react`
- Qualité : ESLint (flat config) + Vitest (`fake-indexeddb` pour la couche Dexie)

## Démarrer

```bash
npm install
npm run dev        # serveur de développement
npm run lint       # ESLint (exécuté aussi en CI)
npm test           # tests unitaires (Vitest)
npm run build      # build de production + PWA
```

## Fonctionnalités

### Biens
- CRUD avec formulaire multi-étapes : identité → surfaces/équipements → dossier technique → pièces.
- Éditeur de structure de pièces avec bibliothèque de modèles (séjour, chambre, cuisine, SDB,
  WC, entrée, cave, parking) : cette trame est réutilisée pour chaque état des lieux, et les
  éléments ajoutés depuis le terrain viennent l'enrichir automatiquement.
- **Lien vers le dossier technique en ligne** (Drive, cloud…) : un **QR code** vers ce dossier
  est imprimé sur le bail, pour que le locataire consulte les diagnostics. L'URL est validée
  (`http(s)` uniquement) avant d'être rendue cliquable ou encodée.
- Zone d'encadrement des loyers activable par bien (loyer de référence, référence majorée).
- **Photo du logement** (compressée à l'import) affichée sur la fiche du bien et en tête de la
  fiche de visite.
- **Conditions de location portées par le logement** (loyer, charges, dépôt, disponibilité,
  accès, conditions particulières) : elles pré-remplissent le formulaire de bail dès qu'on
  choisit le bien, et sont mises à jour à l'enregistrement du bail — le loyer évoluant peu, la
  fiche reste juste sans saisie en double.

### Visites
- **Fiche de visite** générée depuis la fiche du bien, à remettre au candidat : page 1, le
  logement, ses conditions (total charges comprises calculé, dépôt, disponibilité) et les infos
  pratiques (date, accès, contact) ; page 2 détachable, **les pièces du dossier de candidature en
  cases à cocher**, conformes à la liste **limitative** du décret n°2015-1437. Le dossier
  technique n'y figure pas : il est remis en annexe du bail, pas à la visite.
- **Acte de cautionnement joint** à la fiche si le candidat se présente avec un garant personne
  physique : pré-rempli (bailleur, adresse du logement, loyer, charges, montants en toutes
  lettres), le reste en zones à compléter à la main.
- Sections **conditionnelles** (garant physique, Visale, colocation, étudiant, indépendant) :
  seules celles cochées à la génération sont imprimées.
- **Modèle entièrement modifiable dans les Paramètres** : blocs imprimés, textes libres,
  sections et pièces (ajout, réordonnancement, désactivation), aperçu PDF, remise à zéro.

### Locataires
- CRUD avec garant : caution personne physique ou **garantie Visale** (numéro de visa ; le
  contrat de cautionnement est alors émis par Action Logement, rien à rédiger).
- Le **même formulaire** sert depuis la fiche Locataires et depuis le formulaire de bail :
  une seule source de champs, aucune divergence de données.
- **RGPD — suppression définitive réellement complète** : supprimer un locataire efface aussi
  ses baux, états des lieux, photos et **PDF archivés** (qui portent son nom et ses
  coordonnées). Le périmètre exact est annoncé avant confirmation. En colocation, le bail est
  conservé et le locataire simplement retiré. La suppression reste bloquée si un bail actif y
  est lié.

### Baux
- **Un seul écran** avec **aperçu du PDF en direct** : bailleur → logement → locataire(s) →
  type & durée → loyer & charges → clauses & travaux. Le bien et les locataires peuvent être
  choisis parmi les fiches enregistrées **ou créés à la volée** sans quitter le formulaire.
- **Validation non bloquante** : les incohérences légales (DPE G, dépôt > 2 mois, durée
  atypique) s'affichent en avertissements — le but est de produire un document à compléter,
  jamais de bloquer.
- **Modifiable et régénérable à l'infini** : « Modifier » rouvre le formulaire pré-rempli,
  l'enregistrement met à jour le bail et régénère son PDF (même référence, aucun doublon).
- PDF conforme à la trame du bail type (décret n°2015-587 modifié, parties I à XI) :
  identifiant fiscal du logement (décret 2023-796), type d'habitat, période de construction,
  classe DPE avec rappel des seuils de décence (loi Climat et résilience), accès aux
  technologies, zone tendue, IRL, charges forfait/provisions, assurance colocataires, rubrique
  travaux, dépôt de garantie en toutes lettres, **clause résolutoire**, dernier loyer de
  l'ancien locataire, honoraires « néant », SIRET LMNP…
- **Checklist des pièces à remettre** par le locataire, imprimée en fin de bail et adaptée au
  dossier (garant physique, Visale, bail étudiant, mobilité).
- Cycle de vie simplifié : généré → logement loué → terminé (déclenché par l'EDL de sortie
  signé). Aucun statut « signé » : c'est le document papier qui fait foi.
- **Documents utiles** depuis la fiche du bail, pré-remplis : fiche d'aide juridique, **acte de
  cautionnement** (art. 22-1, rempli avec ce que le bail connaît, le reste à compléter à la
  main), grille de vétusté, courrier de révision IRL, lettre de restitution du dépôt.
- Calculateurs : prorata du premier loyer, révision IRL avec courrier PDF.

### États des lieux — valant inventaire (cœur de l'app, optimisé iPad)
- Mode terrain plein écran : une pièce à la fois, onglets, sélecteur d'état en 5 gros boutons
  colorés (Neuf / Très bon / Bon / Usagé / Mauvais), commentaires, **photos par élément**
  (caméra du device, compression 1600 px JPEG 0,7), compteurs (avec photo), clés, barre de
  progression, **sauvegarde automatique en continu**.
- **L'EDL vaut inventaire et état détaillé du mobilier** (décret n°2015-981) : le mobilier
  porte une **quantité** (stepper tactile) en plus de son état, et les **11 postes
  obligatoires** forment une rubrique dédiée, avec alerte si l'un d'eux passe à zéro.
- **Ajout d'éléments et de pièces à la volée** pendant l'entrée : ils sont ajoutés à l'EDL
  **et mémorisés dans la fiche du logement** pour les états des lieux suivants.
- EDL de sortie : structure et états d'entrée dupliqués, **état d'entrée mis en évidence**,
  dégradations marquées automatiquement (décochables si usure normale). On n'y ajoute plus
  d'élément : un élément absent se marque **« Manquant »**, ce qui vaut dégradation.
- Synthèse comparative : éléments dégradés avec photos entrée/sortie côte à côte, coût de
  remise en état × coefficient de vétusté, total des retenues, lettre de restitution du dépôt
  (délais légaux 1/2 mois, majoration 10 %/mois).
- Signature sur écran : relecture obligatoire → nom tapé + « lu et approuvé » → signature au
  doigt/stylet → horodatage ISO 8601 → PDF final → **empreinte SHA-256** en pied de page →
  **verrouillage**. Corrections mineures par avenant daté, modification substantielle par
  **rectification re-signée des deux parties**.
- Rappel des 10 jours pour compléter l'EDL d'entrée, écran « Transmettre une copie ».

### Documents & sauvegarde
- Bibliothèque de tous les PDF générés, filtrable par bien / bail / type, numérotation
  `TYPE-ANNEE-XXXX` (séquence remise à zéro chaque année).
- Export sauvegarde ZIP (data.json + photos + PDF) / import avec détection de conflits
  (« remplacer tout » ou « fusionner par id »). Rappel si la sauvegarde date de plus de 30 jours.
- **Sauvegarde automatique « push ZIP »**, deux destinations cumulables, zéro serveur :
  un dossier local synchronisé par votre cloud (Chrome/Edge desktop, File System Access)
  et/ou **Google Drive via l'API** (tous navigateurs, y compris Safari/iPad — scope
  `drive.file` limité aux fichiers de l'app, ID client OAuth **pré-rempli**). Déclencheurs :
  après chaque signature, à chaque modification (regroupées), à l'ouverture ; reprise au retour
  du réseau ; rotation des 10 dernières archives.
- Persistance du stockage demandée au navigateur (`navigator.storage.persist()`).
- **Diagnostic des pannes** : les échecs affichent un **code d'étape et la cause réelle**
  (stockage saturé, permission refusée…) plutôt qu'un message générique — indispensable sur
  tablette, où la console n'est pas consultable. Les toasts d'erreur restent affichés jusqu'à
  fermeture manuelle.

### Tableau de bord
- Biens avec statut loué/vacant, alertes (diagnostics expirants, dépôt à restituer sous X
  jours, sauvegarde ancienne), échéancier (fins de bail, révisions IRL).

## Structure

```
src/
  components/ui/        design system (Button, Input, Select, Modal, Toast, Badge, Section…)
  components/           AppLayout (nav repliable, indicateurs hors-ligne), SignatureFlow
  features/
    biens/              fiches, éditeur de pièces, création rapide, photo, fiche de visite
    locataires/         fiches + formulaire partagé (LocataireFormModal)
    baux/               formulaire unifié (+ aperçu), fiche bail, annexes
    edl/                mode terrain, signature, synthèse comparative
    documents/  dashboard/  parametres/  legal/
  lib/
    db.ts               schéma Dexie + séquences de références
    calculs.ts          prorata, IRL, dépôt de garantie, vétusté, retenues
    etat.ts             comparatif entrée/sortie, dégradations, progression
    rgpd.ts             suppression complète d'un locataire et de ses documents
    erreurs.ts          messages d'erreur exploitables (quota, permission…)
    adresse.ts liens.ts formatage d'adresse, validation d'URL externe
    crypto.ts           SHA-256 (Web Crypto)
    images.ts           compression photos
    backup.ts           export/import ZIP
    autosave.ts gdrive.ts  sauvegarde automatique (dossier local, Google Drive)
    defauts.ts          mobilier décret 2015-981, bibliothèque de pièces, grille de vétusté,
                        modèle de fiche de visite (décret 2015-1437), pièces interdites
    pdf/                bail, EDL, acte de cautionnement, grille de vétusté,
                        lettre de restitution, courrier IRL, fiche d'aide, fiche de visite
  types.ts              modèle de données complet
```

## Avertissement

Cet outil est une aide à la rédaction. Il ne constitue pas un conseil juridique. Vérifiez les
évolutions légales sur service-public.fr. Le bail est destiné à être **imprimé et signé à la
main** ; l'application ne fournit pas de signature électronique du bail.
