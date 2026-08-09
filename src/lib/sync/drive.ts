import {
  appelApiDrive,
  construireCorpsMultipart,
  contexteDrive,
  ErreurApiDrive,
} from '@/lib/gdrive';
import type { DepotDistant, Espace, FichierDistant } from './depot';

/**
 * Dépôt distant adossé à Google Drive : traduit le contrat `DepotDistant` en
 * appels de l'API Drive v3. Aucune règle métier ici — la convergence est
 * décidée dans `protocole.ts`, ce module ne fait que lire et écrire.
 */

const API = 'https://www.googleapis.com/drive/v3';
const API_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

const ESPACES: Espace[] = ['donnees', 'photos', 'documents', 'tombstones', 'archives'];

interface FichierApi {
  id: string;
  name: string;
  modifiedTime?: string;
}

function versFichier(f: FichierApi): FichierDistant {
  return { id: f.id, nom: f.name, modifieLe: f.modifiedTime ?? new Date(0).toISOString() };
}

/** Retrouve (ou crée) un sous-dossier de `Bailiz`. */
async function assurerSousDossier(
  token: string,
  parentId: string,
  nom: string,
): Promise<string> {
  const q = encodeURIComponent(
    `name='${nom}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`,
  );
  const recherche = await appelApiDrive(token, `${API}/files?q=${q}&fields=files(id)`);
  const { files } = (await recherche.json()) as { files: { id: string }[] };
  if (files[0]) return files[0].id;

  const creation = await appelApiDrive(token, `${API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: nom,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  return ((await creation.json()) as { id: string }).id;
}

/*
 * Identifiants des sous-dossiers, retenus pour la durée de la session.
 *
 * Les résoudre coûte une requête chacun, et un cycle a lieu toutes les cinq
 * minutes : sans ce cache, l'ouverture du dépôt pèserait plus que l'échange
 * lui-même. Un dossier supprimé à la main sur le Drive rendrait le cache faux,
 * mais l'écriture échouerait alors franchement plutôt que d'écrire ailleurs —
 * et recharger l'application suffit à repartir.
 */
const sousDossiers = new Map<string, Record<Espace, string>>();

/**
 * Prépare le dépôt : jeton, dossier « Bailiz » et ses sous-dossiers.
 * `null` quand l'autorisation Google n'est pas disponible — la synchronisation
 * est alors simplement reportée.
 */
export async function ouvrirDepotDrive(interactif: boolean): Promise<DepotDistant | null> {
  const contexte = await contexteDrive(interactif);
  if (!contexte) return null;
  const { token, dossierId } = contexte;

  let dossiers = sousDossiers.get(dossierId);
  if (!dossiers) {
    dossiers = {} as Record<Espace, string>;
    for (const espace of ESPACES) {
      dossiers[espace] = await assurerSousDossier(token, dossierId, espace);
    }
    sousDossiers.set(dossierId, dossiers);
  }

  return {
    async lister(espace, filtre) {
      const conditions = [`'${dossiers[espace]}' in parents`, 'trashed=false'];
      // Les filtres sont appliqués par le serveur : un cycle ne rapatrie que ce
      // qu'il demande, quelle que soit la taille du dépôt.
      if (filtre?.depuis) conditions.push(`modifiedTime > '${filtre.depuis}'`);
      if (filtre?.nom) conditions.push(`name='${filtre.nom.replace(/'/g, "\\'")}'`);
      const q = encodeURIComponent(conditions.join(' and '));
      const fichiers: FichierDistant[] = [];
      let pageToken: string | undefined;
      do {
        const url =
          `${API}/files?q=${q}&fields=nextPageToken,files(id,name,modifiedTime)&pageSize=1000` +
          (pageToken ? `&pageToken=${pageToken}` : '');
        const reponse = await appelApiDrive(token, url);
        const page = (await reponse.json()) as {
          files: FichierApi[];
          nextPageToken?: string;
        };
        fichiers.push(...page.files.map(versFichier));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return fichiers;
    },

    async lireTexte(id) {
      const reponse = await appelApiDrive(token, `${API}/files/${id}?alt=media`);
      return reponse.text();
    },

    async lireBlob(id) {
      const reponse = await appelApiDrive(token, `${API}/files/${id}?alt=media`);
      return reponse.blob();
    },

    async ecrire(espace, nom, contenu, idExistant) {
      const blob = typeof contenu === 'string' ? new Blob([contenu]) : contenu;
      const champs = 'id,name,modifiedTime';
      const creer = async () => {
        const { corps, contentType } = construireCorpsMultipart(
          { name: nom, parents: [dossiers[espace]] },
          blob,
        );
        const reponse = await appelApiDrive(
          token,
          `${API_UPLOAD}/files?uploadType=multipart&fields=${champs}`,
          { method: 'POST', headers: { 'Content-Type': contentType }, body: corps },
        );
        return versFichier((await reponse.json()) as FichierApi);
      };
      if (!idExistant) return creer();

      // Un fichier déjà connu est mis à jour (même id) : le dépôt ne doit pas
      // accumuler de doublons du même enregistrement.
      try {
        const reponse = await appelApiDrive(
          token,
          `${API_UPLOAD}/files/${idExistant}?uploadType=media&fields=${champs}`,
          { method: 'PATCH', body: blob },
        );
        return versFichier((await reponse.json()) as FichierApi);
      } catch (e) {
        /*
         * Le fichier a disparu : un autre appareil a supprimé la fiche pendant
         * qu'on la modifiait ici. Abandonner bloquerait le cycle — et donc tout
         * le reste de la file d'attente — pour un cas parfaitement normal en
         * usage à deux appareils. On recrée, et l'arbitrage par horodatage
         * décidera au prochain cycle qui de la suppression ou de la
         * modification l'emporte.
         */
        if (!(e instanceof ErreurApiDrive) || e.statut !== 404) throw e;
        return creer();
      }
    },

    async supprimer(id) {
      await appelApiDrive(token, `${API}/files/${id}`, { method: 'DELETE' });
    },

    async heureServeur() {
      // `about` est le seul point de l'API qui renvoie systématiquement la date
      // du serveur dans l'en-tête HTTP.
      const reponse = await appelApiDrive(token, `${API}/about?fields=user(displayName)`);
      const date = reponse.headers.get('date');
      return date ? new Date(date).toISOString() : new Date().toISOString();
    },
  };
}
