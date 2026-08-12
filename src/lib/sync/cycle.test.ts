import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getParametres } from '@/lib/db';
import type { Bien, Locataire } from '@/types';
import { journaliser } from './journal';
import { synchroniser } from './cycle';
import { DepotMemoire } from './depotMemoire';

/**
 * Scénarios de convergence entre deux appareils, rejoués sur un dépôt en
 * mémoire. Chaque test décrit une situation où une donnée pourrait être perdue.
 */

const APPAREIL = 'appareil-de-test';

function bien(m: Partial<Bien> = {}): Bien {
  return {
    id: 'bien-1',
    nom: 'T2 Chamalières',
    adresse: { ligne1: '7 av. de la Gare', codePostal: '63400', ville: 'Chamalières' },
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
    piecesModele: [],
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...m,
  };
}

function locataire(m: Partial<Locataire> = {}): Locataire {
  return {
    id: 'loc-1',
    civilite: 'Mme',
    nom: 'Dupont',
    prenom: 'Marie',
    email: 'm@x.fr',
    telephone: '06',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...m,
  };
}

/** Remet la base dans l'état d'un appareil neuf mais configuré pour le Drive. */
async function reinitialiser() {
  await Promise.all([
    db.biens.clear(),
    db.locataires.clear(),
    db.baux.clear(),
    db.edls.clear(),
    db.photos.clear(),
    db.documents.clear(),
    db.changements.clear(),
    db.syncEtat.clear(),
    db.parametres.clear(),
  ]);
  const params = await getParametres();
  await db.parametres.put({
    ...params,
    sauvegardeGDrive: { clientId: 'test', actif: true },
  });
}

beforeEach(async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => APPAREIL,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  await reinitialiser();
});

