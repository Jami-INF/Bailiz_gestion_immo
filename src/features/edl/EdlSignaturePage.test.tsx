import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { db } from '@/lib/db';
import { rendreRoute, semer, utilisateur, viderBase } from '@/test/utils';
import { EdlSignaturePage } from './EdlSignaturePage';

/*
 * La signature est l'acte qui donne sa valeur au document : elle fige le
 * constat, calcule son empreinte et archive le PDF opposable. Rien de tout cela
 * n'était couvert.
 *
 * Trois doublures, et seulement trois :
 *
 * - `signature_pad` pilote un `<canvas>`, que jsdom ne rend pas. C'est un
 *   périphérique graphique, pas de la logique : le doubler laisse intact tout
 *   ce que ce test regarde (le verrouillage, l'empreinte, l'archivage).
 * - le rendu PDF, dont la mise en page a ses tests dans `lib/pdf/`. L'empreinte,
 *   elle, reste calculée pour de bon sur le blob produit.
 * - la sauvegarde automatique, qui parlerait au Drive.
 */
vi.mock('signature_pad', () => {
  /*
   * Un seul pad vit à la fois - le composant en construit un neuf à chaque
   * signataire - d'où un état partagé que le constructeur remet à zéro, plutôt
   * qu'un suivi d'instances.
   */
  const etat = { vide: true, ecouteurs: [] as (() => void)[] };
  class FauxPad {
    constructor() {
      etat.vide = true;
      etat.ecouteurs = [];
    }
    addEventListener(nom: string, f: () => void) {
      if (nom === 'beginStroke') etat.ecouteurs.push(f);
    }
    isEmpty() {
      return etat.vide;
    }
    clear() {
      etat.vide = true;
    }
    toData() {
      return [];
    }
    fromData() {}
    toDataURL() {
      return 'data:image/png;base64,factice';
    }
    off() {}
  }
  return {
    default: FauxPad,
    /** Simule le tracé du doigt sur la tablette. */
    __tracer: () => {
      etat.vide = false;
      etat.ecouteurs.forEach((f) => f());
    },
  };
});

/*
 * Doubler `rendrePdfAvecHash`, et pas seulement `rendrePdf` : la première
 * appelle la seconde par sa référence **interne au module**, qu'un mock des
 * exports n'atteint pas - le vrai moteur de rendu tournait malgré la doublure.
 *
 * L'empreinte reste calculée par le vrai `sha256Hex`, mais **sur les octets** et
 * non sur le blob : l'`ArrayBuffer` que jsdom rend appartient à son propre
 * realm, et le `crypto.subtle` de Node le refuse (« 2nd argument is not
 * instance of ArrayBuffer »). Vérifié : un `Uint8Array` passe, cet
 * `ArrayBuffer`-là non. Contrainte de l'environnement seul - dans un
 * navigateur, les deux realms n'en font qu'un.
 *
 * Le blob rendu, lui, reste un `Blob` **nu**. Lui greffer une méthode - la
 * tentation, pour contourner le realm - y ajoute une fonction, et le clonage
 * structuré d'IndexedDB refuse alors de l'enregistrer : le document archivé
 * disparaissait sans erreur visible.
 */
const OCTETS_PDF = () => Uint8Array.from([0x25, 0x50, 0x44, 0x46]);
const pdfFactice = () => new Blob(['%PDF-factice'], { type: 'application/pdf' });

vi.mock('@/lib/pdf/generer', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/pdf/generer')>();
  const { sha256Hex } = await import('@/lib/crypto');
  return {
    ...reel,
    rendrePdf: vi.fn(async () => pdfFactice()),
    rendrePdfAvecHash: vi.fn(async () => ({
      blob: pdfFactice(),
      hash: await sha256Hex(OCTETS_PDF() as unknown as ArrayBuffer),
    })),
  };
});

vi.mock('@/lib/autosave', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/autosave')>()),
  pousserSiActive: vi.fn(async () => 'inactif' as const),
}));

/** Trace sur le pad courant - fonction ajoutée par la doublure, d'où le cast. */
const tracer = async () =>
  ((await import('signature_pad')) as unknown as { __tracer: () => void }).__tracer();

beforeEach(viderBase);

function monter() {
  return rendreRoute('/edl/:id/signature', <EdlSignaturePage />, '/edl/edl-1/signature');
}

