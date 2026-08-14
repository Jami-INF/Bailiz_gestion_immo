import { Trash2 } from 'lucide-react';
import type { ElementEDL, EtatNote } from '@/types';
import { ETAT_LABELS } from '@/types';
import { Badge, Checkbox, Input } from '@/components/ui';
import { PhotoCapture } from './PhotoCapture';
import { VignetteEntree, type GroupePhotos } from './VisionneusePhotos';
import { COULEURS_ETAT } from './couleursEtat';

/** Ce qu'il faut pour ouvrir la visionneuse plein écran sur un élément. */
export interface DemandeVisionneuse {
  titre: string;
  groupes: GroupePhotos[];
  initial: number;
}

/**
 * Un élément relevé : état, quantité, dégradation, commentaire et photos.
 *
 * C'est le bloc le plus répété du produit - quelques dizaines par état des
 * lieux - et le geste central du métier. Sorti de `EdlTerrainPage` pour qu'il
 * tienne sous les yeux : la page ne décide plus que de **quoi** afficher, la
 * carte de **comment**.
 *
 * L'identité de l'élément (sa pièce, son identifiant) est liée par l'appelant :
 * les rappels ne prennent que ce qui change. La carte n'écrit jamais en base,
 * elle n'en connaît pas le chemin.
 */
