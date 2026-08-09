import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { AlertTriangle, Download, FolderSync, HardDriveUpload, RefreshCw } from 'lucide-react';
import { db } from '@/lib/db';
import {
  autosaveSupportee,
  choisirDossierAutosave,
  desactiverAutosave,
  derniereErreurSauvegarde,
  getConfigAutosave,
  pousserSiActive,
  reinitialiserAvertissements,
} from '@/lib/autosave';
import {
  CLIENT_ID_GDRIVE,
  connecterGDrive,
  demanderAutorisationGoogle,
  desactiverGDrive,
  estApplicationInstallee,
  lancerConnexionParRedirection,
  prechargerGsi,
} from '@/lib/gdrive';
import {
  compterEnAttente,
  derniereErreurCycle,
  instantanesDisponibles,
  lancerCycle,
  LIBELLE_SECTION,
  telechargerInstantane,
  type InstantaneDisponible,
  type ResultatSync,
} from '@/lib/sync';
import { importerSauvegarde, lireSauvegarde } from '@/lib/backup';
import { decrireErreur } from '@/lib/erreurs';
import { Button, CarteRepliable, ConfirmModal, Field, Input, useToast } from '@/components/ui';

/**
 * Panneaux de sauvegarde automatique (dossier local synchronisé et Google
 * Drive), extraits de la page Paramètres qui devenait trop longue.
 */
const MSG_BASE_VIDE =
  "Aucune donnée sur cet appareil : rien n'a été envoyé, pour ne pas écraser vos sauvegardes existantes. Utilisez « Importer une sauvegarde » pour récupérer vos données ici.";

export function SauvegardeAutoPanel() {
  const toast = useToast();
  const config = useLiveQuery(() => getConfigAutosave());

  const activer = async () => {
    try {
      await choisirDossierAutosave();
      const resultat = await pousserSiActive(true);
      if (resultat === 'ok') toast('success', 'Dossier configuré — première sauvegarde effectuée.');
      else if (resultat === 'base_vide') toast('warning', `Dossier configuré. ${MSG_BASE_VIDE}`);
      else toast('warning', 'Dossier configuré, mais la première sauvegarde a échoué.');
    } catch {
      // Sélecteur annulé par l'utilisateur : rien à faire.
    }
  };

  const pousserMaintenant = async () => {
    const resultat = await pousserSiActive(true);
    if (resultat === 'ok') toast('success', 'Sauvegarde poussée dans le dossier.');
    else if (resultat === 'base_vide') toast('warning', MSG_BASE_VIDE);
    else if (resultat === 'bloque') toast('warning', "Synchronisation interrompue par une vérification de sécurité (horloge de l'appareil, ou suppressions inhabituelles). Ouvrez les Paramètres pour décider.");
    else if (resultat === 'permission_requise')
      toast('warning', "Autorisation refusée : re-sélectionnez le dossier pour ré-autoriser l'écriture.");
    else toast('error', `Échec de la sauvegarde automatique — ${derniereErreurSauvegarde() ?? 'cause inconnue'}`);
  };

  return (
    <CarteRepliable
      identifiant="dossier-local"
      titre="Sauvegarde automatique (dossier synchronisé)"
      icone={<FolderSync size={18} />}
      resume={config ? `Dossier « ${config.nomDossier} »` : 'Aucun dossier configuré'}
    >
      {!autosaveSupportee() ? (
        <p className="text-sm text-accent-600">
          Non disponible sur ce navigateur (API File System Access requise — Chrome ou Edge sur
          ordinateur). Sur tablette/mobile, utilisez l'export manuel ci-dessus.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-accent-600">
            Choisissez un dossier <span className="font-medium">synchronisé par votre cloud</span>{' '}
            (Google Drive, OneDrive, iCloud Drive…) : l'application y poussera automatiquement
            l'archive complète après chaque document signé et à l'ouverture si la dernière
            sauvegarde date de plus de 7 jours. Les 10 archives les plus récentes sont
            conservées, les plus anciennes supprimées.
          </p>
          {config ? (
            <div className="space-y-3">
              <p className="text-sm text-accent-800">
                Dossier : <span className="font-semibold">{config.nomDossier}</span> — dernier
                push :{' '}
                {config.dernierPush
                  ? format(new Date(config.dernierPush), 'dd/MM/yyyy à HH:mm')
                  : 'jamais'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void pousserMaintenant()}>
                  <FolderSync size={14} /> Sauvegarder maintenant
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void activer()}>
                  Changer de dossier
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void desactiverAutosave().then(() => toast('info', 'Sauvegarde automatique désactivée.'))
                  }
                >
                  Désactiver
                </Button>
              </div>
              <p className="text-xs text-accent-500">
                Après un redémarrage du navigateur, une confirmation d'autorisation peut être
                demandée au prochain push (fonctionnement normal de l'API).
              </p>
            </div>
          ) : (
            <Button onClick={() => void activer()}>
              <FolderSync size={16} /> Choisir le dossier de sauvegarde
            </Button>
          )}
        </>
      )}
    </CarteRepliable>
  );
}

