import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import type { Bien, Parametres } from '@/types';
import { GRILLE_VETUSTE_DEFAUT, MODELE_FICHE_VISITE_DEFAUT } from '@/lib/defauts';
import { FicheVisitePdf } from './FicheVisitePdf';
import { ActeCautionnementPdf } from './ActeCautionnementPdf';

const bien: Bien = {
  id: 'bien-1',
  nom: 'T2 Chamalières',
  adresse: { ligne1: '7 avenue de la Gare', codePostal: '63400', ville: 'Chamalières' },
  type: 'T2',
  surfaceBoutin: 42,
  nbPieces: 2,
  etage: '2e',
  batiment: 'B',
  classeDPE: 'D',
  equipementsTIC: 'Fibre optique',
  regimeJuridique: 'copropriete',
  equipementsPrivatifs: ['Cuisine équipée'],
  partiesCommunes: ['Ascenseur'],
  annexes: [{ type: 'cave', description: 'n°12' }],
  chauffage: { type: 'individuel', energie: 'électricité' },
  eauChaude: { type: 'individuel', energie: 'électricité' },
  zoneEncadrementLoyers: false,
  conditionsLocation: {
    loyerHC: 520,
    charges: { mode: 'forfait', montant: 60 },
    chargesDetail: 'Eau froide, ordures ménagères, entretien des parties communes',
    depotGarantie: 1040,
    dateDisponibilite: '2026-09-01',
    acces: 'Interphone « Martin », 2e étage sans ascenseur, stationnement gratuit rue de la Gare',
  },
  dossierTechniqueUrl: 'https://drive.google.com/drive/folders/exemple',
  piecesModele: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
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
    qualite: 'personne_physique',
  },
  grilleVetuste: GRILLE_VETUSTE_DEFAUT,
  ficheVisite: MODELE_FICHE_VISITE_DEFAUT,
  compteursSequence: { bail: 0, edl: 0, inventaire: 0, document: 3, annee: 2026 },
};

const rendre = (props: Partial<Parameters<typeof FicheVisitePdf>[0]>) =>
  renderToBuffer(
    createElement(FicheVisitePdf, {
      reference: 'DOC-2026-0003',
      bien,
      parametres,
      modele: MODELE_FICHE_VISITE_DEFAUT,
      visite: { date: '2026-08-20', heure: '18 h 30', situations: ['garant_physique'] },
      ...props,
    }) as ReactElement<DocumentProps>,
  );

/** Nombre de pages du PDF rendu (objets `/Type /Page`, hors `/Pages`). */
const compterPages = (buffer: Buffer) =>
  (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe('FicheVisitePdf', () => {
  it('rend une fiche complète (logement, conditions, dossier)', async () => {
    const buffer = await rendre({});
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(2000);
  });

  it('rend un bien vide de conditions sans échouer (zones à compléter)', async () => {
    const nu: Bien = {
      ...bien,
      conditionsLocation: undefined,
      dossierTechniqueUrl: undefined,
      classeDPE: undefined,
      equipementsTIC: undefined,
      equipementsPrivatifs: [],
      partiesCommunes: [],
      annexes: [],
    };
    const buffer = await rendre({ bien: nu, visite: { situations: [] } });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('rend toutes les sections conditionnelles quand toutes les situations sont retenues', async () => {
    const buffer = await rendre({
      visite: {
        date: '2026-08-20',
        situations: ['garant_physique', 'visale', 'colocation', 'etudiant', 'independant'],
      },
    });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it("joint l'acte de cautionnement si - et seulement si - un garant physique est retenu", async () => {
    // Modèle privé de la section « garant » : la seule différence entre les
    // deux rendus est alors la page de l'acte de cautionnement.
    const modele = {
      ...MODELE_FICHE_VISITE_DEFAUT,
      sections: MODELE_FICHE_VISITE_DEFAUT.sections.filter(
        (s) => s.condition !== 'garant_physique',
      ),
    };
    const avecGarant = await rendre({ modele, visite: { situations: ['garant_physique'] } });
    const sansGarant = await rendre({ modele, visite: { situations: [] } });
    const acteSeul = await renderToBuffer(
      createElement(ActeCautionnementPdf, {
        bailleur: parametres.bailleur,
        bienAdresse: 'peu importe',
        loyerHC: bien.conditionsLocation?.loyerHC,
        charges: bien.conditionsLocation?.charges?.montant,
      }) as ReactElement<DocumentProps>,
    );
    // L'écart correspond exactement à l'acte, tel qu'il se rend seul.
    expect(compterPages(avecGarant)).toBe(compterPages(sansGarant) + compterPages(acteSeul));
  });
});
