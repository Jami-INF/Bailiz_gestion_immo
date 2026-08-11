import { describe, expect, it } from 'vitest';
import type { Bailleur } from '@/types';
import {
  bailleurRenseigne,
  designationBailleur,
  libelleAdresseBailleur,
  nomBailleur,
  personnesBailleur,
  signataireBailleur,
} from './bailleur';

function physique(p: Partial<Bailleur> = {}): Bailleur {
  return {
    qualite: 'personne_physique',
    civilite: 'M',
    nom: 'Infante',
    prenom: 'Jami',
    adresse: '5 place de Jaude, 63000 Clermont-Ferrand',
    email: 'bailleur@exemple.fr',
    telephone: '0611111111',
    ...p,
  };
}

const indivision = physique({
  qualite: 'indivision',
  coIndivisaires: [{ civilite: 'Mme', nom: 'Infante', prenom: 'Léa' }],
});

const morale = physique({
  qualite: 'personne_morale',
  formeJuridique: 'SCI',
  denomination: 'Les Tilleuls',
  capitalSocial: 1000,
  villeRCS: 'Clermont-Ferrand',
  siret: '12345678900012',
  representant: { civilite: 'M', nom: 'Infante', prenom: 'Jami', fonction: 'gérant' },
});

describe('nomBailleur', () => {
  it('nomme une personne physique', () => {
    expect(nomBailleur(physique())).toBe('M. Jami Infante');
  });

  it('nomme tous les indivisaires', () => {
    // Un bail signé au nom d'un seul indivisaire est contestable par les autres.
    expect(nomBailleur(indivision)).toBe('M. Jami Infante et Mme Léa Infante');
  });

  it('énumère proprement au-delà de deux indivisaires', () => {
    const trois = physique({
      qualite: 'indivision',
      coIndivisaires: [
        { civilite: 'Mme', nom: 'Infante', prenom: 'Léa' },
        { civilite: 'M', nom: 'Infante', prenom: 'Paul' },
      ],
    });
    expect(nomBailleur(trois)).toBe('M. Jami Infante, Mme Léa Infante et M. Paul Infante');
  });

  it('désigne une société par sa dénomination, pas par son gérant', () => {
    expect(nomBailleur(morale)).toBe('SCI Les Tilleuls');
  });

  it('ignore un indivisaire laissé vide', () => {
    const avecVide = physique({
      qualite: 'indivision',
      coIndivisaires: [{ civilite: 'Mme', nom: '', prenom: '' }],
    });
    expect(nomBailleur(avecVide)).toBe('M. Jami Infante');
  });

  it('ne rend rien pour un bailleur non renseigné', () => {
    expect(nomBailleur(physique({ nom: '', prenom: '' }))).toBe('');
    expect(nomBailleur(undefined)).toBe('');
  });
});

describe('signataireBailleur', () => {
  it('est le bailleur lui-même pour une personne physique', () => {
    expect(signataireBailleur(physique())).toBe('M. Jami Infante');
  });

  it('est le représentant légal pour une société, avec sa fonction', () => {
    // Une société ne signe pas : son gérant signe pour elle.
    expect(signataireBailleur(morale)).toBe('M. Jami Infante, gérant');
  });

  it('retombe sur la dénomination si aucun représentant n’est renseigné', () => {
    expect(signataireBailleur(physique({ ...morale, representant: undefined }))).toBe(
      'SCI Les Tilleuls',
    );
  });
});

describe('designationBailleur', () => {
  it('mentionne la qualité LMNP pour une personne physique', () => {
    const lignes = designationBailleur(physique({ siret: '12345678900012' }));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain('M. Jami Infante');
    expect(lignes[0]).toContain('loueur en meublé non professionnel');
    expect(lignes[0]).toContain('12345678900012');
  });

  it('désigne les indivisaires et rappelle qu’ils agissent ensemble', () => {
    const lignes = designationBailleur(indivision);
    expect(lignes[0]).toContain('M. Jami Infante, Mme Léa Infante');
    expect(lignes[0]).toContain('propriétaires indivis');
    expect(lignes[1]).toContain('décision commune');
  });

  it('donne forme, capital, RCS et représentant pour une société', () => {
    const lignes = designationBailleur(morale);
    expect(lignes[0]).toContain('SCI Les Tilleuls');
    expect(lignes[0]).toContain('au capital de 1000 €');
    expect(lignes[0]).toContain('RCS de Clermont-Ferrand');
    expect(lignes[1]).toContain('Représentée par M. Jami Infante, gérant');
  });

  it('reste imprimable quand la société est à peine renseignée', () => {
    // Le bail doit sortir même incomplet : les vides se complètent à la main.
    const lignes = designationBailleur(physique({ qualite: 'personne_morale' }));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain('Dénomination non renseignée');
  });
});

describe('libelleAdresseBailleur', () => {
  it('parle de siège social pour une société, de domicile sinon', () => {
    expect(libelleAdresseBailleur(morale)).toBe('Siège social');
    expect(libelleAdresseBailleur(physique())).toBe('Demeurant');
    expect(libelleAdresseBailleur(indivision)).toBe('Demeurant');
  });
});

describe('bailleurRenseigne', () => {
  it('reconnaît une société identifiée par sa seule dénomination', () => {
    // L'ancien test portait sur `nom`, vide ici : une SCI correctement
    // configurée était considérée comme non renseignée.
    const sci = physique({ qualite: 'personne_morale', nom: '', prenom: '', denomination: 'Les Tilleuls' });
    expect(bailleurRenseigne(sci)).toBe(true);
  });

  it('rejette un bailleur vide', () => {
    expect(bailleurRenseigne(physique({ nom: '  ', prenom: '  ' }))).toBe(false);
    expect(bailleurRenseigne(undefined)).toBe(false);
  });
});

describe('personnesBailleur', () => {
  it('ne rend qu’une personne hors indivision, même si des coïndivisaires traînent', () => {
    // Changer de qualité ne doit pas faire réapparaître d'anciens coïndivisaires.
    const bascule = physique({ coIndivisaires: [{ civilite: 'Mme', nom: 'X', prenom: 'Y' }] });
    expect(personnesBailleur(bascule)).toHaveLength(1);
  });
});
