import { db } from './db';

/** Ce qu'une suppression définitive va réellement effacer. */
export interface PerimetreSuppression {
  /** Baux dont le locataire est le seul titulaire : supprimés intégralement. */
  bauxSupprimes: string[];
  /** Baux en colocation : le locataire en est retiré, le bail subsiste. */
  bauxPartages: string[];
  edls: number;
  /**
   * États des lieux conservés parce qu'ils concernent aussi d'autres personnes.
   * Contrairement à un bail, on n'en retire pas un signataire : un état des
   * lieux signé est immuable. Le nom subsiste donc, et cela doit être annoncé.
   */
  edlsPartages: string[];
  photos: number;
  documents: number;
}

/**
 * Tout ce qui dépend d'un locataire, calculé une fois.
 *
 * Les états des lieux ne se retrouvent plus seulement par le bail : depuis
 * qu'un constat peut être établi **sans bail**, un état des lieux portant le
 * nom, la signature manuscrite et l'horodatage du locataire échapperait
 * autrement à la suppression définitive - ce qui viderait le droit à
 * l'effacement de son objet. La recherche par bail et la recherche par parties
 * sont donc réunies.
 */
async function dependancesLocataire(locataireId: string) {
  const baux = await db.baux.where('locataireIds').equals(locataireId).toArray();
  const seuls = baux.filter((b) => b.locataireIds.length <= 1);
  const partagesBaux = baux.filter((b) => b.locataireIds.length > 1);
  const idsSeuls = seuls.map((b) => b.id);

  const parBail = idsSeuls.length ? await db.edls.where('bailId').anyOf(idsSeuls).toArray() : [];
  const parPartie = await db.edls.where('locataireIds').equals(locataireId).toArray();

  // Même règle que pour les baux : supprimé s'il ne concerne que lui, conservé
  // s'il concerne aussi quelqu'un d'autre.
  const aSupprimer = new Map(parBail.map((e) => [e.id, e]));
  const partagesEdls = [];
  for (const edl of parPartie) {
    if (aSupprimer.has(edl.id)) continue;
    if ((edl.locataireIds ?? []).filter((id) => id !== locataireId).length === 0) {
      aSupprimer.set(edl.id, edl);
    } else {
      partagesEdls.push(edl);
    }
  }

  const edls = [...aSupprimer.values()];
  const edlIds = edls.map((e) => e.id);
  const photoIds = edlIds.length ? await db.photos.where('edlId').anyOf(edlIds).primaryKeys() : [];
  // Un PDF peut être rattaché au bail ou directement à l'EDL.
  const docsBail = idsSeuls.length ? await db.documents.where('bailId').anyOf(idsSeuls).primaryKeys() : [];
  const docsEdl = edlIds.length ? await db.documents.where('edlId').anyOf(edlIds).primaryKeys() : [];
  const docIds = [...new Set([...docsBail, ...docsEdl])];

  return { seuls, partagesBaux, idsSeuls, edls, edlIds, partagesEdls, photoIds, docIds };
}

function versPerimetre(d: Awaited<ReturnType<typeof dependancesLocataire>>): PerimetreSuppression {
  return {
    bauxSupprimes: d.seuls.map((b) => b.reference),
    bauxPartages: d.partagesBaux.map((b) => b.reference),
    edls: d.edls.length,
    edlsPartages: d.partagesEdls.map((e) => e.reference),
    photos: d.photoIds.length,
    documents: d.docIds.length,
  };
}

/**
 * Calcule ce que la suppression d'un locataire va effacer, sans rien modifier :
 * permet d'annoncer précisément le périmètre avant confirmation.
 */
export async function perimetreSuppressionLocataire(locataireId: string): Promise<PerimetreSuppression> {
  return versPerimetre(await dependancesLocataire(locataireId));
}

/**
 * Suppression définitive d'un locataire (droit à l'effacement, RGPD).
 *
 * Efface aussi **tout ce qui porte ses données personnelles** : baux dont il est
 * le seul titulaire, états des lieux qui ne concernent que lui - qu'ils soient
 * rattachés à un bail ou non -, photos associées et PDF archivés, sans quoi son
 * nom, son adresse et ses coordonnées resteraient lisibles dans les documents
 * générés. En colocation, le bail reste (il concerne les autres locataires) et
 * le locataire en est simplement retiré.
 */
export async function supprimerLocataireEtDonnees(locataireId: string): Promise<PerimetreSuppression> {
  const d = await dependancesLocataire(locataireId);

  await db.transaction(
    'rw',
    [db.locataires, db.baux, db.edls, db.photos, db.documents],
    async () => {
      if (d.photoIds.length) await db.photos.bulkDelete(d.photoIds);
      if (d.docIds.length) await db.documents.bulkDelete(d.docIds);
      if (d.edlIds.length) await db.edls.bulkDelete(d.edlIds);
      if (d.idsSeuls.length) await db.baux.bulkDelete(d.idsSeuls);
      for (const bail of d.partagesBaux) {
        await db.baux.put({
          ...bail,
          locataireIds: bail.locataireIds.filter((id) => id !== locataireId),
        });
      }
      await db.locataires.delete(locataireId);
    },
  );

  return versPerimetre(d);
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
 * un enregistrement interrompu - il n'y avait jusqu'ici aucun moyen d'en
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
