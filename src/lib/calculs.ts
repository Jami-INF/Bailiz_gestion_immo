import { addMonths } from 'date-fns';
import type { ClasseDPE, LigneVetuste, TypeBail } from '@/types';

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
 * Décence énergétique (loi Climat et résilience, art. 6 loi du 6 juillet 1989) :
 * un logement classé G ne peut plus être mis en location depuis le 1er janvier 2025,
 * F à compter de 2028, E à compter de 2034.
 */
export function validerDecenceDPE(
  classe: ClasseDPE | undefined,
  dateEffet: Date,
): { valide: boolean; bloquant: boolean; message?: string } {
  if (!classe) {
    return {
      valide: true,
      bloquant: false,
      message:
        'La classe DPE du bien n’est pas renseignée : c’est une mention du bail type et elle conditionne le droit de louer (G interdit depuis 2025).',
    };
  }
  const annee = dateEffet.getFullYear();
  const seuils: Partial<Record<ClasseDPE, number>> = { G: 2025, F: 2028, E: 2034 };
  const anneeInterdiction = seuils[classe];
  if (anneeInterdiction !== undefined && annee >= anneeInterdiction) {
    return {
      valide: false,
      bloquant: true,
      message: `Un logement classé ${classe} au DPE ne répond plus aux critères de décence depuis le 1er janvier ${anneeInterdiction} : sa mise en location est interdite (loi Climat et résilience). Réalisez des travaux de rénovation énergétique ou un nouveau DPE avant de louer.`,
    };
  }
  if (anneeInterdiction !== undefined) {
    return {
      valide: true,
      bloquant: false,
      message: `Classe ${classe} : la location de ce logement sera interdite à compter du 1er janvier ${anneeInterdiction} (loi Climat et résilience). Anticipez les travaux de rénovation énergétique.`,
    };
  }
  return { valide: true, bloquant: false };
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
 * Délai légal de restitution du dépôt de garantie (art. 22 de la loi du 6
 * juillet 1989) : un mois si l'état des lieux de sortie est conforme à celui
 * d'entrée, deux mois sinon.
 *
 * Exprimé en **mois**, comme la loi : compter 30 ou 60 jours décalait
 * l'échéance jusqu'à deux jours selon le mois de la remise des clés — et la
 * majoration de retard court par mois commencé.
 */
export function delaiRestitutionMois(retenues: boolean): number {
  return retenues ? 2 : 1;
}

/** Date limite de restitution, comptée depuis la remise des clés. */
export function dateLimiteRestitution(remiseDesCles: Date, retenues: boolean): Date {
  return addMonths(remiseDesCles, delaiRestitutionMois(retenues));
}

/** Taille de fichier lisible (Mo au-delà du millier de Ko), pour le stockage occupé. */
export function formatOctets(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  const ko = octets / 1024;
  if (ko < 1024) return `${Math.round(ko)} Ko`;
  const mo = ko / 1024;
  if (mo < 1024) return `${mo.toFixed(mo < 10 ? 1 : 0)} Mo`;
  return `${(mo / 1024).toFixed(1)} Go`;
}

export function formatEuros(montant: number): string {
  // Deux contraintes de la police Helvetica des PDF (react-pdf) :
  // - les espaces insécables (étroites) d'Intl n'y sont pas couvertes → espaces simples ;
  // - l'espace qui suit le symbole « € » est avalée au calcul de la ligne, ce qui
  //   colle le mot suivant au montant (« 520,00 €hors charges »). Une espace de
  //   largeur nulle (U+200B) en fin de chaîne la préserve, tout en restant
  //   invisible partout ailleurs (écran, copier-coller).
  const formate = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
    .format(montant)
    .replace(/[\u202f\u00a0]/g, ' ');
  return formate + '\u200b';
}
