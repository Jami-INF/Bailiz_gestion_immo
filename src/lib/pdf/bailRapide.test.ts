import { describe, expect, it } from 'vitest';
import type { Bail, Bien, Locataire, Parametres, SaisieBail } from '@/types';
import {
  bailVersSaisie,
  construireBienInline,
  construireDocs,
  dureeParDefaut,
  saisieVide,
} from './bailRapide';

const bailleur: Parametres['bailleur'] = {
  civilite: 'M',
  nom: 'Infante',
  prenom: 'Jami',
  adresse: '38 rue Robert Noel, 63110 Beaumont',
  email: 'j@x.fr',
  telephone: '0600000000',
  qualite: 'personne_physique',
};

const bienEnregistre: Bien = {
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
  createdAt: '',
  updatedAt: '',
};

const locataireEnregistre: Locataire = {
  id: 'loc-1',
  civilite: 'Mme',
  nom: 'Dupont',
  prenom: 'Marie',
  email: 'marie@x.fr',
  telephone: '0612345678',
  createdAt: '',
  updatedAt: '',
};

const resolveBien = (id: string) => (id === bienEnregistre.id ? bienEnregistre : undefined);
const resolveLocataire = (id: string) => (id === locataireEnregistre.id ? locataireEnregistre : undefined);

/** Saisie de base : bien et locataire enregistrés, loyer renseigné. */
function saisieDeBase(): SaisieBail {
  return {
    ...saisieVide(bailleur, bienEnregistre.id),
    locataires: [{ id: locataireEnregistre.id }],
    loyerHC: 700,
    charges: { mode: 'forfait', montant: 60 },
    depotGarantie: 1400,
  };
}

describe('dureeParDefaut', () => {
  it('applique la durée légale de chaque type de bail', () => {
    expect(dureeParDefaut('meuble_1an')).toBe(12);
    expect(dureeParDefaut('meuble_etudiant_9mois')).toBe(9);
    expect(dureeParDefaut('mobilite')).toBe(1);
  });
});

describe('saisieVide', () => {
  it('pré-remplit le bailleur et les valeurs de paiement par défaut', () => {
    const s = saisieVide(bailleur);
    expect(s.bailleur).toEqual(bailleur);
    expect(s.jourPaiement).toBe(5);
    expect(s.modePaiement).toBe('Virement bancaire');
    expect(s.typeBail).toBe('meuble_1an');
    expect(s.dureeMois).toBe(12);
    expect(s.clauseResolutoire).toBe(true);
  });

  it('pré-sélectionne le bien fourni', () => {
    expect(saisieVide(bailleur, 'bien-1').bienId).toBe('bien-1');
  });
});

describe('construireBienInline', () => {
  it('complète les champs manquants sans planter', () => {
    const bien = construireBienInline({ adresse: { ligne1: '', codePostal: '', ville: '' } });
    expect(bien.nom).toBe('Logement');
    expect(bien.type).toBe('autre');
    expect(bien.surfaceBoutin).toBe(0);
    expect(bien.nbPieces).toBe(0);
    expect(bien.id).toBeTruthy();
  });

  it('reprend les valeurs saisies', () => {
    const bien = construireBienInline({
      nom: 'Studio',
      adresse: { ligne1: '1 rue A', codePostal: '63000', ville: 'Clermont' },
      type: 'T1',
      surfaceBoutin: 20,
      nbPieces: 1,
      classeDPE: 'D',
    });
    expect(bien.nom).toBe('Studio');
    expect(bien.type).toBe('T1');
    expect(bien.surfaceBoutin).toBe(20);
    expect(bien.classeDPE).toBe('D');
  });
});

