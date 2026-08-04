import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { FolderSync, HardDriveUpload } from 'lucide-react';
import { db } from '@/lib/db';
import {
  autosaveSupportee,
  choisirDossierAutosave,
  desactiverAutosave,
  derniereErreurSauvegarde,
  getConfigAutosave,
  pousserSiActive,
} from '@/lib/autosave';
import {
  CLIENT_ID_GDRIVE,
  activerGDrive,
  connecterGDrive,
  consommerRetourRedirection,
  demanderAutorisationGoogle,
  derniereErreurGDrive,
  desactiverGDrive,
  estApplicationInstallee,
  lancerConnexionParRedirection,
  pousserSauvegardeGDrive,
  prechargerGsi,
} from '@/lib/gdrive';
import { Button, Card, Field, Input, useToast } from '@/components/ui';

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
    else if (resultat === 'permission_requise')
      toast('warning', "Autorisation refusée : re-sélectionnez le dossier pour ré-autoriser l'écriture.");
    else toast('error', `Échec de la sauvegarde automatique — ${derniereErreurSauvegarde() ?? 'cause inconnue'}`);
  };

  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-accent-900">
        <FolderSync size={18} /> Sauvegarde automatique (dossier synchronisé)
      </h2>
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
    </Card>
  );
}

/**
 * Sauvegarde vers Google Drive (API drive.file) : fonctionne sur tous les
 * navigateurs, y compris Safari/iPad où File System Access n'existe pas.
 */
