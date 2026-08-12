import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getParametres } from '@/lib/db';
import { synchroniser } from './cycle';
import { DepotMemoire } from './depotMemoire';
import { journaliser } from './journal';

/**
 * Qui gagne quand la même fiche a été modifiée des deux côtés.
 *
 * La règle tient en une phrase : **c'est la modification la plus récente à la
 * montre qui l'emporte, pas la dernière synchronisée.** Un appareil resté
 * hors ligne n'écrase donc rien en se reconnectant - mais il peut, à l'inverse,
 * voir sa propre saisie remplacée. Ces tests figent ce comportement, parce
 * qu'il n'est pas devinable et qu'une régression y serait silencieuse.
 */

async function reinitialiser() {
  await Promise.all([
    db.baux.clear(),
    db.locataires.clear(),
    db.changements.clear(),
    db.syncEtat.clear(),
    db.parametres.clear(),
  ]);
  const p = await getParametres();
  await db.parametres.put({ ...p, sauvegardeGDrive: { clientId: 'test', actif: true } });
}

async function capturer() {
  return {
    baux: await db.baux.toArray(),
    locataires: await db.locataires.toArray(),
    changements: await db.changements.toArray(),
    syncEtat: await db.syncEtat.toArray(),
    parametres: await db.parametres.get('singleton'),
  };
}

async function restaurer(e: Awaited<ReturnType<typeof capturer>>) {
  await reinitialiser();
  await db.baux.bulkPut(e.baux);
  await db.locataires.bulkPut(e.locataires);
  await db.changements.bulkPut(e.changements);
  await db.syncEtat.bulkPut(e.syncEtat);
  if (e.parametres) await db.parametres.put(e.parametres);
}

/** Un bail, dont on fait varier le loyer, la note et la date de modification. */
const bail = (m: Record<string, unknown> = {}) =>
  ({
    id: 'bail-1',
    reference: 'BAIL-2026-0001',
    loyer: 500,
    note: '',
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    ...m,
  }) as never;

const lireBail = async () =>
  (await db.baux.get('bail-1')) as unknown as { loyer: number; note: string } | undefined;

/** Modifie le bail localement et le journalise, comme le ferait l'interface. */
async function modifier(champs: Record<string, unknown>) {
  await db.baux.put(bail(champs));
  await journaliser('baux', 'bail-1', 'maj');
}

describe('tablette hors ligne, puis ordinateur en ligne', () => {
  beforeEach(reinitialiser);

  /** Les deux appareils partent du même bail déjà synchronisé. */
  async function partirDuMemeBail(depot: DepotMemoire) {
    await modifier({});
    await synchroniser(depot);
    return capturer();
  }

  it('la tablette n’écrase pas l’ordinateur : c’est la saisie la plus récente qui gagne', async () => {
    /*
     * La crainte naturelle - « le dernier connecté écrase tout » - n'est pas
     * fondée. Le cycle commence par recevoir : la tablette découvre une version
     * postérieure à la sienne et l'adopte, au lieu de la recouvrir.
     */
    const depot = new DepotMemoire();
    const depart = await partirDuMemeBail(depot);

    // 10 h - la tablette modifie hors ligne : rien ne part.
    await restaurer(depart);
    await modifier({ loyer: 999, note: 'tablette', updatedAt: '2026-08-09T10:00:00.000Z' });
    expect(await db.changements.count()).toBe(1);
    const tablette = await capturer();

    // 14 h - l'ordinateur modifie et pousse.
    await restaurer(depart);
    await modifier({ loyer: 777, note: 'ordinateur', updatedAt: '2026-08-09T14:00:00.000Z' });
    depot.avancer(60);
    await synchroniser(depot);

    // 16 h - la tablette retrouve le réseau.
    await restaurer(tablette);
    depot.avancer(60);
    await synchroniser(depot);

    expect((await lireBail())?.note).toBe('ordinateur');
    const surLeDrive = JSON.parse((await depot.contenuParNom('donnees', 'baux__bail-1.json'))!);
    expect(surLeDrive.donnees.note).toBe('ordinateur');
  });

  it('mais la saisie hors ligne gagne si elle est la plus récente', async () => {
    // Symétrique du précédent : l'ordre de connexion ne joue aucun rôle.
    const depot = new DepotMemoire();
    const depart = await partirDuMemeBail(depot);

    // 10 h - l'ordinateur modifie et pousse.
    await restaurer(depart);
    await modifier({ note: 'ordinateur', updatedAt: '2026-08-09T10:00:00.000Z' });
    depot.avancer(60);
    await synchroniser(depot);

    // 14 h - la tablette a modifié plus tard, hors ligne, et se reconnecte après.
    await restaurer(depart);
    await modifier({ note: 'tablette', updatedAt: '2026-08-09T14:00:00.000Z' });
    depot.avancer(60);
    await synchroniser(depot);

    expect((await lireBail())?.note).toBe('tablette');
    const surLeDrive = JSON.parse((await depot.contenuParNom('donnees', 'baux__bail-1.json'))!);
    expect(surLeDrive.donnees.note).toBe('tablette');
  });

  it('remplace la fiche entière : deux champs différents ne fusionnent pas', async () => {
    /*
     * Point le plus contre-intuitif, et le plus important à connaître : modifier
     * le loyer sur la tablette et la note sur l'ordinateur ne conserve pas les
     * deux. La fiche perdante est remplacée d'un bloc - le loyer revient à sa
     * valeur d'origine. C'est assumé : un état des lieux moitié d'un appareil
     * et moitié de l'autre n'aurait aucune valeur juridique.
     */
    const depot = new DepotMemoire();
    const depart = await partirDuMemeBail(depot);

    await restaurer(depart);
    await modifier({ loyer: 999, updatedAt: '2026-08-09T10:00:00.000Z' });
    const tablette = await capturer();

    await restaurer(depart);
    await modifier({ note: 'ordinateur', updatedAt: '2026-08-09T14:00:00.000Z' });
    depot.avancer(60);
    await synchroniser(depot);

    await restaurer(tablette);
    depot.avancer(60);
    await synchroniser(depot);

    const fusionne = await lireBail();
    expect(fusionne?.note).toBe('ordinateur');
    expect(fusionne?.loyer).toBe(500); // et non 999 : la modification hors ligne est perdue
  });

  it('ne peut jamais écraser une fiche créée hors ligne', async () => {
    // Une création porte un identifiant que l'autre appareil ignore : il n'y a
    // pas de version concurrente, donc rien à arbitrer. C'est le cas courant du
    // terrain - un état des lieux saisi dans l'appartement.
    const depot = new DepotMemoire();
    await db.locataires.put({
      id: 'loc-neuf',
      nom: 'Créé sur la tablette',
      createdAt: '2026-08-09T10:00:00.000Z',
      updatedAt: '2026-08-09T10:00:00.000Z',
    } as never);
    await journaliser('locataires', 'loc-neuf', 'maj');
    const tablette = await capturer();

    // Pendant ce temps, l'ordinateur travaille sur autre chose et pousse.
    await reinitialiser();
    await modifier({});
    await synchroniser(depot);

    await restaurer(tablette);
    depot.avancer(60);
    await synchroniser(depot);

    expect(await db.locataires.get('loc-neuf')).toBeTruthy();
    expect(await db.baux.get('bail-1')).toBeTruthy();
  });
});

