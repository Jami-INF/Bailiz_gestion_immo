import { useEffect, useRef, useState, type ReactNode } from 'react';
import SignaturePad from 'signature_pad';
import { Eraser, PenLine } from 'lucide-react';
import type { SignatureBloc, SignatureItem } from '@/types';
import { nowISO } from '@/lib/ids';
import { Button, Checkbox, Field, Input } from '@/components/ui';

interface Signataire {
  role: 'bailleur' | 'locataire';
  nomPropose: string;
}

/**
 * Parcours de signature sur écran (EDL, inventaire, avenants) :
 * relecture obligatoire → pour chaque signataire : nom tapé, case
 * « lu et approuvé », signature au doigt/stylet → horodatage automatique.
 */
export function SignatureFlow({
  recapitulatif,
  bailleurNom,
  locatairesNoms,
  onTermine,
  libelleDocument,
}: {
  recapitulatif: ReactNode;
  bailleurNom: string;
  locatairesNoms: string[];
  onTermine: (bloc: SignatureBloc) => void;
  libelleDocument: string;
}) {
  const signataires: Signataire[] = [
    { role: 'bailleur', nomPropose: bailleurNom },
    ...locatairesNoms.map((n) => ({ role: 'locataire' as const, nomPropose: n })),
  ];
  const [phase, setPhase] = useState<'relecture' | number>('relecture');
  const [relu, setRelu] = useState(false);
  const [lieu, setLieu] = useState('');
  const [faits, setFaits] = useState<SignatureItem[]>([]);
  const [nom, setNom] = useState('');
  const [luApprouve, setLuApprouve] = useState(false);
  const [aDessine, setADessine] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  const index = typeof phase === 'number' ? phase : -1;

  useEffect(() => {
    if (typeof phase !== 'number' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const pad = new SignaturePad(canvas, { penColor: '#1e293b' });
    padRef.current = pad;
    const marquer = () => setADessine(true);
    // beginStroke : le bouton s'active dès que l'utilisateur commence à signer.
    pad.addEventListener('beginStroke', marquer);
    pad.addEventListener('endStroke', marquer);

    // Dimensionne le canvas à sa taille réelle (en préservant un tracé en cours).
    // Si le layout n'est pas encore prêt (largeur 0), on retente à la frame suivante
    // — c'est la cause du bouton « signer » qui restait grisé.
    const dimensionner = () => {
      const largeur = canvas.offsetWidth;
      if (largeur === 0) {
        requestAnimationFrame(dimensionner);
        return;
      }
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = largeur * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
      if (data.length) pad.fromData(data);
    };
    dimensionner();
    window.addEventListener('resize', dimensionner);
    return () => {
      window.removeEventListener('resize', dimensionner);
      pad.off();
    };
  }, [phase]);

  const commencer = () => {
    setNom(signataires[0].nomPropose);
    setLuApprouve(false);
    setADessine(false);
    setPhase(0);
  };

  const validerSignature = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty() || !nom.trim() || !luApprouve) return;
    const item: SignatureItem = {
      nomComplet: nom.trim(),
      luEtApprouve: true,
      imageDataUrl: pad.toDataURL('image/png'),
      horodatage: nowISO(),
    };
    const nouveaux = [...faits, item];
    if (index + 1 < signataires.length) {
      setFaits(nouveaux);
      setNom(signataires[index + 1].nomPropose);
      setLuApprouve(false);
      setADessine(false);
      setPhase(index + 1);
    } else {
      onTermine({
        dateSignature: nowISO(),
        lieu: lieu.trim() || '—',
        bailleur: nouveaux[0],
        locataires: nouveaux.slice(1),
      });
    }
  };

  if (phase === 'relecture') {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-accent-900">Relecture avant signature</h2>
        <p className="text-sm text-accent-600">
          Relisez l'intégralité du récapitulatif du document « {libelleDocument} » avec toutes
          les parties présentes. La signature interviendra ensuite, signataire par signataire.
        </p>
        <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-accent-200 bg-accent-50 p-4">
          {recapitulatif}
        </div>
        <Field label="Lieu de signature" required>
          <Input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Ville" />
        </Field>
        <Checkbox
          label="Le récapitulatif a été relu en présence de toutes les parties"
          checked={relu}
          onChange={(e) => setRelu(e.target.checked)}
        />
        <Button size="lg" className="w-full" disabled={!relu || !lieu.trim()} onClick={commencer}>
          <PenLine size={18} /> Passer aux signatures
        </Button>
      </div>
    );
  }

  const courant = signataires[index];
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-accent-900">
        Signature {index + 1}/{signataires.length} —{' '}
        {courant.role === 'bailleur' ? 'Bailleur' : 'Locataire'}
      </h2>
      <Field label="Nom complet du signataire (tapé par le signataire)" required>
        <Input value={nom} onChange={(e) => setNom(e.target.value)} />
      </Field>
      <Checkbox
        label="Lu et approuvé — je reconnais avoir pris connaissance de l'intégralité du document"
        checked={luApprouve}
        onChange={(e) => setLuApprouve(e.target.checked)}
      />
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-accent-800">Signature au doigt ou au stylet</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              padRef.current?.clear();
              setADessine(false);
            }}
          >
            <Eraser size={14} /> Effacer
          </Button>
        </div>
        <canvas
          ref={canvasRef}
          className="h-48 w-full touch-none rounded-lg border-2 border-dashed border-accent-300 bg-white"
        />
      </div>
      <p className="text-xs text-accent-500">
        L'horodatage (date et heure, ISO 8601) est apposé automatiquement sous la signature.
      </p>
      <Button
        size="lg"
        className="w-full"
        disabled={!nom.trim() || !luApprouve || !aDessine}
        onClick={validerSignature}
      >
        {index + 1 < signataires.length ? 'Valider et passer au signataire suivant' : 'Valider la dernière signature'}
      </Button>
    </div>
  );
}
