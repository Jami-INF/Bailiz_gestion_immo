const LARGEUR_MAX = 1600;
const QUALITE_JPEG = 0.7;

/**
 * Compresse une image capturée : max 1600 px de large, JPEG qualité 0,7.
 * La date de capture est stockée à part (entité Photo), les EXIF étant
 * perdus au réencodage canvas.
 */
export async function compresserImage(fichier: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(fichier);
  const ratio = Math.min(1, LARGEUR_MAX / bitmap.width);
  const largeur = Math.round(bitmap.width * ratio);
  const hauteur = Math.round(bitmap.height * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D indisponible');
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Échec de compression de l'image"))),
      'image/jpeg',
      QUALITE_JPEG,
    );
  });
}

export function blobVersDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
