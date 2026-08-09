import { format } from 'date-fns';
import { db, getParametres } from '@/lib/db';
import { baseSansDonnees, exporterSauvegarde } from '@/lib/backup';
import { estArchiveBailiz } from '@/lib/rotation';
import type { DepotDistant, FichierDistant } from './depot';

/**
 * Instantané : une archive ZIP complète, **jamais fusionnée**, déposée à côté
 * des données synchronisées.
 *
 * La synchronisation maintient une seule version vivante, qui se met à jour
 * toute seule — donc une version qu'un défaut de fusion pourrait abîmer sans
 * retour possible. L'instantané est le filet : figé, daté, restaurable tel quel.
 * Depuis la disparition du mode « archive complète », c'est le **seul** filet,
 * d'où sa cadence resserrée.
 */

/**
 * Une signature rend les données irremplaçables : un état des lieux ou un bail
 * signé ne se ressaisit pas. C'est le moment de figer une copie — mais pas dix
 * fois dans la même journée de saisie, d'où ce plancher.
 */
export const INTERVALLE_SIGNATURE_MS = 24 * 3600 * 1000;

/**
 * Filet de repli pour un appareil qui ne signe rien pendant longtemps :
 * consultation, gestion courante, corrections de fiches.
 */
export const INTERVALLE_INSTANTANE_MS = 7 * 24 * 3600 * 1000;

/**
 * Six archives conservées. Avec une signature par jour cela fait une semaine de
 * recul ; sans signature, un mois et demi. Reste bien plus économe que le mode
 * « archive complète » supprimé, qui en gardait dix et poussait à *chaque*
 * signature sans plancher.
 */
export const INSTANTANES_CONSERVES = 6;

/** Vrai si un instantané est dû. Fonction pure. */
export function instantaneDu(
  dernier: string | undefined,
  options?: { apresSignature?: boolean; maintenant?: number },
): boolean {
  if (!dernier) return true;
  const age = (options?.maintenant ?? Date.now()) - Date.parse(dernier);
  // Une date future (horloge faussée puis corrigée) ne doit pas bloquer les
  // instantanés pour l'éternité.
  if (Number.isNaN(age) || age < 0) return true;
  return age >= (options?.apresSignature ? INTERVALLE_SIGNATURE_MS : INTERVALLE_INSTANTANE_MS);
}

/**
 * Dépose un instantané s'il est dû, et purge les plus anciens.
 *
 * Renvoie `true` si une archive a été créée. Un échec n'est jamais propagé :
 * le filet de sécurité ne doit pas faire échouer la synchronisation qu'il
 * protège.
 */
export async function deposerInstantaneSiDu(
  depot: DepotDistant,
  options?: { apresSignature?: boolean },
): Promise<boolean> {
  const params = await getParametres();
  const config = params.sauvegardeGDrive;
  if (!config) return false;
  if (!instantaneDu(config.dernierInstantane, { apresSignature: options?.apresSignature })) {
    return false;
  }
  // Rien à figer : on n'occupe pas le Drive avec des archives vides, et on ne
  // fait pas tomber la plus ancienne copie utile au profit d'une coquille.
  if (await baseSansDonnees()) return false;

  try {
    const archive = await exporterSauvegarde();
    const nom = `bailiz-sauvegarde-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.zip`;
    await depot.ecrire('archives', nom, archive);

    /*
     * Purge des plus anciennes, **par identifiant** et non par nom : le nom
     * porte la date à la seconde, et deux archives créées dans la même seconde
     * le partageraient. Supprimer par nom les effacerait toutes les deux.
     * Le tri lexical des noms datés vaut tri chronologique.
     */
    const archives = await listerInstantanes(depot);
    const surplus = archives.slice(INSTANTANES_CONSERVES);
    for (const fichier of surplus) {
      await depot.supprimer(fichier.id).catch(() => undefined);
    }

    const frais = await getParametres();
    if (frais.sauvegardeGDrive) {
      await db.parametres.put({
        ...frais,
        sauvegardeGDrive: { ...frais.sauvegardeGDrive, dernierInstantane: new Date().toISOString() },
      });
    }
    return true;
  } catch (e) {
    console.warn('Instantané ignoré :', e);
    return false;
  }
}

/** Instantanés disponibles sur le dépôt, **du plus récent au plus ancien**. */
export async function listerInstantanes(depot: DepotDistant): Promise<FichierDistant[]> {
  return (await depot.lister('archives'))
    .filter((f) => estArchiveBailiz(f.nom))
    .sort((a, b) => b.nom.localeCompare(a.nom));
}
