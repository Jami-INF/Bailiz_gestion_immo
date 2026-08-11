import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { addMonths, addYears, differenceInDays, format, isAfter } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  ClipboardList,
  HardDriveDownload,
  Plus,
} from 'lucide-react';
import { db } from '@/lib/db';
import { estBailEnCours } from '@/lib/bail';
import { dateLimiteRestitution, formatOctets } from '@/lib/calculs';
import { sauvegardeAncienne } from '@/lib/backup';
import { useQuotaStockage } from '@/hooks/useStatuts';
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';

interface Alerte {
  cle: string;
  niveau: 'red' | 'orange';
  texte: string;
  lien: string;
}

export function TableauDeBordPage() {
  const biens = useLiveQuery(() => db.biens.orderBy('nom').toArray());
  const baux = useLiveQuery(() => db.baux.toArray());
  const edls = useLiveQuery(() => db.edls.toArray());
  const parametres = useLiveQuery(() => db.parametres.get('singleton'));
  const quota = useQuotaStockage();

  if (!biens || !baux || !edls) return null;

  const alertes: Alerte[] = [];

  // EDL d'entrée signé sans bail signé
  for (const edl of edls.filter((e) => e.type === 'entree' && e.statut === 'signe')) {
    const bail = baux.find((b) => b.id === edl.bailId);
    if (bail && ['brouillon', 'genere'].includes(bail.statut)) {
      alertes.push({
        cle: `edl-sans-bail-${edl.id}`,
        niveau: 'orange',
        texte: `${bail.reference} : EDL d'entrée signé mais bail non signé`,
        lien: `/baux/${bail.id}`,
      });
    }
  }

  // Dépôt de garantie à restituer après un EDL de sortie signé
  for (const edl of edls.filter((e) => e.type === 'sortie' && e.statut === 'signe' && e.signatures)) {
    const bail = baux.find((b) => b.id === edl.bailId);
    if (!bail || bail.depotGarantie <= 0) continue;
    const aDegradations = edl.pieces.some((p) => p.elements.some((el) => el.degradation));
    // Même règle que la synthèse de l'EDL et que la lettre de restitution : un
    // seul calcul du délai légal, pour qu'aucun écran n'annonce une autre date.
    const limite = dateLimiteRestitution(new Date(edl.signatures!.dateSignature), aDegradations);
    const restants = differenceInDays(limite, new Date());
    if (restants >= 0 && restants <= 45) {
      alertes.push({
        cle: `depot-${edl.id}`,
        niveau: restants <= 7 ? 'red' : 'orange',
        texte: `${bail.reference} : dépôt de garantie à restituer avant le ${format(limite, 'dd/MM/yyyy')} (${restants} j restants)`,
        lien: `/edl/${edl.id}/synthese`,
      });
    }
  }

  // Stockage proche de la saturation : prévenir avant que l'écriture échoue.
  if (quota?.critique) {
    alertes.push({
      cle: 'quota',
      niveau: quota.pct >= 95 ? 'red' : 'orange',
      texte: `Stockage du navigateur occupé à ${quota.pct} % (${formatOctets(quota.utilise)}) — exportez et faites de la place avant le prochain état des lieux`,
      lien: '/parametres',
    });
  }

  // Sauvegarde ancienne
  if (parametres && sauvegardeAncienne(parametres.derniereSauvegarde)) {
    alertes.push({
      cle: 'sauvegarde',
      niveau: 'orange',
      texte: parametres.derniereSauvegarde
        ? `Dernière sauvegarde le ${format(new Date(parametres.derniereSauvegarde), 'dd/MM/yyyy')} — pensez à exporter vos données`
        : 'Aucune sauvegarde effectuée — exportez vos données depuis les Paramètres',
      lien: '/parametres',
    });
  }

  // Échéancier : fins de bail et anniversaires de révision IRL
  const echeances: { date: Date; texte: string; lien: string }[] = [];
  for (const bail of baux.filter(estBailEnCours)) {
    const bien = biens.find((x) => x.id === bail.bienId);
    const fin = addMonths(new Date(bail.dateEffet), bail.dureeMois);
    echeances.push({
      date: fin,
      texte: `Fin de bail ${bail.reference} (${bien?.nom ?? '?'})`,
      lien: `/baux/${bail.id}`,
    });
    if (bail.revisionIRL.revisable) {
      let anniversaire = addYears(new Date(bail.dateEffet), 1);
      while (!isAfter(anniversaire, new Date()) ) anniversaire = addYears(anniversaire, 1);
      if (isAfter(fin, anniversaire)) {
        echeances.push({
          date: anniversaire,
          texte: `Révision IRL ${bail.reference} (${bien?.nom ?? '?'})`,
          lien: `/baux/${bail.id}`,
        });
      }
    }
  }
  echeances.sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div>
      <PageHeader
        titre="Tableau de bord"
        actions={
          <Link to="/biens/nouveau">
            <Button variant="secondary">
              <Plus size={16} /> Nouveau bien
            </Button>
          </Link>
        }
      />

      {biens.length === 0 ? (
        <EmptyState
          icon={Building2}
          titre="Créez votre premier bien pour commencer"
          message="Bailiz vous accompagne de l'entrée à la sortie du locataire : bail meublé conforme, inventaire, états des lieux comparatifs, le tout 100 % hors-ligne sur cet appareil."
          action={
            <Link to="/biens/nouveau">
              <Button>
                <Plus size={16} /> Créer un bien
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-accent-900">
              <Building2 size={18} /> Mes biens
            </h2>
            <ul className="space-y-2">
              {biens.map((bien) => {
                const bail = baux.find((b) => b.bienId === bien.id && estBailEnCours(b));
                return (
                  <li key={bien.id}>
                    <Link
                      to={`/biens/${bien.id}`}
                      className="flex items-center justify-between rounded-lg border border-accent-200 px-3 py-2 text-sm hover:bg-accent-50"
                    >
                      <span className="font-medium text-accent-900">{bien.nom}</span>
                      <span className="flex items-center gap-2">
                        {bail && <span className="text-xs text-accent-500">{bail.reference}</span>}
                        <Badge tone={bail ? 'green' : 'blue'}>{bail ? 'Loué' : 'Vacant'}</Badge>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-accent-900">
              <AlertTriangle size={18} /> Alertes
            </h2>
            {alertes.length === 0 ? (
              <p className="text-sm text-accent-500">Aucune alerte. Tout est en ordre.</p>
            ) : (
              <ul className="space-y-2">
                {alertes.map((a) => (
                  <li key={a.cle}>
                    <Link
                      to={a.lien}
                      className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${
                        a.niveau === 'red'
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : 'border-amber-200 bg-amber-50 text-amber-800'
                      }`}
                    >
                      {a.cle === 'sauvegarde' || a.cle === 'quota' ? (
                        <HardDriveDownload size={16} className="mt-0.5 shrink-0" />
                      ) : (
                        <ClipboardList size={16} className="mt-0.5 shrink-0" />
                      )}
                      {a.texte}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-accent-900">
              <CalendarClock size={18} /> Échéancier
            </h2>
            {echeances.length === 0 ? (
              <p className="text-sm text-accent-500">
                Aucune échéance à venir (fins de bail, révisions IRL).
              </p>
            ) : (
              <ul className="divide-y divide-accent-100">
                {echeances.slice(0, 8).map((e, i) => (
                  <li key={i}>
                    <Link to={e.lien} className="flex items-center justify-between py-2 text-sm hover:bg-accent-50">
                      <span className="text-accent-800">{e.texte}</span>
                      <span className="font-medium text-accent-600">
                        {format(e.date, 'd MMMM yyyy', { locale: fr })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
