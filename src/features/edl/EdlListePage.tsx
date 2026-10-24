import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { ClipboardList, Plus, SearchX } from 'lucide-react';
import { db } from '@/lib/db';
import { progressionEDL } from '@/lib/etat';
import { comparerDatesDesc, comparerTexte, correspond } from '@/lib/recherche';
import {
  Badge,
  BarreListe,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Select,
  SEUIL_BARRE_LISTE,
  type OptionTri,
} from '@/components/ui';

type TriEdl = 'recent' | 'date' | 'bien' | 'statut';

const TRIS: OptionTri<TriEdl>[] = [
  { valeur: 'recent', label: 'Modifié récemment' },
  { valeur: 'date', label: 'Date du constat' },
  { valeur: 'bien', label: 'Logement (A → Z)' },
  { valeur: 'statut', label: 'Statut (brouillons d’abord)' },
];

type FiltreStatut = 'tous' | 'brouillon' | 'signe';

export function EdlListePage() {
  const edls = useLiveQuery(() => db.edls.orderBy('updatedAt').reverse().toArray());
  const biens = useLiveQuery(() => db.biens.toArray());
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState<TriEdl>('recent');
  const [statut, setStatut] = useState<FiltreStatut>('tous');

  const nomBien = useMemo(() => {
    const carte = new Map<string, string>();
    for (const b of biens ?? []) carte.set(b.id, b.nom);
    return carte;
  }, [biens]);

  const visibles = useMemo(() => {
    const retenuParStatut = (edl: { statut: string }) =>
      statut === 'tous' || (statut === 'signe' ? edl.statut === 'signe' : edl.statut !== 'signe');
    const liste = (edls ?? []).filter(
      (edl) =>
        retenuParStatut(edl) &&
        correspond(
          recherche,
          edl.reference,
          nomBien.get(edl.bienId),
          edl.type === 'entree' ? 'entrée' : 'sortie',
        ),
    );
    return liste.sort((a, b) => {
      switch (tri) {
        case 'date':
          return comparerDatesDesc(a.date, b.date);
        case 'bien':
          return (
            comparerTexte(nomBien.get(a.bienId) ?? '', nomBien.get(b.bienId) ?? '') ||
            comparerDatesDesc(a.date, b.date)
          );
        case 'statut': {
          // Les brouillons d'abord : ce sont les seuls sur lesquels il reste
          // quelque chose à faire. Un état des lieux signé est verrouillé.
          const rang = (s: string) => (s === 'signe' ? 1 : 0);
          return rang(a.statut) - rang(b.statut) || comparerDatesDesc(a.updatedAt, b.updatedAt);
        }
        default:
          return comparerDatesDesc(a.updatedAt, b.updatedAt);
      }
    });
  }, [edls, recherche, tri, statut, nomBien]);

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
        <>
          {/*
           * C'est la liste qui grossit le plus vite - deux états des lieux par
           * bail - et la seule des quatre qui n'avait ni recherche, ni tri, ni
           * filtre. Le filtre de statut est le plus utile : il sépare ce qui
           * reste à mener de ce qui est clos.
           */}
          {edls.length >= SEUIL_BARRE_LISTE && (
            <BarreListe
              recherche={recherche}
              onRecherche={setRecherche}
              tri={tri}
              onTri={setTri}
              optionsTri={TRIS}
              placeholder="Rechercher un état des lieux (référence, logement…)"
              affiches={visibles.length}
              total={edls.length}
              nom="état des lieux"
              nomPluriel="états des lieux"
              filtres={
                <Select
                  value={statut}
                  onChange={(e) => setStatut(e.target.value as FiltreStatut)}
                  aria-label="Filtrer par statut"
                  className="min-w-[11rem] flex-1 sm:w-44 sm:flex-none"
                >
                  <option value="tous">Tous les statuts</option>
                  <option value="brouillon">Brouillons</option>
                  <option value="signe">Signés</option>
                </Select>
              }
            />
          )}
          {visibles.length === 0 ? (
            <EmptyState
              icon={SearchX}
              titre="Aucun état des lieux ne correspond"
              message="Aucun résultat pour cette recherche ou ce filtre."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRecherche('');
                    setStatut('tous');
                  }}
                >
                  Afficher toute la liste
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {visibles.map((edl) => {
                const prog = progressionEDL(edl.pieces);
                const signe = edl.statut === 'signe';
                return (
                  /*
                   * Un état des lieux signé ouvre sa **synthèse**, pas l'écran
                   * terrain : celui-ci est verrouillé, et n'y proposait qu'un
                   * bandeau renvoyant vers la synthèse - un clic de plus sur
                   * l'écran dont il n'y a plus rien à tirer. C'est là que vivent
                   * le comparatif, les retenues et la lettre de restitution.
                   */
                  <Link
                    key={edl.id}
                    to={signe ? `/edl/${edl.id}/synthese` : `/edl/${edl.id}`}
                    className="block"
                  >
                    <Card className="flex flex-wrap items-center justify-between gap-3 transition-shadow hover:shadow-md">
                      <div>
                        <div className="font-semibold text-accent-900">
                          {edl.reference} - {edl.type === 'entree' ? 'Entrée' : 'Sortie'} -{' '}
                          {nomBien.get(edl.bienId) ?? '?'}
                        </div>
                        <div className="text-sm text-accent-600">
                          {format(new Date(edl.date), 'dd/MM/yyyy')} · {prog.renseignes}/{prog.total}{' '}
                          éléments renseignés
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {!edl.bailId && <Badge tone="neutral">Sans bail</Badge>}
                        <Badge tone={signe ? 'green' : 'orange'}>
                          {signe ? 'Signé - verrouillé' : `Brouillon (${prog.pct} %)`}
                        </Badge>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
