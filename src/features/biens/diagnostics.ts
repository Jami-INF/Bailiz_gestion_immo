import { differenceInDays } from 'date-fns';
import type { Diagnostic } from '@/types';

export type ValiditeDiagnostic = 'valide' | 'expire_bientot' | 'expire' | 'illimite';

/** Badge de validité : rouge expiré, orange < 3 mois de l'expiration, vert sinon. */
export function validiteDiagnostic(diag: Diagnostic, aujourdhui = new Date()): ValiditeDiagnostic {
  if (!diag.dateExpiration) return 'illimite';
  const jours = differenceInDays(new Date(diag.dateExpiration), aujourdhui);
  if (jours < 0) return 'expire';
  if (jours <= 92) return 'expire_bientot';
  return 'valide';
}

export const VALIDITE_LABELS: Record<ValiditeDiagnostic, { label: string; tone: 'green' | 'orange' | 'red' | 'neutral' }> = {
  valide: { label: 'Valide', tone: 'green' },
  expire_bientot: { label: 'Expire bientôt', tone: 'orange' },
  expire: { label: 'Expiré', tone: 'red' },
  illimite: { label: 'Illimité', tone: 'neutral' },
};
