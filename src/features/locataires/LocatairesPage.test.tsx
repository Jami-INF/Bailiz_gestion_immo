import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '@/lib/db';
import { LocatairesPage } from './LocatairesPage';
import { rendre, semer, unBail, unEdl, unLocataire, utilisateur, viderBase } from '@/test/utils';

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
});

const NOMS: [string, string][] = [
  ['Claire', 'Durand'],
  ['Marc', 'Lefèvre'],
  ['Zoé', 'Martin'],
  ['Paul', 'Bernard'],
  ['Inès', 'Petit'],
  ['Hugo', 'Moreau'],
];

async function semerLocataires() {
  for (const [i, [prenom, nom]] of NOMS.entries()) {
    await db.locataires.put(
      unLocataire({
        id: `loc-${i}`,
        prenom,
        nom,
        email: `${prenom.toLowerCase()}@example.org`,
        updatedAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      }),
    );
  }
}

describe('liste des locataires', () => {
  it('trouve un locataire malgré les accents', async () => {
    await semerLocataires();
    rendre(<LocatairesPage />);
    await utilisateur().type(await screen.findByRole('searchbox'), 'lefevre');

    expect(screen.getByText(/Marc Lefèvre/)).toBeInTheDocument();
    expect(screen.queryByText(/Claire Durand/)).not.toBeInTheDocument();
  });

  it('cherche aussi dans l’e-mail', async () => {
    await semerLocataires();
    rendre(<LocatairesPage />);
    await utilisateur().type(await screen.findByRole('searchbox'), 'zoe@example');

    expect(screen.getByText(/Zoé Martin/)).toBeInTheDocument();
  });

  it('remonte les locataires en cours de bail', async () => {
    await semerLocataires();
    await db.baux.put(unBail({ locataireIds: ['loc-5'], statut: 'actif' }));
    rendre(<LocatairesPage />);
    await utilisateur().selectOptions(await screen.findByRole('combobox'), 'baux');

    const titres = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titres[0]).toContain('Hugo Moreau');
  });
});

describe('suppression RGPD', () => {
  it('est bloquée tant qu’un bail en cours est lié', async () => {
    await semer({ bail: { statut: 'genere' } });
    rendre(<LocatairesPage />);

    await utilisateur().click(await screen.findByRole('button', { name: /Supprimer \(RGPD\)/ }));
    await utilisateur().click(await screen.findByRole('button', { name: /^Supprimer définitivement/ }));

    expect(await screen.findByText(/Suppression bloquée/)).toBeInTheDocument();
    expect(await db.locataires.count()).toBe(1);
  });

  it('efface le locataire et tout ce qui porte ses données', async () => {
    await semer({ bail: { statut: 'termine' }, edl: {} });
    await db.documents.put({
      id: 'doc-1',
      reference: 'EDL-2026-0001',
      type: 'edl_entree',
      titre: 'EDL - Claire Durand',
      bailId: 'bail-1',
      edlId: 'edl-1',
      blob: new Blob(['x']),
      signe: true,
      createdAt: '2026-01-01T10:00:00.000Z',
    });
    await db.photos.put({
      id: 'photo-1',
      blob: new Blob(['x']),
      dateCapture: '2026-01-01T10:00:00.000Z',
      edlId: 'edl-1',
    });
    rendre(<LocatairesPage />);

    await utilisateur().click(await screen.findByRole('button', { name: /Supprimer \(RGPD\)/ }));
    // Le périmètre exact est annoncé avant confirmation.
    expect(await screen.findByText(/1 bail/)).toBeInTheDocument();
    await utilisateur().click(screen.getByRole('button', { name: /^Supprimer définitivement/ }));

    await vi.waitFor(async () => expect(await db.locataires.count()).toBe(0));
    expect(await db.baux.count()).toBe(0);
    expect(await db.edls.count()).toBe(0);
    expect(await db.documents.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
  });

  it('conserve le bail en colocation et retire seulement le locataire', async () => {
    await semer({ bail: { statut: 'termine', locataireIds: ['loc-1', 'loc-2'] } });
    await db.locataires.put(unLocataire({ id: 'loc-2', prenom: 'Marc', nom: 'Lefèvre' }));
    await db.edls.put(unEdl());
    rendre(<LocatairesPage />);

    const boutons = await screen.findAllByRole('button', { name: /Supprimer \(RGPD\)/ });
    await utilisateur().click(boutons[0]);
    await utilisateur().click(screen.getByRole('button', { name: /^Supprimer définitivement/ }));

    await vi.waitFor(async () => expect(await db.locataires.count()).toBe(1));
    const bail = await db.baux.get('bail-1');
    expect(bail?.locataireIds).toEqual(['loc-2']);
  });
});
