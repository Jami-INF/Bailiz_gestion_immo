import { db, getParametres, parametresDefaut, type SyncEtat } from '@/lib/db';
import { retyper, TYPE_PAR_TABLE } from '@/lib/blobs';
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
  empreintesSections,
  fusionnerParametres,
  lireNomFichier,
  nomFichier,
  referencesEnDouble,
  SECTIONS_PARAMETRES,
  suppressionMassive,
  type EnveloppeEnregistrement,
  type ReferenceEnDouble,
  type SectionParametres,
  type Tombstone,
} from './protocole';

/**
 * Cycle de synchronisation : **pull puis push**, dans cet ordre - on part de
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
      /**
       * Sections de réglages modifiées des deux côtés depuis le dernier
       * échange : la fusion a tranché en faveur du Drive, et la version saisie
       * ici est perdue. Signalé, jamais tu.
       */
      reglagesEcrases: SectionParametres[];
      /**
       * Fiches dont une saisie locale **pas encore envoyée** vient d'être
       * remplacée par une version plus récente de l'autre appareil.
       *
       * C'est le seul cas où une saisie disparaît sans que personne ne l'ait
       * demandé : on travaille hors ligne sur la tablette, l'autre appareil
       * modifie la même fiche plus tard, et la reconnexion adopte sa version.
       * L'arbitrage est le bon - la modification la plus récente gagne - mais
       * le taire laisserait croire que rien n'a été perdu.
       */
      saisiesRemplacees: SaisieRemplacee[];
    }
  | { etat: 'indisponible' }
  /** Un garde-fou a interrompu le cycle : rien n'a été appliqué ni envoyé. */
  | { etat: 'bloque'; raison: RaisonBlocage; details?: string };

/*
 * Pas de garde-fou « base locale vide » : le cas visé - un appareil réinstallé
 * qui viderait le dépôt - ne peut pas se produire. Effacer les données du
 * navigateur efface aussi le journal, donc aucune suppression n'est en attente,
 * et le cycle se contente alors de tout rapatrier. À l'inverse, un utilisateur
 * qui supprime réellement toutes ses données doit pouvoir les propager : c'est
 * le garde-fou de réception (`suppression_massive`) qui protège l'autre appareil.
 */
export type RaisonBlocage = 'suppression_massive' | 'horloge';

/** Une saisie locale abandonnée au profit d'une version distante plus récente. */
export interface SaisieRemplacee {
  table: string;
  cle: string;
  /** Référence imprimée s'il y en a une (`BAIL-2026-0007`), sinon rien. */
  reference?: string;
  /** Date de la saisie perdue, telle qu'elle figurait sur cet appareil. */
  saisieLe?: string;
  /** Vrai si la fiche a été **supprimée** ici, et non remplacée. */
  supprimee?: boolean;
}

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

