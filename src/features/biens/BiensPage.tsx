import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Plus, MapPin } from 'lucide-react';
import { db } from '@/lib/db';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';

export function BiensPage() {
  const biens = useLiveQuery(() => db.biens.orderBy('nom').toArray());
  const baux = useLiveQuery(() => db.baux.toArray());

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
          titre="Créez votre premier bien pour commencer"
          message="Enregistrez un appartement meublé : adresse, surface loi Boutin, équipements, diagnostics et structure des pièces."
          action={
            <Link to="/biens/nouveau">
              <Button>
                <Plus size={16} /> Créer un bien
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {biens.map((bien) => {
            const bailActif = baux?.find(
              (b) => b.bienId === bien.id && (b.statut === 'actif' || b.statut === 'signe'),
            );
            return (
              <Link key={bien.id} to={`/biens/${bien.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 break-words font-semibold text-accent-900">{bien.nom}</h3>
                    <Badge tone={bailActif ? 'green' : 'blue'}>
                      {bailActif ? 'Loué' : 'Vacant'}
                    </Badge>
                  </div>
                  <p className="mt-1 flex items-start gap-1 text-sm text-accent-600">
                    <MapPin size={14} className="mt-0.5 shrink-0" />
                    <span className="break-words">
                      {bien.adresse.ligne1}, {bien.adresse.codePostal} {bien.adresse.ville}
                    </span>
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
    </div>
  );
}
