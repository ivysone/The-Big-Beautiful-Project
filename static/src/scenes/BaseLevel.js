import { Mplayer } from "../player/Mplayer.js";
import { ArcherEnemy } from "../entities/enemies/ArcherEnemy.js";
import { HUD } from "../player/HUD.js";
import { GoblinEnemy } from "../entities/enemies/GoblinEnemy.js";
import { buildPlatformSegments, buildEdges } from "../utils/platformPath.js";
import { sendTelemetry } from "../telemetry.js";
import { PeasantNpc } from "../entities/npc/peasantNpc.js";
import { DialogueUI } from "../ui/DialogueUI.js";
import { KnightNpc } from "../entities/npc/knightNpc.js";
import { CATS } from "../utils/physicsCategories.js";
import { getDifficultyConfig } from "../config/difficulty.js";
import HeartPickup from "../entities/pickups/HeartPickups.js";
import { BatEnemy } from "../entities/enemies/BatEnemy.js";
import { EyeEnemy } from "../entities/enemies/EyeEnemy.js";
import { OrcEnemy } from "../entities/enemies/OrcEnemy.js";
import { DamnedEnemy } from "../entities/enemies/DamnedEnemy.js";
import { SlimeEnemy } from "../entities/enemies/SlimeEnemy.js";
import { SkullBoss } from "../entities/enemies/FinalBoss.js";
import { RatEnemy } from "../entities/enemies/RatEnemy.js";
import { PlantEnemy } from "../entities/enemies/PlantEnemy.js";
import { BurningSkull } from "../entities/enemies/BurningSkull.js";
import { MushroomEnemy } from "../entities/enemies/MushroomEnemy.js";


const DEFAULT_HUD_KEYS = {
  FRAME: "hudFrame",
  HP: "hpFill",
  ST: "stFill",
};

const ENEMY_REGISTRY = {
  GoblinEnemy,
  ArcherEnemy,
  BatEnemy,
  EyeEnemy,
  OrcEnemy,
  DamnedEnemy,
  SlimeEnemy,
  SkullBoss,
  RatEnemy,
  PlantEnemy,
  BurningSkull,
  MushroomEnemy,
};

const NPC_REGISTRY = {
  PeasantNpc,
  KnightNpc,
};

export class BaseLevel extends Phaser.Scene {
  /**
   * @param {object} config
   * @param {string} config.sceneKey
   * @param {number} [config.stageNumber=1]
   * @param {string|null} [config.nextScene=null]
   * @param {object} config.map
   * @param {string} config.map.key
   * @param {string} config.map.path
   * @param {Array<{tiledName:string,imageKey:string,imagePath:string}>} config.map.tilesets
   * @param {object} config.layers
   * @param {string} config.layers.ground
   * @param {string[]} [config.layers.decor]
   * @param {string|null} [config.layers.damage]
   * @param {string[]} [config.layers.collision]
   * @param {object} [config.parallax]
   * @param {Array<{key:string,path:string,y?:number,scroll?:number,scale?:number}>} [config.parallax.layers]
   * @param {object} config.spawns
   * @param {{x:number,y:number}} config.spawns.player
   * @param {Array<{type:string,x:number,y:number}>} [config.spawns.npcs]
   * @param {object} [config.enemyObjectLayers]
   * @param {object} [config.introCutscene]
   * @param {number} [config.introCutscene.targetX]
   * @param {number} [config.introCutscene.duration]
   * @param {object} [config.damageTiles]
   * @param {string} [config.damageTiles.label="damageTile"]
   * @param {number} [config.damageTiles.defaultDamage=10]
   * @param {number} [config.damageTiles.cooldownMs=500]
   * @param {string} [config.damageTiles.damageProperty="damage"]
   * @param {string} [config.damageTiles.typeProperty="damageType"]
   * @param {string} [config.damageTiles.oneShotProperty="oneShot"]
   * @param {string} [config.damageTiles.activeProperty="active"]
   * @param {boolean} [config.autoSpawnEnemies=true]
   */
  constructor(config) {
    super(config.sceneKey);
    this.levelConfig = {
      stageNumber: 1,
      nextScene: null,
      layers: {
        decor: [],
        damage: null,
        collision: [],
      },
      parallax: {
        layers: [],
      },
      spawns: {
        player: { x: 0, y: 0 },
        npcs: [],
      },
      enemyObjectLayers: {},
      introCutscene: {
        targetX: null,
        duration: 2000,
      },
      damageTiles: {
        label: "damageTile",
        defaultDamage: 10,
        cooldownMs: 500,
        damageProperty: "damage",
        typeProperty: "damageType",
        oneShotProperty: "oneShot",
        activeProperty: "active",
      },
      autoSpawnEnemies: true,
      ...config,
      layers: {
        decor: [],
        damage: null,
        collision: [],
        ...(config.layers || {}),
      },
      parallax: {
        layers: [],
        ...(config.parallax || {}),
      },
      spawns: {
        player: { x: 0, y: 0 },
        npcs: [],
        ...(config.spawns || {}),
      },
      introCutscene: {
        targetX: null,
        duration: 2000,
        ...(config.introCutscene || {}),
      },
      damageTiles: {
        label: "damageTile",
        defaultDamage: 10,
        cooldownMs: 500,
        damageProperty: "damage",
        typeProperty: "damageType",
        oneShotProperty: "oneShot",
        activeProperty: "active",
        ...(config.damageTiles || {}),
      },
    };

    this.damageTileBodies = [];
    this.parallaxSprites = [];
    this.heartPickups = [];
    this.enemies = [];
    this.npcs = [];
  }

