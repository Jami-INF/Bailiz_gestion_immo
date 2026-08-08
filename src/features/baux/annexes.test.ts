import { describe, expect, it } from 'vitest';
import type { Bien } from '@/types';
import { annexesParDefaut } from './annexes';

function bien(regimeJuridique: Bien['regimeJuridique']): Bien {
  return {
    id: 'b1',
    nom: 'T2',
    adresse: { ligne1: '1 rue A', codePostal: '63000', ville: 'Clermont' },
    type: 'T2',
    surfaceBoutin: 40,
    nbPieces: 2,
    regimeJuridique,
    equipementsPrivatifs: [],
    partiesCommunes: [],
    annexes: [],
    chauffage: { type: 'individuel', energie: 'électricité' },
    eauChaude: { type: 'individuel', energie: 'électricité' },
    zoneEncadrementLoyers: false,
    piecesModele: [],
    createdAt: '',
    updatedAt: '',
  };
}

describe('annexesParDefaut', () => {
  it('coche d’office les annexes que l’application génère elle-même', () => {
    const items = annexesParDefaut(bien('monopropriete'));
    const generees = items.filter((i) => i.genereeParApp);
    expect(generees.length).toBeGreaterThan(0);
    expect(generees.every((i) => i.jointe)).toBe(true);
  });

  it('laisse à décocher les pièces que le bailleur doit fournir', () => {
    const items = annexesParDefaut(bien('monopropriete'));
    const externes = items.filter((i) => !i.genereeParApp);
    expect(externes.every((i) => !i.jointe)).toBe(true);
    // La notice d'information officielle est fournie avec son lien de téléchargement.
    const notice = items.find((i) => /Notice d'information/.test(i.libelle));
    expect(notice?.lien).toMatch(/^https?:\/\//);
  });

  it('n’ajoute le règlement de copropriété que pour un bien en copropriété', () => {
    const enCopro = annexesParDefaut(bien('copropriete'));
    const enMono = annexesParDefaut(bien('monopropriete'));
    const motif = /règlement de copropriété/i;
    expect(enCopro.some((i) => motif.test(i.libelle))).toBe(true);
    expect(enMono.some((i) => motif.test(i.libelle))).toBe(false);
    expect(enCopro).toHaveLength(enMono.length + 1);
  });

  it('mentionne l’état des lieux valant inventaire (fusion des deux documents)', () => {
    const items = annexesParDefaut(bien('copropriete'));
    expect(items.some((i) => /état des lieux d'entrée valant inventaire/i.test(i.libelle))).toBe(true);
    // Plus d'annexe « inventaire » distincte depuis la fusion.
    expect(items.filter((i) => /^Inventaire/i.test(i.libelle))).toHaveLength(0);
  });

  it('attribue un identifiant unique à chaque annexe', () => {
    const items = annexesParDefaut(bien('copropriete'));
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });
});

describe('annexesParDefaut — dossier de diagnostic technique conditionnel', () => {
  const avec = (m: Partial<Bien>) => annexesParDefaut({ ...bien('monopropriete'), ...m });
  const libelles = (items: ReturnType<typeof annexesParDefaut>) => items.map((i) => i.libelle).join(' | ');

  it("n'ajoute le CREP que pour un immeuble d'avant 1949", () => {
    expect(libelles(avec({ periodeConstruction: 'avant_1949' }))).toMatch(/CREP/);
    expect(libelles(avec({ periodeConstruction: '1949_1974' }))).not.toMatch(/CREP/);
    expect(libelles(avec({ periodeConstruction: 'apres_2005' }))).not.toMatch(/CREP/);
  });

  it('liste le CREP sous condition tant que la période de construction est inconnue', () => {
    const items = avec({ periodeConstruction: undefined });
    const crep = items.find((i) => /CREP/.test(i.libelle));
    expect(crep?.libelle).toMatch(/uniquement si/i);
  });

  it("n'exige les états gaz et électricité que pour les installations de plus de 15 ans", () => {
    const sans = avec({
      installationGazPlusDe15Ans: false,
      installationElectriquePlusDe15Ans: false,
    });
    expect(libelles(sans)).not.toMatch(/installation intérieure/i);

    const avecGaz = avec({ installationGazPlusDe15Ans: true, installationElectriquePlusDe15Ans: false });
    expect(libelles(avecGaz)).toMatch(/installation intérieure de gaz — installation de plus de 15 ans/i);
    expect(libelles(avecGaz)).not.toMatch(/électricité/i);
  });

  it("retire l'état des risques pour une commune non concernée, et le date à 6 mois sinon", () => {
    expect(libelles(avec({ zoneRisquesERP: false }))).not.toMatch(/état des risques/i);
    const erp = avec({ zoneRisquesERP: true }).find((i) => /état des risques/i.test(i.libelle));
    expect(erp?.libelle).toMatch(/moins de 6 mois/);
    expect(erp?.lien).toMatch(/georisques/);
  });

  it("n'ajoute le diagnostic bruit qu'en zone d'exposition aérodrome", () => {
    expect(libelles(avec({ zoneBruitAerodrome: true }))).toMatch(/nuisances sonores aériennes/i);
    expect(libelles(avec({}))).not.toMatch(/nuisances sonores/i);
  });

  it('conserve DPE et surface habitable dans tous les cas', () => {
    const minimal = libelles(
      avec({
        periodeConstruction: 'apres_2005',
        installationGazPlusDe15Ans: false,
        installationElectriquePlusDe15Ans: false,
        zoneRisquesERP: false,
      }),
    );
    expect(minimal).toMatch(/DPE/);
    expect(minimal).toMatch(/surface habitable/i);
  });
});
