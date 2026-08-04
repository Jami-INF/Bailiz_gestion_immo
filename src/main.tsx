import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { recupererJetonRedirection } from './lib/gdrive';
import './index.css';

registerSW({ immediate: true });

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
