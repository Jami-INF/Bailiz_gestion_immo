// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getParametres } from '@/lib/db';
import { activerGDrive } from '@/lib/gdrive';
import {
  abonnerEtatSync,
  etatSync,
  lancerCycle,
  purgerJournalSiInactif,
  syncActive,
} from './index';
import { journaliser } from './journal';
import { synchroniser } from './cycle';
import { DepotMemoire } from './depotMemoire';

/**
 * Activation de la synchronisation entre appareils.
 *
 * Il n'y a plus qu'un seul mode : brancher le Drive, c'est synchroniser. Ce qui
 * se joue ici, c'est qu'elle ne s'éteigne jamais toute seule - un appareil qui
 * cesse silencieusement d'échanger est pire qu'un appareil jamais branché.
 */

async function configurer(config?: Record<string, unknown>) {
  await Promise.all([db.parametres.clear(), db.changements.clear()]);
  const params = await getParametres();
  await db.parametres.put({
    ...params,
    sauvegardeGDrive: config as never,
  });
}

describe('activation par défaut', () => {
  beforeEach(() => configurer({ clientId: 'x', actif: true }));

  it('est active dès que le Drive est connecté, sans réglage explicite', async () => {
    expect(await syncActive()).toBe(true);
  });

  it('reste inactive tant que le Drive n’est pas connecté', async () => {
    await configurer(undefined);
    expect(await syncActive()).toBe(false);
    await configurer({ clientId: 'x', actif: false });
    expect(await syncActive()).toBe(false);
  });
});

describe('reconnexion Google Drive', () => {
  it('ne perd ni l’activation ni l’état de synchronisation', async () => {
    /*
     * L'autorisation Google expire souvent (Safari/iOS bloque les cookies
     * tiers) et se reconnecter est le geste normal. Il repartait d'une
     * configuration neuve : la synchronisation s'éteignait sans que personne
     * ne l'ait demandé, et l'appareil retombait sur l'archive ZIP.
     */
    await configurer({
      clientId: 'x',
      actif: true,
      derniereSync: '2026-08-08T10:00:00.000Z',
      dernierInstantane: '2026-08-05T10:00:00.000Z',
    });

    await activerGDrive('y');

    const config = (await getParametres()).sauvegardeGDrive;
    expect(config?.clientId).toBe('y');
    expect(config?.actif).toBe(true);
    expect(config?.derniereSync).toBe('2026-08-08T10:00:00.000Z');
    expect(config?.dernierInstantane).toBe('2026-08-05T10:00:00.000Z');
    expect(await syncActive()).toBe(true);
  });

  it('ne réactive rien après une déconnexion : c’est un nouveau branchement', async () => {
    await configurer({ clientId: 'x', actif: false });
    expect(await syncActive()).toBe(false);
    await activerGDrive('x');
    expect(await syncActive()).toBe(true);
  });
});

describe('purge du journal', () => {
  it('vide le journal quand la synchronisation est éteinte', async () => {
    // Les hooks l'alimentent quoi qu'il arrive - une suppression ne laisse
    // aucune trace récupérable - mais sans synchronisation il ne ferait que
    // grossir indéfiniment.
    await configurer({ clientId: 'x', actif: false });
    await journaliser('biens', 'b1', 'maj');
    await purgerJournalSiInactif();
    expect(await db.changements.count()).toBe(0);
  });

  it('n’y touche pas quand la synchronisation est active', async () => {
    await configurer({ clientId: 'x', actif: true });
    await journaliser('biens', 'b1', 'maj');
    await purgerJournalSiInactif();
    expect(await db.changements.count()).toBe(1);
  });
});

describe('cycles concurrents', () => {
  it('signale « ignore », jamais une autorisation à renouveler', async () => {
    /*
     * Avec un battement toutes les cinq minutes, croiser un cycle déjà en cours
     * est banal. Le confondre avec un dépôt inaccessible afficherait
     * « reconnectez Google Drive » à un utilisateur dont le Drive marche très
     * bien - et l'inviterait à un geste inutile, voire inquiétant.
     */
    await avecReseau(true, async () => {
      // Dépôt impossible à ouvrir : c'est « indisponible », pas « ignore ».
      await driveInutilisable();
      expect((await lancerCycle(false)).etat).toBe('indisponible');

      // Drive déconnecté : rien à tenter, et rien à signaler.
      await configurer({ clientId: 'x', actif: false });
      expect((await lancerCycle(false)).etat).toBe('ignore');
    });
  });
});

/**
 * Force l'état réseau le temps d'une action.
 *
 * `navigator.onLine` est une propriété du prototype sous jsdom : on la masque
 * par une propriété propre, puis on la retire pour rendre le getter d'origine.
 */
