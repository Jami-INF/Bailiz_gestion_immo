import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { db } from '@/lib/db';
import { BailDetailPage } from './BailDetailPage';
import { rendreRoute, semer, utilisateur, viderBase } from '@/test/utils';
import { figerDate } from '@/test/setup';

/*
 * Le rendu PDF est neutralisé : ce parcours vérifie ce que la révision **écrit
 * dans le bail**, pas la mise en page du courrier - laquelle a ses propres
 * tests dans `lib/pdf/`. Sans ce bouchon, chaque cas paierait une seconde de
 * rendu pour un résultat qu'il ne regarde pas.
 */
vi.mock('@/lib/pdf/generer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pdf/generer')>()),
  genererEtArchiver: vi.fn(async () => undefined),
}));

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
});

afterEach(() => {
  vi.useRealTimers();
});

function rendreBail() {
  return rendreRoute('/baux/:id', <BailDetailPage />, '/baux/bail-1');
}

/** Ouvre la modale IRL et saisit un nouvel indice. */
async function reviser(trimestre: string, indice: string) {
  const u = utilisateur();
  await u.click(await screen.findByRole('button', { name: /Révision IRL du loyer/ }));
  const modale = await screen.findByRole('dialog');
  await u.type(within(modale).getByLabelText(/Nouveau trimestre/), trimestre);
  await u.type(within(modale).getByLabelText(/Nouvel indice IRL/), indice);
  await u.click(within(modale).getByRole('button', { name: /Générer le courrier PDF/ }));
}

describe('révision IRL', () => {
  it('enregistre la révision dans le bail', async () => {
    // Régression : le courrier était produit mais rien n'était écrit ; le bail
    // restait indéfiniment au loyer d'origine.
    await semer();
    rendreBail();

    await reviser('2e trimestre 2026', '149.03');

    await vi.waitFor(async () => {
      const bail = await db.baux.get('bail-1');
      expect(bail?.revisionsLoyer).toHaveLength(1);
    });
    const bail = await db.baux.get('bail-1');
    expect(bail?.revisionsLoyer?.[0]).toMatchObject({
      ancienLoyer: 600,
      nouveauLoyer: 611.07,
      indiceReference: 146.33,
      nouvelIndice: 149.03,
      nouveauTrimestre: '2e trimestre 2026',
    });
  });

  it('laisse intact le loyer du contrat - le bail doit se régénérer à l’identique', async () => {
    await semer();
    rendreBail();
    await reviser('2e trimestre 2026', '149.03');

    await vi.waitFor(async () => {
      expect((await db.baux.get('bail-1'))?.revisionsLoyer).toHaveLength(1);
    });
    expect((await db.baux.get('bail-1'))?.loyerHC).toBe(600);
  });

  it('affiche le loyer courant et rappelle celui du contrat', async () => {
    await semer({
      bail: {
        revisionsLoyer: [
          {
            date: '2026-06-01T00:00:00.000Z',
            dateApplication: '2026-06-01T00:00:00.000Z',
            trimestreReference: '2e trimestre 2025',
            indiceReference: 146.33,
            nouveauTrimestre: '2e trimestre 2026',
            nouvelIndice: 149.03,
            ancienLoyer: 600,
            nouveauLoyer: 623.3,
          },
        ],
      },
    });
    rendreBail();

    expect(await screen.findByText(/623,30/)).toBeInTheDocument();
    expect(screen.getByText(/loyer au contrat : 600,00/)).toBeInTheDocument();
  });

  it('repart du loyer révisé à la révision suivante, pas du loyer d’origine', async () => {
    await semer();
    rendreBail();
    await reviser('2e trimestre 2026', '149.03');
    await vi.waitFor(async () => {
      expect((await db.baux.get('bail-1'))?.revisionsLoyer).toHaveLength(1);
    });

    // Deuxième cycle : la modale doit annoncer 623,30 € et l'indice 149.03.
    const u = utilisateur();
    await u.click(screen.getByRole('button', { name: /Révision IRL du loyer/ }));
    const modale = await screen.findByRole('dialog');
    expect(within(modale).getByText(/Indice de la dernière révision : 149.03/)).toBeInTheDocument();
    expect(within(modale).getByText(/611,07/)).toBeInTheDocument();
  });

  it('ne rétroagit pas quand la révision est demandée après l’anniversaire', async () => {
    // Anniversaire au 1er janvier, demande le 20 septembre : effet à la demande
    // (art. 17-1). L'ancien calcul annonçait une date déjà passée.
    await semer();
    figerDate('2027-09-20T12:00:00.000Z');
    rendreBail();

    const u = utilisateur();
    await u.click(await screen.findByRole('button', { name: /Révision IRL du loyer/ }));
    const modale = await screen.findByRole('dialog');
    expect(within(modale).getByText(/Prise d'effet/)).toHaveTextContent('20/09/2027');
  });

  it('désactive le calculateur si le bail ne prévoit pas de clause de révision', async () => {
    await semer({
      bail: { revisionIRL: { trimestreReference: '', valeurIndice: 0, revisable: false } },
    });
    rendreBail();

    expect(await screen.findByRole('button', { name: /Révision IRL du loyer/ })).toBeDisabled();
  });
});

describe('fiche de bail - robustesse', () => {
  it('reste consultable et supprimable quand le bien a disparu', async () => {
    await semer();
    await db.biens.clear();
    rendreBail();

    expect(await screen.findByText(/Le bien associé à ce bail n'existe plus/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Supprimer/ })).toBeInTheDocument();
  });
});
