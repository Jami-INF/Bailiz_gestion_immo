import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useMemo,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
} from 'react';

/*
 * `border-accent-400` et non 300 : la limite d'un champ est un composant
 * d'interface, à 3:1 minimum (WCAG 1.4.11). Le libellé de remplacement passe en
 * `accent-500`, qui atteint AA — un texte d'aide illisible n'aide personne.
 * L'anneau de focus est doublé et prend la couleur de marque : sur un
 * formulaire de bail long, savoir où l'on est compte plus que la discrétion.
 */
const baseField =
  'w-full rounded-lg border border-accent-400 bg-white px-3 py-2 text-sm text-accent-900 placeholder:text-accent-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/25 disabled:border-accent-300 disabled:bg-accent-100 disabled:text-accent-500 min-h-touch';

/**
 * Lien entre un `Field` et le contrôle qu'il étiquette. Hors d'un `Field`
 * (recherche, filtres…), le contexte est vide et rien ne change.
 */
interface ContexteChamp {
  id: string;
  messageId?: string;
}

const ChampContext = createContext<ContexteChamp | null>(null);

/**
 * Identifiant et description hérités du `Field` englobant, si le contrôle n'en
 * fixe pas lui-même.
 *
 * Volontairement sans état ni compteur : toute tentative de n'attribuer
 * l'identifiant qu'au « premier » contrôle suppose de retenir qui l'a pris, et
 * `StrictMode` rejoue le rendu — l'identifiant était attribué au premier
 * passage puis retiré au second, si bien que le libellé se retrouvait orphelin
 * en production alors que les tests passaient. La règle est donc :
 * **un `Field`, un contrôle.** Deux contrôles à étiqueter valent deux `Field`.
 */
function useLiaisonChamp(idExplicite?: string, describedBy?: string) {
  const contexte = useContext(ChampContext);
  return {
    id: idExplicite ?? contexte?.id,
    'aria-describedby': describedBy ?? contexte?.messageId,
  };
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', id, 'aria-describedby': decrit, ...props }, ref) {
    const liaison = useLiaisonChamp(id, decrit);
    return <input ref={ref} className={`${baseField} ${className}`} {...liaison} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', id, 'aria-describedby': decrit, ...props }, ref) {
    const liaison = useLiaisonChamp(id, decrit);
    return (
      <textarea ref={ref} rows={3} className={`${baseField} ${className}`} {...liaison} {...props} />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', id, 'aria-describedby': decrit, ...props }, ref) {
    const liaison = useLiaisonChamp(id, decrit);
    return <select ref={ref} className={`${baseField} ${className}`} {...liaison} {...props} />;
  },
);

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }
>(function Checkbox({ label, className = '', ...props }, ref) {
  return (
    <label className={`flex min-h-touch cursor-pointer items-center gap-3 text-sm text-accent-800 ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        className="h-5 w-5 shrink-0 rounded border-accent-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        {...props}
      />
      <span>{label}</span>
    </label>
  );
});

export function Field({
  label,
  error,
  required,
  hint,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  /*
   * Le libellé n'était relié à aucun contrôle : un lecteur d'écran annonçait
   * « zone de saisie » sans dire laquelle, et toucher le libellé ne donnait pas
   * le focus — pénible au doigt sur tablette, précisément la cible de l'app.
   * L'identifiant descend par contexte plutôt qu'en clonant les enfants, qui
   * peuvent être n'importe quoi (un `PhotoBien`, une grille de boutons…).
   */
  const contexte = useMemo<ContexteChamp>(
    () => ({ id, messageId: hint || error ? `${id}-aide` : undefined }),
    [id, hint, error],
  );

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-accent-800">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </label>
      <ChampContext.Provider value={contexte}>{children}</ChampContext.Provider>
      {hint && !error && (
        <p id={`${id}-aide`} className="text-xs text-accent-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-aide`} className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
