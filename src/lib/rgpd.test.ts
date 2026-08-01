import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { perimetreSuppressionLocataire, supprimerLocataireEtDonnees } from './rgpd';
import type { Bail, EtatDesLieux, Locataire } from '@/types';

function locataire(id: string, nom: string): Locataire {
  return {
    id,
    civilite: 'Mme',
    nom,
    prenom: 'Marie',
    email: `${id}@x.fr`,
    telephone: '0600000000',
    createdAt: '',
    updatedAt: '',
  };
}

function bail(id: string, locataireIds: string[]): Bail {
  return {
    id,
    reference: `BAIL-${id}`,
    bienId: 'bien-1',
    locataireIds,
    clauseSolidarite: locataireIds.length > 1,
    typeBail: 'meuble_1an',
    dateEffet: '2026-01-01',
    dureeMois: 12,
    loyerHC: 600,
    charges: { mode: 'forfait', montant: 50 },
    depotGarantie: 1200,
    jourPaiement: 5,
    modePaiement: 'Virement bancaire',
    revisionIRL: { trimestreReference: '', valeurIndice: 0, revisable: false },
    clausesParticulieres: [],
    annexesChecklist: [],
    statut: 'termine',
    createdAt: '',
    updatedAt: '',
  };
}

function edl(id: string, bailId: string): EtatDesLieux {
  return {
    id,
    reference: `EDL-${id}`,
    bailId,
    type: 'entree',
    date: '2026-01-01T00:00:00.000Z',
    compteurs: [],
    cles: [],
    pieces: [],
    statut: 'signe',
    avenants: [],
    createdAt: '',
    updatedAt: '',
  };
}

const pdf = (id: string, extra: Partial<{ bailId: string; edlId: string }>) => ({
  id,
  reference: `DOC-${id}`,
  type: 'bail' as const,
  titre: 'Bail meublé — Marie Dupont',
  blob: new Blob(['x']),
  signe: false,
  createdAt: '',
  ...extra,
});

beforeEach(async () => {
  await Promise.all([db.locataires, db.baux, db.edls, db.photos, db.documents].map((t) => t.clear()));
});

describe('suppression RGPD d’un locataire', () => {
  it('efface aussi les baux, EDL, photos et PDF qui portent ses données', async () => {
    await db.locataires.add(locataire('loc-1', 'Dupont'));
    await db.baux.add(bail('bail-1', ['loc-1']));
    await db.edls.add(edl('edl-1', 'bail-1'));
    await db.photos.add({ id: 'ph-1', blob: new Blob(['x']), dateCapture: '', edlId: 'edl-1' });
    await db.documents.bulkAdd([pdf('doc-1', { bailId: 'bail-1' }), pdf('doc-2', { edlId: 'edl-1' })]);

    const perimetre = await perimetreSuppressionLocataire('loc-1');
    expect(perimetre).toMatchObject({ bauxSupprimes: ['BAIL-bail-1'], edls: 1, photos: 1, documents: 2 });

    await supprimerLocataireEtDonnees('loc-1');

    expect(await db.locataires.count()).toBe(0);
    expect(await db.baux.count()).toBe(0);
    expect(await db.edls.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
    expect(await db.documents.count()).toBe(0);
  });

  it('conserve un bail en colocation et se contente d’en retirer le locataire', async () => {
    await db.locataires.bulkAdd([locataire('loc-1', 'Dupont'), locataire('loc-2', 'Martin')]);
    await db.baux.add(bail('bail-coloc', ['loc-1', 'loc-2']));
    await db.edls.add(edl('edl-coloc', 'bail-coloc'));
    await db.documents.add(pdf('doc-coloc', { bailId: 'bail-coloc' }));

    const perimetre = await perimetreSuppressionLocataire('loc-1');
    expect(perimetre.bauxSupprimes).toEqual([]);
    expect(perimetre.bauxPartages).toEqual(['BAIL-bail-coloc']);
    expect(perimetre.documents).toBe(0);

    await supprimerLocataireEtDonnees('loc-1');

    const restant = await db.baux.get('bail-coloc');
    expect(restant?.locataireIds).toEqual(['loc-2']);
    // Le document du bail concerne aussi l'autre colocataire : il est conservé.
    expect(await db.documents.count()).toBe(1);
    expect(await db.edls.count()).toBe(1);
    expect(await db.locataires.count()).toBe(1);
  });

  it('n’affecte pas les données d’un autre locataire', async () => {
    await db.locataires.bulkAdd([locataire('loc-1', 'Dupont'), locataire('loc-2', 'Martin')]);
    await db.baux.bulkAdd([bail('bail-1', ['loc-1']), bail('bail-2', ['loc-2'])]);
    await db.documents.bulkAdd([pdf('doc-1', { bailId: 'bail-1' }), pdf('doc-2', { bailId: 'bail-2' })]);

    await supprimerLocataireEtDonnees('loc-1');

    expect(await db.baux.toArray()).toHaveLength(1);
    expect((await db.baux.toArray())[0].id).toBe('bail-2');
    expect(await db.documents.count()).toBe(1);
    expect(await db.locataires.count()).toBe(1);
  });

  it('supprime un locataire sans aucune donnée liée', async () => {
    await db.locataires.add(locataire('loc-seul', 'Solo'));
    const perimetre = await supprimerLocataireEtDonnees('loc-seul');
    expect(perimetre).toEqual({ bauxSupprimes: [], bauxPartages: [], edls: 0, photos: 0, documents: 0 });
    expect(await db.locataires.count()).toBe(0);
  });
});
