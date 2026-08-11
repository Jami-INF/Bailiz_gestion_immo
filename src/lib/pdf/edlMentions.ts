import type { Bail, EtatDesLieux } from '@/types';
import { formatDateFr } from './commun';

/**
 * Mentions de rattachement et de provenance imprimées en tête d'un état des
 * lieux. Isolées du composant : ce sont elles qui portent la valeur juridique du
 * document, elles doivent être vérifiables sans passer par le rendu d'un PDF —
 * dont les flux sont compressés, donc illisibles à l'assertion.
 */

/**
 * Désignation du contrat auquel l'état des lieux se rattache. Un état des lieux
 * est un acte autonome : à défaut de bail enregistré, le document reste valable
 * et annonce simplement qu'il a vocation à être annexé au contrat.
 */
export function mentionBail(bail?: Bail, externe?: EtatDesLieux['bailExterne']): string {
  if (bail) return `Bail ${bail.reference}.`;
  if (externe?.reference || externe?.dateEffet) {
    const ref = externe.reference ? `Bail ${externe.reference}` : 'Bail';
    const effet = externe.dateEffet ? ` prenant effet le ${formatDateFr(externe.dateEffet)}` : '';
    return `${ref}${effet} — contrat établi hors application. À annexer au contrat de location.`;
  }
  return 'À annexer au contrat de location.';
}

/**
 * Provenance des états d'entrée servant de référence à une sortie.
 *
 * Sans état des lieux d'entrée, le logement est réputé avoir été reçu en bon
 * état (art. 1731 du code civil) : le document doit le dire, sous peine de
 * laisser croire qu'il fonde des retenues qu'il ne fonde pas.
 */
export function mentionOrigineEntree(
  edl: Pick<EtatDesLieux, 'type' | 'origineEtatEntree' | 'dateEdlEntreePapier'>,
): string | null {
  if (edl.type !== 'sortie') return null;
  if (edl.origineEtatEntree === 'edl_papier') {
    const date = edl.dateEdlEntreePapier ? ` le ${formatDateFr(edl.dateEdlEntreePapier)}` : '';
    return `Les états figurant en colonne « État entrée » sont reportés de l'état des lieux d'entrée établi contradictoirement${date}, hors application. L'exemplaire d'origine reste la pièce de référence et doit être conservé.`;
  }
  if (edl.origineEtatEntree === 'aucun') {
    return "Aucun état des lieux d'entrée n'a été établi. À défaut d'état des lieux d'entrée, le logement est réputé avoir été reçu en bon état de réparations locatives (art. 1731 du code civil), sauf lorsque le bailleur a été empêché de l'établir (art. 3-2 de la loi du 6 juillet 1989). Le présent document constate l'état du logement à la sortie ; il ne fonde à lui seul aucune retenue sur le dépôt de garantie.";
  }
  return null;
}
