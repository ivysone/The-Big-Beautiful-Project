export const levelOneConfig = {
  sceneKey: "LevelOne",
  stageNumber: 1,
  nextScene: "LevelTwo",

  map: {
    key: "desert",
    path: "/static/assets/maps/desertMap.tmj",
    tilesets: [
      {
        tiledName: "DesertLevel",
        imageKey: "tiles_desert",
        imagePath: "/static/assets/LevelDesign/DesertTiles/DesertLevel.png",
      },
    ],
  },

  layers: {
    ground: "Floor",
    decor: ["Background", "Sand", "Bushes", "Trees"],
    damage: "DMG",
  },

  parallax: {
    layers: [
      {
        key: "bg_desert",
        path: "/static/assets/LevelDesign/DesertTiles/background/Backgroundlayer.png",
        y: 0,
        scroll: 0.05,
        scale: 1,
      },
      {
        key: "dune_1",
        path: "/static/assets/LevelDesign/DesertTiles/background/Backlayer.png",
        y: 150,
        scroll: 0.1,
        scale: 1,
      },
      {
        key: "dune_2",
        path: "/static/assets/LevelDesign/DesertTiles/background/Middlelayer.png",
        y: 170,
        scroll: 0.15,
        scale: 0.8,
      },
      {
        key: "dune_3",
        path: "/static/assets/LevelDesign/DesertTiles/background/Frontlayer.png",
        y: 50,
        scroll: 0.18,
        scale: 1.5,
      },
    ],
  },

  spawns: {
    player: { x: 0, y: 972 },
    npcs: [
      { type: "PeasantNpc", x: 350, y: 972 },
      { type: "KnightNpc", x: 9470, y: 1036 },
    ],
  },

  enemyObjectLayers: {
    Goblins: "GoblinEnemy",
    Archers: "ArcherEnemy",
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