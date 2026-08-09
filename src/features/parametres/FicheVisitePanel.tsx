import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, ClipboardList, Eye, Plus, Trash2 } from 'lucide-react';
import type { Bien, ConditionSection, ModeleFicheVisite, SectionDossier } from '@/types';
import { CONDITION_SECTION_LABELS } from '@/types';
import { db, lireParametres } from '@/lib/db';
import { uid, nowISO } from '@/lib/ids';
import { MODELE_FICHE_VISITE_DEFAUT } from '@/lib/defauts';
import { rendrePdf } from '@/lib/pdf/generer';
import { FicheVisitePdf } from '@/lib/pdf/FicheVisitePdf';
import { ouvrirBlob } from '@/lib/backup';
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

const BLOCS: { cle: keyof ModeleFicheVisite['blocs']; label: string }[] = [
  { cle: 'conditionsFinancieres', label: 'Conditions de location (loyer, charges, dépôt, disponibilité)' },
  { cle: 'infosPratiques', label: 'Informations pratiques de la visite (date, accès, à apporter)' },
  { cle: 'coordonneesBailleur', label: 'Vos coordonnées (nom, téléphone, e-mail)' },
];

const TEXTES: { cle: 'introDossier' | 'modalitesCandidature' | 'aApporter' | 'mentions'; label: string; hint: string }[] = [
  {
    cle: 'aApporter',
    label: 'À apporter le jour de la visite',
    hint: 'Imprimé dans le bloc « Votre visite », page 1.',
  },
  {
    cle: 'introDossier',
    label: 'Introduction du dossier',
    hint: 'En tête de la page 2, avant la liste des pièces.',
  },
  {
    cle: 'modalitesCandidature',
    label: 'Comment candidater',
    hint: 'Où envoyer le dossier, sous quel format, délai de réponse, suite du parcours.',
  },
  {
    cle: 'mentions',
    label: 'Mentions de fin',
    hint: 'Non-discrimination, traitement des données, absence d’honoraires. Une ligne = un paragraphe.',
  },
];