  // PRELOAD

  preload() {
    this.preloadSharedAssets();
    this.preloadParallaxAssets();
    this.preloadMapAssets();
    this.preloadGameplayAssets();
    this.preloadEntities();
    this.preloadLevelSpecific?.();
  }

  preloadSharedAssets() {
    this.load.image(DEFAULT_HUD_KEYS.FRAME, "/static/assets/UI/HUD/Hpbar.png");
    this.load.image(DEFAULT_HUD_KEYS.HP, "/static/assets/UI/HUD/redbar.png");
    this.load.image(DEFAULT_HUD_KEYS.ST, "/static/assets/UI/HUD/Bluebar.png");

    this.load.image("peasant_portrait", "/static/assets/NPCs/peasant/peasantPortrait.png");
    this.load.image("knight_portrait", "/static/assets/NPCs/knight/knightPortrait.png");
    this.load.image("skullBoss_portrait", "/static/assets/Enemies/succubus/finalBossPortrait.png")

    this.load.spritesheet("heart_pickup", "/static/assets/UI/healthPickup.png", {
      frameWidth: 16,
      frameHeight: 16,
    });

    this.load.spritesheet("portal", "/static/assets/LevelDesign/MedievalFantasyTiles1/portal.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
  }

  preloadParallaxAssets() {
    for (const layer of this.levelConfig.parallax.layers) {
      this.load.image(layer.key, layer.path);
    }
  }

  preloadMapAssets() {
    const { map } = this.levelConfig;

    this.load.tilemapTiledJSON(map.key, map.path);

    for (const tileset of map.tilesets) {
      this.load.image(tileset.imageKey, tileset.imagePath);
    }
  }

  preloadGameplayAssets() {
    Mplayer.preload(this);
  }

  preloadEntities() {
    for (const EnemyClass of Object.values(ENEMY_REGISTRY)) {
      EnemyClass.preload?.(this);
    }

    for (const NpcClass of Object.values(NPC_REGISTRY)) {
      NpcClass.preload?.(this);
    }
  }

  // TELEMETRY HELPERS

  getDifficultyId() {
    return this.difficulty?.id ?? this.difficulty?.name ?? this.difficultyKey ?? null;
  }

  telemetryBase(stageNumber = this.levelConfig.stageNumber) {
    return {
      stage_number: stageNumber,
      attempt_id: this.attemptId ?? 1,
      difficulty: this.getDifficultyId(),
    };
  }

  startAttempt(stageNumber = this.levelConfig.stageNumber, reason = "stage_start") {
    this.stageNumber = stageNumber;
    this.attemptId = (this.attemptId ?? 0) + 1;

    this.runStartMs = performance.now();
    this.damageTakenThisAttempt = 0;
    this.healPickedThisAttempt = 0;
    this.killsThisAttempt = 0;
    this.parriesThisAttempt = 0;
    this.sentDeath = false;

    sendTelemetry("stage_start", {
      ...this.telemetryBase(stageNumber),
      extra: { reason },
    });
  }

  finishAttempt(result, extra = {}) {
    const duration_ms = Math.max(
      0,
      Math.floor(performance.now() - (this.runStartMs ?? performance.now()))
    );

    const payload = {
      ...this.telemetryBase(this.stageNumber),
      duration_ms,
      damage_taken: this.damageTakenThisAttempt ?? 0,
      extra: {
        result: result === "win" ? "win" : "fail",
        enemies_killed: this.killsThisAttempt ?? 0,
        heals_picked: this.healPickedThisAttempt ?? 0,
        parries: this.parriesThisAttempt ?? 0,
        ...extra,
      },
    };

    if (result === "win") {
      sendTelemetry("stage_complete", payload);
    } else {
      sendTelemetry("fail", payload);
    }
  }

  logPlayerHit({ damage, source, enemyType }) {
    const before = this.player?.hp ?? null;
    this.damageTakenThisAttempt = (this.damageTakenThisAttempt ?? 0) + (damage ?? 0);

    sendTelemetry("player_hit", {
      ...this.telemetryBase(this.stageNumber),
      extra: {
        damage,
        hp_before: before,
        hp_after: this.player?.hp ?? null,
        enemy: enemyType ?? "unknown",
        src_x: source?.x ?? null,
        src_y: source?.y ?? null,
      },
    });
  }

  logEnemyKill(enemy) {
    this.killsThisAttempt = (this.killsThisAttempt ?? 0) + 1;

    sendTelemetry("enemy_kill", {
      ...this.telemetryBase(this.stageNumber),
      x_position: enemy?.x ?? null,
      y_position: enemy?.y ?? null,
      extra: {
        enemy: enemy?.constructor?.name ?? "unknown",
        hp_max: enemy?.maxHp ?? null,
      },
    });
  }

  logHealPickup({ amount, hp_before, hp_after, x, y }) {
    this.healPickedThisAttempt = (this.healPickedThisAttempt ?? 0) + 1;

    sendTelemetry("heal_pickup", {
      ...this.telemetryBase(this.stageNumber),
      x_position: x ?? null,
      y_position: y ?? null,
      extra: {
        amount,
        hp_before,
        hp_after,
      },
    });
  }

  // CREATE

  create() {
    this.sentDeath = false;
    this.inCutscene = true;
    this.activeDialogueNpc = null;
    this.activeDialogueId = null;
    this._damageTileLastHitAt = 0;

    this.difficulty = getDifficultyConfig();

    this.startAttempt(this.levelConfig.stageNumber, "scene_create");

    this.stageState = {
      stageCleared: false,
      enemiesRemaining: 0,
      totalEnemies: 0,
    };

    this.cursors = this.input.keyboard.createCursorKeys();
    this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.createParallax();

    const groundLayer = this.createWorld();

    this.matter.world.setBounds(0, 0, groundLayer.width, groundLayer.height);

    this.createDeathZone(groundLayer);
    this.createPlatformData();
    this.createActors();
    this.createInteractionPrompt();
    this.createHeartAnimation();

    this.setupMatterCollisions();
    this.setupCameras(groundLayer);
    this.setupHUD();
    this.setupDebugText();

    if (this.levelConfig.autoSpawnEnemies) {
      this.spawnEnemies();
    }

    this.playIntroCutscene();

    this._hbNext = performance.now() + 10000;
  }

  // PARALLAX

  createParallax() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.parallaxSprites = this.levelConfig.parallax.layers.map((layer) =>
      this.add
        .tileSprite(0, layer.y ?? 0, w, h, layer.key)
        .setOrigin(0, 0)
        .setScrollFactor(0, 0)
        .setScale(layer.scale ?? 1)
    );
  }

