import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { db, getParametres } from '@/lib/db';
import { rendre, utilisateur, viderBase } from '@/test/utils';
import { CarteDonnees } from './CarteDonnees';

/**
 * L'état des données, affiché en continu sur le tableau de bord.
 *
 * Il remplace une alerte qui ne se déclenchait qu'au bout de plusieurs jours,
 * « Aucune sauvegarde effectuée » : un avertissement qui arrive quand il y a
 * déjà quelque chose à perdre arrive trop tard.
 */

beforeEach(async () => {
  await viderBase();
  await db.sauvegardeAuto.clear();
  localStorage.clear();
  await getParametres();
});

describe('carte « Vos données »', () => {
  it('dit que rien n’est à l’abri, et propose d’y remédier', async () => {
    rendre(<CarteDonnees />);

    expect(await screen.findByText(/n’existent que sur cet appareil/)).toBeInTheDocument();
    // L'action ouvre le même écran de choix que l'accueil : une seule
    // formulation de la question dans toute l'application.
    await utilisateur().click(screen.getByRole('button', { name: /Choisir une destination/ }));
    expect(await screen.findByText(/Où sont enregistrées vos données/)).toBeInTheDocument();
  });

  it('confirme la destination et la date du dernier échange', async () => {
    const params = await getParametres();
    await db.parametres.put({
      ...params,
      sauvegardeGDrive: {
        clientId: 'x',
        actif: true,
        derniereSync: '2026-08-20T10:25:00.000Z',
      },
    });

    rendre(<CarteDonnees />);
    expect(await screen.findByText(/Synchronisées avec Google Drive/)).toBeInTheDocument();
    // Plus d'alerte : il n'y a plus rien à signaler.
    expect(screen.queryByText(/n’existent que sur cet appareil/)).not.toBeInTheDocument();
  });

  it('nomme le dossier quand l’archive est locale', async () => {
    await db.sauvegardeAuto.put({
      id: 'dossier',
      handle: {} as FileSystemDirectoryHandle,
      nomDossier: 'Sauvegardes Bailiz',
      dernierPush: '2026-08-19T09:00:00.000Z',
    });

    rendre(<CarteDonnees />);
    expect(await screen.findByText(/Sauvegardes Bailiz/)).toBeInTheDocument();
  });

  it('reste muette tant que l’état n’est pas connu', () => {
    /*
     * `useLiveQuery` rend `undefined` avant sa première résolution. Sans cette
     * réserve, la carte d'alerte apparaîtrait puis disparaîtrait à chaque rendu
     * du tableau de bord - un clignotement rouge sans motif.
     */
    const { container } = rendre(<CarteDonnees />);
    expect(container.querySelector('h2')).toBeNull();
  });
});
