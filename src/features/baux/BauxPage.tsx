import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileText, Plus, SearchX } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '@/lib/db';
import { estBailEnCours } from '@/lib/bail';
import { comparerDatesDesc, comparerTexte, correspond } from '@/lib/recherche';
import type { StatutBail } from '@/types';
import { TYPE_BAIL_LABELS } from '@/types';
import {
  BarreListe,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SEUIL_BARRE_LISTE,
  type OptionTri,
} from '@/components/ui';

export const STATUT_BAIL_UI: Record<StatutBail, { label: string; tone: 'neutral' | 'blue' | 'green' | 'orange' | 'red' }> = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  genere: { label: 'Généré', tone: 'blue' },
  signe: { label: 'Signé', tone: 'green' },
  actif: { label: 'Actif', tone: 'green' },
  termine: { label: 'Terminé', tone: 'neutral' },
};

type TriBail = 'reference' | 'effet' | 'statut' | 'bien';

const TRIS: OptionTri<TriBail>[] = [
  { valeur: 'reference', label: 'Référence (récentes)' },
  { valeur: 'effet', label: 'Prise d’effet (récentes)' },
  { valeur: 'statut', label: 'Statut (en cours)' },
  { valeur: 'bien', label: 'Logement (A → Z)' },
];

export function BauxPage() {
  const baux = useLiveQuery(() => db.baux.orderBy('reference').reverse().toArray());
  const biens = useLiveQuery(() => db.biens.toArray());
  const locataires = useLiveQuery(() => db.locataires.toArray());
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState<TriBail>('reference');

  /*
   * Recherche et tri restent aussi défensifs que le rendu : une fiche abîmée
   * (référence, date ou statut manquant) doit sortir de la comparaison sans
   * lever — sinon la liste entière redevient inaccessible.
   */
  const visibles = useMemo(() => {
    const nomBien = (id: string | undefined) => biens?.find((b) => b.id === id)?.nom ?? '';
    const nomsLocataires = (ids: string[] | undefined) =>
      (ids ?? [])
        .map((id) => locataires?.find((l) => l.id === id))
        .filter(Boolean)
        .map((l) => `${l!.prenom} ${l!.nom}`)
        .join(' ');

    const liste = (baux ?? []).filter((bail) =>
      correspond(
        recherche,
        bail.reference,
        nomBien(bail.bienId),
        nomsLocataires(bail.locataireIds),
        TYPE_BAIL_LABELS[bail.typeBail],
        STATUT_BAIL_UI[bail.statut]?.label,
      ),
    );

    return liste.sort((a, b) => {
      switch (tri) {
        case 'effet':
          return comparerDatesDesc(a.dateEffet, b.dateEffet);
        case 'statut': {
          // Les baux en cours d'abord : terminés et brouillons sont de l'archive.
          const rang = (bail: typeof a) => (estBailEnCours(bail) ? 0 : 1);
          return rang(a) - rang(b) || comparerTexte(b.reference ?? '', a.reference ?? '');
        }
        case 'bien':
          return (
            comparerTexte(nomBien(a.bienId), nomBien(b.bienId)) ||
            comparerTexte(b.reference ?? '', a.reference ?? '')
          );
        default:
          return comparerTexte(b.reference ?? '', a.reference ?? '');
      }
    });
  }, [baux, biens, locataires, recherche, tri]);

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
        <>
          {baux.length >= SEUIL_BARRE_LISTE && (
            <BarreListe
              recherche={recherche}
              onRecherche={setRecherche}
              tri={tri}
              onTri={setTri}
              optionsTri={TRIS}
              placeholder="Rechercher un bail (référence, logement, locataire…)"
              affiches={visibles.length}
              total={baux.length}
              nom="bail"
              nomPluriel="baux"
            />
          )}
          {visibles.length === 0 ? (
            <EmptyState
              icon={SearchX}
              titre="Aucun bail ne correspond"
              message="Vérifiez l'orthographe, ou effacez la recherche pour retrouver toute la liste."
              action={<Button variant="secondary" onClick={() => setRecherche('')}>Afficher toute la liste</Button>}
            />
          ) : (
        <div className="space-y-3">
          {visibles.map((bail) => {
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
        </>
      )}
    </div>
  );
}
