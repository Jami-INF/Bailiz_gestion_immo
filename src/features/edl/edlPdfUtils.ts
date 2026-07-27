import { format } from 'date-fns';
import { db, getParametres } from '@/lib/db';
import { blobVersDataUrl } from '@/lib/images';
import type { EtatDesLieux } from '@/types';
import type { PhotoPourPdf } from '@/lib/pdf/EdlPdf';

/** Charge toutes les photos d'un EDL en data-URL légendées (pièce, élément, date). */
export async function chargerPhotosPourPdf(edl: EtatDesLieux): Promise<PhotoPourPdf[]> {
  const ids: string[] = [
    ...edl.compteurs.flatMap((c) => (c.photoId ? [c.photoId] : [])),
    ...edl.pieces.flatMap((p) => p.elements.flatMap((el) => el.photoIds)),
    ...(edl.photoIds ?? []),
  ];
  const resultat: PhotoPourPdf[] = [];
  for (const id of ids) {
    const photo = await db.photos.get(id);
    if (!photo) continue;
    resultat.push({
      dataUrl: await blobVersDataUrl(photo.blob),
      legende: `${photo.legende ?? ''} — ${format(new Date(photo.dateCapture), 'dd/MM/yyyy HH:mm')}`,
    });
  }
  return resultat;
}

export async function chargerContexteEdl(edl: EtatDesLieux) {
  const bail = await db.baux.get(edl.bailId);
  if (!bail) throw new Error('Bail introuvable');
  const bien = await db.biens.get(bail.bienId);
  if (!bien) throw new Error('Bien introuvable');
  const locataires = await db.locataires.where('id').anyOf(bail.locataireIds).toArray();
  const parametres = await getParametres();
  const edlEntree = edl.edlEntreeLieId ? await db.edls.get(edl.edlEntreeLieId) : undefined;
  return { bail, bien, locataires, parametres, edlEntree };
}
