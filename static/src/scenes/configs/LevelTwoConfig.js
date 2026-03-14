// scenes/configs/levelTwoConfig.js
export const levelTwoConfig = {
  sceneKey: "LevelTwo",
  stageNumber: 2,
  nextScene: "LevelThree",

  map: {
    key: "forest",
    path: "/static/assets/maps/forestMap.tmj",
    tilesets: [
      {
        tiledName: "Decor",
        imageKey: "tiles_decor",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Decor.png",
      },
      {
        tiledName: "Pine Trees",
        imageKey: "tiles_pine_trees",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Pine Trees.png",
      },
      {
        tiledName: "Tree1",
        imageKey: "tiles_tree1",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Tree1.png",
      },
      {
        tiledName: "Tree2",
        imageKey: "tiles_tree2",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Tree2.png",
      },
      {
        tiledName: "Weeping Willow1",
        imageKey: "tiles_weeping_willow1",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Weeping Willow1.png",
      },
      {
        tiledName: "Floor Tiles2",
        imageKey: "tiles_floor_2",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Floor Tiles2.png",
      },
      {
        tiledName: "Floor Tiles1",
        imageKey: "tiles_floor_1",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Floor Tiles1.png",
      },
    ],
  },

  layers: {
    ordered: [
        { name: "Background", role: "background" },
        { name: "Floor", role: "ground" },
        { name: "DMG", role: "damage" },
        { name: "Decor", role: "decor" },
        { name: "Trees", role: "decor" },
        { name: "More Trees", role: "decor" },
        { name: "Bushes", role: "decor" },
        { name: "More Bushes", role: "decor" },
    ]
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
    player: { x: 0, y: 748 },
    npcs: [
      { type: "PeasantNpc", x: 220, y: 204 },
      { type: "KnightNpc", x: 9470, y: 1228 },
    ],
  },

  enemyObjectLayers: {
    Goblins: "GoblinEnemy",
    Slimes: "SlimeEnemy",
  },

  introCutscene: {
    targetX: 273,
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