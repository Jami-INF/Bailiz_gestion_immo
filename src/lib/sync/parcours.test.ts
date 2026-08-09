import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getParametres } from '@/lib/db';
import { synchroniser } from './cycle';
import { DepotMemoire } from './depotMemoire';
import { journaliser, rattraperChangements, TABLES_SYNCHRONISEES } from './journal';

/**
 * Le parcours réel de l'application : **un seul utilisateur, deux appareils,
 * jamais en même temps.** L'iPad saisit sur place (état des lieux, photos,
 * signature), l'ordinateur imprime ensuite.
 *
 * Ce n'est pas le scénario du conflit — il n'y en a pas — mais celui du
 * **passage de témoin**. Le risque n'est plus « deux versions qui s'écrasent »
 * mais « l'ordinateur imprime avant d'avoir tout reçu ». Ces tests vérifient
 * donc une seule chose, sous toutes les coupures possibles : après convergence,
 * l'appareil qui imprime détient **exactement** ce que l'autre a saisi.
 */

const HORODATAGE = '2026-08-09T10:00:00.000Z';

/** Base d'un appareil neuf, Drive connecté. */
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

/** Sauvegarde intégrale d'un appareil, pour le « reposer » et prendre l'autre. */
async function capturer() {
  return {
    biens: await db.biens.toArray(),
    locataires: await db.locataires.toArray(),
    baux: await db.baux.toArray(),
    edls: await db.edls.toArray(),
    photos: await db.photos.toArray(),
    documents: await db.documents.toArray(),
    changements: await db.changements.toArray(),
    syncEtat: await db.syncEtat.toArray(),
    parametres: await db.parametres.get('singleton'),
  };
}

type Etat = Awaited<ReturnType<typeof capturer>>;

async function restaurer(etat: Etat) {
  await reinitialiser();
  await db.biens.bulkPut(etat.biens);
  await db.locataires.bulkPut(etat.locataires);
  await db.baux.bulkPut(etat.baux);
  await db.edls.bulkPut(etat.edls);
  await db.photos.bulkPut(etat.photos);
  await db.documents.bulkPut(etat.documents);
  await db.changements.bulkPut(etat.changements);
  await db.syncEtat.bulkPut(etat.syncEtat);
  if (etat.parametres) await db.parametres.put(etat.parametres);
}

/**
 * Une visite complète saisie sur l'iPad : le bien, le locataire, le bail,
 * l'état des lieux, ses photos, et le PDF signé.
 */
async function saisirVisiteSurIpad(nbPhotos: number) {
  await db.biens.put({
    id: 'bien-1',
    nom: 'T2 Chamalières',
    createdAt: HORODATAGE,
    updatedAt: HORODATAGE,
  } as never);
  await db.locataires.put({ id: 'loc-1', nom: 'Dupont', createdAt: HORODATAGE, updatedAt: HORODATAGE } as never);
  await db.baux.put({
    id: 'bail-1',
    reference: 'BAIL-2026-0001',
    bienId: 'bien-1',
    locataireIds: ['loc-1'],
    createdAt: HORODATAGE,
    updatedAt: HORODATAGE,
  } as never);
  await db.edls.put({
    id: 'edl-1',
    reference: 'EDL-2026-0001',
    bailId: 'bail-1',
    type: 'entree',
    statut: 'signe',
    createdAt: HORODATAGE,
    updatedAt: HORODATAGE,
  } as never);
  for (let i = 0; i < nbPhotos; i++) {
    await db.photos.put({
      id: `photo-${i}`,
      edlId: 'edl-1',
      blob: new Blob([`photo binaire ${i}`]),
      dateCapture: HORODATAGE,
    } as never);
  }
  await db.documents.put({
    id: 'doc-1',
    reference: 'DOC-2026-0001',
    type: 'edl',
    edlId: 'edl-1',
    blob: new Blob(['%PDF-1.4 état des lieux signé']),
    createdAt: HORODATAGE,
  } as never);

  // Hors-ligne dans l'appartement : rien n'est parti, mais tout est journalisé
  // par les hooks. `rattraperChangements` couvre en plus ce que l'onglet fermé
  // aurait pu faire manquer.
  for (const table of TABLES_SYNCHRONISEES) {
    const acces = db as unknown as Record<string, { toCollection(): { primaryKeys(): Promise<string[]> } }>;
    for (const cle of await acces[table].toCollection().primaryKeys()) {
      await journaliser(table, String(cle), 'maj');
    }
  }
}

