import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { db } from '@/lib/db';
import { compresserImage } from '@/lib/images';
import { uid, nowISO } from '@/lib/ids';
import { decrireErreur } from '@/lib/erreurs';
import { Button, useToast } from '@/components/ui';

/**
 * Photo d'illustration d'un bien : une seule, remplaçable. Même traitement que
 * les photos d'état des lieux (compression 1600 px / JPEG 0,7, Blob dans
 * IndexedDB) ; remplacer supprime l'ancienne pour ne pas laisser de Blob
 * orphelin.
 */
export function PhotoBien({
  bienId,
  photoId,
  onChange,
}: {
  bienId: string;
  photoId?: string;
  onChange: (photoId: string | undefined) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    let cree: string | null = null;
    void (async () => {
      if (!photoId) {
        setUrl(null);
        return;
      }
      const photo = await db.photos.get(photoId);
      if (!photo || annule) return;
      cree = URL.createObjectURL(photo.blob);
      setUrl(cree);
    })();
    return () => {
      annule = true;
      if (cree) URL.revokeObjectURL(cree);
    };
  }, [photoId]);

  const choisir = async (fichiers: FileList | null) => {
    const fichier = fichiers?.[0];
    if (!fichier) return;
    try {
      const blob = await compresserImage(fichier);
      const id = uid();
      await db.photos.add({ id, blob, dateCapture: nowISO(), legende: 'Photo du logement', bienId });
      if (photoId) await db.photos.delete(photoId);
      onChange(id);
    } catch (e) {
      console.error(e);
      toast('error', `Impossible d'enregistrer la photo - ${decrireErreur(e)}`);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const supprimer = async () => {
    if (photoId) await db.photos.delete(photoId);
    onChange(undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {url ? (
        <img src={url} alt="Photo du logement" className="h-28 w-40 rounded-lg object-cover" />
      ) : (
        <div className="flex h-28 w-40 items-center justify-center rounded-lg border-2 border-dashed border-accent-300 text-accent-400">
          <Camera size={24} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          <Camera size={14} /> {photoId ? 'Remplacer la photo' : 'Ajouter une photo'}
        </Button>
        {photoId && (
          <Button variant="ghost" size="sm" onClick={() => void supprimer()}>
            <Trash2 size={14} className="text-red-600" /> Supprimer
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void choisir(e.target.files)}
      />
    </div>
  );
}
