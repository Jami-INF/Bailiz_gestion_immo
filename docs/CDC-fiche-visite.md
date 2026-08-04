# CDC — Fiche de visite (récapitulatif logement + dossier à préparer)

> Complète `README.md` et `docs/DOCUMENTATION_TECHNIQUE.md`. Périmètre : un nouveau document
> généré depuis la fiche d'un **bien**, plus un **modèle éditable dans les Paramètres**.
> Aucune modification du bail, de l'EDL, ni du schéma Dexie (hors champs optionnels).

## 1. Besoin

La visite est le seul moment où bailleur et candidat se parlent avant le dossier. Aujourd'hui
elle se passe **sans support** : les conditions (loyer, charges, dépôt, disponibilité) sont
répétées oralement à chaque candidat, et la liste des pièces du dossier est donnée de mémoire.
Trois conséquences :

1. **Le candidat repart sans rien** : il retient mal le loyer charges comprises, l'étage, la date
   de disponibilité, et surtout ce qu'il doit fournir. Les dossiers arrivent incomplets, en
   plusieurs fois, et la sélection traîne.
2. **Le bailleur improvise** : la liste des pièces exigibles est **limitative** (décret
   n°2015-1437, art. 22-2 de la loi n°89-462). Demander une pièce interdite (RIB, attestation de
   bonne tenue de compte, carte Vitale…) est une faute — de bonne foi, faute de mémo sous la main.
3. **Rien n'est réutilisable** : la même fiche devrait servir pour tous les candidats d'un même
   logement, et d'une relocation à l'autre.

L'objectif : un **document A4 imprimable, remis en main propre à la fin de la visite** (ou envoyé
avant), qui récapitule le logement et ses conditions, rappelle les infos pratiques de la visite,
et liste — sous forme de **cases à cocher** — les pièces du dossier. Le tout à partir d'un
**modèle modifiable dans les réglages**, comme la grille de vétusté.

## 2. Ce qui existe déjà (à réutiliser, ne pas refaire)

| Brique | État |
|---|---|
| Pipeline document annexe | ✅ `genererEtArchiver` (`lib/pdf/generer.ts`) : référence `DOC-ANNEE-XXXX`, rendu, archivage, ouverture |
| Bibliothèque de documents | ✅ `DocumentsPage` filtre par `TYPE_DOCUMENT_LABELS` — un nouveau type y apparaît sans code supplémentaire |
| Composants PDF | ✅ `EntetePdf`, `PiedDePagePdf`, `CaseACocher`, `Rempl`, `pdfStyles` (`lib/pdf/commun.tsx`) |
| Modèle éditable en Paramètres | ✅ Précédent exact : `grilleVetuste` (tableau éditable + « Réinitialiser » + `GRILLE_VETUSTE_DEFAUT`) |
| Données du logement | ✅ `Bien` : adresse, étage, bâtiment, type, surface Boutin, nb pièces, DPE, chauffage, eau chaude, TIC, annexes, copropriété, encadrement des loyers, `dossierTechniqueUrl` |
| Coordonnées du bailleur | ✅ `Parametres.bailleur` (nom, adresse, e-mail, téléphone) |
| Adresse formatée / URL sûre | ✅ `formatAdresse`, `urlExterneSure` |
| Sauvegarde | ✅ `backup.ts` exporte et réimporte `parametres`, `biens` et `photos` en bloc : les nouveaux champs suivent automatiquement |
| Photos en base | ⚠️ `db.photos` (Blob compressé 1600 px / JPEG 0,7) existe, mais `Photo.edlId` est **obligatoire** : une photo ne peut aujourd'hui appartenir qu'à un état des lieux |
| **Conditions financières** | ❌ **Le loyer, les charges et le dépôt n'existent que sur le `Bail`** — un logement vacant n'en a pas. Ils passent sur le `Bien` (§3) |
| Infos d'accès (interphone, code, stationnement) | ❌ N'existent nulle part dans le modèle |
| Photo du logement | ❌ Un bien n'a aucune illustration |

