import { format } from 'date-fns';
import { db, getParametres } from './db';
import { baseSansDonnees, exporterSauvegarde } from './backup';
import { uid, nowISO } from './ids';
import { estArchiveBailiz, fichiersASupprimer } from './rotation';
import { decrireErreur } from './erreurs';
import { identifiantAppareil, nomAppareil } from './appareil';
import type { ArchiveDrive } from '@/types';

/**
 * Sauvegarde vers Google Drive, 100 % côté client :
 * - authentification par Google Identity Services (script gsi chargé à la
 *   demande, flux « token client ») avec le scope non sensible `drive.file`
 *   (l'app ne voit que les fichiers qu'elle a créés) ;
 * - upload multipart du ZIP dans un dossier « Bailiz » à la racine du Drive ;
 * - même rotation que le dossier local (10 archives conservées).
 *
 * Le jeton d'accès n'est jamais persisté (mémoire uniquement, ~1 h) ; son
 * renouvellement est silencieux tant que la session Google est active, sinon
 * une interaction utilisateur est nécessaire (bouton dans les Paramètres).
 */

/**
 * ID client OAuth de l'instance officielle (console.cloud.google.com, projet
 * Bailiz). Donnée publique par conception : la protection vient des origines
 * JavaScript autorisées côté Google (jami-inf.github.io, localhost:5173).
 * En cas de fork/redéploiement sur un autre domaine, créer son propre ID.
 */
export const CLIENT_ID_GDRIVE =
  '532224169040-4gobipusbakb8hpnld79o217teumhqvi.apps.googleusercontent.com';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const URL_GSI = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3';
const API_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const NOM_DOSSIER = 'Bailiz';

export type ResultatGDrive =
  | 'ok'
  | 'inactif'
  | 'permission_requise'
  | 'hors_ligne'
  /** Rien à sauvegarder : on n'écrase pas les archives existantes avec du vide. */
  | 'base_vide'
  /** Une archive plus récente, poussée par un autre appareil, existe sur le Drive. */
  | 'conflit'
  | 'erreur';

export interface ConfigGDrive {
  clientId: string;
  actif: boolean;
  dossierId?: string;
  dernierPush?: string;
  derniereArchiveVue?: ArchiveDrive;
  syncActive?: boolean;
  derniereSync?: string;
  dernierInstantane?: string;
}

/**
 * État du Drive vis-à-vis de cet appareil. `indisponible` n'est pas une erreur :
 * sans autorisation valide ou sans réseau, la vérification est simplement
 * reportée (le jeton Google n'est jamais persisté).
 */
export type EtatDrive =
  | { etat: 'a_jour'; archive?: ArchiveDrive }
  | { etat: 'aucune' }
  | { etat: 'divergence'; archive: ArchiveDrive }
  | { etat: 'indisponible' };

/**
 * Décide, à partir de la dernière archive du Drive et de celle que cet appareil
 * connaît, s'il y a divergence. Fonction pure, testée : c'est elle qui décide
 * si un push est autorisé.
 *
 * `adopter` signale une archive à enregistrer comme référence sans alerter :
 * soit elle vient de cet appareil, soit elle est antérieure à cette
 * fonctionnalité (aucun marquage) et le premier contact ne peut rien prouver.
 */
export function comparerArchives(
  distante: ArchiveDrive | undefined,
  vue: ArchiveDrive | undefined,
  idAppareil: string,
): EtatDrive & { adopter?: boolean } {
  if (!distante) return { etat: 'aucune' };
  // Poussée par cet appareil : rien à signaler, on rafraîchit la référence.
  if (distante.appareil && distante.appareil === idAppareil) {
    return { etat: 'a_jour', archive: distante, adopter: true };
  }
  if (!vue) {
    // Premier contact. Une archive marquée par un autre appareil est une vraie
    // divergence ; une archive non marquée date d'avant la fonctionnalité.
    return distante.appareil
      ? { etat: 'divergence', archive: distante }
      : { etat: 'a_jour', archive: distante, adopter: true };
  }
  if (distante.id === vue.id) return { etat: 'a_jour', archive: distante };
  const plusRecente = Date.parse(distante.createdTime) > Date.parse(vue.createdTime);
  return plusRecente
    ? { etat: 'divergence', archive: distante }
    : { etat: 'a_jour', archive: vue };
}

