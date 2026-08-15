import { describe, expect, it } from 'vitest';
import { retyper, TYPE_PAR_TABLE, TYPE_PDF, TYPE_PHOTO } from './blobs';

/*
 * Le rattrapage des blobs mal typés.
 *
 * Les bases déjà synchronisées contiennent des PDF et des photos portant
 * `application/zip` : le type était écrit en dur dans le corps multipart envoyé
 * au Drive, et il revient tel quel au cycle suivant. Corriger l'envoi ne répare
 * pas ces données-là - c'est `retyper` qui s'en charge au moment de s'en servir.
 */
describe('retyper', () => {
  it('remet le type attendu sans toucher au contenu', async () => {
    const abime = new Blob(['%PDF-1.7'], { type: 'application/zip' });
    const repare = retyper(abime, TYPE_PDF);

    expect(repare.type).toBe(TYPE_PDF);
    // Le contenu était intact depuis le début : seul le type mentait. C'est
    // pourquoi renommer le fichier en `.pdf` suffisait à l'ouvrir.
    expect(await repare.text()).toBe('%PDF-1.7');
    expect(repare.size).toBe(abime.size);
  });

  it('rend le blob inchangé quand le type est déjà bon', () => {
    const sain = new Blob(['%PDF'], { type: TYPE_PDF });
    // Identité : pas de copie inutile d'un PDF de plusieurs mégaoctets.
    expect(retyper(sain, TYPE_PDF)).toBe(sain);
  });

  it('type un blob qui n’annonce rien', () => {
    expect(retyper(new Blob(['x']), TYPE_PHOTO).type).toBe(TYPE_PHOTO);
  });

  it('connaît le type des deux tables qui portent un contenu binaire', () => {
    expect(TYPE_PAR_TABLE.documents).toBe(TYPE_PDF);
    expect(TYPE_PAR_TABLE.photos).toBe(TYPE_PHOTO);
    // Les autres tables ne portent pas de blob : rien à retyper.
    expect(TYPE_PAR_TABLE.biens).toBeUndefined();
  });
});