**Conclusion** : tout le socle technique est là. Le travail porte sur **un modèle de contenu
éditable**, **l'enrichissement de la fiche du bien** (conditions de location + photo) et **un
nouveau PDF**.

## 3. Décisions actées

- **Nom** : « Fiche de visite ». Type de document `fiche_visite`.
- **Rattachement** : au **bien**, pas au bail (à la visite, il n'y a pas encore de bail).
  Génération depuis `BienDetailPage`.
- **Deux pages distinctes** : page 1 = logement, conditions, infos pratiques ; page 2 = **dossier
  à préparer**, autonome et détachable (le candidat repart avec, il coche).
- **Contenu du dossier = liste limitative légale** (décret n°2015-1437), livrée pré-remplie et
  **entièrement modifiable dans les Paramètres** (ajout, suppression, réordonnancement, remise à
  zéro), comme la grille de vétusté.
- **Sections conditionnelles** : garant physique / Visale / colocation / étudiant / indépendant
  ne s'impriment que si la situation est cochée à la génération. Une fiche remise à un candidat
  ne doit pas lister des pièces qui ne le concernent pas.
- **Pas de dossier technique sur la fiche** : ni lien, ni QR code vers les diagnostics. Ils sont
  remis en annexe du bail, pas au stade de la visite.
- **Acte de cautionnement joint** dès que la situation « garant personne physique » est retenue,
  pré-rempli avec ce que le logement connaît (§4.3).
- **Aucune donnée de candidat n'est saisie ni stockée** : la fiche est un document vierge remis
  à qui veut. Pas de gestion de candidatures dans ce lot (cf. §8).
- **Les conditions de location passent sur le `Bien`** (`conditionsLocation` : loyer HC, charges,
  dépôt, disponibilité, accès, conditions particulières). C'est la **source unique** :
  - la fiche de visite les lit directement — plus rien à ressaisir à chaque candidat ;
  - le **formulaire de bail les pré-remplit** dès qu'un bien enregistré est choisi (sans jamais
    écraser une valeur déjà saisie) ;
  - **l'enregistrement d'un bail les met à jour** sur le bien : le loyer bougeant peu, la fiche
    reste juste sans entretien particulier.
- **Une photo du logement** (`Bien.photoId`) est ajoutée à la fiche du bien : elle illustre la
  page 1 de la fiche de visite et la fiche du bien dans l'app. Une seule photo, remplaçable,
  compressée comme les photos d'EDL. Cela impose de **détacher `Photo` de l'EDL** (`edlId`
  devient optionnel, `bienId` apparaît).
- **La date et l'heure de visite ne sont jamais mémorisées** : elles changent à chaque visite.

## 4. Spécifications

### 4.1 Contenu du PDF — page 1 : le logement

Titre : **« Fiche de visite »**, sous-titre = nom du bien. Chaque bloc est **omis proprement s'il
est vide** (jamais de libellé suivi d'un tiret orphelin) ; les blocs marqués (opt) sont pilotés
par les interrupteurs du modèle (§4.2).

**a) Photo du logement** — si `Bien.photoId` est renseigné : image en pleine largeur sous le
titre, hauteur fixe, cadrage `objectFit: cover` (une photo portrait ne doit pas pousser tout le
reste en page 2). Absente = aucun cadre vide, la fiche commence directement au descriptif.

**b) Le logement**
- Adresse complète (`formatAdresse`), **bâtiment** et **étage** mis en avant.
- Type (T1/T2…), **surface loi Boutin** en m², nombre de pièces principales.
- **Meublé** — mention explicite « logement loué meublé, équipé conformément au décret
  n°2015-981 » (l'app ne fait que du meublé).
- Chauffage (type + énergie), eau chaude (type + énergie).
- **Classe DPE** + rappel de décence si D à G (« G : location interdite depuis 2025 ; F : 2028 ;
  E : 2034 ») — information factuelle, pas d'alarme.
- Accès aux technologies (`equipementsTIC`) si renseigné.
- **Annexes** : cave, parking, grenier (type + description) — ce qui se visite aussi.
- Régime : copropriété ou monopropriété.
- Équipements privatifs / parties communes si renseignés (listes courtes, en ligne).

**c) Conditions de location** (opt) — lues sur `Bien.conditionsLocation`
- Loyer hors charges, **charges** (forfait ou provisions) et **total charges comprises**, calculé.
- **Ce que couvrent les charges** (texte libre : eau froide, ordures ménagères, entretien des
  parties communes, chauffage collectif…).
