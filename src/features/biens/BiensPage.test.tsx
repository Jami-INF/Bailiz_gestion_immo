import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { db } from '@/lib/db';
import { BiensPage } from './BiensPage';
import { rendre, unBail, unBien, utilisateur, viderBase } from '@/test/utils';

const VILLES: [string, string, string][] = [
  ['T2 Chamalières', '63400', 'Chamalières'],
  ['T1 Clermont Gare', '63000', 'Clermont-Ferrand'],
  ['Studio Besançon', '25000', 'Besançon'],
  ['T3 Royat', '63130', 'Royat'],
  ['T2 Aubière', '63170', 'Aubière'],
  ['T4 Beaumont', '63110', 'Beaumont'],
  ['Studio Cournon', '63800', 'Cournon'],
];

async function semerBiens(n = VILLES.length) {
  for (const [i, [nom, codePostal, ville]] of VILLES.slice(0, n).entries()) {
    await db.biens.put(
      unBien({
        id: `bien-${i}`,
        nom,
        adresse: { ligne1: `${i + 1} rue du Test`, codePostal, ville },
        updatedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      }),
    );
  }
}

/** Dernier bien affiché (`Array.at` demanderait une cible ES2022). */
function dernierAffiche(): string {
  const noms = nomsAffiches();
  return noms[noms.length - 1];
}

/** Noms des biens affichés, dans l'ordre du rendu. */
function nomsAffiches(): string[] {
  return screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent ?? '');
}

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
});

describe('liste des biens — barre de recherche', () => {
  it('n’encombre pas une petite liste', async () => {
    await semerBiens(3);
    rendre(<BiensPage />);

    expect(await screen.findByText('T2 Chamalières')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('apparaît dès que la liste commence à défiler', async () => {
    await semerBiens();
    rendre(<BiensPage />);

    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
  });
});

describe('liste des biens — recherche', () => {
  it('trouve malgré les accents', async () => {
    await semerBiens();
    rendre(<BiensPage />);
    await utilisateur().type(await screen.findByRole('searchbox'), 'besancon');

    expect(nomsAffiches()).toEqual(['Studio Besançon']);
    expect(screen.getByText('1 bien sur 7.')).toBeInTheDocument();
  });

  it('cherche aussi dans l’adresse', async () => {
    await semerBiens();
    rendre(<BiensPage />);
    await utilisateur().type(await screen.findByRole('searchbox'), '63130');

    expect(nomsAffiches()).toEqual(['T3 Royat']);
  });

  it('exige tous les mots, sans imposer leur ordre', async () => {
    await semerBiens();
    rendre(<BiensPage />);
    await utilisateur().type(await screen.findByRole('searchbox'), 'studio cournon');

    expect(nomsAffiches()).toEqual(['Studio Cournon']);
  });

  it('propose d’effacer quand rien ne correspond', async () => {
    await semerBiens();
    rendre(<BiensPage />);
    const u = utilisateur();
    await u.type(await screen.findByRole('searchbox'), 'introuvable');

    // Deux messages, volontairement : la ligne d'état (région live, annoncée
    // aux lecteurs d'écran) et l'état vide, qui porte l'action.
    expect(screen.getByText(/Aucun bien ne correspond à « introuvable »/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Aucun bien ne correspond' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: /Afficher toute la liste/ }));
    expect(nomsAffiches()).toHaveLength(7);
  });
});

describe('liste des biens — tri', () => {
  it('classe par nom en respectant les accents', async () => {
    await semerBiens();
    rendre(<BiensPage />);
    await screen.findByRole('searchbox');

    expect(nomsAffiches()[0]).toBe('Studio Besançon');
    expect(dernierAffiche()).toBe('T4 Beaumont');
  });

  it('classe par ville', async () => {
    await semerBiens();
    rendre(<BiensPage />);
    await utilisateur().selectOptions(await screen.findByRole('combobox'), 'ville');

    expect(nomsAffiches()[0]).toBe('T2 Aubière');
  });

  it('remonte les vacants d’abord', async () => {
    await semerBiens();
    // Un seul logement loué : il doit passer en fin de liste.
    await db.baux.put(unBail({ bienId: 'bien-0', statut: 'genere' }));
    rendre(<BiensPage />);
    await utilisateur().selectOptions(await screen.findByRole('combobox'), 'statut');

    expect(dernierAffiche()).toBe('T2 Chamalières');
  });

  it('classe du plus récemment modifié au plus ancien', async () => {
    await semerBiens();
    rendre(<BiensPage />);
    await utilisateur().selectOptions(await screen.findByRole('combobox'), 'recent');

    expect(nomsAffiches()[0]).toBe('Studio Cournon');
  });

  it('ne se laisse pas mettre en échec par une fiche sans date', async () => {
    await semerBiens();
    await db.biens.put(unBien({ id: 'bien-abime', nom: 'Fiche abîmée', updatedAt: undefined as never }));
    rendre(<BiensPage />);
    await utilisateur().selectOptions(await screen.findByRole('combobox'), 'recent');

    // La liste reste affichée et la fiche abîmée part en fin de liste.
    expect(nomsAffiches()).toHaveLength(8);
    expect(dernierAffiche()).toBe('Fiche abîmée');
  });
});

describe('liste des biens — statut d’occupation', () => {
  it('affiche « Loué » dès qu’un bail est enregistré', async () => {
    await semerBiens(1);
    await db.baux.put(unBail({ bienId: 'bien-0', statut: 'genere' }));
    rendre(<BiensPage />);

    const carte = (await screen.findByText('T2 Chamalières')).closest('div')!;
    expect(within(carte).getByText('Loué')).toBeInTheDocument();
  });

  it('affiche « Vacant » quand le bail est terminé', async () => {
    await semerBiens(1);
    await db.baux.put(unBail({ bienId: 'bien-0', statut: 'termine' }));
    rendre(<BiensPage />);

    expect(await screen.findByText('Vacant')).toBeInTheDocument();
  });
});
