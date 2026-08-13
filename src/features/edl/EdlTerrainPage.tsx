import { useEffect, useMemo, useState } from 'react';
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
  Pencil,
  PenLine,
  Plus,
  Scale,
  Trash2,
} from 'lucide-react';
import { db } from '@/lib/db';
import { nowISO, uid } from '@/lib/ids';
import type { CategorieElement, Compteur, ElementEDL, EtatDesLieux, EtatNote, PieceEDL } from '@/types';
import { CATEGORIE_LABELS, ETAT_LABELS } from '@/types';
import { elementsNonRenseignes, estDegradation, progressionEDL } from '@/lib/etat';
import { Badge, Button, Checkbox, DateInput, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui';
import { PhotoCapture } from './PhotoCapture';
import { SectionCles, SectionCompteurs } from './SectionsReleves';
import { VignetteEntree, VisionneusePhotos, type GroupePhotos } from './VisionneusePhotos';

/*
 * Barème d'état, sur le modèle de l'étiquette DPE : trois verts pour les états
 * satisfaisants, ambre pour l'usure, rouge pour le défaut. C'est une échelle que
 * le public français lit sans légende.
 *
 * Toutes les teintes viennent des familles mesurées de `tailwind.config.js`.
 * L'ancien barème employait `emerald` et `lime`, absents de la config, donc
 * jamais soumis à l'audit de contraste : « Bon » sur `lime-500` donnait 1,98:1
 * en texte blanc - illisible en plein jour sur une tablette, exactement la
 * situation d'usage. Les nuances 500 sont exclues d'office (`success-500` à
 * 4,29:1, `warning-500` à 3,42:1) : seules les 600 et au-delà passent AA.
 *
 * Le faible écart entre paliers voisins est sans conséquence : seul le bouton
 * sélectionné est coloré, et le libellé texte est toujours affiché.
 */
const COULEURS_ETAT: Record<EtatNote, string> = {
  neuf: 'bg-success-800 border-success-800', // 11,05:1 avec du blanc
  tres_bon: 'bg-success-700 border-success-700', // 8,62:1
  bon: 'bg-success-600 border-success-600', // 6,21:1
  usage: 'bg-warning-600 border-warning-600', // 5,14:1
  mauvais: 'bg-danger-600 border-danger-600', // 6,13:1
};

/** Mode terrain : plein écran, une pièce à la fois, gros boutons, autosauvegarde continue. */
export function EdlTerrainPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const edl = useLiveQuery(() => (id ? db.edls.get(id) : undefined), [id]);
  // Le logement se lit sur l'état des lieux, pas sur le bail : il peut n'y en
  // avoir aucun (constat établi hors d'un contrat rédigé ici).
  const bail = useLiveQuery(() => (edl?.bailId ? db.baux.get(edl.bailId) : undefined), [edl?.bailId]);
  const bien = useLiveQuery(() => (edl ? db.biens.get(edl.bienId) : undefined), [edl?.bienId]);
  /** Baux du même logement, seuls candidats à un rattachement a posteriori. */
  const bauxDuBien = useLiveQuery(
    () => (edl && !edl.bailId ? db.baux.where('bienId').equals(edl.bienId).toArray() : []),
    [edl?.bienId, edl?.bailId],
  );
  const [ongletIdx, setOngletIdx] = useState(0);
  const [modaleAvenant, setModaleAvenant] = useState(false);
  const [texteAvenant, setTexteAvenant] = useState('');
  const [nouvelElement, setNouvelElement] = useState('');
  const [nouvelleCategorie, setNouvelleCategorie] = useState<CategorieElement>('equipement');
  const [modalePiece, setModalePiece] = useState(false);
  const [nomNouvellePiece, setNomNouvellePiece] = useState('');
  const [modaleRectifier, setModaleRectifier] = useState(false);
  const [modaleOublis, setModaleOublis] = useState(false);
  /** Photos ouvertes en plein écran (comparaison entrée/sortie). */
  const [visionneuse, setVisionneuse] = useState<{ titre: string; groupes: GroupePhotos[]; initial: number } | null>(
    null,
  );

  const onglets = useMemo(() => {
    if (!edl) return [];
    return [
      { type: 'compteurs' as const, nom: 'Compteurs' },
      { type: 'cles' as const, nom: 'Clés' },
      ...[...edl.pieces].sort((a, b) => a.ordre - b.ordre).map((p) => ({ type: 'piece' as const, nom: p.nom, pieceId: p.id })),
      { type: 'infos' as const, nom: 'Infos' },
    ];
  }, [edl?.pieces, edl?.id]);

  // Revient en haut de page à chaque changement d'onglet (sinon on reste en bas).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [ongletIdx]);

  if (!edl) return null;

  const signe = edl.statut === 'signe';
  const sortie = edl.type === 'sortie';
  /** Sortie dont l'état d'entrée est à recopier d'un exemplaire papier. */
  const entreeAReporter = sortie && edl.origineEtatEntree === 'edl_papier';
  /** Sortie établie sans aucun état des lieux d'entrée : rien à comparer. */
  const sansEtatEntree = sortie && edl.origineEtatEntree === 'aucun';
  const prog = progressionEDL(edl.pieces);
  const oublis = elementsNonRenseignes(edl.pieces);

  /** Ouvre la pièce qui contient l'élément oublié (et ferme le récapitulatif). */
  const allerALaPiece = (pieceId: string) => {
    const idx = onglets.findIndex((o) => o.type === 'piece' && o.pieceId === pieceId);
    if (idx >= 0) setOngletIdx(idx);
    setModaleOublis(false);
  };
  const onglet = onglets[Math.min(ongletIdx, onglets.length - 1)];
  const obligatoiresAbsents = edl.pieces
    .flatMap((p) => p.elements)
    .filter((e) => e.obligatoireDecret && (e.quantite ?? 1) === 0);

  /** Autosauvegarde : chaque changement écrit immédiatement en IndexedDB. */
  const maj = (m: Partial<EtatDesLieux>) => {
    if (signe) return;
    void db.edls.put({ ...edl, ...m, updatedAt: nowISO() });
  };

  /**
   * Met à jour les compteurs de l'EDL et mémorise leurs numéros sur le logement :
   * un PDL/PCE ne change pas d'un locataire à l'autre, il n'a donc à être saisi
   * qu'une fois et pré-remplira les états des lieux suivants.
   */
  const majCompteurs = (compteurs: Compteur[]) => {
    maj({ compteurs });
    if (!bien) return;
    const reference = compteurs.map((c) => ({ type: c.type, numero: c.numero }));
    const inchange =
      bien.compteurs?.length === reference.length &&
      bien.compteurs.every((c, i) => c.type === reference[i].type && c.numero === reference[i].numero);
    if (inchange) return;
    void db.biens.put({ ...bien, compteurs: reference, updatedAt: nowISO() });
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

  /**
   * Rattache l'état des lieux à un bail existant.
   *
   * Écrit hors de `maj` à dessein : `maj` refuse toute écriture après signature,
   * or le rattachement n'est pas une modification du constat - c'est un
   * classement, et son intérêt principal est justement pour un document déjà
   * signé qu'on relie au bail rédigé ensuite.
   */
  const rattacherBail = async (bailId: string) => {
    if (!edl) return;
    await db.edls.put({ ...edl, bailId, updatedAt: nowISO() });
    toast('success', 'État des lieux rattaché au bail. Le document signé reste inchangé.');
  };

  /**
   * Report d'un état d'entrée relevé sur un état des lieux **papier**. Le
   * comparatif ne sait pas - et n'a pas à savoir - d'où vient l'état d'entrée :
   * une fois reporté, la dégradation se calcule exactement comme si l'entrée
   * avait été faite dans l'application.
   */
  const choisirEtatEntree = (pieceId: string, el: ElementEDL, etatEntree: EtatNote) => {
    majElement(pieceId, el.id, { etatEntree, degradation: estDegradation(etatEntree, el.etat) });
  };

  /**
   * Renseigne d'un coup tous les éléments **encore vierges** d'une pièce.
   *
   * Dans un logement en bon état, la quasi-totalité des éléments partagent le
   * même état : on pose la valeur commune, puis on corrige les exceptions. Les
   * éléments déjà statués ne sont jamais réécrits - un raccourci ne doit pas
   * pouvoir effacer une observation faite sur place.
   */
  const renseignerRestants = (piece: PieceEDL, etat: EtatNote) => {
    const restants = piece.elements.filter((el) => el.etat === undefined && !el.manquant);
    if (restants.length === 0) return;
    maj({
      pieces: edl.pieces.map((p) =>
        p.id !== piece.id
          ? p
          : {
              ...p,
              elements: p.elements.map((el) =>
                el.etat !== undefined || el.manquant
                  ? el
                  : {
                      ...el,
                      etat,
                      ...(sortie ? { degradation: estDegradation(el.etatEntree, etat) } : {}),
                    },
              ),
            },
      ),
    });
    toast(
      'success',
      `${restants.length} élément(s) de « ${piece.nom} » renseigné(s) en « ${ETAT_LABELS[etat]} ». Corrigez les exceptions une par une.`,
    );
  };

  /**
   * Ajoute un élément à une pièce de l'EDL et le mémorise dans la fiche du
   * bien (piecesModele, par nom de pièce) pour les prochains états des lieux.
   */
  const ajouterElement = async (piece: PieceEDL) => {
    const nom = nouvelElement.trim();
    if (!nom) return;
    const categorie = nouvelleCategorie;
    const quantite = categorie === 'mobilier' ? 1 : undefined;
    const nouvel: ElementEDL = { id: uid(), nom, categorie, quantite, photoIds: [] };
    await db.edls.put({
      ...edl,
      pieces: edl.pieces.map((p) => (p.id === piece.id ? { ...p, elements: [...p.elements, nouvel] } : p)),
      updatedAt: nowISO(),
    });
    if (bien) {
      await db.biens.put({
        ...bien,
        piecesModele: bien.piecesModele.map((pm) =>
          pm.nom === piece.nom ? { ...pm, elements: [...pm.elements, { id: uid(), nom, categorie, quantite }] } : pm,
        ),
        updatedAt: nowISO(),
      });
    }
    setNouvelElement('');
    toast('success', `« ${nom} » ajouté à ${piece.nom} et à la fiche du logement.`);
  };

  const supprimerElement = (pieceId: string, elementId: string) => {
    maj({
      pieces: edl.pieces.map((p) =>
        p.id !== pieceId ? p : { ...p, elements: p.elements.filter((el) => el.id !== elementId) },
      ),
    });
  };

  /** EDL de sortie : marque un élément comme manquant/retiré (= dégradation), sans le supprimer. */
  const marquerManquant = (pieceId: string, el: ElementEDL) => {
    const manquant = !el.manquant;
    majElement(pieceId, el.id, {
      manquant,
      degradation: manquant ? true : estDegradation(el.etatEntree, el.etat),
    });
  };

  /** Ajoute une pièce à l'EDL et à la fiche du bien. */
  const ajouterPiece = async () => {
    const nom = nomNouvellePiece.trim();
    if (!nom) return;
    const ordre = edl.pieces.length ? Math.max(...edl.pieces.map((p) => p.ordre)) + 1 : 0;
    await db.edls.put({
      ...edl,
      pieces: [...edl.pieces, { id: uid(), nom, ordre, elements: [] }],
      updatedAt: nowISO(),
    });
    if (bien && !bien.piecesModele.some((pm) => pm.nom === nom)) {
      await db.biens.put({
        ...bien,
        piecesModele: [...bien.piecesModele, { id: uid(), nom, ordre, elements: [] }],
        updatedAt: nowISO(),
      });
    }
    setNomNouvellePiece('');
    setModalePiece(false);
    // Positionne l'onglet sur la nouvelle pièce (avant l'onglet « Infos »).
    setOngletIdx(2 + edl.pieces.length);
    toast('success', `Pièce « ${nom} » ajoutée.`);
  };

  /**
   * Rouvre un EDL signé pour rectification : la version signée est conservée
   * dans l'historique (et son PDF reste dans les Documents), le document
   * redevient modifiable et devra être re-signé par les deux parties.
   */
  const rectifier = async () => {
    if (!edl.signatures) return;
    await db.edls.put({
      ...edl,
      statut: 'brouillon',
      signatures: undefined,
      pdfHash: undefined,
      rectifications: [
        ...(edl.rectifications ?? []),
        { dateSignature: edl.signatures.dateSignature, pdfHash: edl.pdfHash },
      ],
      updatedAt: nowISO(),
    });
    setModaleRectifier(false);
    toast('warning', 'État des lieux rouvert pour rectification - à re-signer par les deux parties.');
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
              {edl.reference} - {sortie ? 'Sortie' : 'Entrée'}
            </div>
            {oublis.length > 0 && !signe ? (
              <button
                type="button"
                onClick={() => setModaleOublis(true)}
                className="text-xs font-medium text-amber-700 underline underline-offset-2"
              >
                {oublis.length} élément(s) non renseigné(s) - voir la liste
              </button>
            ) : (
              <div className="text-xs text-accent-500">
                {prog.renseignes}/{prog.total} éléments · sauvegarde automatique
              </div>
            )}
          </div>
          {signe ? (
            <Badge tone="green">
              <Lock size={12} /> Signé
            </Badge>
          ) : (
            <Button
              size="sm"
              onClick={() =>
                // Ne jamais bloquer : on montre ce qui manque, l'utilisateur tranche.
                oublis.length > 0 ? setModaleOublis(true) : navigate(`/edl/${edl.id}/signature`)
              }
            >
              <PenLine size={14} /> Signer
            </Button>
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
          {!signe && !sortie && (
            <button
              onClick={() => setModalePiece(true)}
              className="flex min-h-touch shrink-0 items-center gap-1 rounded-lg border border-dashed border-accent-300 px-3 py-1.5 text-sm font-medium text-accent-600"
            >
              <Plus size={14} /> Pièce
            </button>
          )}
        </nav>
      </header>

      {/*
       * Sortie établie sans état des lieux d'entrée : le rappeler en permanence,
       * et pas seulement à la création. Le constat reste valable, mais il ne
       * prouve pas de dégradation - c'est ce qui décide de la suite (retenue ou
       * restitution intégrale), donc cela ne doit pas se découvrir à la fin.
       */}
      {sansEtatEntree && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Aucun état des lieux d'entrée n'a été établi. Le logement est réputé avoir été reçu en bon
          état de réparations locatives (art. 1731 du code civil), sauf si vous avez été empêché de
          l'établir (art. 3-2 de la loi du 6 juillet 1989). Ce constat de sortie ne fonde à lui seul
          aucune retenue sur le dépôt de garantie.
        </div>
      )}
      {entreeAReporter && (
        <div className="mx-4 mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          État des lieux d'entrée établi hors application
          {edl.dateEdlEntreePapier && ` le ${format(new Date(edl.dateEdlEntreePapier), 'dd/MM/yyyy')}`}
          . Recopiez pour chaque élément l'état relevé à l'entrée : les dégradations se calculent
          ensuite comme d'habitude. Conservez l'exemplaire d'origine, c'est lui qui fait foi.
        </div>
      )}

      {signe && (
        <div className="mx-4 mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <p className="flex items-center gap-2 font-medium">
            <Lock size={14} /> Document signé le{' '}
            {edl.signatures && format(new Date(edl.signatures.dateSignature), "dd/MM/yyyy 'à' HH:mm:ss")} -
            verrouillé. Complément mineur : avenant daté. Modification substantielle : rectifier et
            faire re-signer les deux parties.
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
            <Button variant="secondary" size="sm" onClick={() => setModaleRectifier(true)}>
              <Pencil size={14} /> Rectifier (re-signature)
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

      {!signe && edl.rectifications && edl.rectifications.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="font-medium">Rectification en cours</span> - cet état des lieux doit être{' '}
          <strong>re-signé par les deux parties</strong>. La version signée le{' '}
          {format(new Date(edl.rectifications[edl.rectifications.length - 1].dateSignature), "dd/MM/yyyy 'à' HH:mm")}{' '}
          reste conservée dans les Documents ; la nouvelle version l'annulera et la remplacera.
        </div>
      )}

      {obligatoiresAbsents.length > 0 && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="font-medium">
            {obligatoiresAbsents.length} poste(s) obligatoire(s) du meublé (décret n°2015-981) à quantité 0 :
          </span>{' '}
          {obligatoiresAbsents.map((e) => e.nom).join(', ')}. Le logement ne répond alors plus à la
          définition du meublé.
        </div>
      )}

      <main className="mx-auto w-full max-w-3xl grow px-4 py-4">
        {onglet?.type === 'compteurs' && (
          <SectionCompteurs edl={edl} lectureSeule={signe} onMaj={majCompteurs} />
        )}
        {onglet?.type === 'cles' && (
          <SectionCles cles={edl.cles} lectureSeule={signe} onMaj={(cles) => maj({ cles })} />
        )}
        {onglet?.type === 'piece' && (
          <div className="space-y-3">
            {(() => {
              const piece = edl.pieces.find((p) => p.id === onglet.pieceId)!;
              const restants = piece.elements.filter((el) => el.etat === undefined && !el.manquant);
              if (signe || restants.length === 0) return null;
              return (
                <div className="rounded-xl border border-accent-200 bg-white p-3">
                  <p className="mb-2 text-sm font-medium text-accent-800">
                    Renseigner d'un coup les {restants.length} élément(s) restant(s) de « {piece.nom} »
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(Object.keys(ETAT_LABELS) as EtatNote[]).map((etat) => (
                      <button
                        key={etat}
                        type="button"
                        onClick={() => renseignerRestants(piece, etat)}
                        className="min-h-touch rounded-lg border-2 border-dashed border-accent-300 px-1 py-2 text-xs font-semibold text-accent-600 transition-all hover:border-accent-500 hover:bg-accent-50"
                      >
                        {ETAT_LABELS[etat]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-accent-500">
                    Les éléments déjà renseignés ne sont pas modifiés.
                  </p>
                </div>
              );
            })()}
            {edl.pieces
              .find((p) => p.id === onglet.pieceId)!
              .elements.map((el) => (
                <div key={el.id} className="rounded-xl border border-accent-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium text-accent-900">
                      {el.nom}
                      {el.manquant && <Badge tone="red">Manquant</Badge>}
                    </span>
                    <div className="flex items-center gap-2">
                      {!signe && sortie && (
                        <button
                          type="button"
                          onClick={() => marquerManquant(onglet.pieceId!, el)}
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
                          onClick={() => supprimerElement(onglet.pieceId!, el.id)}
                          className="text-accent-400 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  {/*
                    * État à l'entrée. Repris de l'EDL d'entrée quand il a été
                    * fait ici, **saisissable** quand il est à recopier d'un
                    * exemplaire papier : sans référence d'entrée, une sortie ne
                    * fonde aucune retenue.
                    */}
                  {sortie && entreeAReporter && (
                    <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                      <span className="text-sm font-medium text-sky-900">
                        État à l'entrée - à recopier de l'état des lieux papier :
                      </span>
                      <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                        {(Object.keys(ETAT_LABELS) as EtatNote[]).map((etat) => {
                          const actif = el.etatEntree === etat;
                          return (
                            <button
                              key={etat}
                              type="button"
                              disabled={signe}
                              onClick={() => choisirEtatEntree(onglet.pieceId!, el, etat)}
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
                      <span className="text-sm font-medium text-accent-600">État à l'entrée :</span>
                      <span className={`rounded px-2.5 py-1 text-sm font-bold uppercase tracking-wide text-white ${COULEURS_ETAT[el.etatEntree]}`}>
                        {ETAT_LABELS[el.etatEntree]}
                      </span>
                      {el.commentaireEntree && <span className="text-sm text-accent-500">- {el.commentaireEntree}</span>}
                    </div>
                  )}
                  {el.manquant ? (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                      Élément présent à l'entrée et manquant/retiré à la sortie - noté comme dégradation.
                    </p>
                  ) : (
                  <>
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
                  {(el.categorie === 'mobilier' || el.obligatoireDecret) && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm text-accent-600">Quantité :</span>
                      <button
                        type="button"
                        disabled={signe}
                        aria-label="Diminuer la quantité"
                        onClick={() => majElement(onglet.pieceId!, el.id, { quantite: Math.max(0, (el.quantite ?? 1) - 1) })}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-300 text-lg font-semibold text-accent-700 disabled:opacity-50"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-semibold text-accent-900">{el.quantite ?? 1}</span>
                      <button
                        type="button"
                        disabled={signe}
                        aria-label="Augmenter la quantité"
                        onClick={() => majElement(onglet.pieceId!, el.id, { quantite: (el.quantite ?? 1) + 1 })}
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
                        onChange={(e) => majElement(onglet.pieceId!, el.id, { degradation: e.target.checked })}
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
                      disabled={signe}
                      onBlur={(e) =>
                        majElement(onglet.pieceId!, el.id, { commentaire: e.target.value || undefined })
                      }
                      className="flex-1"
                    />
                    {sortie && (
                      <VignetteEntree
                        photoIds={el.photoIdsEntree ?? []}
                        onOuvrir={() =>
                          setVisionneuse({
                            titre: `${onglet.nom} - ${el.nom}`,
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
                        edlId={edl.id}
                        legende={`${onglet.nom} - ${el.nom}`}
                        photoIds={el.photoIds}
                        lectureSeule={signe}
                        onChange={(photoIds) => majElement(onglet.pieceId!, el.id, { photoIds })}
                        onAgrandir={
                          el.photoIds.length
                            ? () =>
                                setVisionneuse({
                                  titre: `${onglet.nom} - ${el.nom}`,
                                  groupes: sortie
                                    ? [
                                        { libelle: 'Entrée', photoIds: el.photoIdsEntree ?? [] },
                                        { libelle: 'Sortie', photoIds: el.photoIds },
                                      ]
                                    : [{ libelle: 'Photos', photoIds: el.photoIds }],
                                  initial: sortie ? 1 : 0,
                                })
                            : undefined
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            {!signe && !sortie && (
              <div className="rounded-xl border-2 border-dashed border-accent-300 bg-white p-4">
                <p className="mb-2 text-sm font-medium text-accent-800">
                  Ajouter un élément à « {onglet.nom} »
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={nouvelElement}
                    onChange={(e) => setNouvelElement(e.target.value)}
                    placeholder="Ex. Table basse, Radiateur, Rideaux…"
                    className="flex-1"
                  />
                  <Select
                    value={nouvelleCategorie}
                    onChange={(e) => setNouvelleCategorie(e.target.value as CategorieElement)}
                    className="sm:w-44"
                    aria-label="Catégorie de l'élément"
                  >
                    {Object.entries(CATEGORIE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                  <Button
                    onClick={() => {
                      const p = edl.pieces.find((x) => x.id === onglet.pieceId);
                      if (p) void ajouterElement(p);
                    }}
                    disabled={!nouvelElement.trim()}
                  >
                    <Plus size={16} /> Ajouter
                  </Button>
                </div>
                <p className="mt-1 text-xs text-accent-500">
                  L'élément est aussi ajouté à la fiche du logement (réutilisé aux prochains états des lieux).
                </p>
              </div>
            )}
          </div>
        )}
        {onglet?.type === 'infos' && (
          <div className="space-y-4 rounded-xl border border-accent-200 bg-white p-4">
            <Field label="Date de l'état des lieux">
              <DateInput
                value={format(new Date(edl.date), 'yyyy-MM-dd')}
                disabled={signe}
                onChange={(date) => {
                  // Midi local : évite tout décalage de jour à la conversion UTC.
                  if (date) maj({ date: new Date(`${date}T12:00:00`).toISOString() });
                }}
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
            {/*
             * Faute de bail enregistré, c'est l'état des lieux qui porte le
             * montant du dépôt. Il reste rattrapable après signature depuis la
             * synthèse : il ne fait pas partie du constat, seulement du
             * décompte de restitution.
             */}
            {!bail && (
              <Field
                label="Dépôt de garantie (€)"
                hint="Sert au décompte des retenues et à la lettre de restitution. Renseigné ici faute de bail enregistré."
              >
                <Input
                  key={`${edl.id}-depot`}
                  type="number"
                  min="0"
                  step="10"
                  disabled={signe}
                  defaultValue={edl.depotGarantie ?? ''}
                  onBlur={(e) =>
                    maj({ depotGarantie: e.target.value === '' ? undefined : Number(e.target.value) })
                  }
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
            <div>
              <span className="mb-1 block text-sm font-medium text-accent-800">
                Photos (vue d'ensemble du logement)
              </span>
              <PhotoCapture
                edlId={edl.id}
                legende="Observations générales"
                photoIds={edl.photoIds ?? []}
                lectureSeule={signe}
                onChange={(photoIds) => maj({ photoIds })}
              />
            </div>
            {/*
             * Rattachement d'un bail après coup. Autorisé même sur un état des
             * lieux signé : c'est un lien de classement, pas une rectification -
             * le PDF archivé et son empreinte ne sont pas régénérés, le document
             * signé reste celui qui fait foi. Ne pas rattacher de bail est un
             * usage normal, d'où une proposition et non une alerte.
             */}
            {!bail && (
              <Field
                label="Rattacher à un bail"
                hint="Facultatif. Seuls les baux du même logement sont proposés."
              >
                {(bauxDuBien ?? []).length === 0 ? (
                  <p className="text-sm text-accent-600">
                    Aucun bail enregistré pour ce logement.{' '}
                    <Link
                      to={`/baux/nouveau?bien=${edl.bienId}`}
                      className="underline underline-offset-2"
                    >
                      Rédiger le bail
                    </Link>
                    .
                  </p>
                ) : (
                  <Select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) void rattacherBail(e.target.value);
                    }}
                  >
                    <option value="">-</option>
                    {(bauxDuBien ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.reference} - effet {format(new Date(b.dateEffet), 'dd/MM/yyyy')}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
            {edl.avenants.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold text-accent-900">Avenants</h3>
                <ul className="space-y-1 text-sm text-accent-700">
                  {edl.avenants.map((a, i) => (
                    <li key={i}>
                      {format(new Date(a.date), 'dd/MM/yyyy')} - {a.texte}
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

      {visionneuse && (
        <VisionneusePhotos
          titre={visionneuse.titre}
          groupes={visionneuse.groupes}
          groupeInitial={visionneuse.initial}
          onClose={() => setVisionneuse(null)}
        />
      )}

      <Modal
        open={modaleOublis}
        onClose={() => setModaleOublis(false)}
        title={`${oublis.length} élément(s) sans état renseigné`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModaleOublis(false)}>
              Continuer la saisie
            </Button>
            <Button onClick={() => navigate(`/edl/${edl.id}/signature`)}>
              Signer quand même
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-accent-700">
            Un élément sans état ne prouve rien à la sortie : il ne pourra pas servir de point de
            comparaison. Touchez une ligne pour aller directement à sa pièce.
          </p>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {oublis.map((o) => (
              <li key={o.elementId}>
                <button
                  type="button"
                  onClick={() => allerALaPiece(o.pieceId)}
                  className="flex min-h-touch w-full items-center justify-between gap-3 rounded-lg border border-accent-200 px-3 py-2 text-left text-sm hover:bg-accent-50"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-accent-900">{o.elementNom}</span>
                    <span className="block text-xs text-accent-500">{o.pieceNom}</span>
                  </span>
                  <ArrowRight size={16} className="shrink-0 text-accent-400" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-accent-500">
            Dans chaque pièce, « Renseigner d'un coup les éléments restants » pose l'état commun,
            puis vous corrigez les exceptions.
          </p>
        </div>
      </Modal>

      <Modal
        open={modaleRectifier}
        onClose={() => setModaleRectifier(false)}
        title="Rectifier l'état des lieux"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModaleRectifier(false)}>
              Annuler
            </Button>
            <Button onClick={() => void rectifier()}>Rouvrir pour rectification</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-accent-700">
          <p>
            La rectification d'un état des lieux signé n'est possible qu'avec{' '}
            <strong>l'accord et la re-signature des deux parties</strong> (document contradictoire).
          </p>
          {edl.signatures && (
            <div className="rounded-lg bg-accent-50 p-3">
              <p className="font-medium text-accent-800">Version signée actuelle (conservée) :</p>
              <p className="text-xs">
                Signée le {format(new Date(edl.signatures.dateSignature), "dd/MM/yyyy 'à' HH:mm:ss")}
                {edl.pdfHash ? ` - empreinte ${edl.pdfHash.slice(0, 16)}…` : ''}.
              </p>
            </div>
          )}
          <p>
            Le document va redevenir <strong>modifiable</strong>. Une fois re-signée, la nouvelle
            version <strong>annulera et remplacera</strong> la précédente ; l'original signé reste
            conservé dans les Documents.
          </p>
        </div>
      </Modal>

      <Modal
        open={modalePiece}
        onClose={() => setModalePiece(false)}
        title="Ajouter une pièce"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalePiece(false)}>
              Annuler
            </Button>
            <Button onClick={() => void ajouterPiece()} disabled={!nomNouvellePiece.trim()}>
              Ajouter la pièce
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nom de la pièce" required>
            <Input
              value={nomNouvellePiece}
              onChange={(e) => setNomNouvellePiece(e.target.value)}
              placeholder="Ex. Chambre 2, Buanderie, Balcon…"
            />
          </Field>
          <p className="text-xs text-accent-500">
            La pièce est aussi ajoutée à la fiche du logement. Vous pourrez y ajouter ses éléments juste après.
          </p>
        </div>
      </Modal>

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
              placeholder="Ex. : Complément demandé par le locataire - rayure constatée sur le parquet du séjour…"
            />
          </Field>
          <p className="text-xs text-accent-500">L'avenant est daté automatiquement et apparaîtra sur le PDF.</p>
        </div>
      </Modal>
    </div>
  );
}
