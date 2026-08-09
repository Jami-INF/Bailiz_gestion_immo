import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from './Layout';

/**
 * Carte dépliable, pour les réglages longs.
 *
 * La page Paramètres mesurait 46 000 pixels — près de soixante écrans, 309
 * champs de saisie — dont 74 % pour deux cartes seulement. On ne lit pas une
 * page pareille : on la subit.
 *
 * Deux partis pris :
 * - **Le résumé compte autant que le contenu.** Une carte fermée n'est utile
 *   que si elle dit son état : « 25 clauses, 18 proposées ». Sans lui, replier
 *   ne fait que cacher, et l'on rouvre tout pour retrouver ce qu'on cherchait.
 * - **Le contenu fermé n'est pas monté.** Avec des centaines de champs, ce
 *   n'est pas une optimisation de confort : c'est ce qui rend la page fluide
 *   sur iPad. Contrepartie assumée : la recherche du navigateur ne trouve pas
 *   le texte d'une carte fermée.
 */
export function CarteRepliable({
  titre,
  icone,
  resume,
  resumeAlerte,
  identifiant,
  defautOuvert = false,
  children,
}: {
  titre: string;
  icone?: ReactNode;
  /** État essentiel, lisible carte fermée. */
  resume?: ReactNode;
  /** Colore le résumé en ambre : un réglage manque ou demande attention. */
  resumeAlerte?: boolean;
  /** Clé de mémorisation du pli. Sans elle, le choix n'est pas conservé. */
  identifiant: string;
  defautOuvert?: boolean;
  children: ReactNode;
}) {
  const cle = `bailiz.replie.${identifiant}`;
  const [ouvert, setOuvert] = useState<boolean>(() => {
    try {
      const enregistre = localStorage.getItem(cle);
      return enregistre === null ? defautOuvert : enregistre === '1';
    } catch {
      return defautOuvert;
    }
  });
  const idContenu = useId();

  useEffect(() => {
    try {
      localStorage.setItem(cle, ouvert ? '1' : '0');
    } catch {
      // Stockage indisponible : le pli redeviendra celui par défaut. Sans gravité.
    }
  }, [cle, ouvert]);

  return (
    <Card className={ouvert ? '' : 'py-3'}>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        aria-controls={idContenu}
        className="flex min-h-touch w-full items-center gap-3 text-left"
      >
        <ChevronDown
          size={18}
          aria-hidden
          className={`shrink-0 text-accent-500 transition-transform ${ouvert ? '' : '-rotate-90'}`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 font-semibold text-accent-900">
            {icone}
            {titre}
          </span>
          {!ouvert && resume && (
            <span
              className={`mt-0.5 block truncate text-sm ${
                resumeAlerte ? 'text-amber-700' : 'text-accent-500'
              }`}
            >
              {resume}
            </span>
          )}
        </span>
      </button>
      {ouvert && (
        <div id={idContenu} className="mt-4">
          {children}
        </div>
      )}
    </Card>
  );
}
