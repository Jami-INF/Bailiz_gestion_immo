import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import {
  Calculator,
  ClipboardList,
  Download,
  Pencil,
  Receipt,
  Ruler,
  Scale,
  ShieldQuestion,
} from 'lucide-react';
import { db, getParametres, prochaineReference } from '@/lib/db';
import { uid, nowISO } from '@/lib/ids';
import type { Bail, ElementEDL, EtatDesLieux } from '@/types';
import { TYPE_BAIL_LABELS } from '@/types';
import { formatEuros, prorataPremierLoyer, revisionIRL } from '@/lib/calculs';
import { construirePiecesSortie } from '@/lib/etat';
import { MOBILIER_OBLIGATOIRE } from '@/lib/defauts';
import { rendrePdf, enregistrerDocument, nomsPersonnes, telechargerDocument } from '@/lib/pdf/generer';
import { BailPdf } from '@/lib/pdf/BailPdf';
import { CourrierIrlPdf } from '@/lib/pdf/CourrierIrlPdf';
import { FicheAidePdf } from '@/lib/pdf/FicheAidePdf';
import { GrilleVetustePdf } from '@/lib/pdf/GrilleVetustePdf';
import { ActeCautionnementPdf } from '@/lib/pdf/ActeCautionnementPdf';
import { telechargerBlob } from '@/lib/backup';
import { Badge, Button, Card, Field, Input, Modal, PageHeader, useToast } from '@/components/ui';
import { STATUT_BAIL_UI } from './BauxPage';