- **Dépôt de garantie** (avec rappel « restitué sous 1 mois si l'état des lieux de sortie est
  conforme à celui d'entrée, 2 mois sinon » ; « aucun dépôt en bail mobilité »).
- Type de bail et durée (`TYPE_BAIL_LABELS`), **date de disponibilité**.
- Jour et mode de paiement s'ils sont renseignés.
- **Assurance habitation obligatoire** du locataire, attestation exigible à la remise des clés.
- **Aucuns frais d'agence ni honoraires** : bailleur particulier, location en direct.
- **Zone d'encadrement des loyers** (si `zoneEncadrementLoyers`) : loyer de référence, loyer de
  référence majoré, et complément de loyer éventuel — mentions dues au candidat.
- **Conditions particulières** (texte libre : animaux, non-fumeur, jardin partagé…).

**d) Informations pratiques de la visite** (opt)
- **Date et heure** de la visite, durée estimée.
- **Comment venir / accès** : code d'entrée ou interphone, digicode, étage, ascenseur,
  stationnement, transports — texte libre par bien.
- **À apporter** : pièce d'identité, de quoi noter, et le dossier s'il est déjà prêt
  (texte du modèle, modifiable).
- **Contact du bailleur** (opt) : nom, téléphone, e-mail — repris de `Parametres.bailleur`.
- **Pas de dossier technique** : ni lien, ni QR code. Les diagnostics (DPE, ERP, CREP…) sont
  remis plus tard, en annexe du bail, pas au stade de la visite — décision du bailleur.

### 4.2 Contenu du PDF — page 2 : le dossier à préparer

Titre : **« Votre dossier de candidature — pièces à préparer »**. Nouvelle page
(`break`), pour être détachée et remise telle quelle.

- **Texte d'introduction** (modèle) : à quoi sert le dossier, sous quelle forme le transmettre.
- **Sections de pièces**, chacune avec un titre, une note (« une seule pièce parmi celles-ci »,
  « toutes les pièces de cette liste ») et des **cases à cocher** (`CaseACocher`), une par pièce,
  avec une précision facultative en petit.
- **Modalités de candidature** (modèle, texte libre) : à qui envoyer, sous quel format, quel
  délai de réponse, ce qui se passe ensuite (bail → état des lieux → remise des clés).
- **Mentions** (modèle) : non-discrimination (art. 1 de la loi n°2008-496), traitement des
  données personnelles (dossiers non retenus détruits, aucun fichier conservé), et le
  disclaimer habituel de l'app en pied de page.

#### Contenu par défaut de la liste (`MODELE_FICHE_VISITE_DEFAUT`)

Fidèle au décret n°2015-1437. `[cond:…]` = section conditionnelle.

**1. Pièce d'identité** — *une seule, en cours de validité, avec photographie*
- Carte nationale d'identité (recto-verso) — française ou étrangère
- Passeport (pages d'identité)
- Permis de conduire
- Carte de séjour temporaire, carte de résident, carte de ressortissant d'un État de l'UE/EEE

**2. Justificatif de domicile** — *une seule pièce*
- Trois dernières quittances de loyer
- À défaut : attestation du précédent bailleur (loyer et charges payés)
- À défaut : attestation d'hébergement + pièce d'identité de l'hébergeant
- Dernier avis de taxe foncière ou titre de propriété (si propriétaire)

**3. Justificatif d'activité professionnelle** — *une seule pièce, selon la situation*
- Contrat de travail ou de stage, ou attestation de l'employeur (poste, rémunération, date
  d'embauche, période d'essai)
