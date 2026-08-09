import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import type { StatutBail } from '@/types';
import { TYPE_BAIL_LABELS } from '@/types';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';

export const STATUT_BAIL_UI: Record<StatutBail, { label: string; tone: 'neutral' | 'blue' | 'green' | 'orange' | 'red' }> = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  genere: { label: 'Généré', tone: 'blue' },
  signe: { label: 'Signé', tone: 'green' },
  actif: { label: 'Actif', tone: 'green' },
  termine: { label: 'Terminé', tone: 'neutral' },
};

export function BauxPage() {
  const baux = useLiveQuery(() => db.baux.orderBy('reference').reverse().toArray());
  const biens = useLiveQuery(() => db.biens.toArray());
  const locataires = useLiveQuery(() => db.locataires.toArray());

  if (!baux) return null;

  return (
    <div>
      <PageHeader
        titre="Baux"
        actions={
          <Link to="/baux/nouveau">
            <Button>
              <Plus size={16} /> Nouveau bail
            </Button>
          </Link>
        }
      />
      {baux.length === 0 ? (
        <EmptyState
          icon={FileText}
          titre="Aucun bail"
          message="Un seul écran, avec aperçu du document : choisissez un bien et des locataires enregistrés ou saisissez-les, générez un PDF prêt à imprimer, ou enregistrez le bail complet dans l'app."
          action={
            <Link to="/baux/nouveau">
              <Button>
                <Plus size={16} /> Nouveau bail
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {baux.map((bail) => {
            /*
             * Rendu **total** : aucune de ces valeurs n'est supposée présente.
             * Une seule fiche abîmée — champ manquant, date illisible, statut
             * inconnu — faisait lever une exception dans ce `map`, et React
             * démontait alors la page entière : écran blanc, plus aucun bail
             * accessible, donc impossible d'aller supprimer le coupable.
             */
            const bien = biens?.find((b) => b.id === bail.bienId);
            const noms = (bail.locataireIds ?? [])
              .map((id) => locataires?.find((l) => l.id === id))
              .filter(Boolean)
              .map((l) => `${l!.prenom} ${l!.nom}`)
              .join(', ');
            const ui = STATUT_BAIL_UI[bail.statut] ?? {
              label: bail.statut ?? 'Statut inconnu',
              tone: 'orange' as const,
            };
            const effet = bail.dateEffet ? new Date(bail.dateEffet) : null;
            const effetLisible =
              effet && !Number.isNaN(effet.getTime()) ? format(effet, 'dd/MM/yyyy') : 'date inconnue';
            return (
              <Link key={bail.id} to={`/baux/${bail.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-3 transition-shadow hover:shadow-md">
                  <div className="min-w-0">
                    <div className="break-words font-semibold text-accent-900">
                      {bail.reference ?? 'Bail sans référence'} — {bien?.nom ?? 'Bien supprimé'}
                    </div>
                    <div className="break-words text-sm text-accent-600">
                      {noms || 'Locataires non renseignés'} ·{' '}
                      {TYPE_BAIL_LABELS[bail.typeBail] ?? 'Type non renseigné'}
                    </div>
                    <div className="text-xs text-accent-500">
                      Effet : {effetLisible} · {bail.loyerHC ?? '—'} € HC +{' '}
                      {bail.charges?.montant ?? '—'} € de charges
                    </div>
                  </div>
                  <Badge tone={ui.tone}>{ui.label}</Badge>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
