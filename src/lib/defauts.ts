import type { CategorieElement, LigneVetuste, ModeleFicheVisite, PieceDossier } from '@/types';

/**
 * Les 11 éléments de mobilier obligatoires en location meublée
 * (décret n°2015-981 du 31 juillet 2015).
 */
export const MOBILIER_OBLIGATOIRE: string[] = [
  'Literie avec couette ou couverture',
  "Dispositif d'occultation des fenêtres dans les chambres",
  'Plaques de cuisson',
  'Four ou four à micro-ondes',
  'Réfrigérateur avec compartiment congélation (ou congélateur)',
  'Vaisselle en nombre suffisant',
  'Ustensiles de cuisine',
  'Table et sièges',
  'Étagères de rangement',
  'Luminaires',
  "Matériel d'entretien ménager adapté au logement",
];

export interface ModelePiece {
  nom: string;
  elements: { nom: string; categorie: CategorieElement }[];
}

const BASE: { nom: string; categorie: CategorieElement }[] = [
  { nom: 'Sol', categorie: 'sol' },
  { nom: 'Murs', categorie: 'mur' },
  { nom: 'Plafond', categorie: 'plafond' },
  { nom: 'Porte', categorie: 'menuiserie' },
  { nom: 'Interrupteurs / prises', categorie: 'electricite' },
  { nom: 'Éclairage', categorie: 'electricite' },
];

/** Bibliothèque de modèles de pièces avec éléments par défaut selon le type. */
export const BIBLIOTHEQUE_PIECES: ModelePiece[] = [
  {
    nom: 'Entrée',
    elements: [...BASE, { nom: "Porte d'entrée / serrure", categorie: 'menuiserie' }],
  },
  {
    nom: 'Séjour',
    elements: [
      ...BASE,
      { nom: 'Fenêtres / volets', categorie: 'menuiserie' },
      { nom: 'Radiateur', categorie: 'chauffage' },
      { nom: 'Table et sièges', categorie: 'mobilier' },
      { nom: 'Étagères / rangements', categorie: 'mobilier' },
      { nom: 'Canapé', categorie: 'mobilier' },
    ],
  },
  {
    nom: 'Chambre',
    elements: [
      ...BASE,
      { nom: 'Fenêtres / volets / occultation', categorie: 'menuiserie' },
      { nom: 'Radiateur', categorie: 'chauffage' },
      { nom: 'Literie (lit, matelas, couette)', categorie: 'mobilier' },
      { nom: 'Armoire / rangements', categorie: 'mobilier' },
    ],
  },
  {
    nom: 'Cuisine',
    elements: [
      ...BASE,
      { nom: 'Fenêtre', categorie: 'menuiserie' },
      { nom: 'Plaques de cuisson', categorie: 'equipement' },
      { nom: 'Four / micro-ondes', categorie: 'equipement' },
      { nom: 'Réfrigérateur / congélateur', categorie: 'equipement' },
      { nom: 'Hotte', categorie: 'equipement' },
      { nom: 'Évier / robinetterie', categorie: 'plomberie' },
      { nom: 'Meubles de cuisine', categorie: 'mobilier' },
      { nom: 'Vaisselle et ustensiles', categorie: 'mobilier' },
    ],
  },
  {
    nom: 'Salle de bain',
    elements: [
      ...BASE,
      { nom: 'Douche / baignoire', categorie: 'plomberie' },
      { nom: 'Lavabo / robinetterie', categorie: 'plomberie' },
      { nom: 'Joints / faïence', categorie: 'mur' },
      { nom: 'Meuble vasque / miroir', categorie: 'mobilier' },
      { nom: 'VMC / aération', categorie: 'equipement' },
      { nom: 'Sèche-serviettes', categorie: 'chauffage' },
    ],
  },
  {
    nom: 'WC',
    elements: [
      ...BASE,
      { nom: 'Cuvette / chasse d’eau', categorie: 'plomberie' },
      { nom: 'VMC / aération', categorie: 'equipement' },
    ],
  },
  {
    nom: 'Cave',
    elements: [
      { nom: 'Sol', categorie: 'sol' },
      { nom: 'Murs', categorie: 'mur' },
      { nom: 'Porte / serrure', categorie: 'menuiserie' },
      { nom: 'Éclairage', categorie: 'electricite' },
    ],
  },
  {
    nom: 'Parking',
    elements: [
      { nom: 'Emplacement / sol', categorie: 'sol' },
      { nom: 'Porte / accès (badge, bip)', categorie: 'menuiserie' },
    ],
  },
];

