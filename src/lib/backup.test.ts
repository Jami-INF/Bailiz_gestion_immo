import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { detecterConflits, exporterSauvegarde, importerSauvegarde, lireSauvegarde } from './backup';
import type { Bien, Photo } from '@/types';

function bienFixture(id: string): Bien {
  return {
    id,
    nom: 'T2 Chamalières',
    adresse: { ligne1: '1 rue des Prés', codePostal: '63400', ville: 'Chamalières' },
    type: 'T2',
    surfaceBoutin: 42,
    nbPieces: 2,
    regimeJuridique: 'copropriete',
    equipementsPrivatifs: [],
    partiesCommunes: [],
    annexes: [],
    chauffage: { type: 'individuel', energie: 'électricité' },
    eauChaude: { type: 'individuel', energie: 'électricité' },
    zoneEncadrementLoyers: false,
    piecesModele: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function viderTout() {
  await Promise.all([
    db.biens.clear(),
    db.locataires.clear(),
    db.baux.clear(),
    db.inventaires.clear(),
    db.edls.clear(),
    db.photos.clear(),
    db.documents.clear(),
    db.parametres.clear(),
  ]);
}

describe('export / import de sauvegarde', () => {
  beforeEach(viderTout);

  it('restaure 100 % des données et photos sur une base vierge', async () => {
    await db.biens.add(bienFixture('bien-1'));
    const photo: Photo = {
      id: 'photo-1',
      blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }),
      dateCapture: '2026-01-02T10:00:00.000Z',
      legende: 'Séjour — Sol',
      edlId: 'edl-1',
    };
    await db.photos.add(photo);

    const zipBlob = await exporterSauvegarde();

    // Simule un navigateur vierge
    await viderTout();
    expect(await db.biens.count()).toBe(0);

    const { zip, data } = await lireSauvegarde(zipBlob);
    expect(await detecterConflits(data)).toBe(0);
    const resume = await importerSauvegarde(zip, data, 'remplacer');

    expect(resume.biens).toBe(1);
    expect(resume.photos).toBe(1);
    const bien = await db.biens.get('bien-1');
    expect(bien?.nom).toBe('T2 Chamalières');
    const photoRestauree = await db.photos.get('photo-1');
    expect(photoRestauree?.legende).toBe('Séjour — Sol');
    const octets = new Uint8Array(await photoRestauree!.blob.arrayBuffer());
    expect(Array.from(octets)).toEqual([1, 2, 3, 4]);
  });

  /*
   * L'import écrit par `bulkPut`, qui ne déclenche aucun hook de migration
   * Dexie : une archive écrite avant que l'état des lieux ne porte son contexte
   * doit donc être complétée à la relecture, sinon elle réintroduit dans une
   * base à jour des états des lieux sans logement — invisibles en liste et
   * impossibles à imprimer.
   */
  it("complète le contexte des états des lieux d’une archive écrite avant la v6", async () => {
    const zipBlob = await exporterSauvegarde();
    const { zip, data } = await lireSauvegarde(zipBlob);

    // Archive telle qu'en produisait la version précédente : l'EDL ne connaît
    // que son bail.
    const donnees = data as unknown as { baux: unknown[]; edls: unknown[] };
    donnees.baux = [{ id: 'bail-1', bienId: 'bien-1', locataireIds: ['loc-1', 'loc-2'] }];
    donnees.edls = [
      { id: 'edl-1', reference: 'EDL-2026-0001', bailId: 'bail-1', type: 'entree' },
      { id: 'edl-orphelin', reference: 'EDL-2026-0002', bailId: 'disparu', type: 'entree' },
    ];

    await importerSauvegarde(zip, data, 'remplacer');

    expect(await db.edls.get('edl-1')).toMatchObject({
      bienId: 'bien-1',
      locataireIds: ['loc-1', 'loc-2'],
    });
    // Un EDL dont le bail a disparu reste importé : il est rattachable ensuite,
    // alors qu'un import qui échoue laisserait la base à moitié restaurée.
    expect(await db.edls.get('edl-orphelin')).toBeDefined();
  });

  it('détecte les conflits d’identifiants et fusionne sans effacer le reste', async () => {
    await db.biens.add(bienFixture('bien-1'));
    const zipBlob = await exporterSauvegarde();
    const { zip, data } = await lireSauvegarde(zipBlob);

    // Base contenant déjà bien-1 (modifié) et bien-2 (absent de la sauvegarde)
    await db.biens.put({ ...bienFixture('bien-1'), nom: 'Nom modifié localement' });
    await db.biens.add(bienFixture('bien-2'));
    expect(await detecterConflits(data)).toBe(1);

    await importerSauvegarde(zip, data, 'fusionner');
    expect(await db.biens.count()).toBe(2); // bien-2 conservé
    expect((await db.biens.get('bien-1'))?.nom).toBe('T2 Chamalières'); // écrasé par la sauvegarde
  });
});
