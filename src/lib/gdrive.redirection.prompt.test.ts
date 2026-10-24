// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Paramètres de l'URL de connexion Google, et jeton déjà valide.
 *
 * Deux reproches d'usage visaient le même point : la PWA installée quitte
 * l'application à chaque fois. Le levier n'est pas d'allonger la vie du jeton -
 * il est volontairement borné à la session (cf. `CLE_JETON`) - mais de ne
 * repartir vers Google que lorsque c'est nécessaire, et sans réclamer un
 * consentement déjà donné.
 */

/** Recharge le module dans un registre neuf : ses variables repartent de zéro. */
async function rechargerGdrive() {
  vi.resetModules();
  return import('./gdrive');
}

/** Remplace `window.location` par un objet inerte dont on relit `href`. */
function piegerLocation() {
  const faux = {
    origin: 'https://bailiz.fr',
    pathname: '/app/',
    hash: '#/parametres',
    href: '',
  };
  vi.stubGlobal('location', faux);
  return faux;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('URL de connexion Google', () => {
  it('ne réclame pas un consentement déjà donné', async () => {
    const faux = piegerLocation();
    const { lancerConnexionParRedirection } = await rechargerGdrive();

    lancerConnexionParRedirection('mon-id.apps.googleusercontent.com');

    const params = new URL(faux.href).searchParams;
    // `prompt=consent` rouvrait l'écran de consentement à chaque reconnexion,
    // alors que l'autorisation est déjà accordée.
    expect(params.get('prompt')).toBeNull();
    // Ce qui permet à Google de rendre le jeton sans rien demander.
    expect(params.get('include_granted_scopes')).toBe('true');
    expect(params.get('response_type')).toBe('token');
    expect(params.get('redirect_uri')).toBe('https://bailiz.fr/app/');
    expect(params.get('client_id')).toBe('mon-id.apps.googleusercontent.com');
    // L'anti-rejeu reste en place.
    expect(params.get('state')).toBe(sessionStorage.getItem('bailiz.gdrive.state'));
  });
});

describe('jetonValide', () => {
  it('reconnaît un jeton encore vivant, repris de la session', async () => {
    sessionStorage.setItem(
      'bailiz.gdrive.jeton',
      JSON.stringify({ accessToken: 'JETON', expireA: Date.now() + 3_600_000 }),
    );
    const { jetonValide } = await rechargerGdrive();
    expect(jetonValide()).toBe(true);
  });

  it('refuse un jeton expiré ou sur le point de l’être', async () => {
    // La marge d'expiration vaut une minute : un jeton qui meurt dans 30 s est
    // déjà mort, sans quoi un cycle partirait avec lui et échouerait en vol.
    sessionStorage.setItem(
      'bailiz.gdrive.jeton',
      JSON.stringify({ accessToken: 'JETON', expireA: Date.now() + 30_000 }),
    );
    const { jetonValide } = await rechargerGdrive();
    expect(jetonValide()).toBe(false);
  });

  it('refuse quand aucun jeton n’est mémorisé', async () => {
    const { jetonValide } = await rechargerGdrive();
    expect(jetonValide()).toBe(false);
  });
});
