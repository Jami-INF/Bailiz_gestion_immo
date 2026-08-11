import { ETAT_ORDRE, type EtatDesLieux, type EtatNote, type PieceEDL } from '@/types';
import { uid } from './ids';

/** Vrai si l'état de sortie est strictement inférieur à l'état d'entrée. */
export function estDegradation(etatEntree: EtatNote | undefined, etatSortie: EtatNote | undefined): boolean {
  if (!etatEntree || !etatSortie) return false;
  return ETAT_ORDRE[etatSortie] < ETAT_ORDRE[etatEntree];
}

/**
 * Construit les pièces d'un EDL de sortie en dupliquant la structure de
 * l'EDL d'entrée : les états d'entrée sont reportés en référence, les états
 * de sortie restent à saisir.
 */
export function construirePiecesSortie(edlEntree: EtatDesLieux): PieceEDL[] {
  return edlEntree.pieces.map((piece) => ({
    id: uid(),
    nom: piece.nom,
    ordre: piece.ordre,
    elements: piece.elements.map((el) => ({
      id: uid(),
      nom: el.nom,
      categorie: el.categorie,
      quantite: el.quantite,
      obligatoireDecret: el.obligatoireDecret,
      etat: undefined,
      commentaire: undefined,
      photoIds: [],
      etatEntree: el.etat,
      commentaireEntree: el.commentaire,
      photoIdsEntree: el.photoIds,
      degradation: false,
    })),
  }));
}

export interface ProgressionEDL {
  total: number;
  renseignes: number;
  pct: number;
}

export function progressionEDL(pieces: PieceEDL[]): ProgressionEDL {
  const elements = pieces.flatMap((p) => p.elements);
  const total = elements.length;
  const renseignes = elements.filter((e) => e.etat !== undefined || e.manquant).length;
  return { total, renseignes, pct: total === 0 ? 0 : Math.round((renseignes / total) * 100) };
}

export interface ElementNonRenseigne {
  pieceId: string;
  pieceNom: string;
  elementId: string;
  elementNom: string;
}

/**
 * Éléments dont l'état n'a pas encore été statué, dans l'ordre des pièces.
 *
 * Un élément marqué « manquant » compte comme renseigné : c'est une décision,
 * pas un oubli. Sert au récapitulatif cliquable avant signature — une barre de
 * progression dit qu'il reste du travail, elle ne dit pas *où*.
 */
export function elementsNonRenseignes(pieces: PieceEDL[]): ElementNonRenseigne[] {
  return [...pieces]
    .sort((a, b) => a.ordre - b.ordre)
    .flatMap((piece) =>
      piece.elements
        .filter((el) => el.etat === undefined && !el.manquant)
        .map((el) => ({
          pieceId: piece.id,
          pieceNom: piece.nom,
          elementId: el.id,
          elementNom: el.nom,
        })),
    );
}

/** Liste des éléments dégradés d'un EDL de sortie (pour la synthèse comparative). */
export function elementsDegrades(edlSortie: EtatDesLieux) {
  return edlSortie.pieces.flatMap((piece) =>
    piece.elements
      .filter((el) => el.degradation)
      .map((el) => ({ pieceNom: piece.nom, element: el })),
  );
}
