import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import type { Bail, Bien, Locataire, Parametres } from '@/types';
import { CLAUSES_BAIL_DEFAUT, GRILLE_VETUSTE_DEFAUT } from '@/lib/defauts';
import { BailPdf } from './BailPdf';

const bien: Bien = {
  id: 'bien-1',
  nom: 'T2 Chamalières',
  adresse: { ligne1: '7 avenue de la Gare', codePostal: '63400', ville: 'Chamalières' },
  type: 'T2',
  surfaceBoutin: 17,
  nbPieces: 2,
  identifiantFiscal: '631234567890',
  typeHabitat: 'collectif',
  periodeConstruction: '1975_1989',
  classeDPE: 'E',
  equipementsTIC: 'Fibre optique, TNT collective',
  zoneTendue: true,
  regimeJuridique: 'copropriete',
  equipementsPrivatifs: ['Cuisine équipée'],
  partiesCommunes: ['Ascenseur', 'Local poubelles'],
  annexes: [],
  chauffage: { type: 'collectif', energie: 'gaz' },
  eauChaude: { type: 'collectif', energie: 'gaz' },
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

const bail: Bail = {
  id: 'bail-1',
  reference: 'BAIL-2026-0099',
  bienId: 'bien-1',
  locataireIds: ['loc-1'],
  clauseSolidarite: false,
  typeBail: 'meuble_1an',
  dateEffet: '2026-09-01',
  dureeMois: 12,
  loyerHC: 350,
  charges: { mode: 'forfait', montant: 70 },
  depotGarantie: 420,
  jourPaiement: 5,
  modePaiement: 'virement bancaire',
  revisionIRL: { trimestreReference: '1er trimestre 2026', valeurIndice: 145.47, revisable: true },
  clauseResolutoire: true,
  travaux: { depuisDernierBail: 'Remplacement de la chaudière — 3 200 €' },
  clausesParticulieres: [],
  annexesChecklist: [],
  statut: 'genere',
  createdAt: '2026-07-06T00:00:00.000Z',
  updatedAt: '2026-07-06T00:00:00.000Z',
};

const parametres: Parametres = {
  id: 'singleton',
  bailleur: {
    civilite: 'M',
    nom: 'Infante',
    prenom: 'Jami',
    adresse: '38 rue Robert Noel, 63110 Beaumont',
    email: 'jami@exemple.fr',
    telephone: '0600000000',
    siret: '12345678900012',
    qualite: 'personne_physique',
  },
  grilleVetuste: GRILLE_VETUSTE_DEFAUT,
  compteursSequence: { bail: 1, edl: 0, inventaire: 0, document: 0, annee: 2026 },
};

describe('BailPdf', () => {
  it('rend un PDF complet avec toutes les mentions légales', async () => {
    const buffer = await renderToBuffer(
      createElement(BailPdf, { bail, bien, locataires, parametres }) as ReactElement<DocumentProps>,
    );
    expect(buffer.length).toBeGreaterThan(2000);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('BailPdf — conditions générales d’occupation', () => {
  const clausesActives = CLAUSES_BAIL_DEFAUT.filter((c) => c.active);
  const compterPages = (buffer: Buffer) =>
    (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const rendre = (b: Bail, bienUtilise: Bien = bien) =>
    renderToBuffer(
      createElement(BailPdf, {
        bail: b,
        bien: bienUtilise,
        locataires,
        parametres,
      }) as ReactElement<DocumentProps>,
    );

  it('imprime les clauses retenues et allonge le contrat', async () => {
    const avec = await rendre({ ...bail, clauses: clausesActives });
    const sans = await rendre(bail);
    expect(compterPages(avec)).toBeGreaterThan(compterPages(sans));
  });

  it('omet la partie X pour un bail antérieur à la fonctionnalité', async () => {
    // `clauses` absent = bail enregistré avant : le PDF doit rester celui signé.
    const buffer = await rendre(bail);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('écarte les clauses conditionnelles que le logement ne justifie pas', async () => {
    const monopropriete: Bien = {
      ...bien,
      regimeJuridique: 'monopropriete',
      servitudeResidencePrincipale: false,
    };
    const restreint = await rendre({ ...bail, clauses: clausesActives }, monopropriete);
    const complet = await rendre(
      { ...bail, clauses: clausesActives },
      { ...bien, servitudeResidencePrincipale: true },
    );
    expect(restreint.length).toBeLessThan(complet.length);
  });
});
