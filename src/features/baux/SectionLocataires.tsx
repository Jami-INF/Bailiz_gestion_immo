import { FileDown, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import type { Locataire, SaisieBail } from '@/types';
import { Button, Checkbox, Field, Input, Section, Select } from '@/components/ui';

/**
 * Section « Locataire(s) » du formulaire de bail. Chaque locataire provient
 * d'une fiche enregistrée : la saisie se fait exclusivement via le formulaire
 * locataire partagé (modale), jamais dupliquée ici. Un emplacement laissé vide
 * reste imprimable - le PDF affiche alors des zones à compléter à la main.
 */
export function SectionLocataires({
  saisie,
  locatairesEnr,
  coloc,
  maj,
  majLoc,
  onCreerLocataire,
  onModifierLocataire,
  onTelechargerActe,
}: {
  saisie: SaisieBail;
  locatairesEnr: Locataire[];
  coloc: boolean;
  maj: (m: Partial<SaisieBail>) => void;
  majLoc: (i: number, m: Partial<SaisieBail['locataires'][number]>) => void;
  /** Ouvre la modale de création d'un locataire pour la ligne `i`. */
  onCreerLocataire: (i: number) => void;
  /** Ouvre la modale d'édition de la fiche du locataire de la ligne `i`. */
  onModifierLocataire: (i: number) => void;
  /** Génère l'acte de cautionnement du garant de la ligne `i`. */
  onTelechargerActe: (i: number) => void;
}) {
  return (
    <Section
      titre="Locataire(s)"
      description="Choisissez une fiche existante ou créez-la : elle sera réutilisable pour vos prochains baux."
    >
      {saisie.locataires.map((l, i) => {
        const enr = l.id ? locatairesEnr.find((x) => x.id === l.id) : undefined;
        return (
          <div key={i} className="space-y-3 rounded-lg border border-accent-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-accent-800">
                {coloc ? `Locataire ${i + 1}` : 'Locataire'}
              </span>
              {saisie.locataires.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => maj({ locataires: saisie.locataires.filter((_, idx) => idx !== i) })}
                >
                  <Trash2 size={16} /> Retirer
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Field label="Fiche locataire">
                  <Select value={l.id ?? ''} onChange={(e) => majLoc(i, { id: e.target.value || undefined })}>
                    <option value="">- Aucun locataire sélectionné -</option>
                    {locatairesEnr.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.civilite} {x.prenom} {x.nom}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button variant="secondary" onClick={() => onCreerLocataire(i)} className="shrink-0">
                <UserPlus size={16} /> Nouveau locataire
              </Button>
            </div>

            {enr ? (
              <div className="rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
                <div className="flex items-start gap-3">
                  <Users size={18} className="mt-0.5 shrink-0 text-accent-500" />
                  <div className="min-w-0">
                    <div className="font-medium text-accent-900">
                      {enr.civilite} {enr.prenom} {enr.nom}
                    </div>
                    <div className="break-words">
                      {enr.email}
                      {enr.telephone ? ` · ${enr.telephone}` : ''}
                      {enr.garant ? ' · avec garant' : ''}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => onModifierLocataire(i)}>
                    <Pencil size={14} /> Modifier la fiche
                  </Button>
                  {enr.garant && enr.garant.type !== 'visale' && (
                    <Button variant="secondary" size="sm" onClick={() => onTelechargerActe(i)}>
                      <FileDown size={14} /> Acte de cautionnement
                    </Button>
                  )}
                </div>
                {enr.garant && enr.garant.type === 'visale' && (
                  <p className="mt-2 text-xs text-accent-600">
                    Garantie Visale : contrat de cautionnement à activer sur votre espace bailleur
                    visale.fr avec le visa transmis par le locataire - rien à générer ici.
                  </p>
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-accent-300 p-3 text-sm text-accent-500">
                Aucun locataire sélectionné : le bail s'imprimera avec des zones à compléter à la
                main. Choisissez une fiche ci-dessus, ou créez-la.
              </p>
            )}
          </div>
        );
      })}

      <Button variant="secondary" onClick={() => maj({ locataires: [...saisie.locataires, {}] })}>
        <Plus size={16} /> Ajouter un colocataire
      </Button>

      {coloc && (
        <div className="space-y-3 rounded-lg bg-accent-50 p-4">
          <Checkbox
            label="Insérer une clause de solidarité entre colocataires (recommandé)"
            checked={saisie.clauseSolidarite}
            onChange={(e) => maj({ clauseSolidarite: e.target.checked })}
          />
          <Field
            label="Assurance souscrite par le bailleur pour les colocataires - montant annuel (€)"
            hint="Laissez vide si les colocataires s'assurent eux-mêmes."
          >
            <Input
              type="number"
              step="0.01"
              min="0"
              value={saisie.assuranceMontantAnnuel ?? ''}
              onChange={(e) =>
                maj({ assuranceMontantAnnuel: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </Field>
        </div>
      )}
    </Section>
  );
}
