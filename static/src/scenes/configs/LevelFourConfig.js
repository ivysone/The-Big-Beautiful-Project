export const levelFourConfig = {
  sceneKey: "LevelFour",
  stageNumber: 4,
  nextScene: "LevelFive",

  map: {
    key: "castle",
    path: "/static/assets/maps/castleMap.tmj",
    tilesets: [
      {
        tiledName: "Castle Tiles",
        imageKey: "tiles_castle",
        imagePath: "/static/assets/LevelDesign/MedievalFantasyTiles1/Castle Tiles.png",
      },
      {
        tiledName: "House Furniture Tiles 32x32",
        imageKey: "tiles_house_furniture",
        imagePath:
          "/static/assets/LevelDesign/MedievalFantasyTiles1/House Furniture Tiles 32x32.png",
      },
      {
        tiledName: "House Inside Tiles",
        imageKey: "tiles_house_inside",
        imagePath: "/static/assets/LevelDesign/MedievalFantasyTiles1/House Inside Tiles.png",
      },
      {
        tiledName: "Floor Tiles2",
        imageKey: "tiles_floor_2",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Floor Tiles2.png",
      },
      {
        tiledName: "Garden Decorations",
        imageKey: "tiles_garden_decor",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Garden Decorations.png",
      },
      {
        tiledName: "Weeping Willow1",
        imageKey: "tiles_weeping_willow1",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Weeping Willow1.png",
      },
    ],
  },

  layers: {
    ordered: [
      { name: "Background", role: "background" },
      { name: "Floor", role: "ground" },
      { name: "Garden", role: "decor" },
      { name: "Furniture", role: "decor" },
      { name: "Trees", role: "decor" },
    ],
  },


  parallax: {
    layers: [
      {
        key: "bg_forest",
        path: "/static/assets/LevelDesign/PlatformerTiles/background/bg/bg_sky.png",
        y: 0,
        scroll: 0.05,
        scale: 1,
      },
      {
        key: "mountain",
        path: "/static/assets/LevelDesign/PlatformerTiles/background/bg/bg_mountain.png",
        y: 150,
        scroll: 0.1,
        scale: 1,
      },
      {
        key: "tree_1",
        path: "/static/assets/LevelDesign/PlatformerTiles/background/bg/bg_trees3.png",
        y: 170,
        scroll: 0.15,
        scale: 0.8,
      },
      {
        key: "tree_2",
        path: "/static/assets/LevelDesign/PlatformerTiles/background/bg/bg_trees2.png",
        y: 50,
        scroll: 0.18,
        scale: 1.5,
      },
      {
        key: "tree_3",
        path: "/static/assets/LevelDesign/PlatformerTiles/background/bg/bg_trees1.png",
        y: 50,
        scroll: 0.22,
        scale: 1.8,
      },
    ],
  },

  spawns: {
    player: { x: 100, y: 900 },
    npcs: [
      { type: "PeasantNpc", x: 250, y: 900 },
      { type: "KnightNpc", x: 1400, y: 900 },
    ],
  },

  enemyObjectLayers: {
    Archers: "ArcherEnemy",
    Damned: "DamnedEnemy",
    Orcs: "OrcEnemy",
    Goblins: "GoblinEnemy",
    Slimes: "SlimeEnemy",
  },

  introCutscene: {
    targetX: 300,
    duration: 2000,
  },

  damageTiles: {
    label: "damageTile",
    defaultDamage: 5,
    cooldownMs: 400,
    damageProperty: "damage",
    typeProperty: "damageType",
    oneShotProperty: "oneShot",
    activeProperty: "active",
  },

  autoSpawnEnemies: true,
};