/**
 * Google Drive : **connexion et synchronisation entre appareils**, en un seul
 * endroit.
 *
 * Il y avait ici deux panneaux et un interrupteur : « archive complète » d'un
 * côté, « synchronisation » de l'autre. Brancher le Drive, c'est désormais
 * synchroniser — un seul mode, donc un seul panneau. Les coutures entre les
 * deux régimes (date de sauvegarde partagée, garde-fou de divergence devenu
 * sans objet, vocabulaires de résultat mélangés) avaient produit à elles seules
 * l'essentiel des défauts de synchronisation.
 */
export function SauvegardeGDrivePanel() {
  const toast = useToast();
  const parametres = useLiveQuery(() => db.parametres.get('singleton'));
  const enAttente = useLiveQuery(() => compterEnAttente());
  const [clientId, setClientId] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [dernier, setDernier] = useState<ResultatSync | null>(null);
  const [confirmerSuppressions, setConfirmerSuppressions] = useState(false);
  const [instantanes, setInstantanes] = useState<InstantaneDisponible[] | null>(null);
  const [aRestaurer, setARestaurer] = useState<InstantaneDisponible | null>(null);
  const config = parametres?.sauvegardeGDrive;

  /*
   * Un échange qui date signale presque toujours une autorisation Google
   * expirée. L'heure courante est lue dans un effet, jamais pendant le rendu :
   * celui-ci doit rester déterministe (règle react-hooks/purity).
   */
  const [echangeAncien, setEchangeAncien] = useState(false);
  useEffect(() => {
    const actif = Boolean(config?.actif);
    const dernierEchange = config?.derniereSync;
    setEchangeAncien(
      actif && (!dernierEchange || Date.now() - new Date(dernierEchange).getTime() > 24 * 3600 * 1000),
    );
  }, [config?.actif, config?.derniereSync]);

  // Le script Google est chargé dès l'affichage : au clic, la fenêtre de
  // connexion doit s'ouvrir sans attente réseau, sinon Safari/iOS la bloque.
  useEffect(() => {
    prechargerGsi();
  }, []);

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
    } else if (resultat.etat === 'ignore') {
      toast('info', 'Une synchronisation est déjà en cours.');
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
      /*
       * L'autorisation est demandée AVANT tout accès à la base : la fenêtre
       * Google doit s'ouvrir dans l'activation du clic, sinon Safari/iOS la
       * bloque silencieusement (« fenêtre fermée » alors que rien ne s'est
       * ouvert).
       */
      const idClient = config?.clientId || CLIENT_ID_GDRIVE;
      if (estApplicationInstallee()) {
        lancerConnexionParRedirection(idClient);
        return;
      }
      if (!(await demanderAutorisationGoogle(idClient))) {
        toast(
          'warning',
          "Autorisation Google non obtenue : la fenêtre a été fermée, refusée, ou bloquée par le navigateur. Sur iPad : Réglages > Safari > désactiver « Bloquer les fenêtres surgissantes », puis réessayez.",
        );
        return;
      }
      reinitialiserAvertissements();
      annoncer(await lancerCycle(true, options));
    } finally {
      setEnCours(false);
      setConfirmerSuppressions(false);
    }
  };

  const connecter = async () => {
    const id = (clientId || config?.clientId || CLIENT_ID_GDRIVE).trim();
    if (!id.endsWith('.apps.googleusercontent.com')) {
      toast('error', "L'ID client doit se terminer par .apps.googleusercontent.com");
      return;
    }
    // PWA installée : la fenêtre Google n'y reçoit pas le focus clavier sur iOS,
    // on passe donc par une redirection de la fenêtre principale.
    if (estApplicationInstallee()) {
      lancerConnexionParRedirection(id);
      return;
    }
    setEnCours(true);
    try {
      // Jeton demandé en premier, dans le geste utilisateur (contrainte Safari).
      if (!(await connecterGDrive(id))) {
        toast(
          'warning',
          "Connexion Google non aboutie : fenêtre fermée, refusée, ou bloquée par le navigateur. Sur iPad, autorisez les fenêtres surgissantes pour ce site (Réglages > Safari) puis réessayez.",
        );
        return;
      }
      toast('success', 'Google Drive connecté — première synchronisation en cours.');
      annoncer(await lancerCycle(true));
    } finally {
      setEnCours(false);
    }
  };

  const chargerInstantanes = async () => {
    setEnCours(true);
    try {
      const liste = await instantanesDisponibles();
      setInstantanes(liste ?? []);
      if (liste === null) {
        toast('warning', 'Drive inaccessible : autorisation à renouveler, ou appareil hors ligne.');
      } else if (liste.length === 0) {
        toast('info', 'Aucun instantané sur le Drive pour le moment.');
      }
    } finally {
      setEnCours(false);
    }
  };

  const restaurer = async () => {
    if (!aRestaurer) return;
    setEnCours(true);
    try {
      const blob = await telechargerInstantane(aRestaurer.id);
      if (!blob) {
        toast('warning', 'Téléchargement impossible : autorisation Google à renouveler.');
        return;
      }
      const { zip, data } = await lireSauvegarde(blob);
      const resume = await importerSauvegarde(zip, data, 'remplacer');
      setARestaurer(null);
      toast(
        'success',
        `Données remplacées par l'instantané : ${resume.biens} biens, ${resume.baux} baux, ${resume.edls} EDL, ${resume.photos} photos.`,
      );
    } catch (e) {
      toast('error', `Restauration impossible — ${decrireErreur(e)}`);
    } finally {
      setEnCours(false);
    }
  };

  const doublons = dernier?.etat === 'ok' ? dernier.doublons : [];
  const reglagesEcrases = dernier?.etat === 'ok' ? dernier.reglagesEcrases : [];

  return (
    <CarteRepliable
      identifiant="drive"
      titre="Google Drive — synchronisation entre appareils"
      icone={<RefreshCw size={18} />}
      resume={
        config?.actif
          ? `Connecté · dernier échange ${
              config.derniereSync
                ? format(new Date(config.derniereSync), 'dd/MM à HH:mm')
                : 'jamais'
            }`
          : 'Non connecté — les appareils n’échangent rien'
      }
      resumeAlerte={!config?.actif}
    >
      <p className="mb-3 text-sm text-accent-600">
        Vos appareils échangent <strong>fiche par fiche</strong> via un dossier « Bailiz » sur
        votre Drive : les modifications faites en parallèle sur deux appareils se rejoignent au
        lieu de s'écraser, les photos ne remontent qu'une fois, et les suppressions se propagent.
        Une archive ZIP complète est déposée à part comme filet de sécurité. L'application
        n'accède qu'aux fichiers qu'elle a elle-même créés (scope{' '}
        <span className="font-mono text-xs">drive.file</span>). Hors connexion, tout repart au
        retour du réseau.
      </p>

      {config?.actif ? (
        <div className="space-y-3">
          <p className="text-sm text-accent-800">
            Connecté. Dernier échange :{' '}
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

          {echangeAncien && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Aucun échange depuis plus de 24 h. L'autorisation Google expire au bout d'environ une
              heure et ne peut pas être renouvelée sans vous (l'application n'a aucun serveur) —
              c'est systématique sur iPad, où Safari bloque le renouvellement silencieux. Cliquez
              sur « Synchroniser maintenant » pour ré-autoriser et repartir.
            </p>
          )}

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

          {reglagesEcrases.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">
                Réglages modifiés des deux côtés depuis le dernier échange :
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-amber-800">
                {reglagesEcrases.map((s) => (
                  <li key={s}>{LIBELLE_SECTION[s]}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-amber-700">
                La version du Drive a été retenue — il faut bien que les deux appareils tranchent
                dans le même sens, sinon chacun réimposerait la sienne indéfiniment. Vérifiez ces
                réglages : ce que vous aviez saisi ici vient d'être remplacé.
              </p>
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

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void synchroniserMaintenant()} disabled={enCours}>
              <RefreshCw size={14} /> {enCours ? 'Synchronisation…' : 'Synchroniser maintenant'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void chargerInstantanes()} disabled={enCours}>
              <Download size={14} /> Restaurer un instantané
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void desactiverGDrive().then(() => toast('info', 'Google Drive déconnecté.'))
              }
            >
              Déconnecter
            </Button>
          </div>

          {instantanes !== null && instantanes.length > 0 && (
            <div className="rounded-lg border border-accent-200 p-3">
              <p className="mb-2 text-sm text-accent-800">
                Archives complètes figées sur le Drive. Restaurer remplace{' '}
                <strong>toutes</strong> les données de cet appareil par celles de l'archive.
              </p>
              <ul className="space-y-1">
                {instantanes.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-accent-800">
                      {format(i.date, "dd/MM/yyyy 'à' HH:mm")}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setARestaurer(i)} disabled={enCours}>
                      Restaurer
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-accent-500">
            La synchronisation se déclenche à l'ouverture, au retour sur l'application, toutes les
            cinq minutes, après chaque signature et quelques secondes après une modification.
            Après un temps d'inactivité, Google peut redemander une confirmation : c'est normal.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Button onClick={() => void connecter()} disabled={enCours}>
            <HardDriveUpload size={16} /> {enCours ? 'Connexion…' : 'Connecter Google Drive'}
          </Button>
          {/*
            Réglage technique replié : l'identifiant de l'application suffit dans
            tous les cas. Il n'est utile qu'à qui héberge sa propre copie de
            Bailiz avec son projet Google Cloud.
          */}
          <details className="rounded-lg border border-accent-200 px-3 py-2">
            <summary className="cursor-pointer text-sm text-accent-600">
              Utiliser mon propre projet Google Cloud (avancé)
            </summary>
            <div className="mt-3">
              <Field
                label="ID client OAuth Google"
                hint="Renseigné par défaut avec l'identifiant de l'application : vous n'avez rien à modifier. À remplacer uniquement si vous hébergez votre propre copie (console.cloud.google.com, API Drive activée, ID client OAuth « Application Web » avec ce site en origine autorisée). Cet identifiant n'est pas un secret."
              >
                <Input
                  value={clientId || config?.clientId || CLIENT_ID_GDRIVE}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="1234567890-abc123.apps.googleusercontent.com"
                />
              </Field>
            </div>
          </details>
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
      <ConfirmModal
        open={aRestaurer !== null}
        onClose={() => setARestaurer(null)}
        onConfirm={restaurer}
        title="Restaurer cet instantané ?"
        message="Toutes les données de cet appareil seront remplacées par celles de l'archive. Ce qui a été saisi depuis sera définitivement perdu, ici comme sur les autres appareils une fois la synchronisation passée. Exportez d'abord une sauvegarde locale si vous avez le moindre doute."
        confirmLabel="Remplacer mes données"
        danger
      />
    </CarteRepliable>
  );
}
