# Cahier des charges — Outil de gestion locative LMNP (Baux & États des lieux)

> **Instruction pour Claude Code** : ce document est le cahier des charges complet d'une application web. Implémente-le intégralement en respectant l'architecture, le modèle de données et les lots de développement décrits ci-dessous. Travaille lot par lot, dans l'ordre. À la fin de chaque lot, vérifie les critères d'acceptation correspondants avant de passer au suivant.

---

## 1. Contexte et objectifs

Le commanditaire est un bailleur particulier en **LMNP (Loueur en Meublé Non Professionnel)**, propriétaire de plusieurs appartements meublés en France. Il gère lui-même ses locations sans agence.

L'outil doit couvrir les deux moments clés du cycle locatif :
1. **L'entrée du locataire** : rédaction du bail meublé conforme, inventaire du mobilier, état des lieux d'entrée.
2. **La sortie du locataire** : état des lieux de sortie comparatif, calcul des retenues éventuelles sur dépôt de garantie.

L'outil est utilisé ponctuellement (début et fin de bail), souvent **sur le terrain, sur tablette ou smartphone**, parfois **sans connexion internet** (cave, parking, immeuble mal couvert). Il doit donc fonctionner 100 % côté client.

### Objectifs mesurables
- Générer un bail meublé conforme (loi du 6 juillet 1989, décret n°2015-587 « bail type ») en moins de 10 minutes pour un bien déjà enregistré.
- Réaliser un état des lieux complet avec photos en moins de 45 minutes sur tablette.
- Produire des PDF professionnels, horodatés et hachés (SHA-256), prêts à signer.
- Zéro perte de données : sauvegarde locale persistante + export/import de secours.

---

## 2. Cadre juridique à respecter (contraintes produit)

Ces contraintes ne sont pas décoratives : elles conditionnent la structure des formulaires et des documents générés.

