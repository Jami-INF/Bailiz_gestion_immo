// Modèle de données Bailiz - identifiants: uuid v4 (string), dates: ISO 8601 (string).

export interface Adresse {
  ligne1: string;
  ligne2?: string;
  codePostal: string;
  ville: string;
}

export type TypeBien = 'T1' | 'T1bis' | 'T2' | 'T3' | 'T4' | 'autre';

export type CategorieElement =
  | 'sol'
  | 'mur'
  | 'plafond'
  | 'menuiserie'
  | 'electricite'
  | 'plomberie'
  | 'chauffage'
  | 'equipement'
  | 'mobilier'
  | 'autre';

export interface ElementModele {
  id: string;
  nom: string;
  categorie: CategorieElement;
  /** Quantité de référence (mobilier). */
  quantite?: number;
  /** Fait partie des 11 postes obligatoires du meublé (décret n°2015-981). */
  obligatoireDecret?: boolean;
}

export interface PieceModele {
  id: string;
  nom: string;
  ordre: number;
  elements: ElementModele[];
}

export type PeriodeConstruction =
  | 'avant_1949'
  | '1949_1974'
  | '1975_1989'
  | '1990_2005'
  | 'apres_2005';

export type ClasseDPE = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface Bien {
  id: string;
  nom: string; // ex. "T2 Chamalières"
  adresse: Adresse;
  type: TypeBien;
  surfaceBoutin: number; // m²
  nbPieces: number;
  etage?: string;
  batiment?: string;
  /** N° à 12 chiffres (impots.gouv.fr > Gérer mes biens immobiliers). Mention obligatoire du bail depuis le 01/01/2024 (décret 2023-796). */
  identifiantFiscal?: string;
  typeHabitat?: 'collectif' | 'individuel';
  periodeConstruction?: PeriodeConstruction;
  /** Classe du DPE - mention légale ; conditionne la décence (G interdit depuis 2025, F en 2028, E en 2034). */
  classeDPE?: ClasseDPE;
  /** Accès aux technologies de l'information (fibre, TV, internet) - rubrique II.E du bail type. */
  equipementsTIC?: string;
  /** Zone tendue : loyer soumis au décret annuel d'encadrement de l'évolution des loyers à la relocation. */
  zoneTendue?: boolean;
  regimeJuridique: 'copropriete' | 'monopropriete';
  equipementsPrivatifs: string[];
  partiesCommunes: string[];
  annexes: { type: 'cave' | 'parking' | 'grenier' | 'autre'; description: string }[];
  chauffage: { type: 'individuel' | 'collectif'; energie: string };
  eauChaude: { type: 'individuel' | 'collectif'; energie: string };
  zoneEncadrementLoyers: boolean;
  loyerReference?: number;
  loyerReferenceMajore?: number;
  /** Lien vers le dossier technique en ligne (Drive, cloud…) regroupant le DDT : un QR code vers cette URL est ajouté au bail. */
  dossierTechniqueUrl?: string;
  /**
   * Logement situé dans un secteur où le PLU impose l'usage exclusif de
   * résidence principale (art. L.151-14-1 du code de l'urbanisme, créé par la
   * loi n°2024-1039). Mention à porter au bail et motif facultatif de clause
   * résolutoire depuis le décret n°2026-596.
   */
  servitudeResidencePrincipale?: boolean;
  /**
   * Conditions qui déterminent le contenu du dossier de diagnostic technique
   * annexé au bail. `undefined` = information non renseignée : la pièce reste
   * listée avec sa condition, pour ne pas l'oublier (cf. `annexesParDefaut`).
   */
  installationGazPlusDe15Ans?: boolean;
  installationElectriquePlusDe15Ans?: boolean;
  /** Commune ou secteur concerné par un PPR, un zonage sismique, radon, un SIS… */
  zoneRisquesERP?: boolean;
  /** Logement situé dans une zone d'exposition au bruit d'un aérodrome (PEB). */
  zoneBruitAerodrome?: boolean;
  /**
   * Compteurs du logement et leurs numéros (PDL / PCE / n° de série). Ils sont
   * propres au logement et ne changent pas d'un locataire à l'autre : saisis une
   * fois, ils pré-remplissent chaque état des lieux, seuls les relevés varient.
   */
  compteurs?: { type: TypeCompteur; numero?: string }[];
  /**
   * Photo d'illustration du logement (id dans `db.photos`) : affichée sur la
   * fiche du bien et en tête de la fiche de visite. Une seule, remplaçable.
   */
  photoId?: string;
  /**
   * Conditions de location annoncées. Portées par le **bien** et non par le bail
   * : elles évoluent peu et survivent aux locataires successifs. Elles
   * pré-remplissent le formulaire de bail et sont mises à jour à son
   * enregistrement ; la fiche de visite les lit directement.
   */
  conditionsLocation?: ConditionsLocation;
  piecesModele: PieceModele[];
  createdAt: string;
  updatedAt: string;
}

