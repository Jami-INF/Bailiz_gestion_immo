import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import type { Bien, ClauseBail, FamilleClause } from '@/types';
import { FAMILLE_CLAUSE_LABELS } from '@/types';
import { Button, Checkbox } from '@/components/ui';

const FAMILLES: FamilleClause[] = ['occupation', 'entretien', 'assurance', 'immeuble'];

/** Une clause conditionnelle ne se propose que si le logement s'y prête. */
export function clausePertinente(clause: ClauseBail, bien?: Bien): boolean {
  if (clause.condition === 'copropriete') return bien?.regimeJuridique === 'copropriete';
  if (clause.condition === 'servitude_residence_principale')
    return Boolean(bien?.servitudeResidencePrincipale);
  return true;
}

/**
 * Sélection des conditions générales d'occupation pour un bail : le pack des
 * Paramètres arrive pré-coché, chaque bail peut en retirer. Le texte se
 * consulte ici mais se modifie dans les Paramètres - un bail ne doit pas
 * devenir un éditeur juridique.
 */
export function ClausesSelecteur({
  catalogue,
  retenues,
  bien,
  onChange,
  onReprendreModele,
}: {
  /** Toutes les clauses connues (modèle des Paramètres). */
  catalogue: ClauseBail[];
  /** Clauses retenues pour ce bail. */
  retenues: ClauseBail[];
  bien?: Bien;
  onChange: (clauses: ClauseBail[]) => void;
  /** Affiché en mode « Modifier » : resynchronise sur le modèle courant. */
  onReprendreModele?: () => void;
}) {
  const [deplie, setDeplie] = useState<string | null>(null);

  const proposables = catalogue.filter((c) => clausePertinente(c, bien));
  const estRetenue = (id: string) => retenues.some((c) => c.id === id);

  const basculer = (clause: ClauseBail) => {
    if (estRetenue(clause.id)) {
      onChange(retenues.filter((c) => c.id !== clause.id));
      return;
    }
    // Conserve l'ordre du catalogue, quel que soit l'ordre de cochage.
    const ids = proposables.map((c) => c.id);
    onChange(
      [...retenues, { ...clause }].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)),
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-accent-600">
        Toutes sont licites et rédigées en faveur du bailleur dans les limites de la loi. Le texte
        se modifie dans les Paramètres ; ici, vous choisissez ce qui figure dans <em>ce</em> bail.
      </p>

      {FAMILLES.map((famille) => {
        const clauses = proposables.filter((c) => c.famille === famille);
        if (clauses.length === 0) return null;
        const retenuesFamille = clauses.filter((c) => estRetenue(c.id)).length;
        return (
          <div key={famille} className="rounded-lg border border-accent-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-accent-800">
                {FAMILLE_CLAUSE_LABELS[famille]}
              </h4>
              <span className="text-xs text-accent-500">
                {retenuesFamille}/{clauses.length}
              </span>
            </div>
            <ul className="space-y-1">
              {clauses.map((clause) => (
                <li key={clause.id}>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      label={clause.titre}
                      checked={estRetenue(clause.id)}
                      onChange={() => basculer(clause)}
                    />
                    <button
                      type="button"
                      className="mt-1 shrink-0 text-accent-400 hover:text-accent-700"
                      aria-label={`Afficher le texte : ${clause.titre}`}
                      onClick={() => setDeplie(deplie === clause.id ? null : clause.id)}
                    >
                      {deplie === clause.id ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>
                  </div>
                  {deplie === clause.id && (
                    <div className="ml-8 mt-1 rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
                      <p>{clause.texte}</p>
                      {clause.baseLegale && (
                        <p className="mt-1 text-xs text-accent-500">{clause.baseLegale}</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {onReprendreModele && (
        <Button variant="ghost" size="sm" onClick={onReprendreModele}>
          <RotateCcw size={14} /> Reprendre le modèle des Paramètres
        </Button>
      )}
    </div>
  );
}
