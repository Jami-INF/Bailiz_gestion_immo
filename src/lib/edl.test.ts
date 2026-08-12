import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { completerContexteEdl } from './etat';
import { compteursInitiaux, creerEtatDesLieux, depotGarantieEdl } from './edl';
import { MOBILIER_OBLIGATOIRE } from './defauts';
import { BIBLIOTHEQUE_PIECES } from './defauts';
import { unBail, unBien, unEdl } from '@/test/utils';
import type { EtatDesLieux } from '@/types';

beforeEach(async () => {
  await Promise.all([db.edls.clear(), db.biens.clear(), db.baux.clear(), db.parametres.clear()]);
});

describe('creerEtatDesLieux - entrée', () => {
  it("crée un EDL sans bail : le contexte est porté par l'état des lieux lui-même", async () => {
    const bien = unBien({ piecesModele: [{ id: 'pm-1', nom: 'Séjour', ordre: 0, elements: [] }] });
    const edl = await creerEtatDesLieux({
      type: 'entree',
      bien,
      locataireIds: ['loc-1', 'loc-2'],
      depotGarantie: 1400,
    });

    expect(edl.bailId).toBeUndefined();
    expect(edl.bienId).toBe(bien.id);
    expect(edl.locataireIds).toEqual(['loc-1', 'loc-2']);
    expect(edl.depotGarantie).toBe(1400);
    expect(await db.edls.get(edl.id)).toBeDefined();
  });

  it('rattache le bail et reprend son dépôt quand il y en a un', async () => {
    const bien = unBien();
    const bail = unBail({ depotGarantie: 1200 });
    const edl = await creerEtatDesLieux({
      type: 'entree',
      bien,
      locataireIds: bail.locataireIds,
      bail,
      depotGarantie: bail.depotGarantie,
    });

    expect(edl.bailId).toBe(bail.id);
    expect(edl.depotGarantie).toBe(1200);
    // Une entrée n'a pas de provenance d'état d'entrée : le champ n'a de sens
    // que pour une sortie.
    expect(edl.origineEtatEntree).toBeUndefined();
  });

  it("ajoute l'inventaire du mobilier obligatoire à la trame du logement", async () => {
    const bien = unBien({ piecesModele: [{ id: 'pm-1', nom: 'Séjour', ordre: 0, elements: [] }] });
    const edl = await creerEtatDesLieux({ type: 'entree', bien, locataireIds: [] });

    const mobilier = edl.pieces.find((p) => p.nom.startsWith('Mobilier obligatoire'));
    expect(mobilier?.elements).toHaveLength(MOBILIER_OBLIGATOIRE.length);
    expect(mobilier?.elements.every((e) => e.obligatoireDecret)).toBe(true);
  });

  it("retient la trame choisie quand le logement n'a pas encore de pièces", async () => {
    const bien = unBien({ piecesModele: [] });
    const trame = BIBLIOTHEQUE_PIECES.slice(0, 2).map((m, i) => ({
      id: `pm-${i}`,
      nom: m.nom,
      ordre: i,
      elements: [],
    }));
    const edl = await creerEtatDesLieux({
      type: 'entree',
      bien,
      locataireIds: [],
      piecesModele: trame,
    });

    expect(edl.pieces.map((p) => p.nom)).toEqual([
      ...trame.map((t) => t.nom),
      expect.stringContaining('Mobilier obligatoire'),
    ]);
  });

  it("ignore la trame proposée si le logement porte déjà ses pièces - le bien fait foi", async () => {
    const bien = unBien({ piecesModele: [{ id: 'pm-1', nom: 'Chambre', ordre: 0, elements: [] }] });
    const edl = await creerEtatDesLieux({
      type: 'entree',
      bien,
      locataireIds: [],
      piecesModele: [{ id: 'x', nom: 'Garage', ordre: 0, elements: [] }],
    });

    expect(edl.pieces.map((p) => p.nom)).toContain('Chambre');
    expect(edl.pieces.map((p) => p.nom)).not.toContain('Garage');
  });
});

