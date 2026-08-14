import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import {
  FileText,
  HardDriveDownload,
  HardDriveUpload,
  Plus,
  Ruler,
  Scale,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { db, lireParametres } from '@/lib/db';
import { genererEtArchiver } from '@/lib/pdf/generer';
import { GrilleVetustePdf } from '@/lib/pdf/GrilleVetustePdf';
import { FicheAidePdf } from '@/lib/pdf/FicheAidePdf';
import type { LigneVetuste } from '@/types';
import {
  detecterConflits,
  ErreurSauvegarde,
  exporterSauvegarde,
  importerSauvegarde,
  lireSauvegarde,
  supprimerToutesLesDonnees,
  telechargerBlob,
} from '@/lib/backup';
import { decrireErreur } from '@/lib/erreurs';
import { GRILLE_VETUSTE_DEFAUT } from '@/lib/defauts';
import { formatOctets } from '@/lib/calculs';
import { usePersistanceStockage, useQuotaStockage } from '@/hooks/useStatuts';
import { BailleurPanel } from './BailleurPanel';
import { EmpreintePanel } from './EmpreintePanel';
import { SauvegardeAutoPanel, SauvegardeGDrivePanel } from './SauvegardeAutoPanels';
import { FicheVisitePanel } from './FicheVisitePanel';
import { ClausesBailPanel } from './ClausesBailPanel';
import { DISCLAIMER_JURIDIQUE } from '@/components/AppLayout';
import {
  Button,
  CarteRepliable,
  Field,
  Input,
  Modal,
  PageHeader,
  useToast,
} from '@/components/ui';

export function ParametresPage() {
  const toast = useToast();
  // Passe par `getParametres` : les champs apparus après la création des
  // paramètres (modèle de fiche de visite…) sont complétés à la lecture.
  const parametres = useLiveQuery(() => lireParametres());
  const persiste = usePersistanceStockage();
  const quota = useQuotaStockage();
  const fichierRef = useRef<HTMLInputElement>(null);
  const [importEnAttente, setImportEnAttente] = useState<{
    zip: Awaited<ReturnType<typeof lireSauvegarde>>['zip'];
    data: Awaited<ReturnType<typeof lireSauvegarde>>['data'];
    conflits: number;
  } | null>(null);
  const [suppressionOuverte, setSuppressionOuverte] = useState(false);
  const [confirmationSuppression, setConfirmationSuppression] = useState('');
  const [suppression, setSuppression] = useState(false);

  if (!parametres) return null;

  const majGrille = (grille: LigneVetuste[]) => db.parametres.put({ ...parametres, grilleVetuste: grille });

  const exporter = async () => {
    const blob = await exporterSauvegarde();
    telechargerBlob(blob, `bailiz-sauvegarde-${format(new Date(), 'yyyy-MM-dd-HHmm')}.zip`);
    toast('success', 'Sauvegarde exportée (données + photos + PDF).');
  };

  const choisirFichier = async (f: File | null) => {
    if (!f) return;
    try {
      const { zip, data } = await lireSauvegarde(f);
      const conflits = await detecterConflits(data);
      setImportEnAttente({ zip, data, conflits });
    } catch (e) {
      /*
       * Deux natures d'échec, deux messages. Le refus d'archive est déjà rédigé
       * pour l'utilisateur et dit quoi faire ; une panne technique (quota
       * saturé, base fermée) doit passer par `decrireErreur`, seul endroit où
       * ces noms de fautes navigateur sont traduits en clair.
       */
      toast(
        'error',
        e instanceof ErreurSauvegarde ? e.message : `Import impossible - ${decrireErreur(e)}`,
      );
    } finally {
      if (fichierRef.current) fichierRef.current.value = '';
    }
  };

  const genererGrillePdf = async () => {
    await genererEtArchiver({
      type: 'grille_vetuste',
      titre: 'Grille de vétusté (avec mode d’emploi)',
      element: (reference) => (
        <GrilleVetustePdf reference={reference} grille={parametres.grilleVetuste} />
      ),
    });
    toast('success', 'Grille de vétusté générée (PDF).');
  };

  const genererFicheAide = async () => {
    await genererEtArchiver({
      type: 'fiche_aide',
      titre: 'Fiche d’aide juridique du bailleur meublé',
      element: (reference) => <FicheAidePdf reference={reference} />,
    });
    toast('success', "Fiche d'aide juridique générée (PDF).");
  };

  const importer = async (mode: 'remplacer' | 'fusionner') => {
    if (!importEnAttente) return;
    const resume = await importerSauvegarde(importEnAttente.zip, importEnAttente.data, mode);
    setImportEnAttente(null);
    toast(
      'success',
      `Import terminé : ${resume.biens} biens, ${resume.baux} baux, ${resume.edls} EDL, ${resume.photos} photos, ${resume.documents} PDF restaurés.`,
    );
  };

  const supprimerTout = async () => {
    setSuppression(true);
    try {
      await supprimerToutesLesDonnees();
      setSuppressionOuverte(false);
      setConfirmationSuppression('');
      toast('success', 'Toutes les données ont été supprimées de cet appareil.');
    } finally {
      setSuppression(false);
    }
  };

  return (
    <div>
      <PageHeader titre="Paramètres" />
      <div className="space-y-4">
        <BailleurPanel parametres={parametres} />

        <CarteRepliable
          identifiant="sauvegarde"
          titre="Sauvegarde et restauration"
          icone={<HardDriveDownload size={18} />}
          resume={
            parametres.derniereSauvegarde
              ? `Dernier export le ${format(new Date(parametres.derniereSauvegarde), 'dd/MM/yyyy à HH:mm')}`
              : 'Aucun export manuel effectué'
          }
        >
          <p className="mb-1 text-sm text-accent-600">
            Toutes les données restent sur cet appareil. Exportez régulièrement une sauvegarde
            complète (fichier ZIP : données + photos + PDF), notamment après chaque état des
            lieux signé.
          </p>
          <p className="mb-3 text-xs text-accent-500">
            Dernière sauvegarde :{' '}
            {parametres.derniereSauvegarde
              ? format(new Date(parametres.derniereSauvegarde), 'dd/MM/yyyy à HH:mm')
              : 'jamais'}{' '}
            · Stockage persistant :{' '}
            {persiste === undefined ? '…' : persiste ? 'accordé par le navigateur' : 'non garanti - exportez régulièrement'}
            {quota && (
              <>
                {' '}
                · Espace occupé : {formatOctets(quota.utilise)} sur {formatOctets(quota.quota)} (
                {quota.pct} %)
              </>
            )}
          </p>
          {quota?.critique && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Le stockage de ce navigateur est occupé à {quota.pct} %. Au-delà, il peut refuser
              d'enregistrer une photo ou un PDF - en plein état des lieux. Exportez une sauvegarde,
              puis libérez de la place (états des lieux anciens, documents archivés).
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={exporter}>
              <HardDriveDownload size={16} /> Exporter la sauvegarde (.zip)
            </Button>
            <Button variant="secondary" onClick={() => fichierRef.current?.click()}>
              <HardDriveUpload size={16} /> Importer une sauvegarde
            </Button>
            <input
              ref={fichierRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => void choisirFichier(e.target.files?.[0] ?? null)}
            />
          </div>
        </CarteRepliable>

        <SauvegardeAutoPanel />

        <SauvegardeGDrivePanel />



        <CarteRepliable
          identifiant="vetuste"
          titre="Grille de vétusté"
          icone={<Ruler size={18} />}
          resume={`${parametres.grilleVetuste.length} poste(s) de vétusté`}
        >
          <p className="mb-3 text-sm text-accent-600">
            Utilisée pour calculer la part des réparations restant à la charge du locataire lors
            de l'EDL de sortie. Après la franchise, l'abattement s'applique chaque année ; une
            part résiduelle de 10 % reste due tant que la durée de vie n'est pas atteinte.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-accent-200 text-left text-xs text-accent-500">
                  <th className="py-2 pr-2">Poste</th>
                  <th className="py-2 pr-2">Durée de vie (ans)</th>
                  <th className="py-2 pr-2">Franchise (ans)</th>
                  <th className="py-2 pr-2">Abattement/an (%)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {parametres.grilleVetuste.map((l, i) => (
                  <tr key={`${i}-${parametres.grilleVetuste.length}`} className="border-b border-accent-100">
                    <td className="py-1 pr-2">
                      <Input
                        defaultValue={l.poste}
                        onBlur={(e) =>
                          majGrille(parametres.grilleVetuste.map((x, j) => (j === i ? { ...x, poste: e.target.value } : x)))
                        }
                      />
                    </td>
                    {(['dureeVieAnnees', 'franchiseAnnees', 'abattementAnnuelPct'] as const).map((champ) => (
                      <td key={champ} className="py-1 pr-2">
                        <Input
                          type="number"
                          min={0}
                          className="w-24"
                          defaultValue={l[champ]}
                          onBlur={(e) =>
                            majGrille(
                              parametres.grilleVetuste.map((x, j) =>
                                j === i ? { ...x, [champ]: Number(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Supprimer"
                        onClick={() => majGrille(parametres.grilleVetuste.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={14} className="text-red-600" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                majGrille([
                  ...parametres.grilleVetuste,
                  { poste: 'Nouveau poste', dureeVieAnnees: 10, franchiseAnnees: 1, abattementAnnuelPct: 10 },
                ])
              }
            >
              <Plus size={14} /> Ajouter un poste
            </Button>
            <Button variant="ghost" size="sm" onClick={() => majGrille(GRILLE_VETUSTE_DEFAUT)}>
              Réinitialiser la grille par défaut
            </Button>
            <Button size="sm" onClick={() => void genererGrillePdf()}>
              <Scale size={14} /> Télécharger la grille (PDF, avec mode d'emploi)
            </Button>
          </div>
          <p className="mt-2 text-xs text-accent-500">
            La grille est aussi générée automatiquement comme annexe à chaque création de bail
            (art. 4 du décret n°2016-382 : elle doit être convenue dès la signature).
          </p>
        </CarteRepliable>

        <ClausesBailPanel />

        <FicheVisitePanel />

        <CarteRepliable
          identifiant="fiche-aide"
          titre="Fiche d'aide juridique"
          icone={<FileText size={18} />}
          resume="Mémo PDF : préavis, congés, impayés, dépôt de garantie"
        >
          <p className="mb-3 text-sm text-accent-600">
            Mémo PDF à conserver avec vos dossiers : préavis et congés (1 mois locataire, 3
            mois bailleur motivé), formes de notification valables (LRAR, commissaire de
            justice, remise en main propre), marche à suivre en cas d'impayés (commandement de
            payer, 6 semaines, trêve hivernale), délais du dépôt de garantie, prescription des
            loyers, interlocuteurs en cas de litige (ADIL, commission de conciliation).
          </p>
          <Button onClick={() => void genererFicheAide()}>
            <FileText size={16} /> Télécharger la fiche d'aide (PDF)
          </Button>
        </CarteRepliable>

        <EmpreintePanel />

        <CarteRepliable
          identifiant="rgpd"
          titre="Données personnelles (RGPD)"
          icone={<ShieldCheck size={18} />}
          resume="Conservation et suppression des données de vos locataires"
        >
          <p className="text-sm text-accent-600">
            Les données des locataires sont conservées uniquement dans le navigateur de cet
            appareil ; aucune donnée n'est transmise à un serveur. En tant que bailleur, vous
            êtes responsable de leur conservation (le temps du bail et des délais de
            prescription) et de leur suppression. La suppression définitive d'un locataire
            s'effectue depuis la page Locataires (bloquée si un bail actif y est lié).
          </p>
          <p className="mt-3 text-sm text-accent-600">
            Pour tout effacer d'un coup (biens, locataires, baux, états des lieux, photos,
            documents et paramètres), utilisez le bouton ci-dessous. Exportez d'abord une
            sauvegarde si vous voulez pouvoir revenir en arrière : l'opération est irréversible.
          </p>
          <Button variant="danger" className="mt-3" onClick={() => setSuppressionOuverte(true)}>
            <Trash2 size={16} /> Supprimer toutes mes données
          </Button>
        </CarteRepliable>

        <CarteRepliable
          identifiant="avertissement"
          titre="Avertissement juridique"
          icone={<Scale size={18} />}
          resume="Aide à la rédaction, pas un conseil juridique"
        >
          <p className="text-sm text-accent-600">{DISCLAIMER_JURIDIQUE}</p>
        </CarteRepliable>
      </div>

      <Modal
        open={importEnAttente !== null}
        onClose={() => setImportEnAttente(null)}
        title="Restaurer la sauvegarde"
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportEnAttente(null)}>
              Annuler
            </Button>
            <Button variant="secondary" onClick={() => void importer('fusionner')}>
              Fusionner par identifiant
            </Button>
            <Button variant="danger" onClick={() => void importer('remplacer')}>
              Tout remplacer
            </Button>
          </>
        }
      >
        {importEnAttente && (
          <div className="space-y-2 text-sm text-accent-700">
            <p>
              Sauvegarde du{' '}
              {format(new Date(importEnAttente.data.exporteLe), 'dd/MM/yyyy à HH:mm')} :{' '}
              {importEnAttente.data.biens.length} biens, {importEnAttente.data.baux.length} baux,{' '}
              {importEnAttente.data.edls.length} EDL, {importEnAttente.data.photos.length} photos.
            </p>
            {importEnAttente.conflits > 0 ? (
              <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
                {importEnAttente.conflits} enregistrement(s) de la sauvegarde existent déjà sur
                cet appareil. « Fusionner » met à jour ces enregistrements et conserve le reste ;
                « Tout remplacer » efface d'abord toutes les données locales.
              </p>
            ) : (
              <p>Aucun conflit détecté avec les données locales.</p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={suppressionOuverte}
        onClose={() => {
          setSuppressionOuverte(false);
          setConfirmationSuppression('');
        }}
        title="Supprimer toutes les données"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setSuppressionOuverte(false);
                setConfirmationSuppression('');
              }}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={confirmationSuppression !== 'SUPPRIMER' || suppression}
              onClick={() => void supprimerTout()}
            >
              <Trash2 size={16} /> {suppression ? 'Suppression…' : 'Supprimer définitivement'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-accent-700">
          <p>
            Cette action efface <span className="font-medium">définitivement</span>, sur cet
            appareil : tous les biens, locataires, baux, états des lieux, photos et PDF générés,
            ainsi que vos paramètres (identité du bailleur, grille de vétusté, clauses, modèle de
            fiche de visite).
          </p>
          <p className="rounded-lg bg-amber-50 p-3 text-amber-800">
            Aucune donnée n'est conservée ailleurs : sans sauvegarde exportée au préalable, elle
            est perdue sans recours.
          </p>
          <Field label={'Tapez "SUPPRIMER" pour confirmer'}>
            <Input
              value={confirmationSuppression}
              onChange={(e) => setConfirmationSuppression(e.target.value)}
              placeholder="SUPPRIMER"
              autoComplete="off"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/** Panneau « push ZIP » : sauvegarde automatique vers un dossier synchronisé. */
