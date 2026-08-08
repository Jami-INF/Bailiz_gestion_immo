import { describe, expect, it } from 'vitest';
import type { Parametres } from '@/types';
import { GRILLE_VETUSTE_DEFAUT } from '@/lib/defauts';
import {
  dateModification,
  deciderReception,
  ecartHorloge,
  fusionnerParametres,
  lireNomFichier,
  nomFichier,
  referencesEnDouble,
  suppressionMassive,
} from './protocole';

const T = {
  vieux: '2026-08-01T10:00:00.000Z',
  moyen: '2026-08-05T10:00:00.000Z',
  recent: '2026-08-08T10:00:00.000Z',
};

describe('nommage des fichiers', () => {
  it('fait l’aller-retour sans perdre la clé', () => {
    const nom = nomFichier('baux', 'a1b2-c3d4');
    expect(nom).toBe('baux__a1b2-c3d4.json');
    expect(lireNomFichier(nom)).toEqual({ table: 'baux', cle: 'a1b2-c3d4' });
  });

  it('supporte une clé contenant des tirets bas', () => {
    // Les uuid n'en contiennent pas, mais un identifiant importé pourrait.
    expect(lireNomFichier('edls__cle_avec_underscore.json')).toEqual({
      table: 'edls',
      cle: 'cle_avec_underscore',
    });
  });

  it('ignore un fichier qui ne suit pas la convention', () => {
    expect(lireNomFichier('autre-chose.json')).toBeUndefined();
    expect(lireNomFichier('__orphelin.json')).toBeUndefined();
  });
});

describe('dateModification', () => {
  it('préfère updatedAt, puis createdAt, puis dateCapture', () => {
    expect(dateModification({ updatedAt: T.recent, createdAt: T.vieux }, T.moyen)).toBe(T.recent);
    expect(dateModification({ createdAt: T.vieux }, T.moyen)).toBe(T.vieux);
    expect(dateModification({ dateCapture: T.vieux }, T.moyen)).toBe(T.vieux);
  });

  it('retombe sur l’horodatage du journal quand l’entité n’a aucune date', () => {
    expect(dateModification({ nom: 'sans date' }, T.moyen)).toBe(T.moyen);
    expect(dateModification(null, T.moyen)).toBe(T.moyen);
  });
});

describe('deciderReception', () => {
  it('prend la création venue de l’autre appareil', () => {
    expect(deciderReception({ distantModifieLe: T.recent })).toBe('prendre_distant');
  });

  it('prend la version distante si elle est plus récente', () => {
    expect(deciderReception({ localModifieLe: T.vieux, distantModifieLe: T.recent })).toBe(
      'prendre_distant',
    );
  });

  it('garde la version locale si elle est plus récente', () => {
    expect(deciderReception({ localModifieLe: T.recent, distantModifieLe: T.vieux })).toBe(
      'garder_local',
    );
  });

  it('tranche en faveur du distant à égalité stricte', () => {
    // Convergence déterministe des deux côtés : sans cette règle, deux
    // appareils pourraient se renvoyer indéfiniment deux versions concurrentes.
    expect(deciderReception({ localModifieLe: T.moyen, distantModifieLe: T.moyen })).toBe(
      'prendre_distant',
    );
  });

  it('ne fait rien quand le Drive ne porte pas l’enregistrement', () => {
    expect(deciderReception({ localModifieLe: T.recent })).toBe('rien');
    expect(deciderReception({})).toBe('rien');
  });

  describe('suppressions', () => {
    it('supprime en local quand le tombstone est postérieur', () => {
      expect(deciderReception({ localModifieLe: T.vieux, tombstoneLe: T.recent })).toBe(
        'supprimer_local',
      );
    });

    it('garde le local modifié après la suppression distante', () => {
      // L'enregistrement a été recréé ou modifié après coup : on ne l'efface pas.
      expect(deciderReception({ localModifieLe: T.recent, tombstoneLe: T.vieux })).toBe(
        'garder_local',
      );
    });

    it('n’a rien à faire si l’enregistrement est déjà absent des deux côtés', () => {
      expect(deciderReception({ tombstoneLe: T.recent })).toBe('rien');
    });

    it('laisse gagner une version distante postérieure au tombstone', () => {
      // Suppression puis recréation sur l'autre appareil.
      expect(
        deciderReception({
          localModifieLe: T.vieux,
          distantModifieLe: T.recent,
          tombstoneLe: T.moyen,
        }),
      ).toBe('prendre_distant');
    });

    it('supprime malgré une version distante antérieure au tombstone', () => {
      expect(
        deciderReception({
          localModifieLe: T.vieux,
          distantModifieLe: T.vieux,
          tombstoneLe: T.recent,
        }),
      ).toBe('supprimer_local');
    });

    it('supprime à égalité entre le local et le tombstone', () => {
      // Une suppression RGPD ne doit jamais être annulée par une égalité.
      expect(deciderReception({ localModifieLe: T.moyen, tombstoneLe: T.moyen })).toBe(
        'supprimer_local',
      );
    });
  });
});