describe('cycle de synchronisation', () => {
  it('envoie une création locale et la retire de la file d’attente', async () => {
    const depot = new DepotMemoire();
    await db.biens.put(bien());
    await journaliser('biens', 'bien-1', 'maj');

    const resultat = await synchroniser(depot);

    expect(resultat.etat).toBe('ok');
    expect(resultat.etat === 'ok' && resultat.envoyes).toBe(1);
    expect(depot.compter('donnees')).toBe(2); // le bien + les paramètres
    expect(await db.changements.count()).toBe(0);
  });

  it('récupère une création faite sur l’autre appareil', async () => {
    const depot = new DepotMemoire();
    // Appareil A crée un bien et synchronise.
    await db.biens.put(bien());
    await journaliser('biens', 'bien-1', 'maj');
    await synchroniser(depot);

    // Appareil B : base vide, même dépôt.
    await reinitialiser();
    depot.avancer(1);
    const resultat = await synchroniser(depot);

    expect(resultat.etat === 'ok' && resultat.recus).toBeGreaterThanOrEqual(1);
    expect(await db.biens.get('bien-1')).toBeTruthy();
  });

  it('conserve les modifications parallèles portant sur des enregistrements différents', async () => {
    // Le scénario qui motive tout le lot : l'iPad ajoute un locataire pendant
    // que l'ordinateur modifie un bien. Aucun des deux ne doit disparaître.
    const depot = new DepotMemoire();
    await db.biens.put(bien());
    await journaliser('biens', 'bien-1', 'maj');
    await synchroniser(depot);

    // Appareil B part du même état, puis ajoute un locataire.
    const etatA = await db.biens.get('bien-1');
    await reinitialiser();
    depot.avancer(1);
    await synchroniser(depot); // B récupère le bien
    await db.locataires.put(locataire());
    await journaliser('locataires', 'loc-1', 'maj');
    depot.avancer(1);
    await synchroniser(depot);

    // Appareil A modifie le bien de son côté, puis synchronise.
    await reinitialiser();
    depot.avancer(1);
    await synchroniser(depot);
    await db.biens.put({ ...etatA!, nom: 'T2 rénové', updatedAt: '2026-08-09T10:00:00.000Z' });
    await journaliser('biens', 'bien-1', 'maj');
    depot.avancer(1);
    await synchroniser(depot);

    expect((await db.biens.get('bien-1'))?.nom).toBe('T2 rénové');
    expect(await db.locataires.get('loc-1')).toBeTruthy();
  });

  it('propage une suppression et ne la ressuscite jamais', async () => {
    // Cas RGPD : la suppression doit survivre à tous les cycles suivants.
    const depot = new DepotMemoire();
    await db.locataires.put(locataire());
    await journaliser('locataires', 'loc-1', 'maj');
    await synchroniser(depot);

    // Appareil B récupère le locataire.
    await reinitialiser();
    depot.avancer(1);
    await synchroniser(depot);
    expect(await db.locataires.get('loc-1')).toBeTruthy();

    // Appareil A le supprime et synchronise.
    await db.locataires.delete('loc-1');
    await journaliser('locataires', 'loc-1', 'suppr');
    depot.avancer(1);
    await synchroniser(depot);
    expect(depot.compter('tombstones')).toBe(1);

    // Retour sur l'appareil B, qui détient encore le locataire.
    await reinitialiser();
    await db.locataires.put(locataire());
    depot.avancer(1);
    const resultat = await synchroniser(depot);
    expect(resultat.etat === 'ok' && resultat.supprimes).toBe(1);
    expect(await db.locataires.get('loc-1')).toBeUndefined();

    // Et elle ne revient pas au cycle suivant.
    depot.avancer(1);
    await synchroniser(depot);
    expect(await db.locataires.get('loc-1')).toBeUndefined();
  });

  it('tranche en faveur de la version la plus récente sur un même enregistrement', async () => {
    const depot = new DepotMemoire();
    await db.biens.put(bien({ nom: 'Version A', updatedAt: '2026-08-08T09:00:00.000Z' }));
    await journaliser('biens', 'bien-1', 'maj');
    await synchroniser(depot);

    // B a une version plus récente du même bien.
    await reinitialiser();
    await db.biens.put(bien({ nom: 'Version B', updatedAt: '2026-08-08T12:00:00.000Z' }));
    await journaliser('biens', 'bien-1', 'maj');
    depot.avancer(1);
    await synchroniser(depot);

    expect((await db.biens.get('bien-1'))?.nom).toBe('Version B');
  });

  it('ne renvoie pas ce qu’il vient de recevoir', async () => {
    // Sans neutralisation du journal pendant le pull, chaque réception
    // produirait un envoi, qui produirait une réception… boucle infinie.
    const depot = new DepotMemoire();
    await db.biens.put(bien());
    await journaliser('biens', 'bien-1', 'maj');
    await synchroniser(depot);

    await reinitialiser();
    depot.avancer(1);
    await synchroniser(depot);

    expect(await db.changements.count()).toBe(0);
  });

  it('garde les modifications en attente quand l’envoi échoue', async () => {
    const depot = new DepotMemoire();
    await db.biens.put(bien());
    await journaliser('biens', 'bien-1', 'maj');
    await db.biens.put(bien({ id: 'bien-2' }));
    await journaliser('biens', 'bien-2', 'maj');
    depot.couperApres = 1; // le premier enregistrement passe, le second coupe

    await expect(synchroniser(depot)).rejects.toThrow('Coupure réseau');
    // Aucune confirmation n'a lieu : les deux repartiront au cycle suivant,
    // le renvoi d'un enregistrement déjà écrit étant sans conséquence.
    expect(await db.changements.count()).toBe(2);
  });

  it('refuse un cycle qui supprimerait la moitié de la base', async () => {
    const depot = new DepotMemoire();
    const cles = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
    for (const cle of cles) {
      await db.biens.put(bien({ id: cle }));
      await journaliser('biens', cle, 'maj');
    }
    await synchroniser(depot);

    // Un autre appareil supprime tout.
    for (const cle of cles) {
      await db.biens.delete(cle);
      await journaliser('biens', cle, 'suppr');
    }
    depot.avancer(1);
    await synchroniser(depot);

    // L'appareil qui détenait les données reçoit six marqueurs de suppression.
    await reinitialiser();
    for (const cle of cles) await db.biens.put(bien({ id: cle }));
    depot.avancer(1);
    const resultat = await synchroniser(depot);

    expect(resultat.etat).toBe('bloque');
    expect(resultat.etat === 'bloque' && resultat.raison).toBe('suppression_massive');
    // Rien n'a été supprimé : l'utilisateur décide.
    expect(await db.biens.count()).toBe(6);
  });

  it('applique les mêmes suppressions quand l’utilisateur les confirme', async () => {
    const depot = new DepotMemoire();
    const cles = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'];
    for (const cle of cles) {
      await db.biens.put(bien({ id: cle }));
      await journaliser('biens', cle, 'maj');
    }
    await synchroniser(depot);
    for (const cle of cles) {
      await db.biens.delete(cle);
      await journaliser('biens', cle, 'suppr');
    }
    depot.avancer(1);
    await synchroniser(depot);

    await reinitialiser();
    for (const cle of cles) await db.biens.put(bien({ id: cle }));
    depot.avancer(1);
    const resultat = await synchroniser(depot, { forcerSuppressions: true });

    expect(resultat.etat).toBe('ok');
    expect(await db.biens.count()).toBe(0);
  });

  it('bloque quand l’horloge de l’appareil est trop décalée', async () => {
    const depot = new DepotMemoire();
    depot.maintenant = new Date(Date.now() + 10 * 60 * 1000);
    const resultat = await synchroniser(depot);
    expect(resultat.etat).toBe('bloque');
    expect(resultat.etat === 'bloque' && resultat.raison).toBe('horloge');
  });

  it('n’écrase pas la configuration Drive locale avec celle de l’autre appareil', async () => {
    const depot = new DepotMemoire();
    await synchroniser(depot);

    await reinitialiser();
    const params = await getParametres();
    await db.parametres.put({
      ...params,
      sauvegardeGDrive: { clientId: 'propre-a-cet-appareil', actif: true },
    });
    depot.avancer(1);
    await synchroniser(depot);

    const apres = await getParametres();
    expect(apres.sauvegardeGDrive?.clientId).toBe('propre-a-cet-appareil');
  });
});

