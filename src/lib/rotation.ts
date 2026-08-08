/** Rotation des archives de sauvegarde, partagée entre le dossier local et Google Drive. */

const NB_SAUVEGARDES_CONSERVEES = 10;
const MOTIF_FICHIER_SAUVEGARDE = /^bailiz-sauvegarde-.*\.zip$/;

/** Vrai si le fichier est une archive produite par l'application. */
export function estArchiveBailiz(nom: string): boolean {
  return MOTIF_FICHIER_SAUVEGARDE.test(nom);
}

/** Sauvegardes excédentaires à supprimer (les plus anciennes, tri lexical = tri chronologique). */
export function fichiersASupprimer(noms: string[], garder = NB_SAUVEGARDES_CONSERVEES): string[] {
  const archives = noms.filter((n) => MOTIF_FICHIER_SAUVEGARDE.test(n)).sort();
  return archives.slice(0, Math.max(0, archives.length - garder));
}
