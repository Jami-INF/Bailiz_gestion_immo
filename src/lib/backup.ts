import JSZip from 'jszip';
import { db, getParametres } from './db';
import { nowISO } from './ids';
import { bailleurRenseigne } from './bailleur';
import { completerContexteEdl } from './etat';
import { sansJournaliser } from './sync/journal';
import type { EtatDesLieux, Photo } from '@/types';

interface DonneesExport {
  version: 1;
  exporteLe: string;
  biens: unknown[];
  locataires: unknown[];
  baux: unknown[];
  /** Hérité : l'inventaire est fusionné dans l'EDL. Conservé pour relire/réécrire les sauvegardes antérieures. */
  inventaires: unknown[];
  edls: unknown[];
  documents: { meta: unknown; fichier: string }[];
  photos: { meta: Omit<Photo, 'blob'>; fichier: string }[];
  parametres: unknown;
}

/**
 * Vrai si la base ne contient aucune donnée métier (appareil neuf, ou données
 * effacées par le navigateur). Sert de garde-fou avant une sauvegarde
 * automatique : pousser une archive vide sur une destination partagée
 * évincerait, par rotation, les sauvegardes pleines des autres appareils.
 */
export async function baseSansDonnees(): Promise<boolean> {
  const compteurs = await Promise.all([
    db.biens.count(),
    db.locataires.count(),
    db.baux.count(),
    db.edls.count(),
    db.documents.count(),
  ]);
  if (compteurs.some((n) => n > 0)) return false;
  /*
   * Aucune fiche, mais l'application peut avoir été **configurée** : coordonnées
   * du bailleur, grille de vétusté, catalogue de clauses, modèle de fiche de
   * visite. C'est un vrai travail, et il ne serait jamais sauvegardé si l'on
   * s'en tenait au décompte des fiches. Le nom du bailleur sert de marqueur :
   * sans lui, aucun document ne peut être produit - l'appareil est réellement
   * neuf, et le garde-fou garde tout son sens.
   */
  const parametres = await db.parametres.get('singleton');
  return !bailleurRenseigne(parametres?.bailleur);
}

/** Exporte toutes les données + photos + PDF dans un fichier ZIP. */
export async function exporterSauvegarde(): Promise<Blob> {
  const zip = new JSZip();
  const photosDir = zip.folder('photos')!;
  const docsDir = zip.folder('documents')!;

  const [biens, locataires, baux, inventaires, edls, photos, documents, parametres] =
    await Promise.all([
      db.biens.toArray(),
      db.locataires.toArray(),
      db.baux.toArray(),
      db.inventaires.toArray(),
      db.edls.toArray(),
      db.photos.toArray(),
      db.documents.toArray(),
      getParametres(),
    ]);

  // JSZip ne gère pas les Blob dans tous les environnements : on passe par ArrayBuffer.
  const photosMeta = [];
  for (const p of photos) {
    const fichier = `${p.id}.jpg`;
    photosDir.file(fichier, await p.blob.arrayBuffer());
    const { blob: _blob, ...meta } = p;
    photosMeta.push({ meta, fichier });
  }

  const documentsMeta = [];
  for (const d of documents) {
    const fichier = `${d.id}.pdf`;
    docsDir.file(fichier, await d.blob.arrayBuffer());
    const { blob: _blob, ...meta } = d;
    documentsMeta.push({ meta, fichier });
  }

  const data: DonneesExport = {
    version: VERSION_SAUVEGARDE,
    exporteLe: nowISO(),
    biens,
    locataires,
    baux,
    inventaires,
    edls,
    documents: documentsMeta,
    photos: photosMeta,
    parametres,
  };

  zip.file('data.json', JSON.stringify(data, null, 2));
  const contenu = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  const blob = new Blob([contenu], { type: 'application/zip' });

  await db.parametres.update('singleton', { derniereSauvegarde: nowISO() });
  return blob;
}

export interface ResumeImport {
  biens: number;
  locataires: number;
  baux: number;
  inventaires: number;
  edls: number;
  photos: number;
  documents: number;
}

/** Version de format que cette version de l'application sait relire et écrire. */
export const VERSION_SAUVEGARDE = 1;

/** Collections attendues dans `data.json`, toutes obligatoires. */
const COLLECTIONS = [
  'biens',
  'locataires',
  'baux',
  'inventaires',
  'edls',
  'documents',
  'photos',
] as const;

/**
 * Refus motivé d'une archive : le fichier a été lu, il n'est pas exploitable, et
 * le message dit à l'utilisateur quoi faire.
 *
 * Distinguée des pannes techniques (quota saturé, base fermée) pour que
 * l'interface sache laquelle des deux afficher telle quelle : ces messages-ci
 * sont rédigés pour être lus, ceux-là doivent passer par `decrireErreur`.
 */
