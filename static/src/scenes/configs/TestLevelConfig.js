export const testLevelConfig = {
  sceneKey: "TestLevel",
  stageNumber: 1,
  nextScene: "LevelOne",

  map: {
    key: "test",
    path: "/static/assets/maps/testLevel.tmj",
    tilesets: [
      {
        tiledName: "TestLevel",
        imageKey: "tiles_hell",
        imagePath: "/static/assets/LevelDesign/HellTiles/hellTilesRed.png",
      },
    ],
  },

  layers: {
    ground: "Tile Layer 1"
  },

  parallax: {
    layers: [
      {
        key: "bg_hell",
        path: "/static/assets/LevelDesign/HellTiles/BGHellRed/Background layer.png",
        y: 0,
        scroll: 0.05,
        scale: 1,
      },
      {
        key: "dune_1",
        path: "/static/assets/LevelDesign/HellTiles/BGHellRed/back layer.png",
        y: 150,
        scroll: 0.1,
        scale: 1,
      },
      {
        key: "dune_2",
        path: "/static/assets/LevelDesign/HellTiles/BGHellRed/middle layer.png",
        y: 170,
        scroll: 0.15,
        scale: 0.8,
      },
      {
        key: "dune_3",
        path: "/static/assets/LevelDesign/HellTiles/BGHellRed/front layer.png",
        y: 50,
        scroll: 0.18,
        scale: 1.5,
      },
    ],
  },

  spawns: {
    player: { x: 0, y: 900 },
    extraEnemies: [
      { type: "SkullBoss", x: 600, y: 820 }
    ],
  },

  enemyObjectLayers: {
  },

  introCutscene: {
    targetX: 300,
    duration: 2000,
  },

  damageTiles: {
    defaultDamage: 10,
    cooldownMs: 500,
  },
};