/**
 * Identité de l'appareil, inscrite dans chaque enveloppe et chaque marqueur de
 * suppression déposés sur le Drive : elle dit quel appareil a écrit quoi.
 *
 * Volontairement dans `localStorage` et **jamais dans `Parametres`** : les
 * paramètres partent dans le ZIP de sauvegarde, et un appareil restauré
 * hériterait alors de l'identité de l'autre — les deux se croiraient le même.
 */

const CLE_ID = 'bailiz.appareil.id';

/**
 * Identifiant stable de cet appareil, créé au premier appel. En cas de
 * `localStorage` indisponible ou effacé, un nouvel identifiant est attribué :
 * l'appareil ne se reconnaîtra plus dans ses propres écritures, sans autre
 * conséquence — la convergence s'arbitre sur les horodatages, jamais sur
 * l'identité.
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
