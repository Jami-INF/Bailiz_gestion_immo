import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { db } from '@/lib/db';
import {
  activerSync,
  compterEnAttente,
  derniereErreurCycle,
  lancerCycle,
  type ResultatSync,
} from '@/lib/sync';
import { Button, Card, Checkbox, ConfirmModal, useToast } from '@/components/ui';

/**
 * Synchronisation par fichiers entre appareils : activation, état du dernier
 * cycle et résolution des situations que le moteur refuse de trancher seul
 * (horloge décalée, suppressions inhabituelles, références en double).
 */
export function SyncPanel() {
  const toast = useToast();
  const parametres = useLiveQuery(() => db.parametres.get('singleton'));
  const enAttente = useLiveQuery(() => compterEnAttente());
  const [enCours, setEnCours] = useState(false);
  const [dernier, setDernier] = useState<ResultatSync | null>(null);
  const [confirmerSuppressions, setConfirmerSuppressions] = useState(false);
  const config = parametres?.sauvegardeGDrive;
  const active = Boolean(config?.syncActive);

  if (!config?.actif) {
    return (
      <Card>
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-accent-900">
          <RefreshCcw size={18} /> Synchronisation entre appareils
        </h2>
        <p className="text-sm text-accent-600">
          Connectez d'abord Google Drive ci-dessus : la synchronisation utilise le même dossier et
          la même autorisation.
        </p>
      </Card>
    );
  }

  const annoncer = (resultat: ResultatSync) => {
    setDernier(resultat);
    if (resultat.etat === 'ok') {
      const { recus, envoyes, supprimes } = resultat;
      toast(
        'success',
        recus + envoyes + supprimes === 0
          ? 'Déjà à jour : rien à échanger.'
          : `Synchronisé : ${recus} reçu(s), ${envoyes} envoyé(s), ${supprimes} supprimé(s).`,
      );
    } else if (resultat.etat === 'bloque') {
      toast('warning', 'Synchronisation interrompue — voir le détail ci-dessous.');
    } else if (resultat.etat === 'erreur') {
      toast('error', `Échec de la synchronisation — ${derniereErreurCycle() ?? 'cause inconnue'}`);
    } else {
      toast(
        'warning',
        'Synchronisation reportée : autorisation Google à renouveler, ou appareil hors ligne.',
      );
    }
  };

  const synchroniserMaintenant = async (options?: { forcerSuppressions?: boolean }) => {
    setEnCours(true);
    try {
      annoncer(await lancerCycle(true, options));
    } finally {
      setEnCours(false);
      setConfirmerSuppressions(false);
    }
  };

  const basculer = async (actif: boolean) => {
    await activerSync(actif);
    if (!actif) setDernier(null);
    toast(
      'info',
      actif
        ? 'Synchronisation activée : le Drive reçoit désormais chaque modification, au lieu d’une archive complète.'
        : 'Synchronisation désactivée : retour à l’archive ZIP complète.',
    );
    if (actif) await synchroniserMaintenant();
  };

  const doublons = dernier?.etat === 'ok' ? dernier.doublons : [];

  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-accent-900">
        <RefreshCcw size={18} /> Synchronisation entre appareils
      </h2>
      <p className="mb-3 text-sm text-accent-600">
        Au lieu d'envoyer une archive complète, l'application échange <strong>fiche par fiche</strong>{' '}
        avec le Drive : les modifications faites en parallèle sur deux appareils se rejoignent au
        lieu de s'écraser, et les photos ne remontent qu'une seule fois. Les suppressions se
        propagent, y compris l'effacement définitif d'un locataire.
      </p>

      <Checkbox
        label="Synchroniser cet appareil avec le Drive"
        checked={active}
        onChange={(e) => void basculer(e.target.checked)}
      />

      {active && (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-accent-800">
            Dernier échange :{' '}
            {config.derniereSync
              ? format(new Date(config.derniereSync), 'dd/MM/yyyy à HH:mm')
              : 'jamais'}
            {enAttente !== undefined && enAttente > 0 && (
              <span className="text-accent-600">
                {' '}
                · {enAttente} modification(s) en attente d'envoi
              </span>
            )}
          </p>

          {dernier?.etat === 'bloque' && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {dernier.raison === 'horloge'
                  ? "L'horloge de cet appareil est trop décalée par rapport au serveur"
                  : 'Ce cycle supprimerait une partie inhabituelle de vos données'}
                {dernier.details ? ` (${dernier.details})` : ''}.
              </p>
              {dernier.raison === 'horloge' ? (
                <p className="text-sm text-amber-800">
                  Les versions sont départagées par leur date : une horloge fausse ferait perdre
                  la modification la plus récente. Corrigez l'heure de l'appareil (réglage
                  automatique recommandé), puis relancez.
                </p>
              ) : (
                <>
                  <p className="text-sm text-amber-800">
                    Ces suppressions viennent de l'autre appareil. Si vous y avez effectivement
                    supprimé ces fiches, confirmez ; sinon, ne faites rien et vérifiez d'abord.
                  </p>
                  <Button size="sm" onClick={() => setConfirmerSuppressions(true)} disabled={enCours}>
                    Appliquer ces suppressions
                  </Button>
                </>
              )}
            </div>
          )}

          {doublons.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">
                Références attribuées deux fois, à corriger à la main :
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-amber-800">
                {doublons.map((d) => (
                  <li key={`${d.table}-${d.reference}`}>
                    {d.reference} — {d.ids.length} documents ({d.table})
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-amber-700">
                Deux appareils hors ligne ont attribué le même numéro. Rien n'est renuméroté
                automatiquement : la référence figure peut-être sur un document déjà imprimé.
              </p>
            </div>
          )}

          <Button size="sm" onClick={() => void synchroniserMaintenant()} disabled={enCours}>
            <RefreshCcw size={14} /> {enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
          </Button>
          <p className="text-xs text-accent-500">
            La synchronisation se déclenche aussi après chaque signature, quelques secondes après
            une modification, et à l'ouverture. Une archive ZIP complète reste envoyée
            périodiquement comme filet de sécurité.
          </p>
        </div>
      )}

      <ConfirmModal
        open={confirmerSuppressions}
        onClose={() => setConfirmerSuppressions(false)}
        onConfirm={() => void synchroniserMaintenant({ forcerSuppressions: true })}
        title="Appliquer les suppressions reçues ?"
        message="Les fiches supprimées sur l'autre appareil seront également supprimées ici. Cette opération est définitive : exportez une sauvegarde d'abord si vous avez un doute."
        confirmLabel="Supprimer ici aussi"
        danger
      />
    </Card>
  );
}