/** Ce que l'ordinateur doit détenir pour imprimer sans se tromper. */
async function contenuMetier() {
  const photos = await db.photos.toArray();
  const documents = await db.documents.toArray();
  return {
    biens: (await db.biens.toArray()).map((b) => b.id).sort(),
    locataires: (await db.locataires.toArray()).map((l) => l.id).sort(),
    baux: (await db.baux.toArray()).map((b) => b.id).sort(),
    edls: (await db.edls.toArray()).map((e) => e.id).sort(),
    photos: photos.map((p) => p.id).sort(),
    documents: documents.map((d) => d.id).sort(),
    // Le point le plus facile à rater : une photo réduite à sa légende.
    taillesPhotos: await Promise.all(
      [...photos].sort((a, b) => a.id.localeCompare(b.id)).map((p) => p.blob.text()),
    ),
    taillesDocuments: await Promise.all(
      [...documents].sort((a, b) => a.id.localeCompare(b.id)).map((d) => d.blob.text()),
    ),
  };
}

/** Relance des cycles jusqu'à ce que plus rien ne bouge (max `limite`). */
async function synchroniserJusquAStabilite(depot: DepotMemoire, limite = 10): Promise<number> {
  for (let tour = 1; tour <= limite; tour++) {
    depot.avancer(1);
    const resultat = await synchroniser(depot);
    if (resultat.etat === 'ok' && resultat.recus === 0 && resultat.envoyes === 0) return tour;
  }
  throw new Error(`Pas de stabilité après ${limite} cycles`);
}

describe('passage de témoin iPad → ordinateur', () => {
  beforeEach(reinitialiser);

  it('transmet une visite entière, photos et PDF signé compris', async () => {
    const depot = new DepotMemoire();
    await saisirVisiteSurIpad(12);
    const attendu = await contenuMetier();

    // Retour au bureau : l'iPad retrouve le réseau et pousse.
    await synchroniserJusquAStabilite(depot);
    expect(await db.changements.count()).toBe(0);

    // L'ordinateur, base vierge, ouvre l'application.
    await reinitialiser();
    await synchroniserJusquAStabilite(depot);

    expect(await contenuMetier()).toEqual(attendu);
  });

  it('résiste à une coupure à n’importe quel moment de l’envoi', async () => {
    /*
     * Le cas réel : la 4G de l'immeuble lâche au milieu du téléversement des
     * photos. On rejoue le parcours en coupant après 1, 2, 3… écritures, et on
     * vérifie qu'après reprise l'ordinateur reçoit **exactement** la même chose
     * qu'en l'absence de coupure. C'est ce test qui couvre les états
     * intermédiaires qu'aucun scénario écrit à la main n'imaginerait.
     */
    await saisirVisiteSurIpad(4);
    const attendu = await contenuMetier();
    const ipad = await capturer();

    // Nombre d'écritures d'un envoi complet : borne supérieure des coupures.
    const temoin = new DepotMemoire();
    await synchroniserJusquAStabilite(temoin);
    const ecrituresCompletes = temoin.ecritures;
    expect(ecrituresCompletes).toBeGreaterThan(5);

    for (let coupure = 1; coupure < ecrituresCompletes; coupure++) {
      await restaurer(ipad);
      const depot = new DepotMemoire();
      depot.couperApres = coupure;

      // Premier essai : il échoue quelque part au milieu.
      await synchroniser(depot).catch(() => undefined);

      // Le réseau revient : l'iPad reprend jusqu'à n'avoir plus rien en attente.
      depot.couperApres = 0;
      await synchroniserJusquAStabilite(depot);
      expect(await db.changements.count(), `coupure après ${coupure}`).toBe(0);

      // L'ordinateur récupère tout.
      await reinitialiser();
      await synchroniserJusquAStabilite(depot);
      expect(await contenuMetier(), `coupure après ${coupure}`).toEqual(attendu);
    }
  });

  it('n’accumule pas de fichiers en double sur le Drive après des coupures', async () => {
    // Un envoi repris ne doit pas laisser d'homonymes : côté réception, deux
    // fichiers du même nom, c'est une version lue au hasard du listage.
    await saisirVisiteSurIpad(3);
    const ipad = await capturer();

    const temoin = new DepotMemoire();
    await synchroniserJusquAStabilite(temoin);
    const reference = {
      donnees: temoin.compter('donnees'),
      photos: temoin.compter('photos'),
      documents: temoin.compter('documents'),
    };

    for (const coupure of [1, 3, 5, 7]) {
      await restaurer(ipad);
      const depot = new DepotMemoire();
      depot.couperApres = coupure;
      await synchroniser(depot).catch(() => undefined);
      depot.couperApres = 0;
      await synchroniserJusquAStabilite(depot);

      expect(
        {
          donnees: depot.compter('donnees'),
          photos: depot.compter('photos'),
          documents: depot.compter('documents'),
        },
        `coupure après ${coupure}`,
      ).toEqual(reference);
    }
  });
});

