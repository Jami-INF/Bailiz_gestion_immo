import { db, getParametres, parametresDefaut, type SyncEtat } from '@/lib/db';
import type { Parametres } from '@/types';
import { identifiantAppareil } from '@/lib/appareil';
import { nowISO } from '@/lib/ids';
import type { DepotDistant, Espace, FichierDistant } from './depot';
import {
  changementsEnAttente,
  confirmerEnvoi,
  sansJournaliser,
  TABLES_SYNCHRONISEES,
} from './journal';
import {
  dateModification,
  deciderReception,
  ECART_HORLOGE_MAX_MS,
  ecartHorloge,
  fusionnerParametres,
  lireNomFichier,
  nomFichier,
  referencesEnDouble,
  suppressionMassive,
  type EnveloppeEnregistrement,
  type ReferenceEnDouble,
  type Tombstone,
} from './protocole';

/**
 * Cycle de synchronisation : **pull puis push**, dans cet ordre — on part de
 * l'état distant pour ne jamais écraser ce que l'autre appareil a produit.
 *
 * Ce module ne parle qu'à l'interface `DepotDistant` : il est donc rejouable
 * intégralement en mémoire, ce qui permet de tester les scénarios qui font
 * perdre des données (création parallèle, suppression, coupure) sans réseau.
 */

export type ResultatCycle =
  | {
      etat: 'ok';
      recus: number;
      envoyes: number;
      supprimes: number;
      ecartHorlogeMs: number;
      /** Références attribuées deux fois : signalées, jamais renumérotées d'office. */
      doublons: ReferenceEnDouble[];
    }
  | { etat: 'indisponible' }
  /** Un garde-fou a interrompu le cycle : rien n'a été appliqué ni envoyé. */
  | { etat: 'bloque'; raison: RaisonBlocage; details?: string };

/*
 * Pas de garde-fou « base locale vide » : le cas visé — un appareil réinstallé
 * qui viderait le dépôt — ne peut pas se produire. Effacer les données du
 * navigateur efface aussi le journal, donc aucune suppression n'est en attente,
 * et le cycle se contente alors de tout rapatrier. À l'inverse, un utilisateur
 * qui supprime réellement toutes ses données doit pouvoir les propager : c'est
 * le garde-fou de réception (`suppression_massive`) qui protège l'autre appareil.
 */
export type RaisonBlocage = 'suppression_massive' | 'horloge';

/** Espaces portant des blobs : immuables, donc jamais en conflit. */
const ESPACE_PAR_TABLE: Partial<Record<string, Espace>> = {
  photos: 'photos',
  documents: 'documents',
};

function espaceDe(table: string): Espace {
  return ESPACE_PAR_TABLE[table] ?? 'donnees';
}

/** Champ portant le blob, pour les tables qui en ont un. */
const CHAMP_BLOB: Record<string, string> = { photos: 'blob', documents: 'blob' };

async function etatSync(table: string, cle: string): Promise<SyncEtat | undefined> {
  return db.syncEtat.get([table, cle]);
}

async function memoriserEtat(etat: SyncEtat): Promise<void> {
  await db.syncEtat.put(etat);
}

/** Toutes les entités locales d'une table, indexées par clé. */
async function lireTable(table: string): Promise<Map<string, Record<string, unknown>>> {
  const rows = (await (db as unknown as Record<string, { toArray(): Promise<unknown[]> }>)[
    table
  ].toArray()) as Record<string, unknown>[];
  return new Map(rows.map((r) => [String(r.id), r]));
}

async function ecrireEnregistrement(table: string, donnees: unknown): Promise<void> {
  await sansJournaliser(async () => {
    await (db as unknown as Record<string, { put(v: unknown): Promise<unknown> }>)[table].put(
      donnees,
    );
  });
}