/** Nombre d'entités d'une table, sans charger leur contenu. */
async function compterTable(table: string): Promise<number> {
  return (db as unknown as Record<string, { count(): Promise<number> }>)[table].count();
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
      depot.lister('donnees', { depuis: derniereSync }),
      depot.lister('tombstones', { depuis: derniereSync }),
      depot.lister('photos', { depuis: derniereSync }),
      depot.lister('documents', { depuis: derniereSync }),
    ]);

  const tombstones = indexer(fichiersTombstones);
  let recus = 0;
  let supprimes = 0;

  /*
   * Ce qui restait à envoyer **avant** que la réception ne modifie quoi que ce
   * soit. Une fiche qui figure ici et que le pull s'apprête à remplacer, c'est
   * une saisie locale que personne n'a jamais vue et que personne ne reverra :
   * le seul endroit du cycle où l'on peut encore la nommer.
   */
  const enAttenteAvantReception = new Set(
    (await db.changements.toArray()).map((c) => `${c.table}__${c.cle}`),
  );
  const saisiesRemplacees: SaisieRemplacee[] = [];
  const noterSaisiePerdue = (
    table: string,
    cle: string,
    locale: unknown,
    supprimee?: boolean,
  ): void => {
    if (!enAttenteAvantReception.has(`${table}__${cle}`)) return;
    const enr = locale as { reference?: string; updatedAt?: string; createdAt?: string } | undefined;
    saisiesRemplacees.push({
      table,
      cle,
      reference: enr?.reference,
      saisieLe: enr?.updatedAt ?? enr?.createdAt,
      supprimee,
    });
  };

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

  /*
   * Index par nom d'un espace, construit au plus **une fois par cycle** et
   * seulement si l'on en a besoin - jamais une requête par enregistrement : une
   * suppression RGPD efface des dizaines de photos d'un coup, et autant
   * d'allers-retours saturerait le quota Drive.
   *
   * Il sert à retrouver un fichier dont l'identifiant a été perdu : un envoi
   * interrompu entre l'écriture des métadonnées et sa mémorisation laisse un
   * orphelin, et repartir d'une création en produirait un second du même nom.
   * Deux homonymes, c'est une version qui en masque une autre au hasard du
   * listage - d'où la liste complète, et non le seul premier trouvé.
   */
  const indexParNom = new Map<Espace, Map<string, FichierDistant[]>>();
  const tousParNom = async (espace: Espace, nom: string): Promise<FichierDistant[]> => {
    let index = indexParNom.get(espace);
    if (!index) {
      index = new Map();
      for (const f of await depot.lister(espace)) {
        index.set(f.nom, [...(index.get(f.nom) ?? []), f]);
      }
      indexParNom.set(espace, index);
    }
    return index.get(nom) ?? [];
  };
  /** Le plus récent des homonymes : celui que les autres appareils liront. */
  const trouverParNom = async (espace: Espace, nom: string) =>
    (await tousParNom(espace, nom)).reduce<FichierDistant | undefined>(
      (retenu, f) => (!retenu || f.modifieLe >= retenu.modifieLe ? f : retenu),
      undefined,
    );

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
    // `count()` et non `toArray()` : la table `photos` porte les images
    // elles-mêmes, et les charger toutes en mémoire pour les dénombrer ferait
    // tomber la tablette au moment précis où le garde-fou doit la protéger.
    const total = (await Promise.all(TABLES_SYNCHRONISEES.map((t) => compterTable(t)))).reduce(
      (a, b) => a + b,
      0,
    );
    if (suppressionMassive(aSupprimer.length, total)) {
      return {
        etat: 'bloque',
        raison: 'suppression_massive',
        details: `${aSupprimer.length} suppressions sur ${total} enregistrements`,
      };
    }
  }

  for (const { table, cle } of aSupprimer) {
    // Une saisie en attente sur une fiche que l'autre appareil vient de
    // supprimer disparaît elle aussi : à signaler avant de l'effacer.
    const locale = await (db as unknown as Record<string, { get(k: string): Promise<unknown> }>)[
      table
    ]?.get(cle);
    noterSaisiePerdue(table, cle, locale, true);
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
    const etatConnu = await etatSync(table, cle);

    /*
     * Version déjà détenue : le listage incrémental part de l'heure serveur
     * relevée **au début** du cycle précédent, donc tout ce que ce cycle a
     * poussé ressort au suivant. Sans ce filtre, chaque échange retélécharge et
     * réécrit l'intégralité de ce qu'il vient d'envoyer, et annonce comme
     * « reçues » des fiches qui n'ont pas bougé.
     *
     * Un blob absent fait exception : l'enregistrement est incomplet, il faut
     * bien retenter le téléchargement.
     */
    const blobPresent =
      !champBlob || Boolean((locale as Record<string, unknown> | undefined)?.[champBlob]);
    if (locale && blobPresent && etatConnu?.modifieLe === enveloppe.modifieLe) continue;

    // À partir d'ici la version distante sera bel et bien écrite : si une saisie
    // locale attendait encore d'être envoyée, elle vient d'être abandonnée.
    if (locale) noterSaisiePerdue(table, cle, locale);

    if (!champBlob) {
      await ecrireEnregistrement(table, enveloppe.donnees);
      await memoriserEtat({ table, cle, driveId: fichier.id, modifieLe: enveloppe.modifieLe });
      recus++;
      continue;
    }

    /*
     * Table à contenu binaire : l'enveloppe ne porte que les métadonnées.
     * L'écrire telle quelle effacerait le blob local - une photo réduite à sa
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
      await memoriserEtat({
        table,
        cle,
        driveId: fichier.id,
        blobDriveId: etatConnu?.blobDriveId,
        modifieLe: enveloppe.modifieLe,
      });
    }
    /*
     * Type remis selon la table : celui du dépôt distant est déclaratif, et il a
     * longtemps valu `application/zip` pour tous les fichiers envoyés. Un PDF
     * mal typé se télécharge sous une mauvaise extension, une photo mal typée
     * n'est plus reconnue comme image par le moteur PDF. On ne fait pas
     * confiance au type reçu.
     */
    const typeAttendu = TYPE_PAR_TABLE[table];
    const contenu = typeAttendu ? retyper(blob, typeAttendu) : blob;
    await ecrireEnregistrement(table, { ...(enveloppe.donnees as object), [champBlob]: contenu });
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
      /*
       * Métadonnées **et** contenu binaire : laisser le blob derrière laisserait
       * une photo de locataire supprimé sur le Drive, ce que la suppression
       * RGPD interdit précisément.
       *
       * On ne se contente pas des identifiants connus : un envoi interrompu a pu
       * laisser un homonyme dont cet appareil n'a jamais entendu parler. Le
       * balayage par nom est le seul moyen de garantir qu'il ne reste rien.
       */
      const aEffacer = new Set<string>();
      if (etat?.driveId) aEffacer.add(etat.driveId);
      if (etat?.blobDriveId) aEffacer.add(etat.blobDriveId);
      for (const f of await tousParNom('donnees', nomFichier(table, cle))) aEffacer.add(f.id);
      const espaceBlob = espaceDe(table);
      if (espaceBlob !== 'donnees') {
        const extension = table === 'photos' ? 'jpg' : 'pdf';
        for (const f of await tousParNom(espaceBlob, `${cle}.${extension}`)) aEffacer.add(f.id);
      }
      for (const id of aEffacer) await depot.supprimer(id).catch(() => undefined);

      const tombstone: Tombstone = {
        table,
        cle,
        supprimeLe: changement.horodatage,
        appareil,
      };
      // Réutiliser le marqueur existant : supprimer deux fois la même fiche
      // (la seconde après une résurrection) en accumulerait autrement des copies.
      const tombstoneExistant = await trouverParNom('tombstones', nomFichier(table, cle));
      await depot.ecrire(
        'tombstones',
        nomFichier(table, cle),
        JSON.stringify(tombstone),
        tombstoneExistant?.id,
      );
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
    const nom = nomFichier(table, cle);
    // Identifiant inconnu : plutôt que de créer un second fichier du même nom,
    // reprendre celui qu'un envoi interrompu a laissé sur le dépôt.
    const idMeta = etat?.driveId ?? (await trouverParNom('donnees', nom))?.id;

    if (espace === 'donnees') {
      const enveloppe: EnveloppeEnregistrement = {
        table,
        cle,
        modifieLe,
        appareil,
        donnees: enregistrement,
      };
      const fichier = await depot.ecrire('donnees', nom, JSON.stringify(enveloppe), idMeta);
      await memoriserEtat({ table, cle, driveId: fichier.id, modifieLe });
    } else {
      // Contenu binaire : les métadonnées vont dans `donnees` (mises à jour sur
      // le **même** fichier, sinon chaque envoi créerait un doublon), et le blob
      // ne part qu'une fois - il est immuable.
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
      const fichierMeta = await depot.ecrire('donnees', nom, JSON.stringify(enveloppe), idMeta);
      /*
       * Mémorisé **avant** l'envoi du blob : une coupure entre les deux laissait
       * jusqu'ici un fichier de métadonnées dont plus personne ne connaissait
       * l'identifiant, et le cycle suivant en créait un second du même nom. Deux
       * homonymes, c'est l'autre appareil qui lit une version au hasard.
       */
      await memoriserEtat({
        table,
        cle,
        driveId: fichierMeta.id,
        blobDriveId: etat?.blobDriveId,
        modifieLe,
      });
      let blobDriveId = etat?.blobDriveId;
      if (!blobDriveId && blob) {
        const extension = table === 'photos' ? 'jpg' : 'pdf';
        const blobExistant = await trouverParNom(espace, `${cle}.${extension}`);
        blobDriveId = blobExistant
          ? blobExistant.id
          : (await depot.ecrire(espace, `${cle}.${extension}`, blob)).id;
        await memoriserEtat({ table, cle, driveId: fichierMeta.id, blobDriveId, modifieLe });
      }
    }
    envoyes.push(changement);
  }

  await confirmerEnvoi(envoyes);

  // --- Paramètres ----------------------------------------------------------
  const reglagesEcrases = await synchroniserParametres(depot, appareil);

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
   * référence. On le signale sans rien renuméroter - une référence figure sur un
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
    reglagesEcrases,
    saisiesRemplacees,
  };
}

