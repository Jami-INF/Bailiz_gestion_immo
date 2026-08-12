import type {
  CategorieElement,
  ClauseBail,
  LigneVetuste,
  ModeleFicheVisite,
  PieceDossier,
} from '@/types';

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

/** Portail officiel des risques : sert à établir l'ERP et à vérifier s'il est dû. */
export const LIEN_GEORISQUES = 'https://www.georisques.gouv.fr';

const LOI_1989 = 'loi n°89-462 du 6 juillet 1989';

/**
 * Conditions générales d'occupation proposées par défaut. Toutes sont
 * **licites** : chacune porte son fondement, et aucune ne figure dans la liste
 * des clauses réputées non écrites de l'article 4 de la loi du 6 juillet 1989
 * (version en vigueur depuis le 21 novembre 2024). Les clauses souvent
 * réclamées mais interdites - pénalités de retard, frais de relance,
 * responsabilité automatique pour dégradations, assurance imposée, interdiction
 * d'animaux familiers… - sont volontairement absentes : voir
 * `docs/CDC-bail-clauses.md` §4.3.
 */
export const CLAUSES_BAIL_DEFAUT: ClauseBail[] = [
  // ---------------------------- Occupation ----------------------------
  {
    id: 'occ-destination',
    famille: 'occupation',
    titre: 'Destination et occupation personnelle',
    texte:
      "Le logement est loué à usage exclusif d'habitation principale. Il est occupé personnellement et paisiblement par le locataire, qui ne peut y exercer aucune activité professionnelle, commerciale ou artisanale, ni y domicilier une entreprise ou une association, sans l'accord écrit préalable du bailleur.",
    baseLegale: `art. 7 b) et h) de la ${LOI_1989}`,
    active: true,
  },
  {
    id: 'occ-sous-location',
    famille: 'occupation',
    titre: 'Sous-location',
    texte:
      "La sous-location, même partielle ou consentie à titre gratuit, est interdite sans l'accord écrit du bailleur portant également sur le prix. Le prix au mètre carré de surface habitable de la sous-location ne peut excéder celui du loyer principal. Le locataire transmet au sous-locataire l'autorisation écrite du bailleur ainsi qu'une copie du présent contrat.",
    baseLegale: `art. 8 de la ${LOI_1989}`,
    active: true,
  },
  {
    id: 'occ-tourisme',
    famille: 'occupation',
    titre: 'Location de courte durée et meublés de tourisme',
    texte:
      "Le locataire ne peut proposer le logement à la location de courte durée ou en meublé de tourisme, même ponctuellement et notamment par l'intermédiaire d'une plateforme en ligne, ni le déclarer en mairie à ce titre, sans l'accord écrit du bailleur. Le logement étant loué à titre de résidence principale du locataire, une telle mise en location constitue une sous-location irrégulière.",
    baseLegale: `art. 8 de la ${LOI_1989} ; art. L.324-1-1 du code du tourisme ; loi n°2024-1039 du 19 novembre 2024`,
    active: true,
  },
  {
    id: 'occ-visites',
    famille: 'occupation',
    titre: 'Visites en vue de la vente ou de la relocation',
    texte:
      "En cas de congé donné ou reçu, ainsi qu'en cas de mise en vente du logement, le locataire laisse visiter les lieux deux heures par jour ouvrable, aux jours et heures convenus entre les parties et, à défaut d'accord, de 17 heures à 19 heures. Aucune visite ne peut être imposée les dimanches et jours fériés. Le locataire facilite l'accès du logement et le maintient en état de présentation.",
    baseLegale: `art. 4 a) de la ${LOI_1989} - la limite de deux heures est d'ordre public`,
    active: true,
  },
  {
    id: 'occ-acces-travaux',
    famille: 'occupation',
    titre: 'Accès pour travaux, entretien et diagnostics',
    texte:
      "Le locataire laisse exécuter, après notification écrite du bailleur, les travaux d'amélioration des parties communes ou privatives, les travaux nécessaires au maintien en état et à l'entretien normal du logement, ceux d'amélioration de la performance énergétique, ceux nécessaires au respect des critères de décence, ainsi que la réalisation des diagnostics obligatoires. Si ces travaux durent plus de vingt et un jours, le loyer est diminué à proportion du temps et de la partie du logement dont le locataire est privé.",
    baseLegale: `art. 7 e) de la ${LOI_1989} ; art. 1724 du code civil`,
    active: true,
  },
  {
    id: 'occ-notifications',
    famille: 'occupation',
    titre: 'Notifications et élection de domicile',
    texte:
      "Le locataire élit domicile dans le logement loué pour toute la durée du contrat. Les parties conviennent que leurs échanges courants - demandes de justificatifs, régularisation des charges, prise de rendez-vous, information sur les travaux - peuvent être adressés valablement par courrier électronique aux adresses figurant au présent contrat. Sont exclus de cette convention et demeurent soumis aux formes légales : le congé, le commandement de payer et toute mise en demeure préalable à la résiliation, qui se font par lettre recommandée avec avis de réception, par acte de commissaire de justice ou par remise en main propre contre récépissé.",
    baseLegale: `art. 15 de la ${LOI_1989} ; art. 1366 du code civil`,
    active: true,
  },
  {
    id: 'occ-adresse-sortie',
    famille: 'occupation',
    titre: 'Nouvelle adresse au départ',
    texte:
      "Lors de la remise des clés, le locataire indique au bailleur l'adresse de son nouveau domicile. Le délai de restitution du dépôt de garantie court à compter de cette remise ; à défaut d'adresse communiquée, le bailleur adresse le décompte et le solde à la dernière adresse connue.",
    baseLegale: `art. 22 de la ${LOI_1989}`,
    active: true,
  },
  {
    id: 'occ-residence-principale',
    famille: 'occupation',
    titre: 'Servitude de résidence principale',
    texte:
      "Le logement objet du présent contrat est soumis à l'obligation prévue à l'article L.151-14-1 du code de l'urbanisme : il est à usage exclusif de résidence principale, au sens de l'article 2 de la loi du 6 juillet 1989.",
    baseLegale: "art. L.151-14-1 du code de l'urbanisme ; décret n°2026-596 du 6 juillet 2026",
    active: true,
    condition: 'servitude_residence_principale',
  },
  // ---------------------------- Entretien -----------------------------
  {
    id: 'ent-reparations',
    famille: 'entretien',
    titre: 'Entretien courant et réparations locatives',
    texte:
      "Le locataire prend à sa charge l'entretien courant du logement et des équipements mentionnés au contrat, les menues réparations, ainsi que l'ensemble des réparations locatives énumérées par le décret n°87-712 du 26 août 1987. Demeurent à la charge du bailleur les réparations rendues nécessaires par la vétusté, une malfaçon, un vice de construction, un cas fortuit ou la force majeure.",
    baseLegale: `art. 7 d) de la ${LOI_1989} ; décret n°87-712 du 26 août 1987`,
    active: true,
  },
  {
    id: 'ent-equipements',
    famille: 'entretien',
    titre: 'Entretien des équipements',
    texte:
      "Le locataire fait procéder à ses frais, par un professionnel qualifié, à l'entretien annuel de la chaudière ou du chauffe-eau individuel, au ramonage des conduits de fumée selon la périodicité fixée par le règlement sanitaire départemental, ainsi qu'à l'entretien des bouches et grilles de ventilation. Il conserve les justificatifs correspondants et les présente à la demande du bailleur, au plus tard lors de l'état des lieux de sortie.",
    baseLegale: `art. 7 d) de la ${LOI_1989} ; décret n°87-712 ; décret n°2009-649 du 9 juin 2009`,
    active: true,
  },
  {
    id: 'ent-prevention',
    famille: 'entretien',
    titre: 'Prévention des désordres',
    texte:
      "Le locataire aère quotidiennement le logement et le chauffe suffisamment pour prévenir l'humidité et les moisissures ; il n'obstrue ni les grilles ni les bouches de ventilation. En cas d'absence prolongée pendant la période de gel, il coupe l'arrivée d'eau et purge les canalisations. Il informe le bailleur sans délai de tout sinistre, fuite, infiltration ou désordre affectant le logement, et répond de l'aggravation des dommages résultant d'un défaut d'information.",
    baseLegale: `art. 7 b), c) et d) de la ${LOI_1989}`,
    active: true,
  },
  {
    id: 'ent-detecteur',
    famille: 'entretien',
    titre: 'Détecteur de fumée',
    texte:
      "Le logement est équipé d'un détecteur avertisseur autonome de fumée normalisé, installé et fourni par le bailleur. Le locataire en assure l'entretien et le bon fonctionnement pendant toute la durée du contrat, notamment le remplacement des piles, et notifie son installation à son assureur.",
    baseLegale: 'art. L.142-2 et R.142-2 et suivants du code de la construction et de l’habitation',
    active: true,
  },
  {
    id: 'ent-ventilation',
    famille: 'entretien',
    titre: 'Ventilation du logement',
    texte:
      "Le logement est équipé d'un dispositif de ventilation mécanique porté à l'inventaire. Il fonctionne en marche continue : le locataire ne peut ni l'arrêter, ni le débrancher, ni obstruer les bouches d'extraction et les entrées d'air, y compris pour des travaux de décoration. Il en assure le nettoyage régulier et signale sans délai tout dysfonctionnement au bailleur, à qui il appartient de le réparer ou de le remplacer.",
    baseLegale: `art. 7 b) et d) de la ${LOI_1989} ; art. 3 du décret n°2002-120 (aération)`,
    active: true,
  },
  {
    id: 'ent-edl-commissaire',
    famille: 'entretien',
    titre: 'État des lieux en cas de désaccord',
    texte:
      "L'état des lieux d'entrée et celui de sortie sont établis contradictoirement et amiablement entre les parties. À défaut d'accord, il est établi par un commissaire de justice, à l'initiative de la partie la plus diligente ; son coût, fixé par décret en Conseil d'État, est alors partagé par moitié entre le bailleur et le locataire. Les parties sont convoquées au moins sept jours à l'avance par lettre recommandée avec avis de réception.",
    baseLegale: `art. 3-2 de la ${LOI_1989}`,
    active: true,
  },
  {
    id: 'ent-restitution',
    famille: 'entretien',
    titre: 'Restitution du logement',
    texte:
      "Au terme du contrat, le logement et son mobilier sont restitués en bon état d'entretien et de réparations locatives, propres et débarrassés de tout objet personnel, avec la totalité des clés, badges et télécommandes remis à l'entrée. Les dégradations constatées à l'état des lieux de sortie et non imputables à la vétusté ou à l'usage normal sont à la charge du locataire, après application de la grille de vétusté annexée au contrat et sur présentation de devis ou de factures.",
    baseLegale: `art. 7 c) et d) et art. 22 de la ${LOI_1989} ; décret n°2016-382 du 30 mars 2016`,
    active: true,
  },
  {
    id: 'ent-mobilier',
    famille: 'entretien',
    titre: 'Mobilier et équipements du logement meublé',
    texte:
      "L'inventaire et l'état détaillé du mobilier annexés au contrat font foi entre les parties. Le locataire répond des éléments manquants ou détériorés de son fait. Il peut remplacer un élément par un équipement neuf de nature et de qualité équivalentes, avec l'accord écrit du bailleur ; l'élément remplacé reste la propriété du bailleur.",
    baseLegale: `art. 25-5 de la ${LOI_1989} ; décret n°2015-981 du 31 juillet 2015`,
    active: true,
  },
  // ---------------------------- Assurance -----------------------------
  {
    id: 'ass-obligation',
    famille: 'assurance',
    titre: 'Assurance des risques locatifs',
    texte:
      "Le locataire s'assure contre les risques dont il doit répondre en sa qualité de locataire et en justifie lors de la remise des clés, puis chaque année à la demande du bailleur. À défaut, et après une mise en demeure demeurée infructueuse pendant un mois, le bailleur peut souscrire une assurance pour le compte du locataire - la prime étant alors récupérable par douzièmes, majorée au plus de 10 % - ou se prévaloir de la clause résolutoire.",
    baseLegale: `art. 7 g) de la ${LOI_1989}`,
    active: true,
  },
  {
    id: 'ass-sinistres',
    famille: 'assurance',
    titre: 'Déclaration des sinistres',
    texte:
      "Le locataire déclare tout sinistre à son assureur dans les délais prévus par son contrat - cinq jours ouvrés, et deux jours ouvrés en cas de vol - et en informe le bailleur sans délai, en lui transmettant copie de la déclaration ainsi que les coordonnées de l'expert désigné.",
    baseLegale: 'art. L.113-2 du code des assurances',
    active: true,
  },
  {
    id: 'ass-abonnements',
    famille: 'assurance',
    titre: 'Abonnements individuels',
    texte:
      "Le locataire souscrit en son nom propre, dès la remise des clés et pour toute la durée du contrat, les abonnements individuels correspondant aux fournitures qui ne sont pas comprises dans les charges : électricité, gaz le cas échéant, eau lorsque le compteur est individuel, et communications électroniques. Il en supporte les consommations et les frais de mise en service, et fournit les justificatifs de résiliation ou de transfert lors de son départ. Le choix des fournisseurs lui appartient.",
    baseLegale: `art. 7 a) de la ${LOI_1989}`,
    active: true,
  },
  {
    id: 'ass-coordonnees',
    famille: 'assurance',
    titre: 'Coordonnées des parties',
    texte:
      "Chaque partie informe l'autre de tout changement d'adresse postale, de numéro de téléphone ou d'adresse électronique. À défaut, les notifications sont valablement adressées aux dernières coordonnées communiquées.",
    baseLegale: 'décret n°2026-596 du 6 juillet 2026 (mention du téléphone portable des parties)',
    active: true,
  },
  // ----------------------------- Immeuble -----------------------------
  {
    id: 'imm-reglement',
    famille: 'immeuble',
    titre: 'Règlement de copropriété',
    texte:
      "Le locataire respecte le règlement de copropriété de l'immeuble, dont les extraits relatifs à la destination de l'immeuble, à la jouissance et à l'usage des parties privatives et communes lui sont remis en annexe du présent contrat.",
    baseLegale: `art. 3 de la ${LOI_1989}`,
    active: true,
    condition: 'copropriete',
  },
  {
    id: 'imm-tranquillite',
    famille: 'immeuble',
    titre: 'Jouissance paisible et troubles de voisinage',
    texte:
      "Le locataire use paisiblement du logement et veille à ne pas troubler la tranquillité du voisinage, de jour comme de nuit, y compris du fait des personnes qu'il héberge ou reçoit. Les troubles de voisinage constatés par une décision de justice passée en force de chose jugée constituent un motif de résiliation de plein droit du contrat.",
    baseLegale: `art. 7 b) et art. 24 de la ${LOI_1989}`,
    active: true,
  },
  {
    id: 'imm-animaux',
    famille: 'immeuble',
    titre: 'Animaux familiers',
    texte:
      "La détention d'un animal familier ne peut être interdite au locataire. Celui-ci répond des dégradations et des nuisances que son animal occasionne au logement, à l'immeuble ou au voisinage. La détention de chiens d'attaque de première catégorie est interdite par la loi ; les chiens de deuxième catégorie doivent être déclarés, tenus en laisse et muselés dans les parties communes.",
    baseLegale: 'loi n°70-598 du 9 juillet 1970 ; loi n°99-5 du 6 janvier 1999',
    active: true,
  },
  {
    id: 'imm-transformation',
    famille: 'immeuble',
    titre: 'Transformation des lieux',
    texte:
      "Le locataire ne peut transformer les locaux et équipements loués sans l'accord écrit du bailleur. À défaut d'accord, le bailleur peut exiger la remise en état des lieux au départ du locataire, ou conserver les transformations sans indemnisation. Sont réservés les travaux d'adaptation du logement au handicap ou à la perte d'autonomie et les travaux de rénovation énergétique relevant du régime d'accord tacite.",
    baseLegale: `art. 7 f) de la ${LOI_1989}`,
    active: true,
  },
  {
    id: 'imm-securite',
    famille: 'immeuble',
    titre: 'Sécurité',
    texte:
      "Le locataire n'entrepose dans le logement, la cave ou les annexes aucun produit dangereux ni matière inflammable en quantité anormale. Il n'utilise pas d'appareil de chauffage d'appoint non conforme, ne surcharge pas l'installation électrique et respecte les consignes de sécurité applicables à l'immeuble.",
    baseLegale: `art. 7 b) de la ${LOI_1989}`,
    active: true,
  },
];


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
        piece('id-cni', "Carte nationale d'identité", 'Recto-verso - française ou étrangère'),
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
          '3 mois - 6 mois pour les étudiants, alternants et volontaires en service civique',
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
      note: 'Pas pour la candidature - inutile de les fournir maintenant.',
      condition: 'toujours',
      pieces: [
        piece(
          'sig-assurance',
          "Attestation d'assurance habitation (risques locatifs)",
          'Au plus tard à la remise des clés, puis chaque année',
        ),
        piece('sig-paiement', 'Moyen de paiement du premier loyer et du dépôt de garantie'),
        piece('sig-rib', 'Un RIB uniquement si vous choisissez le prélèvement', 'À votre initiative - il ne peut pas être exigé'),
      ],
    },
  ],
};
