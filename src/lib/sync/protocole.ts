import type { Parametres } from '@/types';

/**
 * Format des fichiers échangés et **règles de convergence**. Tout ce module est
 * pur : aucune écriture, aucun appel réseau. C'est ici que se décide qui gagne
 * quand deux appareils ont modifié la même chose - donc ici que se perdraient
 * des données si la règle était fausse.
 */

/** Enveloppe d'un enregistrement sur le Drive (`donnees/<table>__<cle>.json`). */
export interface EnveloppeEnregistrement {
  table: string;
  cle: string;
  /** Date de la version, en UTC : c'est elle qui arbitre les conflits. */
  modifieLe: string;
  appareil: string;
  donnees: unknown;
}

/** Marqueur de suppression (`tombstones/<table>__<cle>.json`). */
export interface Tombstone {
  table: string;
  cle: string;
  supprimeLe: string;
  appareil: string;
}

/** Nom de fichier plat : les dossiers Drive ne sont interrogeables que par parent. */
export function nomFichier(table: string, cle: string): string {
  return `${table}__${cle}.json`;
}

/** Analyse un nom de fichier plat. `undefined` si le nom ne suit pas la convention. */
export function lireNomFichier(nom: string): { table: string; cle: string } | undefined {
  const sansExtension = nom.replace(/\.json$/, '');
  const separateur = sansExtension.indexOf('__');
  if (separateur <= 0) return undefined;
  return {
    table: sansExtension.slice(0, separateur),
    cle: sansExtension.slice(separateur + 2),
  };
}

/**
 * Date de modification d'un enregistrement, telle qu'utilisée pour arbitrer.
 * `updatedAt` quand l'entité en a un ; sinon la date de création (photos et
 * documents sont immuables) ; sinon l'horodatage du journal, passé en secours.
 */
export function dateModification(donnees: unknown, secours: string): string {
  const enr = donnees as { updatedAt?: string; createdAt?: string; dateCapture?: string } | null;
  return enr?.updatedAt || enr?.createdAt || enr?.dateCapture || secours;
}

export type Decision = 'prendre_distant' | 'garder_local' | 'supprimer_local' | 'rien';

/**
 * Décide du sort d'un enregistrement à la réception.
 *
 * Dernier écrivain gagne, avec deux partis pris explicites :
 * - **à égalité d'horodatage, le distant l'emporte** : la convergence doit être
 *   déterministe des deux côtés, et le Drive fait référence ;
 * - un **tombstone plus récent** que la version locale supprime, y compris si
 *   une version distante vivante existe encore (cas d'un appareil qui a
 *   supprimé après qu'un autre a modifié).
 */
export function deciderReception(params: {
  /** Version locale ; absente si l'enregistrement n'existe pas ici. */
  localModifieLe?: string;
  /** Version distante vivante ; absente si le Drive ne la porte pas (ou plus). */
  distantModifieLe?: string;
  /** Marqueur de suppression distant, s'il en existe un. */
  tombstoneLe?: string;
}): Decision {
  const { localModifieLe, distantModifieLe, tombstoneLe } = params;
  const t = tombstoneLe ? Date.parse(tombstoneLe) : undefined;
  const l = localModifieLe ? Date.parse(localModifieLe) : undefined;
  const d = distantModifieLe ? Date.parse(distantModifieLe) : undefined;

  // Suppression distante : elle l'emporte sur toute version qui lui est antérieure.
  if (t !== undefined) {
    const distantPlusRecent = d !== undefined && d > t;
    if (!distantPlusRecent) {
      if (l === undefined) return 'rien'; // déjà absent des deux côtés
      return l > t ? 'garder_local' : 'supprimer_local';
    }
  }

  if (d === undefined) return 'rien'; // rien à recevoir
  if (l === undefined) return 'prendre_distant'; // création venue de l'autre appareil
  return d >= l ? 'prendre_distant' : 'garder_local';
}

