import { format } from 'date-fns';
import { db, getParametres } from '@/lib/db';
import { blobVersDataUrl } from '@/lib/images';
import type { EtatDesLieux } from '@/types';
import { ETAT_LABELS } from '@/types';
import type { ComparaisonPhotos, PhotoPourPdf } from '@/lib/pdf/EdlPdf';

/** Nombre de clichés repris par côté dans la comparaison (garde-fou mémoire iPad). */
const MAX_PHOTOS_PAR_COTE = 2;

async function chargerPhoto(id: string): Promise<PhotoPourPdf | null> {
  const photo = await db.photos.get(id);
  if (!photo) return null;
  return {
    dataUrl: await blobVersDataUrl(photo.blob),
    legende: `${photo.legende ?? ''} — ${format(new Date(photo.dateCapture), 'dd/MM/yyyy HH:mm')}`,
  };
}

/**
 * Paires avant/après des éléments **dégradés ou manquants** d'un EDL de sortie :
 * c'est ce qui prouve la différence, et donc ce qui fonde une retenue sur le
 * dépôt de garantie. Volontairement limité aux dégradations et à quelques
 * clichés par côté — comparer toutes les photos alourdirait le PDF au point de
 * mettre en échec sa génération sur tablette.
 */
export async function chargerComparaisons(edl: EtatDesLieux): Promise<ComparaisonPhotos[]> {
  if (edl.type !== 'sortie') return [];
  const comparaisons: ComparaisonPhotos[] = [];
  for (const piece of edl.pieces) {
    for (const el of piece.elements) {
      if (!el.degradation && !el.manquant) continue;
      const entree = (
        await Promise.all((el.photoIdsEntree ?? []).slice(0, MAX_PHOTOS_PAR_COTE).map(chargerPhoto))
      ).filter((p): p is PhotoPourPdf => p !== null);
      const sortie = (
        await Promise.all(el.photoIds.slice(0, MAX_PHOTOS_PAR_COTE).map(chargerPhoto))
      ).filter((p): p is PhotoPourPdf => p !== null);
      comparaisons.push({
        pieceNom: piece.nom,
        elementNom: el.nom,
        etatEntree: el.etatEntree ? ETAT_LABELS[el.etatEntree] : undefined,
        etatSortie: el.manquant ? 'Manquant' : el.etat ? ETAT_LABELS[el.etat] : 'Non renseigné',
        commentaireEntree: el.commentaireEntree,
        commentaireSortie: el.commentaire,
        photosEntree: entree,
        photosSortie: sortie,
      });
    }
  }
  return comparaisons;
}

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
