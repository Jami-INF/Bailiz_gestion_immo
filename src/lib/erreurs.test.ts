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

describe('decrireErreur — causes restantes', () => {
  /** Chaque cause a son propre conseil : c'est tout l'intérêt de la traduction. */
  const cas: [string, string, RegExp][] = [
    ['InvalidStateError', 'The database connection is closing.', /base de données indisponible/],
    ['DataCloneError', 'Failed to store value.', /donnée non enregistrable/],
    ['AbortError', 'Transaction aborted.', /transaction interrompue/],
    ['TransactionInactiveError', 'Transaction is not active.', /transaction interrompue/],
  ];

  for (const [nom, message, attendu] of cas) {
    it(`traduit ${nom}`, () => {
      const e = new Error(message);
      e.name = nom;
      const msg = decrireErreur(e);
      expect(msg).toMatch(attendu);
      expect(msg).toContain(message);
    });
  }

  it('reconnaît une base fermée au message, même sans nom explicite', () => {
    // Certains navigateurs ne posent pas le `name` attendu : le message reste
    // le seul indice, et le conseil (recharger) est le même.
    const e = new Error('The database connection is closed.');
    e.name = 'UnknownError';
    expect(decrireErreur(e)).toMatch(/base de données indisponible/);
  });

  it('reconnaît un quota dépassé au message', () => {
    expect(decrireErreur(new Error('Storage quota exceeded'))).toMatch(/stockage saturé/);
  });

  it('reste lisible sur une erreur sans message', () => {
    const e = new Error('');
    e.name = '';
    expect(decrireErreur(e)).toBe('Error : ');
  });
});
