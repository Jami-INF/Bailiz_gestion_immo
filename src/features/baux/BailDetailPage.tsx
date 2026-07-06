import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import {
  Calculator,
  ClipboardList,
  Download,
  FileSignature,
  PenLine,
  Printer,
  RefreshCcw,
} from 'lucide-react';
import { db, getParametres, prochaineReference } from '@/lib/db';
import { uid, nowISO } from '@/lib/ids';
import type { Bail, EtatDesLieux, Locataire, SignatureBloc } from '@/types';
import { TYPE_BAIL_LABELS } from '@/types';
import { formatEuros, prorataPremierLoyer, revisionIRL } from '@/lib/calculs';
import { construirePiecesSortie } from '@/lib/etat';
import {
  rendrePdf,
  rendrePdfAvecHash,
  enregistrerDocument,
  telechargerDocument,
} from '@/lib/pdf/generer';
import { BailPdf } from '@/lib/pdf/BailPdf';
import { CourrierIrlPdf } from '@/lib/pdf/CourrierIrlPdf';
import { SignatureFlow } from '@/components/SignatureFlow';
import { pousserSiActive } from '@/lib/autosave';
import { Badge, Button, Card, DateInput, Field, Input, Modal, PageHeader, useToast } from '@/components/ui';
import { STATUT_BAIL_UI } from './BauxPage';
import { InventairePanel } from './InventairePanel';

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
  const [modaleSignature, setModaleSignature] = useState(false);
  const [modaleSignatureEcran, setModaleSignatureEcran] = useState(false);
  const [signatureEnCours, setSignatureEnCours] = useState(false);
  const [dateSignature, setDateSignature] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [modaleIrl, setModaleIrl] = useState(false);
  const [nouvelIndice, setNouvelIndice] = useState(0);
  const [nouveauTrimestre, setNouveauTrimestre] = useState('');

  if (!bail || !bien || !locataires || !parametres) return null;

  const bailleurNomComplet = `${parametres.bailleur.prenom} ${parametres.bailleur.nom}`.trim();
  const ui = STATUT_BAIL_UI[bail.statut];
  const edlEntree = edls?.find((e) => e.type === 'entree');
  const edlSortie = edls?.find((e) => e.type === 'sortie');
  const prorata = prorataPremierLoyer(new Date(bail.dateEffet), bail.loyerHC, bail.charges.montant);

  const majBail = (m: Partial<Bail>) => db.baux.put({ ...bail, ...m, updatedAt: nowISO() });

  const regenererPdf = async () => {
    const parametres = await getParametres();
    const blob = await rendrePdf(
      <BailPdf bail={bail} bien={bien} locataires={locataires} parametres={parametres} />,
    );
    await enregistrerDocument({
      reference: bail.reference,
      type: 'bail',
      titre: `Bail meublé — ${bien.nom}`,
      blob,
      bienId: bien.id,
      bailId: bail.id,
    });
    telechargerDocument({ blob, reference: bail.reference });
  };

  const telechargerPdf = async () => {
    const doc = await db.documents.where('reference').equals(bail.reference).last();
    if (doc) telechargerDocument(doc);
    else await regenererPdf();
  };

  const confirmerSignature = async () => {
    await majBail({ statut: 'signe', dateSignature });
    setModaleSignature(false);
    toast('success', 'Bail marqué comme signé.');
  };

  /**
   * Signature du bail sur écran (voie c) : mêmes renforts probatoires que
   * l'EDL — horodatage, mention « lu et approuvé », empreinte SHA-256,
   * verrouillage (le bail signé n'est plus régénérable).
   */
  const signerSurEcran = async (bloc: SignatureBloc) => {
    setSignatureEnCours(true);
    try {
      const parametres = await getParametres();
      const bailSigne: Bail = {
        ...bail,
        signatures: bloc,
        statut: 'signe',
        dateSignature: bloc.dateSignature,
        updatedAt: nowISO(),
      };
      const { blob, hash } = await rendrePdfAvecHash((h) => (
        <BailPdf bail={bailSigne} bien={bien} locataires={locataires} parametres={parametres} hash={h} />
      ));
      bailSigne.pdfHash = hash;
      await db.baux.put(bailSigne);
      await enregistrerDocument({
        reference: bail.reference,
        type: 'bail',
        titre: `Bail meublé — ${bien.nom} (signé)`,
        blob,
        hash,
        signe: true,
        bienId: bien.id,
        bailId: bail.id,
      });
      telechargerDocument({ blob, reference: bail.reference });
      setModaleSignatureEcran(false);
      toast('success', `Bail signé et verrouillé. Empreinte SHA-256 : ${hash.slice(0, 16)}…`);
      void pousserSiActive(true).then((r) => {
        if (r === 'ok') toast('success', 'Sauvegarde automatique poussée dans le dossier synchronisé.');
      });
    } catch (e) {
      console.error(e);
      toast('error', 'Erreur lors de la génération du bail signé.');
    } finally {
      setSignatureEnCours(false);
    }
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
          : bien.piecesModele.map((p, i) => ({
              id: uid(),
              nom: p.nom,
              ordre: i,
              elements: p.elements.map((e) => ({
                id: uid(),
                nom: e.nom,
                categorie: e.categorie,
                photoIds: [],
              })),
            })),
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
    await enregistrerDocument({
      reference,
      type: 'courrier_irl',
      titre: `Révision IRL — ${bien.nom}`,
      blob,
      bienId: bien.id,
      bailId: bail.id,
    });
    telechargerDocument({ blob, reference });
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
              <Download size={14} /> PDF du bail
            </Button>
            {['brouillon', 'genere'].includes(bail.statut) && (
              <>
                <Button variant="ghost" size="sm" onClick={regenererPdf}>
                  <RefreshCcw size={14} /> Régénérer
                </Button>
                <Button size="sm" onClick={() => setModaleSignature(true)}>
                  <FileSignature size={14} /> Faire signer le bail
                </Button>
              </>
            )}
            {bail.statut === 'signe' && (
              <Button size="sm" onClick={() => majBail({ statut: 'actif' })}>
                Marquer comme actif
              </Button>
            )}
          </div>
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

        <InventairePanel bail={bail} bien={bien} locataires={locataires} />

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
      </div>

      <Modal
        open={modaleSignature}
        onClose={() => setModaleSignature(false)}
        title="Signature du bail — trois voies possibles"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModaleSignature(false)}>
              Annuler
            </Button>
            <Button onClick={confirmerSignature}>Confirmer (voie a ou b)</Button>
          </>
        }
      >
        <div className="space-y-4 text-sm text-accent-700">
          <div className="rounded-lg border border-accent-200 p-4">
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-accent-900">
              <Printer size={16} /> a) Impression + signature manuscrite
            </h3>
            <p>
              Imprimez le PDF en autant d'exemplaires que de parties, faites précéder chaque
              signature de la mention « lu et approuvé », et paraphez chaque page.
            </p>
          </div>
          <div className="rounded-lg border border-accent-200 p-4">
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-accent-900">
              <FileSignature size={16} /> b) Signature électronique via un prestataire eIDAS
              (recommandée)
            </h3>
            <p>
              Exportez le PDF puis faites-le signer via un prestataire de confiance (Yousign,
              DocuSign…). C'est la voie à la valeur probante la plus forte en cas de litige.
            </p>
          </div>
          <div className="rounded-lg border border-accent-200 p-4">
            <h3 className="mb-1 flex items-center gap-2 font-semibold text-accent-900">
              <PenLine size={16} /> c) Signature sur écran, dans l'app (comme un état des lieux)
            </h3>
            <p>
              Toutes les parties signent au doigt ou au stylet, avec nom tapé, mention « lu et
              approuvé », horodatage et empreinte SHA-256 du PDF. Il s'agit d'une signature
              électronique <em>simple</em> (art. 1366-1367 du Code civil) : valable, mais de
              valeur probante plus faible qu'un prestataire eIDAS.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => {
                setModaleSignature(false);
                setModaleSignatureEcran(true);
              }}
            >
              <PenLine size={14} /> Signer sur écran maintenant
            </Button>
          </div>
          <Field
            label="Date de signature effective (voies a et b)"
            hint="Date à laquelle le bail a été signé sur papier ou chez le prestataire."
          >
            <DateInput value={dateSignature} onChange={(d) => d && setDateSignature(d)} />
          </Field>
          <p className="text-xs text-accent-500">
            En confirmant, le bail passe au statut « signé ». Il ne sera plus régénérable.
          </p>
        </div>
      </Modal>

      <Modal
        open={modaleSignatureEcran}
        onClose={() => !signatureEnCours && setModaleSignatureEcran(false)}
        title={`Signature du bail ${bail.reference} sur écran`}
        wide
      >
        {signatureEnCours ? (
          <p className="py-10 text-center text-accent-600">
            Génération du PDF signé et calcul de l'empreinte SHA-256…
          </p>
        ) : (
          <SignatureFlow
            libelleDocument={`Bail meublé ${bail.reference}`}
            bailleurNom={bailleurNomComplet}
            locatairesNoms={locataires.map((l) => `${l.prenom} ${l.nom}`)}
            onTermine={(bloc) => void signerSurEcran(bloc)}
            recapitulatif={<RecapBail bail={bail} bienNom={bien.nom} locataires={locataires} />}
          />
        )}
      </Modal>

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

