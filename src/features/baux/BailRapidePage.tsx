import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Building2,
  FileDown,
  Pencil,
  Plus,
  Printer,
  Save,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import type { Bail, ClasseDPE, Garant, Parametres, SaisieBail, TypeBien } from '@/types';
import { TYPE_BAIL_LABELS } from '@/types';
import { db, getParametres, prochaineReference } from '@/lib/db';
import { nowISO } from '@/lib/ids';
import { formatEuros } from '@/lib/calculs';
import { telechargerBlob } from '@/lib/backup';
import { rendrePdf, enregistrerDocument, nomsPersonnes } from '@/lib/pdf/generer';
import { BailPdf } from '@/lib/pdf/BailPdf';
import { GrilleVetustePdf } from '@/lib/pdf/GrilleVetustePdf';
import { ActeCautionnementPdf } from '@/lib/pdf/ActeCautionnementPdf';
import { bailVersSaisie, construireDocs, dureeParDefaut, saisieVide } from '@/lib/pdf/bailRapide';
import {
  Button,
  Card,
  Checkbox,
  DateInput,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';

const TYPES_BIEN: TypeBien[] = ['T1', 'T1bis', 'T2', 'T3', 'T4', 'autre'];
const CLASSES_DPE: ClasseDPE[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

function Section({ titre, description, children }: { titre: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-accent-900">{titre}</h2>
        {description && <p className="mt-0.5 text-sm text-accent-500">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

export function BailRapidePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation() as { state?: { bienId?: string } };
  const { id: bailId } = useParams();
  const edition = Boolean(bailId);
  const parametres = useLiveQuery(() => getParametres());
  const biens = useLiveQuery(() => db.biens.orderBy('nom').toArray());
  const locatairesEnr = useLiveQuery(() => db.locataires.orderBy('nom').toArray());
  const bailExistant = useLiveQuery(() => (bailId ? db.baux.get(bailId) : undefined), [bailId]);

  const [saisie, setSaisie] = useState<SaisieBail | null>(null);
  const [apercu, setApercu] = useState<{ url: string; blob: Blob } | null>(null);
  const [autoApercu, setAutoApercu] = useState(true);
  const [generation, setGeneration] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const enCoursRef = useRef(false);

  // Amorce la saisie une seule fois : depuis un bail existant (édition) ou vierge (création).
  useEffect(() => {
    if (!parametres || saisie) return;
    if (edition) {
      if (bailExistant) setSaisie(bailVersSaisie(bailExistant, parametres.bailleur));
    } else {
      setSaisie(saisieVide(parametres.bailleur, location.state?.bienId));
    }
  }, [parametres, saisie, edition, bailExistant, location.state]);

  const resolveBien = useCallback((id: string) => biens?.find((b) => b.id === id), [biens]);
  const resolveLocataire = useCallback((id: string) => locatairesEnr?.find((l) => l.id === id), [locatairesEnr]);

  const pret = Boolean(saisie && parametres && biens && locatairesEnr);

  const genererApercu = useCallback(async () => {
    if (!saisie || !parametres || enCoursRef.current) return;
    enCoursRef.current = true;
    setGeneration(true);
    try {
      const { bail, bien, locataires } = construireDocs(saisie, 'à compléter', resolveBien, resolveLocataire);
      const params: Parametres = { ...parametres, bailleur: saisie.bailleur };
      const blob = await rendrePdf(
        <BailPdf bail={bail} bien={bien} locataires={locataires} parametres={params} brouillon />,
      );
      const url = URL.createObjectURL(blob);
      setApercu((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, blob };
      });
    } catch (e) {
      console.error(e);
    } finally {
      enCoursRef.current = false;
      setGeneration(false);
    }
  }, [saisie, parametres, resolveBien, resolveLocataire]);

  // Aperçu automatique (débattu) à chaque changement de la saisie.
  const cle = saisie ? JSON.stringify(saisie) : '';
  useEffect(() => {
    if (!pret || !autoApercu) return;
    const t = setTimeout(() => void genererApercu(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, autoApercu, pret]);

  // Libère l'URL au démontage.
  useEffect(() => () => {
    if (apercu) URL.revokeObjectURL(apercu.url);
  }, [apercu]);

  if (!saisie || !biens || !locatairesEnr) return null;

  const maj = (m: Partial<SaisieBail>) => setSaisie((s) => ({ ...s!, ...m }));
  const majBailleur = (m: Partial<SaisieBail['bailleur']>) =>
    setSaisie((s) => ({ ...s!, bailleur: { ...s!.bailleur, ...m } }));
  const majBien = (m: Partial<SaisieBail['bien']>) =>
    setSaisie((s) => ({ ...s!, bien: { ...s!.bien, ...m } }));
  const majAdresse = (m: Partial<SaisieBail['bien']['adresse']>) =>
    setSaisie((s) => ({ ...s!, bien: { ...s!.bien, adresse: { ...s!.bien.adresse, ...m } } }));
  const majLoc = (i: number, m: Partial<SaisieBail['locataires'][number]>) =>
    setSaisie((s) => ({ ...s!, locataires: s!.locataires.map((l, idx) => (idx === i ? { ...l, ...m } : l)) }));

  const bienChoisi = saisie.bienId ? biens.find((b) => b.id === saisie.bienId) : undefined;
  const mobilite = saisie.typeBail === 'mobilite';
  const coloc = saisie.locataires.length > 1;

  // Validation non bloquante : avertissements uniquement.
  const dpe = bienChoisi?.classeDPE ?? saisie.bien.classeDPE;
  const avertissements: string[] = [];
  if (dpe === 'G')
    avertissements.push(
      "Logement classé G au DPE : la mise en location d'un logement classé G est interdite depuis 2025 (décence énergétique). À vérifier avant de conclure le bail.",
    );
  if (!mobilite && saisie.depotGarantie && saisie.loyerHC && saisie.depotGarantie > 2 * saisie.loyerHC)
    avertissements.push(
      `Le dépôt de garantie (${formatEuros(saisie.depotGarantie)}) dépasse le maximum légal de 2 mois de loyer hors charges (${formatEuros(2 * saisie.loyerHC)}).`,
    );
  if (saisie.typeBail === 'meuble_1an' && saisie.dureeMois && saisie.dureeMois !== 12)
    avertissements.push('Le bail meublé classique a une durée d’un an (12 mois).');

  const nomFichier = () => {
    const noms = nomsPersonnes(
      saisie.locataires.map((l) => {
        const enr = l.id ? locatairesEnr.find((x) => x.id === l.id) : undefined;
        return { prenom: enr?.prenom ?? l.prenom ?? '', nom: enr?.nom ?? l.nom ?? '' };
      }),
    );
    return `Bail meublé${noms ? ` - ${noms}` : ''}.pdf`;
  };

  const partager = async () => {
    if (!apercu) return;
    const nom = nomFichier();
    const file = new File([apercu.blob], nom, { type: 'application/pdf' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: nom });
        return;
      }
    } catch {
      /* partage annulé ou indisponible */
    }
    telechargerBlob(apercu.blob, nom);
  };

  /** Génère et télécharge l'acte de cautionnement pré-rempli du garant du locataire i. */
  const telechargerActe = async (i: number) => {
    const l = saisie.locataires[i];
    const enr = l.id ? locatairesEnr.find((x) => x.id === l.id) : undefined;
    const g = enr?.garant ?? l.garant;
    if (!g || g.type === 'visale') return;
    const locataireNom = enr
      ? `${enr.prenom} ${enr.nom}`
      : `${l.prenom ?? ''} ${l.nom ?? ''}`.trim() || 'le locataire';
    const a = bienChoisi?.adresse ?? saisie.bien.adresse;
    const bienAdresse = `${a.ligne1}, ${a.codePostal} ${a.ville}`.trim();
    const blob = await rendrePdf(
      <ActeCautionnementPdf
        bailleur={saisie.bailleur}
        garant={g}
        locataireNom={locataireNom}
        bienAdresse={bienAdresse}
        loyerHC={saisie.loyerHC ?? 0}
        charges={saisie.charges.montant ?? 0}
        typeBailLabel={TYPE_BAIL_LABELS[saisie.typeBail]}
        dureeMois={saisie.dureeMois ?? 12}
      />,
    );
    telechargerBlob(blob, `Acte de cautionnement - ${g.prenom} ${g.nom}.pdf`);
  };

  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      const params = await getParametres();
      // Mémorise le bailleur saisi si les Paramètres sont vides.
      const bailleurEnr = saisie.bailleur.nom.trim() ? saisie.bailleur : params.bailleur;
      if (!params.bailleur.nom.trim() && saisie.bailleur.nom.trim()) {
        await db.parametres.put({ ...params, bailleur: saisie.bailleur });
      }
      const paramsPdf: Parametres = { ...params, bailleur: bailleurEnr };
      const today = format(new Date(), 'yyyy-MM-dd');

      // --- Mode édition : met à jour le bail et régénère son PDF (inventaire/grille inchangés) ---
      if (edition && bailExistant) {
        const { bail: brut, bien, locataires } = construireDocs(
          saisie,
          bailExistant.reference,
          resolveBien,
          resolveLocataire,
        );
        const bailMaj: Bail = {
          ...bailExistant,
          bienId: bien.id,
          locataireIds: locataires.map((l) => l.id),
          clauseSolidarite: brut.clauseSolidarite,
          typeBail: brut.typeBail,
          dateEffet: brut.dateEffet || today,
          dureeMois: brut.dureeMois,
          loyerHC: brut.loyerHC,
          charges: brut.charges,
          depotGarantie: brut.depotGarantie,
          jourPaiement: brut.jourPaiement,
          modePaiement: brut.modePaiement,
          revisionIRL: brut.revisionIRL,
          complementLoyer: brut.complementLoyer,
          dernierLoyerAncienLocataire: brut.dernierLoyerAncienLocataire,
          clauseResolutoire: brut.clauseResolutoire,
          assuranceColocataires: brut.assuranceColocataires,
          travaux: brut.travaux,
          clausesParticulieres: brut.clausesParticulieres,
          annexesChecklist: brut.annexesChecklist,
          updatedAt: nowISO(),
        };
        await db.transaction('rw', [db.biens, db.locataires, db.baux], async () => {
          if (!saisie.bienId) await db.biens.add(bien);
          const locsInline = locataires.filter((_, i) => !saisie.locataires[i]?.id);
          if (locsInline.length) await db.locataires.bulkAdd(locsInline);
          await db.baux.put(bailMaj);
        });
        const nomsMaj = nomsPersonnes(locataires);
        const blob = await rendrePdf(
          <BailPdf bail={bailMaj} bien={bien} locataires={locataires} parametres={paramsPdf} brouillon />,
        );
        await enregistrerDocument({
          reference: bailMaj.reference,
          type: 'bail',
          titre: `Bail meublé — ${bien.nom} — ${nomsMaj}`,
          blob,
          bienId: bien.id,
          bailId: bailMaj.id,
        });
        toast('success', `Bail ${bailMaj.reference} mis à jour et régénéré.`);
        navigate(`/baux/${bailMaj.id}`);
        return;
      }

      // --- Mode création : bail + inventaire + grille de vétusté ---
      const reference = await prochaineReference('bail');
      const refGrille = await prochaineReference('document');
      const { bail, bien, locataires } = construireDocs(saisie, reference, resolveBien, resolveLocataire);

      // Un bail persisté doit avoir une date valide (les pages de suivi la supposent).
      const bailFinal = {
        ...bail,
        statut: 'genere' as const,
        dateEffet: bail.dateEffet || format(new Date(), 'yyyy-MM-dd'),
      };

      const blobBail = await rendrePdf(
        <BailPdf bail={bailFinal} bien={bien} locataires={locataires} parametres={paramsPdf} brouillon />,
      );
      const blobGrille = await rendrePdf(
        <GrilleVetustePdf reference={refGrille} grille={params.grilleVetuste} bailReference={reference} />,
      );

      await db.transaction('rw', [db.biens, db.locataires, db.baux], async () => {
        if (!saisie.bienId) await db.biens.add(bien);
        const locsInline = locataires.filter((_, i) => !saisie.locataires[i]?.id);
        if (locsInline.length) await db.locataires.bulkAdd(locsInline);
        await db.baux.add(bailFinal);
      });

      const noms = nomsPersonnes(locataires);
      await enregistrerDocument({ reference, type: 'bail', titre: `Bail meublé — ${bien.nom} — ${noms}`, blob: blobBail, bienId: bien.id, bailId: bail.id });
      await enregistrerDocument({ reference: refGrille, type: 'grille_vetuste', titre: `Grille de vétusté — ${bien.nom} — annexe du bail ${reference}`, blob: blobGrille, bienId: bien.id, bailId: bail.id });

      toast('success', `Bail ${reference} enregistré. L'inventaire du mobilier sera réalisé avec l'état des lieux d'entrée.`);
      navigate(`/baux/${bail.id}`);
    } catch (e) {
      console.error(e);
      toast('error', "Erreur lors de l'enregistrement du bail.");
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <div>
      <PageHeader
        titre={edition ? `Modifier le bail${bailExistant ? ` ${bailExistant.reference}` : ''}` : 'Nouveau bail'}
        sousTitre={
          edition
            ? 'Le bail reste modifiable et régénérable à volonté — c’est le document imprimé qui fait foi. « Enregistrer les modifications » met à jour le bail et régénère son PDF.'
            : 'Un seul écran, avec aperçu du document. Choisissez un bien et des locataires enregistrés, ou saisissez-les ici. Générez un PDF prêt à imprimer, ou enregistrez le bail complet (inventaire + grille de vétusté).'
        }
      />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(460px,52%)] lg:items-start lg:gap-6">
        {/* ------------------------- Formulaire ------------------------- */}
        <div className="space-y-4">
          <Section titre="Bailleur" description="Pré-rempli depuis vos Paramètres si renseigné.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Civilité">
                <Select value={saisie.bailleur.civilite} onChange={(e) => majBailleur({ civilite: e.target.value })}>
                  <option value="M">M.</option>
                  <option value="Mme">Mme</option>
                </Select>
              </Field>
              <div />
              <Field label="Prénom" required>
                <Input value={saisie.bailleur.prenom} onChange={(e) => majBailleur({ prenom: e.target.value })} />
              </Field>
              <Field label="Nom" required>
                <Input value={saisie.bailleur.nom} onChange={(e) => majBailleur({ nom: e.target.value })} />
              </Field>
            </div>
            <Field label="Adresse" required>
              <Input value={saisie.bailleur.adresse} onChange={(e) => majBailleur({ adresse: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Email">
                <Input type="email" value={saisie.bailleur.email} onChange={(e) => majBailleur({ email: e.target.value })} />
              </Field>
              <Field label="Téléphone">
                <Input value={saisie.bailleur.telephone} onChange={(e) => majBailleur({ telephone: e.target.value })} />
              </Field>
              <Field label="SIRET (LMNP, optionnel)">
                <Input value={saisie.bailleur.siret ?? ''} onChange={(e) => majBailleur({ siret: e.target.value })} />
              </Field>
            </div>
          </Section>

          <Section titre="Logement">
            <Field label="Bien" hint="Choisissez un bien enregistré (toutes ses infos seront utilisées) ou saisissez un logement ici.">
              <Select
                value={saisie.bienId ?? ''}
                onChange={(e) => maj({ bienId: e.target.value || undefined })}
              >
                <option value="">— Saisir un logement ici —</option>
                {biens.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom} ({b.adresse.ville})
                  </option>
                ))}
              </Select>
            </Field>

            {bienChoisi ? (
              <div className="flex items-start gap-3 rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
                <Building2 size={18} className="mt-0.5 shrink-0 text-accent-500" />
                <div>
                  <div className="font-medium text-accent-900">{bienChoisi.nom}</div>
                  {bienChoisi.type} · {bienChoisi.surfaceBoutin} m² · {bienChoisi.adresse.ligne1},{' '}
                  {bienChoisi.adresse.codePostal} {bienChoisi.adresse.ville}
                  {bienChoisi.classeDPE && ` · DPE ${bienChoisi.classeDPE}`}
                  <button
                    type="button"
                    onClick={() => maj({ bienId: undefined })}
                    className="mt-1 flex items-center gap-1 text-xs font-medium text-accent-700 underline"
                  >
                    <Pencil size={12} /> Saisir un logement à la place
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Désignation (usage interne)">
                    <Input value={saisie.bien.nom ?? ''} onChange={(e) => majBien({ nom: e.target.value })} placeholder="T2 Chamalières" />
                  </Field>
                  <Field label="Type" required>
                    <Select value={saisie.bien.type ?? ''} onChange={(e) => majBien({ type: (e.target.value || undefined) as TypeBien })}>
                      <option value="">—</option>
                      {TYPES_BIEN.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Adresse du logement" required>
                  <Input value={saisie.bien.adresse.ligne1} onChange={(e) => majAdresse({ ligne1: e.target.value })} placeholder="12 rue des Lilas" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Code postal" required>
                    <Input value={saisie.bien.adresse.codePostal} onChange={(e) => majAdresse({ codePostal: e.target.value })} />
                  </Field>
                  <Field label="Ville" required>
                    <Input value={saisie.bien.adresse.ville} onChange={(e) => majAdresse({ ville: e.target.value })} />
                  </Field>
                  <Field label="Étage / bâtiment (optionnel)">
                    <Input value={saisie.bien.etage ?? ''} onChange={(e) => majBien({ etage: e.target.value })} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-4">
                  <Field label="Surface Boutin (m²)" required>
                    <Input type="number" step="0.01" min="0" value={saisie.bien.surfaceBoutin ?? ''} onChange={(e) => majBien({ surfaceBoutin: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  </Field>
                  <Field label="Nb de pièces" required>
                    <Input type="number" min="0" value={saisie.bien.nbPieces ?? ''} onChange={(e) => majBien({ nbPieces: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  </Field>
                  <Field label="Classe DPE">
                    <Select value={saisie.bien.classeDPE ?? ''} onChange={(e) => majBien({ classeDPE: (e.target.value || undefined) as ClasseDPE })}>
                      <option value="">—</option>
                      {CLASSES_DPE.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Identifiant fiscal (optionnel)">
                    <Input value={saisie.bien.identifiantFiscal ?? ''} onChange={(e) => majBien({ identifiantFiscal: e.target.value })} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Chauffage" hint="Texte libre, ex. « individuel électrique »">
                    <Input value={saisie.bien.chauffage ?? ''} onChange={(e) => majBien({ chauffage: e.target.value })} />
                  </Field>
                  <Field label="Eau chaude" hint="Texte libre, ex. « individuelle gaz »">
                    <Input value={saisie.bien.eauChaude ?? ''} onChange={(e) => majBien({ eauChaude: e.target.value })} />
                  </Field>
                </div>
              </>
            )}
          </Section>

          <Section titre="Locataire(s)" description="Chaque locataire peut être choisi parmi les enregistrés, ou saisi ici.">
            {saisie.locataires.map((l, i) => {
              const enr = l.id ? locatairesEnr.find((x) => x.id === l.id) : undefined;
              return (
                <div key={i} className="space-y-4 rounded-lg border border-accent-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-accent-800">{coloc ? `Locataire ${i + 1}` : 'Locataire'}</span>
                    {saisie.locataires.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => maj({ locataires: saisie.locataires.filter((_, idx) => idx !== i) })}>
                        <Trash2 size={16} /> Retirer
                      </Button>
                    )}
                  </div>
                  <Field label="Locataire">
                    <Select value={l.id ?? ''} onChange={(e) => majLoc(i, { id: e.target.value || undefined })}>
                      <option value="">— Saisir ici —</option>
                      {locatairesEnr.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.civilite} {x.prenom} {x.nom}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {enr ? (
                    <div className="rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
                      <div className="flex items-start gap-3">
                        <Users size={18} className="mt-0.5 shrink-0 text-accent-500" />
                        <div>
                          <div className="font-medium text-accent-900">
                            {enr.civilite} {enr.prenom} {enr.nom}
                          </div>
                          {enr.email}
                          {enr.telephone ? ` · ${enr.telephone}` : ''}
                          {enr.garant ? ' · avec garant' : ''}
                        </div>
                      </div>
                      {enr.garant && enr.garant.type !== 'visale' && (
                        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void telechargerActe(i)}>
                          <FileDown size={14} /> Télécharger l'attestation de garant (acte de cautionnement)
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-4">
                        <Field label="Civilité" required>
                          <Select value={l.civilite ?? 'M'} onChange={(e) => majLoc(i, { civilite: e.target.value as 'M' | 'Mme' })}>
                            <option value="M">M.</option>
                            <option value="Mme">Mme</option>
                          </Select>
                        </Field>
                        <Field label="Prénom" required>
                          <Input value={l.prenom ?? ''} onChange={(e) => majLoc(i, { prenom: e.target.value })} />
                        </Field>
                        <Field label="Nom" required>
                          <Input value={l.nom ?? ''} onChange={(e) => majLoc(i, { nom: e.target.value })} />
                        </Field>
                        <Field label="Téléphone">
                          <Input value={l.telephone ?? ''} onChange={(e) => majLoc(i, { telephone: e.target.value })} />
                        </Field>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Field label="Email">
                          <Input type="email" value={l.email ?? ''} onChange={(e) => majLoc(i, { email: e.target.value })} />
                        </Field>
                        <Field label="Date de naissance">
                          <DateInput value={l.dateNaissance ?? ''} onChange={(iso) => majLoc(i, { dateNaissance: iso || undefined })} />
                        </Field>
                        <Field label="Lieu de naissance">
                          <Input value={l.lieuNaissance ?? ''} onChange={(e) => majLoc(i, { lieuNaissance: e.target.value })} />
                        </Field>
                      </div>
                      <Field label="Adresse actuelle (optionnel)" hint="Domicile du locataire avant l'entrée dans les lieux.">
                        <Input value={l.adresseActuelle ?? ''} onChange={(e) => majLoc(i, { adresseActuelle: e.target.value })} />
                      </Field>

                      <div className="space-y-3 rounded-lg border border-accent-200 bg-accent-50 p-3">
                        <Checkbox
                          label="Ce locataire a un garant (caution)"
                          checked={!!l.garant}
                          onChange={(e) =>
                            majLoc(i, {
                              garant: e.target.checked ? { type: 'physique', nom: '', prenom: '', adresse: '' } : undefined,
                            })
                          }
                        />
                        {l.garant && (
                          <>
                            <Field label="Type de garantie">
                              <Select
                                value={l.garant.type}
                                onChange={(e) => majLoc(i, { garant: { ...l.garant!, type: e.target.value as Garant['type'] } })}
                              >
                                <option value="physique">Personne physique (caution)</option>
                                <option value="visale">Garantie Visale</option>
                                <option value="autre">Autre</option>
                              </Select>
                            </Field>
                            {l.garant.type !== 'visale' && (
                              <>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Field label="Prénom du garant" required>
                                    <Input value={l.garant.prenom} onChange={(e) => majLoc(i, { garant: { ...l.garant!, prenom: e.target.value } })} />
                                  </Field>
                                  <Field label="Nom du garant" required>
                                    <Input value={l.garant.nom} onChange={(e) => majLoc(i, { garant: { ...l.garant!, nom: e.target.value } })} />
                                  </Field>
                                </div>
                                <Field label="Adresse du garant" required>
                                  <Input value={l.garant.adresse} onChange={(e) => majLoc(i, { garant: { ...l.garant!, adresse: e.target.value } })} />
                                </Field>
                                <Button variant="secondary" size="sm" onClick={() => void telechargerActe(i)}>
                                  <FileDown size={14} /> Télécharger l'attestation de garant (acte de cautionnement)
                                </Button>
                                <p className="text-xs text-accent-500">
                                  Les pièces du garant (avis d'impôt, 3 dernières fiches de paie, pièce d'identité, justificatif de domicile) sont ajoutées à la liste des documents à remettre, dans le bail.
                                </p>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <Button variant="secondary" onClick={() => maj({ locataires: [...saisie.locataires, { civilite: 'M' }] })}>
              <Plus size={16} /> Ajouter un colocataire
            </Button>
            {coloc && (
              <div className="space-y-3 rounded-lg bg-accent-50 p-4">
                <Checkbox
                  label="Insérer une clause de solidarité entre colocataires (recommandé)"
                  checked={saisie.clauseSolidarite}
                  onChange={(e) => maj({ clauseSolidarite: e.target.checked })}
                />
                <Field label="Assurance souscrite par le bailleur pour les colocataires — montant annuel (€)" hint="Laissez vide si les colocataires s'assurent eux-mêmes.">
                  <Input type="number" step="0.01" min="0" value={saisie.assuranceMontantAnnuel ?? ''} onChange={(e) => maj({ assuranceMontantAnnuel: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </Field>
              </div>
            )}
          </Section>

          <Section titre="Type & durée">
            <div className="space-y-2">
              {(Object.keys(TYPE_BAIL_LABELS) as SaisieBail['typeBail'][]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => maj({ typeBail: t, dureeMois: dureeParDefaut(t) })}
                  className={`w-full rounded-xl border-2 p-3 text-left transition-colors ${
                    saisie.typeBail === t ? 'border-accent-700 bg-accent-50' : 'border-accent-200 hover:border-accent-400'
                  }`}
                >
                  <span className="font-semibold text-accent-900">{TYPE_BAIL_LABELS[t]}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date de prise d'effet" required>
                <DateInput value={saisie.dateEffet ?? ''} onChange={(iso) => maj({ dateEffet: iso || undefined })} />
              </Field>
              <Field label="Durée (mois)" required>
                <Input type="number" min="1" max={mobilite ? 10 : undefined} value={saisie.dureeMois ?? ''} onChange={(e) => maj({ dureeMois: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </Field>
            </div>
          </Section>

          <Section titre="Loyer & charges">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Loyer mensuel hors charges (€)" required>
                <Input type="number" step="0.01" min="0" value={saisie.loyerHC ?? ''} onChange={(e) => maj({ loyerHC: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </Field>
              <Field label="Dépôt de garantie (€)" required={!mobilite} hint={mobilite ? 'Interdit pour le bail mobilité.' : 'Au plus 2 mois de loyer HC.'}>
                <Input type="number" step="0.01" min="0" disabled={mobilite} value={mobilite ? '' : saisie.depotGarantie ?? ''} onChange={(e) => maj({ depotGarantie: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Charges">
                <Select value={saisie.charges.mode} onChange={(e) => maj({ charges: { ...saisie.charges, mode: e.target.value as 'forfait' | 'provisions' } })}>
                  <option value="forfait">Forfait</option>
                  <option value="provisions">Provisions</option>
                </Select>
              </Field>
              <Field label="Montant charges (€)">
                <Input type="number" step="0.01" min="0" value={saisie.charges.montant ?? ''} onChange={(e) => maj({ charges: { ...saisie.charges, montant: e.target.value === '' ? undefined : Number(e.target.value) } })} />
              </Field>
              <Field label="Jour de paiement (1-28)" required>
                <Input type="number" min="1" max="28" value={saisie.jourPaiement ?? ''} onChange={(e) => maj({ jourPaiement: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Mode de paiement" required>
              <Input value={saisie.modePaiement ?? ''} onChange={(e) => maj({ modePaiement: e.target.value })} placeholder="Virement bancaire" />
            </Field>
            {!mobilite && (
              <div className="rounded-lg bg-accent-50 p-4">
                <Checkbox label="Loyer révisable annuellement selon l'IRL" checked={saisie.revisionIRL?.revisable ?? false} onChange={(e) => maj({ revisionIRL: { ...saisie.revisionIRL, revisable: e.target.checked } })} />
                {saisie.revisionIRL?.revisable && (
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Trimestre de référence IRL" required>
                      <Input value={saisie.revisionIRL?.trimestreReference ?? ''} onChange={(e) => maj({ revisionIRL: { ...saisie.revisionIRL!, trimestreReference: e.target.value } })} placeholder="1er trimestre 2026" />
                    </Field>
                    <Field label="Valeur de l'indice" required>
                      <Input type="number" step="0.01" value={saisie.revisionIRL?.valeurIndice ?? ''} onChange={(e) => maj({ revisionIRL: { ...saisie.revisionIRL!, valeurIndice: e.target.value === '' ? undefined : Number(e.target.value) } })} />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section titre="Clauses & travaux">
            <Checkbox
              label="Insérer la clause résolutoire (recommandé — protège le bailleur)"
              checked={saisie.clauseResolutoire}
              onChange={(e) => maj({ clauseResolutoire: e.target.checked })}
            />
            <Field label="Dernier loyer acquitté par le précédent locataire (€)" hint="Obligatoire si le précédent locataire est parti depuis moins de 18 mois. Laisser vide sinon.">
              <Input type="number" step="0.01" min="0" value={saisie.dernierLoyerAncienLocataire ?? ''} onChange={(e) => maj({ dernierLoyerAncienLocataire: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </Field>
            {bienChoisi?.zoneEncadrementLoyers && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Complément de loyer (€)" hint="Zone d'encadrement : uniquement si caractéristiques exceptionnelles.">
                  <Input type="number" step="0.01" min="0" value={saisie.complementMontant ?? ''} onChange={(e) => maj({ complementMontant: e.target.value === '' ? undefined : Number(e.target.value) })} />
                </Field>
                <Field label="Justification du complément">
                  <Input value={saisie.complementJustification ?? ''} onChange={(e) => maj({ complementJustification: e.target.value })} />
                </Field>
              </div>
            )}
            <Field label="Travaux depuis le dernier bail (rubrique V.A)" hint="Nature et montant. Vide = « néant ».">
              <Textarea rows={2} value={saisie.travauxDepuis ?? ''} onChange={(e) => maj({ travauxDepuis: e.target.value })} />
            </Field>
            <Field label="Majoration de loyer suite à travaux du bailleur (V.B)">
              <Textarea rows={2} value={saisie.travauxMajoration ?? ''} onChange={(e) => maj({ travauxMajoration: e.target.value })} />
            </Field>
            <Field label="Diminution de loyer suite à travaux du locataire (V.C)">
              <Textarea rows={2} value={saisie.travauxDiminution ?? ''} onChange={(e) => maj({ travauxDiminution: e.target.value })} />
            </Field>
          </Section>

          <Section titre="Clauses particulières (optionnel)" description="Une clause par ligne. Elles apparaîtront numérotées dans le bail.">
            <Textarea rows={4} value={saisie.clausesParticulieres ?? ''} onChange={(e) => maj({ clausesParticulieres: e.target.value })} />
          </Section>

          {avertissements.length > 0 && (
            <div className="space-y-2">
              {avertissements.map((a) => (
                <p key={a} className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {a}
                </p>
              ))}
              <p className="text-xs text-accent-500">Ces alertes n'empêchent pas la génération : à vous de vérifier.</p>
            </div>
          )}
        </div>

        {/* ------------------------- Aperçu ------------------------- */}
        <div className="mt-4 lg:sticky lg:top-4 lg:mt-0">
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-accent-900">
                Aperçu {generation && <span className="text-xs font-normal text-accent-400">· mise à jour…</span>}
              </h2>
              <Checkbox label="Auto" checked={autoApercu} onChange={(e) => setAutoApercu(e.target.checked)} className="text-xs" />
            </div>
            {!autoApercu && (
              <Button variant="secondary" size="sm" onClick={() => void genererApercu()} disabled={generation}>
                Mettre à jour l’aperçu
              </Button>
            )}
            {apercu ? (
              <iframe title="Aperçu du bail" src={apercu.url} className="h-[calc(100vh-12rem)] min-h-[560px] w-full rounded-lg border border-accent-200 bg-white" />
            ) : (
              <div className="flex h-[calc(100vh-12rem)] min-h-[560px] items-center justify-center rounded-lg border border-dashed border-accent-200 text-sm text-accent-400">
                L’aperçu s’affiche ici.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => void partager()} disabled={!apercu}>
                <Share2 size={16} /> Partager
              </Button>
              <Button variant="secondary" size="sm" onClick={() => apercu && telechargerBlob(apercu.blob, nomFichier())} disabled={!apercu}>
                <FileDown size={16} /> Télécharger
              </Button>
              <Button variant="secondary" size="sm" onClick={() => apercu && window.open(apercu.url, '_blank')} disabled={!apercu}>
                <Printer size={16} /> Imprimer
              </Button>
              <Button size="sm" onClick={() => void enregistrer()} disabled={enregistrement || !pret}>
                <Save size={16} /> {enregistrement ? 'Enregistrement…' : edition ? 'Enregistrer les modifications' : 'Enregistrer'}
              </Button>
            </div>
            <p className="text-xs text-accent-500">
              {edition
                ? 'Vous pouvez modifier et régénérer ce bail autant de fois que nécessaire. Le PDF peut aussi être partagé, téléchargé ou imprimé.'
                : "« Enregistrer » crée le bail dans l'app avec son inventaire et sa grille de vétusté. Sinon, rien n'est stocké : le PDF part par partage, téléchargement ou impression."}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
