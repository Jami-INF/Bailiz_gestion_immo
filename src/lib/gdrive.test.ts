import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { construireCorpsMultipart } from './gdrive';

describe('construireCorpsMultipart', () => {
  it('assemble un corps multipart/related conforme (métadonnées + contenu)', async () => {
    const contenu = new Blob(['ZIPDATA'], { type: 'application/zip' });
    const { corps, contentType } = construireCorpsMultipart(
      { name: 'bailiz-sauvegarde-2026-07-07-120000.zip', parents: ['dossier123'] },
      contenu,
      'frontiere-test',
    );

    expect(contentType).toBe('multipart/related; boundary=frontiere-test');
    const texte = await corps.text();
    // Deux parties délimitées par la frontière, fermées par la frontière finale.
    expect(texte.startsWith('--frontiere-test\r\n')).toBe(true);
    expect(texte.endsWith('\r\n--frontiere-test--')).toBe(true);
    expect(texte).toContain('Content-Type: application/json; charset=UTF-8');
    expect(texte).toContain('"name":"bailiz-sauvegarde-2026-07-07-120000.zip"');
    expect(texte).toContain('"parents":["dossier123"]');
    expect(texte).toContain('Content-Type: application/zip\r\n\r\nZIPDATA');
  });

  it('génère une frontière unique par défaut', () => {
    const a = construireCorpsMultipart({}, new Blob(['x']));
    const b = construireCorpsMultipart({}, new Blob(['x']));
    expect(a.contentType).not.toBe(b.contentType);
  });
});
