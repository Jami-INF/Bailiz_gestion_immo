import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { Bail, Bien, EtatDesLieux, Locataire, Parametres } from '@/types';
import { GRILLE_VETUSTE_DEFAUT } from '@/lib/defauts';
import { EdlPdf } from './EdlPdf';
import { mentionBail, mentionOrigineEntree } from './edlMentions';

const bien: Bien = {
  id: 'bien-1',
  nom: 'T2 Chamalières',
  adresse: { ligne1: '7 avenue de la Gare', codePostal: '63400', ville: 'Chamalières' },
  type: 'T2',
  surfaceBoutin: 42,
  nbPieces: 2,
  regimeJuridique: 'copropriete',
  equipementsPrivatifs: [],
  partiesCommunes: [],
  annexes: [],
  chauffage: { type: 'individuel', energie: 'électricité' },
  eauChaude: { type: 'individuel', energie: 'électricité' },
  zoneEncadrementLoyers: false,
  piecesModele: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const locataires: Locataire[] = [
  {
    id: 'loc-1',
    civilite: 'Mme',
    nom: 'Dupont',
    prenom: 'Marie',
    email: 'marie@exemple.fr',
    telephone: '0612345678',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const parametres: Parametres = {
  id: 'singleton',
  bailleur: {
    civilite: 'M',
    nom: 'Infante',
    prenom: 'Jami',
    adresse: '38 rue Robert Noel, 63110 Beaumont',
    email: 'jami@exemple.fr',
    telephone: '0600000000',
    qualite: 'personne_physique',
  },
  grilleVetuste: GRILLE_VETUSTE_DEFAUT,
  compteursSequence: { bail: 0, edl: 1, inventaire: 0, document: 0, annee: 2026 },
};

function unEdl(p: Partial<EtatDesLieux> = {}): EtatDesLieux {
  return {
    id: 'edl-1',
    reference: 'EDL-2026-0001',
    bienId: 'bien-1',
    locataireIds: ['loc-1'],
    type: 'entree',
    date: '2026-09-01T10:00:00.000Z',
    compteurs: [{ type: 'electricite', numero: 'PDL-42', releve: 1234 }],
    cles: [{ designation: "Clé porte d'entrée", nombre: 2 }],
    pieces: [
      {
        id: 'p1',
        nom: 'Séjour',
        ordre: 0,
        elements: [{ id: 'e1', nom: 'Sol', categorie: 'sol', etat: 'bon', photoIds: [] }],
      },
    ],
    statut: 'brouillon',
    avenants: [],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...p,
  };
}

const rendre = (edl: EtatDesLieux, bail?: Bail) =>
  renderToBuffer(
    createElement(EdlPdf, {
      edl,
      bail,
      bien,
      locataires,
      parametres,
      photos: [],
    }) as ReactElement<DocumentProps>,
  );

describe('EdlPdf sans bail', () => {
  it('se rend sans contrat enregistré', async () => {
    const buffer = await rendre(unEdl());
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(2000);
  });

  it("se rend en sortie sans état des lieux d'entrée", async () => {
    const buffer = await rendre(unEdl({ type: 'sortie', origineEtatEntree: 'aucun' }));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

/*
 * Les mentions sont vérifiées sur le texte produit, pas sur le PDF : les flux
 * d'un PDF sont compressés, une assertion sur le binaire ne prouverait rien.
 */
describe('mentionBail', () => {
  it('cite le bail enregistré', () => {
    expect(mentionBail({ reference: 'BAIL-2026-0007' } as Bail)).toBe('Bail BAIL-2026-0007.');
  });

  it('cite un contrat établi hors application', () => {
    const m = mentionBail(undefined, { reference: 'Bail Durand', dateEffet: '2023-09-01' });
    expect(m).toContain('hors application');
    expect(m).toContain('prenant effet le 1 septembre 2023');
  });

  it("annonce le rattachement à venir quand aucun contrat n'est connu", () => {
    expect(mentionBail(undefined, undefined)).toBe('À annexer au contrat de location.');
  });
});

describe('mentionOrigineEntree', () => {
  it("ne dit rien sur un état des lieux d'entrée", () => {
    expect(mentionOrigineEntree({ type: 'entree', origineEtatEntree: undefined })).toBeNull();
  });

  it("ne dit rien quand l'état d'entrée vient de l'application", () => {
    expect(mentionOrigineEntree({ type: 'sortie', origineEtatEntree: 'edl_app' })).toBeNull();
  });

  it("signale le report d'un exemplaire papier et sa date", () => {
    const m = mentionOrigineEntree({
      type: 'sortie',
      origineEtatEntree: 'edl_papier',
      dateEdlEntreePapier: '2023-09-01',
    });
    // `formatDateFr` rend la date en toutes lettres, comme partout dans les PDF.
    expect(m).toContain('1 septembre 2023');
    expect(m).toContain('doit être conservé');
  });

  /*
   * Sans état des lieux d'entrée, la colonne de référence n'existe pas : le
   * document doit le dire, sous peine de laisser croire qu'il fonde des
   * retenues qu'il ne fonde pas.
   */
  it("porte l'avertissement de l'art. 1731 quand aucune entrée n'a été établie", () => {
    const m = mentionOrigineEntree({ type: 'sortie', origineEtatEntree: 'aucun' });
    expect(m).toContain('1731');
    expect(m).toContain('ne fonde à lui seul aucune retenue');
  });
});
