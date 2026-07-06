import JSZip from 'jszip';
import { db, getParametres } from './db';
import { nowISO } from './ids';
import type { Photo } from '@/types';

interface DonneesExport {
  version: 1;
  exporteLe: string;
  biens: unknown[];
  locataires: unknown[];
  baux: unknown[];
  inventaires: unknown[];
  edls: unknown[];
  documents: { meta: unknown; fichier: string }[];
  photos: { meta: Omit<Photo, 'blob'>; fichier: string }[];
  parametres: unknown;
}

/** Exporte toutes les données + photos + PDF dans un fichier ZIP. */
export async function exporterSauvegarde(): Promise<Blob> {
  const zip = new JSZip();
  const photosDir = zip.folder('photos')!;
  const docsDir = zip.folder('documents')!;

  const [biens, locataires, baux, inventaires, edls, photos, documents, parametres] =
    await Promise.all([
      db.biens.toArray(),
      db.locataires.toArray(),
      db.baux.toArray(),
      db.inventaires.toArray(),
      db.edls.toArray(),
      db.photos.toArray(),
      db.documents.toArray(),
      getParametres(),
    ]);

  // JSZip ne gère pas les Blob dans tous les environnements : on passe par ArrayBuffer.
  const photosMeta = [];
  for (const p of photos) {
    const fichier = `${p.id}.jpg`;
    photosDir.file(fichier, await p.blob.arrayBuffer());
    const { blob: _blob, ...meta } = p;
    photosMeta.push({ meta, fichier });
  }

  const documentsMeta = [];
  for (const d of documents) {
    const fichier = `${d.id}.pdf`;
    docsDir.file(fichier, await d.blob.arrayBuffer());
    const { blob: _blob, ...meta } = d;
    documentsMeta.push({ meta, fichier });
  }

  const data: DonneesExport = {
    version: 1,
    exporteLe: nowISO(),
    biens,
    locataires,
    baux,
    inventaires,
    edls,
    documents: documentsMeta,
    photos: photosMeta,
    parametres,
  };

  zip.file('data.json', JSON.stringify(data, null, 2));
  const contenu = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  const blob = new Blob([contenu], { type: 'application/zip' });

  await db.parametres.update('singleton', { derniereSauvegarde: nowISO() });
  return blob;
}

export interface ResumeImport {
  biens: number;
  locataires: number;
  baux: number;
  inventaires: number;
  edls: number;
  photos: number;
  documents: number;
}

export async function lireSauvegarde(fichier: Blob): Promise<{ zip: JSZip; data: DonneesExport }> {
  const zip = await JSZip.loadAsync(await fichier.arrayBuffer());
  const dataFile = zip.file('data.json');
  if (!dataFile) throw new Error('Archive invalide : data.json introuvable.');
  const data = JSON.parse(await dataFile.async('string')) as DonneesExport;
  if (data.version !== 1) throw new Error(`Version de sauvegarde non prise en charge : ${data.version}`);
  return { zip, data };
}

/** Détecte les conflits d'identifiants entre la sauvegarde et la base locale. */
export async function detecterConflits(data: DonneesExport): Promise<number> {
  const ids = [
    ...data.biens,
    ...data.locataires,
    ...data.baux,
    ...data.inventaires,
    ...data.edls,
  ].map((e) => (e as { id: string }).id);
  const tables = [db.biens, db.locataires, db.baux, db.inventaires, db.edls];
  let conflits = 0;
  for (const table of tables) {
    conflits += await table.where('id').anyOf(ids).count();
  }
  return conflits;
}

/**
 * Restaure une sauvegarde.
 * mode 'remplacer' : vide toutes les tables puis importe.
 * mode 'fusionner' : met à jour/ajoute par id sans toucher au reste.
 */
export async function importerSauvegarde(
  zip: JSZip,
  data: DonneesExport,
  mode: 'remplacer' | 'fusionner',
): Promise<ResumeImport> {
  const photos: Photo[] = [];
  for (const p of data.photos) {
    const f = zip.file(`photos/${p.fichier}`);
    if (!f) continue;
    const contenu = await f.async('arraybuffer');
    photos.push({ ...(p.meta as Omit<Photo, 'blob'>), blob: new Blob([contenu], { type: 'image/jpeg' }) });
  }

  const documents: Record<string, unknown>[] = [];
  for (const d of data.documents ?? []) {
    const f = zip.file(`documents/${d.fichier}`);
    if (!f) continue;
    const contenu = await f.async('arraybuffer');
    documents.push({
      ...(d.meta as Record<string, unknown>),
      blob: new Blob([contenu], { type: 'application/pdf' }),
    });
  }

  await db.transaction(
    'rw',
    [db.biens, db.locataires, db.baux, db.inventaires, db.edls, db.photos, db.documents, db.parametres],
    async () => {
      if (mode === 'remplacer') {
        await Promise.all([
          db.biens.clear(),
          db.locataires.clear(),
          db.baux.clear(),
          db.inventaires.clear(),
          db.edls.clear(),
          db.photos.clear(),
          db.documents.clear(),
        ]);
      }
      await db.biens.bulkPut(data.biens as never[]);
      await db.locataires.bulkPut(data.locataires as never[]);
      await db.baux.bulkPut(data.baux as never[]);
      await db.inventaires.bulkPut(data.inventaires as never[]);
      await db.edls.bulkPut(data.edls as never[]);
      await db.photos.bulkPut(photos);
      await db.documents.bulkPut(documents as never[]);
      if (data.parametres) {
        await db.parametres.put({ ...(data.parametres as object), id: 'singleton' } as never);
      }
    },
  );

  return {
    biens: data.biens.length,
    locataires: data.locataires.length,
    baux: data.baux.length,
    inventaires: data.inventaires.length,
    edls: data.edls.length,
    photos: photos.length,
    documents: documents.length,
  };
}

/** Vrai si la dernière sauvegarde date de plus de 30 jours (ou n'existe pas). */
export function sauvegardeAncienne(derniereSauvegarde?: string): boolean {
  if (!derniereSauvegarde) return true;
  const trenteJours = 30 * 24 * 3600 * 1000;
  return Date.now() - new Date(derniereSauvegarde).getTime() > trenteJours;
}

export function telechargerBlob(blob: Blob, nomFichier: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
