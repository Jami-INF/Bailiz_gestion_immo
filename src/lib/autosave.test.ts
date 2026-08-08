import { describe, expect, it } from 'vitest';
import { agregerResultats, fichiersASupprimer } from './autosave';

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

describe('agregerResultats', () => {
  it('signale le conflit même si une destination a réussi', () => {
    // Le dossier local est écrit, le Drive est suspendu : taire le conflit
    // laisserait l'utilisateur croire ses deux appareils synchronisés.
    expect(agregerResultats(['ok', 'conflit'])).toBe('conflit');
    expect(agregerResultats(['conflit', 'ok'])).toBe('conflit');
  });

  it('renvoie ok dès qu’une destination a réussi', () => {
    expect(agregerResultats(['ok', 'inactif'])).toBe('ok');
    expect(agregerResultats(['erreur', 'ok'])).toBe('ok');
  });

  it('remonte l’état le plus actionnable en l’absence de succès', () => {
    expect(agregerResultats(['erreur', 'permission_requise'])).toBe('permission_requise');
    expect(agregerResultats(['erreur', 'hors_ligne'])).toBe('hors_ligne');
    expect(agregerResultats(['inactif', 'erreur'])).toBe('erreur');
    expect(agregerResultats(['inactif', 'non_supporte'])).toBe('inactif');
  });
});
