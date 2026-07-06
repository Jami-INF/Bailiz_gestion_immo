import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-accent-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  titre,
  sousTitre,
  actions,
}: {
  titre: string;
  sousTitre?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-accent-900">{titre}</h1>
        {sousTitre && <p className="mt-1 text-sm text-accent-600">{sousTitre}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  titre,
  message,
  action,
}: {
  icon: LucideIcon;
  titre: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-accent-300 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-100">
        <Icon size={26} className="text-accent-500" />
      </div>
      <h3 className="text-lg font-semibold text-accent-900">{titre}</h3>
      <p className="mt-1 max-w-sm text-sm text-accent-600">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
