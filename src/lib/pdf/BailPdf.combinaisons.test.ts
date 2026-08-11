import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { Bail, Bien, Locataire, Parametres, TypeBail } from '@/types';
import { CLAUSES_BAIL_DEFAUT, GRILLE_VETUSTE_DEFAUT, MODELE_FICHE_VISITE_DEFAUT } from '@/lib/defauts';
import { BailPdf } from './BailPdf';

/**
 * Rendu **de bout en bout** de toutes les combinaisons de bail que
 * l'application peut produire.
 *
 * Les tests existants vérifient le plan du document et le contenu des clauses.
 * Ceux-ci vérifient autre chose, et c'est le mode de panne le plus brutal : un
 * champ absent, une date illisible ou une partie vide font **lever**
 * `renderToBuffer`, et l'utilisateur se retrouve sans document — devant le
 * locataire, au moment de signer. Une combinaison rare (colocation en
 * monopropriété, bail mobilité sans dépôt, logement sans DPE) n'est jamais
 * exercée à la main : elle doit l'être ici.
 */

function bien(p: Partial<Bien> = {}): Bien {
  return {
    id: 'bien-1',
    nom: 'T2 Chamalières',
    adresse: { ligne1: '7 avenue de la Gare', codePostal: '63400', ville: 'Chamalières' },
    type: 'T2',
    surfaceBoutin: 32,
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
    ...p,
  };
}

function locataire(i: number): Locataire {
  return {
    id: `loc-${i}`,
    civilite: i % 2 ? 'M' : 'Mme',
    nom: `Nom${i}`,
    prenom: `Prénom${i}`,
    email: `loc${i}@exemple.fr`,
    telephone: '0612345678',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...(i === 2 ? { garant: { nom: 'Garant', prenom: 'Guy', adresse: '1 rue X', type: 'physique' as const } } : {}),
  };
}

function bail(p: Partial<Bail> = {}): Bail {
  return {
    id: 'bail-1',
    reference: 'BAIL-2026-0001',
    bienId: 'bien-1',
    locataireIds: ['loc-1'],
    clauseSolidarite: false,
    typeBail: 'meuble_1an',
    dateEffet: '2026-09-01',
    dureeMois: 12,
    loyerHC: 500,
    charges: { mode: 'forfait', montant: 60 },
    depotGarantie: 1000,
    jourPaiement: 5,
    modePaiement: 'virement bancaire',
    revisionIRL: { trimestreReference: '2e trimestre 2026', valeurIndice: 146.33, revisable: true },
    clausesParticulieres: [],
    annexesChecklist: [],
    clauses: CLAUSES_BAIL_DEFAUT,
    statut: 'genere',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p,
  };
}

const parametres: Parametres = {
  id: 'singleton',
  bailleur: {
    civilite: 'M',
    nom: 'Infante',
    prenom: 'Jami',
    adresse: '5 place de Jaude, 63000 Clermont-Ferrand',
    email: 'bailleur@exemple.fr',
    telephone: '0611111111',
    qualite: 'personne_physique',
  },
  grilleVetuste: GRILLE_VETUSTE_DEFAUT,
  ficheVisite: MODELE_FICHE_VISITE_DEFAUT,
  clausesBail: CLAUSES_BAIL_DEFAUT,
  compteursSequence: { bail: 1, edl: 1, inventaire: 0, document: 1, annee: 2026 },
};

/** Rend le PDF et renvoie sa taille : lever ou produire un document vide sont les deux échecs. */
async function rendre(element: ReactElement<DocumentProps>): Promise<number> {
  const buffer = await renderToBuffer(element);
  return buffer.length;
}

function pdfBail(b: Bail, bi: Bien, locs: Locataire[]) {
  return createElement(BailPdf, {
    bail: b,
    bien: bi,
    locataires: locs,
    parametres,
  }) as ReactElement<DocumentProps>;
}

describe('BailPdf — toutes les combinaisons se rendent', () => {
  const durees: Record<TypeBail, number> = {
    meuble_1an: 12,
    meuble_etudiant_9mois: 9,
    mobilite: 6,
  };

  for (const type of Object.keys(durees) as TypeBail[]) {
    for (const colocation of [false, true]) {
      for (const regime of ['copropriete', 'monopropriete'] as const) {
        it(`${type} · ${colocation ? 'colocation' : 'locataire seul'} · ${regime}`, async () => {
          const locs = colocation ? [locataire(1), locataire(2)] : [locataire(1)];
          const b = bail({
            typeBail: type,
            dureeMois: durees[type],
            // Le dépôt de garantie est interdit en bail mobilité.
            depotGarantie: type === 'mobilite' ? 0 : 1000,
            locataireIds: locs.map((l) => l.id),
            clauseSolidarite: colocation,
            assuranceColocataires: colocation ? { montantAnnuel: 120 } : undefined,
          });
          expect(await rendre(pdfBail(b, bien({ regimeJuridique: regime }), locs))).toBeGreaterThan(1000);
        });
      }
    }
  }
});

