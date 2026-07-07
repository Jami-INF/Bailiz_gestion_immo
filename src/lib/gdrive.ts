import { format } from 'date-fns';
import { db, getParametres } from './db';
import { exporterSauvegarde } from './backup';
import { uid, nowISO } from './ids';
import { fichiersASupprimer } from './rotation';

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
 * JavaScript autorisées côté Google (jami-inf.github.io, localhost:5273).
 * En cas de fork/redéploiement sur un autre domaine, créer son propre ID.
 */
export const CLIENT_ID_GDRIVE =
  '532224169040-4gobipusbakb8hpnld79o217teumhqvi.apps.googleusercontent.com';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const URL_GSI = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/drive/v3';
const API_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const NOM_DOSSIER = 'Bailiz';

export type ResultatGDrive = 'ok' | 'inactif' | 'permission_requise' | 'hors_ligne' | 'erreur';

export interface ConfigGDrive {
  clientId: string;
  actif: boolean;
  dossierId?: string;
  dernierPush?: string;
}

let chargementGsi: Promise<void> | null = null;
let jeton: { accessToken: string; expireA: number } | null = null;

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
async function obtenirJeton(clientId: string, interactif: boolean): Promise<string | null> {
  if (jeton && Date.now() < jeton.expireA - 60_000) return jeton.accessToken;
  await chargerGsi();
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

/** Retrouve (ou crée) le dossier « Bailiz » à la racine du Drive. */
async function assurerDossier(token: string, dossierIdConnu?: string): Promise<string> {
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
  if (files.length > 0) return files[0].id;

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

async function uploaderArchive(token: string, dossierId: string, archive: Blob): Promise<void> {
  const nom = `bailiz-sauvegarde-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.zip`;
  const { corps, contentType } = construireCorpsMultipart(
    { name: nom, parents: [dossierId] },
    archive,
  );
  await appelDrive(token, `${API_UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: corps,
  });
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

/** Push complet vers Google Drive si la sauvegarde Drive est activée. */
export async function pousserSauvegardeGDrive(interactif: boolean): Promise<ResultatGDrive> {
  const config = await getConfigGDrive();
  if (!config?.actif || !config.clientId) return 'inactif';
  if (!navigator.onLine) return 'hors_ligne';
  try {
    let token = await obtenirJeton(config.clientId, interactif);
    if (!token) return 'permission_requise';

    const executer = async (t: string) => {
      const dossierId = await assurerDossier(t, config.dossierId);
      const archive = await exporterSauvegarde();
      await uploaderArchive(t, dossierId, archive);
      await faireRotation(t, dossierId);
      await majConfigGDrive({ dossierId, dernierPush: nowISO() });
    };

    try {
      await executer(token);
    } catch (e) {
      if (!(e instanceof ErreurJetonExpire)) throw e;
      // Jeton expiré en cours de route : une seule nouvelle tentative.
      token = await obtenirJeton(config.clientId, interactif);
      if (!token) return 'permission_requise';
      await executer(token);
    }
    return 'ok';
  } catch (e) {
    console.error('Sauvegarde Google Drive impossible :', e);
    return 'erreur';
  }
}
