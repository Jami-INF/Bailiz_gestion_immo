import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { recupererJetonRedirection } from './lib/gdrive';
import { signalerMiseAJour } from './lib/majApp';
import './index.css';

/*
 * Mise à jour **proposée**, jamais imposée : `registerType: 'prompt'` côté Vite,
 * et ici on se contente de signaler la disponibilité à l'interface. Une prise de
 * contrôle automatique du service worker peut recharger la page pendant un état
 * des lieux saisi sur place — la saisie est certes sauvegardée en continu, mais
 * pas la confiance du locataire qui regarde l'écran.
 */
const majSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    signalerMiseAJour(() => majSW(true));
  },
});

/*
 * Retour de la connexion Google (PWA iOS) : le jeton arrive dans le fragment
 * d'URL, que le HashRouter interpréterait comme une route. On le récupère et on
 * restaure la route d'origine avant même de monter l'application.
 */
recupererJetonRedirection();

// Demande la persistance du stockage pour éviter toute éviction des données.
if (navigator.storage?.persist) {
  void navigator.storage.persist();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