describe('BailPdf — qualité du bailleur', () => {
  const bailleurs = {
    'personne physique': parametres.bailleur,
    indivision: {
      ...parametres.bailleur,
      qualite: 'indivision' as const,
      coIndivisaires: [{ civilite: 'Mme', nom: 'Infante', prenom: 'Léa' }],
    },
    'personne morale': {
      ...parametres.bailleur,
      qualite: 'personne_morale' as const,
      formeJuridique: 'SCI',
      denomination: 'Les Tilleuls',
      capitalSocial: 1000,
      villeRCS: 'Clermont-Ferrand',
      representant: { civilite: 'M', nom: 'Infante', prenom: 'Jami', fonction: 'gérant' },
    },
  };

  for (const [libelle, bailleur] of Object.entries(bailleurs)) {
    it(`rend la désignation des parties pour un bailleur ${libelle}`, async () => {
      const element = createElement(BailPdf, {
        bail: bail(),
        bien: bien(),
        locataires: [locataire(1)],
        parametres: { ...parametres, bailleur },
      }) as ReactElement<DocumentProps>;
      expect(await rendre(element)).toBeGreaterThan(1000);
    });
  }

  it('se rend avec un bailleur pas encore renseigné', async () => {
    const vide = { ...parametres.bailleur, nom: '', prenom: '', adresse: '' };
    const element = createElement(BailPdf, {
      bail: bail(),
      bien: bien(),
      locataires: [locataire(1)],
      parametres: { ...parametres, bailleur: vide },
      brouillon: true,
    }) as ReactElement<DocumentProps>;
    expect(await rendre(element)).toBeGreaterThan(1000);
  });
});

describe('BailPdf — cas dégradés', () => {
  it('se rend sans aucune mention facultative renseignée', async () => {
    // Le bail doit rester imprimable pour être complété à la main : c'est le
    // principe même de l'application.
    const b = bail({
      clauses: undefined,
      revisionIRL: { trimestreReference: '', valeurIndice: 0, revisable: false },
      annexesChecklist: [],
      clausesParticulieres: [],
    });
    expect(await rendre(pdfBail(b, bien({ classeDPE: undefined }), [locataire(1)]))).toBeGreaterThan(1000);
  });

  it('se rend avec toutes les mentions renseignées', async () => {
    const b = bail({
      complementLoyer: { montant: 40, justification: 'Vue exceptionnelle' },
      dernierLoyerAncienLocataire: 480,
      resiliationResidencePrincipale: true,
      travaux: {
        depuisDernierBail: 'Réfection de la salle de bain — 4 200 €',
        majorationBailleur: '15 € par mois pendant 24 mois',
        diminutionLocataire: 'Néant',
      },
      clausesParticulieres: ['Animaux acceptés sous conditions'],
      annexesChecklist: [
        { id: 'a1', libelle: 'Diagnostic de performance énergétique', jointe: true, genereeParApp: false },
      ],
    });
    const bi = bien({
      identifiantFiscal: '631234567890',
      typeHabitat: 'collectif',
      periodeConstruction: 'avant_1949',
      classeDPE: 'D',
      equipementsTIC: 'Fibre optique',
      zoneTendue: true,
      zoneEncadrementLoyers: true,
      loyerReference: 12,
      loyerReferenceMajore: 14.4,
      servitudeResidencePrincipale: true,
      dossierTechniqueUrl: 'https://exemple.fr/ddt',
    });
    expect(await rendre(pdfBail(b, bi, [locataire(1)]))).toBeGreaterThan(1000);
  });

  it('se rend malgré un emplacement de locataire non pourvu', async () => {
    // Colocation annoncée mais second locataire pas encore connu : les zones
    // restent à compléter à la main, le document doit sortir quand même.
    const b = bail({ locataireIds: ['loc-1', 'inconnu'], clauseSolidarite: true });
    expect(await rendre(pdfBail(b, bien(), [locataire(1)]))).toBeGreaterThan(1000);
  });

  it('se rend avec un logement soumis à l’encadrement sans loyer de référence', async () => {
    const bi = bien({ zoneEncadrementLoyers: true, loyerReference: undefined, loyerReferenceMajore: undefined });
    expect(await rendre(pdfBail(bail(), bi, [locataire(1)]))).toBeGreaterThan(1000);
  });
});
