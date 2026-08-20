import { db, getParametres, lireParametres } from './db';
import { uid } from './ids';

/**
 * Sauvegarde vers Google Drive, 100 % côté client :
 * - authentification par Google Identity Services (script gsi chargé à la
 *   demande, flux « token client ») avec le scope non sensible `drive.file`
 *   (l'app ne voit que les fichiers qu'elle a créés) ;
 * - upload multipart du ZIP dans un dossier « Bailiz » à la racine du Drive ;
 * - même rotation que le dossier local (10 archives conservées).
 *
 * Le jeton d'accès (~1 h) vit en mémoire et n'est recopié que dans le
 * `sessionStorage` de l'onglet - jamais en base, jamais sur le disque ; son
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

interface JetonAcces {
  accessToken: string;
  /** Instant d'expiration (ms epoch), tel qu'annoncé par Google. */
  expireA: number;
}

/**
 * Clé du jeton dans le `sessionStorage`.
 *
 * **Pourquoi il y est.** Sur iPad, WebKit décharge la page dès qu'il manque de
 * mémoire - typiquement quand la caméra s'ouvre pour une photo d'état des lieux,
 * ou pendant un passage par le Centre de contrôle. Au retour, la page est
 * rechargée à neuf : une variable de module aurait disparu, et l'application se
 * retrouvait « déconnectée de Google Drive » en plein constat, sans que personne
 * n'ait rien fait. Le `sessionStorage`, lui, survit à ce rechargement.
 *
 * **Ce que ça coûte.** Le jeton devient lisible par un script de la page, alors
 * qu'une variable de module ne l'était que par le code du module. Le compromis
 * est étroit : portée `drive.file` (les seuls fichiers créés par l'app), durée
 * de vie d'une heure au plus, effacement à la déconnexion comme au premier 401,
 * et périmètre limité à l'onglet - fermer l'application l'efface. Ni
 * `localStorage` ni IndexedDB pour cette raison : ils survivraient à la session.
 */
const CLE_JETON = 'bailiz.gdrive.jeton';

/** Marge avant expiration : un jeton sur le point d'expirer est traité comme mort. */
const MARGE_EXPIRATION_MS = 60_000;

/** Jeton d'accès courant, restauré si la page vient d'être rechargée. */
let jeton: JetonAcces | null = lireJetonMemorise();

/**
 * Relit le jeton de la session. Toute anomalie - stockage indisponible (mode
 * privé, environnement sans DOM), contenu illisible, jeton expiré - se solde par
 * `null` : on redemandera une autorisation, ce qui est toujours réparable.
 */
function lireJetonMemorise(): JetonAcces | null {
  try {
    const brut = sessionStorage.getItem(CLE_JETON);
    if (!brut) return null;
    const memorise = JSON.parse(brut) as Partial<JetonAcces>;
    if (typeof memorise.accessToken !== 'string' || typeof memorise.expireA !== 'number') return null;
    if (Date.now() >= memorise.expireA - MARGE_EXPIRATION_MS) {
      sessionStorage.removeItem(CLE_JETON);
      return null;
    }
    return { accessToken: memorise.accessToken, expireA: memorise.expireA };
  } catch {
    return null;
  }
}

/**
 * Seul point d'écriture du jeton : mémoire **et** session restent alignées.
 * Passer `null` révoque les deux. L'échec du stockage n'est pas une erreur -
 * l'application fonctionne alors comme avant, jusqu'au prochain rechargement.
 */
function memoriserJeton(nouveau: JetonAcces | null): void {
  jeton = nouveau;
  try {
    if (nouveau) sessionStorage.setItem(CLE_JETON, JSON.stringify(nouveau));
    else sessionStorage.removeItem(CLE_JETON);
  } catch {
    /* Stockage refusé : le jeton reste valable pour la durée de vie de la page. */
  }
}

// ---------------------------------------------------------------------------
// Connexion par redirection (PWA installée sur iOS)
// ---------------------------------------------------------------------------

/*
 * En mode « standalone » (application ajoutée à l'écran d'accueil), iOS ouvre la
 * fenêtre Google comme une vue secondaire qui ne reçoit jamais le focus clavier :
 * la page s'affiche mais rien ne peut être saisi. On bascule donc sur un flux par
 * redirection - l'utilisateur va sur Google dans la fenêtre principale, puis
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
 * **Doit être appelée avant le montage du routeur** - l'application utilise un
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
  memoriserJeton({
    accessToken: token,
    expireA: Date.now() + Number(params.get('expires_in') ?? 3600) * 1000,
  });
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

/**
 * Configuration Drive, **sans écrire** : `getParametres()` crée la ligne par
 * défaut quand elle manque, ce qu'une transaction de `liveQuery` interdit
 * (`ReadOnlyError`, et écran blanc au tout premier lancement). Les écrans
 * observent cette configuration ; la lecture doit donc rester une lecture.
 */
export async function getConfigGDrive(): Promise<ConfigGDrive | undefined> {
  return (await lireParametres()).sauvegardeGDrive;
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
 * souvent (Safari/iOS bloque les cookies tiers, et le jeton ne survit pas à la
 * fermeture de l'application), et se reconnecter est le geste normal. Repartir d'un objet neuf
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
    memoriserJeton(null);
  }
  await db.parametres.put({
    ...params,
    sauvegardeGDrive: { ...params.sauvegardeGDrive, actif: false },
  });
}

