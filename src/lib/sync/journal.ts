import Dexie from 'dexie';
import { db, type Changement } from '@/lib/db';
import { nowISO } from '@/lib/ids';
import { dateModification } from './protocole';

/**
 * Journal des modifications locales : ce qui reste à envoyer sur le Drive.
 *
 * Il tient deux rôles à la fois, et c'est voulu : il dit **ce qui a changé**
 * depuis la dernière synchronisation, et il sert de **file d'attente
 * hors-ligne**. Une entrée n'est retirée qu'après confirmation de l'envoi —
 * un état des lieux saisi en cave, l'iPad mis en veille, l'application fermée :
 * rien n'est perdu, tout repart au cycle suivant.
 */

/** Tables métier suivies. `parametres` a ses propres règles (protocole §4.6). */
export const TABLES_SYNCHRONISEES = [
  'biens',
  'locataires',
  'baux',
  'edls',
  'inventaires',
  'photos',
  'documents',
] as const;

export type TableSynchronisee = (typeof TABLES_SYNCHRONISEES)[number];

/**
 * Neutralise le journal pendant que la synchronisation écrit les données
 * reçues du Drive. Sans cela, appliquer un pull produirait des entrées de
 * journal, qui seraient repoussées au cycle suivant, qui produiraient un
 * nouveau pull… — la boucle classique de tout mécanisme de réplication.
 */
let applicationDistante = false;

export function estApplicationDistante(): boolean {
  return applicationDistante;
}

/** Exécute `action` sans que ses écritures alimentent le journal. */
export async function sansJournaliser<T>(action: () => Promise<T>): Promise<T> {
  const precedent = applicationDistante;
  applicationDistante = true;
  try {
    return await action();
  } finally {
    applicationDistante = precedent;
  }
}

export async function journaliser(
  table: string,
  cle: string,
  type: Changement['type'],
): Promise<void> {
  if (applicationDistante) return;
  await db.changements.add({ table, cle, type, horodatage: nowISO() });
}

/**
 * File d'attente des écritures observées par les hooks Dexie. Un hook s'exécute
 * **à l'intérieur** de la transaction de la table modifiée : y écrire dans
 * `changements` échouerait, cette table n'appartenant pas à la transaction. On
 * accumule donc en mémoire, et on écrit juste après.
 */
let enAttenteDeJournalisation: Changement[] = [];
let videngeProgrammee = false;

export function noterChangement(table: string, cle: string, type: Changement['type']): void {
  if (applicationDistante) return;
  enAttenteDeJournalisation.push({ table, cle, type, horodatage: nowISO() });
  if (videngeProgrammee) return;
  videngeProgrammee = true;
  /*
   * `setTimeout` et non `queueMicrotask` : Dexie propage la transaction en
   * cours aux microtâches. Écrire dans `changements` depuis un microtask lancé
   * par un hook échouerait donc — cette table n'appartient pas à la transaction
   * de la table modifiée — et l'échec passerait inaperçu. Le minuteur, lui,
   * sort de la zone transactionnelle.
   */
  setTimeout(() => {
    viderFileJournalisation().catch((e) => {
      console.error('Journalisation des modifications impossible :', e);
    });
  }, 0);
}

/**
 * Écrit dans le journal les changements accumulés. Une perte à ce stade (onglet
 * fermé dans l'intervalle) n'est pas définitive : le rattrapage du cycle
 * (`rattraperChangements`) retrouve toute création ou modification oubliée.
 */
export async function viderFileJournalisation(): Promise<void> {
  videngeProgrammee = false;
  const aEcrire = enAttenteDeJournalisation;
  enAttenteDeJournalisation = [];
  if (aEcrire.length === 0) return;
  /*
   * `ignoreTransaction` détache explicitement de la transaction en cours. Sans
   * elle, un vidage déclenché depuis un hook écrirait dans une transaction qui
   * n'inclut pas `changements`, et échouerait — en silence. Ne pas s'en
   * remettre au seul minuteur : la propagation de zone dépend de
   * l'environnement, et les tests Node ne la reproduisent pas.
   */
  await Dexie.ignoreTransaction(() => db.changements.bulkAdd(aEcrire));
}

