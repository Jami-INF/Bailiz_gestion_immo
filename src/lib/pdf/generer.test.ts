import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { nomFichierDocument, nomsPersonnes } from './generer';

describe('nomsPersonnes', () => {
  it('formate 1, 2 ou plusieurs personnes', () => {
    expect(nomsPersonnes([{ prenom: 'Marie', nom: 'Dupont' }])).toBe('Marie Dupont');
    expect(
      nomsPersonnes([
        { prenom: 'Marie', nom: 'Dupont' },
        { prenom: 'Jean', nom: 'Martin' },
      ]),
    ).toBe('Marie Dupont et Jean Martin');
    expect(
      nomsPersonnes([
        { prenom: 'Marie', nom: 'Dupont' },
        { prenom: 'Jean', nom: 'Martin' },
        { prenom: 'Léa', nom: 'Petit' },
      ]),
    ).toBe('Marie Dupont et 2 autres');
    expect(nomsPersonnes([])).toBe('');
  });
});

describe('nomFichierDocument', () => {
  it('compose référence + titre + date', () => {
    expect(
      nomFichierDocument({
        reference: 'BAIL-2026-0001',
        titre: 'Bail meublé — T2 Chamalières — Marie Dupont',
        createdAt: '2026-07-07T10:00:00.000Z',
      }),
    ).toBe('BAIL-2026-0001 - Bail meublé — T2 Chamalières — Marie Dupont - 2026-07-07.pdf');
  });

  it('nettoie les caractères interdits dans les noms de fichiers', () => {
    expect(
      nomFichierDocument({
        reference: 'DOC-2026-0001',
        titre: 'Révision: IRL / T2 "Gare" <2026>',
        createdAt: '2026-07-07T10:00:00.000Z',
      }),
    ).toBe('DOC-2026-0001 - Révision- IRL - T2 -Gare- -2026- - 2026-07-07.pdf');
  });

  it('retombe sur référence + date sans titre', () => {
    expect(nomFichierDocument({ reference: 'EDL-2026-0001', createdAt: '2026-07-07T10:00:00.000Z' })).toBe(
      'EDL-2026-0001 - 2026-07-07.pdf',
    );
  });
});
