import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { db, parametresDefaut } from '@/lib/db';
import { rendreRoute, unBien, unLocataire, utilisateur, viderBase } from '@/test/utils';
import { BailRapidePage } from './BailRapidePage';

/*
 * Le parcours principal du produit : rédiger un bail. Il n'était couvert par
 * aucun test alors qu'il écrit un bail, met à jour la fiche du logement et
 * archive deux PDF - trois écritures qu'un défaut de jonction peut désaccorder
 * en silence.
 *
 * Le **rendu** PDF est neutralisé : sa mise en page a ses propres tests dans
 * `lib/pdf/`, et l'aperçu automatique le relance à chaque frappe - chaque cas
 * paierait des secondes de rendu pour un résultat qu'il ne regarde pas.
 * `enregistrerDocument` reste réel, lui : ce que ce parcours doit prouver,
 * c'est que les documents arrivent bien en base, rattachés au bon bail.
 */
vi.mock('@/lib/pdf/generer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pdf/generer')>()),
  rendrePdf: vi.fn(async () => new Blob(['%PDF-factice'], { type: 'application/pdf' })),
  photoBienEnDataUrl: vi.fn(async () => undefined),
}));

beforeEach(viderBase);

function monter(route = '/baux/nouveau') {
  return rendreRoute('/baux/nouveau', <BailRapidePage />, route);
}

/** Sème les paramètres, un logement et un locataire réutilisables. */
async function semerBase() {
  await db.parametres.put(parametresDefaut());
  await db.biens.add(unBien());
  await db.locataires.add(unLocataire());
}

/** Choisit le logement et le locataire, seuls champs sans valeur par défaut. */
async function choisirBienEtLocataire() {
  const u = utilisateur();
  await u.selectOptions(await screen.findByLabelText(/^Bien/), 'bien-1');
  await u.selectOptions(screen.getByLabelText(/Fiche locataire/), 'loc-1');
  return u;
}

describe('rédaction d’un bail', () => {
  it('enregistre le bail, ses deux annexes PDF et les conditions sur le logement', async () => {
    await semerBase();
    monter();
    const u = await choisirBienEtLocataire();

    await u.click(screen.getByRole('button', { name: /^Enregistrer$/ }));

    /*
     * Point de rendez-vous sur l'archivage des PDF, **dernière** étape de
     * l'enregistrement : attendre l'écriture du bail laisserait passer la
     * lecture des documents, écrits juste après - une course que seule une
     * machine chargée révèle.
     */
    await waitFor(async () => expect(await db.documents.count()).toBe(2));
    const bail = (await db.baux.toArray())[0];
    expect(bail.bienId).toBe('bien-1');
    expect(bail.locataireIds).toEqual(['loc-1']);
    expect(bail.statut).toBe('genere');
    // Une référence est réservée à l'enregistrement, pas avant.
    expect(bail.reference).toMatch(/^BAIL-\d{4}-\d{4}$/);
    // Les pages de suivi supposent une date d'effet exploitable.
    expect(bail.dateEffet).toBeTruthy();
    expect(() => new Date(bail.dateEffet)).not.toThrow();

    /*
     * La grille de vétusté part **avec** le bail : c'est une annexe, et l'oubli
     * ne se verrait qu'au moment de la restitution du dépôt, des mois plus tard.
     */
    const docs = await db.documents.toArray();
    expect(docs.map((d) => d.type).sort()).toEqual(['bail', 'grille_vetuste']);
    expect(docs.every((d) => d.bailId === bail.id)).toBe(true);
    expect(docs.every((d) => d.bienId === 'bien-1')).toBe(true);
  });

  it('reporte le loyer saisi sur les conditions de location du logement', async () => {
    // Sans ce report, la fiche du bien et la fiche de visite continueraient
    // d'annoncer l'ancien loyer après la signature d'un nouveau bail.
    await semerBase();
    monter();
    const u = await choisirBienEtLocataire();

    const loyer = screen.getByLabelText(/Loyer mensuel hors charges/);
    await u.clear(loyer);
    await u.type(loyer, '780');
    await u.click(screen.getByRole('button', { name: /^Enregistrer$/ }));

    await waitFor(async () => expect(await db.baux.count()).toBe(1));
    expect((await db.baux.toArray())[0].loyerHC).toBe(780);
    const bien = await db.biens.get('bien-1');
    expect(bien?.conditionsLocation?.loyerHC).toBe(780);
  });

  it('avertit sans bloquer quand le dépôt dépasse deux mois de loyer', async () => {
    /*
     * Le parti pris du produit : on signale, on n'empêche pas - c'est au
     * bailleur de trancher. Un test qui vérifierait un blocage figerait
     * l'inverse de la décision prise.
     */
    await semerBase();
    monter();
    const u = await choisirBienEtLocataire();

    const loyer = screen.getByLabelText(/Loyer mensuel hors charges/);
    await u.clear(loyer);
    await u.type(loyer, '500');
    const depot = screen.getByLabelText(/Dépôt de garantie/);
    await u.clear(depot);
    await u.type(depot, '1500');

    expect(await screen.findByText(/dépasse le maximum légal de 2 mois/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Enregistrer$/ })).toBeEnabled();

    await u.click(screen.getByRole('button', { name: /^Enregistrer$/ }));
    await waitFor(async () => expect(await db.baux.count()).toBe(1));
  });

  it('avertit sur un logement classé G, dont la location est interdite', async () => {
    await db.parametres.put(parametresDefaut());
    await db.biens.add(unBien({ classeDPE: 'G' }));
    await db.locataires.add(unLocataire());
    monter();
    await choisirBienEtLocataire();

    expect(await screen.findByText(/classé G au DPE/)).toBeInTheDocument();
  });

  it('n’écrit aucun bien en double quand le logement vient de la base', async () => {
    // Régression possible : le formulaire sait aussi saisir un logement à la
    // volée, et confondre les deux chemins créerait un doublon à chaque bail.
    await semerBase();
    monter();
    const u = await choisirBienEtLocataire();

    await u.click(screen.getByRole('button', { name: /^Enregistrer$/ }));

    await waitFor(async () => expect(await db.baux.count()).toBe(1));
    expect(await db.biens.count()).toBe(1);
    expect(await db.locataires.count()).toBe(1);
  });
});
