import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import type { Bien, TypeBien } from '@/types';
import { db } from '@/lib/db';
import { uid, nowISO } from '@/lib/ids';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Select,
  Stepper,
  Textarea,
  useToast,
} from '@/components/ui';
import { PiecesEditeur } from './PiecesEditeur';
import { DiagnosticsEditeur } from './DiagnosticsEditeur';

const ETAPES = ['Identité', 'Surfaces & équipements', 'Diagnostics', 'Pièces'];

const schemaIdentite = z.object({
  nom: z.string().min(1, 'Le nom du bien est requis'),
  ligne1: z.string().min(1, "L'adresse est requise"),
  codePostal: z.string().regex(/^\d{5}$/, 'Code postal à 5 chiffres'),
  ville: z.string().min(1, 'La ville est requise'),
});

const schemaSurfaces = z.object({
  surfaceBoutin: z.number().positive('Surface loi Boutin requise (m²)'),
  nbPieces: z.number().int().positive('Nombre de pièces requis'),
});

function bienVide(): Bien {
  return {
    id: uid(),
    nom: '',
    adresse: { ligne1: '', codePostal: '', ville: '' },
    type: 'T2',
    surfaceBoutin: 0,
    nbPieces: 1,
    regimeJuridique: 'copropriete',
    equipementsPrivatifs: [],
    partiesCommunes: [],
    annexes: [],
    chauffage: { type: 'individuel', energie: 'électricité' },
    eauChaude: { type: 'individuel', energie: 'électricité' },
    zoneEncadrementLoyers: false,
    diagnostics: [],
    piecesModele: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

function parserAnnexes(texte: string): Bien['annexes'] {
  return texte
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((ligne) => {
      const [type, ...desc] = ligne.split(':');
      const t = type.trim().toLowerCase();
      return {
        type: (['cave', 'parking', 'grenier'].includes(t) ? t : 'autre') as
          | 'cave'
          | 'parking'
          | 'grenier'
          | 'autre',
        description: desc.join(':').trim() || ligne,
      };
    });
}

export function BienFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [etape, setEtape] = useState(0);
  const [bien, setBien] = useState<Bien>(bienVide);
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [charge, setCharge] = useState(!id);
  // Les listes saisies en texte libre restent des chaînes brutes pendant l'édition
  // (un textarea contrôlé par un join/split mangerait les retours à la ligne),
  // et ne sont converties en listes qu'à l'enregistrement.
  const [textes, setTextes] = useState({ equipements: '', communs: '', annexes: '' });

  useEffect(() => {
    if (!id) return;
    void db.biens.get(id).then((b) => {
      if (b) {
        setBien(b);
        setTextes({
          equipements: b.equipementsPrivatifs.join('\n'),
          communs: b.partiesCommunes.join('\n'),
          annexes: b.annexes.map((a) => `${a.type} : ${a.description}`).join('\n'),
        });
      }
      setCharge(true);
    });
  }, [id]);

  if (!charge) return null;

  const maj = (m: Partial<Bien>) => setBien((b) => ({ ...b, ...m }));

  const validerEtape = (): boolean => {
    setErreurs({});
    if (etape === 0) {
      const res = schemaIdentite.safeParse({
        nom: bien.nom,
        ligne1: bien.adresse.ligne1,
        codePostal: bien.adresse.codePostal,
        ville: bien.adresse.ville,
      });
      if (!res.success) {
        setErreurs(Object.fromEntries(res.error.issues.map((i) => [String(i.path[0]), i.message])));
        return false;
      }
    }
    if (etape === 1) {
      const res = schemaSurfaces.safeParse({
        surfaceBoutin: bien.surfaceBoutin,
        nbPieces: bien.nbPieces,
      });
      if (!res.success) {
        setErreurs(Object.fromEntries(res.error.issues.map((i) => [String(i.path[0]), i.message])));
        return false;
      }
      if (bien.zoneEncadrementLoyers && !bien.loyerReferenceMajore) {
        setErreurs({ loyerReferenceMajore: 'Renseignez le loyer de référence majoré' });
        return false;
      }
    }
    return true;
  };

  const suivant = () => {
    if (!validerEtape()) return;
    if (etape < ETAPES.length - 1) setEtape(etape + 1);
  };

  const textToListe = (t: string) => t.split('\n').map((s) => s.trim()).filter(Boolean);

  const enregistrer = async () => {
    if (!validerEtape()) return;
    await db.biens.put({
      ...bien,
      equipementsPrivatifs: textToListe(textes.equipements),
      partiesCommunes: textToListe(textes.communs),
      annexes: parserAnnexes(textes.annexes),
      updatedAt: nowISO(),
    });
    toast('success', id ? 'Bien mis à jour.' : 'Bien créé.');
    navigate(`/biens/${bien.id}`);
  };

  return (
    <div>
      <PageHeader titre={id ? `Modifier — ${bien.nom}` : 'Nouveau bien'} />
      <div className="mb-6">
        <Stepper etapes={ETAPES} courante={etape} />
      </div>
      <Card className="space-y-4">
        {etape === 0 && (
          <>
            <Field
              label="Nom du bien"
              required
              error={erreurs.nom}
              hint="Petit nom interne pour vous y retrouver — il n'apparaît pas sur les documents officiels."
            >
              <Input
                value={bien.nom}
                onChange={(e) => maj({ nom: e.target.value })}
                placeholder="T2 Chamalières"
              />
            </Field>
            <Field label="Adresse" required error={erreurs.ligne1}>
              <Input
                value={bien.adresse.ligne1}
                onChange={(e) => maj({ adresse: { ...bien.adresse, ligne1: e.target.value } })}
                placeholder="12 rue des Prés"
              />
            </Field>
            <Field label="Complément d'adresse">
              <Input
                value={bien.adresse.ligne2 ?? ''}
                onChange={(e) => maj({ adresse: { ...bien.adresse, ligne2: e.target.value } })}
                placeholder="Résidence Les Tilleuls, appartement 14"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Code postal" required error={erreurs.codePostal}>
                <Input
                  value={bien.adresse.codePostal}
                  inputMode="numeric"
                  onChange={(e) => maj({ adresse: { ...bien.adresse, codePostal: e.target.value } })}
                  placeholder="63400"
                />
              </Field>
              <Field label="Ville" required error={erreurs.ville}>
                <Input
                  value={bien.adresse.ville}
                  onChange={(e) => maj({ adresse: { ...bien.adresse, ville: e.target.value } })}
                  placeholder="Chamalières"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Type">
                <Select value={bien.type} onChange={(e) => maj({ type: e.target.value as TypeBien })}>
                  {(['T1', 'T1bis', 'T2', 'T3', 'T4', 'autre'] as const).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Étage">
                <Input
                  value={bien.etage ?? ''}
                  onChange={(e) => maj({ etage: e.target.value })}
                  placeholder="2e"
                />
              </Field>
              <Field label="Bâtiment">
                <Input
                  value={bien.batiment ?? ''}
                  onChange={(e) => maj({ batiment: e.target.value })}
                  placeholder="B"
                />
              </Field>
              <Field label="Régime juridique">
                <Select
                  value={bien.regimeJuridique}
                  onChange={(e) => maj({ regimeJuridique: e.target.value as Bien['regimeJuridique'] })}
                >
                  <option value="copropriete">Copropriété</option>
                  <option value="monopropriete">Monopropriété</option>
                </Select>
              </Field>
            </div>
          </>
        )}

        {etape === 1 && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Surface habitable loi Boutin (m²)"
                required
                error={erreurs.surfaceBoutin}
                hint="Mention obligatoire du bail. Reportez le chiffre de l'attestation de mesurage (hors caves, parkings, balcons, surfaces sous 1,80 m)."
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bien.surfaceBoutin || ''}
                  onChange={(e) => maj({ surfaceBoutin: Number(e.target.value) })}
                  placeholder="42,5"
                />
              </Field>
              <Field
                label="Nombre de pièces principales"
                required
                error={erreurs.nbPieces}
                hint="Séjour et chambres uniquement (la cuisine, la salle de bain et les WC ne comptent pas)."
              >
                <Input
                  type="number"
                  min="1"
                  value={bien.nbPieces || ''}
                  onChange={(e) => maj({ nbPieces: Number(e.target.value) })}
                  placeholder="2"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Chauffage">
                <div className="flex gap-2">
                  <Select
                    value={bien.chauffage.type}
                    onChange={(e) =>
                      maj({ chauffage: { ...bien.chauffage, type: e.target.value as 'individuel' | 'collectif' } })
                    }
                  >
                    <option value="individuel">Individuel</option>
                    <option value="collectif">Collectif</option>
                  </Select>
                  <Input
                    value={bien.chauffage.energie}
                    onChange={(e) => maj({ chauffage: { ...bien.chauffage, energie: e.target.value } })}
                    placeholder="Énergie"
                  />
                </div>
              </Field>
              <Field label="Eau chaude sanitaire">
                <div className="flex gap-2">
                  <Select
                    value={bien.eauChaude.type}
                    onChange={(e) =>
                      maj({ eauChaude: { ...bien.eauChaude, type: e.target.value as 'individuel' | 'collectif' } })
                    }
                  >
                    <option value="individuel">Individuelle</option>
                    <option value="collectif">Collective</option>
                  </Select>
                  <Input
                    value={bien.eauChaude.energie}
                    onChange={(e) => maj({ eauChaude: { ...bien.eauChaude, energie: e.target.value } })}
                    placeholder="Énergie"
                  />
                </div>
              </Field>
            </div>
            <Field
              label="Équipements privatifs"
              hint="Un équipement par ligne (touche Entrée pour passer à la ligne). Ils seront listés dans le bail, partie II."
            >
              <Textarea
                value={textes.equipements}
                onChange={(e) => setTextes({ ...textes, equipements: e.target.value })}
                placeholder={'Cuisine équipée (plaques, four, hotte)\nInterphone\nFibre optique'}
              />
            </Field>
            <Field
              label="Parties et équipements communs"
              hint="Un par ligne. Parties de l'immeuble dont le locataire a la jouissance."
            >
              <Textarea
                value={textes.communs}
                onChange={(e) => setTextes({ ...textes, communs: e.target.value })}
                placeholder={'Ascenseur\nLocal à vélos\nJardin commun'}
              />
            </Field>
            <Field
              label="Annexes (cave, parking…)"
              hint="Une par ligne, au format « type : description ». Types reconnus : cave, parking, grenier (sinon « autre »)."
            >
              <Textarea
                value={textes.annexes}
                onChange={(e) => setTextes({ ...textes, annexes: e.target.value })}
                placeholder={'cave : n°12, sous-sol\nparking : place 8, extérieur'}
              />
            </Field>
            <div className="rounded-lg bg-accent-50 p-4">
              <Checkbox
                label="Le bien est situé en zone d'encadrement des loyers"
                checked={bien.zoneEncadrementLoyers}
                onChange={(e) => maj({ zoneEncadrementLoyers: e.target.checked })}
              />
              <p className="mt-1 text-xs text-accent-500">
                Concerne notamment Paris, Lille, Lyon/Villeurbanne, Bordeaux, Montpellier et
                certaines communes limitrophes. Les loyers de référence sont publiés par la
                préfecture ; l'assistant de bail vérifiera que le loyer respecte le plafond.
              </p>
              {bien.zoneEncadrementLoyers && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <Field label="Loyer de référence (€/mois)">
                    <Input
                      type="number"
                      step="0.01"
                      value={bien.loyerReference ?? ''}
                      onChange={(e) => maj({ loyerReference: Number(e.target.value) || undefined })}
                    />
                  </Field>
                  <Field label="Loyer de référence majoré (€/mois)" error={erreurs.loyerReferenceMajore}>
                    <Input
                      type="number"
                      step="0.01"
                      value={bien.loyerReferenceMajore ?? ''}
                      onChange={(e) => maj({ loyerReferenceMajore: Number(e.target.value) || undefined })}
                    />
                  </Field>
                </div>
              )}
            </div>
          </>
        )}

        {etape === 2 && (
          <DiagnosticsEditeur diagnostics={bien.diagnostics} onChange={(d) => maj({ diagnostics: d })} />
        )}

        {etape === 3 && (
          <PiecesEditeur pieces={bien.piecesModele} onChange={(p) => maj({ piecesModele: p })} />
        )}

        <div className="flex justify-between border-t border-accent-100 pt-4">
          <Button variant="secondary" onClick={() => (etape === 0 ? navigate(-1) : setEtape(etape - 1))}>
            {etape === 0 ? 'Annuler' : 'Précédent'}
          </Button>
          {etape < ETAPES.length - 1 ? (
            <Button onClick={suivant}>Suivant</Button>
          ) : (
            <Button onClick={enregistrer}>Enregistrer le bien</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
