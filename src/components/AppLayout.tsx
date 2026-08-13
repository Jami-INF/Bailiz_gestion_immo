import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  Users,
  FileText,
  ClipboardList,
  FolderOpen,
  FolderSync,
  Settings,
  LayoutDashboard,
  WifiOff,
  ShieldCheck,
  ShieldAlert,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useEnLigne, useModeAutonome, usePersistanceStockage } from '@/hooks/useStatuts';
import { appliquerMiseAJour, miseAJourDisponible, sAbonnerMiseAJour } from '@/lib/majApp';
import { format, isToday } from 'date-fns';
import { db, getParametres } from '@/lib/db';
import {
  destinationConfiguree,
  getConfigAutosave,
  initAutosaveSurModifications,
  pousserSiActive,
  reinitialiserAvertissements,
  SEUIL_PUSH_OUVERTURE_MS,
} from '@/lib/autosave';
import {
  abonnerEtatSync,
  etatSync,
  INTERVALLE_SYNC_MS,
  lancerCycle,
  oublierSaisiesRemplacees,
  purgerJournalSiInactif,
  saisiesRemplacees,
} from '@/lib/sync';
import {
  CLIENT_ID_GDRIVE,
  demanderAutorisationGoogle,
  estApplicationInstallee,
  lancerConnexionParRedirection,
} from '@/lib/gdrive';
import { LIEN_LINKEDIN, LIEN_REPO } from '@/lib/liens';
import { Button, Logo, Modal, useToast } from '@/components/ui';
import { LimiteErreur } from './LimiteErreur';

const nav = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/biens', label: 'Biens', icon: Building2 },
  { to: '/locataires', label: 'Locataires', icon: Users },
  { to: '/baux', label: 'Baux', icon: FileText },
  { to: '/edl', label: 'États des lieux', icon: ClipboardList },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/parametres', label: 'Paramètres', icon: Settings },
];

/**
 * État de la mise à l'abri des données + bouton « Sauvegarder ».
 *
 * Deux régimes, et il faut afficher le bon : sous synchronisation, la date qui
 * compte est celle du dernier **échange** avec le Drive. `derniereSauvegarde`
 * n'y est plus rafraîchie que par l'instantané hebdomadaire - annoncer une
 * sauvegarde vieille de six jours alors qu'un cycle vient de réussir ferait
 * croire à une panne, et pousserait à exporter à la main pour rien.
 */