/** Récapitulatif du bail relu avant la signature sur écran. */
function RecapBail({
  bail,
  bienNom,
  locataires,
}: {
  bail: Bail;
  bienNom: string;
  locataires: Locataire[];
}) {
  return (
    <div className="space-y-2 text-sm text-accent-800">
      <p>
        <span className="font-semibold">Logement :</span> {bienNom}
      </p>
      <p>
        <span className="font-semibold">Locataire(s) :</span>{' '}
        {locataires.map((l) => `${l.civilite} ${l.prenom} ${l.nom}`).join(', ')}
        {bail.locataireIds.length > 1 &&
          (bail.clauseSolidarite ? ' — avec clause de solidarité' : ' — sans solidarité')}
      </p>
      <p>
        <span className="font-semibold">Type :</span> {TYPE_BAIL_LABELS[bail.typeBail]} — prise
        d'effet le {format(new Date(bail.dateEffet), 'dd/MM/yyyy')}, durée {bail.dureeMois} mois
      </p>
      <p>
        <span className="font-semibold">Loyer :</span> {formatEuros(bail.loyerHC)} hors charges
        + {formatEuros(bail.charges.montant)} de charges ({bail.charges.mode}), payable le{' '}
        {bail.jourPaiement} de chaque mois par {bail.modePaiement}
      </p>
      <p>
        <span className="font-semibold">Dépôt de garantie :</span> {formatEuros(bail.depotGarantie)}
      </p>
      <p>
        <span className="font-semibold">Révision IRL :</span>{' '}
        {bail.revisionIRL.revisable
          ? `oui — ${bail.revisionIRL.trimestreReference}, indice ${bail.revisionIRL.valeurIndice}`
          : 'non révisable'}
      </p>
      {bail.clausesParticulieres.length > 0 && (
        <div>
          <p className="font-semibold">Clauses particulières :</p>
          <ul className="list-inside list-disc">
            {bail.clausesParticulieres.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      <p>
        <span className="font-semibold">Annexes jointes :</span>{' '}
        {bail.annexesChecklist.filter((a) => a.jointe).map((a) => a.libelle).join(' ; ') || 'aucune'}
      </p>
      <p className="text-xs text-accent-500">
        Relisez le PDF complet du bail avant de signer : ce récapitulatif ne remplace pas la
        lecture du contrat (parties I à VIII).
      </p>
    </div>
  );
}
