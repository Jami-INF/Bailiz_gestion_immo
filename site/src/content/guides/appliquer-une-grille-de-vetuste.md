---
titre: "Appliquer une grille de vétusté : trois cas chiffrés"
titreSeo: "Appliquer une grille de vétusté : cas chiffrés | Bailiz"
description: "Franchise, abattement, durée de vie, part résiduelle : le calcul déroulé sur trois situations réelles, avec les valeurs de la grille fournie par défaut."
chapeau: "La mécanique se comprend mieux en chiffres qu'en définitions. Trois cas, déroulés ligne à ligne."
misAJour: 2026-10-24
outil: /grille-de-vetuste/
outilLibelle: Générer ma grille de vétusté
rang: 9
---

Ce que fait une [grille de vétusté](/grille-de-vetuste/) et comment elle se rédige est expliqué
ailleurs. Ici, on la fait tourner : trois situations, les mêmes valeurs que celles fournies par
défaut dans l'application, et le calcul écrit en entier.

## La formule

Chaque poste porte trois valeurs : une **durée de vie** théorique, une **franchise** en années
pendant laquelle rien n'est abattu, et un **abattement annuel** au-delà.

> Coefficient = 1 − (âge de l'élément − franchise) × abattement annuel
>
> Retenue = coût de remise en état × coefficient

Deux bornes encadrent le résultat. Une **part résiduelle** de 10 % que le coefficient ne descend
pas en dessous tant que la durée de vie n'est pas atteinte. Et la durée de vie elle-même :
au-delà, le coefficient tombe à **zéro**, et plus rien n'est facturable.

## Cas 1 — Peintures du salon, 4 ans, devis 500 €

Valeurs du poste : durée de vie 10 ans, franchise 1 an, abattement 10 % par an.

L'élément a 4 ans. On retire la franchise : 4 − 1 = **3 années abattues**. Trois années à 10 %
font 30 % d'abattement.

> Coefficient = 1 − 0,30 = **0,70**
> Retenue = 500 × 0,70 = **350 €**

Le locataire supporte 350 €, vous supportez les 150 € restants. Sans grille, vous auriez réclamé
500 € et le locataire aurait contesté — avec de bonnes chances, puisque la peinture avait déjà
quatre ans d'usage.

## Cas 2 — Moquette d'une chambre, 5 ans, devis 900 €

Durée de vie 7 ans, franchise 1 an, abattement 15 % par an. La moquette s'use vite, l'abattement
est plus rapide.

5 − 1 = 4 années abattues, soit 60 %.

> Coefficient = 1 − 0,60 = **0,40**
> Retenue = 900 × 0,40 = **360 €**

Un devis presque deux fois plus élevé que le cas précédent aboutit à une retenue comparable. Ce
n'est pas un hasard : c'est exactement ce que la grille est censée produire.

## Cas 3 — Lave-linge hors d'usage, 9 ans, devis 450 €

Durée de vie 8 ans pour l'électroménager. L'appareil en a 9.

L'âge dépasse la durée de vie théorique. Le coefficient tombe à **0 %**, et la retenue à
**0 €** — quel que soit le montant du devis, et même si la panne vient d'une mauvaise
utilisation.

C'est la borne qui surprend le plus les bailleurs, et c'est la plus solide juridiquement : un
équipement au-delà de sa durée de vie est réputé devoir être remplacé de toute façon. Son
remplacement est une charge de propriétaire, pas une dégradation.

La réserve tient à la cause : une **dégradation volontaire** ou un défaut d'entretien manifeste
restent dus en totalité, sans abattement. La grille chiffre l'usure, elle n'absout pas la casse.

## Le plancher de 10 % ne sert presque jamais

Avec les douze postes fournis par défaut, **la part résiduelle de 10 % n'est jamais atteinte** :
la durée de vie arrive toujours la première, et le coefficient saute directement à zéro.

Vérifiez-le sur les peintures. À 9 ans : 1 − (9 − 1) × 10 % = 0,20. À 10 ans, la durée de vie est
atteinte, donc 0. Le coefficient passe de 20 % à 0 sans jamais croiser 10 %.

Le plancher ne devient utile que si vous **allongez une durée de vie** ou **réduisez un
abattement** par rapport aux valeurs fournies. Il est là pour ces cas-là, et c'est une raison de
plus de ne modifier la grille qu'en connaissance de cause.

## Et si l'âge de l'élément est inconnu

Il l'est souvent, sur un logement acheté ancien ou rénové par morceaux. Deux attitudes
soutenables : retenir la date d'entrée dans les lieux du premier locataire comme repère, ou
retenir la date de l'état des lieux d'entrée le plus ancien dont vous disposez.

Ce qu'il ne faut pas faire, c'est retenir « neuf » par défaut. Un élément dont vous ne pouvez pas
dater la pose ne se facture pas à 100 % : c'est à celui qui réclame de prouver, et le doute ne
joue pas en votre faveur.
