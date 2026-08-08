import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Changement } from '@/lib/db';
import {
  changementsEnAttente,
  compacter,
  compterEnAttente,
  confirmerEnvoi,
  journaliser,
  noterChangement,
  rattraperChangements,
  sansJournaliser,
} from './journal';

beforeEach(async () => {
  await db.changements.clear();
});

function changement(m: Partial<Changement>): Changement {
  return { table: 'baux', cle: 'b1', type: 'maj', horodatage: '2026-08-08T10:00:00.000Z', ...m };
}

describe('compacter', () => {
  it('ne garde qu’une opération par enregistrement', () => {
    // Une visite d'état des lieux écrit en continu : dix modifications du même
    // enregistrement ne doivent produire qu'un seul envoi.
    const brut = [
      changement({ id: 1, horodatage: '2026-08-08T10:00:00.000Z' }),
      changement({ id: 2, horodatage: '2026-08-08T10:00:05.000Z' }),
      changement({ id: 3, horodatage: '2026-08-08T10:00:09.000Z' }),
    ];
    const compact = compacter(brut);
    expect(compact).toHaveLength(1);
    expect(compact[0].id).toBe(3);
  });

  it('laisse la suppression l’emporter sur les modifications qui la précèdent', () => {
    const compact = compacter([
      changement({ id: 1, type: 'maj', horodatage: '2026-08-08T10:00:00.000Z' }),
      changement({ id: 2, type: 'suppr', horodatage: '2026-08-08T10:00:01.000Z' }),
    ]);
    expect(compact).toHaveLength(1);
    expect(compact[0].type).toBe('suppr');
  });

  it('conserve une recréation postérieure à une suppression', () => {
    const compact = compacter([
      changement({ id: 1, type: 'suppr', horodatage: '2026-08-08T10:00:00.000Z' }),
      changement({ id: 2, type: 'maj', horodatage: '2026-08-08T10:00:02.000Z' }),
    ]);
    expect(compact[0].type).toBe('maj');
  });

  it('ne confond pas deux enregistrements ni deux tables', () => {
    const compact = compacter([
      changement({ id: 1, table: 'baux', cle: 'b1' }),
      changement({ id: 2, table: 'baux', cle: 'b2' }),
      changement({ id: 3, table: 'edls', cle: 'b1' }),
    ]);
    expect(compact).toHaveLength(3);
  });
});

describe('journal', () => {
  it('enregistre les modifications et les rend en attente, compactées', async () => {
    await journaliser('biens', 'x1', 'maj');
    await journaliser('biens', 'x1', 'maj');
    await journaliser('locataires', 'l1', 'suppr');
    expect(await compterEnAttente()).toBe(3);

    const attente = await changementsEnAttente();
    expect(attente).toHaveLength(2);
    expect(attente.find((c) => c.cle === 'l1')?.type).toBe('suppr');
  });

  it('n’enregistre rien pendant l’application des données distantes', async () => {
    // Sans cette neutralisation, appliquer un pull produirait des entrées, qui
    // seraient repoussées, qui produiraient un pull… la boucle de réplication.
    await sansJournaliser(async () => {
      await journaliser('biens', 'x1', 'maj');
      await journaliser('biens', 'x2', 'maj');
    });
    expect(await compterEnAttente()).toBe(0);
  });

  it('restaure la journalisation même si l’application distante échoue', async () => {
    await expect(
      sansJournaliser(async () => {
        throw new Error('coupure réseau');
      }),
    ).rejects.toThrow('coupure réseau');

    await journaliser('biens', 'x1', 'maj');
    expect(await compterEnAttente()).toBe(1);
  });

  it('ne retire que les entrées confirmées, pas celles arrivées entre-temps', async () => {
    // Une modification faite pendant l'envoi doit rester en attente : c'est la
    // garantie qu'aucune saisie n'est perdue par un cycle en cours.
    await journaliser('biens', 'x1', 'maj');
    const aEnvoyer = await changementsEnAttente();
    await journaliser('biens', 'x2', 'maj');

    await confirmerEnvoi(aEnvoyer);

    const restant = await db.changements.toArray();
    expect(restant).toHaveLength(1);
    expect(restant[0].cle).toBe('x2');
  });

  it('supporte une confirmation vide sans rien effacer', async () => {
    await journaliser('biens', 'x1', 'maj');
    await confirmerEnvoi([]);
    expect(await compterEnAttente()).toBe(1);
  });
});

