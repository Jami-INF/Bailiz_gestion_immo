import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { sha256Hex } from './crypto';
import { empreinteValide, normaliserEmpreinte, verifierFichier } from './empreinte';

const CONTENU = 'contenu du PDF signé';

function pdf(texte = CONTENU): Blob {
  return new Blob([texte], { type: 'application/pdf' });
}

beforeEach(async () => {
  await Promise.all([db.documents.clear(), db.edls.clear()]);
});

describe('normalisation des empreintes', () => {
  it('accepte la forme imprimée, par groupes de 8 caractères', () => {
    // `formatHash` espace l'empreinte sur le PDF : on doit pouvoir la recopier
    // telle qu'elle est lue.
    const brut = 'a'.repeat(64);
    const imprime = brut.replace(/(.{8})/g, '$1 ').trim();
    expect(normaliserEmpreinte(imprime)).toBe(brut);
    expect(empreinteValide(imprime)).toBe(true);
  });

  it('refuse ce qui n’est pas un SHA-256', () => {
    expect(empreinteValide('trop court')).toBe(false);
    expect(empreinteValide('z'.repeat(64))).toBe(false);
  });
});

describe('vérification contre les documents archivés', () => {
  it('reconnaît un PDF signé et dit à quoi il correspond', async () => {
    const blob = pdf();
    await db.documents.put({
      id: 'doc-1',
      reference: 'EDL-2026-0001',
      type: 'edl_entree',
      titre: "EDL d'entrée — T2 Chamalières",
      blob,
      hash: await sha256Hex(blob),
      signe: true,
      createdAt: '2026-02-01T10:00:00.000Z',
    });

    const r = await verifierFichier(pdf());
    expect(r.statut).toBe('correspond');
    if (r.statut !== 'correspond') return;
    expect(r.reference).toBe('EDL-2026-0001');
    expect(r.libelle).toContain('EDL');
  });

  it('détecte la moindre modification', async () => {
    const blob = pdf();
    await db.documents.put({
      id: 'doc-1',
      reference: 'EDL-2026-0001',
      type: 'edl_entree',
      titre: 'EDL',
      blob,
      hash: await sha256Hex(blob),
      signe: true,
      createdAt: '2026-02-01T10:00:00.000Z',
    });

    expect((await verifierFichier(pdf(`${CONTENU} `))).statut).toBe('inconnu');
  });

  it('reste prudent quand rien ne correspond', async () => {
    const r = await verifierFichier(pdf());
    expect(r.statut).toBe('inconnu');
    // L'empreinte est tout de même rendue : elle sert à comparer à la main.
    expect(r.empreinte).toHaveLength(64);
  });
});

describe('vérification contre les états des lieux', () => {
  async function edlSigne(hash: string, rectifications?: { dateSignature: string; pdfHash: string }[]) {
    await db.edls.put({
      id: 'edl-1',
      reference: 'EDL-2026-0007',
      bailId: 'bail-1',
      type: 'sortie',
      date: '2026-02-01T10:00:00.000Z',
      compteurs: [],
      cles: [],
      pieces: [],
      statut: 'signe',
      avenants: [],
      pdfHash: hash,
      rectifications,
      signatures: {
        dateSignature: '2026-02-01T10:00:00.000Z',
        lieu: 'Chamalières',
        bailleur: {
          nomComplet: 'Jami Infante',
          luEtApprouve: true,
          imageDataUrl: '',
          horodatage: '2026-02-01T10:00:00.000Z',
        },
        locataires: [],
      },
      createdAt: '2026-02-01T10:00:00.000Z',
      updatedAt: '2026-02-01T10:00:00.000Z',
    });
  }

  it('reconnaît la version en vigueur', async () => {
    await edlSigne(await sha256Hex(pdf()));
    const r = await verifierFichier(pdf());
    expect(r.statut).toBe('correspond');
    if (r.statut !== 'correspond') return;
    expect(r.reference).toBe('EDL-2026-0007');
    expect(r.rectifie).toBeUndefined();
  });

  it('signale une version antérieure comme authentique mais remplacée', async () => {
    // Un document rectifié reste authentique : le dire est plus utile que de
    // répondre « inconnu », et c'est ce qui compte en cas de litige.
    const ancienne = await sha256Hex(pdf('première version'));
    await edlSigne(await sha256Hex(pdf()), [
      { dateSignature: '2026-01-15T10:00:00.000Z', pdfHash: ancienne },
    ]);

    const r = await verifierFichier(pdf('première version'));
    expect(r.statut).toBe('correspond');
    if (r.statut !== 'correspond') return;
    expect(r.rectifie).toBe(true);
    expect(r.dateSignature).toBe('2026-01-15T10:00:00.000Z');
  });
});

describe('vérification contre une empreinte attendue', () => {
  it('confirme la concordance avec une empreinte lue sur papier', async () => {
    const attendu = await sha256Hex(pdf());
    // Aucun document en base : seule l'empreinte fournie fait foi.
    expect((await verifierFichier(pdf(), attendu)).statut).toBe('inconnu');
  });

  it('signale une empreinte qui ne correspond pas, avant toute autre recherche', async () => {
    const r = await verifierFichier(pdf(), 'f'.repeat(64));
    expect(r.statut).toBe('attendu_different');
  });

  it('tolère l’empreinte recopiée avec ses espaces', async () => {
    const attendu = (await sha256Hex(pdf())).replace(/(.{8})/g, '$1 ');
    expect((await verifierFichier(pdf(), attendu)).statut).not.toBe('attendu_different');
  });
});
