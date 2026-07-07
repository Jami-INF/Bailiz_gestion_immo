import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { db, getParametres, prochaineReference } from '@/lib/db';
import { uid, nowISO } from '@/lib/ids';
import type { Bail, Inventaire, LigneInventaire, TypeBail } from '@/types';
import { TYPE_BAIL_LABELS } from '@/types';
import { validerDecenceDPE, validerDepotGarantie, validerDuree, formatEuros } from '@/lib/calculs';
import { MOBILIER_OBLIGATOIRE } from '@/lib/defauts';
import { rendrePdf } from '@/lib/pdf/generer';
import { enregistrerDocument } from '@/lib/pdf/generer';
import { BailPdf } from '@/lib/pdf/BailPdf';
import { InventairePdf } from '@/lib/pdf/InventairePdf';
import { GrilleVetustePdf } from '@/lib/pdf/GrilleVetustePdf';
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
import { annexesParDefaut } from './annexes';

const ETAPES = ['Bien', 'Locataires', 'Type de bail', 'Finances', 'Clauses', 'Annexes', 'Aperçu'];

const EXPLICATIONS_TYPES: Record<TypeBail, string> = {
  meuble_1an:
    'Durée 1 an, renouvelable par tacite reconduction. Dépôt de garantie limité à 2 mois de loyer hors charges. Préavis : 1 mois pour le locataire, 3 mois pour le bailleur (congé à échéance uniquement, motivé).',
  meuble_etudiant_9mois:
    'Réservé aux locataires étudiants. Durée fixe de 9 mois, non renouvelable. Mêmes règles de dépôt de garantie que le meublé classique.',
  mobilite:
    "De 1 à 10 mois, non renouvelable (loi ELAN). Réservé aux publics en mobilité (études, stage, apprentissage, mutation, service civique…). Dépôt de garantie interdit. Loyer non révisable.",
};

interface Brouillon {
  bienId: string;
  locataireIds: string[];
  clauseSolidarite: boolean;
  typeBail: TypeBail;
  dateEffet: string;
  dureeMois: number;
  loyerHC: number;
  chargesMode: 'forfait' | 'provisions';
  chargesMontant: number;
  depotGarantie: number;
  jourPaiement: number;
  modePaiement: string;
  trimestreReference: string;
  valeurIndice: number;
  revisable: boolean;
  complementMontant: number;
  complementJustification: string;
  dernierLoyerAncienLocataire?: number;
  clauseResolutoire: boolean;
  assuranceMontantAnnuel: number;
  travauxDepuis: string;
  travauxMajoration: string;
  travauxDiminution: string;
  clauses: string;
}

