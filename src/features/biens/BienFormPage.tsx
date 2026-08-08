import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { AlertTriangle } from 'lucide-react';
import type { Bien, ClasseDPE, ConditionsLocation, PeriodeConstruction, TypeBien } from '@/types';
import { PERIODE_CONSTRUCTION_LABELS } from '@/types';
import { formatEuros, validerDecenceDPE } from '@/lib/calculs';
import { db } from '@/lib/db';
import { uid, nowISO } from '@/lib/ids';
import {
  Button,
  Card,
  Checkbox,
  DateInput,
  Field,
  Input,
  PageHeader,
  Select,
  Stepper,
  Textarea,
  useToast,
} from '@/components/ui';
import { PhotoBien } from './PhotoBien';
import { PiecesEditeur } from './PiecesEditeur';

const ETAPES = ['Identité', 'Surfaces & équipements', 'Dossier technique', 'Location & visite', 'Pièces'];

const schemaIdentite = z.object({
  nom: z.string().min(1, 'Le nom du bien est requis'),
  ligne1: z.string().min(1, "L'adresse est requise"),
  codePostal: z.string().regex(/^\d{5}$/, 'Code postal à 5 chiffres'),
  ville: z.string().min(1, 'La ville est requise'),
});

const schemaSurfaces = z.object({
  surfaceBoutin: z.number().positive('Surface loi Boutin requise (m²)'),
  nbPieces: z.number().int().positive('Nombre de pièces requis'),
});

