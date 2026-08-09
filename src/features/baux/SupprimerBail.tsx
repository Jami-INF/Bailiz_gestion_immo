import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import type { Bail } from '@/types';
import {
  perimetreSuppressionBail,
  supprimerBailEtDonnees,
  type PerimetreSuppressionBail,
} from '@/lib/rgpd';
import { decrireErreur } from '@/lib/erreurs';
import { Button, ConfirmModal, useToast } from '@/components/ui';

/**
 * Suppression d'un bail, avec le détail de ce qui part avec lui.
 *
 * Il n'existait aucun moyen d'effacer un bail : ni ici, ni ailleurs. Une fiche
 * restée en base après un enregistrement interrompu — ou dont le bien a été
 * supprimé — devenait donc définitive. Le périmètre est annoncé avant
 * confirmation, sur le modèle de la suppression RGPD d'un locataire : un bail
 * peut emporter des états des lieux signés.
 */
export function BoutonSupprimerBail({ bail }: { bail: Bail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmation, setConfirmation] = useState(false);
  const [perimetre, setPerimetre] = useState<PerimetreSuppressionBail | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Calculé à l'ouverture de la modale, jamais pendant le rendu.
  useEffect(() => {
    if (!confirmation) return;
    let annule = false;
    void perimetreSuppressionBail(bail.id).then((p) => {
      if (!annule) setPerimetre(p);
    });
    return () => {
      annule = true;
    };
  }, [confirmation, bail.id]);

  const supprimer = async () => {
    setEnCours(true);
    try {
      await supprimerBailEtDonnees(bail.id);
      toast('success', `Bail ${bail.reference ?? ''} supprimé.`.replace('  ', ' '));
      navigate('/baux');
    } catch (e) {
      toast('error', `Suppression impossible — ${decrireErreur(e)}`);
    } finally {
      setEnCours(false);
      setConfirmation(false);
    }
  };

  const detail = perimetre
    ? [
        perimetre.edls > 0 ? `${perimetre.edls} état(s) des lieux` : null,
        perimetre.photos > 0 ? `${perimetre.photos} photo(s)` : null,
        perimetre.documents > 0 ? `${perimetre.documents} PDF archivé(s)` : null,
      ].filter(Boolean)
    : [];

  return (
    <>
      <Button variant="danger" onClick={() => setConfirmation(true)} disabled={enCours}>
        <Trash2 size={16} /> Supprimer
      </Button>
      <ConfirmModal
        open={confirmation}
        onClose={() => setConfirmation(false)}
        onConfirm={() => void supprimer()}
        title="Supprimer ce bail ?"
        message={
          detail.length > 0
            ? `Seront également supprimés : ${detail.join(', ')}. Cette opération est définitive et se propagera aux autres appareils à la prochaine synchronisation. Le bien et les locataires, eux, sont conservés.`
            : 'Cette opération est définitive et se propagera aux autres appareils à la prochaine synchronisation. Le bien et les locataires, eux, sont conservés.'
        }
        confirmLabel="Supprimer définitivement"
        danger
      />
    </>
  );
}
