import { db } from './db';

/** Ce qu'une suppression définitive va réellement effacer. */
export interface PerimetreSuppression {
  /** Baux dont le locataire est le seul titulaire : supprimés intégralement. */
  bauxSupprimes: string[];
  /** Baux en colocation : le locataire en est retiré, le bail subsiste. */
  bauxPartages: string[];
  edls: number;
  photos: number;
  documents: number;
}

/**
 * Calcule ce que la suppression d'un locataire va effacer, sans rien modifier :
 * permet d'annoncer précisément le périmètre avant confirmation.
 */
export async function perimetreSuppressionLocataire(locataireId: string): Promise<PerimetreSuppression> {
  const baux = await db.baux.where('locataireIds').equals(locataireId).toArray();
  const seuls = baux.filter((b) => b.locataireIds.length <= 1);
  const partages = baux.filter((b) => b.locataireIds.length > 1);
  const idsSeuls = seuls.map((b) => b.id);

  const edls = idsSeuls.length ? await db.edls.where('bailId').anyOf(idsSeuls).toArray() : [];
  const edlIds = edls.map((e) => e.id);
  const photos = edlIds.length ? await db.photos.where('edlId').anyOf(edlIds).count() : 0;

  // Un PDF peut être rattaché au bail ou directement à l'EDL.
  const docsBail = idsSeuls.length ? await db.documents.where('bailId').anyOf(idsSeuls).toArray() : [];
  const docsEdl = edlIds.length ? await db.documents.where('edlId').anyOf(edlIds).toArray() : [];
  const documents = new Set([...docsBail, ...docsEdl].map((d) => d.id)).size;

  return {
    bauxSupprimes: seuls.map((b) => b.reference),
    bauxPartages: partages.map((b) => b.reference),
    edls: edls.length,
    photos,
    documents,
  };
}

/**
 * Suppression définitive d'un locataire (droit à l'effacement, RGPD).
 *
 * Efface aussi **tout ce qui porte ses données personnelles** : baux dont il est
 * le seul titulaire, états des lieux de ces baux, photos associées et PDF
 * archivés — sans quoi son nom, son adresse et ses coordonnées resteraient
 * lisibles dans les documents générés. En colocation, le bail reste (il
 * concerne les autres locataires) et le locataire en est simplement retiré.
 */
export async function supprimerLocataireEtDonnees(locataireId: string): Promise<PerimetreSuppression> {
  const perimetre = await perimetreSuppressionLocataire(locataireId);
  const baux = await db.baux.where('locataireIds').equals(locataireId).toArray();
  const idsSeuls = baux.filter((b) => b.locataireIds.length <= 1).map((b) => b.id);
  const partages = baux.filter((b) => b.locataireIds.length > 1);

  const edls = idsSeuls.length ? await db.edls.where('bailId').anyOf(idsSeuls).toArray() : [];
  const edlIds = edls.map((e) => e.id);
  const docsBail = idsSeuls.length ? await db.documents.where('bailId').anyOf(idsSeuls).toArray() : [];
  const docsEdl = edlIds.length ? await db.documents.where('edlId').anyOf(edlIds).toArray() : [];
  const docIds = [...new Set([...docsBail, ...docsEdl].map((d) => d.id))];
  const photoIds = edlIds.length
    ? (await db.photos.where('edlId').anyOf(edlIds).toArray()).map((p) => p.id)
    : [];

  await db.transaction(
    'rw',
    [db.locataires, db.baux, db.edls, db.photos, db.documents],
    async () => {
      if (photoIds.length) await db.photos.bulkDelete(photoIds);
      if (docIds.length) await db.documents.bulkDelete(docIds);
      if (edlIds.length) await db.edls.bulkDelete(edlIds);
      if (idsSeuls.length) await db.baux.bulkDelete(idsSeuls);
      for (const bail of partages) {
        await db.baux.put({
          ...bail,
          locataireIds: bail.locataireIds.filter((id) => id !== locataireId),
        });
      }
      await db.locataires.delete(locataireId);
    },
  );

  return perimetre;
}

/** Ce que la suppression d'un bail va effacer avec lui. */
export interface PerimetreSuppressionBail {
  edls: number;
  photos: number;
  documents: number;
}

/**
 * Calcule ce que la suppression d'un bail entraînera, sans rien modifier.
 *
 * Les locataires et le bien, eux, **survivent** : ils existent indépendamment
 * du bail et peuvent en porter d'autres.
 */
export async function perimetreSuppressionBail(bailId: string): Promise<PerimetreSuppressionBail> {
  const edlIds = await db.edls.where('bailId').equals(bailId).primaryKeys();
  const photos = edlIds.length ? await db.photos.where('edlId').anyOf(edlIds).count() : 0;
  // Un PDF peut être rattaché au bail ou directement à l'un de ses EDL.
  const docsBail = await db.documents.where('bailId').equals(bailId).primaryKeys();
  const docsEdl = edlIds.length ? await db.documents.where('edlId').anyOf(edlIds).primaryKeys() : [];
  return {
    edls: edlIds.length,
    photos,
    documents: new Set([...docsBail, ...docsEdl]).size,
  };
}

/**
 * Supprime un bail et tout ce qui n'existe que par lui : états des lieux,
 * photos de ces états des lieux, PDF archivés.
 *
 * Nécessaire ne serait-ce que pour se débarrasser d'un bail resté en base après
 * un enregistrement interrompu — il n'y avait jusqu'ici aucun moyen d'en
 * effacer un. Les photos et les PDF partent avec : laisser des blobs orphelins
 * dans IndexedDB les rendrait invisibles et indestructibles.
 */
export async function supprimerBailEtDonnees(bailId: string): Promise<PerimetreSuppressionBail> {
  const perimetre = await perimetreSuppressionBail(bailId);
  const edlIds = await db.edls.where('bailId').equals(bailId).primaryKeys();
  const photoIds = edlIds.length
    ? await db.photos.where('edlId').anyOf(edlIds).primaryKeys()
    : [];
  const docsBail = await db.documents.where('bailId').equals(bailId).primaryKeys();
  const docsEdl = edlIds.length ? await db.documents.where('edlId').anyOf(edlIds).primaryKeys() : [];
  const docIds = [...new Set([...docsBail, ...docsEdl])];

  await db.transaction('rw', [db.baux, db.edls, db.photos, db.documents], async () => {
    if (photoIds.length) await db.photos.bulkDelete(photoIds);
    if (docIds.length) await db.documents.bulkDelete(docIds);
    if (edlIds.length) await db.edls.bulkDelete(edlIds);
    await db.baux.delete(bailId);
  });

  return perimetre;
}
