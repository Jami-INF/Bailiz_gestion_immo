import { db, lireParametres } from './db';
import { identifiantAppareil } from './appareil';
import { nowISO } from './ids';
import { TABLES_SYNCHRONISEES } from './sync/journal';
import {
  dateModification,
  lireNomFichier,
  nomFichier,
  type EnveloppeEnregistrement,
} from './sync/protocole';

/**
 * Miroir du dossier local : les fiches à plat, écrites en incrémental.
 *
 * **Pourquoi.** Le dossier ne recevait que des archives ZIP complètes - et une
 * par salve de modifications, trente secondes après la dernière écriture. En
 * pleine saisie d'un état des lieux, chaque photo ajoutée relançait donc la
 * recompression de *toute* la base, photos comprises, dont on gardait dix
 * copies. Le même calcul avait déjà été fait pour le Drive, qui a abandonné ce
 * régime (cf. `INSTANTANES_CONSERVES`) ; le dossier local y était resté.
 *
 * **Ce que ce module n'est pas.** Un miroir s'écrit, ne se lit pas et n'arbitre
 * rien : c'est une copie, jamais une source. En faire un dépôt de
 * synchronisation à part entière - comme le Drive - demanderait une référence
 * temporelle commune aux appareils, qu'un système de fichiers n'a pas
 * (`heureServeur`), et l'API File System Access n'existe de toute façon pas sur
 * iPad. La convergence entre appareils reste l'affaire de `lib/sync/`.
 *
 * L'arborescence est **celle du Drive** (`donnees/`, `photos/`, `documents/`,
 * mêmes noms de fichiers, mêmes enveloppes) : une seule convention à connaître,
 * et une restauration pourra un jour relire l'un comme l'autre.
 */

/** Tables dont l'enregistrement porte un blob, et l'extension du fichier produit. */
const BLOBS: Record<string, { champ: string; extension: string }> = {
  photos: { champ: 'blob', extension: 'jpg' },
  documents: { champ: 'blob', extension: 'pdf' },
};

const ESPACES = ['donnees', 'photos', 'documents'] as const;
type Espace = (typeof ESPACES)[number];

/** Nom du fichier de réglages dans le miroir (hors tables métier). */
const NOM_PARAMETRES = 'parametres__singleton.json';

export interface ResumeMiroir {
  ecrits: number;
  supprimes: number;
  /** Instant à mémoriser comme point de départ du prochain passage. */
  jusqua: string;
}

/** Accès dynamique à une table Dexie, comme dans `lib/sync/cycle.ts`. */
function table(nom: string) {
  return (db as unknown as Record<string, {
    get(cle: string): Promise<unknown>;
    toArray(): Promise<Record<string, unknown>[]>;
    toCollection(): { primaryKeys(): Promise<string[]> };
  }>)[nom];
}

async function nomsPresents(dossier: FileSystemDirectoryHandle): Promise<Set<string>> {
  const noms = new Set<string>();
  for await (const entree of dossier.values()) {
    if (entree.kind === 'file') noms.add(entree.name);
  }
  return noms;
}

async function ecrire(
  dossier: FileSystemDirectoryHandle,
  nom: string,
  contenu: Blob | string,
): Promise<void> {
  const fichier = await dossier.getFileHandle(nom, { create: true });
  const flux = await fichier.createWritable();
  await flux.write(contenu);
  await flux.close();
}

function enveloppe(
  nomTable: string,
  cle: string,
  modifieLe: string,
  appareil: string,
  donnees: unknown,
): string {
  const contenu: EnveloppeEnregistrement = { table: nomTable, cle, modifieLe, appareil, donnees };
  return JSON.stringify(contenu);
}

/**
 * Met le dossier à jour et renvoie ce qui a bougé.
 *
 * `depuis` est l'instant du dernier passage réussi : les fiches modifiées avant
 * lui, et déjà présentes dans le miroir, ne sont pas réécrites. Le repère de
 * sortie (`jusqua`) est relevé **avant** le travail, jamais après : une fiche
 * modifiée pendant l'écriture doit repartir au passage suivant plutôt que
 * d'être considérée comme copiée.
 */
