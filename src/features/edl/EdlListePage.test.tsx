import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '@/lib/db';
import { desParametres, rendre, unBien, unEdl, utilisateur, viderBase } from '@/test/utils';
import { EdlListePage } from './EdlListePage';

/**
 * La liste des états des lieux.
 *
 * C'est celle qui grossit le plus vite - deux par bail - et c'était la seule
 * des quatre sans recherche, sans tri et sans filtre : tout s'y affichait à
 * plat. Deux choses s'y vérifient : qu'on y retrouve une fiche, et qu'un
 * constat signé mène là où il reste quelque chose à faire.
 */

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
  localStorage.clear();
  await db.parametres.put(desParametres());
  await db.biens.bulkPut([
    unBien({ id: 'bien-1', nom: 'T2 Chamalières' }),
    unBien({ id: 'bien-2', nom: 'Studio Jaude' }),
  ]);
});

/** Au-delà du seuil de `BarreListe` : six fiches, sinon la barre reste cachée. */
async function semerSix() {
  await db.edls.bulkPut([
    unEdl({ id: 'e1', reference: 'EDL-2026-0001', bienId: 'bien-1', type: 'entree', statut: 'signe' }),
    unEdl({ id: 'e2', reference: 'EDL-2026-0002', bienId: 'bien-1', type: 'sortie', statut: 'brouillon' }),
    unEdl({ id: 'e3', reference: 'EDL-2026-0003', bienId: 'bien-2', type: 'entree', statut: 'brouillon' }),
    unEdl({ id: 'e4', reference: 'EDL-2026-0004', bienId: 'bien-2', type: 'sortie', statut: 'signe' }),
    unEdl({ id: 'e5', reference: 'EDL-2026-0005', bienId: 'bien-1', type: 'entree', statut: 'brouillon' }),
    unEdl({ id: 'e6', reference: 'EDL-2026-0006', bienId: 'bien-2', type: 'entree', statut: 'signe' }),
  ]);
}

const references = () =>
  screen
    .getAllByRole('link')
    .map((l) => l.textContent ?? '')
    .filter((t) => t.includes('EDL-'))
    .map((t) => t.slice(0, 13));

describe('destination d’un état des lieux', () => {
  it('ouvre la synthèse quand il est signé, l’écran terrain sinon', async () => {
    await db.edls.bulkPut([
      unEdl({ id: 'signe', reference: 'EDL-2026-0009', statut: 'signe' }),
      unEdl({ id: 'brouillon', reference: 'EDL-2026-0010', statut: 'brouillon' }),
    ]);
    rendre(<EdlListePage />);

    const signe = await screen.findByText(/EDL-2026-0009/);
    expect(signe.closest('a')).toHaveAttribute('href', '/edl/signe/synthese');
    expect(screen.getByText(/EDL-2026-0010/).closest('a')).toHaveAttribute(
      'href',
      '/edl/brouillon',
    );
  });
});

describe('barre de liste', () => {
  it('reste cachée tant que la liste est courte', async () => {
    await db.edls.put(unEdl({ id: 'e1', reference: 'EDL-2026-0001' }));
    rendre(<EdlListePage />);

    expect(await screen.findByText(/EDL-2026-0001/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Rechercher un état des lieux/)).not.toBeInTheDocument();
  });

  it('filtre sur la référence et sur le nom du logement', async () => {
    const u = utilisateur();
    await semerSix();
    rendre(<EdlListePage />);

    const champ = await screen.findByLabelText(/Rechercher un état des lieux/);
    await u.type(champ, 'jaude');

    expect(references()).toEqual(['EDL-2026-0006', 'EDL-2026-0004', 'EDL-2026-0003']);
    expect(screen.getByRole('status')).toHaveTextContent('3 états des lieux sur 6.');
  });

  it('cherche aussi « entrée » et « sortie », accents compris', async () => {
    const u = utilisateur();
    await semerSix();
    rendre(<EdlListePage />);

    await u.type(await screen.findByLabelText(/Rechercher un état des lieux/), 'entree');

    expect(references()).toHaveLength(4);
  });

  it('sépare les brouillons des constats signés', async () => {
    const u = utilisateur();
    await semerSix();
    rendre(<EdlListePage />);

    const filtre = await screen.findByLabelText('Filtrer par statut');
    await u.selectOptions(filtre, 'signe');
    expect(references()).toEqual(['EDL-2026-0006', 'EDL-2026-0004', 'EDL-2026-0001']);

    await u.selectOptions(filtre, 'brouillon');
    expect(references()).toEqual(['EDL-2026-0005', 'EDL-2026-0003', 'EDL-2026-0002']);
  });

  it('rend compte du filtre même sans mot-clé', async () => {
    const u = utilisateur();
    await semerSix();
    rendre(<EdlListePage />);

    await u.selectOptions(await screen.findByLabelText('Filtrer par statut'), 'signe');
    expect(screen.getByRole('status')).toHaveTextContent('3 états des lieux sur 6.');
  });

  it('trie par logement sans perdre de fiche', async () => {
    const u = utilisateur();
    await semerSix();
    rendre(<EdlListePage />);

    await u.selectOptions(await screen.findByLabelText('Trier par'), 'bien');

    const liste = references();
    expect(liste).toHaveLength(6);
    // « Studio Jaude » avant « T2 Chamalières ».
    expect(liste.slice(0, 3)).toEqual(['EDL-2026-0006', 'EDL-2026-0004', 'EDL-2026-0003']);
  });

  it('propose de revenir à la liste entière quand rien ne correspond', async () => {
    const u = utilisateur();
    await semerSix();
    rendre(<EdlListePage />);

    await u.type(await screen.findByLabelText(/Rechercher un état des lieux/), 'introuvable');
    // Le titre de l'écran vide, et le compte-rendu de la barre : les deux le
    // disent, chacun à sa place.
    expect(await screen.findByRole('heading', { name: /Aucun état des lieux ne correspond/ }))
      .toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('introuvable');

    await u.click(screen.getByRole('button', { name: /Afficher toute la liste/ }));
    expect(references()).toHaveLength(6);
  });
});

describe('liste vide', () => {
  it('propose de créer un état des lieux, sans barre de recherche', async () => {
    rendre(<EdlListePage />);
    expect(await screen.findByRole('heading', { name: 'Aucun état des lieux' })).toBeInTheDocument();
    // L'action est à deux endroits : l'entête de page et l'écran vide.
    expect(screen.getAllByRole('link', { name: /Nouvel état des lieux/ })).toHaveLength(2);
    expect(screen.queryByLabelText(/Rechercher un état des lieux/)).not.toBeInTheDocument();
  });
});
