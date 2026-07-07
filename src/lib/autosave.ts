import { format } from 'date-fns';
import { db, type ConfigSauvegardeAuto } from './db';
import { exporterSauvegarde } from './backup';
import { nowISO } from './ids';
import { fichiersASupprimer } from './rotation';
import { getConfigGDrive, pousserSauvegardeGDrive } from './gdrive';

export { fichiersASupprimer } from './rotation';

/**
 * Sauvegarde automatique « push ZIP » vers deux destinations possibles,
 * cumulables :
 * - un dossier local (File System Access, Chrome/Edge desktop), idéalement
 *   synchronisé par le client cloud de l'utilisateur ;
 * - Google Drive via l'API (lib/gdrive.ts), qui couvre iPad/Safari.
 * Zéro infrastructure : tout part du navigateur.
 */

/** Ancienneté (ms) au-delà de laquelle un push est retenté à l'ouverture. */
export const SEUIL_PUSH_OUVERTURE_MS = 7 * 24 * 3600 * 1000;

export type ResultatPush =
  | 'ok'
  | 'inactif'
  | 'permission_requise'
  | 'hors_ligne'
  | 'non_supporte'
  | 'erreur';

/** Délai de regroupement des modifications avant push (anti-rafale). */
const DEBOUNCE_MODIFICATIONS_MS = 30_000;

