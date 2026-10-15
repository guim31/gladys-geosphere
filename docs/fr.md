# GeoSphere Austria

La météo officielle de l'**Autriche** dans Gladys, par **GeoSphere Austria** (ex-ZAMG), le service
météo national autrichien : les mesures de la **station météo TAWES** la plus proche toutes les 10
minutes, les **prévisions** de son modèle à 2,5 km, et les **avertissements météo officiels**
(tempête, pluie, neige, verglas, orage, canicule, grand froid).

Données ouvertes : ni compte, ni clé d'API. Cette intégration n'a aucun lien avec GeoSphere
Austria.

> Développée sans accès à l'API GeoSphere réelle, à partir de réponses publiées des services :
> vos retours sont les bienvenus.

## Présentation

- **Deux appareils** : la station la plus proche (température, humidité, pression, vent, rafales,
  pluie, ensoleillement, hauteur de neige) et votre lieu (prévisions des 24 prochaines heures et du
  lendemain, niveaux d'avertissement).
- **Un déclencheur de scène**, « Nouvel avertissement GeoSphere », dès qu'un avertissement est
  annoncé, souvent des heures avant son début.
- **Un widget** de tableau de bord avec les mesures, la courbe de température des 24 prochaines
  heures, les avertissements et les prévisions du lendemain.
- **Lecture seule** : GeoSphere est une source de données, rien n'est piloté.

## Prérequis

- Gladys **5.2.0** ou plus récent.
- Un lieu en **Autriche** (les prévisions couvrent aussi les régions voisines, les stations et les
  avertissements seulement l'Autriche).
- Votre maison Gladys placée sur la carte (**Paramètres → Maisons**), ou des coordonnées saisies
  dans la configuration.
- Gladys doit accéder à Internet (`dataset.api.hub.geosphere.at` et `warnungen.zamg.at`).

## Configuration

Installez l'intégration depuis **Intégrations → Installer depuis GitHub** (ou depuis le store),
puis ouvrez sa configuration. Tous les champs sont facultatifs : par défaut, l'intégration prend la
position de votre première maison placée, la station la plus proche, et se rafraîchit toutes les
10 minutes.

| Champ                              | Usage                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Maison                             | La maison dont la position est utilisée. Vide : la première maison qui a une position.                                             |
| Latitude, Longitude                | Un autre lieu qu'une maison, par exemple `47,07` et `15,44` (le point marche aussi). Les deux, ou aucune.                          |
| Station météo                      | L'identifiant d'une station GeoSphere, par exemple `11035` (Wien/Hohe Warte). Vide : la plus proche.                               |
| Fréquence de rafraîchissement      | 10, 15, 30 ou 60 minutes. Les stations publient toutes les 10 minutes.                                                             |
| Langue des noms de fonctionnalités | Langue des noms de fonctionnalités (fixés à la création des appareils) et des textes des événements de scène. Français par défaut. |

La position de la maison est lue grâce à la permission `location` de Gladys, affichée à
l'installation. Elle n'est envoyée qu'à GeoSphere Austria, pour obtenir les prévisions et les
avertissements du lieu, et n'est jamais écrite dans les journaux.

Ouvrez ensuite l'onglet **Découverte** de l'intégration et ajoutez les deux appareils à Gladys.

## Appareils

### Station

Le nom est « GeoSphere » suivi du nom de la station. Valeurs de la dernière observation sur 10
minutes :

| Fonctionnalité                    | Unité | Remarque                                                        |
| --------------------------------- | ----- | --------------------------------------------------------------- |
| Température                       | °C    | Température de l'air, à 2 m                                     |
| Point de rosée                    | °C    |                                                                 |
| Humidité                          | %     |                                                                 |
| Pression (niveau de la mer)       | hPa   | Pression ramenée au niveau de la mer, comme dans les prévisions |
| Vitesse du vent                   | km/h  | Moyenne sur 10 minutes                                          |
| Rafales                           | km/h  | Plus forte rafale des 10 dernières minutes                      |
| Direction du vent                 | °     | D'où vient le vent : 0 = nord, 90 = est                         |
| Intensité de pluie                | mm/h  | Pluie des 10 dernières minutes, ramenée à l'heure               |
| Ensoleillement (10 dernières min) | min   | 0 à 10                                                          |
| Hauteur de neige                  | cm    |                                                                 |

Une station qui ne mesure pas une valeur (beaucoup n'ont ni héliographe ni capteur de neige) laisse
la fonctionnalité vide. Une station muette depuis plus de 3 heures n'est pas republiée comme
actuelle.

### Lieu

Le nom est « GeoSphere » suivi du nom de la maison (ou des coordonnées). Prévisions du modèle au
lieu, et avertissements de sa commune :

| Fonctionnalité                 | Unité | Remarque                                                                  |
| ------------------------------ | ----- | ------------------------------------------------------------------------- |
| Temps                          | texte | Le temps de l'heure à venir, ex. « Partiellement nuageux »                |
| Minimale 24 prochaines h       | °C    |                                                                           |
| Maximale 24 prochaines h       | °C    |                                                                           |
| Précipitations 24 prochaines h | mm    |                                                                           |
| Rafale max 24 prochaines h     | km/h  |                                                                           |
| Minimale demain                | °C    | Demain dans le fuseau horaire de Gladys                                   |
| Maximale demain                | °C    |                                                                           |
| Précipitations demain          | mm    |                                                                           |
| Niveau d'avertissement         | 0 à 3 | Plus haut niveau en cours : 0 aucun, 1 jaune, 2 orange, 3 rouge           |
| Avertissement tempête          | 0 à 3 | Niveau en cours pour ce type                                              |
| Avertissement pluie            | 0 à 3 |                                                                           |
| Avertissement neige            | 0 à 3 |                                                                           |
| Avertissement verglas          | 0 à 3 |                                                                           |
| Avertissement orage            | 0 à 3 |                                                                           |
| Avertissement canicule         | 0 à 3 |                                                                           |
| Avertissement grand froid      | 0 à 3 |                                                                           |
| Avertissements météo           | texte | Les avertissements en cours ou annoncés, ex. « Orange · Tempête → 18:00 » |

Les niveaux sont ceux **en cours** : un avertissement annoncé les relève à son début. Pour agir dès
l'annonce, utilisez le déclencheur de scène.

## Widget

**Météo GeoSphere** affiche, dans la langue et les unités du tableau de bord :

- le nom du lieu, puis la température, l'humidité, le vent et les rafales de la station ;
- la courbe de température des 24 prochaines heures ;
- les avertissements en cours (jusqu'à quand) et annoncés (à partir de quand), ou une ligne verte
  « Aucun » ;
- le temps de l'heure à venir, les 24 prochaines heures et demain (minimale, maximale, pluie) ;
- la source et l'heure de l'observation.

## Déclencheur de scène

**Nouvel avertissement GeoSphere** se déclenche quand GeoSphere Austria émet un avertissement pour
le lieu, ou en relève le niveau : une fois par avertissement et par niveau, dès l'annonce. Un
redémarrage ne le déclenche pas de nouveau. Le tout premier démarrage prend seulement note des
avertissements déjà émis.

Filtres (vide = tous) : **Types d'avertissement** (tempête, pluie, neige, verglas, orage,
canicule, grand froid) et **Niveaux** (jaune, orange, rouge).

Informations transmises aux actions de la scène : type d'avertissement, niveau, niveau (1 à 3),
début, fin, déjà en cours, niveau relevé, texte officiel (en allemand, ou en anglais pour les
autres langues) et commune. Par exemple, un message : `GeoSphere : avertissement
{{triggerEvent.data.type_label}} {{triggerEvent.data.level_label}} de
{{triggerEvent.data.starts_at}} à {{triggerEvent.data.ends_at}}`.

## Actions de configuration

- **Lister les stations proches** : les 8 stations actives les plus proches du lieu, avec leur
  identifiant, leur région, leur altitude et leur distance. Copiez un identifiant dans « Station
  météo » pour en choisir une autre (une station de la même vallée convient souvent mieux que la
  plus proche derrière une montagne).
- **Tester la connexion** : lit toutes les sources tout de suite et dit ce qui a répondu : la
  température de la station et son heure, les prévisions, le nombre d'avertissements.

## Exemples de scènes

- **Tempête en approche** : déclencheur « Nouvel avertissement GeoSphere », types « Tempête » et
  « Orage », niveaux « Orange » et « Rouge » → fermer les volets, rentrer le store, envoyer un
  message avec l'heure de début.
- **Journée de canicule** : quand la fonctionnalité « Avertissement canicule » devient supérieure
  ou égale à 2 → fermer les volets côté sud à 10 h et envoyer un rappel pour boire.
- **Gel cette nuit** : chaque soir à 20 h, si « Minimale 24 prochaines h » est sous 0 °C →
  prévenir de protéger les plantes et le pare-brise.

## Dépannage

- **« Aucun lieu »** : aucune maison n'a de position. Placez votre maison sur la carte dans
  **Paramètres → Maisons**, ou saisissez des coordonnées, ou choisissez une station.
- **« Hors de la zone couverte par GeoSphere Austria »** : le lieu est hors de la zone du modèle
  (latitude 43 à 51,8, longitude 5,5 à 22,1).
- **« GeoSphere Austria ne répond pas »** : Gladys n'atteint pas le service ; les valeurs seront
  mises à jour à son retour. Les journaux disent quelle source échoue, une fois, et quand elle
  remarche.
- **Une fonctionnalité reste vide** : la station ne la mesure pas. Choisissez une autre station
  avec **Lister les stations proches**.
- **Plus de détails** : mettez la variable `LOG_LEVEL` du conteneur à `debug`.

## Limites

- **Données** : données ouvertes de GeoSphere Austria, licence
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.fr) (« Source : GeoSphere Austria »,
  affiché par le widget).
- **Requêtes** : environ 13 par heure au rythme par défaut (observation et avertissements à chaque
  rafraîchissement, prévisions une fois par heure, liste des stations une fois par jour), très en
  dessous des limites publiées par le GeoSphere Data Hub (5 requêtes par seconde, 240 par heure, au
  moment de l'écriture).
- Un lieu et une station par installation.
- Les noms des fonctionnalités sont fixés à la création des appareils : changer la langue ensuite
  ne les renomme pas.
- L'API des avertissements est celle du site d'avertissements de GeoSphere ; GeoSphere peut la
  modifier sans préavis.
- Développée sans accès à l'API réelle : les formats viennent des réponses publiées par python-zamg
  et ioBroker.weather-warnings. Vos retours sont les bienvenus.
