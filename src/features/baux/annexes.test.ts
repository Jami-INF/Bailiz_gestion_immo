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
