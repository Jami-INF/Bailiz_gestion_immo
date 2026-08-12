import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { db } from '@/lib/db';
import { TableauDeBordPage } from './TableauDeBordPage';
import { rendre, semer, unEdl, viderBase } from '@/test/utils';
import { figerDate } from '@/test/setup';

beforeEach(async () => {
  // Avant tout accès à la base : une horloge figée pendant `viderBase` bloque
  // les transactions Dexie.
  vi.useRealTimers();
  vi.restoreAllMocks();
  await viderBase();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tableau de bord - état des logements', () => {
  it('annonce le logement loué dès qu’un bail est enregistré', async () => {
    // Régression : le tableau ne comptait que les statuts « signé » et « actif »,
    // qu'aucune action n'attribue automatiquement. Un bail créé puis laissé tel
    // quel affichait le logement vacant et vidait l'échéancier.
    await semer({ bail: { statut: 'genere' } });
    rendre(<TableauDeBordPage />);

    expect(await screen.findByText('T2 Chamalières')).toBeInTheDocument();
    expect(screen.getByText('Loué')).toBeInTheDocument();
    expect(screen.queryByText('Vacant')).not.toBeInTheDocument();
  });

  it('annonce le logement vacant quand le bail est terminé', async () => {
    await semer({ bail: { statut: 'termine' } });
    rendre(<TableauDeBordPage />);

    expect(await screen.findByText('Vacant')).toBeInTheDocument();
  });

  it('inscrit le terme du bail et la révision IRL à l’échéancier', async () => {
    await semer({ bail: { statut: 'genere', dateEffet: '2026-06-01T00:00:00.000Z', dureeMois: 36 } });
    rendre(<TableauDeBordPage />);

    expect(await screen.findByText(/Reconduction tacite BAIL-2026-0001/)).toBeInTheDocument();
    expect(screen.getByText(/Révision IRL BAIL-2026-0001/)).toBeInTheDocument();
  });

  it('distingue la reconduction tacite de la fin de plein droit', async () => {
    // Un meublé d'un an se reconduit faute de congé ; annoncer « fin de bail »
    // laissait croire que le logement se libérait tout seul.
    await semer({ bail: { statut: 'actif', typeBail: 'meuble_1an', dureeMois: 12 } });
    rendre(<TableauDeBordPage />);

    expect(await screen.findByText(/Reconduction tacite/)).toBeInTheDocument();
    expect(screen.getByText(/Dernier jour pour donner congé/)).toBeInTheDocument();
    expect(screen.queryByText(/Fin de plein droit/)).not.toBeInTheDocument();
  });

  it('n’annonce aucun congé à donner pour un bail qui s’arrête seul', async () => {
    await semer({ bail: { statut: 'actif', typeBail: 'mobilite', dureeMois: 6, depotGarantie: 0 } });
    rendre(<TableauDeBordPage />);

    expect(await screen.findByText(/Fin de plein droit.*non renouvelable/)).toBeInTheDocument();
    expect(screen.queryByText(/Dernier jour pour donner congé/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reconduction tacite/)).not.toBeInTheDocument();
  });

  it('n’inscrit aucune échéance pour un brouillon', async () => {
    await semer({ bail: { statut: 'brouillon' } });
    rendre(<TableauDeBordPage />);

    expect(await screen.findByText(/Aucune échéance à venir/)).toBeInTheDocument();
  });
});

describe('tableau de bord - alerte de restitution du dépôt', () => {
  /** EDL de sortie signé le jour dit, sans dégradation. */
  async function edlSortieSigne(dateSignature: string, avecDegradation = false) {
    const pieces = unEdl().pieces.map((p) => ({
      ...p,
      elements: p.elements.map((e) => ({ ...e, etat: 'bon' as const, degradation: avecDegradation })),
    }));
    await db.edls.put(
      unEdl({
        id: 'edl-sortie',
        type: 'sortie',
        statut: 'signe',
        pieces,
        signatures: {
          dateSignature,
          lieu: 'Chamalières',
          bailleur: { nomComplet: 'Jami Infante', luEtApprouve: true, imageDataUrl: '', horodatage: dateSignature },
          locataires: [],
        },
      }),
    );
  }

  it('compte le délai en mois calendaires, pas en tranches de trente jours', async () => {
    // Remise des clés le 31 janvier : l'échéance est au 28 février, pas au 2 mars.
    await semer({ bail: { statut: 'termine' } });
    await edlSortieSigne('2026-01-31T12:00:00.000Z');
    figerDate('2026-02-10T12:00:00.000Z');

    rendre(<TableauDeBordPage />);
    expect(await screen.findByText(/dépôt de garantie à restituer avant le 28\/02\/2026/)).toBeInTheDocument();
  });

  it('double le délai en présence de dégradations', async () => {
    await semer({ bail: { statut: 'termine' } });
    await edlSortieSigne('2026-01-15T12:00:00.000Z', true);
    figerDate('2026-02-10T12:00:00.000Z');

    rendre(<TableauDeBordPage />);
    expect(await screen.findByText(/avant le 15\/03\/2026/)).toBeInTheDocument();
  });

  it('n’alerte pas quand aucun dépôt n’a été versé (bail mobilité)', async () => {
    await semer({ bail: { statut: 'termine', typeBail: 'mobilite', depotGarantie: 0 } });
    await edlSortieSigne('2026-01-31T12:00:00.000Z');
    figerDate('2026-02-10T12:00:00.000Z');

    rendre(<TableauDeBordPage />);
    await waitFor(() => expect(screen.getByText('T2 Chamalières')).toBeInTheDocument());
    expect(screen.queryByText(/dépôt de garantie à restituer/)).not.toBeInTheDocument();
  });
});

describe('tableau de bord - alerte de stockage saturé', () => {
  it('prévient avant que le navigateur refuse d’écrire', async () => {
    vi.spyOn(navigator.storage, 'estimate').mockResolvedValue({
      usage: 900 * 1024 * 1024,
      quota: 1000 * 1024 * 1024,
    });
    await semer();
    rendre(<TableauDeBordPage />);

    expect(await screen.findByText(/Stockage du navigateur occupé à 90 %/)).toBeInTheDocument();
  });

  it('reste muet en dessous du seuil', async () => {
    vi.spyOn(navigator.storage, 'estimate').mockResolvedValue({
      usage: 10 * 1024 * 1024,
      quota: 1000 * 1024 * 1024,
    });
    await semer();
    rendre(<TableauDeBordPage />);

    await waitFor(() => expect(screen.getByText('T2 Chamalières')).toBeInTheDocument());
    expect(screen.queryByText(/Stockage du navigateur occupé/)).not.toBeInTheDocument();
  });
});
