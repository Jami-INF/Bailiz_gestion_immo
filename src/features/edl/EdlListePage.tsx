import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { ClipboardList } from 'lucide-react';
import { db } from '@/lib/db';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { progressionEDL } from '@/lib/etat';

export function EdlListePage() {
  const edls = useLiveQuery(() => db.edls.orderBy('updatedAt').reverse().toArray());
  const baux = useLiveQuery(() => db.baux.toArray());
  const biens = useLiveQuery(() => db.biens.toArray());

  if (!edls) return null;

  return (
    <div>
      <PageHeader
        titre="États des lieux"
        sousTitre="Les états des lieux se créent depuis la fiche d'un bail (entrée puis sortie)."
      />
      {edls.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          titre="Aucun état des lieux"
          message="Créez un bail, puis lancez l'état des lieux d'entrée depuis sa fiche. Le mode terrain fonctionne entièrement hors-ligne."
        />
      ) : (
        <div className="space-y-3">
          {edls.map((edl) => {
            const bail = baux?.find((b) => b.id === edl.bailId);
            const bien = biens?.find((b) => b.id === bail?.bienId);
            const prog = progressionEDL(edl.pieces);
            return (
              <Link key={edl.id} to={`/edl/${edl.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-3 transition-shadow hover:shadow-md">
                  <div>
                    <div className="font-semibold text-accent-900">
                      {edl.reference} — {edl.type === 'entree' ? 'Entrée' : 'Sortie'} —{' '}
                      {bien?.nom ?? '?'}
                    </div>
                    <div className="text-sm text-accent-600">
                      {format(new Date(edl.date), 'dd/MM/yyyy')} · {prog.renseignes}/{prog.total}{' '}
                      éléments renseignés
                    </div>
                  </div>
                  <Badge tone={edl.statut === 'signe' ? 'green' : 'orange'}>
                    {edl.statut === 'signe' ? 'Signé — verrouillé' : `Brouillon (${prog.pct} %)`}
                  </Badge>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
