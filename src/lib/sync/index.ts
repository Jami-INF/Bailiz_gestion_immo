import { db, getParametres } from '@/lib/db';
import { decrireErreur } from '@/lib/erreurs';
import { ouvrirDepotDrive } from './drive';
import { synchroniser, type ResultatCycle } from './cycle';
import { rattraperChangements, viderFileJournalisation } from './journal';
import { deposerInstantaneSiDu } from './instantane';

/**
 * Point d'entrée de la synchronisation : ouvre le dépôt Drive et exécute un
 * cycle. Tout le reste (`cycle.ts`, `protocole.ts`) ignore Google Drive et se
 * teste sans réseau.
 */

/** Vrai si la synchronisation par fichiers est activée sur cet appareil. */
export async function syncActive(): Promise<boolean> {
  const params = await getParametres();
  return Boolean(params.sauvegardeGDrive?.actif && params.sauvegardeGDrive?.syncActive);
}

export async function activerSync(actif: boolean): Promise<void> {
  const params = await getParametres();
  if (!params.sauvegardeGDrive) return;
  await db.parametres.put({
    ...params,
    sauvegardeGDrive: { ...params.sauvegardeGDrive, syncActive: actif },
  });
  if (!actif) {
    /*
     * Le journal continue d'être alimenté même synchronisation éteinte — une
     * suppression ne laisse aucune trace récupérable après coup, on ne peut donc
     * pas se permettre de la manquer. En revanche, il n'a plus d'objet une fois
     * la synchronisation coupée : on le vide plutôt que de le laisser croître.
     */
    await db.changements.clear();
  }
}

/** Dernière cause d'échec d'un cycle, pour l'affichage. */
let derniereErreurSync: string | undefined;

export function derniereErreurCycle(): string | undefined {
  return derniereErreurSync;
}

/** Empêche deux cycles concurrents (bouton + planifié + signature). */
let cycleEnCours = false;

export type ResultatSync = ResultatCycle | { etat: 'erreur' };

/**
 * Exécute un cycle complet si la synchronisation est active.
 *
 * `indisponible` couvre tous les cas où le cycle ne peut pas avoir lieu —
 * synchronisation désactivée, hors-ligne, autorisation Google expirée : ce
 * n'est jamais une erreur, seulement un report.
 */
export async function lancerCycle(
  interactif: boolean,
  options?: { forcerSuppressions?: boolean; ignorerHorloge?: boolean },
): Promise<ResultatSync> {
  if (cycleEnCours) return { etat: 'indisponible' };
  if (!(await syncActive())) return { etat: 'indisponible' };
  cycleEnCours = true;
  try {
    // Les écritures observées par les hooks sont d'abord versées au journal, et
    // le rattrapage récupère ce que les hooks n'ont pas vu (première activation
    // sur une base existante, notamment).
    await viderFileJournalisation();
    await rattraperChangements();

    const depot = await ouvrirDepotDrive(interactif);
    if (!depot) return { etat: 'indisponible' };
    const resultat = await synchroniser(depot, options);
    // Filet hebdomadaire, après un échange réussi seulement : figer un état
    // qu'un garde-fou vient d'interrompre n'aurait pas de sens.
    if (resultat.etat === 'ok') await deposerInstantaneSiDu(depot);
    return resultat;
  } catch (e) {
    console.error('Cycle de synchronisation interrompu :', e);
    derniereErreurSync = decrireErreur(e);
    return { etat: 'erreur' };
  } finally {
    cycleEnCours = false;
  }
}

export { compterEnAttente } from './journal';
export type { ResultatCycle, RaisonBlocage } from './cycle';
