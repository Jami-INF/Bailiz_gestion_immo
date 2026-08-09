import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import {
  FileText,
  HardDriveDownload,
  HardDriveUpload,
  Plus,
  Ruler,
  Save,
  Scale,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { db, getParametres, lireParametres } from '@/lib/db';
import { genererEtArchiver } from '@/lib/pdf/generer';
import { GrilleVetustePdf } from '@/lib/pdf/GrilleVetustePdf';
import { FicheAidePdf } from '@/lib/pdf/FicheAidePdf';
import type { LigneVetuste, Parametres } from '@/types';
import {
  detecterConflits,
  exporterSauvegarde,
  importerSauvegarde,
  lireSauvegarde,
  telechargerBlob,
} from '@/lib/backup';
import { GRILLE_VETUSTE_DEFAUT } from '@/lib/defauts';
import { usePersistanceStockage } from '@/hooks/useStatuts';
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
  Select,
  useToast,
} from '@/components/ui';

export function ParametresPage() {
  const toast = useToast();
  // Passe par `getParametres` : les champs apparus après la création des
  // paramètres (modèle de fiche de visite…) sont complétés à la lecture.
  const parametres = useLiveQuery(() => lireParametres());
  const persiste = usePersistanceStockage();
  const [bailleur, setBailleur] = useState<Parametres['bailleur'] | null>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const [importEnAttente, setImportEnAttente] = useState<{
    zip: Awaited<ReturnType<typeof lireSauvegarde>>['zip'];
    data: Awaited<ReturnType<typeof lireSauvegarde>>['data'];
    conflits: number;
  } | null>(null);

  useEffect(() => {
    void getParametres().then((p) => setBailleur(p.bailleur));
  }, []);

  if (!parametres || !bailleur) return null;

  const majBailleur = (m: Partial<Parametres['bailleur']>) =>
    setBailleur((b) => ({ ...b!, ...m }));

  const enregistrerBailleur = async () => {
    await db.parametres.put({ ...parametres, bailleur });
    toast('success', 'Coordonnées du bailleur enregistrées.');
  };

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
      toast('error', e instanceof Error ? e.message : "Fichier de sauvegarde illisible.");
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

  return (
    <div>
      <PageHeader titre="Paramètres" />
      <div className="space-y-4">
        <CarteRepliable
          identifiant="bailleur"
          titre="Bailleur"
          icone={<UserRound size={18} />}
          resume={
            bailleur.nom.trim()
              ? `${bailleur.civilite} ${bailleur.prenom} ${bailleur.nom}`.trim()
              : 'Non renseigné — obligatoire pour produire un document'
          }
          resumeAlerte={!bailleur.nom.trim()}
          defautOuvert={!bailleur.nom.trim()}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Civilité">
              <Select value={bailleur.civilite} onChange={(e) => majBailleur({ civilite: e.target.value })}>
                <option value="M">M.</option>
                <option value="Mme">Mme</option>
              </Select>
            </Field>
            <Field label="Prénom">
              <Input value={bailleur.prenom} onChange={(e) => majBailleur({ prenom: e.target.value })} />
            </Field>
            <Field label="Nom">
              <Input value={bailleur.nom} onChange={(e) => majBailleur({ nom: e.target.value })} />
            </Field>
          </div>
          <p className="mb-4 mt-1 text-xs text-accent-500">
            Ces coordonnées figurent sur tous les documents générés (bail, états des lieux,
            courriers) : renseignez-les avant de créer votre premier bail.
          </p>
          <div className="mt-4">
            <Field label="Adresse complète">
              <Input
                value={bailleur.adresse}
                onChange={(e) => majBailleur({ adresse: e.target.value })}
                placeholder="5 place de Jaude, 63000 Clermont-Ferrand"
              />
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="E-mail">
              <Input
                type="email"
                value={bailleur.email}
                onChange={(e) => majBailleur({ email: e.target.value })}
                placeholder="jean.martin@exemple.fr"
              />
            </Field>
            <Field label="Téléphone">
              <Input
                type="tel"
                value={bailleur.telephone}
                onChange={(e) => majBailleur({ telephone: e.target.value })}
                placeholder="06 12 34 56 78"
              />
            </Field>
            <Field
              label="SIRET LMNP (optionnel)"
              hint="Numéro à 14 chiffres obtenu à l'immatriculation LMNP (INPI). Affiché sur le bail si renseigné."
            >
              <Input
                value={bailleur.siret ?? ''}
                onChange={(e) => majBailleur({ siret: e.target.value || undefined })}
                placeholder="123 456 789 00012"
                inputMode="numeric"
              />
            </Field>
          </div>
          <div className="mt-4">
            <Button onClick={enregistrerBailleur}>
              <Save size={16} /> Enregistrer
            </Button>
          </div>
        </CarteRepliable>

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
            {persiste === undefined ? '…' : persiste ? 'accordé par le navigateur' : 'non garanti (pensez à exporter !)'}
          </p>
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
    </div>
  );
}

/** Panneau « push ZIP » : sauvegarde automatique vers un dossier synchronisé. */