/**
 * Compacte le journal : une seule opération par enregistrement, la dernière.
 * Dix modifications d'un même EDL pendant une visite ne doivent produire qu'un
 * seul envoi, et une suppression annule les modifications qui la précèdent.
 *
 * Fonction pure : c'est elle qui détermine ce qui part sur le réseau.
 */
export function compacter(changements: Changement[]): Changement[] {
  const parCle = new Map<string, Changement>();
  for (const c of changements) {
    const cle = `${c.table}__${c.cle}`;
    const existant = parCle.get(cle);
    // Le journal est lu dans l'ordre d'insertion : la dernière opération vue
    // est la plus récente, elle remplace la précédente.
    if (!existant || c.horodatage >= existant.horodatage) parCle.set(cle, c);
  }
  return [...parCle.values()];
}

/** Modifications en attente d'envoi, compactées. */
export async function changementsEnAttente(): Promise<Changement[]> {
  const brut = await db.changements.orderBy('id').toArray();
  return compacter(brut);
}

/**
 * Retire du journal les entrées effectivement envoyées. On supprime par
 * identifiant, et non par clé d'enregistrement : une modification survenue
 * *pendant* l'envoi doit rester en attente pour le cycle suivant.
 */
export async function confirmerEnvoi(changements: Changement[]): Promise<void> {
  const ids = changements.map((c) => c.id).filter((id): id is number => id !== undefined);
  if (ids.length) await db.changements.bulkDelete(ids);
}

/** Nombre de modifications en attente (affiché dans les Paramètres). */
export function compterEnAttente(): Promise<number> {
  return db.changements.count();
}

/** Tables dont le contenu est immuable : seule leur existence compte. */
const TABLES_BLOB = ['photos', 'documents'];

/**
 * Rattrapage : journalise ce qui aurait dû l'être et ne l'a pas été.
 *
 * Deux situations le rendent indispensable :
 * - **première activation** de la synchronisation, alors que la base contient
 *   déjà des biens, des baux et des états des lieux — sans rattrapage, rien ne
 *   partirait tant qu'on n'y toucherait pas ;
 * - écriture perdue entre le hook et le journal (onglet fermé dans l'intervalle).
 *
 * Les suppressions, elles, ne peuvent pas être rattrapées : un enregistrement
 * effacé ne laisse aucune trace à comparer. C'est pourquoi les hooks restent
 * nécessaires malgré ce filet.
 */
export async function rattraperChangements(): Promise<number> {
  const dejaEnAttente = new Set(
    (await db.changements.toArray()).map((c) => `${c.table}__${c.cle}`),
  );
  const etats = new Map(
    (await db.syncEtat.toArray()).map((e) => [`${e.table}__${e.cle}`, e]),
  );
  const manquants: Changement[] = [];

  for (const table of TABLES_SYNCHRONISEES) {
    const acces = db as unknown as Record<
      string,
      {
        toArray(): Promise<Record<string, unknown>[]>;
        toCollection(): { primaryKeys(): Promise<string[]> };
      }
    >;
    if (TABLES_BLOB.includes(table)) {
      // Les blobs ne sont jamais modifiés : lire les clés suffit, et évite de
      // charger toutes les photos en mémoire pour rien.
      for (const cle of await acces[table].toCollection().primaryKeys()) {
        const identifiant = `${table}__${cle}`;
        if (dejaEnAttente.has(identifiant) || etats.has(identifiant)) continue;
        manquants.push({ table, cle, type: 'maj', horodatage: nowISO() });
      }
      continue;
    }
    for (const enregistrement of await acces[table].toArray()) {
      const cle = String(enregistrement.id);
      const identifiant = `${table}__${cle}`;
      if (dejaEnAttente.has(identifiant)) continue;
      const etat = etats.get(identifiant);
      const modifieLe = dateModification(enregistrement, '');
      if (etat && modifieLe && etat.modifieLe === modifieLe) continue;
      manquants.push({ table, cle, type: 'maj', horodatage: modifieLe || nowISO() });
    }
  }

  if (manquants.length) await db.changements.bulkAdd(manquants);
  return manquants.length;
}
