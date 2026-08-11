import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { db } from '@/lib/db';
import { EdlTerrainPage } from './EdlTerrainPage';
import { rendreRoute, semer, unEdl, utilisateur, viderBase } from '@/test/utils';

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
});

function rendreTerrain() {
  return rendreRoute('/edl/:id', <EdlTerrainPage />, '/edl/edl-1');
}

/** Ouvre l'onglet d'une pièce. */
async function ouvrirPiece(nom: string) {
  await utilisateur().click(await screen.findByRole('button', { name: new RegExp(`^${nom}`) }));
}

async function elementsDeLaBase() {
  const edl = await db.edls.get('edl-1');
  return edl!.pieces.flatMap((p) => p.elements);
}

describe('remplissage groupé d’une pièce', () => {
  it('renseigne d’un coup les éléments encore vierges', async () => {
    await semer({ edl: {} });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    const bloc = (await screen.findByText(/Renseigner d'un coup les 2 élément/)).closest('div')!;
    await utilisateur().click(within(bloc).getByRole('button', { name: 'Bon' }));

    await vi.waitFor(async () => {
      const sejour = (await db.edls.get('edl-1'))!.pieces[0];
      expect(sejour.elements.map((e) => e.etat)).toEqual(['bon', 'bon']);
    });
  });

  it('ne réécrit jamais un élément déjà relevé', async () => {
    // Le raccourci ne doit pas pouvoir effacer une observation faite sur place.
    const edl = unEdl();
    edl.pieces[0].elements[0].etat = 'usage';
    await semer({ edl });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    const bloc = (await screen.findByText(/Renseigner d'un coup les 1 élément/)).closest('div')!;
    await utilisateur().click(within(bloc).getByRole('button', { name: 'Bon' }));

    await vi.waitFor(async () => {
      const sejour = (await db.edls.get('edl-1'))!.pieces[0];
      expect(sejour.elements.map((e) => e.etat)).toEqual(['usage', 'bon']);
    });
  });

  it('ne touche pas aux autres pièces', async () => {
    await semer({ edl: {} });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    const bloc = (await screen.findByText(/Renseigner d'un coup/)).closest('div')!;
    await utilisateur().click(within(bloc).getByRole('button', { name: 'Neuf' }));

    await vi.waitFor(async () => {
      const cuisine = (await db.edls.get('edl-1'))!.pieces[1];
      expect(cuisine.elements.every((e) => e.etat === undefined)).toBe(true);
    });
  });

  it('disparaît quand la pièce est complète', async () => {
    const edl = unEdl();
    edl.pieces[0].elements.forEach((e) => (e.etat = 'bon'));
    await semer({ edl });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    await screen.findByRole('button', { name: /Retirer Sol/ });
    expect(screen.queryByText(/Renseigner d'un coup/)).not.toBeInTheDocument();
  });

  it('marque la dégradation sur un état des lieux de sortie', async () => {
    const pieces = unEdl().pieces.map((p) => ({
      ...p,
      elements: p.elements.map((e) => ({ ...e, etatEntree: 'neuf' as const })),
    }));
    await semer({ edl: { type: 'sortie', pieces } });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    const bloc = (await screen.findByText(/Renseigner d'un coup/)).closest('div')!;
    await utilisateur().click(within(bloc).getByRole('button', { name: 'Usagé' }));

    await vi.waitFor(async () => {
      const sejour = (await db.edls.get('edl-1'))!.pieces[0];
      expect(sejour.elements.every((e) => e.degradation)).toBe(true);
    });
  });
});

describe('récapitulatif des éléments non renseignés', () => {
  it('compte les oublis et les liste, pièce par pièce', async () => {
    await semer({ edl: {} });
    rendreTerrain();

    await utilisateur().click(
      await screen.findByRole('button', { name: /4 élément\(s\) non renseigné\(s\)/ }),
    );

    const modale = await screen.findByRole('dialog');
    expect(within(modale).getByRole('button', { name: /Sol.*Séjour/s })).toBeInTheDocument();
    expect(within(modale).getByRole('button', { name: /Réfrigérateur.*Cuisine/s })).toBeInTheDocument();
  });

  it('mène directement à la pièce concernée', async () => {
    await semer({ edl: {} });
    rendreTerrain();
    const u = utilisateur();

    await u.click(await screen.findByRole('button', { name: /4 élément\(s\) non renseigné/ }));
    const modale = await screen.findByRole('dialog');
    await u.click(within(modale).getByRole('button', { name: /Réfrigérateur.*Cuisine/s }));

    // La modale se ferme et l'onglet Cuisine est affiché.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // « Retirer <élément> » ne figure que sur la pièce affichée — contrairement
    // aux noms d'éléments, qui se retrouvent aussi dans la liste des catégories.
    expect(await screen.findByRole('button', { name: /Retirer Réfrigérateur/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirer Murs/ })).not.toBeInTheDocument();
  });

  it('intercepte « Signer » tant qu’il reste des oublis, sans bloquer', async () => {
    await semer({ edl: {} });
    rendreTerrain();

    await utilisateur().click(await screen.findByRole('button', { name: /Signer/ }));

    const modale = await screen.findByRole('dialog');
    expect(within(modale).getByRole('button', { name: /Signer quand même/ })).toBeInTheDocument();
    expect(within(modale).getByRole('button', { name: /Continuer la saisie/ })).toBeInTheDocument();
  });

  it('ne compte pas un élément marqué manquant', async () => {
    const pieces = unEdl().pieces;
    pieces[0].elements[0].manquant = true;
    pieces[0].elements[1].etat = 'bon';
    pieces[1].elements.forEach((e) => (e.etat = 'bon'));
    await semer({ edl: { type: 'sortie', pieces } });
    rendreTerrain();

    expect(await screen.findByText(/4\/4 éléments/)).toBeInTheDocument();
    expect(screen.queryByText(/non renseigné/)).not.toBeInTheDocument();
  });
});

describe('verrouillage après signature', () => {
  it('n’écrit plus rien et masque les raccourcis', async () => {
    const pieces = unEdl().pieces.map((p) => ({
      ...p,
      elements: p.elements.map((e) => ({ ...e, etat: 'bon' as const })),
    }));
    await semer({
      edl: {
        statut: 'signe',
        pieces,
        signatures: {
          dateSignature: '2026-02-01T10:00:00.000Z',
          lieu: 'Chamalières',
          bailleur: {
            nomComplet: 'Jami Infante',
            luEtApprouve: true,
            imageDataUrl: '',
            horodatage: '2026-02-01T10:00:00.000Z',
          },
          locataires: [],
        },
      },
    });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    expect(screen.queryByText(/Renseigner d'un coup/)).not.toBeInTheDocument();
    const avant = await elementsDeLaBase();
    await utilisateur().click(screen.getAllByRole('button', { name: 'Mauvais' })[0]);
    expect(await elementsDeLaBase()).toEqual(avant);
  });
});
