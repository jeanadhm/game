# Colonie Noire

Jeu 3D de fourmis jouable dans le navigateur, avec deux modes :
- **Mode histoire** : une soldate fourmi noire affronte la colonie rouge pour reprendre trois cocons volés (3 chapitres).
- **Monde ouvert** : un monde infini à explorer, en surface et sous terre. Tu développes ta colonie, nourris ta Reine, lèves des armées, fais la guerre aux colonies rivales ou t'allies avec elles.

## Jouer
Ouvre `index.html` dans un navigateur (ou via GitHub Pages : https://jeanadhm.github.io/game/). Three.js (r128) est chargé depuis un CDN.

Contrôles : ZQSD / WASD pour bouger, souris pour viser, clic pour attaquer, clic droit ou F pour le bouclier, maintenir C pour grimper aux murs et au plafond, V pour voler (Espace monte, C descend), T pour changer de vue, G pour donner un ordre à l'escouade, R pour la rappeler, 1 · 2 · 3 · 4 ou molette pour changer d'arme, Maj pour courir, Espace pour sauter, Échap pour la pause. Version tactile sur mobile.

## Contenu (v4.0)
- 3 chapitres : La Prairie (surface), Les Galeries (terriers, 3 cocons à retrouver), La Chambre royale (boss Major Ignis)
- 4 armes : mandibules, acide formique, graine explosive, dard chargé (paralyse), et un bouclier temporaire (clic droit ou F)
- 6 ennemis : éclaireuse, soldate, cracheuse, Ailée (volante), Méga-soldate (blindée devant, frappe au sol), boss
- Escouade en option : 2 alliées noires (Nyx à l'acide, Brume au corps à corps) qu'on peut relever ; ordres (G : suivre, tenir une position, libre) et rappel d'urgence (R)
- Décor entièrement modélisé dans Blender : cailloux moussus, brindilles, feuilles nervurées, herbe, trèfles, pissenlits, champignons, fourmilière rouge (dôme d'aiguilles de pin), entrée de fourmilière, racines, mycènes lumineuses, arches de tunnel, œufs, larves, cocons
- Mode histoire avec cinématiques de chapitre et présentations des grandes ennemies
- Escalade comme une vraie fourmi : murs, plafonds (tête en bas), cailloux, feuilles, champignons ; Espace pour se détacher
- Marche par cinématique inverse : chaque patte se pose au sol, le corps suit le relief
- Évolutions entre les chapitres, achetées avec le nectar
- 3 difficultés, points de sauvegarde, réglage graphique (halo lumineux, ombres)
- Fourmis modélisées dans Blender (maillage organique, squelette, animations de marche et d'attente), carbonisation à la mort
- Feuilles, cailloux et chapeaux de champignons praticables (rampes, sauts, nectar en hauteur)
- Fourmis anatomiques animées, ombres en temps réel, sons synthétisés, dialogues et récit

## Structure
```
index.html        page, interface, écrans
css/style.css     styles
js/util.js        maths, bruit, textures procédurales
js/audio.js       sons (Web Audio)
js/ant.js         modèle de fourmi et animation
js/world.js       terrain, galeries, décor, collisions, navigation
js/fx.js          particules, projectiles, explosions
js/enemies.js     IA des fourmis rouges, Méga-soldate et boss
js/allies.js      escouade (2 alliées)
js/player.js      joueuse, armes, vue à la première personne, objets
js/hud.js         interface et commandes
js/upgrades.js    nectar, évolutions, difficulté, qualité, sauvegarde
js/post.js        post-traitement (halo lumineux, vignette)
js/levels.js      chapitres, histoire, scripts
js/main.js        rendu, états du jeu, boucle principale
js/openworld.js   monde ouvert infini (génération par morceaux, relief, décor, nourriture)
js/colony.js      colonies, économie, Reine, chambres, diplomatie, guerres, raids, campagne
js/openmain.js    monde ouvert : surface et souterrain, récolte, assauts, minicarte, sauvegarde
js/ui.js          écran de colonie et carte du monde
models/ant.glb    fourmi (maillage + squelette + animations), générée par tools/build_ant.py
models/vm.glb     mandibles de la vue à la première personne
models/nature.glb décor (plantes, pierres, galeries), généré par tools/build_nature.py
tools/build_ant.py  script Blender qui modélise la fourmi
tools/build_nature.py  script Blender qui modélise le décor
```

## Regénérer les modèles 3D
Les modèles sont créés par script avec Blender (gratuit), sans modélisation manuelle :
```
pip install bpy
python tools/build_ant.py models
python tools/build_nature.py models
```

## Versions
- **v5.2** : vue à la troisième personne par défaut (la fourmi est visible : marche, escalade, porte, vole), caméra qui évite le décor, tirs depuis la tête vers le viseur ; T pour passer à la première personne
- **v5.1** : plus de traversée des surfaces (dômes, champignons, cailloux), on enjambe feuilles, bosses et brindilles, caméra droite et lissée, caméra abaissée sous les objets bas, souris libre par défaut (capture en option), vol (V)
- **v5.0** : monde ouvert infini avec colonies, Reine, récolte, chambres, armées, guerres, raids, alliances, campagne
- **v4.2** : escalade maîtrisée (maintenir C, mode Libre en option), caméra plus stable sur les murs, pistes de fourmis vers l'objectif, repère d'objectif, ombres de contact, nuages, vue épurée
- **v4.1** : corps entier des fourmis gardé hors des murs et des objets, sorties de paroi, apparition toujours en zone libre, tirs qui touchent une fourmi collée à un mur
- **v4.0** : escalade de toutes les surfaces, fourmilière modélisée, rochers en bord de carte ; corrections : arches qui bouchaient les tunnels (salle de la reine), ennemies bloquées par les plantes, traversée d'objets
- **v3.1** : tout le décor modélisé dans Blender, collisions exactes sur ces modèles, ordres et rappel de l'escouade
- **v3.0** : marche par IK sans glissement, bouclier, escouade, Méga-soldates, cinématiques, collisions exactes sur les cailloux, vent en rafales et herbe qui s'écarte, tapis d'herbe, profondeur de champ, normal maps
- **v2.1** : fourmis modélisées dans Blender avec squelette et animations, carbonisation à la mort, plateformes (feuilles, cailloux, champignons)
- **v2.0** : dard chargé, Ailées volantes, évolutions au nectar, difficulté, points de sauvegarde, halo lumineux et réglage graphique, barre de vie de la cible
- **v0.1** : prototype (3 chapitres, 3 armes, 4 ennemis, boss)
