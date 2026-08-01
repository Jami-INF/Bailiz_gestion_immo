import type { Cle, Compteur, EtatDesLieux, TypeCompteur } from '@/types';
import { COMPTEUR_LABELS } from '@/types';
import { Button, Field, Input, Select } from '@/components/ui';
import { PhotoCapture } from './PhotoCapture';
import { Plus, Trash2 } from 'lucide-react';

/**
 * Onglets « Compteurs » et « Clés » du mode terrain : relevés et remise des
 * clés, extraits de la page pour la garder lisible. Aucun état propre : tout
 * remonte au parent qui autosauvegarde.
 */
export function SectionCompteurs({
  edl,
  lectureSeule,
  onMaj,
}: {
  edl: EtatDesLieux;
  lectureSeule: boolean;
  onMaj: (compteurs: Compteur[]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-accent-600">
        Relevez chaque compteur individuel (photo du cadran recommandée).
      </p>
      {edl.compteurs.map((c, i) => (
        <div key={i} className="rounded-xl border border-accent-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Compteur">
              <Select
                value={c.type}
                disabled={lectureSeule}
                onChange={(e) =>
                  onMaj(edl.compteurs.map((x, j) => (j === i ? { ...x, type: e.target.value as TypeCompteur } : x)))
                }
              >
                {Object.entries(COMPTEUR_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="N° de compteur" hint="Inscrit sur le compteur (PDL/PCE sur la facture).">
              <Input
                key={`${edl.id}-cpt-num-${i}-${edl.compteurs.length}`}
                defaultValue={c.numero ?? ''}
                disabled={lectureSeule}
                placeholder="N° 12345678"
                onBlur={(e) =>
                  onMaj(edl.compteurs.map((x, j) => (j === i ? { ...x, numero: e.target.value || undefined } : x)))
                }
              />
            </Field>
            <Field label="Relevé" hint="Index affiché, en kWh ou m³.">
              <Input
                type="number"
                step="0.001"
                key={`${edl.id}-cpt-rel-${i}-${edl.compteurs.length}`}
                defaultValue={c.releve || ''}
                disabled={lectureSeule}
                placeholder="45210"
                onBlur={(e) =>
                  onMaj(edl.compteurs.map((x, j) => (j === i ? { ...x, releve: Number(e.target.value) } : x)))
                }
              />
            </Field>
            <PhotoCapture
              edlId={edl.id}
              legende={`Compteur ${COMPTEUR_LABELS[c.type]}`}
              photoIds={c.photoId ? [c.photoId] : []}
              lectureSeule={lectureSeule}
              onChange={(ids) =>
                onMaj(edl.compteurs.map((x, j) => (j === i ? { ...x, photoId: ids[ids.length - 1] } : x)))
              }
            />
            {!lectureSeule && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Supprimer le compteur"
                onClick={() => onMaj(edl.compteurs.filter((_, j) => j !== i))}
              >
                <Trash2 size={16} className="text-red-600" />
              </Button>
            )}
          </div>
        </div>
      ))}
      {!lectureSeule && (
        <Button variant="secondary" onClick={() => onMaj([...edl.compteurs, { type: 'eau_chaude', releve: 0 }])}>
          <Plus size={16} /> Ajouter un compteur
        </Button>
      )}
    </div>
  );
}

export function SectionCles({
  cles,
  lectureSeule,
  onMaj,
}: {
  cles: Cle[];
  lectureSeule: boolean;
  onMaj: (cles: Cle[]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-accent-600">
        Détail des clés et badges remis, et de leur destination (porte d'entrée, boîte aux
        lettres, cave, garage…).
      </p>
      {cles.map((c, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3 rounded-xl border border-accent-200 bg-white p-4">
          <Field label="Désignation">
            <Input
              key={`cle-des-${i}-${cles.length}`}
              defaultValue={c.designation}
              disabled={lectureSeule}
              placeholder="Clé porte d'entrée, badge parking…"
              onBlur={(e) => onMaj(cles.map((x, j) => (j === i ? { ...x, designation: e.target.value } : x)))}
            />
          </Field>
          <Field label="Nombre">
            <Input
              type="number"
              min={0}
              className="w-24"
              key={`cle-nb-${i}-${cles.length}`}
              defaultValue={c.nombre}
              disabled={lectureSeule}
              onBlur={(e) => onMaj(cles.map((x, j) => (j === i ? { ...x, nombre: Number(e.target.value) } : x)))}
            />
          </Field>
          <Field label="Commentaire">
            <Input
              key={`cle-com-${i}-${cles.length}`}
              defaultValue={c.commentaire ?? ''}
              disabled={lectureSeule}
              placeholder="Ex. : double remis au locataire"
              onBlur={(e) =>
                onMaj(cles.map((x, j) => (j === i ? { ...x, commentaire: e.target.value || undefined } : x)))
              }
            />
          </Field>
          {!lectureSeule && (
            <Button variant="ghost" size="sm" aria-label="Supprimer" onClick={() => onMaj(cles.filter((_, j) => j !== i))}>
              <Trash2 size={16} className="text-red-600" />
            </Button>
          )}
        </div>
      ))}
      {!lectureSeule && (
        <Button variant="secondary" onClick={() => onMaj([...cles, { designation: 'Clé', nombre: 1 }])}>
          <Plus size={16} /> Ajouter une clé / un badge
        </Button>
      )}
    </div>
  );
}
