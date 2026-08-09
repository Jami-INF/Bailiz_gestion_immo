import { db, getParametres } from '@/lib/db';
import { decrireErreur } from '@/lib/erreurs';
import { ouvrirDepotDrive } from './drive';
import {
  synchroniser,
  type RaisonBlocage,
  type ResultatCycle,
  type SaisieRemplacee,
} from './cycle';
import { rattraperChangements, viderFileJournalisation } from './journal';
import { deposerInstantaneSiDu, listerInstantanes } from './instantane';

/**
 * Point d'entrée de la synchronisation : ouvre le dépôt Drive et exécute un
 * cycle. Tout le reste (`cycle.ts`, `protocole.ts`) ignore Google Drive et se
 * teste sans réseau.
 */

/**
 * Intervalle entre deux cycles quand l'application est simplement ouverte, sans
 * qu'on y saisisse rien.
 *
 * Sans ce battement, un appareil qui ne fait que consulter ne verrait jamais ce
 * que l'autre a saisi : tous les autres déclencheurs sont liés à une écriture
 * locale. Cinq minutes : assez court pour que l'iPad posé à côté du poste fixe
 * reste à jour, assez long pour ne pas peser sur le quota Drive ni la batterie.
 */
export const INTERVALLE_SYNC_MS = 5 * 60 * 1000;

/**
 * Vrai si cet appareil échange avec le Drive.
 *
 * Il n'y a **plus qu'un seul mode** : brancher le Drive, c'est synchroniser.
 * L'interrupteur d'antan (`syncActive`) laissait coexister un mode « archive
 * complète » dont chaque couture avec le cycle a produit un défaut — date de
 * sauvegarde partagée, vocabulaires de résultat mélangés, garde-fou de
 * divergence sans objet. Pour ne pas synchroniser, on déconnecte le Drive.
 */
export async function syncActive(): Promise<boolean> {
  return Boolean((await getParametres()).sauvegardeGDrive?.actif);
}

/**
 * Vide le journal quand le Drive n'est pas connecté. À appeler au démarrage.
 *
 * Les hooks l'alimentent quoi qu'il arrive — une suppression ne laisse aucune
 * trace récupérable après coup, on ne peut pas se permettre de la manquer —
 * mais il n'a aucun objet sans Drive, et grossirait indéfiniment sur les
 * appareils qui n'en auront jamais.
 */
export async function purgerJournalSiInactif(): Promise<void> {
  if (await syncActive()) return;
  await db.changements.clear();
}

/** Dernière cause d'échec d'un cycle, pour l'affichage. */
let derniereErreurSync: string | undefined;

export function derniereErreurCycle(): string | undefined {
  return derniereErreurSync;
}

/**
 * Santé de la synchronisation, telle qu'affichée à l'utilisateur.
 *
 * Tout ce qui empêche les deux appareils de converger doit **se voir**. C'était
 * le trou le plus grave : le battement lance un cycle toutes les cinq minutes
 * sans lire son résultat, si bien qu'une horloge décalée ou un garde-fou
 * déclenché arrêtait la synchronisation pour des jours, en silence. Sur un
 * outil dont tout l'intérêt est que l'ordinateur imprime ce que l'iPad a saisi,
 * c'est la pire défaillance possible : invisible et durable.
 */
export type EtatSync =
  | { etat: 'ok' }
  | { etat: 'en_cours' }
  /** Autorisation Google à renouveler : un geste de l'utilisateur est requis. */
  | { etat: 'reconnexion' }
  /** Un garde-fou a interrompu le cycle ; la résolution est dans les Paramètres. */
  | { etat: 'bloque'; raison: RaisonBlocage; details?: string }
  | { etat: 'erreur'; details?: string };

/*
 * Petit magasin observable plutôt qu'un état React : le battement vit hors de
 * l'arbre de composants, et c'est lui qui découvre les problèmes.
 */
