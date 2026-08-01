import { FileDown, Printer, Save, Share2 } from 'lucide-react';
import { telechargerBlob } from '@/lib/backup';
import { Button, Card, Checkbox } from '@/components/ui';

/**
 * Colonne d'aperçu du bail : rendu PDF en direct et actions de sortie
 * (partage, téléchargement, impression, enregistrement). Purement présentatif —
 * l'état et la génération restent portés par le formulaire.
 */
export function ApercuBailPanel({
  apercu,
  generation,
  autoApercu,
  onAutoApercuChange,
  onRegenerer,
  onPartager,
  onEnregistrer,
  nomFichier,
  enregistrement,
  pret,
  edition,
}: {
  apercu: { url: string; blob: Blob } | null;
  generation: boolean;
  autoApercu: boolean;
  onAutoApercuChange: (actif: boolean) => void;
  onRegenerer: () => void;
  onPartager: () => void;
  onEnregistrer: () => void;
  nomFichier: () => string;
  enregistrement: boolean;
  pret: boolean;
  edition: boolean;
}) {
  const cadre = 'h-[calc(100vh-12rem)] min-h-[560px] w-full rounded-lg';
  return (
    <div className="mt-4 xl:sticky xl:top-4 xl:mt-0">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-accent-900">
            Aperçu {generation && <span className="text-xs font-normal text-accent-400">· mise à jour…</span>}
          </h2>
          <Checkbox
            label="Auto"
            checked={autoApercu}
            onChange={(e) => onAutoApercuChange(e.target.checked)}
            className="text-xs"
          />
        </div>
        {!autoApercu && (
          <Button variant="secondary" size="sm" onClick={onRegenerer} disabled={generation}>
            Mettre à jour l’aperçu
          </Button>
        )}
        {apercu ? (
          <iframe title="Aperçu du bail" src={apercu.url} className={`${cadre} border border-accent-200 bg-white`} />
        ) : (
          <div className={`${cadre} flex items-center justify-center border border-dashed border-accent-200 text-sm text-accent-400`}>
            L’aperçu s’affiche ici.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={onPartager} disabled={!apercu}>
            <Share2 size={16} /> Partager
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => apercu && telechargerBlob(apercu.blob, nomFichier())}
            disabled={!apercu}
          >
            <FileDown size={16} /> Télécharger
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => apercu && window.open(apercu.url, '_blank')}
            disabled={!apercu}
          >
            <Printer size={16} /> Imprimer
          </Button>
          <Button size="sm" onClick={onEnregistrer} disabled={enregistrement || !pret}>
            <Save size={16} /> {enregistrement ? 'Enregistrement…' : edition ? 'Enregistrer les modifications' : 'Enregistrer'}
          </Button>
        </div>
        <p className="text-xs text-accent-500">
          {edition
            ? 'Vous pouvez modifier et régénérer ce bail autant de fois que nécessaire. Le PDF peut aussi être partagé, téléchargé ou imprimé.'
            : "« Enregistrer » crée le bail dans l'app avec son inventaire et sa grille de vétusté. Sinon, rien n'est stocké : le PDF part par partage, téléchargement ou impression."}
        </p>
      </Card>
    </div>
  );
}