export interface ConditionsLocation {
  loyerHC?: number;
  charges?: { mode: 'forfait' | 'provisions'; montant?: number };
  /** Ce que couvrent les charges (eau froide, ordures ménagères, entretien…). */
  chargesDetail?: string;
  depotGarantie?: number;
  dateDisponibilite?: string;
  /** Accès, interphone, étage, stationnement - imprimé sur la fiche de visite. */
  acces?: string;
  conditionsParticulieres?: string;
  /** Sections conditionnelles retenues à la dernière fiche de visite générée. */
  situations?: ConditionSection[];
}

export interface Garant {
  nom: string;
  prenom: string;
  adresse: string;
  type: 'physique' | 'visale' | 'autre';
  /**
   * Garantie Visale uniquement : numéro du visa certifié délivré par le
   * locataire sur visale.fr (valable 3 mois, 6 pour étudiants/alternants/
   * service civique), à activer par le bailleur sur son espace visale.fr
   * avant la signature du bail. Le contrat de cautionnement est alors émis
   * par Action Logement, sans acte à rédiger par le bailleur.
   */
  numeroVisa?: string;
}

export interface Locataire {
  id: string;
  civilite: 'M' | 'Mme';
  nom: string;
  prenom: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  email: string;
  telephone: string;
  adresseActuelle?: string;
  garant?: Garant;
  createdAt: string;
  updatedAt: string;
}

export type TypeBail = 'meuble_1an' | 'meuble_etudiant_9mois' | 'mobilite';

export type StatutBail = 'brouillon' | 'genere' | 'signe' | 'actif' | 'termine';

