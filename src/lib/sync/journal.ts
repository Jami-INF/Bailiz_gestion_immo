import Dexie from 'dexie';
import { db, type Changement } from '@/lib/db';
import { nowISO } from '@/lib/ids';
import { dateModification } from './protocole';

/**
 * Journal des modifications locales : ce qui reste à envoyer sur le Drive.
 *
 * Il tient deux rôles à la fois, et c'est voulu : il dit **ce qui a changé**
 * depuis la dernière synchronisation, et il sert de **file d'attente
 * hors-ligne**. Une entrée n'est retirée qu'après confirmation de l'envoi -
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
 * nouveau pull… - la boucle classique de tout mécanisme de réplication.
 */
let applicationDistante = false;

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

/**
 * Écriture directe dans le journal, **attendue** par l'appelant.
 *
 * C'est la couture de test du module : la production ne l'emploie pas, elle
 * passe par `noterChangement` (branché sur les hooks Dexie dans `autosave.ts`),
 * dont l'écriture est différée. Les tests de synchronisation ont besoin d'une
 * forme qu'on peut `await` pour poser un état de départ déterministe ; le
 * chemin réel, lui, est couvert par `journal.test.ts`, bloc « journalisation
 * depuis un hook Dexie ».
 */
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
let vidangeProgrammee = false;

export function noterChangement(table: string, cle: string, type: Changement['type']): void {
  if (applicationDistante) return;
  enAttenteDeJournalisation.push({ table, cle, type, horodatage: nowISO() });
  if (vidangeProgrammee) return;
  vidangeProgrammee = true;
  /*
   * `setTimeout` et non `queueMicrotask` : Dexie propage la transaction en
   * cours aux microtâches. Écrire dans `changements` depuis un microtask lancé
   * par un hook échouerait donc - cette table n'appartient pas à la transaction
   * de la table modifiée - et l'échec passerait inaperçu. Le minuteur, lui,
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
  vidangeProgrammee = false;
  const aEcrire = enAttenteDeJournalisation;
  enAttenteDeJournalisation = [];
  if (aEcrire.length === 0) return;
  /*
   * `ignoreTransaction` détache explicitement de la transaction en cours. Sans
   * elle, un vidage déclenché depuis un hook écrirait dans une transaction qui
   * n'inclut pas `changements`, et échouerait - en silence. Ne pas s'en
   * remettre au seul minuteur : la propagation de zone dépend de
   * l'environnement, et les tests Node ne la reproduisent pas.
   */
  await Dexie.ignoreTransaction(() => db.changements.bulkAdd(aEcrire));
}

/**
 * Une opération compactée, et la liste des entrées de journal qu'elle résume.
 *
 * `idsResumes` est ce qui permet de vider réellement le journal : envoyer une
 * fiche modifiée dix fois doit retirer les dix entrées, pas seulement la
 * dernière.
 */
export interface ChangementCompacte extends Changement {
  idsResumes: number[];
}

/**
 * Compacte le journal : une seule opération par enregistrement, la dernière.
 * Dix modifications d'un même EDL pendant une visite ne doivent produire qu'un
 * seul envoi, et une suppression annule les modifications qui la précèdent.
 *
 * Fonction pure : c'est elle qui détermine ce qui part sur le réseau.
 */
export function compacter(changements: Changement[]): ChangementCompacte[] {
  const parCle = new Map<string, ChangementCompacte>();
  for (const c of changements) {
    const cle = `${c.table}__${c.cle}`;
    const existant = parCle.get(cle);
    const idsResumes = [...(existant?.idsResumes ?? [])];
    if (c.id !== undefined) idsResumes.push(c.id);
    // Le journal est lu dans l'ordre d'insertion : la dernière opération vue
    // est la plus récente, elle remplace la précédente. Les entrées absorbées
    // restent recensées - sans quoi elles resteraient dans le journal à jamais.
    const retenu = !existant || c.horodatage >= existant.horodatage ? c : existant;
    parCle.set(cle, { ...retenu, idsResumes });
  }
  return [...parCle.values()];
}

/** Modifications en attente d'envoi, compactées. */
export async function changementsEnAttente(): Promise<ChangementCompacte[]> {
  const brut = await db.changements.orderBy('id').toArray();
  return compacter(brut);
}

/**
 * Retire du journal les entrées effectivement envoyées - y compris celles que
 * le compactage a absorbées.
 *
 * On supprime par identifiant, et jamais par clé d'enregistrement : les
 * identifiants ont été relevés au moment du compactage, donc une modification
 * survenue *pendant* l'envoi n'en fait pas partie et reste en attente pour le
 * cycle suivant.
 */
export async function confirmerEnvoi(
  changements: (Changement | ChangementCompacte)[],
): Promise<void> {
  const ids = changements.flatMap((c) =>
    'idsResumes' in c ? c.idsResumes : c.id !== undefined ? [c.id] : [],
  );
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
 *   déjà des biens, des baux et des états des lieux - sans rattrapage, rien ne
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
