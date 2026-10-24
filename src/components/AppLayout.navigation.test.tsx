import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { db } from '@/lib/db';
import { desParametres, rendre, utilisateur, viderBase } from '@/test/utils';
import { AppLayout } from './AppLayout';

/**
 * Répartition de la navigation entre la barre basse et la feuille « Plus ».
 *
 * À sept entrées, la barre basse d'un téléphone de 390 px mesurait 390 px
 * d'onglets : saturée au pixel près. Ajouter les outils imposait donc d'en
 * retirer, et le partage est ce qui se vérifie ici - avec sa conséquence utile,
 * l'état de sauvegarde enfin atteignable sur mobile.
 *
 * Le partage est **en CSS** : les quatre entrées de bureau restent dans le
 * document, masquées sous `sm:`. Un test jsdom ne mesure pas une largeur ; ce
 * qu'il peut établir, c'est qu'elles portent bien la classe qui les retire de
 * la barre basse, et que « Plus » les rend toutes atteignables.
 */

vi.mock('@/lib/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/sync')>()),
  lancerCycle: vi.fn(async () => ({ etat: 'ok' as const })),
  purgerJournalSiInactif: vi.fn(async () => {}),
}));

vi.mock('@/lib/autosave', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/autosave')>()),
  initAutosaveSurModifications: vi.fn(),
  destinationConfiguree: vi.fn(async () => false),
  getConfigAutosave: vi.fn(async () => undefined),
  pousserSiActive: vi.fn(async () => 'ok' as const),
}));

vi.mock('@/lib/gdrive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gdrive')>()),
  consommerRetourRedirection: vi.fn(() => null),
  getConfigGDrive: vi.fn(async () => undefined),
}));

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
  localStorage.clear();
  // Sans ce drapeau, le parcours d'accueil s'ouvre par-dessus la navigation.
  localStorage.setItem('bailiz.accueil.termine', '1');
  await db.parametres.put(desParametres());
});

const barre = () => screen.getAllByRole('navigation')[0];

describe('barre de navigation', () => {
  it('ne garde dans la barre basse que le travail courant', () => {
    rendre(<AppLayout />);
    const liens = within(barre()).getAllByRole('link');
    const visiblesEnBas = liens.filter((l) => !l.className.includes('hidden'));

    expect(visiblesEnBas.map((l) => l.getAttribute('href'))).toEqual([
      '/',
      '/biens',
      '/baux',
      '/edl',
    ]);
    // Quatre entrées plus « Plus » : cinq onglets, la limite tenable à 390 px.
    expect(within(barre()).getByRole('button', { name: 'Plus' })).toBeInTheDocument();
  });

  it('abrège les libellés trop longs pour un onglet de téléphone', () => {
    rendre(<AppLayout />);
    // « Tableau de bord » et « États des lieux » ne tiennent pas sur une ligne
    // de 10 px dans un onglet de 78 px : ils y repliaient la barre sur trois
    // lignes. Le nom complet reste porté par la barre latérale et le `title`.
    expect(within(barre()).getByText('Accueil')).toBeInTheDocument();
    expect(within(barre()).getByText('EDL')).toBeInTheDocument();
    const accueil = within(barre())
      .getAllByRole('link')
      .find((l) => l.getAttribute('href') === '/');
    expect(accueil).toHaveAttribute('title', 'Tableau de bord');
  });

  it('garde les quatre entrées de bureau dans le document, hors de la barre basse', () => {
    rendre(<AppLayout />);
    for (const href of ['/locataires', '/outils', '/documents', '/parametres']) {
      const lien = within(barre())
        .getAllByRole('link')
        .find((l) => l.getAttribute('href') === href);
      expect(lien, href).toBeDefined();
      expect(lien!.className).toContain('hidden');
    }
  });
});

describe('feuille « Plus »', () => {
  it('donne accès aux quatre entrées de bureau', async () => {
    const u = utilisateur();
    rendre(<AppLayout />);
    await u.click(within(barre()).getByRole('button', { name: 'Plus' }));

    const feuille = await screen.findByRole('dialog');
    expect(
      within(feuille)
        .getAllByRole('link')
        .map((l) => l.getAttribute('href')),
    ).toEqual(['/locataires', '/outils', '/documents', '/parametres']);
  });

  it('y montre l’état du stockage, invisible ailleurs sur mobile', async () => {
    const u = utilisateur();
    rendre(<AppLayout />);
    await u.click(within(barre()).getByRole('button', { name: 'Plus' }));

    const feuille = await screen.findByRole('dialog');
    expect(within(feuille).getByText(/Stockage/)).toBeInTheDocument();
    expect(within(feuille).getByText(/archive/i)).toBeInTheDocument();
  });
});

/**
 * Le pli de la barre latérale ne se mémorise que là où cette barre existe.
 *
 * La valeur par défaut se déduisait de `innerWidth < 1280` **et s'écrivait
 * aussitôt**. Ouvrir Bailiz une première fois sur le téléphone - 390 px, donc
 * « plus étroit que 1280 » - figeait donc la barre en icônes seules pour
 * l'ordinateur, sans que rien ne l'explique ni ne permette de le deviner.
 */
describe('mémorisation du pli de la barre latérale', () => {
  const largeur = (l: number) =>
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: l });

  it('n’écrit rien depuis un téléphone, où la barre latérale n’existe pas', async () => {
    largeur(390);
    rendre(<AppLayout />);
    await screen.findByRole('navigation');

    expect(localStorage.getItem('bailiz.navRepliee')).toBeNull();
  });

  it('mémorise le choix dès que la barre latérale est affichée', async () => {
    largeur(1024);
    rendre(<AppLayout />);
    await screen.findByRole('navigation');

    // 1024 px : assez large pour la barre, trop étroit pour les libellés.
    expect(localStorage.getItem('bailiz.navRepliee')).toBe('1');
  });

  it('respecte un choix déjà enregistré, quelle que soit la largeur', async () => {
    localStorage.setItem('bailiz.navRepliee', '0');
    largeur(390);
    rendre(<AppLayout />);
    await screen.findByRole('navigation');

    expect(localStorage.getItem('bailiz.navRepliee')).toBe('0');
  });
});