export class ErreurSauvegarde extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurSauvegarde';
  }
}

/**
 * Contrôle du contenu de `data.json` **avant** toute écriture en base.
 *
 * L'import écrase ou fusionne des données irremplaçables : il ne doit jamais
 * commencer sur un fichier dont la forme n'a pas été vérifiée. Un `data.json`
 * tronqué passait jusqu'ici le simple test de version, puis échouait au milieu
 * de `bulkPut` - en mode « remplacer », les tables avaient déjà été vidées.
 *
 * Les messages disent quoi faire : « mettez à jour l'application » n'est pas la
 * même réponse que « ce fichier n'est pas une sauvegarde Bailiz ».
 */
export function validerSauvegarde(brut: unknown): DonneesExport {
  if (typeof brut !== 'object' || brut === null) {
    throw new ErreurSauvegarde("Archive invalide : data.json ne contient pas de sauvegarde Bailiz.");
  }
  const data = brut as Partial<DonneesExport>;

  if (typeof data.version !== 'number') {
    throw new ErreurSauvegarde(
      "Archive invalide : aucun numéro de version dans data.json. Ce fichier n'a probablement pas été produit par Bailiz.",
    );
  }
  if (data.version > VERSION_SAUVEGARDE) {
    throw new ErreurSauvegarde(
      `Cette sauvegarde a été créée par une version plus récente de Bailiz (format ${data.version}, cette application lit le format ${VERSION_SAUVEGARDE}). Mettez l'application à jour avant de l'importer - l'importer telle quelle perdrait des informations.`,
    );
  }
  if (data.version < VERSION_SAUVEGARDE) {
    throw new ErreurSauvegarde(
      `Format de sauvegarde ${data.version} non pris en charge (cette application lit le format ${VERSION_SAUVEGARDE}).`,
    );
  }

  const manquantes = COLLECTIONS.filter((c) => !Array.isArray(data[c]));
  if (manquantes.length > 0) {
    throw new ErreurSauvegarde(
      `Archive incomplète ou corrompue : ${manquantes.join(', ')} manquant(s) dans data.json. Rien n'a été modifié ; réessayez avec une autre sauvegarde.`,
    );
  }

  return data as DonneesExport;
}

export async function lireSauvegarde(fichier: Blob): Promise<{ zip: JSZip; data: DonneesExport }> {
  const zip = await JSZip.loadAsync(await fichier.arrayBuffer());
  const dataFile = zip.file('data.json');
  if (!dataFile) throw new ErreurSauvegarde('Archive invalide : data.json introuvable.');
  let brut: unknown;
  try {
    brut = JSON.parse(await dataFile.async('string'));
  } catch {
    throw new ErreurSauvegarde("Archive illisible : data.json n'est pas un fichier JSON valide.");
  }
  return { zip, data: validerSauvegarde(brut) };
}

/**
 * États des lieux d'une archive, complétés de leur contexte (logement, parties)
 * quand ils ont été écrits avant que l'EDL ne le porte lui-même.
 *
 * Indispensable **en plus** de la migration Dexie v6 : l'import écrit par
 * `bulkPut`, qui ne déclenche aucun hook de migration. Sans ce passage, relire
 * une sauvegarde ancienne réintroduirait dans une base à jour des états des
 * lieux sans logement - invisibles dans les listes et impossibles à imprimer.
 *
 * C'est aussi la raison pour laquelle `VERSION_SAUVEGARDE` n'est pas
 * incrémentée : `validerSauvegarde` refuse les archives de version inférieure,
 * si bien qu'un passage à 2 rendrait illisibles toutes celles déjà produites.
 */
function edlsNormalises(data: DonneesExport): unknown[] {
  const baux = data.baux as { id: string; bienId?: string; locataireIds?: string[] }[];
  const parId = new Map(baux.map((b) => [b.id, b]));
  return (data.edls as Partial<EtatDesLieux>[]).map((edl) =>
    completerContexteEdl({ ...edl }, edl.bailId ? parId.get(edl.bailId) : undefined),
  );
}

/** Détecte les conflits d'identifiants entre la sauvegarde et la base locale. */
export async function detecterConflits(data: DonneesExport): Promise<number> {
  const ids = [
    ...data.biens,
    ...data.locataires,
    ...data.baux,
    ...data.inventaires,
    ...data.edls,
  ].map((e) => (e as { id: string }).id);
  const tables = [db.biens, db.locataires, db.baux, db.inventaires, db.edls];
  let conflits = 0;
  for (const table of tables) {
    conflits += await table.where('id').anyOf(ids).count();
  }
  return conflits;
}

/**
 * Restaure une sauvegarde.
 * mode 'remplacer' : vide toutes les tables puis importe.
 * mode 'fusionner' : met à jour/ajoute par id sans toucher au reste.
 */
