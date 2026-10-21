import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { db, lireParametres } from '@/lib/db';
import { GRILLE_VETUSTE_DEFAUT, MODELE_FICHE_VISITE_DEFAUT } from '@/lib/defauts';
import { desParametres, rendre, utilisateur, viderBase } from '@/test/utils';
import { ParametresPage } from './ParametresPage';
import { BailleurPanel } from './BailleurPanel';
import { ClausesBailPanel } from './ClausesBailPanel';
import { FicheVisitePanel } from './FicheVisitePanel';

/**
 * Chaque interaction des panneaux de réglages, une par une.
 *
 * Ces panneaux n'avaient aucun test : les quatre écrivaient le singleton des
 * paramètres en entier depuis un instantané de rendu, et les faire passer par
 * `ecrireParametres` a touché tous leurs gestionnaires. Un refactor pareil ne
 * se vérifie pas en relisant le diff - il se vérifie en rejouant les gestes.
 */

const GRILLE = [
  { poste: 'Peinture', dureeVieAnnees: 10, franchiseAnnees: 2, abattementAnnuelPct: 10 },
  { poste: 'Moquette', dureeVieAnnees: 7, franchiseAnnees: 1, abattementAnnuelPct: 15 },
];

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
  await db.sauvegardeAuto.clear();
  localStorage.clear();
  await db.parametres.put(desParametres({ grilleVetuste: GRILLE }));
});

const deplier = async (motif: RegExp) =>
  utilisateur().click(await screen.findByRole('button', { name: motif }));

const params = () => lireParametres();

describe('grille de vétusté', () => {
  beforeEach(async () => {
    rendre(<ParametresPage />);
    await deplier(/vétusté/);
  });

  it('enregistre le nom d’un poste', async () => {
    const u = utilisateur();
    const champ = await screen.findByDisplayValue('Peinture');
    await u.clear(champ);
    await u.type(champ, 'Parquet flottant');
    await u.tab();

    await vi.waitFor(async () => {
      expect((await params()).grilleVetuste[0].poste).toBe('Parquet flottant');
    });
  });

  it('enregistre les trois champs chiffrés', async () => {
    const u = utilisateur();
    const ligne = (await screen.findByDisplayValue('Peinture')).closest('tr')!;
    const champs = within(ligne).getAllByRole('spinbutton');
    for (const [i, valeur] of [['0', '12'], ['1', '3'], ['2', '8']] as const) {
      await u.clear(champs[Number(i)]);
      await u.type(champs[Number(i)], valeur);
      await u.tab();
    }

    await vi.waitFor(async () => {
      expect((await params()).grilleVetuste[0]).toMatchObject({
        dureeVieAnnees: 12,
        franchiseAnnees: 3,
        abattementAnnuelPct: 8,
      });
    });
  });

  it('ajoute un poste à la fin', async () => {
    await utilisateur().click(screen.getByRole('button', { name: /Ajouter un poste/ }));
    await vi.waitFor(async () => {
      expect((await params()).grilleVetuste.map((g) => g.poste)).toEqual([
        'Peinture',
        'Moquette',
        'Nouveau poste',
      ]);
    });
  });

  it('supprime la ligne choisie, pas une autre', async () => {
    await utilisateur().click(screen.getAllByRole('button', { name: 'Supprimer' })[1]);
    await vi.waitFor(async () => {
      expect((await params()).grilleVetuste.map((g) => g.poste)).toEqual(['Peinture']);
    });
  });

  it('réinitialise la grille par défaut', async () => {
    await utilisateur().click(screen.getByRole('button', { name: /Réinitialiser la grille/ }));
    await vi.waitFor(async () => {
      expect((await params()).grilleVetuste).toEqual(GRILLE_VETUSTE_DEFAUT);
    });
  });
});

