import type { Adresse } from '@/types';

/**
 * Adresse sur une ligne : « 12 rue des Lilas, 63000 Clermont-Ferrand ».
 * Les parties vides sont ignorées, ce qui évite les « , » orphelins quand
 * l'adresse n'est que partiellement renseignée (bail rapide, bien créé à la volée).
 */
export function formatAdresse(adresse?: Partial<Adresse>): string {
  if (!adresse) return '';
  const villeLigne = [adresse.codePostal, adresse.ville]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
  return [adresse.ligne1?.trim(), adresse.ligne2?.trim(), villeLigne]
    .filter((p) => p && p.length > 0)
    .join(', ');
}
