import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { ClipboardList, Home, LogOut, Plus, UserPlus } from 'lucide-react';
import { db, lireParametres } from '@/lib/db';
import { creerEtatDesLieux, trameProposee } from '@/lib/edl';
import { bailleurRenseigne } from '@/lib/bailleur';
import { decrireErreur } from '@/lib/erreurs';
import { formatAdresse } from '@/lib/adresse';
import { nowISO } from '@/lib/ids';
import type { Bailleur, Bien, EtatDesLieux, Locataire, PieceModele } from '@/types';
import { useBrouillon } from '@/hooks/useBrouillon';
import { BienRapideModal } from '@/features/biens/BienRapideModal';
import { LocataireFormModal } from '@/features/locataires/LocataireFormModal';
import {
  Button,
  Card,
  DateInput,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  useToast,
} from '@/components/ui';

/** Contenu du brouillon : de quoi reprendre la saisie exactement au même point. */
interface SaisieEdl {
  type: 'entree' | 'sortie';
  bienId?: string;
  locataireIds: string[];
  depotGarantie?: number;
  bailReference?: string;
  bailDateEffet?: string;
  origineEtatEntree: 'edl_app' | 'edl_papier' | 'aucun';
  edlEntreeId?: string;
  dateEdlEntreePapier?: string;
  /** Pièces retenues quand le logement n'en porte pas encore. */
  piecesChoisies?: string[];
}

function saisieVide(bienId?: string): SaisieEdl {
  return {
    type: 'entree',
    bienId,
    locataireIds: [],
    origineEtatEntree: 'edl_app',
  };
}

