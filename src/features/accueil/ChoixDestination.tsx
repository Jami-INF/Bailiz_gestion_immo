import { useEffect, useState } from 'react';
import { Cloud, FolderSync, Laptop, ShieldCheck } from 'lucide-react';
import {
  autosaveSupportee,
  choisirDossierAutosave,
  pousserSiActive,
  reinitialiserAvertissements,
} from '@/lib/autosave';
import {
  connecterGDrive,
  estApplicationInstallee,
  lancerConnexionParRedirection,
  prechargerGsi,
} from '@/lib/gdrive';
import { lancerCycle } from '@/lib/sync';
import { memoriserRepriseAccueil } from '@/lib/accueil';
import { Button, useToast } from '@/components/ui';

/**
 * Le choix d'une destination pour les données, présenté par le **besoin** et
 * non par la technique.
 *
 * Les deux options existaient déjà dans les Paramètres, sous les titres
 * « Sauvegarde automatique (dossier synchronisé) » et « Google Drive -
 * synchronisation entre appareils » : exacts, et illisibles pour qui découvre
 * l'application. Ici, on nomme ce que l'utilisateur veut obtenir.
 *
 * Partagé par le parcours d'accueil et par la carte du tableau de bord : c'est
 * le même écran qui pose la question et qui permet d'y revenir, pour qu'il n'y
 * ait jamais deux formulations concurrentes du même choix.
 */
export function ChoixDestination({ onChoisi }: { onChoisi?: () => void }) {
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);
  const surOrdinateur = autosaveSupportee();

  /*
   * Script Google chargé dès l'affichage : au clic, la fenêtre de connexion doit
   * s'ouvrir sans attente réseau, sinon Safari/iOS la bloque sans rien dire.
   */
  useEffect(() => {
    prechargerGsi();
  }, []);

  /**
   * L'ordre n'est pas négociable : la demande d'autorisation est la **première
   * instruction**. Safari/iOS n'ouvre la fenêtre Google que tant que dure
   * l'activation du geste, et le moindre accès à IndexedDB avant elle suffit à
   * la faire expirer - le bouton semble alors ne rien faire.
   */
  const connecterDrive = async () => {
    // PWA installée : sur iOS la fenêtre Google ne reçoit jamais le focus
    // clavier. On quitte l'application, et on revient avec le jeton.
    if (estApplicationInstallee()) {
      memoriserRepriseAccueil();
      lancerConnexionParRedirection();
      return;
    }
    const promesse = connecterGDrive();
    setEnCours(true);
    try {
      if (!(await promesse)) {
        toast(
          'warning',
          "Connexion Google non aboutie : fenêtre fermée, refusée, ou bloquée par le navigateur. Sur iPad, autorisez les fenêtres surgissantes pour ce site (Réglages > Safari), puis réessayez.",
        );
        return;
      }
      reinitialiserAvertissements();
      toast('success', 'Google Drive connecté - vos données sont à l’abri.');
      onChoisi?.();
      // La première synchronisation peut être longue : elle ne retient pas
      // l'écran, l'accueil est déjà terminé.
      void lancerCycle(true);
    } finally {
      setEnCours(false);
    }
  };

  const choisirDossier = async () => {
    try {
      await choisirDossierAutosave();
    } catch {
      return; // sélecteur annulé : rien à signaler
    }
    setEnCours(true);
    try {
      const resultat = await pousserSiActive(true);
      toast(
        resultat === 'erreur' ? 'warning' : 'success',
        resultat === 'erreur'
          ? 'Dossier enregistré, mais la première archive a échoué. Réessayez depuis les Paramètres.'
          : 'Dossier enregistré - vos données y seront archivées automatiquement.',
      );
      onChoisi?.();
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
        <p className="flex items-start gap-2">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-600" />
          <span>
            Bailiz fonctionne <strong>entièrement sur votre appareil</strong> : vos biens, vos
            locataires et vos photos restent dans ce navigateur et ne transitent par aucun
            serveur.
          </span>
        </p>
        <p className="mt-2 pl-[26px]">
          C’est aussi ce qui les rend fragiles : vider les données du navigateur, changer
          d’appareil ou perdre la tablette les efface. Choisissez où les mettre à l’abri.
        </p>
      </div>

      <Option
        icone={<Cloud size={20} />}
        titre="Retrouver mes fiches sur tous mes appareils"
        description="L’iPad et l’ordinateur travaillent sur les mêmes dossiers : chaque fiche, photo et document se synchronise dans les deux sens. Bailiz n’accède qu’au dossier « Bailiz » qu’il crée lui-même."
        bouton="Connecter Google Drive"
        onClick={() => void connecterDrive()}
        enCours={enCours}
        recommande
      />

      {surOrdinateur ? (
        <Option
          icone={<FolderSync size={20} />}
          titre="Déposer une archive sur cet ordinateur"
          description="Un dossier de votre choix - y compris synchronisé par Drive, OneDrive ou iCloud - reçoit une archive complète après chaque document signé."
          bouton="Choisir un dossier"
          onClick={() => void choisirDossier()}
          enCours={enCours}
        />
      ) : (
        /*
         * Sur iPad, l'option n'est pas affichée du tout : elle réclame l'API
         * File System Access, absente de Safari. Restait à dire pourquoi il n'y
         * a qu'un choix, sinon on laisse chercher une option qui n'existe pas.
         */
        <p className="flex items-start gap-2 text-xs text-accent-500">
          <Laptop size={14} className="mt-0.5 shrink-0" />
          La sauvegarde dans un dossier de l’appareil n’est possible que sur ordinateur, avec
          Chrome ou Edge. Sur iPad, Google Drive est la seule destination disponible.
        </p>
      )}

      {surOrdinateur && (
        <p className="text-xs text-accent-500">
          Les deux peuvent être utilisées ensemble, et se modifient à tout moment dans les
          Paramètres.
        </p>
      )}
    </div>
  );
}

function Option({
  icone,
  titre,
  description,
  bouton,
  onClick,
  enCours,
  recommande,
}: {
  icone: React.ReactNode;
  titre: string;
  description: string;
  bouton: string;
  onClick: () => void;
  enCours: boolean;
  recommande?: boolean;
}) {
  return (
    <div className="rounded-xl border border-accent-200 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-brand-600">{icone}</span>
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 font-semibold text-accent-900">
            {titre}
            {recommande && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                Recommandé
              </span>
            )}
          </h3>
          <p className="mt-1 text-sm text-accent-600">{description}</p>
          <Button className="mt-3" size="sm" onClick={onClick} disabled={enCours}>
            {bouton}
          </Button>
        </div>
      </div>
    </div>
  );
}
