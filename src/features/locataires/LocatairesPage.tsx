import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Users, Plus, Pencil, Trash2, SearchX, ShieldQuestion } from 'lucide-react';
import { db } from '@/lib/db';
import { estBailEnCours } from '@/lib/bail';
import { comparerDatesDesc, comparerTexte, correspond } from '@/lib/recherche';
import type { Locataire } from '@/types';
import {
  BarreListe,
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  PageHeader,
  SEUIL_BARRE_LISTE,
  useToast,
  type OptionTri,
} from '@/components/ui';
import { perimetreSuppressionLocataire, supprimerLocataireEtDonnees, type PerimetreSuppression } from '@/lib/rgpd';
import { LocataireFormModal } from './LocataireFormModal';

type TriLocataire = 'nom' | 'recent' | 'baux';

const TRIS: OptionTri<TriLocataire>[] = [
  { valeur: 'nom', label: 'Nom (A → Z)' },
  { valeur: 'recent', label: 'Modifié récemment' },
  { valeur: 'baux', label: 'Locataires en cours d’abord' },
];

export function LocatairesPage() {
  const locataires = useLiveQuery(() => db.locataires.orderBy('nom').toArray());
  const baux = useLiveQuery(() => db.baux.toArray());
  const toast = useToast();
  const [modale, setModale] = useState<{ ouvert: boolean; locataire?: Locataire }>({ ouvert: false });
  const [suppression, setSuppression] = useState<Locataire | null>(null);
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState<TriLocataire>('nom');
  /** Ce que la suppression effacera réellement (annoncé avant confirmation). */
  const [perimetre, setPerimetre] = useState<PerimetreSuppression | null>(null);

  // Calcule le périmètre dès l'ouverture de la confirmation.
  useEffect(() => {
    if (!suppression) {
      setPerimetre(null);
      return;
    }
    let annule = false;
    void perimetreSuppressionLocataire(suppression.id).then((p) => {
      if (!annule) setPerimetre(p);
    });
    return () => {
      annule = true;
    };
  }, [suppression]);

  const visibles = useMemo(() => {
    const liste = (locataires ?? []).filter((l) =>
      correspond(
        recherche,
        l.nom,
        l.prenom,
        l.email,
        l.telephone,
        l.adresseActuelle,
        l.garant?.nom,
        l.garant?.prenom,
      ),
    );
    const enCours = new Set(
      (baux ?? []).filter(estBailEnCours).flatMap((b) => b.locataireIds ?? []),
    );
    return liste.sort((a, b) => {
      switch (tri) {
        case 'recent':
          return comparerDatesDesc(a.updatedAt, b.updatedAt);
        case 'baux': {
          const rang = (id: string) => (enCours.has(id) ? 0 : 1);
          return (
            rang(a.id) - rang(b.id) ||
            comparerTexte(a.nom ?? '', b.nom ?? '') ||
            comparerTexte(a.prenom ?? '', b.prenom ?? '')
          );
        }
        default:
          return (
            comparerTexte(a.nom ?? '', b.nom ?? '') || comparerTexte(a.prenom ?? '', b.prenom ?? '')
          );
      }
    });
  }, [locataires, baux, recherche, tri]);

  const ouvrir = (locataire?: Locataire) => setModale({ ouvert: true, locataire });

  const bauxDuLocataire = (locataireId: string) =>
    baux?.filter((b) => b.locataireIds.includes(locataireId)) ?? [];

  const supprimerDefinitivement = async (l: Locataire) => {
    const lies = bauxDuLocataire(l.id);
    const actifs = lies.filter(estBailEnCours);
    if (actifs.length > 0) {
      toast('error', 'Suppression bloquée : un bail actif ou en cours est lié à ce locataire.');
      return;
    }
    // Efface aussi baux, EDL, photos et PDF qui portent ses données personnelles.
    const efface = await supprimerLocataireEtDonnees(l.id);
    const details = [
      efface.bauxSupprimes.length ? `${efface.bauxSupprimes.length} bail(s)` : '',
      efface.edls ? `${efface.edls} état(s) des lieux` : '',
      efface.photos ? `${efface.photos} photo(s)` : '',
      efface.documents ? `${efface.documents} PDF` : '',
    ].filter(Boolean);
    toast(
      'success',
      details.length
        ? `Locataire supprimé, ainsi que ${details.join(', ')}.`
        : 'Locataire et données personnelles supprimés définitivement.',
    );
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
        <>
          {locataires.length >= SEUIL_BARRE_LISTE && (
            <BarreListe
              recherche={recherche}
              onRecherche={setRecherche}
              tri={tri}
              onTri={setTri}
              optionsTri={TRIS}
              placeholder="Rechercher un locataire (nom, e-mail, téléphone…)"
              affiches={visibles.length}
              total={locataires.length}
              nom="locataire"
              nomPluriel="locataires"
            />
          )}
          {visibles.length === 0 ? (
            <EmptyState
              icon={SearchX}
              titre="Aucun locataire ne correspond"
              message="Vérifiez l'orthographe, ou effacez la recherche pour retrouver toute la liste."
              action={<Button variant="secondary" onClick={() => setRecherche('')}>Afficher toute la liste</Button>}
            />
          ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibles.map((l) => {
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
        </>
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
        message={
          <div className="space-y-2">
            <p>
              Ses données personnelles seront effacées de cet appareil (droit à l'effacement, RGPD),
              <strong> ainsi que tous les documents qui les contiennent</strong>. La suppression est
              bloquée si un bail actif ou en cours y est lié. Cette action est irréversible.
            </p>
            {perimetre && (
              <div className="rounded-lg bg-accent-50 p-3 text-sm">
                <p className="font-medium text-accent-800">Seront également supprimés :</p>
                {perimetre.bauxSupprimes.length === 0 &&
                perimetre.edls === 0 &&
                perimetre.photos === 0 &&
                perimetre.documents === 0 ? (
                  <p className="text-accent-600">Aucune autre donnée liée.</p>
                ) : (
                  <ul className="mt-1 list-inside list-disc text-accent-700">
                    {perimetre.bauxSupprimes.length > 0 && (
                      <li>{perimetre.bauxSupprimes.length} bail(s) : {perimetre.bauxSupprimes.join(', ')}</li>
                    )}
                    {perimetre.edls > 0 && <li>{perimetre.edls} état(s) des lieux</li>}
                    {perimetre.photos > 0 && <li>{perimetre.photos} photo(s)</li>}
                    {perimetre.documents > 0 && <li>{perimetre.documents} PDF archivé(s)</li>}
                  </ul>
                )}
                {perimetre.bauxPartages.length > 0 && (
                  <p className="mt-2 text-accent-600">
                    Conservé(s) car en colocation : {perimetre.bauxPartages.join(', ')} — le locataire
                    en est retiré, mais son nom peut subsister dans les PDF déjà générés.
                  </p>
                )}
              </div>
            )}
          </div>
        }
        confirmLabel="Supprimer définitivement"
        danger
      />
    </div>
  );
}
