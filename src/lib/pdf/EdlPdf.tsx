import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import type { Bail, Bien, EtatDesLieux, Locataire, Parametres } from '@/types';
import { COMPTEUR_LABELS, ETAT_LABELS } from '@/types';
import { nomBailleur } from '@/lib/bailleur';
import { mentionBail, mentionOrigineEntree } from './edlMentions';
import {
  EntetePdf,
  PiedDePagePdf,
  SignaturesPdf,
  ZoneSignatureManuscrite,
  formatDateFr,
  pdfStyles as s,
} from './commun';

export interface PhotoPourPdf {
  dataUrl: string;
  legende: string;
}

/** Paire avant/après d'un élément dégradé ou manquant, pour le PDF de sortie. */
export interface ComparaisonPhotos {
  pieceNom: string;
  elementNom: string;
  etatEntree?: string;
  etatSortie: string;
  commentaireEntree?: string;
  commentaireSortie?: string;
  photosEntree: PhotoPourPdf[];
  photosSortie: PhotoPourPdf[];
}

/** Colonne « À l'entrée » / « À la sortie » d'une comparaison. */
function ColonnePhotos({ titre, photos: lot }: { titre: string; photos: PhotoPourPdf[] }) {
  return (
    <View style={{ width: '49%' }}>
      <Text style={[s.petit, s.gras, { marginBottom: 3 }]}>{titre}</Text>
      {lot.length === 0 ? (
        <Text style={s.petit}>Aucune photo.</Text>
      ) : (
        lot.map((p, i) => (
          <View key={i} style={{ marginBottom: 4 }}>
            <Image src={p.dataUrl} style={{ width: '100%', height: 120, objectFit: 'cover' }} />
            <Text style={[s.petit, { marginTop: 2 }]}>{p.legende}</Text>
          </View>
        ))
      )}
    </View>
  );
}

interface Props {
  edl: EtatDesLieux;
  edlEntree?: EtatDesLieux; // pour un EDL de sortie
  /**
   * Contrat auquel l'état des lieux sera annexé. **Facultatif** : le bail a pu
   * être rédigé hors de l'application, ou n'être rattaché que plus tard.
   */
  bail?: Bail;
  bien: Bien;
  locataires: Locataire[];
  parametres: Parametres;
  photos: PhotoPourPdf[];
  /** Paires avant/après des éléments dégradés (EDL de sortie uniquement). */
  comparaisons?: ComparaisonPhotos[];
  hash?: string;
}

/**
 * État des lieux d'entrée ou de sortie - conforme au décret n°2016-382
 * du 30 mars 2016. L'EDL de sortie affiche la comparaison poste par poste
 * avec l'EDL d'entrée.
 */
