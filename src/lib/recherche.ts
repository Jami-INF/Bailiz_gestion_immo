/**
 * Recherche dans les listes : insensible à la casse **et aux accents**, sur des
 * données saisies à la main. « chamalieres » doit trouver « Chamalières », et
 * « Zoe » trouver « Zoé » — sans quoi la recherche paraît cassée à chaque nom
 * propre français.
 */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Vrai si **tous** les mots de la recherche se retrouvent dans l'un des champs.
 * Chercher « durand 63 » trouve donc Claire Durand à Chamalières (63400), sans
 * imposer l'ordre ni la ponctuation exacte.
 */
export function correspond(recherche: string, ...champs: (string | number | undefined | null)[]): boolean {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return true;
  const foin = champs
    .filter((c) => c !== undefined && c !== null && c !== '')
    .map((c) => normaliser(String(c)))
    .join(' ');
  return mots.every((mot) => foin.includes(mot));
}

/**
 * Comparateur alphabétique français (accents, casse et chiffres traités comme
 * on les lit : « Chambre 2 » avant « Chambre 10 »).
 */
export function comparerTexte(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
}

/**
 * Comparateur de dates ISO, du plus récent au plus ancien. Une date absente ou
 * illisible passe en dernier plutôt que de faire échouer le tri : les listes
 * doivent rester affichables même avec une fiche abîmée.
 */
export function comparerDatesDesc(a: string | undefined, b: string | undefined): number {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return tb - ta;
}
