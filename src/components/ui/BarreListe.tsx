import { useId } from 'react';
import { Search, X } from 'lucide-react';
import { Input, Select } from './Input';

export interface OptionTri<T extends string> {
  valeur: T;
  label: string;
}

/**
 * En dessous de ce nombre d'éléments, la barre ne s'affiche pas : chercher
 * parmi quatre biens coûte plus cher en écran occupé qu'en temps gagné. Elle
 * apparaît quand la liste commence réellement à défiler.
 */
export const SEUIL_BARRE_LISTE = 6;

interface Props<T extends string> {
  recherche: string;
  onRecherche: (v: string) => void;
  tri: T;
  onTri: (v: T) => void;
  optionsTri: OptionTri<T>[];
  placeholder: string;
  /** Nombre d'éléments affichés / nombre total, pour le compte-rendu de filtrage. */
  affiches: number;
  total: number;
  /** Nom de l'entité au singulier (« bien », « locataire », « bail »). */
  nom: string;
  nomPluriel: string;
}

/**
 * Barre de recherche et de tri des listes (biens, locataires, baux). Un seul
 * composant pour les trois : même place, même comportement, une seule chose à
 * apprendre.
 */
export function BarreListe<T extends string>({
  recherche,
  onRecherche,
  tri,
  onTri,
  optionsTri,
  placeholder,
  affiches,
  total,
  nom,
  nomPluriel,
}: Props<T>) {
  const idRecherche = useId();
  const idTri = useId();
  const filtre = recherche.trim().length > 0;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent-400"
            aria-hidden
          />
          <Input
            id={idRecherche}
            type="search"
            value={recherche}
            onChange={(e) => onRecherche(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="pl-9 pr-9"
          />
          {filtre && (
            <button
              type="button"
              onClick={() => onRecherche('')}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-accent-400 hover:bg-accent-100 hover:text-accent-700"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={idTri} className="shrink-0 text-sm text-accent-500">
            Trier par
          </label>
          <Select
            id={idTri}
            value={tri}
            onChange={(e) => onTri(e.target.value as T)}
            className="sm:w-56"
          >
            {optionsTri.map((o) => (
              <option key={o.valeur} value={o.valeur}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {filtre && (
        <p className="text-sm text-accent-500" role="status">
          {affiches === 0
            ? `Aucun ${nom} ne correspond à « ${recherche.trim()} ».`
            : `${affiches} ${affiches > 1 ? nomPluriel : nom} sur ${total}.`}
        </p>
      )}
    </div>
  );
}
