import { describe, expect, it } from 'vitest';
import { masquerSaisieDate, parserDateFr, versDateFr } from './dates';

describe('parserDateFr', () => {
  it('parse une date valide JJ/MM/AAAA', () => {
    expect(parserDateFr('06/07/2026')).toBe('2026-07-06');
    expect(parserDateFr('01/01/2000')).toBe('2000-01-01');
  });

  it('rejette les formats incomplets ou invalides', () => {
    expect(parserDateFr('6/7/2026')).toBeNull();
    expect(parserDateFr('06/07/26')).toBeNull();
    expect(parserDateFr('')).toBeNull();
    expect(parserDateFr('abc')).toBeNull();
  });

  it('rejette les dates inexistantes (31 février…)', () => {
    expect(parserDateFr('31/02/2026')).toBeNull();
    expect(parserDateFr('32/01/2026')).toBeNull();
    expect(parserDateFr('01/13/2026')).toBeNull();
  });
});

describe('versDateFr', () => {
  it('formate une date ISO courte ou complète', () => {
    expect(versDateFr('2026-07-06')).toBe('06/07/2026');
    expect(versDateFr('2026-07-06T14:30:00.000Z')).toBe('06/07/2026');
  });

  it('gère vide et invalide sans erreur', () => {
    expect(versDateFr(undefined)).toBe('');
    expect(versDateFr('')).toBe('');
    expect(versDateFr('pas-une-date')).toBe('');
  });
});

describe('masquerSaisieDate', () => {
  it('insère les séparateurs au fil de la frappe', () => {
    expect(masquerSaisieDate('0')).toBe('0');
    expect(masquerSaisieDate('06')).toBe('06');
    expect(masquerSaisieDate('060')).toBe('06/0');
    expect(masquerSaisieDate('0607')).toBe('06/07');
    expect(masquerSaisieDate('06072026')).toBe('06/07/2026');
  });

  it('ignore les caractères non numériques et tronque à 8 chiffres', () => {
    expect(masquerSaisieDate('06/07/2026')).toBe('06/07/2026');
    expect(masquerSaisieDate('06a07b2026999')).toBe('06/07/2026');
  });
});
