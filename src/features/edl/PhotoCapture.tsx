import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { db } from '@/lib/db';
import { compresserImage } from '@/lib/images';
import { uid, nowISO } from '@/lib/ids';
import { decrireErreur } from '@/lib/erreurs';
import { useToast } from '@/components/ui';

/**
 * Capture de photos via la caméra du device (input capture), compression,
 * stockage en Blob dans IndexedDB, vignettes avec suppression.
 */
export function PhotoCapture({
  edlId,
  legende,
  photoIds,
  onChange,
  lectureSeule,
  onAgrandir,
}: {
  edlId: string;
  legende: string;
  photoIds: string[];
  onChange: (photoIds: string[]) => void;
  lectureSeule?: boolean;
  /** Ouvre la visionneuse plein écran ; absent = vignettes non cliquables. */
  onAgrandir?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let annule = false;
    const crees: string[] = [];
    void (async () => {
      const nouvelles: Record<string, string> = {};
      for (const id of photoIds) {
        const photo = await db.photos.get(id);
        if (photo && !annule) {
          const url = URL.createObjectURL(photo.blob);
          crees.push(url);
          nouvelles[id] = url;
        }
      }
      if (!annule) setUrls(nouvelles);
    })();
    return () => {
      annule = true;
      crees.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [photoIds.join(',')]);

  const capturer = async (fichiers: FileList | null) => {
    if (!fichiers || fichiers.length === 0) return;
    try {
      const ids: string[] = [];
      for (const fichier of Array.from(fichiers)) {
        const blob = await compresserImage(fichier);
        const id = uid();
        await db.photos.add({
          id,
          blob,
          dateCapture: nowISO(),
          legende,
          edlId,
        });
        ids.push(id);
      }
      onChange([...photoIds, ...ids]);
    } catch (e) {
      console.error(e);
      toast('error', `Impossible d'enregistrer la photo — ${decrireErreur(e)}`);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const supprimer = async (id: string) => {
    await db.photos.delete(id);
    onChange(photoIds.filter((x) => x !== id));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {photoIds.map((id) =>
        urls[id] ? (
          <div key={id} className="relative">
            {onAgrandir ? (
              <button type="button" onClick={onAgrandir} aria-label={`Agrandir : ${legende}`}>
                <img src={urls[id]} alt={legende} className="h-14 w-14 rounded-lg object-cover" />
              </button>
            ) : (
              <img src={urls[id]} alt={legende} className="h-14 w-14 rounded-lg object-cover" />
            )}
            {!lectureSeule && (
              <button
                type="button"
                onClick={() => supprimer(id)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
                aria-label="Supprimer la photo"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ) : null,
      )}
      {!lectureSeule && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-14 min-w-touch items-center justify-center gap-1 rounded-lg border-2 border-dashed border-accent-300 px-3 text-accent-600 hover:border-accent-500"
          >
            <Camera size={20} />
            {photoIds.length > 0 && <span className="text-xs font-semibold">{photoIds.length}</span>}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => void capturer(e.target.files)}
          />
        </>
      )}
    </div>
  );
}