- Carte d'étudiant ou certificat de scolarité pour l'année en cours
- Extrait K ou Kbis de moins de 3 mois (entreprise), ou carte professionnelle (profession
  libérale), ou avis de situation SIRENE de moins de 3 mois (auto-entrepreneur)
- Arrêté de nomination (fonctionnaire)
- Carte d'identité professionnelle (profession réglementée)

**4. Justificatifs de ressources** — *toutes les pièces qui vous concernent*
- Trois derniers bulletins de salaire
- Dernier ou avant-dernier avis d'imposition (toutes pages)
- Deux derniers bilans, ou attestation de ressources d'un comptable (indépendant)
- Justificatifs de versement des indemnités, retraites, pensions ou prestations sociales des
  trois derniers mois
- Attestation de droits CAF / simulation d'APL, si vous en bénéficiez
- Avis d'attribution de bourse (étudiant) `[cond:etudiant]`
- Justificatif de revenus fonciers, de rentes ou de valeurs mobilières

**5. Votre garant** `[cond:garant_physique]` — *les mêmes pièces que ci-dessus, à son nom*
- Pièce d'identité en cours de validité
- Justificatif de domicile
- Justificatif d'activité professionnelle
- Justificatifs de ressources
- L'acte de cautionnement vous sera remis à la signature (rien à rédiger de votre côté)

**6. Garantie Visale** `[cond:visale]` — *dispense de garant physique*
- Numéro de visa certifié Visale, en cours de validité (obtenu gratuitement sur visale.fr)
- Vérifiez la date de fin de validité du visa : 3 mois (6 mois pour les étudiants, alternants
  et volontaires en service civique)

**7. Colocation** `[cond:colocation]`
- Chaque colocataire constitue un dossier complet, garant compris
- Le bail est signé par tous, avec clause de solidarité

**8. À prévoir pour la signature** — *pas pour la candidature*
- Attestation d'assurance habitation (risques locatifs), au plus tard à la remise des clés
- Moyen de paiement du premier loyer et du dépôt de garantie
- Un RIB **uniquement** si vous choisissez le prélèvement, et à votre initiative

