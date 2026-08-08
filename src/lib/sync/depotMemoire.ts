import type { DepotDistant, Espace, FichierDistant } from './depot';

/**
 * Dépôt en mémoire, pour rejouer un cycle complet sans réseau. Deux appareils
 * de test partagent la même instance : c'est ainsi qu'on éprouve les scénarios
 * qui font perdre des données (création parallèle, suppression, coupure).
 *
 * Réservé aux tests, mais placé hors des fichiers `.test.ts` pour être partagé
 * entre plusieurs suites.
 */
export class DepotMemoire implements DepotDistant {
  private fichiers = new Map<
    string,
    { id: string; espace: Espace; nom: string; modifieLe: string; contenu: Blob | string }
  >();
  private compteur = 0;
  /**
   * Horloge du « serveur », avançable à la main. Calée sur l'heure réelle par
   * défaut : sinon le garde-fou d'écart d'horloge bloquerait tous les tests.
   */
  public maintenant = new Date();
  /** Nombre d'écritures avant de simuler une coupure (0 = illimité). */
  public couperApres = 0;
  public ecritures = 0;

  avancer(secondes: number): void {
    this.maintenant = new Date(this.maintenant.getTime() + secondes * 1000);
  }

  async lister(espace: Espace, depuis?: string): Promise<FichierDistant[]> {
    return [...this.fichiers.values()]
      .filter((f) => f.espace === espace)
      .filter((f) => !depuis || Date.parse(f.modifieLe) > Date.parse(depuis))
      .map((f) => ({ id: f.id, nom: f.nom, modifieLe: f.modifieLe }));
  }

  async lireTexte(id: string): Promise<string> {
    const f = this.fichiers.get(id);
    if (!f) throw new Error(`Fichier absent : ${id}`);
    return typeof f.contenu === 'string' ? f.contenu : f.contenu.text();
  }

  async lireBlob(id: string): Promise<Blob> {
    const f = this.fichiers.get(id);
    if (!f) throw new Error(`Fichier absent : ${id}`);
    return typeof f.contenu === 'string' ? new Blob([f.contenu]) : f.contenu;
  }

  async ecrire(
    espace: Espace,
    nom: string,
    contenu: Blob | string,
    idExistant?: string,
  ): Promise<FichierDistant> {
    this.ecritures++;
    if (this.couperApres && this.ecritures > this.couperApres) {
      throw new Error('Coupure réseau simulée');
    }
    const id = idExistant ?? `f${++this.compteur}`;
    const modifieLe = this.maintenant.toISOString();
    this.fichiers.set(id, { id, espace, nom, modifieLe, contenu });
    return { id, nom, modifieLe };
  }

  async supprimer(id: string): Promise<void> {
    this.fichiers.delete(id);
  }

  async heureServeur(): Promise<string> {
    return this.maintenant.toISOString();
  }

  /** Aide de test : contenu textuel d'un fichier par son nom. */
  async contenuParNom(espace: Espace, nom: string): Promise<string | undefined> {
    const f = [...this.fichiers.values()].find((x) => x.espace === espace && x.nom === nom);
    return f ? this.lireTexte(f.id) : undefined;
  }

  compter(espace: Espace): number {
    return [...this.fichiers.values()].filter((f) => f.espace === espace).length;
  }
}
