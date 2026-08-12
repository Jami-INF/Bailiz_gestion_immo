import { describe, expect, it } from 'vitest';
import type { Bail, Bien, Locataire } from '@/types';
import { CLAUSES_BAIL_DEFAUT } from '@/lib/defauts';
import { lettrer, planDuContrat } from './bailPlan';

const bien = {
  id: 'b1',
  regimeJuridique: 'copropriete',
  annexes: [{ type: 'cave', description: 'n°12' }],
  partiesCommunes: ['Ascenseur'],
  servitudeResidencePrincipale: false,
} as unknown as Bien;

const bail = { clauses: undefined } as unknown as Bail;
const unLocataire = [{ id: 'l1' }] as Locataire[];
const deuxLocataires = [{ id: 'l1' }, { id: 'l2' }] as Locataire[];

const titres = (p: ReturnType<typeof planDuContrat>) => p.sommaire;

describe('lettrer', () => {
  it('ignore les sous-sections absentes sans laisser de trou', () => {
    expect(lettrer(['a', false, 'b', undefined, 'c'])).toEqual({ a: 'A', b: 'B', c: 'C' });
  });
});

describe('planDuContrat - parties', () => {
  it('numérote sans trou quand les conditions générales sont absentes', () => {
    const plan = planDuContrat({ bail, bien, locataires: unLocataire });
    expect(plan.num('honoraires')).toBe('VIII');
    expect(plan.num('particulieres')).toBe('IX');
    expect(plan.num('annexes')).toBe('X');
    expect(plan.num('clauses')).toBe('');
    expect(titres(plan)).not.toContain("X. Conditions générales d'occupation");
  });

  it('insère les conditions générales et décale la suite', () => {
    const plan = planDuContrat({
      bail: { ...bail, clauses: CLAUSES_BAIL_DEFAUT.filter((c) => c.active) },
      bien,
      locataires: unLocataire,
    });
    expect(plan.num('clauses')).toBe('IX');
    expect(plan.num('particulieres')).toBe('X');
    expect(plan.num('annexes')).toBe('XI');
  });

  it('ajoute la clause de solidarité en colocation seulement', () => {
    const seul = planDuContrat({ bail, bien, locataires: unLocataire });
    const coloc = planDuContrat({ bail, bien, locataires: deuxLocataires });
    expect(seul.num('solidarite')).toBe('');
    expect(coloc.num('solidarite')).toBe('VII');
    expect(coloc.num('resolutoire')).toBe('VIII');
    expect(seul.num('resolutoire')).toBe('VII');
  });

  it('garde le sommaire aligné sur les parties imprimées', () => {
    const plan = planDuContrat({ bail, bien, locataires: deuxLocataires });
    expect(plan.sommaire).toHaveLength(plan.parties.length);
    plan.parties.forEach((partie, i) => {
      expect(plan.sommaire[i]).toBe(`${plan.num(partie.cle)}. ${partie.titre}`);
    });
  });
});

describe('planDuContrat - sous-parties', () => {
  it('lettre l’objet du contrat selon ce que le logement comporte', () => {
    const complet = planDuContrat({ bail, bien, locataires: unLocataire }).sousObjet;
    expect(complet).toEqual({
      consistance: 'A',
      destination: 'B',
      accessoires: 'C',
      communs: 'D',
      tic: 'E',
    });

    const nu = planDuContrat({
      bail,
      bien: { ...bien, annexes: [], partiesCommunes: [] },
      locataires: unLocataire,
    }).sousObjet;
    expect(nu).toEqual({ consistance: 'A', destination: 'B', tic: 'C' });
  });

  it('lettre les conditions financières selon la présence de l’assurance colocataires', () => {
    const sans = planDuContrat({ bail, bien, locataires: unLocataire }).sousFinances;
    expect(sans).toEqual({ loyer: 'A', charges: 'B', paiement: 'C' });

    const avec = planDuContrat({
      bail: { ...bail, assuranceColocataires: { montantAnnuel: 180 } },
      bien,
      locataires: deuxLocataires,
    }).sousFinances;
    expect(avec).toEqual({ loyer: 'A', charges: 'B', assurance: 'C', paiement: 'D' });
  });
});

describe('planDuContrat - clauses conditionnelles', () => {
  it('écarte le règlement de copropriété en monopropriété', () => {
    const enMono = planDuContrat({
      bail: { ...bail, clauses: CLAUSES_BAIL_DEFAUT.filter((c) => c.active) },
      bien: { ...bien, regimeJuridique: 'monopropriete' },
      locataires: unLocataire,
    });
    const ids = enMono.clausesParFamille.flatMap(([, c]) => c.map((x) => x.id));
    expect(ids).not.toContain('imm-reglement');
    expect(ids).toContain('imm-tranquillite');
  });

  it('écarte la servitude de résidence principale si le bien n’y est pas soumis', () => {
    const ids = planDuContrat({
      bail: { ...bail, clauses: CLAUSES_BAIL_DEFAUT.filter((c) => c.active) },
      bien,
      locataires: unLocataire,
    }).clausesParFamille.flatMap(([, c]) => c.map((x) => x.id));
    expect(ids).not.toContain('occ-residence-principale');
  });

  it('ne retient que les familles non vides, dans l’ordre d’impression', () => {
    const plan = planDuContrat({
      bail: { ...bail, clauses: CLAUSES_BAIL_DEFAUT.filter((c) => c.famille === 'assurance') },
      bien,
      locataires: unLocataire,
    });
    expect(plan.clausesParFamille.map(([f]) => f)).toEqual(['assurance']);
  });
});
