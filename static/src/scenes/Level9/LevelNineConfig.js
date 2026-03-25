export const levelNineConfig = {
  sceneKey: "LevelNine",
  stageNumber: 9,
  nextScene: "LevelTen",

  map: {
    key: "hellLevelFour",
    path: "/static/assets/maps/hellLevelFour.tmj",
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
        imageKey: "tiles_hell",
        imagePath: "/static/assets/LevelDesign/HellTiles/hellTilesRed.png",
      },
      {
        tiledName: "GandalfHardcore Hell Tiles 32x32 dark",
        imageKey: "tiles_hell_dark",
        imagePath: "/static/assets/LevelDesign/HellTiles/hellTilesDark.png",
      },
      {
        tiledName: "Fire sheet",
        imageKey: "tiles_fire",
        imagePath: "/static/assets/LevelDesign/HellTiles/Fire sheet.png"
      },
    ],
  },

  layers: {
    ordered: [
      { name: "Floor", role: "ground" },
      { name: "Lava", role: "decor"},
      { name: "Decor", role: "decor" },
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
    player: { x: 0, y: 332 },
    npcs: [],
  },

  enemyObjectLayers: {
    Damned: "DamnedEnemy",
    Skulls: "BurningSkull",
    Eyes: "EyeEnemy",
  },

  introCutscene: {
    targetX: 73,
    duration: 400,
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