// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type ConfigSauvegardeAuto } from './db';
import { pousserSiActive } from './autosave';
import { DossierMemoire } from '@/test/dossierMemoire';
import { unBien, viderBase } from '@/test/utils';

/**
 * Régime du dossier local : miroir à chaque passage, archive quand elle est due.
 *
 * Le dossier ne recevait que des archives ZIP complètes, une par salve de
 * modifications - trente secondes après la dernière écriture - dont on gardait
 * dix copies. Sur une base photographiée, chaque photo ajoutée relançait la
 * recompression de toute la photothèque. Ces deux tests tiennent le nouveau
 * partage : ce qui est incrémental le reste, et l'archive garde son plancher.
 */

const zips = (d: DossierMemoire) => d.noms().filter((n) => n.endsWith('.zip'));

/**
 * Dossier configuré, avec sa ligne de configuration **hors** IndexedDB.
 *
 * Un vrai `FileSystemDirectoryHandle` est structured-cloneable et se range donc
 * en base ; notre double, lui, porte ses méthodes sur un prototype, que le
 * clonage perd. On garde la ligne en mémoire, ce qui préserve ce qui compte
 * ici : les repères de passage (`dernierMiroir`, `derniereArchive`) sont bien
 * relus d'un appel à l'autre, sans quoi tout repartirait de zéro à chaque fois.
 */
async function dossierConfigure() {
  const dossier = new DossierMemoire();
  let ligne: ConfigSauvegardeAuto | undefined = {
    id: 'dossier',
    handle: dossier.handle,
    nomDossier: 'Sauvegardes Bailiz',
  };
  // `as never` : Dexie renvoie ses propres promesses (`PromiseExtended`), que
  // le double n'a pas à imiter - seule la valeur rendue compte ici.
  vi.spyOn(db.sauvegardeAuto, 'get').mockImplementation((async () => ligne) as never);
  vi.spyOn(db.sauvegardeAuto, 'put').mockImplementation((async (c: ConfigSauvegardeAuto) => {
    ligne = c;
    return 'dossier';
  }) as never);
  return dossier;
}

beforeEach(async () => {
  await viderBase();
  vi.restoreAllMocks();
  // `autosaveSupportee()` teste la présence de l'API sur `window`.
  vi.stubGlobal('showDirectoryPicker', () => Promise.reject(new Error('non utilisé')));
});

describe('copie vers le dossier local', () => {
  it('dépose le miroir et une première archive', async () => {
    await db.biens.add(unBien());
    const dossier = await dossierConfigure();

    expect(await pousserSiActive(true)).toBe('ok');

    expect(dossier.noms('donnees')).toContain('biens__bien-1.json');
    expect(zips(dossier)).toHaveLength(1);
  });

  it('suit les modifications sans réarchiver à chaque fois', async () => {
    await db.biens.add(unBien());
    const dossier = await dossierConfigure();
    await pousserSiActive(true);

    await db.biens.add(unBien({ id: 'bien-2', nom: 'Studio Part-Dieu' }));
    await pousserSiActive(true);

    // Le miroir a suivi…
    expect(dossier.noms('donnees')).toContain('biens__bien-2.json');
    // …et l'archive attend son plancher : une journée entre deux signatures,
    // une semaine sinon. C'est tout l'objet du changement.
    expect(zips(dossier)).toHaveLength(1);
  });

  it('ne copie rien quand la base est vide', async () => {
    /*
     * Garde-fou existant, à ne pas perdre : un appareil réinstallé ne doit pas
     * écraser le dossier de l'utilisateur - miroir compris - avec du vide.
     */
    const dossier = await dossierConfigure();
    await pousserSiActive(true);

    /*
     * C'est le dossier qu'on vérifie, pas le code de retour : `base_vide`
     * n'est pas connu d'`agregerResultats`, qui le ramène à `inactif` - le
     * message « aucune donnée sur cet appareil » n'atteint donc jamais
     * l'utilisateur. Défaut réel, antérieur au miroir, et traité à part.
     */
    expect(dossier.noms('donnees')).toEqual([]);
    expect(zips(dossier)).toHaveLength(0);
  });
});