async function supprimerEnregistrement(table: string, cle: string): Promise<void> {
  await sansJournaliser(async () => {
    await (db as unknown as Record<string, { delete(k: string): Promise<void> }>)[table].delete(
      cle,
    );
  });
}

/** Description d'un fichier distant, indexée par la clé `table__cle`. */
function indexer(fichiers: FichierDistant[]): Map<string, FichierDistant> {
  const index = new Map<string, FichierDistant>();
  for (const f of fichiers) {
    const analyse = lireNomFichier(f.nom);
    if (!analyse) continue;
    index.set(`${analyse.table}__${analyse.cle}`, f);
  }
  return index;
}

/**
 * Un cycle complet. `interactif` autorise la demande d'autorisation Google ;
 * sans elle, le cycle se contente de signaler qu'il est indisponible.
 */
export async function synchroniser(
  depot: DepotDistant,
  options?: { forcerSuppressions?: boolean; ignorerHorloge?: boolean },
): Promise<ResultatCycle> {
  const etatGlobal = await db.parametres.get('singleton');
  const derniereSync = etatGlobal?.sauvegardeGDrive?.derniereSync;

  // --- Garde-fou : horloge -------------------------------------------------
  const heureServeur = await depot.heureServeur();
  const ecart = ecartHorloge(heureServeur);
  if (ecart > ECART_HORLOGE_MAX_MS && !options?.ignorerHorloge) {
    return {
      etat: 'bloque',
      raison: 'horloge',
      details: `${Math.round(ecart / 1000)} s d'écart avec l'heure du serveur`,
    };
  }

  // --- Pull ----------------------------------------------------------------
  const [fichiersDonnees, fichiersTombstones, fichiersPhotos, fichiersDocuments] =
    await Promise.all([
      depot.lister('donnees', derniereSync),
      depot.lister('tombstones', derniereSync),
      depot.lister('photos', derniereSync),
      depot.lister('documents', derniereSync),
    ]);

  const tombstones = indexer(fichiersTombstones);
  let recus = 0;
  let supprimes = 0;

  /*
   * Index des contenus binaires, construit paresseusement. Le listage
   * incrémental suffit dans le cas courant, mais un blob envoyé lors d'un cycle
   * antérieur n'y figure pas : on retombe alors sur un listage complet de
   * l'espace, fait une seule fois par cycle.
   */
  const indexBlobs = new Map<Espace, Map<string, FichierDistant>>();
  const espacesComplets = new Set<Espace>();
  const indexerBlobs = (espace: Espace, fichiers: FichierDistant[]) => {
    const index = indexBlobs.get(espace) ?? new Map<string, FichierDistant>();
    for (const f of fichiers) index.set(f.nom.replace(/\.[^.]+$/, ''), f);
    indexBlobs.set(espace, index);
    return index;
  };
  indexerBlobs('photos', fichiersPhotos);
  indexerBlobs('documents', fichiersDocuments);

  const trouverBlob = async (
    table: string,
    cle: string,
  ): Promise<FichierDistant | undefined> => {
    const espace = espaceDe(table);
    const trouve = indexBlobs.get(espace)?.get(cle);
    if (trouve) return trouve;
    if (espacesComplets.has(espace)) return undefined;
    espacesComplets.add(espace);
    return indexerBlobs(espace, await depot.lister(espace)).get(cle);
  };

  // Suppressions : recensées d'abord pour pouvoir refuser un cycle qui viderait
  // la base à cause d'un marqueur erroné.
  const aSupprimer: { table: string; cle: string; supprimeLe: string }[] = [];
  for (const [, fichier] of tombstones) {
    const analyse = lireNomFichier(fichier.nom);
    if (!analyse) continue;
    const { table, cle } = analyse;
    if (table === 'parametres') continue;
    const locale = await (db as unknown as Record<string, { get(k: string): Promise<unknown> }>)[
      table
    ]?.get(cle);
    if (!locale) continue;
    const tombstone = JSON.parse(await depot.lireTexte(fichier.id)) as Tombstone;
    const decision = deciderReception({
      localModifieLe: dateModification(locale, '1970-01-01T00:00:00.000Z'),
      tombstoneLe: tombstone.supprimeLe,
    });
    if (decision === 'supprimer_local') {
      aSupprimer.push({ table, cle, supprimeLe: tombstone.supprimeLe });
    }
  }

  if (aSupprimer.length > 0 && !options?.forcerSuppressions) {
    const total = (
      await Promise.all(TABLES_SYNCHRONISEES.map((t) => lireTable(t).then((m) => m.size)))
    ).reduce((a, b) => a + b, 0);
    if (suppressionMassive(aSupprimer.length, total)) {
      return {
        etat: 'bloque',
        raison: 'suppression_massive',
        details: `${aSupprimer.length} suppressions sur ${total} enregistrements`,
      };
    }
  }

  for (const { table, cle } of aSupprimer) {
    await supprimerEnregistrement(table, cle);
    await db.syncEtat.delete([table, cle]);
    supprimes++;
  }

  // Enregistrements vivants.
  for (const fichier of fichiersDonnees) {
    const analyse = lireNomFichier(fichier.nom);
    if (!analyse) continue;
    const { table, cle } = analyse;
    // Le singleton a ses propres règles de fusion : le laisser passer ici
    // écraserait la configuration Drive propre à cet appareil.
    if (table === 'parametres') continue;
    const enveloppe = JSON.parse(await depot.lireTexte(fichier.id)) as EnveloppeEnregistrement;
    const locale = await (db as unknown as Record<string, { get(k: string): Promise<unknown> }>)[
      table
    ]?.get(cle);
    const tombstone = tombstones.get(`${table}__${cle}`);
    const tombstoneLe = tombstone
      ? ((JSON.parse(await depot.lireTexte(tombstone.id)) as Tombstone).supprimeLe as string)
      : undefined;

    const decision = deciderReception({
      localModifieLe: locale ? dateModification(locale, '1970-01-01T00:00:00.000Z') : undefined,
      distantModifieLe: enveloppe.modifieLe,
      tombstoneLe,
    });
    if (decision !== 'prendre_distant') continue;

    const champBlob = CHAMP_BLOB[table];
    if (!champBlob) {
      await ecrireEnregistrement(table, enveloppe.donnees);
      await memoriserEtat({ table, cle, driveId: fichier.id, modifieLe: enveloppe.modifieLe });
      recus++;
      continue;
    }

    /*
     * Table à contenu binaire : l'enveloppe ne porte que les métadonnées.
     * L'écrire telle quelle effacerait le blob local — une photo réduite à sa
     * légende, invisible et irrécupérable. On conserve donc le contenu déjà
     * présent, et on ne le télécharge que s'il manque vraiment.
     */
    const locaux = locale as Record<string, unknown> | undefined;
    let blob = locaux?.[champBlob] as Blob | undefined;
    if (!blob) {
      const fichierBlob = await trouverBlob(table, cle);
      // Contenu pas encore disponible sur le dépôt : on ne crée pas un
      // enregistrement sans blob, il repartira au cycle suivant.
      if (!fichierBlob) continue;
      blob = await depot.lireBlob(fichierBlob.id);
      await memoriserEtat({
        table,
        cle,
        driveId: fichier.id,
        blobDriveId: fichierBlob.id,
        modifieLe: enveloppe.modifieLe,
      });
    } else {
      const etatConnu = await etatSync(table, cle);
      await memoriserEtat({
        table,
        cle,
        driveId: fichier.id,
        blobDriveId: etatConnu?.blobDriveId,
        modifieLe: enveloppe.modifieLe,
      });
    }
    await ecrireEnregistrement(table, { ...(enveloppe.donnees as object), [champBlob]: blob });
    recus++;
  }

  // --- Push ----------------------------------------------------------------
  const enAttente = await changementsEnAttente();

  const envoyes: typeof enAttente = [];
  const appareil = identifiantAppareil();

  for (const changement of enAttente) {
    const { table, cle } = changement;
    const etat = await etatSync(table, cle);

    if (changement.type === 'suppr') {
      // Métadonnées **et** contenu binaire : laisser le blob derrière laisserait
      // une photo de locataire supprimé sur le Drive, ce que la suppression
      // RGPD interdit précisément.
      if (etat?.driveId) await depot.supprimer(etat.driveId).catch(() => undefined);
      if (etat?.blobDriveId) await depot.supprimer(etat.blobDriveId).catch(() => undefined);
      const tombstone: Tombstone = {
        table,
        cle,
        supprimeLe: changement.horodatage,
        appareil,
      };
      await depot.ecrire('tombstones', nomFichier(table, cle), JSON.stringify(tombstone));
      await db.syncEtat.delete([table, cle]);
      envoyes.push(changement);
      continue;
    }

    const enregistrement = await (
      db as unknown as Record<string, { get(k: string): Promise<unknown> }>
    )[table]?.get(cle);
    // Enregistrement disparu depuis : la suppression sera journalisée à part.
    if (!enregistrement) {
      envoyes.push(changement);
      continue;
    }

    const modifieLe = dateModification(enregistrement, changement.horodatage);
    const espace = espaceDe(table);

    if (espace === 'donnees') {
      const enveloppe: EnveloppeEnregistrement = {
        table,
        cle,
        modifieLe,
        appareil,
        donnees: enregistrement,
      };
      const fichier = await depot.ecrire(
        'donnees',
        nomFichier(table, cle),
        JSON.stringify(enveloppe),
        etat?.driveId,
      );
      await memoriserEtat({ table, cle, driveId: fichier.id, modifieLe });
    } else {
      // Contenu binaire : les métadonnées vont dans `donnees` (mises à jour sur
      // le **même** fichier, sinon chaque envoi créerait un doublon), et le blob
      // ne part qu'une fois — il est immuable.
      const enr = enregistrement as Record<string, unknown>;
      const blob = enr[CHAMP_BLOB[table]] as Blob | undefined;
      const { [CHAMP_BLOB[table]]: _blob, ...meta } = enr;
      const enveloppe: EnveloppeEnregistrement = {
        table,
        cle,
        modifieLe,
        appareil,
        donnees: meta,
      };
      const fichierMeta = await depot.ecrire(
        'donnees',
        nomFichier(table, cle),
        JSON.stringify(enveloppe),
        etat?.driveId,
      );
      let blobDriveId = etat?.blobDriveId;
      if (!blobDriveId && blob) {
        const extension = table === 'photos' ? 'jpg' : 'pdf';
        blobDriveId = (await depot.ecrire(espace, `${cle}.${extension}`, blob)).id;
      }
      await memoriserEtat({ table, cle, driveId: fichierMeta.id, blobDriveId, modifieLe });
    }
    envoyes.push(changement);
  }

  await confirmerEnvoi(envoyes);

  // --- Paramètres ----------------------------------------------------------
  await synchroniserParametres(depot, appareil);

  // `derniereSync` prend l'heure **serveur** : comparer ensuite des dates
  // serveur à une heure locale ferait manquer des fichiers à chaque cycle.
  const params = await getParametres();
  if (params.sauvegardeGDrive) {
    await db.parametres.put({
      ...params,
      sauvegardeGDrive: { ...params.sauvegardeGDrive, derniereSync: heureServeur },
    });
  }

  /*
   * Après convergence : deux appareils hors-ligne ont pu attribuer la même
   * référence. On le signale sans rien renuméroter — une référence figure sur un
   * document imprimé, parfois signé.
   */
  const doublons = [
    ...referencesEnDouble('baux', await db.baux.toArray()),
    ...referencesEnDouble('edls', await db.edls.toArray()),
  ];

  return {
    etat: 'ok',
    recus,
    envoyes: envoyes.length,
    supprimes,
    ecartHorlogeMs: ecart,
    doublons,
  };
}