export function EdlPdf({ edl, bail, bien, locataires, parametres, photos, comparaisons = [], hash }: Props) {
  const sortie = edl.type === 'sortie';
  const titre = sortie ? 'État des lieux de sortie' : "État des lieux d'entrée";
  const origineEntree = mentionOrigineEntree(edl);
  // Sans état des lieux d'entrée, la colonne de référence n'est pas « vide » :
  // elle n'existe pas. Le dire évite de laisser croire à un relevé oublié.
  const sansEtatEntree = sortie && edl.origineEtatEntree === 'aucun';
  const b = parametres.bailleur;
  const largeurs = sortie
    ? ['22%', '15%', '15%', '10%', '38%']
    : ['25%', '18%', '57%'];

  return (
    <Document title={`${edl.reference} - ${titre}`} language="fr">
      <Page size="A4" style={s.page}>
        <EntetePdf reference={edl.reference} docTitre={titre} />
        <Text style={s.titre}>{titre}</Text>
        <Text style={s.sousTitre}>
          Établi contradictoirement entre les parties le {formatDateFr(edl.date)} - art. 3-2 de
          la loi n°89-462 du 6 juillet 1989 et décret n°2016-382 du 30 mars 2016.{' '}
          {mentionBail(bail, edl.bailExterne)}
        </Text>
        {edl.rectifications && edl.rectifications.length > 0 && (
          <Text style={[s.petit, { textAlign: 'center', marginBottom: 6 }]}>
            Version rectificative n°{edl.rectifications.length} - annule et remplace la version signée
            du {formatDateFr(edl.rectifications[edl.rectifications.length - 1].dateSignature, true)}
            {edl.rectifications[edl.rectifications.length - 1].pdfHash
              ? `, empreinte ${edl.rectifications[edl.rectifications.length - 1].pdfHash!.slice(0, 16)}…`
              : ''}
            . Rectification établie contradictoirement et re-signée par les deux parties.
          </Text>
        )}

        {origineEntree && (
          <Text style={[s.petit, { textAlign: 'center', marginBottom: 6 }]}>{origineEntree}</Text>
        )}

        <Text style={s.h2}>Localisation du logement</Text>
        <Text style={s.p}>
          {bien.adresse.ligne1}
          {bien.adresse.ligne2 ? `, ${bien.adresse.ligne2}` : ''}, {bien.adresse.codePostal}{' '}
          {bien.adresse.ville}
          {bien.batiment ? `, bâtiment ${bien.batiment}` : ''}
          {bien.etage ? `, étage ${bien.etage}` : ''} - {bien.type}, {bien.surfaceBoutin} m².
        </Text>

        <Text style={s.h2}>Parties</Text>
        <Text style={s.p}>
          Bailleur : {nomBailleur(b)}, {b.adresse}.
        </Text>
        {locataires.map((l) => (
          <Text style={s.p} key={l.id}>
            Locataire : {l.civilite === 'Mme' ? 'Mme' : 'M.'} {l.prenom} {l.nom}, courriel{' '}
            {l.email}.
          </Text>
        ))}
        {sortie && edl.nouvelleAdresseLocataire && (
          <Text style={s.p}>
            Nouvelle adresse du locataire (pour la restitution du dépôt de garantie) :{' '}
            {edl.nouvelleAdresseLocataire}.
          </Text>
        )}

        <Text style={s.h2}>Relevés des compteurs individuels</Text>
        <View style={s.tableau}>
          <View style={s.ligneTableau}>
            {['Compteur', 'Numéro', 'Relevé'].map((t, i) => (
              <Text key={t} style={[s.celluleEnTete, { width: ['30%', '35%', '35%'][i] }]}>
                {t}
              </Text>
            ))}
          </View>
          {edl.compteurs.map((c, i) => (
            <View style={s.ligneTableau} key={i}>
              <Text style={[s.cellule, { width: '30%' }]}>{COMPTEUR_LABELS[c.type]}</Text>
              <Text style={[s.cellule, { width: '35%' }]}>{c.numero ?? '-'}</Text>
              <Text style={[s.cellule, { width: '35%' }]}>{c.releve}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>Clés et badges remis</Text>
        <View style={s.tableau}>
          <View style={s.ligneTableau}>
            {['Désignation', 'Nombre', 'Commentaire'].map((t, i) => (
              <Text key={t} style={[s.celluleEnTete, { width: ['40%', '15%', '45%'][i] }]}>
                {t}
              </Text>
            ))}
          </View>
          {edl.cles.map((c, i) => (
            <View style={s.ligneTableau} key={i}>
              <Text style={[s.cellule, { width: '40%' }]}>{c.designation}</Text>
              <Text style={[s.cellule, { width: '15%' }]}>{c.nombre}</Text>
              <Text style={[s.cellule, { width: '45%' }]}>{c.commentaire ?? ''}</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>Description pièce par pièce</Text>
        <Text style={s.petit}>
          Logement meublé : le présent état des lieux vaut inventaire et état détaillé du mobilier
          (décret n°2015-981). Le mobilier figure avec sa quantité (×N) ; les 11 postes obligatoires
          sont regroupés dans la rubrique « Mobilier obligatoire ».
        </Text>
        {[...edl.pieces]
          .sort((a, bb) => a.ordre - bb.ordre)
          .map((piece) => (
            <View key={piece.id} style={{ marginTop: 6 }} wrap={false}>
              <Text style={s.h3}>{piece.nom}</Text>
              <View style={s.tableau}>
                <View style={s.ligneTableau}>
                  {(sortie
                    ? ['Élément', 'État entrée', 'État sortie', 'Dégrad.', 'Commentaires']
                    : ['Élément', 'État', 'Commentaire']
                  ).map((t, i) => (
                    <Text key={t} style={[s.celluleEnTete, { width: largeurs[i] }]}>
                      {t}
                    </Text>
                  ))}
                </View>
                {piece.elements.map((el) => (
                  <View style={s.ligneTableau} key={el.id}>
                    <Text style={[s.cellule, { width: largeurs[0] }]}>
                      {el.nom}
                      {el.quantite != null ? ` (×${el.quantite})` : ''}
                    </Text>
                    {sortie ? (
                      <>
                        <Text style={[s.cellule, { width: largeurs[1] }]}>
                          {sansEtatEntree
                            ? 'non établi'
                            : el.etatEntree
                              ? ETAT_LABELS[el.etatEntree]
                              : '-'}
                        </Text>
                        <Text style={[s.cellule, { width: largeurs[2] }]}>
                          {el.manquant ? 'Manquant' : el.etat ? ETAT_LABELS[el.etat] : '-'}
                        </Text>
                        <Text style={[s.cellule, { width: largeurs[3] }]}>
                          {el.degradation ? 'OUI' : ''}
                        </Text>
                        <Text style={[s.cellule, { width: largeurs[4] }]}>
                          {[
                            el.commentaireEntree ? `Entrée : ${el.commentaireEntree}` : '',
                            el.commentaire ? `Sortie : ${el.commentaire}` : '',
                          ]
                            .filter(Boolean)
                            .join(' - ')}
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={[s.cellule, { width: largeurs[1] }]}>
                          {el.etat ? ETAT_LABELS[el.etat] : 'Non renseigné'}
                        </Text>
                        <Text style={[s.cellule, { width: largeurs[2] }]}>{el.commentaire ?? ''}</Text>
                      </>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ))}

        {comparaisons.length > 0 && (
          <>
            <Text style={s.h2}>Comparaison avant / après</Text>
            <Text style={s.petit}>
              Éléments dégradés ou manquants constatés à la sortie, avec les clichés pris à
              l'entrée en regard. Cette comparaison fonde les retenues éventuelles sur le dépôt de
              garantie.
            </Text>
            {comparaisons.map((c, i) => (
              <View key={i} style={[s.carte, { marginTop: 8 }]} wrap={false}>
                <Text style={s.gras}>
                  {c.pieceNom} - {c.elementNom}
                </Text>
                <Text style={[s.petit, { marginBottom: 5 }]}>
                  Entrée : {c.etatEntree ?? 'non renseigné'} {'>>'} Sortie : {c.etatSortie}
                  {c.commentaireEntree ? ` · Entrée : ${c.commentaireEntree}` : ''}
                  {c.commentaireSortie ? ` · Sortie : ${c.commentaireSortie}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <ColonnePhotos titre="À l'entrée" photos={c.photosEntree} />
                  <ColonnePhotos titre="À la sortie" photos={c.photosSortie} />
                </View>
              </View>
            ))}
          </>
        )}

        {edl.observationsGenerales && (
          <>
            <Text style={s.h2}>Observations générales</Text>
            <Text style={s.p}>{edl.observationsGenerales}</Text>
          </>
        )}

        {!sortie && (
          <Text style={[s.p, { marginTop: 8 }]}>
            Le locataire peut demander au bailleur de compléter le présent état des lieux dans
            les dix jours suivant sa signature (et, pour le chauffage, pendant le premier mois
            de la période de chauffe).
          </Text>
        )}

        {edl.avenants.length > 0 && (
          <>
            <Text style={s.h2}>Avenants</Text>
            {edl.avenants.map((a, i) => (
              <View key={i}>
                <Text style={s.p}>
                  Avenant du {formatDateFr(a.date)} : {a.texte}
                </Text>
                {a.signatures && <SignaturesPdf signatures={a.signatures} />}
              </View>
            ))}
          </>
        )}

        {edl.signatures ? (
          <SignaturesPdf
            signatures={edl.signatures}
            mention="Le présent état des lieux, établi contradictoirement, est remis à chaque partie au moment de sa signature (remise dématérialisée admise, art. 3-2 loi du 6 juillet 1989)."
          />
        ) : (
          <ZoneSignatureManuscrite locataires={locataires.map((l) => `${l.prenom} ${l.nom}`)} />
        )}
        <PiedDePagePdf hash={hash} />
      </Page>

      {photos.length > 0 && (
        <Page size="A4" style={s.page}>
          <EntetePdf reference={edl.reference} docTitre={`${titre} - Annexe photographique`} />
          <Text style={s.titre}>Annexe photographique</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {photos.map((p, i) => (
              <View key={i} style={{ width: '31%', marginBottom: 10 }} wrap={false}>
                <Image src={p.dataUrl} style={{ width: '100%', height: 110, objectFit: 'cover' }} />
                <Text style={[s.petit, { marginTop: 2 }]}>{p.legende}</Text>
              </View>
            ))}
          </View>
          <PiedDePagePdf hash={hash} />
        </Page>
      )}
    </Document>
  );
}
