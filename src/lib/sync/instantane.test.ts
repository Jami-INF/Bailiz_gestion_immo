import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getParametres } from '@/lib/db';
import { DepotMemoire } from './depotMemoire';
import {
  deposerInstantaneSiDu,
  instantaneDu,
  INSTANTANES_CONSERVES,
  INTERVALLE_INSTANTANE_MS,
} from './instantane';

const MAINTENANT = Date.parse('2026-08-08T10:00:00.000Z');

describe('instantaneDu', () => {
  it('est dû quand aucun instantané n’a jamais été pris', () => {
    expect(instantaneDu(undefined, MAINTENANT)).toBe(true);
  });

  it('n’est pas dû avant une semaine', () => {
    const hier = new Date(MAINTENANT - 24 * 3600 * 1000).toISOString();
    expect(instantaneDu(hier, MAINTENANT)).toBe(false);
  });

  it('est dû au bout d’une semaine', () => {
    const semaine = new Date(MAINTENANT - INTERVALLE_INSTANTANE_MS).toISOString();
    expect(instantaneDu(semaine, MAINTENANT)).toBe(true);
  });

  it('ne se bloque pas sur une date future ou illisible', () => {
    // Horloge faussée puis corrigée : sans cette précaution, plus aucun
    // instantané ne serait jamais pris.
    const futur = new Date(MAINTENANT + 30 * 24 * 3600 * 1000).toISOString();
    expect(instantaneDu(futur, MAINTENANT)).toBe(true);
    expect(instantaneDu('pas une date', MAINTENANT)).toBe(true);
  });
});

describe('deposerInstantaneSiDu', () => {
  beforeEach(async () => {
    await Promise.all([db.biens.clear(), db.parametres.clear()]);
    const params = await getParametres();
    await db.parametres.put({
      ...params,
      sauvegardeGDrive: { clientId: 'test', actif: true, syncActive: true },
    });
  });

  it('dépose une archive au premier passage et mémorise la date', async () => {
    const depot = new DepotMemoire();
    expect(await deposerInstantaneSiDu(depot)).toBe(true);
    expect(depot.compter('archives')).toBe(1);
    expect((await getParametres()).sauvegardeGDrive?.dernierInstantane).toBeTruthy();
  });

  it('n’en dépose pas un second dans la même semaine', async () => {
    const depot = new DepotMemoire();
    await deposerInstantaneSiDu(depot);
    expect(await deposerInstantaneSiDu(depot)).toBe(false);
    expect(depot.compter('archives')).toBe(1);
  });

  it('ne conserve que les quatre archives les plus récentes', async () => {
    const depot = new DepotMemoire();
    for (let i = 0; i < INSTANTANES_CONSERVES + 3; i++) {
      const params = await getParametres();
      // Rend l'instantané à nouveau dû, comme une semaine plus tard.
      await db.parametres.put({
        ...params,
        sauvegardeGDrive: { ...params.sauvegardeGDrive!, dernierInstantane: undefined },
      });
      depot.avancer(1);
      await deposerInstantaneSiDu(depot);
    }
    expect(depot.compter('archives')).toBe(INSTANTANES_CONSERVES);
  });

  it('ne fait pas échouer la synchronisation quand le dépôt refuse l’écriture', async () => {
    // Le filet de sécurité ne doit jamais casser ce qu'il protège.
    const depot = new DepotMemoire();
    depot.couperApres = 0;
    depot.ecritures = 0;
    depot.couperApres = -1; // toute écriture échoue
    await expect(deposerInstantaneSiDu(depot)).resolves.toBe(false);
  });

  it('ne fait rien si le Drive n’est pas configuré', async () => {
    const params = await getParametres();
    await db.parametres.put({ ...params, sauvegardeGDrive: undefined });
    const depot = new DepotMemoire();
    expect(await deposerInstantaneSiDu(depot)).toBe(false);
    expect(depot.compter('archives')).toBe(0);
  });
});