function parametres(m: Partial<Parametres> = {}): Parametres {
  return {
    id: 'singleton',
    bailleur: {
      civilite: 'M',
      nom: 'Infante',
      prenom: 'Jami',
      adresse: '',
      email: '',
      telephone: '',
      qualite: 'personne_physique',
    },
    grilleVetuste: GRILLE_VETUSTE_DEFAUT,
    compteursSequence: { bail: 0, edl: 0, inventaire: 0, document: 0, annee: 2026 },
    ...m,
  };
}

describe('fusionnerParametres', () => {
  it('prend le maximum de chaque compteur, jamais la somme ni le dernier écrivain', () => {
    // Deux baux créés hors-ligne : sans le maximum, une référence serait réattribuée.
    const local = parametres({
      compteursSequence: { bail: 7, edl: 2, inventaire: 0, document: 12, annee: 2026 },
    });
    const distant = parametres({
      compteursSequence: { bail: 5, edl: 9, inventaire: 0, document: 3, annee: 2026 },
    });
    const fusion = fusionnerParametres(local, distant, true);
    expect(fusion.compteursSequence).toEqual({
      bail: 7,
      edl: 9,
      inventaire: 0,
      document: 12,
      annee: 2026,
    });
  });

  it('adopte les compteurs de l’année la plus récente sans les mélanger', () => {
    // Un appareil resté sur 2025 ne doit pas faire remonter des numéros déjà
    // attribués en 2026 (la séquence repart à zéro chaque année).
    const local = parametres({
      compteursSequence: { bail: 40, edl: 30, inventaire: 0, document: 50, annee: 2025 },
    });
    const distant = parametres({
      compteursSequence: { bail: 2, edl: 1, inventaire: 0, document: 3, annee: 2026 },
    });
    expect(fusionnerParametres(local, distant, false).compteursSequence).toEqual({
      bail: 2,
      edl: 1,
      inventaire: 0,
      document: 3,
      annee: 2026,
    });
  });

  it('ne reprend jamais la configuration Drive du distant', () => {
    // Elle décrit l'autre appareil : son état de synchronisation, son dossier.
    const local = parametres({
      sauvegardeGDrive: { clientId: 'local', actif: true, dossierId: 'dossier-local' },
    });
    const distant = parametres({
      sauvegardeGDrive: { clientId: 'distant', actif: false, dossierId: 'dossier-distant' },
    });
    const fusion = fusionnerParametres(local, distant, true);
    expect(fusion.sauvegardeGDrive?.clientId).toBe('local');
    expect(fusion.sauvegardeGDrive?.dossierId).toBe('dossier-local');
  });

  it('applique le dernier écrivain aux réglages, dans les deux sens', () => {
    const local = parametres({ bailleur: { ...parametres().bailleur, nom: 'Local' } });
    const distant = parametres({ bailleur: { ...parametres().bailleur, nom: 'Distant' } });
    expect(fusionnerParametres(local, distant, true).bailleur.nom).toBe('Distant');
    expect(fusionnerParametres(local, distant, false).bailleur.nom).toBe('Local');
  });

  it('conserve la date de sauvegarde la plus récente', () => {
    const local = parametres({ derniereSauvegarde: T.vieux });
    const distant = parametres({ derniereSauvegarde: T.recent });
    expect(fusionnerParametres(local, distant, false).derniereSauvegarde).toBe(T.recent);
    expect(fusionnerParametres(distant, local, false).derniereSauvegarde).toBe(T.recent);
  });
});

