import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { useEnLigne, usePersistanceStockage } from '@/hooks/useStatuts';
import { format, isToday } from 'date-fns';
import { db, getParametres } from '@/lib/db';
import {
  destinationConfiguree,
  getConfigAutosave,
  initAutosaveSurModifications,
  pousserSiActive,
  SEUIL_PUSH_OUVERTURE_MS,
} from '@/lib/autosave';
import { LIEN_LINKEDIN, LIEN_REPO } from '@/lib/liens';
import { Button, Modal, useToast } from '@/components/ui';

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
 * « Dernière sauvegarde à XXh » + bouton « Sauvegarder » (si un dossier de
 * sauvegarde automatique est lié). La date affichée est celle du dernier
 * export réussi, manuel ou automatique (parametres.derniereSauvegarde).
 */
function SauvegardeStatut() {
  const toast = useToast();
  const parametres = useLiveQuery(() => db.parametres.get('singleton'));
  const configDossier = useLiveQuery(() => getConfigAutosave());
  const [enCours, setEnCours] = useState(false);
  const destination = Boolean(configDossier) || Boolean(parametres?.sauvegardeGDrive?.actif);

  const date = parametres?.derniereSauvegarde ? new Date(parametres.derniereSauvegarde) : null;
  const libelle = date
    ? isToday(date)
      ? `Dernière sauvegarde à ${format(date, "HH'h'mm")}`
      : `Dernière sauvegarde le ${format(date, "dd/MM 'à' HH'h'mm")}`
    : 'Aucune sauvegarde';

  const sauvegarder = async () => {
    setEnCours(true);
    const resultat = await pousserSiActive(true);
    setEnCours(false);
    if (resultat === 'ok') toast('success', 'Sauvegarde poussée vers la destination configurée.');
    else if (resultat === 'permission_requise')
      toast('warning', 'Autorisation à renouveler dans les Paramètres (dossier ou Google Drive).');
    else if (resultat === 'hors_ligne')
      toast('warning', 'Hors-ligne : la sauvegarde partira automatiquement au retour du réseau.');
    else toast('error', 'Échec de la sauvegarde.');
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={`flex items-center gap-1.5 ${!date ? 'text-amber-700' : ''}`}
        title={date ? format(date, 'dd/MM/yyyy HH:mm:ss') : undefined}
      >
        <FolderSync size={14} className={date ? 'text-green-600' : 'text-amber-600'} />
        {libelle}
      </span>
      {destination && (
        <Button variant="secondary" size="sm" onClick={() => void sauvegarder()} disabled={enCours}>
          <FolderSync size={14} /> {enCours ? 'Sauvegarde…' : 'Sauvegarder'}
        </Button>
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

  // Push ZIP silencieux à l'ouverture si une destination (dossier ou Google
  // Drive) est configurée et que la dernière sauvegarde date de + de 7 jours.
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
  // Mode terrain EDL : plein écran sans navigation latérale
  const pleinEcran = /^\/edl\/[^/]+/.test(location.pathname);

  return (
    <div className="flex min-h-screen">
      {!pleinEcran && (
        <aside className="fixed inset-x-0 bottom-0 z-40 border-t border-accent-200 bg-white sm:static sm:inset-auto sm:flex sm:w-60 sm:shrink-0 sm:flex-col sm:border-r sm:border-t-0">
          <div className="hidden items-center gap-2 px-5 py-5 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-700 text-white">
              <Building2 size={18} />
            </div>
            <div>
              <div className="text-base font-bold text-accent-900">Bailiz</div>
              <div className="text-xs text-accent-500">Gestion locative LMNP</div>
            </div>
          </div>
          <nav className="flex justify-around sm:flex-col sm:gap-1 sm:px-3">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex min-h-touch flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-medium sm:flex-row sm:gap-3 sm:px-3 sm:text-sm ${
                    isActive
                      ? 'text-accent-900 sm:bg-accent-100'
                      : 'text-accent-500 hover:text-accent-800 sm:hover:bg-accent-50'
                  }`
                }
              >
                <Icon size={20} className="shrink-0" />
                <span className="max-[380px]:hidden sm:block">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="hidden grow sm:block" />
          <div className="hidden flex-col gap-2 border-t border-accent-200 px-5 py-4 text-xs text-accent-500 sm:flex">
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
        {!enLigne && (
          <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-xs font-medium text-white">
            <WifiOff size={14} /> Hors-ligne — vos données restent enregistrées sur cet appareil
          </div>
        )}
        <div className={pleinEcran ? '' : 'mx-auto max-w-5xl px-4 py-6 sm:px-8'}>
          <Outlet />
          {!pleinEcran && (
            <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-accent-200 pt-4 text-xs text-accent-500">
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
