import { useState } from 'react';
import { addMonths, format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import type { Diagnostic, TypeDiagnostic } from '@/types';
import { VALIDITE_DIAGNOSTICS } from '@/lib/defauts';
import { uid } from '@/lib/ids';
import { Badge, Button, Field, Input, Select } from '@/components/ui';
import { VALIDITE_LABELS, validiteDiagnostic } from './diagnostics';

export function DiagnosticsEditeur({
  diagnostics,
  onChange,
}: {
  diagnostics: Diagnostic[];
  onChange: (diagnostics: Diagnostic[]) => void;
}) {
  const [type, setType] = useState<TypeDiagnostic>('dpe');
  const [dateRealisation, setDateRealisation] = useState(format(new Date(), 'yyyy-MM-dd'));

  const ajouter = () => {
    const info = VALIDITE_DIAGNOSTICS[type];
    const diag: Diagnostic = {
      id: uid(),
      type,
      libelle: info.libelle,
      dateRealisation,
      dateExpiration: info.dureeMois
        ? format(addMonths(new Date(dateRealisation), info.dureeMois), 'yyyy-MM-dd')
        : undefined,
    };
    onChange([...diagnostics, diag]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Type de diagnostic">
          <Select value={type} onChange={(e) => setType(e.target.value as TypeDiagnostic)}>
            {Object.entries(VALIDITE_DIAGNOSTICS).map(([v, info]) => (
              <option key={v} value={v}>
                {info.libelle}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date de réalisation">
          <Input type="date" value={dateRealisation} onChange={(e) => setDateRealisation(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={ajouter}>
          <Plus size={16} /> Ajouter
        </Button>
      </div>
      {diagnostics.length === 0 ? (
        <p className="text-sm text-accent-500">
          Aucun diagnostic enregistré. Le dossier de diagnostic technique (DDT) est une annexe
          obligatoire du bail : DPE, ERP, CREP (bâti avant 1949), électricité/gaz (installation
          de plus de 15 ans), surface loi Boutin.
        </p>
      ) : (
        <ul className="divide-y divide-accent-100 rounded-lg border border-accent-200 bg-white">
          {diagnostics.map((d) => {
            const validite = validiteDiagnostic(d);
            const { label, tone } = VALIDITE_LABELS[validite];
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="grow">
                  <div className="text-sm font-medium text-accent-900">{d.libelle}</div>
                  <div className="text-xs text-accent-500">
                    Réalisé le {format(new Date(d.dateRealisation), 'dd/MM/yyyy')}
                    {d.dateExpiration &&
                      ` — expire le ${format(new Date(d.dateExpiration), 'dd/MM/yyyy')}`}
                  </div>
                </div>
                <Badge tone={tone}>{label}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Supprimer"
                  onClick={() => onChange(diagnostics.filter((x) => x.id !== d.id))}
                >
                  <Trash2 size={16} className="text-red-600" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
