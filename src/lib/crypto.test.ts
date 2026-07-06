import { describe, expect, it } from 'vitest';
import { formatHash, sha256Hex } from './crypto';

describe('sha256Hex', () => {
  it('calcule le vecteur de test connu de la chaîne vide', async () => {
    const hash = await sha256Hex(new ArrayBuffer(0));
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('calcule l’empreinte d’un Blob (comme le PDF finalisé)', async () => {
    const blob = new Blob(['abc']);
    const hash = await sha256Hex(blob);
    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('formatHash', () => {
  it('groupe par blocs de 8 caractères pour le PDF', () => {
    expect(formatHash('aaaaaaaabbbbbbbb')).toBe('aaaaaaaa bbbbbbbb');
  });
});
