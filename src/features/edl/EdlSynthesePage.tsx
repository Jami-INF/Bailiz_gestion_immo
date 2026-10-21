import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowLeft, FileText } from 'lucide-react';
import { db, lireParametres } from '@/lib/db';
import { nowISO } from '@/lib/ids';
import type { ElementEDL, EtatDesLieux, LigneVetuste } from '@/types';
import { ETAT_LABELS } from '@/types';
import {
  coefficientVetuste,
  dateLimiteRestitution,
  delaiRestitutionMois,
  formatEuros,
  retenueApresVetuste,
  totalRetenues,
  type LigneRetenue,
} from '@/lib/calculs';
import { elementsDegrades } from '@/lib/etat';
import { depotGarantieEdl } from '@/lib/edl';
import { genererEtArchiver, nomsPersonnes } from '@/lib/pdf/generer';
import { LettreRestitutionPdf } from '@/lib/pdf/LettreRestitutionPdf';
import { Button, Card, Field, Input, PageHeader, Select, useToast } from '@/components/ui';
import { chargerContexteEdl } from './edlPdfUtils';

function MiniPhoto({ photoId }: { photoId: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    void db.photos.get(photoId).then((p) => {
      if (p) {
        u = URL.createObjectURL(p.blob);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [photoId]);
  return url ? <img src={url} alt="" className="h-16 w-16 rounded object-cover" /> : null;
}

/**
 * Lignes de retenue d'un EDL de sortie, à la grille de vétusté donnée.
 *
 * Fonction pure, et c'est le point : la même règle sert à l'affichage et à la
 * lettre, qui l'applique à l'enregistrement relu en base (cf. `genererLettre`).
 */
function lignesRetenue(edlSortie: EtatDesLieux, grille: LigneVetuste[]): LigneRetenue[] {
  return elementsDegrades(edlSortie)
    .filter(({ element }) => (element.coutRemiseEnEtat ?? 0) > 0)
    .map(({ pieceNom, element }) => {
      const ligneGrille = grille.find((g) => g.poste === element.posteVetuste);
      const age = element.ageEquipementAnnees ?? 0;
      const coef = ligneGrille ? coefficientVetuste(ligneGrille, age) : 1;
      return {
        pieceNom,
        elementNom: element.nom,
        description: element.commentaire ?? 'Dégradation constatée',
        cout: element.coutRemiseEnEtat ?? 0,
        coefVetuste: coef,
        retenue: retenueApresVetuste(element.coutRemiseEnEtat ?? 0, ligneGrille, age),
      };
    });
}

/** Synthèse comparative de l'EDL de sortie : dégradations, vétusté, retenues. */
export function EdlSynthesePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const edl = useLiveQuery(() => (id ? db.edls.get(id) : undefined), [id]);
  const contexte = useLiveQuery(async () => (edl ? chargerContexteEdl(edl) : undefined), [edl?.id]);
  const parametres = useLiveQuery(() => lireParametres());

  if (!edl || !contexte || !parametres) return null;
  if (edl.type !== 'sortie') {
    return (
      <Card>
        <p className="text-sm text-accent-700">La synthèse comparative n'existe que pour un EDL de sortie.</p>
      </Card>
    );
  }
  const { bail, bien, locataires, depotGarantie } = contexte;
  const degrades = elementsDegrades(edl);
  const grille = parametres.grilleVetuste;

  /**
   * **Point d'écriture unique de la synthèse.**
   *
   * Lecture-modification-écriture atomique, pour la raison exposée en détail
   * sur `ecrireEdl` du mode terrain : `edl` vient de `useLiveQuery` et ne se
   * rafraîchit qu'après un aller-retour IndexedDB. Deux écritures plus
   * rapprochées que ce délai partaient du même instantané et la seconde
   * effaçait la première - quitter le champ « Coût de remise en état » en
   * cliquant droit sur la liste « Poste (grille de vétusté) » suffisait à
   * perdre le montant saisi, le `blur` et le `change` s'enchaînant en quelques
   * millisecondes. D'où la forme fonction, qui calcule les champs depuis
   * l'enregistrement relu en base et non depuis le rendu.
   *
   * Aucune garde de signature ici, à dessein : le coût, l'âge, le poste de
   * vétusté et le dépôt de garantie ne font pas partie du constat signé,
   * seulement du décompte de restitution. C'est dit à chacun de leurs champs.
   */
  const ecrireEdl = (m: (actuel: EtatDesLieux) => Partial<EtatDesLieux>) =>
    void db.transaction('rw', db.edls, async () => {
      const actuel = await db.edls.get(edl.id);
      if (!actuel) return;
      await db.edls.put({ ...actuel, ...m(actuel), updatedAt: nowISO() });
    });

  /**
   * Les champs d'estimation (coût, âge, poste de vétusté) restent modifiables
   * après signature : ils ne font pas partie du constat signé, seulement du
   * décompte de restitution.
   */
  const majElement = (elementId: string, m: Partial<ElementEDL>) =>
    ecrireEdl((e) => ({
      pieces: e.pieces.map((p) => ({
        ...p,
        elements: p.elements.map((el) => (el.id === elementId ? { ...el, ...m } : el)),
      })),
    }));

  const lignes = lignesRetenue(edl, grille);
  const total = totalRetenues(lignes);
  const delai = delaiRestitutionMois(total > 0);
  const dateLimite = edl.signatures
    ? dateLimiteRestitution(new Date(edl.signatures.dateSignature), total > 0)
    : undefined;

  const genererLettre = async () => {
    /*
     * La lettre part de l'EDL **relu en base**, et non de l'instantané de
     * rendu. Les champs d'estimation n'écrivent qu'au `blur` : cliquer droit
     * sur ce bouton depuis le champ « Coût de remise en état » enchaîne `blur`
     * puis `click` plus vite que l'aller-retour IndexedDB qui rafraîchit la
     * page, et le PDF partait alors sur les chiffres d'avant la saisie. Ce
     * document est archivé dans les Documents et tient le décompte opposable au
     * locataire : il ne peut pas valoir moins que ce que montre l'écran.
     */
    const aJour = (await db.edls.get(edl.id)) ?? edl;
    await genererEtArchiver({
      type: 'lettre_restitution',
      titre: `Restitution du dépôt - ${bien.nom} - ${nomsPersonnes(locataires)}`,
      bienId: bien.id,
      bailId: bail?.id,
      edlId: edl.id,
      element: (reference) => (
        <LettreRestitutionPdf
          reference={reference}
          depotGarantie={depotGarantieEdl(aJour, bail)}
          bailReference={bail?.reference ?? aJour.bailExterne?.reference}
          bien={bien}
          locataires={locataires}
          parametres={parametres}
          retenues={lignesRetenue(aJour, grille)}
          autresRetenues={[]}
          dateEdlSortie={aJour.signatures?.dateSignature ?? aJour.date}
          nouvelleAdresse={aJour.nouvelleAdresseLocataire}
        />
      ),
    });
    toast('success', 'Lettre de restitution générée avec le décompte détaillé.');
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <button
        onClick={() => navigate(`/edl/${edl.id}`)}
        className="mb-4 flex items-center gap-1 text-sm font-medium text-accent-700"
      >
        <ArrowLeft size={16} /> Retour à l'état des lieux
      </button>
      <PageHeader
        titre="Synthèse comparative"
        sousTitre={`${edl.reference} - comparaison poste par poste avec l'état des lieux d'entrée`}
      />

      {/*
       * Un solde calculé sur un dépôt à zéro serait faux et crédible : mieux
       * vaut demander le montant que d'annoncer « à restituer : 0 € » à qui a
       * encaissé deux mois de loyer.
       */}
      {depotGarantie === 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">
            Aucun dépôt de garantie n'est renseigné : le solde à restituer ne peut pas être calculé.
            {bail && ' Renseignez-le sur la fiche du bail.'}
          </p>
          {/*
           * Saisissable ici, même après signature : le montant du dépôt ne fait
           * pas partie du constat signé, seulement du décompte de restitution -
           * comme les coûts de remise en état ci-dessous. C'est le seul moment
           * où l'oubli se remarque, il doit être rattrapable sans détour.
           */}
          {!bail && (
            <div className="mt-3 max-w-xs">
              <Field label="Dépôt de garantie versé (€)">
                <Input
                  type="number"
                  min="0"
                  step="10"
                  defaultValue=""
                  onBlur={(e) => {
                    const saisi = e.target.value;
                    ecrireEdl(() => ({
                      depotGarantie: saisi === '' ? undefined : Number(saisi),
                    }));
                  }}
                />
              </Field>
            </div>
          )}
        </Card>
      )}

      {edl.origineEtatEntree === 'aucun' && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">
            Aucun état des lieux d'entrée n'a été établi : il n'y a pas de point de comparaison. Le
            logement est réputé avoir été reçu en bon état (art. 1731 du code civil) et les retenues
            estimées ci-dessous ne sont pas opposables au locataire sur ce seul fondement.
          </p>
        </Card>
      )}

      <Card className="mb-4">
        <p className="text-sm text-accent-700">
          <span className="font-semibold">{degrades.length}</span> élément(s) marqué(s) en
          dégradation. Délai légal de restitution du dépôt de garantie :{' '}
          <span className="font-semibold">{delai} mois</span> après remise des clés
          {dateLimite && (
            <>
              {' '}
              (au plus tard le{' '}
              <span className="font-semibold">{format(dateLimite, 'd MMMM yyyy', { locale: fr })}</span>)
            </>
          )}
          . En cas de retard : majoration de 10 % du loyer mensuel hors charges par mois commencé.
        </p>
      </Card>

      {degrades.length === 0 ? (
        <Card>
          <p className="text-sm text-accent-700">
            Aucune dégradation : l'état des lieux de sortie est conforme à l'entrée. Le dépôt de
            garantie ({formatEuros(depotGarantie)}) est restituable intégralement sous 1 mois.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {degrades.map(({ pieceNom, element }) => {
            const ligneGrille = grille.find((g) => g.poste === element.posteVetuste);
            const age = element.ageEquipementAnnees ?? 0;
            const coef = ligneGrille ? coefficientVetuste(ligneGrille, age) : 1;
            const retenue = retenueApresVetuste(element.coutRemiseEnEtat ?? 0, ligneGrille, age);
            return (
              <Card key={element.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-accent-900">
                    {pieceNom} - {element.nom}
                  </h3>
                  <span className="text-sm text-accent-600">
                    {element.etatEntree && ETAT_LABELS[element.etatEntree]} →{' '}
                    <span className="font-semibold text-red-700">
                      {element.etat && ETAT_LABELS[element.etat]}
                    </span>
                  </span>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-3 text-xs text-accent-500">
                  <div>
                    <p className="mb-1 font-medium">Photos à l'entrée</p>
                    <div className="flex flex-wrap gap-1">
                      {(element.photoIdsEntree ?? []).map((pid) => (
                        <MiniPhoto key={pid} photoId={pid} />
                      ))}
                      {(element.photoIdsEntree ?? []).length === 0 && <p>Aucune</p>}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-medium">Photos à la sortie</p>
                    <div className="flex flex-wrap gap-1">
                      {element.photoIds.map((pid) => (
                        <MiniPhoto key={pid} photoId={pid} />
                      ))}
                      {element.photoIds.length === 0 && <p>Aucune</p>}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Field label="Coût de remise en état (€)">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      key={`${element.id}-cout`}
                      defaultValue={element.coutRemiseEnEtat ?? ''}
                      onBlur={(e) =>
                        majElement(element.id, { coutRemiseEnEtat: Number(e.target.value) || undefined })
                      }
                    />
                  </Field>
                  <Field label="Poste (grille de vétusté)">
                    <Select
                      value={element.posteVetuste ?? ''}
                      onChange={(e) => majElement(element.id, { posteVetuste: e.target.value || undefined })}
                    >
                      <option value="">Sans vétusté (100 %)</option>
                      {grille.map((g) => (
                        <option key={g.poste} value={g.poste}>
                          {g.poste}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Âge de l'équipement (années)">
                    <Input
                      type="number"
                      min="0"
                      key={`${element.id}-age`}
                      defaultValue={element.ageEquipementAnnees ?? ''}
                      onBlur={(e) =>
                        majElement(element.id, { ageEquipementAnnees: Number(e.target.value) || undefined })
                      }
                    />
                  </Field>
                  <div className="flex flex-col justify-end rounded-lg bg-accent-50 p-2 text-sm">
                    <span className="text-xs text-accent-500">Coef. {Math.round(coef * 100)} % → retenue</span>
                    <span className="font-bold text-accent-900">{formatEuros(retenue)}</span>
                  </div>
                </div>
              </Card>
            );
          })}

          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-accent-600">Total des retenues estimées (après vétusté) :</p>
              <p className="text-2xl font-bold text-accent-900">{formatEuros(total)}</p>
              <p className="text-sm text-accent-600">
                Dépôt de garantie : {formatEuros(depotGarantie)} - à restituer :{' '}
                <span className="font-semibold">{formatEuros(Math.max(0, depotGarantie - total))}</span>
              </p>
            </div>
          </Card>
        </div>
      )}

      <div className="mt-4">
        <Button onClick={genererLettre}>
          <FileText size={16} /> Générer la lettre de restitution du dépôt (PDF)
        </Button>
      </div>
    </div>
  );
}
