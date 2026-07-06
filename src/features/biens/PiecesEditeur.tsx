import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { CategorieElement, PieceModele } from '@/types';
import { CATEGORIE_LABELS } from '@/types';
import { BIBLIOTHEQUE_PIECES } from '@/lib/defauts';
import { uid } from '@/lib/ids';
import { Button, Input, Modal, Select } from '@/components/ui';

/** Éditeur de structure de pièces d'un bien (réutilisée pour chaque EDL). */
export function PiecesEditeur({
  pieces,
  onChange,
}: {
  pieces: PieceModele[];
  onChange: (pieces: PieceModele[]) => void;
}) {
  const [modaleAjout, setModaleAjout] = useState(false);
  const [pieceOuverte, setPieceOuverte] = useState<string | null>(null);

  const ajouterDepuisModele = (nomModele: string) => {
    const modele = BIBLIOTHEQUE_PIECES.find((m) => m.nom === nomModele);
    const nb = pieces.filter((p) => p.nom.startsWith(nomModele)).length;
    const piece: PieceModele = {
      id: uid(),
      nom: nb > 0 ? `${nomModele} ${nb + 1}` : nomModele,
      ordre: pieces.length,
      elements: (modele?.elements ?? []).map((e) => ({ id: uid(), ...e })),
    };
    onChange([...pieces, piece]);
    setModaleAjout(false);
    setPieceOuverte(piece.id);
  };

  const majPiece = (id: string, maj: Partial<PieceModele>) =>
    onChange(pieces.map((p) => (p.id === id ? { ...p, ...maj } : p)));

  const supprimerPiece = (id: string) =>
    onChange(pieces.filter((p) => p.id !== id).map((p, i) => ({ ...p, ordre: i })));

  const deplacer = (index: number, sens: -1 | 1) => {
    const cible = index + sens;
    if (cible < 0 || cible >= pieces.length) return;
    const copie = [...pieces];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    onChange(copie.map((p, i) => ({ ...p, ordre: i })));
  };

  return (
    <div className="space-y-3">
      {pieces.length === 0 && (
        <p className="rounded-lg border border-dashed border-accent-300 p-4 text-center text-sm text-accent-500">
          Aucune pièce. Ajoutez les pièces du logement : elles serviront de trame à chaque état
          des lieux.
        </p>
      )}
      {pieces.map((piece, index) => (
        <div key={piece.id} className="rounded-lg border border-accent-200 bg-white">
          <div className="flex items-center gap-2 px-3 py-2">
            <button
              type="button"
              className="grow text-left font-medium text-accent-900"
              onClick={() => setPieceOuverte(pieceOuverte === piece.id ? null : piece.id)}
            >
              {piece.nom}
              <span className="ml-2 text-xs font-normal text-accent-500">
                {piece.elements.length} élément{piece.elements.length > 1 ? 's' : ''}
              </span>
            </button>
            <Button variant="ghost" size="sm" onClick={() => deplacer(index, -1)} disabled={index === 0} aria-label="Monter">
              <ArrowUp size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => deplacer(index, 1)} disabled={index === pieces.length - 1} aria-label="Descendre">
              <ArrowDown size={16} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => supprimerPiece(piece.id)} aria-label="Supprimer la pièce">
              <Trash2 size={16} className="text-red-600" />
            </Button>
          </div>
          {pieceOuverte === piece.id && (
            <div className="space-y-2 border-t border-accent-100 px-3 py-3">
              <Input
                value={piece.nom}
                onChange={(e) => majPiece(piece.id, { nom: e.target.value })}
                aria-label="Nom de la pièce"
              />
              {piece.elements.map((el) => (
                <div key={el.id} className="flex items-center gap-2">
                  <Input
                    value={el.nom}
                    onChange={(e) =>
                      majPiece(piece.id, {
                        elements: piece.elements.map((x) =>
                          x.id === el.id ? { ...x, nom: e.target.value } : x,
                        ),
                      })
                    }
                    aria-label="Nom de l'élément"
                  />
                  <Select
                    value={el.categorie}
                    className="max-w-[140px]"
                    onChange={(e) =>
                      majPiece(piece.id, {
                        elements: piece.elements.map((x) =>
                          x.id === el.id
                            ? { ...x, categorie: e.target.value as CategorieElement }
                            : x,
                        ),
                      })
                    }
                    aria-label="Catégorie"
                  >
                    {Object.entries(CATEGORIE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Supprimer l'élément"
                    onClick={() =>
                      majPiece(piece.id, {
                        elements: piece.elements.filter((x) => x.id !== el.id),
                      })
                    }
                  >
                    <Trash2 size={16} className="text-red-600" />
                  </Button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  majPiece(piece.id, {
                    elements: [
                      ...piece.elements,
                      { id: uid(), nom: 'Nouvel élément', categorie: 'autre' },
                    ],
                  })
                }
              >
                <Plus size={14} /> Ajouter un élément
              </Button>
            </div>
          )}
        </div>
      ))}
      <Button variant="secondary" onClick={() => setModaleAjout(true)}>
        <Plus size={16} /> Ajouter une pièce
      </Button>
      <Modal open={modaleAjout} onClose={() => setModaleAjout(false)} title="Ajouter une pièce">
        <div className="grid grid-cols-2 gap-2">
          {BIBLIOTHEQUE_PIECES.map((m) => (
            <Button key={m.nom} variant="secondary" onClick={() => ajouterDepuisModele(m.nom)}>
              {m.nom}
            </Button>
          ))}
          <Button variant="secondary" onClick={() => ajouterDepuisModele('Autre pièce')}>
            Autre…
          </Button>
        </div>
        <p className="mt-3 text-xs text-accent-500">
          Chaque modèle pré-remplit les éléments usuels de la pièce (sols, murs, équipements…),
          modifiables ensuite.
        </p>
      </Modal>
    </div>
  );
}
