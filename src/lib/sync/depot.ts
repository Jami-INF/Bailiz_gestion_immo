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

export interface DepotDistant {
  /** Fichiers d'un espace modifiés après `depuis` (toutes les entrées si absent). */
  lister(espace: Espace, depuis?: string): Promise<FichierDistant[]>;
  lireTexte(id: string): Promise<string>;
  lireBlob(id: string): Promise<Blob>;
  /** Crée ou remplace un fichier ; renvoie sa description à jour. */
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
