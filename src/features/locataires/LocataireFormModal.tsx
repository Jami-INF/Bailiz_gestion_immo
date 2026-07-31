import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { db } from '@/lib/db';
import { uid, nowISO } from '@/lib/ids';
import type { Locataire } from '@/types';
import { Button, Checkbox, DateInput, Field, Input, Modal, Select, useToast } from '@/components/ui';

const schema = z.object({
  civilite: z.enum(['M', 'Mme']),
  nom: z.string().min(1, 'Nom requis'),
  prenom: z.string().min(1, 'Prénom requis'),
  dateNaissance: z.string().optional(),
  lieuNaissance: z.string().optional(),
  email: z.string().email('E-mail invalide'),
  telephone: z.string().min(6, 'Téléphone requis'),
  adresseActuelle: z.string().optional(),
  avecGarant: z.boolean(),
  garantNom: z.string().optional(),
  garantPrenom: z.string().optional(),
  garantAdresse: z.string().optional(),
  garantType: z.enum(['physique', 'visale', 'autre']).optional(),
  garantNumeroVisa: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function versForm(l?: Locataire): FormValues {
  return {
    civilite: l?.civilite ?? 'M',
    nom: l?.nom ?? '',
    prenom: l?.prenom ?? '',
    dateNaissance: l?.dateNaissance ?? '',
    lieuNaissance: l?.lieuNaissance ?? '',
    email: l?.email ?? '',
    telephone: l?.telephone ?? '',
    adresseActuelle: l?.adresseActuelle ?? '',
    avecGarant: Boolean(l?.garant),
    garantNom: l?.garant?.nom ?? '',
    garantPrenom: l?.garant?.prenom ?? '',
    garantAdresse: l?.garant?.adresse ?? '',
    garantType: l?.garant?.type ?? 'physique',
    garantNumeroVisa: l?.garant?.numeroVisa ?? '',
  };
}

/**
 * Formulaire locataire (création / édition), partagé par la page Locataires et
 * le formulaire de bail : une seule source de champs, donc aucune divergence
 * de données entre les deux points d'entrée.
 */
export function LocataireFormModal({
  open,
  onClose,
  locataire,
  onEnregistre,
}: {
  open: boolean;
  onClose: () => void;
  /** Locataire à modifier ; absent = création. */
  locataire?: Locataire;
  /** Appelé après enregistrement (ex. sélectionner le nouveau locataire dans le bail). */
  onEnregistre?: (l: Locataire) => void;
}) {
  const toast = useToast();
  const { register, handleSubmit, reset, watch, control, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: versForm(locataire),
  });
  const avecGarant = watch('avecGarant');
  const garantType = watch('garantType');

  // Réinitialise les champs à chaque ouverture (création vierge ou édition).
  useEffect(() => {
    if (open) reset(versForm(locataire));
  }, [open, locataire, reset]);

  const enregistrer = handleSubmit(async (v) => {
    const enr: Locataire = {
      id: locataire?.id ?? uid(),
      civilite: v.civilite,
      nom: v.nom,
      prenom: v.prenom,
      dateNaissance: v.dateNaissance || undefined,
      lieuNaissance: v.lieuNaissance || undefined,
      email: v.email,
      telephone: v.telephone,
      adresseActuelle: v.adresseActuelle || undefined,
      garant: v.avecGarant
        ? {
            nom: v.garantNom ?? '',
            prenom: v.garantPrenom ?? '',
            adresse: v.garantAdresse ?? '',
            type: v.garantType ?? 'physique',
            numeroVisa: v.garantType === 'visale' ? v.garantNumeroVisa || undefined : undefined,
          }
        : undefined,
      createdAt: locataire?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };
    await db.locataires.put(enr);
    toast('success', locataire ? 'Locataire mis à jour.' : 'Locataire créé.');
    onEnregistre?.(enr);
    onClose();
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={locataire ? 'Modifier le locataire' : 'Nouveau locataire'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={enregistrer}>Enregistrer</Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={enregistrer}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Civilité">
            <Select {...register('civilite')}>
              <option value="M">M.</option>
              <option value="Mme">Mme</option>
            </Select>
          </Field>
          <Field label="Prénom" required error={formState.errors.prenom?.message}>
            <Input {...register('prenom')} placeholder="Marie" />
          </Field>
          <Field label="Nom" required error={formState.errors.nom?.message}>
            <Input {...register('nom')} placeholder="Dupont" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date de naissance" hint="Facultative — aide à identifier le locataire sur le bail.">
            <Controller
              control={control}
              name="dateNaissance"
              render={({ field }) => (
                <DateInput value={field.value ?? ''} onChange={field.onChange} aria-label="Date de naissance" />
              )}
            />
          </Field>
          <Field label="Lieu de naissance">
            <Input {...register('lieuNaissance')} placeholder="Clermont-Ferrand" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="E-mail"
            required
            error={formState.errors.email?.message}
            hint="Servira à l'envoi des documents (EDL, bail) par e-mail."
          >
            <Input type="email" {...register('email')} placeholder="marie.dupont@exemple.fr" />
          </Field>
          <Field label="Téléphone" required error={formState.errors.telephone?.message}>
            <Input type="tel" {...register('telephone')} placeholder="06 12 34 56 78" />
          </Field>
        </div>
        <Field
          label="Adresse actuelle"
          hint="Logement occupé avant l'entrée dans les lieux (utile pour le dossier)."
        >
          <Input {...register('adresseActuelle')} placeholder="3 avenue de la Gare, 63000 Clermont-Ferrand" />
        </Field>
        <Checkbox label="Le locataire a un garant" {...register('avecGarant')} />
        {avecGarant && (
          <div className="space-y-3 rounded-lg bg-accent-50 p-4">
            <Field
              label="Type de garantie"
              hint="Visale : garantie publique gratuite d'Action Logement — pas de caution personnelle à saisir."
            >
              <Select {...register('garantType')}>
                <option value="physique">Personne physique (caution)</option>
                <option value="visale">Garantie Visale</option>
                <option value="autre">Autre</option>
              </Select>
            </Field>
            {garantType === 'visale' ? (
              <>
                <Field
                  label="Numéro de visa Visale"
                  hint="Fourni par le locataire depuis son espace visale.fr."
                >
                  <Input {...register('garantNumeroVisa')} placeholder="VIS-2026-00042" />
                </Field>
                <p className="text-xs text-accent-600">
                  Aucun acte à rédiger : activez le contrat de cautionnement sur votre espace bailleur
                  visale.fr avec ce visa, avant la signature du bail.
                </p>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Prénom du garant">
                    <Input {...register('garantPrenom')} />
                  </Field>
                  <Field label="Nom du garant">
                    <Input {...register('garantNom')} />
                  </Field>
                </div>
                <Field label="Adresse du garant (optionnel)" hint="Peut être complétée à la main sur l'acte imprimé.">
                  <Input {...register('garantAdresse')} />
                </Field>
              </>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
