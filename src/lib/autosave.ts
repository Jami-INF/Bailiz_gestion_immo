import { format } from 'date-fns';
import { db, type ConfigSauvegardeAuto } from './db';
import { exporterSauvegarde } from './backup';
import { nowISO } from './ids';

/**
 * Sauvegarde automatique « push ZIP » : l'utilisateur choisit une fois un
 * dossier local (idéalement synchronisé par Google Drive, OneDrive, iCloud…),
 * et l'app y écrit l'archive complète après chaque signature et
 * périodiquement. Zéro infrastructure : la synchronisation vers le cloud est
 * assurée par le client de l'utilisateur.
 */

const NB_SAUVEGARDES_CONSERVEES = 10;
const MOTIF_FICHIER = /^bailiz-sauvegarde-.*\.zip$/;
/** Ancienneté (ms) au-delà de laquelle un push est retenté à l'ouverture. */
export const SEUIL_PUSH_OUVERTURE_MS = 7 * 24 * 3600 * 1000;

export type ResultatPush = 'ok' | 'inactif' | 'permission_requise' | 'non_supporte' | 'erreur';

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

/** Sauvegardes excédentaires à supprimer (les plus anciennes, tri lexical = tri chronologique). */
export function fichiersASupprimer(noms: string[], garder = NB_SAUVEGARDES_CONSERVEES): string[] {
  return noms
    .filter((n) => MOTIF_FICHIER.test(n))
    .sort()
    .slice(0, Math.max(0, noms.filter((n) => MOTIF_FICHIER.test(n)).length - garder));
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

/**
 * Push si la sauvegarde auto est configurée.
 * `gesteUtilisateur` autorise la re-demande de permission (sinon échec silencieux
 * avec l'état `permission_requise` pour informer l'utilisateur).
 */
export async function pousserSiActive(gesteUtilisateur: boolean): Promise<ResultatPush> {
  if (!autosaveSupportee()) return 'non_supporte';
  const config = await getConfigAutosave();
  if (!config) return 'inactif';
  try {
    const permission = await permissionAutosave(config.handle, gesteUtilisateur);
    if (permission !== 'granted') return 'permission_requise';
    await pousserSauvegarde(config);
    return 'ok';
  } catch (e) {
    console.error('Sauvegarde automatique impossible :', e);
    return 'erreur';
  }
}
