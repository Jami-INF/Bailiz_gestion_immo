import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { AlertTriangle, Building2, Pencil, Plus } from 'lucide-react';
import type { Bail, ClasseDPE, Locataire, Parametres, SaisieBail, TypeBien } from '@/types';
import { CLASSES_DPE, QUALITE_BAILLEUR_LABELS, TYPES_BIEN, TYPE_BAIL_LABELS } from '@/types';
import { db, getParametres, lireParametres, prochaineReference } from '@/lib/db';
import { bailleurRenseigne, nomBailleur } from '@/lib/bailleur';
import { nowISO } from '@/lib/ids';
import { formatEuros } from '@/lib/calculs';
import { decrireErreur } from '@/lib/erreurs';
import { ouvrirBlob, telechargerBlob } from '@/lib/backup';
import { formatAdresse } from '@/lib/adresse';
import {
  rendrePdf,
  enregistrerDocument,
  nomsPersonnes,
  photoBienEnDataUrl,
} from '@/lib/pdf/generer';
import { BailPdf } from '@/lib/pdf/BailPdf';
import { GrilleVetustePdf } from '@/lib/pdf/GrilleVetustePdf';
import { ActeCautionnementPdf } from '@/lib/pdf/ActeCautionnementPdf';
import {
  appliquerConditionsBien,
  bailVersSaisie,
  conditionsDepuisBail,
  construireDocs,
  dureeParDefaut,
  saisieVide,
} from '@/lib/pdf/bailRapide';
import { LocataireFormModal } from '@/features/locataires/LocataireFormModal';
import { BienRapideModal } from '@/features/biens/BienRapideModal';
import { SectionLocataires } from './SectionLocataires';
import { ApercuBailPanel } from './ApercuBailPanel';
import { ClausesSelecteur } from './ClausesSelecteur';
import {
  Button,
  Checkbox,
  DateInput,
  Field,
  Input,
  PageHeader,
  Section,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';

export function BailRapidePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation() as { state?: { bienId?: string } };
  const { id: bailId } = useParams();
  const edition = Boolean(bailId);
  const parametres = useLiveQuery(() => lireParametres());
  const biens = useLiveQuery(() => db.biens.orderBy('nom').toArray());
  const locatairesEnr = useLiveQuery(() => db.locataires.orderBy('nom').toArray());
  const bailExistant = useLiveQuery(() => (bailId ? db.baux.get(bailId) : undefined), [bailId]);

  const [saisie, setSaisie] = useState<SaisieBail | null>(null);
  const [apercu, setApercu] = useState<{ url: string; blob: Blob } | null>(null);
  const [echecApercu, setEchecApercu] = useState<string | null>(null);
  const [autoApercu, setAutoApercu] = useState(true);
  const [generation, setGeneration] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [modaleBien, setModaleBien] = useState(false);
  /**
   * Modale locataire : `index` = emplacement du bail concerné, `locataire` =
   * fiche à modifier (absent = création). `null` = modale fermée.
   */
  const [modaleLocataire, setModaleLocataire] = useState<{ index: number; locataire?: Locataire } | null>(null);
  const enCoursRef = useRef(false);

  // Amorce la saisie une seule fois : depuis un bail existant (édition) ou vierge (création).
  useEffect(() => {
    if (!parametres || !biens || saisie) return;
    if (edition) {
      if (bailExistant) setSaisie(bailVersSaisie(bailExistant, parametres.bailleur));
    } else {
      // Arrivée depuis la fiche d'un bien : ses conditions de location pré-remplissent le bail.
      const bienId = location.state?.bienId;
      setSaisie(
        appliquerConditionsBien(
          saisieVide(parametres.bailleur, bienId, parametres.clausesBail),
          bienId ? biens.find((b) => b.id === bienId) : undefined,
        ),
      );
    }
  }, [parametres, biens, saisie, edition, bailExistant, location.state]);

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
      const photoDataUrl = await photoBienEnDataUrl(bien.photoId);
      const blob = await rendrePdf(
        <BailPdf
          bail={bail}
          bien={bien}
          locataires={locataires}
          parametres={params}
          photoDataUrl={photoDataUrl}
          brouillon
        />,
      );
      const url = URL.createObjectURL(blob);
      setApercu((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, blob };
      });
      setEchecApercu(null);
    } catch (e) {
      /*
       * Pas de notification : l'aperçu se régénère à chaque frappe, et alerter à
       * chaque échec serait intenable. Mais l'échec est retenu et affiché dans
       * le cadre - une panne durable de génération (la CSP bloquant le PDF, par
       * exemple) se lisait jusqu'ici comme un aperçu vide, et envoyait chercher
       * une erreur de saisie qui n'existait pas.
       */
      console.error(e);
      setEchecApercu(decrireErreur(e));
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

  /*
   * Libère l'URL au démontage, et **seulement** au démontage.
   *
   * L'URL courante passe par une référence : en dépendance de l'effet, le
   * nettoyage se rejouait à chaque aperçu - en double avec la révocation de
   * `setApercu` ci-dessus, et surtout fatal sous `React.StrictMode`, qui joue
   * montage → nettoyage → montage et révoquait donc l'URL encore affichée.
   */
  const apercuRef = useRef<{ url: string } | null>(null);
  useEffect(() => {
    apercuRef.current = apercu;
  }, [apercu]);
  useEffect(
    () => () => {
      if (apercuRef.current) URL.revokeObjectURL(apercuRef.current.url);
    },
    [],
  );

  if (!saisie || !biens || !locatairesEnr) return null;

  const maj = (m: Partial<SaisieBail>) => setSaisie((s) => ({ ...s!, ...m }));
  const majBailleur = (m: Partial<SaisieBail['bailleur']>) =>
    setSaisie((s) => ({ ...s!, bailleur: { ...s!.bailleur, ...m } }));
  const majBien = (m: Partial<SaisieBail['bien']>) =>
    setSaisie((s) => ({ ...s!, bien: { ...s!.bien, ...m } }));
  const majAdresse = (m: Partial<SaisieBail['bien']['adresse']>) =>
    setSaisie((s) => ({ ...s!, bien: { ...s!.bien, adresse: { ...s!.bien.adresse, ...m } } }));
  /** Choix d'un bien : ses conditions de location pré-remplissent les champs vides. */
  const choisirBien = (bienId?: string) =>
    setSaisie((s) =>
      appliquerConditionsBien({ ...s!, bienId }, bienId ? biens.find((b) => b.id === bienId) : undefined),
    );
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
        return { prenom: enr?.prenom ?? '', nom: enr?.nom ?? '' };
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

  /**
   * Acte de cautionnement du garant du locataire `i`, pré-rempli avec ce que le
   * bail connaît déjà ; les champs manquants restent à compléter à la main.
   */
  const telechargerActe = async (i: number) => {
    const l = saisie.locataires[i];
    const enr = l.id ? locatairesEnr.find((x) => x.id === l.id) : undefined;
    const garant = enr?.garant;
    const locataireNom = enr ? `${enr.prenom} ${enr.nom}`.trim() : '';
    const a = bienChoisi?.adresse ?? saisie.bien.adresse;
    const bienAdresse = formatAdresse(a);
    const blob = await rendrePdf(
      <ActeCautionnementPdf
        bailleur={saisie.bailleur}
        garant={garant}
        locataireNom={locataireNom || undefined}
        bienAdresse={bienAdresse || undefined}
        loyerHC={saisie.loyerHC}
        charges={saisie.charges.montant}
        typeBailLabel={TYPE_BAIL_LABELS[saisie.typeBail]}
        dureeMois={saisie.dureeMois}
      />,
    );
    const nomGarant = garant ? `${garant.prenom ?? ''} ${garant.nom ?? ''}`.trim() : '';
    ouvrirBlob(blob, `Acte de cautionnement${nomGarant ? ` - ${nomGarant}` : ''}.pdf`);
  };

  const enregistrer = async () => {
    setEnregistrement(true);
    // Code de l'étape en cours : affiché en cas d'échec pour localiser la panne
    // depuis une tablette, où la console du navigateur n'est pas consultable.
    let etape = 'E1 (paramètres)';
    try {
      // Un emplacement de locataire laissé vide n'est pas référencé par le bail
      // enregistré (l'aperçu, lui, continue d'afficher des pointillés).
      const saisieEnr: SaisieBail = {
        ...saisie,
        locataires: saisie.locataires.filter((l) => l.id),
      };
      const params = await getParametres();
      // Répercute le bailleur saisi ici vers les Paramètres, à chaque bail : le
      // bailleur personne physique reste modifiable dans ce formulaire (cf.
      // Section « Bailleur » plus bas), donc rien ne garantit qu'il était déjà
      // complet la première fois. Se limiter à « si les Paramètres sont vides »
      // figeait un nom saisi seul (sans prénom) dès le premier bail : un champ
      // rempli suffit à `bailleurRenseigne` pour ne plus jamais reporter le
      // prénom complété ensuite.
      const bailleurEnr = bailleurRenseigne(saisie.bailleur) ? saisie.bailleur : params.bailleur;
      if (bailleurRenseigne(saisie.bailleur)) {
        await db.parametres.put({ ...params, bailleur: saisie.bailleur });
      }
      const paramsPdf: Parametres = { ...params, bailleur: bailleurEnr };
      const today = format(new Date(), 'yyyy-MM-dd');

      // --- Mode édition : met à jour le bail et régénère son PDF (inventaire/grille inchangés) ---
      if (edition && bailExistant) {
        etape = 'E2 (construction du bail)';
        const { bail: brut, bien, locataires } = construireDocs(
          saisieEnr,
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
          clauses: brut.clauses,
          resiliationResidencePrincipale: brut.resiliationResidencePrincipale,
          annexesChecklist: brut.annexesChecklist,
          updatedAt: nowISO(),
        };
        etape = 'E3 (écriture en base)';
        await db.transaction('rw', [db.biens, db.locataires, db.baux], async () => {
          if (!saisieEnr.bienId || !resolveBien(saisieEnr.bienId)) await db.biens.put(bien);
          // Bien enregistré : ses conditions de location suivent le bail (loyer,
          // charges, dépôt) - la fiche du bien et la fiche de visite restent justes.
          else
            await db.biens.put({
              ...bien,
              conditionsLocation: conditionsDepuisBail(bien, bailMaj),
              updatedAt: nowISO(),
            });
          await db.baux.put(bailMaj);
        });
        const nomsMaj = nomsPersonnes(locataires);
        etape = 'E4 (génération du PDF)';
        const blob = await rendrePdf(
          <BailPdf
            bail={bailMaj}
            bien={bien}
            locataires={locataires}
            parametres={paramsPdf}
            photoDataUrl={await photoBienEnDataUrl(bien.photoId)}
            brouillon
          />,
        );
        etape = 'E5 (enregistrement du PDF)';
        await enregistrerDocument({
          reference: bailMaj.reference,
          type: 'bail',
          titre: `Bail meublé - ${bien.nom} - ${nomsMaj}`,
          blob,
          bienId: bien.id,
          bailId: bailMaj.id,
        });
        toast('success', `Bail ${bailMaj.reference} mis à jour et régénéré.`);
        navigate(`/baux/${bailMaj.id}`);
        return;
      }

      // --- Mode création : bail + inventaire + grille de vétusté ---
      etape = 'E2 (numérotation)';
      const reference = await prochaineReference('bail');
      const refGrille = await prochaineReference('document');
      etape = 'E3 (construction du bail)';
      const { bail, bien, locataires } = construireDocs(saisieEnr, reference, resolveBien, resolveLocataire);

      // Un bail persisté doit avoir une date valide (les pages de suivi la supposent).
      const bailFinal = {
        ...bail,
        statut: 'genere' as const,
        dateEffet: bail.dateEffet || format(new Date(), 'yyyy-MM-dd'),
      };

      etape = 'E4 (génération des PDF)';
      const blobBail = await rendrePdf(
        <BailPdf
          bail={bailFinal}
          bien={bien}
          locataires={locataires}
          parametres={paramsPdf}
          photoDataUrl={await photoBienEnDataUrl(bien.photoId)}
          brouillon
        />,
      );
      const blobGrille = await rendrePdf(
        <GrilleVetustePdf reference={refGrille} grille={params.grilleVetuste} bailReference={reference} />,
      );

      etape = 'E5 (écriture en base)';
      await db.transaction('rw', [db.biens, db.locataires, db.baux], async () => {
        if (!saisieEnr.bienId || !resolveBien(saisieEnr.bienId)) await db.biens.put(bien);
        else
          await db.biens.put({
            ...bien,
            conditionsLocation: conditionsDepuisBail(bien, bailFinal),
            updatedAt: nowISO(),
          });
        await db.baux.add(bailFinal);
      });

      const noms = nomsPersonnes(locataires);
      etape = 'E6 (enregistrement des PDF)';
      await enregistrerDocument({ reference, type: 'bail', titre: `Bail meublé - ${bien.nom} - ${noms}`, blob: blobBail, bienId: bien.id, bailId: bail.id });
      await enregistrerDocument({ reference: refGrille, type: 'grille_vetuste', titre: `Grille de vétusté - ${bien.nom} - annexe du bail ${reference}`, blob: blobGrille, bienId: bien.id, bailId: bail.id });

      toast('success', `Bail ${reference} enregistré. L'inventaire du mobilier sera réalisé avec l'état des lieux d'entrée.`);
      navigate(`/baux/${bail.id}`);
    } catch (e) {
      console.error(`Enregistrement du bail - échec ${etape}`, e);
      toast('error', `Échec à l'étape ${etape} : ${decrireErreur(e)}`);
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
            ? 'Le bail reste modifiable et régénérable à volonté - c’est le document imprimé qui fait foi. « Enregistrer les modifications » met à jour le bail et régénère son PDF.'
            : 'Le bien et les locataires peuvent être saisis ici sans être enregistrés.'
        }
      />

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(460px,50%)] xl:items-start xl:gap-6">
        {/* ------------------------- Formulaire ------------------------- */}
        <div className="space-y-4">
          <Section titre="Bailleur" description="Pré-rempli depuis vos Paramètres si renseigné.">
            {/*
              Indivision et personne morale demandent une identité structurée
              (coïndivisaires, dénomination, RCS, représentant légal) qui n'a pas
              sa place dans un formulaire de bail : on la lit, on ne la ressaisit
              pas. Le cas courant - bailleur personne physique - reste modifiable
              ici, pour qu'un premier bail se produise sans détour par les
              Paramètres.
            */}
            {saisie.bailleur.qualite !== 'personne_physique' ? (
              <div className="rounded-lg border border-accent-200 bg-accent-50 p-3 text-sm">
                <p className="font-medium text-accent-900">{nomBailleur(saisie.bailleur) || '-'}</p>
                <p className="mt-0.5 text-accent-600">
                  {QUALITE_BAILLEUR_LABELS[saisie.bailleur.qualite]} · {saisie.bailleur.adresse || 'adresse non renseignée'}
                </p>
                <Link
                  to="/parametres"
                  className="mt-2 inline-block font-medium text-accent-800 underline underline-offset-2"
                >
                  Modifier dans les Paramètres
                </Link>
              </div>
            ) : (
            <>
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            </>
            )}
          </Section>

          <Section titre="Logement">
            {/*
              Aucun bien enregistré : le sélecteur n'aurait que « Saisir un
              logement ici » comme option, déjà sélectionnée par défaut - ce qui
              affichait le formulaire de saisie libre juste sous le bouton
              « Créer un logement », donnant l'impression de deux formulaires
              d'ajout pour la même chose. Un seul point d'entrée tant qu'aucun
              bien n'existe : la popup.
            */}
            {biens.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-accent-300 p-4 text-sm text-accent-600 sm:flex-row sm:items-center sm:justify-between">
                <span>Aucun bien enregistré pour l’instant.</span>
                <Button variant="secondary" onClick={() => setModaleBien(true)} className="shrink-0">
                  <Plus size={16} /> Créer un logement
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <Field label="Bien" hint="Choisissez un bien enregistré (toutes ses infos sont utilisées, loyer et charges compris), créez-le, ou saisissez-le ici sans l'enregistrer.">
                      <Select
                        value={saisie.bienId ?? ''}
                        onChange={(e) => choisirBien(e.target.value || undefined)}
                      >
                        <option value="">- Saisir un logement ici -</option>
                        {biens.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.nom} ({b.adresse.ville})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Button variant="secondary" onClick={() => setModaleBien(true)} className="shrink-0">
                    <Plus size={16} /> Créer un logement
                  </Button>
                </div>
                {bienChoisi ? (
                  <div className="flex items-start gap-3 rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
                    <Building2 size={18} className="mt-0.5 shrink-0 text-accent-500" />
                    <div>
                      <div className="font-medium text-accent-900">{bienChoisi.nom}</div>
                      {bienChoisi.type} · {bienChoisi.surfaceBoutin} m² · {formatAdresse(bienChoisi.adresse)}
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
                          <option value="">-</option>
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
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <Field label="Surface Boutin (m²)" required>
                        <Input type="number" step="0.01" min="0" value={saisie.bien.surfaceBoutin ?? ''} onChange={(e) => majBien({ surfaceBoutin: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </Field>
                      <Field label="Nb de pièces" required>
                        <Input type="number" min="0" value={saisie.bien.nbPieces ?? ''} onChange={(e) => majBien({ nbPieces: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </Field>
                      <Field label="Classe DPE">
                        <Select value={saisie.bien.classeDPE ?? ''} onChange={(e) => majBien({ classeDPE: (e.target.value || undefined) as ClasseDPE })}>
                          <option value="">-</option>
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
              </>
            )}
          </Section>

          <SectionLocataires
            saisie={saisie}
            locatairesEnr={locatairesEnr}
            coloc={coloc}
            maj={maj}
            majLoc={majLoc}
            onCreerLocataire={(i) => setModaleLocataire({ index: i })}
            onModifierLocataire={(i) => {
              const id = saisie.locataires[i]?.id;
              const fiche = id ? locatairesEnr.find((x) => x.id === id) : undefined;
              if (fiche) setModaleLocataire({ index: i, locataire: fiche });
            }}
            onTelechargerActe={(i) => void telechargerActe(i)}
          />

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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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

          <Section
            titre="Conditions générales d'occupation"
            description="Partie X du bail : visites, entretien, assurance, vie de l'immeuble."
          >
            <ClausesSelecteur
              catalogue={parametres?.clausesBail ?? []}
              retenues={saisie.clauses ?? []}
              bien={bienChoisi}
              onChange={(clauses) => maj({ clauses })}
              onReprendreModele={
                edition
                  ? () =>
                      maj({
                        clauses: (parametres?.clausesBail ?? [])
                          .filter((c) => c.active)
                          .map((c) => ({ ...c })),
                      })
                  : undefined
              }
            />
            {bienChoisi?.servitudeResidencePrincipale && (
              <Checkbox
                label="Ajouter le non-respect de la résidence principale aux motifs de résiliation de plein droit"
                checked={saisie.resiliationResidencePrincipale ?? false}
                onChange={(e) => maj({ resiliationResidencePrincipale: e.target.checked })}
              />
            )}
          </Section>

          <Section titre="Clauses & travaux">
            <p className="rounded-lg bg-accent-50 p-3 text-sm text-accent-700">
              La <span className="font-medium">clause résolutoire</span> pour défaut de paiement du
              loyer, des charges ou du dépôt de garantie est obligatoire depuis la loi du 27
              juillet 2023 : elle est systématiquement insérée, avec les motifs « défaut
              d'assurance » et « troubles de voisinage ».
            </p>
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
        <ApercuBailPanel
          apercu={apercu}
          generation={generation}
          echec={echecApercu}
          autoApercu={autoApercu}
          onAutoApercuChange={setAutoApercu}
          onRegenerer={() => void genererApercu()}
          onPartager={() => void partager()}
          onEnregistrer={() => void enregistrer()}
          nomFichier={nomFichier}
          enregistrement={enregistrement}
          pret={pret}
          edition={edition}
        />
      </div>

      <BienRapideModal
        open={modaleBien}
        onClose={() => setModaleBien(false)}
        onCree={(b) => choisirBien(b.id)}
      />
      <LocataireFormModal
        open={modaleLocataire !== null}
        onClose={() => setModaleLocataire(null)}
        locataire={modaleLocataire?.locataire}
        onEnregistre={(l) => {
          if (modaleLocataire) majLoc(modaleLocataire.index, { id: l.id });
        }}
      />
    </div>
  );
}
