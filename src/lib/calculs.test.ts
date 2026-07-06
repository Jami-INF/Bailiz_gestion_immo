import { describe, expect, it } from 'vitest';
import {
  coefficientVetuste,
  delaiRestitutionJours,
  depotGarantieMax,
  prorataPremierLoyer,
  retenueApresVetuste,
  revisionIRL,
  totalRetenues,
  validerDecenceDPE,
  validerDepotGarantie,
  validerDuree,
} from './calculs';

describe('prorataPremierLoyer', () => {
  it('calcule le prorata pour une entrée en cours de mois', () => {
    // Entrée le 16 janvier : 16 jours occupés sur 31
    const r = prorataPremierLoyer(new Date(2026, 0, 16), 620, 80);
    expect(r.joursOccupes).toBe(16);
    expect(r.joursDansMois).toBe(31);
    expect(r.loyerHC).toBeCloseTo((620 * 16) / 31, 2);
    expect(r.total).toBeCloseTo(r.loyerHC + r.charges, 2);
  });

  it('vaut le loyer complet pour une entrée le 1er du mois', () => {
    const r = prorataPremierLoyer(new Date(2026, 3, 1), 500, 50);
    expect(r.loyerHC).toBe(500);
    expect(r.charges).toBe(50);
    expect(r.total).toBe(550);
  });
});

describe('revisionIRL', () => {
  it('applique la formule loyer × nouvel indice / ancien indice', () => {
    const r = revisionIRL(600, 142.06, 145.47);
    expect(r.nouveauLoyer).toBeCloseTo(614.4, 1);
    expect(r.augmentation).toBeCloseTo(14.4, 1);
    expect(r.pct).toBeCloseTo(2.4, 1);
  });

  it('rejette un indice de référence nul', () => {
    expect(() => revisionIRL(600, 0, 145)).toThrow();
  });
});

describe('dépôt de garantie', () => {
  it('plafonne à 2 mois hors charges en meublé', () => {
    expect(depotGarantieMax('meuble_1an', 600)).toBe(1200);
    expect(validerDepotGarantie('meuble_1an', 600, 1200).valide).toBe(true);
  });

  it('refuse un dépôt de 3 mois de loyer avec message explicite', () => {
    const r = validerDepotGarantie('meuble_1an', 600, 1800);
    expect(r.valide).toBe(false);
    expect(r.message).toMatch(/2 mois/);
  });

  it('interdit tout dépôt pour un bail mobilité', () => {
    expect(depotGarantieMax('mobilite', 600)).toBe(0);
    const r = validerDepotGarantie('mobilite', 600, 100);
    expect(r.valide).toBe(false);
    expect(r.message).toMatch(/mobilité/);
  });
});

describe('validerDuree', () => {
  it('impose 12 mois au meublé classique et 9 mois à l’étudiant', () => {
    expect(validerDuree('meuble_1an', 12).valide).toBe(true);
    expect(validerDuree('meuble_1an', 9).valide).toBe(false);
    expect(validerDuree('meuble_etudiant_9mois', 9).valide).toBe(true);
    expect(validerDuree('meuble_etudiant_9mois', 12).valide).toBe(false);
  });

  it('accepte 1 à 10 mois en mobilité', () => {
    expect(validerDuree('mobilite', 1).valide).toBe(true);
    expect(validerDuree('mobilite', 10).valide).toBe(true);
    expect(validerDuree('mobilite', 11).valide).toBe(false);
  });
});

describe('vétusté et retenues', () => {
  const peintures = { poste: 'Peintures', dureeVieAnnees: 10, franchiseAnnees: 1, abattementAnnuelPct: 10 };

  it('coefficient 100 % pendant la franchise', () => {
    expect(coefficientVetuste(peintures, 0)).toBe(1);
    expect(coefficientVetuste(peintures, 1)).toBe(1);
  });

  it('applique l’abattement annuel après franchise', () => {
    expect(coefficientVetuste(peintures, 4)).toBeCloseTo(0.7, 2);
    expect(coefficientVetuste(peintures, 6)).toBeCloseTo(0.5, 2);
  });

  it('part résiduelle de 10 % puis 0 % au-delà de la durée de vie', () => {
    expect(coefficientVetuste(peintures, 9)).toBeCloseTo(0.2, 2);
    expect(coefficientVetuste(peintures, 10)).toBe(0);
    expect(coefficientVetuste(peintures, 25)).toBe(0);
  });

  it('calcule la retenue = coût × coefficient', () => {
    expect(retenueApresVetuste(1000, peintures, 4)).toBeCloseTo(700, 2);
    expect(retenueApresVetuste(1000, undefined, 4)).toBe(1000);
  });

  it('additionne les retenues du décompte', () => {
    expect(
      totalRetenues([
        { pieceNom: 'Séjour', elementNom: 'Murs', description: '', cout: 100, coefVetuste: 0.5, retenue: 50 },
        { pieceNom: 'Cuisine', elementNom: 'Sol', description: '', cout: 200, coefVetuste: 1, retenue: 200 },
      ]),
    ).toBe(250);
  });
});

describe('validerDecenceDPE', () => {
  const en2026 = new Date(2026, 6, 1);

  it('interdit la location d’un logement G depuis 2025', () => {
    const r = validerDecenceDPE('G', en2026);
    expect(r.valide).toBe(false);
    expect(r.bloquant).toBe(true);
    expect(r.message).toMatch(/2025/);
  });

  it('alerte sans bloquer pour F (2028) et E (2034)', () => {
    const f = validerDecenceDPE('F', en2026);
    expect(f.valide).toBe(true);
    expect(f.message).toMatch(/2028/);
    const e = validerDecenceDPE('E', en2026);
    expect(e.valide).toBe(true);
    expect(e.message).toMatch(/2034/);
  });

  it('bloque F à partir de 2028 et E à partir de 2034', () => {
    expect(validerDecenceDPE('F', new Date(2028, 0, 2)).valide).toBe(false);
    expect(validerDecenceDPE('E', new Date(2034, 5, 1)).valide).toBe(false);
  });

  it('laisse passer A-D et signale une classe absente', () => {
    expect(validerDecenceDPE('C', en2026)).toEqual({ valide: true, bloquant: false });
    const absent = validerDecenceDPE(undefined, en2026);
    expect(absent.valide).toBe(true);
    expect(absent.message).toBeTruthy();
  });
});

describe('delaiRestitutionJours', () => {
  it('1 mois si conforme, 2 mois si retenues', () => {
    expect(delaiRestitutionJours(false)).toBe(30);
    expect(delaiRestitutionJours(true)).toBe(60);
  });
});