describe('clauses du bail', () => {
  /** Déplie le panneau puis la première clause, et rend son identifiant. */
  async function ouvrirPremiereClause() {
    const u = utilisateur();
    rendre(<ClausesBailPanel />);
    await deplier(/Clauses du bail/);
    const avant = (await params()).clausesBail!;
    await u.click(
      await screen.findByRole('button', { name: new RegExp(avant[0].titre.slice(0, 20)) }),
    );
    return avant[0].id;
  }

  it('enregistre le titre, le texte et la base légale', async () => {
    const u = utilisateur();
    const id = await ouvrirPremiereClause();

    const titre = await screen.findByLabelText('Titre');
    await u.clear(titre);
    await u.type(titre, 'Titre revu');
    await u.tab();
    await vi.waitFor(async () => {
      expect((await params()).clausesBail!.find((c) => c.id === id)?.titre).toBe('Titre revu');
    });

    const texte = screen.getByLabelText('Texte de la clause');
    await u.clear(texte);
    await u.type(texte, 'Texte revu');
    await u.tab();
    await vi.waitFor(async () => {
      expect((await params()).clausesBail!.find((c) => c.id === id)?.texte).toBe('Texte revu');
    });

    const base = screen.getByLabelText(/Base légale/);
    await u.clear(base);
    await u.type(base, 'art. 1134 du code civil');
    await u.tab();
    await vi.waitFor(async () => {
      expect((await params()).clausesBail!.find((c) => c.id === id)?.baseLegale).toBe(
        'art. 1134 du code civil',
      );
    });
  });

  it('coche et décoche « proposée par défaut »', async () => {
    const u = utilisateur();
    const id = await ouvrirPremiereClause();
    const avant = (await params()).clausesBail!.find((c) => c.id === id)!.active;
    const casePremiere = () => screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    const enBase = async () => (await params()).clausesBail!.find((c) => c.id === id)?.active;

    await u.click(casePremiere());
    // L'attente porte sur la case elle-même : la base précède le réaffichage,
    // et recliquer avant celui-ci repartirait de l'ancien état coché.
    await vi.waitFor(() => expect(casePremiere().checked).toBe(!avant));
    expect(await enBase()).toBe(!avant);

    await u.click(casePremiere());
    await vi.waitFor(() => expect(casePremiere().checked).toBe(avant));
    expect(await enBase()).toBe(avant);
  });

  it('ajoute une clause dans la bonne rubrique', async () => {
    const u = utilisateur();
    rendre(<ClausesBailPanel />);
    await deplier(/Clauses du bail/);
    const avant = (await params()).clausesBail!;

    await u.click((await screen.findAllByRole('button', { name: /Ajouter une clause/ }))[0]);

    await vi.waitFor(async () => {
      expect((await params()).clausesBail!).toHaveLength(avant.length + 1);
    });
    const apres = (await params()).clausesBail!;
    const nouvelle = apres.find((c) => c.titre === 'Nouvelle clause')!;
    expect(nouvelle.famille).toBe(avant[0].famille);
    expect(nouvelle.active).toBe(false);
  });

  it('supprime la clause ouverte', async () => {
    const u = utilisateur();
    const id = await ouvrirPremiereClause();
    const avant = (await params()).clausesBail!.length;

    await u.click(screen.getByRole('button', { name: /Supprimer/ }));

    await vi.waitFor(async () => {
      expect((await params()).clausesBail!).toHaveLength(avant - 1);
    });
    expect((await params()).clausesBail!.some((c) => c.id === id)).toBe(false);
  });
});

