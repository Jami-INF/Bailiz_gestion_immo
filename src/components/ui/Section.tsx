import type { ReactNode } from 'react';
import { Card } from './Layout';

/** Bloc titré d'un formulaire long (carte + titre + description facultative). */
export function Section({
  titre,
  description,
  children,
}: {
  titre: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-accent-900">{titre}</h2>
        {description && <p className="mt-0.5 text-sm text-accent-500">{description}</p>}
      </div>
      {children}
    </Card>
  );
}