export function SauvegardeGDrivePanel() {
  const toast = useToast();
  const parametres = useLiveQuery(() => db.parametres.get('singleton'));
  const [clientId, setClientId] = useState('');
  const [enCours, setEnCours] = useState(false);
  const config = parametres?.sauvegardeGDrive;
  /*
   * Un envoi qui date signale presque toujours une autorisation Google expirée.
   * L'heure courante est lue dans un effet, jamais pendant le rendu : celui-ci
   * doit rester déterministe (règle react-hooks/purity).
   */
  const [envoiAncien, setEnvoiAncien] = useState(false);
  useEffect(() => {
    const actif = Boolean(config?.actif);
    const dernier = config?.dernierPush;
    setEnvoiAncien(actif && (!dernier || Date.now() - new Date(dernier).getTime() > 24 * 3600 * 1000));
  }, [config?.actif, config?.dernierPush]);

  // Le script Google est chargé dès l'affichage : au clic, la fenêtre de
  // connexion doit s'ouvrir sans attente réseau, sinon Safari/iOS la bloque.
  useEffect(() => {
    prechargerGsi();
  }, []);

  /*
   * Retour de la connexion par redirection : le jeton est déjà en mémoire, il
   * reste à activer la destination et à pousser la première sauvegarde.
   */
  useEffect(() => {
    const idUtilise = consommerRetourRedirection();
    if (!idUtilise) return;
    setEnCours(true);
    void (async () => {
      try {
        await activerGDrive(idUtilise);
        const resultat = await pousserSauvegardeGDrive(true);
        if (resultat === 'ok') toast('success', 'Google Drive connecté — sauvegarde envoyée.');
        else if (resultat === 'base_vide') toast('warning', `Google Drive connecté. ${MSG_BASE_VIDE}`);
        else toast('warning', "Google Drive connecté, mais l'envoi n'a pas abouti : réessayez.");
      } finally {
        setEnCours(false);
      }
    })();
  }, [toast]);

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
      const autorise = await connecterGDrive(id);
      if (!autorise) {
        toast(
          'warning',
          "Connexion Google non aboutie : fenêtre fermée, refusée, ou bloquée par le navigateur. Sur iPad, autorisez les fenêtres surgissantes pour ce site (Réglages > Safari) puis réessayez.",
        );
        return;
      }
      const resultat = await pousserSauvegardeGDrive(true);
      if (resultat === 'ok') {
        toast('success', 'Google Drive connecté — première sauvegarde poussée dans le dossier « Bailiz ».');
      } else if (resultat === 'base_vide') {
        toast('warning', `Google Drive connecté. ${MSG_BASE_VIDE}`);
      } else if (resultat === 'permission_requise') {
        toast('warning', 'Autorisation Google expirée : réessayez.');
        await desactiverGDrive();
      } else if (resultat === 'hors_ligne') {
        toast('warning', 'Configuré — la première sauvegarde partira au retour du réseau.');
      } else {
        toast(
          'error',
          `Échec de l'envoi vers Drive (vérifiez l'ID client et les origines autorisées) — ${derniereErreurGDrive() ?? 'cause inconnue'}`,
        );
      }
    } finally {
      setEnCours(false);
    }
  };

  const pousserMaintenant = async () => {
    setEnCours(true);
    // L'autorisation est demandée AVANT tout accès à la base : la fenêtre Google
    // doit s'ouvrir dans l'activation du clic, sinon Safari/iOS la bloque
    // silencieusement (« fenêtre fermée » alors que rien ne s'est ouvert).
    const idClient = config?.clientId || CLIENT_ID_GDRIVE;
    if (estApplicationInstallee()) {
      lancerConnexionParRedirection(idClient);
      return;
    }
    const autorise = await demanderAutorisationGoogle(idClient);
    if (!autorise) {
      setEnCours(false);
      toast(
        'warning',
        "Autorisation Google non obtenue : la fenêtre a été fermée, refusée, ou bloquée par le navigateur. Sur iPad : Réglages > Safari > désactiver « Bloquer les fenêtres surgissantes », puis réessayez.",
      );
      return;
    }
    const resultat = await pousserSauvegardeGDrive(true);
    setEnCours(false);
    if (resultat === 'ok') toast('success', 'Sauvegarde poussée sur Google Drive.');
    else if (resultat === 'base_vide') toast('warning', MSG_BASE_VIDE);
    else if (resultat === 'hors_ligne') toast('warning', 'Hors-ligne : envoi automatique au retour du réseau.');
    else if (resultat === 'permission_requise') toast('warning', 'Reconnectez-vous à Google (fenêtre fermée ?).');
    else toast('error', `Échec de l'envoi vers Google Drive — ${derniereErreurGDrive() ?? 'cause inconnue'}`);
  };

  return (
    <Card>
      <h2 className="mb-2 flex items-center gap-2 font-semibold text-accent-900">
        <HardDriveUpload size={18} /> Sauvegarde Google Drive (iPad et tous navigateurs)
      </h2>
      <p className="mb-3 text-sm text-accent-600">
        Envoie l'archive complète directement sur votre Google Drive (dossier « Bailiz »),
        avec les mêmes déclencheurs que le dossier local : après chaque signature, à chaque
        modification et à l'ouverture. L'application n'accède qu'aux fichiers qu'elle a
        elle-même créés (scope <span className="font-mono text-xs">drive.file</span>). Hors
        connexion, l'envoi repart automatiquement au retour du réseau.
      </p>
      {config?.actif ? (
        <div className="space-y-3">
          <p className="text-sm text-accent-800">
            Connecté — dossier « Bailiz » sur votre Drive. Dernier envoi :{' '}
            {config.dernierPush ? format(new Date(config.dernierPush), 'dd/MM/yyyy à HH:mm') : 'jamais'}
          </p>
          {envoiAncien && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Aucun envoi depuis plus de 24 h. L'autorisation Google expire au bout d'environ une
              heure et ne peut pas être renouvelée sans vous (l'application n'a aucun serveur) —
              c'est systématique sur iPad, où Safari bloque le renouvellement silencieux. Cliquez
              sur « Sauvegarder maintenant » pour ré-autoriser et repartir.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void pousserMaintenant()} disabled={enCours}>
              <HardDriveUpload size={14} /> {enCours ? 'Envoi…' : 'Sauvegarder maintenant'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                void desactiverGDrive().then(() => toast('info', 'Sauvegarde Google Drive désactivée.'))
              }
            >
              Déconnecter
            </Button>
          </div>
          <p className="text-xs text-accent-500">
            Après un certain temps d'inactivité, Google peut redemander une confirmation lors
            du prochain envoi (fenêtre de connexion) : c'est normal.
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
    </Card>
  );
}