describe('fiche de visite', () => {
  beforeEach(async () => {
    rendre(<FicheVisitePanel />);
    await deplier(/[Ff]iche/);
  });

  const modele = async () => (await params()).ficheVisite!;

  it('coche et décoche un bloc imprimé', async () => {
    const u = utilisateur();
    const cases = screen.getAllByRole('checkbox');
    const avant = (await modele()).blocs;
    const cle = Object.keys(avant)[0] as keyof typeof avant;

    await u.click(cases[0]);
    await vi.waitFor(async () => {
      expect((await modele()).blocs[cle]).toBe(!avant[cle]);
    });
    await u.click(cases[0]);
    await vi.waitFor(async () => {
      expect((await modele()).blocs[cle]).toBe(avant[cle]);
    });
  });

  it('enregistre un texte', async () => {
    const u = utilisateur();
    const zone = (await screen.findAllByRole('textbox'))[0];
    await u.clear(zone);
    await u.type(zone, 'Introduction revue');
    await u.tab();

    await vi.waitFor(async () => {
      expect(JSON.stringify(await modele())).toContain('Introduction revue');
    });
  });

  it('enregistre le titre et la note d’une section', async () => {
    const u = utilisateur();
    const titre = (await screen.findAllByLabelText('Titre de la section'))[0];
    await u.clear(titre);
    await u.type(titre, 'Section revue');
    await u.tab();
    await vi.waitFor(async () => {
      expect((await modele()).sections[0].titre).toBe('Section revue');
    });

    const note = screen.getAllByLabelText('Note (facultative)')[0];
    await u.clear(note);
    await u.type(note, 'Une seule pièce suffit');
    await u.tab();
    await vi.waitFor(async () => {
      expect((await modele()).sections[0].note).toBe('Une seule pièce suffit');
    });
  });

  it('change la condition d’impression d’une section', async () => {
    await utilisateur().selectOptions(
      screen.getAllByLabelText('Imprimée si')[0],
      'colocation',
    );
    await vi.waitFor(async () => {
      expect((await modele()).sections[0].condition).toBe('colocation');
    });
  });

  it('monte et descend une section sans en perdre', async () => {
    const u = utilisateur();
    const avant = (await modele()).sections;
    const titres = () =>
      screen.getAllByLabelText('Titre de la section').map((c) => (c as HTMLInputElement).value);
    const ordreInitial = avant.map((s) => s.titre);

    await u.click(screen.getAllByRole('button', { name: 'Descendre' })[0]);
    // L'attente porte sur le DOM : enchaîner un second clic sur un affichage
    // pas encore rafraîchi viserait une autre ligne que celle qu'on croit.
    await vi.waitFor(() =>
      expect(titres()).toEqual([ordreInitial[1], ordreInitial[0], ...ordreInitial.slice(2)]),
    );
    expect((await modele()).sections.map((s) => s.id)).toEqual([
      avant[1].id,
      avant[0].id,
      ...avant.slice(2).map((s) => s.id),
    ]);

    await u.click(screen.getAllByRole('button', { name: 'Monter' })[1]);
    await vi.waitFor(() => expect(titres()).toEqual(ordreInitial));
    expect((await modele()).sections.map((s) => s.id)).toEqual(avant.map((s) => s.id));
  });

  it('ne bouge pas la première section vers le haut', async () => {
    const avant = (await modele()).sections.map((s) => s.id);
    await utilisateur().click(screen.getAllByRole('button', { name: 'Monter' })[0]);
    // Rien ne doit changer, et surtout rien ne doit disparaître.
    await new Promise((r) => setTimeout(r, 60));
    expect((await modele()).sections.map((s) => s.id)).toEqual(avant);
  });

  it('ajoute et supprime une section', async () => {
    const u = utilisateur();
    const avant = (await modele()).sections.length;
    const corbeilles = () => screen.getAllByRole('button', { name: 'Supprimer la section' });

    await u.click(screen.getByRole('button', { name: /Ajouter une section/ }));
    // Attendre le DOM, pas la base : la corbeille de la nouvelle section
    // n'existe qu'au rendu suivant.
    await vi.waitFor(() => expect(corbeilles()).toHaveLength(avant + 1));
    expect((await modele()).sections).toHaveLength(avant + 1);

    await u.click(corbeilles()[avant]);
    await vi.waitFor(() => expect(corbeilles()).toHaveLength(avant));
    expect((await modele()).sections).toHaveLength(avant);
  });

  it('gère les pièces d’une section : coche, libellé, précision, ajout, retrait', async () => {
    const u = utilisateur();
    const pieceAvant = (await modele()).sections[0].pieces[0];

    await u.click(screen.getByRole('checkbox', { name: `Imprimer « ${pieceAvant.libelle} »` }));
    await vi.waitFor(async () => {
      expect((await modele()).sections[0].pieces[0].actif).toBe(!pieceAvant.actif);
    });

    const libelle = await screen.findByDisplayValue(pieceAvant.libelle);
    await u.clear(libelle);
    await u.type(libelle, 'Pièce revue');
    await u.tab();
    await vi.waitFor(async () => {
      expect((await modele()).sections[0].pieces[0].libelle).toBe('Pièce revue');
    });

    const precision = libelle.closest('li')!;
    const champPrecision = within(precision).getByPlaceholderText(/Précision/);
    await u.clear(champPrecision);
    await u.type(champPrecision, 'Des trois derniers mois');
    await u.tab();
    await vi.waitFor(async () => {
      expect((await modele()).sections[0].pieces[0].precision).toBe('Des trois derniers mois');
    });

    const nb = (await modele()).sections[0].pieces.length;
    await u.click(screen.getAllByRole('button', { name: /Ajouter une pièce/ })[0]);
    await vi.waitFor(async () => {
      expect((await modele()).sections[0].pieces).toHaveLength(nb + 1);
    });

    await u.click(screen.getAllByRole('button', { name: 'Supprimer la pièce' })[0]);
    await vi.waitFor(async () => {
      expect((await modele()).sections[0].pieces).toHaveLength(nb);
    });
    expect((await modele()).sections[0].pieces[0].libelle).not.toBe('Pièce revue');
  });
});

