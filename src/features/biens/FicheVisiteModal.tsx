import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { FileText } from 'lucide-react';
import type { Bien, ConditionSection } from '@/types';
import { CONDITION_SECTION_LABELS } from '@/types';
import { db, getParametres } from '@/lib/db';
import { formatEuros } from '@/lib/calculs';
import { blobVersDataUrl } from '@/lib/images';
import { decrireErreur } from '@/lib/erreurs';
import { genererEtArchiver } from '@/lib/pdf/generer';
import { FicheVisitePdf } from '@/lib/pdf/FicheVisitePdf';
import { MODELE_FICHE_VISITE_DEFAUT } from '@/lib/defauts';
import { Button, Checkbox, DateInput, Field, Input, Modal, useToast } from '@/components/ui';

/** Situations proposées à la génération (« toujours » n'est pas un choix). */
const SITUATIONS: ConditionSection[] = [
  'garant_physique',
  'visale',
  'colocation',
  'etudiant',
  'independant',
];

/**
 * Génération de la fiche de visite. Volontairement courte : les conditions de
 * location viennent de la fiche du bien (source unique), seules la date de la
 * visite et les situations du candidat se décident ici.
 */
export function FicheVisiteModal({
  bien,
  open,
  onClose,
}: {
  bien: Bien;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [heure, setHeure] = useState('');
  const [situations, setSituations] = useState<ConditionSection[]>(
    bien.conditionsLocation?.situations ?? ['garant_physique'],
  );
  const [enCours, setEnCours] = useState(false);

  const c = bien.conditionsLocation ?? {};
  const totalCC = c.loyerHC !== undefined ? c.loyerHC + (c.charges?.montant ?? 0) : undefined;

  const basculer = (s: ConditionSection) =>
    setSituations((liste) => (liste.includes(s) ? liste.filter((x) => x !== s) : [...liste, s]));

  const generer = async () => {
    setEnCours(true);
    try {
      const parametres = await getParametres();
      const modele = parametres.ficheVisite ?? MODELE_FICHE_VISITE_DEFAUT;
      const photo = bien.photoId ? await db.photos.get(bien.photoId) : undefined;
      const photoDataUrl = photo ? await blobVersDataUrl(photo.blob) : undefined;
      await genererEtArchiver({
        type: 'fiche_visite',
        titre: `Fiche de visite — ${bien.nom}`,
        bienId: bien.id,
        element: (reference) => (
          <FicheVisitePdf
            reference={reference}
            bien={bien}
            parametres={parametres}
            modele={modele}
            visite={{ date: date || undefined, heure: heure.trim() || undefined, situations }}
            photoDataUrl={photoDataUrl}
          />
        ),
      });
      // Mémorise les situations retenues : la prochaine visite repart de là.
      await db.biens.update(bien.id, {
        conditionsLocation: { ...bien.conditionsLocation, situations },
      });
      toast('success', 'Fiche de visite générée (PDF).');
      onClose();
    } catch (e) {
      console.error(e);
      toast('error', `Échec de la génération — ${decrireErreur(e)}`);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fiche de visite"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void generer()} disabled={enCours}>
            <FileText size={16} /> {enCours ? 'Génération…' : 'Générer la fiche (PDF)'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date de la visite">
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Heure">
            <Input value={heure} onChange={(e) => setHeure(e.target.value)} placeholder="18 h 30" />
          </Field>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-accent-800">Situation du candidat</p>
          <p className="mb-2 text-xs text-accent-500">
            Seules les sections cochées sont imprimées : inutile de lister les pièces du garant à
            un candidat couvert par Visale.
          </p>
          <div className="space-y-1">
            {SITUATIONS.map((s) => (
              <Checkbox
                key={s}
                label={CONDITION_SECTION_LABELS[s]}
                checked={situations.includes(s)}
                onChange={() => basculer(s)}
              />
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
          <p className="font-medium text-accent-900">Ce qui sera imprimé</p>
          <p>
            {totalCC !== undefined
              ? `${formatEuros(totalCC)} charges comprises`
              : 'Loyer non renseigné (zone à compléter à la main)'}
            {c.depotGarantie !== undefined ? ` · dépôt ${formatEuros(c.depotGarantie)}` : ''}
            {c.dateDisponibilite
              ? ` · disponible le ${format(new Date(c.dateDisponibilite), 'd MMMM yyyy', { locale: fr })}`
              : ''}
          </p>
          <Link
            to={`/biens/${bien.id}/modifier`}
            className="mt-1 inline-block text-xs font-medium text-accent-800 underline"
          >
            Modifier les conditions sur la fiche du bien
          </Link>
        </div>
      </div>
    </Modal>
  );
}
