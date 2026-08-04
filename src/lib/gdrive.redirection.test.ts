// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consommerRetourRedirection, recupererJetonRedirection } from './gdrive';

/**
 * Retour de connexion Google par redirection : le jeton arrive dans le fragment
 * d'URL, que le HashRouter interpréterait sinon comme une route. Ces cas
 * couvrent la restauration de la route et le rejet d'une réponse non sollicitée.
 */
function simulerRetour(fragment: string) {
  window.history.replaceState(null, '', `/app/${fragment}`);
}

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/app/');
});

describe('connexion Google par redirection', () => {
  it('accepte un jeton dont le state correspond, et restaure la route', () => {
    sessionStorage.setItem('bailiz.gdrive.state', 'abc');
    sessionStorage.setItem('bailiz.gdrive.route', '#/parametres');
    sessionStorage.setItem('bailiz.gdrive.clientId', 'mon-id.apps.googleusercontent.com');
    simulerRetour('#access_token=JETON&state=abc&expires_in=3600');

    expect(recupererJetonRedirection()).toBe(true);
    // Le jeton disparaît de la barre d'adresse et la route d'origine revient.
    expect(window.location.hash).toBe('#/parametres');
    expect(window.location.href).not.toContain('access_token');
    // La finalisation récupère l'ID client utilisé, une seule fois.
    expect(consommerRetourRedirection()).toBe('mon-id.apps.googleusercontent.com');
    expect(consommerRetourRedirection()).toBeUndefined();
  });

  it('rejette une réponse dont le state ne correspond pas (anti-rejeu)', () => {
    sessionStorage.setItem('bailiz.gdrive.state', 'attendu');
    sessionStorage.setItem('bailiz.gdrive.route', '#/parametres');
    simulerRetour('#access_token=JETON&state=forge&expires_in=3600');

    expect(recupererJetonRedirection()).toBe(false);
    expect(consommerRetourRedirection()).toBeUndefined();
    // L'URL est tout de même nettoyée : pas de jeton laissé en barre d'adresse.
    expect(window.location.href).not.toContain('access_token');
  });

  it('rejette une réponse sans state mémorisé (aucune connexion demandée)', () => {
    simulerRetour('#access_token=JETON&state=inconnu');
    expect(recupererJetonRedirection()).toBe(false);
  });

  it('ignore une navigation normale', () => {
    simulerRetour('#/baux/123');
    expect(recupererJetonRedirection()).toBe(false);
    expect(window.location.hash).toBe('#/baux/123');
  });
});

describe('détection du mode application installée', () => {
  it('reconnaît le mode standalone iOS', async () => {
    const { estApplicationInstallee } = await import('./gdrive');
    vi.stubGlobal('matchMedia', () => ({ matches: true }) as MediaQueryList);
    expect(estApplicationInstallee()).toBe(true);
    vi.unstubAllGlobals();
  });
});
