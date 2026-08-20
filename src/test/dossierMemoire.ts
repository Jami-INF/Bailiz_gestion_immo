/**
 * Dossier File System Access en mémoire.
 *
 * L'API n'existe ni dans jsdom ni dans Node : sans ce double, tout ce qui écrit
 * dans le dossier local - le miroir, les archives, la rotation - resterait hors
 * de portée des tests, c'est-à-dire précisément le code qui peut effacer des
 * fichiers chez l'utilisateur.
 *
 * Volontairement partiel : seules les méthodes réellement appelées par
 * l'application sont implémentées. Les tests s'en servent aussi pour inspecter
 * ce qui a été écrit (`lire`, `noms`).
 */
export class DossierMemoire {
  readonly kind = 'directory' as const;
  readonly fichiers = new Map<string, Blob>();
  readonly dossiers = new Map<string, DossierMemoire>();

  constructor(readonly name = 'racine') {}

  async getDirectoryHandle(nom: string, options?: { create?: boolean }): Promise<DossierMemoire> {
    const existant = this.dossiers.get(nom);
    if (existant) return existant;
    if (!options?.create) throw new DOMException(`Dossier absent : ${nom}`, 'NotFoundError');
    const cree = new DossierMemoire(nom);
    this.dossiers.set(nom, cree);
    return cree;
  }

  async getFileHandle(nom: string, options?: { create?: boolean }) {
    if (!this.fichiers.has(nom)) {
      if (!options?.create) throw new DOMException(`Fichier absent : ${nom}`, 'NotFoundError');
      this.fichiers.set(nom, new Blob([]));
    }
    const fichiers = this.fichiers;
    return {
      kind: 'file' as const,
      name: nom,
      async getFile() {
        return fichiers.get(nom)!;
      },
      async createWritable() {
        // `write` remplace le contenu : l'application n'écrit jamais en
        // plusieurs fois dans le même flux.
        return {
          async write(contenu: Blob | string) {
            fichiers.set(nom, typeof contenu === 'string' ? new Blob([contenu]) : contenu);
          },
          async close() {},
        };
      },
    };
  }

  async removeEntry(nom: string): Promise<void> {
    if (!this.fichiers.delete(nom) && !this.dossiers.delete(nom)) {
      throw new DOMException(`Entrée absente : ${nom}`, 'NotFoundError');
    }
  }

  async *values(): AsyncIterableIterator<{ kind: 'file' | 'directory'; name: string }> {
    for (const nom of this.fichiers.keys()) yield { kind: 'file', name: nom };
    for (const nom of this.dossiers.keys()) yield { kind: 'directory', name: nom };
  }

  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }

  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }

  // --- Aides de test -------------------------------------------------------

  /** Le handle, typé comme l'API attendue par l'application. */
  get handle(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }

  /** Noms des fichiers d'un sous-dossier (`''` pour la racine). */
  noms(chemin = ''): string[] {
    const cible = chemin ? this.dossiers.get(chemin) : this;
    return cible ? [...cible.fichiers.keys()].sort() : [];
  }

  /** Contenu textuel d'un fichier, `undefined` s'il n'existe pas. */
  async lire(chemin: string, nom: string): Promise<string | undefined> {
    const cible = chemin ? this.dossiers.get(chemin) : this;
    return cible?.fichiers.get(nom)?.text();
  }
}
