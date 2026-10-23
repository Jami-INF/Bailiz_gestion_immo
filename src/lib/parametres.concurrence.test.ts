import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, ecrireParametres, getParametres, lireParametres } from './db';
import { activerGDrive, desactiverGDrive } from './gdrive';

/*
 * Concurrence sur le singleton `parametres`, côté bibliothèque.
 *
 * Les panneaux de réglages ont leurs propres tests d'écran ; ce qui est vérifié
 * ici, c'est le reste des écrivains - la synchronisation Drive, l'instantané sur
 * minuterie, l'accueil, les deux formulaires rapides - qui écrivaient tous la
 * **ligne entière** après une lecture faite hors transaction. Le risque n'y est
 * pas théorique : l'instantané et le cycle de synchronisation partent d'une
 * minuterie, donc à un moment que l'utilisateur ne choisit pas, et pendant qu'il
 * remplit ses réglages.
 */

beforeEach(async () => {
  await db.parametres.clear();
});

describe('écritures concurrentes sur les paramètres', () => {
  it('ne laisse pas un écrivain effacer le champ d’un autre', async () => {
    await ecrireParametres(() => ({
      sauvegardeGDrive: { clientId: 'client-origine', actif: false },
    }));

    /*
     * Deux écrivains lancés ensemble, chacun sur son champ. Sans transaction,
     * les deux lisent la même ligne avant que l'un des deux n'écrive, et le
     * dernier `put` réécrit le champ de l'autre tel qu'il l'avait lu : un des
     * deux effets disparaît, sans erreur ni message.
     */
    await Promise.all([
      activerGDrive('client-neuf'),
      ecrireParametres(() => ({ disclaimerAccepte: true })),
    ]);

    const apres = await lireParametres();
    expect(apres.sauvegardeGDrive?.clientId).toBe('client-neuf');
    expect(apres.sauvegardeGDrive?.actif).toBe(true);
    expect(apres.disclaimerAccepte).toBe(true);
  });

  it('sérialise aussi une rafale d’écritures sur le même champ', async () => {
    await ecrireParametres(() => ({ grilleVetuste: [] }));

    // Chacune ajoute un poste à la liste relue : les dix doivent s'empiler.
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        ecrireParametres((actuel) => ({
          grilleVetuste: [
            ...actuel.grilleVetuste,
            { poste: `Poste ${i}`, dureeVieAnnees: 10, franchiseAnnees: 2, abattementAnnuelPct: 10 },
          ],
        })),
      ),
    );

    expect((await lireParametres()).grilleVetuste).toHaveLength(10);
  });
});

describe('écriture inutile', () => {
  it('ne réécrit pas la ligne quand le modificateur renvoie `null`', async () => {
    await getParametres();

    /*
     * Compté sur le hook Dexie plutôt que comparé champ par champ : réécrire la
     * ligne à l'identique ne changerait rien en base, mais réveillerait tous les
     * `liveQuery` qui l'observent - donc tous les écrans ouverts.
     */
    let ecritures = 0;
    const compter = () => {
      ecritures += 1;
    };
    db.parametres.hook('updating', compter);
    try {
      // Aucune destination Drive configurée : rien à désactiver, rien à écrire.
      await desactiverGDrive();
      expect(ecritures).toBe(0);

      await ecrireParametres(() => ({ disclaimerAccepte: true }));
      expect(ecritures).toBe(1);
    } finally {
      db.parametres.hook('updating').unsubscribe(compter);
    }
  });

  it('renvoie la ligne courante inchangée quand il n’écrit pas', async () => {
    const attendu = await ecrireParametres(() => ({ disclaimerAccepte: true }));
    expect(await ecrireParametres(() => null)).toEqual(attendu);
  });
});
