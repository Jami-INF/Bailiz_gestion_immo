import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import {
  BookOpen,
  Calculator,
  ClipboardList,
  ExternalLink,
  Eye,
  FileText,
  Receipt,
  Ruler,
  Scale,
  ShieldQuestion,
  type LucideIcon,
} from 'lucide-react';
import { db, lireParametres } from '@/lib/db';
import { estBailEnCours } from '@/lib/bail';
import { GUIDES, lienGuide } from '@/lib/liens';
import { genererEtArchiver } from '@/lib/pdf/generer';
import { GrilleVetustePdf } from '@/lib/pdf/GrilleVetustePdf';
import { FicheAidePdf } from '@/lib/pdf/FicheAidePdf';
import { useActionUnique } from '@/hooks/useActionUnique';
import { EmpreintePanel } from '@/features/parametres/EmpreintePanel';
import { FicheVisiteModal } from '@/features/biens/FicheVisiteModal';
import { Button, Card, CarteRepliable, PageHeader, useToast } from '@/components/ui';
import { SelecteurEntite, type OptionEntite } from './SelecteurEntite';
import { ouvrirActeCautionnement } from './acteCautionnement';

/**
 * Une ligne de la boîte à outils : icône, nom du document, ce qu'il contient.
 *
 * Même forme que « Documents utiles » sur la fiche d'un bail - délibérément :
 * c'est le même geste, vu depuis le parc au lieu d'un contrat, et deux
 * présentations pour une même chose feraient croire à deux fonctions.
 */
