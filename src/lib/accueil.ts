/**
 * Parcours d'accueil : ce que voit quelqu'un qui ouvre Bailiz pour la première
 * fois **sur un appareil donné**.
 *
 * Tout l'objet de ce parcours est de poser une question que l'application ne
 * posait nulle part : où vont les données. Elles vivent dans le navigateur, et
 * rien ne le disait - on pouvait mener un état des lieux complet, photos et
 * signatures comprises, sans jamais apprendre qu'un vidage du cache Safari
 * l'effacerait.
 */

/**
 * Drapeau de fin de parcours, dans `localStorage` et **jamais dans
 * `Parametres`** - même raison que `identifiantAppareil` : les paramètres
 * voyagent dans l'archive ZIP et dans la synchronisation. Un appareil restauré
 * hériterait d'un « accueil déjà fait » alors que c'est précisément lui qui
 * n'a pas de destination configurée et à qui il faut poser la question.
 */
const CLE_TERMINE = 'bailiz.accueil.termine';

/** Reprise après un aller-retour chez Google (session de l'onglet). */
const CLE_REPRISE = 'bailiz.accueil.reprise';

/**
 * Vrai si l'accueil a déjà été vu sur cet appareil.
 *
 * Un stockage indisponible (navigation privée) répond **oui**. On ne pourrait
 * de toute façon rien y mémoriser, et la modale reviendrait alors à chaque
 * ouverture : mieux vaut une question jamais posée qu'une question posée
 * indéfiniment.
 */
export function accueilTermine(): boolean {
  try {
    return localStorage.getItem(CLE_TERMINE) === '1';
  } catch {
    return true;
  }
}

export function marquerAccueilTermine(): void {
  try {
    localStorage.setItem(CLE_TERMINE, '1');
  } catch {
    /* Sans stockage, l'accueil ne se rouvrira pas non plus : `accueilTermine` dit oui. */
  }
}

/**
 * À appeler **avant** de quitter l'application vers Google (PWA installée sur
 * iOS, cf. `lancerConnexionParRedirection`). Sans ce marqueur, l'utilisateur
 * revient sur un tableau de bord muet, sans savoir si la connexion a abouti.
 */
export function memoriserRepriseAccueil(): void {
  try {
    sessionStorage.setItem(CLE_REPRISE, '1');
  } catch {
    /* Le retour affichera simplement l'état courant, sans rouvrir l'accueil. */
  }
}

/**
 * Vrai si l'on revient d'une connexion Google lancée depuis l'accueil.
 *
 * La réponse est calculée **une fois par chargement de page** puis retenue : le
 * marqueur est effacé au premier appel, et React monte deux fois en mode strict
 * - sans cette mémoire, le second montage conclurait qu'il ne s'est rien passé.
 * Un retour de redirection est de toute façon un chargement de page.
 */
let reprise: boolean | undefined;

export function consommerRepriseAccueil(): boolean {
  if (reprise !== undefined) return reprise;
  try {
    reprise = sessionStorage.getItem(CLE_REPRISE) === '1';
    if (reprise) sessionStorage.removeItem(CLE_REPRISE);
  } catch {
    reprise = false;
  }
  return reprise;
}
