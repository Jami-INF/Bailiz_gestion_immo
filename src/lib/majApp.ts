/**
 * Mise à jour de l'application (service worker).
 *
 * La stratégie est **`prompt`**, pas `autoUpdate` : le service worker prend la
 * main uniquement quand l'utilisateur l'accepte. Une mise à jour silencieuse
 * peut recharger la page - au pire moment, c'est-à-dire pendant un état des
 * lieux saisi sur tablette, sur place, devant le locataire.
 *
 * `registerSW` s'exécute hors de React (`main.tsx`) : ce module fait le pont,
 * sous la forme d'un petit magasin auquel l'interface s'abonne.
 */

type Abonne = () => void;

let disponible = false;
let appliquer: (() => Promise<void>) | undefined;
const abonnes = new Set<Abonne>();

function prevenir() {
  for (const a of abonnes) a();
}

/** Appelé par `main.tsx` quand une version est prête à être installée. */
export function signalerMiseAJour(appliquerMaj: () => Promise<void>): void {
  disponible = true;
  appliquer = appliquerMaj;
  prevenir();
}

export function sAbonnerMiseAJour(abonne: Abonne): () => void {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
}

export function miseAJourDisponible(): boolean {
  return disponible;
}

/**
 * Installe la nouvelle version et recharge. Rendue inoffensive si aucune mise à
 * jour n'est en attente.
 */
export async function appliquerMiseAJour(): Promise<void> {
  if (!appliquer) return;
  await appliquer();
}

/** Remise à zéro - tests uniquement. */
export function reinitialiserMiseAJour(): void {
  disponible = false;
  appliquer = undefined;
  abonnes.clear();
}