function SauvegardeStatut() {
  const toast = useToast();
  const parametres = useLiveQuery(() => db.parametres.get('singleton'));
  const configDossier = useLiveQuery(() => getConfigAutosave());
  const [enCours, setEnCours] = useState(false);
  const config = parametres?.sauvegardeGDrive;
  const destination = Boolean(configDossier) || Boolean(config?.actif);
  const synchronise = Boolean(config?.actif);
  // Découvert par le battement de synchronisation, hors de l'arbre React : d'où
  // l'abonnement plutôt qu'un état local.
  const aReconnecter = useSyncExternalStore(abonnerEtatSync, etatSync).etat === 'reconnexion';

  const quand = synchronise ? config?.derniereSync : parametres?.derniereSauvegarde;
  const date = quand ? new Date(quand) : null;
  const quoi = synchronise ? 'Synchronisé' : 'Dernière sauvegarde';
  const libelle = date
    ? isToday(date)
      ? `${quoi} à ${format(date, "HH'h'mm")}`
      : `${quoi} le ${format(date, "dd/MM 'à' HH'h'mm")}`
    : synchronise
      ? 'Pas encore synchronisé'
      : 'Aucune sauvegarde';

  const sauvegarder = async () => {
    /*
     * Même contrainte que ci-dessus : `pousserSiActive` traverse le dossier
     * local - deux lectures IndexedDB - avant d'arriver au jeton Google. Sur
     * iPad la fenêtre serait alors bloquée. On demande donc l'autorisation ici,
     * dans le geste, avant tout le reste. Sans Drive connecté, il n'y a rien à
     * autoriser et on enchaîne directement.
     */
    if (synchronise) {
      const idClient = config?.clientId || CLIENT_ID_GDRIVE;
      if (estApplicationInstallee()) {
        lancerConnexionParRedirection(idClient);
        return;
      }
      const promesse = demanderAutorisationGoogle(idClient);
      setEnCours(true);
      await promesse;
    } else {
      setEnCours(true);
    }
    const resultat = await pousserSiActive(true);
    setEnCours(false);
    if (resultat === 'ok') toast('success', 'Sauvegarde poussée vers la destination configurée.');
    else if (resultat === 'bloque') toast('warning', "Synchronisation interrompue par une vérification de sécurité (horloge de l'appareil, ou suppressions inhabituelles). Ouvrez les Paramètres pour décider.");
    else if (resultat === 'permission_requise')
      toast('warning', 'Autorisation à renouveler dans les Paramètres (dossier ou Google Drive).');
    else if (resultat === 'hors_ligne')
      toast('warning', 'Hors-ligne : la sauvegarde partira automatiquement au retour du réseau.');
    else toast('error', 'Échec de la sauvegarde.');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={`flex items-center gap-1.5 ${!date || aReconnecter ? 'text-amber-700' : ''}`}
        title={date ? format(date, 'dd/MM/yyyy HH:mm:ss') : undefined}
      >
        <FolderSync
          size={14}
          className={date && !aReconnecter ? 'text-green-600' : 'text-amber-600'}
        />
        {aReconnecter ? 'Synchronisation en attente' : libelle}
      </span>
      {/* L'action de reconnexion vit dans `BandeauReconnexion` : ce bloc-ci est
          masqué sur mobile et en barre repliée, c'est-à-dire précisément là où
          le problème se pose. */}
      {!aReconnecter && destination && (
        <Button variant="secondary" size="sm" onClick={() => void sauvegarder()} disabled={enCours}>
          <FolderSync size={14} /> {enCours ? 'Sauvegarde…' : 'Sauvegarder'}
        </Button>
      )}
    </div>
  );
}

/**
 * Bandeau d'état de la synchronisation, en tête du contenu.
 *
 * **Tout ce qui empêche les deux appareils de converger doit se voir.** Le
 * battement lance un cycle toutes les cinq minutes sans que personne ne le
 * regarde : sans ce bandeau, une horloge décalée, un garde-fou déclenché ou une
 * autorisation expirée arrêtaient la synchronisation pour des jours, en
 * silence. Sur un outil dont tout l'intérêt est que l'ordinateur imprime ce que
 * l'iPad vient de saisir, c'est la pire défaillance : invisible et durable.
 *
 * Il est ici et pas dans la barre latérale parce que celle-ci est **masquée sur
 * mobile et en mode replié** - c'est-à-dire sur l'iPad, l'appareil le plus
 * exposé. Un avertissement invisible là où il est nécessaire ne vaut pas mieux
 * que pas d'avertissement.
 */
