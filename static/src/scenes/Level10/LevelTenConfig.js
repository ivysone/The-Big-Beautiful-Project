export const levelTenConfig = {
  sceneKey: "LevelTen",
  stageNumber: 10,
  nextScene: null,

  map: {
    key: "finalLevel",
    path: "/static/assets/maps/finalLevel.tmj",
    tilesets: [
      {
        tiledName: "Old Tree",
        imageKey: "tiles_old_tree",
        imagePath: "/static/assets/LevelDesign/MedievalFantasyTiles1/Old Tree.png",
      },
      {
        tiledName: "GandalfHardcore Lava Tiles",
        imageKey: "tiles_lava",
        imagePath: "/static/assets/LevelDesign/HellTiles/GandalfHardcore Lava Tiles.png",
      },
      {
        tiledName: "GandalfHardcore Hell Tiles 32x32",
        imageKey: "tiles_hell_a",
        imagePath: "/static/assets/LevelDesign/HellTiles/hellTilesRed.png",
      },
      {
        tiledName: "GandalfHardcore Hell Tiles 32x32",
        imageKey: "tiles_hell_b",
        imagePath: "/static/assets/LevelDesign/HellTiles/hellTilesRed.png",
      },
    ],
  },

  layers: {
    ordered: [
      { name: "Floor", role: "ground" },
      { name: "Fire", role: "decor" },
      { name: "Tree", role: "decor" },
      { name: "Decor", role: "decor" },
      { name: "DMG", role: "damage" },
    ],
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
    player: { x: 2000, y: 684 },

    extraEnemies: [
      {
        type: "SkullBoss",
        x: 2000,
        y: 500,
      },
    ],

    npcs: [],
  },

  introCutscene: {
    targetX: 2000,
    duration: 1800,
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

  autoSpawnEnemies: false,
};