import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { ClipboardList, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { progressionEDL } from '@/lib/etat';

export function EdlListePage() {
  const edls = useLiveQuery(() => db.edls.orderBy('updatedAt').reverse().toArray());
  const biens = useLiveQuery(() => db.biens.toArray());

  if (!edls) return null;

  const nouveau = (
    <Link to="/edl/nouveau">
      <Button>
        <Plus size={16} /> Nouvel état des lieux
      </Button>
    </Link>
  );

  return (
    <div>
      {/*
       * Cet écran est la destination du bouton « Faire un état des lieux » de
       * bailiz.fr. Il n'offrait aucune action et renvoyait rédiger un bail :
       * la promesse de la page d'atterrissage n'était pas tenue par l'écran
       * d'atterrissage. Créer un état des lieux est désormais une action de
       * premier niveau, présente aussi quand la liste est pleine.
       */}
      <PageHeader
        titre="États des lieux"
        sousTitre="Constatez l'état d'un logement à l'entrée ou à la sortie, avec ou sans bail."
        actions={nouveau}
      />
      {edls.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          titre="Aucun état des lieux"
          message="Le logement et le locataire se saisissent dans le formulaire. Le bail n'est pas nécessaire : il peut avoir été rédigé ailleurs, et se rattache plus tard."
          action={nouveau}
        />
      ) : (
        <div className="space-y-3">
          {edls.map((edl) => {
            const bien = biens?.find((b) => b.id === edl.bienId);
            const prog = progressionEDL(edl.pieces);
            return (
              <Link key={edl.id} to={`/edl/${edl.id}`} className="block">
                <Card className="flex flex-wrap items-center justify-between gap-3 transition-shadow hover:shadow-md">
                  <div>
                    <div className="font-semibold text-accent-900">
                      {edl.reference} - {edl.type === 'entree' ? 'Entrée' : 'Sortie'} -{' '}
                      {bien?.nom ?? '?'}
                    </div>
                    <div className="text-sm text-accent-600">
                      {format(new Date(edl.date), 'dd/MM/yyyy')} · {prog.renseignes}/{prog.total}{' '}
                      éléments renseignés
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!edl.bailId && <Badge tone="neutral">Sans bail</Badge>}
                    <Badge tone={edl.statut === 'signe' ? 'green' : 'orange'}>
                      {edl.statut === 'signe' ? 'Signé - verrouillé' : `Brouillon (${prog.pct} %)`}
                    </Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
