import { describe, expect, it } from 'vitest';
import type { Bail, RevisionLoyer, StatutBail } from '@/types';
import {
  baseRevisionIRL,
  dateApplicationRevision,
  derniereRevision,
  estBailEnCours,
  loyerCourant,
} from './bail';

function bail(p: Partial<Bail> = {}): Bail {
  return {
    id: 'b1',
    reference: 'BAIL-2026-0001',
    bienId: 'bien1',
    locataireIds: ['loc1'],
    clauseSolidarite: false,
    typeBail: 'meuble_1an',
    dateEffet: '2024-06-01T00:00:00.000Z',
    dureeMois: 12,
    loyerHC: 600,
    charges: { mode: 'forfait', montant: 50 },
    depotGarantie: 1200,
    jourPaiement: 5,
    modePaiement: 'virement',
    revisionIRL: { trimestreReference: '2e trimestre 2024', valeurIndice: 143.46, revisable: true },
    clausesParticulieres: [],
    annexesChecklist: [],
    statut: 'genere',
    createdAt: '2024-05-20T00:00:00.000Z',
    updatedAt: '2024-05-20T00:00:00.000Z',
    ...p,
  };
}

function revision(p: Partial<RevisionLoyer> = {}): RevisionLoyer {
  return {
    date: '2025-06-01T00:00:00.000Z',
    dateApplication: '2025-06-01T00:00:00.000Z',
    trimestreReference: '2e trimestre 2024',
    indiceReference: 143.46,
    nouveauTrimestre: '2e trimestre 2025',
    nouvelIndice: 146.33,
    ancienLoyer: 600,
    nouveauLoyer: 612,
    ...p,
  };
}

describe('estBailEnCours', () => {
  it('retient un bail généré, signé ou actif', () => {
    for (const statut of ['genere', 'signe', 'actif'] as StatutBail[]) {
      expect(estBailEnCours({ statut })).toBe(true);
    }
  });

  it('écarte le brouillon et le bail terminé', () => {
    expect(estBailEnCours({ statut: 'brouillon' })).toBe(false);
    expect(estBailEnCours({ statut: 'termine' })).toBe(false);
  });

  it("retient un bail à peine enregistré : c'est son état par défaut", () => {
    // Régression : le tableau de bord ne comptait que « signé » et « actif », et
    // aucun de ces deux statuts n'est posé automatiquement. Un bail créé puis
    // laissé tel quel laissait donc le logement affiché vacant.
    expect(estBailEnCours(bail({ statut: 'genere' }))).toBe(true);
  });
});

describe('loyerCourant', () => {
  it("vaut le loyer du contrat tant qu'aucune révision n'a été notifiée", () => {
    expect(loyerCourant(bail())).toBe(600);
  });

  it('vaut le loyer de la dernière révision', () => {
    const b = bail({
      revisionsLoyer: [
        revision(),
        revision({ dateApplication: '2026-06-01T00:00:00.000Z', ancienLoyer: 612, nouveauLoyer: 625 }),
      ],
    });
    expect(loyerCourant(b)).toBe(625);
  });

  it('ignore l’ordre de saisie et retient la révision la plus récente', () => {
    const b = bail({
      revisionsLoyer: [
        revision({ dateApplication: '2026-06-01T00:00:00.000Z', nouveauLoyer: 625 }),
        revision({ dateApplication: '2025-06-01T00:00:00.000Z', nouveauLoyer: 612 }),
      ],
    });
    expect(derniereRevision(b)?.nouveauLoyer).toBe(625);
    expect(loyerCourant(b)).toBe(625);
  });

  it('laisse le loyer du contrat intact : le bail se régénère à l’identique', () => {
    const b = bail({ revisionsLoyer: [revision()] });
    expect(b.loyerHC).toBe(600);
    expect(loyerCourant(b)).toBe(612);
  });
});

describe('baseRevisionIRL', () => {
  it('part du contrat pour la première révision', () => {
    expect(baseRevisionIRL(bail())).toEqual({
      loyer: 600,
      indice: 143.46,
      trimestre: '2e trimestre 2024',
    });
  });

  it('part de la révision précédente ensuite', () => {
    // Sans cela, le courrier de la deuxième année annonce un passage depuis le
    // loyer d'origine, vieux de deux ans.
    expect(baseRevisionIRL(bail({ revisionsLoyer: [revision()] }))).toEqual({
      loyer: 612,
      indice: 146.33,
      trimestre: '2e trimestre 2025',
    });
  });
});

describe('dateApplicationRevision', () => {
  it('vise le premier anniversaire pendant la première année du bail', () => {
    const d = dateApplicationRevision(bail(), new Date('2024-11-15T00:00:00.000Z'));
    expect(d.toISOString().slice(0, 10)).toBe('2025-06-01');
  });

  it('vise l’anniversaire à venir quand la demande est anticipée', () => {
    const b = bail({ revisionsLoyer: [revision()] }); // cycle 2025 déjà révisé
    const d = dateApplicationRevision(b, new Date('2026-04-10T00:00:00.000Z'));
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-01');
  });

  it('ne rétroagit pas si la révision est demandée après l’anniversaire', () => {
    // Anniversaire au 1er juin, demande le 20 septembre : la révision prend
    // effet à la demande (art. 17-1, I, al. 2), pas au 1er juin.
    const aujourdhui = new Date('2025-09-20T00:00:00.000Z');
    const d = dateApplicationRevision(bail(), aujourdhui);
    expect(d).toEqual(aujourdhui);
  });

  it('ne renvoie jamais une date passée — la régression corrigée', () => {
    // L'ancien calcul posait l'anniversaire de l'année civile en cours, donc une
    // date déjà écoulée dès qu'on s'y prenait en retard.
    const aujourdhui = new Date('2025-09-20T00:00:00.000Z');
    expect(dateApplicationRevision(bail(), aujourdhui).getTime()).toBeGreaterThanOrEqual(
      aujourdhui.getTime(),
    );
  });

  it('enchaîne les cycles sans jamais réviser deux fois le même', () => {
    const b = bail({ revisionsLoyer: [revision({ dateApplication: '2025-09-20T00:00:00.000Z' })] });
    const d = dateApplicationRevision(b, new Date('2025-11-01T00:00:00.000Z'));
    expect(d.toISOString().slice(0, 10)).toBe('2026-06-01');
  });
});
