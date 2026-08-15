/**
 * Type MIME des contenus binaires de l'application.
 *
 * Il compte plus qu'il n'en a l'air : c'est lui qui décide du nom sous lequel un
 * navigateur enregistre un téléchargement (Chrome corrige l'extension d'après le
 * type, pas d'après le nom demandé), et c'est lui que le moteur PDF lit dans une
 * data-URL pour savoir s'il a affaire à une image.
 */
export const TYPE_PDF = 'application/pdf';
export const TYPE_PHOTO = 'image/jpeg';

/** Type attendu du blob des tables qui en portent un. */
export const TYPE_PAR_TABLE: Record<string, string> = {
  documents: TYPE_PDF,
  photos: TYPE_PHOTO,
};

/**
 * Rend le même contenu sous le type `type`.
 *
 * `slice` produit une vue, pas une copie : retyper un PDF de plusieurs mégaoctets
 * ne coûte rien.
 *
 * Utile parce que les blobs venus du Drive portent le type déclaré à l'envoi, et
 * que celui-ci a longtemps été `application/zip` pour tout le monde
 * (`construireCorpsMultipart`). Les bases déjà synchronisées contiennent donc des
 * PDF et des photos mal typés, que le correctif de l'envoi ne rattrape pas : on
 * remet le bon type au moment de s'en servir.
 */
export function retyper(blob: Blob, type: string): Blob {
  return blob.type === type ? blob : blob.slice(0, blob.size, type);
}
