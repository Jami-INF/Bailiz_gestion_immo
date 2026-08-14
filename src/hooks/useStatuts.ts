import { useEffect, useState, useSyncExternalStore } from 'react';

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
const SEUIL_QUOTA_CRITIQUE_PCT = 80;

/**
 * Occupation du stockage navigateur.
 *
 * Les photos d'états des lieux pèsent lourd et s'accumulent sans qu'on les
 * voie : sans cette mesure, on découvre le quota le jour où une écriture
 * échoue - c'est-à-dire en plein état des lieux.
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

/**
 * Vrai quand l'application tourne en fenêtre autonome, c'est-à-dire installée.
 *
 * Ce que cela change : le lien de retour vers bailiz.fr **disparaît**. Dans une
 * PWA installée, suivre un lien hors du `scope` fait sortir de la fenêtre vers
 * le navigateur du système. Quelqu'un qui a installé l'outil n'a rien à faire
 * de la page de présentation, et lui proposer une sortie qui ouvre un autre
 * navigateur est un piège plutôt qu'un service.
 *
 * `useSyncExternalStore` et non un `useEffect` : le mode d'affichage peut
 * changer sans rechargement (installation depuis l'onglet), et la valeur doit
 * être lue au premier rendu pour éviter que le lien n'apparaisse une fraction
 * de seconde avant de disparaître.
 */
export function useModeAutonome() {
  return useSyncExternalStore(
    (rappel) => {
      const requete = window.matchMedia('(display-mode: standalone)');
      requete.addEventListener('change', rappel);
      return () => requete.removeEventListener('change', rappel);
    },
    () => window.matchMedia('(display-mode: standalone)').matches,
    // Rendu serveur ou test sans `matchMedia` : on suppose l'onglet, cas où le
    // lien de retour a un sens.
    () => false,
  );
}
