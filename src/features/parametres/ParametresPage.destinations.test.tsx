import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '@/lib/db';
import { rendre, viderBase } from '@/test/utils';
import { ParametresPage } from './ParametresPage';

/**
 * Vocabulaire des Paramètres.
 *
 * Deux mécanismes portaient le même mot : l'archive ZIP - un filet qu'on
 * restaure en bloc - et la synchronisation fiche par fiche entre appareils.
 * « Sauvegarde automatique (dossier synchronisé) » et « Google Drive -
 * synchronisation entre appareils » : exacts tous les deux, et impossibles à
 * départager pour qui découvre l'application. Ce test tient la distinction,
 * parce qu'elle se reperd au premier libellé écrit à la va-vite.
 */

beforeEach(async () => {
  await viderBase();
  await db.sauvegardeAuto.clear();
  // `CarteRepliable` retient son pli dans `localStorage` : un test ne doit pas
  // hériter de l'état laissé par le précédent.
  localStorage.clear();
});

describe('page Paramètres', () => {
  it('commence par l’état des données, sans rien déplier', async () => {
    rendre(<ParametresPage />);

    // La réponse - où sont mes données - avant le catalogue des mécanismes.
    expect(await screen.findByText(/n’existent que sur cet appareil/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choisir une destination/ })).toBeInTheDocument();
  });

  it('nomme l’archive et la synchronisation, jamais « sauvegarde »', async () => {
    rendre(<ParametresPage />);

    expect(
      await screen.findByRole('button', { name: /Archive automatique dans un dossier/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Synchronisation entre appareils/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Archive complète/ })).toBeInTheDocument();

    // L'ancien vocabulaire, celui qui désignait les deux à la fois.
    expect(screen.queryByRole('button', { name: /Sauvegarde automatique/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Sauvegarde et restauration/ }),
    ).not.toBeInTheDocument();
  });
});