describe('construireDocs', () => {
  it('utilise le bien et le locataire enregistrés quand ils sont résolus', () => {
    const { bail, bien, locataires } = construireDocs(saisieDeBase(), 'BAIL-2026-0001', resolveBien, resolveLocataire);
    expect(bien).toBe(bienEnregistre);
    expect(locataires).toEqual([locataireEnregistre]);
    expect(bail.bienId).toBe('bien-1');
    expect(bail.locataireIds).toEqual(['loc-1']);
    expect(bail.reference).toBe('BAIL-2026-0001');
  });

  it('retombe sur une saisie inline quand la référence ne résout pas', () => {
    const saisie: SaisieBail = {
      ...saisieVide(bailleur, 'bien-inconnu'),
      locataires: [{ prenom: 'Léo', nom: 'Durand', email: 'leo@x.fr', telephone: '0700000000' }],
    };
    const { bien, locataires, bail } = construireDocs(saisie, 'REF', resolveBien, resolveLocataire);
    expect(bien.id).not.toBe('bien-1');
    expect(locataires[0].prenom).toBe('Léo');
    // Le bail doit pointer vers le bien réellement construit.
    expect(bail.bienId).toBe(bien.id);
    expect(bail.locataireIds).toEqual([locataires[0].id]);
  });

  it('interdit le dépôt de garantie et la révision IRL en bail mobilité', () => {
    const saisie: SaisieBail = {
      ...saisieDeBase(),
      typeBail: 'mobilite',
      depotGarantie: 1400,
      revisionIRL: { revisable: true, trimestreReference: '1er trimestre 2026', valeurIndice: 145 },
    };
    const { bail } = construireDocs(saisie, 'REF', resolveBien, resolveLocataire);
    expect(bail.depotGarantie).toBe(0);
    expect(bail.revisionIRL.revisable).toBe(false);
  });

  it('n’active solidarité et assurance colocataires qu’en colocation', () => {
    const seul = construireDocs(
      { ...saisieDeBase(), clauseSolidarite: true, assuranceMontantAnnuel: 180 },
      'REF',
      resolveBien,
      resolveLocataire,
    ).bail;
    expect(seul.clauseSolidarite).toBe(false);
    expect(seul.assuranceColocataires).toBeUndefined();

    const coloc = construireDocs(
      {
        ...saisieDeBase(),
        locataires: [{ id: 'loc-1' }, { prenom: 'Paul', nom: 'Martin' }],
        clauseSolidarite: true,
        assuranceMontantAnnuel: 180,
      },
      'REF',
      resolveBien,
      resolveLocataire,
    ).bail;
    expect(coloc.clauseSolidarite).toBe(true);
    expect(coloc.assuranceColocataires).toEqual({ montantAnnuel: 180 });
    expect(coloc.locataireIds).toHaveLength(2);
  });

  it('découpe les clauses particulières en lignes non vides', () => {
    const { bail } = construireDocs(
      { ...saisieDeBase(), clausesParticulieres: 'Clause A\n\n  Clause B  \n' },
      'REF',
      resolveBien,
      resolveLocataire,
    );
    expect(bail.clausesParticulieres).toEqual(['Clause A', 'Clause B']);
  });

  it('n’ajoute un complément de loyer que s’il est chiffré', () => {
    const sans = construireDocs(saisieDeBase(), 'REF', resolveBien, resolveLocataire).bail;
    expect(sans.complementLoyer).toBeUndefined();

    const avec = construireDocs(
      { ...saisieDeBase(), complementMontant: 50, complementJustification: 'Vue exceptionnelle' },
      'REF',
      resolveBien,
      resolveLocataire,
    ).bail;
    expect(avec.complementLoyer).toEqual({ montant: 50, justification: 'Vue exceptionnelle' });
  });

  it('produit toujours au moins un locataire, même sans saisie', () => {
    const { locataires } = construireDocs(
      { ...saisieVide(bailleur), locataires: [] },
      'REF',
      resolveBien,
      resolveLocataire,
    );
    expect(locataires).toHaveLength(1);
  });
});

describe('bailVersSaisie', () => {
  it('recharge un bail existant dans le formulaire sans perte', () => {
    const { bail } = construireDocs(
      {
        ...saisieDeBase(),
        clausesParticulieres: 'Entretien annuel de la chaudière',
        revisionIRL: { revisable: true, trimestreReference: '1er trimestre 2026', valeurIndice: 145.47 },
      },
      'BAIL-2026-0002',
      resolveBien,
      resolveLocataire,
    );
    const saisie = bailVersSaisie(bail as Bail, bailleur);
    expect(saisie.bienId).toBe(bail.bienId);
    expect(saisie.locataires).toEqual([{ id: 'loc-1' }]);
    expect(saisie.loyerHC).toBe(700);
    expect(saisie.depotGarantie).toBe(1400);
    expect(saisie.jourPaiement).toBe(5);
    expect(saisie.clausesParticulieres).toBe('Entretien annuel de la chaudière');
    expect(saisie.revisionIRL).toMatchObject({ revisable: true, valeurIndice: 145.47 });
  });
});
