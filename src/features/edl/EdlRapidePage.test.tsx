import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { db, parametresDefaut } from '@/lib/db';
import { rendreRoute, unBien, unLocataire, utilisateur, viderBase } from '@/test/utils';
import { EdlRapidePage } from './EdlRapidePage';

/** Monte l'écran de création derrière sa route, avec le repère de navigation. */
function monter(route = '/edl/nouveau') {
  return rendreRoute('/edl/nouveau', <EdlRapidePage />, route);
}

beforeEach(viderBase);

describe('création rapide d’un état des lieux', () => {
  it("crée un état des lieux sans aucun bail, avec le logement et le locataire choisis", async () => {
    const u = utilisateur();
    await db.parametres.put(parametresDefaut());
    await db.biens.add(unBien({ piecesModele: [{ id: 'pm-1', nom: 'Séjour', ordre: 0, elements: [] }] }));
    await db.locataires.add(unLocataire());

    monter();
    const selectLogement = await screen.findByLabelText(/Logement/);
    await u.selectOptions(selectLogement, 'bien-1');
    await u.click(await screen.findByRole('button', { name: /Claire Durand/ }));
    await u.click(screen.getByRole('button', { name: /Commencer l'état des lieux/ }));

    await waitFor(async () => expect(await db.edls.count()).toBe(1));
    const edl = (await db.edls.toArray())[0];
    expect(edl.bailId).toBeUndefined();
    expect(edl.bienId).toBe('bien-1');
    expect(edl.locataireIds).toEqual(['loc-1']);
    expect(edl.type).toBe('entree');
  });

  it("n'autorise pas à commencer sans logement ni locataire", async () => {
    await db.parametres.put(parametresDefaut());
    await db.biens.add(unBien());
    monter();

    const bouton = await screen.findByRole('button', { name: /Commencer l'état des lieux/ });
    expect(bouton).toBeDisabled();
  });

  it('pré-sélectionne le logement passé en paramètre (depuis sa fiche)', async () => {
    await db.parametres.put(parametresDefaut());
    await db.biens.add(unBien());
    monter('/edl/nouveau?bien=bien-1');

    const selectLogement = await screen.findByLabelText(/Logement/);
    expect(selectLogement).toHaveValue('bien-1');
  });

  /*
   * Cas du visiteur arrivant de bailiz.fr sur une base neuve : sans ce bloc,
   * son état des lieux signé porterait un bailleur vide.
   */
  it('réclame le bailleur tant que les Paramètres sont vierges, et l’enregistre', async () => {
    const u = utilisateur();
    await db.parametres.put(parametresDefaut());
    await db.biens.add(unBien());
    await db.locataires.add(unLocataire());

    monter();
    await u.type(await screen.findByLabelText(/Nom/), 'Infante');
    await u.type(screen.getByLabelText(/Prénom/), 'Jami');
    await u.selectOptions(await screen.findByLabelText(/Logement/), 'bien-1');
    await u.click(await screen.findByRole('button', { name: /Claire Durand/ }));
    await u.click(screen.getByRole('button', { name: /Commencer l'état des lieux/ }));

    await waitFor(async () => {
      const p = await db.parametres.get('singleton');
      expect(p?.bailleur.nom).toBe('Infante');
    });
  });

  it('masque le bloc bailleur une fois les Paramètres renseignés', async () => {
    await db.parametres.put({
      ...parametresDefaut(),
      bailleur: { ...parametresDefaut().bailleur, nom: 'Infante', prenom: 'Jami' },
    });
    await db.biens.add(unBien());
    monter();

    await screen.findByLabelText(/Logement/);
    expect(screen.queryByText(/Vous, le bailleur/)).not.toBeInTheDocument();
  });

  /*
   * Un logement créé à la volée n'a pas de pièces : ouvrir le mode terrain sur
   * une liste vide condamnerait le constat avant de l'avoir commencé.
   */
  it("propose une trame déduite du type et l'enregistre sur le logement", async () => {
    const u = utilisateur();
    await db.parametres.put(parametresDefaut());
    await db.biens.add(unBien({ type: 'T2', nbPieces: 2, piecesModele: [] }));
    await db.locataires.add(unLocataire());

    monter();
    await u.selectOptions(await screen.findByLabelText(/Logement/), 'bien-1');
    expect(await screen.findByRole('button', { name: 'Séjour', pressed: true })).toBeInTheDocument();
    // Un T2 a une chambre : le séjour compte parmi les pièces principales.
    expect(screen.getByRole('button', { name: 'Chambre', pressed: true })).toBeInTheDocument();

    // On écarte les WC : la trame retenue est celle que l'utilisateur laisse cochée.
    await u.click(screen.getByRole('button', { name: 'WC', pressed: true }));
    await u.click(await screen.findByRole('button', { name: /Claire Durand/ }));
    await u.click(screen.getByRole('button', { name: /Commencer l'état des lieux/ }));

    await waitFor(async () => expect(await db.edls.count()).toBe(1));
    const bien = await db.biens.get('bien-1');
    expect(bien?.piecesModele.map((p) => p.nom)).toContain('Séjour');
    expect(bien?.piecesModele.map((p) => p.nom)).not.toContain('WC');
  });

  it("demande la provenance de l'état d'entrée pour une sortie", async () => {
    const u = utilisateur();
    await db.parametres.put(parametresDefaut());
    await db.biens.add(unBien());
    await db.locataires.add(unLocataire());

    monter();
    await u.click(await screen.findByRole('button', { name: /État des lieux de sortie/ }));
    await u.click(screen.getByRole('radio', { name: /Aucun état des lieux d'entrée n'a été fait/ }));
    // L'avertissement est affiché avant de commencer, pas découvert à la fin.
    expect(screen.getByText(/art\. 1731 du code civil/)).toBeInTheDocument();

    await u.selectOptions(screen.getByLabelText(/Logement/), 'bien-1');
    await u.click(await screen.findByRole('button', { name: /Claire Durand/ }));
    await u.click(screen.getByRole('button', { name: /Commencer l'état des lieux/ }));

    await waitFor(async () => expect(await db.edls.count()).toBe(1));
    const edl = (await db.edls.toArray())[0];
    expect(edl.type).toBe('sortie');
    expect(edl.origineEtatEntree).toBe('aucun');
  });
});
