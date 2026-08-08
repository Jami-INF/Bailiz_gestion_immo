import Dexie, { type EntityTable } from 'dexie';
import type {
  Bail,
  Bien,
  DocumentGenere,
  EtatDesLieux,
  Inventaire,
  Locataire,
  Parametres,
  Photo,
} from '@/types';
import { CLAUSES_BAIL_DEFAUT, GRILLE_VETUSTE_DEFAUT, MODELE_FICHE_VISITE_DEFAUT } from './defauts';

/**
 * Configuration de la sauvegarde automatique : le handle du dossier choisi
 * (File System Access API) est structured-cloneable et se conserve dans
 * IndexedDB. Table volontairement exclue de l'export ZIP (propre à l'appareil).
 */
export interface ConfigSauvegardeAuto {
  id: 'dossier';
  handle: FileSystemDirectoryHandle;
  nomDossier: string;
  dernierPush?: string;
}

/**
 * Journal des modifications locales : suivi des changements **et** file
 * d'attente hors-ligne. Une entrée n'est retirée qu'après confirmation de son
 * envoi sur le Drive (cf. `docs/CDC-sync-drive.md` §4.2).
 */
export interface Changement {
  id?: number;
  table: string;
  cle: string;
  type: 'maj' | 'suppr';
  horodatage: string;
}

/** Lien entre un enregistrement local et le fichier qui le porte sur le Drive. */
export interface SyncEtat {
  table: string;
  cle: string;
  /** Fichier portant les métadonnées (espace `donnees`). */
  driveId: string;
  /**
   * Fichier portant le contenu binaire (photo, PDF), distinct des métadonnées.
   * Sa présence signifie « déjà envoyé » : un blob étant immuable, il ne repart
   * jamais une seconde fois.
   */
  blobDriveId?: string;
  /** Horodatage de la version poussée ou reçue, pour éviter les renvois inutiles. */
  modifieLe: string;
  /**
   * Contenu exact de la dernière version synchronisée. Utilisé pour le seul
   * singleton `parametres`, qui n'a pas de date de modification : comparer à
   * cette empreinte est le seul moyen de savoir qui, du local ou du distant, a
   * réellement changé.
   */
  empreinte?: string;
}

class BailizDB extends Dexie {
  biens!: EntityTable<Bien, 'id'>;
  locataires!: EntityTable<Locataire, 'id'>;
  baux!: EntityTable<Bail, 'id'>;
  /** @deprecated Fusionné dans l'état des lieux ; conservé pour les anciennes sauvegardes. */
  inventaires!: EntityTable<Inventaire, 'id'>;
  edls!: EntityTable<EtatDesLieux, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  documents!: EntityTable<DocumentGenere, 'id'>;
  parametres!: EntityTable<Parametres, 'id'>;
  sauvegardeAuto!: EntityTable<ConfigSauvegardeAuto, 'id'>;
  changements!: EntityTable<Changement, 'id'>;
  syncEtat!: Dexie.Table<SyncEtat, [string, string]>;

  constructor() {
    super('bailiz');
    this.version(1).stores({
      biens: 'id, nom, updatedAt',
      locataires: 'id, nom, updatedAt',
      baux: 'id, reference, bienId, statut, updatedAt, *locataireIds',
      // Table héritée : l'inventaire du mobilier est désormais intégré à l'EDL
      // (une seule signature). Conservée pour relire les anciennes sauvegardes.
      inventaires: 'id, reference, bailId, statut',
      edls: 'id, reference, bailId, type, statut, updatedAt',
      photos: 'id, edlId',
      documents: 'id, reference, type, bienId, bailId, edlId, createdAt',
      parametres: 'id',
    });
    // v2 : dossier de sauvegarde automatique (File System Access).
    this.version(2).stores({
      sauvegardeAuto: 'id',
    });
    // v3 : une photo peut illustrer un bien (fiche de visite) et non plus
    // seulement un EDL. `edlId` reste indexé : les clés absentes ne figurent
    // pas dans l'index, les requêtes existantes sont inchangées.
    this.version(3).stores({
      photos: 'id, edlId, bienId',
    });
    // v4 : synchronisation par fichiers. `changements` est à la fois le suivi
    // des modifications et la file d'attente hors-ligne ; `syncEtat` fait le
    // lien entre un enregistrement local et son fichier sur le Drive.
    this.version(4).stores({
      changements: '++id, [table+cle], horodatage',
      syncEtat: '[table+cle], driveId',
    });
  }
}

export const db = new BailizDB();

/** Paramètres d'un appareil neuf : sert aussi de référence « jamais configuré ». */
export function parametresDefaut(): Parametres {
  return {
    id: 'singleton',
    bailleur: {
      civilite: 'M',
      nom: '',
      prenom: '',
      adresse: '',
      email: '',
      telephone: '',
      qualite: 'personne_physique',
    },
    grilleVetuste: GRILLE_VETUSTE_DEFAUT,
    ficheVisite: MODELE_FICHE_VISITE_DEFAUT,
    clausesBail: CLAUSES_BAIL_DEFAUT,
    compteursSequence: {
      bail: 0,
      edl: 0,
      inventaire: 0,
      document: 0,
      annee: new Date().getFullYear(),
    },
  };
}

/**
 * Complète les paramètres lus en base avec les valeurs par défaut des champs
 * apparus après leur création (ou après une restauration de sauvegarde plus
 * ancienne). Sans cela, chaque page devrait gérer l'absence du champ.
 */
function normaliser(p: Parametres): Parametres {
  return {
    ...p,
    ficheVisite: p.ficheVisite ?? MODELE_FICHE_VISITE_DEFAUT,
    clausesBail: p.clausesBail ?? CLAUSES_BAIL_DEFAUT,
  };
}

/**
 * Lecture **sans écriture** des paramètres : la seule forme utilisable dans un
 * `useLiveQuery`. Dexie exécute un `liveQuery` dans une transaction en lecture
 * seule ; y créer la ligne par défaut lève une `ReadOnlyError` et fait planter
 * la page — écran blanc pour qui ouvre l'application sur une base neuve.
 */
export async function lireParametres(): Promise<Parametres> {
  const existant = await db.parametres.get('singleton');
  return existant ? normaliser(existant) : parametresDefaut();
}

/** Lecture des paramètres, en créant la ligne par défaut si elle manque. */
export async function getParametres(): Promise<Parametres> {
  const existant = await db.parametres.get('singleton');
  if (existant) return normaliser(existant);
  const defauts = parametresDefaut();
  await db.parametres.put(defauts);
  return defauts;
}

/**
 * Génère la prochaine référence "TYPE-ANNEE-XXXX" et incrémente la séquence
 * de façon atomique. La séquence est remise à zéro à chaque changement d'année.
 */
export async function prochaineReference(
  type: 'bail' | 'edl' | 'inventaire' | 'document',
): Promise<string> {
  const prefixes = { bail: 'BAIL', edl: 'EDL', inventaire: 'INV', document: 'DOC' };
  return db.transaction('rw', db.parametres, async () => {
    const params = await getParametres();
    const annee = new Date().getFullYear();
    if (params.compteursSequence.annee !== annee) {
      params.compteursSequence = { bail: 0, edl: 0, inventaire: 0, document: 0, annee };
    }
    params.compteursSequence[type] += 1;
    await db.parametres.put(params);
    const num = String(params.compteursSequence[type]).padStart(4, '0');
    return `${prefixes[type]}-${annee}-${num}`;
  });
}