/**
 * Le singleton suit ses propres règles de fusion (protocole §4.6).
 *
 * Il n'a **pas de date de modification** : impossible de savoir par horodatage
 * qui a changé quoi. On compare donc, **section par section**, au contenu de la
 * dernière version synchronisée. Sans ces empreintes, le distant l'emporterait
 * à chaque cycle et effacerait les réglages modifiés localement - bailleur,
 * grille de vétusté, catalogue de clauses, modèle de fiche de visite.
 *
 * Renvoie les sections que la fusion a dû trancher au détriment du local.
 */
async function synchroniserParametres(
  depot: DepotDistant,
  appareil: string,
): Promise<SectionParametres[]> {
  const nom = nomFichier('parametres', 'singleton');
  const local = await getParametres();
  // Recherche par nom : lister l'espace `donnees` en entier à chaque cycle
  // coûterait le prix du dépôt tout entier pour un unique fichier.
  const [distantFichier] = await depot.lister('donnees', { nom });
  const etat = await db.syncEtat.get(['parametres', 'singleton']);

  /**
   * Seules les **sections de réglages** servent à détecter un changement : les
   * compteurs de séquence bougent dès qu'un document est généré, sans que
   * l'utilisateur ait touché à sa configuration, et ils fusionnent de toute
   * façon au maximum.
   */
  const compteurs = (p: Parametres) => JSON.stringify(p.compteursSequence);
  const sansConfigDrive = (p: Parametres) => ({ ...p, sauvegardeGDrive: undefined });
  const neuf = empreintesSections(parametresDefaut());

  /*
   * Reprise de l'empreinte d'un seul bloc des versions précédentes : la
   * découper en sections vaut mieux que repartir sans référence, ce qui
   * rejouerait au premier cycle une fusion déjà tranchée.
   */
  let reference = etat?.empreintes;
  if (!reference && etat?.empreinte) {
    try {
      const bloc = JSON.parse(etat.empreinte) as Record<string, unknown>;
      reference = Object.fromEntries(
        SECTIONS_PARAMETRES.map((s) => [s, JSON.stringify(bloc[s] ?? null)]),
      );
    } catch {
      // Empreinte illisible : on repart sans référence, la fusion est prudente.
    }
  }

  let fusionne = local;
  let collisions: SectionParametres[] = [];
  if (distantFichier) {
    const enveloppe = JSON.parse(await depot.lireTexte(distantFichier.id)) as EnveloppeEnregistrement;
    const distant = enveloppe.donnees as Parametres;
    ({ fusionne, collisions } = fusionnerParametres(local, distant, { reference, neuf }));
    if (JSON.stringify(sansConfigDrive(fusionne)) !== JSON.stringify(sansConfigDrive(local))) {
      await sansJournaliser(async () => {
        await db.parametres.put(fusionne);
      });
    }
    // Rien n'a bougé de part et d'autre : ne pas réécrire, sinon l'autre
    // appareil verrait à chaque cycle une « modification » qui n'en est pas une.
    const memesReglages = SECTIONS_PARAMETRES.every(
      (s) => empreintesSections(fusionne)[s] === empreintesSections(distant)[s],
    );
    if (memesReglages && compteurs(fusionne) === compteurs(distant)) {
      await db.syncEtat.put({
        table: 'parametres',
        cle: 'singleton',
        driveId: distantFichier.id,
        modifieLe: enveloppe.modifieLe,
        empreintes: empreintesSections(fusionne),
      });
      return collisions;
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
    empreintes: empreintesSections(fusionne),
  });
  return collisions;
}