/** Déroule le parcours complet jusqu'à la dernière signature (bailleur + 1 locataire). */
async function signerJusquAuBout() {
  const u = utilisateur();
  await u.type(await screen.findByLabelText(/Lieu de signature/), 'Chamalières');
  await u.click(screen.getByLabelText(/relu en présence de toutes les parties/));
  await u.click(screen.getByRole('button', { name: /Passer aux signatures/ }));

  // Bailleur, puis locataire : le nom est pré-proposé, on ne le retape pas.
  for (const suite of [/passer au signataire suivant/, /Valider la dernière signature/]) {
    await u.click(await screen.findByLabelText(/Lu et approuvé/));
    // Le tracé passe par le pad courant : la phase suivante en construit un neuf.
    await tracer();
    const valider = await screen.findByRole('button', { name: suite });
    // `tracer()` pose l'état hors d'un événement React : on attend que le bouton
    // s'arme plutôt que de cliquer dans le vide.
    await waitFor(() => expect(valider).toBeEnabled());
    await u.click(valider);
  }
}

describe('signature d’un état des lieux', () => {
  it('fige le constat, calcule son empreinte et archive le PDF signé', async () => {
    await semer({ edl: {} });
    monter();
    await signerJusquAuBout();

    await waitFor(async () => {
      expect((await db.edls.get('edl-1'))?.statut).toBe('signe');
    });
    const edl = await db.edls.get('edl-1');
    expect(edl?.signatures?.lieu).toBe('Chamalières');
    expect(edl?.signatures?.bailleur.luEtApprouve).toBe(true);
    expect(edl?.signatures?.locataires).toHaveLength(1);
    // L'empreinte est réellement calculée, pas recopiée : SHA-256 en hexadécimal.
    expect(edl?.pdfHash).toMatch(/^[0-9a-f]{64}$/);

    /*
     * Le document archivé porte `signe`, ce qui l'immunise contre l'écrasement
     * par une régénération ultérieure (`enregistrerDocument` ne supprime que les
     * versions non signées de même référence).
     */
    const docs = await db.documents.toArray();
    expect(docs).toHaveLength(1);
    expect(docs[0].signe).toBe(true);
    expect(docs[0].hash).toBe(edl?.pdfHash);
    expect(docs[0].edlId).toBe('edl-1');
  });

  it('rend le bail actif : un état des lieux d’entrée signé, c’est la remise des clés', async () => {
    await semer({ edl: {}, bail: { statut: 'genere' } });
    monter();
    await signerJusquAuBout();

    await waitFor(async () => {
      expect((await db.baux.get('bail-1'))?.statut).toBe('actif');
    });
  });

  it('termine le bail sur un état des lieux de sortie, avec sa date de fin', async () => {
    await semer({ edl: { type: 'sortie' }, bail: { statut: 'actif' } });
    monter();
    await signerJusquAuBout();

    await waitFor(async () => {
      expect((await db.baux.get('bail-1'))?.statut).toBe('termine');
    });
    const bail = await db.baux.get('bail-1');
    expect(bail?.dateFinEffective).toBeTruthy();
  });

  it('refuse de re-signer un état des lieux déjà signé', async () => {
    await semer({
      edl: {
        statut: 'signe',
        signatures: {
          dateSignature: '2026-02-01T10:00:00.000Z',
          lieu: 'Chamalières',
          bailleur: { nomComplet: 'Jami Infante', luEtApprouve: true, imageDataUrl: 'x', horodatage: '2026-02-01T10:00:00.000Z' },
          locataires: [],
        },
      },
    });
    monter();

    expect(await screen.findByText(/déjà signé et verrouillé/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Lieu de signature/)).not.toBeInTheDocument();
  });
});

describe('garde-fous du parcours de signature', () => {
  it('exige le lieu et la relecture avant d’ouvrir les signatures', async () => {
    const u = utilisateur();
    await semer({ edl: {} });
    monter();

    const passer = await screen.findByRole('button', { name: /Passer aux signatures/ });
    expect(passer).toBeDisabled();

    // La relecture seule ne suffit pas : le lieu figure sur le document.
    await u.click(screen.getByLabelText(/relu en présence de toutes les parties/));
    expect(passer).toBeDisabled();

    await u.type(screen.getByLabelText(/Lieu de signature/), 'Chamalières');
    expect(passer).toBeEnabled();
  });

  it('exige « lu et approuvé » et un tracé pour valider une signature', async () => {
    const u = utilisateur();
    await semer({ edl: {} });
    monter();

    await u.type(await screen.findByLabelText(/Lieu de signature/), 'Chamalières');
    await u.click(screen.getByLabelText(/relu en présence de toutes les parties/));
    await u.click(screen.getByRole('button', { name: /Passer aux signatures/ }));

    const valider = await screen.findByRole('button', { name: /passer au signataire suivant/ });
    expect(valider).toBeDisabled();

    // Case cochée mais aucun tracé : toujours refusé.
    await u.click(screen.getByLabelText(/Lu et approuvé/));
    expect(valider).toBeDisabled();

    await tracer();
    await waitFor(() => expect(valider).toBeEnabled());
  });
});
