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
