import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BandeauMiseAJour } from './AppLayout';
import {
  appliquerMiseAJour,
  miseAJourDisponible,
  reinitialiserMiseAJour,
  sAbonnerMiseAJour,
  signalerMiseAJour,
} from '@/lib/majApp';

beforeEach(() => reinitialiserMiseAJour());
afterEach(() => reinitialiserMiseAJour());

describe('proposition de mise à jour', () => {
  it('ne s’affiche pas tant qu’aucune version n’est prête', () => {
    render(<BandeauMiseAJour masque={false} />);
    expect(screen.queryByText(/nouvelle version/)).not.toBeInTheDocument();
  });

  it('apparaît dès que le service worker signale une version', () => {
    render(<BandeauMiseAJour masque={false} />);
    // Le signal vient du service worker, hors de React : sans `act`, le
    // re-rendu déclenché par `useSyncExternalStore` n'est pas encore appliqué.
    act(() => signalerMiseAJour(async () => {}));

    expect(screen.getByText(/Une nouvelle version de Bailiz est disponible/)).toBeInTheDocument();
  });

  it('n’installe rien avant que l’utilisateur l’accepte', async () => {
    const appliquer = vi.fn(async () => {});
    render(<BandeauMiseAJour masque={false} />);
    act(() => signalerMiseAJour(appliquer));

    // Le point essentiel : signaler n'applique pas. Un rechargement d'office
    // pendant un état des lieux est exactement ce qu'on veut éviter.
    expect(appliquer).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /Installer et recharger/ }));
    expect(appliquer).toHaveBeenCalledOnce();
  });

  it('reste masqué en mode terrain', () => {
    // L'écran d'état des lieux est plein écran, sur tablette, devant le
    // locataire : ni la place ni le moment pour un bandeau de mise à jour.
    render(<BandeauMiseAJour masque />);
    act(() => signalerMiseAJour(async () => {}));

    expect(screen.queryByText(/nouvelle version/)).not.toBeInTheDocument();
  });
});

describe('magasin de mise à jour', () => {
  it('reste inoffensif si rien n’est en attente', async () => {
    expect(miseAJourDisponible()).toBe(false);
    await expect(appliquerMiseAJour()).resolves.toBeUndefined();
  });

  it('prévient les abonnés et se désabonne proprement', () => {
    const abonne = vi.fn();
    const desabonner = sAbonnerMiseAJour(abonne);
    signalerMiseAJour(async () => {});
    expect(abonne).toHaveBeenCalledOnce();

    desabonner();
    signalerMiseAJour(async () => {});
    expect(abonne).toHaveBeenCalledOnce();
  });
});
