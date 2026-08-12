import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui';
import { db } from '@/lib/db';
import type { Bail, Bien, EtatDesLieux, Locataire, Parametres, PieceEDL } from '@/types';

/**
 * Outillage des tests d'écran.
 *
 * Le parti pris : **monter les vraies pages sur la vraie base** (Dexie sur
 * `fake-indexeddb`), sans simuler la couche de données. Ce qui casse dans cette
 * application casse à la jonction - un écran qui lit un champ que personne
 * n'écrit, un statut jamais posé, une suppression qui laisse des documents
 * derrière elle. Un test qui simule `db` ne verrait rien de tout cela.
 */

/** Vide toutes les tables entre deux tests. */
export async function viderBase(): Promise<void> {
  await Promise.all([
    db.biens.clear(),
    db.locataires.clear(),
    db.baux.clear(),
    db.edls.clear(),
    db.photos.clear(),
    db.documents.clear(),
    db.parametres.clear(),
    db.brouillons.clear(),
    db.changements.clear(),
    db.syncEtat.clear(),
  ]);
}

/** Rend un arbre dans le contexte minimal de l'application (routeur + toasts). */
export function rendre(ui: ReactNode, options: { route?: string } = {}): RenderResult {
  return render(
    <MemoryRouter initialEntries={[options.route ?? '/']}>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  );
}

/**
 * Rend une page derrière son chemin de route, pour que `useParams` fonctionne.
 * `chemin` est le motif (`/baux/:id`), `route` l'URL visitée (`/baux/bail-1`).
 */
export function rendreRoute(
  chemin: string,
  element: ReactElement,
  route: string,
  autres: { chemin: string; element: ReactElement }[] = [],
): RenderResult {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <Routes>
          <Route path={chemin} element={element} />
          {autres.map((r) => (
            <Route key={r.chemin} path={r.chemin} element={r.element} />
          ))}
          {/* Repère de navigation : une page qui redirige doit pouvoir être
              observée sans monter tout le reste de l'application. */}
          <Route path="*" element={<div data-testid="ailleurs" />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

export const utilisateur = () => userEvent.setup();

// ---------------------------------------------------------------------------
// Fixtures : le minimum valide, surchargeable champ par champ.
// ---------------------------------------------------------------------------

export function unBien(p: Partial<Bien> = {}): Bien {
  return {
    id: 'bien-1',
    nom: 'T2 Chamalières',
    adresse: { ligne1: '12 rue des Prés', codePostal: '63400', ville: 'Chamalières' },
    type: 'T2',
    surfaceBoutin: 42,
    nbPieces: 2,
    regimeJuridique: 'copropriete',
    equipementsPrivatifs: [],
    partiesCommunes: [],
    annexes: [],
    chauffage: { type: 'individuel', energie: 'électricité' },
    eauChaude: { type: 'individuel', energie: 'électricité' },
    zoneEncadrementLoyers: false,
    classeDPE: 'D',
    piecesModele: [],
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...p,
  };
}

export function unLocataire(p: Partial<Locataire> = {}): Locataire {
  return {
    id: 'loc-1',
    civilite: 'Mme',
    nom: 'Durand',
    prenom: 'Claire',
    email: 'claire.durand@example.org',
    telephone: '0600000000',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...p,
  };
}

export function unBail(p: Partial<Bail> = {}): Bail {
  return {
    id: 'bail-1',
    reference: 'BAIL-2026-0001',
    bienId: 'bien-1',
    locataireIds: ['loc-1'],
    clauseSolidarite: false,
    typeBail: 'meuble_1an',
    dateEffet: '2026-01-01T00:00:00.000Z',
    dureeMois: 12,
    loyerHC: 600,
    charges: { mode: 'forfait', montant: 50 },
    depotGarantie: 1200,
    jourPaiement: 5,
    modePaiement: 'virement',
    revisionIRL: { trimestreReference: '2e trimestre 2025', valeurIndice: 146.33, revisable: true },
    clausesParticulieres: [],
    annexesChecklist: [],
    statut: 'genere',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...p,
  };
}

/** Deux pièces, quatre éléments : assez pour le remplissage groupé et les oublis. */
export function desPieces(): PieceEDL[] {
  return [
    {
      id: 'p-sejour',
      nom: 'Séjour',
      ordre: 0,
      elements: [
        { id: 'e-sol', nom: 'Sol', categorie: 'sol', photoIds: [] },
        { id: 'e-murs', nom: 'Murs', categorie: 'mur', photoIds: [] },
      ],
    },
    {
      id: 'p-cuisine',
      nom: 'Cuisine',
      ordre: 1,
      elements: [
        { id: 'e-evier', nom: 'Évier', categorie: 'plomberie', photoIds: [] },
        { id: 'e-frigo', nom: 'Réfrigérateur', categorie: 'equipement', photoIds: [] },
      ],
    },
  ];
}

export function unEdl(p: Partial<EtatDesLieux> = {}): EtatDesLieux {
  return {
    id: 'edl-1',
    reference: 'EDL-2026-0001',
    bailId: 'bail-1',
    bienId: 'bien-1',
    locataireIds: ['loc-1'],
    type: 'entree',
    date: '2026-01-01T10:00:00.000Z',
    compteurs: [],
    cles: [],
    pieces: desPieces(),
    statut: 'brouillon',
    avenants: [],
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    ...p,
  };
}

export function desParametres(p: Partial<Parametres> = {}): Parametres {
  return {
    id: 'singleton',
    bailleur: {
      civilite: 'M',
      nom: 'Infante',
      prenom: 'Jami',
      adresse: '5 place de Jaude, 63000 Clermont-Ferrand',
      email: 'bailleur@example.org',
      telephone: '0611111111',
      qualite: 'personne_physique',
    },
    grilleVetuste: [],
    compteursSequence: { bail: 1, edl: 1, inventaire: 0, document: 1, annee: 2026 },
    disclaimerAccepte: true,
    ...p,
  };
}

/** Installe un jeu complet bien + locataire + bail (+ EDL optionnel). */
export async function semer(options: {
  bien?: Partial<Bien>;
  locataire?: Partial<Locataire>;
  bail?: Partial<Bail>;
  edl?: Partial<EtatDesLieux>;
  parametres?: Partial<Parametres>;
} = {}): Promise<void> {
  await db.parametres.put(desParametres(options.parametres));
  await db.biens.put(unBien(options.bien));
  await db.locataires.put(unLocataire(options.locataire));
  await db.baux.put(unBail(options.bail));
  if (options.edl) await db.edls.put(unEdl(options.edl));
}