export async function mettreAJourMiroir(
  racine: FileSystemDirectoryHandle,
  depuis?: string,
): Promise<ResumeMiroir> {
  const jusqua = nowISO();
  const appareil = identifiantAppareil();

  const dossiers = {} as Record<Espace, FileSystemDirectoryHandle>;
  const presents = {} as Record<Espace, Set<string>>;
  for (const espace of ESPACES) {
    dossiers[espace] = await racine.getDirectoryHandle(espace, { create: true });
    presents[espace] = await nomsPresents(dossiers[espace]);
  }

  let ecrits = 0;
  let supprimes = 0;
  const clesVues: Record<string, Set<string>> = {};

  for (const nomTable of TABLES_SYNCHRONISEES) {
    const blob = BLOBS[nomTable];
    const cles = new Set<string>();
    clesVues[nomTable] = cles;

    if (blob) {
      /*
       * Photos et documents sont **immuables** : une fois copiés, ils n'ont
       * aucune raison d'être relus. On ne charge donc l'enregistrement - et
       * avec lui plusieurs centaines de kilooctets de blob - que si le miroir
       * ne l'a pas déjà. C'est tout le gain de l'incrémental : une salve de
       * saisie ne relit plus la photothèque entière.
       */
      const espace = nomTable as Espace;
      for (const cle of await table(nomTable).toCollection().primaryKeys()) {
        cles.add(cle);
        const nomJson = nomFichier(nomTable, cle);
        const nomBlob = `${cle}.${blob.extension}`;
        if (presents.donnees.has(nomJson) && presents[espace].has(nomBlob)) continue;

        const enr = (await table(nomTable).get(cle)) as Record<string, unknown> | undefined;
        if (!enr) continue;
        const { [blob.champ]: contenu, ...meta } = enr;
        await ecrire(
          dossiers.donnees,
          nomJson,
          enveloppe(nomTable, cle, dateModification(enr, jusqua), appareil, meta),
        );
        if (contenu instanceof Blob) await ecrire(dossiers[espace], nomBlob, contenu);
        ecrits++;
      }
      continue;
    }

    // Tables sans blob : les lire entières coûte peu, et leur date de
    // modification dit seule ce qui a changé.
    for (const enr of await table(nomTable).toArray()) {
      const cle = String(enr.id);
      cles.add(cle);
      const nom = nomFichier(nomTable, cle);
      const modifieLe = dateModification(enr, jusqua);
      /*
       * Comparaison **stricte** : une fiche modifiée dans la milliseconde même
       * où le repère a été relevé doit repartir. `<=` l'aurait écartée pour
       * toujours - une modification perdue en silence, alors que la recopier
       * pour rien ne coûte qu'un petit fichier JSON.
       */
      if (presents.donnees.has(nom) && depuis && modifieLe < depuis) continue;
      await ecrire(dossiers.donnees, nom, enveloppe(nomTable, cle, modifieLe, appareil, enr));
      ecrits++;
    }
  }

  // Réglages : petit fichier, réécrit à chaque passage. Ils n'ont pas de date
  // de modification - le protocole les compare par empreinte - et les suivre
  // finement coûterait plus que de les recopier.
  await ecrire(
    dossiers.donnees,
    NOM_PARAMETRES,
    enveloppe('parametres', 'singleton', jusqua, appareil, await lireParametres()),
  );

  supprimes += await purger(dossiers, presents, clesVues);
  return { ecrits, supprimes, jusqua };
}

/**
 * Retire du miroir ce que la base n'a plus.
 *
 * Un nom que l'on ne sait pas interpréter est **laissé en place** : le dossier
 * appartient à l'utilisateur, et un miroir n'a pas à supprimer ce qu'il n'a pas
 * écrit lui-même.
 */
async function purger(
  dossiers: Record<Espace, FileSystemDirectoryHandle>,
  presents: Record<Espace, Set<string>>,
  clesVues: Record<string, Set<string>>,
): Promise<number> {
  let supprimes = 0;

  for (const nom of presents.donnees) {
    if (nom === NOM_PARAMETRES) continue;
    const ref = lireNomFichier(nom);
    if (!ref || !(ref.table in clesVues)) continue;
    if (clesVues[ref.table].has(ref.cle)) continue;
    await dossiers.donnees.removeEntry(nom);
    supprimes++;
  }

  for (const [nomTable, { extension }] of Object.entries(BLOBS)) {
    const espace = nomTable as Espace;
    const suffixe = `.${extension}`;
    for (const nom of presents[espace]) {
      if (!nom.endsWith(suffixe)) continue;
      const cle = nom.slice(0, -suffixe.length);
      if (clesVues[nomTable]?.has(cle)) continue;
      await dossiers[espace].removeEntry(nom);
      supprimes++;
    }
  }

  return supprimes;
}
