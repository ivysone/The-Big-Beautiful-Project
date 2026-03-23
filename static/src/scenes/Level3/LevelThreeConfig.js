export const levelThreeConfig = {
  sceneKey: "LevelThree",
  stageNumber: 3,
  nextScene: "LevelFour",

  map: {
    key: "village",
    path: "/static/assets/maps/villageMap.tmj",
    tilesets: [
      {
        tiledName: "Floor Tiles1",
        imageKey: "tiles_floor_1",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Floor Tiles1.png",
      },
      {
        tiledName: "GandalfHardcore Farming Tiles and Crops 32x32",
        imageKey: "tiles_farm_crops",
        imagePath:
          "/static/assets/LevelDesign/FarmingTiles/crops.png",
      },
      {
        tiledName: "Floor Tiles2",
        imageKey: "tiles_floor_2",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Floor Tiles2.png",
      },
      {
        tiledName: "Decor",
        imageKey: "tiles_decor",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Decor.png",
      },
      {
        tiledName: "House3",
        imageKey: "tiles_house3",
        imagePath: "/static/assets/LevelDesign/VillageHousesTiles/House3.png",
      },
      {
        tiledName: "House5",
        imageKey: "tiles_house5",
        imagePath: "/static/assets/LevelDesign/VillageHousesTiles/House5.png",
      },
      {
        tiledName: "market stall3",
        imageKey: "tiles_market_stall3",
        imagePath: "/static/assets/LevelDesign/VillageHousesTiles/market stall3.png",
      },
      {
        tiledName: "Tavern",
        imageKey: "tiles_tavern",
        imagePath: "/static/assets/LevelDesign/VillageHousesTiles/Tavern.png",
      },
      {
        tiledName: "shop",
        imageKey: "tiles_shop",
        imagePath: "/static/assets/LevelDesign/VillageHousesTiles/shop.png",
      },
      {
        tiledName: "Large Pine Tree",
        imageKey: "tiles_large_pine_tree",
        imagePath: "/static/assets/LevelDesign/PlatformerTiles/Large Pine Tree.png",
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
    ],
  },

  layers: {
    ordered: [
        { name: "Background", role: "background" },
        { name: "Floor", role: "ground" },
        { name: "Village", role: "decor" },
        { name: "Bushes", role: "decor" },
        { name: "Trees", role: "decor" },
        { name: "Farm", role: "decor" },
        { name: "More Trees", role: "decor" },
        { name: "Decor", role: "decor" },
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
    player: { x: 0, y: 972 },
  },

  introCutscene: {
    targetX: 233,
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

  defense: {
    enabled: true,
    durationMs: 60000,
    housesLayer: "Houses",
    portalsLayer: "Portals",
    houseMaxHp: 500,
    houseDamagePerHit: 2,
    houseHitCooldownMs: 1000,
    maxDestroyed: 3,
    waveIntervalMs: 20000,
    enemiesPerWave: 10,
    enemyTypes: ["OrcEnemy", "DamnedEnemy", "EyeEnemy", "BatEnemy", "BurningSkull"],
  },

  autoSpawnEnemies: false,
};