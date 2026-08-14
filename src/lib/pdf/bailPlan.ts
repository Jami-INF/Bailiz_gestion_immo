import type { Bail, Bien, ClauseBail, FamilleClause, Locataire } from '@/types';

/** Ordre d'impression des familles de conditions générales. */
const FAMILLES_CLAUSE: FamilleClause[] = [
  'occupation',
  'entretien',
  'assurance',
  'immeuble',
];

const ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];

/**
 * Attribue A, B, C… aux seules sous-sections réellement imprimées. Sans cela,
 * un logement sans annexe ni partie commune produirait « A, B, E » : un contrat
 * dont le lettrage saute se relit mal et se cite encore plus mal.
 */
export function lettrer(cles: (string | false | null | undefined)[]): Record<string, string> {
  const table: Record<string, string> = {};
  cles
    .filter((c): c is string => Boolean(c))
    .forEach((cle, i) => {
      table[cle] = String.fromCharCode(65 + i);
    });
  return table;
}

export interface PlanContrat {
  /** Parties effectivement imprimées, dans l'ordre. */
  parties: { cle: string; titre: string }[];
  /** Numéro romain d'une partie (`''` si elle n'est pas imprimée). */
  num: (cle: string) => string;
  /** Sommaire de la page de garde, construit depuis la même liste. */
  sommaire: string[];
  sousObjet: Record<string, string>;
  sousFinances: Record<string, string>;
  /** Conditions générales retenues, regroupées par famille non vide. */
  clausesParFamille: [FamilleClause, ClauseBail[]][];
}

/**
 * Plan du contrat : numérotation calculée plutôt qu'écrite en dur. Une partie
 * ou une sous-partie non imprimée - pas de colocation, aucune condition
 * générale retenue, logement sans partie commune - ne doit laisser aucun trou
 * dans la numérotation, et le sommaire ne doit jamais diverger du corps.
 */
export function planDuContrat({
  bail,
  bien,
  locataires,
}: {
  bail: Bail;
  bien: Bien;
  locataires: Locataire[];
}): PlanContrat {
  // Une clause conditionnelle n'est imprimée que si le logement la justifie.
  const clausesRetenues = (bail.clauses ?? []).filter((c) =>
    c.condition === 'copropriete'
      ? bien.regimeJuridique === 'copropriete'
      : c.condition === 'servitude_residence_principale'
        ? Boolean(bien.servitudeResidencePrincipale)
        : true,
  );
  const clausesParFamille = FAMILLES_CLAUSE.map(
    (famille) => [famille, clausesRetenues.filter((c) => c.famille === famille)] as [FamilleClause, ClauseBail[]],
  ).filter(([, clauses]) => clauses.length > 0);

  const parties = [
    { cle: 'parties', titre: 'Désignation des parties' },
    { cle: 'objet', titre: 'Objet du contrat' },
    { cle: 'duree', titre: "Date de prise d'effet et durée du contrat" },
    { cle: 'finances', titre: 'Conditions financières' },
    { cle: 'travaux', titre: 'Travaux' },
    { cle: 'garanties', titre: 'Garanties' },
    // Locataire unique : la partie entière est omise plutôt que de porter une
    // mention « sans objet » qui occupe un numéro pour rien.
    ...(locataires.length > 1 ? [{ cle: 'solidarite', titre: 'Clause de solidarité' }] : []),
    { cle: 'resolutoire', titre: 'Clause résolutoire' },
    { cle: 'honoraires', titre: 'Honoraires de location' },
    ...(clausesParFamille.length > 0
      ? [{ cle: 'clauses', titre: "Conditions générales d'occupation" }]
      : []),
    { cle: 'particulieres', titre: 'Autres conditions particulières' },
    { cle: 'annexes', titre: 'Annexes' },
  ];

  return {
    parties,
    num: (cle) => ROMAINS[parties.findIndex((p) => p.cle === cle)] ?? '',
    sommaire: parties.map((p, i) => `${ROMAINS[i]}. ${p.titre}`),
    sousObjet: lettrer([
      'consistance',
      'destination',
      bien.annexes.length > 0 && 'accessoires',
      bien.partiesCommunes.length > 0 && 'communs',
      'tic',
    ]),
    sousFinances: lettrer([
      'loyer',
      'charges',
      Boolean(bail.assuranceColocataires) && 'assurance',
      'paiement',
    ]),
    clausesParFamille,
  };
}
