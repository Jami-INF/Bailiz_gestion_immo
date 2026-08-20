import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getParametres } from '@/lib/db';
import { destinationConfiguree } from '@/lib/autosave';
import { DISCLAIMER_JURIDIQUE } from '@/lib/juridique';
import { accueilTermine, consommerRepriseAccueil, marquerAccueilTermine } from '@/lib/accueil';
import { Button, Modal } from '@/components/ui';
import { ChoixDestination } from './ChoixDestination';

/**
 * Premier contact avec l'application, en deux temps : l'avertissement
 * juridique, puis la question qui n'était posée nulle part - où vont les
 * données.
 *
 * **Jamais bloquant.** Le cas d'usage réel est « je suis devant l'appartement,
 * l'état des lieux est maintenant » : une étape obligatoire, qui plus est
 * impossible à franchir sans réseau, condamnerait l'outil au pire moment. La
 * seconde étape se referme donc d'un lien, et la carte du tableau de bord prend
 * le relais aussi longtemps qu'aucune destination n'est choisie.
 */
export function ParcoursAccueil() {
  /*
   * Lecture **brute**, comme l'ancienne modale d'avertissement : c'est l'absence
   * de la ligne qui porte l'information. `lireParametres()` rendrait les valeurs
   * par défaut - donc un `disclaimerAccepte` faux - et la modale s'afficherait
   * par-dessus le premier rendu, pendant que `getParametres()` crée la ligne.
   */
  const params = useLiveQuery(() => db.parametres.get('singleton'));
  const destination = useLiveQuery(() => destinationConfiguree());
  const [ferme, setFerme] = useState(false);
  /*
   * Retour d'un aller-retour chez Google (PWA iOS). S'il a abouti, la
   * destination est configurée et il n'y a plus rien à demander ; sinon, on
   * rouvre la question là où l'utilisateur l'avait laissée plutôt que de le
   * renvoyer sur un tableau de bord muet.
   */
  const [reprise] = useState(consommerRepriseAccueil);

  const pret = params !== undefined && destination !== undefined;
  const avertissementAccepte = Boolean(params?.disclaimerAccepte);

  useEffect(() => {
    /*
     * Appareil déjà configuré : l'accueil n'a plus lieu d'être, et on le retient.
     * Sans cela, tout utilisateur de longue date se verrait poser la question au
     * premier lancement de cette version - et de nouveau chaque fois qu'une
     * autorisation expire, puisque la destination paraîtrait absente.
     */
    if (pret && avertissementAccepte && destination) marquerAccueilTermine();
  }, [pret, avertissementAccepte, destination]);

  if (!pret || ferme) return null;

  if (!avertissementAccepte) {
    return (
      <Modal
        open
        // L'acceptation est la seule sortie : ni croix, ni Échap. Une commande
        // visible qui ne répond pas est pire que pas de commande.
        fermable={false}
        onClose={() => {}}
        title="Avertissement"
        footer={
          <Button
            onClick={() =>
              getParametres().then((p) => db.parametres.put({ ...p, disclaimerAccepte: true }))
            }
          >
            J'ai compris
          </Button>
        }
      >
        <p className="text-sm text-accent-700">{DISCLAIMER_JURIDIQUE}</p>
      </Modal>
    );
  }

  // Destination déjà choisie, ou question déjà posée sur cet appareil : rien.
  if (destination || (accueilTermine() && !reprise)) return null;

  const refermer = () => {
    // « Plus tard » est une réponse : ne pas la reposer à chaque ouverture.
    marquerAccueilTermine();
    setFerme(true);
  };

  return (
    <Modal
      open
      onClose={refermer}
      title="Où sont enregistrées vos données ?"
      wide
      footer={
        <Button variant="ghost" onClick={refermer}>
          Je verrai plus tard
        </Button>
      }
    >
      <ChoixDestination onChoisi={() => setFerme(true)} />
    </Modal>
  );
}