describe('appareil neuf', () => {
  it('laisse une base vide récupérer les données du dépôt', async () => {
    // Sans suppression en attente, une base vide est simplement un appareil
    // neuf : il doit pouvoir tout rapatrier.
    const depot = new DepotMemoire();
    await db.biens.put(bien());
    await journaliser('biens', 'bien-1', 'maj');
    await synchroniser(depot);

    await reinitialiser();
    depot.avancer(1);
    const resultat = await synchroniser(depot);

    expect(resultat.etat).toBe('ok');
    expect(await db.biens.get('bien-1')).toBeTruthy();
  });
});

describe('photos et documents (blobs immuables)', () => {
  const photo = (id = 'photo-1') => ({
    id,
    blob: new Blob([`contenu-${id}`], { type: 'image/jpeg' }),
    dateCapture: '2026-08-01T10:00:00.000Z',
    legende: 'Séjour',
    edlId: 'edl-1',
  });

  it('transmet une photo avec son contenu à l’autre appareil', async () => {
    const depot = new DepotMemoire();
    await db.photos.add(photo());
    await journaliser('photos', 'photo-1', 'maj');
    await synchroniser(depot);

    await reinitialiser();
    depot.avancer(1);
    await synchroniser(depot);

    const recue = await db.photos.get('photo-1');
    expect(recue).toBeTruthy();
    expect(recue?.legende).toBe('Séjour');
    expect(await recue?.blob.text()).toBe('contenu-photo-1');
  });

  it('n’écrase pas le contenu d’une photo déjà présente localement', async () => {
    // La réception des métadonnées ne doit pas vider le blob local.
    const depot = new DepotMemoire();
    await db.photos.add(photo());
    await journaliser('photos', 'photo-1', 'maj');
    await synchroniser(depot);

    // Nouveau cycle sur le même appareil, après une modification de la légende
    // faite ailleurs : le blob local doit survivre.
    await db.syncEtat.clear();
    await db.parametres.update('singleton', {
      'sauvegardeGDrive.derniereSync': undefined,
    } as never);
    depot.avancer(1);
    await synchroniser(depot);

    const apres = await db.photos.get('photo-1');
    expect(await apres?.blob.text()).toBe('contenu-photo-1');
  });

  it('n’envoie le contenu d’une photo qu’une seule fois', async () => {
    const depot = new DepotMemoire();
    await db.photos.add(photo());
    await journaliser('photos', 'photo-1', 'maj');
    await synchroniser(depot);
    const apresPremier = depot.compter('photos');

    // Nouvelle modification des métadonnées : le blob ne doit pas repartir.
    await journaliser('photos', 'photo-1', 'maj');
    depot.avancer(1);
    await synchroniser(depot);

    expect(depot.compter('photos')).toBe(apresPremier);
    expect(apresPremier).toBe(1);
  });

  it('ne crée pas de doublon de métadonnées à chaque envoi', async () => {
    const depot = new DepotMemoire();
    await db.photos.add(photo());
    await journaliser('photos', 'photo-1', 'maj');
    await synchroniser(depot);
    const apresPremier = depot.compter('donnees');

    await journaliser('photos', 'photo-1', 'maj');
    depot.avancer(1);
    await synchroniser(depot);

    expect(depot.compter('donnees')).toBe(apresPremier);
  });

  it('supprime le contenu distant quand la photo est supprimée', async () => {
    const depot = new DepotMemoire();
    await db.photos.add(photo());
    await journaliser('photos', 'photo-1', 'maj');
    await synchroniser(depot);
    expect(depot.compter('photos')).toBe(1);

    await db.photos.delete('photo-1');
    await journaliser('photos', 'photo-1', 'suppr');
    depot.avancer(1);
    await synchroniser(depot);

    expect(depot.compter('photos')).toBe(0);
    expect(depot.compter('tombstones')).toBe(1);
  });
});

