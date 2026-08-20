import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import { mettreAJourMiroir } from './miroir';
import { DossierMemoire } from '@/test/dossierMemoire';
import { unBien, viderBase } from '@/test/utils';

/**
 * Miroir du dossier local.
 *
 * Ce qui se joue : que le dossier soit **utilisable** - une fiche, une photo,
 * retrouvables sans dézipper - et surtout qu'un passage ne coûte que ce qui a
 * changé. Le régime précédent recompressait toute la photothèque à chaque salve
 * de saisie ; un miroir qui relirait les photos à chaque passage ne vaudrait
 * pas mieux.
 */

const PHOTO = {
  id: 'photo-1',
  blob: new Blob(['JPEG'], { type: 'image/jpeg' }),
  dateCapture: '2026-01-01T10:00:00.000Z',
  edlId: 'edl-1',
};

beforeEach(async () => {
  await viderBase();
  vi.restoreAllMocks();
});

/** Un dossier miroir déjà à jour, et son repère de passage. */
async function miroirEtabli() {
  const dossier = new DossierMemoire();
  const premier = await mettreAJourMiroir(dossier.handle);
  return { dossier, depuis: premier.jusqua };
}

describe('miroir du dossier local', () => {
  it('écrit les fiches à plat, dans l’arborescence du Drive', async () => {
    await db.biens.add(unBien());
    await db.photos.add(PHOTO);
    const dossier = new DossierMemoire();

    await mettreAJourMiroir(dossier.handle);

    expect(dossier.noms('donnees')).toContain('biens__bien-1.json');
    expect(dossier.noms('photos')).toEqual(['photo-1.jpg']);
    // Les réglages voyagent aussi : un miroir doit permettre de tout retrouver.
    expect(dossier.noms('donnees')).toContain('parametres__singleton.json');

    const enveloppe = JSON.parse((await dossier.lire('donnees', 'biens__bien-1.json'))!);
    expect(enveloppe.table).toBe('biens');
    expect(enveloppe.donnees.nom).toBe('T2 Chamalières');
  });

  it('sépare le binaire de ses métadonnées, comme sur le Drive', async () => {
    await db.photos.add(PHOTO);
    const dossier = new DossierMemoire();

    await mettreAJourMiroir(dossier.handle);

    const meta = JSON.parse((await dossier.lire('donnees', 'photos__photo-1.json'))!);
    // Le blob n'a rien à faire dans le JSON : il est à côté, lisible tel quel.
    expect(meta.donnees.blob).toBeUndefined();
    expect(meta.donnees.dateCapture).toBe('2026-01-01T10:00:00.000Z');
    expect(await dossier.lire('photos', 'photo-1.jpg')).toBe('JPEG');
  });

  it('ne réécrit rien quand rien n’a changé', async () => {
    await db.biens.add(unBien());
    await db.photos.add(PHOTO);
    const { dossier, depuis } = await miroirEtabli();

    expect((await mettreAJourMiroir(dossier.handle, depuis)).ecrits).toBe(0);
  });

  it('ne relit même pas les photos déjà copiées', async () => {
    /*
     * Le point de tout l'exercice. Lire une photo, c'est charger son blob en
     * mémoire - quelques centaines de kilooctets par cliché, et un état des
     * lieux en compte des dizaines. Un miroir qui les relirait à chaque salve
     * de saisie aurait remplacé un gaspillage par un autre.
     */
    await db.photos.add(PHOTO);
    const { dossier, depuis } = await miroirEtabli();

    const espion = vi.spyOn(db.photos, 'get');
    await mettreAJourMiroir(dossier.handle, depuis);
    expect(espion).not.toHaveBeenCalled();
  });

  it('recopie une fiche modifiée depuis le dernier passage', async () => {
    await db.biens.add(unBien());
    const { dossier, depuis } = await miroirEtabli();

    await db.biens.update('bien-1', { nom: 'T3 Lyon', updatedAt: new Date().toISOString() });
    const resume = await mettreAJourMiroir(dossier.handle, depuis);

    expect(resume.ecrits).toBe(1);
    const enveloppe = JSON.parse((await dossier.lire('donnees', 'biens__bien-1.json'))!);
    expect(enveloppe.donnees.nom).toBe('T3 Lyon');
  });

  it('retire du miroir ce que la base n’a plus, blob compris', async () => {
    await db.biens.add(unBien());
    await db.photos.add(PHOTO);
    const { dossier, depuis } = await miroirEtabli();

    await db.photos.delete('photo-1');
    const resume = await mettreAJourMiroir(dossier.handle, depuis);

    // Le JSON de métadonnées **et** le binaire : en laisser un serait laisser
    // une photo d'état des lieux dans un dossier synchronisé après sa
    // suppression - exactement ce qu'un effacement doit emporter.
    expect(resume.supprimes).toBe(2);
    expect(dossier.noms('photos')).toEqual([]);
    expect(dossier.noms('donnees')).not.toContain('photos__photo-1.json');
  });

  it('ne touche pas aux fichiers qu’il n’a pas écrits', async () => {
    await db.biens.add(unBien());
    const { dossier, depuis } = await miroirEtabli();

    // Le dossier appartient à l'utilisateur : il peut parfaitement y avoir
    // déposé autre chose, et un miroir n'a pas à faire le ménage chez lui.
    const donnees = await dossier.getDirectoryHandle('donnees');
    donnees.fichiers.set('mes-notes.txt', new Blob(['à conserver']));

    await mettreAJourMiroir(dossier.handle, depuis);
    expect(dossier.noms('donnees')).toContain('mes-notes.txt');
  });
});