describe('panneau Bailleur', () => {
  it('enregistre l’identité sans recevoir le singleton', async () => {
    const u = utilisateur();
    rendre(<BailleurPanel />);
    await deplier(/Bailleur/);

    const nom = await screen.findByLabelText('Bailleur - nom');
    await u.clear(nom);
    await u.type(nom, 'Durand');
    await u.click(screen.getByRole('button', { name: /Enregistrer/ }));

    await vi.waitFor(async () => {
      expect((await params()).bailleur.nom).toBe('Durand');
    });
    // Les autres champs du singleton sont intacts.
    expect((await params()).grilleVetuste).toEqual(GRILLE);
  });
});

describe('base neuve', () => {
  it('crée le singleton à la première modification d’un réglage', async () => {
    // Installation neuve : `lireParametres` rend les valeurs par défaut sans
    // rien écrire (un `liveQuery` tourne en lecture seule), et c'est la
    // première écriture qui doit créer la ligne - sans `ReadOnlyError`.
    await db.parametres.clear();
    expect(await db.parametres.count()).toBe(0);

    rendre(<ParametresPage />);
    await deplier(/vétusté/);
    await utilisateur().click(await screen.findByRole('button', { name: /Ajouter un poste/ }));

    await vi.waitFor(async () => {
      expect(await db.parametres.count()).toBe(1);
    });
    const p = await params();
    expect(p.grilleVetuste).toHaveLength(GRILLE_VETUSTE_DEFAUT.length + 1);
    expect(p.grilleVetuste[p.grilleVetuste.length - 1].poste).toBe('Nouveau poste');
    // Les autres réglages sont bien les valeurs par défaut, pas des trous.
    expect(p.ficheVisite).toEqual(MODELE_FICHE_VISITE_DEFAUT);
    expect(p.compteursSequence.annee).toBe(new Date().getFullYear());
  });
});

describe('enregistrements antérieurs', () => {
  it('préserve un champ inconnu et ne fabrique pas les champs absents', async () => {
    // Paramètres écrits par une version antérieure, plus un champ venu d'une
    // version plus récente installée sur un autre appareil.
    await db.parametres.put({
      id: 'singleton',
      bailleur: { civilite: 'M', nom: 'Infante', prenom: 'Jami', adresse: '', email: '', telephone: '', qualite: 'personne_physique' },
      grilleVetuste: GRILLE,
      compteursSequence: { bail: 3, edl: 2, inventaire: 0, document: 7, annee: 2025 },
      champDuFutur: 'à ne pas perdre',
    } as never);

    rendre(<ParametresPage />);
    await deplier(/vétusté/);
    await utilisateur().click(await screen.findByRole('button', { name: /Ajouter un poste/ }));

    await vi.waitFor(async () => {
      expect((await params()).grilleVetuste).toHaveLength(3);
    });
    const brut = (await db.parametres.get('singleton')) as unknown as Record<string, unknown>;
    expect(brut.champDuFutur).toBe('à ne pas perdre');
    // La séquence des références n'est pas réinitialisée par une écriture de réglage.
    expect(brut.compteursSequence).toMatchObject({ bail: 3, document: 7, annee: 2025 });
    // `normaliser` complète les champs apparus depuis - comme avant le refactor.
    expect((await params()).ficheVisite).toEqual(MODELE_FICHE_VISITE_DEFAUT);
  });
});
