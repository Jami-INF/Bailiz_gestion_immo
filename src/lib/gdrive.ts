import { db, getParametres } from './db';
import { uid } from './ids';

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
const NOM_DOSSIER = 'Bailiz';

export interface ConfigGDrive {
  clientId: string;
  actif: boolean;
  dossierId?: string;
  /** Heure **serveur** du dernier cycle réussi (cf. `lib/sync/cycle.ts`). */
  derniereSync?: string;
  /** Date du dernier instantané ZIP déposé dans `archives/`. */
  dernierInstantane?: string;
}

let chargementGsi: Promise<void> | null = null;
/** Jeton d'accès, en mémoire uniquement — jamais persisté (~1 h de validité). */
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

/**
 * (Ré)active la destination Google Drive.
 *
 * La configuration existante est **conservée** : l'autorisation Google expire
 * souvent (Safari/iOS bloque les cookies tiers, le jeton n'est jamais
 * persisté), et se reconnecter est le geste normal. Repartir d'un objet neuf
 * effacerait `derniereSync`, dont la perte force au cycle suivant un
 * re-listage et une réécriture complète de la base.
 */
export async function activerGDrive(clientId = CLIENT_ID_GDRIVE): Promise<void> {
  const params = await getParametres();
  await db.parametres.put({
    ...params,
    sauvegardeGDrive: { ...params.sauvegardeGDrive, clientId: clientId.trim(), actif: true },
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
 * Échec d'un appel à l'API Drive, avec son code HTTP. Le code compte : un 404
 * sur une mise à jour signifie que le fichier a été supprimé depuis un autre
 * appareil, et l'appelant peut alors le recréer au lieu d'abandonner le cycle.
 */
export class ErreurApiDrive extends Error {
  constructor(
    readonly statut: number,
    message: string,
  ) {
    super(message);
  }
}

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
    throw new ErreurApiDrive(
      reponse.status,
      `API Drive : ${reponse.status} ${await reponse.text().catch(() => '')}`,
    );
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
