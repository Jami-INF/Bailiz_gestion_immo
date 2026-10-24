import { useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Button, Input, Modal, SEUIL_BARRE_LISTE } from '@/components/ui';

export interface OptionEntite {
  id: string;
  titre: string;
  /** Deuxième ligne : ce qui distingue deux fiches de même nom. */
  detail?: string;
}

/**
 * Choix de la fiche à partir de laquelle produire un document.
 *
 * Les générateurs de Bailiz étaient tous subordonnés à une fiche : l'acte de
 * cautionnement ne s'atteignait que depuis un bail, la fiche de visite que
 * depuis un bien. C'est cohérent quand on gère un parc ici ; ça ne l'est pas
 * pour quelqu'un dont le bail a été signé en agence et qui vient chercher un
 * seul document. Ce sélecteur est le chaînon manquant : il **propose** les
 * fiches existantes sans jamais les exiger.
 *
 * D'où `horsFiche`, qui n'est pas une commodité mais la raison d'être de
 * l'écran : produire le document sans aucune fiche, avec les zones laissées à
 * compléter à la main. Un modèle vierge imprimé reste un document valable - ce
 * qui engage, c'est la signature, pas la saisie préalable.
 */
export function SelecteurEntite({
  open,
  onClose,
  titre,
  description,
  options,
  onChoisir,
  horsFiche,
  vide,
}: {
  open: boolean;
  onClose: () => void;
  titre: string;
  description?: string;
  options: OptionEntite[];
  onChoisir: (id: string) => void;
  /** Chemin sans fiche (« modèle vierge »), proposé avant la liste. */
  horsFiche?: { libelle: string; detail: string; onChoisir: () => void };
  /** Affiché à la place de la liste quand aucune fiche ne convient. */
  vide?: ReactNode;
}) {
  const [filtre, setFiltre] = useState('');
  const terme = filtre.trim().toLowerCase();
  const visibles = terme
    ? options.filter((o) => `${o.titre} ${o.detail ?? ''}`.toLowerCase().includes(terme))
    : options;

  const fermer = () => {
    setFiltre('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={fermer}
      title={titre}
      footer={
        <Button variant="secondary" onClick={fermer}>
          Annuler
        </Button>
      }
    >
      <div className="space-y-3">
        {description && <p className="text-sm text-accent-600">{description}</p>}

        {horsFiche && (
          <button
            type="button"
            onClick={() => {
              horsFiche.onChoisir();
              fermer();
            }}
            className="flex min-h-touch w-full flex-col items-start rounded-lg border border-accent-400 px-3 py-2 text-left hover:bg-accent-50"
          >
            <span className="text-sm font-medium text-accent-900">{horsFiche.libelle}</span>
            <span className="text-xs text-accent-500">{horsFiche.detail}</span>
          </button>
        )}

        {options.length === 0 ? (
          vide
        ) : (
          <>
            {options.length > SEUIL_BARRE_LISTE && (
              <div className="relative">
                <Search
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-accent-400"
                />
                <Input
                  value={filtre}
                  onChange={(e) => setFiltre(e.target.value)}
                  placeholder="Filtrer…"
                  className="pl-9"
                  aria-label="Filtrer la liste"
                />
              </div>
            )}
            <ul className="space-y-2">
              {visibles.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChoisir(o.id);
                      fermer();
                    }}
                    className="flex min-h-touch w-full flex-col items-start rounded-lg border border-accent-200 px-3 py-2 text-left hover:bg-accent-50"
                  >
                    <span className="text-sm font-medium text-accent-900">{o.titre}</span>
                    {o.detail && <span className="text-xs text-accent-500">{o.detail}</span>}
                  </button>
                </li>
              ))}
            </ul>
            {visibles.length === 0 && (
              <p className="text-sm text-accent-500">Aucune fiche ne correspond à « {filtre} ».</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