describe('paramètres (singleton)', () => {
  it('ne perd pas un réglage modifié localement', async () => {
    // Les paramètres portent le bailleur, la grille de vétusté, le catalogue de
    // clauses et le modèle de fiche de visite : les écraser à chaque cycle
    // effacerait un travail de configuration considérable.
    const depot = new DepotMemoire();
    await synchroniser(depot); // dépose les paramètres initiaux sur le dépôt

    const params = await getParametres();
    await db.parametres.put({
      ...params,
      bailleur: { ...params.bailleur, nom: 'Nom modifié localement' },
    });
    depot.avancer(1);
    await synchroniser(depot);

    expect((await getParametres()).bailleur.nom).toBe('Nom modifié localement');
  });

  it('adopte les réglages de l’autre appareil quand on n’a rien changé', async () => {
    const depot = new DepotMemoire();
    const params = await getParametres();
    await db.parametres.put({
      ...params,
      bailleur: { ...params.bailleur, nom: 'Réglé sur l’iPad' },
    });
    await synchroniser(depot);

    // Second appareil, réglages par défaut jamais touchés.
    await reinitialiser();
    depot.avancer(1);
    await synchroniser(depot);

    expect((await getParametres()).bailleur.nom).toBe('Réglé sur l’iPad');
  });

  it('fait converger les compteurs de séquence vers le maximum', async () => {
    const depot = new DepotMemoire();
    const params = await getParametres();
    await db.parametres.put({
      ...params,
      compteursSequence: { bail: 7, edl: 2, inventaire: 0, document: 12, annee: 2026 },
    });
    await synchroniser(depot);

    await reinitialiser();
    const locaux = await getParametres();
    await db.parametres.put({
      ...locaux,
      compteursSequence: { bail: 3, edl: 9, inventaire: 0, document: 4, annee: 2026 },
    });
    depot.avancer(1);
    await synchroniser(depot);

    // Aucune référence déjà attribuée ne doit pouvoir être réutilisée.
    expect((await getParametres()).compteursSequence).toMatchObject({
      bail: 7,
      edl: 9,
      document: 12,
    });
  });
});

describe('idempotence', () => {
  it('ne produit aucun changement ni fichier supplémentaire au second cycle', async () => {
    const depot = new DepotMemoire();
    await db.biens.put(bien());
    await journaliser('biens', 'bien-1', 'maj');
    await synchroniser(depot);

    const donneesApres1 = depot.compter('donnees');
    depot.avancer(1);
    const second = await synchroniser(depot);

    expect(second.etat === 'ok' && second.recus).toBe(0);
    expect(second.etat === 'ok' && second.envoyes).toBe(0);
    expect(depot.compter('donnees')).toBe(donneesApres1);
    expect(await db.changements.count()).toBe(0);
  });
});

