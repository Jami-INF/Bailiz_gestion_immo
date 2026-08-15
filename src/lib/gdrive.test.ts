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

  /*
   * Régression : le type du contenu était écrit en dur à `application/zip`,
   * hérité de l'époque où cette fonction ne servait qu'à pousser l'archive de
   * sauvegarde. La synchronisation l'a reprise pour **tous** les fichiers, et
   * chaque PDF partait donc sur le Drive déclaré comme une archive - pour
   * revenir tel quel sur l'autre appareil, où Chrome nommait le téléchargement
   * d'après ce type : un bail enregistré en `.zip`, PDF valide à l'intérieur.
   */
  it('déclare le type réel du contenu, et pas une constante', async () => {
    const pdf = await construireCorpsMultipart(
      { name: 'BAIL-2026-0001.pdf' },
      new Blob(['%PDF'], { type: 'application/pdf' }),
      'f',
    ).corps.text();
    expect(pdf).toContain('Content-Type: application/pdf\r\n\r\n%PDF');
    expect(pdf).not.toContain('application/zip');

    const photo = await construireCorpsMultipart(
      { name: 'photo.jpg' },
      new Blob(['JPG'], { type: 'image/jpeg' }),
      'f',
    ).corps.text();
    expect(photo).toContain('Content-Type: image/jpeg\r\n\r\nJPG');
  });

  it('retombe sur un type générique quand le blob n’en annonce aucun', async () => {
    const texte = await construireCorpsMultipart({}, new Blob(['x']), 'f').corps.text();
    expect(texte).toContain('Content-Type: application/octet-stream');
  });
});