/**
 * Sections de réglages arbitrées **séparément**. Régler les clauses sur le
 * poste fixe pendant qu'on corrige l'adresse du bailleur sur l'iPad est un
 * usage normal à deux appareils : une fusion d'un seul bloc en perdrait une des
 * deux, silencieusement.
 */
export const SECTIONS_PARAMETRES = [
  'bailleur',
  'grilleVetuste',
  'ficheVisite',
  'clausesBail',
] as const;

export type SectionParametres = (typeof SECTIONS_PARAMETRES)[number];

/** Libellés pour les messages destinés à l'utilisateur. */
export const LIBELLE_SECTION: Record<SectionParametres, string> = {
  bailleur: 'coordonnées du bailleur',
  grilleVetuste: 'grille de vétusté',
  ficheVisite: 'modèle de fiche de visite',
  clausesBail: 'catalogue de clauses',
};

/**
 * Empreinte de chaque section : son contenu sérialisé. Les paramètres n'ont
 * pas de date de modification - comparer au contenu de la dernière version
 * synchronisée est le seul moyen de savoir qui, du local ou du distant, a
 * réellement changé.
 */
export function empreintesSections(p: Parametres): Record<SectionParametres, string> {
  return Object.fromEntries(
    SECTIONS_PARAMETRES.map((s) => [s, JSON.stringify(p[s] ?? null)]),
  ) as Record<SectionParametres, string>;
}

export interface FusionParametres {
  fusionne: Parametres;
  /**
   * Sections modifiées **des deux côtés** : la fusion a dû trancher, et la
   * version écartée n'est nulle part. C'est le seul cas de perte, et il doit
   * remonter jusqu'à l'utilisateur.
   */
  collisions: SectionParametres[];
}

/**
 * Fusion du singleton `parametres`. Le dernier-écrivain-gagne ne convient pas :
 * ce document mélange des réglages, des compteurs de séquence et l'état de
 * synchronisation propre à l'appareil.
 *
 * - réglages : **section par section**, chacune arbitrée sur sa propre
 *   empreinte (cf. ci-dessous) ;
 * - compteurs : **maximum**, sinon deux appareils hors-ligne attribueraient la
 *   même référence `BAIL-2026-0007` à deux baux différents ;
 * - `sauvegardeGDrive` : **toujours local**, il décrit cet appareil-ci.
 *
 * Arbitrage d'une section, quand l'empreinte de référence est connue :
 * seul le côté qui a bougé l'emporte ; si les deux ont bougé, **le distant
 * gagne**. Ce dernier choix n'est pas arbitraire : il faut que les deux
 * appareils tranchent dans le même sens, sinon chacun réimposerait sa version
 * au cycle suivant, indéfiniment.
 *
 * Sans empreinte de référence - cet appareil n'a jamais synchronisé - on ne
 * peut que regarder si la section est encore celle d'un appareil neuf : si oui
 * elle n'a rien à défendre et adopte le Drive, sinon elle a été configurée ici
 * et prime. L'autre appareil, lui, dispose d'une référence : il adoptera cette
 * version au cycle suivant, et la convergence est assurée.
 */
