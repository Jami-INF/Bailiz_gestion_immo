import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '@/lib/db';
import type { Bien, ClasseDPE, SaisieBail, TypeBien } from '@/types';
import { CLASSES_DPE, TYPES_BIEN } from '@/types';
import { construireBienInline } from '@/lib/pdf/bailRapide';
import { Button, Field, Input, Modal, Select, useToast } from '@/components/ui';

function vide(): SaisieBail['bien'] {
  return { adresse: { ligne1: '', codePostal: '', ville: '' } };
}

/**
 * Création rapide d'un logement depuis le formulaire de bail : uniquement les
 * champs utiles au contrat. Le bien est réellement enregistré (donc réutilisable
 * ensuite) ; sa fiche complète (pièces, diagnostics) se complète plus tard,
 * avant l'état des lieux.
 */
export function BienRapideModal({
  open,
  onClose,
  onCree,
}: {
  open: boolean;
  onClose: () => void;
  onCree?: (b: Bien) => void;
}) {
  const toast = useToast();
  const [b, setB] = useState<SaisieBail['bien']>(vide());

  useEffect(() => {
    if (open) setB(vide());
  }, [open]);

  const maj = (m: Partial<SaisieBail['bien']>) => setB((prev) => ({ ...prev, ...m }));
  const majAdresse = (m: Partial<SaisieBail['bien']['adresse']>) =>
    setB((prev) => ({ ...prev, adresse: { ...prev.adresse, ...m } }));

  const pret = Boolean(b.adresse.ligne1.trim() && b.adresse.ville.trim());

  const creer = async () => {
    const bien = construireBienInline(b);
    await db.biens.add(bien);
    toast('success', `Logement « ${bien.nom} » créé et sélectionné.`);
    onCree?.(bien);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nouveau logement"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => void creer()} disabled={!pret}>
            Créer le logement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Désignation (usage interne)">
            <Input value={b.nom ?? ''} onChange={(e) => maj({ nom: e.target.value })} placeholder="T2 Chamalières" />
          </Field>
          <Field label="Type" required>
            <Select value={b.type ?? ''} onChange={(e) => maj({ type: (e.target.value || undefined) as TypeBien })}>
              <option value="">-</option>
              {TYPES_BIEN.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Adresse du logement" required>
          <Input
            value={b.adresse.ligne1}
            onChange={(e) => majAdresse({ ligne1: e.target.value })}
            placeholder="12 rue des Lilas"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code postal" required>
            <Input value={b.adresse.codePostal} onChange={(e) => majAdresse({ codePostal: e.target.value })} />
          </Field>
          <Field label="Ville" required>
            <Input value={b.adresse.ville} onChange={(e) => majAdresse({ ville: e.target.value })} />
          </Field>
          <Field label="Étage / bâtiment">
            <Input value={b.etage ?? ''} onChange={(e) => maj({ etage: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Surface Boutin (m²)" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={b.surfaceBoutin ?? ''}
              onChange={(e) => maj({ surfaceBoutin: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </Field>
          <Field label="Nb de pièces" required>
            <Input
              type="number"
              min="0"
              value={b.nbPieces ?? ''}
              onChange={(e) => maj({ nbPieces: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Classe DPE">
            <Select
              value={b.classeDPE ?? ''}
              onChange={(e) => maj({ classeDPE: (e.target.value || undefined) as ClasseDPE })}
            >
              <option value="">-</option>
              {CLASSES_DPE.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Identifiant fiscal" hint="impots.gouv.fr → « Gérer mes biens immobiliers ».">
            <Input value={b.identifiantFiscal ?? ''} onChange={(e) => maj({ identifiantFiscal: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Chauffage" hint="Ex. « individuel électrique »">
            <Input value={b.chauffage ?? ''} onChange={(e) => maj({ chauffage: e.target.value })} />
          </Field>
          <Field label="Eau chaude" hint="Ex. « individuelle gaz »">
            <Input value={b.eauChaude ?? ''} onChange={(e) => maj({ eauChaude: e.target.value })} />
          </Field>
        </div>
        <p className="text-xs text-accent-500">
          Le logement est enregistré et réutilisable pour vos prochains baux. Complétez sa fiche
          (pièces, mobilier, diagnostics) depuis <Link to="/biens" className="underline">Biens</Link>{' '}
          avant de réaliser l'état des lieux.
        </p>
      </div>
    </Modal>
  );
}
