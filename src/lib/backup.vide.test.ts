import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { baseSansDonnees } from './backup';
import { pousserSauvegardeGDrive } from './gdrive';
import type { Bien } from '@/types';

function bien(id: string): Bien {
  return {
    id,
    nom: 'T2',
    adresse: { ligne1: '1 rue A', codePostal: '63000', ville: 'Clermont' },
    type: 'T2',
    surfaceBoutin: 40,
    nbPieces: 2,
    regimeJuridique: 'copropriete',
    equipementsPrivatifs: [],
    partiesCommunes: [],
    annexes: [],
    chauffage: { type: 'individuel', energie: 'électricité' },
    eauChaude: { type: 'individuel', energie: 'électricité' },
    zoneEncadrementLoyers: false,
    piecesModele: [],
    createdAt: '',
    updatedAt: '',
  };
}

beforeEach(async () => {
  await Promise.all(
    [db.biens, db.locataires, db.baux, db.edls, db.documents, db.parametres].map((t) => t.clear()),
  );
});

describe('garde-fou sauvegarde vide', () => {
  it('détecte une base sans donnée métier', async () => {
    expect(await baseSansDonnees()).toBe(true);
  });

  it('ne considère plus la base comme vide dès qu’un bien existe', async () => {
    await db.biens.add(bien('b1'));
    expect(await baseSansDonnees()).toBe(false);
  });

  it('refuse de pousser sur Drive depuis un appareil vide, même configuré', async () => {
    await db.parametres.put({
      id: 'singleton',
      bailleur: {
        civilite: 'M',
        nom: '',
        prenom: '',
        adresse: '',
        email: '',
        telephone: '',
        qualite: 'personne_physique',
      },
      grilleVetuste: [],
      compteursSequence: { bail: 0, edl: 0, inventaire: 0, document: 0, annee: 2026 },
      sauvegardeGDrive: { clientId: 'x.apps.googleusercontent.com', actif: true },
    });
    // Aucun appel réseau ne doit être tenté : le garde-fou intervient avant.
    expect(await pousserSauvegardeGDrive(false)).toBe('base_vide');
  });
});
