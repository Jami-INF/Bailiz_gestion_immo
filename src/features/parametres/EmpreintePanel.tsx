import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, HelpCircle, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { formatHash } from '@/lib/crypto';
import { decrireErreur } from '@/lib/erreurs';
import { empreinteValide, verifierFichier, type ResultatVerification } from '@/lib/empreinte';
import { Button, CarteRepliable, Field, Input } from '@/components/ui';

/**
 * Vérificateur d'empreinte.
 *
 * Chaque document signé porte un SHA-256 en pied de page. Tant que personne ne
 * peut le **recalculer**, cette empreinte n'est qu'une décoration : c'est ici
 * qu'elle devient un moyen de preuve. Trois usages : un locataire doute de
 * l'exemplaire reçu, on retrouve un vieux PDF sans savoir s'il est à jour, ou
 * l'on conteste le contenu d'un document en cas de litige.
 *
 * Le fichier n'est **jamais transmis** : l'empreinte est calculée dans le
 * navigateur, comme le reste de l'application.
 */
export function EmpreintePanel() {
  const fichierRef = useRef<HTMLInputElement>(null);
  const [attendu, setAttendu] = useState('');
  const [resultat, setResultat] = useState<ResultatVerification | null>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const attenduInvalide = attendu.trim().length > 0 && !empreinteValide(attendu);

  const verifier = async (f: File | null) => {
    if (!f) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    setNomFichier(f.name);
    try {
      setResultat(await verifierFichier(f, attenduInvalide ? undefined : attendu));
    } catch (e) {
      setErreur(decrireErreur(e));
    } finally {
      setEnCours(false);
      if (fichierRef.current) fichierRef.current.value = '';
    }
  };

  return (
    <CarteRepliable
      identifiant="empreinte"
      titre="Vérifier l'empreinte d'un document"
      icone={<FileSearch size={18} />}
      resume="Contrôler qu'un PDF signé n'a pas été modifié"
    >
      <p className="text-sm text-accent-700">
        Chaque document signé porte une empreinte <span className="font-medium">SHA-256</span> en
        pied de page. Déposez le PDF : l'application recalcule cette empreinte et la compare à ce
        qu'elle a signé. Le fichier ne quitte pas votre appareil.
      </p>

      <div className="mt-4">
        <Field
          label="Empreinte attendue (optionnel)"
          hint="Pour vérifier un fichier contre l'empreinte lue sur un exemplaire papier, même si le document n'est plus dans l'application."
          error={attenduInvalide ? 'Une empreinte SHA-256 compte 64 caractères hexadécimaux.' : undefined}
        >
          <Input
            value={attendu}
            onChange={(e) => setAttendu(e.target.value)}
            placeholder="3f8a1c…"
            spellCheck={false}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Button onClick={() => fichierRef.current?.click()} disabled={enCours}>
          <Upload size={16} /> {enCours ? 'Calcul en cours…' : 'Choisir un document PDF'}
        </Button>
        <input
          ref={fichierRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => void verifier(e.target.files?.[0] ?? null)}
        />
      </div>

      {erreur && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          Lecture impossible - {erreur}
        </p>
      )}

      {resultat && (
        <div className="mt-4 space-y-3">
          {resultat.statut === 'correspond' && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 size={16} /> Document authentique - il n'a pas été modifié.
              </p>
              <p className="mt-1">
                {resultat.libelle} · <span className="font-medium">{resultat.reference}</span>
                {resultat.dateSignature &&
                  ` · signé le ${format(new Date(resultat.dateSignature), "dd/MM/yyyy 'à' HH:mm")}`}
              </p>
              {resultat.rectifie && (
                <p className="mt-1 text-amber-800">
                  Attention : c'est une <span className="font-medium">version antérieure</span>,
                  authentique mais annulée et remplacée depuis par une rectification signée des
                  deux parties.
                </p>
              )}
            </div>
          )}

          {resultat.statut === 'attendu_different' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle size={16} /> Le fichier ne correspond pas à l'empreinte attendue.
              </p>
              <p className="mt-1">
                Ce n'est pas le document que désigne cette empreinte : soit le fichier a été
                modifié, soit il s'agit d'un autre exemplaire.
              </p>
            </div>
          )}

          {resultat.statut === 'inconnu' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-medium">
                <HelpCircle size={16} /> Aucune correspondance dans cet appareil.
              </p>
              <p className="mt-1">
                L'empreinte est calculée, mais elle ne figure ni dans vos documents archivés ni
                dans vos états des lieux signés. Cela n'établit pas que le document est faux : il
                peut venir d'un autre appareil, ou avoir été régénéré après signature.
              </p>
            </div>
          )}

          <div className="rounded-lg bg-accent-50 p-3">
            <p className="text-xs font-medium text-accent-500">
              Empreinte SHA-256 de {nomFichier || 'ce fichier'} :
            </p>
            <p className="break-all font-mono text-xs text-accent-800">
              {formatHash(resultat.empreinte)}
            </p>
          </div>
        </div>
      )}
    </CarteRepliable>
  );
}
