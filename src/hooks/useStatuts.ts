import { useEffect, useState } from 'react';

/** Suivi de l'état de connexion réseau. */
export function useEnLigne(): boolean {
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setEnLigne(true);
    const off = () => setEnLigne(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return enLigne;
}

/** Suivi de la persistance du stockage navigateur. */
export function usePersistanceStockage(): boolean | undefined {
  const [persiste, setPersiste] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    if (!navigator.storage?.persisted) return;
    void navigator.storage.persisted().then(setPersiste);
  }, []);
  return persiste;
}

export interface QuotaStockage {
  /** Octets occupés par l'origine (toutes bases et caches confondus). */
  utilise: number;
  /** Quota accordé par le navigateur. */
  quota: number;
  /** Taux d'occupation, arrondi au point de pourcentage. */
  pct: number;
  /** Au-delà, le navigateur peut refuser d'écrire : il faut prévenir avant. */
  critique: boolean;
}

/** Au-dessus de ce taux d'occupation, on alerte. */
export const SEUIL_QUOTA_CRITIQUE_PCT = 80;

/**
 * Occupation du stockage navigateur.
 *
 * Les photos d'états des lieux pèsent lourd et s'accumulent sans qu'on les
 * voie : sans cette mesure, on découvre le quota le jour où une écriture
 * échoue — c'est-à-dire en plein état des lieux.
 *
 * `undefined` si l'API n'est pas disponible (Safari ancien) ou si le
 * navigateur ne rend pas de chiffre exploitable : mieux vaut ne rien afficher
 * qu'un pourcentage inventé.
 */
export function useQuotaStockage(): QuotaStockage | undefined {
  const [quota, setQuota] = useState<QuotaStockage | undefined>(undefined);
  useEffect(() => {
    if (!navigator.storage?.estimate) return;
    let annule = false;
    void navigator.storage
      .estimate()
      .then((e) => {
        if (annule) return;
        const utilise = e.usage ?? 0;
        const total = e.quota ?? 0;
        if (total <= 0) return;
        const pct = Math.round((utilise / total) * 100);
        setQuota({ utilise, quota: total, pct, critique: pct >= SEUIL_QUOTA_CRITIQUE_PCT });
      })
      .catch(() => {
        // Estimation indisponible : on n'affiche simplement rien.
      });
    return () => {
      annule = true;
    };
  }, []);
  return quota;
}
