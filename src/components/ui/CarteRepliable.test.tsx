import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { rendre, utilisateur } from '@/test/utils';
import { CarteRepliable } from './CarteRepliable';

/**
 * `?ouvrir=<identifiant>` : désigner une carte depuis l'extérieur de l'écran.
 *
 * Les pages outils du site vitrine renvoyaient vers les Paramètres, c'est-à-dire
 * en haut d'une pile de cartes fermées, sans aucun moyen de pointer celle qu'on
 * venait de décrire au lecteur. Et comme le contenu replié n'est pas monté, la
 * recherche du navigateur ne le rattrapait pas non plus.
 */

beforeEach(() => {
  localStorage.clear();
});

const carte = (
  <CarteRepliable identifiant="vetuste" titre="Grille de vétusté" resume="2 postes">
    <p>Durée de vie</p>
  </CarteRepliable>
);

describe('CarteRepliable', () => {
  it('reste repliée sans paramètre, et montre son résumé', () => {
    rendre(carte);
    expect(screen.queryByText('Durée de vie')).not.toBeInTheDocument();
    expect(screen.getByText('2 postes')).toBeInTheDocument();
  });

  it('s’ouvre quand l’URL la désigne', () => {
    rendre(carte, { route: '/parametres?ouvrir=vetuste' });
    expect(screen.getByText('Durée de vie')).toBeInTheDocument();
  });

  it('passe outre un pli enregistré : le lien entrant doit gagner', () => {
    localStorage.setItem('bailiz.replie.vetuste', '0');
    rendre(carte, { route: '/parametres?ouvrir=vetuste' });
    expect(screen.getByText('Durée de vie')).toBeInTheDocument();
  });

  it('ne touche pas aux autres cartes', () => {
    rendre(carte, { route: '/parametres?ouvrir=clauses' });
    expect(screen.queryByText('Durée de vie')).not.toBeInTheDocument();
  });

  it('reste refermable après avoir été ouverte par l’URL', async () => {
    const u = utilisateur();
    rendre(carte, { route: '/parametres?ouvrir=vetuste' });
    await u.click(screen.getByRole('button', { name: /Grille de vétusté/ }));
    expect(screen.queryByText('Durée de vie')).not.toBeInTheDocument();
  });
});
