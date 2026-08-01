import { describe, expect, it } from 'vitest';
import type { EtatDesLieux } from '@/types';
import { construirePiecesSortie, elementsDegrades, estDegradation, progressionEDL } from './etat';

function edlEntreeFixture(): EtatDesLieux {
  return {
    id: 'edl-entree',
    reference: 'EDL-2026-0001',
    bailId: 'bail-1',
    type: 'entree',
    date: '2026-01-01T10:00:00.000Z',
    compteurs: [],
    cles: [],
    pieces: [
      {
        id: 'p1',
        nom: 'Séjour',
        ordre: 0,
        elements: [
          { id: 'e1', nom: 'Sol', categorie: 'sol', etat: 'tres_bon', commentaire: 'RAS', photoIds: ['ph1'] },
          { id: 'e2', nom: 'Murs', categorie: 'mur', etat: 'bon', photoIds: [] },
        ],
      },
    ],
    statut: 'signe',
    avenants: [],
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  };
}

describe('estDegradation', () => {
  it('détecte une baisse d’état (ordre neuf > très bon > bon > usagé > mauvais)', () => {
    expect(estDegradation('tres_bon', 'usage')).toBe(true);
    expect(estDegradation('bon', 'mauvais')).toBe(true);
    expect(estDegradation('bon', 'bon')).toBe(false);
    expect(estDegradation('usage', 'neuf')).toBe(false);
  });

  it('ne signale rien si un des états manque', () => {
    expect(estDegradation(undefined, 'bon')).toBe(false);
    expect(estDegradation('bon', undefined)).toBe(false);
  });
});

describe('construirePiecesSortie', () => {
  it('duplique la structure et reporte les états d’entrée en référence', () => {
    const pieces = construirePiecesSortie(edlEntreeFixture());
    expect(pieces).toHaveLength(1);
    const sol = pieces[0].elements[0];
    expect(sol.nom).toBe('Sol');
    expect(sol.etatEntree).toBe('tres_bon');
    expect(sol.commentaireEntree).toBe('RAS');
    expect(sol.photoIdsEntree).toEqual(['ph1']);
    expect(sol.etat).toBeUndefined(); // état de sortie à saisir
    expect(sol.photoIds).toEqual([]); // nouvelles photos de sortie
    expect(sol.id).not.toBe('e1'); // nouveaux identifiants
  });
});

describe('progressionEDL', () => {
  it('compte les éléments renseignés', () => {
    const pieces = construirePiecesSortie(edlEntreeFixture());
    expect(progressionEDL(pieces)).toEqual({ total: 2, renseignes: 0, pct: 0 });
    pieces[0].elements[0].etat = 'bon';
    expect(progressionEDL(pieces)).toEqual({ total: 2, renseignes: 1, pct: 50 });
  });
});

describe('elementsDegrades', () => {
  it('extrait les éléments marqués en dégradation pour la synthèse', () => {
    const edl = edlEntreeFixture();
    const sortie: EtatDesLieux = {
      ...edl,
      id: 'edl-sortie',
      type: 'sortie',
      pieces: construirePiecesSortie(edl),
    };
    sortie.pieces[0].elements[0].etat = 'mauvais';
    sortie.pieces[0].elements[0].degradation = true;
    sortie.pieces[0].elements[1].etat = 'bon';
    const degrades = elementsDegrades(sortie);
    expect(degrades).toHaveLength(1);
    expect(degrades[0].pieceNom).toBe('Séjour');
    expect(degrades[0].element.nom).toBe('Sol');
  });
});

describe('EDL enrichi (quantités et éléments manquants)', () => {
  it('reporte quantité et postes obligatoires du décret sur l’EDL de sortie', () => {
    const entree = edlEntreeFixture();
    entree.pieces.push({
      id: 'pm',
      nom: 'Mobilier obligatoire (décret n°2015-981)',
      ordre: 1,
      elements: [
        { id: 'm1', nom: 'Literie', categorie: 'mobilier', quantite: 2, obligatoireDecret: true, etat: 'bon', photoIds: [] },
      ],
    });
    const pieces = construirePiecesSortie(entree);
    const literie = pieces[1].elements[0];
    expect(literie.quantite).toBe(2);
    expect(literie.obligatoireDecret).toBe(true);
    // L'état de sortie reste à saisir, celui d'entrée sert de référence.
    expect(literie.etat).toBeUndefined();
    expect(literie.etatEntree).toBe('bon');
  });

  it('compte un élément marqué manquant comme renseigné dans la progression', () => {
    const pieces = [
      {
        id: 'p1',
        nom: 'Séjour',
        ordre: 0,
        elements: [
          { id: 'a', nom: 'Sol', categorie: 'sol' as const, etat: 'bon' as const, photoIds: [] },
          { id: 'b', nom: 'Canapé', categorie: 'mobilier' as const, manquant: true, photoIds: [] },
          { id: 'c', nom: 'Table', categorie: 'mobilier' as const, photoIds: [] },
        ],
      },
    ];
    const prog = progressionEDL(pieces);
    expect(prog.total).toBe(3);
    expect(prog.renseignes).toBe(2);
  });
});

