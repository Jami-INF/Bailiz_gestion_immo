import { format } from 'date-fns';
import { db, type ConfigSauvegardeAuto } from './db';
import { baseSansDonnees, exporterSauvegarde } from './backup';
import { nowISO } from './ids';
import { fichiersASupprimer } from './rotation';
import { decrireErreur } from './erreurs';
import { getConfigGDrive } from './gdrive';
import { noterChangement } from './sync/journal';
import { lancerCycle, type ResultatSync } from './sync';

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
  /** Rien à sauvegarder : on n'écrase pas les archives existantes avec du vide. */
  | 'base_vide'
  /** Un garde-fou de la synchronisation a interrompu le cycle (horloge, suppressions). */
  | 'bloque'
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
async function permissionAutosave(
  handle: FileSystemDirectoryHandle,
  demander: boolean,
): Promise<PermissionState> {
  const etat = await handle.queryPermission({ mode: 'readwrite' });
  if (etat === 'granted' || !demander) return etat;
  return handle.requestPermission({ mode: 'readwrite' });
}

/** Exporte le ZIP dans le dossier configuré, avec rotation des anciennes archives. */
async function pousserSauvegarde(config: ConfigSauvegardeAuto): Promise<void> {
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
 * Dernière cause d'échec de sauvegarde, conservée pour l'affichage : les
 * fonctions publiques renvoient un code (`'erreur'`…) qui, seul, ne permet pas
 * de diagnostiquer depuis une tablette.
 */
let derniereErreur: string | undefined;

export function derniereErreurSauvegarde(): string | undefined {
  return derniereErreur;
}

/** Évite les pushs concurrents (bouton + planifié + signature). */
let pushEnCours = false;

/** Push vers le dossier local uniquement. */
async function pousserVersDossier(gesteUtilisateur: boolean): Promise<ResultatPush> {
  if (!autosaveSupportee()) return 'non_supporte';
  const config = await getConfigAutosave();
  if (!config) return 'inactif';
  if (await baseSansDonnees()) return 'base_vide';
  try {
    const permission = await permissionAutosave(config.handle, gesteUtilisateur);
    if (permission !== 'granted') return 'permission_requise';
    await pousserSauvegarde(config);
    return 'ok';
  } catch (e) {
    console.error('Sauvegarde vers le dossier impossible :', e);
    derniereErreur = decrireErreur(e);
    return 'erreur';
  }
}

/**
 * Met les données à l'abri sur toutes les destinations configurées : le dossier
 * local reçoit une archive ZIP, le Drive un cycle de synchronisation.
 *
 * `gesteUtilisateur` autorise les demandes de permission/connexion (sinon échec
 * silencieux avec l'état correspondant). Agrégation : `ok` si au moins une
 * destination a réussi ; sinon l'état le plus actionnable
 * (permission_requise > hors_ligne > erreur > inactif).
 */
export async function pousserSiActive(
  gesteUtilisateur: boolean,
  options?: { apresSignature?: boolean },
): Promise<ResultatPush> {
  if (pushEnCours) return 'ok';
  pushEnCours = true;
  try {
    const resultats: ResultatPush[] = [
      await pousserVersDossier(gesteUtilisateur),
      traduireResultatCycle(
        await lancerCycle(gesteUtilisateur, { apresSignature: options?.apresSignature }),
      ),
    ];
    return agregerResultats(resultats);
  } finally {
    pushEnCours = false;
  }
}

/**
 * Traduit le résultat d'un cycle de synchronisation dans le vocabulaire commun
 * des destinations de sauvegarde.
 *
 * `indisponible` devient `permission_requise` : c'est la cause de très loin la
 * plus fréquente (autorisation Google expirée) et la seule sur laquelle
 * l'utilisateur peut agir. `ignore` devient `inactif` et reste muet — un cycle
 * croisé par un autre n'est pas un incident, et l'annoncer comme une
 * autorisation expirée enverrait reconnecter un Drive qui fonctionne.
 */
function traduireResultatCycle(resultat: ResultatSync): ResultatPush {
  switch (resultat.etat) {
    case 'ok':
      return 'ok';
    case 'bloque':
      return 'bloque';
    case 'erreur':
      return 'erreur';
    case 'ignore':
      return 'inactif';
    default:
      return 'permission_requise';
  }
}

/**
 * Résultat d'ensemble de plusieurs destinations. `bloque` passe **avant** `ok` :
 * le dossier local a pu être écrit alors qu'un garde-fou a interrompu le cycle,
 * et c'est précisément ce cas qu'il ne faut pas taire. Fonction pure, testée.
 */
export function agregerResultats(resultats: ResultatPush[]): ResultatPush {
  if (resultats.includes('bloque')) return 'bloque';
  if (resultats.includes('ok')) return 'ok';
  for (const etat of ['permission_requise', 'hors_ligne', 'erreur'] as const) {
    if (resultats.includes(etat)) return etat;
  }
  return 'inactif';
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
/** Évite de répéter l'avertissement de reconnexion à chaque modification. */
let reconnexionSignalee = false;
let notifier: ((type: 'success' | 'warning', message: string) => void) | undefined;

/** Réarme les avertissements ponctuels (après une reconnexion réussie). */
export function reinitialiserAvertissements(): void {
  reconnexionSignalee = false;
}

function planifierPush(): void {
  // Les écritures provoquées par le push lui-même (parametres.derniereSauvegarde)
  // ne doivent pas replanifier un push : boucle sinon.
  if (pushEnCours) return;
  clearTimeout(timerDebounce);
  timerDebounce = setTimeout(() => {
    void pousserSiActive(false).then((resultat) => {
      if (resultat === 'ok') {
        reconnexionSignalee = false;
        notifier?.('success', 'Sauvegarde automatique effectuée.');
        return;
      }
      /*
       * `permission_requise` : le jeton Google n'est pas persisté (aucun
       * serveur pour détenir un refresh token) et son renouvellement silencieux
       * échoue dès que le navigateur bloque les cookies tiers — c'est le cas par
       * défaut sur Safari/iOS. Sans message, l'utilisateur croit ses données
       * sauvegardées alors que plus rien ne part : on prévient, une seule fois
       * par session pour ne pas harceler.
       */
      if (resultat === 'permission_requise' && !reconnexionSignalee) {
        reconnexionSignalee = true;
        notifier?.(
          'warning',
          'Sauvegarde automatique en attente : reconnectez Google Drive depuis les Paramètres (l’autorisation a expiré).',
        );
      }
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
  const tables = {
    biens: db.biens,
    locataires: db.locataires,
    baux: db.baux,
    inventaires: db.inventaires,
    edls: db.edls,
    photos: db.photos,
    documents: db.documents,
  };
  for (const [nom, table] of Object.entries(tables)) {
    /*
     * Chaque écriture est notée pour la synchronisation par fichiers. Les hooks
     * s'exécutent dans la transaction de la table modifiée : `noterChangement`
     * se contente d'accumuler en mémoire et écrit juste après, hors transaction.
     * Les suppressions surtout comptent — elles ne laissent aucune trace qu'un
     * rattrapage pourrait retrouver.
     */
    table.hook('creating', (cle) => {
      noterChangement(nom, String(cle), 'maj');
      planifierPush();
    });
    table.hook('updating', (_modifications, cle) => {
      noterChangement(nom, String(cle), 'maj');
      planifierPush();
    });
    table.hook('deleting', (cle) => {
      noterChangement(nom, String(cle), 'suppr');
      planifierPush();
    });
  }
  // Reprise automatique : un push (Drive) resté en échec hors-ligne — EDL signé
  // à la cave, par exemple — repart au retour du réseau.
  window.addEventListener('online', () => planifierPush());
}