describe('creerEtatDesLieux - sortie', () => {
  it("duplique la structure et les états de l'EDL d'entrée quand il existe", async () => {
    const bien = unBien();
    const entree = unEdl({
      id: 'edl-entree',
      pieces: [
        {
          id: 'p1',
          nom: 'Séjour',
          ordre: 0,
          elements: [{ id: 'e1', nom: 'Sol', categorie: 'sol', etat: 'bon', photoIds: [] }],
        },
      ],
    });
    const sortie = await creerEtatDesLieux({
      type: 'sortie',
      bien,
      locataireIds: ['loc-1'],
      edlEntree: entree,
    });

    expect(sortie.origineEtatEntree).toBe('edl_app');
    expect(sortie.edlEntreeLieId).toBe('edl-entree');
    expect(sortie.pieces[0].elements[0].etatEntree).toBe('bon');
    expect(sortie.pieces[0].elements[0].etat).toBeUndefined();
  });

  it("accepte une sortie sans EDL d'entrée : trame neuve, colonne d'entrée à remplir à la main", async () => {
    const bien = unBien({ piecesModele: [{ id: 'pm-1', nom: 'Séjour', ordre: 0, elements: [] }] });
    const sortie = await creerEtatDesLieux({
      type: 'sortie',
      bien,
      locataireIds: ['loc-1'],
      origineEtatEntree: 'edl_papier',
      dateEdlEntreePapier: '2023-09-01',
    });

    expect(sortie.edlEntreeLieId).toBeUndefined();
    expect(sortie.origineEtatEntree).toBe('edl_papier');
    expect(sortie.dateEdlEntreePapier).toBe('2023-09-01');
    expect(sortie.pieces.map((p) => p.nom)).toContain('Séjour');
  });

  it("retombe sur « aucun » quand la provenance de l'état d'entrée n'est pas déclarée", async () => {
    const sortie = await creerEtatDesLieux({
      type: 'sortie',
      bien: unBien(),
      locataireIds: [],
    });

    expect(sortie.origineEtatEntree).toBe('aucun');
  });
});

describe('compteursInitiaux', () => {
  it('reprend les numéros du logement en priorité, relevés remis à zéro', () => {
    const bien = unBien({ compteurs: [{ type: 'electricite', numero: 'PDL-42' }] });
    expect(compteursInitiaux(bien)).toEqual([{ type: 'electricite', numero: 'PDL-42', releve: 0 }]);
  });

  it("retombe sur ceux de l'EDL d'entrée si le logement n'en porte pas", () => {
    const bien = unBien({ compteurs: [] });
    const entree = unEdl({ compteurs: [{ type: 'gaz', numero: 'PCE-7', releve: 812 }] });
    expect(compteursInitiaux(bien, entree)).toEqual([{ type: 'gaz', numero: 'PCE-7', releve: 0 }]);
  });
});

describe('depotGarantieEdl', () => {
  it("préfère le montant déclaré sur l'état des lieux à celui du bail", () => {
    expect(depotGarantieEdl({ depotGarantie: 900 }, { depotGarantie: 1200 })).toBe(900);
  });

  it('retombe sur le bail, puis sur zéro', () => {
    expect(depotGarantieEdl({ depotGarantie: undefined }, { depotGarantie: 1200 })).toBe(1200);
    expect(depotGarantieEdl({ depotGarantie: undefined }, undefined)).toBe(0);
  });
});

describe('completerContexteEdl', () => {
  it('reconstruit logement et parties depuis le bail', () => {
    const edl = completerContexteEdl({ bailId: 'bail-1' }, { bienId: 'bien-9', locataireIds: ['a', 'b'] });
    expect(edl).toMatchObject({ bienId: 'bien-9', locataireIds: ['a', 'b'] });
  });

  it("n'écrase jamais un contexte déjà présent - appliquée deux fois, elle ne change rien", () => {
    const bail = { bienId: 'bien-9', locataireIds: ['a'] };
    const une = completerContexteEdl({ bienId: 'bien-1', locataireIds: ['z'] }, bail);
    const deux = completerContexteEdl({ ...une }, bail);
    expect(une).toEqual(deux);
    expect(une.bienId).toBe('bien-1');
  });

  it("tolère un bail introuvable : l'EDL reste lisible plutôt que de faire échouer la migration", () => {
    const edl = completerContexteEdl<Partial<EtatDesLieux>>({ bailId: 'disparu' }, undefined);
    expect(edl.bienId).toBeUndefined();
    expect(edl.locataireIds).toEqual([]);
  });
});
