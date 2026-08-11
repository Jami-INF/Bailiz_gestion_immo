import { describe, expect, it } from 'vitest';
import { comparerDatesDesc, comparerTexte, correspond, normaliser } from './recherche';

describe('normaliser', () => {
  it('retire les accents et la casse', () => {
    expect(normaliser('Chamalières')).toBe('chamalieres');
    expect(normaliser('  Zoé ÉLÈVE  ')).toBe('zoe eleve');
  });

  it('conserve le ç et les chiffres', () => {
    expect(normaliser('Besançon 63400')).toBe('besancon 63400');
  });
});

describe('correspond', () => {
  it('trouve malgré les accents et la casse', () => {
    expect(correspond('chamalieres', 'T2 Chamalières')).toBe(true);
    expect(correspond('DURAND', 'Claire', 'Durand')).toBe(true);
  });

  it('exige tous les mots, sans imposer leur ordre', () => {
    expect(correspond('durand claire', 'Claire', 'Durand')).toBe(true);
    expect(correspond('durand marc', 'Claire', 'Durand')).toBe(false);
  });

  it('cherche dans tous les champs fournis, y compris numériques', () => {
    expect(correspond('63400', 'T2', '12 rue des Prés', 63400)).toBe(true);
  });

  it('ne filtre rien sur une recherche vide', () => {
    expect(correspond('', 'quoi que ce soit')).toBe(true);
    expect(correspond('   ', 'quoi que ce soit')).toBe(true);
  });

  it('ignore les champs absents sans échouer', () => {
    expect(correspond('durand', undefined, null, '', 'Durand')).toBe(true);
    expect(correspond('durand', undefined, null)).toBe(false);
  });
});

describe('comparerTexte', () => {
  it('classe les accents comme leur lettre de base', () => {
    expect(comparerTexte('Élise', 'Emma')).toBeLessThan(0);
  });

  it('classe les nombres comme on les lit', () => {
    // Un tri purement alphabétique placerait « Chambre 10 » avant « Chambre 2 ».
    expect(comparerTexte('Chambre 2', 'Chambre 10')).toBeLessThan(0);
  });
});

describe('comparerDatesDesc', () => {
  it('classe du plus récent au plus ancien', () => {
    expect(comparerDatesDesc('2026-08-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBeLessThan(0);
  });

  it('relègue les dates absentes ou illisibles en fin de liste', () => {
    // Une fiche abîmée ne doit ni faire échouer le tri, ni remonter en tête.
    expect(comparerDatesDesc(undefined, '2026-01-01T00:00:00Z')).toBeGreaterThan(0);
    expect(comparerDatesDesc('pas une date', '2026-01-01T00:00:00Z')).toBeGreaterThan(0);
    expect(comparerDatesDesc(undefined, undefined)).toBe(0);
  });
});
