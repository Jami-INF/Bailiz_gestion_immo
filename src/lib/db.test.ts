import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest';
import { db, getParametres, prochaineReference } from './db';

beforeEach(async () => {
  await db.parametres.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getParametres', () => {
  it('crée les paramètres par défaut au premier appel, puis les réutilise', async () => {
    const premier = await getParametres();
    expect(premier.id).toBe('singleton');
    expect(premier.grilleVetuste.length).toBeGreaterThan(0);

    premier.bailleur.nom = 'Infante';
    await db.parametres.put(premier);

    const second = await getParametres();
    expect(second.bailleur.nom).toBe('Infante');
    expect(await db.parametres.count()).toBe(1);
  });

  it('complète les champs apparus après la création (modèle de fiche de visite)', async () => {
    // Paramètres tels qu'enregistrés avant la fonctionnalité (ou restaurés
    // depuis une sauvegarde plus ancienne) : `ficheVisite` n'existe pas.
    const anciens = await getParametres();
    delete (anciens as { ficheVisite?: unknown }).ficheVisite;
    await db.parametres.put(anciens);

    const lus = await getParametres();
    expect(lus.ficheVisite?.sections.length).toBeGreaterThan(0);
  });

  it('ne remplace pas un modèle de fiche de visite personnalisé', async () => {
    const params = await getParametres();
    await db.parametres.put({
      ...params,
      ficheVisite: { ...params.ficheVisite!, introDossier: 'Mon texte à moi', sections: [] },
    });

    const lus = await getParametres();
    expect(lus.ficheVisite?.introDossier).toBe('Mon texte à moi');
    expect(lus.ficheVisite?.sections).toEqual([]);
  });

  it('accepte une photo rattachée à un bien, sans état des lieux', async () => {
    await db.photos.put({
      id: 'photo-bien',
      blob: new Blob(['x'], { type: 'image/jpeg' }),
      dateCapture: '2026-08-04T00:00:00.000Z',
      bienId: 'bien-1',
    });
    const parBien = await db.photos.where('bienId').equals('bien-1').toArray();
    expect(parBien).toHaveLength(1);
    // Les photos d'EDL restent requêtables sans être polluées par celle du bien.
    expect(await db.photos.where('edlId').equals('edl-1').count()).toBe(0);
    await db.photos.delete('photo-bien');
  });
});

describe('prochaineReference', () => {
  it('numérote au format TYPE-ANNEE-XXXX et incrémente à chaque appel', async () => {
    const annee = new Date().getFullYear();
    expect(await prochaineReference('bail')).toBe(`BAIL-${annee}-0001`);
    expect(await prochaineReference('bail')).toBe(`BAIL-${annee}-0002`);
  });

  it('tient une séquence indépendante par type de document', async () => {
    const annee = new Date().getFullYear();
    await prochaineReference('bail');
    expect(await prochaineReference('edl')).toBe(`EDL-${annee}-0001`);
    expect(await prochaineReference('document')).toBe(`DOC-${annee}-0001`);
    expect(await prochaineReference('bail')).toBe(`BAIL-${annee}-0002`);
  });

  it('remet toutes les séquences à zéro au changement d’année', async () => {
    // Seul `Date` est simulé : simuler tous les timers bloquerait les
    // transactions IndexedDB (Dexie s'appuie dessus en interne).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-31T10:00:00'));
    expect(await prochaineReference('bail')).toBe('BAIL-2026-0001');
    expect(await prochaineReference('edl')).toBe('EDL-2026-0001');

    vi.setSystemTime(new Date('2027-01-01T10:00:00'));
    expect(await prochaineReference('bail')).toBe('BAIL-2027-0001');
    // L'autre compteur repart lui aussi de zéro sur la nouvelle année.
    expect(await prochaineReference('edl')).toBe('EDL-2027-0001');
  });

  it('n’attribue jamais deux fois la même référence en cas d’appels concurrents', async () => {
    const refs = await Promise.all(Array.from({ length: 8 }, () => prochaineReference('document')));
    expect(new Set(refs).size).toBe(8);
  });
});
