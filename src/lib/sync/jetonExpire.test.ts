// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getParametres } from '@/lib/db';
import { ErreurJetonExpire } from '@/lib/gdrive';

/**
 * Jeton Google expiré **au milieu** d'un cycle, sans renouvellement possible.
 *
 * Le dépôt s'ouvre normalement - l'autorisation était valide -, puis Drive
 * refuse en cours de route. Ce n'est pas une panne, c'est le même
 * « reconnectez Google » que lorsque le dépôt ne s'ouvre pas du tout : tant que
 * l'erreur remontait au filet générique, l'écran annonçait une synchronisation
 * interrompue et envoyait chercher un problème inexistant.
 */

const echoue = () => Promise.reject(new ErreurJetonExpire('Jeton Google expiré'));

vi.mock('./drive', () => ({
  ouvrirDepotDrive: vi.fn(() =>
    Promise.resolve({
      lister: echoue,
      lireTexte: echoue,
      lireBlob: echoue,
      ecrire: echoue,
      supprimer: echoue,
      heureServeur: echoue,
    }),
  ),
}));

const { etatSync, lancerCycle } = await import('./index');

beforeEach(async () => {
  await Promise.all([db.parametres.clear(), db.changements.clear()]);
  const params = await getParametres();
  await db.parametres.put({
    ...params,
    sauvegardeGDrive: { clientId: 'x', actif: true } as never,
  });
});

describe('jeton expiré pendant un cycle', () => {
  it('demande une reconnexion au lieu d’annoncer une panne', async () => {
    const resultat = await lancerCycle(false);

    // Même vocabulaire qu'un dépôt qui ne s'ouvre pas : `pousserSiActive` le
    // traduit en « permission_requise », et l'écran propose de reconnecter.
    expect(resultat.etat).toBe('indisponible');
    expect(etatSync().etat).toBe('reconnexion');
  });

  it('laisse un cycle ultérieur repartir : rien n’est verrouillé', async () => {
    await lancerCycle(false);
    // Le Drive déconnecté éteint l'avertissement - preuve que le cycle précédent
    // s'est bien terminé et n'a pas laissé le verrou de concurrence fermé.
    const params = await getParametres();
    await db.parametres.put({
      ...params,
      sauvegardeGDrive: { clientId: 'x', actif: false } as never,
    });
    expect((await lancerCycle(false)).etat).toBe('ignore');
    expect(etatSync().etat).toBe('ok');
  });
});
