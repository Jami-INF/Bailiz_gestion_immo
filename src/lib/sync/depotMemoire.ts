import type { DepotDistant, Espace, FichierDistant, FiltreListe } from './depot';

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
  /**
   * Nombre de listages effectués. Un listage est une requête réseau : c'est la
   * grandeur à surveiller pour qu'une suppression de masse ne dégénère pas en
   * une requête par fiche.
   */
  public listages = 0;

  avancer(secondes: number): void {
    this.maintenant = new Date(this.maintenant.getTime() + secondes * 1000);
  }

  async lister(espace: Espace, filtre?: FiltreListe): Promise<FichierDistant[]> {
    this.listages++;
    return [...this.fichiers.values()]
      .filter((f) => f.espace === espace)
      .filter((f) => !filtre?.depuis || Date.parse(f.modifieLe) > Date.parse(filtre.depuis))
      .filter((f) => !filtre?.nom || f.nom === filtre.nom)
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
    // Fichier disparu entre-temps : le contrat impose de le recréer, avec un
    // identifiant neuf - c'est ce que fait l'API Drive après un 404.
    const id = idExistant && this.fichiers.has(idExistant) ? idExistant : `f${++this.compteur}`;
    /*
     * Le fichier est daté **après** l'heure serveur relevée au début du cycle,
     * comme le fait Drive. Une horloge figée masquerait le fait que tout ce
     * qu'un cycle envoie ressort au listage incrémental du suivant.
     */
    this.maintenant = new Date(this.maintenant.getTime() + 1);
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
