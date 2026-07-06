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
          message="Créez un bail meublé conforme au bail type réglementaire en quelques étapes : bien, locataires, conditions financières, clauses et annexes."
          action={
            <Link to="/baux/nouveau">
              <Button>
                <Plus size={16} /> Créer un bail
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {baux.map((bail) => {
            const bien = biens?.find((b) => b.id === bail.bienId);
            const noms = bail.locataireIds
              .map((id) => locataires?.find((l) => l.id === id))
              .filter(Boolean)
              .map((l) => `${l!.prenom} ${l!.nom}`)
              .join(', ');
            const ui = STATUT_BAIL_UI[bail.statut];
            return (
              <Link key={bail.id} to={`/baux/${bail.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-3 transition-shadow hover:shadow-md">
                  <div>
                    <div className="font-semibold text-accent-900">
                      {bail.reference} — {bien?.nom ?? 'Bien supprimé'}
                    </div>
                    <div className="text-sm text-accent-600">
                      {noms || 'Locataires non renseignés'} · {TYPE_BAIL_LABELS[bail.typeBail]}
                    </div>
                    <div className="text-xs text-accent-500">
                      Effet : {format(new Date(bail.dateEffet), 'dd/MM/yyyy')} · {bail.loyerHC} € HC +{' '}
                      {bail.charges.montant} € de charges
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
