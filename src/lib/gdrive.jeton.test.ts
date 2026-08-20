// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Survie du jeton Google au **rechargement de la page**.
 *
 * Le cas réel : sur iPad, WebKit décharge la page quand la mémoire manque -
 * l'ouverture de la caméra pour une photo d'état des lieux suffit. Au retour, la
 * page repart de zéro ; tant que le jeton vivait dans une variable de module,
 * l'application se déclarait déconnectée de Google Drive en plein constat.
 *
 * Un rechargement se simule en réimportant le module : ses variables sont alors
 * neuves, seul le `sessionStorage` subsiste - exactement comme dans le
 * navigateur.
 */

const CLE_JETON = 'bailiz.gdrive.jeton';

/** Recharge `gdrive` et `db` dans un même registre de modules neuf. */
async function rechargerPage() {
  vi.resetModules();
  const gdrive = await import('./gdrive');
  const { db, getParametres } = await import('./db');
  return { gdrive, db, getParametres };
}

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/app/');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('jeton Google et rechargement de page', () => {
  it('reste utilisable après un rechargement (photo, Centre de contrôle)', async () => {
    sessionStorage.setItem(
      CLE_JETON,
      JSON.stringify({ accessToken: 'JETON', expireA: Date.now() + 3_600_000 }),
    );

    const { gdrive, db, getParametres } = await rechargerPage();
    const params = await getParametres();
    await db.parametres.put({
      ...params,
      sauvegardeGDrive: { clientId: 'id-test', actif: true, dossierId: 'DOSSIER' },
    });

    // Le dossier connu est vérifié, rien de plus : aucune fenêtre Google ne doit
    // s'ouvrir, et le script GSI n'est même pas chargé (il n'existe pas ici).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'DOSSIER' }), { status: 200 })),
    );

    await expect(gdrive.contexteDrive(false)).resolves.toEqual({
      token: 'JETON',
      dossierId: 'DOSSIER',
    });
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer JETON' });
  });

  it('écrit le jeton de la redirection dans la session, pas seulement en mémoire', async () => {
    sessionStorage.setItem('bailiz.gdrive.state', 'abc');
    window.history.replaceState(null, '', '/app/#access_token=JETON&state=abc&expires_in=3600');

    const { gdrive } = await rechargerPage();
    expect(gdrive.recupererJetonRedirection()).toBe(true);

    const memorise = JSON.parse(sessionStorage.getItem(CLE_JETON) ?? 'null');
    expect(memorise.accessToken).toBe('JETON');
    expect(memorise.expireA).toBeGreaterThan(Date.now());
  });

  it('ignore et efface un jeton expiré', async () => {
    sessionStorage.setItem(
      CLE_JETON,
      JSON.stringify({ accessToken: 'PERIME', expireA: Date.now() - 1 }),
    );
    await rechargerPage();
    expect(sessionStorage.getItem(CLE_JETON)).toBeNull();
  });

  it('ignore un contenu illisible sans faire échouer le chargement', async () => {
    sessionStorage.setItem(CLE_JETON, 'pas du json');
    const { gdrive } = await rechargerPage();
    // Le module s'est chargé : la connexion par redirection reste possible.
    expect(typeof gdrive.lancerConnexionParRedirection).toBe('function');
  });
});

/**
 * Renouvellement du jeton **pendant** un cycle.
 *
 * Le jeton vaut une heure et l'ouverture du dépôt le capture une fois pour tous
 * les appels qui suivent. Un premier échange, ou l'envoi des photos d'un état
 * des lieux complet, peut durer assez pour le voir expirer en pleine course.
 */
