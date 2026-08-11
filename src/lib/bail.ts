import { addMonths, isAfter, isBefore, subMonths } from 'date-fns';
import type { Bail, RevisionLoyer } from '@/types';

/**
 * Un bail « en cours » : engagé et pas encore clos. Le logement est donc loué,
 * ses échéances (fin de bail, révision) doivent être suivies, et le locataire
 * ne peut pas être effacé.
 *
 * `genere` en fait partie : c'est l'état d'un bail enregistré depuis le
 * formulaire, et il n'en sort **que par une action manuelle**. L'exclure — ce
 * que faisait le tableau de bord — laissait le logement affiché « Vacant » et
 * l'échéancier vide tant que l'utilisateur n'avait pas pensé à cliquer
 * « Marquer le logement loué ».
 *
 * `brouillon` reste dehors : rien n'a encore été produit.
 */
export function estBailEnCours(bail: Pick<Bail, 'statut'>): boolean {
  return bail.statut === 'genere' || bail.statut === 'signe' || bail.statut === 'actif';
}

/** Dernière révision IRL appliquée, la plus récente d'abord. */
export function derniereRevision(bail: Pick<Bail, 'revisionsLoyer'>): RevisionLoyer | undefined {
  const revisions = bail.revisionsLoyer;
  if (!revisions?.length) return undefined;
  const triees = [...revisions].sort((a, b) => a.dateApplication.localeCompare(b.dateApplication));
  return triees[triees.length - 1];
}

/**
 * Loyer hors charges réellement dû aujourd'hui.
 *
 * `bail.loyerHC` reste le loyer **d'origine**, celui du contrat imprimé et
 * signé : le bail se régénère à l'identique, une révision n'est pas une
 * réécriture du contrat. Le loyer courant se lit donc dans l'historique des
 * révisions.
 */
export function loyerCourant(bail: Pick<Bail, 'loyerHC' | 'revisionsLoyer'>): number {
  return derniereRevision(bail)?.nouveauLoyer ?? bail.loyerHC;
}

/**
 * Base de la prochaine révision : le loyer et l'indice à partir desquels
 * calculer. Après une première révision, c'est le loyer révisé et l'indice
 * alors retenu — sinon les valeurs du contrat.
 */
export function baseRevisionIRL(bail: Bail): { loyer: number; indice: number; trimestre: string } {
  const derniere = derniereRevision(bail);
  if (derniere) {
    return {
      loyer: derniere.nouveauLoyer,
      indice: derniere.nouvelIndice,
      trimestre: derniere.nouveauTrimestre,
    };
  }
  return {
    loyer: bail.loyerHC,
    indice: bail.revisionIRL.valeurIndice,
    trimestre: bail.revisionIRL.trimestreReference,
  };
}

export interface TermeDuBail {
  /** Terme du bail : `dateEffet + dureeMois`. */
  date: Date;
  /**
   * Vrai si le bail se **reconduit tacitement** faute de congé — meublé d'un an.
   * Faux s'il prend fin de plein droit : bail étudiant de neuf mois et bail
   * mobilité, ni renouvelables ni reconductibles.
   */
  reconduction: boolean;
  /**
   * Date limite pour donner congé en tant que bailleur : trois mois avant le
   * terme (art. 25-8). Absente quand le bail s'arrête de lui-même — il n'y a
   * alors aucun congé à donner, et annoncer une échéance ferait croire le
   * contraire.
   */
  limiteConge?: Date;
}

/**
 * Ce qui arrive au terme du bail.
 *
 * L'échéancier annonçait « Fin de bail » pour tous les types, y compris le
 * meublé d'un an — qui se **reconduit** faute de congé. Le message laissait
 * croire que le logement se libérait tout seul, et masquait la seule échéance
 * qui compte vraiment : la date après laquelle il est trop tard pour donner
 * congé.
 */
export function termeDuBail(bail: Pick<Bail, 'dateEffet' | 'dureeMois' | 'typeBail'>): TermeDuBail {
  const date = addMonths(new Date(bail.dateEffet), bail.dureeMois);
  const reconduction = bail.typeBail === 'meuble_1an';
  return {
    date,
    reconduction,
    limiteConge: reconduction ? subMonths(date, 3) : undefined,
  };
}

/** Anniversaire du bail pour une année donnée. */
function anniversaire(dateEffet: Date, annee: number): Date {
  const d = new Date(dateEffet);
  d.setFullYear(annee);
  return d;
}

/**
 * Date à laquelle le loyer révisé s'applique.
 *
 * La révision joue à la date anniversaire du bail. Demandée après cette date,
 * elle **ne rétroagit pas** : elle prend effet à compter de la demande
 * (art. 17-1, I, al. 2 de la loi du 6 juillet 1989). Le courrier annonçait
 * jusqu'ici l'anniversaire de l'année civile en cours, donc une date passée dès
 * qu'on s'y prenait en retard — précisément le cas où la règle compte.
 */
export function dateApplicationRevision(bail: Bail, aujourdhui = new Date()): Date {
  const effet = new Date(bail.dateEffet);

  // Dernier anniversaire échu (au plus tôt la date d'effet elle-même).
  let dernier = anniversaire(effet, aujourdhui.getFullYear());
  if (isAfter(dernier, aujourdhui)) dernier = anniversaire(effet, aujourdhui.getFullYear() - 1);

  // Première année du bail : la révision ne joue qu'au premier anniversaire.
  if (!isAfter(dernier, effet)) return anniversaire(effet, effet.getFullYear() + 1);

  // Cycle déjà révisé : la révision suivante joue au prochain anniversaire.
  const derniere = derniereRevision(bail);
  if (derniere && !isBefore(new Date(derniere.dateApplication), dernier)) {
    return anniversaire(effet, dernier.getFullYear() + 1);
  }

  // Révision du cycle en cours, demandée en retard : effet à la demande.
  return aujourdhui;
}