/** Dernière cause d'échec d'envoi vers Drive (voir `derniereErreurSauvegarde`). */
let derniereErreurDrive: string | undefined;

export function derniereErreurGDrive(): string | undefined {
  return derniereErreurDrive;
}

let chargementGsi: Promise<void> | null = null;
let jeton: { accessToken: string; expireA: number } | null = null;


// ---------------------------------------------------------------------------
// Connexion par redirection (PWA installée sur iOS)
// ---------------------------------------------------------------------------

/*
 * En mode « standalone » (application ajoutée à l'écran d'accueil), iOS ouvre la
 * fenêtre Google comme une vue secondaire qui ne reçoit jamais le focus clavier :
 * la page s'affiche mais rien ne peut être saisi. On bascule donc sur un flux par
 * redirection — l'utilisateur va sur Google dans la fenêtre principale, puis
 * revient avec le jeton dans le fragment d'URL.
 */

const CLE_ETAT = 'bailiz.gdrive.state';
const CLE_ROUTE = 'bailiz.gdrive.route';
const CLE_RETOUR = 'bailiz.gdrive.retour';
const CLE_CLIENT = 'bailiz.gdrive.clientId';

/** Vrai si l'application tourne en PWA installée (pas dans un onglet Safari). */
export function estApplicationInstallee(): boolean {
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

/** URI de retour : l'adresse de l'app sans fragment ni paramètres. */
function uriRedirection(): string {
  return window.location.origin + window.location.pathname;
}

/**
 * Quitte l'application vers l'écran de connexion Google. Au retour, le jeton est
 * récupéré par `recupererJetonRedirection()` et la route en cours est restaurée.
 */
export function lancerConnexionParRedirection(clientId = CLIENT_ID_GDRIVE): void {
  const etat = crypto.randomUUID();
  sessionStorage.setItem(CLE_ETAT, etat);
  sessionStorage.setItem(CLE_ROUTE, window.location.hash || '#/parametres');
  // Mémorisé pour la finalisation au retour : la configuration en base est
  // relue de façon asynchrone et n'est pas encore disponible à ce moment-là.
  sessionStorage.setItem(CLE_CLIENT, clientId.trim());
  const params = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: uriRedirection(),
    response_type: 'token',
    scope: SCOPE,
    state: etat,
    include_granted_scopes: 'true',
    prompt: 'consent',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Au démarrage : récupère le jeton renvoyé par Google dans le fragment d'URL.
 * **Doit être appelée avant le montage du routeur** — l'application utilise un
 * HashRouter, et la réponse de Google occupe précisément ce fragment.
 * Le paramètre `state` est vérifié : une réponse non sollicitée est ignorée.
 */
export function recupererJetonRedirection(): boolean {
  const brut = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!brut.includes('access_token=')) return false;

  const params = new URLSearchParams(brut);
  const token = params.get('access_token');
  const etatRecu = params.get('state');
  const etatAttendu = sessionStorage.getItem(CLE_ETAT);
  const route = sessionStorage.getItem(CLE_ROUTE) ?? '#/parametres';
  sessionStorage.removeItem(CLE_ETAT);
  sessionStorage.removeItem(CLE_ROUTE);

  // Restaure la route d'origine et efface le jeton de la barre d'adresse.
  window.history.replaceState(null, '', window.location.pathname + route);

  if (!token || !etatRecu || etatRecu !== etatAttendu) return false;
  jeton = { accessToken: token, expireA: Date.now() + Number(params.get('expires_in') ?? 3600) * 1000 };
  sessionStorage.setItem(CLE_RETOUR, '1');
  return true;
}

/**
 * À appeler une seule fois au montage : renvoie l'ID client utilisé pour la
 * connexion si l'on revient d'une redirection Google, sinon `undefined`.
 */
export function consommerRetourRedirection(): string | undefined {
  if (sessionStorage.getItem(CLE_RETOUR) !== '1') return undefined;
  const clientId = sessionStorage.getItem(CLE_CLIENT) ?? CLIENT_ID_GDRIVE;
  sessionStorage.removeItem(CLE_RETOUR);
  sessionStorage.removeItem(CLE_CLIENT);
  return clientId;
}

export async function getConfigGDrive(): Promise<ConfigGDrive | undefined> {
  return (await getParametres()).sauvegardeGDrive;
}

async function majConfigGDrive(maj: Partial<ConfigGDrive>): Promise<void> {
  const params = await getParametres();
  if (!params.sauvegardeGDrive) return;
  await db.parametres.put({
    ...params,
    sauvegardeGDrive: { ...params.sauvegardeGDrive, ...maj },
  });
}

/**
 * Demande (ou réutilise) une autorisation Google. À appeler **en première
 * instruction** d'un gestionnaire de clic, avant tout accès à IndexedDB : sinon
 * Safari/iOS considère l'activation expirée et bloque la fenêtre sans erreur.
 */
export function demanderAutorisationGoogle(clientId = CLIENT_ID_GDRIVE): Promise<string | null> {
  return obtenirJeton(clientId.trim(), true);
}

/**
 * Connexion interactive : demande le jeton **en premier**, avant toute écriture
 * en base, pour rester dans le geste utilisateur (contrainte Safari/iOS).
 * Retourne `false` si l'utilisateur a refusé ou si la fenêtre a été bloquée.
 */
export async function connecterGDrive(clientId = CLIENT_ID_GDRIVE): Promise<boolean> {
  const token = await obtenirJeton(clientId.trim(), true);
  if (!token) return false;
  await activerGDrive(clientId);
  return true;
}

export async function activerGDrive(clientId = CLIENT_ID_GDRIVE): Promise<void> {
  const params = await getParametres();
  await db.parametres.put({
    ...params,
    sauvegardeGDrive: { clientId: clientId.trim(), actif: true },
  });
}

export async function desactiverGDrive(): Promise<void> {
  const params = await getParametres();
  if (!params.sauvegardeGDrive) return;
  if (jeton) {
    try {
      google.accounts.oauth2.revoke(jeton.accessToken);
    } catch {
      // Révocation best-effort (script gsi éventuellement déchargé).
    }
    jeton = null;
  }
  await db.parametres.put({
    ...params,
    sauvegardeGDrive: { ...params.sauvegardeGDrive, actif: false },
  });
}

/**
 * Précharge le script Google Identity Services. À appeler à l'affichage de
 * l'écran de configuration : sur Safari/iOS, une fenêtre OAuth n'est autorisée
 * que dans le tick du geste utilisateur — si le script se télécharge au moment
 * du clic, la fenêtre est bloquée et la connexion échoue.
 */
export function prechargerGsi(): void {
  void chargerGsi().catch(() => {
    /* réessayé au clic */
  });
}

/** Charge le script Google Identity Services une seule fois. */
function chargerGsi(): Promise<void> {
  if (typeof google !== 'undefined' && google.accounts?.oauth2) return Promise.resolve();
  if (!chargementGsi) {
    chargementGsi = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = URL_GSI;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        chargementGsi = null;
        reject(new Error('Impossible de charger Google Identity Services'));
      };
      document.head.appendChild(script);
    });
  }
  return chargementGsi;
}