let etatCourant: EtatSync = { etat: 'ok' };
/**
 * Saisies locales abandonnées au profit d'une version distante plus récente,
 * accumulées jusqu'à ce que l'utilisateur en prenne acte.
 *
 * Séparé de la santé du cycle, parce que ce n'est pas une panne : la
 * synchronisation fonctionne, elle a simplement tranché — et il faut le dire.
 * Accumulé et non remplacé : le battement tourne en arrière-plan, et deux
 * cycles consécutifs ne doivent pas effacer l'avertissement du premier.
 */
let saisiesPerdues: SaisieRemplacee[] = [];
const abonnes = new Set<() => void>();

export function etatSync(): EtatSync {
  return etatCourant;
}

export function saisiesRemplacees(): SaisieRemplacee[] {
  return saisiesPerdues;
}

/** À appeler quand l'utilisateur a vu l'avertissement. */
export function oublierSaisiesRemplacees(): void {
  if (saisiesPerdues.length === 0) return;
  saisiesPerdues = [];
  prevenir();
}

export function abonnerEtatSync(rappel: () => void): () => void {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

function prevenir(): void {
  for (const rappel of abonnes) rappel();
}

function definirEtat(nouveau: EtatSync): void {
  // Comparaison structurelle : le battement repasse toutes les cinq minutes, et
  // notifier à chaque fois ferait re-rendre l'interface pour rien.
  if (JSON.stringify(etatCourant) === JSON.stringify(nouveau)) return;
  etatCourant = nouveau;
  prevenir();
}

function ajouterSaisiesPerdues(nouvelles: SaisieRemplacee[]): void {
  if (nouvelles.length === 0) return;
  // Une même fiche peut être écrasée à plusieurs cycles : ne la lister qu'une fois.
  const connues = new Set(saisiesPerdues.map((s) => `${s.table}__${s.cle}`));
  const inedites = nouvelles.filter((s) => !connues.has(`${s.table}__${s.cle}`));
  if (inedites.length === 0) return;
  saisiesPerdues = [...saisiesPerdues, ...inedites];
  prevenir();
}

/** Empêche deux cycles concurrents (bouton + planifié + signature). */
let cycleEnCours = false;

export type ResultatSync = ResultatCycle | { etat: 'erreur' } | { etat: 'ignore' };

/**
 * Exécute un cycle complet si la synchronisation est active.
 *
 * Deux non-résultats, à ne surtout pas confondre :
 * - `ignore` — il n'y avait rien à tenter : Drive non connecté, ou un cycle
 *   déjà en cours. Sans conséquence, et **jamais** de quoi alerter : avec un
 *   battement toutes les cinq minutes, croiser un cycle en cours est banal, et
 *   le signaler comme une autorisation expirée enverrait l'utilisateur
 *   reconnecter un Drive qui fonctionne très bien.
 * - `indisponible` — le dépôt n'a pas pu être ouvert : hors-ligne, ou
 *   autorisation Google à renouveler. Là, il y a quelque chose à faire.
 */
export async function lancerCycle(
  interactif: boolean,
  options?: {
    forcerSuppressions?: boolean;
    ignorerHorloge?: boolean;
    /** Un document vient d'être signé : abaisse le seuil de l'instantané. */
    apresSignature?: boolean;
  },
): Promise<ResultatSync> {
  // Un cycle déjà en cours ne dit rien de plus : ne pas toucher au signal.
  if (cycleEnCours) return { etat: 'ignore' };
  if (!(await syncActive())) {
    // Drive déconnecté : plus rien à signaler. Sans cette remise à zéro, un
    // avertissement resterait affiché pour toujours après une déconnexion —
    // plus aucun cycle n'atteindrait le code qui l'éteint.
    definirEtat({ etat: 'ok' });
    return { etat: 'ignore' };
  }
  cycleEnCours = true;
  /*
   * « En cours » ne recouvre jamais un avertissement déjà affiché. Le battement
   * repasse toutes les cinq minutes : sans cette réserve, le bandeau
   * « Reconnecter » disparaîtrait puis reviendrait à chaque tour — y compris
   * sous le doigt de qui s'apprête à le toucher.
   */
  if (etatCourant.etat === 'ok') definirEtat({ etat: 'en_cours' });
  try {
    // Les écritures observées par les hooks sont d'abord versées au journal, et
    // le rattrapage récupère ce que les hooks n'ont pas vu (première activation
    // sur une base existante, notamment).
    await viderFileJournalisation();
    await rattraperChangements();

    const depot = await ouvrirDepotDrive(interactif);
    if (!depot) {
      /*
       * Hors-ligne ou autorisation périmée : le dépôt ne fait pas la
       * différence. Seul le second cas appelle un geste — inviter à
       * « reconnecter Google » quelqu'un qui est simplement dans un ascenseur
       * serait un mensonge, et lui ferait chercher une panne inexistante.
       */
      definirEtat(navigator.onLine ? { etat: 'reconnexion' } : { etat: 'ok' });
      return { etat: 'indisponible' };
    }
    const resultat = await synchroniser(depot, options);
    /*
     * Le résultat doit remonter jusqu'à l'écran, y compris — surtout — quand le
     * cycle vient du battement, que personne ne regarde. Un garde-fou
     * déclenché arrête la synchronisation jusqu'à décision de l'utilisateur :
     * le taire reviendrait à laisser l'ordinateur imprimer d'anciennes données
     * en croyant être à jour.
     */
    if (resultat.etat === 'ok') {
      definirEtat({ etat: 'ok' });
      ajouterSaisiesPerdues(resultat.saisiesRemplacees);
    }
    else if (resultat.etat === 'bloque') {
      definirEtat({ etat: 'bloque', raison: resultat.raison, details: resultat.details });
    }
    // Filet, après un échange réussi seulement : figer un état qu'un garde-fou
    // vient d'interrompre n'aurait pas de sens.
    if (resultat.etat === 'ok') {
      await deposerInstantaneSiDu(depot, { apresSignature: options?.apresSignature });
    }
    return resultat;
  } catch (e) {
    console.error('Cycle de synchronisation interrompu :', e);
    derniereErreurSync = decrireErreur(e);
    definirEtat({ etat: 'erreur', details: derniereErreurSync });
    return { etat: 'erreur' };
  } finally {
    cycleEnCours = false;
  }
}

/** Un instantané proposé à la restauration. */
export interface InstantaneDisponible {
  id: string;
  nom: string;
  /** Date lue dans le nom du fichier : c'est l'heure de l'appareil qui l'a pris. */
  date: Date;
}

/**
 * Instantanés restaurables, du plus récent au plus ancien.
 *
 * `null` si le Drive est inaccessible — sans autorisation valide, ce n'est pas
 * une erreur, seulement un report.
 */
export async function instantanesDisponibles(): Promise<InstantaneDisponible[] | null> {
  const depot = await ouvrirDepotDrive(true);
  if (!depot) return null;
  return (await listerInstantanes(depot)).map((f) => ({
    id: f.id,
    nom: f.nom,
    date: new Date(f.modifieLe),
  }));
}

/**
 * Télécharge un instantané pour le passer à l'import ZIP existant.
 *
 * On ne restaure pas soi-même : `importerSauvegarde` sait déjà relire une
 * archive, et lui confier le travail évite d'avoir deux chemins de
 * restauration qui divergeraient — c'est précisément le genre de doublon dont
 * on vient de se débarrasser.
 */
export async function telechargerInstantane(id: string): Promise<Blob | null> {
  const depot = await ouvrirDepotDrive(true);
  if (!depot) return null;
  return depot.lireBlob(id);
}

export { compterEnAttente } from './journal';
export type { ResultatCycle, RaisonBlocage, SaisieRemplacee } from './cycle';
export { LIBELLE_SECTION } from './protocole';
export type { SectionParametres } from './protocole';
