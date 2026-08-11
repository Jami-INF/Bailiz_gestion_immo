import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CheckCircle2, Download, Mail, Scale } from 'lucide-react';
import { db } from '@/lib/db';
import { nowISO } from '@/lib/ids';
import { signataireBailleur } from '@/lib/bailleur';
import type { EtatDesLieux, SignatureBloc } from '@/types';
import { ETAT_LABELS, COMPTEUR_LABELS } from '@/types';
import { formatHash } from '@/lib/crypto';
import { elementsNonRenseignes } from '@/lib/etat';
import { decrireErreur } from '@/lib/erreurs';
import {
  rendrePdfAvecHash,
  enregistrerDocument,
  nomsPersonnes,
  telechargerDocument,
} from '@/lib/pdf/generer';
import { pousserSiActive } from '@/lib/autosave';
import { EdlPdf } from '@/lib/pdf/EdlPdf';
import { SignatureFlow } from '@/components/SignatureFlow';
import { Button, Card, useToast } from '@/components/ui';
import { chargerComparaisons, chargerContexteEdl, chargerPhotosPourPdf } from './edlPdfUtils';

export function EdlSignaturePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const edl = useLiveQuery(() => (id ? db.edls.get(id) : undefined), [id]);
  const contexte = useLiveQuery(async () => (edl ? chargerContexteEdl(edl) : undefined), [edl?.id, edl?.statut]);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<{ hash: string; blob: Blob } | null>(null);

  if (!edl || !contexte) return null;
  const { bail, bien, locataires, parametres } = contexte;

  if (edl.statut === 'signe' && !resultat) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Card className="text-center">
          <p className="text-accent-700">Cet état des lieux est déjà signé et verrouillé.</p>
          <Link to={`/edl/${edl.id}`}>
            <Button variant="secondary" className="mt-4">
              <ArrowLeft size={16} /> Retour
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const oublis = elementsNonRenseignes(edl.pieces);

  const signer = async (bloc: SignatureBloc) => {
    setEnCours(true);
    try {
      const edlSigne: EtatDesLieux = { ...edl, signatures: bloc, statut: 'signe', updatedAt: nowISO() };
      const photos = await chargerPhotosPourPdf(edlSigne);
      // Paires avant/après des dégradations (vide pour un EDL d'entrée).
      const comparaisons = await chargerComparaisons(edlSigne);
      const { blob, hash } = await rendrePdfAvecHash((h) => (
        <EdlPdf
          edl={edlSigne}
          bail={bail}
          bien={bien}
          locataires={locataires}
          parametres={parametres}
          photos={photos}
          comparaisons={comparaisons}
          hash={h}
        />
      ));
      edlSigne.pdfHash = hash;
      // Verrouillage : l'EDL signé devient immuable (lecture seule dans l'app).
      await db.edls.put(edlSigne);
      const suffixe = edl.rectifications?.length
        ? ` (rectificatif n°${edl.rectifications.length}, signé)`
        : ' (signé)';
      await enregistrerDocument({
        reference: edl.reference,
        type: edl.type === 'entree' ? 'edl_entree' : 'edl_sortie',
        titre: `EDL ${edl.type === 'entree' ? "d'entrée" : 'de sortie'} — ${bien.nom} — ${nomsPersonnes(locataires)}${suffixe}`,
        blob,
        hash,
        signe: true,
        bienId: bien.id,
        bailId: bail?.id,
        edlId: edl.id,
      });
      /*
       * Les bascules de statut ci-dessous n'ont de sens que s'il existe un bail.
       * Un constat établi sans contrat rédigé ici n'en invente aucun :
       * l'application ne sait pas si le logement est loué, elle ne l'affirme pas.
       */
      if (bail && edl.type === 'sortie') {
        await db.baux.put({ ...bail, statut: 'termine', dateFinEffective: bloc.dateSignature, updatedAt: nowISO() });
      } else if (bail && bail.statut !== 'actif' && bail.statut !== 'termine') {
        /*
         * Un EDL d'entrée signé, c'est la remise des clés : le logement est
         * loué. Le bail restait sinon « généré » jusqu'à ce que l'utilisateur
         * pense à cliquer « Marquer le logement loué » — et le tableau de bord
         * annonçait le logement vacant, sans fin de bail ni révision à venir.
         */
        await db.baux.put({ ...bail, statut: 'actif', updatedAt: nowISO() });
      }
      setResultat({ hash, blob });
      /*
       * Mise à l'abri immédiate. `apresSignature` abaisse le seuil de
       * l'instantané à vingt-quatre heures : un état des lieux signé ne se
       * ressaisit pas, il ne doit pas attendre le filet hebdomadaire.
       */
      void pousserSiActive(true, { apresSignature: true }).then((r) => {
        if (r === 'ok') toast('success', 'Sauvegarde automatique poussée dans le dossier synchronisé.');
        else if (r === 'bloque')
          toast('warning', "Document signé. Synchronisation interrompue par une vérification de sécurité (horloge de l'appareil, ou suppressions inhabituelles). Ouvrez les Paramètres pour décider.");
        else if (r === 'permission_requise' || r === 'erreur')
          toast('warning', 'Sauvegarde automatique impossible — pensez à exporter depuis les Paramètres.');
      });
    } catch (e) {
      console.error(e);
      toast('error', `Échec de la signature — ${decrireErreur(e)}`);
    } finally {
      setEnCours(false);
    }
  };

  if (resultat) {
    const sujet = encodeURIComponent(`${edl.reference} — État des lieux ${edl.type === 'entree' ? "d'entrée" : 'de sortie'} — ${bien.adresse.ligne1}`);
    const corps = encodeURIComponent(
      `Bonjour,\n\nConformément à l'article 3-2 de la loi du 6 juillet 1989, veuillez trouver ci-joint votre exemplaire de l'état des lieux ${
        edl.type === 'entree' ? "d'entrée" : 'de sortie'
      } établi contradictoirement et signé ce jour (remise par voie dématérialisée).\n\nRéférence : ${edl.reference}\nEmpreinte SHA-256 du document : ${resultat.hash}\n\n(Pensez à joindre le fichier PDF « ${edl.reference}.pdf » téléchargé depuis l'application avant l'envoi.)\n\nCordialement,\n${signataireBailleur(parametres.bailleur)}`,
    );
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Card className="space-y-4">
          <div className="flex flex-col items-center text-center">
            <CheckCircle2 size={48} className="text-green-600" />
            <h1 className="mt-2 text-xl font-bold text-accent-900">Document signé et verrouillé</h1>
            <p className="mt-1 text-sm text-accent-600">
              L'état des lieux est désormais immuable. Toute correction passera par un avenant daté.
            </p>
          </div>
          <div className="rounded-lg bg-accent-50 p-3">
            <p className="text-xs font-medium text-accent-500">Empreinte SHA-256 du PDF finalisé :</p>
            <p className="break-all font-mono text-xs text-accent-800">{formatHash(resultat.hash)}</p>
          </div>
          {edl.type === 'entree' && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
              Le locataire dispose de <strong>10 jours</strong> pour demander un complément à
              l'état des lieux d'entrée (et du 1er mois de chauffe pour le chauffage). Le bouton
              « Créer un avenant » est disponible sur la fiche de l'EDL.
            </p>
          )}
          <h2 className="font-semibold text-accent-900">Transmettre une copie</h2>
          <p className="text-sm text-accent-600">
            1. Téléchargez le PDF. 2. Envoyez-le à chaque partie (l'e-mail est pré-rempli ;
            joignez-y le fichier téléchargé). Conservez l'original en lieu sûr et faites une
            sauvegarde depuis les Paramètres.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() =>
                telechargerDocument({
                  blob: resultat.blob,
                  reference: edl.reference,
                  titre: `EDL ${edl.type === 'entree' ? "d'entrée" : 'de sortie'} — ${bien.nom} — ${nomsPersonnes(locataires)} (signé)`,
                })
              }
            >
              <Download size={16} /> Télécharger le PDF signé
            </Button>
            <a href={`mailto:${locataires.map((l) => l.email).join(',')}?subject=${sujet}&body=${corps}`}>
              <Button variant="secondary" className="w-full">
                <Mail size={16} /> Envoyer une copie par e-mail
              </Button>
            </a>
            {edl.type === 'sortie' && (
              <Link to={`/edl/${edl.id}/synthese`}>
                <Button variant="secondary" className="w-full">
                  <Scale size={16} /> Synthèse comparative & lettre de restitution
                </Button>
              </Link>
            )}
            <Button variant="ghost" onClick={() => navigate(bail ? `/baux/${bail.id}` : '/edl')}>
              {bail ? 'Retour au bail' : 'Retour aux états des lieux'}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button
        onClick={() => navigate(`/edl/${edl.id}`)}
        className="mb-4 flex items-center gap-1 text-sm font-medium text-accent-700"
      >
        <ArrowLeft size={16} /> Retour à l'état des lieux
      </button>
      {oublis.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">
            Attention : {oublis.length} élément(s) n'ont pas encore d'état renseigné. Ils
            apparaîtront « non renseigné » sur le PDF.
          </p>
          {/* Les nommer, pas seulement les compter : on ne retourne pas relever
              un oubli sans savoir lequel ni dans quelle pièce. */}
          <ul className="mt-2 space-y-0.5 text-xs">
            {oublis.slice(0, 12).map((o) => (
              <li key={o.elementId}>
                {o.pieceNom} — {o.elementNom}
              </li>
            ))}
            {oublis.length > 12 && <li>… et {oublis.length - 12} autre(s).</li>}
          </ul>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => navigate(`/edl/${edl.id}`)}
          >
            <ArrowLeft size={14} /> Retourner les compléter
          </Button>
        </div>
      )}
      <Card>
        {enCours ? (
          <p className="py-10 text-center text-accent-600">Génération du PDF signé et calcul de l'empreinte…</p>
        ) : (
          <SignatureFlow
            libelleDocument={`État des lieux ${edl.type === 'entree' ? "d'entrée" : 'de sortie'} ${edl.reference}`}
            bailleurNom={signataireBailleur(parametres.bailleur)}
            locatairesNoms={locataires.map((l) => `${l.prenom} ${l.nom}`)}
            onTermine={(bloc) => void signer(bloc)}
            recapitulatif={<RecapEdl edl={edl} />}
          />
        )}
      </Card>
    </div>
  );
}

