import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { Download, FolderOpen, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db';
import type { TypeDocument } from '@/types';
import { TYPE_DOCUMENT_LABELS } from '@/types';
import { telechargerDocument } from '@/lib/pdf/generer';
import { Badge, Card, EmptyState, Field, PageHeader, Select } from '@/components/ui';

export function DocumentsPage() {
  const documents = useLiveQuery(() => db.documents.orderBy('createdAt').reverse().toArray());
  const biens = useLiveQuery(() => db.biens.toArray());
  const baux = useLiveQuery(() => db.baux.toArray());
  const [filtreBien, setFiltreBien] = useState('');
  const [filtreType, setFiltreType] = useState('');
  const [filtreBail, setFiltreBail] = useState('');

  if (!documents) return null;

  const filtres = documents.filter(
    (d) =>
      (!filtreBien || d.bienId === filtreBien) &&
      (!filtreType || d.type === filtreType) &&
      (!filtreBail || d.bailId === filtreBail),
  );

  return (
    <div>
      <PageHeader
        titre="Documents"
        sousTitre="Tous les PDF générés. Les documents signés portent leur empreinte SHA-256 ; les autres restent régénérables depuis leur fiche."
      />
      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Bien">
            <Select value={filtreBien} onChange={(e) => setFiltreBien(e.target.value)}>
              <option value="">Tous</option>
              {biens?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nom}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bail">
            <Select value={filtreBail} onChange={(e) => setFiltreBail(e.target.value)}>
              <option value="">Tous</option>
              {baux?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.reference}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type de document">
            <Select value={filtreType} onChange={(e) => setFiltreType(e.target.value)}>
              <option value="">Tous</option>
              {(Object.keys(TYPE_DOCUMENT_LABELS) as TypeDocument[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_DOCUMENT_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {filtres.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          titre="Aucun document"
          message="Les PDF générés (baux, inventaires, états des lieux, courriers) apparaîtront ici."
        />
      ) : (
        <div className="space-y-2">
          {filtres.map((d) => (
            <Card key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 break-words font-medium text-accent-900">
                  <span className="break-words">
                    {d.reference} - {d.titre}
                  </span>
                  {d.signe && (
                    <Badge tone="green">
                      <ShieldCheck size={12} /> Signé
                    </Badge>
                  )}
                </div>
                <div className="break-words text-xs text-accent-500">
                  {TYPE_DOCUMENT_LABELS[d.type]} · généré le{' '}
                  {format(new Date(d.createdAt), 'dd/MM/yyyy à HH:mm')}
                  {d.hash && ` · SHA-256 : ${d.hash.slice(0, 16)}…`}
                </div>
              </div>
              <button
                onClick={() => telechargerDocument(d)}
                className="flex min-h-touch items-center gap-1 rounded-lg px-3 text-sm font-medium text-accent-700 hover:bg-accent-100"
              >
                <Download size={16} /> Télécharger
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
