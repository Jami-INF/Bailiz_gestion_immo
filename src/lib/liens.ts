/** Liens externes du projet, référencés par le pied de page et les mentions légales. */
export const LIEN_LINKEDIN = 'https://www.linkedin.com/in/jami-infante/';
export const LIEN_REPO = 'https://github.com/Jami-INF/Bailiz_gestion_immo';

/**
 * Valide une URL saisie par l'utilisateur avant de l'ouvrir dans un lien ou de
 * l'encoder dans un QR code imprimé sur le bail. Seuls `http`/`https` sont
 * acceptés : un schéma `javascript:` ou `data:` deviendrait exécutable au clic,
 * et le QR code est destiné à être scanné par un tiers (le locataire).
 * Retourne l'URL normalisée, ou `undefined` si elle n'est pas sûre.
 */
export function urlExterneSure(url?: string): string | undefined {
  const brut = url?.trim();
  if (!brut) return undefined;
  // Sans schéma explicite, on suppose https (saisie courante « drive.google.com/… »).
  const candidat = /^[a-z][a-z0-9+.-]*:/i.test(brut) ? brut : `https://${brut}`;
  try {
    const u = new URL(candidat);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