function RecapEdl({ edl }: { edl: EtatDesLieux }) {
  return (
    <div className="space-y-3 text-sm text-accent-800">
      <div>
        <h3 className="font-semibold">Compteurs</h3>
        {edl.compteurs.map((c, i) => (
          <p key={i}>
            {COMPTEUR_LABELS[c.type]} {c.numero ? `(n° ${c.numero})` : ''} : {c.releve}
          </p>
        ))}
      </div>
      <div>
        <h3 className="font-semibold">Clés</h3>
        {edl.cles.map((c, i) => (
          <p key={i}>
            {c.designation} × {c.nombre} {c.commentaire ? `— ${c.commentaire}` : ''}
          </p>
        ))}
      </div>
      {[...edl.pieces]
        .sort((a, b) => a.ordre - b.ordre)
        .map((p) => (
          <div key={p.id}>
            <h3 className="font-semibold">{p.nom}</h3>
            {p.elements.map((el) => (
              <p key={el.id}>
                {el.nom} : {el.etat ? ETAT_LABELS[el.etat] : 'non renseigné'}
                {edl.type === 'sortie' && el.etatEntree ? ` (entrée : ${ETAT_LABELS[el.etatEntree]})` : ''}
                {el.degradation ? ' — DÉGRADATION' : ''}
                {el.commentaire ? ` — ${el.commentaire}` : ''}
                {el.photoIds.length > 0 ? ` — ${el.photoIds.length} photo(s)` : ''}
              </p>
            ))}
          </div>
        ))}
      {edl.observationsGenerales && (
        <div>
          <h3 className="font-semibold">Observations générales</h3>
          <p>{edl.observationsGenerales}</p>
        </div>
      )}
    </div>
  );
}
