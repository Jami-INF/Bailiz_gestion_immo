import type { CategorieElement, LigneVetuste } from '@/types';

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

/** Durées de validité par défaut des diagnostics (en mois). Absent = illimité. */
export const VALIDITE_DIAGNOSTICS: Record<string, { libelle: string; dureeMois?: number }> = {
  dpe: { libelle: 'DPE (diagnostic de performance énergétique)', dureeMois: 120 },
  erp: { libelle: 'ERP (état des risques et pollutions)', dureeMois: 6 },
  crep: { libelle: 'CREP (constat de risque d’exposition au plomb)' },
  electricite: { libelle: 'Diagnostic électricité (location)', dureeMois: 72 },
  gaz: { libelle: 'Diagnostic gaz (location)', dureeMois: 72 },
  boutin: { libelle: 'Attestation de surface loi Boutin' },
  autre: { libelle: 'Autre diagnostic' },
};

export const LIEN_NOTICE_INFORMATION =
  'https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000030649868';
