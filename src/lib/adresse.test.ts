import { describe, expect, it } from 'vitest';
import { formatAdresse } from './adresse';

describe('formatAdresse', () => {
  it('assemble une adresse complète', () => {
    expect(formatAdresse({ ligne1: '12 rue des Lilas', codePostal: '63000', ville: 'Clermont-Ferrand' })).toBe(
      '12 rue des Lilas, 63000 Clermont-Ferrand',
    );
  });

  it('inclut le complément d’adresse', () => {
    expect(
      formatAdresse({ ligne1: '7 av. de la Gare', ligne2: 'Bât. B', codePostal: '63400', ville: 'Chamalières' }),
    ).toBe('7 av. de la Gare, Bât. B, 63400 Chamalières');
  });

  it('ignore les parties manquantes sans laisser de séparateur orphelin', () => {
    expect(formatAdresse({ ligne1: '12 rue des Lilas' })).toBe('12 rue des Lilas');
    expect(formatAdresse({ codePostal: '63000', ville: 'Clermont' })).toBe('63000 Clermont');
    expect(formatAdresse({ ligne1: '  ', codePostal: '', ville: 'Lyon' })).toBe('Lyon');
  });

  it('accepte une adresse absente', () => {
    expect(formatAdresse()).toBe('');
    expect(formatAdresse({})).toBe('');
  });
});