/** Bloc bailleur réduit, affiché seulement quand les Paramètres sont vierges. */
function BlocBailleur({
  valeur,
  onChange,
}: {
  valeur: Partial<Bailleur>;
  onChange: (m: Partial<Bailleur>) => void;
}) {
  return (
    <Section
      titre="Vous, le bailleur"
      description="Votre identité figure sur l'état des lieux et sur tous les documents. Enregistrée une fois pour toutes dans les Paramètres."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Civilité">
          <Select
            value={valeur.civilite ?? 'M'}
            onChange={(e) => onChange({ civilite: e.target.value as 'M' | 'Mme' })}
          >
            <option value="M">M.</option>
            <option value="Mme">Mme</option>
          </Select>
        </Field>
        <Field label="Prénom" required>
          <Input value={valeur.prenom ?? ''} onChange={(e) => onChange({ prenom: e.target.value })} />
        </Field>
        <Field label="Nom" required>
          <Input value={valeur.nom ?? ''} onChange={(e) => onChange({ nom: e.target.value })} />
        </Field>
      </div>
      <Field label="Adresse" hint="Celle à laquelle le locataire peut vous écrire.">
        <Input value={valeur.adresse ?? ''} onChange={(e) => onChange({ adresse: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="E-mail">
          <Input value={valeur.email ?? ''} onChange={(e) => onChange({ email: e.target.value })} />
        </Field>
        <Field label="Téléphone">
          <Input
            value={valeur.telephone ?? ''}
            onChange={(e) => onChange({ telephone: e.target.value })}
          />
        </Field>
      </div>
    </Section>
  );
}

/**
 * Création d'un état des lieux **sans bail préalable**.
 *
 * L'état des lieux est un acte autonome (art. 3-2 de la loi du 6 juillet 1989) :
 * rien n'impose que le contrat auquel il sera annexé ait été rédigé ici. Le
 * logement et les parties se saisissent donc dans ce formulaire, comme le
 * formulaire de bail sait déjà le faire - et deviennent de vraies fiches,
 * réutilisables pour la sortie, la relocation, ou un bail rédigé plus tard.
 */
export function EdlRapidePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const biens = useLiveQuery(() => db.biens.orderBy('nom').toArray());
  const locataires = useLiveQuery(() => db.locataires.orderBy('nom').toArray());
  const parametres = useLiveQuery(() => lireParametres());
  const edls = useLiveQuery(() => db.edls.toArray());

  const [saisie, setSaisie] = useState<SaisieEdl>(() => saisieVide(params.get('bien') ?? undefined));
  const [bailleur, setBailleur] = useState<Partial<Bailleur>>({});
  const [modaleBien, setModaleBien] = useState(false);
  const [modaleLocataire, setModaleLocataire] = useState(false);
  const [reprise, setReprise] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charge = biens !== undefined && locataires !== undefined && parametres !== undefined;
  const brouillon = useBrouillon<SaisieEdl>('edl:nouveau', saisie, charge, {
    onRepris: (donnees, updatedAt) => {
      setSaisie(donnees);
      setReprise(updatedAt);
    },
  });

  const bailleurAConfigurer = charge && !bailleurRenseigne(parametres.bailleur);
  /* La saisie se superpose aux réglages plutôt que d'être recopiée dedans par un
     effet : le bloc part des valeurs enregistrées sans rendu supplémentaire. */
  const bailleurSaisi: Partial<Bailleur> = { ...parametres?.bailleur, ...bailleur };

  const bien = biens?.find((b) => b.id === saisie.bienId);
  const maj = (m: Partial<SaisieEdl>) => setSaisie((s) => ({ ...s, ...m }));

  /*
   * Trame proposée quand le logement n'a pas encore de pièces (créé à la volée) :
   * déduite de son type. Elle est recalculée à chaque changement de logement,
   * mais les cases décochées par l'utilisateur sont conservées.
   */
  const trame: PieceModele[] = useMemo(
    () => (bien && bien.piecesModele.length === 0 ? trameProposee(bien) : []),
    [bien],
  );
  const piecesChoisies = saisie.piecesChoisies ?? trame.map((p) => p.nom);

  /** États des lieux d'entrée signés du même logement, candidats à la comparaison. */
  const entreesDisponibles = (edls ?? []).filter(
    (e) => e.type === 'entree' && e.bienId === saisie.bienId,
  );

  if (!charge || brouillon.chargement) return null;

  const sortie = saisie.type === 'sortie';
  const pret = Boolean(saisie.bienId) && saisie.locataireIds.length > 0;

  const commencer = async () => {
    if (!bien || enCours) return;
    setEnCours(true);
    try {
      if (bailleurAConfigurer && (bailleur.nom?.trim() || bailleur.prenom?.trim())) {
        await db.parametres.put({
          ...parametres,
          bailleur: bailleurSaisi as Bailleur,
        });
      }
      const edlEntree =
        sortie && saisie.origineEtatEntree === 'edl_app'
          ? entreesDisponibles.find((e) => e.id === saisie.edlEntreeId)
          : undefined;
      const bailExterne: EtatDesLieux['bailExterne'] =
        saisie.bailReference || saisie.bailDateEffet
          ? { reference: saisie.bailReference || undefined, dateEffet: saisie.bailDateEffet || undefined }
          : undefined;

      // La trame retenue rejoint la fiche du logement : les états des lieux
      // suivants la retrouvent, et le terrain n'a plus à la reconstruire.
      const trameRetenue = trame.filter((p) => piecesChoisies.includes(p.nom));
      if (trameRetenue.length && bien.piecesModele.length === 0) {
        await db.biens.put({
          ...bien,
          piecesModele: trameRetenue.map((p, i) => ({ ...p, ordre: i })),
          updatedAt: nowISO(),
        });
      }

      const edl = await creerEtatDesLieux({
        type: saisie.type,
        bien: trameRetenue.length ? { ...bien, piecesModele: trameRetenue } : bien,
        locataireIds: saisie.locataireIds,
        edlEntree,
        depotGarantie: saisie.depotGarantie,
        bailExterne,
        origineEtatEntree: sortie ? saisie.origineEtatEntree : undefined,
        dateEdlEntreePapier: saisie.dateEdlEntreePapier,
      });
      await brouillon.oublier();
      navigate(`/edl/${edl.id}`);
    } catch (e) {
      console.error(e);
      toast('error', `Création impossible - ${decrireErreur(e)}`);
      setEnCours(false);
    }
  };

  const basculerLocataire = (l: Locataire) =>
    maj({
      locataireIds: saisie.locataireIds.includes(l.id)
        ? saisie.locataireIds.filter((x) => x !== l.id)
        : [...saisie.locataireIds, l.id],
    });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        titre="Nouvel état des lieux"
        sousTitre="Le bail n'est pas nécessaire : vous pourrez le rattacher plus tard, ou le rédiger ensuite."
      />

      {reprise && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <span>
            <span className="font-medium">Saisie reprise</span> - du{' '}
            {format(new Date(reprise), "dd/MM/yyyy 'à' HH:mm")}.
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void brouillon.oublier();
              setSaisie(saisieVide());
              setReprise(null);
            }}
          >
            Repartir de zéro
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <Section titre="Quel constat ?">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { valeur: 'entree' as const, icone: Home, titre: "État des lieux d'entrée", desc: 'Remise des clés au locataire.' },
                { valeur: 'sortie' as const, icone: LogOut, titre: 'État des lieux de sortie', desc: 'Départ du locataire, restitution du dépôt.' },
              ]
            ).map(({ valeur, icone: Icone, titre, desc }) => (
              <button
                key={valeur}
                type="button"
                onClick={() => maj({ type: valeur })}
                aria-pressed={saisie.type === valeur}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                  saisie.type === valeur
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-accent-200 bg-white hover:border-accent-300'
                }`}
              >
                <Icone size={20} className="mt-0.5 shrink-0 text-accent-600" />
                <span>
                  <span className="block font-semibold text-accent-900">{titre}</span>
                  <span className="block text-sm text-accent-600">{desc}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section
          titre="Le logement"
          description="Choisissez un logement enregistré, ou créez-le en trois champs."
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[16rem] flex-1">
              <Field label="Logement" required>
                <Select
                  value={saisie.bienId ?? ''}
                  onChange={(e) => maj({ bienId: e.target.value || undefined, piecesChoisies: undefined })}
                >
                  <option value="">-</option>
                  {biens.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nom} - {formatAdresse(b.adresse)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button variant="secondary" onClick={() => setModaleBien(true)}>
              <Plus size={16} /> Nouveau logement
            </Button>
          </div>
          {bien && bien.piecesModele.length > 0 && (
            <p className="text-xs text-accent-500">
              {bien.piecesModele.length} pièce(s) déjà décrites sur la fiche du logement : elles
              forment la trame de cet état des lieux.
            </p>
          )}
          {trame.length > 0 && (
            <div>
              <p className="mb-2 text-sm text-accent-700">
                Ce logement n'a pas encore de pièces. Voici une trame déduite de son type - ajustez-la,
                elle sera enregistrée sur la fiche du logement et resservira ensuite.
              </p>
              <div className="flex flex-wrap gap-2">
                {trame.map((p) => {
                  const actif = piecesChoisies.includes(p.nom);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={actif}
                      onClick={() =>
                        maj({
                          piecesChoisies: actif
                            ? piecesChoisies.filter((n) => n !== p.nom)
                            : [...piecesChoisies, p.nom],
                        })
                      }
                      className={`rounded-full border px-3 py-1 text-sm transition ${
                        actif
                          ? 'border-brand-500 bg-brand-50 text-brand-900'
                          : 'border-accent-200 bg-white text-accent-500'
                      }`}
                    >
                      {p.nom}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-accent-500">
                Vous pourrez ajouter des pièces et des éléments pendant l'état des lieux : ils
                rejoindront aussi la fiche du logement.
              </p>
            </div>
          )}
        </Section>

        <Section
          titre="Le ou les locataires"
          description="Les parties présentes au constat. Elles signeront le document sur l'écran."
        >
          <div className="flex flex-wrap items-center gap-2">
            {locataires.length === 0 && (
              <p className="text-sm text-accent-600">Aucun locataire enregistré pour l'instant.</p>
            )}
            {locataires.map((l) => {
              const actif = saisie.locataireIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => basculerLocataire(l)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    actif
                      ? 'border-brand-500 bg-brand-50 text-brand-900'
                      : 'border-accent-200 bg-white text-accent-700'
                  }`}
                >
                  {l.prenom} {l.nom}
                </button>
              );
            })}
            <Button variant="secondary" size="sm" onClick={() => setModaleLocataire(true)}>
              <UserPlus size={16} /> Nouveau locataire
            </Button>
          </div>
        </Section>

        <Section
          titre="Le contrat de location"
          description="Facultatif. Renseignez-le si le bail existe sur papier ou a été rédigé ailleurs : il sera cité sur le document."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Référence du bail">
              <Input
                value={saisie.bailReference ?? ''}
                onChange={(e) => maj({ bailReference: e.target.value })}
                placeholder="Bail du 01/09/2023"
              />
            </Field>
            <Field label="Date d'effet">
              <DateInput
                value={saisie.bailDateEffet ?? ''}
                onChange={(v) => maj({ bailDateEffet: v })}
              />
            </Field>
            <Field
              label="Dépôt de garantie (€)"
              hint="Sert au décompte des retenues et à la lettre de restitution."
            >
              <Input
                type="number"
                min="0"
                step="10"
                value={saisie.depotGarantie ?? ''}
                onChange={(e) =>
                  maj({ depotGarantie: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </Field>
          </div>
        </Section>

        {sortie && (
          <Section
            titre="L'état des lieux d'entrée"
            description="C'est la référence à laquelle la sortie se compare - et ce qui fonde une retenue sur le dépôt."
          >
            <div className="space-y-2">
              {[
                {
                  valeur: 'edl_app' as const,
                  titre: 'Il a été fait dans Bailiz',
                  desc: 'Les états relevés à l\'entrée seront repris ligne à ligne.',
                  disponible: entreesDisponibles.length > 0,
                },
                {
                  valeur: 'edl_papier' as const,
                  titre: 'Il existe, sur papier',
                  desc: "Vous reporterez les états d'entrée à la main pendant le constat.",
                  disponible: true,
                },
                {
                  valeur: 'aucun' as const,
                  titre: "Aucun état des lieux d'entrée n'a été fait",
                  desc: 'Le document constatera l\'état à la sortie, sans comparatif.',
                  disponible: true,
                },
              ].map((o) => (
                <label
                  key={o.valeur}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    saisie.origineEtatEntree === o.valeur
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-accent-200 bg-white'
                  } ${o.disponible ? '' : 'opacity-50'}`}
                >
                  <input
                    type="radio"
                    name="origineEtatEntree"
                    className="mt-1"
                    disabled={!o.disponible}
                    checked={saisie.origineEtatEntree === o.valeur}
                    onChange={() => maj({ origineEtatEntree: o.valeur })}
                  />
                  <span>
                    <span className="block text-sm font-medium text-accent-900">{o.titre}</span>
                    <span className="block text-sm text-accent-600">
                      {o.disponible
                        ? o.desc
                        : "Aucun état des lieux d'entrée enregistré pour ce logement."}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {saisie.origineEtatEntree === 'edl_app' && entreesDisponibles.length > 0 && (
              <Field label="État des lieux d'entrée de référence" required>
                <Select
                  value={saisie.edlEntreeId ?? ''}
                  onChange={(e) => maj({ edlEntreeId: e.target.value || undefined })}
                >
                  <option value="">-</option>
                  {entreesDisponibles.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.reference} - {format(new Date(e.date), 'dd/MM/yyyy')}
                      {e.statut === 'signe' ? ' (signé)' : ' (brouillon)'}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            {saisie.origineEtatEntree === 'edl_papier' && (
              <Field label="Date de l'état des lieux d'entrée" hint="Citée sur le document.">
                <DateInput
                  value={saisie.dateEdlEntreePapier ?? ''}
                  onChange={(v) => maj({ dateEdlEntreePapier: v })}
                />
              </Field>
            )}

            {saisie.origineEtatEntree === 'aucun' && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                À défaut d'état des lieux d'entrée, le logement est réputé avoir été reçu en bon état
                de réparations locatives (art. 1731 du code civil), sauf si vous avez été empêché de
                l'établir (art. 3-2 de la loi du 6 juillet 1989). Le document restera valable comme
                constat de sortie, mais il ne fondera à lui seul aucune retenue sur le dépôt.
              </p>
            )}
          </Section>
        )}

        {bailleurAConfigurer && (
          <BlocBailleur valeur={bailleurSaisi} onChange={(m) => setBailleur((b) => ({ ...b, ...m }))} />
        )}

        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-accent-600">
            {pret
              ? 'Tout est prêt. Le reste se remplit sur place, pièce par pièce.'
              : 'Choisissez un logement et au moins un locataire pour commencer.'}
          </p>
          <Button onClick={() => void commencer()} disabled={!pret || enCours}>
            <ClipboardList size={16} /> Commencer l'état des lieux
          </Button>
        </Card>
      </div>

      <BienRapideModal
        open={modaleBien}
        onClose={() => setModaleBien(false)}
        onCree={(b: Bien) => maj({ bienId: b.id, piecesChoisies: undefined })}
      />
      <LocataireFormModal
        open={modaleLocataire}
        onClose={() => setModaleLocataire(false)}
        onEnregistre={(l: Locataire) => maj({ locataireIds: [...saisie.locataireIds, l.id] })}
      />
    </div>
  );
}