/** L'API File System Access n'existe que sur Chrome/Edge desktop. */
export function autosaveSupportee(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function getConfigAutosave(): Promise<ConfigSauvegardeAuto | undefined> {
  return db.sauvegardeAuto.get('dossier');
}

/** Ouvre le sélecteur de dossier et enregistre le handle (geste utilisateur requis). */
export async function choisirDossierAutosave(): Promise<ConfigSauvegardeAuto> {
  const handle = await window.showDirectoryPicker({ id: 'bailiz-sauvegarde', mode: 'readwrite' });
  const config: ConfigSauvegardeAuto = {
    id: 'dossier',
    handle,
    nomDossier: (handle as unknown as { name: string }).name,
  };
  await db.sauvegardeAuto.put(config);
  return config;
}

export async function desactiverAutosave(): Promise<void> {
  await db.sauvegardeAuto.delete('dossier');
}

/**
 * Vérifie la permission d'écriture sur le dossier. Après un redémarrage du
 * navigateur, elle repasse à « prompt » : la re-demande exige un geste
 * utilisateur (bouton dans Paramètres ou après signature).
 */
export async function permissionAutosave(
  handle: FileSystemDirectoryHandle,
  demander: boolean,
): Promise<PermissionState> {
  const etat = await handle.queryPermission({ mode: 'readwrite' });
  if (etat === 'granted' || !demander) return etat;
  return handle.requestPermission({ mode: 'readwrite' });
}

/** Exporte le ZIP dans le dossier configuré, avec rotation des anciennes archives. */
export async function pousserSauvegarde(config: ConfigSauvegardeAuto): Promise<void> {
  const blob = await exporterSauvegarde();
  const nom = `bailiz-sauvegarde-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.zip`;
  const fichier = await config.handle.getFileHandle(nom, { create: true });
  const flux = await fichier.createWritable();
  await flux.write(blob);
  await flux.close();

  // Rotation : on ne garde que les N archives les plus récentes.
  try {
    const noms: string[] = [];
    for await (const entree of config.handle.values()) {
      if (entree.kind === 'file') noms.push(entree.name);
    }
    for (const aSupprimer of fichiersASupprimer(noms)) {
      await config.handle.removeEntry(aSupprimer);
    }
  } catch {
    // La rotation est un confort : son échec ne doit pas faire échouer le push.
  }

  await db.sauvegardeAuto.put({ ...config, dernierPush: nowISO() });
}

/** Évite les pushs concurrents (bouton + planifié + signature). */
let pushEnCours = false;

/** Push vers le dossier local uniquement. */
async function pousserVersDossier(gesteUtilisateur: boolean): Promise<ResultatPush> {
  if (!autosaveSupportee()) return 'non_supporte';
  const config = await getConfigAutosave();
  if (!config) return 'inactif';
  try {
    const permission = await permissionAutosave(config.handle, gesteUtilisateur);
    if (permission !== 'granted') return 'permission_requise';
    await pousserSauvegarde(config);
    return 'ok';
  } catch (e) {
    console.error('Sauvegarde vers le dossier impossible :', e);
    return 'erreur';
  }
}

/**
 * Push vers toutes les destinations configurées (dossier local et/ou Google
 * Drive). `gesteUtilisateur` autorise les demandes de permission/connexion
 * (sinon échec silencieux avec l'état correspondant).
 *
 * Agrégation : `ok` si au moins une destination a réussi ; sinon l'état le
 * plus actionnable (permission_requise > hors_ligne > erreur > inactif).
 */
export async function pousserSiActive(gesteUtilisateur: boolean): Promise<ResultatPush> {
  if (pushEnCours) return 'ok';
  pushEnCours = true;
  try {
    const resultats: ResultatPush[] = [];
    resultats.push(await pousserVersDossier(gesteUtilisateur));
    resultats.push(await pousserSauvegardeGDrive(gesteUtilisateur));

    if (resultats.includes('ok')) return 'ok';
    for (const etat of ['permission_requise', 'hors_ligne', 'erreur'] as const) {
      if (resultats.includes(etat)) return etat;
    }
    return 'inactif';
  } finally {
    pushEnCours = false;
  }
}

/** Vrai si au moins une destination de sauvegarde automatique est configurée. */
export async function destinationConfiguree(): Promise<boolean> {
  const [dossier, gdrive] = await Promise.all([getConfigAutosave(), getConfigGDrive()]);
  return Boolean(dossier) || Boolean(gdrive?.actif);
}

// ---------------------------------------------------------------------------
// Push planifié à chaque modification d'entité (hooks Dexie + debounce)
// ---------------------------------------------------------------------------

let observateurInitialise = false;
let timerDebounce: ReturnType<typeof setTimeout> | undefined;
let notifier: ((type: 'success' | 'warning', message: string) => void) | undefined;

function planifierPush(): void {
  // Les écritures provoquées par le push lui-même (parametres.derniereSauvegarde)
  // ne doivent pas replanifier un push : boucle sinon.
  if (pushEnCours) return;
  clearTimeout(timerDebounce);
  timerDebounce = setTimeout(() => {
    void pousserSiActive(false).then((resultat) => {
      if (resultat === 'ok') notifier?.('success', 'Sauvegarde automatique effectuée.');
      // permission_requise / inactif : silencieux — le bouton « Sauvegarder »
      // et les pushs post-signature couvrent la re-demande d'autorisation.
    });
  }, DEBOUNCE_MODIFICATIONS_MS);
}

/**
 * Observe toutes les tables métier : chaque création/modification/suppression
 * déclenche un push regroupé (30 s après la dernière écriture). À appeler une
 * seule fois au montage de l'app, avec la fonction toast pour le message.
 * Nécessaire quelle que soit la destination (dossier local OU Google Drive —
 * ne pas conditionner à autosaveSupportee(), qui ne concerne que le dossier).
 */
export function initAutosaveSurModifications(
  toast: (type: 'success' | 'warning', message: string) => void,
): void {
  notifier = toast;
  if (observateurInitialise) return;
  observateurInitialise = true;
  const tables = [db.biens, db.locataires, db.baux, db.inventaires, db.edls, db.photos, db.documents];
  for (const table of tables) {
    table.hook('creating', () => planifierPush());
    table.hook('updating', () => planifierPush());
    table.hook('deleting', () => planifierPush());
  }
  // Reprise automatique : un push (Drive) resté en échec hors-ligne — EDL signé
  // à la cave, par exemple — repart au retour du réseau.
  window.addEventListener('online', () => planifierPush());
}
