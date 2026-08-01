import { FileDown, Plus, Trash2, Users } from 'lucide-react';
import type { Garant, Locataire, SaisieBail } from '@/types';
import { Button, Checkbox, DateInput, Field, Input, Section, Select } from '@/components/ui';

/**
 * Section « Locataire(s) » du formulaire de bail : chaque locataire est soit
 * choisi parmi les fiches enregistrées, soit saisi directement ici, avec son
 * garant éventuel. Extraite du formulaire pour en garder la lecture praticable.
 */
export function SectionLocataires({
  saisie,
  locatairesEnr,
  coloc,
  maj,
  majLoc,
  onCreerLocataire,
  onTelechargerActe,
}: {
  saisie: SaisieBail;
  locatairesEnr: Locataire[];
  coloc: boolean;
  maj: (m: Partial<SaisieBail>) => void;
  majLoc: (i: number, m: Partial<SaisieBail['locataires'][number]>) => void;
  /** Ouvre la modale de création d'un locataire pour la ligne `i`. */
  onCreerLocataire: (i: number) => void;
  /** Génère l'acte de cautionnement du garant de la ligne `i`. */
  onTelechargerActe: (i: number) => void;
}) {
  return (
          <Section titre="Locataire(s)" description="Chaque locataire peut être choisi parmi les enregistrés, ou saisi ici.">
            {saisie.locataires.map((l, i) => {
              const enr = l.id ? locatairesEnr.find((x) => x.id === l.id) : undefined;
              return (
                <div key={i} className="space-y-4 rounded-lg border border-accent-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-accent-800">{coloc ? `Locataire ${i + 1}` : 'Locataire'}</span>
                    {saisie.locataires.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => maj({ locataires: saisie.locataires.filter((_, idx) => idx !== i) })}>
                        <Trash2 size={16} /> Retirer
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <Field label="Locataire">
                        <Select value={l.id ?? ''} onChange={(e) => majLoc(i, { id: e.target.value || undefined })}>
                          <option value="">— Saisir ici —</option>
                          {locatairesEnr.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.civilite} {x.prenom} {x.nom}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Button variant="secondary" onClick={() => onCreerLocataire(i)} className="shrink-0">
                      <Plus size={16} /> Créer un locataire
                    </Button>
                  </div>
                  {enr ? (
                    <div className="rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
                      <div className="flex items-start gap-3">
                        <Users size={18} className="mt-0.5 shrink-0 text-accent-500" />
                        <div>
                          <div className="font-medium text-accent-900">
                            {enr.civilite} {enr.prenom} {enr.nom}
                          </div>
                          {enr.email}
                          {enr.telephone ? ` · ${enr.telephone}` : ''}
                          {enr.garant ? ' · avec garant' : ''}
                        </div>
                      </div>
                      {enr.garant && enr.garant.type !== 'visale' && (
                        <Button variant="secondary" size="sm" className="mt-3" onClick={() => onTelechargerActe(i)}>
                          <FileDown size={14} /> Télécharger le modèle vierge d'acte de cautionnement
                        </Button>
                      )}
                      {enr.garant && enr.garant.type === 'visale' && (
                        <p className="mt-3 text-xs text-accent-600">
                          Garantie Visale : contrat de cautionnement à activer sur votre espace bailleur
                          visale.fr avec le visa transmis par le locataire — rien à générer ici.
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Field label="Civilité" required>
                          <Select value={l.civilite ?? 'M'} onChange={(e) => majLoc(i, { civilite: e.target.value as 'M' | 'Mme' })}>
                            <option value="M">M.</option>
                            <option value="Mme">Mme</option>
                          </Select>
                        </Field>
                        <Field label="Prénom" required>
                          <Input value={l.prenom ?? ''} onChange={(e) => majLoc(i, { prenom: e.target.value })} />
                        </Field>
                        <Field label="Nom" required>
                          <Input value={l.nom ?? ''} onChange={(e) => majLoc(i, { nom: e.target.value })} />
                        </Field>
                        <Field label="Téléphone">
                          <Input value={l.telephone ?? ''} onChange={(e) => majLoc(i, { telephone: e.target.value })} />
                        </Field>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <Field label="Email">
                          <Input type="email" value={l.email ?? ''} onChange={(e) => majLoc(i, { email: e.target.value })} />
                        </Field>
                        <Field label="Date de naissance">
                          <DateInput value={l.dateNaissance ?? ''} onChange={(iso) => majLoc(i, { dateNaissance: iso || undefined })} />
                        </Field>
                        <Field label="Lieu de naissance">
                          <Input value={l.lieuNaissance ?? ''} onChange={(e) => majLoc(i, { lieuNaissance: e.target.value })} />
                        </Field>
                      </div>
                      <Field label="Adresse actuelle (optionnel)" hint="Domicile du locataire avant l'entrée dans les lieux.">
                        <Input value={l.adresseActuelle ?? ''} onChange={(e) => majLoc(i, { adresseActuelle: e.target.value })} />
                      </Field>

                      <div className="space-y-3 rounded-lg border border-accent-200 bg-accent-50 p-3">
                        <Checkbox
                          label="Ce locataire a un garant (caution)"
                          checked={!!l.garant}
                          onChange={(e) =>
                            majLoc(i, {
                              garant: e.target.checked ? { type: 'physique', nom: '', prenom: '', adresse: '' } : undefined,
                            })
                          }
                        />
                        {l.garant && (
                          <>
                            <Field label="Type de garantie">
                              <Select
                                value={l.garant.type}
                                onChange={(e) => majLoc(i, { garant: { ...l.garant!, type: e.target.value as Garant['type'] } })}
                              >
                                <option value="physique">Personne physique (caution)</option>
                                <option value="visale">Garantie Visale</option>
                                <option value="autre">Autre</option>
                              </Select>
                            </Field>
                            {l.garant.type !== 'visale' ? (
                              <>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Field label="Prénom du garant" required>
                                    <Input value={l.garant.prenom} onChange={(e) => majLoc(i, { garant: { ...l.garant!, prenom: e.target.value } })} />
                                  </Field>
                                  <Field label="Nom du garant" required>
                                    <Input value={l.garant.nom} onChange={(e) => majLoc(i, { garant: { ...l.garant!, nom: e.target.value } })} />
                                  </Field>
                                </div>
                                <Field label="Adresse du garant (optionnel)" hint="Peut être complétée à la main sur l'acte imprimé.">
                                  <Input value={l.garant.adresse} onChange={(e) => majLoc(i, { garant: { ...l.garant!, adresse: e.target.value } })} />
                                </Field>
                                <Button variant="secondary" size="sm" onClick={() => onTelechargerActe(i)}>
                                  <FileDown size={14} /> Télécharger le modèle vierge d'acte de cautionnement
                                </Button>
                                <p className="text-xs text-accent-500">
                                  Modèle vierge, à compléter et signer à la main après impression. Les pièces du garant (avis d'impôt, 3 dernières fiches de paie, pièce d'identité, justificatif de domicile) sont ajoutées à la liste des documents à remettre, dans le bail.
                                </p>
                              </>
                            ) : (
                              <>
                                <Field label="Numéro de visa Visale (optionnel)" hint="Fourni par le locataire depuis son espace visale.fr.">
                                  <Input value={l.garant.numeroVisa ?? ''} onChange={(e) => majLoc(i, { garant: { ...l.garant!, numeroVisa: e.target.value } })} />
                                </Field>
                                <p className="text-xs text-accent-600">
                                  Aucun acte à rédiger : le locataire obtient un <strong>visa certifié</strong> sur
                                  visale.fr (valable 3 mois, 6 pour étudiants/alternants/service civique) et vous le
                                  transmet. Vous <strong>activez le contrat de cautionnement</strong> depuis votre
                                  propre espace bailleur sur visale.fr, avant la signature du bail — le contrat est
                                  alors émis directement par Action Logement, gratuitement.
                                </p>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <Button variant="secondary" onClick={() => maj({ locataires: [...saisie.locataires, { civilite: 'M' }] })}>
              <Plus size={16} /> Ajouter un colocataire
            </Button>
            {coloc && (
              <div className="space-y-3 rounded-lg bg-accent-50 p-4">
                <Checkbox
                  label="Insérer une clause de solidarité entre colocataires (recommandé)"
                  checked={saisie.clauseSolidarite}
                  onChange={(e) => maj({ clauseSolidarite: e.target.checked })}
                />
                <Field label="Assurance souscrite par le bailleur pour les colocataires — montant annuel (€)" hint="Laissez vide si les colocataires s'assurent eux-mêmes.">
                  <Input type="number" step="0.01" min="0" value={saisie.assuranceMontantAnnuel ?? ''} onChange={(e) => maj({ assuranceMontantAnnuel: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </Field>
              </div>
            )}
          </Section>
  );
}
