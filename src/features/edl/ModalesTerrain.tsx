import { format } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import type { EtatDesLieux } from '@/types';
import type { ElementNonRenseigne } from '@/lib/etat';
import { Button, Field, Input, Modal, Textarea } from '@/components/ui';

/*
 * Les quatre modales du mode terrain, sorties de `EdlTerrainPage`.
 *
 * Elles n'ont aucun état propre : tout vient de la page, qui reste seule à
 * décider et à écrire. Les regrouper ici retire 140 lignes de balisage du corps
 * de l'écran sans déplacer une seule décision.
 */

/**
 * Récapitulatif des éléments sans état, à l'approche de la signature.
 *
 * Elle ne bloque jamais : on montre ce qui manque, l'utilisateur tranche. Un
 * constat incomplet reste un constat, et le terrain a toujours le dernier mot.
 */
export function ModaleOublis({
  open,
  oublis,
  onFermer,
  onAllerALaPiece,
  onSignerQuandMeme,
}: {
  open: boolean;
  oublis: ElementNonRenseigne[];
  onFermer: () => void;
  onAllerALaPiece: (pieceId: string) => void;
  onSignerQuandMeme: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onFermer}
      title={`${oublis.length} élément(s) sans état renseigné`}
      footer={
        <>
          <Button variant="secondary" onClick={onFermer}>
            Continuer la saisie
          </Button>
          <Button onClick={onSignerQuandMeme}>Signer quand même</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-accent-700">
          Un élément sans état ne prouve rien à la sortie : il ne pourra pas servir de point de
          comparaison. Touchez une ligne pour aller directement à sa pièce.
        </p>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {oublis.map((o) => (
            <li key={o.elementId}>
              <button
                type="button"
                onClick={() => onAllerALaPiece(o.pieceId)}
                className="flex min-h-touch w-full items-center justify-between gap-3 rounded-lg border border-accent-200 px-3 py-2 text-left text-sm hover:bg-accent-50"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-accent-900">{o.elementNom}</span>
                  <span className="block text-xs text-accent-500">{o.pieceNom}</span>
                </span>
                <ArrowRight size={16} className="shrink-0 text-accent-400" />
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-accent-500">
          Dans chaque pièce, « Renseigner d&apos;un coup les éléments restants » pose l&apos;état
          commun, puis vous corrigez les exceptions.
        </p>
      </div>
    </Modal>
  );
}

/** Réouverture d'un état des lieux signé, avec ce que cela implique. */
export function ModaleRectifier({
  open,
  edl,
  onFermer,
  onRectifier,
}: {
  open: boolean;
  edl: EtatDesLieux;
  onFermer: () => void;
  onRectifier: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onFermer}
      title="Rectifier l'état des lieux"
      footer={
        <>
          <Button variant="secondary" onClick={onFermer}>
            Annuler
          </Button>
          <Button onClick={onRectifier}>Rouvrir pour rectification</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-accent-700">
        <p>
          La rectification d&apos;un état des lieux signé n&apos;est possible qu&apos;avec{' '}
          <strong>l&apos;accord et la re-signature des deux parties</strong> (document
          contradictoire).
        </p>
        {edl.signatures && (
          <div className="rounded-lg bg-accent-50 p-3">
            <p className="font-medium text-accent-800">Version signée actuelle (conservée) :</p>
            <p className="text-xs">
              Signée le {format(new Date(edl.signatures.dateSignature), "dd/MM/yyyy 'à' HH:mm:ss")}
              {edl.pdfHash ? ` - empreinte ${edl.pdfHash.slice(0, 16)}…` : ''}.
            </p>
          </div>
        )}
        <p>
          Le document va redevenir <strong>modifiable</strong>. Une fois re-signée, la nouvelle
          version <strong>annulera et remplacera</strong> la précédente ; l&apos;original signé
          reste conservé dans les Documents.
        </p>
      </div>
    </Modal>
  );
}

export function ModalePiece({
  open,
  nom,
  onNomChange,
  onFermer,
  onAjouter,
}: {
  open: boolean;
  nom: string;
  onNomChange: (nom: string) => void;
  onFermer: () => void;
  onAjouter: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onFermer}
      title="Ajouter une pièce"
      footer={
        <>
          <Button variant="secondary" onClick={onFermer}>
            Annuler
          </Button>
          <Button onClick={onAjouter} disabled={!nom.trim()}>
            Ajouter la pièce
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nom de la pièce" required>
          <Input
            value={nom}
            onChange={(e) => onNomChange(e.target.value)}
            placeholder="Ex. Chambre 2, Buanderie, Balcon…"
          />
        </Field>
        <p className="text-xs text-accent-500">
          La pièce est aussi ajoutée à la fiche du logement. Vous pourrez y ajouter ses éléments
          juste après.
        </p>
      </div>
    </Modal>
  );
}

/**
 * Avenant au constat. `joursDepuisSignature` sert à rappeler le délai légal de
 * dix jours d'un état des lieux d'entrée - passé ce délai, l'avenant demande
 * l'accord des deux parties.
 */
export function ModaleAvenant({
  open,
  texte,
  onTexteChange,
  typeEdl,
  joursDepuisSignature,
  onFermer,
  onAjouter,
}: {
  open: boolean;
  texte: string;
  onTexteChange: (texte: string) => void;
  typeEdl: EtatDesLieux['type'];
  joursDepuisSignature: number | null;
  onFermer: () => void;
  onAjouter: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onFermer}
      title="Avenant à l'état des lieux"
      footer={
        <>
          <Button variant="secondary" onClick={onFermer}>
            Annuler
          </Button>
          <Button onClick={onAjouter} disabled={!texte.trim()}>
            Ajouter l&apos;avenant
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {typeEdl === 'entree' && joursDepuisSignature !== null && joursDepuisSignature > 10 && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Le délai légal de 10 jours est dépassé : l&apos;avenant nécessite l&apos;accord des deux
            parties (hors chauffage pendant le premier mois de chauffe).
          </p>
        )}
        <Field label="Texte de l'avenant" required>
          <Textarea
            rows={5}
            value={texte}
            onChange={(e) => onTexteChange(e.target.value)}
            placeholder="Ex. : Complément demandé par le locataire - rayure constatée sur le parquet du séjour…"
          />
        </Field>
        <p className="text-xs text-accent-500">
          L&apos;avenant est daté automatiquement et apparaîtra sur le PDF.
        </p>
      </div>
    </Modal>
  );
}
