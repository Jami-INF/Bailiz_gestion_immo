import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { differenceInDays, format } from 'date-fns';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gauge,
  Info,
  KeyRound,
  Lock,
  PenLine,
  Plus,
  Scale,
  Trash2,
} from 'lucide-react';
import { db } from '@/lib/db';
import { nowISO } from '@/lib/ids';
import type { Cle, Compteur, ElementEDL, EtatDesLieux, EtatNote, TypeCompteur } from '@/types';
import { COMPTEUR_LABELS, ETAT_LABELS } from '@/types';
import { estDegradation, progressionEDL } from '@/lib/etat';
import { Badge, Button, Checkbox, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { PhotoCapture } from './PhotoCapture';

const COULEURS_ETAT: Record<EtatNote, string> = {
  neuf: 'bg-emerald-600 border-emerald-600',
  tres_bon: 'bg-green-500 border-green-500',
  bon: 'bg-lime-500 border-lime-500',
  usage: 'bg-amber-500 border-amber-500',
  mauvais: 'bg-red-500 border-red-500',
};

/** Mode terrain : plein écran, une pièce à la fois, gros boutons, autosauvegarde continue. */
export function EdlTerrainPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const edl = useLiveQuery(() => (id ? db.edls.get(id) : undefined), [id]);
  const bail = useLiveQuery(() => (edl ? db.baux.get(edl.bailId) : undefined), [edl?.bailId]);
  const [ongletIdx, setOngletIdx] = useState(0);
  const [modaleAvenant, setModaleAvenant] = useState(false);
  const [texteAvenant, setTexteAvenant] = useState('');

  const onglets = useMemo(() => {
    if (!edl) return [];
    return [
      { type: 'compteurs' as const, nom: 'Compteurs' },
      { type: 'cles' as const, nom: 'Clés' },
      ...[...edl.pieces].sort((a, b) => a.ordre - b.ordre).map((p) => ({ type: 'piece' as const, nom: p.nom, pieceId: p.id })),
      { type: 'infos' as const, nom: 'Infos' },
    ];
  }, [edl?.pieces, edl?.id]);

  if (!edl) return null;

  const signe = edl.statut === 'signe';
  const sortie = edl.type === 'sortie';
  const prog = progressionEDL(edl.pieces);
  const onglet = onglets[Math.min(ongletIdx, onglets.length - 1)];

  /** Autosauvegarde : chaque changement écrit immédiatement en IndexedDB. */
  const maj = (m: Partial<EtatDesLieux>) => {
    if (signe) return;
    void db.edls.put({ ...edl, ...m, updatedAt: nowISO() });
  };

  const majElement = (pieceId: string, elementId: string, m: Partial<ElementEDL>) => {
    maj({
      pieces: edl.pieces.map((p) =>
        p.id !== pieceId
          ? p
          : {
              ...p,
              elements: p.elements.map((el) => (el.id !== elementId ? el : { ...el, ...m })),
            },
      ),
    });
  };

  const choisirEtat = (pieceId: string, el: ElementEDL, etat: EtatNote) => {
    const m: Partial<ElementEDL> = { etat };
    // EDL de sortie : marquage automatique de la dégradation (décochable)
    if (sortie) m.degradation = estDegradation(el.etatEntree, etat);
    majElement(pieceId, el.id, m);
  };

  const ajouterAvenant = async () => {
    if (!texteAvenant.trim()) return;
    await db.edls.put({
      ...edl,
      avenants: [...edl.avenants, { date: nowISO(), texte: texteAvenant.trim() }],
      updatedAt: nowISO(),
    });
    setTexteAvenant('');
    setModaleAvenant(false);
    toast('success', "Avenant ajouté. Il figurera sur le PDF de l'état des lieux.");
  };

  const joursDepuisSignature = edl.signatures
    ? differenceInDays(new Date(), new Date(edl.signatures.dateSignature))
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-accent-50">
      {/* Barre supérieure */}
      <header className="sticky top-0 z-30 border-b border-accent-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate(bail ? `/baux/${bail.id}` : '/edl')}
            className="flex min-h-touch items-center gap-1 text-sm font-medium text-accent-700"
          >
            <ArrowLeft size={18} /> Quitter
          </button>
          <div className="text-center">
            <div className="text-sm font-bold text-accent-900">
              {edl.reference} — {sortie ? 'Sortie' : 'Entrée'}
            </div>
            <div className="text-xs text-accent-500">
              {prog.renseignes}/{prog.total} éléments · sauvegarde automatique
            </div>
          </div>
          {signe ? (
            <Badge tone="green">
              <Lock size={12} /> Signé
            </Badge>
          ) : (
            <Link to={`/edl/${edl.id}/signature`}>
              <Button size="sm" disabled={prog.total === 0}>
                <PenLine size={14} /> Signer
              </Button>
            </Link>
          )}
        </div>
        {/* Barre de progression */}
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent-100">
          <div className="h-full rounded-full bg-accent-700 transition-all" style={{ width: `${prog.pct}%` }} />
        </div>
        {/* Navigation par onglets */}
        <nav className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {onglets.map((o, i) => {
            const actif = i === ongletIdx;
            const complete =
              o.type === 'piece' &&
              edl.pieces.find((p) => p.id === o.pieceId)?.elements.every((e) => e.etat !== undefined);
            return (
              <button
                key={o.nom + i}
                onClick={() => setOngletIdx(i)}
                className={`flex min-h-touch shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  actif ? 'bg-accent-700 text-white' : 'bg-accent-100 text-accent-700'
                }`}
              >
                {o.type === 'compteurs' && <Gauge size={14} />}
                {o.type === 'cles' && <KeyRound size={14} />}
                {o.type === 'infos' && <Info size={14} />}
                {o.nom}
                {complete && <Check size={14} className={actif ? 'text-green-300' : 'text-green-600'} />}
              </button>
            );
          })}
        </nav>
      </header>

      {signe && (
        <div className="mx-4 mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <p className="flex items-center gap-2 font-medium">
            <Lock size={14} /> Document signé le{' '}
            {edl.signatures && format(new Date(edl.signatures.dateSignature), 'dd/MM/yyyy à HH:mm')} —
            lecture seule. Toute correction passe par un avenant daté.
          </p>
          {edl.type === 'entree' && joursDepuisSignature !== null && (
            <p className="mt-1 text-xs">
              {joursDepuisSignature <= 10
                ? `Le locataire dispose encore de ${10 - joursDepuisSignature} jour(s) pour demander un complément (10 jours après signature ; 1er mois de chauffe pour le chauffage).`
                : 'Le délai de 10 jours pour compléter l’EDL est écoulé (sauf chauffage pendant le 1er mois de chauffe).'}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setModaleAvenant(true)}>
              <Plus size={14} /> Créer un avenant
            </Button>
            {sortie && (
              <Link to={`/edl/${edl.id}/synthese`}>
                <Button variant="secondary" size="sm">
                  <Scale size={14} /> Synthèse comparative & retenues
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-3xl grow px-4 py-4">
        {onglet?.type === 'compteurs' && (
          <SectionCompteurs edl={edl} lectureSeule={signe} onMaj={(compteurs) => maj({ compteurs })} />
        )}
        {onglet?.type === 'cles' && (
          <SectionCles cles={edl.cles} lectureSeule={signe} onMaj={(cles) => maj({ cles })} />
        )}
        {onglet?.type === 'piece' && (
          <div className="space-y-3">
            {edl.pieces
              .find((p) => p.id === onglet.pieceId)!
              .elements.map((el) => (
                <div key={el.id} className="rounded-xl border border-accent-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-accent-900">{el.nom}</span>
                    {sortie && el.etatEntree && (
                      <span className="text-xs text-accent-500">
                        Entrée : <span className="font-semibold">{ETAT_LABELS[el.etatEntree]}</span>
                        {el.commentaireEntree && ` — ${el.commentaireEntree}`}
                      </span>
                    )}
                  </div>
                  {/* Sélecteur d'état : 5 gros boutons colorés */}
                  <div className="grid grid-cols-5 gap-1.5">
                    {(Object.keys(ETAT_LABELS) as EtatNote[]).map((etat) => {
                      const actif = el.etat === etat;
                      return (
                        <button
                          key={etat}
                          type="button"
                          disabled={signe}
                          onClick={() => choisirEtat(onglet.pieceId!, el, etat)}
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
                        onChange={(e) => majElement(onglet.pieceId!, el.id, { degradation: e.target.checked })}
                      />
                    </div>
                  )}
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
                    <Input
                      key={`${el.id}-comm`}
                      defaultValue={el.commentaire ?? ''}
                      placeholder="Commentaire (rayures, taches…)"
                      disabled={signe}
                      onBlur={(e) =>
                        majElement(onglet.pieceId!, el.id, { commentaire: e.target.value || undefined })
                      }
                      className="flex-1"
                    />
                    <PhotoCapture
                      edlId={edl.id}
                      legende={`${onglet.nom} — ${el.nom}`}
                      photoIds={el.photoIds}
                      lectureSeule={signe}
                      onChange={(photoIds) => majElement(onglet.pieceId!, el.id, { photoIds })}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}
        {onglet?.type === 'infos' && (
          <div className="space-y-4 rounded-xl border border-accent-200 bg-white p-4">
            <Field label="Date de l'état des lieux">
              <Input
                type="date"
                value={format(new Date(edl.date), 'yyyy-MM-dd')}
                disabled={signe}
                onChange={(e) => maj({ date: new Date(e.target.value).toISOString() })}
              />
            </Field>
            {sortie && (
              <Field
                label="Nouvelle adresse du locataire"
                hint="Utile pour la restitution du dépôt de garantie."
              >
                <Input
                  key={`${edl.id}-adresse`}
                  defaultValue={edl.nouvelleAdresseLocataire ?? ''}
                  disabled={signe}
                  onBlur={(e) => maj({ nouvelleAdresseLocataire: e.target.value || undefined })}
                />
              </Field>
            )}
            <Field label="Observations générales">
              <Textarea
                key={`${edl.id}-obs`}
                defaultValue={edl.observationsGenerales ?? ''}
                disabled={signe}
                onBlur={(e) => maj({ observationsGenerales: e.target.value || undefined })}
              />
            </Field>
            {edl.avenants.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-accent-900">Avenants</h3>
                <ul className="space-y-1 text-sm text-accent-700">
                  {edl.avenants.map((a, i) => (
                    <li key={i}>
                      {format(new Date(a.date), 'dd/MM/yyyy')} — {a.texte}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Navigation bas de page (swipe simplifié : précédent / suivant) */}
      <footer className="sticky bottom-0 border-t border-accent-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Button variant="secondary" onClick={() => setOngletIdx(Math.max(0, ongletIdx - 1))} disabled={ongletIdx === 0}>
            <ArrowLeft size={16} /> Précédent
          </Button>
          <span className="text-sm text-accent-500">
            {ongletIdx + 1}/{onglets.length}
          </span>
          <Button
            variant="secondary"
            onClick={() => setOngletIdx(Math.min(onglets.length - 1, ongletIdx + 1))}
            disabled={ongletIdx >= onglets.length - 1}
          >
            Suivant <ArrowRight size={16} />
          </Button>
        </div>
      </footer>

      <Modal
        open={modaleAvenant}
        onClose={() => setModaleAvenant(false)}
        title="Avenant à l'état des lieux"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModaleAvenant(false)}>
              Annuler
            </Button>
            <Button onClick={ajouterAvenant} disabled={!texteAvenant.trim()}>
              Ajouter l'avenant
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {edl.type === 'entree' && joursDepuisSignature !== null && joursDepuisSignature > 10 && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Le délai légal de 10 jours est dépassé : l'avenant nécessite l'accord des deux
              parties (hors chauffage pendant le premier mois de chauffe).
            </p>
          )}
          <Field label="Texte de l'avenant" required>
            <Textarea
              rows={5}
              value={texteAvenant}
              onChange={(e) => setTexteAvenant(e.target.value)}
              placeholder="Ex. : Complément demandé par le locataire — rayure constatée sur le parquet du séjour…"
            />
          </Field>
          <p className="text-xs text-accent-500">L'avenant est daté automatiquement et apparaîtra sur le PDF.</p>
        </div>
      </Modal>
    </div>
  );
}

function SectionCompteurs({
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
            <Field label="N° de compteur">
              <Input
                key={`${edl.id}-cpt-num-${i}`}
                defaultValue={c.numero ?? ''}
                disabled={lectureSeule}
                onBlur={(e) =>
                  onMaj(edl.compteurs.map((x, j) => (j === i ? { ...x, numero: e.target.value || undefined } : x)))
                }
              />
            </Field>
            <Field label="Relevé">
              <Input
                type="number"
                step="0.001"
                key={`${edl.id}-cpt-rel-${i}`}
                defaultValue={c.releve || ''}
                disabled={lectureSeule}
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

function SectionCles({
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
              key={`cle-des-${i}`}
              defaultValue={c.designation}
              disabled={lectureSeule}
              onBlur={(e) => onMaj(cles.map((x, j) => (j === i ? { ...x, designation: e.target.value } : x)))}
            />
          </Field>
          <Field label="Nombre">
            <Input
              type="number"
              min={0}
              className="w-24"
              key={`cle-nb-${i}`}
              defaultValue={c.nombre}
              disabled={lectureSeule}
              onBlur={(e) => onMaj(cles.map((x, j) => (j === i ? { ...x, nombre: Number(e.target.value) } : x)))}
            />
          </Field>
          <Field label="Commentaire">
            <Input
              key={`cle-com-${i}`}
              defaultValue={c.commentaire ?? ''}
              disabled={lectureSeule}
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