describe('signalement des saisies remplacées', () => {
  beforeEach(reinitialiser);

  async function partirDuMemeBail(depot: DepotMemoire) {
    await modifier({});
    await synchroniser(depot);
    return capturer();
  }

  it('nomme la fiche dont la saisie locale vient d’être abandonnée', async () => {
    /*
     * L'arbitrage est le bon, mais le taire laisserait croire que rien n'a été
     * perdu - et sur un bail, ce qui a disparu peut être un loyer.
     */
    const depot = new DepotMemoire();
    const depart = await partirDuMemeBail(depot);

    await restaurer(depart);
    await modifier({ loyer: 999, updatedAt: '2026-08-09T10:00:00.000Z' });
    const tablette = await capturer();

    await restaurer(depart);
    await modifier({ note: 'ordinateur', updatedAt: '2026-08-09T14:00:00.000Z' });
    depot.avancer(60);
    await synchroniser(depot);

    await restaurer(tablette);
    depot.avancer(60);
    const r = await synchroniser(depot);

    expect(r.etat).toBe('ok');
    expect(r.etat === 'ok' && r.saisiesRemplacees).toEqual([
      {
        table: 'baux',
        cle: 'bail-1',
        reference: 'BAIL-2026-0001',
        saisieLe: '2026-08-09T10:00:00.000Z',
        supprimee: undefined,
      },
    ]);
  });

  it('ne signale rien quand la fiche locale n’avait pas été modifiée', async () => {
    // Recevoir une fiche qu'on n'avait pas touchée est le cas normal : il ne
    // faut surtout pas transformer chaque réception en avertissement.
    const depot = new DepotMemoire();
    const depart = await partirDuMemeBail(depot);

    await restaurer(depart);
    await modifier({ note: 'ordinateur', updatedAt: '2026-08-09T14:00:00.000Z' });
    depot.avancer(60);
    await synchroniser(depot);

    await restaurer(depart);
    depot.avancer(60);
    const r = await synchroniser(depot);

    expect(r.etat === 'ok' && r.recus).toBe(1);
    expect(r.etat === 'ok' && r.saisiesRemplacees).toEqual([]);
  });

  it('signale aussi une saisie effacée par une suppression reçue', async () => {
    // L'autre appareil a supprimé la fiche pendant qu'on la modifiait ici.
    const depot = new DepotMemoire();
    const depart = await partirDuMemeBail(depot);

    await restaurer(depart);
    await modifier({ note: 'saisi ici', updatedAt: '2026-08-09T10:00:00.000Z' });
    const tablette = await capturer();

    await restaurer(depart);
    await db.baux.delete('bail-1');
    await journaliser('baux', 'bail-1', 'suppr');
    depot.avancer(60);
    await synchroniser(depot);

    await restaurer(tablette);
    depot.avancer(60);
    const r = await synchroniser(depot);

    const signalees = r.etat === 'ok' ? r.saisiesRemplacees : [];
    expect(signalees.map((s) => ({ cle: s.cle, supprimee: s.supprimee }))).toEqual([
      { cle: 'bail-1', supprimee: true },
    ]);
  });
});
