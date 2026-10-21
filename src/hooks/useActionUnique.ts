import { useRef, useState } from 'react';

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
 * Un échec non rattrapé par l'action finit dans la console plutôt qu'en rejet
 * de promesse non traité, ce qu'il était quand ces boutons s'écrivaient
 * `onClick={() => void generer()}`. Les actions qui savent déjà prévenir
 * l'utilisateur gardent la main : leur promesse ne rejette pas et rien ne
 * passe ici.
 */
export function useActionUnique(): {
  enCours: boolean;
  lancer: (action: () => Promise<unknown>) => void;
} {
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
      })
      .finally(() => {
        verrou.current = false;
        setEnCours(false);
      });
  };

  return { enCours, lancer };
}
