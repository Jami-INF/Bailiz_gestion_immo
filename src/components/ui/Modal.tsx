import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

/*
 * Tout ce qui peut recevoir le focus au Tab. Le filtre sur `tabIndex >= 0`
 * écarte notamment le sélecteur de calendrier caché de `DateInput`, qui est un
 * `<input>` non désactivé mais délibérément hors du parcours clavier.
 */
const FOCUSABLES =
  'a[href], button, input, select, textarea, [tabindex]';

function focusablesDe(racine: HTMLElement) {
  return [...racine.querySelectorAll<HTMLElement>(FOCUSABLES)].filter(
    (el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'),
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
  fermable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /**
   * `false` retire la croix et désarme Échap. Réservé aux modales dont la
   * fermeture n'est pas au choix de l'utilisateur (avertissement à
   * l'installation) : y laisser une croix inerte, c'est afficher une commande
   * qui ne fait rien.
   */
  fermable?: boolean;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  /*
   * `onClose` change souvent d'identité d'un rendu à l'autre (fonction fléchée
   * chez l'appelant). Passer par une référence évite de rejouer l'effet à chaque
   * frappe, ce qui ramènerait le focus sur le conteneur en pleine saisie.
   */
  const fermer = useRef(onClose);
  useEffect(() => {
    fermer.current = onClose;
  });

  /*
   * `aria-modal="true"` était posé sans rien derrière : les technologies
   * d'assistance annonçaient le reste de la page comme inaccessible alors que
   * 95 éléments restaient atteignables au Tab - pire que pas d'`aria-modal` du
   * tout, puisque l'utilisateur tabulait dans un contenu déclaré inexistant.
   */
  useEffect(() => {
    if (!open) return;
    const precedent = document.activeElement as HTMLElement | null;
    conteneur.current?.focus();
    const defilement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fermable) {
        fermer.current();
        return;
      }
      if (e.key !== 'Tab' || !conteneur.current) return;
      const cibles = focusablesDe(conteneur.current);
      if (cibles.length === 0) {
        e.preventDefault();
        conteneur.current.focus();
        return;
      }
      const premier = cibles[0];
      const dernier = cibles[cibles.length - 1];
      const actif = document.activeElement;
      // Le conteneur lui-même n'est pas dans `cibles` : depuis lui, Tab part sur
      // le premier élément et Shift+Tab sur le dernier.
      if (!conteneur.current.contains(actif) || actif === conteneur.current) {
        e.preventDefault();
        (e.shiftKey ? dernier : premier).focus();
      } else if (e.shiftKey && actif === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && actif === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = defilement;
      // `isConnected` : la commande qui a ouvert la modale peut avoir disparu
      // entre-temps (suppression d'une ligne, changement d'écran).
      if (precedent?.isConnected) precedent.focus();
    };
  }, [open, fermable]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-accent-900/50 p-0 sm:items-center sm:p-4">
      <div
        ref={conteneur}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl focus:outline-none sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-accent-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-accent-900">{title}</h2>
          {fermable && (
            <button
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-accent-500 hover:bg-accent-100"
              aria-label="Fermer"
            >
              <X size={20} />
            </button>
          )}
        </div>
        <div className="grow overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-accent-200 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmer',
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-accent-700">{message}</div>
    </Modal>
  );
}
