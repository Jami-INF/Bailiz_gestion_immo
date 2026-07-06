import { describe, expect, it } from 'vitest';
import { fichiersASupprimer } from './autosave';

describe('fichiersASupprimer (rotation des sauvegardes)', () => {
  const nom = (i: number) => `bailiz-sauvegarde-2026-07-${String(i).padStart(2, '0')}-120000.zip`;

  it('ne supprime rien sous le seuil', () => {
    const noms = [nom(1), nom(2), nom(3)];
    expect(fichiersASupprimer(noms, 10)).toEqual([]);
  });

  it('supprime les plus anciennes au-delà du seuil', () => {
    const noms = Array.from({ length: 12 }, (_, i) => nom(i + 1)).reverse();
    expect(fichiersASupprimer(noms, 10)).toEqual([nom(1), nom(2)]);
  });

  it('ignore les fichiers étrangers au motif bailiz-sauvegarde-*.zip', () => {
    const noms = ['photo.jpg', 'notes.txt', nom(1), nom(2), 'bail.pdf'];
    expect(fichiersASupprimer(noms, 1)).toEqual([nom(1)]);
  });
});