**Bloc « ce que le bailleur ne peut pas vous demander »** (art. 22-2) : photographie d'identité
(hors document d'identité), carte Vitale ou attestation de sécurité sociale, copie de relevé de
compte bancaire, attestation de bonne tenue de compte, attestation d'absence de crédit,
autorisation de prélèvement automatique, contrat de mariage, certificat de concubinage, jugement
de divorce (hors extrait fixant la pension), dossier médical, extrait de casier judiciaire, chèque
de réservation, plus de deux bilans, attestation de l'employeur si contrat et bulletins sont déjà
fournis.

**Texte par défaut des modalités** : transmission par e-mail en un seul PDF ou par
[DossierFacile](https://www.dossierfacile.logement.gouv.fr) (service public gratuit, dossier
certifié) ; réponse sous X jours ; en cas d'accord, signature du bail puis état des lieux d'entrée
à la remise des clés.

### 4.3 Page jointe — acte de cautionnement (garant personne physique)

Si la situation **« garant personne physique »** est retenue à la génération, l'**acte de
cautionnement solidaire** (art. 22-1 de la loi n°89-462) est joint à la fiche, après le dossier :
le candidat repart avec le document que son garant doit remplir, sans échange supplémentaire.

- Rendu par `ActeCautionnementPage`, la page de l'acte **isolée de son `Document`** pour être
  réutilisable ; `ActeCautionnementPdf` (fiche du bail) l'enveloppe et reste inchangé.
- **Pré-remplissage avec ce que l'on connaît à ce stade** : bailleur (nom et adresse), adresse du
  logement, loyer hors charges, charges et total mensuel — y compris en toutes lettres.
- **Restent en zones pointillées** : identité et adresse du garant, nom du locataire, durée du
  bail. Elles ne sont pas connues à la visite et se complètent à la main.
- La section « garant » du dossier annonce la pièce jointe (« acte de cautionnement, joint à
  cette fiche »), et non plus « remis à la signature ».
- Ne concerne **pas** la garantie Visale : le contrat de cautionnement y est émis par Action
  Logement. Cocher « Visale » n'ajoute donc aucune page.

### 4.4 Les conditions de location, portées par le bien

**Formulaire du bien** (`BienFormPage`) : nouvelle étape **« Location & visite »**, insérée entre
« Dossier technique » et « Pièces » (les étapes passent de 4 à 5) :

- loyer hors charges, charges (forfait / provisions + montant), **total CC affiché en direct** ;
- dépôt de garantie, avec rappel du plafond de 2 mois de loyer HC (avertissement non bloquant,
  comme dans le formulaire de bail) ;
- date de disponibilité ;
- détail de ce que couvrent les charges (texte libre) ;
- accès et stationnement (texte libre, imprimé sur la fiche de visite) ;
- conditions particulières (texte libre).

**Photo du logement** : ajoutée à l'étape « Identité », sous le nom du bien. Sélection depuis la
galerie ou l'appareil photo, compression via `compresserImage` (1600 px / JPEG 0,7), vignette avec
remplacement et suppression. Une seule photo par bien ; remplacer supprime l'ancienne de
`db.photos` (pas de Blob orphelin).

**Pré-remplissage du bail** (`BailRapidePage`) : dès qu'un bien enregistré est choisi (menu
déroulant, création rapide, ou arrivée depuis la fiche du bien), les champs **vides** du
formulaire — loyer HC, charges, dépôt — sont remplis depuis `conditionsLocation`. Une valeur déjà
saisie n'est **jamais** écrasée.

**Retour d'information** : à l'enregistrement d'un bail portant sur un bien enregistré, les
`conditionsLocation` du bien sont mises à jour (loyer, charges, dépôt) dans la **même transaction**
que l'écriture du bail. Les textes libres (accès, détail des charges…) ne sont pas touchés.

### 4.5 Génération de la fiche — depuis la fiche du bien

Nouvelle carte **« Fiche de visite »** dans `BienDetailPage` → modale courte, puisque les
conditions viennent désormais du bien :

| Champ | Pré-remplissage |
|---|---|
| Date et heure de visite | Aujourd'hui / heure vide — **jamais mémorisées** |
| Situations à inclure (garant physique, Visale, colocation, étudiant, indépendant) | `conditionsLocation.situations`, sinon garant physique seul |

- Rappel en lecture seule des conditions du bien (loyer CC, dépôt, disponibilité) avec un lien
  « Modifier la fiche du bien » : on voit ce qui sera imprimé sans pouvoir le désynchroniser.
- Les champs non renseignés sur le bien deviennent des **zones pointillées** (`Rempl` en mode
  brouillon) : la fiche s'imprime et se complète à la main, comme le bail.
- « Générer la fiche » → `genererEtArchiver({ type: 'fiche_visite', bienId })`, titre
  « Fiche de visite — {nom du bien} », archivage dans la bibliothèque, ouverture immédiate.
  Les situations cochées sont mémorisées sur le bien.
- Régénérer écrase la version non signée de même référence — comportement déjà assuré par
  `enregistrerDocument`.
- La carte affiche la date de la dernière fiche générée pour ce bien, s'il y en a une.

### 4.6 Réglages — modèle éditable

Nouvelle carte **« Fiche de visite »** dans `ParametresPage`, sous la grille de vétusté (même
ergonomie : édition sur `onBlur`, écriture directe dans `db.parametres`, pas de bouton
« Enregistrer » séparé).

- **Blocs à imprimer** : trois interrupteurs (conditions financières, informations pratiques,
  coordonnées du bailleur).
- **Textes libres** : introduction du dossier, modalités de candidature, à apporter à la visite,
  mentions légales — quatre zones de texte multi-ligne.
