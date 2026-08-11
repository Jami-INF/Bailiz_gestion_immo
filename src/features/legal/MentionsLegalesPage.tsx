import { ExternalLink, Github, Linkedin } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui';
import { DISCLAIMER_JURIDIQUE } from '@/components/AppLayout';
import { LIEN_LINKEDIN, LIEN_REPO } from '@/lib/liens';

function LienExterne({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium text-accent-800 underline underline-offset-2 hover:text-accent-900"
    >
      {children}
      <ExternalLink size={13} />
    </a>
  );
}

export function MentionsLegalesPage() {
  return (
    <div>
      <PageHeader titre="Mentions légales & politique de confidentialité" />
      <div className="space-y-4 text-sm leading-relaxed text-accent-700">
        {/*
          Cette page fait doublon avec bailiz.fr/mentions-legales/ et
          /confidentialite/, et c'est voulu : l'application doit rester utilisable
          hors ligne, où les pages du site ne sont pas atteignables. Le renvoi
          désigne la version qui fait référence, sans priver personne du contenu.
        */}
        <Card>
          <p>
            Version de référence, tenue à jour et consultable sans ouvrir
            l'application :{' '}
            <LienExterne href="https://bailiz.fr/mentions-legales/">
              bailiz.fr/mentions-legales
            </LienExterne>{' '}
            et{' '}
            <LienExterne href="https://bailiz.fr/confidentialite/">
              bailiz.fr/confidentialite
            </LienExterne>
            .
          </p>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold text-accent-900">Éditeur du site</h2>
          <p>
            Bailiz est une application web personnelle et gratuite, créée et éditée par{' '}
            <span className="font-medium text-accent-900">Jami Infante</span>, développeur —{' '}
            <LienExterne href={LIEN_LINKEDIN}>
              <Linkedin size={14} /> LinkedIn
            </LienExterne>
            .
          </p>
          <p className="mt-2">
            Le code source est publié sur{' '}
            <LienExterne href={LIEN_REPO}>
              <Github size={14} /> GitHub — Jami-INF/Bailiz_gestion_immo
            </LienExterne>
            .
          </p>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold text-accent-900">Hébergement</h2>
          <p>
            Le site est hébergé en France par <span className="font-medium text-accent-900">OVH
            SAS</span> — 2 rue Kellermann, 59100 Roubaix (
            <LienExterne href="https://www.ovhcloud.com">ovhcloud.com</LienExterne>).
            L'hébergeur ne fait que servir les fichiers de l'application : aucune donnée saisie
            dans Bailiz ne lui est transmise.
          </p>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold text-accent-900">Politique de confidentialité</h2>
          <p className="font-medium text-accent-900">
            Bailiz ne collecte, ne transmet et ne stocke aucune donnée sur un serveur.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              Toutes les données saisies (biens, locataires, baux, états des lieux, photos,
              PDF) sont enregistrées <span className="font-medium">uniquement dans votre navigateur</span>{' '}
              (IndexedDB), sur votre appareil. Elles ne quittent jamais celui-ci, sauf action
              explicite de votre part (export ZIP, envoi d'un PDF par e-mail, dossier de
              sauvegarde que vous choisissez).
            </li>
            <li>
              Aucun compte, aucun cookie, aucun traceur, aucune mesure d'audience par script.
              La fréquentation du site de présentation est estimée à partir des journaux de
              connexion de l'hébergeur, conservés pour une durée limitée ; l'application, elle,
              n'envoie rien.
            </li>
            <li>
              Sauvegarde Google Drive (optionnelle) : si vous l'activez dans les Paramètres,
              l'archive de sauvegarde est envoyée sur <span className="font-medium">votre propre</span>{' '}
              Google Drive, via une autorisation limitée aux seuls fichiers créés par
              l'application. Google agit alors comme votre prestataire de stockage ; vous
              pouvez révoquer cet accès à tout moment (bouton « Déconnecter » ou
              myaccount.google.com → Sécurité).
            </li>
            <li>
              En tant que bailleur, vous êtes responsable du traitement des données
              personnelles de vos locataires que vous saisissez (RGPD) : conservation limitée à
              la durée du bail et aux délais de prescription, et suppression via la page
              Locataires (« supprimer définitivement »). Les personnes concernées exercent
              leurs droits directement auprès de vous.
            </li>
            <li>
              Comme tout hébergeur web, OVH journalise techniquement les adresses IP des
              visiteurs lors du chargement des fichiers du site. Cela ne concerne pas le contenu
              que vous saisissez dans l'application, qui ne quitte jamais votre appareil.
            </li>
          </ul>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold text-accent-900">Avertissement</h2>
          <p>{DISCLAIMER_JURIDIQUE}</p>
        </Card>

        <Card>
          <h2 className="mb-2 font-semibold text-accent-900">Informations techniques</h2>
          <p>
            Application 100 % côté client : React + TypeScript + Vite, données locales
            (IndexedDB via Dexie), PDF générés dans le navigateur (@react-pdf/renderer), PWA
            installable fonctionnant entièrement hors-ligne — pensée pour réaliser des états
            des lieux sur le terrain (cave, parking, immeuble mal couvert) sans connexion.
          </p>
          <h3 className="mb-1 mt-4 font-semibold text-accent-900">
            Créée avec l'assistance de Claude (Anthropic)
          </h3>
          <p>
            Le besoin de départ : un bailleur particulier en LMNP gérant lui-même quelques
            appartements meublés, sans agence, qui doit produire des documents conformes aux
            deux moments clés du cycle locatif — l'entrée du locataire (bail type, inventaire
            du mobilier, état des lieux) et sa sortie (état des lieux comparatif, décompte du
            dépôt de garantie avec vétusté) — le tout sur tablette, parfois hors-ligne, et sans
            payer d'abonnement ni d'infrastructure.
          </p>
          <h3 className="mb-1 mt-4 font-semibold text-accent-900">Spec Driven Development</h3>
          <p>
            Le site a été développé avec{' '}
            <LienExterne href="https://claude.com/claude-code">Claude Code</LienExterne> selon
            une approche « spécification d'abord » : un cahier des charges complet a été rédigé
            en amont (contexte juridique — loi du 6 juillet 1989, décrets 2015-587, 2015-981,
            2016-382 —, modèle de données, architecture imposée, lots de développement
            ordonnés et critères d'acceptation mesurables), puis confié à l'IA qui l'a
            implémenté lot par lot, chaque lot étant vérifié contre ses critères (tests
            unitaires des règles de calcul légales, déroulé complet des parcours dans le
            navigateur) avant de passer au suivant. Le cahier des charges fait partie du dépôt
            (<span className="font-mono text-xs">cdc.md</span>) et reste la référence des
            évolutions —{' '}
            <LienExterne href={LIEN_REPO}>voir le dépôt GitHub</LienExterne>.
          </p>
        </Card>
      </div>
    </div>
  );
}

