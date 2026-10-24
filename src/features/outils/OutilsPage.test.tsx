import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '@/lib/db';
import {
  desParametres,
  rendre,
  semer,
  unBail,
  unEdl,
  utilisateur,
  viderBase,
} from '@/test/utils';
import { OutilsPage } from './OutilsPage';

/**
 * La boîte à outils, vérifiée sur ce qui l'a fait naître : **produire un
 * document sans fiche préalable**.
 *
 * Avant elle, l'acte de cautionnement n'existait que sur la fiche d'un bail, le
 * courrier de révision aussi, la lettre de restitution que sur la synthèse d'un
 * état des lieux de sortie. Les cas « base vide » ci-dessous sont donc
 * l'essentiel du contrat de cet écran, pas des cas limites.
 */

const archivage = vi.hoisted(() => vi.fn(() => new Promise((r) => setTimeout(r, 80))));
/** Typé : les tests lisent le contexte transmis, pas seulement le fait d'être appelé. */
const acte = vi.hoisted(() =>
  vi.fn(
    async (_contexte?: { bail: { id: string }; bien: { id: string }; locataires: { id: string }[] }) => {},
  ),
);

vi.mock('@/lib/pdf/generer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pdf/generer')>()),
  genererEtArchiver: archivage,
}));

vi.mock('./acteCautionnement', () => ({ ouvrirActeCautionnement: acte }));

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
  localStorage.clear();
  archivage.mockClear();
  acte.mockClear();
  await db.parametres.put(desParametres());
});

describe('génération directe', () => {
  it('n’archive qu’une seule grille de vétusté malgré un double-clic', async () => {
    const u = utilisateur();
    rendre(<OutilsPage />);

    const bouton = await screen.findByRole('button', { name: /Grille de vétusté/ });
    await u.click(bouton);
    await u.click(bouton);

    await vi.waitFor(() => expect(archivage).toHaveBeenCalled());
    expect(archivage).toHaveBeenCalledTimes(1);
  });

  it('n’archive qu’une seule fiche d’aide juridique malgré un double-clic', async () => {
    const u = utilisateur();
    rendre(<OutilsPage />);

    const bouton = await screen.findByRole('button', { name: /Fiche d'aide juridique/ });
    await u.click(bouton);
    await u.click(bouton);

    await vi.waitFor(() => expect(archivage).toHaveBeenCalled());
    expect(archivage).toHaveBeenCalledTimes(1);
  });
});

describe('sans aucune fiche', () => {
  it('produit tout de même un acte de cautionnement, en modèle vierge', async () => {
    const u = utilisateur();
    rendre(<OutilsPage />);

    await u.click(await screen.findByRole('button', { name: /Acte de cautionnement/ }));
    await u.click(await screen.findByRole('button', { name: /Modèle vierge/ }));

    await vi.waitFor(() => expect(acte).toHaveBeenCalled());
    // Sans contexte : c'est ce qui laisse les zones en pointillés.
    expect(acte).toHaveBeenCalledWith();
  });

  it('renvoie rédiger un bail quand aucun n’est révisable', async () => {
    const u = utilisateur();
    rendre(<OutilsPage />);

    await u.click(await screen.findByRole('button', { name: /Courrier de révision IRL/ }));

    expect(await screen.findByText(/Aucun bail en cours n'est révisable/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Rédiger un bail/ })).toHaveAttribute(
      'href',
      '/baux/nouveau',
    );
  });

  it('renvoie faire un état des lieux quand aucune sortie n’est signée', async () => {
    const u = utilisateur();
    rendre(<OutilsPage />);

    await u.click(await screen.findByRole('button', { name: /Lettre de restitution/ }));

    expect(await screen.findByText(/Aucun état des lieux de sortie signé/)).toBeInTheDocument();
  });
});

describe('avec des fiches', () => {
  it('ne propose à la révision que les baux en cours et révisables', async () => {
    const u = utilisateur();
    await semer({ bail: { statut: 'actif' } });
    await db.baux.put(
      unBail({
        id: 'bail-2',
        reference: 'BAIL-2026-0002',
        statut: 'actif',
        revisionIRL: { trimestreReference: '2e trimestre 2025', valeurIndice: 146.33, revisable: false },
      }),
    );
    await db.baux.put(unBail({ id: 'bail-3', reference: 'BAIL-2026-0003', statut: 'termine' }));
    rendre(<OutilsPage />);

    await u.click(await screen.findByRole('button', { name: /Courrier de révision IRL/ }));

    expect(await screen.findByRole('button', { name: /BAIL-2026-0001/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /BAIL-2026-0002/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /BAIL-2026-0003/ })).not.toBeInTheDocument();
  });

  it('ne propose à la restitution que les états des lieux de sortie signés', async () => {
    const u = utilisateur();
    await semer({ edl: { id: 'edl-entree', type: 'entree', statut: 'signe' } });
    await db.edls.put(
      unEdl({ id: 'edl-brouillon', reference: 'EDL-2026-0002', type: 'sortie', statut: 'brouillon' }),
    );
    await db.edls.put(
      unEdl({ id: 'edl-sortie', reference: 'EDL-2026-0003', type: 'sortie', statut: 'signe' }),
    );
    rendre(<OutilsPage />);

    await u.click(await screen.findByRole('button', { name: /Lettre de restitution/ }));

    expect(await screen.findByRole('button', { name: /EDL-2026-0003/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /EDL-2026-0002/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /EDL-2026-0001/ })).not.toBeInTheDocument();
  });

  it('pré-remplit l’acte de cautionnement depuis le bail choisi', async () => {
    const u = utilisateur();
    await semer({ bail: { statut: 'actif' } });
    rendre(<OutilsPage />);

    await u.click(await screen.findByRole('button', { name: /Acte de cautionnement/ }));
    await u.click(await screen.findByRole('button', { name: /BAIL-2026-0001/ }));

    await vi.waitFor(() => expect(acte).toHaveBeenCalled());
    const contexte = acte.mock.calls[0][0];
    expect(contexte?.bail.id).toBe('bail-1');
    expect(contexte?.bien.id).toBe('bien-1');
    expect(contexte?.locataires.map((l) => l.id)).toEqual(['loc-1']);
  });
});
