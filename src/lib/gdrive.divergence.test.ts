import { describe, expect, it } from 'vitest';
import type { ArchiveDrive } from '@/types';
import { comparerArchives } from './gdrive';

const CET_APPAREIL = 'appareil-local';
const AUTRE_APPAREIL = 'appareil-ipad';

function archive(m: Partial<ArchiveDrive> = {}): ArchiveDrive {
  return {
    id: 'fichier-1',
    nom: 'bailiz-sauvegarde-2026-08-08-100000.zip',
    createdTime: '2026-08-08T10:00:00.000Z',
    ...m,
  };
}

describe('comparerArchives', () => {
  it('ne signale rien quand le Drive est vide', () => {
    expect(comparerArchives(undefined, undefined, CET_APPAREIL)).toEqual({ etat: 'aucune' });
    expect(comparerArchives(undefined, archive(), CET_APPAREIL)).toEqual({ etat: 'aucune' });
  });

  it('reconnaît une archive poussée par cet appareil, même sans référence locale', () => {
    const distante = archive({ appareil: CET_APPAREIL });
    const r = comparerArchives(distante, undefined, CET_APPAREIL);
    expect(r.etat).toBe('a_jour');
    expect(r.adopter).toBe(true);
  });

  it('signale une divergence quand un autre appareil a poussé après nous', () => {
    const vue = archive({ id: 'ancienne', createdTime: '2026-08-07T09:00:00.000Z', appareil: CET_APPAREIL });
    const distante = archive({
      id: 'recente',
      createdTime: '2026-08-08T14:32:00.000Z',
      appareil: AUTRE_APPAREIL,
      appareilNom: 'iPad',
    });
    const r = comparerArchives(distante, vue, CET_APPAREIL);
    expect(r.etat).toBe('divergence');
    expect(r.etat === 'divergence' && r.archive.appareilNom).toBe('iPad');
  });

  it('ne signale rien si l’archive distante est celle que nous connaissons', () => {
    const vue = archive({ id: 'meme', appareil: AUTRE_APPAREIL });
    const distante = archive({ id: 'meme', appareil: AUTRE_APPAREIL });
    expect(comparerArchives(distante, vue, CET_APPAREIL).etat).toBe('a_jour');
  });

  it('ne signale rien si l’archive distante est plus ancienne que la nôtre', () => {
    const vue = archive({ id: 'nouvelle', createdTime: '2026-08-08T12:00:00.000Z' });
    const distante = archive({
      id: 'vieille',
      createdTime: '2026-08-01T12:00:00.000Z',
      appareil: AUTRE_APPAREIL,
    });
    expect(comparerArchives(distante, vue, CET_APPAREIL).etat).toBe('a_jour');
  });

  describe('archives antérieures au marquage', () => {
    it('adopte sans alerter au premier contact', () => {
      // Cas de la mise à jour de l'application : l'archive existante est la
      // nôtre selon toute vraisemblance, et rien ne permet de prouver l'inverse.
      const r = comparerArchives(archive(), undefined, CET_APPAREIL);
      expect(r.etat).toBe('a_jour');
      expect(r.adopter).toBe(true);
    });

    it('signale une divergence si elle apparaît après une référence connue', () => {
      // Un autre appareil, resté sur l'ancienne version, a poussé depuis.
      const vue = archive({ id: 'connue', createdTime: '2026-08-07T09:00:00.000Z' });
      const distante = archive({ id: 'surprise', createdTime: '2026-08-08T09:00:00.000Z' });
      expect(comparerArchives(distante, vue, CET_APPAREIL).etat).toBe('divergence');
    });
  });

  it('compare des dates, pas des chaînes : un fuseau différent ne trompe pas', () => {
    // 08/08 09:00 UTC est postérieur à 08/08 10:00+02:00 (soit 08:00 UTC),
    // alors qu'une comparaison lexicale conclurait l'inverse.
    const vue = archive({ id: 'locale', createdTime: '2026-08-08T10:00:00.000+02:00' });
    const distante = archive({
      id: 'distante',
      createdTime: '2026-08-08T09:00:00.000Z',
      appareil: AUTRE_APPAREIL,
    });
    expect(comparerArchives(distante, vue, CET_APPAREIL).etat).toBe('divergence');
  });

  it('ne confond pas deux appareils dont l’un a perdu son identifiant', () => {
    // localStorage effacé : l'appareil a une nouvelle identité et considère sa
    // propre archive comme étrangère. Un avertissement de trop, jamais un
    // écrasement silencieux.
    const vue = archive({ id: 'ancienne', createdTime: '2026-08-07T09:00:00.000Z' });
    const distante = archive({
      id: 'recente',
      createdTime: '2026-08-08T09:00:00.000Z',
      appareil: 'ancienne-identite-du-meme-appareil',
    });
    expect(comparerArchives(distante, vue, CET_APPAREIL).etat).toBe('divergence');
  });
});