/**
 * Précharge le script Google Identity Services. À appeler à l'affichage de
 * l'écran de configuration : sur Safari/iOS, une fenêtre OAuth n'est autorisée
 * que dans le tick du geste utilisateur - si le script se télécharge au moment
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
  clientIdCourant = clientId;
  if (jeton && Date.now() < jeton.expireA - MARGE_EXPIRATION_MS) return Promise.resolve(jeton.accessToken);
  // Aucune attente insérée si le script est déjà chargé : sur Safari/iOS, la
  // fenêtre Google n'est autorisée que tant que dure l'activation du geste
  // utilisateur, qu'un simple `await` suffit parfois à faire expirer.
  return gsiPret() ? demanderJeton(clientId, interactif) : chargerGsi().then(() => demanderJeton(clientId, interactif));
}

/**
 * Client ID de la dernière autorisation demandée. Retenu pour pouvoir renouveler
 * un jeton expiré au milieu d'un cycle, là où la configuration n'est plus à
 * portée : la relire coûterait un aller-retour IndexedDB au pire moment.
 */
let clientIdCourant: string | null = null;

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
          memoriserJeton({
            accessToken: reponse.access_token,
            expireA: Date.now() + (reponse.expires_in ?? 3600) * 1000,
          });
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

/**
 * Le jeton a expiré en cours de route et n'a pas pu être renouvelé en silence.
 *
 * **Exportée exprès.** Tant qu'elle ne l'était pas, elle remontait jusqu'au
 * `catch` générique du cycle et s'affichait comme une panne - « Cycle de
 * synchronisation interrompu » - alors que la situation est banale et que le
 * geste attendu est tout autre : reconnecter Google. Un message d'erreur qui
 * désigne le mauvais problème coûte plus cher que pas de message du tout.
 */
export class ErreurJetonExpire extends Error {}

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

/**
 * Un appel à l'API Drive, avec **renouvellement du jeton en cours de route**.
 *
 * Le jeton Google vaut une heure, et l'appelant le capture une fois à
 * l'ouverture du dépôt (`ouvrirDepotDrive`) pour tous les appels du cycle. Un
 * cycle qui dure - première synchronisation, envoi de dizaines de photos d'état
 * des lieux - peut donc franchir l'expiration en pleine course : sans ce
 * rattrapage, tout le reste du cycle partait avec un jeton mort et l'échange
 * était perdu jusqu'au battement suivant.
 *
 * Deux garde-fous : le renouvellement est **silencieux** (jamais de fenêtre
 * Google surgissant seule pendant un cycle de fond), et l'appel n'est rejoué
 * qu'**une fois** - un 401 qui persiste avec un jeton frais n'est pas un
 * problème d'expiration, et boucler ne le résoudrait pas.
 */
async function appelDrive(
  token: string,
  url: string,
  init?: RequestInit,
  rejeu = false,
): Promise<Response> {
  /*
   * Le jeton en mémoire prime sur celui reçu en argument : après un premier
   * renouvellement, les appels suivants du même cycle portent encore l'ancien.
   * Sans cette préférence, chacun paierait son propre 401 avant d'être rejoué.
   */
  const utilise = jeton?.accessToken ?? token;
  const reponse = await fetch(url, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${utilise}` },
  });
  if (reponse.status === 401) {
    memoriserJeton(null); // le prochain appel redemandera un jeton
    /*
     * Rejeu sûr : les corps envoyés ici sont des `Blob` (multipart ou média),
     * relisibles autant de fois qu'il le faut. Un corps en flux ne le serait
     * pas - il faudrait alors le reconstruire avant de réessayer.
     */
    if (!rejeu && clientIdCourant) {
      const frais = await obtenirJeton(clientIdCourant, false);
      if (frais) return appelDrive(frais, url, init, true);
    }
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
 *
 * Le type du contenu est **celui du blob**, et surtout pas une constante. Cette
 * fonction n'a d'abord servi qu'à pousser l'archive de sauvegarde, d'où un
 * `application/zip` écrit en dur ; la synchronisation l'a ensuite reprise pour
 * **tous** les fichiers. Chaque PDF et chaque photo partaient donc sur le Drive
 * déclarés comme des archives, et revenaient tels quels sur l'autre appareil :
 * un bail qui se télécharge en `.zip` (le contenu, lui, restait un PDF valide),
 * et des photos que le moteur PDF refusait d'intégrer faute de type d'image.
 */
export function construireCorpsMultipart(
  metadata: object,
  contenu: Blob,
  frontiere = `bailiz-${uid()}`,
): { corps: Blob; contentType: string } {
  const typeContenu = contenu.type || 'application/octet-stream';
  const corps = new Blob([
    `--${frontiere}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${frontiere}\r\nContent-Type: ${typeContenu}\r\n\r\n`,
    contenu,
    `\r\n--${frontiere}--`,
  ]);
  return { corps, contentType: `multipart/related; boundary=${frontiere}` };
}
