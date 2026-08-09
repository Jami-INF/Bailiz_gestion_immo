import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  perimetreSuppressionBail,
  perimetreSuppressionLocataire,
  supprimerBailEtDonnees,
  supprimerLocataireEtDonnees,
} from './rgpd';
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

describe('suppression d’un bail', () => {
  /*
   * Il n'existait aucun moyen d'effacer un bail : une fiche restée en base
   * après un enregistrement interrompu — ou dont le bien avait disparu —
   * devenait définitive, et sa page était blanche.
   */
  beforeEach(async () => {
    await Promise.all([
      db.baux.clear(),
      db.edls.clear(),
      db.photos.clear(),
      db.documents.clear(),
      db.locataires.clear(),
      db.biens.clear(),
    ]);
  });

  async function bailAvecDependances() {
    await db.baux.put({ id: 'bail-1', reference: 'BAIL-2026-0001', bienId: 'bien-1', locataireIds: ['loc-1'] } as never);
    await db.baux.put({ id: 'bail-2', reference: 'BAIL-2026-0002', bienId: 'bien-1', locataireIds: ['loc-1'] } as never);
    await db.locataires.put({ id: 'loc-1', nom: 'Dupont' } as never);
    await db.biens.put({ id: 'bien-1', nom: 'T2' } as never);
    await db.edls.put({ id: 'edl-1', bailId: 'bail-1' } as never);
    await db.edls.put({ id: 'edl-autre', bailId: 'bail-2' } as never);
    await db.photos.put({ id: 'photo-1', edlId: 'edl-1', blob: new Blob(['x']) } as never);
    await db.photos.put({ id: 'photo-autre', edlId: 'edl-autre', blob: new Blob(['y']) } as never);
    await db.documents.put({ id: 'doc-bail', bailId: 'bail-1', blob: new Blob(['a']) } as never);
    await db.documents.put({ id: 'doc-edl', edlId: 'edl-1', blob: new Blob(['b']) } as never);
    await db.documents.put({ id: 'doc-autre', bailId: 'bail-2', blob: new Blob(['c']) } as never);
  }

  it('annonce précisément ce qui partira avec le bail', async () => {
    await bailAvecDependances();
    expect(await perimetreSuppressionBail('bail-1')).toEqual({ edls: 1, photos: 1, documents: 2 });
  });

  it('efface le bail et tout ce qui n’existe que par lui', async () => {
    // Les blobs surtout : un PDF ou une photo orphelins dans IndexedDB seraient
    // invisibles et impossibles à supprimer ensuite.
    await bailAvecDependances();
    await supprimerBailEtDonnees('bail-1');

    expect(await db.baux.get('bail-1')).toBeUndefined();
    expect(await db.edls.get('edl-1')).toBeUndefined();
    expect(await db.photos.get('photo-1')).toBeUndefined();
    expect(await db.documents.get('doc-bail')).toBeUndefined();
    expect(await db.documents.get('doc-edl')).toBeUndefined();
  });

  it('ne touche ni au bien, ni aux locataires, ni aux autres baux', async () => {
    // Ils existent indépendamment et peuvent porter d'autres baux.
    await bailAvecDependances();
    await supprimerBailEtDonnees('bail-1');

    expect(await db.biens.get('bien-1')).toBeTruthy();
    expect(await db.locataires.get('loc-1')).toBeTruthy();
    expect(await db.baux.get('bail-2')).toBeTruthy();
    expect(await db.edls.get('edl-autre')).toBeTruthy();
    expect(await db.photos.get('photo-autre')).toBeTruthy();
    expect(await db.documents.get('doc-autre')).toBeTruthy();
  });

  it('supprime un bail orphelin, sans bien ni locataire', async () => {
    // Le cas qui a motivé tout ceci.
    await db.baux.put({ id: 'orphelin', reference: 'BAIL-2026-0009', bienId: 'disparu', locataireIds: [] } as never);
    expect(await perimetreSuppressionBail('orphelin')).toEqual({ edls: 0, photos: 0, documents: 0 });
    await supprimerBailEtDonnees('orphelin');
    expect(await db.baux.get('orphelin')).toBeUndefined();
  });
});
