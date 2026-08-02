import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '@/lib/db';

/** Un lot de photos affichable dans la visionneuse (« Entrée », « Sortie »…). */
export interface GroupePhotos {
  libelle: string;
  photoIds: string[];
}

interface PhotoAffichee {
  url: string;
  dateCapture?: string;
  legende?: string;
}

/**
 * Visionneuse plein écran : agrandit une photo d'état des lieux, permet de
 * naviguer dans le lot et de **basculer entre les photos d'entrée et de
 * sortie** — c'est ce va-et-vient qui rend la comparaison exploitable sur le
 * terrain, sans quitter l'élément en cours de relevé.
 */
export function VisionneusePhotos({
  groupes,
  groupeInitial = 0,
  titre,
  onClose,
}: {
  groupes: GroupePhotos[];
  groupeInitial?: number;
  /** Élément concerné, rappelé en en-tête (ex. « Séjour — Canapé »). */
  titre?: string;
  onClose: () => void;
}) {
  const [groupeIdx, setGroupeIdx] = useState(groupeInitial);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [photos, setPhotos] = useState<PhotoAffichee[] | null>(null);

  const groupe = groupes[Math.min(groupeIdx, groupes.length - 1)];
  const ids = groupe?.photoIds ?? [];

  // Charge les Blob du groupe courant et libère les URL au changement.
  useEffect(() => {
    let annule = false;
    const crees: string[] = [];
    setPhotos(null);
    void (async () => {
      const chargees: PhotoAffichee[] = [];
      for (const id of ids) {
        const photo = await db.photos.get(id);
        // Photo absente (EDL d'entrée purgé, restauration partielle) : on
        // l'ignore plutôt que de bloquer l'affichage.
        if (!photo || annule) continue;
        const url = URL.createObjectURL(photo.blob);
        crees.push(url);
        chargees.push({ url, dateCapture: photo.dateCapture, legende: photo.legende });
      }
      if (!annule) setPhotos(chargees);
    })();
    return () => {
      annule = true;
      crees.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [ids.join(','), groupeIdx]);

  // Navigation au clavier (desktop) : flèches et Échap.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setPhotoIdx((i) => i + 1);
      if (e.key === 'ArrowLeft') setPhotoIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onClose]);

  const total = photos?.length ?? 0;
  const index = total ? Math.min(photoIdx, total - 1) : 0;
  const courante = photos?.[index];

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          {titre && <p className="truncate text-sm font-medium">{titre}</p>}
          <p className="text-xs text-white/70">
            {groupe?.libelle}
            {total > 1 ? ` — ${index + 1}/${total}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X size={22} />
        </button>
      </div>

      {/* Bascule entrée / sortie : le geste central de la comparaison. */}
      {groupes.length > 1 && (
        <div className="flex justify-center gap-2 px-4 pb-2">
          {groupes.map((g, i) => (
            <button
              key={g.libelle}
              type="button"
              onClick={() => {
                setGroupeIdx(i);
                setPhotoIdx(0);
              }}
              className={`min-h-touch rounded-lg px-4 py-1.5 text-sm font-medium ${
                i === groupeIdx ? 'bg-white text-accent-900' : 'bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              {g.libelle}
              <span className="ml-1 text-xs opacity-70">({g.photoIds.length})</span>
            </button>
          ))}
        </div>
      )}

      <div className="relative flex grow items-center justify-center px-2">
        {photos === null ? (
          <p className="text-sm text-white/70">Chargement…</p>
        ) : courante ? (
          <img
            src={courante.url}
            alt={courante.legende ?? 'Photo'}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/70">
            <ImageOff size={32} />
            <p className="text-sm">Aucune photo disponible pour « {groupe?.libelle} ».</p>
          </div>
        )}

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => setPhotoIdx(Math.max(0, index - 1))}
              disabled={index === 0}
              aria-label="Photo précédente"
              className="absolute left-2 flex min-h-touch min-w-touch items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-30"
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              onClick={() => setPhotoIdx(Math.min(total - 1, index + 1))}
              disabled={index >= total - 1}
              aria-label="Photo suivante"
              className="absolute right-2 flex min-h-touch min-w-touch items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-30"
            >
              <ChevronRight size={26} />
            </button>
          </>
        )}
      </div>

      {courante && (
        <div className="px-4 py-3 text-center text-xs text-white/70">
          {courante.legende}
          {courante.dateCapture && ` — ${format(new Date(courante.dateCapture), 'dd/MM/yyyy à HH:mm')}`}
        </div>
      )}
    </div>
  );
}

/**
 * Vignette de référence « Entrée » affichée à côté d'un élément pendant l'état
 * des lieux de sortie : elle rappelle l'aspect du bien à l'entrée et ouvre la
 * visionneuse au tap. Rien n'est rendu si aucune photo d'entrée n'existe, pour
 * ne pas laisser de cadre vide dans la liste.
 */
export function VignetteEntree({
  photoIds,
  onOuvrir,
}: {
  photoIds: string[];
  onOuvrir: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    let cree: string | undefined;
    void (async () => {
      const photo = photoIds[0] ? await db.photos.get(photoIds[0]) : undefined;
      if (!photo || annule) return;
      cree = URL.createObjectURL(photo.blob);
      setUrl(cree);
    })();
    return () => {
      annule = true;
      if (cree) URL.revokeObjectURL(cree);
    };
  }, [photoIds.join(',')]);

  if (photoIds.length === 0) return null;

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-accent-600">Entrée</span>
      <button
        type="button"
        onClick={onOuvrir}
        aria-label={`Voir les ${photoIds.length} photo(s) prise(s) à l'entrée`}
        className="relative h-14 w-14 overflow-hidden rounded-lg border-2 border-accent-300 bg-accent-50"
      >
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-accent-400">
            <ImageOff size={16} />
          </span>
        )}
        {photoIds.length > 1 && (
          <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[10px] font-semibold text-white">
            +{photoIds.length - 1}
          </span>
        )}
      </button>
    </div>
  );
}