describe('convergence sur plusieurs allers-retours', () => {
  /**
   * Deux appareils simulés par deux bases successives : on sauvegarde l'état
   * complet de l'un pour le restaurer avant chaque tour, comme si l'on passait
   * de l'iPad à l'ordinateur.
   */
  async function capturer() {
    return {
      biens: await db.biens.toArray(),
      locataires: await db.locataires.toArray(),
      changements: await db.changements.toArray(),
      syncEtat: await db.syncEtat.toArray(),
      parametres: await db.parametres.get('singleton'),
    };
  }

  async function restaurer(etat: Awaited<ReturnType<typeof capturer>>) {
    await reinitialiser();
    await db.biens.bulkPut(etat.biens);
    await db.locataires.bulkPut(etat.locataires);
    await db.changements.bulkPut(etat.changements);
    await db.syncEtat.bulkPut(etat.syncEtat);
    if (etat.parametres) await db.parametres.put(etat.parametres);
  }

  it('fait converger deux appareils qui travaillent en alternance', async () => {
    const depot = new DepotMemoire();

    // Tour 1 - appareil A crée un bien.
    await db.biens.put(bien({ id: 'bien-A' }));
    await journaliser('biens', 'bien-A', 'maj');
    await synchroniser(depot);
    const A1 = await capturer();

    // Tour 1 - appareil B crée un locataire, sans avoir vu le bien.
    await reinitialiser();
    await db.locataires.put(locataire({ id: 'loc-B' }));
    await journaliser('locataires', 'loc-B', 'maj');
    depot.avancer(1);
    await synchroniser(depot);
    const B1 = await capturer();

    // Tour 2 - A revient : il doit recevoir le locataire de B.
    await restaurer(A1);
    depot.avancer(1);
    await synchroniser(depot);
    expect(await db.locataires.get('loc-B')).toBeTruthy();
    expect(await db.biens.get('bien-A')).toBeTruthy();
    const A2 = await capturer();

    // Tour 2 - B revient : il doit recevoir le bien de A.
    await restaurer(B1);
    depot.avancer(1);
    await synchroniser(depot);
    expect(await db.biens.get('bien-A')).toBeTruthy();
    expect(await db.locataires.get('loc-B')).toBeTruthy();

    // Les deux appareils portent désormais le même contenu métier.
    const B2 = await capturer();
    expect(B2.biens).toEqual(A2.biens);
    expect(B2.locataires).toEqual(A2.locataires);
    // Et plus rien n'est en attente de part et d'autre.
    expect(A2.changements).toHaveLength(0);
    expect(B2.changements).toHaveLength(0);
  });

  it('stabilise le dépôt : aucun fichier créé en boucle', async () => {
    const depot = new DepotMemoire();
    await db.biens.put(bien());
    await journaliser('biens', 'bien-1', 'maj');
    await synchroniser(depot);

    const empreinteDepot = () =>
      ['donnees', 'photos', 'documents', 'tombstones']
        .map((e) => depot.compter(e as 'donnees'))
        .join('/');
    const apres1 = empreinteDepot();

    for (let i = 0; i < 4; i++) {
      depot.avancer(1);
      await synchroniser(depot);
    }

    expect(empreinteDepot()).toBe(apres1);
  });
});