describe('garde-fous', () => {
  it('mesure l’écart d’horloge dans les deux sens', () => {
    const serveur = '2026-08-08T10:00:00.000Z';
    expect(ecartHorloge(serveur, Date.parse(serveur))).toBe(0);
    expect(ecartHorloge(serveur, Date.parse(serveur) + 60_000)).toBe(60_000);
    expect(ecartHorloge(serveur, Date.parse(serveur) - 60_000)).toBe(60_000);
  });

  it('détecte une suppression massive au-delà de la moitié de la base', () => {
    expect(suppressionMassive(6, 10)).toBe(true);
    expect(suppressionMassive(5, 10)).toBe(false);
    expect(suppressionMassive(30, 40)).toBe(true);
  });

  it('laisse passer les petites suppressions, même proportionnellement énormes', () => {
    // Supprimer l'unique locataire d'une base qui n'en compte qu'un est un
    // usage normal : sans ce plancher, le garde-fou bloquerait le quotidien au
    // lieu de protéger d'un accident.
    expect(suppressionMassive(1, 1)).toBe(false);
    expect(suppressionMassive(4, 4)).toBe(false);
    expect(suppressionMassive(5, 5)).toBe(true);
  });

  it('ne se déclenche pas sur une base vide', () => {
    expect(suppressionMassive(0, 0)).toBe(false);
    expect(suppressionMassive(3, 0)).toBe(false);
  });
});

describe('referencesEnDouble', () => {
  it('ne signale rien quand chaque référence est unique', () => {
    expect(
      referencesEnDouble('baux', [
        { id: 'b1', reference: 'BAIL-2026-0001' },
        { id: 'b2', reference: 'BAIL-2026-0002' },
      ]),
    ).toEqual([]);
  });

  it('signale une référence attribuée deux fois hors-ligne', () => {
    // Deux appareils sans réseau attribuent le même numéro : la fusion des
    // compteurs empêche que cela recommence, pas que ce soit arrivé.
    const doublons = referencesEnDouble('baux', [
      { id: 'b2', reference: 'BAIL-2026-0007' },
      { id: 'b1', reference: 'BAIL-2026-0007' },
      { id: 'b3', reference: 'BAIL-2026-0008' },
    ]);
    expect(doublons).toEqual([{ table: 'baux', reference: 'BAIL-2026-0007', ids: ['b1', 'b2'] }]);
  });

  it('ignore les enregistrements sans référence', () => {
    expect(
      referencesEnDouble('edls', [{ id: 'e1' }, { id: 'e2' }, { id: 'e3', reference: '  ' }]),
    ).toEqual([]);
  });

  it('remonte plusieurs doublons, dans un ordre stable', () => {
    const doublons = referencesEnDouble('baux', [
      { id: 'b1', reference: 'BAIL-2026-0009' },
      { id: 'b2', reference: 'BAIL-2026-0009' },
      { id: 'b3', reference: 'BAIL-2026-0002' },
      { id: 'b4', reference: 'BAIL-2026-0002' },
    ]);
    expect(doublons.map((d) => d.reference)).toEqual(['BAIL-2026-0002', 'BAIL-2026-0009']);
  });
});