describe('allers-retours répétés entre les deux appareils', () => {
  beforeEach(reinitialiser);

  it('garde les deux appareils identiques sur dix passages de témoin', async () => {
    /*
     * L'usage courant : on corrige un bail sur l'ordinateur, on repart avec
     * l'iPad, on ajoute une photo, on revient imprimer. Rien ne doit dériver au
     * fil des allers-retours — ni doublon, ni fiche perdue, ni file d'attente
     * qui ne se vide plus.
     */
    const depot = new DepotMemoire();
    await saisirVisiteSurIpad(2);
    await synchroniserJusquAStabilite(depot);
    let ipad = await capturer();

    await reinitialiser();
    await synchroniserJusquAStabilite(depot);
    let ordinateur = await capturer();

    for (let tour = 1; tour <= 10; tour++) {
      // L'ordinateur corrige le bail.
      await restaurer(ordinateur);
      const bail = await db.baux.get('bail-1');
      await db.baux.put({ ...bail!, updatedAt: `2026-08-${10 + tour}T09:00:00.000Z` } as never);
      await journaliser('baux', 'bail-1', 'maj');
      await synchroniserJusquAStabilite(depot);
      ordinateur = await capturer();

      // L'iPad repart sur le terrain et ajoute une photo.
      await restaurer(ipad);
      await db.photos.put({
        id: `photo-tour-${tour}`,
        edlId: 'edl-1',
        blob: new Blob([`tour ${tour}`]),
        dateCapture: `2026-08-${10 + tour}T14:00:00.000Z`,
      } as never);
      await journaliser('photos', `photo-tour-${tour}`, 'maj');
      await synchroniserJusquAStabilite(depot);
      ipad = await capturer();

      // L'ordinateur revient imprimer : il doit voir la photo du jour.
      await restaurer(ordinateur);
      await synchroniserJusquAStabilite(depot);
      expect(await db.photos.get(`photo-tour-${tour}`), `tour ${tour}`).toBeTruthy();
      ordinateur = await capturer();

      // Et l'iPad doit voir la correction du bail.
      await restaurer(ipad);
      await synchroniserJusquAStabilite(depot);
      expect((await db.baux.get('bail-1'))?.updatedAt, `tour ${tour}`).toBe(
        `2026-08-${10 + tour}T09:00:00.000Z`,
      );
      ipad = await capturer();

      expect(await db.changements.count(), `tour ${tour}`).toBe(0);
    }

    // Après dix allers-retours, les deux appareils portent le même contenu…
    await restaurer(ordinateur);
    await synchroniserJusquAStabilite(depot);
    const cotéOrdinateur = await contenuMetier();
    await restaurer(ipad);
    await synchroniserJusquAStabilite(depot);
    expect(await contenuMetier()).toEqual(cotéOrdinateur);

    // …et le dépôt n'a pas enflé : une photo par tour, plus les six de départ.
    expect(depot.compter('photos')).toBe(12);
    expect(depot.compter('donnees')).toBe(4 + 12 + 1 + 1); // fiches + photos + PDF + paramètres
  });
});

describe('reprise d’un appareil réinstallé', () => {
  beforeEach(reinitialiser);

  it('récupère tout depuis le Drive sans rien renvoyer ni supprimer', async () => {
    // Navigateur vidé, application réinstallée : le journal est parti avec les
    // données, donc aucune suppression n'est en attente. L'appareil ne doit que
    // rapatrier.
    const depot = new DepotMemoire();
    await saisirVisiteSurIpad(5);
    await synchroniserJusquAStabilite(depot);
    const attendu = await contenuMetier();
    const fichiersAvant = depot.compter('donnees');

    await reinitialiser();
    await rattraperChangements(); // base vide : rien à rattraper
    expect(await db.changements.count()).toBe(0);

    const resultat = await synchroniser(depot);
    expect(resultat.etat).toBe('ok');
    expect(resultat.etat === 'ok' && resultat.supprimes).toBe(0);
    await synchroniserJusquAStabilite(depot);

    expect(await contenuMetier()).toEqual(attendu);
    expect(depot.compter('donnees')).toBe(fichiersAvant);
  });
});
