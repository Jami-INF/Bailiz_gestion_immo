import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { db } from '@/lib/db';
import { EdlTerrainPage } from './EdlTerrainPage';
import { rendreRoute, semer, unEdl, utilisateur, viderBase } from '@/test/utils';

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
});

function rendreTerrain() {
  return rendreRoute('/edl/:id', <EdlTerrainPage />, '/edl/edl-1');
}

/** Ouvre l'onglet d'une pièce. */
async function ouvrirPiece(nom: string) {
  await utilisateur().click(await screen.findByRole('button', { name: new RegExp(`^${nom}`) }));
}

async function elementsDeLaBase() {
  const edl = await db.edls.get('edl-1');
  return edl!.pieces.flatMap((p) => p.elements);
}

describe('remplissage groupé d’une pièce', () => {
  it('renseigne d’un coup les éléments encore vierges', async () => {
    await semer({ edl: {} });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    const bloc = (await screen.findByText(/Renseigner d'un coup les 2 élément/)).closest('div')!;
    await utilisateur().click(within(bloc).getByRole('button', { name: 'Bon' }));

    await vi.waitFor(async () => {
      const sejour = (await db.edls.get('edl-1'))!.pieces[0];
      expect(sejour.elements.map((e) => e.etat)).toEqual(['bon', 'bon']);
    });
  });

  it('ne réécrit jamais un élément déjà relevé', async () => {
    // Le raccourci ne doit pas pouvoir effacer une observation faite sur place.
    const edl = unEdl();
    edl.pieces[0].elements[0].etat = 'usage';
    await semer({ edl });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    const bloc = (await screen.findByText(/Renseigner d'un coup les 1 élément/)).closest('div')!;
    await utilisateur().click(within(bloc).getByRole('button', { name: 'Bon' }));

    await vi.waitFor(async () => {
      const sejour = (await db.edls.get('edl-1'))!.pieces[0];
      expect(sejour.elements.map((e) => e.etat)).toEqual(['usage', 'bon']);
    });
  });

  it('ne touche pas aux autres pièces', async () => {
    await semer({ edl: {} });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    const bloc = (await screen.findByText(/Renseigner d'un coup/)).closest('div')!;
    await utilisateur().click(within(bloc).getByRole('button', { name: 'Neuf' }));

    await vi.waitFor(async () => {
      const cuisine = (await db.edls.get('edl-1'))!.pieces[1];
      expect(cuisine.elements.every((e) => e.etat === undefined)).toBe(true);
    });
  });

  it('disparaît quand la pièce est complète', async () => {
    const edl = unEdl();
    edl.pieces[0].elements.forEach((e) => (e.etat = 'bon'));
    await semer({ edl });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    await screen.findByRole('button', { name: /Retirer Sol/ });
    expect(screen.queryByText(/Renseigner d'un coup/)).not.toBeInTheDocument();
  });

  it('marque la dégradation sur un état des lieux de sortie', async () => {
    const pieces = unEdl().pieces.map((p) => ({
      ...p,
      elements: p.elements.map((e) => ({ ...e, etatEntree: 'neuf' as const })),
    }));
    await semer({ edl: { type: 'sortie', pieces } });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    const bloc = (await screen.findByText(/Renseigner d'un coup/)).closest('div')!;
    await utilisateur().click(within(bloc).getByRole('button', { name: 'Usagé' }));

    await vi.waitFor(async () => {
      const sejour = (await db.edls.get('edl-1'))!.pieces[0];
      expect(sejour.elements.every((e) => e.degradation)).toBe(true);
    });
  });
});

describe('récapitulatif des éléments non renseignés', () => {
  it('compte les oublis et les liste, pièce par pièce', async () => {
    await semer({ edl: {} });
    rendreTerrain();

    await utilisateur().click(
      await screen.findByRole('button', { name: /4 élément\(s\) non renseigné\(s\)/ }),
    );

    const modale = await screen.findByRole('dialog');
    expect(within(modale).getByRole('button', { name: /Sol.*Séjour/s })).toBeInTheDocument();
    expect(within(modale).getByRole('button', { name: /Réfrigérateur.*Cuisine/s })).toBeInTheDocument();
  });

  it('mène directement à la pièce concernée', async () => {
    await semer({ edl: {} });
    rendreTerrain();
    const u = utilisateur();

    await u.click(await screen.findByRole('button', { name: /4 élément\(s\) non renseigné/ }));
    const modale = await screen.findByRole('dialog');
    await u.click(within(modale).getByRole('button', { name: /Réfrigérateur.*Cuisine/s }));

    // La modale se ferme et l'onglet Cuisine est affiché.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // « Retirer <élément> » ne figure que sur la pièce affichée - contrairement
    // aux noms d'éléments, qui se retrouvent aussi dans la liste des catégories.
    expect(await screen.findByRole('button', { name: /Retirer Réfrigérateur/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirer Murs/ })).not.toBeInTheDocument();
  });

  it('intercepte « Signer » tant qu’il reste des oublis, sans bloquer', async () => {
    await semer({ edl: {} });
    rendreTerrain();

    await utilisateur().click(await screen.findByRole('button', { name: /Signer/ }));

    const modale = await screen.findByRole('dialog');
    expect(within(modale).getByRole('button', { name: /Signer quand même/ })).toBeInTheDocument();
    expect(within(modale).getByRole('button', { name: /Continuer la saisie/ })).toBeInTheDocument();
  });

  it('ne compte pas un élément marqué manquant', async () => {
    const pieces = unEdl().pieces;
    pieces[0].elements[0].manquant = true;
    pieces[0].elements[1].etat = 'bon';
    pieces[1].elements.forEach((e) => (e.etat = 'bon'));
    await semer({ edl: { type: 'sortie', pieces } });
    rendreTerrain();

    expect(await screen.findByText(/4\/4 éléments/)).toBeInTheDocument();
    expect(screen.queryByText(/non renseigné/)).not.toBeInTheDocument();
  });
});

describe('verrouillage après signature', () => {
  it('n’écrit plus rien et masque les raccourcis', async () => {
    const pieces = unEdl().pieces.map((p) => ({
      ...p,
      elements: p.elements.map((e) => ({ ...e, etat: 'bon' as const })),
    }));
    await semer({
      edl: {
        statut: 'signe',
        pieces,
        signatures: {
          dateSignature: '2026-02-01T10:00:00.000Z',
          lieu: 'Chamalières',
          bailleur: {
            nomComplet: 'Jami Infante',
            luEtApprouve: true,
            imageDataUrl: '',
            horodatage: '2026-02-01T10:00:00.000Z',
          },
          locataires: [],
        },
      },
    });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    expect(screen.queryByText(/Renseigner d'un coup/)).not.toBeInTheDocument();
    const avant = await elementsDeLaBase();
    await utilisateur().click(screen.getAllByRole('button', { name: 'Mauvais' })[0]);
    expect(await elementsDeLaBase()).toEqual(avant);
  });
});

/*
 * Caractérisation de la carte d'un élément et de la barre d'onglets, écrite
 * **avant** le découpage du fichier en composants : ces cas décrivent le
 * comportement existant, et c'est à eux de dire si l'extraction l'a changé.
 */
describe('compatibilité des enregistrements existants', () => {
  it('préserve les champs inconnus et les absents d’un enregistrement ancien', async () => {
    // Un EDL écrit par une version antérieure (champs optionnels absents) et
    // portant un champ qu'on ne connaît pas encore (autre appareil plus récent).
    await semer({ edl: {} });
    const ancien = {
      id: 'edl-1',
      reference: 'EDL-2025-0001',
      bienId: 'bien-1',
      type: 'entree',
      date: '2025-03-01T10:00:00.000Z',
      compteurs: [],
      cles: [{ designation: 'Clé', nombre: 1 }],
      pieces: [],
      statut: 'brouillon',
      avenants: [],
      createdAt: '2025-03-01T10:00:00.000Z',
      updatedAt: '2025-03-01T10:00:00.000Z',
      champDuFutur: 'à ne pas perdre',
    };
    await db.edls.put(ancien as never);

    rendreTerrain();
    await utilisateur().click(await screen.findByRole('button', { name: /^Clés/ }));
    await utilisateur().click(await screen.findByRole('button', { name: /Ajouter une clé/ }));

    await vi.waitFor(async () => {
      expect((await db.edls.get('edl-1'))!.cles).toHaveLength(2);
    });
    const apres = (await db.edls.get('edl-1'))! as unknown as Record<string, unknown>;
    expect(apres.champDuFutur).toBe('à ne pas perdre');
    expect(apres.bailId).toBeUndefined();
    expect(apres.locataireIds).toBeUndefined();
    expect(apres.reference).toBe('EDL-2025-0001');
    expect(apres.createdAt).toBe('2025-03-01T10:00:00.000Z');
  });
});

describe('autosauvegarde concurrente (clés et compteurs)', () => {
  /**
   * Les champs de ces deux onglets n'écrivent qu'au `blur`, et cliquer
   * « Ajouter » ou la corbeille enchaîne `blur` puis `click` plus vite que
   * l'aller-retour IndexedDB qui rafraîchit la page. Les deux écritures
   * partaient donc du même instantané et la seconde effaçait la première : la
   * ligne qu'on venait de remplir revenait à sa valeur d'avant.
   */
  async function ouvrirOnglet(nom: string) {
    await utilisateur().click(await screen.findByRole('button', { name: new RegExp(`^${nom}`) }));
  }

  const DESIGNATION = "Clé porte d'entrée, badge parking…";

  it('conserve la clé en cours de saisie quand on en ajoute une autre', async () => {
    const u = utilisateur();
    await semer({ edl: { cles: [{ designation: 'Clé', nombre: 1 }] } });
    rendreTerrain();
    await ouvrirOnglet('Clés');

    const champ = await screen.findByPlaceholderText(DESIGNATION);
    await u.clear(champ);
    await u.type(champ, 'Porte palière');
    // Clic direct sur « Ajouter », sans passer par un autre champ.
    await u.click(screen.getByRole('button', { name: /Ajouter une clé/ }));

    await vi.waitFor(async () => {
      expect((await db.edls.get('edl-1'))!.cles).toHaveLength(2);
    });
    const cles = (await db.edls.get('edl-1'))!.cles;
    expect(cles[0].designation).toBe('Porte palière');
    expect(cles[1]).toMatchObject({ designation: 'Clé', nombre: 1 });
  });

  it('conserve la clé en cours de saisie quand on en supprime une autre', async () => {
    const u = utilisateur();
    await semer({
      edl: {
        cles: [
          { designation: 'Boîte aux lettres', nombre: 1 },
          { designation: 'Cave', nombre: 1 },
        ],
      },
    });
    rendreTerrain();
    await ouvrirOnglet('Clés');

    const champs = await screen.findAllByPlaceholderText(DESIGNATION);
    await u.clear(champs[1]);
    await u.type(champs[1], 'Garage');
    // La corbeille de la *première* ligne, depuis le champ de la seconde.
    await u.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);

    await vi.waitFor(async () => {
      expect((await db.edls.get('edl-1'))!.cles).toHaveLength(1);
    });
    expect((await db.edls.get('edl-1'))!.cles[0].designation).toBe('Garage');
  });

  it('conserve le relevé en cours de saisie quand on ajoute un compteur', async () => {
    const u = utilisateur();
    await semer({ edl: { compteurs: [{ type: 'eau_froide', releve: 0 }] } });
    rendreTerrain();
    await ouvrirOnglet('Compteurs');

    const champ = await screen.findByPlaceholderText('N° 12345678');
    await u.type(champ, 'PDL-42');
    await u.click(screen.getByRole('button', { name: /Ajouter un compteur/ }));

    await vi.waitFor(async () => {
      expect((await db.edls.get('edl-1'))!.compteurs).toHaveLength(2);
    });
    const compteurs = (await db.edls.get('edl-1'))!.compteurs;
    expect(compteurs[0].numero).toBe('PDL-42');
    // Le numéro est aussi recopié sur le logement pour les EDL suivants.
    expect((await db.biens.get('bien-1'))!.compteurs?.[0].numero).toBe('PDL-42');
  });
});

describe('carte d’un élément', () => {
  it('expose l’état relevé et n’en retient qu’un seul', async () => {
    const u = utilisateur();
    await semer({ edl: {} });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    const groupe = await screen.findByRole('group', { name: 'État de Sol' });
    await u.click(within(groupe).getByRole('button', { name: 'Usagé' }));
    await vi.waitFor(() =>
      expect(within(groupe).getByRole('button', { name: 'Usagé' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect((await elementsDeLaBase())[0].etat).toBe('usage');

    // Un second choix remplace le premier : l'état est exclusif.
    await u.click(within(groupe).getByRole('button', { name: 'Neuf' }));
    await vi.waitFor(async () => expect((await elementsDeLaBase())[0].etat).toBe('neuf'));
    // L'attente porte sur le DOM : l'écriture en base précède le réaffichage,
    // et asserter l'un juste après l'autre revient à courir contre le rendu.
    await vi.waitFor(() =>
      expect(within(groupe).getByRole('button', { name: 'Usagé' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
    expect(within(groupe).getByRole('button', { name: 'Neuf' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('enregistre le commentaire d’un élément à la sortie du champ', async () => {
    const u = utilisateur();
    await semer({ edl: {} });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    await u.type(await screen.findByLabelText('Commentaire sur Sol'), 'Rayures près de la porte');
    await u.tab();

    await vi.waitFor(async () =>
      expect((await elementsDeLaBase())[0].commentaire).toBe('Rayures près de la porte'),
    );
  });

  it('retire un élément ajouté librement', async () => {
    await semer({ edl: {} });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    await utilisateur().click(await screen.findByRole('button', { name: 'Retirer Murs' }));

    await vi.waitFor(async () => {
      const sejour = (await db.edls.get('edl-1'))!.pieces[0];
      expect(sejour.elements.map((e) => e.nom)).toEqual(['Sol']);
    });
  });
});

describe('ajout de pièce et d’élément', () => {
  it('ajoute un élément à la pièce et le mémorise sur le logement', async () => {
    const u = utilisateur();
    await semer({ edl: {}, bien: { piecesModele: [{ id: 'pm-1', nom: 'Séjour', ordre: 0, elements: [] }] } });
    rendreTerrain();
    await ouvrirPiece('Séjour');

    await u.type(await screen.findByLabelText('Nom du nouvel élément'), 'Rideaux');
    await u.click(screen.getByRole('button', { name: /^Ajouter$/ }));

    await vi.waitFor(async () => {
      const sejour = (await db.edls.get('edl-1'))!.pieces[0];
      expect(sejour.elements.map((e) => e.nom)).toContain('Rideaux');
    });
    // La fiche du logement retient l'ajout pour les états des lieux suivants.
    const bien = await db.biens.get('bien-1');
    expect(bien?.piecesModele[0].elements.map((e) => e.nom)).toContain('Rideaux');
  });

  it('ajoute une pièce et bascule dessus', async () => {
    const u = utilisateur();
    await semer({ edl: {} });
    rendreTerrain();

    await u.click(await screen.findByRole('button', { name: /Pièce/ }));
    const modale = await screen.findByRole('dialog');
    await u.type(within(modale).getByLabelText(/Nom de la pièce/), 'Buanderie');
    await u.click(within(modale).getByRole('button', { name: /Ajouter la pièce/ }));

    await vi.waitFor(async () => {
      const pieces = (await db.edls.get('edl-1'))!.pieces;
      expect(pieces.map((p) => p.nom)).toContain('Buanderie');
    });
  });

  it('signale la pièce complète dans le nom de son onglet', async () => {
    const edl = unEdl();
    edl.pieces[0].elements = edl.pieces[0].elements.map((e) => ({ ...e, etat: 'bon' as const }));
    await semer({ edl });
    rendreTerrain();

    expect(await screen.findByRole('button', { name: 'Séjour - complète' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cuisine' })).toBeInTheDocument();
  });
});