export function BailAssistantPage() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { bienId?: string } };
  const toast = useToast();
  const biens = useLiveQuery(() => db.biens.orderBy('nom').toArray());
  const locataires = useLiveQuery(() => db.locataires.orderBy('nom').toArray());
  const [etape, setEtape] = useState(0);
  const [generation, setGeneration] = useState(false);
  const [d, setD] = useState<Brouillon>({
    bienId: location.state?.bienId ?? '',
    locataireIds: [],
    clauseSolidarite: true,
    typeBail: 'meuble_1an',
    dateEffet: format(new Date(), 'yyyy-MM-dd'),
    dureeMois: 12,
    loyerHC: 0,
    chargesMode: 'forfait',
    chargesMontant: 0,
    depotGarantie: 0,
    jourPaiement: 1,
    modePaiement: 'virement bancaire',
    trimestreReference: '',
    valeurIndice: 0,
    revisable: true,
    complementMontant: 0,
    complementJustification: '',
    clauseResolutoire: true,
    assuranceMontantAnnuel: 0,
    travauxDepuis: '',
    travauxMajoration: '',
    travauxDiminution: '',
    clauses: '',
  });
  const [annexes, setAnnexes] = useState<ReturnType<typeof annexesParDefaut> | null>(null);

  const bien = useMemo(() => biens?.find((b) => b.id === d.bienId), [biens, d.bienId]);

  if (!biens || !locataires) return null;

  const maj = (m: Partial<Brouillon>) => setD((prev) => ({ ...prev, ...m }));

  // Validations bloquantes de l'étape courante
  const erreurs: string[] = [];
  const decence = bien ? validerDecenceDPE(bien.classeDPE, new Date(d.dateEffet)) : undefined;
  if (etape === 0 && decence?.bloquant) {
    erreurs.push(decence.message!);
  }
  if (etape === 3) {
    const vDuree = validerDuree(d.typeBail, d.dureeMois);
    if (!vDuree.valide) erreurs.push(vDuree.message!);
    const vDepot = validerDepotGarantie(d.typeBail, d.loyerHC, d.depotGarantie);
    if (!vDepot.valide) erreurs.push(vDepot.message!);
    if (d.typeBail !== 'mobilite' && d.revisable && (!d.trimestreReference.trim() || d.valeurIndice <= 0)) {
      erreurs.push(
        "Révision IRL activée : le trimestre de référence et la valeur de l'indice (publiés par l'INSEE) sont des mentions obligatoires du bail. Renseignez-les ou décochez la révision.",
      );
    }
    if (
      bien?.zoneEncadrementLoyers &&
      bien.loyerReferenceMajore != null &&
      d.loyerHC > bien.loyerReferenceMajore &&
      (d.complementMontant <= 0 || !d.complementJustification.trim())
    ) {
      erreurs.push(
        `Zone d'encadrement des loyers : le loyer hors charges (${formatEuros(d.loyerHC)}) dépasse le loyer de référence majoré (${formatEuros(bien.loyerReferenceMajore)}). Un complément de loyer justifié par des caractéristiques exceptionnelles est requis, sinon le loyer doit être abaissé.`,
      );
    }
  }

  const peutContinuer = () => {
    switch (etape) {
      case 0:
        return d.bienId !== '' && !decence?.bloquant;
      case 1:
        return d.locataireIds.length > 0;
      case 3:
        return d.loyerHC > 0 && erreurs.length === 0;
      default:
        return true;
    }
  };

  const suivant = () => {
    if (etape === 4 && !annexes && bien) setAnnexes(annexesParDefaut(bien));
    setEtape(etape + 1);
  };

  const genererBail = async () => {
    if (!bien) return;
    setGeneration(true);
    try {
      const parametres = await getParametres();
      const reference = await prochaineReference('bail');
      const refInventaire = await prochaineReference('inventaire');
      const bailId = uid();

      // Inventaire pré-rempli : 11 postes obligatoires + mobilier des pièces du bien
      const lignesObligatoires: LigneInventaire[] = MOBILIER_OBLIGATOIRE.map((designation) => ({
        pieceNom: 'Logement (décret n°2015-981)',
        designation,
        quantite: 1,
        etat: 'bon',
        obligatoireDecret: true,
      }));
      const lignesMobilier: LigneInventaire[] = bien.piecesModele.flatMap((piece) =>
        piece.elements
          .filter((e) => e.categorie === 'mobilier')
          .map((e) => ({
            pieceNom: piece.nom,
            designation: e.nom,
            quantite: 1,
            etat: 'bon' as const,
          })),
      );
      const inventaire: Inventaire = {
        id: uid(),
        reference: refInventaire,
        bailId,
        lignes: [...lignesObligatoires, ...lignesMobilier],
        statut: 'brouillon',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };

      const bail: Bail = {
        id: bailId,
        reference,
        bienId: bien.id,
        locataireIds: d.locataireIds,
        clauseSolidarite: d.locataireIds.length > 1 ? d.clauseSolidarite : false,
        typeBail: d.typeBail,
        dateEffet: d.dateEffet,
        dureeMois: d.dureeMois,
        loyerHC: d.loyerHC,
        charges: { mode: d.chargesMode, montant: d.chargesMontant },
        depotGarantie: d.typeBail === 'mobilite' ? 0 : d.depotGarantie,
        jourPaiement: d.jourPaiement,
        modePaiement: d.modePaiement,
        revisionIRL: {
          trimestreReference: d.trimestreReference,
          valeurIndice: d.valeurIndice,
          revisable: d.typeBail !== 'mobilite' && d.revisable,
        },
        complementLoyer:
          d.complementMontant > 0
            ? { montant: d.complementMontant, justification: d.complementJustification }
            : undefined,
        dernierLoyerAncienLocataire: d.dernierLoyerAncienLocataire,
        clauseResolutoire: d.clauseResolutoire,
        assuranceColocataires:
          d.locataireIds.length > 1 && d.assuranceMontantAnnuel > 0
            ? { montantAnnuel: d.assuranceMontantAnnuel }
            : undefined,
        travaux:
          d.travauxDepuis.trim() || d.travauxMajoration.trim() || d.travauxDiminution.trim()
            ? {
                depuisDernierBail: d.travauxDepuis.trim() || undefined,
                majorationBailleur: d.travauxMajoration.trim() || undefined,
                diminutionLocataire: d.travauxDiminution.trim() || undefined,
              }
            : undefined,
        clausesParticulieres: d.clauses.split('\n').map((s) => s.trim()).filter(Boolean),
        annexesChecklist: annexes ?? annexesParDefaut(bien),
        inventaireId: inventaire.id,
        statut: 'genere',
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };

      const locs = locataires.filter((l) => d.locataireIds.includes(l.id));
      const blobBail = await rendrePdf(
        <BailPdf bail={bail} bien={bien} locataires={locs} parametres={parametres} />,
      );
      const blobInv = await rendrePdf(
        <InventairePdf inventaire={inventaire} bail={bail} bien={bien} locataires={locs} />,
      );
      // La grille de vétusté est générée comme annexe du bail (décret 2016-382, art. 4).
      const refGrille = await prochaineReference('document');
      const blobGrille = await rendrePdf(
        <GrilleVetustePdf reference={refGrille} grille={parametres.grilleVetuste} bailReference={reference} />,
      );

      await db.transaction('rw', [db.baux, db.inventaires], async () => {
        await db.inventaires.add(inventaire);
        await db.baux.add(bail);
      });
      await enregistrerDocument({
        reference,
        type: 'bail',
        titre: `Bail meublé — ${bien.nom}`,
        blob: blobBail,
        bienId: bien.id,
        bailId,
      });
      await enregistrerDocument({
        reference: refInventaire,
        type: 'inventaire',
        titre: `Inventaire du mobilier — ${bien.nom}`,
        blob: blobInv,
        bienId: bien.id,
        bailId,
      });
      await enregistrerDocument({
        reference: refGrille,
        type: 'grille_vetuste',
        titre: `Grille de vétusté — annexe du bail ${reference}`,
        blob: blobGrille,
        bienId: bien.id,
        bailId,
      });

      toast('success', `Bail ${reference} généré avec son inventaire et sa grille de vétusté.`);
      navigate(`/baux/${bailId}`);
    } catch (e) {
      console.error(e);
      toast('error', 'Erreur lors de la génération du bail.');
    } finally {
      setGeneration(false);
    }
  };

  return (
    <div>
      <PageHeader titre="Nouveau bail meublé" />
      <div className="mb-6">
        <Stepper etapes={ETAPES} courante={etape} />
      </div>
      <Card className="space-y-4">
        {etape === 0 && (
          <>
            <Field label="Bien loué" required>
              <Select value={d.bienId} onChange={(e) => maj({ bienId: e.target.value })}>
                <option value="">— Choisir un bien —</option>
                {biens.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom} ({b.adresse.ville})
                  </option>
                ))}
              </Select>
            </Field>
            {biens.length === 0 && (
              <p className="text-sm text-accent-600">
                Aucun bien enregistré.{' '}
                <Link to="/biens/nouveau" className="font-medium text-accent-800 underline">
                  Créez d'abord un bien
                </Link>
                .
              </p>
            )}
            {bien && (
              <p className="rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
                {bien.type} · {bien.surfaceBoutin} m² · {bien.adresse.ligne1},{' '}
                {bien.adresse.codePostal} {bien.adresse.ville}
                {bien.zoneEncadrementLoyers && (
                  <span className="mt-1 block text-amber-700">
                    Zone d'encadrement des loyers — loyer de référence majoré :{' '}
                    {bien.loyerReferenceMajore != null ? formatEuros(bien.loyerReferenceMajore) : 'non renseigné'}
                  </span>
                )}
              </p>
            )}
            {bien && decence?.message && (
              <p
                className={`flex items-start gap-2 rounded-lg p-3 text-sm font-medium ${
                  decence.bloquant ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'
                }`}
              >
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {decence.message}
              </p>
            )}
            {bien && !bien.identifiantFiscal && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> L'identifiant fiscal du
                logement n'est pas renseigné sur ce bien : c'est une mention obligatoire des
                baux signés depuis le 01/01/2024 (décret 2023-796). Complétez la fiche du bien
                (impots.gouv.fr → « Gérer mes biens immobiliers »).
              </p>
            )}
          </>
        )}

        {etape === 1 && (
          <>
            <p className="text-sm font-medium text-accent-800">
              Sélectionnez le ou les locataires (colocation possible) :
            </p>
            {locataires.length === 0 && (
              <p className="text-sm text-accent-600">
                Aucun locataire.{' '}
                <Link to="/locataires" className="font-medium text-accent-800 underline">
                  Créez d'abord un locataire
                </Link>
                .
              </p>
            )}
            <div className="space-y-1">
              {locataires.map((l) => (
                <Checkbox
                  key={l.id}
                  label={`${l.civilite} ${l.prenom} ${l.nom} (${l.email})`}
                  checked={d.locataireIds.includes(l.id)}
                  onChange={(e) =>
                    maj({
                      locataireIds: e.target.checked
                        ? [...d.locataireIds, l.id]
                        : d.locataireIds.filter((x) => x !== l.id),
                    })
                  }
                />
              ))}
            </div>
            {d.locataireIds.length > 1 && (
              <div className="space-y-3 rounded-lg bg-accent-50 p-4">
                <Checkbox
                  label="Insérer une clause de solidarité entre colocataires (recommandé)"
                  checked={d.clauseSolidarite}
                  onChange={(e) => maj({ clauseSolidarite: e.target.checked })}
                />
                <Field
                  label="Assurance souscrite par le bailleur pour le compte des colocataires — montant annuel (€)"
                  hint="Laissez 0 si les colocataires s'assurent eux-mêmes. Sinon, la prime annuelle est récupérable par douzième avec le loyer (art. 8-1 loi de 1989)."
                >
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={d.assuranceMontantAnnuel || ''}
                    onChange={(e) => maj({ assuranceMontantAnnuel: Number(e.target.value) })}
                    placeholder="0"
                  />
                </Field>
              </div>
            )}
          </>
        )}

        {etape === 2 && (
          <div className="space-y-3">
            {(Object.keys(TYPE_BAIL_LABELS) as TypeBail[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  maj({
                    typeBail: t,
                    dureeMois: t === 'meuble_1an' ? 12 : t === 'meuble_etudiant_9mois' ? 9 : 6,
                    depotGarantie: t === 'mobilite' ? 0 : d.depotGarantie,
                  })
                }
                className={`w-full rounded-xl border-2 p-4 text-left transition-colors ${
                  d.typeBail === t ? 'border-accent-700 bg-accent-50' : 'border-accent-200 hover:border-accent-400'
                }`}
              >
                <div className="font-semibold text-accent-900">{TYPE_BAIL_LABELS[t]}</div>
                <p className="mt-1 text-sm text-accent-600">{EXPLICATIONS_TYPES[t]}</p>
              </button>
            ))}
            {d.typeBail === 'mobilite' && (
              <Field label="Durée (1 à 10 mois)">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={d.dureeMois}
                  onChange={(e) => maj({ dureeMois: Number(e.target.value) })}
                />
              </Field>
            )}
          </div>
        )}

        {etape === 3 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Date de prise d'effet"
                required
                hint="Date d'entrée dans les lieux : le bail et le premier loyer (au prorata) démarrent ce jour-là."
              >
                <DateInput value={d.dateEffet} onChange={(date) => date && maj({ dateEffet: date })} />
              </Field>
              <Field label="Loyer mensuel hors charges (€)" required>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={d.loyerHC || ''}
                  onChange={(e) => maj({ loyerHC: Number(e.target.value) })}
                  placeholder="620"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Mode de charges" hint="En meublé, le forfait est le plus courant.">
                <Select
                  value={d.chargesMode}
                  onChange={(e) => maj({ chargesMode: e.target.value as 'forfait' | 'provisions' })}
                >
                  <option value="forfait">Forfait de charges</option>
                  <option value="provisions">Provisions avec régularisation annuelle</option>
                </Select>
              </Field>
              <Field
                label="Montant mensuel des charges (€)"
                hint="Eau, ordures ménagères, charges de copropriété récupérables…"
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={d.chargesMontant || ''}
                  onChange={(e) => maj({ chargesMontant: Number(e.target.value) })}
                  placeholder="80"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Dépôt de garantie (€)"
                hint={
                  d.typeBail === 'mobilite'
                    ? 'Interdit pour le bail mobilité.'
                    : `Maximum légal : ${formatEuros(d.loyerHC * 2)} (2 mois hors charges).`
                }
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={d.typeBail === 'mobilite'}
                  value={d.typeBail === 'mobilite' ? 0 : d.depotGarantie || ''}
                  onChange={(e) => maj({ depotGarantie: Number(e.target.value) })}
                />
              </Field>
              <Field
                label="Jour de paiement du loyer (1-28)"
                hint="Limité au 28 pour exister dans tous les mois, février compris."
              >
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={d.jourPaiement}
                  onChange={(e) => maj({ jourPaiement: Math.min(28, Math.max(1, Number(e.target.value))) })}
                />
              </Field>
            </div>
            <Field label="Mode de paiement">
              <Input
                value={d.modePaiement}
                onChange={(e) => maj({ modePaiement: e.target.value })}
                placeholder="virement bancaire"
              />
            </Field>
            {d.typeBail !== 'mobilite' && (
              <div className="rounded-lg bg-accent-50 p-4">
                <Checkbox
                  label="Loyer révisable annuellement selon l'IRL"
                  checked={d.revisable}
                  onChange={(e) => maj({ revisable: e.target.checked })}
                />
                {d.revisable && (
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <Field
                      label="Trimestre de référence IRL"
                      hint="Dernier trimestre publié à la signature. La révision annuelle se calculera sur ce même trimestre."
                    >
                      <Input
                        value={d.trimestreReference}
                        onChange={(e) => maj({ trimestreReference: e.target.value })}
                        placeholder="1er trimestre 2026"
                      />
                    </Field>
                    <Field
                      label="Valeur de l'indice"
                      hint="À relever sur insee.fr (rubrique « Indice de référence des loyers »)."
                    >
                      <Input
                        type="number"
                        step="0.01"
                        value={d.valeurIndice || ''}
                        onChange={(e) => maj({ valeurIndice: Number(e.target.value) })}
                        placeholder="145,47"
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}
            {bien?.zoneEncadrementLoyers && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-sm font-medium text-amber-800">
                  Zone d'encadrement des loyers — complément de loyer (uniquement si le logement
                  présente des caractéristiques de localisation ou de confort exceptionnelles) :
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Complément de loyer (€)">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={d.complementMontant || ''}
                      onChange={(e) => maj({ complementMontant: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Justification">
                    <Input
                      value={d.complementJustification}
                      onChange={(e) => maj({ complementJustification: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            )}
            <Field
              label="Dernier loyer acquitté par le précédent locataire (€)"
              hint="Mention obligatoire si le précédent locataire est parti depuis moins de 18 mois. Laisser vide sinon."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                value={d.dernierLoyerAncienLocataire ?? ''}
                onChange={(e) =>
                  maj({ dernierLoyerAncienLocataire: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </Field>
            {erreurs.map((err) => (
              <p key={err} className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {err}
              </p>
            ))}
          </>
        )}

        {etape === 4 && (
          <>
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <Checkbox
                label="Insérer la clause résolutoire (fortement recommandé — protège le bailleur)"
                checked={d.clauseResolutoire}
                onChange={(e) => maj({ clauseResolutoire: e.target.checked })}
              />
              <p className="mt-1 text-xs text-green-800">
                Résiliation de plein droit du bail en cas de : défaut de paiement du loyer ou
                des charges, non-versement du dépôt de garantie, défaut d'assurance des risques
                locatifs, troubles de voisinage constatés par une décision de justice. Sans
                cette clause, il faut prouver la gravité du manquement devant le juge.
              </p>
            </div>
            <div className="space-y-3 rounded-lg bg-accent-50 p-4">
              <p className="text-sm font-medium text-accent-800">
                Travaux (rubrique V du bail type) — laissez vide pour « néant » :
              </p>
              <Field
                label="Travaux d'amélioration ou de mise en conformité depuis le dernier bail"
                hint="Nature et montant (ex. « Remplacement de la chaudière — 3 200 € »)."
              >
                <Textarea rows={2} value={d.travauxDepuis} onChange={(e) => maj({ travauxDepuis: e.target.value })} />
              </Field>
              <Field
                label="Majoration de loyer en cours de bail suite à des travaux du bailleur"
                hint="Nature, modalités, délai et montant de la majoration."
              >
                <Textarea rows={2} value={d.travauxMajoration} onChange={(e) => maj({ travauxMajoration: e.target.value })} />
              </Field>
              <Field
                label="Diminution de loyer suite à des travaux pris en charge par le locataire"
                hint="Nature, montant, durée de la diminution et dédommagement en cas de départ anticipé."
              >
                <Textarea rows={2} value={d.travauxDiminution} onChange={(e) => maj({ travauxDiminution: e.target.value })} />
              </Field>
            </div>
            <Field
              label="Clauses particulières"
              hint="Une clause par ligne (touche Entrée entre deux clauses). Elles apparaîtront numérotées dans la partie X du bail. Attention aux clauses abusives (liste sur service-public.fr). Laissez vide si aucune."
            >
              <Textarea
                rows={8}
                value={d.clauses}
                onChange={(e) => maj({ clauses: e.target.value })}
                placeholder={"Le locataire fait entretenir la chaudière une fois par an et fournit l'attestation.\nLes animaux sont admis dans la limite du respect de la tranquillité du voisinage."}
              />
            </Field>
          </>
        )}

        {etape === 5 && annexes && (
          <>
            <p className="text-sm text-accent-700">
              Cochez les annexes effectivement jointes au bail. L'inventaire et l'état des lieux
              d'entrée sont générés par l'application.
            </p>
            {annexes.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <Checkbox
                  label={a.libelle}
                  checked={a.jointe}
                  onChange={(e) =>
                    setAnnexes(annexes.map((x) => (x.id === a.id ? { ...x, jointe: e.target.checked } : x)))
                  }
                />
                {a.lien && (
                  <a
                    href={a.lien}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center gap-1 text-xs font-medium text-accent-700 underline"
                  >
                    Télécharger l'officielle <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </>
        )}

        {etape === 6 && bien && (
          <div className="space-y-3 text-sm text-accent-800">
            <h3 className="text-base font-semibold text-accent-900">Récapitulatif</h3>
            <p>
              <span className="font-medium">Bien :</span> {bien.nom} — {bien.adresse.ligne1},{' '}
              {bien.adresse.codePostal} {bien.adresse.ville}
            </p>
            <p>
              <span className="font-medium">Locataires :</span>{' '}
              {locataires
                .filter((l) => d.locataireIds.includes(l.id))
                .map((l) => `${l.prenom} ${l.nom}`)
                .join(', ')}
              {d.locataireIds.length > 1 && (d.clauseSolidarite ? ' (avec clause de solidarité)' : ' (sans solidarité)')}
            </p>
            <p>
              <span className="font-medium">Type :</span> {TYPE_BAIL_LABELS[d.typeBail]} — effet le{' '}
              {format(new Date(d.dateEffet), 'dd/MM/yyyy')}, durée {d.dureeMois} mois
            </p>
            <p>
              <span className="font-medium">Loyer :</span> {formatEuros(d.loyerHC)} HC +{' '}
              {formatEuros(d.chargesMontant)} ({d.chargesMode}) — dépôt de garantie{' '}
              {formatEuros(d.typeBail === 'mobilite' ? 0 : d.depotGarantie)}
            </p>
            <p className="text-accent-600">
              La génération produit le PDF du bail (trame réglementaire, parties I à VIII) et
              l'inventaire du mobilier pré-rempli avec les 11 postes obligatoires du décret
              n°2015-981.
            </p>
          </div>
        )}

        <div className="flex justify-between border-t border-accent-100 pt-4">
          <Button variant="secondary" onClick={() => (etape === 0 ? navigate(-1) : setEtape(etape - 1))}>
            {etape === 0 ? 'Annuler' : 'Précédent'}
          </Button>
          {etape < ETAPES.length - 1 ? (
            <Button onClick={suivant} disabled={!peutContinuer()}>
              Suivant
            </Button>
          ) : (
            <Button onClick={genererBail} disabled={generation}>
              {generation ? 'Génération…' : 'Générer le bail et l’inventaire'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
