import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { db, lireParametres } from '@/lib/db';
import { desParametres, rendre, utilisateur, viderBase } from '@/test/utils';
import { ParametresPage } from './ParametresPage';
import { ClausesBailPanel } from './ClausesBailPanel';
import { FicheVisitePanel } from './FicheVisitePanel';

/**
 * Concurrence des écritures dans les Paramètres.
 *
 * Les champs de ces panneaux n'écrivent qu'au `blur`, et les boutons voisins
 * - « Ajouter », la corbeille, une case à cocher, « Enregistrer » - partent au
 * `click` qui suit immédiatement. Entre les deux, aucun rafraîchissement :
 * `useLiveQuery` ne rend la nouvelle valeur qu'après un aller-retour
 * IndexedDB. Chaque écriture doit donc se calculer sur l'enregistrement relu
 * en base, sinon la seconde efface la première.
 *
 * Le piège est plus large qu'un panneau : `parametres` est un **singleton**, et
 * quatre panneaux de cette page le réécrivent en entier. Un panneau qui pose
 * son champ depuis un instantané périmé annule le travail d'un autre - et le
 * fait sous un message de succès.
 */

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
  await db.sauvegardeAuto.clear();
  // `CarteRepliable` retient son pli dans `localStorage`.
  localStorage.clear();
  await db.parametres.put(
    desParametres({
      grilleVetuste: [
        { poste: 'Peinture', dureeVieAnnees: 10, franchiseAnnees: 2, abattementAnnuelPct: 10 },
        { poste: 'Moquette', dureeVieAnnees: 7, franchiseAnnees: 1, abattementAnnuelPct: 15 },
      ],
    }),
  );
});

const deplier = async (motif: RegExp) =>
  utilisateur().click(await screen.findByRole('button', { name: motif }));

describe('grille de vétusté', () => {
  it('conserve le poste en cours de saisie quand on en ajoute un autre', async () => {
    const u = utilisateur();
    rendre(<ParametresPage />);
    await deplier(/vétusté/);

    const champ = await screen.findByDisplayValue('Peinture');
    await u.clear(champ);
    await u.type(champ, 'Parquet');
    await u.click(screen.getByRole('button', { name: /Ajouter un poste/ }));

    await vi.waitFor(async () => {
      expect((await lireParametres()).grilleVetuste).toHaveLength(3);
    });
    const grille = (await lireParametres()).grilleVetuste;
    expect(grille.map((g) => g.poste)).toEqual(['Parquet', 'Moquette', 'Nouveau poste']);
  });

  it('conserve la durée en cours de saisie quand on supprime une autre ligne', async () => {
    const u = utilisateur();
    rendre(<ParametresPage />);
    await deplier(/vétusté/);

    const ligne = (await screen.findByDisplayValue('Moquette')).closest('tr')!;
    const duree = within(ligne).getAllByRole('spinbutton')[0];
    await u.clear(duree);
    await u.type(duree, '9');
    // La corbeille de la *première* ligne, depuis le champ de la seconde.
    await u.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);

    await vi.waitFor(async () => {
      expect((await lireParametres()).grilleVetuste).toHaveLength(1);
    });
    expect((await lireParametres()).grilleVetuste[0]).toMatchObject({
      poste: 'Moquette',
      dureeVieAnnees: 9,
    });
  });
});

describe('clauses du bail', () => {
  it('conserve le titre en cours de saisie quand on ajoute une clause', async () => {
    const u = utilisateur();
    rendre(<ClausesBailPanel />);
    await deplier(/Clauses du bail/);

    const avant = (await lireParametres()).clausesBail!;
    const premiere = avant[0];
    await u.click(await screen.findByRole('button', { name: new RegExp(premiere.titre.slice(0, 20)) }));

    const champ = await screen.findByDisplayValue(premiere.titre);
    await u.clear(champ);
    await u.type(champ, 'Titre réécrit');
    await u.click(screen.getAllByRole('button', { name: /Ajouter une clause/ })[0]);

    await vi.waitFor(async () => {
      expect((await lireParametres()).clausesBail!).toHaveLength(avant.length + 1);
    });
    const apres = (await lireParametres()).clausesBail!;
    expect(apres.find((c) => c.id === premiere.id)?.titre).toBe('Titre réécrit');
  });
});

describe('fiche de visite', () => {
  it('conserve le texte en cours de saisie quand on coche un bloc', async () => {
    const u = utilisateur();
    rendre(<FicheVisitePanel />);
    await deplier(/[Ff]iche/);

    const zones = await screen.findAllByRole('textbox');
    await u.clear(zones[0]);
    await u.type(zones[0], 'Texte réécrit');
    // La case écrit sur `onChange`, donc juste après le `blur` du champ.
    await u.click(screen.getAllByRole('checkbox')[0]);

    await vi.waitFor(async () => {
      const m = (await lireParametres()).ficheVisite!;
      expect(Object.values(m.blocs).some((v) => v === false)).toBe(true);
    });
    expect(JSON.stringify((await lireParametres()).ficheVisite)).toContain('Texte réécrit');
  });
});

describe('singleton partagé entre panneaux', () => {
  it('ne perd pas la grille quand le panneau Bailleur enregistre juste après', async () => {
    const u = utilisateur();
    rendre(<ParametresPage />);

    // Deux cartes dépliées en même temps : usage tout à fait normal.
    await deplier(/Bailleur/);
    await deplier(/vétusté/);

    const champ = await screen.findByDisplayValue('Peinture');
    await u.clear(champ);
    await u.type(champ, 'Parquet');
    // « Enregistrer » du panneau Bailleur réécrit tout le singleton.
    await u.click(screen.getByRole('button', { name: /Enregistrer/ }));

    await vi.waitFor(() =>
      expect(screen.getByText(/Identité du bailleur enregistrée/)).toBeInTheDocument(),
    );
    const p = await lireParametres();
    expect(p.grilleVetuste[0].poste).toBe('Parquet');
    expect(p.bailleur.nom).toBe('Infante');
  });
});
