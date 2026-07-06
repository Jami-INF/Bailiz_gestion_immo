import { format, isValid, parse, parseISO } from 'date-fns';

/**
 * Parse une date saisie au format français JJ/MM/AAAA.
 * Retourne la date ISO (yyyy-MM-dd) ou null si invalide (y compris 31/02…).
 */
export function parserDateFr(texte: string): string | null {
  const t = texte.trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(t)) return null;
  const d = parse(t, 'dd/MM/yyyy', new Date());
  return isValid(d) ? format(d, 'yyyy-MM-dd') : null;
}

/** Formatte une date ISO (yyyy-MM-dd ou ISO complet) en JJ/MM/AAAA pour affichage. */
export function versDateFr(iso: string | undefined): string {
  if (!iso) return '';
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'dd/MM/yyyy') : '';
}

/**
 * Masque de saisie progressif : ne garde que les chiffres et insère les « / ».
 * "0607" → "06/07", "06072026" → "06/07/2026".
 */
export function masquerSaisieDate(brut: string): string {
  const chiffres = brut.replace(/\D/g, '').slice(0, 8);
  if (chiffres.length > 4) return `${chiffres.slice(0, 2)}/${chiffres.slice(2, 4)}/${chiffres.slice(4)}`;
  if (chiffres.length > 2) return `${chiffres.slice(0, 2)}/${chiffres.slice(2)}`;
  return chiffres;
}