describe('références attribuées deux fois hors-ligne', () => {
  const bail = (id: string, reference: string) =>
    ({
      id,
      reference,
      bienId: 'bien-1',
      locataireIds: [],
      clauseSolidarite: false,
      typeBail: 'meuble_1an',
      dateEffet: '2026-09-01',
      dureeMois: 12,
      loyerHC: 520,
      charges: { mode: 'forfait', montant: 60 },
      depotGarantie: 1040,
      jourPaiement: 5,
      modePaiement: 'Virement',
      revisionIRL: { trimestreReference: '', valeurIndice: 0, revisable: true },
      clausesParticulieres: [],
      annexesChecklist: [],
      statut: 'genere',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    }) as never;

  it('signale le doublon après convergence, sans renuméroter', async () => {
    const depot = new DepotMemoire();

    // Appareil A, hors-ligne, crée BAIL-2026-0007.
    await db.baux.put(bail('bail-A', 'BAIL-2026-0007'));
    await journaliser('baux', 'bail-A', 'maj');
    await synchroniser(depot);

    // Appareil B, hors-ligne lui aussi, attribue la même référence.
    await reinitialiser();
    await db.baux.put(bail('bail-B', 'BAIL-2026-0007'));
    await journaliser('baux', 'bail-B', 'maj');
    depot.avancer(1);
    const resultat = await synchroniser(depot);

    expect(resultat.etat).toBe('ok');
    expect(resultat.etat === 'ok' && resultat.doublons).toEqual([
      { table: 'baux', reference: 'BAIL-2026-0007', ids: ['bail-A', 'bail-B'] },
    ]);
    // Les deux baux subsistent, avec leur référence d'origine : c'est au
    // bailleur de trancher, le document papier faisant foi.
    expect((await db.baux.get('bail-A'))?.reference).toBe('BAIL-2026-0007');
    expect((await db.baux.get('bail-B'))?.reference).toBe('BAIL-2026-0007');
  });

  it('ne signale rien quand les références sont distinctes', async () => {
    const depot = new DepotMemoire();
    await db.baux.put(bail('bail-A', 'BAIL-2026-0007'));
    await journaliser('baux', 'bail-A', 'maj');
    await synchroniser(depot);

    await reinitialiser();
    await db.baux.put(bail('bail-B', 'BAIL-2026-0008'));
    await journaliser('baux', 'bail-B', 'maj');
    depot.avancer(1);
    const resultat = await synchroniser(depot);

    expect(resultat.etat === 'ok' && resultat.doublons).toEqual([]);
  });
});

/**
 * Les défauts corrigés après l'audit du 9 août 2026 : chacun de ces scénarios
 * faisait perdre, dupliquer ou renvoyer indéfiniment des données en usage à
 * deux appareils. Ils sont rejoués ici pour qu'ils ne reviennent pas.
 */