/**
 * Obtient un jeton d'accès. En mode silencieux (`interactif = false`),
 * n'affiche aucune fenêtre : échoue si la session Google ne le permet pas.
 */
function obtenirJeton(clientId: string, interactif: boolean): Promise<string | null> {
  if (jeton && Date.now() < jeton.expireA - 60_000) return Promise.resolve(jeton.accessToken);
  // Aucune attente insérée si le script est déjà chargé : sur Safari/iOS, la
  // fenêtre Google n'est autorisée que tant que dure l'activation du geste
  // utilisateur, qu'un simple `await` suffit parfois à faire expirer.
  return gsiPret() ? demanderJeton(clientId, interactif) : chargerGsi().then(() => demanderJeton(clientId, interactif));
}

/** Vrai si Google Identity Services est chargé et utilisable immédiatement. */
function gsiPret(): boolean {
  return typeof google !== 'undefined' && Boolean(google.accounts?.oauth2);
}

function demanderJeton(clientId: string, interactif: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (reponse) => {
        if (reponse.access_token) {
          jeton = {
            accessToken: reponse.access_token,
            expireA: Date.now() + (reponse.expires_in ?? 3600) * 1000,
          };
          resolve(reponse.access_token);
        } else {
          resolve(null);
        }
      },
      error_callback: () => resolve(null),
    });
    client.requestAccessToken(interactif ? {} : { prompt: '' });
  });
}