/** Grille de vétusté par défaut (inspirée des grilles conventionnelles usuelles). */
export const GRILLE_VETUSTE_DEFAUT: LigneVetuste[] = [
  { poste: 'Peintures', dureeVieAnnees: 10, franchiseAnnees: 1, abattementAnnuelPct: 10 },
  { poste: 'Papiers peints', dureeVieAnnees: 10, franchiseAnnees: 1, abattementAnnuelPct: 10 },
  { poste: 'Moquette', dureeVieAnnees: 7, franchiseAnnees: 1, abattementAnnuelPct: 15 },
  { poste: 'Parquet / stratifié', dureeVieAnnees: 15, franchiseAnnees: 2, abattementAnnuelPct: 7 },
  { poste: 'Carrelage / sols durs', dureeVieAnnees: 20, franchiseAnnees: 2, abattementAnnuelPct: 5 },
  { poste: 'Sols plastiques (lino, PVC)', dureeVieAnnees: 10, franchiseAnnees: 1, abattementAnnuelPct: 10 },
  { poste: 'Électroménager', dureeVieAnnees: 8, franchiseAnnees: 1, abattementAnnuelPct: 12 },
  { poste: 'Mobilier', dureeVieAnnees: 10, franchiseAnnees: 1, abattementAnnuelPct: 10 },
  { poste: 'Literie (matelas, sommier)', dureeVieAnnees: 8, franchiseAnnees: 1, abattementAnnuelPct: 12 },
  { poste: 'Robinetterie', dureeVieAnnees: 15, franchiseAnnees: 2, abattementAnnuelPct: 7 },
  { poste: 'Sanitaires (cuvette, lavabo…)', dureeVieAnnees: 20, franchiseAnnees: 2, abattementAnnuelPct: 5 },
  { poste: 'Chaudière / chauffe-eau', dureeVieAnnees: 15, franchiseAnnees: 2, abattementAnnuelPct: 7 },
];

export const LIEN_NOTICE_INFORMATION =
  'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000030649868';

export const LIEN_DOSSIER_FACILE = 'https://www.dossierfacile.logement.gouv.fr';


/** Fabrique une pièce active du dossier (identifiants stables et lisibles). */
function piece(id: string, libelle: string, precision?: string): PieceDossier {
  return { id, libelle, precision, actif: true };
}

/**
 * Modèle de fiche de visite livré par défaut. La liste des pièces reprend
 * **strictement** le décret n°2015-1437 (liste limitative) ; l'utilisateur peut
 * la modifier dans les Paramètres, à ses risques.
 */
