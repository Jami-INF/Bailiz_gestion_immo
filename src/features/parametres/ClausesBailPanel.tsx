import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ScrollText, Trash2 } from 'lucide-react';
import type { ClauseBail, FamilleClause } from '@/types';
import { FAMILLE_CLAUSE_LABELS } from '@/types';
import { db, lireParametres } from '@/lib/db';
import { uid } from '@/lib/ids';
import { CLAUSES_BAIL_DEFAUT } from '@/lib/defauts';
import { Button, Card, Checkbox, ConfirmModal, Field, Input, Select, Textarea, useToast } from '@/components/ui';

const FAMILLES: FamilleClause[] = ['occupation', 'entretien', 'assurance', 'immeuble'];

const CONDITIONS: { valeur: string; label: string }[] = [
  { valeur: '', label: 'Toujours proposée' },
  { valeur: 'copropriete', label: 'Logement en copropriété' },
  { valeur: 'servitude_residence_principale', label: 'Servitude de résidence principale' },
];

/**
 * Modèle des conditions générales d'occupation du bail. Chaque nouveau bail
 * part de ce pack ; les clauses cochées ici arrivent pré-sélectionnées. Modifier
 * une clause n'affecte que les baux **créés ensuite** : un bail enregistré
 * conserve sa propre copie.
 */
export function ClausesBailPanel() {
  const toast = useToast();
  const parametres = useLiveQuery(() => lireParametres());
  const [confirmReset, setConfirmReset] = useState(false);
  // Champs non contrôlés (écriture au `blur`) : un remontage leur fait relire
  // les valeurs après réinitialisation.
  const [version, setVersion] = useState(0);

  if (!parametres) return null;
  const clauses = parametres.clausesBail ?? CLAUSES_BAIL_DEFAUT;

  const majClauses = (liste: ClauseBail[]) => db.parametres.put({ ...parametres, clausesBail: liste });
  const majClause = (id: string, m: Partial<ClauseBail>) =>
    majClauses(clauses.map((c) => (c.id === id ? { ...c, ...m } : c)));

  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-accent-900">
        <ScrollText size={18} /> Clauses du bail
      </h2>
      <p className="mb-3 text-sm text-accent-600">
        Ces clauses forment la partie « Conditions générales d'occupation » du bail. Les clauses
        cochées sont proposées d'office à chaque nouveau bail ; vous pouvez en retirer au cas par
        cas au moment de la rédaction. Un bail déjà enregistré garde le texte avec lequel il a été
        imprimé.
      </p>
      <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
        La loi répute non écrites, entre autres, les clauses prévoyant une pénalité de retard, des
        frais de relance, la responsabilité automatique du locataire pour toute dégradation, une
        assurance imposée chez un assureur désigné, l'interdiction d'héberger des proches ou de
        détenir un animal familier. Ne remplacez pas un texte fourni par l'une d'elles : elle
        serait sans effet et fragiliserait le bail (art. 4 de la loi du 6 juillet 1989).
      </p>

      <div key={`clauses-${version}`} className="space-y-4">
        {FAMILLES.map((famille) => {
          const groupe = clauses.filter((c) => c.famille === famille);
          return (
            <div key={famille}>
              <h3 className="mb-2 text-sm font-semibold text-accent-800">
                {FAMILLE_CLAUSE_LABELS[famille]}
              </h3>
              <div className="space-y-3">
                {groupe.map((clause) => (
                  <div key={clause.id} className="rounded-lg border border-accent-200 p-3">
                    <div className="mb-2 flex flex-wrap items-end gap-2">
                      <Checkbox
                        label=""
                        aria-label={`Proposer « ${clause.titre} » par défaut`}
                        checked={clause.active}
                        onChange={(e) => majClause(clause.id, { active: e.target.checked })}
                      />
                      <div className="min-w-[14rem] flex-1">
                        <Field label="Titre">
                          <Input
                            defaultValue={clause.titre}
                            onBlur={(e) => majClause(clause.id, { titre: e.target.value })}
                          />
                        </Field>
                      </div>
                      <div className="min-w-[12rem]">
                        <Field label="Proposée si">
                          <Select
                            value={clause.condition ?? ''}
                            onChange={(e) =>
                              majClause(clause.id, {
                                condition: (e.target.value || undefined) as ClauseBail['condition'],
                              })
                            }
                          >
                            {CONDITIONS.map((c) => (
                              <option key={c.valeur} value={c.valeur}>
                                {c.label}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Supprimer la clause"
                        onClick={() => void majClauses(clauses.filter((c) => c.id !== clause.id))}
                      >
                        <Trash2 size={14} className="text-red-600" />
                      </Button>
                    </div>
                    <Field label="Texte de la clause">
                      <Textarea
                        rows={4}
                        defaultValue={clause.texte}
                        onBlur={(e) => majClause(clause.id, { texte: e.target.value })}
                      />
                    </Field>
                    <div className="mt-2">
                      <Field label="Base légale (imprimée en petit sous la clause)">
                        <Input
                          defaultValue={clause.baseLegale ?? ''}
                          onBlur={(e) =>
                            majClause(clause.id, { baseLegale: e.target.value || undefined })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void majClauses([
                      ...clauses,
                      {
                        id: uid(),
                        famille,
                        titre: 'Nouvelle clause',
                        texte: '',
                        active: false,
                      },
                    ])
                  }
                >
                  <Plus size={14} /> Ajouter une clause à cette rubrique
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
          Réinitialiser les clauses par défaut
        </Button>
      </div>

      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          await db.parametres.put({ ...parametres, clausesBail: CLAUSES_BAIL_DEFAUT });
          setVersion((v) => v + 1);
          toast('success', 'Clauses du bail réinitialisées.');
        }}
        title="Réinitialiser les clauses ?"
        message="Les textes reviennent au catalogue livré avec l'application. Vos modifications seront perdues. Les baux déjà enregistrés ne changent pas."
        confirmLabel="Réinitialiser"
        danger
      />
    </Card>
  );
}
