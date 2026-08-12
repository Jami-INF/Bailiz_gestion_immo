import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, UserRound } from 'lucide-react';
import { db, getParametres } from '@/lib/db';
import { bailleurRenseigne, nomBailleur } from '@/lib/bailleur';
import type { Bailleur, Parametres, PersonneBailleur, QualiteBailleur } from '@/types';
import { QUALITE_BAILLEUR_LABELS } from '@/types';
import { Button, CarteRepliable, Field, Input, Select, useToast } from '@/components/ui';

const QUALITES: QualiteBailleur[] = ['personne_physique', 'indivision', 'personne_morale'];

function personneVide(): PersonneBailleur {
  return { civilite: 'M', nom: '', prenom: '' };
}

/** Trois champs civilité / prénom / nom, réutilisés pour chaque personne. */
function ChampsPersonne({
  personne,
  onChange,
  prefixe,
}: {
  personne: PersonneBailleur;
  onChange: (m: Partial<PersonneBailleur>) => void;
  prefixe: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Field label={`${prefixe} - civilité`}>
        <Select value={personne.civilite} onChange={(e) => onChange({ civilite: e.target.value })}>
          <option value="M">M.</option>
          <option value="Mme">Mme</option>
        </Select>
      </Field>
      <Field label={`${prefixe} - prénom`}>
        <Input value={personne.prenom} onChange={(e) => onChange({ prenom: e.target.value })} />
      </Field>
      <Field label={`${prefixe} - nom`}>
        <Input value={personne.nom} onChange={(e) => onChange({ nom: e.target.value })} />
      </Field>
    </div>
  );
}

/**
 * Identité du bailleur.
 *
 * Trois qualités possibles, et ce n'est pas un détail de présentation : un
 * logement détenu en indivision loué au nom d'un seul indivisaire expose le bail
 * à la contestation des autres, et une société doit être désignée au contrat par
 * sa dénomination, sa forme, son capital, son RCS et son représentant légal.
 * Jusqu'ici l'application ne savait décrire qu'un bailleur personne physique
 * unique - beaucoup de LMNP sont détenus à deux.
 */
