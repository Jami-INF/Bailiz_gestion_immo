import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Users, Plus, Pencil, Trash2, ShieldQuestion } from 'lucide-react';
import { db } from '@/lib/db';
import { uid, nowISO } from '@/lib/ids';
import type { Locataire } from '@/types';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmModal,
  DateInput,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  useToast,
} from '@/components/ui';

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
  };
}

export function LocatairesPage() {
  const locataires = useLiveQuery(() => db.locataires.orderBy('nom').toArray());
  const baux = useLiveQuery(() => db.baux.toArray());
  const toast = useToast();
  const [modale, setModale] = useState<{ ouvert: boolean; locataire?: Locataire }>({ ouvert: false });
  const [suppression, setSuppression] = useState<Locataire | null>(null);

  const { register, handleSubmit, reset, watch, control, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: versForm(),
  });
  const avecGarant = watch('avecGarant');

  const ouvrir = (locataire?: Locataire) => {
    reset(versForm(locataire));
    setModale({ ouvert: true, locataire });
  };

  const enregistrer = handleSubmit(async (v) => {
    const existant = modale.locataire;
    const locataire: Locataire = {
      id: existant?.id ?? uid(),
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
          }
        : undefined,
      createdAt: existant?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };
    await db.locataires.put(locataire);
    toast('success', existant ? 'Locataire mis à jour.' : 'Locataire créé.');
    setModale({ ouvert: false });
  });

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

      <Modal
        open={modale.ouvert}
        onClose={() => setModale({ ouvert: false })}
        title={modale.locataire ? 'Modifier le locataire' : 'Nouveau locataire'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModale({ ouvert: false })}>
              Annuler
            </Button>
            <Button onClick={enregistrer}>Enregistrer</Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={enregistrer}>
          <div className="grid grid-cols-3 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prénom du garant">
                  <Input {...register('garantPrenom')} />
                </Field>
                <Field label="Nom du garant">
                  <Input {...register('garantNom')} />
                </Field>
              </div>
              <Field label="Adresse du garant">
                <Input {...register('garantAdresse')} />
              </Field>
            </div>
          )}
        </form>
      </Modal>

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