export function BailDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const bail = useLiveQuery(() => (id ? db.baux.get(id) : undefined), [id]);
  const bien = useLiveQuery(() => (bail ? db.biens.get(bail.bienId) : undefined), [bail?.bienId]);
  const locataires = useLiveQuery(
    () => (bail ? db.locataires.where('id').anyOf(bail.locataireIds).toArray() : []),
    [bail?.locataireIds.join(',')],
  );
  const edls = useLiveQuery(() => (id ? db.edls.where('bailId').equals(id).toArray() : []), [id]);
  const parametres = useLiveQuery(() => getParametres());
  const [modaleIrl, setModaleIrl] = useState(false);
  const [nouvelIndice, setNouvelIndice] = useState(0);
  const [nouveauTrimestre, setNouveauTrimestre] = useState('');

  if (!bail || !bien || !locataires || !parametres) return null;

  const nomsLocs = nomsPersonnes(locataires);
  const ui = STATUT_BAIL_UI[bail.statut];
  const edlEntree = edls?.find((e) => e.type === 'entree');
  const edlSortie = edls?.find((e) => e.type === 'sortie');
  const prorata = prorataPremierLoyer(new Date(bail.dateEffet), bail.loyerHC, bail.charges.montant);

  const majBail = (m: Partial<Bail>) => db.baux.put({ ...bail, ...m, updatedAt: nowISO() });

  // Le PDF est toujours reconstruit à partir des données courantes : aucun
  // écart possible entre le bail affiché et le document téléchargé/imprimé.
  const telechargerPdf = async () => {
    const parametres = await getParametres();
    const blob = await rendrePdf(
      <BailPdf bail={bail} bien={bien} locataires={locataires} parametres={parametres} brouillon />,
    );
    const titre = `Bail meublé — ${bien.nom} — ${nomsLocs}`;
    await enregistrerDocument({
      reference: bail.reference,
      type: 'bail',
      titre,
      blob,
      bienId: bien.id,
      bailId: bail.id,
    });
    telechargerDocument({ blob, reference: bail.reference, titre });
  };

  /** Fiche d'aide juridique (préavis, congés, impayés, délais) — archivée et téléchargée. */
  const genererFicheAide = async () => {
    const reference = await prochaineReference('document');
    const blob = await rendrePdf(<FicheAidePdf reference={reference} />);
    const titre = 'Fiche d’aide juridique du bailleur meublé';
    await enregistrerDocument({ reference, type: 'fiche_aide', titre, blob, bienId: bien.id, bailId: bail.id });
    telechargerDocument({ blob, reference, titre });
    toast('success', "Fiche d'aide juridique générée.");
  };

  /** Grille de vétusté du bail (annexe, décret 2016-382) — reprend celle des Paramètres. */
  const genererGrilleVetuste = async () => {
    const reference = await prochaineReference('document');
    const parametres = await getParametres();
    const blob = await rendrePdf(
      <GrilleVetustePdf reference={reference} grille={parametres.grilleVetuste} bailReference={bail.reference} />,
    );
    const titre = `Grille de vétusté — ${bien.nom} — annexe du bail ${bail.reference}`;
    await enregistrerDocument({ reference, type: 'grille_vetuste', titre, blob, bienId: bien.id, bailId: bail.id });
    telechargerDocument({ blob, reference, titre });
    toast('success', 'Grille de vétusté générée.');
  };

  /**
   * Acte de cautionnement pré-rempli depuis ce bail (premier locataire pourvu
   * d'une caution personne physique) ; les données manquantes restent à
   * compléter à la main. Simplement téléchargé : il n'a pas vocation à être
   * archivé tant qu'il n'est pas signé.
   */
  const telechargerActeCautionnement = async () => {
    const avecCaution = locataires.find((l) => l.garant && l.garant.type !== 'visale');
    const cible = avecCaution ?? locataires[0];
    const adresse = [bien.adresse.ligne1, `${bien.adresse.codePostal} ${bien.adresse.ville}`.trim()]
      .filter((x) => x && x.trim())
      .join(', ');
    const blob = await rendrePdf(
      <ActeCautionnementPdf
        bailleur={parametres.bailleur}
        garant={avecCaution?.garant}
        locataireNom={cible ? `${cible.prenom} ${cible.nom}`.trim() : undefined}
        bienAdresse={adresse || undefined}
        loyerHC={bail.loyerHC}
        charges={bail.charges.montant}
        typeBailLabel={TYPE_BAIL_LABELS[bail.typeBail]}
        dureeMois={bail.dureeMois}
      />,
    );
    const g = avecCaution?.garant;
    const nomGarant = g ? `${g.prenom ?? ''} ${g.nom ?? ''}`.trim() : '';
    telechargerBlob(blob, `Acte de cautionnement${nomGarant ? ` - ${nomGarant}` : ''}.pdf`);
  };

  const creerEdl = async (type: 'entree' | 'sortie') => {
    if (type === 'sortie' && !edlEntree) {
      toast('error', "Créez et signez d'abord l'état des lieux d'entrée.");
      return;
    }
    const reference = await prochaineReference('edl');
    const edl: EtatDesLieux = {
      id: uid(),
      reference,
      bailId: bail.id,
      type,
      date: nowISO(),
      edlEntreeLieId: type === 'sortie' ? edlEntree!.id : undefined,
      compteurs: [
        { type: 'electricite', releve: 0 },
        { type: 'eau_froide', releve: 0 },
      ],
      cles: [{ designation: "Clé porte d'entrée", nombre: 1 }],
      pieces:
        type === 'sortie'
          ? construirePiecesSortie(edlEntree!)
          : [
              ...bien.piecesModele.map((p, i) => ({
                id: uid(),
                nom: p.nom,
                ordre: i,
                elements: p.elements.map(
                  (e): ElementEDL => ({
                    id: uid(),
                    nom: e.nom,
                    categorie: e.categorie,
                    quantite: e.categorie === 'mobilier' ? e.quantite ?? 1 : undefined,
                    obligatoireDecret: e.obligatoireDecret,
                    photoIds: [],
                  }),
                ),
              })),
              // Inventaire du mobilier obligatoire (décret n°2015-981) intégré à l'EDL.
              {
                id: uid(),
                nom: 'Mobilier obligatoire (décret n°2015-981)',
                ordre: bien.piecesModele.length,
                elements: MOBILIER_OBLIGATOIRE.map(
                  (nom): ElementEDL => ({
                    id: uid(),
                    nom,
                    categorie: 'mobilier',
                    quantite: 1,
                    obligatoireDecret: true,
                    photoIds: [],
                  }),
                ),
              },
            ],
      statut: 'brouillon',
      avenants: [],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    await db.edls.add(edl);
    await majBail(type === 'entree' ? { edlEntreeId: edl.id } : { edlSortieId: edl.id });
    navigate(`/edl/${edl.id}`);
  };

  const genererCourrierIrl = async () => {
    if (!bail.revisionIRL.valeurIndice || !nouvelIndice) return;
    const calc = revisionIRL(bail.loyerHC, bail.revisionIRL.valeurIndice, nouvelIndice);
    const parametres = await getParametres();
    const reference = await prochaineReference('document');
    const anniversaire = new Date(bail.dateEffet);
    anniversaire.setFullYear(new Date().getFullYear());
    const blob = await rendrePdf(
      <CourrierIrlPdf
        reference={reference}
        bail={bail}
        bien={bien}
        locataires={locataires}
        parametres={parametres}
        ancienIndice={bail.revisionIRL.valeurIndice}
        nouvelIndice={nouvelIndice}
        nouveauTrimestre={nouveauTrimestre}
        ancienLoyer={bail.loyerHC}
        nouveauLoyer={calc.nouveauLoyer}
        dateApplication={anniversaire.toISOString()}
      />,
    );
    const titre = `Révision IRL ${new Date().getFullYear()} — ${bien.nom} — ${nomsLocs}`;
    await enregistrerDocument({
      reference,
      type: 'courrier_irl',
      titre,
      blob,
      bienId: bien.id,
      bailId: bail.id,
    });
    telechargerDocument({ blob, reference, titre });
    setModaleIrl(false);
    toast('success', `Courrier de révision généré : nouveau loyer ${formatEuros(calc.nouveauLoyer)}.`);
  };

  const calcIrl =
    bail.revisionIRL.valeurIndice > 0 && nouvelIndice > 0
      ? revisionIRL(bail.loyerHC, bail.revisionIRL.valeurIndice, nouvelIndice)
      : null;

  return (
    <div>
      <PageHeader
        titre={`${bail.reference}`}
        sousTitre={`${bien.nom} — ${locataires.map((l) => `${l.prenom} ${l.nom}`).join(', ')}`}
        actions={<Badge tone={ui.tone}>{ui.label}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-accent-900">Conditions</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-accent-500">Type</dt>
            <dd>{TYPE_BAIL_LABELS[bail.typeBail]}</dd>
            <dt className="text-accent-500">Prise d'effet</dt>
            <dd>{format(new Date(bail.dateEffet), 'dd/MM/yyyy')} ({bail.dureeMois} mois)</dd>
            <dt className="text-accent-500">Loyer HC</dt>
            <dd>{formatEuros(bail.loyerHC)}</dd>
            <dt className="text-accent-500">Charges ({bail.charges.mode})</dt>
            <dd>{formatEuros(bail.charges.montant)}</dd>
            <dt className="text-accent-500">Dépôt de garantie</dt>
            <dd>{formatEuros(bail.depotGarantie)}</dd>
            <dt className="text-accent-500">Paiement</dt>
            <dd>
              le {bail.jourPaiement} de chaque mois, {bail.modePaiement}
            </dd>
            {bail.dateSignature && (
              <>
                <dt className="text-accent-500">Signé le</dt>
                <dd>{format(new Date(bail.dateSignature), 'dd/MM/yyyy')}</dd>
              </>
            )}
          </dl>
          <div className="mt-4 rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
            <span className="font-medium">Prorata du premier mois :</span> {prorata.joursOccupes} jours
            sur {prorata.joursDansMois} = {formatEuros(prorata.loyerHC)} HC +{' '}
            {formatEuros(prorata.charges)} de charges, soit {formatEuros(prorata.total)}.
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-accent-900">Documents et cycle de vie</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={telechargerPdf}>
              <Download size={14} /> Télécharger le PDF
            </Button>
            <Link to={`/baux/${bail.id}/modifier`}>
              <Button size="sm">
                <Pencil size={14} /> Modifier
              </Button>
            </Link>
            {bail.statut !== 'actif' && bail.statut !== 'termine' && (
              <Button variant="secondary" size="sm" onClick={() => majBail({ statut: 'actif' })}>
                Marquer le logement loué
              </Button>
            )}
            {bail.statut === 'actif' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => majBail({ statut: 'termine', dateFinEffective: nowISO() })}
              >
                Marquer terminé
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-accent-500">
            Le bail reste modifiable et régénérable à volonté : c'est le document imprimé et signé sur place
            qui fait foi. Il n'y a pas de signature numérique du bail.
          </p>
          {bail.statut === 'termine' && bail.dateFinEffective && (
            <p className="mt-3 text-sm text-accent-600">
              Bail terminé le {format(new Date(bail.dateFinEffective), 'dd/MM/yyyy')}.
            </p>
          )}
          <h3 className="mb-2 mt-5 text-sm font-semibold text-accent-900">Calculateurs</h3>
          <Button variant="secondary" size="sm" onClick={() => setModaleIrl(true)} disabled={!bail.revisionIRL.revisable}>
            <Calculator size={14} /> Révision IRL du loyer
          </Button>
          {!bail.revisionIRL.revisable && (
            <p className="mt-2 text-xs text-accent-500">Le loyer de ce bail n'est pas révisable.</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-accent-900">États des lieux</h2>
          <div className="space-y-2">
            {edlEntree ? (
              <Link
                to={`/edl/${edlEntree.id}`}
                className="flex items-center justify-between rounded-lg border border-accent-200 px-3 py-2 text-sm hover:bg-accent-50"
              >
                <span className="flex items-center gap-2">
                  <ClipboardList size={15} className="text-accent-400" /> Entrée — {edlEntree.reference}
                </span>
                <Badge tone={edlEntree.statut === 'signe' ? 'green' : 'orange'}>
                  {edlEntree.statut === 'signe' ? 'Signé' : 'Brouillon'}
                </Badge>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => creerEdl('entree')}>
                Créer l'état des lieux d'entrée
              </Button>
            )}
            {edlSortie ? (
              <Link
                to={`/edl/${edlSortie.id}`}
                className="flex items-center justify-between rounded-lg border border-accent-200 px-3 py-2 text-sm hover:bg-accent-50"
              >
                <span className="flex items-center gap-2">
                  <ClipboardList size={15} className="text-accent-400" /> Sortie — {edlSortie.reference}
                </span>
                <Badge tone={edlSortie.statut === 'signe' ? 'green' : 'orange'}>
                  {edlSortie.statut === 'signe' ? 'Signé' : 'Brouillon'}
                </Badge>
              </Link>
            ) : (
              edlEntree?.statut === 'signe' && (
                <Button variant="secondary" size="sm" onClick={() => creerEdl('sortie')}>
                  Créer l'état des lieux de sortie (comparatif)
                </Button>
              )
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold text-accent-900">Documents utiles</h2>
          <p className="mb-3 text-sm text-accent-500">
            Pré-remplis à partir de ce bail (hors bail et état des lieux, qui ont leurs propres blocs).
          </p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void genererFicheAide()}
              className="flex w-full items-start gap-3 rounded-lg border border-accent-200 px-3 py-2 text-left hover:bg-accent-50"
            >
              <Scale size={16} className="mt-0.5 shrink-0 text-accent-400" />
              <span>
                <span className="block text-sm font-medium text-accent-900">Fiche d'aide juridique</span>
                <span className="block text-xs text-accent-500">
                  Préavis, congés, notification, impayés, dépôt de garantie, prescription, ADIL.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void telechargerActeCautionnement()}
              className="flex w-full items-start gap-3 rounded-lg border border-accent-200 px-3 py-2 text-left hover:bg-accent-50"
            >
              <ShieldQuestion size={16} className="mt-0.5 shrink-0 text-accent-400" />
              <span>
                <span className="block text-sm font-medium text-accent-900">Attestation de garant</span>
                <span className="block text-xs text-accent-500">
                  Acte de cautionnement solidaire — modèle vierge, à compléter et signer à la main.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void genererGrilleVetuste()}
              className="flex w-full items-start gap-3 rounded-lg border border-accent-200 px-3 py-2 text-left hover:bg-accent-50"
            >
              <Ruler size={16} className="mt-0.5 shrink-0 text-accent-400" />
              <span>
                <span className="block text-sm font-medium text-accent-900">Grille de vétusté</span>
                <span className="block text-xs text-accent-500">
                  Annexe du bail (décret 2016-382), utilisée pour les retenues à la sortie.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setModaleIrl(true)}
              disabled={!bail.revisionIRL.revisable}
              className="flex w-full items-start gap-3 rounded-lg border border-accent-200 px-3 py-2 text-left hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <Calculator size={16} className="mt-0.5 shrink-0 text-accent-400" />
              <span>
                <span className="block text-sm font-medium text-accent-900">Courrier de révision IRL</span>
                <span className="block text-xs text-accent-500">
                  {bail.revisionIRL.revisable
                    ? 'Calcule le nouveau loyer et génère le courrier au locataire.'
                    : 'Indisponible : le loyer de ce bail n’est pas révisable.'}
                </span>
              </span>
            </button>
            {edlSortie?.statut === 'signe' ? (
              <Link
                to={`/edl/${edlSortie.id}/synthese`}
                className="flex w-full items-start gap-3 rounded-lg border border-accent-200 px-3 py-2 text-left hover:bg-accent-50"
              >
                <Receipt size={16} className="mt-0.5 shrink-0 text-accent-400" />
                <span>
                  <span className="block text-sm font-medium text-accent-900">
                    Lettre de restitution du dépôt
                  </span>
                  <span className="block text-xs text-accent-500">
                    Décompte des retenues et délais légaux, depuis la synthèse de sortie.
                  </span>
                </span>
              </Link>
            ) : (
              <div className="flex w-full items-start gap-3 rounded-lg border border-accent-200 px-3 py-2 opacity-50">
                <Receipt size={16} className="mt-0.5 shrink-0 text-accent-400" />
                <span>
                  <span className="block text-sm font-medium text-accent-900">
                    Lettre de restitution du dépôt
                  </span>
                  <span className="block text-xs text-accent-500">
                    Disponible une fois l'état des lieux de sortie signé.
                  </span>
                </span>
              </div>
            )}
          </div>
        </Card>
      </div>


      <Modal
        open={modaleIrl}
        onClose={() => setModaleIrl(false)}
        title="Révision annuelle du loyer (IRL)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModaleIrl(false)}>
              Fermer
            </Button>
            <Button onClick={genererCourrierIrl} disabled={!calcIrl || !nouveauTrimestre.trim()}>
              Générer le courrier PDF
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-accent-600">
            Indice de référence au bail : {bail.revisionIRL.valeurIndice} (
            {bail.revisionIRL.trimestreReference || 'trimestre non renseigné'}). Saisissez le
            nouvel indice publié par l'INSEE pour le même trimestre.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nouveau trimestre" hint="Ex. « 1er trimestre 2027 »">
              <Input value={nouveauTrimestre} onChange={(e) => setNouveauTrimestre(e.target.value)} />
            </Field>
            <Field label="Nouvel indice IRL">
              <Input
                type="number"
                step="0.01"
                value={nouvelIndice || ''}
                onChange={(e) => setNouvelIndice(Number(e.target.value))}
              />
            </Field>
          </div>
          {calcIrl && (
            <div className="rounded-lg bg-accent-50 p-4 text-sm text-accent-800">
              Nouveau loyer hors charges : <span className="font-semibold">{formatEuros(calcIrl.nouveauLoyer)}</span>{' '}
              (+{formatEuros(calcIrl.augmentation)}, soit {calcIrl.pct} %).
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
