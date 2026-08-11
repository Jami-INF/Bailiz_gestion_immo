import { db, prochaineReference } from './db';
import { uid, nowISO } from './ids';
import { construirePiecesSortie } from './etat';
import { BIBLIOTHEQUE_PIECES, MOBILIER_OBLIGATOIRE } from './defauts';
import type { Bail, Bien, ElementEDL, EtatDesLieux, PieceEDL, PieceModele } from '@/types';

/**
 * Compteurs pré-remplis : numéros repris du logement (ou, à défaut, de l'EDL
 * d'entrée), relevés remis à zéro — un numéro de compteur (PDL, PCE, n° de
 * série) appartient au logement et ne change pas d'un locataire à l'autre.
 */
export function compteursInitiaux(bien: Bien, edlEntree?: EtatDesLieux): EtatDesLieux['compteurs'] {
  const duBien = bien.compteurs?.length
    ? bien.compteurs.map((c) => ({ type: c.type, numero: c.numero, releve: 0 }))
    : undefined;
  const deLEntree = edlEntree?.compteurs.length
    ? edlEntree.compteurs.map((c) => ({ type: c.type, numero: c.numero, releve: 0 }))
    : undefined;
  return (
    duBien ??
    deLEntree ?? [
      { type: 'electricite' as const, releve: 0 },
      { type: 'eau_froide' as const, releve: 0 },
    ]
  );
}

/**
 * Trame neuve : les pièces du logement, suivies de l'inventaire du mobilier
 * obligatoire du meublé (décret n°2015-981), qui forme sa propre rubrique.
 */
export function construirePiecesNeuves(piecesModele: PieceModele[]): PieceEDL[] {
  return [
    ...piecesModele.map((p, i) => ({
      id: uid(),
      nom: p.nom,
      ordre: i,
      elements: p.elements.map(
        (e): ElementEDL => ({
          id: uid(),
          nom: e.nom,
          categorie: e.categorie,
          quantite: e.categorie === 'mobilier' ? e.quantite ?? 1 : undefined,
          obligatoireDecret: e.obligatoireDecret,
          photoIds: [],
        }),
      ),
    })),
    {
      id: uid(),
      nom: 'Mobilier obligatoire (décret n°2015-981)',
      ordre: piecesModele.length,
      elements: MOBILIER_OBLIGATOIRE.map(
        (nom): ElementEDL => ({
          id: uid(),
          nom,
          categorie: 'mobilier',
          quantite: 1,
          obligatoireDecret: true,
          photoIds: [],
        }),
      ),
    },
  ];
}

/** Convertit un modèle de la bibliothèque en pièce du logement. */
export function pieceDepuisModele(nomModele: string, ordre: number, suffixe?: number): PieceModele {
  const modele = BIBLIOTHEQUE_PIECES.find((m) => m.nom === nomModele);
  return {
    id: uid(),
    nom: suffixe ? `${nomModele} ${suffixe}` : nomModele,
    ordre,
    elements: (modele?.elements ?? []).map((e) => ({ id: uid(), ...e })),
  };
}

/**
 * Trame proposée pour un logement qui n'a pas encore de pièces : déduite de son
 * type et de son nombre de pièces.
 *
 * Une proposition, pas une contrainte — elle s'ajuste dans le formulaire, et le
 * terrain l'enrichit de toute façon. Le but est qu'un état des lieux commencé
 * sur un logement créé à la volée ne s'ouvre pas sur une liste vide.
 */
export function trameProposee(bien: Pick<Bien, 'type' | 'nbPieces'>): PieceModele[] {
  // Le « nombre de pièces » compte les pièces principales : séjour compris.
  // T1/T1bis n'ont pas de chambre séparée.
  const chambres =
    bien.type === 'T1' || bien.type === 'T1bis' ? 0 : Math.max(0, (bien.nbPieces || 1) - 1);
  const noms = [
    'Entrée',
    'Séjour',
    ...Array.from({ length: chambres }, () => 'Chambre'),
    'Cuisine',
    'Salle de bain',
    'WC',
  ];
  let rangChambre = 0;
  return noms.map((nom, i) => {
    if (nom !== 'Chambre' || chambres <= 1) return pieceDepuisModele(nom, i);
    rangChambre += 1;
    return pieceDepuisModele(nom, i, rangChambre);
  });
}

export interface CreationEtatDesLieux {
  type: 'entree' | 'sortie';
  bien: Bien;
  locataireIds: string[];
  /** Absent : constat établi sans bail rédigé dans l'application. */
  bail?: Bail;
  /** EDL d'entrée de l'application servant de référence à une sortie. */
  edlEntree?: EtatDesLieux;
  depotGarantie?: number;
  bailExterne?: EtatDesLieux['bailExterne'];
  origineEtatEntree?: EtatDesLieux['origineEtatEntree'];
  dateEdlEntreePapier?: string;
  /**
   * Trame retenue quand le logement n'en porte pas encore (créé à la volée) :
   * choisie dans la bibliothèque de pièces. Ignorée si le bien a des pièces.
   */
  piecesModele?: PieceModele[];
}

/**
 * Crée et enregistre un état des lieux — **seul chemin de création**, appelé
 * aussi bien depuis la fiche d'un bail que depuis le formulaire rapide.
 *
 * Une sortie sans EDL d'entrée dans l'application n'est pas refusée : l'entrée a
 * pu être établie sur papier, ou ne pas avoir été établie du tout. La trame est
 * alors neuve et la colonne « à l'entrée » se remplit à la main
 * (`origineEtatEntree`), plutôt que d'exiger la saisie rétroactive d'un état des
 * lieux d'entrée fictif.
 */
export async function creerEtatDesLieux(p: CreationEtatDesLieux): Promise<EtatDesLieux> {
  const trame = p.bien.piecesModele.length ? p.bien.piecesModele : p.piecesModele ?? [];
  const reference = await prochaineReference('edl');
  const maintenant = nowISO();
  const edl: EtatDesLieux = {
    id: uid(),
    reference,
    bailId: p.bail?.id,
    bienId: p.bien.id,
    locataireIds: p.locataireIds,
    depotGarantie: p.depotGarantie,
    bailExterne: p.bailExterne,
    type: p.type,
    date: maintenant,
    edlEntreeLieId: p.type === 'sortie' ? p.edlEntree?.id : undefined,
    origineEtatEntree:
      p.type === 'sortie'
        ? p.edlEntree
          ? 'edl_app'
          : p.origineEtatEntree ?? 'aucun'
        : undefined,
    dateEdlEntreePapier: p.type === 'sortie' ? p.dateEdlEntreePapier : undefined,
    compteurs: compteursInitiaux(p.bien, p.edlEntree),
    cles: [{ designation: "Clé porte d'entrée", nombre: 1 }],
    pieces: p.edlEntree ? construirePiecesSortie(p.edlEntree) : construirePiecesNeuves(trame),
    statut: 'brouillon',
    avenants: [],
    createdAt: maintenant,
    updatedAt: maintenant,
  };
  await db.edls.add(edl);
  return edl;
}

/**
 * Dépôt de garantie applicable : celui déclaré sur l'état des lieux d'abord,
 * celui du bail ensuite. Une seule règle, pour qu'aucun écran n'annonce un
 * solde différent d'un autre.
 */
export function depotGarantieEdl(
  edl: Pick<EtatDesLieux, 'depotGarantie'>,
  bail?: Pick<Bail, 'depotGarantie'>,
): number {
  return edl.depotGarantie ?? bail?.depotGarantie ?? 0;
}
