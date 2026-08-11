import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { ClipboardList, FileText } from 'lucide-react';
import { db } from '@/lib/db';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { progressionEDL } from '@/lib/etat';

export function EdlListePage() {
  const edls = useLiveQuery(() => db.edls.orderBy('updatedAt').reverse().toArray());
  const baux = useLiveQuery(() => db.baux.toArray());
  const biens = useLiveQuery(() => db.biens.toArray());

  if (!edls) return null;

  // `baux` peut n'être pas encore chargé : on ne conclut à l'absence que si la
  // requête a répondu, faute de quoi le premier rendu proposerait le mauvais
  // chemin puis en changerait sous les yeux.
  const aucunBail = baux !== undefined && baux.length === 0;

  return (
    <div>
      <PageHeader
        titre="États des lieux"
        sousTitre="Les états des lieux se créent depuis la fiche d'un bail (entrée puis sortie)."
      />
      {edls.length === 0 ? (
        /*
         * Cet écran est la destination du bouton « Faire un état des lieux » de
         * bailiz.fr. Il n'offrait aucune action : le visiteur arrivait sur une
         * consigne l'envoyant ailleurs, sans lien pour y aller. D'où deux
         * sorties selon ce qu'il a déjà, plutôt qu'une phrase.
         */
        <EmptyState
          icon={ClipboardList}
          titre="Aucun état des lieux"
          message={
            aucunBail
              ? "Un état des lieux se rattache à un bail : c'est lui qui porte le logement, les parties et le dépôt de garantie. Rédigez le bail — le logement et le locataire se saisissent dans le même formulaire — puis lancez l'état des lieux d'entrée depuis sa fiche."
              : "Lancez l'état des lieux d'entrée depuis la fiche du bail concerné. Celui de sortie reprendra l'entrée ligne à ligne, et calculera les retenues sur le dépôt."
          }
          action={
            aucunBail ? (
              <Link to="/baux/nouveau">
                <Button>
                  <FileText size={16} /> Rédiger un bail
                </Button>
              </Link>
            ) : (
              <Link to="/baux">
                <Button>
                  <FileText size={16} /> Choisir un bail
                </Button>
              </Link>
            )
          }
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
