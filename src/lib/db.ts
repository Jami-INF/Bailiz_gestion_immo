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
import { GRILLE_VETUSTE_DEFAUT } from './defauts';

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
  }
}

export const db = new BailizDB();

function parametresDefaut(): Parametres {
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
    compteursSequence: {
      bail: 0,
      edl: 0,
      inventaire: 0,
      document: 0,
      annee: new Date().getFullYear(),
    },
  };
}

export async function getParametres(): Promise<Parametres> {
  const existant = await db.parametres.get('singleton');
  if (existant) return existant;
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
