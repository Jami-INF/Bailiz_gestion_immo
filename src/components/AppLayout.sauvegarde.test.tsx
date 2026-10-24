import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/lib/db';
import { ToastProvider } from '@/components/ui';
import { desParametres, viderBase } from '@/test/utils';
import { SauvegardeStatut } from './AppLayout';

/**
 * Bouton « Sauvegarder » dans la PWA installée.
 *
 * Sur iOS, l'autorisation Google doit être demandée en première instruction du
 * geste - Safari ne l'accorde que pendant l'activation. D'où une redirection
 * posée avant tout accès à IndexedDB... mais elle était **inconditionnelle** :
 * l'application quittait la page même avec un jeton valide en main, donc à
 * chaque sauvegarde manuelle. Vérifier le jeton ne coûte pas le geste, c'est la
 * lecture synchrone d'une variable de module.
 */

const redirection = vi.hoisted(() => vi.fn());
const jetonValide = vi.hoisted(() => vi.fn(() => false));
const installee = vi.hoisted(() => vi.fn(() => true));
const pousser = vi.hoisted(() => vi.fn(async () => 'ok' as const));

vi.mock('@/lib/gdrive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/gdrive')>()),
  estApplicationInstallee: installee,
  lancerConnexionParRedirection: redirection,
  jetonValide,
  demanderAutorisationGoogle: vi.fn(async () => 'JETON'),
}));

vi.mock('@/lib/autosave', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/autosave')>()),
  pousserSiActive: pousser,
  getConfigAutosave: vi.fn(async () => undefined),
}));

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
  redirection.mockClear();
  pousser.mockClear();
  installee.mockReturnValue(true);
  jetonValide.mockReturnValue(false);
  await db.parametres.put(
    desParametres({
      sauvegardeGDrive: { clientId: 'id-test', actif: true, dossierId: 'DOSSIER' },
    }),
  );
});

const monter = () =>
  render(
    <ToastProvider>
      <SauvegardeStatut />
    </ToastProvider>,
  );

const cliquerSauvegarder = async () =>
  userEvent.click(await screen.findByRole('button', { name: /Sauvegarder/ }));

describe('sauvegarde manuelle en application installée', () => {
  it('ne quitte pas l’application quand le jeton est encore valide', async () => {
    jetonValide.mockReturnValue(true);
    monter();

    await cliquerSauvegarder();

    expect(redirection).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(pousser).toHaveBeenCalledWith(true));
  });

  it('repart vers Google quand il n’y a plus de jeton', async () => {
    jetonValide.mockReturnValue(false);
    monter();

    await cliquerSauvegarder();

    expect(redirection).toHaveBeenCalledWith('id-test');
    // La redirection quitte la page : rien ne doit être poussé derrière elle.
    expect(pousser).not.toHaveBeenCalled();
  });

  it('hors application installée, ne redirige jamais', async () => {
    installee.mockReturnValue(false);
    jetonValide.mockReturnValue(false);
    monter();

    await cliquerSauvegarder();

    expect(redirection).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(pousser).toHaveBeenCalledWith(true));
  });
});