class ErreurJetonExpire extends Error {}

/**
 * Jeton et dossier « Bailiz » prêts à l'emploi, pour la synchronisation par
 * fichiers (`lib/sync/`). `null` si l'autorisation n'est pas disponible : la
 * synchronisation est alors reportée, ce n'est pas une erreur.
 */
export async function contexteDrive(
  interactif: boolean,
): Promise<{ token: string; dossierId: string } | null> {
  const config = await getConfigGDrive();
  if (!config?.actif || !config.clientId) return null;
  if (!navigator.onLine) return null;
  const token = await obtenirJeton(config.clientId, interactif);
  if (!token) return null;
  const dossierId = await assurerDossier(token, config.dossierId);
  if (dossierId !== config.dossierId) await majConfigGDrive({ dossierId });
  return { token, dossierId };
}

export { appelDrive as appelApiDrive };

async function appelDrive(token: string, url: string, init?: RequestInit): Promise<Response> {
  const reponse = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (reponse.status === 401) {
    jeton = null; // le prochain appel redemandera un jeton
    throw new ErreurJetonExpire('Jeton Google expiré');
  }
  if (!reponse.ok) {
    throw new Error(`API Drive : ${reponse.status} ${await reponse.text().catch(() => '')}`);
  }
  return reponse;
}