describe('robustesse du cycle', () => {
  beforeEach(reinitialiser);

  it('ne se renvoie pas à lui-même ce qu’il vient de déposer', async () => {
    /*
     * Le listage incrémental part de l'heure serveur relevée au **début** du
     * cycle, alors que l'envoi date d'après : tout ce qu'un cycle pousse
     * ressort donc au suivant. Sans filtre, chaque échange retéléchargeait et
     * réécrivait l'intégralité de la base, en l'annonçant comme « reçue ».
     */
    const depot = new DepotMemoire();
    await db.biens.put(bien());
    await journaliser('biens', 'bien-1', 'maj');
    const premier = await synchroniser(depot);
    expect(premier.etat === 'ok' && premier.envoyes).toBe(1);

    depot.avancer(60);
    const second = await synchroniser(depot);
    expect(second.etat === 'ok' && second.recus).toBe(0);
    expect(second.etat === 'ok' && second.envoyes).toBe(0);
  });

  it('vide le journal des modifications répétées d’une même fiche', async () => {
    // Une visite d'EDL enregistre dix fois la même fiche. Le compactage n'en
    // envoie qu'une, mais les neuf autres entrées doivent partir aussi : sinon
    // le journal ne se vide jamais et la fiche repart à chaque cycle.
    const depot = new DepotMemoire();
    await db.biens.put(bien());
    for (let i = 0; i < 10; i++) await journaliser('biens', 'bien-1', 'maj');

    await synchroniser(depot);
    expect(await db.changements.count()).toBe(0);

    depot.avancer(60);
    const second = await synchroniser(depot);
    expect(second.etat === 'ok' && second.envoyes).toBe(0);
  });

  it('ne crée pas de second fichier quand l’envoi d’une photo a été coupé', async () => {
    /*
     * Métadonnées écrites, coupure avant le blob : l'identifiant du fichier
     * n'était pas mémorisé, et le cycle suivant en créait un homonyme. Deux
     * fichiers du même nom, c'est l'autre appareil qui lit une version au
     * hasard du listage.
     */
    const depot = new DepotMemoire();
    await db.photos.put({
      id: 'photo-1',
      edlId: 'edl-1',
      blob: new Blob(['image']),
      dateCapture: '2026-08-01T10:00:00.000Z',
    } as never);
    await journaliser('photos', 'photo-1', 'maj');

    depot.couperApres = 1; // les métadonnées passent, le blob non
    await expect(synchroniser(depot)).rejects.toThrow('Coupure réseau simulée');

    depot.couperApres = 0;
    depot.avancer(60);
    const reprise = await synchroniser(depot);

    expect(reprise.etat).toBe('ok');
    expect(depot.compter('donnees')).toBe(2); // la photo + le singleton parametres
    expect(depot.compter('photos')).toBe(1);
    expect(await db.changements.count()).toBe(0);
  });

  it('efface aussi les fichiers orphelins quand la fiche est supprimée', async () => {
    // Exigence RGPD : la photo d'un locataire supprimé ne doit rien laisser sur
    // le Drive, y compris l'homonyme qu'une coupure antérieure y aurait laissé.
    const depot = new DepotMemoire();
    await db.photos.put({
      id: 'photo-1',
      edlId: 'edl-1',
      blob: new Blob(['image']),
      dateCapture: '2026-08-01T10:00:00.000Z',
    } as never);
    await journaliser('photos', 'photo-1', 'maj');
    await synchroniser(depot);

    // Doublon laissé par un envoi interrompu d'un autre appareil.
    await depot.ecrire('donnees', 'photos__photo-1.json', '{"orphelin":true}');

    await db.photos.delete('photo-1');
    await journaliser('photos', 'photo-1', 'suppr');
    depot.avancer(60);
    await synchroniser(depot);

    expect(await depot.lister('donnees', { nom: 'photos__photo-1.json' })).toEqual([]);
    expect(depot.compter('photos')).toBe(0);
  });

  it('reprend un fichier disparu du dépôt au lieu d’interrompre le cycle', async () => {
    // L'autre appareil a supprimé la fiche pendant qu'on la modifiait ici :
    // abandonner bloquerait toute la file d'attente pour un cas normal.
    const depot = new DepotMemoire();
    await db.biens.put(bien());
    await journaliser('biens', 'bien-1', 'maj');
    await synchroniser(depot);

    const [fichier] = await depot.lister('donnees', { nom: 'biens__bien-1.json' });
    await depot.supprimer(fichier.id);

    await db.biens.put(bien({ nom: 'Renommé', updatedAt: '2026-08-02T10:00:00.000Z' }));
    await journaliser('biens', 'bien-1', 'maj');
    depot.avancer(60);
    const resultat = await synchroniser(depot);

    expect(resultat.etat).toBe('ok');
    const repose = await depot.lister('donnees', { nom: 'biens__bien-1.json' });
    expect(repose).toHaveLength(1);
  });
});

describe('coût réseau d’un cycle', () => {
  beforeEach(reinitialiser);

  it('ne fait pas une requête par fiche lors d’une suppression de masse', async () => {
    /*
     * Une suppression RGPD efface d'un coup toutes les photos d'un locataire.
     * Chercher les orphelins fiche par fiche saturerait le quota Drive : les
     * index par nom sont construits une fois par espace et par cycle.
     */
    const depot = new DepotMemoire();
    for (let i = 0; i < 12; i++) {
      await db.photos.put({
        id: `photo-${i}`,
        edlId: 'edl-1',
        blob: new Blob([`image-${i}`]),
        dateCapture: '2026-08-01T10:00:00.000Z',
      } as never);
      await journaliser('photos', `photo-${i}`, 'maj');
    }
    await synchroniser(depot);

    for (let i = 0; i < 12; i++) {
      await db.photos.delete(`photo-${i}`);
      await journaliser('photos', `photo-${i}`, 'suppr');
    }
    depot.avancer(60);
    depot.listages = 0;
    await synchroniser(depot);

    // 4 listages incrémentaux du pull + un index complet par espace consulté
    // (donnees, photos, tombstones) + la recherche du singleton `parametres`.
    expect(depot.listages).toBeLessThanOrEqual(10);
    expect(depot.compter('photos')).toBe(0);
    expect(await db.changements.count()).toBe(0);
  });
});