  updateParallax() {
    if (!this.parallaxSprites.length) return;

    const cam = this.cameras.main;
    this.parallaxSprites.forEach((sprite, index) => {
      const layerCfg = this.levelConfig.parallax.layers[index];
      sprite.tilePositionX = cam.scrollX * (layerCfg.scroll ?? 0);
    });
  }

  // WORLD

  createWorld() {
    const { map, layers } = this.levelConfig;

    this.map = this.make.tilemap({ key: map.key });
    const tilesets = this.buildTilesets();

    this.backgroundLayers = [];
    this.decorLayers = [];
    this.extraCollisionLayers = [];
    this.damageLayer = null;
    this.groundLayer = null;

    for (const layerDef of layers.ordered || []) {
      const layer = this.map.createLayer(layerDef.name, tilesets, 0, 0);
      if (!layer) continue;

      switch (layerDef.role) {
        case "ground":
          this.groundLayer = layer;
          break;
        case "damage":
          this.damageLayer = layer;
          break;
        case "background":
          this.backgroundLayers.push(layer);
          break;
        case "collision":
          this.extraCollisionLayers.push(layer);
          break;
        default:
          this.decorLayers.push(layer);
          break;
      }
    }

    if (!this.groundLayer) {
      throw new Error("No ground layer was created.");
    }

    this.buildGroundCollision(this.groundLayer);
    this.buildExtraCollisionLayers(this.extraCollisionLayers);
    this.buildDamageTiles(this.damageLayer);

    return this.groundLayer;
  }

