const UNITES = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** Nombre < 100 en lettres (règles françaises : 71 = soixante et onze, 80 = quatre-vingts…). */
function moinsDeCent(n: number, terminal: boolean): string {
  if (n < 20) return UNITES[n];
  if (n < 70) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (u === 0) return DIZAINES[d];
    if (u === 1) return `${DIZAINES[d]} et un`;
    return `${DIZAINES[d]}-${UNITES[u]}`;
  }
  if (n < 80) {
    if (n === 71) return 'soixante et onze';
    return `soixante-${UNITES[n - 60]}`;
  }
  if (n === 80) return terminal ? 'quatre-vingts' : 'quatre-vingt';
  return `quatre-vingt-${UNITES[n - 80]}`;
}

/** Nombre < 1000 en lettres. */
function moinsDeMille(n: number, terminal: boolean): string {
  if (n < 100) return moinsDeCent(n, terminal);
  const c = Math.floor(n / 100);
  const reste = n % 100;
  const cent =
    c === 1 ? 'cent' : reste === 0 ? `${UNITES[c]} cent${terminal ? 's' : ''}` : `${UNITES[c]} cent`;
  return reste === 0 ? cent : `${cent} ${moinsDeCent(reste, terminal)}`;
}

/** Entier positif < 1 000 000 000 en lettres. */
export function entierEnLettres(n: number): string {
  if (!Number.isFinite(n) || n < 0) throw new Error('Nombre invalide');
  n = Math.floor(n);
  if (n === 0) return 'zéro';
  const millions = Math.floor(n / 1_000_000);
  const milliers = Math.floor((n % 1_000_000) / 1000);
  const reste = n % 1000;
  const parties: string[] = [];
  if (millions > 0) parties.push(`${moinsDeMille(millions, false)} million${millions > 1 ? 's' : ''}`);
  if (milliers === 1) parties.push('mille');
  else if (milliers > 1) parties.push(`${moinsDeMille(milliers, false)} mille`);
  if (reste > 0) parties.push(moinsDeMille(reste, true));
  return parties.join(' ');
}

/** Montant en euros en toutes lettres (ex. 420 → « quatre cent vingt euros »). */
export function montantEnLettres(montant: number): string {
  const euros = Math.floor(montant);
  const centimes = Math.round((montant - euros) * 100);
  let texte = `${entierEnLettres(euros)} euro${euros > 1 ? 's' : ''}`;
  if (centimes > 0) {
    texte += ` et ${entierEnLettres(centimes)} centime${centimes > 1 ? 's' : ''}`;
  }
  return texte;
}
