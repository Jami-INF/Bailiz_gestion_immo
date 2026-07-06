import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Download, Pencil, PenLine, Plus, Trash2 } from 'lucide-react';
import { db, getParametres } from '@/lib/db';
import { nowISO } from '@/lib/ids';
import type { Bail, Bien, EtatNote, Inventaire, Locataire, SignatureBloc } from '@/types';
import { ETAT_LABELS } from '@/types';
import { rendrePdf, rendrePdfAvecHash, enregistrerDocument, telechargerDocument } from '@/lib/pdf/generer';
import { InventairePdf } from '@/lib/pdf/InventairePdf';
import { SignatureFlow } from '@/components/SignatureFlow';
import { pousserSiActive } from '@/lib/autosave';
import { Badge, Button, Card, Input, Modal, Select, useToast } from '@/components/ui';

export function InventairePanel({
  bail,
  bien,
  locataires,
}: {
  bail: Bail;
  bien: Bien;
  locataires: Locataire[];
}) {
  const toast = useToast();
  const inventaire = useLiveQuery(
    () => (bail.inventaireId ? db.inventaires.get(bail.inventaireId) : undefined),
    [bail.inventaireId],
  );
  const [edition, setEdition] = useState(false);
  const [signature, setSignature] = useState(false);

  if (!inventaire) return null;

  const signe = inventaire.statut === 'signe';
  const obligatoiresAbsents = inventaire.lignes.filter((l) => l.obligatoireDecret && l.quantite === 0);

  const majLignes = (lignes: Inventaire['lignes']) =>
    db.inventaires.put({ ...inventaire, lignes, updatedAt: nowISO() });

  const regenererPdf = async () => {
    const blob = await rendrePdf(
      <InventairePdf inventaire={inventaire} bail={bail} bien={bien} locataires={locataires} />,
    );
    await enregistrerDocument({
      reference: inventaire.reference,
      type: 'inventaire',
      titre: `Inventaire du mobilier — ${bien.nom}`,
      blob,
      bienId: bien.id,
      bailId: bail.id,
    });
    telechargerDocument({ blob, reference: inventaire.reference });
    toast('success', 'PDF de l’inventaire régénéré.');
  };

  const telecharger = async () => {
    const doc = await db.documents.where('reference').equals(inventaire.reference).last();
    if (doc) telechargerDocument(doc);
    else await regenererPdf();
  };

  const signer = async (bloc: SignatureBloc) => {
    const signeInv: Inventaire = { ...inventaire, signatures: bloc, statut: 'signe', updatedAt: nowISO() };
    const { blob, hash } = await rendrePdfAvecHash((h) => (
      <InventairePdf inventaire={signeInv} bail={bail} bien={bien} locataires={locataires} hash={h} />
    ));
    signeInv.pdfHash = hash;
    await db.inventaires.put(signeInv);
    await enregistrerDocument({
      reference: inventaire.reference,
      type: 'inventaire',
      titre: `Inventaire du mobilier — ${bien.nom} (signé)`,
      blob,
      hash,
      signe: true,
      bienId: bien.id,
      bailId: bail.id,
    });
    telechargerDocument({ blob, reference: inventaire.reference });
    setSignature(false);
    toast('success', `Inventaire signé et verrouillé. Empreinte SHA-256 : ${hash.slice(0, 16)}…`);
    void pousserSiActive(true).then((r) => {
      if (r === 'ok') toast('success', 'Sauvegarde automatique poussée dans le dossier synchronisé.');
    });
  };

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-accent-900">
          Inventaire du mobilier <span className="text-sm font-normal text-accent-500">({inventaire.reference})</span>
        </h2>
        <Badge tone={signe ? 'green' : 'neutral'}>{signe ? 'Signé — verrouillé' : 'Brouillon'}</Badge>
      </div>
      {obligatoiresAbsents.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {obligatoiresAbsents.length} élément(s) obligatoire(s) du décret n°2015-981 sont marqués
          absents : {obligatoiresAbsents.map((l) => l.designation).join(', ')}. Le logement ne
          répond alors plus à la définition du meublé.
        </p>
      )}
      <p className="text-sm text-accent-600">
        {inventaire.lignes.length} lignes, dont {inventaire.lignes.filter((l) => l.obligatoireDecret).length}{' '}
        postes obligatoires du décret n°2015-981.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!signe && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setEdition(true)}>
              <Pencil size={14} /> Modifier les lignes
            </Button>
            <Button size="sm" onClick={() => setSignature(true)}>
              <PenLine size={14} /> Signer sur écran
            </Button>
          </>
        )}
        <Button variant="secondary" size="sm" onClick={telecharger}>
          <Download size={14} /> Télécharger le PDF
        </Button>
        {!signe && (
          <Button variant="ghost" size="sm" onClick={regenererPdf}>
            Régénérer le PDF
          </Button>
        )}
      </div>

      <Modal open={edition} onClose={() => setEdition(false)} title="Inventaire du mobilier" wide>
        <div className="space-y-2">
          {inventaire.lignes.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-accent-100 p-2">
              <Input
                className="min-w-32 flex-1"
                value={l.designation}
                disabled={l.obligatoireDecret}
                onChange={(e) =>
                  majLignes(inventaire.lignes.map((x, j) => (j === i ? { ...x, designation: e.target.value } : x)))
                }
              />
              <Input
                type="number"
                min={0}
                className="w-20"
                value={l.quantite}
                aria-label="Quantité"
                onChange={(e) =>
                  majLignes(inventaire.lignes.map((x, j) => (j === i ? { ...x, quantite: Number(e.target.value) } : x)))
                }
              />
              <Select
                className="w-32"
                value={l.etat}
                aria-label="État"
                onChange={(e) =>
                  majLignes(inventaire.lignes.map((x, j) => (j === i ? { ...x, etat: e.target.value as EtatNote } : x)))
                }
              >
                {Object.entries(ETAT_LABELS).map(([v, lab]) => (
                  <option key={v} value={v}>
                    {lab}
                  </option>
                ))}
              </Select>
              <Input
                className="min-w-32 flex-1"
                placeholder="Commentaire"
                value={l.commentaire ?? ''}
                onChange={(e) =>
                  majLignes(inventaire.lignes.map((x, j) => (j === i ? { ...x, commentaire: e.target.value } : x)))
                }
              />
              {l.obligatoireDecret ? (
                <Badge tone="blue">Décret</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Supprimer"
                  onClick={() => majLignes(inventaire.lignes.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} className="text-red-600" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              majLignes([
                ...inventaire.lignes,
                { pieceNom: 'Logement', designation: 'Nouvel élément', quantite: 1, etat: 'bon' },
              ])
            }
          >
            <Plus size={14} /> Ajouter une ligne
          </Button>
          <p className="text-xs text-accent-500">
            Les 11 postes du décret ne peuvent pas être supprimés ; indiquez une quantité de 0
            s'ils sont absents (une alerte sera affichée).
          </p>
        </div>
      </Modal>

      <Modal open={signature} onClose={() => setSignature(false)} title="Signature de l'inventaire" wide>
        <SignatureFlowInventaire inventaire={inventaire} locataires={locataires} onSigne={signer} />
      </Modal>
    </Card>
  );
}

function SignatureFlowInventaire({
  inventaire,
  locataires,
  onSigne,
}: {
  inventaire: Inventaire;
  locataires: Locataire[];
  onSigne: (b: SignatureBloc) => void;
}) {
  const parametres = useLiveQuery(() => getParametres());
  if (!parametres) return null;
  return (
    <SignatureFlow
      libelleDocument={`Inventaire du mobilier ${inventaire.reference}`}
      bailleurNom={`${parametres.bailleur.prenom} ${parametres.bailleur.nom}`.trim()}
      locatairesNoms={locataires.map((l) => `${l.prenom} ${l.nom}`)}
      onTermine={onSigne}
      recapitulatif={
        <ul className="space-y-1 text-sm">
          {inventaire.lignes.map((l, i) => (
            <li key={i}>
              <span className="font-medium">{l.designation}</span> — quantité {l.quantite},{' '}
              {l.quantite === 0 ? 'absent' : ETAT_LABELS[l.etat]}
              {l.commentaire ? ` (${l.commentaire})` : ''}
            </li>
          ))}
        </ul>
      }
    />
  );
}
