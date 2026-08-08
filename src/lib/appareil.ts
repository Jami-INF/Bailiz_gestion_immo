/**
 * Identité de l'appareil, utilisée pour reconnaître l'origine d'une archive de
 * sauvegarde et détecter qu'un autre appareil a poussé après nous.
 *
 * Volontairement dans `localStorage` et **jamais dans `Parametres`** : les
 * paramètres partent dans le ZIP de sauvegarde, et un appareil restauré
 * hériterait alors de l'identité de l'autre — les deux se croiraient le même et
 * la détection ne fonctionnerait plus jamais.
 */

const CLE_ID = 'bailiz.appareil.id';
const CLE_NOM = 'bailiz.appareil.nom';

/** `appProperties` Drive : 124 octets maximum par valeur. */
const LONGUEUR_NOM_MAX = 60;

/** Nom lisible déduit de la plateforme, à défaut de choix de l'utilisateur. */
export function nomAppareilParDefaut(userAgent = navigator.userAgent): string {
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac';
  if (/Windows/i.test(userAgent)) return 'PC Windows';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Cet appareil';
}

/**
 * Identifiant stable de cet appareil, créé au premier appel. En cas de
 * `localStorage` indisponible ou effacé, un nouvel identifiant est attribué :
 * l'appareil verra ses propres archives comme étrangères, ce qui provoque un
 * avertissement de trop — jamais un écrasement silencieux.
 */
export function identifiantAppareil(): string {
  try {
    const existant = localStorage.getItem(CLE_ID);
    if (existant) return existant;
    const nouveau = crypto.randomUUID();
    localStorage.setItem(CLE_ID, nouveau);
    return nouveau;
  } catch {
    // Navigation privée ou stockage bloqué : identité éphémère.
    return 'inconnu';
  }
}

export function nomAppareil(): string {
  try {
    return localStorage.getItem(CLE_NOM) || nomAppareilParDefaut();
  } catch {
    return nomAppareilParDefaut();
  }
}

export function definirNomAppareil(nom: string): void {
  const propre = nom.trim().slice(0, LONGUEUR_NOM_MAX);
  try {
    if (propre) localStorage.setItem(CLE_NOM, propre);
    else localStorage.removeItem(CLE_NOM);
  } catch {
    // Sans stockage, le nom par défaut sera utilisé : sans conséquence.
  }
}
