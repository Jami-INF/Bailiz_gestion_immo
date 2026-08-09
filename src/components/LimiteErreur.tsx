import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Dernier rempart : une exception pendant le rendu ne doit jamais vider l'écran.
 *
 * React démonte **tout l'arbre** dès qu'un composant lève, et l'application
 * devient alors une page blanche : plus de navigation, plus de moyen d'atteindre
 * la fiche fautive pour la corriger ou la supprimer. C'est arrivé pour un seul
 * bail dont un champ manquait — un défaut mineur transformé en blocage total.
 *
 * Cette limite contient les dégâts à la zone de contenu : la navigation reste
 * là, et l'utilisateur peut aller ailleurs.
 */
interface Etat {
  erreur: Error | null;
}

export class LimiteErreur extends Component<{ children: ReactNode }, Etat> {
  state: Etat = { erreur: null };

  static getDerivedStateFromError(erreur: Error): Etat {
    return { erreur };
  }

  componentDidCatch(erreur: Error, infos: ErrorInfo) {
    // Trace complète en console : sans serveur, c'est le seul journal disponible
    // pour comprendre après coup ce qui a échoué.
    console.error('Rendu interrompu :', erreur, infos.componentStack);
  }

  reessayer = () => this.setState({ erreur: null });

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;

    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
          <h1 className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
            <AlertTriangle size={18} /> Cet écran n'a pas pu s'afficher
          </h1>
          <p className="mb-3 text-sm text-amber-800">
            Vos données sont intactes — rien n'a été modifié. Le plus souvent, une fiche
            incomplète empêche l'affichage de la liste qui la contient. Utilisez le menu pour
            aller ailleurs, ou réessayez.
          </p>
          <p className="mb-4 break-words rounded-lg bg-white/60 p-2 font-mono text-xs text-amber-900">
            {erreur.message}
          </p>
          <button
            type="button"
            onClick={this.reessayer}
            className="min-h-touch rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }
}