export function CarteElement({
  element: el,
  nomPiece,
  edlId,
  signe,
  sortie,
  entreeAReporter,
  onMaj,
  onEtat,
  onEtatEntree,
  onManquant,
  onSupprimer,
  onVisionner,
}: {
  element: ElementEDL;
  nomPiece: string;
  edlId: string;
  signe: boolean;
  sortie: boolean;
  /** L'état d'entrée est à recopier d'un exemplaire papier. */
  entreeAReporter: boolean;
  onMaj: (m: Partial<ElementEDL>) => void;
  onEtat: (etat: EtatNote) => void;
  onEtatEntree: (etat: EtatNote) => void;
  onManquant: () => void;
  onSupprimer: () => void;
  onVisionner: (demande: DemandeVisionneuse) => void;
}) {
  const groupesPhotos = (): GroupePhotos[] =>
    sortie
      ? [
          { libelle: 'Entrée', photoIds: el.photoIdsEntree ?? [] },
          { libelle: 'Sortie', photoIds: el.photoIds },
        ]
      : [{ libelle: 'Photos', photoIds: el.photoIds }];

  return (
    <div className="rounded-xl border border-accent-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium text-accent-900">
          {el.nom}
          {el.manquant && <Badge tone="red">Manquant</Badge>}
        </span>
        <div className="flex items-center gap-2">
          {!signe && sortie && (
            <button
              type="button"
              onClick={onManquant}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ${
                el.manquant
                  ? 'border-accent-300 text-accent-600 hover:bg-accent-50'
                  : 'border-red-200 text-red-600 hover:bg-red-50'
              }`}
            >
              <Trash2 size={13} /> {el.manquant ? 'Rétablir' : 'Manquant'}
            </button>
          )}
          {!signe && !sortie && !el.obligatoireDecret && (
            <button
              type="button"
              aria-label={`Retirer ${el.nom}`}
              onClick={onSupprimer}
              className="text-accent-400 hover:text-red-600"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/*
       * État à l'entrée. Repris de l'EDL d'entrée quand il a été fait ici,
       * **saisissable** quand il est à recopier d'un exemplaire papier : sans
       * référence d'entrée, une sortie ne fonde aucune retenue.
       */}
      {sortie && entreeAReporter && (
        <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
          <span className="text-sm font-medium text-sky-900">
            État à l&apos;entrée - à recopier de l&apos;état des lieux papier :
          </span>
          <div
            role="group"
            aria-label={`État à l'entrée de ${el.nom}`}
            className="mt-1.5 grid grid-cols-5 gap-1.5"
          >
            {(Object.keys(ETAT_LABELS) as EtatNote[]).map((etat) => {
              const actif = el.etatEntree === etat;
              return (
                <button
                  key={etat}
                  type="button"
                  disabled={signe}
                  aria-pressed={actif}
                  onClick={() => onEtatEntree(etat)}
                  className={`min-h-touch rounded-lg border-2 px-1 py-1.5 text-xs font-semibold transition-all ${
                    actif
                      ? `${COULEURS_ETAT[etat]} text-white shadow`
                      : 'border-sky-200 bg-white text-accent-600 hover:border-sky-400'
                  } disabled:opacity-60`}
                >
                  {ETAT_LABELS[etat]}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {sortie && !entreeAReporter && el.etatEntree && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-accent-50 px-3 py-2">
          <span className="text-sm font-medium text-accent-600">État à l&apos;entrée :</span>
          <span
            className={`rounded px-2.5 py-1 text-sm font-bold uppercase tracking-wide text-white ${COULEURS_ETAT[el.etatEntree]}`}
          >
            {ETAT_LABELS[el.etatEntree]}
          </span>
          {el.commentaireEntree && (
            <span className="text-sm text-accent-500">- {el.commentaireEntree}</span>
          )}
        </div>
      )}

      {el.manquant ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          Élément présent à l&apos;entrée et manquant/retiré à la sortie - noté comme dégradation.
        </p>
      ) : (
        <>
          {/*
           * Sélecteur d'état : 5 gros boutons colorés.
           *
           * `aria-pressed` est le geste central du produit : sans lui, les cinq
           * boutons étaient rigoureusement identiques pour un lecteur d'écran
           * quel que soit l'état saisi - impossible de relire un constat. Le
           * groupe est nommé par l'élément relevé, sinon les dizaines de grilles
           * d'une pièce sont indistinctes.
           */}
          <div role="group" aria-label={`État de ${el.nom}`} className="grid grid-cols-5 gap-1.5">
            {(Object.keys(ETAT_LABELS) as EtatNote[]).map((etat) => {
              const actif = el.etat === etat;
              return (
                <button
                  key={etat}
                  type="button"
                  disabled={signe}
                  aria-pressed={actif}
                  onClick={() => onEtat(etat)}
                  className={`min-h-touch rounded-lg border-2 px-1 py-2 text-xs font-semibold transition-all ${
                    actif
                      ? `${COULEURS_ETAT[etat]} text-white shadow`
                      : 'border-accent-200 bg-white text-accent-600 hover:border-accent-400'
                  } disabled:opacity-60`}
                >
                  {ETAT_LABELS[etat]}
                </button>
              );
            })}
          </div>
          {(el.categorie === 'mobilier' || el.obligatoireDecret) && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-accent-600">Quantité :</span>
              <button
                type="button"
                disabled={signe}
                aria-label="Diminuer la quantité"
                onClick={() => onMaj({ quantite: Math.max(0, (el.quantite ?? 1) - 1) })}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-300 text-lg font-semibold text-accent-700 disabled:opacity-50"
              >
                −
              </button>
              <span className="w-8 text-center font-semibold text-accent-900">
                {el.quantite ?? 1}
              </span>
              <button
                type="button"
                disabled={signe}
                aria-label="Augmenter la quantité"
                onClick={() => onMaj({ quantite: (el.quantite ?? 1) + 1 })}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-300 text-lg font-semibold text-accent-700 disabled:opacity-50"
              >
                +
              </button>
              {(el.quantite ?? 1) === 0 && <Badge tone="red">Absent</Badge>}
            </div>
          )}
          {sortie && el.etat && (
            <div className="mt-2">
              <Checkbox
                label={
                  el.degradation
                    ? 'Dégradation imputable au locataire (décocher si usure normale)'
                    : 'Dégradation imputable au locataire'
                }
                checked={el.degradation ?? false}
                disabled={signe}
                onChange={(e) => onMaj({ degradation: e.target.checked })}
              />
            </div>
          )}
        </>
      )}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          key={`${el.id}-comm`}
          defaultValue={el.commentaire ?? ''}
          placeholder="Commentaire (rayures, taches…)"
          // Le libellé de remplacement disparaît à la première frappe, et il y a
          // des dizaines de ces champs par état des lieux : sans nom propre, ils
          // sont interchangeables.
          aria-label={`Commentaire sur ${el.nom}`}
          disabled={signe}
          onBlur={(e) => onMaj({ commentaire: e.target.value || undefined })}
          className="flex-1"
        />
        {sortie && (
          <VignetteEntree
            photoIds={el.photoIdsEntree ?? []}
            onOuvrir={() =>
              onVisionner({
                titre: `${nomPiece} - ${el.nom}`,
                groupes: [
                  { libelle: 'Entrée', photoIds: el.photoIdsEntree ?? [] },
                  { libelle: 'Sortie', photoIds: el.photoIds },
                ],
                initial: 0,
              })
            }
          />
        )}
        <div>
          <span className="mb-1 block text-xs font-medium text-accent-600">Photos</span>
          <PhotoCapture
            edlId={edlId}
            legende={`${nomPiece} - ${el.nom}`}
            photoIds={el.photoIds}
            lectureSeule={signe}
            onChange={(photoIds) => onMaj({ photoIds })}
            onAgrandir={
              el.photoIds.length
                ? () =>
                    onVisionner({
                      titre: `${nomPiece} - ${el.nom}`,
                      groupes: groupesPhotos(),
                      initial: sortie ? 1 : 0,
                    })
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
