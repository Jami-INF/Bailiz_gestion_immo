import { describe, expect, it } from 'vitest';
import { urlExterneSure } from './liens';

describe('urlExterneSure', () => {
  it('accepte http et https', () => {
    expect(urlExterneSure('https://drive.google.com/drive/folders/abc')).toBe(
      'https://drive.google.com/drive/folders/abc',
    );
    expect(urlExterneSure('http://exemple.fr/ddt')).toBe('http://exemple.fr/ddt');
  });

  it('complète en https une saisie sans schéma', () => {
    expect(urlExterneSure('drive.google.com/folders/abc')).toBe('https://drive.google.com/folders/abc');
  });

  it('rejette les schémas exécutables ou embarqués', () => {
    expect(urlExterneSure('javascript:alert(1)')).toBeUndefined();
    expect(urlExterneSure('JavaScript:alert(1)')).toBeUndefined();
    expect(urlExterneSure('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(urlExterneSure('file:///etc/passwd')).toBeUndefined();
  });

  it('rejette une valeur vide ou invalide', () => {
    expect(urlExterneSure(undefined)).toBeUndefined();
    expect(urlExterneSure('   ')).toBeUndefined();
    expect(urlExterneSure('http://')).toBeUndefined();
  });
});
