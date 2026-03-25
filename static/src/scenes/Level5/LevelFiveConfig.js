export const LevelFiveConfig = {
  sceneKey: "LevelFive",
  stageNumber: 5,
  nextScene: "LevelSix",

  map: {
    key: "kingsChamber",
    path: "/static/assets/maps/kingsChamber.tmj",
    tilesets: [
      {
        tiledName: "Castle Tiles",
        imageKey: "tiles_castle",
        imagePath: "/static/assets/LevelDesign/MedievalFantasyTiles1/Castle Tiles.png",
      },
      {
        tiledName: "House Furniture Tiles 32x32",
        imageKey: "tiles_furniture",
        imagePath: "/static/assets/LevelDesign/MedievalFantasyTiles1/House Furniture Tiles 32x32.png",
      },
      {
        tiledName: "Oriental Tiles",
        imageKey: "tiles_oriental",
        imagePath: "/static/assets/LevelDesign/MedievalFantasyTiles1/Oriental Tiles.png",
      },
    ],
  },

  layers: {
    ordered: [
      { name: "Floor", role: "ground" },
      { name: "Decor", role: "decor"},
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
    player: { x: 54, y: 621 },
      extraEnemies: [
   { 
    type: "MiniBossOrc",
    x: 900,
    y: 620
   }
  ],
  },

  enemyObjectLayers: {
  },

  introCutscene: {
    targetX: 150,
    duration: 1000,
  },

  damageTiles: {
    label: "damageTile",
    defaultDamage: 8,
    cooldownMs: 350,
    damageProperty: "damage",
    typeProperty: "damageType",
    oneShotProperty: "oneShot",
    activeProperty: "active",
  },

  autoSpawnEnemies: true,
};