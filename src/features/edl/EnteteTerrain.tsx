import { ArrowLeft, Check, Gauge, Info, KeyRound, Lock, PenLine, Plus } from 'lucide-react';
import type { EtatDesLieux } from '@/types';
import type { ProgressionEDL } from '@/lib/etat';
import { Badge, Button } from '@/components/ui';

/** Un onglet du mode terrain : les relevés, une pièce, ou la fiche d'infos. */
export interface OngletTerrain {
  type: 'compteurs' | 'cles' | 'piece' | 'infos';
  nom: string;
  pieceId?: string;
}

const ICONES = { compteurs: Gauge, cles: KeyRound, infos: Info } as const;

/**
 * Barre supérieure du mode terrain : sortie, titre, progression et onglets.
 *
 * Collante en haut d'écran, c'est le seul repère permanent d'un constat qui
 * peut durer une heure. Sortie de `EdlTerrainPage` telle quelle : elle ne
 * décide de rien, elle affiche et remonte les gestes.
 */
export function EnteteTerrain({
  edl,
  onglets,
  ongletIdx,
  progression,
  nbOublis,
  signe,
  sortie,
  onOngletChange,
  onQuitter,
  onVoirOublis,
  onSigner,
  onAjouterPiece,
}: {
  edl: EtatDesLieux;
  onglets: OngletTerrain[];
  ongletIdx: number;
  progression: ProgressionEDL;
  nbOublis: number;
  signe: boolean;
  sortie: boolean;
  onOngletChange: (idx: number) => void;
  onQuitter: () => void;
  onVoirOublis: () => void;
  onSigner: () => void;
  onAjouterPiece: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-accent-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onQuitter}
          className="flex min-h-touch items-center gap-1 text-sm font-medium text-accent-700"
        >
          <ArrowLeft size={18} /> Quitter
        </button>
        <div className="text-center">
          {/* Seul titre de l'écran : l'écran principal de travail du produit
              n'avait ni `h1` ni `h2`, donc aucune entrée dans la table des
              titres d'un lecteur d'écran. Le style visuel est inchangé. */}
          <h1 className="text-sm font-bold text-accent-900">
            {edl.reference} - {sortie ? 'Sortie' : 'Entrée'}
          </h1>
          {nbOublis > 0 && !signe ? (
            <button
              type="button"
              onClick={onVoirOublis}
              className="text-xs font-medium text-amber-700 underline underline-offset-2"
            >
              {nbOublis} élément(s) non renseigné(s) - voir la liste
            </button>
          ) : (
            <div className="text-xs text-accent-500">
              {progression.renseignes}/{progression.total} éléments · sauvegarde automatique
            </div>
          )}
        </div>
        {signe ? (
          <Badge tone="green">
            <Lock size={12} /> Signé
          </Badge>
        ) : (
          <Button size="sm" onClick={onSigner}>
            <PenLine size={14} /> Signer
          </Button>
        )}
      </div>

      {/* Barre de progression. `aria-hidden` plutôt que `role="progressbar"` :
          le décompte est déjà donné en toutes lettres juste au-dessus
          (« N/M éléments »), la répéter n'ajoute qu'une annonce. */}
      <div aria-hidden className="mt-2 h-2 overflow-hidden rounded-full bg-accent-100">
        <div
          className="h-full rounded-full bg-accent-700 transition-all"
          style={{ width: `${progression.pct}%` }}
        />
      </div>

      <nav className="mt-2 flex gap-1 overflow-x-auto pb-1">
        {onglets.map((o, i) => {
          const actif = i === ongletIdx;
          const complete =
            o.type === 'piece' &&
            edl.pieces.find((p) => p.id === o.pieceId)?.elements.every((e) => e.etat !== undefined);
          const Icone = o.type === 'piece' ? null : ICONES[o.type];
          return (
            <button
              key={o.nom + i}
              onClick={() => onOngletChange(i)}
              /*
               * L'onglet courant ne se distinguait que par sa couleur, et la
               * coche de complétion n'avait aucun équivalent textuel : les deux
               * informations sont reportées dans le nom accessible.
               */
              aria-current={actif ? 'page' : undefined}
              aria-label={complete ? `${o.nom} - complète` : o.nom}
              className={`flex min-h-touch shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
                actif ? 'bg-accent-700 text-white' : 'bg-accent-100 text-accent-700'
              }`}
            >
              {Icone && <Icone size={14} />}
              {o.nom}
              {complete && (
                <Check size={14} className={actif ? 'text-green-300' : 'text-green-600'} />
              )}
            </button>
          );
        })}
        {!signe && !sortie && (
          <button
            onClick={onAjouterPiece}
            className="flex min-h-touch shrink-0 items-center gap-1 rounded-lg border border-dashed border-accent-300 px-3 py-1.5 text-sm font-medium text-accent-600"
          >
            <Plus size={14} /> Pièce
          </button>
        )}
      </nav>
    </header>
  );
}