function BandeauSync() {
  const toast = useToast();
  const parametres = useLiveQuery(() => db.parametres.get('singleton'));
  const [enCours, setEnCours] = useState(false);
  const etat = useSyncExternalStore(abonnerEtatSync, etatSync);
  const perdues = useSyncExternalStore(abonnerEtatSync, saisiesRemplacees);

  /*
   * « En cours » n'est affiché qu'au-delà d'une seconde. Un cycle qui n'a rien à
   * échanger dure une fraction de seconde : le montrer ferait clignoter un
   * bandeau toutes les cinq minutes pour rien. Passé ce délai, en revanche, des
   * données sont réellement en train d'arriver - et c'est précisément le moment
   * où il ne faut pas imprimer.
   */
  const [attenteVisible, setAttenteVisible] = useState(false);
  useEffect(() => {
    if (etat.etat !== 'en_cours') {
      setAttenteVisible(false);
      return;
    }
    const t = setTimeout(() => setAttenteVisible(true), 1000);
    return () => clearTimeout(t);
  }, [etat.etat]);

  /*
   * L'ordre n'est pas négociable : `demanderAutorisationGoogle` doit être la
   * première instruction du gestionnaire de clic. Safari/iOS n'autorise la
   * fenêtre Google que tant que dure l'activation du geste, et le moindre accès
   * à IndexedDB avant elle suffit à la faire expirer - la fenêtre est alors
   * bloquée sans erreur, ce qui donne un bouton qui « ne fait rien ».
   */
  const reconnecter = async () => {
    const idClient = parametres?.sauvegardeGDrive?.clientId || CLIENT_ID_GDRIVE;
    if (estApplicationInstallee()) {
      lancerConnexionParRedirection(idClient);
      return;
    }
    const promesse = demanderAutorisationGoogle(idClient);
    setEnCours(true);
    try {
      if (!(await promesse)) {
        toast(
          'warning',
          "Autorisation Google non obtenue : fenêtre fermée, refusée, ou bloquée par le navigateur. Sur iPad : Réglages > Safari > désactiver « Bloquer les fenêtres surgissantes ».",
        );
        return;
      }
      reinitialiserAvertissements();
      const resultat = await lancerCycle(true);
      if (resultat.etat === 'ok') toast('success', 'Google Drive reconnecté - données synchronisées.');
      else if (resultat.etat !== 'bloque') toast('warning', "Reconnecté, mais l'échange n'a pas abouti : réessayez.");
    } finally {
      setEnCours(false);
    }
  };

  const reessayer = async () => {
    setEnCours(true);
    try {
      const resultat = await lancerCycle(true);
      if (resultat.etat === 'ok') toast('success', 'Synchronisation rétablie.');
    } finally {
      setEnCours(false);
    }
  };

  /*
   * Une saisie écrasée n'est pas une panne - la synchronisation a fonctionné et
   * tranché en faveur de la version la plus récente. Mais c'est le seul endroit
   * où du travail disparaît sans que personne ne l'ait demandé : il faut le
   * nommer, et laisser l'utilisateur en prendre acte.
   */
  if (etat.etat === 'ok' || etat.etat === 'en_cours') {
    if (perdues.length > 0) {
      const nommer = (s: (typeof perdues)[number]) => s.reference ?? `${s.table} ${s.cle.slice(0, 8)}`;
      return (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-600 px-4 py-1.5 text-xs font-medium text-white">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} />
            {perdues.length === 1
              ? `Votre modification de ${nommer(perdues[0])} a été remplacée par une version plus récente de l'autre appareil`
              : `${perdues.length} de vos modifications ont été remplacées par des versions plus récentes : ${perdues.map(nommer).join(', ')}`}
          </span>
          <button
            type="button"
            onClick={oublierSaisiesRemplacees}
            className="min-h-touch rounded-md bg-white px-3 py-1 font-semibold text-warning-900 hover:bg-warning-50"
          >
            J&apos;ai compris
          </button>
        </div>
      );
    }
    if (etat.etat === 'ok') return null;
  }


  if (etat.etat === 'en_cours') {
    if (!attenteVisible) return null;
    return (
      <div className="flex items-center justify-center gap-2 bg-accent-100 px-4 py-1.5 text-xs font-medium text-accent-700">
        <RefreshCw size={14} className="animate-spin" />
        Synchronisation en cours - attendez la fin avant d&apos;imprimer un document.
      </div>
    );
  }

  const message =
    etat.etat === 'reconnexion'
      ? "Synchronisation en attente - l'autorisation Google a expiré"
      : etat.etat === 'bloque'
        ? etat.raison === 'horloge'
          ? "Synchronisation interrompue - l'horloge de cet appareil est trop décalée"
          : 'Synchronisation interrompue - des suppressions inhabituelles ont été reçues'
        : 'Synchronisation en échec - vos données restent enregistrées sur cet appareil';

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-600 px-4 py-1.5 text-xs font-medium text-white">
      <span className="flex items-center gap-2">
        <AlertTriangle size={14} /> {message}
        {etat.etat === 'bloque' && etat.details ? ` (${etat.details})` : ''}
      </span>
      {etat.etat === 'reconnexion' ? (
        <button
          type="button"
          onClick={() => void reconnecter()}
          disabled={enCours}
          className="min-h-touch rounded-md bg-white px-3 py-1 font-semibold text-warning-900 hover:bg-warning-50 disabled:opacity-60"
        >
          {enCours ? 'Reconnexion…' : 'Reconnecter'}
        </button>
      ) : etat.etat === 'bloque' ? (
        /* La résolution demande un choix éclairé (confirmer des suppressions,
           corriger l'heure) : elle a sa place dans les Paramètres, pas dans un
           bandeau. */
        <Link
          to="/parametres"
          className="min-h-touch rounded-md bg-white px-3 py-1 font-semibold text-warning-900 hover:bg-warning-50"
        >
          Voir le détail
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void reessayer()}
          disabled={enCours}
          className="min-h-touch rounded-md bg-white px-3 py-1 font-semibold text-warning-900 hover:bg-warning-50 disabled:opacity-60"
        >
          {enCours ? 'Nouvel essai…' : 'Réessayer'}
        </button>
      )}
    </div>
  );
}

