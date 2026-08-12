import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

/**
 * Migration v6 : l'état des lieux se met à porter son logement et ses parties.
 *
 * Le test ouvre d'abord une base au **schéma v5** (celui d'avant), y écrit des
 * données, la referme, puis laisse l'application ouvrir la sienne - ce qui
 * déclenche l'`upgrade`. C'est le seul moyen d'éprouver réellement la
 * migration : la vérifier sur une base neuve ne prouverait rien, or c'est
 * précisément sur les bases existantes qu'elle doit tenir.
 *
 * Le module `db` n'est importé qu'après l'écriture de la base ancienne, son
 * import déclenchant l'ouverture.
 */
describe('migration v6', () => {
  it('reconstruit logement et parties depuis le bail, et tolère un bail disparu', async () => {
    const ancienne = new Dexie('bailiz');
    ancienne.version(5).stores({
      biens: 'id, nom, updatedAt',
      locataires: 'id, nom, updatedAt',
      baux: 'id, reference, bienId, statut, updatedAt, *locataireIds',
      inventaires: 'id, reference, bailId, statut',
      edls: 'id, reference, bailId, type, statut, updatedAt',
      photos: 'id, edlId, bienId',
      documents: 'id, reference, type, bienId, bailId, edlId, createdAt',
      parametres: 'id',
      sauvegardeAuto: 'id',
      changements: '++id, [table+cle], horodatage',
      syncEtat: '[table+cle], driveId',
      brouillons: 'cle',
    });
    await ancienne.open();
    await ancienne.table('baux').put({
      id: 'bail-1',
      reference: 'BAIL-2026-0001',
      bienId: 'bien-7',
      locataireIds: ['loc-1', 'loc-2'],
    });
    await ancienne.table('edls').bulkPut([
      { id: 'edl-1', reference: 'EDL-2026-0001', bailId: 'bail-1', type: 'entree', statut: 'signe' },
      // Bail supprimé sans son EDL (base abîmée, ou suppression reçue par
      // synchronisation) : la migration ne doit pas échouer sur lui - sinon
      // c'est l'ouverture de l'application qui échoue.
      { id: 'edl-orphelin', reference: 'EDL-2026-0002', bailId: 'disparu', type: 'entree', statut: 'brouillon' },
    ]);
    ancienne.close();

    const { db } = await import('./db');
    await db.open();

    expect(await db.edls.get('edl-1')).toMatchObject({
      bienId: 'bien-7',
      locataireIds: ['loc-1', 'loc-2'],
    });
    const orphelin = await db.edls.get('edl-orphelin');
    expect(orphelin).toBeDefined();
    expect(orphelin?.bienId).toBeUndefined();
    expect(orphelin?.locataireIds).toEqual([]);
  });

  it('indexe les parties : un état des lieux se retrouve par son locataire', async () => {
    const { db } = await import('./db');
    await db.open();
    await db.edls.clear();
    await db.edls.bulkPut([
      { id: 'a', locataireIds: ['loc-1'] },
      { id: 'b', locataireIds: ['loc-2', 'loc-1'] },
      { id: 'c', locataireIds: ['loc-3'] },
    ] as never[]);

    const trouves = await db.edls.where('locataireIds').equals('loc-1').primaryKeys();
    expect(trouves.sort()).toEqual(['a', 'b']);
  });
});
