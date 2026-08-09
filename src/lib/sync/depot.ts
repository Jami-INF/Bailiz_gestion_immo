/**
 * Contrat du dépôt distant, indépendant de Google Drive.
 *
 * Le cycle de synchronisation ne parle qu'à cette interface : il est ainsi
 * testable de bout en bout sans réseau (dépôt en mémoire), et un autre
 * hébergement resterait possible sans toucher aux règles de convergence.
 */

/** Un des quatre espaces du dépôt. */
export type Espace = 'donnees' | 'photos' | 'documents' | 'tombstones' | 'archives';

export interface FichierDistant {
  /** Identifiant propre au dépôt (id Drive). */
  id: string;
  nom: string;
  /** Date de modification **côté serveur** : seule référence commune aux appareils. */
  modifieLe: string;
}

/** Critères de listage, cumulables. Sans filtre : tout l'espace. */
export interface FiltreListe {
  /** Ne renvoyer que les fichiers modifiés après cette date (heure **serveur**). */
  depuis?: string;
  /**
   * Ne renvoyer que les fichiers portant exactement ce nom. Le dépôt n'impose
   * pas l'unicité des noms : retrouver un fichier par son nom est le seul moyen
   * de reprendre la main sur celui qu'un envoi interrompu a laissé derrière lui.
   */
  nom?: string;
}

export interface DepotDistant {
  lister(espace: Espace, filtre?: FiltreListe): Promise<FichierDistant[]>;
  lireTexte(id: string): Promise<string>;
  lireBlob(id: string): Promise<Blob>;
  /**
   * Crée ou remplace un fichier ; renvoie sa description à jour.
   *
   * `idExistant` désigne le fichier à mettre à jour. S'il a disparu du dépôt
   * (supprimé depuis un autre appareil), le contenu est **recréé** plutôt que
   * de faire échouer le cycle : l'identifiant renvoyé peut donc différer de
   * celui passé, et c'est celui-là qu'il faut mémoriser.
   */
  ecrire(
    espace: Espace,
    nom: string,
    contenu: Blob | string,
    idExistant?: string,
  ): Promise<FichierDistant>;
  supprimer(id: string): Promise<void>;
  /** Heure du serveur, pour mesurer l'écart d'horloge de l'appareil. */
  heureServeur(): Promise<string>;
}