function LigneOutil({
  icone: Icone,
  titre,
  description,
  to,
  onClick,
  disabled,
}: {
  icone: LucideIcon;
  titre: string;
  description: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const contenu = (
    <>
      <Icone size={16} className="mt-0.5 shrink-0 text-accent-400" />
      <span>
        <span className="block text-sm font-medium text-accent-900">{titre}</span>
        <span className="block text-xs text-accent-500">{description}</span>
      </span>
    </>
  );
  const classe =
    'flex min-h-touch w-full items-start gap-3 rounded-lg border border-accent-200 px-3 py-2 text-left hover:bg-accent-50';

  if (to) {
    return (
      <Link to={to} className={classe}>
        {contenu}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${classe} disabled:opacity-60`}>
      {contenu}
    </button>
  );
}

/** Quel sélecteur est ouvert ; `null` quand aucun. */
type Selection = 'fiche-visite' | 'caution' | 'irl' | 'restitution';

/**
 * Boîte à outils : tous les documents que Bailiz sait produire, au même
 * endroit, **sans condition d'entrée**.
 *
 * L'application exposait bien ses deux parcours - rédiger un bail, mener un
 * état des lieux - et mal ses sept outils : l'acte de cautionnement et le
 * courrier de révision n'existaient que sur la fiche d'un bail, la fiche de
 * visite que sur celle d'un bien, la grille de vétusté et la fiche d'aide au
 * fond des Paramètres. Un bailleur dont le contrat a été signé en agence devait
 * donc saisir un bail entier pour obtenir une lettre d'une page. Il ne le
 * faisait pas.
 *
 * Rien n'est reproduit ici : chaque ligne appelle le générateur existant, et
 * les deux outils qui demandent un vrai contexte de calcul (révision IRL,
 * restitution du dépôt) renvoient à l'écran qui le détient, calculateur déjà
 * ouvert. La fiche d'un bail garde sa propre section « Documents utiles » :
 * c'est le raccourci contextuel, celui-ci est l'entrée générale.
 */
export function OutilsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const generation = useActionUnique();
  const parametres = useLiveQuery(() => lireParametres());
  const biens = useLiveQuery(() => db.biens.orderBy('nom').toArray());
  const baux = useLiveQuery(() => db.baux.toArray());
  const edls = useLiveQuery(() => db.edls.toArray());

  const [selection, setSelection] = useState<Selection | null>(null);
  const [bienVisite, setBienVisite] = useState<string | null>(null);

  const nomBien = (bienId: string) => biens?.find((b) => b.id === bienId)?.nom ?? 'bien supprimé';

  const optionsBiens: OptionEntite[] = (biens ?? []).map((b) => ({
    id: b.id,
    titre: b.nom,
    detail: `${b.nbPieces} pièce(s) · ${b.surfaceBoutin} m²`,
  }));

  /*
   * Baux en cours seulement : réviser le loyer d'un bail terminé n'a pas d'objet,
   * et un brouillon n'a pas encore de locataire à qui notifier quoi que ce soit.
   */
  const optionsBaux: OptionEntite[] = (baux ?? []).filter(estBailEnCours).map((b) => ({
    id: b.id,
    titre: b.reference,
    detail: nomBien(b.bienId),
  }));

  const optionsIrl: OptionEntite[] = (baux ?? [])
    .filter((b) => estBailEnCours(b) && b.revisionIRL.revisable)
    .map((b) => ({ id: b.id, titre: b.reference, detail: nomBien(b.bienId) }));

  /*
   * La lettre de restitution se calcule depuis un état des lieux de **sortie
   * signé** : c'est sa signature qui fait courir le délai légal (un mois, deux
   * en cas de retenue). Proposer un brouillon mènerait à une lettre dont la
   * date limite serait fausse.
   */
  const optionsRestitution: OptionEntite[] = (edls ?? [])
    .filter((e) => e.type === 'sortie' && e.statut === 'signe')
    .map((e) => ({
      id: e.id,
      titre: `${e.reference} - ${nomBien(e.bienId)}`,
      detail: `Sortie du ${format(new Date(e.date), 'dd/MM/yyyy')}`,
    }));

  const genererGrille = async () => {
    if (!parametres) return;
    await genererEtArchiver({
      type: 'grille_vetuste',
      titre: 'Grille de vétusté (avec mode d’emploi)',
      element: (reference) => (
        <GrilleVetustePdf reference={reference} grille={parametres.grilleVetuste} />
      ),
    });
    toast('success', 'Grille de vétusté générée (PDF).');
  };

  const genererFicheAide = async () => {
    await genererEtArchiver({
      type: 'fiche_aide',
      titre: 'Fiche d’aide juridique du bailleur meublé',
      element: (reference) => <FicheAidePdf reference={reference} />,
    });
    toast('success', "Fiche d'aide juridique générée (PDF).");
  };

  const bienChoisi = bienVisite ? biens?.find((b) => b.id === bienVisite) : undefined;

  /** Message d'un sélecteur vide : il dit toujours par où commencer. */
  const rienAProposer = (texte: string, lien: string, bouton: string): ReactNode => (
    <div className="rounded-lg bg-accent-50 p-3">
      <p className="text-sm text-accent-700">{texte}</p>
      <Link to={lien} onClick={() => setSelection(null)} className="mt-2 inline-block">
        <Button size="sm">{bouton}</Button>
      </Link>
    </div>
  );

  return (
    <div>
      <PageHeader
        titre="Outils"
        sousTitre="Tous les documents que Bailiz sait produire. Aucun ne réclame de fiche préalable : ce qui manque reste à compléter à la main."
      />

      <div className="space-y-4">
        <Card>
          <h2 className="mb-1 font-semibold text-accent-900">Produire un document</h2>
          <p className="mb-3 text-sm text-accent-500">
            Les documents sont générés sur cet appareil et archivés dans « Documents ».
          </p>
          <div className="space-y-2">
            <LigneOutil
              icone={FileText}
              titre="Bail meublé"
              description="Contrat complet avec ses annexes, en un écran et avec aperçu."
              to="/baux/nouveau"
            />
            <LigneOutil
              icone={ClipboardList}
              titre="État des lieux"
              description="Entrée ou sortie, photos et signatures. Aucun bail n'est nécessaire."
              to="/edl/nouveau"
            />
            <LigneOutil
              icone={Eye}
              titre="Fiche de visite"
              description="Remise au candidat en fin de visite : conditions, pièces du dossier, acte de cautionnement joint."
              onClick={() => setSelection('fiche-visite')}
            />
            <LigneOutil
              icone={ShieldQuestion}
              titre="Acte de cautionnement"
              description="Cautionnement solidaire (art. 22-1 de la loi de 1989) : vierge, ou pré-rempli depuis un bail."
              onClick={() => setSelection('caution')}
              disabled={generation.enCours}
            />
            <LigneOutil
              icone={Calculator}
              titre="Courrier de révision IRL"
              description="Calcule le nouveau loyer et notifie le locataire, en repartant du loyer courant."
              onClick={() => setSelection('irl')}
            />
            <LigneOutil
              icone={Receipt}
              titre="Lettre de restitution du dépôt"
              description="Décompte des retenues et délai légal, depuis un état des lieux de sortie signé."
              onClick={() => setSelection('restitution')}
            />
            <LigneOutil
              icone={Ruler}
              titre="Grille de vétusté (PDF)"
              description="Avec son mode d'emploi. Annexée d'office à chaque bail (décret 2016-382)."
              onClick={() => generation.lancer(genererGrille)}
              disabled={generation.enCours || !parametres}
            />
            <LigneOutil
              icone={Scale}
              titre="Fiche d'aide juridique (PDF)"
              description="Préavis, congés, notification, impayés, dépôt de garantie, prescription, ADIL."
              onClick={() => generation.lancer(genererFicheAide)}
              disabled={generation.enCours}
            />
          </div>
        </Card>

        <EmpreintePanel />

        <CarteRepliable
          identifiant="guides"
          titre="Comprendre"
          icone={<BookOpen size={18} />}
          resume={`${GUIDES.length} guides sur bailiz.fr`}
        >
          <p className="mb-3 text-sm text-accent-600">
            Articles de fond publiés sur le site. Ils suivent les textes en vigueur et ne sont pas
            embarqués dans l'application : ils s'ouvrent dans votre navigateur, et demandent donc
            une connexion.
          </p>
          <ul className="space-y-1">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <a
                  href={lienGuide(g.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-touch items-center gap-2 rounded-lg px-2 text-sm text-accent-700 hover:bg-accent-50 hover:text-accent-900"
                >
                  <ExternalLink size={14} className="shrink-0 text-accent-400" aria-hidden />
                  {g.titre}
                </a>
              </li>
            ))}
          </ul>
        </CarteRepliable>
      </div>

      <SelecteurEntite
        open={selection === 'fiche-visite'}
        onClose={() => setSelection(null)}
        titre="Fiche de visite - quel logement ?"
        description="Les conditions imprimées (loyer, charges, dépôt, disponibilité) viennent de la fiche du bien."
        options={optionsBiens}
        onChoisir={setBienVisite}
        vide={rienAProposer(
          "La fiche de visite décrit un logement : il en faut donc un. C'est la seule saisie à faire avant, et elle resservira pour le bail.",
          '/biens/nouveau',
          'Créer un bien',
        )}
      />

      <SelecteurEntite
        open={selection === 'caution'}
        onClose={() => setSelection(null)}
        titre="Acte de cautionnement"
        options={optionsBaux}
        horsFiche={{
          libelle: 'Modèle vierge',
          detail:
            'Avec votre identité de bailleur ; le reste est laissé en pointillés, à compléter et signer à la main.',
          onChoisir: () => generation.lancer(() => ouvrirActeCautionnement()),
        }}
        onChoisir={(id) =>
          generation.lancer(async () => {
            const bail = await db.baux.get(id);
            const bien = bail ? await db.biens.get(bail.bienId) : undefined;
            if (!bail || !bien) {
              toast('error', "Ce bail n'est plus complet : son logement a été supprimé.");
              return;
            }
            const locataires = await db.locataires
              .where('id')
              .anyOf(bail.locataireIds ?? [])
              .toArray();
            await ouvrirActeCautionnement({ bail, bien, locataires });
          })
        }
      />

      <SelecteurEntite
        open={selection === 'irl'}
        onClose={() => setSelection(null)}
        titre="Révision IRL - quel bail ?"
        description="Seuls les baux en cours dont le loyer est révisable sont proposés."
        options={optionsIrl}
        onChoisir={(id) => navigate(`/baux/${id}?outil=irl`)}
        vide={rienAProposer(
          "Aucun bail en cours n'est révisable. La clause de révision se coche à la rédaction du bail, et le courrier repart de l'indice qui y figure.",
          '/baux/nouveau',
          'Rédiger un bail',
        )}
      />

      <SelecteurEntite
        open={selection === 'restitution'}
        onClose={() => setSelection(null)}
        titre="Restitution du dépôt - quel état des lieux ?"
        description="La lettre se calcule par comparaison avec l'état des lieux d'entrée, et le délai court depuis la signature de la sortie."
        options={optionsRestitution}
        onChoisir={(id) => navigate(`/edl/${id}/synthese`)}
        vide={rienAProposer(
          "Aucun état des lieux de sortie signé. Le décompte des retenues suppose une sortie constatée contradictoirement : c'est elle qui rend la retenue justifiable.",
          '/edl/nouveau',
          'Faire un état des lieux',
        )}
      />

      {bienChoisi && (
        <FicheVisiteModal
          bien={bienChoisi}
          open
          onClose={() => {
            setBienVisite(null);
            setSelection(null);
          }}
        />
      )}
    </div>
  );
}
