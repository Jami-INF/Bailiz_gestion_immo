import { db } from './db';
import { sha256Hex } from './crypto';
import type { DocumentGenere, EtatDesLieux } from '@/types';
import { TYPE_DOCUMENT_LABELS } from '@/types';

/**
 * Vérification d'empreinte : le pendant du hachage posé au pied des documents
 * signés.
 *
 * L'application calcule un SHA-256 à la signature d'un état des lieux et
 * l'imprime sur le PDF. Cette empreinte ne sert à rien tant que personne ne
 * peut la **recalculer** : c'est ce que fait ce module. Un locataire qui doute
 * de l'exemplaire qu'on lui a transmis, un bailleur qui retrouve un vieux PDF
 * dans ses archives, un litige où l'on conteste le contenu d'un document - dans
 * les trois cas la question est la même : « ce fichier est-il bien celui qui a
 * été signé ? »
 *
 * Le contrôle est **local** : le fichier n'est jamais envoyé nulle part.
 */

export type ResultatVerification =
  | {
      statut: 'correspond';
      empreinte: string;
      /** Ce à quoi le fichier correspond, en clair. */
      libelle: string;
      reference: string;
      dateSignature?: string;
      /** Le fichier correspond à une version antérieure, remplacée depuis. */
      rectifie?: boolean;
    }
  | { statut: 'inconnu'; empreinte: string }
  | { statut: 'attendu_different'; empreinte: string; attendu: string };

/** Empreinte normalisée : les PDF l'impriment par groupes de 8 caractères. */
export function normaliserEmpreinte(saisie: string): string {
  return saisie.replace(/\s+/g, '').toLowerCase();
}

/** Vrai si la chaîne a la forme d'un SHA-256 hexadécimal. */
export function empreinteValide(saisie: string): boolean {
  return /^[0-9a-f]{64}$/.test(normaliserEmpreinte(saisie));
}

function libelleDocument(d: DocumentGenere): string {
  return d.titre?.trim() || TYPE_DOCUMENT_LABELS[d.type] || 'Document';
}

/**
 * Compare l'empreinte d'un fichier à tout ce que l'application a signé.
 *
 * Sont examinés les PDF archivés (`documents.hash`) et les états des lieux
 * (`edls.pdfHash`), **y compris leurs versions rectifiées** : un document
 * annulé et remplacé reste un document authentique, et le dire est plus utile
 * que de répondre « inconnu ».
 *
 * `attendu` permet de vérifier un fichier contre une empreinte lue sur un
 * papier, sans que l'application ait le document en base.
 */
export async function verifierFichier(
  fichier: Blob,
  attendu?: string,
): Promise<ResultatVerification> {
  const empreinte = await sha256Hex(fichier);

  if (attendu?.trim()) {
    const cible = normaliserEmpreinte(attendu);
    if (cible !== empreinte) return { statut: 'attendu_different', empreinte, attendu: cible };
  }

  const documents = await db.documents.toArray();
  const document = documents.find((d) => d.hash && normaliserEmpreinte(d.hash) === empreinte);
  if (document) {
    return {
      statut: 'correspond',
      empreinte,
      libelle: libelleDocument(document),
      reference: document.reference,
      dateSignature: document.createdAt,
    };
  }

  const edls = await db.edls.toArray();
  for (const edl of edls) {
    if (edl.pdfHash && normaliserEmpreinte(edl.pdfHash) === empreinte) {
      return {
        statut: 'correspond',
        empreinte,
        libelle: `État des lieux ${edl.type === 'entree' ? "d'entrée" : 'de sortie'}`,
        reference: edl.reference,
        dateSignature: edl.signatures?.dateSignature,
      };
    }
    const anterieure = versionAnterieure(edl, empreinte);
    if (anterieure) {
      return {
        statut: 'correspond',
        empreinte,
        libelle: `État des lieux ${edl.type === 'entree' ? "d'entrée" : 'de sortie'}`,
        reference: edl.reference,
        dateSignature: anterieure.dateSignature,
        rectifie: true,
      };
    }
  }

  return { statut: 'inconnu', empreinte };
}

function versionAnterieure(edl: EtatDesLieux, empreinte: string) {
  return edl.rectifications?.find((r) => r.pdfHash && normaliserEmpreinte(r.pdfHash) === empreinte);
}