/**
 * Le singleton suit ses propres règles de fusion (protocole §4.6).
 *
 * Il n'a **pas de date de modification** : impossible de savoir par horodatage
 * qui a changé quoi. On compare donc au contenu de la dernière version
 * synchronisée. Sans cette empreinte, le distant l'emporterait à chaque cycle
 * et effacerait les réglages modifiés localement — bailleur, grille de vétusté,
 * catalogue de clauses, modèle de fiche de visite.
 */
async function synchroniserParametres(depot: DepotDistant, appareil: string): Promise<void> {
  const nom = nomFichier('parametres', 'singleton');
  const local = await getParametres();
  const fichiers = await depot.lister('donnees');
  const distantFichier = fichiers.find((f) => f.nom === nom);
  const etat = await db.syncEtat.get(['parametres', 'singleton']);

  /**
   * Seuls les **réglages** servent à détecter un changement : les compteurs de
   * séquence bougent dès qu'un document est généré, sans que l'utilisateur ait
   * touché à sa configuration, et ils fusionnent de toute façon au maximum.
   */
  const reglages = (p: Parametres) =>
    JSON.stringify({
      bailleur: p.bailleur,
      grilleVetuste: p.grilleVetuste,
      ficheVisite: p.ficheVisite,
      clausesBail: p.clausesBail,
    });
  const compteurs = (p: Parametres) => JSON.stringify(p.compteursSequence);
  const sansConfigDrive = (p: Parametres) => ({ ...p, sauvegardeGDrive: undefined });

  let fusionne = local;
  if (distantFichier) {
    const enveloppe = JSON.parse(await depot.lireTexte(distantFichier.id)) as EnveloppeEnregistrement;
    const distant = enveloppe.donnees as Parametres;
    /*
     * Sans empreinte, cet appareil n'a jamais synchronisé : ses réglages
     * valent-ils quelque chose ? S'ils sont encore ceux d'un appareil neuf, non
     * — il adopte ceux du Drive. S'ils ont été configurés ici, ils priment.
     */
    const localAChange = etat?.empreinte
      ? reglages(local) !== etat.empreinte
      : reglages(local) !== reglages(parametresDefaut());
    fusionne = fusionnerParametres(local, distant, !localAChange);
    if (JSON.stringify(sansConfigDrive(fusionne)) !== JSON.stringify(sansConfigDrive(local))) {
      await sansJournaliser(async () => {
        await db.parametres.put(fusionne);
      });
    }
    // Rien n'a bougé de part et d'autre : ne pas réécrire, sinon l'autre
    // appareil verrait à chaque cycle une « modification » qui n'en est pas une.
    if (reglages(fusionne) === reglages(distant) && compteurs(fusionne) === compteurs(distant)) {
      await db.syncEtat.put({
        table: 'parametres',
        cle: 'singleton',
        driveId: distantFichier.id,
        modifieLe: enveloppe.modifieLe,
        empreinte: reglages(fusionne),
      });
      return;
    }
  }

  const contenu = JSON.stringify(sansConfigDrive(fusionne));

  const enveloppe: EnveloppeEnregistrement = {
    table: 'parametres',
    cle: 'singleton',
    modifieLe: nowISO(),
    appareil,
    donnees: JSON.parse(contenu) as unknown,
  };
  const fichier = await depot.ecrire(
    'donnees',
    nom,
    JSON.stringify(enveloppe),
    distantFichier?.id,
  );
  await db.syncEtat.put({
    table: 'parametres',
    cle: 'singleton',
    driveId: fichier.id,
    modifieLe: enveloppe.modifieLe,
    empreinte: reglages(fusionne),
  });
}
