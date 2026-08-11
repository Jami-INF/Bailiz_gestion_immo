import type { Bailleur, PersonneBailleur } from '@/types';

/**
 * Désignation du bailleur au contrat.
 *
 * Trois qualités, trois rédactions — et ce n'est pas cosmétique : un logement
 * détenu en indivision loué au nom d'un seul indivisaire expose le bail à la
 * contestation des autres, et une société désignée par le seul nom de son
 * gérant n'est pas partie au contrat. La partie I du bail type doit identifier
 * **toutes** les personnes qui donnent à bail.
 */

function nomPersonne(p: PersonneBailleur | undefined): string {
  if (!p) return '';
  const civilite = p.civilite === 'Mme' ? 'Mme' : 'M.';
  const nom = `${p.prenom ?? ''} ${p.nom ?? ''}`.trim();
  return nom ? `${civilite} ${nom}` : '';
}

/** Toutes les personnes physiques bailleresses (le bailleur, puis les coïndivisaires). */
export function personnesBailleur(b: Bailleur): PersonneBailleur[] {
  const premier: PersonneBailleur = { civilite: b.civilite, nom: b.nom, prenom: b.prenom };
  if (b.qualite !== 'indivision') return [premier];
  return [premier, ...(b.coIndivisaires ?? [])].filter((p) => `${p.prenom ?? ''}${p.nom ?? ''}`.trim());
}

/**
 * Nom court du bailleur, pour les en-têtes de courrier, les titres de documents
 * et les listes. Une personne morale est désignée par sa dénomination.
 */
export function nomBailleur(b: Bailleur | undefined): string {
  if (!b) return '';
  if (b.qualite === 'personne_morale') {
    return [b.formeJuridique, b.denomination].filter(Boolean).join(' ').trim();
  }
  const personnes = personnesBailleur(b).map(nomPersonne).filter(Boolean);
  if (personnes.length === 0) return '';
  if (personnes.length === 1) return personnes[0];
  return `${personnes.slice(0, -1).join(', ')} et ${personnes[personnes.length - 1]}`;
}

/**
 * Qui **signe** : une société ne signe pas elle-même, son représentant légal
 * signe pour elle. Sert au bloc de signature de l'état des lieux et aux
 * courriers.
 */
export function signataireBailleur(b: Bailleur | undefined): string {
  if (!b) return '';
  if (b.qualite === 'personne_morale') {
    const representant = nomPersonne(b.representant);
    if (!representant) return nomBailleur(b);
    const fonction = b.representant?.fonction?.trim();
    return fonction ? `${representant}, ${fonction}` : representant;
  }
  return nomBailleur(b);
}

/**
 * Lignes d'identification du bailleur pour la partie I du bail.
 *
 * Renvoyer des lignes plutôt qu'un bloc de JSX garde la règle juridique
 * testable, et laisse chaque document choisir sa mise en forme.
 */
export function designationBailleur(b: Bailleur): string[] {
  if (b.qualite === 'personne_morale') {
    const identite = [
      nomBailleur(b) || 'Dénomination non renseignée',
      b.capitalSocial ? `au capital de ${b.capitalSocial} €` : undefined,
      b.villeRCS ? `immatriculée au RCS de ${b.villeRCS}` : undefined,
      b.siret ? `SIRET : ${b.siret}` : undefined,
    ]
      .filter(Boolean)
      .join(', ');
    const representation = b.representant
      ? `Représentée par ${signataireBailleur(b)}, dûment habilité(e) à l'effet des présentes.`
      : undefined;
    return [identite, representation].filter((l): l is string => Boolean(l));
  }

  const personnes = personnesBailleur(b);
  if (b.qualite === 'indivision') {
    return [
      `${personnes.map(nomPersonne).filter(Boolean).join(', ')} — propriétaires indivis du logement, agissant conjointement${
        b.siret ? `, SIRET : ${b.siret}` : ''
      }.`,
      'Chacun des indivisaires a la qualité de bailleur ; le congé, la révision du loyer et la restitution du dépôt de garantie relèvent de leur décision commune.',
    ];
  }

  return [
    `${nomPersonne(personnes[0]) || 'Bailleur non renseigné'} — personne physique, loueur en meublé non professionnel (LMNP)${
      b.siret ? `, SIRET : ${b.siret}` : ''
    }.`,
  ];
}

/** Libellé de l'adresse selon la qualité : domicile ou siège social. */
export function libelleAdresseBailleur(b: Bailleur): string {
  return b.qualite === 'personne_morale' ? 'Siège social' : 'Demeurant';
}

/**
 * Vrai si le bailleur est suffisamment identifié pour produire un document.
 * Remplace les tests sur le seul `nom`, qui laissaient passer une société dont
 * seule la dénomination est renseignée.
 */
export function bailleurRenseigne(b: Bailleur | undefined): boolean {
  return Boolean(nomBailleur(b).trim());
}