### 2.1 Bail meublé (résidence principale)
- **Bail type obligatoire** : contenu conforme au décret n°2015-587 du 29 mai 2015 (annexe 2 : location meublée).
- **Durée** : 1 an renouvelable par tacite reconduction ; 9 mois non renouvelable si locataire étudiant ; bail mobilité de 1 à 10 mois (loi ELAN) pour publics éligibles.
- **Dépôt de garantie** : maximum 2 mois de loyer hors charges (meublé). Interdit pour le bail mobilité.
- **Préavis** : 1 mois pour le locataire ; 3 mois pour le bailleur (congé uniquement à échéance, motif obligatoire : reprise, vente, motif légitime et sérieux).
- **Mentions obligatoires** (liste non exhaustive, à implémenter en champs de formulaire) :
  - Identité et adresse du bailleur (+ SIRET LMNP en champ optionnel affiché sur le bail).
  - Identité du ou des locataires (gestion de la colocation avec clause de solidarité optionnelle).
  - Description du logement : adresse, type (T1, T2…), surface habitable **loi Boutin**, nombre de pièces, étage, équipements privatifs et communs, annexes (cave, parking).
  - Date de prise d'effet et durée.
  - Loyer hors charges, modalités de paiement, date de paiement, modalités de révision (IRL : trimestre de référence + valeur de l'indice).
  - Charges : forfait ou provisions avec régularisation annuelle (en meublé, le forfait est courant — proposer les deux).
  - Montant du dépôt de garantie.
  - Le cas échéant : zone d'encadrement des loyers (loyer de référence, loyer de référence majoré, complément de loyer) — champ conditionnel activable par bien.
  - Honoraires (sans objet ici : location en direct, mais prévoir la mention « néant »).
  - Montant du dernier loyer acquitté par le précédent locataire (si parti depuis moins de 18 mois).
- **Annexes obligatoires** à joindre au bail (l'app génère celles qu'elle peut et fournit une checklist pour les autres) :
  - **Inventaire et état détaillé du mobilier** (obligatoire en meublé) — généré par l'app.
  - **État des lieux d'entrée** — généré par l'app.
  - **Notice d'information** (arrêté du 29 mai 2015 modifié) — l'app fournit un lien de téléchargement officiel et une case « jointe : oui/non » (ne pas reproduire le texte intégral, il évolue).
  - **Dossier de diagnostic technique (DDT)** : DPE, ERP (état des risques et pollutions), CREP si bâti avant 1949, diagnostic électricité/gaz si installation > 15 ans, surface loi Boutin. Checklist avec dates de validité et alertes d'expiration.
  - Extraits du règlement de copropriété (parties communes, destination de l'immeuble, quote-parts).
  - Grille de vétusté si utilisée (recommandé — l'app en intègre une, voir §5.4).
- **Mobilier minimum obligatoire** (décret n°2015-981 du 31 juillet 2015) — l'app pré-remplit l'inventaire avec les 11 éléments obligatoires et vérifie leur présence : literie avec couette ou couverture ; dispositif d'occultation des fenêtres dans les chambres ; plaques de cuisson ; four ou micro-ondes ; réfrigérateur avec compartiment congélation (ou congélateur) ; vaisselle en nombre suffisant ; ustensiles de cuisine ; table et sièges ; étagères de rangement ; luminaires ; matériel d'entretien ménager adapté.

### 2.2 État des lieux
- Cadre : article 3-2 de la loi de 1989 et **décret n°2016-382 du 30 mars 2016** (forme et contenu).
- Peut être établi **sur support papier ou électronique** et remis en main propre ou **par voie dématérialisée** à chaque partie au moment de sa signature. Le 100 % numérique est donc légal pour l'EDL.
- Doit être **contradictoire** (les deux parties présentes) et contenir au minimum : type d'EDL (entrée/sortie), date, localisation du logement, identité des parties, relevés des compteurs individuels (eau, électricité, gaz), détail et destination des clés/badges, description précise pièce par pièce (revêtements sols/murs/plafonds, équipements, éléments) avec état, et signatures.
- L'EDL de sortie peut comporter l'adresse du nouveau domicile du locataire et doit permettre la **comparaison poste par poste avec l'EDL d'entrée** (exigence centrale de l'app).
- Le locataire peut demander une modification de l'EDL d'entrée dans les **10 jours** (et pendant le 1er mois de chauffe pour le chauffage) — prévoir un mécanisme d'avenant.

### 2.3 Signatures — stratégie retenue (modèle hybride)
La signature électronique est légale pour un bailleur particulier (Code civil art. 1366-1367, règlement eIDAS, loi ELAN). Mais une signature simplement **dessinée dans une app sans tiers de confiance est une signature « simple »** : valable, mais de faible valeur probante en cas de contestation. Décision produit :

| Document | Mode de signature | Implémentation |
|---|---|---|
| **Bail + annexes** | Au choix : (a) impression + signature manuscrite, (b) export PDF → signature via prestataire eIDAS externe (Yousign, DocuSign…) | L'app génère le PDF final « prêt à signer » et affiche un écran de choix expliquant les deux voies. Pas d'intégration API prestataire en V1 (pas de backend), mais l'architecture doit le permettre en V2. |
| **État des lieux** | Signature sur écran (canvas) en présence des deux parties, ou impression | Signature pad intégré. Renforts probatoires obligatoires (voir ci-dessous). |
| **Inventaire mobilier** | Idem EDL | Idem EDL |

**Renforts probatoires pour toute signature sur écran** (obligatoires) :
- Horodatage précis (date/heure locale + ISO 8601) inséré sous chaque signature.
- Mention tapée obligatoire avant signature : nom complet du signataire + case à cocher « Lu et approuvé — je reconnais avoir pris connaissance de l'intégralité du document ».
- Calcul de l'**empreinte SHA-256** du PDF finalisé (via Web Crypto API), affichée sur la dernière page du PDF et dans l'app.
- Écran final « Envoyer une copie » : bouton `mailto:` pré-rempli (le PDF étant local, l'app guide l'utilisateur pour joindre le fichier exporté) + rappel de conserver l'original.
- Verrouillage du document après signature : un EDL signé devient **immuable** dans l'app (lecture seule ; toute correction passe par un avenant daté).

**Disclaimer à afficher dans l'app** (page paramètres + première utilisation) : « Cet outil est une aide à la rédaction. Il ne constitue pas un conseil juridique. Vérifiez les évolutions légales sur service-public.fr. Pour la signature du bail, un prestataire de signature électronique qualifié eIDAS est recommandé. »

---

## 3. Stack technique et contraintes d'architecture

### 3.1 Stack imposée
- **React 18+** avec **Vite** (TypeScript obligatoire).
- **Tailwind CSS** (v3+), aucune autre lib CSS.
- **Aucun backend, aucune API serveur, aucun compte utilisateur.** Tout est local au navigateur.
- **PWA installable** (manifest + service worker via `vite-plugin-pwa`) : fonctionnement 100 % hors-ligne après premier chargement — indispensable pour les EDL sur le terrain.

### 3.2 Persistance des données
- **IndexedDB via Dexie.js** (pas localStorage : les photos dépasseraient vite les quotas).
- Photos stockées en **Blob** dans IndexedDB, compressées à la capture (canvas : max 1600 px de large, JPEG qualité ~0,7 ; conserver les EXIF de date si possible ou stocker la date à part).
- **Export/Import complet** : bouton « Sauvegarde » générant un fichier `.zip` (via `jszip`) contenant un `data.json` (toutes les entités) + un dossier `/photos`. Import = restauration complète avec détection de conflits (proposer « remplacer tout » ou « fusionner par id »). Afficher un rappel de sauvegarde si la dernière export date de plus de 30 jours ou après chaque EDL signé.
- Demander la persistance du stockage au navigateur (`navigator.storage.persist()`).

### 3.3 Génération PDF (côté client)
- Librairie : **`@react-pdf/renderer`** (rendu déclaratif, pagination propre) — alternative acceptée : `pdfmake`. Éviter jsPDF + html2canvas (rendu bitmap flou, pagination fragile).
- Documents à générer : bail meublé complet, inventaire mobilier, EDL entrée, EDL sortie avec tableau comparatif, avenant, lettre de restitution du dépôt de garantie avec décompte.
- Mise en page : en-tête avec référence du document (ex. `EDL-2026-0007`), pied de page avec pagination `x/y` + empreinte SHA-256 (sur version signée), photos intégrées en annexe du PDF (vignettes légendées : pièce, élément, date).

### 3.4 Autres librairies autorisées
- `react-router-dom` (navigation), `react-hook-form` + `zod` (formulaires et validation), `dexie-react-hooks`, `signature_pad` (capture de signature), `date-fns` (dates, locale fr), `jszip`.
- Icônes : `lucide-react`. Pas de lib de composants lourde (pas de MUI) ; construire un petit design system interne avec Tailwind.

### 3.5 Qualité
- TypeScript strict (`strict: true`), aucun `any` non justifié.
- Découpage : `/src/features/{biens,locataires,baux,edl,documents,parametres}`, `/src/lib` (db, pdf, crypto, images), `/src/components/ui`.
- Tests unitaires (Vitest) sur : calculs (prorata, révision IRL, décompte dépôt de garantie), génération du modèle de données EDL comparatif, hachage SHA-256, export/import.

---

## 4. Modèle de données (IndexedDB / Dexie)

```ts
// Identifiants: string (uuid v4). Dates: ISO 8601 string.

interface Bien {
  id: string;
  nom: string;                    // ex. "T2 Chamalières"
  adresse: Adresse;
  type: 'T1'|'T1bis'|'T2'|'T3'|'T4'|'autre';
  surfaceBoutin: number;          // m²
  nbPieces: number;
  etage?: string;
  batiment?: string;
  regimeJuridique: 'copropriete'|'monopropriete';
  equipementsPrivatifs: string[];
  partiesCommunes: string[];
  annexes: { type: 'cave'|'parking'|'grenier'|'autre'; description: string }[];
  chauffage: { type: 'individuel'|'collectif'; energie: string };
  eauChaude: { type: 'individuel'|'collectif'; energie: string };
  zoneEncadrementLoyers: boolean;
  loyerReference?: number;
  loyerReferenceMajore?: number;
  diagnostics: Diagnostic[];      // type, dateRealisation, dateExpiration, fichierJoint? (nom)
  piecesModele: PieceModele[];    // structure par défaut réutilisée pour chaque EDL
  createdAt: string; updatedAt: string;
}

interface PieceModele {
  id: string; nom: string; ordre: number;
  elements: { id: string; nom: string; categorie: CategorieElement }[];
}
type CategorieElement = 'sol'|'mur'|'plafond'|'menuiserie'|'electricite'|'plomberie'|'chauffage'|'equipement'|'mobilier'|'autre';

interface Locataire {
  id: string;
  civilite: 'M'|'Mme';
  nom: string; prenom: string;
  dateNaissance?: string; lieuNaissance?: string;
  email: string; telephone: string;
  adresseActuelle?: string;
  garant?: { nom: string; prenom: string; adresse: string; type: 'physique'|'visale'|'autre' };
  createdAt: string; updatedAt: string;
}

interface Bail {
  id: string;
  reference: string;              // "BAIL-2026-0001", séquence auto
  bienId: string;
  locataireIds: string[];         // colocation possible
  clauseSolidarite: boolean;
  typeBail: 'meuble_1an'|'meuble_etudiant_9mois'|'mobilite';
  dateEffet: string;
  dureeMois: number;              // 12, 9, ou 1-10
  loyerHC: number;
  charges: { mode: 'forfait'|'provisions'; montant: number };
  depotGarantie: number;          // contrôle: <= 2x loyerHC, 0 si mobilité
  jourPaiement: number;           // 1-28
  modePaiement: string;
  revisionIRL: { trimestreReference: string; valeurIndice: number; revisable: boolean };
  complementLoyer?: { montant: number; justification: string };
  dernierLoyerAncienLocataire?: number;
  clausesParticulieres: string[];
  inventaireId?: string;
  edlEntreeId?: string;
  edlSortieId?: string;
  statut: 'brouillon'|'genere'|'signe'|'actif'|'termine';
  dateFinEffective?: string;
  pdfHash?: string;
  createdAt: string; updatedAt: string;
}

interface Inventaire {
  id: string; bailId: string;
  lignes: {
    pieceNom: string; designation: string; quantite: number;
    etat: EtatNote; commentaire?: string;
    obligatoireDecret?: boolean;   // fait partie des 11 éléments du décret 2015-981
  }[];
  signatures?: SignatureBloc;
  statut: 'brouillon'|'signe';
}

type EtatNote = 'neuf'|'tres_bon'|'bon'|'usage'|'mauvais';

interface EtatDesLieux {
  id: string;
  reference: string;              // "EDL-2026-0007"
  bailId: string;
  type: 'entree'|'sortie';
  date: string;
  edlEntreeLieId?: string;        // pour un EDL de sortie: lien vers l'entrée
  nouvelleAdresseLocataire?: string;  // sortie uniquement
  compteurs: { type: 'electricite'|'gaz'|'eau_froide'|'eau_chaude'; numero?: string; releve: number; photoId?: string }[];
  cles: { designation: string; nombre: number; commentaire?: string }[];
  pieces: PieceEDL[];
  observationsGenerales?: string;
  signatures?: SignatureBloc;
  statut: 'brouillon'|'signe';    // signe => immuable
  avenants: { date: string; texte: string; signatures?: SignatureBloc }[];
  pdfHash?: string;
  createdAt: string; updatedAt: string;
}

interface PieceEDL {
  id: string; nom: string; ordre: number;
  elements: {
    id: string; nom: string; categorie: CategorieElement;
    etat: EtatNote; commentaire?: string;
    photoIds: string[];
    // Rempli automatiquement sur un EDL de sortie:
    etatEntree?: EtatNote; commentaireEntree?: string;
    degradation?: boolean;         // calculé: état sortie < état entrée, modifiable manuellement
  }[];
}

interface Photo {
  id: string; blob: Blob; dateCapture: string;
  legende?: string; edlId: string;
}

interface SignatureBloc {
  dateSignature: string;           // ISO, horodatage
  lieu: string;
  bailleur: SignatureItem;
  locataires: SignatureItem[];
}
interface SignatureItem {
  nomComplet: string;              // tapé par le signataire
  luEtApprouve: boolean;
  imageDataUrl: string;            // PNG du canvas
  horodatage: string;
}

interface Parametres {
  bailleur: { civilite: string; nom: string; prenom: string; adresse: string; email: string; telephone: string; siret?: string; qualite: 'personne_physique' };
  grilleVetuste: LigneVetuste[];   // pré-remplie, modifiable
  compteursSequence: { bail: number; edl: number; annee: number };
  derniereSauvegarde?: string;
}
interface LigneVetuste { poste: string; dureeVieAnnees: number; franchiseAnnees: number; abattementAnnuelPct: number }
```

---

## 5. Spécifications fonctionnelles par module

### M1 — Gestion des biens
- CRUD complet des biens avec formulaire multi-étapes (identité du bien → surfaces/équipements → diagnostics → structure des pièces).
- **Éditeur de structure de pièces** (`piecesModele`) : ajout/suppression/réordonnancement de pièces ; chaque pièce reçoit des éléments par défaut selon son type (ex. « Cuisine » → sol, murs, plafond, plaques, four, réfrigérateur, évier, meubles…). Bibliothèque de modèles de pièces intégrée (séjour, chambre, cuisine, SDB, WC, entrée, cave, parking).
- Tableau de bord des diagnostics avec badges de validité (vert/orange < 3 mois de l'expiration/rouge expiré). Durées par défaut : DPE 10 ans, électricité/gaz location 6 ans, ERP 6 mois, CREP illimité si négatif.

### M2 — Gestion des locataires
- CRUD simple. Un locataire peut être lié à plusieurs baux dans le temps.
- RGPD : page paramètres avec bouton « supprimer définitivement un locataire et ses données » (bloqué si un bail actif y est lié), et mention d'information sur la conservation locale des données.

### M3 — Baux
- **Assistant de création en étapes** : bien → locataire(s) → type de bail (avec explication des 3 types et de leurs contraintes) → conditions financières → clauses → annexes (checklist) → aperçu → génération PDF.
- **Validations bloquantes** : dépôt de garantie ≤ 2 mois HC (0 si mobilité) ; durée cohérente avec le type ; si zone d'encadrement activée sur le bien : loyer HC ≤ loyer de référence majoré sauf complément de loyer justifié (alerte explicative).
- Le PDF du bail suit la trame du bail type réglementaire (parties I à VIII : désignation des parties, objet du contrat, date/durée, conditions financières, travaux, garanties, clauses, annexes). Rédiger les clauses en s'appuyant sur le décret 2015-587 sans copier de contenus de sites commerciaux.
- Génération conjointe de l'**inventaire du mobilier** pré-rempli : les 11 postes obligatoires du décret + le mobilier saisi ; alerte si un poste obligatoire est marqué absent.
- Cycle de vie : brouillon → généré → signé (l'utilisateur confirme la signature papier/prestataire et peut saisir la date) → actif → terminé (déclenché par l'EDL de sortie signé).
- Utilitaires : calcul de prorata de premier loyer ; calculateur de révision IRL (saisie manuelle du nouvel indice, l'app calcule le nouveau loyer et génère un courrier PDF de révision).

### M4 — États des lieux (cœur de l'app, optimisé tablette)
**EDL d'entrée**
- Créé depuis un bail ; les pièces sont pré-remplies depuis `piecesModele` du bien, puis modifiables.
- **Mode terrain** : interface plein écran, une pièce à la fois, navigation par onglets/swipe ; pour chaque élément : sélecteur d'état en 5 gros boutons colorés (Neuf / Très bon / Bon / Usagé / Mauvais), champ commentaire, bouton photo (caméra du device via `<input capture>` ou `getUserMedia`), compteur de photos.
- Écrans dédiés : relevés de compteurs (avec photo du compteur) ; remise des clés.
- Barre de progression (éléments renseignés / total). Sauvegarde automatique en continu (chaque changement écrit en IndexedDB — aucune perte si l'appareil s'éteint).

**EDL de sortie**
- Créé depuis le bail : **duplique automatiquement la structure et les états de l'EDL d'entrée** ; pour chaque élément, l'état d'entrée est affiché en référence et l'utilisateur saisit l'état de sortie.
- Marquage automatique `degradation = true` si état sortie < état entrée (ordre : neuf > très bon > bon > usagé > mauvais), avec possibilité de décocher (usure normale).
- **Synthèse comparative** : tableau des éléments dégradés, avec pour chacun : photos entrée/sortie côte à côte, et estimation de retenue = coût de remise en état saisi × coefficient de vétusté calculé depuis la grille (âge de l'équipement à demander ou estimer).
- Génère en option la **lettre de restitution du dépôt de garantie** (PDF) : rappel des délais légaux (1 mois si EDL conforme, 2 mois sinon ; majoration de 10 % du loyer par mois de retard), décompte détaillé des retenues avec justificatifs à joindre.

**Signature (EDL et inventaire)**
- Parcours : relecture obligatoire du récapitulatif → pour chaque signataire : saisie du nom, case « lu et approuvé », signature au doigt/stylet sur canvas (bouton effacer) → horodatage automatique → génération du PDF final → calcul SHA-256 → verrouillage.
- Après signature : écran « Transmettre une copie » (export du PDF + bouton mailto pré-rempli avec objet/texte réglementaire de remise dématérialisée).
- Rappel automatique affiché : « Le locataire dispose de 10 jours pour demander un complément à l'EDL d'entrée » → bouton « créer un avenant » disponible pendant cette fenêtre (et au-delà, avec confirmation).

### M5 — Documents et exports
- Bibliothèque de tous les PDF générés, filtrable par bien/bail/type, avec re-génération possible tant que non signé.
- Numérotation automatique `TYPE-ANNEE-XXXX`.
- Export sauvegarde ZIP / import (cf. §3.2).

### M6 — Tableau de bord
- Vue d'accueil : liste des biens avec statut (loué / vacant), bail en cours, alertes (diagnostic expirant, EDL d'entrée sans bail signé, dépôt de garantie à restituer sous X jours après un EDL de sortie, sauvegarde ancienne).
- Échéancier simple : fins de bail à venir, dates anniversaires de révision IRL.

---

## 6. UX / UI

- **Langue : français intégral** (libellés, dates au format fr, montants en €).
- Mobile-first, cible principale : tablette en mode portrait pour les EDL, desktop pour la rédaction des baux.
- Design sobre et professionnel : fond clair, une couleur d'accent (bleu ardoise ou vert profond), typographie lisible (Inter), gros hit-targets (min 44 px) pour le mode terrain, contrastes AA minimum.
- États vides soignés avec guidage (« Créez votre premier bien pour commencer »).
- Confirmations destructives systématiques ; toasts de confirmation pour les sauvegardes.
- Indicateur visible du mode hors-ligne et de l'état de persistance du stockage.

---

## 7. Lots de développement (ordre imposé)

1. **Lot 0 — Socle** : projet Vite+TS+Tailwind, PWA, routing, layout, design system minimal (Button, Input, Select, Modal, Toast, Badge, Stepper), Dexie + schéma complet, page Paramètres bailleur.
2. **Lot 1 — Biens & Locataires** : CRUD, éditeur de structure de pièces, diagnostics.
3. **Lot 2 — Baux** : assistant, validations, génération PDF bail + inventaire, cycle de vie, calculateurs (prorata, IRL).
4. **Lot 3 — EDL entrée** : mode terrain, photos, compteurs, clés, autosauvegarde, signature + hash + verrouillage, PDF.
5. **Lot 4 — EDL sortie** : duplication comparative, dégradations, vétusté, PDF comparatif, lettre de restitution.
6. **Lot 5 — Finitions** : tableau de bord, alertes, export/import ZIP, avenants, tests, audit hors-ligne (couper le réseau et dérouler un EDL complet).

## 8. Critères d'acceptation globaux

- [ ] Un bail meublé 1 an complet est généré en PDF avec toutes les mentions du §2.1 et l'inventaire pré-rempli des 11 postes obligatoires.
- [ ] Un EDL d'entrée complet (3 pièces, 15 photos, 3 compteurs, clés) est réalisable entièrement hors-ligne, signé sur écran, produit un PDF avec horodatage et empreinte SHA-256, puis devient non modifiable.
- [ ] L'EDL de sortie affiche pour chaque élément l'état d'entrée, détecte les dégradations et produit le tableau comparatif + la lettre de restitution avec décompte.
- [ ] Le dépôt de garantie saisi à 3 mois de loyer est refusé avec message explicite.
- [ ] Export ZIP puis import sur un navigateur vierge : 100 % des données et photos restaurées.
- [ ] Le disclaimer juridique du §2.3 est présent, ainsi que l'écran de choix « signature papier / prestataire eIDAS » pour le bail.
- [ ] Rechargement de l'app en mode avion : elle démarre et toutes les données sont accessibles.

## 9. Hors périmètre V1 (mais l'architecture doit le permettre)

- Intégration API d'un prestataire de signature eIDAS (Yousign/DocuSign) pour le bail.
- Quittances de loyer et suivi des paiements.
- Synchronisation multi-appareils / backend.
- Comptabilité LMNP (amortissements, 2031/2033).