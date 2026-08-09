import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Plus, ScrollText, Trash2 } from 'lucide-react';
import type { ClauseBail, FamilleClause } from '@/types';
import { FAMILLE_CLAUSE_LABELS } from '@/types';
import { db, lireParametres } from '@/lib/db';
import { uid } from '@/lib/ids';
import { CLAUSES_BAIL_DEFAUT } from '@/lib/defauts';
import {
  Button,
  CarteRepliable,
  Checkbox,
  ConfirmModal,
  Field,
  Input,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';

const FAMILLES: FamilleClause[] = ['occupation', 'entretien', 'assurance', 'immeuble'];

const CONDITIONS: { valeur: string; label: string }[] = [
  { valeur: '', label: 'Toujours proposée' },
  { valeur: 'copropriete', label: 'Logement en copropriété' },
  { valeur: 'servitude_residence_principale', label: 'Servitude de résidence principale' },
];

const LIBELLE_CONDITION: Record<string, string> = {
  copropriete: 'Si copropriété',
  servitude_residence_principale: 'Si servitude',
};

/**
 * Une clause, réduite à sa ligne : coche « proposée par défaut », titre, et
 * condition éventuelle. Le texte ne s'ouvre qu'à la demande.
 *
 * C'est l'inversion qui rend la liste utilisable : le geste courant est de
 * cocher ou décocher, le geste rare est de récrire un texte de loi. Les
 * déplier tous les vingt-cinq donnait vingt mille pixels pour l'action qu'on
 * ne fait presque jamais.
 *
 * La coche est **hors** du bouton de dépliage : imbriquer un contrôle dans un
 * autre rendrait un simple cochage imprévisible — on ne saurait jamais si l'on
 * vient aussi d'ouvrir la clause.
 */
function LigneClause({
  clause,
  onChange,
  onSupprimer,
}: {
  clause: ClauseBail;
  onChange: (m: Partial<ClauseBail>) => void;
  onSupprimer: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const condition = clause.condition ? LIBELLE_CONDITION[clause.condition] : null;

  return (
    <div className="rounded-lg border border-accent-200">
      <div className="flex items-center gap-2 px-3 py-2">
        <Checkbox
          label=""
          aria-label={`Proposer « ${clause.titre} » par défaut`}
          checked={clause.active}
          onChange={(e) => onChange({ active: e.target.checked })}
        />
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-expanded={ouvert}
          className="flex min-h-touch min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1 truncate text-sm text-accent-900">
            {clause.titre || <span className="italic text-accent-400">Sans titre</span>}
          </span>
          {condition && (
            <span className="shrink-0 rounded-full bg-accent-100 px-2 py-0.5 text-xs text-accent-600">
              {condition}
            </span>
          )}
          <ChevronDown
            size={16}
            aria-hidden
            className={`shrink-0 text-accent-400 transition-transform ${ouvert ? '' : '-rotate-90'}`}
          />
        </button>
      </div>

      {ouvert && (
        <div className="space-y-3 border-t border-accent-200 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1">
              <Field label="Titre">
                <Input
                  defaultValue={clause.titre}
                  onBlur={(e) => onChange({ titre: e.target.value })}
                />
              </Field>
            </div>
            <div className="min-w-[12rem]">
              <Field label="Proposée si">
                <Select
                  value={clause.condition ?? ''}
                  onChange={(e) =>
                    onChange({
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
          </div>
          <Field label="Texte de la clause">
            <Textarea rows={4} defaultValue={clause.texte} onBlur={(e) => onChange({ texte: e.target.value })} />
          </Field>
          <Field label="Base légale (imprimée en petit sous la clause)">
            <Input
              defaultValue={clause.baseLegale ?? ''}
              onBlur={(e) => onChange({ baseLegale: e.target.value || undefined })}
            />
          </Field>
          <Button variant="ghost" size="sm" onClick={onSupprimer}>
            <Trash2 size={14} className="text-red-600" /> Supprimer cette clause
          </Button>
        </div>
      )}
    </div>
  );
}

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
  const actives = clauses.filter((c) => c.active).length;

  const majClauses = (liste: ClauseBail[]) => db.parametres.put({ ...parametres, clausesBail: liste });
  const majClause = (id: string, m: Partial<ClauseBail>) =>
    majClauses(clauses.map((c) => (c.id === id ? { ...c, ...m } : c)));

  return (
    <CarteRepliable
      identifiant="clauses"
      titre="Clauses du bail"
      icone={<ScrollText size={18} />}
      resume={`${clauses.length} clauses · ${actives} proposées par défaut`}
    >
      <p className="mb-3 text-sm text-accent-600">
        Ces clauses forment la partie « Conditions générales d'occupation » du bail. Les clauses
        cochées sont proposées d'office à chaque nouveau bail ; vous pouvez en retirer au cas par
        cas au moment de la rédaction. Un bail déjà enregistré garde le texte avec lequel il a été
        imprimé. Dépliez une clause pour en modifier le texte.
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
          const activesGroupe = groupe.filter((c) => c.active).length;
          return (
            <div key={famille}>
              <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-accent-800">
                {FAMILLE_CLAUSE_LABELS[famille]}
                <span className="text-xs font-normal text-accent-500">
                  {activesGroupe}/{groupe.length}
                </span>
              </h3>
              <div className="space-y-1.5">
                {groupe.map((clause) => (
                  <LigneClause
                    key={clause.id}
                    clause={clause}
                    onChange={(m) => void majClause(clause.id, m)}
                    onSupprimer={() => void majClauses(clauses.filter((c) => c.id !== clause.id))}
                  />
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void majClauses([
                      ...clauses,
                      { id: uid(), famille, titre: 'Nouvelle clause', texte: '', active: false },
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
    </CarteRepliable>
  );
}
