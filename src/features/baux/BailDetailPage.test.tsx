import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { db } from '@/lib/db';
import { BailDetailPage } from './BailDetailPage';
import { rendreRoute, semer, unLocataire, utilisateur, viderBase } from '@/test/utils';
import { figerDate } from '@/test/setup';

/*
 * Le rendu PDF est neutralisé : ce parcours vérifie ce que la révision **écrit
 * dans le bail**, pas la mise en page du courrier - laquelle a ses propres
 * tests dans `lib/pdf/`. Sans ce bouchon, chaque cas paierait une seconde de
 * rendu pour un résultat qu'il ne regarde pas.
 */
const archivage = vi.hoisted(() => vi.fn(async () => undefined));
/*
 * Le PDF du bail lui-même est rendu et « téléchargé » pour de faux : ce qui est
 * vérifié ici, c'est le message d'accompagnement, pas la mise en page (testée
 * dans `lib/pdf/`) ni l'ouverture d'un onglet, que jsdom n'implémente pas.
 * L'archivage en base, lui, reste réel.
 */
const rendu = vi.hoisted(() => vi.fn(async () => new Blob(['%PDF-factice'], { type: 'application/pdf' })));
const telechargement = vi.hoisted(() => vi.fn());
vi.mock('@/lib/pdf/generer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pdf/generer')>()),
  genererEtArchiver: archivage,
  rendrePdf: rendu,
  telechargerDocument: telechargement,
}));

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
});

afterEach(() => {
  vi.useRealTimers();
});

function rendreBail() {
  return rendreRoute('/baux/:id', <BailDetailPage />, '/baux/bail-1');
}

/** Ouvre la modale IRL et saisit un nouvel indice. */
async function reviser(trimestre: string, indice: string) {
  const u = utilisateur();
  await u.click(await screen.findByRole('button', { name: /Révision IRL du loyer/ }));
  const modale = await screen.findByRole('dialog');
  await u.type(within(modale).getByLabelText(/Nouveau trimestre/), trimestre);
  await u.type(within(modale).getByLabelText(/Nouvel indice IRL/), indice);
  await u.click(within(modale).getByRole('button', { name: /Générer le courrier PDF/ }));
}