/** Retrouve le dossier « Bailiz » sans le créer (`undefined` s'il n'existe pas). */
async function trouverDossier(token: string, dossierIdConnu?: string): Promise<string | undefined> {
  if (dossierIdConnu) {
    const verif = await fetch(`${API}/files/${dossierIdConnu}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (verif.ok) {
      const meta = (await verif.json()) as { trashed?: boolean };
      if (!meta.trashed) return dossierIdConnu;
    }
  }
  const q = encodeURIComponent(
    `name='${NOM_DOSSIER}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`,
  );
  const recherche = await appelDrive(token, `${API}/files?q=${q}&fields=files(id)`);
  const { files } = (await recherche.json()) as { files: { id: string }[] };
  return files[0]?.id;
}

/** Retrouve (ou crée) le dossier « Bailiz » à la racine du Drive. */
async function assurerDossier(token: string, dossierIdConnu?: string): Promise<string> {
  const existant = await trouverDossier(token, dossierIdConnu);
  if (existant) return existant;
  const creation = await appelDrive(token, `${API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NOM_DOSSIER, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return ((await creation.json()) as { id: string }).id;
}

/** Métadonnées Drive d'un fichier, converties en `ArchiveDrive`. */
function versArchive(f: {
  id: string;
  name: string;
  createdTime?: string;
  appProperties?: Record<string, string>;
}): ArchiveDrive {
  return {
    id: f.id,
    nom: f.name,
    createdTime: f.createdTime ?? new Date(0).toISOString(),
    appareil: f.appProperties?.appareil,
    appareilNom: f.appProperties?.appareilNom,
  };
}

/** Archive la plus récente du dossier, `undefined` si le dossier n'en contient aucune. */
async function derniereArchiveDistante(
  token: string,
  dossierId: string,
): Promise<ArchiveDrive | undefined> {
  const q = encodeURIComponent(`'${dossierId}' in parents and trashed=false`);
  const reponse = await appelDrive(
    token,
    `${API}/files?q=${q}&orderBy=createdTime desc&pageSize=10&fields=files(id,name,createdTime,appProperties)`,
  );
  const { files } = (await reponse.json()) as {
    files: { id: string; name: string; createdTime?: string; appProperties?: Record<string, string> }[];
  };
  // Le dossier peut contenir autre chose que nos archives : on ne compare que
  // les fichiers que l'application a elle-même produits.
  const archive = files.find((f) => estArchiveBailiz(f.name));
  return archive ? versArchive(archive) : undefined;
}

/**
 * Corps `multipart/related` d'un upload Drive (métadonnées JSON + contenu).
 * Fonction pure, testée.
 */
export function construireCorpsMultipart(
  metadata: object,
  contenu: Blob,
  frontiere = `bailiz-${uid()}`,
): { corps: Blob; contentType: string } {
  const corps = new Blob([
    `--${frontiere}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${frontiere}\r\nContent-Type: application/zip\r\n\r\n`,
    contenu,
    `\r\n--${frontiere}--`,
  ]);
  return { corps, contentType: `multipart/related; boundary=${frontiere}` };
}

/**
 * Envoie l'archive en la marquant de l'identité de cet appareil : c'est ce
 * marquage qui permet à l'autre appareil de reconnaître une archive étrangère.
 * Renvoie les métadonnées créées, qui deviennent la nouvelle référence locale.
 */
async function uploaderArchive(
  token: string,
  dossierId: string,
  archive: Blob,
): Promise<ArchiveDrive> {
  const nom = `bailiz-sauvegarde-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.zip`;
  const { corps, contentType } = construireCorpsMultipart(
    {
      name: nom,
      parents: [dossierId],
      appProperties: {
        appareil: identifiantAppareil(),
        appareilNom: nomAppareil(),
        exporteLe: nowISO(),
      },
    },
    archive,
  );
  const reponse = await appelDrive(
    token,
    `${API_UPLOAD}/files?uploadType=multipart&fields=id,name,createdTime,appProperties`,
    {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: corps,
    },
  );
  return versArchive(
    (await reponse.json()) as {
      id: string;
      name: string;
      createdTime?: string;
      appProperties?: Record<string, string>;
    },
  );
}

async function faireRotation(token: string, dossierId: string): Promise<void> {
  try {
    const q = encodeURIComponent(`'${dossierId}' in parents and trashed=false`);
    const liste = await appelDrive(
      token,
      `${API}/files?q=${q}&fields=files(id,name)&pageSize=100`,
    );
    const { files } = (await liste.json()) as { files: { id: string; name: string }[] };
    const aSupprimer = new Set(fichiersASupprimer(files.map((f) => f.name)));
    for (const fichier of files.filter((f) => aSupprimer.has(f.name))) {
      await appelDrive(token, `${API}/files/${fichier.id}`, { method: 'DELETE' });
    }
  } catch (e) {
    // La rotation est un confort : son échec ne doit pas faire échouer le push.
    console.warn('Rotation Drive ignorée :', e);
  }
}

/**
 * Compare le Drive à ce que cet appareil connaît. Ne modifie rien, sauf pour
 * adopter silencieusement une archive qui vient de cet appareil ou qui est
 * antérieure au marquage (cf. CDC §4.3).
 *
 * `indisponible` couvre tous les cas où la question ne peut pas être posée
 * (Drive inactif, hors-ligne, autorisation Google expirée) : ce n'est pas une
 * erreur, seulement un report.
 */
export async function verifierArchiveDistante(interactif: boolean): Promise<EtatDrive> {
  const config = await getConfigGDrive();
  if (!config?.actif || !config.clientId) return { etat: 'indisponible' };
  if (!navigator.onLine) return { etat: 'indisponible' };
  try {
    const token = await obtenirJeton(config.clientId, interactif);
    if (!token) return { etat: 'indisponible' };
    const dossierId = await trouverDossier(token, config.dossierId);
    if (!dossierId) return { etat: 'aucune' };
    const distante = await derniereArchiveDistante(token, dossierId);
    const resultat = comparerArchives(distante, config.derniereArchiveVue, identifiantAppareil());
    if (resultat.adopter && resultat.etat === 'a_jour' && resultat.archive) {
      await majConfigGDrive({ dossierId, derniereArchiveVue: resultat.archive });
    }
    return resultat;
  } catch (e) {
    console.warn('Vérification du Drive impossible :', e);
    return { etat: 'indisponible' };
  }
}

/** Télécharge une archive du Drive (restauration depuis un autre appareil). */
export async function telechargerArchiveGDrive(archive: ArchiveDrive): Promise<Blob> {
  const config = await getConfigGDrive();
  if (!config?.clientId) throw new Error('Google Drive n’est pas configuré.');
  const token = await obtenirJeton(config.clientId, true);
  if (!token) throw new Error('Autorisation Google requise pour télécharger la sauvegarde.');
  const reponse = await appelDrive(token, `${API}/files/${archive.id}?alt=media`);
  return reponse.blob();
}

/** Enregistre l'archive distante comme connue : l'avertissement cesse. */
export async function marquerArchiveVue(archive: ArchiveDrive): Promise<void> {
  await majConfigGDrive({ derniereArchiveVue: archive });
}

/**
 * Push complet vers Google Drive si la sauvegarde Drive est activée.
 *
 * `forcer` passe outre une divergence détectée : à ne déclencher que sur un
 * choix explicite de l'utilisateur, jamais automatiquement.
 */
export async function pousserSauvegardeGDrive(
  interactif: boolean,
  options?: { forcer?: boolean },
): Promise<ResultatGDrive> {
  const config = await getConfigGDrive();
  if (!config?.actif || !config.clientId) return 'inactif';
  // Vérifié avant l'état du réseau : un appareil neuf ne doit jamais pousser
  // d'archive vide — la rotation (10 dernières) supprimerait les sauvegardes
  // pleines des autres appareils — ni en mettre une en file d'attente.
  if (await baseSansDonnees()) return 'base_vide';
  if (!navigator.onLine) return 'hors_ligne';
  try {
    let token = await obtenirJeton(config.clientId, interactif);
    if (!token) return 'permission_requise';

    const executer = async (t: string): Promise<ResultatGDrive> => {
      const dossierId = await assurerDossier(t, config.dossierId);

      // Garde-fou : ne jamais recouvrir une archive plus récente venue d'un
      // autre appareil. Vérifié avant de construire le ZIP, qui est coûteux.
      if (!options?.forcer) {
        const distante = await derniereArchiveDistante(t, dossierId);
        const etat = comparerArchives(distante, config.derniereArchiveVue, identifiantAppareil());
        if (etat.etat === 'divergence') {
          await majConfigGDrive({ dossierId });
          return 'conflit';
        }
        if (etat.adopter && etat.etat === 'a_jour' && etat.archive) {
          await majConfigGDrive({ dossierId, derniereArchiveVue: etat.archive });
        }
      }

      const archive = await exporterSauvegarde();
      const poussee = await uploaderArchive(t, dossierId, archive);
      await faireRotation(t, dossierId);
      await majConfigGDrive({ dossierId, dernierPush: nowISO(), derniereArchiveVue: poussee });
      return 'ok';
    };

    try {
      return await executer(token);
    } catch (e) {
      if (!(e instanceof ErreurJetonExpire)) throw e;
      // Jeton expiré en cours de route : une seule nouvelle tentative.
      token = await obtenirJeton(config.clientId, interactif);
      if (!token) return 'permission_requise';
      return await executer(token);
    }
  } catch (e) {
    console.error('Sauvegarde Google Drive impossible :', e);
    derniereErreurDrive = decrireErreur(e);
    return 'erreur';
  }
}