export interface Bail {
  id: string;
  reference: string; // "BAIL-2026-0001", séquence auto
  bienId: string;
  locataireIds: string[]; // colocation possible
  clauseSolidarite: boolean;
  typeBail: TypeBail;
  dateEffet: string;
  dureeMois: number; // 12, 9, ou 1-10
  loyerHC: number;
  charges: { mode: 'forfait' | 'provisions'; montant: number };
  depotGarantie: number; // contrôle: <= 2x loyerHC, 0 si mobilité
  jourPaiement: number; // 1-28
  modePaiement: string;
  revisionIRL: { trimestreReference: string; valeurIndice: number; revisable: boolean };
  /**
   * Révisions annuelles du loyer effectivement demandées, dans l'ordre où elles
   * ont été notifiées. Le loyer courant s'en déduit (`loyerCourant`) - `loyerHC`
   * reste le loyer d'origine, celui du contrat imprimé et signé, pour que le
   * bail se régénère à l'identique. Absent = aucune révision notifiée.
   */
  revisionsLoyer?: RevisionLoyer[];
  complementLoyer?: { montant: number; justification: string };
  dernierLoyerAncienLocataire?: number;
  /**
   * @deprecated La clause résolutoire pour défaut de paiement est **obligatoire**
   * depuis la loi n°2023-668 du 27 juillet 2023 : elle est désormais toujours
   * imprimée. Champ conservé pour relire les baux enregistrés auparavant.
   */
  clauseResolutoire?: boolean;
  /**
   * Motif facultatif de résiliation de plein droit ouvert par le décret
   * n°2026-596 : non-respect de l'obligation de résidence principale, lorsque le
   * logement est soumis à la servitude de l'art. L.151-14-1 du code de l'urbanisme.
   */
  resiliationResidencePrincipale?: boolean;
  /**
   * Conditions générales d'occupation retenues pour ce bail, **copiées** depuis
   * le modèle des Paramètres à l'enregistrement. La copie (et non une simple
   * référence) garantit qu'un bail imprimé et signé se régénère à l'identique,
   * même si le modèle évolue ensuite. Absent = bail antérieur à cette
   * fonctionnalité : aucune condition générale n'est imprimée.
   */
  clauses?: ClauseBail[];
  /** Colocation : assurance pour le compte des colocataires souscrite par le bailleur (récupérable par douzième). */
  assuranceColocataires?: { montantAnnuel: number };
  /** Rubrique V du bail type - laisser vide pour « néant ». */
  travaux?: {
    depuisDernierBail?: string; // V.A : amélioration / mise en conformité depuis le dernier bail (nature + montant)
    majorationBailleur?: string; // V.B : majoration de loyer suite à travaux du bailleur
    diminutionLocataire?: string; // V.C : diminution de loyer suite à travaux du locataire
  };
  clausesParticulieres: string[];
  annexesChecklist: AnnexeChecklistItem[];
  /** @deprecated Hérité : l'inventaire est intégré à l'EDL depuis la fusion. */
  inventaireId?: string;
  edlEntreeId?: string;
  edlSortieId?: string;
  statut: StatutBail;
  dateSignature?: string;
  /** Renseigné si le bail a été signé sur écran dans l'app (sinon papier/eIDAS). */
  signatures?: SignatureBloc;
  dateFinEffective?: string;
  pdfHash?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Révision annuelle du loyer selon l'IRL, telle qu'elle a été notifiée au
 * locataire. Conservée intégralement : le courrier suivant repart de cet indice
 * et de ce loyer, et l'historique justifie le loyer courant en cas de litige.
 */
export interface RevisionLoyer {
  /** Date de la demande (génération du courrier). */
  date: string;
  /** Date à laquelle le loyer révisé s'applique - jamais rétroactive. */
  dateApplication: string;
  /** Trimestre et indice de référence retenus comme base du calcul. */
  trimestreReference: string;
  indiceReference: number;
  /** Trimestre et indice nouvellement publiés par l'INSEE. */
  nouveauTrimestre: string;
  nouvelIndice: number;
  ancienLoyer: number;
  nouveauLoyer: number;
}

export interface AnnexeChecklistItem {
  id: string;
  libelle: string;
  jointe: boolean;
  genereeParApp: boolean;
  lien?: string; // lien officiel (ex. notice d'information)
}

export type EtatNote = 'neuf' | 'tres_bon' | 'bon' | 'usage' | 'mauvais';

/**
 * @deprecated L'inventaire du mobilier est désormais intégré à l'état des lieux
 * (rubrique « Mobilier obligatoire » + quantités par élément), qui vaut
 * inventaire au sens du décret n°2015-981. Ce type et la table Dexie
 * `inventaires` ne sont conservés que pour relire les sauvegardes antérieures
 * à la fusion : ne plus créer de nouvel `Inventaire`.
 */
export interface LigneInventaire {
  pieceNom: string;
  designation: string;
  quantite: number;
  etat: EtatNote;
  commentaire?: string;
  obligatoireDecret?: boolean; // fait partie des 11 éléments du décret 2015-981
}

/** @deprecated Voir {@link LigneInventaire} : conservé pour la relecture des anciennes sauvegardes. */
export interface Inventaire {
  id: string;
  reference: string; // "INV-2026-0001"
  bailId: string;
  lignes: LigneInventaire[];
  signatures?: SignatureBloc;
  statut: 'brouillon' | 'signe';
  pdfHash?: string;
  createdAt: string;
  updatedAt: string;
}

export type TypeCompteur = 'electricite' | 'gaz' | 'eau_froide' | 'eau_chaude';

export interface Compteur {
  type: TypeCompteur;
  numero?: string;
  releve: number;
  photoId?: string;
}

export interface Cle {
  designation: string;
  nombre: number;
  commentaire?: string;
}

export interface ElementEDL {
  id: string;
  nom: string;
  categorie: CategorieElement;
  /** Quantité relevée (mobilier). 0 = absent. */
  quantite?: number;
  /** Fait partie des 11 postes obligatoires du meublé (décret n°2015-981). */
  obligatoireDecret?: boolean;
  etat?: EtatNote; // non renseigné tant que l'utilisateur n'a pas statué
  commentaire?: string;
  photoIds: string[];
  // Rempli automatiquement sur un EDL de sortie :
  etatEntree?: EtatNote;
  commentaireEntree?: string;
  photoIdsEntree?: string[];
  degradation?: boolean; // calculé: état sortie < état entrée, modifiable manuellement
  /** EDL de sortie : élément présent à l'entrée mais manquant/retiré à la sortie (compté comme dégradation). */
  manquant?: boolean;
  // Estimation de retenue (EDL sortie, éléments dégradés) :
  coutRemiseEnEtat?: number;
  ageEquipementAnnees?: number;
  posteVetuste?: string;
}

export interface PieceEDL {
  id: string;
  nom: string;
  ordre: number;
  elements: ElementEDL[];
}

export interface Avenant {
  date: string;
  texte: string;
  signatures?: SignatureBloc;
}

export interface EtatDesLieux {
  id: string;
  reference: string; // "EDL-2026-0007"
  /**
   * Bail auquel l'état des lieux sera annexé. **Optionnel** : l'état des lieux
   * est un acte autonome, établi contradictoirement entre les parties (art. 3-2
   * de la loi n°89-462, décret n°2016-382). Le contrat peut avoir été rédigé
   * ailleurs - ou être rattaché plus tard, une fois l'état des lieux signé.
   */
  bailId?: string;
  /**
   * Logement constaté. Source **directe** du contexte : ne dépend plus du bail,
   * qui peut ne pas exister.
   */
  bienId: string;
  /**
   * Parties présentes au constat, **figées à la date de l'état des lieux**.
   * Lire les locataires du bail ferait apparaître dans un document déjà signé
   * les colocataires ajoutés depuis - qui ne l'ont pas signé.
   */
  locataireIds: string[];
  /**
   * Dépôt de garantie servant au calcul des retenues et à la lettre de
   * restitution. Prioritaire sur `bail.depotGarantie` : c'est le montant déclaré
   * au moment du constat.
   */
  depotGarantie?: number;
  /**
   * Contrat de location non enregistré dans l'application (bail papier, agence,
   * modèle tiers) : cité en tête du PDF pour que le document puisse y être
   * annexé sans ambiguïté.
   */
  bailExterne?: { reference?: string; dateEffet?: string };
  /**
   * EDL de **sortie** - provenance des états d'entrée servant de référence au
   * comparatif :
   * - `edl_app`    : `edlEntreeLieId` renseigné, états dupliqués depuis l'app ;
   * - `edl_papier` : entrée établie hors application, reportée à la main ;
   * - `aucun`      : aucun état des lieux d'entrée n'a été établi - le document
   *                  constate l'état à la sortie, sans comparatif opposable.
   */
  origineEtatEntree?: 'edl_app' | 'edl_papier' | 'aucun';
  /** `origineEtatEntree === 'edl_papier'` : date de l'EDL d'entrée papier, citée au PDF. */
  dateEdlEntreePapier?: string;
  type: 'entree' | 'sortie';
  date: string;
  edlEntreeLieId?: string; // pour un EDL de sortie: lien vers l'entrée
  nouvelleAdresseLocataire?: string; // sortie uniquement
  compteurs: Compteur[];
  cles: Cle[];
  pieces: PieceEDL[];
  observationsGenerales?: string;
  /** Photos rattachées aux observations générales (vue d'ensemble du logement). */
  photoIds?: string[];
  signatures?: SignatureBloc;
  statut: 'brouillon' | 'signe'; // signe => verrouillé (rectification = re-signature des 2 parties)
  avenants: Avenant[];
  pdfHash?: string;
  /**
   * Versions signées antérieures, conservées lors d'une rectification (chaque
   * rectification exige une nouvelle signature des deux parties). La nouvelle
   * version « annule et remplace » la dernière de cette liste.
   */
  rectifications?: { dateSignature: string; pdfHash?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Photo {
  id: string;
  blob: Blob;
  dateCapture: string;
  legende?: string;
  /** Photo d'état des lieux. Absent pour une photo d'illustration de bien. */
  edlId?: string;
  /** Photo d'illustration rattachée à un bien (fiche du bien, fiche de visite). */
  bienId?: string;
}

export interface SignatureItem {
  nomComplet: string; // tapé par le signataire
  luEtApprouve: boolean;
  imageDataUrl: string; // PNG du canvas
  horodatage: string;
}

export interface SignatureBloc {
  dateSignature: string; // ISO, horodatage
  lieu: string;
  bailleur: SignatureItem;
  locataires: SignatureItem[];
}

export interface LigneVetuste {
  poste: string;
  dureeVieAnnees: number;
  franchiseAnnees: number;
  abattementAnnuelPct: number;
}

/**
 * Situation qui conditionne l'impression d'une section du dossier de
 * candidature : inutile de lister les pièces du garant à un candidat couvert
 * par Visale.
 */
export type ConditionSection =
  | 'toujours'
  | 'garant_physique'
  | 'visale'
  | 'colocation'
  | 'etudiant'
  | 'independant';

export interface PieceDossier {
  id: string;
  libelle: string;
  /** Ligne secondaire, en petit sous le libellé. */
  precision?: string;
  actif: boolean;
}

export interface SectionDossier {
  id: string;
  titre: string;
  /** Note sous le titre : « une seule pièce parmi celles-ci ». */
  note?: string;
  condition: ConditionSection;
  pieces: PieceDossier[];
}

/**
 * Modèle de la fiche de visite : textes et liste des pièces du dossier de
 * candidature, modifiables dans les Paramètres. La liste par défaut suit le
 * décret n°2015-1437, qui fixe **limitativement** les pièces exigibles.
 */
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

/** Regroupement des conditions générales d'occupation dans le bail. */
export type FamilleClause = 'occupation' | 'entretien' | 'assurance' | 'immeuble';

/**
 * Clause du bail issue du catalogue. Chaque clause porte sa base légale : le
 * bail ne doit contenir aucune stipulation réputée non écrite par l'article 4
 * de la loi du 6 juillet 1989.
 */
export interface ClauseBail {
  id: string;
  famille: FamilleClause;
  titre: string;
  texte: string;
  /** Référence imprimée en petit sous la clause. */
  baseLegale?: string;
  /** Retenue par défaut à la création d'un bail. */
  active: boolean;
  /** Imprimée seulement si le logement remplit la condition. */
  condition?: 'copropriete' | 'servitude_residence_principale';
}

export const FAMILLE_CLAUSE_LABELS: Record<FamilleClause, string> = {
  occupation: 'Occupation, destination et visites',
  entretien: 'Entretien, réparations et restitution',
  assurance: 'Assurance, sinistres et information',
  immeuble: "Vie de l'immeuble et troubles",
};

/**
 * Qualité du bailleur. Elle change la **désignation des parties** du bail
 * (partie I) : un logement détenu à deux ne peut pas être loué au nom d'un seul
 * indivisaire, et une société doit être désignée par sa dénomination, sa forme,
 * son capital, son RCS et son représentant légal.
 */
export type QualiteBailleur = 'personne_physique' | 'indivision' | 'personne_morale';

/** Personne physique bailleresse : le bailleur seul, ou un coïndivisaire. */
export interface PersonneBailleur {
  civilite: string;
  nom: string;
  prenom: string;
}

export interface Bailleur extends PersonneBailleur {
  qualite: QualiteBailleur;
  /**
   * Autres coïndivisaires (indivision uniquement). Le premier indivisaire est
   * porté par `civilite`/`nom`/`prenom`, ce qui garde intactes les fiches
   * enregistrées avant la prise en charge de l'indivision.
   */
  coIndivisaires?: PersonneBailleur[];
  /** Personne morale : raison sociale (« SCI Les Tilleuls »). */
  denomination?: string;
  /** Forme juridique (SCI, SARL de famille, SAS…). */
  formeJuridique?: string;
  capitalSocial?: number;
  /** Ville du greffe d'immatriculation (« RCS Clermont-Ferrand »). */
  villeRCS?: string;
  /**
   * Représentant légal signataire. Une société ne signe pas : c'est son gérant
   * ou son président, et sa qualité doit figurer au contrat.
   */
  representant?: PersonneBailleur & { fonction: string };
  /** Adresse personnelle, ou siège social pour une personne morale. */
  adresse: string;
  email: string;
  telephone: string;
  siret?: string;
}

export const QUALITE_BAILLEUR_LABELS: Record<QualiteBailleur, string> = {
  personne_physique: 'Personne physique (vous seul)',
  indivision: 'Indivision (plusieurs propriétaires)',
  personne_morale: 'Personne morale (SCI, SARL de famille…)',
};

export interface Parametres {
  id: 'singleton';
  bailleur: Bailleur;
  grilleVetuste: LigneVetuste[]; // pré-remplie, modifiable
  /** Modèle de la fiche de visite - pré-rempli, modifiable (cf. `getParametres`). */
  ficheVisite?: ModeleFicheVisite;
  /** Conditions générales d'occupation proposées à chaque nouveau bail. */
  clausesBail?: ClauseBail[];
  compteursSequence: { bail: number; edl: number; inventaire: number; document: number; annee: number };
  derniereSauvegarde?: string;
  disclaimerAccepte?: boolean;
  /**
   * Sauvegarde vers Google Drive (API drive.file : l'app ne voit que ses
   * propres fichiers). Le clientId OAuth est public par nature ; aucun jeton
   * n'est persisté (mémoire uniquement).
   */
  sauvegardeGDrive?: {
    clientId: string;
    actif: boolean;
    dossierId?: string; // dossier « Bailiz » créé à la racine du Drive
    /**
     * Heure **serveur** du dernier cycle réussi. Comparer des dates serveur à
     * une heure locale ferait manquer des fichiers à chaque cycle, d'où le
     * stockage tel quel.
     */
    derniereSync?: string;
    /** Date du dernier instantané ZIP (filet de sécurité, jamais fusionné). */
    dernierInstantane?: string;
  };
}

/**
 * Saisie du formulaire de bail unifié : modèle **transitoire** (state React
 * uniquement, aucune table Dexie). Chaque partie (bien, locataire) peut être
 * **choisie parmi les entités enregistrées** (`bienId` / `id`) ou **saisie
 * inline**. Les champs métier sont optionnels - un champ vide devient une zone
 * à compléter à la main dans le PDF. Rien n'est persisté tant que l'utilisateur
 * ne clique pas « Enregistrer dans l'app ».
 */
export interface SaisieBail {
  bailleur: Parametres['bailleur'];
  /** Bien enregistré sélectionné ; si absent, la saisie inline `bien` est utilisée. */
  bienId?: string;
  bien: {
    nom?: string;
    adresse: Adresse;
    type?: TypeBien;
    surfaceBoutin?: number;
    nbPieces?: number;
    etage?: string;
    batiment?: string;
    identifiantFiscal?: string;
    classeDPE?: ClasseDPE;
    chauffage?: string; // texte libre simplifié (ex. « individuel électrique »)
    eauChaude?: string;
  };
  /**
   * Locataires du bail, référencés par leur fiche enregistrée. La saisie se fait
   * via le formulaire locataire partagé (`LocataireFormModal`) : aucun champ
   * n'est dupliqué ici. Une entrée sans `id` = emplacement non renseigné, rendu
   * en zones à compléter à la main sur le PDF.
   */
  locataires: { id?: string }[];
  typeBail: TypeBail;
  dateEffet?: string;
  dureeMois?: number;
  loyerHC?: number;
  charges: { mode: 'forfait' | 'provisions'; montant?: number };
  depotGarantie?: number;
  jourPaiement?: number;
  modePaiement?: string;
  revisionIRL?: { trimestreReference?: string; valeurIndice?: number; revisable: boolean };
  clausesParticulieres?: string;
  // Options avancées (héritées de l'assistant complet)
  clauseSolidarite: boolean;
  clauseResolutoire: boolean;
  assuranceMontantAnnuel?: number;
  complementMontant?: number;
  complementJustification?: string;
  dernierLoyerAncienLocataire?: number;
  travauxDepuis?: string;
  travauxMajoration?: string;
  travauxDiminution?: string;
  /** Conditions générales retenues ; copiées dans le bail à l'enregistrement. */
  clauses?: ClauseBail[];
  /** Motif facultatif de clause résolutoire (servitude de résidence principale). */
  resiliationResidencePrincipale?: boolean;
}

export type TypeDocument =
  | 'bail'
  | 'inventaire'
  | 'edl_entree'
  | 'edl_sortie'
  | 'avenant'
  | 'lettre_restitution'
  | 'courrier_irl'
  | 'grille_vetuste'
  | 'fiche_aide'
  | 'fiche_visite';

export interface DocumentGenere {
  id: string;
  reference: string;
  type: TypeDocument;
  titre: string;
  bienId?: string;
  bailId?: string;
  edlId?: string;
  blob: Blob;
  hash?: string; // empreinte SHA-256 (documents signés)
  signe: boolean;
  createdAt: string;
}

export const ETAT_ORDRE: Record<EtatNote, number> = {
  neuf: 4,
  tres_bon: 3,
  bon: 2,
  usage: 1,
  mauvais: 0,
};

export const ETAT_LABELS: Record<EtatNote, string> = {
  neuf: 'Neuf',
  tres_bon: 'Très bon',
  bon: 'Bon',
  usage: 'Usagé',
  mauvais: 'Mauvais',
};

export const CATEGORIE_LABELS: Record<CategorieElement, string> = {
  sol: 'Sol',
  mur: 'Murs',
  plafond: 'Plafond',
  menuiserie: 'Menuiserie',
  electricite: 'Électricité',
  plomberie: 'Plomberie',
  chauffage: 'Chauffage',
  equipement: 'Équipement',
  mobilier: 'Mobilier',
  autre: 'Autre',
};

export const PERIODE_CONSTRUCTION_LABELS: Record<PeriodeConstruction, string> = {
  avant_1949: 'Avant 1949',
  '1949_1974': 'De 1949 à 1974',
  '1975_1989': 'De 1975 à 1989',
  '1990_2005': 'De 1990 à 2005',
  apres_2005: 'Depuis 2005',
};

export const TYPE_BAIL_LABELS: Record<TypeBail, string> = {
  meuble_1an: 'Meublé 1 an (renouvelable)',
  meuble_etudiant_9mois: 'Meublé étudiant 9 mois',
  mobilite: 'Bail mobilité (1 à 10 mois)',
};

export const COMPTEUR_LABELS: Record<TypeCompteur, string> = {
  electricite: 'Électricité',
  gaz: 'Gaz',
  eau_froide: 'Eau froide',
  eau_chaude: 'Eau chaude',
};

export const TYPE_DOCUMENT_LABELS: Record<TypeDocument, string> = {
  bail: 'Bail meublé',
  inventaire: 'Inventaire du mobilier',
  edl_entree: "État des lieux d'entrée",
  edl_sortie: 'État des lieux de sortie',
  avenant: 'Avenant',
  lettre_restitution: 'Lettre de restitution du dépôt',
  courrier_irl: 'Courrier de révision IRL',
  grille_vetuste: 'Grille de vétusté (annexe)',
  fiche_aide: 'Fiche d’aide juridique',
  fiche_visite: 'Fiche de visite',
};

export const CONDITION_SECTION_LABELS: Record<ConditionSection, string> = {
  toujours: 'Toujours',
  garant_physique: 'Garant (personne physique)',
  visale: 'Garantie Visale',
  colocation: 'Colocation',
  etudiant: 'Étudiant',
  independant: 'Indépendant / non salarié',
};

/** Types de logement proposés à la saisie (formulaire de bien et de bail). */
export const TYPES_BIEN: TypeBien[] = ['T1', 'T1bis', 'T2', 'T3', 'T4', 'autre'];

/** Classes du DPE, de la plus performante à la moins performante. */
export const CLASSES_DPE: ClasseDPE[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
