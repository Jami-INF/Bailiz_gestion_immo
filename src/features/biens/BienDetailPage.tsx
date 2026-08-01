import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Pencil, Trash2, FileText, Plus, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { db } from '@/lib/db';
import { urlExterneSure } from '@/lib/liens';
import { formatAdresse } from '@/lib/adresse';
import { Badge, Button, Card, ConfirmModal, PageHeader, useToast } from '@/components/ui';
import { PERIODE_CONSTRUCTION_LABELS, TYPE_BAIL_LABELS } from '@/types';

export function BienDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmSuppr, setConfirmSuppr] = useState(false);
  const bien = useLiveQuery(() => (id ? db.biens.get(id) : undefined), [id]);
  const baux = useLiveQuery(() => (id ? db.baux.where('bienId').equals(id).toArray() : []), [id]);

  if (!bien) return null;

  const bailEnCours = baux?.find((b) => ['signe', 'actif'].includes(b.statut));
  // Lien saisi librement : filtré avant d'être rendu cliquable (cf. QR code du bail).
  const lienDossierTechnique = urlExterneSure(bien.dossierTechniqueUrl);

  const supprimer = async () => {
    if (baux && baux.length > 0) {
      toast('error', 'Impossible de supprimer : des baux sont liés à ce bien.');
      return;
    }
    await db.biens.delete(bien.id);
    toast('success', 'Bien supprimé.');
    navigate('/biens');
  };

  return (
    <div>
      <PageHeader
        titre={bien.nom}
        sousTitre={formatAdresse(bien.adresse)}
        actions={
          <>
            <Link to={`/biens/${bien.id}/modifier`}>
              <Button variant="secondary">
                <Pencil size={16} /> Modifier
              </Button>
            </Link>
            <Button variant="danger" onClick={() => setConfirmSuppr(true)}>
              <Trash2 size={16} /> Supprimer
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-accent-900">Caractéristiques</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-accent-500">Type</dt>
            <dd>{bien.type}</dd>
            <dt className="text-accent-500">Surface loi Boutin</dt>
            <dd>{bien.surfaceBoutin} m²</dd>
            <dt className="text-accent-500">Pièces principales</dt>
            <dd>{bien.nbPieces}</dd>
            <dt className="text-accent-500">Régime</dt>
            <dd>{bien.regimeJuridique === 'copropriete' ? 'Copropriété' : 'Monopropriété'}</dd>
            <dt className="text-accent-500">Habitat</dt>
            <dd>{bien.typeHabitat === 'individuel' ? 'Individuel' : 'Collectif'}</dd>
            <dt className="text-accent-500">Construction</dt>
            <dd>{bien.periodeConstruction ? PERIODE_CONSTRUCTION_LABELS[bien.periodeConstruction] : '—'}</dd>
            <dt className="text-accent-500">Classe DPE</dt>
            <dd>{bien.classeDPE ?? '—'}</dd>
            <dt className="text-accent-500">Identifiant fiscal</dt>
            <dd>{bien.identifiantFiscal ?? '—'}</dd>
            <dt className="text-accent-500">Chauffage</dt>
            <dd>
              {bien.chauffage.type} ({bien.chauffage.energie})
            </dd>
            <dt className="text-accent-500">Eau chaude</dt>
            <dd>
              {bien.eauChaude.type === 'individuel' ? 'individuelle' : 'collective'} ({bien.eauChaude.energie})
            </dd>
            {bien.zoneEncadrementLoyers && (
              <>
                <dt className="text-accent-500">Encadrement des loyers</dt>
                <dd>
                  Référence majorée : {bien.loyerReferenceMajore ?? '—'} €
                </dd>
              </>
            )}
          </dl>
          {bien.annexes.length > 0 && (
            <p className="mt-3 text-sm text-accent-600">
              Annexes : {bien.annexes.map((a) => `${a.type} (${a.description})`).join(', ')}
            </p>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-accent-900">Dossier technique</h2>
            <Badge tone={bien.classeDPE ? 'green' : 'neutral'}>
              {bien.classeDPE ? `DPE ${bien.classeDPE}` : 'DPE non renseigné'}
            </Badge>
          </div>
          {lienDossierTechnique ? (
            <a
              href={lienDossierTechnique}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-800 underline"
            >
              Ouvrir le dossier technique <ExternalLink size={14} />
            </a>
          ) : bien.dossierTechniqueUrl ? (
            <p className="text-sm text-red-600">
              Le lien enregistré n'est pas une adresse web valide (seuls http et https sont acceptés).
              Corrigez-le via « Modifier » : il est aussi imprimé en QR code sur le bail.
            </p>
          ) : (
            <p className="text-sm text-accent-500">
              Aucun lien de dossier technique (DPE, ERP, CREP, élec/gaz…). Ajoutez-le via « Modifier ».
            </p>
          )}
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-accent-900">Baux</h2>
            <Link to="/baux/nouveau" state={{ bienId: bien.id }}>
              <Button variant="secondary" size="sm">
                <Plus size={14} /> Nouveau bail
              </Button>
            </Link>
          </div>
          {!baux || baux.length === 0 ? (
            <p className="text-sm text-accent-500">Aucun bail pour ce bien.</p>
          ) : (
            <ul className="space-y-2">
              {baux.map((b) => (
                <li key={b.id}>
                  <Link
                    to={`/baux/${b.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-accent-200 px-3 py-2 text-sm hover:bg-accent-50"
                  >
                    <span className="flex items-center gap-2">
                      <FileText size={15} className="text-accent-400" />
                      {b.reference} — {TYPE_BAIL_LABELS[b.typeBail]}
                    </span>
                    <Badge tone={b.statut === 'actif' || b.statut === 'signe' ? 'green' : 'neutral'}>
                      {b.statut}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {bailEnCours && (
            <p className="mt-3 text-xs text-accent-500">
              Bail en cours depuis le{' '}
              {format(new Date(bailEnCours.dateEffet), 'd MMMM yyyy', { locale: fr })}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-accent-900">Structure des pièces</h2>
          {bien.piecesModele.length === 0 ? (
            <p className="text-sm text-accent-500">
              Aucune pièce définie. Configurez la structure via « Modifier » : elle servira de
              trame aux états des lieux.
            </p>
          ) : (
            <ul className="space-y-1 text-sm text-accent-700">
              {[...bien.piecesModele]
                .sort((a, b) => a.ordre - b.ordre)
                .map((p) => (
                  <li key={p.id}>
                    <span className="font-medium">{p.nom}</span>{' '}
                    <span className="text-accent-500">({p.elements.length} éléments)</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmModal
        open={confirmSuppr}
        onClose={() => setConfirmSuppr(false)}
        onConfirm={supprimer}
        title="Supprimer ce bien ?"
        message={`« ${bien.nom} » sera définitivement supprimé. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
}
