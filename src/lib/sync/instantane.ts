import { format } from 'date-fns';
import { db, getParametres } from '@/lib/db';
import { exporterSauvegarde } from '@/lib/backup';
import { estArchiveBailiz } from '@/lib/rotation';
import type { DepotDistant } from './depot';

/**
 * Instantané hebdomadaire : une archive ZIP complète, **jamais fusionnée**,
 * déposée à côté des données synchronisées.
 *
 * La synchronisation maintient une seule version vivante, qui se met à jour
 * toute seule — donc une version qu'un défaut de fusion pourrait abîmer sans
 * retour possible. L'instantané est le filet : figé, daté, restaurable tel quel
 * par l'import ZIP existant.
 */

/** Une archive par semaine : au-delà, le coût dépasse le service rendu. */
export const INTERVALLE_INSTANTANE_MS = 7 * 24 * 3600 * 1000;

/** Quatre archives conservées, soit environ un mois de recul. */
export const INSTANTANES_CONSERVES = 4;

/** Vrai si un instantané est dû. Fonction pure. */
export function instantaneDu(dernier: string | undefined, maintenant = Date.now()): boolean {
  if (!dernier) return true;
  const age = maintenant - Date.parse(dernier);
  // Une date future (horloge faussée puis corrigée) ne doit pas bloquer les
  // instantanés pour l'éternité.
  return Number.isNaN(age) || age < 0 || age >= INTERVALLE_INSTANTANE_MS;
}

/**
 * Dépose un instantané s'il est dû, et purge les plus anciens.
 *
 * Renvoie `true` si une archive a été créée. Un échec n'est jamais propagé :
 * le filet de sécurité ne doit pas faire échouer la synchronisation qu'il
 * protège.
 */
export async function deposerInstantaneSiDu(depot: DepotDistant): Promise<boolean> {
  const params = await getParametres();
  const config = params.sauvegardeGDrive;
  if (!config) return false;
  if (!instantaneDu(config.dernierInstantane)) return false;

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
    const archives = (await depot.lister('archives'))
      .filter((f) => estArchiveBailiz(f.nom))
      .sort((a, b) => a.nom.localeCompare(b.nom));
    const surplus = archives.slice(0, Math.max(0, archives.length - INSTANTANES_CONSERVES));
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
    console.warn('Instantané hebdomadaire ignoré :', e);
    return false;
  }
}
