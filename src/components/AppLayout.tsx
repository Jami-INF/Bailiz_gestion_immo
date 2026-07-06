import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Building2,
  Users,
  FileText,
  ClipboardList,
  FolderOpen,
  Settings,
  LayoutDashboard,
  WifiOff,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { useEnLigne, usePersistanceStockage } from '@/hooks/useStatuts';
import { db, getParametres } from '@/lib/db';
import { Button, Modal } from '@/components/ui';

const nav = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/biens', label: 'Biens', icon: Building2 },
  { to: '/locataires', label: 'Locataires', icon: Users },
  { to: '/baux', label: 'Baux', icon: FileText },
  { to: '/edl', label: 'États des lieux', icon: ClipboardList },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/parametres', label: 'Paramètres', icon: Settings },
];

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
  // Crée la ligne de paramètres au premier lancement (déclenche le disclaimer).
  useEffect(() => {
    void getParametres();
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
                <span className="hidden xs:block sm:block">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="hidden grow sm:block" />
          <div className="hidden flex-col gap-2 border-t border-accent-200 px-5 py-4 text-xs text-accent-500 sm:flex">
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
        </div>
      </main>
      <DisclaimerPremiereUtilisation />
    </div>
  );
}