  buildTilesets() {
    return this.levelConfig.map.tilesets
      .map((tilesetCfg) => {
        const tileset = this.map.addTilesetImage(tilesetCfg.tiledName, tilesetCfg.imageKey);
        if (!tileset) {
          console.warn(
            `Tileset "${tilesetCfg.tiledName}" could not be bound to image key "${tilesetCfg.imageKey}".`
          );
        }
        return tileset;
      })
      .filter(Boolean);
  }

  buildGroundCollision(layer) {
    layer.setCollisionByProperty({ collides: true });
    this.matter.world.convertTilemapLayer(layer);

    layer.forEachTile((tile) => {
      const body = tile.physics?.matterBody?.body;
      if (body) {
        body.collisionFilter.category = CATS.WORLD;
      }
    });
  }

  buildExtraCollisionLayers(layers = []) {
    for (const layer of layers) {
      layer.setCollisionByProperty({ collides: true });
      this.matter.world.convertTilemapLayer(layer);

      layer.forEachTile((tile) => {
        const body = tile.physics?.matterBody?.body;
        if (body) {
          body.collisionFilter.category = CATS.WORLD;
        }
      });
    }
  }

  buildDamageTiles(layer) {
    this.damageTileBodies = [];

    if (!layer) return;

    const cfg = this.levelConfig.damageTiles;

    layer.forEachTile((tile) => {
      if (!tile || tile.index < 0) return;

      const active = tile.properties?.[cfg.activeProperty];
      if (active === false) return;

      const explicitDamage = tile.properties?.[cfg.damageProperty];
      const shouldCreateBody =
        typeof explicitDamage === "number" ||
        tile.properties?.isDamage === true ||
        tile.properties?.damages === true;

      if (!shouldCreateBody) return;

      const body = this.matter.add.rectangle(
        tile.getCenterX(),
        tile.getCenterY(),
        tile.width,
        tile.height,
        {
          isStatic: true,
          isSensor: true,
          label: cfg.label,
        }
      );

      body.damageAmount =
        typeof explicitDamage === "number" ? explicitDamage : cfg.defaultDamage;
      body.damageType = tile.properties?.[cfg.typeProperty] ?? "tile";
      body.damageOneShot = Boolean(tile.properties?.[cfg.oneShotProperty]);
      body.tileRef = tile;
      body.collisionFilter.category = CATS.WORLD;

      this.damageTileBodies.push(body);
    });
  }

  createDeathZone(groundLayer) {
    const killHeight = 50;
    const killY = groundLayer.height + 20;

    this.deathZone = this.matter.add.rectangle(
      groundLayer.width / 2,
      killY,
      groundLayer.width,
      killHeight,
      { isStatic: true, isSensor: true, label: "deathZone" }
    );
  }

  createPlatformData() {
    this.platformSegments = buildPlatformSegments(this.groundLayer, 32, 32);
    this.platformEdges = buildEdges(this.platformSegments, 64, 64, 600);
  }

  // ACTORS

  createActors() {
    this.npcs = (this.levelConfig.spawns.npcs || [])
      .map((npcCfg) => {
        const NpcClass = NPC_REGISTRY[npcCfg.type];
        if (!NpcClass) {
          console.warn(`Unknown NPC type "${npcCfg.type}"`);
          return null;
        }
        return new NpcClass(this, npcCfg.x, npcCfg.y);
      })
      .filter(Boolean);

    this.player = new Mplayer(
      this,
      this.levelConfig.spawns.player.x,
      this.levelConfig.spawns.player.y
    ).setDepth(1000);

    this.extraEnemies = (this.levelConfig.spawns.extraEnemies || [])
      .map((enemyConfig) => {
        const enemyClass = ENEMY_REGISTRY[enemyConfig.type];
        if (!enemyClass) {
          console.warn(`Unknown enemy type "${enemyConfig.type}"`);
          return null;
        }
        return new enemyClass(this, enemyConfig.x, enemyConfig.y, {
          target: this.player,
          arena: {x: 400, y: 880, width: 20, height: 5 }
        });
      })
      .filter(Boolean);
  }

  createInteractionPrompt() {
    this.talkPrompt = this.add
      .text(0, 0, "E to talk", {
        fontSize: "8px",
        color: "#ffffff",
        backgroundColor: "rgba(0, 0, 0, 0)",
        padding: { x: 6, y: 3 },
      })
      .setDepth(10000)
      .setVisible(false)
      .setOrigin(0.5, 1);

    this.nearbyNpc = null;
    this.nextNpcCheckTime = 0;
    this.npcCheckIntervalMs = 100;
  }

