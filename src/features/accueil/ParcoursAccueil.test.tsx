import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { db, getParametres } from '@/lib/db';
import { accueilTermine } from '@/lib/accueil';
import { rendre, utilisateur, viderBase } from '@/test/utils';
import { ParcoursAccueil } from './ParcoursAccueil';

/**
 * Premier contact avec l'application.
 *
 * Ce qui se joue ici : que la question du stockage soit **posée** - elle ne
 * l'était nulle part -, qu'elle ne le soit **qu'une fois**, et qu'elle ne
 * bloque **jamais**. Un état des lieux se fait devant l'appartement, souvent
 * sans réseau : une étape obligatoire condamnerait l'outil au pire moment.
 */

beforeEach(async () => {
  await viderBase();
  await db.sauvegardeAuto.clear();
  localStorage.clear();
  // La ligne de paramètres existe dès le premier lancement : `AppLayout` la crée
  // au montage. Sans elle, l'accueil ne peut pas savoir où il en est.
  await getParametres();
});

describe('parcours d’accueil', () => {
  it('enchaîne l’avertissement puis la question du stockage', async () => {
    rendre(<ParcoursAccueil />);

    await screen.findByText('Avertissement');
    await utilisateur().click(screen.getByRole('button', { name: /J'ai compris/ }));

    expect(await screen.findByText(/Où sont enregistrées vos données/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connecter Google Drive/ })).toBeInTheDocument();
  });

  it('ne pose la question qu’une fois : « plus tard » est une réponse', async () => {
    await db.parametres.put({ ...(await getParametres()), disclaimerAccepte: true });
    const { unmount } = rendre(<ParcoursAccueil />);

    await utilisateur().click(await screen.findByRole('button', { name: /Je verrai plus tard/ }));
    expect(accueilTermine()).toBe(true);

    // Rechargement de l'application : la question ne revient pas.
    unmount();
    rendre(<ParcoursAccueil />);
    await vi.waitFor(() =>
      expect(screen.queryByText(/Où sont enregistrées vos données/)).not.toBeInTheDocument(),
    );
  });

  it('ne demande rien à qui a déjà une destination', async () => {
    /*
     * Cas de tout utilisateur de longue date au premier lancement de cette
     * version : son Drive est connecté depuis des mois, l'accueil n'a rien à
     * lui apprendre et surtout rien à lui redemander.
     */
    const params = await getParametres();
    await db.parametres.put({
      ...params,
      disclaimerAccepte: true,
      sauvegardeGDrive: { clientId: 'x', actif: true },
    });

    rendre(<ParcoursAccueil />);
    await vi.waitFor(() => expect(accueilTermine()).toBe(true));
    expect(screen.queryByText(/Où sont enregistrées vos données/)).not.toBeInTheDocument();
  });

  it('n’offre pas le dossier local là où il n’existe pas', async () => {
    // jsdom n'a pas `showDirectoryPicker`, comme Safari sur iPad : proposer
    // l'option y mènerait à un cul-de-sac.
    await db.parametres.put({ ...(await getParametres()), disclaimerAccepte: true });
    rendre(<ParcoursAccueil />);

    await screen.findByRole('button', { name: /Connecter Google Drive/ });
    expect(screen.queryByRole('button', { name: /Choisir un dossier/ })).not.toBeInTheDocument();
    // Et l'on dit pourquoi il n'y a qu'un choix, plutôt que de laisser chercher.
    expect(screen.getByText(/que sur ordinateur, avec Chrome ou Edge/)).toBeInTheDocument();
  });

  it('garde la réponse hors des paramètres, qui voyagent dans l’archive', async () => {
    /*
     * Le drapeau vit dans `localStorage`, jamais dans `Parametres` : ceux-ci
     * partent dans le ZIP et dans la synchronisation, et un appareil restauré
     * hériterait d'un « accueil déjà fait » alors qu'il n'a aucune destination -
     * c'est précisément celui à qui il faut poser la question.
     */
    await db.parametres.put({ ...(await getParametres()), disclaimerAccepte: true });
    rendre(<ParcoursAccueil />);
    await utilisateur().click(await screen.findByRole('button', { name: /Je verrai plus tard/ }));

    expect(JSON.stringify(await db.parametres.get('singleton'))).not.toContain('accueil');
  });
});
