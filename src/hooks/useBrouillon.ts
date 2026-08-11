import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { nowISO } from '@/lib/ids';

/** Délai d'inactivité avant écriture — assez court pour ne rien perdre, assez
 *  long pour ne pas écrire à chaque touche du clavier. */
const DELAI_ECRITURE_MS = 600;

export interface EtatBrouillon {
  /** Efface le brouillon (formulaire enregistré, ou abandon explicite). */
  oublier: () => Promise<void>;
  /** Vrai tant que le brouillon n'a pas été lu : ne rien afficher avant. */
  chargement: boolean;
}

export interface OptionsBrouillon<T> {
  /**
   * `updatedAt` de l'entité éditée. Si la fiche a changé depuis le début de la
   * saisie (modification reçue par synchronisation), le brouillon est périmé.
   */
  baseUpdatedAt?: string;
  /**
   * Appelé une seule fois, à la lecture, si une saisie en cours a été
   * retrouvée. C'est au formulaire de décider quoi en faire.
   */
  onRepris?: (donnees: T, updatedAt: string) => void;
}

/**
 * Sauvegarde continue d'une saisie de formulaire, sur le modèle de l'état des
 * lieux : chaque modification est écrite en IndexedDB après une courte pause,
 * et retrouvée telle quelle au retour.
 *
 * Ce sont les **données du formulaire** qui sont conservées, pas l'entité :
 * un bien à demi renseigné n'a rien à faire dans la liste des biens, dans le
 * sélecteur d'un bail ou dans une sauvegarde. Le formulaire reste donc atomique
 * — on enregistre quand on a fini — sans que la saisie soit à la merci d'un
 * rechargement.
 *
 * @param cle     identifiant du formulaire (`bien:nouveau`, `bien:<id>`)
 * @param donnees état courant, sérialisable
 * @param pret    false tant que le formulaire charge : rien n'est lu ni écrit
 */
export function useBrouillon<T>(
  cle: string,
  donnees: T,
  pret: boolean,
  options: OptionsBrouillon<T> = {},
): EtatBrouillon {
  const { baseUpdatedAt, onRepris } = options;
  const [chargement, setChargement] = useState(true);
  /* Le rappel est lu par référence : le formulaire n'a pas à le mémoïser, et sa
     ré-création à chaque rendu ne doit pas relire le brouillon. */
  const rappel = useRef(onRepris);
  useEffect(() => {
    rappel.current = onRepris;
  });
  /**
   * Sérialisation de l'état de départ. Tant que la saisie lui est identique,
   * rien n'est écrit : ouvrir un formulaire pour le refermer ne doit pas créer
   * de brouillon, ni en ressusciter un qu'on vient d'oublier.
   */
  const reference = useRef<string | null>(null);
  /** Écriture en attente, annulable : oublier un brouillon ne doit pas laisser
   *  un minuteur le réécrire juste après. */
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Lecture initiale.
  useEffect(() => {
    if (!pret) return;
    let annule = false;
    void db.brouillons.get(cle).then((b) => {
      if (annule) return;
      const perime =
        b !== undefined &&
        b.baseUpdatedAt !== undefined &&
        baseUpdatedAt !== undefined &&
        b.baseUpdatedAt !== baseUpdatedAt;
      if (perime) void db.brouillons.delete(cle);
      if (b && !perime) rappel.current?.(b.donnees as T, b.updatedAt);
      setChargement(false);
    });
    return () => {
      annule = true;
    };
    // `baseUpdatedAt` n'est lu qu'à la première passe : la relecture ne doit pas
    // se déclencher à chaque enregistrement de l'entité.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, pret]);

  // Écriture continue.
  useEffect(() => {
    if (!pret || chargement) return;
    const serialise = JSON.stringify(donnees);
    if (reference.current === null) {
      reference.current = serialise;
      return;
    }
    if (serialise === reference.current) return;
    minuteur.current = setTimeout(() => {
      void db.brouillons.put({ cle, donnees, updatedAt: nowISO(), baseUpdatedAt });
    }, DELAI_ECRITURE_MS);
    return () => clearTimeout(minuteur.current);
  }, [cle, donnees, pret, chargement, baseUpdatedAt]);

  /**
   * Efface le brouillon et reprend la saisie courante comme nouvel état de
   * départ : après un abandon, on peut continuer à saisir sans que le brouillon
   * qu'on vient d'écarter ne se réécrive tout seul.
   */
  const oublier = useCallback(async () => {
    clearTimeout(minuteur.current);
    reference.current = null;
    await db.brouillons.delete(cle);
  }, [cle]);

  return { oublier, chargement };
}