describe('expiration en cours de cycle', () => {
  /** Un GSI de test qui accorde `jetonAccorde`, ou refuse si `null`. */
  function stubberGoogle(jetonAccorde: string | null) {
    const demandes = { nombre: 0 };
    vi.stubGlobal('google', {
      accounts: {
        oauth2: {
          initTokenClient: ({
            callback,
          }: {
            callback: (r: { access_token?: string; expires_in?: number }) => void;
          }) => ({
            requestAccessToken: () => {
              demandes.nombre += 1;
              callback(jetonAccorde ? { access_token: jetonAccorde, expires_in: 3600 } : {});
            },
          }),
          revoke: () => {},
        },
      },
    });
    return demandes;
  }

  /** Ouvre le dépôt une première fois : c'est ce qui fixe le client ID courant. */
  async function depotOuvert() {
    sessionStorage.setItem(
      CLE_JETON,
      JSON.stringify({ accessToken: 'VIEUX', expireA: Date.now() + 3_600_000 }),
    );
    const { gdrive, db, getParametres } = await rechargerPage();
    const params = await getParametres();
    await db.parametres.put({
      ...params,
      sauvegardeGDrive: { clientId: 'id-test', actif: true, dossierId: 'DOSSIER' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'DOSSIER' }), { status: 200 })),
    );
    await gdrive.contexteDrive(false);
    return gdrive;
  }

  it('reprend un jeton et rejoue l’appel refusé, sans perdre le cycle', async () => {
    const gdrive = await depotOuvert();
    const demandes = stubberGoogle('NEUF');

    // Le jeton capturé à l'ouverture vient d'expirer : Drive refuse.
    const appels: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        appels.push((init.headers as Record<string, string>).Authorization);
        return appels.length === 1
          ? new Response(null, { status: 401 })
          : new Response('{}', { status: 200 });
      }),
    );

    const reponse = await gdrive.appelApiDrive('VIEUX', 'https://exemple/files');
    expect(reponse.status).toBe(200);
    // Un seul renouvellement, silencieux, et l'appel rejoué porte le jeton neuf.
    expect(demandes.nombre).toBe(1);
    expect(appels).toEqual(['Bearer VIEUX', 'Bearer NEUF']);
    // Le jeton neuf est mémorisé : les appels suivants n'ont plus à le redemander.
    expect(JSON.parse(sessionStorage.getItem(CLE_JETON)!).accessToken).toBe('NEUF');
  });

  it('utilise le jeton renouvelé pour les appels suivants, sans nouveau refus', async () => {
    const gdrive = await depotOuvert();
    stubberGoogle('NEUF');
    let premier = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const entetes = (init.headers as Record<string, string>).Authorization;
        if (premier) {
          premier = false;
          return new Response(null, { status: 401 });
        }
        // Après renouvellement, plus aucun appel ne doit repartir avec l'ancien
        // jeton : l'appelant le tient en fermeture pour tout le reste du cycle.
        expect(entetes).toBe('Bearer NEUF');
        return new Response('{}', { status: 200 });
      }),
    );

    await gdrive.appelApiDrive('VIEUX', 'https://exemple/files');
    // Le deuxième appel du cycle porte encore « VIEUX » côté appelant.
    await expect(gdrive.appelApiDrive('VIEUX', 'https://exemple/autre')).resolves.toMatchObject({
      status: 200,
    });
  });

  it('signale une expiration franche quand Google refuse en silence', async () => {
    const gdrive = await depotOuvert();
    stubberGoogle(null); // session Google perdue : Safari bloque les cookies tiers
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));

    await expect(gdrive.appelApiDrive('VIEUX', 'https://exemple/files')).rejects.toBeInstanceOf(
      gdrive.ErreurJetonExpire,
    );
    // Le jeton mort ne traîne nulle part : le prochain geste repart proprement.
    expect(sessionStorage.getItem(CLE_JETON)).toBeNull();
  });

  it('ne rejoue qu’une fois : un 401 persistant n’est pas une expiration', async () => {
    const gdrive = await depotOuvert();
    stubberGoogle('NEUF');
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(gdrive.appelApiDrive('VIEUX', 'https://exemple/files')).rejects.toBeInstanceOf(
      gdrive.ErreurJetonExpire,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