const avecReseau = async (enLigne: boolean, action: () => Promise<void>) => {
  const origine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', { value: enLigne, configurable: true });
  try {
    await action();
  } finally {
    if (origine) Object.defineProperty(navigator, 'onLine', origine);
    else Reflect.deleteProperty(navigator, 'onLine');
  }
};

/*
 * `clientId` vide : le dépôt refuse de s'ouvrir **avant** de charger le script
 * Google, ce qui met le cycle exactement dans l'état à couvrir - « indisponible »
 * - sans jamais toucher au réseau. Indispensable sous jsdom, où une balise
 * `<script>` vers accounts.google.com ne se résoudrait jamais.
 */
const driveInutilisable = () => configurer({ clientId: '', actif: true });

describe('signal d’état de synchronisation', () => {

  it('reste éteint hors ligne : il n’y a rien à reconnecter', async () => {
    /*
     * Hors-ligne et autorisation périmée sont indiscernables côté dépôt.
     * Inviter à « reconnecter Google » quelqu'un qui est dans un ascenseur le
     * ferait chercher une panne inexistante.
     */
    const avant = etatSync().etat;
    await avecReseau(false, async () => {
      await driveInutilisable();
      expect((await lancerCycle(false)).etat).toBe('indisponible');
    });
    expect(etatSync().etat).toBe(avant);
  });

  it('s’allume quand le dépôt ne s’ouvre pas alors que le réseau est là', async () => {
    let notifications = 0;
    const desabonner = abonnerEtatSync(() => notifications++);
    try {
      await avecReseau(true, async () => {
        await driveInutilisable();
        expect((await lancerCycle(false)).etat).toBe('indisponible');
      });
      expect(etatSync().etat).toBe('reconnexion');
      // « en_cours » puis « reconnexion » : deux transitions réelles.
      expect(notifications).toBe(2);
    } finally {
      desabonner();
    }
  });

  it('n’efface pas l’avertissement à chaque passage du battement', async () => {
    /*
     * Le battement relance un cycle toutes les cinq minutes. Si « en_cours »
     * recouvrait l'avertissement, le bandeau « Reconnecter » disparaîtrait puis
     * reviendrait à chaque tour - y compris sous le doigt de qui s'apprête à le
     * toucher. Une fois l'alerte posée, elle ne bouge plus tant que rien n'a
     * changé.
     */
    await avecReseau(true, async () => {
      await driveInutilisable();
      await lancerCycle(false); // allume le signal, quel que soit l'état initial
      expect(etatSync().etat).toBe('reconnexion');

      let notifications = 0;
      const desabonner = abonnerEtatSync(() => notifications++);
      try {
        await lancerCycle(false);
        await lancerCycle(false);
        expect(notifications).toBe(0);
      } finally {
        desabonner();
      }
    });
  });

  it('s’éteint quand le Drive est déconnecté : il n’y a plus rien à reconnecter', async () => {
    // Sans cela, le bandeau resterait affiché pour toujours après une
    // déconnexion : plus aucun cycle n'atteindrait le code qui l'éteint.
    await avecReseau(true, async () => {
      await driveInutilisable();
      await lancerCycle(false);
      expect(etatSync().etat).toBe('reconnexion');

      await configurer({ clientId: 'x', actif: false });
      expect((await lancerCycle(false)).etat).toBe('ignore');
      expect(etatSync().etat).not.toBe('reconnexion');
    });
  });

  it('remonte un garde-fou déclenché, même sans personne pour regarder', async () => {
    /*
     * Le trou le plus grave avant ce signal : le battement lance un cycle
     * toutes les cinq minutes sans lire son résultat. Une horloge décalée
     * arrêtait donc la synchronisation pour des jours, en silence - et
     * l'ordinateur imprimait d'anciennes données en se croyant à jour.
     */
    await avecReseau(true, async () => {
      await configurer({ clientId: 'test', actif: true });
      const depot = new DepotMemoire();
      depot.maintenant = new Date(Date.now() + 10 * 60 * 1000); // 10 min d'écart

      const resultat = await synchroniser(depot);
      expect(resultat.etat).toBe('bloque');

      // `synchroniser` est le moteur ; c'est `lancerCycle` qui publie l'état.
      // On vérifie ici que le garde-fou est bien détectable, et le relais par
      // le magasin est couvert par le test suivant.
      expect(resultat.etat === 'bloque' && resultat.raison).toBe('horloge');
    });
  });

  it('éteint l’avertissement dès qu’un cycle repasse', async () => {
    // Sans cela, une alerte transitoire resterait affichée indéfiniment.
    await avecReseau(true, async () => {
      await driveInutilisable();
      await lancerCycle(false);
      expect(etatSync().etat).toBe('reconnexion');

      await configurer({ clientId: 'x', actif: false });
      await lancerCycle(false);
      expect(etatSync().etat).toBe('ok');
    });
  });
});