export function BailleurPanel({ parametres }: { parametres: Parametres }) {
  const toast = useToast();
  const [bailleur, setBailleur] = useState<Bailleur | null>(null);

  useEffect(() => {
    void getParametres().then((p) => setBailleur(p.bailleur));
  }, []);

  if (!bailleur) return null;

  const maj = (m: Partial<Bailleur>) => setBailleur((b) => ({ ...b!, ...m }));
  const indivisaires = bailleur.coIndivisaires ?? [];
  const majIndivisaire = (i: number, m: Partial<PersonneBailleur>) =>
    maj({ coIndivisaires: indivisaires.map((p, j) => (j === i ? { ...p, ...m } : p)) });

  const enregistrer = async () => {
    await db.parametres.put({ ...parametres, bailleur });
    toast('success', 'Identité du bailleur enregistrée.');
  };

  const renseigne = bailleurRenseigne(bailleur);
  const morale = bailleur.qualite === 'personne_morale';
  const indivision = bailleur.qualite === 'indivision';

  return (
    <CarteRepliable
      identifiant="bailleur"
      titre="Bailleur"
      icone={<UserRound size={18} />}
      resume={renseigne ? nomBailleur(bailleur) : 'Non renseigné - obligatoire pour produire un document'}
      resumeAlerte={!renseigne}
      defautOuvert={!renseigne}
    >
      <Field
        label="Qualité du bailleur"
        hint="Elle détermine la désignation des parties au contrat (partie I du bail)."
      >
        <Select
          value={bailleur.qualite}
          onChange={(e) => maj({ qualite: e.target.value as QualiteBailleur })}
        >
          {QUALITES.map((q) => (
            <option key={q} value={q}>
              {QUALITE_BAILLEUR_LABELS[q]}
            </option>
          ))}
        </Select>
      </Field>

      {morale ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Forme juridique">
              <Input
                value={bailleur.formeJuridique ?? ''}
                onChange={(e) => maj({ formeJuridique: e.target.value || undefined })}
                placeholder="SCI"
              />
            </Field>
            <Field label="Dénomination">
              <Input
                value={bailleur.denomination ?? ''}
                onChange={(e) => maj({ denomination: e.target.value || undefined })}
                placeholder="Les Tilleuls"
              />
            </Field>
            <Field label="Capital social (€)">
              <Input
                type="number"
                value={bailleur.capitalSocial ?? ''}
                onChange={(e) => maj({ capitalSocial: Number(e.target.value) || undefined })}
                placeholder="1000"
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field
              label="Ville du RCS"
              hint="Greffe d'immatriculation - imprimé « immatriculée au RCS de … »."
            >
              <Input
                value={bailleur.villeRCS ?? ''}
                onChange={(e) => maj({ villeRCS: e.target.value || undefined })}
                placeholder="Clermont-Ferrand"
              />
            </Field>
          </div>
          <p className="mt-4 text-sm font-medium text-accent-800">Représentant légal</p>
          <p className="mb-2 text-xs text-accent-500">
            Une société ne signe pas : son gérant ou son président signe pour elle, et sa qualité
            doit figurer au contrat.
          </p>
          <ChampsPersonne
            personne={bailleur.representant ?? personneVide()}
            prefixe="Représentant"
            onChange={(m) =>
              maj({
                representant: {
                  ...(bailleur.representant ?? { ...personneVide(), fonction: 'gérant' }),
                  ...m,
                },
              })
            }
          />
          <div className="mt-4">
            <Field label="Fonction du représentant">
              <Input
                value={bailleur.representant?.fonction ?? ''}
                onChange={(e) =>
                  maj({
                    representant: {
                      ...(bailleur.representant ?? personneVide()),
                      fonction: e.target.value,
                    },
                  })
                }
                placeholder="gérant"
              />
            </Field>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4">
            <ChampsPersonne
              personne={bailleur}
              prefixe={indivision ? 'Premier indivisaire' : 'Bailleur'}
              onChange={maj}
            />
          </div>
          {indivision && (
            <div className="mt-4 space-y-4">
              <p className="text-xs text-accent-500">
                Tous les indivisaires doivent figurer au bail : ils donnent à bail ensemble, et le
                congé comme la restitution du dépôt relèvent de leur décision commune.
              </p>
              {indivisaires.map((p, i) => (
                <div key={i} className="rounded-lg border border-accent-200 p-3">
                  <ChampsPersonne
                    personne={p}
                    prefixe={`Indivisaire ${i + 2}`}
                    onChange={(m) => majIndivisaire(i, m)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => maj({ coIndivisaires: indivisaires.filter((_, j) => j !== i) })}
                  >
                    <Trash2 size={14} className="text-red-600" />
                    <span className="text-red-600">Retirer cet indivisaire</span>
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => maj({ coIndivisaires: [...indivisaires, personneVide()] })}
              >
                <Plus size={14} /> Ajouter un indivisaire
              </Button>
            </div>
          )}
        </>
      )}

      <p className="mb-4 mt-4 text-xs text-accent-500">
        Ces informations figurent sur tous les documents générés (bail, états des lieux,
        courriers) : renseignez-les avant de créer votre premier bail.
      </p>

      <Field label={morale ? 'Adresse du siège social' : 'Adresse complète'}>
        <Input
          value={bailleur.adresse}
          onChange={(e) => maj({ adresse: e.target.value })}
          placeholder="5 place de Jaude, 63000 Clermont-Ferrand"
        />
      </Field>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="E-mail">
          <Input
            type="email"
            value={bailleur.email}
            onChange={(e) => maj({ email: e.target.value })}
            placeholder="jean.martin@exemple.fr"
          />
        </Field>
        <Field label="Téléphone">
          <Input
            type="tel"
            value={bailleur.telephone}
            onChange={(e) => maj({ telephone: e.target.value })}
            placeholder="06 12 34 56 78"
          />
        </Field>
        <Field
          label={morale ? 'SIRET (optionnel)' : 'SIRET LMNP (optionnel)'}
          hint={
            morale
              ? "Numéro à 14 chiffres de la société. Affiché sur le bail si renseigné."
              : "Numéro à 14 chiffres obtenu à l'immatriculation LMNP (INPI). Affiché sur le bail si renseigné."
          }
        >
          <Input
            value={bailleur.siret ?? ''}
            onChange={(e) => maj({ siret: e.target.value || undefined })}
            placeholder="123 456 789 00012"
            inputMode="numeric"
          />
        </Field>
      </div>

      <div className="mt-4 rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
        <span className="font-medium">Au contrat :</span> {nomBailleur(bailleur) || '-'}
      </div>

      <div className="mt-4">
        <Button onClick={() => void enregistrer()}>
          <Save size={16} /> Enregistrer
        </Button>
      </div>
    </CarteRepliable>
  );
}