- **Sections de pièces** : liste ordonnée ; par section → titre, note, condition (menu :
  toujours / garant physique / Visale / colocation / étudiant / indépendant), monter/descendre,
  supprimer, ajouter une section ; par pièce → libellé, précision, activer/désactiver, supprimer,
  ajouter une pièce.
- **« Réinitialiser le modèle par défaut »**, avec `ConfirmModal` (l'action écrase la
  personnalisation).
- **« Aperçu (PDF) »** : rend la fiche avec un bien fictif d'exemple, sans rien archiver
  (`telecharger: false` n'est pas suffisant → appel direct à `rendrePdf` + `ouvrirBlob`).
- Une phrase d'avertissement sous la liste : « la liste des pièces exigibles est limitative
  (décret n°2015-1437) : n'ajoutez pas de pièce qui n'y figure pas ».

### 4.7 Modèle de données

Dans `types.ts` :

```ts
export interface PieceDossier {
  id: string;
  libelle: string;
  /** Ligne secondaire en petit sous le libellé. */
  precision?: string;
  actif: boolean;
}

export type ConditionSection =
  | 'toujours' | 'garant_physique' | 'visale' | 'colocation' | 'etudiant' | 'independant';

export interface SectionDossier {
  id: string;
  titre: string;
  /** Note sous le titre : « une seule pièce parmi celles-ci ». */
  note?: string;
  condition: ConditionSection;
  pieces: PieceDossier[];
}

export interface ModeleFicheVisite {
  introDossier: string;
  modalitesCandidature: string;
  aApporter: string;
  mentions: string;
  sections: SectionDossier[];
  blocs: {
    conditionsFinancieres: boolean;
    infosPratiques: boolean;
    coordonneesBailleur: boolean;
  };
}

/**
 * Conditions de location annoncées : portées par le **bien** (elles évoluent peu
 * et survivent aux locataires successifs), pré-remplissent le bail et sont mises
 * à jour à son enregistrement.
 */
export interface ConditionsLocation {
  loyerHC?: number;
  charges?: { mode: 'forfait' | 'provisions'; montant?: number };
  chargesDetail?: string;
  depotGarantie?: number;
  dateDisponibilite?: string;
  /** Accès, interphone, étage, stationnement — imprimé sur la fiche de visite. */
  acces?: string;
  conditionsParticulieres?: string;
  /** Sections conditionnelles retenues à la dernière génération. */
  situations?: ConditionSection[];
}
```

- `Parametres.ficheVisite?: ModeleFicheVisite`
- `Bien.conditionsLocation?: ConditionsLocation`
- `Bien.photoId?: string`
- `Photo.edlId?: string` (devient **optionnel**) et `Photo.bienId?: string`
- `TypeDocument` += `'fiche_visite'` ; `TYPE_DOCUMENT_LABELS.fiche_visite = 'Fiche de visite'`
- `MODELE_FICHE_VISITE_DEFAUT` dans `lib/defauts.ts` (§4.2)

**Migrations**

- **Dexie v3** : `photos: 'id, edlId, bienId'`. Aucune donnée à transformer (index ajouté ; les
  clés `undefined` sont simplement absentes de l'index, ce qui laisse
  `db.photos.where('edlId')` intact pour l'EDL et la RGPD).
- **Paramètres** : `ficheVisite` est optionnel, mais `getParametres()` doit **normaliser** — un
  utilisateur existant n'a pas le champ, et les pages ne doivent pas gérer ce cas partout.
  `getParametres` complète l'objet lu avec les défauts manquants (un seul endroit, testé). La
  restauration de sauvegarde (`backup.ts:181`) repasse par cette normalisation à la lecture
  suivante.
- **Suppression d'un bien** : sa photo est supprimée de `db.photos` (pas de Blob orphelin).
  Une photo de bien n'est **pas** une donnée de locataire : `lib/rgpd.ts` reste inchangé.

### 4.8 Fichiers touchés

| Fichier | Nature |
|---|---|
| `src/types.ts` | + types ci-dessus, + `fiche_visite`, `Photo.edlId` optionnel |
| `src/lib/defauts.ts` | + `MODELE_FICHE_VISITE_DEFAUT`, + `PIECES_INTERDITES` |
| `src/lib/db.ts` | version 3 (index `photos.bienId`) + normalisation dans `getParametres` |
| `src/lib/pdf/FicheVisitePdf.tsx` | **nouveau** |
| `src/lib/pdf/ActeCautionnementPdf.tsx` | extraction de `ActeCautionnementPage` (page réutilisable) + espacement des montants |
| `src/lib/calculs.ts` | `formatEuros` : espace de largeur nulle finale (espace avalée après « € ») |
| `src/features/biens/PhotoBien.tsx` | **nouveau** (upload, compression, remplacement) |
| `src/features/biens/FicheVisiteModal.tsx` | **nouveau** (date/heure + situations) |
| `src/features/biens/BienFormPage.tsx` | + photo (étape 1), + étape « Location & visite » |
| `src/features/biens/BienDetailPage.tsx` | + photo, + carte conditions, + carte « Fiche de visite », suppression de la photo avec le bien |
| `src/lib/pdf/bailRapide.ts` | + `appliquerConditionsBien`, + `conditionsDepuisSaisie` |
| `src/features/baux/BailRapidePage.tsx` | pré-remplissage depuis le bien + mise à jour du bien à l'enregistrement |
| `src/features/parametres/FicheVisitePanel.tsx` | **nouveau**, monté dans `ParametresPage` |
| `README.md` | + fonctionnalité, + arborescence |

## 5. Contraintes

- **Aucune donnée nominative de candidat** n'est saisie, affichée ni stockée : la fiche est
  vierge. Rien à purger côté RGPD, rien à ajouter à `lib/rgpd.ts`.
- **Conformité** : la liste par défaut ne doit contenir **que** des pièces du décret
  n°2015-1437. L'utilisateur peut en ajouter (liberté d'édition), mais l'avertissement du §4.4
  doit être présent.
- **Le document n'est pas un contrat** : aucune signature, aucun hachage SHA-256, jamais
  `signe: true`. Il reste régénérable à volonté, comme le bail.
- **Impression** : A4, marges de `pdfStyles.page` inchangées. Le logement tient sur la page 1 ;
  le dossier **commence toujours sur une nouvelle page**, pour être détaché et remis tel quel.
  La liste complète occupe 2 à 3 pages selon les situations retenues — c'est assumé. Une section
  peut se couper d'une page à l'autre (sinon une demi-page reste blanche), mais **jamais juste
  après son titre** (`minPresenceAhead`) ni au milieu d'une pièce (`wrap={false}` par pièce).
- **Hors-ligne** : aucune ressource réseau (ni police distante, ni image externe).
- **Pas de régression sur les Paramètres** : la page est déjà dense ; la carte « Fiche de visite »
  est extraite dans son propre composant, comme `SauvegardeAutoPanels`.
- **Sauvegarde** : le modèle voyage dans `parametres` (export/import déjà en place) ;
  `Bien.conditionsLocation` et `Bien.photoId` voyagent dans `biens`, la photo elle-même dans
  `photos` (déjà exportée). Vérifier qu'un import de sauvegarde **antérieure** (sans ces champs)
  reste lisible.

## 6. Découpage

| Lot | Contenu | Vérification |
|---|---|---|
| **L1** | Types + `MODELE_FICHE_VISITE_DEFAUT` + Dexie v3 + normalisation `getParametres` | Test unitaire : paramètres anciens (sans `ficheVisite`) → modèle par défaut complété, personnalisation existante préservée ; photo sans `edlId` acceptée |
| **L2** | `FicheVisitePdf` (pages 1 et 2, photo, blocs conditionnels, zones à compléter) | Test de rendu + PDF **contrôlé visuellement** : bien complet, bien quasi vide, sans photo ni QR, toutes situations cochées / aucune |
| **L3** | Photo du bien (`PhotoBien`) + étape « Location & visite » + affichage sur `BienDetailPage` | Ajout, remplacement, suppression d'une photo ; aucun Blob orphelin après suppression du bien |
| **L4** | Pré-remplissage du bail depuis le bien + mise à jour du bien à l'enregistrement | Tests unitaires `appliquerConditionsBien` (ne écrase pas une valeur saisie) ; parcours réel bien → bail → retour sur la fiche du bien |
| **L5** | Modale de génération + carte dans `BienDetailPage` | Parcours réel : génération, situations mémorisées, présence dans la bibliothèque de documents |
| **L6** | Panneau Paramètres (blocs, textes, sections, réinitialisation, aperçu) | Ajout/suppression/réordonnancement d'une section, réinitialisation, aperçu conforme |
| **L7** | README + relecture des mentions légales de la page 2 | Relecture croisée décret n°2015-1437 / art. 22-2 |

## 7. Critères d'acceptation

- [x] La fiche du bien porte un **loyer, des charges, un dépôt et une date de disponibilité**,
      saisis à l'étape « Location & visite ».
- [x] Choisir un bien enregistré dans le formulaire de bail **pré-remplit** loyer, charges et
      dépôt, sans écraser une valeur déjà saisie ; enregistrer le bail **met à jour** le bien.
      *(pré-remplissage vérifié dans l'app ; mise à jour couverte par `conditionsDepuisBail`,
      parcours de bout en bout à refaire sur des données réelles.)*
- [x] Une **photo** peut être ajoutée, remplacée et supprimée sur la fiche du bien ; elle
      s'affiche dans l'app et en tête de la fiche de visite. Supprimer le bien supprime sa photo.
- [x] Depuis un bien, « Fiche de visite » ouvre une modale courte et génère un PDF de 2 pages.
- [x] La page 1 rappelle l'adresse complète (bâtiment, étage), les caractéristiques, les
      conditions financières avec **total charges comprises calculé**, et les infos de visite.
- [x] Un champ non renseigné apparaît en **zone pointillée**, jamais en libellé vide ou « — ».
- [x] La page 2 liste les pièces en cases à cocher ; les sections « garant physique », « Visale »,
      « colocation », « étudiant », « indépendant » n'apparaissent **que** si cochées.
- [x] Le bloc « ce que le bailleur ne peut pas vous demander » est présent par défaut et
      désactivable depuis les Paramètres.
- [x] Les Paramètres permettent d'ajouter, modifier, réordonner, désactiver et supprimer sections
      et pièces, d'éditer les quatre textes libres, et de tout réinitialiser (avec confirmation).
- [x] Les modifications du modèle sont **immédiatement** reflétées dans la fiche suivante.
- [x] Un utilisateur existant (paramètres sans `ficheVisite`) obtient le modèle par défaut sans
      erreur ; un import de sauvegarde antérieure reste lisible.
- [x] La fiche apparaît dans la bibliothèque de documents, filtrable sur « Fiche de visite »,
      rattachée au bien, non signée.
- [x] La fiche ne contient **aucun renvoi au dossier technique** (ni lien, ni QR code).
- [x] Cocher « garant personne physique » joint l'acte de cautionnement pré-rempli (bailleur,
      adresse, loyer, charges) ; cocher « Visale » ne joint rien.
- [x] `npm run lint`, `npm test` et `npm run build` sortent en code 0.

## 8. Hors périmètre

- Gestion des candidatures : saisie des candidats, comparatif, scoring, statut, relances.
- Planification de créneaux de visite, envoi d'e-mails ou de SMS, export d'agenda.
- Import ou vérification d'un dossier (DossierFacile, pièces jointes) — seul le **lien** est cité.
- Annonce de location (portails, photos, texte d'annonce) : ce document est remis en visite, il
  n'est pas une annonce publiée.
- Calcul de solvabilité (règle des 3 fois le loyer) : appréciation du bailleur, hors de l'outil.
- Signature électronique de la fiche : elle n'engage personne.
