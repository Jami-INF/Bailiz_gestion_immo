import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Plus, MapPin, SearchX } from 'lucide-react';
import { db } from '@/lib/db';
import { estBailEnCours } from '@/lib/bail';
import { formatAdresse } from '@/lib/adresse';
import { comparerDatesDesc, comparerTexte, correspond } from '@/lib/recherche';
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

type TriBien = 'nom' | 'ville' | 'recent' | 'statut';

const TRIS: OptionTri<TriBien>[] = [
  { valeur: 'nom', label: 'Nom (A → Z)' },
  { valeur: 'ville', label: 'Ville' },
  { valeur: 'recent', label: 'Modifié récemment' },
  { valeur: 'statut', label: 'Statut (vacants d’abord)' },
];

export function BiensPage() {
  const biens = useLiveQuery(() => db.biens.orderBy('nom').toArray());
  const baux = useLiveQuery(() => db.baux.toArray());
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState<TriBien>('nom');

  const bailDuBien = useMemo(() => {
    const carte = new Map<string, boolean>();
    for (const b of baux ?? []) if (estBailEnCours(b)) carte.set(b.bienId, true);
    return carte;
  }, [baux]);

  const visibles = useMemo(() => {
    const liste = (biens ?? []).filter((bien) =>
      correspond(
        recherche,
        bien.nom,
        bien.adresse?.ligne1,
        bien.adresse?.ligne2,
        bien.adresse?.codePostal,
        bien.adresse?.ville,
        bien.type,
      ),
    );
    return liste.sort((a, b) => {
      switch (tri) {
        case 'ville':
          return (
            comparerTexte(a.adresse?.ville ?? '', b.adresse?.ville ?? '') ||
            comparerTexte(a.nom ?? '', b.nom ?? '')
          );
        case 'recent':
          return comparerDatesDesc(a.updatedAt, b.updatedAt);
        case 'statut': {
          // Vacants d'abord : ce sont eux qui demandent une action.
          const rang = (id: string) => (bailDuBien.has(id) ? 1 : 0);
          return rang(a.id) - rang(b.id) || comparerTexte(a.nom ?? '', b.nom ?? '');
        }
        default:
          return comparerTexte(a.nom ?? '', b.nom ?? '');
      }
    });
  }, [biens, recherche, tri, bailDuBien]);

  if (!biens) return null;

  return (
    <div>
      <PageHeader
        titre="Biens"
        sousTitre={`${biens.length} bien${biens.length > 1 ? 's' : ''} enregistré${biens.length > 1 ? 's' : ''}`}
        actions={
          <Link to="/biens/nouveau">
            <Button>
              <Plus size={16} /> Nouveau bien
            </Button>
          </Link>
        }
      />
      {biens.length === 0 ? (
        <EmptyState
          icon={Building2}
          titre="Aucun bien enregistré"
          message="Adresse, surface loi Boutin, équipements, diagnostics et structure des pièces."
          action={
            <Link to="/biens/nouveau">
              <Button>
                <Plus size={16} /> Créer un bien
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          {biens.length >= SEUIL_BARRE_LISTE && (
            <BarreListe
              recherche={recherche}
              onRecherche={setRecherche}
              tri={tri}
              onTri={setTri}
              optionsTri={TRIS}
              placeholder="Rechercher un bien (nom, adresse, ville…)"
              affiches={visibles.length}
              total={biens.length}
              nom="bien"
              nomPluriel="biens"
            />
          )}
          {visibles.length === 0 ? (
            <EmptyState
              icon={SearchX}
              titre="Aucun bien ne correspond"
              message="Aucun résultat pour cette recherche."
              action={<Button variant="secondary" onClick={() => setRecherche('')}>Afficher toute la liste</Button>}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {visibles.map((bien) => {
                const loue = bailDuBien.has(bien.id);
                return (
                  <Link key={bien.id} to={`/biens/${bien.id}`}>
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="min-w-0 break-words font-semibold text-accent-900">{bien.nom}</h3>
                        <Badge tone={loue ? 'green' : 'blue'}>{loue ? 'Loué' : 'Vacant'}</Badge>
                      </div>
                      <p className="mt-1 flex items-start gap-1 text-sm text-accent-600">
                        <MapPin size={14} className="mt-0.5 shrink-0" />
                        <span className="break-words">{formatAdresse(bien.adresse)}</span>
                      </p>
                      <p className="mt-2 text-sm text-accent-500">
                        {bien.type} · {bien.surfaceBoutin} m² (loi Boutin) · {bien.nbPieces} pièce
                        {bien.nbPieces > 1 ? 's' : ''}
                      </p>
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