function bienVide(): Bien {
  return {
    id: uid(),
    nom: '',
    adresse: { ligne1: '', codePostal: '', ville: '' },
    type: 'T2',
    surfaceBoutin: 0,
    nbPieces: 1,
    regimeJuridique: 'copropriete',
    equipementsPrivatifs: [],
    partiesCommunes: [],
    annexes: [],
    chauffage: { type: 'individuel', energie: 'électricité' },
    eauChaude: { type: 'individuel', energie: 'électricité' },
    zoneEncadrementLoyers: false,
    piecesModele: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

function parserAnnexes(texte: string): Bien['annexes'] {
  return texte
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((ligne) => {
      const [type, ...desc] = ligne.split(':');
      const t = type.trim().toLowerCase();
      return {
        type: (['cave', 'parking', 'grenier'].includes(t) ? t : 'autre') as
          | 'cave'
          | 'parking'
          | 'grenier'
          | 'autre',
        description: desc.join(':').trim() || ligne,
      };
    });
}

export function BienFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [etape, setEtape] = useState(0);
  const [bien, setBien] = useState<Bien>(bienVide);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [charge, setCharge] = useState(!id);
  // Les listes saisies en texte libre restent des chaînes brutes pendant l'édition
  // (un textarea contrôlé par un join/split mangerait les retours à la ligne),
  // et ne sont converties en listes qu'à l'enregistrement.
  const [textes, setTextes] = useState({ equipements: '', communs: '', annexes: '' });

  useEffect(() => {
    if (!id) return;
    void db.biens.get(id).then((b) => {
      if (b) {
        setBien(b);
        setTextes({
          equipements: b.equipementsPrivatifs.join('\n'),
          communs: b.partiesCommunes.join('\n'),
          annexes: b.annexes.map((a) => `${a.type} : ${a.description}`).join('\n'),
        });
      }
      setCharge(true);
    });
  }, [id]);

  if (!charge) return null;

  const maj = (m: Partial<Bien>) => setBien((b) => ({ ...b, ...m }));
  const cond = bien.conditionsLocation ?? {};
  const majCond = (m: Partial<ConditionsLocation>) =>
    setBien((b) => ({ ...b, conditionsLocation: { ...b.conditionsLocation, ...m } }));

  const validerEtape = (): boolean => {
    setErreurs({});
    if (etape === 0) {
      const res = schemaIdentite.safeParse({
        nom: bien.nom,
        ligne1: bien.adresse.ligne1,
        codePostal: bien.adresse.codePostal,
        ville: bien.adresse.ville,
      });
      if (!res.success) {
        setErreurs(Object.fromEntries(res.error.issues.map((i) => [String(i.path[0]), i.message])));
        return false;
      }
    }
    if (etape === 1) {
      const res = schemaSurfaces.safeParse({
        surfaceBoutin: bien.surfaceBoutin,
        nbPieces: bien.nbPieces,
      });
      if (!res.success) {
        setErreurs(Object.fromEntries(res.error.issues.map((i) => [String(i.path[0]), i.message])));
        return false;
      }
      if (bien.zoneEncadrementLoyers && !bien.loyerReferenceMajore) {
        setErreurs({ loyerReferenceMajore: 'Renseignez le loyer de référence majoré' });
        return false;
      }
    }
    return true;
  };

  const suivant = () => {
    if (!validerEtape()) return;
    if (etape < ETAPES.length - 1) setEtape(etape + 1);
  };

  const textToListe = (t: string) => t.split('\n').map((s) => s.trim()).filter(Boolean);

  const enregistrer = async () => {
    if (!validerEtape()) return;
    await db.biens.put({
      ...bien,
      equipementsPrivatifs: textToListe(textes.equipements),
      partiesCommunes: textToListe(textes.communs),
      annexes: parserAnnexes(textes.annexes),
      updatedAt: nowISO(),
    });
    toast('success', id ? 'Bien mis à jour.' : 'Bien créé.');
    navigate(`/biens/${bien.id}`);
  };

  return (
    <div>
      <PageHeader titre={id ? `Modifier — ${bien.nom}` : 'Nouveau bien'} />
      <div className="mb-6">
        <Stepper etapes={ETAPES} courante={etape} />
      </div>
      <Card className="space-y-4">
        {etape === 0 && (
          <>
            <Field
              label="Nom du bien"
              required
              error={erreurs.nom}
              hint="Petit nom interne pour vous y retrouver — il n'apparaît pas sur les documents officiels."
            >
              <Input
                value={bien.nom}
                onChange={(e) => maj({ nom: e.target.value })}
                placeholder="T2 Chamalières"
              />
            </Field>
            <Field
              label="Photo du logement"
              hint="Une photo d'illustration : elle s'affiche sur la fiche du bien et en tête de la fiche de visite. Compressée automatiquement."
            >
              <PhotoBien
                bienId={bien.id}
                photoId={bien.photoId}
                onChange={(photoId) => maj({ photoId })}
              />
            </Field>
            <Field label="Adresse" required error={erreurs.ligne1}>
              <Input
                value={bien.adresse.ligne1}
                onChange={(e) => maj({ adresse: { ...bien.adresse, ligne1: e.target.value } })}
                placeholder="12 rue des Prés"
              />
            </Field>
            <Field label="Complément d'adresse">
              <Input
                value={bien.adresse.ligne2 ?? ''}
                onChange={(e) => maj({ adresse: { ...bien.adresse, ligne2: e.target.value } })}
                placeholder="Résidence Les Tilleuls, appartement 14"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Code postal" required error={erreurs.codePostal}>
                <Input
                  value={bien.adresse.codePostal}
                  inputMode="numeric"
                  onChange={(e) => maj({ adresse: { ...bien.adresse, codePostal: e.target.value } })}
                  placeholder="63400"
                />
              </Field>
              <Field label="Ville" required error={erreurs.ville}>
                <Input
                  value={bien.adresse.ville}
                  onChange={(e) => maj({ adresse: { ...bien.adresse, ville: e.target.value } })}
                  placeholder="Chamalières"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Type">
                <Select value={bien.type} onChange={(e) => maj({ type: e.target.value as TypeBien })}>
                  {(['T1', 'T1bis', 'T2', 'T3', 'T4', 'autre'] as const).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Étage">
                <Input
                  value={bien.etage ?? ''}
                  onChange={(e) => maj({ etage: e.target.value })}
                  placeholder="2e"
                />
              </Field>
              <Field label="Bâtiment">
                <Input
                  value={bien.batiment ?? ''}
                  onChange={(e) => maj({ batiment: e.target.value })}
                  placeholder="B"
                />
              </Field>
              <Field label="Régime juridique">
                <Select
                  value={bien.regimeJuridique}
                  onChange={(e) => maj({ regimeJuridique: e.target.value as Bien['regimeJuridique'] })}
                >
                  <option value="copropriete">Copropriété</option>
                  <option value="monopropriete">Monopropriété</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Type d'habitat">
                <Select
                  value={bien.typeHabitat ?? 'collectif'}
                  onChange={(e) => maj({ typeHabitat: e.target.value as 'collectif' | 'individuel' })}
                >
                  <option value="collectif">Immeuble collectif</option>
                  <option value="individuel">Immeuble individuel (maison)</option>
                </Select>
              </Field>
              <Field label="Période de construction" hint="Mention du bail type ; conditionne aussi l'obligation de CREP (avant 1949).">
                <Select
                  value={bien.periodeConstruction ?? ''}
                  onChange={(e) =>
                    maj({ periodeConstruction: (e.target.value || undefined) as PeriodeConstruction | undefined })
                  }
                >
                  <option value="">— Non renseignée —</option>
                  {Object.entries(PERIODE_CONSTRUCTION_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label="Identifiant fiscal du logement"
              hint="Numéro à 12 chiffres, obligatoire sur les baux signés depuis le 01/01/2024 (décret 2023-796). À retrouver sur impots.gouv.fr → « Gérer mes biens immobiliers »."
            >
              <Input
                value={bien.identifiantFiscal ?? ''}
                inputMode="numeric"
                onChange={(e) => maj({ identifiantFiscal: e.target.value || undefined })}
                placeholder="631234567890"
              />
            </Field>
          </>
        )}

        {etape === 1 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Surface habitable loi Boutin (m²)"
                required
                error={erreurs.surfaceBoutin}
                hint="Mention obligatoire du bail. Reportez le chiffre de l'attestation de mesurage (hors caves, parkings, balcons, surfaces sous 1,80 m)."
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bien.surfaceBoutin || ''}
                  onChange={(e) => maj({ surfaceBoutin: Number(e.target.value) })}
                  placeholder="42,5"
                />
              </Field>
              <Field
                label="Nombre de pièces principales"
                required
                error={erreurs.nbPieces}
                hint="Séjour et chambres uniquement (la cuisine, la salle de bain et les WC ne comptent pas)."
              >
                <Input
                  type="number"
                  min="1"
                  value={bien.nbPieces || ''}
                  onChange={(e) => maj({ nbPieces: Number(e.target.value) })}
                  placeholder="2"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Chauffage">
                <div className="flex gap-2">
                  <Select
                    value={bien.chauffage.type}
                    onChange={(e) =>
                      maj({ chauffage: { ...bien.chauffage, type: e.target.value as 'individuel' | 'collectif' } })
                    }
                  >
                    <option value="individuel">Individuel</option>
                    <option value="collectif">Collectif</option>
                  </Select>
                  <Input
                    value={bien.chauffage.energie}
                    onChange={(e) => maj({ chauffage: { ...bien.chauffage, energie: e.target.value } })}
                    placeholder="Énergie"
                  />
                </div>
              </Field>
              <Field label="Eau chaude sanitaire">
                <div className="flex gap-2">
                  <Select
                    value={bien.eauChaude.type}
                    onChange={(e) =>
                      maj({ eauChaude: { ...bien.eauChaude, type: e.target.value as 'individuel' | 'collectif' } })
                    }
                  >
                    <option value="individuel">Individuelle</option>
                    <option value="collectif">Collective</option>
                  </Select>
                  <Input
                    value={bien.eauChaude.energie}
                    onChange={(e) => maj({ eauChaude: { ...bien.eauChaude, energie: e.target.value } })}
                    placeholder="Énergie"
                  />
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Classe DPE"
                hint="Lettre du diagnostic de performance énergétique en cours de validité."
              >
                <Select
                  value={bien.classeDPE ?? ''}
                  onChange={(e) => maj({ classeDPE: (e.target.value || undefined) as ClasseDPE | undefined })}
                >
                  <option value="">— Non renseignée —</option>
                  {(['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Accès aux technologies (TIC)"
                hint="Rubrique du bail type : réception TV, raccordement internet…"
              >
                <Input
                  value={bien.equipementsTIC ?? ''}
                  onChange={(e) => maj({ equipementsTIC: e.target.value || undefined })}
                  placeholder="Fibre optique, TNT collective"
                />
              </Field>
            </div>
            {(() => {
              const decence = validerDecenceDPE(bien.classeDPE, new Date());
              return decence.message ? (
                <p
                  className={`flex items-start gap-2 rounded-lg p-3 text-sm font-medium ${
                    decence.bloquant ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {decence.message}
                </p>
              ) : null;
            })()}
            <Field
              label="Équipements privatifs"
              hint="Un équipement par ligne (touche Entrée pour passer à la ligne). Ils seront listés dans le bail, partie II."
            >
              <Textarea
                value={textes.equipements}
                onChange={(e) => setTextes({ ...textes, equipements: e.target.value })}
                placeholder={'Cuisine équipée (plaques, four, hotte)\nInterphone\nFibre optique'}
              />
            </Field>
            <Field
              label="Parties et équipements communs"
              hint="Un par ligne. Parties de l'immeuble dont le locataire a la jouissance."
            >
              <Textarea
                value={textes.communs}
                onChange={(e) => setTextes({ ...textes, communs: e.target.value })}
                placeholder={'Ascenseur\nLocal à vélos\nJardin commun'}
              />
            </Field>
            <Field
              label="Annexes (cave, parking…)"
              hint="Une par ligne, au format « type : description ». Types reconnus : cave, parking, grenier (sinon « autre »)."
            >
              <Textarea
                value={textes.annexes}
                onChange={(e) => setTextes({ ...textes, annexes: e.target.value })}
                placeholder={'cave : n°12, sous-sol\nparking : place 8, extérieur'}
              />
            </Field>
            <div className="rounded-lg bg-accent-50 p-4">
              <Checkbox
                label="Le bien est situé en zone tendue (encadrement de l'évolution des loyers à la relocation)"
                checked={bien.zoneTendue ?? false}
                onChange={(e) => maj({ zoneTendue: e.target.checked })}
              />
              <p className="mt-1 text-xs text-accent-500">
                Plus de 1 100 communes concernées (vérifiez sur service-public.fr, simulateur
                « zone tendue »). En zone tendue, le loyer d'un nouveau locataire ne peut en
                principe pas dépasser celui de l'ancien, et le préavis du locataire est réduit
                à 1 mois (déjà le cas en meublé).
              </p>
            </div>
            <div className="rounded-lg bg-accent-50 p-4">
              <Checkbox
                label="Le logement est soumis à une servitude de résidence principale"
                checked={bien.servitudeResidencePrincipale ?? false}
                onChange={(e) => maj({ servitudeResidencePrincipale: e.target.checked })}
              />
              <p className="mt-1 text-xs text-accent-500">
                Secteur où le PLU impose l'usage exclusif de résidence principale (art. L.151-14-1
                du code de l'urbanisme, loi du 19 novembre 2024 sur les meublés de tourisme). La
                mention est alors portée au bail, et le non-respect de cette obligation peut être
                ajouté aux motifs de résiliation de plein droit. À vérifier auprès de votre mairie.
              </p>
            </div>
            <div className="rounded-lg bg-accent-50 p-4">
              <Checkbox
                label="Le bien est situé en zone d'encadrement des loyers"
                checked={bien.zoneEncadrementLoyers}
                onChange={(e) => maj({ zoneEncadrementLoyers: e.target.checked })}
              />
              <p className="mt-1 text-xs text-accent-500">
                Concerne notamment Paris, Lille, Lyon/Villeurbanne, Bordeaux, Montpellier et
                certaines communes limitrophes. Les loyers de référence sont publiés par la
                préfecture ; l'assistant de bail vérifiera que le loyer respecte le plafond.
              </p>
              {bien.zoneEncadrementLoyers && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <Field label="Loyer de référence (€/mois)">
                    <Input
                      type="number"
                      step="0.01"
                      value={bien.loyerReference ?? ''}
                      onChange={(e) => maj({ loyerReference: Number(e.target.value) || undefined })}
                    />
                  </Field>
                  <Field label="Loyer de référence majoré (€/mois)" error={erreurs.loyerReferenceMajore}>
                    <Input
                      type="number"
                      step="0.01"
                      value={bien.loyerReferenceMajore ?? ''}
                      onChange={(e) => maj({ loyerReferenceMajore: Number(e.target.value) || undefined })}
                    />
                  </Field>
                </div>
              )}
            </div>
          </>
        )}

        {etape === 2 && (
          <div className="space-y-4">
            <Field
              label="Lien du dossier technique (Drive, cloud…)"
              hint="URL du dossier en ligne regroupant le DDT. Un QR code vers ce lien est ajouté sur le bail."
            >
              <Input
                value={bien.dossierTechniqueUrl ?? ''}
                onChange={(e) => maj({ dossierTechniqueUrl: e.target.value || undefined })}
                placeholder="https://drive.google.com/drive/folders/…"
              />
            </Field>
            <div className="space-y-2 rounded-lg border border-accent-200 p-4">
              <p className="text-sm font-medium text-accent-800">
                Diagnostics dus pour ce logement
              </p>
              <p className="text-xs text-accent-500">
                Ces réponses déterminent la liste des annexes imprimée à la fin du bail. Tant
                qu'une case n'est pas renseignée, la pièce reste listée avec sa condition : mieux
                vaut une ligne à vérifier qu'un diagnostic manquant.
              </p>
              <Checkbox
                label="Installation intérieure de gaz de plus de 15 ans"
                checked={bien.installationGazPlusDe15Ans ?? false}
                onChange={(e) => maj({ installationGazPlusDe15Ans: e.target.checked })}
              />
              <Checkbox
                label="Installation intérieure d'électricité de plus de 15 ans"
                checked={bien.installationElectriquePlusDe15Ans ?? false}
                onChange={(e) => maj({ installationElectriquePlusDe15Ans: e.target.checked })}
              />
              <Checkbox
                label="Commune concernée par l'état des risques (ERP)"
                checked={bien.zoneRisquesERP ?? true}
                onChange={(e) => maj({ zoneRisquesERP: e.target.checked })}
              />
              <p className="pl-8 text-xs text-accent-500">
                Plan de prévention des risques, sismicité 2 à 5, potentiel radon 3, secteur
                d'information sur les sols, recul du trait de côte : la quasi-totalité des communes
                est concernée par au moins un de ces motifs. À vérifier sur georisques.gouv.fr —
                l'ERP doit dater de moins de 6 mois à la signature.
              </p>
              <Checkbox
                label="Logement en zone d'exposition au bruit d'un aérodrome (PEB)"
                checked={bien.zoneBruitAerodrome ?? false}
                onChange={(e) => maj({ zoneBruitAerodrome: e.target.checked })}
              />
              <p className="pl-8 text-xs text-accent-500">
                Le constat de risque d'exposition au plomb (CREP) est ajouté automatiquement si la
                période de construction indiquée à l'étape précédente est « avant 1949 ».
              </p>
            </div>
            <div className="rounded-lg bg-accent-50 p-4 text-sm text-accent-700">
              <p className="font-medium text-accent-800">Que mettre dans le dossier technique ?</p>
              <p className="mt-1">
                Le dossier de diagnostic technique (DDT) est une annexe obligatoire du bail.
                Regroupez-y et tenez à jour : le <span className="font-medium">DPE</span>, l'
                <span className="font-medium">ERP</span> (état des risques, à renouveler tous les 6
                mois), le <span className="font-medium">CREP</span> si le logement est bâti avant
                1949, les diagnostics <span className="font-medium">électricité / gaz</span> si
                l'installation a plus de 15 ans, et l'attestation de{' '}
                <span className="font-medium">surface loi Boutin</span>.
              </p>
              <p className="mt-2 text-accent-600">
                La classe DPE se renseigne à l'étape « Surfaces &amp; équipements ». L'app ne suit
                pas les dates de validité : c'est le dossier joint qui fait foi.
              </p>
            </div>
          </div>
        )}

        {etape === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-accent-600">
              Ces conditions sont portées par le logement, pas par le bail : elles pré-remplissent
              le formulaire de bail, alimentent la fiche de visite, et sont mises à jour à
              l'enregistrement d'un bail. Tout est facultatif — un champ vide devient une zone à
              compléter à la main sur la fiche de visite.
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Loyer hors charges (€/mois)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cond.loyerHC ?? ''}
                  onChange={(e) =>
                    majCond({ loyerHC: e.target.value === '' ? undefined : Number(e.target.value) })
                  }
                  placeholder="520"
                />
              </Field>
              <Field label="Charges">
                <Select
                  value={cond.charges?.mode ?? 'forfait'}
                  onChange={(e) =>
                    majCond({
                      charges: {
                        ...cond.charges,
                        mode: e.target.value as 'forfait' | 'provisions',
                      },
                    })
                  }
                >
                  <option value="forfait">Forfait de charges</option>
                  <option value="provisions">Provisions sur charges</option>
                </Select>
              </Field>
              <Field label="Montant des charges (€/mois)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cond.charges?.montant ?? ''}
                  onChange={(e) =>
                    majCond({
                      charges: {
                        mode: cond.charges?.mode ?? 'forfait',
                        montant: e.target.value === '' ? undefined : Number(e.target.value),
                      },
                    })
                  }
                  placeholder="60"
                />
              </Field>
              <Field label="Dépôt de garantie (€)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cond.depotGarantie ?? ''}
                  onChange={(e) =>
                    majCond({ depotGarantie: e.target.value === '' ? undefined : Number(e.target.value) })
                  }
                  placeholder="1040"
                />
              </Field>
            </div>
            <p className="text-sm text-accent-600">
              Total charges comprises :{' '}
              <span className="font-medium text-accent-800">
                {cond.loyerHC === undefined
                  ? '—'
                  : formatEuros(cond.loyerHC + (cond.charges?.montant ?? 0))}
              </span>
              {cond.loyerHC && cond.depotGarantie && cond.depotGarantie > 2 * cond.loyerHC ? (
                <span className="ml-2 text-amber-700">
                  Le dépôt dépasse le maximum légal de 2 mois de loyer hors charges (
                  {formatEuros(2 * cond.loyerHC)}).
                </span>
              ) : null}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Disponible à partir du">
                <DateInput
                  value={cond.dateDisponibilite ?? ''}
                  onChange={(iso) => majCond({ dateDisponibilite: iso || undefined })}
                />
              </Field>
              <Field label="Ce que couvrent les charges">
                <Input
                  value={cond.chargesDetail ?? ''}
                  onChange={(e) => majCond({ chargesDetail: e.target.value || undefined })}
                  placeholder="Eau froide, ordures ménagères, entretien des parties communes"
                />
              </Field>
            </div>
            <Field
              label="Accès et stationnement"
              hint="Imprimé sur la fiche de visite : interphone, code, étage, ascenseur, où se garer, transports."
            >
              <Textarea
                value={cond.acces ?? ''}
                onChange={(e) => majCond({ acces: e.target.value || undefined })}
                placeholder={'Interphone « Martin », 2e étage sans ascenseur\nStationnement gratuit rue de la Gare'}
              />
            </Field>
            <Field
              label="Conditions particulières"
              hint="Animaux, non-fumeur, jardin partagé… Affiché au candidat sur la fiche de visite."
            >
              <Textarea
                value={cond.conditionsParticulieres ?? ''}
                onChange={(e) => majCond({ conditionsParticulieres: e.target.value || undefined })}
              />
            </Field>
          </div>
        )}

        {etape === 4 && (
          <PiecesEditeur pieces={bien.piecesModele} onChange={(p) => maj({ piecesModele: p })} />
        )}

        <div className="flex justify-between border-t border-accent-100 pt-4">
          <Button variant="secondary" onClick={() => (etape === 0 ? navigate(-1) : setEtape(etape - 1))}>
            {etape === 0 ? 'Annuler' : 'Précédent'}
          </Button>
          {etape < ETAPES.length - 1 ? (
            <Button onClick={suivant}>Suivant</Button>
          ) : (
            <Button onClick={enregistrer}>Enregistrer le bien</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