export const MODELE_FICHE_VISITE_DEFAUT: ModeleFicheVisite = {
  introDossier:
    "Merci de votre visite. Voici les pièces à réunir pour candidater. Cochez au fur et à mesure : un dossier complet est étudié tout de suite, un dossier partiel attend.",
  modalitesCandidature:
    `Transmettez votre dossier en un seul PDF par e-mail, ou via DossierFacile (${LIEN_DOSSIER_FACILE}), service public gratuit qui certifie les pièces. ` +
    "Réponse sous 7 jours. En cas d'accord : signature du bail, puis état des lieux d'entrée et remise des clés le jour de l'entrée dans les lieux.",
  aApporter:
    "Une pièce d'identité et votre dossier s'il est déjà prêt.",
  mentions:
    "Aucune discrimination n'est pratiquée dans le choix du locataire (art. 1er de la loi n°2008-496 du 27 mai 2008). " +
    "Les pièces reçues servent uniquement à l'examen de votre candidature : les dossiers non retenus sont détruits, aucune donnée n'est conservée ni transmise à un tiers. " +
    "Aucun frais d'agence ni honoraire n'est demandé : la location se fait en direct avec le propriétaire.",
  blocs: {
    conditionsFinancieres: true,
    infosPratiques: true,
    coordonneesBailleur: true,
  },
  sections: [
    {
      id: 'identite',
      titre: "Pièce d'identité",
      note: 'Une seule pièce, en cours de validité, avec photographie.',
      condition: 'toujours',
      pieces: [
        piece('id-cni', "Carte nationale d'identité", 'Recto-verso — française ou étrangère'),
        piece('id-passeport', 'Passeport', "Pages d'identité"),
        piece('id-permis', 'Permis de conduire'),
        piece('id-sejour', 'Carte de séjour, carte de résident, ou carte de ressortissant UE/EEE'),
      ],
    },
    {
      id: 'domicile',
      titre: 'Justificatif de domicile',
      note: 'Une seule pièce.',
      condition: 'toujours',
      pieces: [
        piece('dom-quittances', 'Trois dernières quittances de loyer'),
        piece('dom-attestation-bailleur', 'À défaut : attestation du précédent bailleur', 'Loyer et charges payés'),
        piece('dom-hebergement', "À défaut : attestation d'hébergement", "Avec la pièce d'identité de l'hébergeant"),
        piece('dom-propriete', 'Dernier avis de taxe foncière ou titre de propriété', 'Si vous êtes propriétaire'),
      ],
    },
    {
      id: 'activite',
      titre: "Justificatif d'activité professionnelle",
      note: 'Une seule pièce, selon votre situation.',
      condition: 'toujours',
      pieces: [
        piece(
          'act-contrat',
          "Contrat de travail ou de stage, ou attestation de l'employeur",
          "Poste, rémunération, date d'embauche, période d'essai",
        ),
        piece('act-etudiant', "Carte d'étudiant ou certificat de scolarité de l'année en cours"),
        piece(
          'act-independant',
          'Extrait K ou Kbis de moins de 3 mois, carte professionnelle, ou avis SIRENE de moins de 3 mois',
          'Entreprise, profession libérale, auto-entrepreneur',
        ),
        piece('act-fonctionnaire', 'Arrêté de nomination', 'Fonctionnaire'),
      ],
    },
    {
      id: 'ressources',
      titre: 'Justificatifs de ressources',
      note: 'Toutes les pièces qui vous concernent.',
      condition: 'toujours',
      pieces: [
        piece('res-bulletins', 'Trois derniers bulletins de salaire'),
        piece('res-avis', "Dernier ou avant-dernier avis d'imposition", 'Toutes les pages'),
        piece('res-bilans', "Deux derniers bilans, ou attestation de ressources d'un comptable", 'Indépendant'),
        piece(
          'res-indemnites',
          'Justificatifs de versement des indemnités, retraites, pensions ou prestations sociales',
          'Trois derniers mois',
        ),
        piece('res-caf', "Attestation de droits CAF ou simulation d'APL", 'Si vous en bénéficiez'),
        piece('res-fonciers', 'Justificatif de revenus fonciers, de rentes ou de valeurs mobilières'),
      ],
    },
    {
      id: 'bourse',
      titre: 'Étudiant boursier',
      condition: 'etudiant',
      pieces: [piece('bourse-avis', "Avis d'attribution de bourse pour l'année en cours")],
    },
    {
      id: 'garant',
      titre: 'Votre garant',
      note: 'Les mêmes pièces que ci-dessus, à son nom.',
      condition: 'garant_physique',
      pieces: [
        piece('gar-identite', "Pièce d'identité en cours de validité"),
        piece('gar-domicile', 'Justificatif de domicile'),
        piece('gar-activite', "Justificatif d'activité professionnelle"),
        piece('gar-ressources', 'Justificatifs de ressources'),
        piece(
          'gar-acte',
          "Acte de cautionnement solidaire, joint à cette fiche (dernière page)",
          "Déjà pré-rempli : votre garant complète les blancs, recopie la mention à la main, date et signe",
        ),
      ],
    },
    {
      id: 'visale',
      titre: 'Garantie Visale',
      note: 'Dispense de garant personne physique.',
      condition: 'visale',
      pieces: [
        piece('visale-visa', 'Numéro de visa certifié Visale, en cours de validité', 'Gratuit, à demander sur visale.fr'),
        piece(
          'visale-validite',
          'Vérifiez la date de fin de validité du visa',
          '3 mois — 6 mois pour les étudiants, alternants et volontaires en service civique',
        ),
      ],
    },
    {
      id: 'colocation',
      titre: 'Colocation',
      condition: 'colocation',
      pieces: [
        piece('coloc-dossier', 'Chaque colocataire constitue un dossier complet, garant compris'),
        piece('coloc-bail', 'Le bail est signé par tous, avec clause de solidarité'),
      ],
    },
    {
      id: 'signature',
      titre: 'À prévoir pour la signature',
      note: 'Pas pour la candidature — inutile de les fournir maintenant.',
      condition: 'toujours',
      pieces: [
        piece(
          'sig-assurance',
          "Attestation d'assurance habitation (risques locatifs)",
          'Au plus tard à la remise des clés, puis chaque année',
        ),
        piece('sig-paiement', 'Moyen de paiement du premier loyer et du dépôt de garantie'),
        piece('sig-rib', 'Un RIB uniquement si vous choisissez le prélèvement', 'À votre initiative — il ne peut pas être exigé'),
      ],
    },
  ],
};
