import type { LigneVetuste, TypeBail } from '@/types';

/** Nombre de jours dans le mois d'une date donnée. */
function joursDansMois(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Prorata du premier loyer : si le bail prend effet en cours de mois,
 * le premier mois est dû au prorata des jours restants (jour d'effet inclus).
 */
export function prorataPremierLoyer(
  dateEffet: Date,
  loyerHC: number,
  charges: number,
): { joursOccupes: number; joursDansMois: number; loyerHC: number; charges: number; total: number } {
  const jm = joursDansMois(dateEffet);
  const joursOccupes = jm - dateEffet.getDate() + 1;
  const ratio = joursOccupes / jm;
  const lhc = Math.round(loyerHC * ratio * 100) / 100;
  const ch = Math.round(charges * ratio * 100) / 100;
  return { joursOccupes, joursDansMois: jm, loyerHC: lhc, charges: ch, total: Math.round((lhc + ch) * 100) / 100 };
}

/**
 * Révision annuelle du loyer selon l'IRL :
 * nouveau loyer = loyer actuel × (nouvel indice / indice de référence).
 */
export function revisionIRL(
  loyerActuel: number,
  indiceReference: number,
  nouvelIndice: number,
): { nouveauLoyer: number; augmentation: number; pct: number } {
  if (indiceReference <= 0) throw new Error('Indice de référence invalide');
  const nouveauLoyer = Math.round(loyerActuel * (nouvelIndice / indiceReference) * 100) / 100;
  const augmentation = Math.round((nouveauLoyer - loyerActuel) * 100) / 100;
  const pct = Math.round(((nouvelIndice / indiceReference) - 1) * 10000) / 100;
  return { nouveauLoyer, augmentation, pct };
}

/**
 * Plafond légal du dépôt de garantie en meublé : 2 mois de loyer hors charges.
 * Interdit pour le bail mobilité.
 */
export function depotGarantieMax(typeBail: TypeBail, loyerHC: number): number {
  return typeBail === 'mobilite' ? 0 : loyerHC * 2;
}

export function validerDepotGarantie(
  typeBail: TypeBail,
  loyerHC: number,
  depot: number,
): { valide: boolean; message?: string } {
  const max = depotGarantieMax(typeBail, loyerHC);
  if (typeBail === 'mobilite' && depot > 0) {
    return {
      valide: false,
      message: 'Le dépôt de garantie est interdit pour un bail mobilité (loi ELAN).',
    };
  }
  if (depot < 0) return { valide: false, message: 'Le dépôt de garantie ne peut pas être négatif.' };
  if (depot > max) {
    return {
      valide: false,
      message: `Le dépôt de garantie ne peut pas dépasser 2 mois de loyer hors charges, soit ${max.toFixed(2)} € (art. 25-6, loi du 6 juillet 1989).`,
    };
  }
  return { valide: true };
}

/** Durées autorisées par type de bail (en mois). */
export function validerDuree(typeBail: TypeBail, dureeMois: number): { valide: boolean; message?: string } {
  switch (typeBail) {
    case 'meuble_1an':
      return dureeMois === 12
        ? { valide: true }
        : { valide: false, message: 'Le bail meublé de résidence principale dure 1 an (12 mois), renouvelable par tacite reconduction.' };
    case 'meuble_etudiant_9mois':
      return dureeMois === 9
        ? { valide: true }
        : { valide: false, message: 'Le bail étudiant meublé dure 9 mois, non renouvelable.' };
    case 'mobilite':
      return dureeMois >= 1 && dureeMois <= 10
        ? { valide: true }
        : { valide: false, message: 'Le bail mobilité dure de 1 à 10 mois (loi ELAN).' };
  }
}

/**
 * Coefficient de vétusté restant à la charge du locataire.
 * Après la franchise, un abattement annuel s'applique ; une part résiduelle
 * minimale de 10 % reste à la charge du locataire tant que le poste n'a pas
 * dépassé sa durée de vie théorique (0 % au-delà).
 */
export function coefficientVetuste(ligne: LigneVetuste, ageAnnees: number): number {
  if (ageAnnees >= ligne.dureeVieAnnees) return 0;
  const anneesAbattues = Math.max(0, ageAnnees - ligne.franchiseAnnees);
  const coef = 1 - (anneesAbattues * ligne.abattementAnnuelPct) / 100;
  return Math.max(0.1, Math.round(coef * 100) / 100);
}

/** Retenue applicable = coût de remise en état × coefficient de vétusté. */
export function retenueApresVetuste(cout: number, ligne: LigneVetuste | undefined, ageAnnees: number): number {
  const coef = ligne ? coefficientVetuste(ligne, ageAnnees) : 1;
  return Math.round(cout * coef * 100) / 100;
}

export interface LigneRetenue {
  pieceNom: string;
  elementNom: string;
  description: string;
  cout: number;
  coefVetuste: number;
  retenue: number;
}

export function totalRetenues(lignes: LigneRetenue[]): number {
  return Math.round(lignes.reduce((s, l) => s + l.retenue, 0) * 100) / 100;
}

/**
 * Délai légal de restitution du dépôt de garantie :
 * 1 mois si l'EDL de sortie est conforme à l'entrée, 2 mois sinon.
 */
export function delaiRestitutionJours(retenues: boolean): number {
  return retenues ? 60 : 30;
}

export function formatEuros(montant: number): string {
  // Les espaces insécables (étroites) d'Intl ne sont pas couvertes par la police
  // Helvetica des PDF : on les remplace par des espaces simples.
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(montant)
    .replace(/[  ]/g, ' ');
}