describe('révision IRL', () => {
  it('enregistre la révision dans le bail', async () => {
    // Régression : le courrier était produit mais rien n'était écrit ; le bail
    // restait indéfiniment au loyer d'origine.
    await semer();
    rendreBail();

    await reviser('2e trimestre 2026', '149.03');

    await vi.waitFor(async () => {
      const bail = await db.baux.get('bail-1');
      expect(bail?.revisionsLoyer).toHaveLength(1);
    });
    const bail = await db.baux.get('bail-1');
    expect(bail?.revisionsLoyer?.[0]).toMatchObject({
      ancienLoyer: 600,
      nouveauLoyer: 611.07,
      indiceReference: 146.33,
      nouvelIndice: 149.03,
      nouveauTrimestre: '2e trimestre 2026',
    });
  });

  it('laisse intact le loyer du contrat - le bail doit se régénérer à l’identique', async () => {
    await semer();
    rendreBail();
    await reviser('2e trimestre 2026', '149.03');

    await vi.waitFor(async () => {
      expect((await db.baux.get('bail-1'))?.revisionsLoyer).toHaveLength(1);
    });
    expect((await db.baux.get('bail-1'))?.loyerHC).toBe(600);
  });

  it('affiche le loyer courant et rappelle celui du contrat', async () => {
    await semer({
      bail: {
        revisionsLoyer: [
          {
            date: '2026-06-01T00:00:00.000Z',
            dateApplication: '2026-06-01T00:00:00.000Z',
            trimestreReference: '2e trimestre 2025',
            indiceReference: 146.33,
            nouveauTrimestre: '2e trimestre 2026',
            nouvelIndice: 149.03,
            ancienLoyer: 600,
            nouveauLoyer: 623.3,
          },
        ],
      },
    });
    rendreBail();

    expect(await screen.findByText(/623,30/)).toBeInTheDocument();
    expect(screen.getByText(/loyer au contrat : 600,00/)).toBeInTheDocument();
  });

  it('repart du loyer révisé à la révision suivante, pas du loyer d’origine', async () => {
    await semer();
    rendreBail();
    await reviser('2e trimestre 2026', '149.03');
    await vi.waitFor(async () => {
      expect((await db.baux.get('bail-1'))?.revisionsLoyer).toHaveLength(1);
    });

    // Deuxième cycle : la modale doit annoncer 623,30 € et l'indice 149.03.
    const u = utilisateur();
    await u.click(screen.getByRole('button', { name: /Révision IRL du loyer/ }));
    const modale = await screen.findByRole('dialog');
    expect(within(modale).getByText(/Indice de la dernière révision : 149.03/)).toBeInTheDocument();
    expect(within(modale).getByText(/611,07/)).toBeInTheDocument();
  });

  it('ne rétroagit pas quand la révision est demandée après l’anniversaire', async () => {
    // Anniversaire au 1er janvier, demande le 20 septembre : effet à la demande
    // (art. 17-1). L'ancien calcul annonçait une date déjà passée.
    await semer();
    figerDate('2027-09-20T12:00:00.000Z');
    rendreBail();

    const u = utilisateur();
    await u.click(await screen.findByRole('button', { name: /Révision IRL du loyer/ }));
    const modale = await screen.findByRole('dialog');
    expect(within(modale).getByText(/Prise d'effet/)).toHaveTextContent('20/09/2027');
  });

  it('désactive le calculateur si le bail ne prévoit pas de clause de révision', async () => {
    await semer({
      bail: { revisionIRL: { trimestreReference: '', valeurIndice: 0, revisable: false } },
    });
    rendreBail();

    expect(await screen.findByRole('button', { name: /Révision IRL du loyer/ })).toBeDisabled();
  });
});

describe('écriture concurrente pendant la génération d’un document', () => {
  /*
   * Régression : `majBail` écrivait la ligne entière depuis l'instantané de
   * `useLiveQuery`. Le courrier de révision rend un PDF avant d'écrire -
   * plusieurs secondes sur tablette - et tout ce qui touchait au bail pendant
   * ce temps était annulé par l'enregistrement de la révision.
   */
  it('n’annule pas une bascule de statut arrivée pendant le rendu', async () => {
    await semer();
    archivage.mockImplementationOnce(async () => {
      // Pendant le rendu : synchronisation reçue, ou second écran ouvert.
      await db.baux.update('bail-1', { statut: 'actif' });
      return undefined;
    });
    rendreBail();

    await reviser('2e trimestre 2026', '149.03');

    await vi.waitFor(async () => {
      expect((await db.baux.get('bail-1'))?.revisionsLoyer).toHaveLength(1);
    });
    // La révision est bien écrite, et le statut survenu entre-temps a survécu.
    expect((await db.baux.get('bail-1'))?.statut).toBe('actif');
  });
});

describe('fiche de bail - robustesse', () => {
  it('reste consultable et supprimable quand le bien a disparu', async () => {
    await semer();
    await db.biens.clear();
    rendreBail();

    expect(await screen.findByText(/Le bien associé à ce bail n'existe plus/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Supprimer/ })).toBeInTheDocument();
  });
});

describe('double-clic sur les documents annexes du bail', () => {
  it('n’archive qu’une seule fiche d’aide juridique', async () => {
    const u = utilisateur();
    archivage.mockClear();
    archivage.mockImplementation(() => new Promise((r) => setTimeout(r, 80)) as Promise<undefined>);
    await semer({ edl: {} });
    rendreBail();

    const bouton = await screen.findByRole('button', { name: /Fiche d'aide juridique/ });
    await u.click(bouton);
    await u.click(bouton);

    await vi.waitFor(() => expect(archivage).toHaveBeenCalled());
    expect(archivage).toHaveBeenCalledTimes(1);
    archivage.mockReset();
  });
});

describe('échec de la génération d’un document', () => {
  /*
   * Régression : aucun des quatre écrans qui génèrent un PDF n'avait de `catch`.
   * `useActionUnique` journalisait l'échec dans la console - inaccessible sur la
   * tablette - puis dégrisait le bouton. L'utilisateur voyait un geste sans
   * effet et recliquait, sans jamais apprendre que le stockage était saturé.
   */
  it('le dit à l’écran, avec sa cause, au lieu de la seule console', async () => {
    const u = utilisateur();
    /*
     * Un `Error` portant le nom, et non un `DOMException` : c'est la forme qui
     * arrive réellement ici, Dexie enveloppant l'erreur d'IndexedDB. Et c'est la
     * seule qui vaille en test - `DOMException` hérite d'`Error` dans les
     * navigateurs comme dans Node, mais pas dans jsdom, qui ferait donc échouer
     * `decrireErreur` pour une raison qui n'existe pas en production.
     */
    const quota = new Error('The quota has been exceeded.');
    quota.name = 'QuotaExceededError';
    archivage.mockRejectedValueOnce(quota);
    await semer({ edl: {} });
    rendreBail();

    await u.click(await screen.findByRole('button', { name: /Fiche d'aide juridique/ }));

    const message = await screen.findByText(/Échec de la génération du document/);
    expect(message).toBeInTheDocument();
    // La cause est traduite, pas recopiée telle quelle : c'est ce qui rend le
    // message actionnable (libérer de l'espace plutôt que recliquer).
    expect(message).toHaveTextContent(/stockage saturé/);
  });
});

describe('nombre d’exemplaires du bail à imprimer', () => {
  /*
   * Le bail se signe sur papier, en autant d'originaux que de parties (art. 3
   * de la loi du 6 juillet 1989). Le contrat le rappelle en page de garde, mais
   * cette page n'est lue qu'après l'impression : le compte est donc annoncé au
   * téléchargement, et calculé.
   */
  it('en annonce deux pour un locataire seul : un pour le bailleur, un pour lui', async () => {
    const u = utilisateur();
    await semer();
    rendreBail();

    await u.click(await screen.findByRole('button', { name: /Télécharger le PDF/ }));

    expect(await screen.findByText(/2 exemplaires originaux/)).toBeInTheDocument();
    expect(screen.queryByText(/par caution/)).not.toBeInTheDocument();
  });

  it('en compte un de plus par colocataire - « deux » serait faux', async () => {
    const u = utilisateur();
    await semer();
    await db.locataires.put(unLocataire({ id: 'loc-2', prenom: 'Jean', nom: 'Martin' }));
    await db.baux.update('bail-1', { locataireIds: ['loc-1', 'loc-2'] });
    rendreBail();

    await u.click(await screen.findByRole('button', { name: /Télécharger le PDF/ }));

    expect(await screen.findByText(/3 exemplaires originaux/)).toBeInTheDocument();
  });

  it('en compte un pour la caution personne physique, qui reçoit le bail', async () => {
    const u = utilisateur();
    await semer({
      locataire: {
        garant: {
          type: 'physique',
          prenom: 'Claire',
          nom: 'Dupont',
          adresse: '8 rue des Tilleuls, 63000 Clermont-Ferrand',
        },
      },
    });
    rendreBail();

    await u.click(await screen.findByRole('button', { name: /Télécharger le PDF/ }));

    const message = await screen.findByText(/3 exemplaires originaux/);
    expect(message).toHaveTextContent(/un par caution/);
  });

  it('n’en compte aucun pour Visale, qui est un organisme et n’en reçoit pas', async () => {
    const u = utilisateur();
    /* Visale : l'application laisse les champs d'identité vides, seul le visa compte. */
    await semer({
      locataire: {
        garant: { type: 'visale', nom: '', prenom: '', adresse: '', numeroVisa: 'V2026-0001' },
      },
    });
    rendreBail();

    await u.click(await screen.findByRole('button', { name: /Télécharger le PDF/ }));

    expect(await screen.findByText(/2 exemplaires originaux/)).toBeInTheDocument();
  });
});
