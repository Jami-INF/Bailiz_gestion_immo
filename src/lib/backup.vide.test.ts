import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { baseSansDonnees } from './backup';
import { deposerInstantaneSiDu } from './sync/instantane';
import { DepotMemoire } from './sync/depotMemoire';
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

  it('refuse de déposer un instantané depuis un appareil réellement neuf', async () => {
    /*
     * Le garde-fou vivait dans le push ZIP vers Drive, supprimé avec le mode
     * « archive complète ». Il s'applique désormais à l'instantané, seul
     * producteur d'archives : sans lui, un appareil neuf déposerait une archive
     * vide qui ferait tomber la plus ancienne copie utile.
     */
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
    const depot = new DepotMemoire();
    expect(await deposerInstantaneSiDu(depot)).toBe(false);
    expect(depot.compter('archives')).toBe(0);
  });
});

describe('appareil configuré mais sans fiche', () => {
  /** Paramètres d'un appareil dont seules les coordonnées ont été saisies. */
  const parametres = (nomBailleur: string) => ({
    id: 'singleton' as const,
    bailleur: {
      civilite: 'M',
      nom: nomBailleur,
      prenom: 'Jami',
      adresse: '38 rue Robert Noel, 63110 Beaumont',
      email: 'jami@exemple.fr',
      telephone: '0600000000',
      qualite: 'personne_physique' as const,
    },
    grilleVetuste: [],
    compteursSequence: { bail: 0, edl: 0, inventaire: 0, document: 0, annee: 2026 },
  });

  it('ne se considère plus vide dès que le bailleur est renseigné', async () => {
    // Coordonnées, grille de vétusté, catalogue de clauses, modèle de fiche de
    // visite : un travail de configuration qui mérite d'être sauvegardé, même
    // avant la première fiche de bien.
    await db.parametres.put(parametres('Infante'));
    expect(await baseSansDonnees()).toBe(false);
  });

  it('reste vide tant que rien n’a été configuré', async () => {
    await db.parametres.put(parametres('   '));
    expect(await baseSansDonnees()).toBe(true);
  });

  it('reste vide si la ligne de paramètres n’existe pas encore', async () => {
    expect(await baseSansDonnees()).toBe(true);
  });
});