/** Bien fictif pour l'aperçu : aucune donnée réelle n'est nécessaire. */
function bienExemple(): Bien {
  return {
    id: 'apercu',
    nom: 'Exemple',
    adresse: { ligne1: '12 rue des Prés', codePostal: '63400', ville: 'Chamalières' },
    type: 'T2',
    surfaceBoutin: 42,
    nbPieces: 2,
    etage: '2e',
    classeDPE: 'D',
    regimeJuridique: 'copropriete',
    equipementsPrivatifs: ['Cuisine équipée'],
    partiesCommunes: ['Local à vélos'],
    annexes: [{ type: 'cave', description: 'n°12' }],
    chauffage: { type: 'individuel', energie: 'électricité' },
    eauChaude: { type: 'individuel', energie: 'électricité' },
    zoneEncadrementLoyers: false,
    conditionsLocation: {
      loyerHC: 520,
      charges: { mode: 'forfait', montant: 60 },
      depotGarantie: 1040,
      dateDisponibilite: '2026-09-01',
      acces: 'Interphone, 2e étage — stationnement gratuit dans la rue',
    },
    piecesModele: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

/**
 * Modèle de la fiche de visite : blocs imprimés, textes libres et liste des
 * pièces du dossier de candidature. Même ergonomie que la grille de vétusté —
 * chaque modification est écrite directement en base (pas de bouton
 * « Enregistrer » séparé).
 */
export function FicheVisitePanel() {
  const toast = useToast();
  const parametres = useLiveQuery(() => lireParametres());
  const [confirmReset, setConfirmReset] = useState(false);
  // Les champs sont non contrôlés (écriture au `blur`, comme la grille de
  // vétusté) : après une réinitialisation, seul un remontage leur fait relire
  // les valeurs par défaut.
  const [version, setVersion] = useState(0);

  if (!parametres) return null;
  const modele = parametres.ficheVisite ?? MODELE_FICHE_VISITE_DEFAUT;

  const majModele = (m: Partial<ModeleFicheVisite>) =>
    db.parametres.put({ ...parametres, ficheVisite: { ...modele, ...m } });

  const majSections = (sections: SectionDossier[]) => majModele({ sections });

  const majSection = (i: number, m: Partial<SectionDossier>) =>
    majSections(modele.sections.map((s, j) => (j === i ? { ...s, ...m } : s)));

  const deplacer = (i: number, delta: number) => {
    const cible = i + delta;
    if (cible < 0 || cible >= modele.sections.length) return;
    const sections = [...modele.sections];
    [sections[i], sections[cible]] = [sections[cible], sections[i]];
    return majSections(sections);
  };

  const apercu = async () => {
    const blob = await rendrePdf(
      <FicheVisitePdf
        reference="APERÇU"
        bien={bienExemple()}
        parametres={parametres}
        modele={modele}
        visite={{
          date: new Date().toISOString().slice(0, 10),
          heure: '18 h 30',
          situations: ['garant_physique', 'visale', 'colocation', 'etudiant', 'independant'],
        }}
      />,
    );
    ouvrirBlob(blob, 'Aperçu - Fiche de visite.pdf');
  };

  return (
    <CarteRepliable
      identifiant="fiche-visite"
      titre="Fiche de visite"
      icone={<ClipboardList size={18} />}
      resume={`${modele.sections.length} rubrique(s) de dossier`}
    >
      <p className="mb-4 text-sm text-accent-600">
        Document remis au candidat à la fin d'une visite (généré depuis la fiche d'un bien) :
        récapitulatif du logement et de ses conditions, informations pratiques, puis liste des
        pièces du dossier en cases à cocher. Tout ce qui suit est modifiable.
      </p>

      <h3 className="mb-2 text-sm font-semibold text-accent-800">Blocs imprimés</h3>
      <div className="mb-4 space-y-1">
        {BLOCS.map((b) => (
          <Checkbox
            key={b.cle}
            label={b.label}
            checked={modele.blocs[b.cle]}
            onChange={(e) => majModele({ blocs: { ...modele.blocs, [b.cle]: e.target.checked } })}
          />
        ))}
      </div>

      <h3 className="mb-2 text-sm font-semibold text-accent-800">Textes</h3>
      <div key={`textes-${version}`} className="mb-4 space-y-4">
        {TEXTES.map((t) => (
          <Field key={t.cle} label={t.label} hint={t.hint}>
            <Textarea
              defaultValue={modele[t.cle]}
              onBlur={(e) => majModele({ [t.cle]: e.target.value } as Partial<ModeleFicheVisite>)}
            />
          </Field>
        ))}
      </div>

      <h3 className="mb-1 text-sm font-semibold text-accent-800">Pièces du dossier de candidature</h3>
      <p className="mb-3 text-xs text-accent-500">
        Les sections dont la condition n'est pas « Toujours » ne s'impriment que si la situation
        est cochée à la génération. La liste des pièces exigibles est{' '}
        <span className="font-medium">limitative</span> (décret n°2015-1437) : n'ajoutez pas une
        pièce qui n'y figure pas.
      </p>

      <div key={`sections-${version}`} className="space-y-3">
        {modele.sections.map((section, i) => (
          <div key={section.id} className="rounded-lg border border-accent-200 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1">
                <Field label="Titre de la section">
                  <Input
                    defaultValue={section.titre}
                    onBlur={(e) => majSection(i, { titre: e.target.value })}
                  />
                </Field>
              </div>
              <div className="min-w-[12rem] flex-1">
                <Field label="Note (facultative)">
                  <Input
                    defaultValue={section.note ?? ''}
                    onBlur={(e) => majSection(i, { note: e.target.value || undefined })}
                  />
                </Field>
              </div>
              <div className="min-w-[10rem]">
                <Field label="Imprimée si">
                  <Select
                    value={section.condition}
                    onChange={(e) => majSection(i, { condition: e.target.value as ConditionSection })}
                  >
                    {(Object.keys(CONDITION_SECTION_LABELS) as ConditionSection[]).map((c) => (
                      <option key={c} value={c}>
                        {CONDITION_SECTION_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex gap-1 pb-1">
                <Button variant="ghost" size="sm" aria-label="Monter" onClick={() => void deplacer(i, -1)}>
                  <ArrowUp size={14} />
                </Button>
                <Button variant="ghost" size="sm" aria-label="Descendre" onClick={() => void deplacer(i, 1)}>
                  <ArrowDown size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Supprimer la section"
                  onClick={() => void majSections(modele.sections.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} className="text-red-600" />
                </Button>
              </div>
            </div>

            <ul className="mt-2 space-y-2">
              {section.pieces.map((piece, k) => (
                <li key={piece.id} className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    label=""
                    aria-label={`Imprimer « ${piece.libelle} »`}
                    checked={piece.actif}
                    onChange={(e) =>
                      majSection(i, {
                        pieces: section.pieces.map((p, j) =>
                          j === k ? { ...p, actif: e.target.checked } : p,
                        ),
                      })
                    }
                  />
                  <Input
                    className="min-w-[14rem] flex-1"
                    defaultValue={piece.libelle}
                    onBlur={(e) =>
                      majSection(i, {
                        pieces: section.pieces.map((p, j) =>
                          j === k ? { ...p, libelle: e.target.value } : p,
                        ),
                      })
                    }
                  />
                  <Input
                    className="min-w-[12rem] flex-1"
                    placeholder="Précision (facultative)"
                    defaultValue={piece.precision ?? ''}
                    onBlur={(e) =>
                      majSection(i, {
                        pieces: section.pieces.map((p, j) =>
                          j === k ? { ...p, precision: e.target.value || undefined } : p,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Supprimer la pièce"
                    onClick={() =>
                      void majSection(i, { pieces: section.pieces.filter((_, j) => j !== k) })
                    }
                  >
                    <Trash2 size={14} className="text-red-600" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() =>
                void majSection(i, {
                  pieces: [...section.pieces, { id: uid(), libelle: 'Nouvelle pièce', actif: true }],
                })
              }
            >
              <Plus size={14} /> Ajouter une pièce
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            void majSections([
              ...modele.sections,
              { id: uid(), titre: 'Nouvelle section', condition: 'toujours', pieces: [] },
            ])
          }
        >
          <Plus size={14} /> Ajouter une section
        </Button>
        <Button size="sm" onClick={() => void apercu()}>
          <Eye size={14} /> Aperçu (PDF)
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
          Réinitialiser le modèle par défaut
        </Button>
      </div>

      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={async () => {
          await db.parametres.put({ ...parametres, ficheVisite: MODELE_FICHE_VISITE_DEFAUT });
          setVersion((v) => v + 1);
          toast('success', 'Modèle de fiche de visite réinitialisé.');
        }}
        title="Réinitialiser la fiche de visite ?"
        message="Les textes et la liste des pièces reviennent au modèle par défaut (décret n°2015-1437). Vos modifications seront perdues."
        confirmLabel="Réinitialiser"
        danger
      />
    </CarteRepliable>
  );
}
