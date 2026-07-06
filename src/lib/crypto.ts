/** Calcule l'empreinte SHA-256 d'un contenu binaire, en hexadécimal. */
export async function sha256Hex(data: ArrayBuffer | Blob): Promise<string> {
  const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Format d'affichage : groupes de 8 caractères pour lisibilité sur le PDF. */
export function formatHash(hash: string): string {
  return hash.replace(/(.{8})/g, '$1 ').trim();
}