export async function importerSauvegarde(
  zip: JSZip,
  data: DonneesExport,
  mode: 'remplacer' | 'fusionner',
): Promise<ResumeImport> {
  const photos: Photo[] = [];
  for (const p of data.photos) {
    const f = zip.file(`photos/${p.fichier}`);
    if (!f) continue;
    const contenu = await f.async('arraybuffer');
    photos.push({ ...(p.meta as Omit<Photo, 'blob'>), blob: new Blob([contenu], { type: 'image/jpeg' }) });
  }

  const documents: Record<string, unknown>[] = [];
  for (const d of data.documents ?? []) {
    const f = zip.file(`documents/${d.fichier}`);
    if (!f) continue;
    const contenu = await f.async('arraybuffer');
    documents.push({
      ...(d.meta as Record<string, unknown>),
      blob: new Blob([contenu], { type: 'application/pdf' }),
    });
  }

  await db.transaction(
    'rw',
    [db.biens, db.locataires, db.baux, db.inventaires, db.edls, db.photos, db.documents, db.parametres],
    async () => {
      if (mode === 'remplacer') {
        await Promise.all([
          db.biens.clear(),
          db.locataires.clear(),
          db.baux.clear(),
          db.inventaires.clear(),
          db.edls.clear(),
          db.photos.clear(),
          db.documents.clear(),
        ]);
      }
      await db.biens.bulkPut(data.biens as never[]);
      await db.locataires.bulkPut(data.locataires as never[]);
      await db.baux.bulkPut(data.baux as never[]);
      await db.inventaires.bulkPut(data.inventaires as never[]);
      await db.edls.bulkPut(edlsNormalises(data) as never[]);
      await db.photos.bulkPut(photos);
      await db.documents.bulkPut(documents as never[]);
      if (data.parametres) {
        await db.parametres.put({ ...(data.parametres as object), id: 'singleton' } as never);
      }
    },
  );

  return {
    biens: data.biens.length,
    locataires: data.locataires.length,
    baux: data.baux.length,
    inventaires: data.inventaires.length,
    edls: data.edls.length,
    photos: photos.length,
    documents: documents.length,
  };
}

/**
 * Efface toutes les données de l'appareil : biens, locataires, baux, EDL,
 * photos, documents, paramètres (identité du bailleur, grille de vétusté,
 * clauses, fiche de visite), configuration de sauvegarde automatique et état
 * de synchronisation. Irréversible - à réserver à un bouton protégé par une
 * confirmation explicite (cf. `ParametresPage`).
 */
export async function supprimerToutesLesDonnees(): Promise<void> {
  // `sansJournaliser` : sans elle, les hooks de suivi (`journal.ts`) rejournalisent
  // chaque ligne effacée des tables synchronisées comme une suppression à
  // envoyer au Drive - le journal se retrouve non vide juste après l'avoir
  // vidé, pour des enregistrements qui n'existent plus.
  await sansJournaliser(() =>
    db.transaction(
      'rw',
      [
        db.biens,
        db.locataires,
        db.baux,
        db.inventaires,
        db.edls,
        db.photos,
        db.documents,
        db.parametres,
        db.sauvegardeAuto,
        db.changements,
        db.syncEtat,
        db.brouillons,
      ],
      async () => {
        await Promise.all([
          db.biens.clear(),
          db.locataires.clear(),
          db.baux.clear(),
          db.inventaires.clear(),
          db.edls.clear(),
          db.photos.clear(),
          db.documents.clear(),
          db.parametres.clear(),
          db.sauvegardeAuto.clear(),
          db.changements.clear(),
          db.syncEtat.clear(),
          db.brouillons.clear(),
        ]);
      },
    ),
  );
}

/** Vrai si la dernière sauvegarde date de plus de 30 jours (ou n'existe pas). */
export function sauvegardeAncienne(derniereSauvegarde?: string): boolean {
  if (!derniereSauvegarde) return true;
  const trenteJours = 30 * 24 * 3600 * 1000;
  return Date.now() - new Date(derniereSauvegarde).getTime() > trenteJours;
}

/**
 * Ouvre un document dans un nouvel onglet (lecture et impression immédiates,
 * sans passer par le dossier de téléchargements - bien plus pratique sur
 * tablette). Si le navigateur bloque la fenêtre, on retombe sur un
 * téléchargement classique plutôt que de ne rien faire.
 */
export function ouvrirBlob(blob: Blob, nomFichier: string): void {
  const url = URL.createObjectURL(blob);
  const onglet = window.open(url, '_blank');
  if (!onglet) {
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichier;
    a.click();
  }
  // Révocation tardive : l'onglet doit avoir le temps de charger le document.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function telechargerBlob(blob: Blob, nomFichier: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
