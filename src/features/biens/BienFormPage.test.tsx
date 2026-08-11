import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '@/lib/db';
import { BienFormPage } from './BienFormPage';
import { rendreRoute, semer, unBien, utilisateur, viderBase } from '@/test/utils';

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
});

function rendreNouveau() {
  return rendreRoute('/biens/nouveau', <BienFormPage />, '/biens/nouveau');
}

function rendreModification() {
  return rendreRoute('/biens/:id/modifier', <BienFormPage />, '/biens/bien-1/modifier');
}

/** Attend que le brouillon soit écrit (l'écriture est différée de 600 ms). */
async function brouillon(cle: string) {
  return vi.waitFor(
    async () => {
      const b = await db.brouillons.get(cle);
      expect(b).toBeDefined();
      return b!;
    },
    { timeout: 4000 },
  );
}

describe('brouillon du formulaire de bien', () => {
  it('écrit la saisie en continu, sans créer de fiche', async () => {
    rendreNouveau();
    await utilisateur().type(await screen.findByLabelText(/Nom du bien/), 'T5 Lyon');

    const b = await brouillon('bien:nouveau');
    expect((b.donnees as { bien: { nom: string } }).bien.nom).toBe('T5 Lyon');
    // Le point essentiel : rien n'est enregistré dans la liste des biens.
    expect(await db.biens.count()).toBe(0);
  });

  it('reprend la saisie au retour et le signale', async () => {
    await db.brouillons.put({
      cle: 'bien:nouveau',
      updatedAt: '2026-08-11T09:35:00.000Z',
      donnees: {
        bien: unBien({ id: 'brouillon-1', nom: 'T5 Repris' }),
        textes: { equipements: '', communs: '', annexes: '' },
        etape: 0,
      },
    });
    rendreNouveau();

    expect(await screen.findByDisplayValue('T5 Repris')).toBeInTheDocument();
    expect(screen.getByText(/Saisie reprise/)).toBeInTheDocument();
  });

  it('efface le brouillon à l’enregistrement', async () => {
    await db.parametres.clear();
    rendreNouveau();
    const u = utilisateur();
    await u.type(await screen.findByLabelText(/Nom du bien/), 'T5 Lyon');
    await u.type(screen.getByLabelText(/^Adresse/), '99 avenue du Test');
    await u.type(screen.getByLabelText(/Code postal/), '69001');
    await u.type(screen.getByLabelText(/^Ville/), 'Lyon');
    await brouillon('bien:nouveau');

    // Les étapes 2 à 5 n'ont pas de champ obligatoire au-delà des surfaces.
    await u.click(screen.getByRole('button', { name: 'Suivant' }));
    await u.clear(screen.getByLabelText(/Surface habitable/));
    await u.type(screen.getByLabelText(/Surface habitable/), '30');
    for (let i = 0; i < 3; i++) await u.click(screen.getByRole('button', { name: 'Suivant' }));
    await u.click(screen.getByRole('button', { name: /Enregistrer le bien/ }));

    await vi.waitFor(async () => expect(await db.biens.count()).toBe(1));
    expect(await db.brouillons.get('bien:nouveau')).toBeUndefined();
  });

  it('permet d’écarter la saisie et de repartir de la fiche enregistrée', async () => {
    await semer();
    await db.brouillons.put({
      cle: 'bien:bien-1',
      updatedAt: '2026-08-11T09:35:00.000Z',
      baseUpdatedAt: unBien().updatedAt,
      donnees: {
        bien: unBien({ nom: 'Nom en cours de frappe' }),
        textes: { equipements: '', communs: '', annexes: '' },
        etape: 0,
      },
    });
    rendreModification();

    expect(await screen.findByDisplayValue('Nom en cours de frappe')).toBeInTheDocument();
    await utilisateur().click(screen.getByRole('button', { name: /Repartir de la fiche enregistrée/ }));

    expect(await screen.findByDisplayValue('T2 Chamalières')).toBeInTheDocument();
    await vi.waitFor(async () => expect(await db.brouillons.get('bien:bien-1')).toBeUndefined());
  });

  it('écarte un brouillon devancé par une modification de la fiche', async () => {
    // Cas de la synchronisation : la fiche a changé sur l'autre appareil depuis
    // le début de la saisie. Reprendre le brouillon écraserait cette version.
    await semer({ bien: { updatedAt: '2026-09-01T00:00:00.000Z', nom: 'Nom reçu par sync' } });
    await db.brouillons.put({
      cle: 'bien:bien-1',
      updatedAt: '2026-08-11T09:35:00.000Z',
      baseUpdatedAt: '2026-01-01T10:00:00.000Z',
      donnees: {
        bien: unBien({ nom: 'Saisie périmée' }),
        textes: { equipements: '', communs: '', annexes: '' },
        etape: 0,
      },
    });
    rendreModification();

    expect(await screen.findByDisplayValue('Nom reçu par sync')).toBeInTheDocument();
    expect(screen.queryByText(/Saisie reprise/)).not.toBeInTheDocument();
    await vi.waitFor(async () => expect(await db.brouillons.get('bien:bien-1')).toBeUndefined());
  });
});
