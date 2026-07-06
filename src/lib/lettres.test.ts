import { describe, expect, it } from 'vitest';
import { entierEnLettres, montantEnLettres } from './lettres';

describe('entierEnLettres', () => {
  it('gère les cas simples', () => {
    expect(entierEnLettres(0)).toBe('zéro');
    expect(entierEnLettres(7)).toBe('sept');
    expect(entierEnLettres(17)).toBe('dix-sept');
    expect(entierEnLettres(42)).toBe('quarante-deux');
  });

  it('applique les règles françaises particulières', () => {
    expect(entierEnLettres(21)).toBe('vingt et un');
    expect(entierEnLettres(71)).toBe('soixante et onze');
    expect(entierEnLettres(75)).toBe('soixante-quinze');
    expect(entierEnLettres(80)).toBe('quatre-vingts');
    expect(entierEnLettres(81)).toBe('quatre-vingt-un');
    expect(entierEnLettres(95)).toBe('quatre-vingt-quinze');
  });

  it('accorde « cent » et « quatre-vingts » seulement en fin de nombre', () => {
    expect(entierEnLettres(200)).toBe('deux cents');
    expect(entierEnLettres(201)).toBe('deux cent un');
    expect(entierEnLettres(180)).toBe('cent quatre-vingts');
    expect(entierEnLettres(380_000)).toBe('trois cent quatre-vingt mille');
  });

  it('gère milliers et millions', () => {
    expect(entierEnLettres(1000)).toBe('mille');
    expect(entierEnLettres(1240)).toBe('mille deux cent quarante');
    expect(entierEnLettres(2026)).toBe('deux mille vingt-six');
    expect(entierEnLettres(1_000_000)).toBe('un million');
    expect(entierEnLettres(2_500_101)).toBe('deux millions cinq cent mille cent un');
  });
});

describe('montantEnLettres', () => {
  it('écrit les montants du bail en toutes lettres', () => {
    expect(montantEnLettres(420)).toBe('quatre cent vingt euros');
    expect(montantEnLettres(1240)).toBe('mille deux cent quarante euros');
    expect(montantEnLettres(1)).toBe('un euro');
    expect(montantEnLettres(0)).toBe('zéro euro');
  });

  it('gère les centimes', () => {
    expect(montantEnLettres(620.5)).toBe('six cent vingt euros et cinquante centimes');
    expect(montantEnLettres(99.01)).toBe('quatre-vingt-dix-neuf euros et un centime');
  });
});
