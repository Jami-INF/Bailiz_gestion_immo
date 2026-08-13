import { createContext, useContext } from 'react';

/**
 * Lien entre un `Field` et le contrôle qu'il étiquette. Hors d'un `Field`
 * (recherche, filtres…), le contexte est vide et rien ne change.
 *
 * Dans un fichier à part parce que deux composants le consomment : `Input` et
 * ses variantes, et `DateInput`, qui compose son propre balisage (champ texte +
 * sélecteur natif superposé) et ne peut donc pas passer par `Input`.
 */
export interface ContexteChamp {
  id: string;
  messageId?: string;
}

export const ChampContext = createContext<ContexteChamp | null>(null);

/**
 * Identifiant et description hérités du `Field` englobant, si le contrôle n'en
 * fixe pas lui-même.
 *
 * Volontairement sans état ni compteur : toute tentative de n'attribuer
 * l'identifiant qu'au « premier » contrôle suppose de retenir qui l'a pris, et
 * `StrictMode` rejoue le rendu - l'identifiant était attribué au premier
 * passage puis retiré au second, si bien que le libellé se retrouvait orphelin
 * en production alors que les tests passaient. La règle est donc :
 * **un `Field`, un contrôle.** Deux contrôles à étiqueter valent deux `Field`.
 */
export function useLiaisonChamp(idExplicite?: string, describedBy?: string) {
  const contexte = useContext(ChampContext);
  return {
    id: idExplicite ?? contexte?.id,
    'aria-describedby': describedBy ?? contexte?.messageId,
  };
}