describe('rattraperChangements', () => {
  beforeEach(async () => {
    await Promise.all([db.biens.clear(), db.photos.clear(), db.syncEtat.clear()]);
  });

  it('journalise les données déjà présentes à la première activation', async () => {
    // Sans ce rattrapage, activer la synchronisation sur une base existante
    // n'enverrait rien tant qu'on n'aurait pas rouvert chaque fiche.
    await db.biens.put({ id: 'b1', updatedAt: '2026-08-01T10:00:00.000Z' } as never);
    await db.biens.put({ id: 'b2', updatedAt: '2026-08-02T10:00:00.000Z' } as never);

    expect(await rattraperChangements()).toBe(2);
    const attente = await changementsEnAttente();
    expect(attente.map((c) => c.cle).sort()).toEqual(['b1', 'b2']);
    // L'horodatage repris est celui de l'enregistrement, pas celui du rattrapage.
    expect(attente.find((c) => c.cle === 'b1')?.horodatage).toBe('2026-08-01T10:00:00.000Z');
  });

  it('ignore ce qui est déjà synchronisé à l’identique', async () => {
    await db.biens.put({ id: 'b1', updatedAt: '2026-08-01T10:00:00.000Z' } as never);
    await db.syncEtat.put({
      table: 'biens',
      cle: 'b1',
      driveId: 'f1',
      modifieLe: '2026-08-01T10:00:00.000Z',
    });
    expect(await rattraperChangements()).toBe(0);
  });

  it('rattrape un enregistrement modifié depuis sa dernière synchronisation', async () => {
    await db.biens.put({ id: 'b1', updatedAt: '2026-08-05T10:00:00.000Z' } as never);
    await db.syncEtat.put({
      table: 'biens',
      cle: 'b1',
      driveId: 'f1',
      modifieLe: '2026-08-01T10:00:00.000Z',
    });
    expect(await rattraperChangements()).toBe(1);
  });

  it('ne double pas une entrée déjà en attente', async () => {
    await db.biens.put({ id: 'b1', updatedAt: '2026-08-01T10:00:00.000Z' } as never);
    await journaliser('biens', 'b1', 'maj');
    expect(await rattraperChangements()).toBe(0);
  });

  it('se contente des clés pour les photos, sans charger les contenus', async () => {
    await db.photos.put({
      id: 'p1',
      blob: new Blob(['x']),
      dateCapture: '2026-08-01T10:00:00.000Z',
    } as never);
    expect(await rattraperChangements()).toBe(1);

    await db.syncEtat.put({ table: 'photos', cle: 'p1', driveId: 'f1', modifieLe: 'peu importe' });
    await db.changements.clear();
    expect(await rattraperChangements()).toBe(0);
  });
});

describe('journalisation depuis un hook Dexie', () => {
  /**
   * Le chemin réellement emprunté dans l'application : un hook s'exécute
   * **dans** la transaction de la table modifiée. Écrire dans `changements`
   * depuis cette zone échoue silencieusement — d'où ce test, qui reproduit le
   * branchement d'`initAutosaveSurModifications`.
   */
  const brancher = () => {
    db.biens.hook('creating', (cle) => noterChangement('biens', String(cle), 'maj'));
    db.biens.hook('deleting', (cle) => noterChangement('biens', String(cle), 'suppr'));
  };
  let branche = false;

  beforeEach(async () => {
    if (!branche) {
      brancher();
      branche = true;
    }
    await Promise.all([db.biens.clear(), db.changements.clear()]);
  });

  /** Laisse passer le minuteur de vidage. */
  const attendreVidage = () => new Promise((r) => setTimeout(r, 20));

  it('enregistre une création faite par l’application', async () => {
    await db.biens.put({ id: 'b1', updatedAt: '2026-08-08T10:00:00.000Z' } as never);
    await attendreVidage();

    const attente = await db.changements.toArray();
    expect(attente).toHaveLength(1);
    expect(attente[0]).toMatchObject({ table: 'biens', cle: 'b1', type: 'maj' });
  });

  it('enregistre une suppression faite par l’application', async () => {
    await db.biens.put({ id: 'b1', updatedAt: '2026-08-08T10:00:00.000Z' } as never);
    await attendreVidage();
    await db.changements.clear();

    await db.biens.delete('b1');
    await attendreVidage();

    const attente = await db.changements.toArray();
    expect(attente).toHaveLength(1);
    expect(attente[0]).toMatchObject({ cle: 'b1', type: 'suppr' });
  });

  it('n’enregistre rien pendant l’application des données distantes', async () => {
    await sansJournaliser(async () => {
      await db.biens.put({ id: 'distant', updatedAt: '2026-08-08T10:00:00.000Z' } as never);
    });
    await attendreVidage();
    expect(await db.changements.count()).toBe(0);
  });
});