export function fusionnerParametres(
  local: Parametres,
  distant: Parametres,
  contexte: {
    /** Empreintes de la dernière version synchronisée, si cet appareil en a une. */
    reference?: Partial<Record<SectionParametres, string>>;
    /** Empreintes d'un appareil neuf, pour reconnaître une section jamais configurée. */
    neuf: Record<SectionParametres, string>;
  },
): FusionParametres {
  const eLocal = empreintesSections(local);
  const eDistant = empreintesSections(distant);
  const collisions: SectionParametres[] = [];

  const prendreDistant = (s: SectionParametres): boolean => {
    if (eLocal[s] === eDistant[s]) return false;
    const reference = contexte.reference?.[s];
    if (reference === undefined) {
      if (eLocal[s] === contexte.neuf[s]) return true;
      collisions.push(s);
      return false;
    }
    const localAChange = eLocal[s] !== reference;
    const distantAChange = eDistant[s] !== reference;
    if (!localAChange) return distantAChange;
    if (!distantAChange) return false;
    collisions.push(s);
    return true;
  };

  const compteurs = (cle: keyof Parametres['compteursSequence']) =>
    Math.max(local.compteursSequence[cle] ?? 0, distant.compteursSequence[cle] ?? 0);

  // L'année sert de remise à zéro : on prend la plus récente, et les compteurs
  // de l'année la plus récente - sinon un appareil resté sur l'an dernier
  // ferait remonter des numéros déjà attribués.
  const anneeLocale = local.compteursSequence.annee ?? 0;
  const anneeDistante = distant.compteursSequence.annee ?? 0;
  const memeAnnee = anneeLocale === anneeDistante;
  const recent = anneeLocale > anneeDistante ? local : distant;

  const fusionne: Parametres = {
    ...local,
    id: 'singleton',
    // Propre à l'appareil : jamais repris du distant.
    sauvegardeGDrive: local.sauvegardeGDrive,
    compteursSequence: memeAnnee
      ? {
          annee: anneeLocale,
          bail: compteurs('bail'),
          edl: compteurs('edl'),
          inventaire: compteurs('inventaire'),
          document: compteurs('document'),
        }
      : { ...recent.compteursSequence },
    derniereSauvegarde:
      [local.derniereSauvegarde, distant.derniereSauvegarde]
        .filter((d): d is string => Boolean(d))
        .sort()
        .pop() ?? undefined,
  };

  for (const section of SECTIONS_PARAMETRES) {
    if (prendreDistant(section)) {
      (fusionne as unknown as Record<string, unknown>)[section] = distant[section];
    }
  }

  return { fusionne, collisions };
}

export interface ReferenceEnDouble {
  table: string;
  reference: string;
  ids: string[];
}

/**
 * Références attribuées deux fois dans une même table.
 *
 * Le cas se produit quand deux appareils hors-ligne créent chacun un bail : la
 * séquence n'ayant pas encore convergé, tous deux attribuent `BAIL-2026-0007`.
 * La fusion des compteurs au maximum empêche que cela se reproduise **ensuite**,
 * mais ne répare pas les deux documents déjà émis.
 *
 * On se contente donc de **signaler** : une référence figure sur un document
 * imprimé, parfois signé, et une renumérotation automatique créerait un écart
 * entre le papier et l'application. C'est au bailleur de trancher.
 */
export function referencesEnDouble(
  table: string,
  enregistrements: { id: string; reference?: string }[],
): ReferenceEnDouble[] {
  const parReference = new Map<string, string[]>();
  for (const e of enregistrements) {
    const reference = e.reference?.trim();
    if (!reference) continue;
    parReference.set(reference, [...(parReference.get(reference) ?? []), e.id]);
  }
  return [...parReference.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([reference, ids]) => ({ table, reference, ids: [...ids].sort() }))
    .sort((a, b) => a.reference.localeCompare(b.reference));
}

/** Écart entre l'horloge de l'appareil et celle du serveur, en millisecondes. */
export function ecartHorloge(heureServeur: string, maintenant = Date.now()): number {
  return Math.abs(Date.parse(heureServeur) - maintenant);
}

/** Au-delà de deux minutes d'écart, l'arbitrage par horodatage n'est plus fiable. */
export const ECART_HORLOGE_MAX_MS = 2 * 60 * 1000;

/**
 * Nombre de suppressions en dessous duquel le garde-fou ne se déclenche jamais.
 * Sans ce plancher, supprimer l'unique locataire d'une base qui n'en compte
 * qu'un serait vu comme une suppression massive : le garde-fou bloquerait
 * l'usage normal au lieu de protéger d'un accident.
 */
export const SUPPRESSIONS_TOLEREES = 5;

/**
 * Vrai si le cycle s'apprête à supprimer une part anormale de la base : un
 * tombstone erroné ne doit pas pouvoir la vider en silence.
 */
export function suppressionMassive(aSupprimer: number, totalLocal: number): boolean {
  if (totalLocal === 0) return false;
  if (aSupprimer < SUPPRESSIONS_TOLEREES) return false;
  return aSupprimer > totalLocal / 2;
}
