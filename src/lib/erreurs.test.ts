import { describe, expect, it } from 'vitest';
import { decrireErreur } from './erreurs';

describe('decrireErreur', () => {
  it('traduit un dépassement de quota de stockage', () => {
    const e = new Error('The quota has been exceeded.');
    e.name = 'QuotaExceededError';
    const msg = decrireErreur(e);
    expect(msg).toContain('stockage saturé');
    expect(msg).toContain('QuotaExceededError');
  });

  it('traduit un conflit de clé', () => {
    const e = new Error('Key already exists in the object store.');
    e.name = 'ConstraintError';
    expect(decrireErreur(e)).toContain('conflit de clé');
  });

  it('expose nom et message pour une erreur inconnue', () => {
    const e = new Error('boom');
    e.name = 'TypeError';
    expect(decrireErreur(e)).toBe('TypeError : boom');
  });

  it('accepte une valeur non-Error', () => {
    expect(decrireErreur('panne réseau')).toBe('panne réseau');
    expect(decrireErreur(42)).toBe('42');
  });
});
