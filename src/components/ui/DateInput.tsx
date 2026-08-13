import { useEffect, useId, useState } from 'react';
import { Calendar } from 'lucide-react';
import { masquerSaisieDate, parserDateFr, versDateFr } from '@/lib/dates';
import { useLiaisonChamp } from './champContexte';

/**
 * Champ de date saisissable au clavier (JJ/MM/AAAA, masque automatique)
 * doublé d'un sélecteur calendrier natif accessible via l'icône.
 *
 * `value` et `onChange` travaillent en ISO `yyyy-MM-dd` ('' si vide/invalide).
 *
 * Consomme `ChampContext` comme `Input`, `Select` et `Textarea` : sans cela le
 * `<label>` du `Field` englobant pointait vers un identifiant inexistant, et six
 * libellés de date sur sept - dont la date de prise d'effet du bail, qui fonde
 * tous les calculs de terme - n'étaient annoncés que « zone de saisie ».
 */
export function DateInput({
  value,
  onChange,
  disabled,
  className = '',
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const [texte, setTexte] = useState(() => versDateFr(value));
  const [invalide, setInvalide] = useState(false);
  const idErreur = useId();
  const liaison = useLiaisonChamp();
  /*
   * Le message « Date invalide » s'ajoute à l'aide du `Field` au lieu de la
   * remplacer : il naît d'une saisie fautive alors que l'aide, elle, reste vraie.
   */
  const decritPar =
    [liaison['aria-describedby'], invalide ? idErreur : null].filter(Boolean).join(' ') || undefined;

  // Synchronise l'affichage quand la valeur change de l'extérieur
  // (chargement, sélection au calendrier), sans écraser une frappe en cours.
  useEffect(() => {
    setTexte((t) => (parserDateFr(t) === (value || null) ? t : versDateFr(value)));
    if (value) setInvalide(false);
  }, [value]);

  const saisir = (brut: string) => {
    const t = masquerSaisieDate(brut);
    setTexte(t);
    const iso = parserDateFr(t);
    if (iso) {
      setInvalide(false);
      onChange(iso);
    } else if (t === '') {
      setInvalide(false);
      onChange('');
    }
  };

  return (
    <div className={className}>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          placeholder="JJ/MM/AAAA"
          value={texte}
          disabled={disabled}
          id={liaison.id}
          aria-label={ariaLabel}
          aria-describedby={decritPar}
          aria-invalid={invalide}
          onChange={(e) => saisir(e.target.value)}
          onBlur={() => setInvalide(texte !== '' && parserDateFr(texte) === null)}
          className={`min-h-touch w-full rounded-lg border bg-white py-2 pl-3 pr-11 text-sm text-accent-900 placeholder:text-accent-500 focus:outline-none focus:ring-1 disabled:bg-accent-100 disabled:text-accent-500 ${
            invalide
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : 'border-accent-400 focus:border-accent-700 focus:ring-accent-700'
          }`}
        />
        {/* Sélecteur natif invisible superposé à l'icône : un clic ouvre le calendrier. */}
        <input
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          value={parserDateFr(texte) ?? value ?? ''}
          onChange={(e) => {
            if (e.target.value) {
              setTexte(versDateFr(e.target.value));
              setInvalide(false);
              onChange(e.target.value);
            }
          }}
          className="absolute inset-y-0 right-0 w-11 cursor-pointer opacity-0 disabled:cursor-default"
        />
        <Calendar
          size={18}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-accent-400"
        />
      </div>
      {invalide && (
        <p id={idErreur} className="mt-1 text-xs font-medium text-red-600">
          Date invalide - saisissez JJ/MM/AAAA (ex. 06/07/2026) ou utilisez le calendrier.
        </p>
      )}
    </div>
  );
}
