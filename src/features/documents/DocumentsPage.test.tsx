import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '@/lib/db';
import type { DocumentGenere } from '@/types';
import { desParametres, rendre, unBien, utilisateur, viderBase } from '@/test/utils';
import { DocumentsPage } from './DocumentsPage';

/**
 * L'archive des PDF produits.
 *
 * Elle offrait trois listes déroulantes - logement, bail, type - et aucun champ
 * texte : on ne pouvait pas chercher la référence qu'on a justement sous les
 * yeux sur un papier, alors que c'est elle qui identifie le document.
 */

function unDocument(p: Partial<DocumentGenere> = {}): DocumentGenere {
  return {
    id: 'doc-1',
    reference: 'DOC-2026-0001',
    type: 'bail',
    titre: 'Bail meublé - T2 Chamalières',
    blob: new Blob(['x']),
    signe: false,
    createdAt: '2026-01-01T10:00:00.000Z',
    ...p,
  };
}

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
  await db.parametres.put(desParametres());
  await db.biens.put(unBien({ id: 'bien-1' }));
  await db.documents.bulkPut([
    unDocument({ id: 'd1', reference: 'DOC-2026-0001', titre: 'Bail meublé - T2 Chamalières', type: 'bail', bienId: 'bien-1' }),
    unDocument({ id: 'd2', reference: 'DOC-2026-0002', titre: 'État des lieux d’entrée - Studio Jaude', type: 'edl_entree' }),
    unDocument({ id: 'd3', reference: 'DOC-2026-0003', titre: 'Grille de vétusté', type: 'grille_vetuste' }),
  ]);
});

const titresAffiches = () =>
  screen
    .getAllByText(/DOC-2026-/)
    .map((e) => e.textContent ?? '')
    .map((t) => t.slice(0, 13));

describe('recherche', () => {
  it('trouve par référence', async () => {
    const u = utilisateur();
    rendre(<DocumentsPage />);

    await u.type(await screen.findByLabelText('Rechercher un document'), 'DOC-2026-0002');
    expect(titresAffiches()).toEqual(['DOC-2026-0002']);
  });

  it('trouve par titre, sans se soucier des accents', async () => {
    const u = utilisateur();
    rendre(<DocumentsPage />);

    await u.type(await screen.findByLabelText('Rechercher un document'), 'vetuste');
    expect(titresAffiches()).toEqual(['DOC-2026-0003']);
  });

  it('trouve par libellé de type', async () => {
    const u = utilisateur();
    rendre(<DocumentsPage />);

    await u.type(await screen.findByLabelText('Rechercher un document'), 'état des lieux');
    expect(titresAffiches()).toEqual(['DOC-2026-0002']);
  });

  it('se combine avec les listes déroulantes', async () => {
    const u = utilisateur();
    rendre(<DocumentsPage />);

    await u.selectOptions(await screen.findByLabelText('Bien'), 'bien-1');
    expect(titresAffiches()).toEqual(['DOC-2026-0001']);

    await u.type(screen.getByLabelText('Rechercher un document'), 'vetuste');
    expect(screen.queryByText(/DOC-2026-/)).not.toBeInTheDocument();
  });
});

describe('liste vide', () => {
  it('distingue « rien à montrer » de « rien ne correspond »', async () => {
    const u = utilisateur();
    rendre(<DocumentsPage />);

    await u.type(await screen.findByLabelText('Rechercher un document'), 'introuvable');
    /*
     * Le message d'origine - « les PDF générés apparaîtront ici » - promettait
     * un écran qui ne viendrait jamais : les documents étaient là, c'est le
     * filtre qui les masquait.
     */
    expect(
      await screen.findByRole('heading', { name: /Aucun document ne correspond/ }),
    ).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: /Afficher tous les documents/ }));
    expect(titresAffiches()).toHaveLength(3);
  });

  it('annonce l’archive vide quand elle l’est vraiment', async () => {
    await db.documents.clear();
    rendre(<DocumentsPage />);

    expect(await screen.findByRole('heading', { name: 'Aucun document' })).toBeInTheDocument();
  });
});
