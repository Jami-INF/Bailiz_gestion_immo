import { useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { decrireErreur } from '@/lib/erreurs';

/**
 * Empêche une action asynchrone de repartir avant la fin de la précédente.
 *
 * Écrit pour les boutons qui produisent un document : chaque appel tire une
 * référence neuve (`prochaineReference`) puis archive un PDF, si bien qu'un
 * double-clic produisait deux documents et consommait deux numéros de
 * séquence. Le dédoublonnage d'`enregistrerDocument` ne pouvait pas les
 * rapprocher - il se fait par référence, et elles diffèrent.
 *
 * `disabled={enCours}` ne suffit pas à lui seul : l'attribut n'apparaît qu'au
 * rendu suivant, et deux clics partis avant celui-ci passeraient tous les
 * deux. La garde réelle est donc le verrou en `ref`, posé et lu dans le même
 * tour de boucle ; l'état, lui, ne sert qu'à griser le bouton.
 *
 * L'action est appelée depuis une promesse déjà résolue pour qu'une exception
 * **synchrone** libère le verrou elle aussi : sans cela, un bouton restait
 * grisé jusqu'au rechargement de la page - panne pire que le double-clic
 * qu'on cherche à éviter.
 *
 * Un échec non rattrapé par l'action est **affiché**, et pas seulement
 * journalisé. La console n'existe pas sur la tablette où ces boutons servent :
 * une génération qui échouait - stockage saturé, le cas réaliste avec des
 * photos - dégrisait le bouton sans un mot, et l'utilisateur recliquait en
 * croyant à un geste manqué. Les actions qui savent déjà prévenir
 * l'utilisateur gardent la main : leur promesse ne rejette pas et rien ne
 * passe ici.
 *
 * Le message est posé ici plutôt que sur chaque bouton : c'est le seul endroit
 * que tous les appelants traversent, et il n'y avait pas un seul `catch` dans
 * les quatre écrans qui génèrent un PDF. Il parle de « document » parce que
 * tous les appelants en produisent un ; une autre sorte d'action demanderait de
 * le paramétrer.
 */
export function useActionUnique(): {
  enCours: boolean;
  lancer: (action: () => Promise<unknown>) => void;
} {
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);
  const verrou = useRef(false);

  const lancer = (action: () => Promise<unknown>) => {
    if (verrou.current) return;
    verrou.current = true;
    setEnCours(true);
    void Promise.resolve()
      .then(action)
      .catch((e: unknown) => {
        console.error('Action interrompue :', e);
        toast('error', `Échec de la génération du document - ${decrireErreur(e)}`);
      })
      .finally(() => {
        verrou.current = false;
        setEnCours(false);
      });
  };

  return { enCours, lancer };
}