export const DISCLAIMER_JURIDIQUE =
  "Cet outil est une aide à la rédaction. Il ne constitue pas un conseil juridique. Vérifiez les évolutions légales sur service-public.fr. Pour la signature du bail, un prestataire de signature électronique qualifié eIDAS est recommandé.";

function DisclaimerPremiereUtilisation() {
  const params = useLiveQuery(() => db.parametres.get('singleton'));
  if (params === undefined || params?.disclaimerAccepte) return null;
  return (
    <Modal
      open
      onClose={() => {}}
      title="Avertissement"
      footer={
        <Button
          onClick={() =>
            getParametres().then((p) => db.parametres.put({ ...p, disclaimerAccepte: true }))
          }
        >
          J'ai compris
        </Button>
      }
    >
      <p className="text-sm text-accent-700">{DISCLAIMER_JURIDIQUE}</p>
    </Modal>
  );
}

/**
 * Nouvelle version prête à installer. Elle n'est **jamais** appliquée d'office :
 * le service worker attend ce clic. Le bandeau reste masqué en mode terrain, où
 * il couvrirait la saisie et proposerait un rechargement au pire moment.
 */
export function BandeauMiseAJour({ masque }: { masque: boolean }) {
  const disponible = useSyncExternalStore(sAbonnerMiseAJour, miseAJourDisponible, () => false);
  const [enCours, setEnCours] = useState(false);
  if (!disponible || masque) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-accent-800 px-4 py-2 text-xs font-medium text-white">
      <span className="flex items-center gap-2">
        <RefreshCw size={14} /> Une nouvelle version de Bailiz est disponible.
      </span>
      <button
        type="button"
        disabled={enCours}
        onClick={() => {
          setEnCours(true);
          void appliquerMiseAJour();
        }}
        className="rounded-lg bg-white px-3 py-1 font-semibold text-accent-900 disabled:opacity-60"
      >
        {enCours ? 'Installation…' : 'Installer et recharger'}
      </button>
    </div>
  );
}

