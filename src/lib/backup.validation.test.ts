import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { db } from '@/lib/db';
import { lireSauvegarde, validerSauvegarde, VERSION_SAUVEGARDE } from './backup';

/** Sauvegarde minimale valide. */
function donneesValides(surcharge: Record<string, unknown> = {}) {
  return {
    version: VERSION_SAUVEGARDE,
    exporteLe: '2026-08-11T10:00:00.000Z',
    biens: [],
    locataires: [],
    baux: [],
    inventaires: [],
    edls: [],
    documents: [],
    photos: [],
    parametres: {},
    ...surcharge,
  };
}

async function zipAvec(data: unknown): Promise<Blob> {
  const zip = new JSZip();
  zip.file('data.json', typeof data === 'string' ? data : JSON.stringify(data));
  const contenu = await zip.generateAsync({ type: 'arraybuffer' });
  return new Blob([contenu], { type: 'application/zip' });
}

describe('validerSauvegarde', () => {
  it('accepte une sauvegarde bien formée', () => {
    expect(() => validerSauvegarde(donneesValides())).not.toThrow();
  });

  it('refuse un format plus récent en disant quoi faire', () => {
    // Le cas dangereux : importer une archive écrite par une version ultérieure
    // perdrait silencieusement les champs que cette version ignore.
    expect(() => validerSauvegarde(donneesValides({ version: 99 }))).toThrow(
      /version plus récente de Bailiz.*Mettez l'application à jour/s,
    );
  });

  it('refuse un format plus ancien', () => {
    expect(() => validerSauvegarde(donneesValides({ version: 0 }))).toThrow(/non pris en charge/);
  });

  it('refuse un fichier sans numéro de version', () => {
    const { version: _v, ...sansVersion } = donneesValides();
    expect(() => validerSauvegarde(sansVersion)).toThrow(/aucun numéro de version/);
  });

  it('refuse une archive tronquée, en nommant ce qui manque', () => {
    // Sans ce contrôle, `bulkPut` échouait à mi-parcours — après que le mode
    // « remplacer » a déjà vidé les tables.
    const { edls: _e, photos: _p, ...tronque } = donneesValides();
    expect(() => validerSauvegarde(tronque)).toThrow(/edls, photos manquant/);
  });

  it('refuse une collection qui n’est pas un tableau', () => {
    expect(() => validerSauvegarde(donneesValides({ baux: 'oui' }))).toThrow(/baux manquant/);
  });

  it('refuse tout ce qui n’est pas un objet', () => {
    expect(() => validerSauvegarde(null)).toThrow(/pas de sauvegarde Bailiz/);
    expect(() => validerSauvegarde('coucou')).toThrow(/pas de sauvegarde Bailiz/);
  });
});

describe('lireSauvegarde', () => {
  it('lit une archive valide', async () => {
    const { data } = await lireSauvegarde(await zipAvec(donneesValides()));
    expect(data.version).toBe(VERSION_SAUVEGARDE);
  });

  it('refuse une archive sans data.json', async () => {
    const zip = new JSZip();
    zip.file('photos/x.jpg', 'x');
    const blob = new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
    await expect(lireSauvegarde(blob)).rejects.toThrow(/data.json introuvable/);
  });

  it('refuse un data.json illisible', async () => {
    await expect(lireSauvegarde(await zipAvec('{ pas du json'))).rejects.toThrow(
      /pas un fichier JSON valide/,
    );
  });

  it('ne touche à rien quand la validation échoue', async () => {
    await db.biens.clear();
    await db.biens.put({ id: 'temoin' } as never);
    await expect(lireSauvegarde(await zipAvec(donneesValides({ version: 99 })))).rejects.toThrow();
    expect(await db.biens.count()).toBe(1);
  });
});
