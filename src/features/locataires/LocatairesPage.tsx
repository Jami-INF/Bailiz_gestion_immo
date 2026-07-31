import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Users, Plus, Pencil, Trash2, ShieldQuestion } from 'lucide-react';
import { db } from '@/lib/db';
import type { Locataire } from '@/types';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  PageHeader,
  useToast,
} from '@/components/ui';
import { LocataireFormModal } from './LocataireFormModal';

export function LocatairesPage() {
  const locataires = useLiveQuery(() => db.locataires.orderBy('nom').toArray());
  const baux = useLiveQuery(() => db.baux.toArray());
  const toast = useToast();
  const [modale, setModale] = useState<{ ouvert: boolean; locataire?: Locataire }>({ ouvert: false });
  const [suppression, setSuppression] = useState<Locataire | null>(null);

  const ouvrir = (locataire?: Locataire) => setModale({ ouvert: true, locataire });

  const bauxDuLocataire = (locataireId: string) =>
    baux?.filter((b) => b.locataireIds.includes(locataireId)) ?? [];

  const supprimerDefinitivement = async (l: Locataire) => {
    const lies = bauxDuLocataire(l.id);
    const actifs = lies.filter((b) => ['signe', 'actif', 'genere'].includes(b.statut));
    if (actifs.length > 0) {
      toast('error', 'Suppression bloquée : un bail actif ou en cours est lié à ce locataire.');
      return;
    }
    await db.locataires.delete(l.id);
    toast('success', 'Locataire et données personnelles supprimés définitivement.');
  };

  if (!locataires) return null;

  return (
    <div>
      <PageHeader
        titre="Locataires"
        sousTitre="Les données sont conservées uniquement sur cet appareil (RGPD : vous êtes responsable de leur conservation et de leur suppression)."
        actions={
          <Button onClick={() => ouvrir()}>
            <Plus size={16} /> Nouveau locataire
          </Button>
        }
      />

      {locataires.length === 0 ? (
        <EmptyState
          icon={Users}
          titre="Aucun locataire"
          message="Ajoutez un locataire pour pouvoir créer un bail. Un locataire peut être lié à plusieurs baux dans le temps."
          action={
            <Button onClick={() => ouvrir()}>
              <Plus size={16} /> Ajouter un locataire
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {locataires.map((l) => {
            const lies = bauxDuLocataire(l.id);
            return (
              <Card key={l.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-accent-900 break-words">
                      {l.civilite} {l.prenom} {l.nom}
                    </h3>
                    <p className="text-sm text-accent-600 break-all">{l.email}</p>
                    <p className="text-sm text-accent-600">{l.telephone}</p>
                    {l.garant && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-accent-500">
                        <ShieldQuestion size={13} className="mt-0.5 shrink-0" />
                        <span className="break-words">
                          Garant :{' '}
                          {l.garant.type === 'visale'
                            ? 'garantie Visale'
                            : `${l.garant.prenom} ${l.garant.nom}`}
                        </span>
                      </p>
                    )}
                  </div>
                  <Badge tone={lies.length > 0 ? 'blue' : 'neutral'}>
                    {lies.length} bail{lies.length > 1 ? 'x' : ''}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => ouvrir(l)}>
                    <Pencil size={14} /> Modifier
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSuppression(l)}>
                    <Trash2 size={14} className="text-red-600" />
                    <span className="text-red-600">Supprimer (RGPD)</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <LocataireFormModal
        open={modale.ouvert}
        onClose={() => setModale({ ouvert: false })}
        locataire={modale.locataire}
      />

      <ConfirmModal
        open={suppression !== null}
        onClose={() => setSuppression(null)}
        onConfirm={() => suppression && void supprimerDefinitivement(suppression)}
        title="Supprimer définitivement ce locataire ?"
        message="Toutes ses données personnelles seront effacées de cet appareil (droit à l'effacement, RGPD). La suppression est bloquée si un bail actif y est lié. Cette action est irréversible."
        confirmLabel="Supprimer définitivement"
        danger
      />
    </div>
  );
}