  createHeartAnimation() {
    if (!this.anims.exists("heart_idle")) {
      this.anims.create({
        key: "heart_idle",
        frames: this.anims.generateFrameNumbers("heart_pickup", { start: 0, end: 7 }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  // HUD / CAMERA

  setupCameras(groundLayer) {
    const cam = this.cameras.main;
    cam.setZoom(1.8);
    cam.startFollow(this.player, true, 0.1, 0.1);
    cam.setBounds(0, 0, groundLayer.width, groundLayer.height);

    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.setScroll(0, 0);
    this.uiCam.setZoom(1);

    const ignored = [
      ...this.parallaxSprites,
      this.groundLayer,
      ...(this.decorLayers || []),
      ...(this.extraCollisionLayers || []),
      ...(this.damageLayer ? [this.damageLayer] : []),
      this.player,
      this.extraEnemies,
      this.npcs,
      this.enemies,
    ].filter(Boolean);

    this.uiCam.ignore(ignored);

    this.scale.on("resize", (size) => {
      this.uiCam.setSize(size.width, size.height);
    });
  }

  setupHUD() {
    this.hud = new HUD(this);

    this.events.on("player:hpChanged", (hp, maxHp) => this.hud.setHP(hp / maxHp));
    this.events.on("player:stChanged", (st, maxSt) => this.hud.setStamina(st / maxSt));
  }

  setupDebugText() {
    this.coordText = this.add
      .text(10, 10, "", {
        fontSize: "14px",
        color: "#00ff00",
      })
      .setScrollFactor(0)
      .setDepth(9999);
  }

  // ENEMIES

  applyEnemyDifficulty(enemy) {
    const mult = this.difficulty.enemyHpMult ?? 1;
    if (typeof enemy.maxHp === "number") enemy.maxHp = Math.round(enemy.maxHp * mult);
    if (typeof enemy.hp === "number") enemy.hp = Math.round(enemy.hp * mult);
  }

  spawnEnemies() {
    if (!this.map) {
      console.warn("spawnEnemies(): this.map is missing.");
      return;
    }

    this.enemies = [];
    this.stageState.enemiesRemaining = 0;

    for (const [objectLayerName, enemyTypeName] of Object.entries(
      this.levelConfig.enemyObjectLayers || {}
    )) {
      const objectLayer = this.map.getObjectLayer(objectLayerName);

      if (!objectLayer) {
        console.warn(`No object layer named "${objectLayerName}"`);
        continue;
      }

      const EnemyClass = ENEMY_REGISTRY[enemyTypeName];
      if (!EnemyClass) {
        console.warn(`Unknown enemy type "${enemyTypeName}" for layer "${objectLayerName}"`);
        continue;
      }

      for (const obj of objectLayer.objects ?? []) {
        const enemy = new EnemyClass(this, obj.x, obj.y, {
          target: this.player,
          groundLayer: this.groundLayer,
        });

        this.applyEnemyDifficulty(enemy);
        this.enemies.push(enemy);
        this.stageState.enemiesRemaining += 1;

        sendTelemetry("enemy_spawn", {
          ...this.telemetryBase(this.stageNumber),
          x_position: obj.x,
          y_position: obj.y,
          extra: { enemy: EnemyClass.name },
        });
      }
    }
    this.stageState.totalEnemies = this.stageState.enemiesRemaining;
  }

  // PICKUPS

  spawnHeartPickup(x, y) {
    const heart = new HeartPickup(this, x, y, 10);
    this.heartPickups.push(heart);

    sendTelemetry("pickup_spawn", {
      ...this.telemetryBase(this.stageNumber),
      x_position: x,
      y_position: y,
      extra: { type: "heart", heal_amount: 10 },
    });

    return heart;
  }

  // COLLISIONS

  setupMatterCollisions() {
    this.matter.world.on("collisionstart", (event) => {
      for (const pair of event.pairs) {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        const objA = bodyA?.gameObject;
        const objB = bodyB?.gameObject;

        if (this.handleHeartPickup(objA, objB)) continue;
        if (this.handleDeathZone(objA, bodyA, objB, bodyB)) continue;
        if (this.handleDamageTileCollision(objA, bodyA, objB, bodyB)) continue;
        if (this.handleSwordHitEnemy(bodyA, objA, bodyB, objB)) continue;
        if (this.handleEnemyMeleeHitsPlayer(objA, bodyA, objB, bodyB)) continue;
        if (this.handleEnemyProjectileHitsPlayer(objA, objB)) continue;
      }
    });
  }

  isPlayerObj(obj) {
    return obj === this.player || obj === this.player?.sprite;
  }

  handleHeartPickup(objA, objB) {
    const heartObj = objA?.isHeartPickup ? objA : objB?.isHeartPickup ? objB : null;
    if (!heartObj) return false;

    const otherObj = heartObj === objA ? objB : objA;
    if (!this.isPlayerObj(otherObj)) return false;

    const healAmount = heartObj.heartPickupRef?.healAmount ?? 10;
    const before = this.player.hp;

    this.player.heal(healAmount);

    this.logHealPickup({
      amount: healAmount,
      hp_before: before,
      hp_after: this.player.hp,
      x: heartObj.x,
      y: heartObj.y,
    });

    heartObj.heartPickupRef?.destroy();
    this.heartPickups = (this.heartPickups || []).filter(
      (h) => h.sprite && h.sprite !== heartObj
    );

    return true;
  }

  handleDeathZone(objA, bodyA, objB, bodyB) {
    if (objA === this.player && bodyB?.label === "deathZone") {
      this.killPlayer("fell");
      return true;
    }
    if (objB === this.player && bodyA?.label === "deathZone") {
      this.killPlayer("fell");
      return true;
    }
    return false;
  }

  handleDamageTileCollision(objA, bodyA, objB, bodyB) {
    const label = this.levelConfig.damageTiles.label;

    if (objA === this.player && bodyB?.label === label) {
      this.applyDamageTileHit(bodyB);
      return true;
    }

    if (objB === this.player && bodyA?.label === label) {
      this.applyDamageTileHit(bodyA);
      return true;
    }

    return false;
  }

  applyDamageTileHit(damageBody) {
    const cooldownMs = this.levelConfig.damageTiles.cooldownMs ?? 500;
    const now = this.time.now;

    if (now - (this._damageTileLastHitAt ?? 0) < cooldownMs) {
      return;
    }

    this._damageTileLastHitAt = now;

    const damage = Math.round(
      (damageBody?.damageAmount ?? this.levelConfig.damageTiles.defaultDamage) *
        (this.difficulty.playerIncomingDamageMult ?? 1)
    );

    const source = {
      x: damageBody?.position?.x ?? this.player.x,
      y: damageBody?.position?.y ?? this.player.y,
    };

    const result = this.player.receiveHit({
      damage,
      source,
      canBeParried: false,
    });

    if (!result?.parried) {
      this.logPlayerHit({
        damage,
        source,
        enemyType: damageBody?.damageType ?? "damageTile",
      });
      this.maybeLogDeath(damageBody?.damageType ?? "damageTile");
    }

    if (damageBody?.damageOneShot) {
      this.matter.world.remove(damageBody);
      this.damageTileBodies = this.damageTileBodies.filter((b) => b !== damageBody);
    }
  }

  handleSwordHitEnemy(bodyA, objA, bodyB, objB) {
    if (bodyA === this.player?.swordSensor && objB?.isEnemy) {
      this.handleSwordHit(objB);
      return true;
    }
    if (bodyB === this.player?.swordSensor && objA?.isEnemy) {
      this.handleSwordHit(objA);
      return true;
    }
    return false;
  }

  handleEnemyMeleeHitsPlayer(objA, bodyA, objB, bodyB) {
    let meleeBody = null;

    if (objA === this.player && bodyB?.isEnemyMeleeHitbox) {
      meleeBody = bodyB;
    } else if (objB === this.player && bodyA?.isEnemyMeleeHitbox) {
      meleeBody = bodyA;
    } else {
      return false;
    }

    const owner = meleeBody.owner;
    if (!owner || owner.isDead) return true;
    if (owner.meleeActive === false) return true;

    const hitKey = this.player.body ?? this.player;
    if (owner.hitThisAttack) {
      if (owner.hitThisAttack.has(hitKey)) return true;
      owner.hitThisAttack.add(hitKey);
    }

    const dmg = Math.round(8 * (this.difficulty.playerIncomingDamageMult ?? 1));

    const result = this.player.receiveHit({
      damage: dmg,
      source: { x: owner?.x ?? this.player.x, y: owner?.y ?? this.player.y },
      canBeParried: true,
    });

    if (result?.parried) {
      owner?.stun?.(2000, this.time.now);
      this.parriesThisAttempt = (this.parriesThisAttempt ?? 0) + 1;

      sendTelemetry("parry_success", {
        ...this.telemetryBase(this.stageNumber),
        extra: { enemy: owner?.constructor?.name ?? "unknown" },
      });
    } else {
      this.logPlayerHit({
        damage: dmg,
        source: { x: owner?.x ?? this.player.x, y: owner?.y ?? this.player.y },
        enemyType: owner?.constructor?.name ?? "Enemy",
      });
      this.maybeLogDeath(owner?.constructor?.name ?? "Enemy");
    }

    return true;
  }

  handleEnemyProjectileHitsPlayer(objA, objB) {
    let projectile = null;

    if (objA === this.player && objB?.isEnemyProjectile) projectile = objB;
    else if (objB === this.player && objA?.isEnemyProjectile) projectile = objA;
    else return false;

    const srcX = projectile.x;
    const srcY = projectile.y;

    projectile.destroy();

    const dmg = Math.round(5 * (this.difficulty.playerIncomingDamageMult ?? 1));
    this.player.receiveHit({ damage: dmg, source: { x: srcX, y: srcY }, canBeParried: true });

    this.logPlayerHit({
      damage: dmg,
      source: { x: srcX, y: srcY },
      enemyType: "Archer",
    });

    this.maybeLogDeath("projectile");
    return true;
  }

  // GAMEPLAY

  killPlayer(cause = "fell") {
    if (this.player?.isDead) return;

    this.player.receiveHit?.({
      damage: 9999,
      source: { x: this.player.x, y: this.player.y },
      canBeParried: false,
    });

    this.maybeLogDeath(cause);
  }

  handleSwordHit(enemy) {
    if (!this.player?.isAttacking) return;
    if (enemy.lastHitAttackId === this.player.attackId) return;

    enemy.lastHitAttackId = this.player.attackId;

    enemy.takeDamage(this.player.dmg);

    const afterHp = enemy.hp;
    const died = (typeof afterHp === "number" && afterHp <= 0) || enemy.isDead;

    if (died && !enemy._telemetryKilled) {
      enemy._telemetryKilled = true;
      this.logEnemyKill(enemy);

      this.stageState.enemiesRemaining = Math.max(
        0,
        (this.stageState.enemiesRemaining ?? 1) - 1
      );

      if (this.stageState.enemiesRemaining <= Math.floor(this.stageState.totalEnemies * 0.3)) {
        this.stageState.stageCleared = true;
      }

      if (Math.random() < 0.3) {
        this.spawnHeartPickup(enemy.x, enemy.y - 10);
      }
    }
  }

  // DIALOGUE

  startDialogue(npc) {
    this.inCutscene = true;
    this.talkPrompt.setVisible(false);

    const dialogueId =
      typeof npc.dialogueResolver === "function" ? npc.dialogueResolver(this) : npc.dialogueId;

    this.activeDialogueNpc = npc;
    this.activeDialogueId = dialogueId;

    sendTelemetry("dialogue_start", {
      ...this.telemetryBase(this.stageNumber),
      extra: { dialogue_id: dialogueId, npc: npc?.constructor?.name ?? "unknown" },
    });

    this.player.setInputEnabled(false);

    this.dialogueUI = new DialogueUI(this, {
      portraitKey: npc.portraitKey,
      lines: this.getDialogueLines(dialogueId),
    });

    this.dialogueUI.onComplete = () => this.endDialogue();
  }

  endDialogue() {
    const npc = this.activeDialogueNpc;
    const dialogueId = this.activeDialogueId;

    sendTelemetry("dialogue_end", {
      ...this.telemetryBase(this.stageNumber),
      extra: { dialogue_id: dialogueId, npc: npc?.constructor?.name ?? "unknown" },
    });

    this.dialogueUI?.destroy();
    this.dialogueUI = null;

    npc?.onDialogueComplete?.(this, dialogueId);

    this.activeDialogueNpc = null;
    this.activeDialogueId = null;

    this.player.setInputEnabled(true);
    this.inCutscene = false;

    this.afterDialogueComplete?.(npc, dialogueId);
  }

  getDialogueLines(dialogueId) {
    return ["..."];
  }

  // CUTSCENE / COMPLETE / RETRY

  playIntroCutscene() {
    const { targetX, duration } = this.levelConfig.introCutscene || {};

    if (targetX == null) {
      this.player.setInputEnabled(true);
      this.inCutscene = false;
      return;
    }

    this.player.setInputEnabled(false);
    this.player.play?.("run", true);

    this.tweens.add({
      targets: this.player,
      x: targetX,
      duration: duration ?? 2000,
      ease: "Linear",
      onComplete: () => {
        this.player.setVelocityX?.(0);
        this.player.play?.("idle", true);
        this.player.setInputEnabled(true);
        this.inCutscene = false;
      },
    });
  }

  maybeLogDeath(cause = "unknown") {
    if (this.sentDeath) return;

    const hp = this.player?.hp ?? this.player?.currentHp;
    const isDead = this.player?.isDead ?? (typeof hp === "number" && hp <= 0);
    if (!isDead) return;

    this.sentDeath = true;

    sendTelemetry("death", {
      ...this.telemetryBase(this.stageNumber),
      x_position: this.player.x,
      y_position: this.player.y,
      extra: { cause },
    });

    this.finishAttempt("fail", { cause });

    this.inCutscene = true;
    this.player?.setInputEnabled?.(false);
    this.matter.world.pause();
    this.showRetryUI();
  }

  completeStage() {
    this.inCutscene = true;
    this.player.setInputEnabled(false);

    this.finishAttempt("win");

    const cam = this.cameras.main;
    cam.fadeOut(1000, 0, 0, 0);

    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      if (this.levelConfig.nextScene) {
        this.scene.start(this.levelConfig.nextScene);
      } else {
        this.onStageComplete?.();
      }
    });
  }

  showRetryUI() {
    const cam = this.cameras.main;
    const cx = cam.centerX;
    const cy = cam.centerY;

    this.deathOverlay = this.add
      .rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.55)
      .setScrollFactor(0)
      .setDepth(999);

    this.deathText = this.add
      .text(cx, cy - 40, "You died", { fontSize: "32px", color: "#ffffff" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000);

    this.retryButton = this.add
      .text(cx, cy + 20, "Retry", {
        fontSize: "28px",
        color: "#ffffff",
        backgroundColor: "#2d2d2d",
        padding: { left: 14, right: 14, top: 10, bottom: 10 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setInteractive({ useHandCursor: true });

    this.retryButton.on("pointerdown", () => this.retryLevel());
    this.retryButton.on("pointerover", () => this.retryButton.setAlpha(0.85));
    this.retryButton.on("pointerout", () => this.retryButton.setAlpha(1));

    cam.ignore([this.deathOverlay, this.deathText, this.retryButton]);
  }

  retryLevel() {
    sendTelemetry("retry", {
      ...this.telemetryBase(this.stageNumber),
      extra: { from: "death_screen" },
    });

    this.deathOverlay?.destroy();
    this.deathText?.destroy();
    this.retryButton?.destroy();

    this.matter.world.resume();
    this.scene.restart();
  }

  // UPDATE

  update(time, delta) {
    if (this.dialogueUI) {
      this.dialogueUI.update();
      return;
    }

    this.updateNpcInteraction(time);
    this.updateParallax();
    this.updateDebugText();
    this.updateHeartbeat();
    this.updateLevelSpecific?.(time, delta);
  }

  updateNpcInteraction(time) {
    if (!this.inCutscene && time >= this.nextNpcCheckTime) {
      this.nextNpcCheckTime = time + this.npcCheckIntervalMs;
      this.nearbyNpc = null;

      const px = this.player.x;
      const py = this.player.y;

      const interactables = [
        ...this.npcs,
        ...(this.extraEnemies || [])
      ];

      for (const obj of interactables) {

        if (!obj?.interactRadius) continue;

        if (obj.isEnemy && obj.isStandby === false) continue;

        const dx = px - obj.x;
        const dy = py - obj.y;
        const r = obj.interactRadius;

        if (dx * dx + dy * dy <= r * r) {
          this.nearbyNpc = obj;
          break;
        }
      }
    }

    if (!this.inCutscene && this.nearbyNpc) {
      const npc = this.nearbyNpc;
      this.talkPrompt.setVisible(true);
      this.talkPrompt.setPosition(npc.x, npc.y - 20);
      this.talkPrompt.setText(npc.interactPromptText ?? "E to talk");

      if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
        // NPC dialogue
        if (npc.dialogueResolver) {
          this.startDialogue(npc);
          return;
        }

        // Generic interaction (boss etc.)
        if (typeof npc.interact === "function") {
          npc.interact(this.player);
        }
      }
    } else {
      this.talkPrompt.setVisible(false);
    }
  }

  updateDebugText() {
    if (!this.coordText || !this.player) return;

    this.coordText.setText(
      `x: ${Math.round(this.player.x)}\ny: ${Math.round(this.player.y)}`
    );
  }

  updateHeartbeat() {
    if (performance.now() < (this._hbNext ?? 0)) return;

    this._hbNext = performance.now() + 10000;

    sendTelemetry("heartbeat", {
      ...this.telemetryBase(this.stageNumber),
      x_position: this.player.x,
      y_position: this.player.y,
      extra: {
        hp: this.player?.hp ?? null,
        enemies_remaining: this.stageState?.enemiesRemaining ?? null,
      },
    });
  }
}