export function AppLayout() {
  const enLigne = useEnLigne();
  const persiste = usePersistanceStockage();
  const toast = useToast();
  // Crée la ligne de paramètres au premier lancement (déclenche le disclaimer).
  useEffect(() => {
    void getParametres();
  }, []);

  // Push automatique regroupé à chaque modification d'entité (30 s après la
  // dernière écriture), avec message de confirmation.
  useEffect(() => {
    initAutosaveSurModifications(toast);
  }, [toast]);

  /*
   * Synchronisation entre appareils : à l'ouverture, à chaque retour au premier
   * plan, puis toutes les cinq minutes tant que l'application est visible.
   *
   * Ce battement est ce qui rend le travail à deux appareils praticable. Tous
   * les autres déclencheurs supposent une **écriture locale** : sans lui, l'iPad
   * qui ne fait que consulter n'apprendrait jamais ce qui a été saisi sur le
   * poste fixe. Il ne doit surtout pas être adossé à l'ancienneté de la
   * sauvegarde ZIP : l'instantané hebdomadaire la rafraîchit lui-même, et le
   * cycle d'ouverture ne se déclenchait alors plus qu'une fois par semaine.
   *
   * Cycle silencieux et non interactif : sans autorisation Google valide - le
   * cas courant sur Safari/iPad - il est simplement reporté, sans message.
   */
  useEffect(() => {
    void purgerJournalSiInactif();
    let minuteur: ReturnType<typeof setInterval> | undefined;
    const armer = () => {
      clearInterval(minuteur);
      if (document.visibilityState !== 'visible') return;
      void lancerCycle(false);
      minuteur = setInterval(() => void lancerCycle(false), INTERVALLE_SYNC_MS);
    };
    armer();
    document.addEventListener('visibilitychange', armer);
    return () => {
      clearInterval(minuteur);
      document.removeEventListener('visibilitychange', armer);
    };
  }, []);

  /*
   * Archive ZIP dans le **dossier local** à l'ouverture, si la dernière date de
   * plus de sept jours. Le Drive n'est plus concerné : il reçoit un cycle de
   * synchronisation (ci-dessus) et son propre instantané.
   */
  useEffect(() => {
    void (async () => {
      if (!(await destinationConfiguree())) return;
      const params = await getParametres();
      const anciennete = params.derniereSauvegarde
        ? Date.now() - new Date(params.derniereSauvegarde).getTime()
        : Infinity;
      if (anciennete < SEUIL_PUSH_OUVERTURE_MS) return;
      await pousserSiActive(false); // sans geste utilisateur : n'insiste pas si permission à renouveler
    })();
  }, []);

  const location = useLocation();

  /**
   * Navigation latérale repliée (icônes seules) : choix mémorisé, et replié par
   * défaut sur les largeurs de type tablette, où la place gagnée compte.
   */
  const [navRepliee, setNavRepliee] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const enr = window.localStorage.getItem('bailiz.navRepliee');
    if (enr !== null) return enr === '1';
    return window.innerWidth < 1280;
  });
  useEffect(() => {
    window.localStorage.setItem('bailiz.navRepliee', navRepliee ? '1' : '0');
  }, [navRepliee]);

  /*
   * Installée, l'application ne propose plus de retour vers la vitrine : le
   * lien sortirait du `scope` et ouvrirait le navigateur du système. Le bloc de
   * marque devient alors une simple `<div>`, de dimensions identiques.
   */
  const autonome = useModeAutonome();
  const ElementMarque = autonome ? 'div' : 'a';

  // Mode terrain EDL : plein écran sans navigation latérale
  const pleinEcran = /^\/edl\/[^/]+/.test(location.pathname);
  // Formulaire de bail (avec aperçu du document) : conteneur élargi
  const large =
    /^\/baux\/(nouveau|rapide)$/.test(location.pathname) ||
    /^\/baux\/[^/]+\/modifier$/.test(location.pathname);

  return (
    <div className="flex min-h-screen">
      {!pleinEcran && (
        <aside
          className={`fixed inset-x-0 bottom-0 z-40 border-t border-accent-200 bg-white sm:static sm:inset-auto sm:flex sm:shrink-0 sm:flex-col sm:border-r sm:border-t-0 ${
            navRepliee ? 'sm:w-16' : 'sm:w-60'
          }`}
        >
          {/*
            Bloc de marque calé sur l'en-tête de la vitrine : même glyphe, même
            graisse, même interlettrage. Cliquable, il ramène à bailiz.fr -
            l'application était jusqu'ici une porte à sens unique.

            Sauf en fenêtre autonome : cf. `useModeAutonome`. On rend alors le
            même bloc, sans lien, pour que la barre ne change pas de hauteur
            selon le mode d'affichage.
          */}
          <div
            className={`hidden py-5 sm:block ${navRepliee ? 'px-0' : 'px-5'}`}
          >
            <ElementMarque
              className={`flex items-center gap-2.5 rounded-lg ${
                navRepliee ? 'justify-center' : ''
              } ${autonome ? '' : 'hover:opacity-80'}`}
              {...(autonome
                ? {}
                : { href: '/', title: 'Retour à la présentation de Bailiz - bailiz.fr' })}
            >
              <Logo taille={36} />
              {!navRepliee && (
                <div>
                  <div className="text-xl font-extrabold tracking-tight text-accent-900">
                    Bailiz
                  </div>
                  <div className="text-xs text-accent-500">Baux et états des lieux</div>
                </div>
              )}
            </ElementMarque>
          </div>
          <nav className={`flex justify-around sm:flex-col sm:gap-1 ${navRepliee ? 'sm:px-2' : 'sm:px-3'}`}>
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                title={navRepliee ? label : undefined}
                className={({ isActive }) =>
                  `flex min-h-touch flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium sm:flex-row sm:gap-3 sm:text-sm ${
                    navRepliee ? 'px-2 sm:justify-center sm:px-0' : 'px-2 sm:px-3'
                  } ${
                    // L'élément actif porte la couleur de marque : c'est le
                    // seul repère de position sur une barre réduite à des
                    // icônes, et un gris de plus n'y suffisait pas.
                    isActive
                      ? 'text-brand-700 sm:bg-brand-50'
                      : 'text-accent-500 hover:text-accent-800 sm:hover:bg-accent-50'
                  }`
                }
              >
                <Icon size={20} className="shrink-0" />
                <span className={`max-[380px]:hidden ${navRepliee ? 'sm:hidden' : 'sm:block'}`}>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="hidden grow sm:block" />
          <div className="hidden border-t border-accent-200 sm:block">
            <button
              type="button"
              onClick={() => setNavRepliee((v) => !v)}
              title={navRepliee ? 'Déplier le menu' : 'Replier le menu'}
              aria-label={navRepliee ? 'Déplier le menu' : 'Replier le menu'}
              className={`flex min-h-touch w-full items-center gap-3 py-3 text-sm font-medium text-accent-500 hover:bg-accent-50 hover:text-accent-800 ${
                navRepliee ? 'justify-center px-0' : 'px-5'
              }`}
            >
              {navRepliee ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              {!navRepliee && <span>Replier le menu</span>}
            </button>
          </div>
          <div
            className={`hidden flex-col gap-2 border-t border-accent-200 px-5 py-4 text-xs text-accent-500 ${
              navRepliee ? 'sm:hidden' : 'sm:flex'
            }`}
          >
            <SauvegardeStatut />
            <span className="flex items-center gap-1.5">
              {persiste ? (
                <>
                  <ShieldCheck size={14} className="text-green-600" /> Stockage persistant
                </>
              ) : (
                <>
                  <ShieldAlert size={14} className="text-amber-600" /> Stockage non garanti
                </>
              )}
            </span>
            {!enLigne && (
              <span className="flex items-center gap-1.5 text-amber-700">
                <WifiOff size={14} /> Mode hors-ligne
              </span>
            )}
          </div>
        </aside>
      )}
      <main className={`min-w-0 flex-1 ${pleinEcran ? '' : 'pb-24 sm:pb-0'}`}>
        <BandeauMiseAJour masque={pleinEcran} />
        {!enLigne && (
          <div className="flex items-center justify-center gap-2 bg-amber-600 px-4 py-1.5 text-xs font-medium text-white">
            <WifiOff size={14} /> Hors-ligne - vos données restent enregistrées sur cet appareil
          </div>
        )}
        {/* Hors-ligne d'abord : sans réseau, reconnecter n'aurait aucun sens. */}
        {enLigne && <BandeauSync />}
        <div className={pleinEcran ? '' : `mx-auto ${large ? 'max-w-7xl' : 'max-w-5xl'} px-4 py-6 sm:px-8`}>
          {/* La clé remet la limite à zéro à chaque changement de page : sans
              elle, une erreur figerait l'écran même après navigation. */}
          <LimiteErreur key={location.pathname}>
            <Outlet />
          </LimiteErreur>
          {!pleinEcran && (
            <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-accent-200 pt-4 text-xs text-accent-500">
              {!autonome && (
                <>
                  <a href="/" className="hover:text-accent-800 hover:underline">
                    bailiz.fr
                  </a>
                  <span aria-hidden>·</span>
                </>
              )}
              <Link to="/mentions-legales" className="hover:text-accent-800 hover:underline">
                Mentions légales & confidentialité
              </Link>
              <span aria-hidden>·</span>
              <a
                href={LIEN_LINKEDIN}
                target="_blank"
                rel="noreferrer"
                className="hover:text-accent-800 hover:underline"
              >
                Créé par Jami Infante
              </a>
              <span aria-hidden>·</span>
              <a
                href={LIEN_REPO}
                target="_blank"
                rel="noreferrer"
                className="hover:text-accent-800 hover:underline"
              >
                Code source (GitHub)
              </a>
            </footer>
          )}
        </div>
      </main>
      <DisclaimerPremiereUtilisation />
    </div>
  );
}
