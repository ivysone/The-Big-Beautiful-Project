// scenes/LevelTwo.js
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

const AssetKeys = {
  BACKGROUND: "bg_forest",
  MOUNTAIN: "mountain",
  TREE1: "tree_1",
  TREE2: "tree_2",
  TREE3: "tree_3",
  FRAME: "hudFrame",
  HP: "hpFill",
  ST: "stFill",
};

export class LevelTwo extends Phaser.Scene {
  constructor() {
    super("LevelTwo");
  }

  preload() {
    this.load.image(
      AssetKeys.BACKGROUND,
      "/static/assets/LevelDesign/PlatformerTiles/background/bg/bg_sky.png"
    );
    this.load.image(
      AssetKeys.MOUNTAIN,
      "/static/assets/LevelDesign/PlatformerTiles/background/bg/bg_mountain.png"
    );
    this.load.image(
      AssetKeys.TREE3,
      "/static/assets/LevelDesign/PlatformerTiles/background/bg/bg_trees1.png"
    );
    this.load.image(
      AssetKeys.TREE2,
      "/static/assets/LevelDesign/PlatformerTiles/background/bg/bg_trees2.png"
    );
    this.load.image(
      AssetKeys.TREE1,
      "/static/assets/LevelDesign/PlatformerTiles/background/bg/bg_trees3.png"
    );

    this.load.image(AssetKeys.FRAME, "/static/assets/UI/HUD/Hpbar.png");
    this.load.image(AssetKeys.HP, "/static/assets/UI/HUD/redbar.png");
    this.load.image(AssetKeys.ST, "/static/assets/UI/HUD/Bluebar.png");

    this.load.image("tiles_forest", "/static/assets/LevelDesign/combinedTiles.png");
    this.load.tilemapTiledJSON("forest", "/static/assets/maps/forestMap.tmj");

    this.load.image("peasant_portrait", "/static/assets/NPCs/peasant/peasantPortrait.png");
    this.load.image("knight_portrait", "/static/assets/NPCs/knight/knightPortrait.png");

    this.load.spritesheet("heart_pickup", "/static/assets/UI/healthPickup.png", {
      frameWidth: 16,
      frameHeight: 16,
    });

    Mplayer.preload(this);
    ArcherEnemy.preload(this);
    GoblinEnemy.preload(this);
    PeasantNpc.preload(this);
    KnightNpc.preload(this);
  }

  // TELEMETRY HELPERS
  getDifficultyId() {
    return this.difficulty?.id ?? this.difficulty?.name ?? this.difficultyKey ?? null;
  }

  telemetryBase(stageNumber = 2) {
    return {
      stage_number: stageNumber,
      attempt_id: this.attemptId ?? 1,
      difficulty: this.getDifficultyId(),
    };
  }

  startAttempt(stageNumber = 2, reason = "stage_start") {
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
      ...this.telemetryBase(this.stageNumber ?? 2),
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

    if (result === "win") sendTelemetry("stage_complete", payload);
    else sendTelemetry("fail", payload);
  }

  logPlayerHit({ damage, source, enemyType }) {
    const before = this.player?.hp ?? null;
    this.damageTakenThisAttempt = (this.damageTakenThisAttempt ?? 0) + (damage ?? 0);

    sendTelemetry("player_hit", {
      ...this.telemetryBase(this.stageNumber ?? 2),
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
      ...this.telemetryBase(this.stageNumber ?? 2),
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
      ...this.telemetryBase(this.stageNumber ?? 2),
      x_position: x ?? null,
      y_position: y ?? null,
      extra: { amount, hp_before, hp_after },
    });
  }

  // SCENE
  create() {
    this.sentDeath = false;
    this.inCutscene = true;

    this.difficulty = getDifficultyConfig();

    // Attempt telemetry start
    this.startAttempt(2, "scene_create");

    this.stageState = {
      stageCleared: false,
      enemiesRemaining: 0,
    };

    this.cursors = this.input.keyboard.createCursorKeys();

    this.createParallax();
    const groundLayer = this.createWorld();

    this.matter.world.setBounds(0, 0, groundLayer.width, groundLayer.height);

    const killHeight = 50;
    const killY = groundLayer.height + 20;

    this.deathZone = this.matter.add.rectangle(
      groundLayer.width / 2,
      killY,
      groundLayer.width,
      killHeight,
      { isStatic: true, isSensor: true, label: "deathZone" }
    );

    this.platformSegments = buildPlatformSegments(this.groundLayer, 32, 32);
    this.platformEdges = buildEdges(this.platformSegments, 64, 64, 600);

    this.npcs = [];
    this.npcs.push(new PeasantNpc(this, 220, 204));
    this.npcs.push(new KnightNpc(this, 9470, 1228));

    this.player = new Mplayer(this, 0, 204).setDepth(1000);

    this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

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

    // Heart pickups
    this.heartPickups = [];
    if (!this.anims.exists("heart_idle")) {
      this.anims.create({
        key: "heart_idle",
        frames: this.anims.generateFrameNumbers("heart_pickup", { start: 0, end: 7 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    // Collision handling
    this.setupMatterCollisions();
    this.spawnEnemies();
    // Cameras + HUD 
    this.setupCameras(groundLayer);

    this.hud = new HUD(this);
    this.events.on("player:hpChanged", (hp, maxHp) => this.hud.setHP(hp / maxHp));
    this.events.on("player:stChanged", (st, maxSt) => this.hud.setStamina(st / maxSt));

    this.uiCam.ignore([
      this.background,
      this.mountain,
      this.tree1,
      this.tree2,
      this.tree3,
      groundLayer,
      this.player,
      this.enemies,
      this.treesDecor,
      this.heartPickups,
      this.npcs,
      this.talkPrompt,
      this.dmgSources
    ]);

    this.scale.on("resize", (size) => this.uiCam.setSize(size.width, size.height));

    this.coordText = this.add
      .text(10, 10, "", { fontSize: "14px", color: "#00ff00" })
      .setScrollFactor(0)
      .setDepth(9999);

    this.playIntroCutscene();

    // Heartbeat
    this._hbNext = performance.now() + 10000;
  }

  // PICKUPS
  spawnHeartPickup(x, y) {
    const heart = new HeartPickup(this, x, y, 10);
    this.heartPickups.push(heart);

    sendTelemetry("pickup_spawn", {
      ...this.telemetryBase(this.stageNumber ?? 2),
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
        const objA = pair.bodyA?.gameObject;
        const objB = pair.bodyB?.gameObject;

        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // Heart pickup
        const heartObj = objA?.isHeartPickup ? objA : objB?.isHeartPickup ? objB : null;
        if (heartObj) {
          const otherObj = heartObj === objA ? objB : objA;
          const hitPlayer = otherObj === this.player || otherObj === this.player?.sprite;

          if (hitPlayer) {
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

            continue;
          }
        }

        // player hits death zone
        if (objA === this.player && bodyB?.label === "deathZone") {
          this.killPlayer("fell");
        } else if (objB === this.player && bodyA?.label === "deathZone") {
          this.killPlayer("fell");
        }

        // Sword sensor hits enemy
        if (bodyA === this.player.swordSensor && objB?.isEnemy) {
          this.handleSwordHit(objB);
        } else if (bodyB === this.player.swordSensor && objA?.isEnemy) {
          this.handleSwordHit(objA);
        }

        // goblin melee sensor hits player
        if (objA === this.player && bodyB?.isEnemyMeleeHitbox) {
          const owner = bodyB.owner;
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
              ...this.telemetryBase(2),
              extra: { enemy: owner?.constructor?.name ?? "unknown" },
            });
          } else {
            this.logPlayerHit({
              damage: dmg,
              source: { x: owner?.x ?? this.player.x, y: owner?.y ?? this.player.y },
              enemyType: "Goblin",
            });
            this.maybeLogDeath("Goblin");
          }
        } else if (objB === this.player && bodyA?.isEnemyMeleeHitbox) {
          const owner = bodyA.owner;
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
              ...this.telemetryBase(2),
              extra: { enemy: owner?.constructor?.name ?? "unknown" },
            });
          } else {
            this.logPlayerHit({
              damage: dmg,
              source: { x: owner?.x ?? this.player.x, y: owner?.y ?? this.player.y },
              enemyType: "Goblin",
            });
            this.maybeLogDeath("Goblin");
          }
        }

        // arrow hits player
        if (objA === this.player && objB?.isEnemyProjectile) {
          const srcX = objB.x;
          const srcY = objB.y;

          objB.destroy();

          const dmg = Math.round(5 * (this.difficulty.playerIncomingDamageMult ?? 1));
          this.player.receiveHit({ damage: dmg, source: { x: srcX, y: srcY }, canBeParried: true });

          this.logPlayerHit({
            damage: dmg,
            source: { x: srcX, y: srcY },
            enemyType: "Archer",
          });

          this.maybeLogDeath("projectile");
        } else if (objB === this.player && objA?.isEnemyProjectile) {
          const srcX = objA.x;
          const srcY = objA.y;

          objA.destroy();

          const dmg = Math.round(5 * (this.difficulty.playerIncomingDamageMult ?? 1));
          this.player.receiveHit({ damage: dmg, source: { x: srcX, y: srcY }, canBeParried: true });

          this.logPlayerHit({
            damage: dmg,
            source: { x: srcX, y: srcY },
            enemyType: "Archer",
          });

          this.maybeLogDeath("projectile");
        }
      }
    });
  }

  // GAMEPLAY UTIL
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
    if (!this.player.isAttacking) return;
    if (enemy.lastHitAttackId === this.player.attackId) return;

    enemy.lastHitAttackId = this.player.attackId;

    const beforeHp = enemy.hp;
    enemy.takeDamage(this.player.dmg);

    const afterHp = enemy.hp;
    const died = (typeof afterHp === "number" && afterHp <= 0) || enemy.isDead;

    if (died && !enemy._telemetryKilled) {
      enemy._telemetryKilled = true;
      this.logEnemyKill(enemy);

      if (Math.random() < 0.30) {
        this.spawnHeartPickup(enemy.x, enemy.y - 10);
      }
    }
  }

  // WORLD / CAMERA
  createParallax() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.background = this.add
      .tileSprite(0, 0, w, h, AssetKeys.BACKGROUND)
      .setOrigin(0, 0)
      .setScrollFactor(0, 0);

    this.mountain = this.add
      .tileSprite(0, 150, w, h, AssetKeys.MOUNTAIN)
      .setOrigin(0, 0)
      .setScrollFactor(0, 0);

    this.tree1 = this.add
      .tileSprite(0, 170, w, h, AssetKeys.TREE1)
      .setOrigin(0, 0)
      .setScrollFactor(0, 0)
      .setScale(0.8);

    this.tree2 = this.add
      .tileSprite(0, 50, w, h, AssetKeys.TREE2)
      .setOrigin(0, 0)
      .setScrollFactor(0, 0)
      .setScale(1.5);

    this.tree3 = this.add
      .tileSprite(0, 50, w, h, AssetKeys.TREE3)
      .setOrigin(0, 0)
      .setScrollFactor(0, 0)
      .setScale(1.8);
  }

  createWorld() {
    this.map = this.make.tilemap({ key: "forest" });
    const tileset = this.map.addTilesetImage("combinedTiles", "tiles_forest");

    this.groundLayer = this.map.createLayer("floor", tileset, 0, 0);
    this.treesDecor = this.map.createLayer("treeDecor", tileset, 0, 0);
    this.dmgSources = this.map.createLayer("damage", tileset, 0, 0);

    this.groundLayer.setCollisionByProperty({ collides: true });
    this.groundLayer.setCollisionByProperty({ collision: true });

    this.groundLayer.forEachTile((t) => {
      if (!t || t.index < 0) return;

      const intendedCollide =
        !!t.properties?.collides || !!t.properties?.collision || !!t.collides;

      if (!intendedCollide) return;

      const body = this.matter.add.rectangle(
        t.getCenterX(),
        t.getCenterY(),
        t.width,
        t.height,
        { isStatic: true }
      );

      body.collisionFilter.category = CATS.WORLD;
    });

    return this.groundLayer;
  }


  applyEnemyDifficulty(enemy) {
    const mult = this.difficulty.enemyHpMult ?? 1;
    if (typeof enemy.maxHp === "number") enemy.maxHp = Math.round(enemy.maxHp * mult);
    if (typeof enemy.hp === "number") enemy.hp = Math.round(enemy.hp * mult);
  }

  spawnEnemies() {
    if (!this.map) {
      console.warn("spawnEnemies(): this.map is missing (createWorld didn't store it)");
      return;
    }

    this.enemies = [];
    this.stageState.enemiesRemaining = 0;

    const goblinLayer = this.map.getObjectLayer("Goblins");
    const archerLayer = this.map.getObjectLayer("Archers");

    if (!goblinLayer) console.warn("No object layer named 'Goblins'");
    if (!archerLayer) console.warn("No object layer named 'Archers'");

    const goblinSpawns = goblinLayer?.objects ?? [];
    const archerSpawns = archerLayer?.objects ?? [];

    goblinSpawns.forEach((obj) => {
      const enemy = new GoblinEnemy(this, obj.x, obj.y, {
        target: this.player,
        groundLayer: this.groundLayer,
      });
      this.applyEnemyDifficulty(enemy);
      this.enemies.push(enemy);
      this.stageState.enemiesRemaining += 1;

      sendTelemetry("enemy_spawn", {
        ...this.telemetryBase(2),
        x_position: obj.x,
        y_position: obj.y,
        extra: { enemy: "GoblinEnemy" },
      });
    });

    archerSpawns.forEach((obj) => {
      const enemy = new ArcherEnemy(this, obj.x, obj.y, {
        target: this.player,
        groundLayer: this.groundLayer,
      });
      this.applyEnemyDifficulty(enemy);
      this.enemies.push(enemy);
      this.stageState.enemiesRemaining += 1;

      sendTelemetry("enemy_spawn", {
        ...this.telemetryBase(2),
        x_position: obj.x,
        y_position: obj.y,
        extra: { enemy: "ArcherEnemy" },
      });
    });
  }

  setupCameras(groundLayer) {
    const cam = this.cameras.main;
    cam.setZoom(1.8);
    cam.startFollow(this.player, true, 0.1, 0.1);

    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.setScroll(0, 0);
    this.uiCam.setZoom(1);

    cam.setBounds(0, 0, groundLayer.width, groundLayer.height);
  }

  // DEATH / COMPLETE / RETRY
  maybeLogDeath(cause = "unknown") {
    if (this.sentDeath) return;

    const hp = this.player?.hp ?? this.player?.currentHp;
    const isDead = this.player?.isDead ?? (typeof hp === "number" && hp <= 0);
    if (!isDead) return;

    this.sentDeath = true;

    sendTelemetry("death", {
      ...this.telemetryBase(2),
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

  playIntroCutscene() {
    this.player.setInputEnabled(false);
    this.player.play("run", true);

    this.tweens.add({
      targets: this.player,
      x: 200,
      duration: 1500,
      ease: "Linear",
      onComplete: () => {
        this.player.setVelocityX(0);
        this.player.play("idle", true);
        this.player.setInputEnabled(true);
        this.inCutscene = false;
      },
    });
  }

  startDialogue(npc) {
    this.inCutscene = true;
    this.talkPrompt.setVisible(false);

    const dialogueId =
      typeof npc.dialogueResolver === "function" ? npc.dialogueResolver(this) : npc.dialogueId;

    this.activeDialogueNpc = npc;
    this.activeDialogueId = dialogueId;

    sendTelemetry("dialogue_start", {
      ...this.telemetryBase(2),
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
      ...this.telemetryBase(2),
      extra: { dialogue_id: dialogueId, npc: npc?.constructor?.name ?? "unknown" },
    });

    this.dialogueUI?.destroy();
    this.dialogueUI = null;

    npc?.onDialogueComplete?.(this, dialogueId);
    this.activeDialogueNpc = null;
    this.activeDialogueId = null;

    this.player.setInputEnabled(true);
    this.inCutscene = false;

    if (npc instanceof KnightNpc && dialogueId === "knight_cont2" && this.stageState.stageCleared) {
      this.completeStage();
    }
  }

  getDialogueLines(dialogueId) {
    const table = {
      peasant_intro: [
        "The monsters have begun taking over the forests!.",
        "Please take care of them.",
      ],
      knight_intro: [
        "Brave adventurer, I saw how you took care of those monsters, it was incredible.",
        "However, this place is just the beginning, the monsters are headed east to the Royal Kingdom...",
        "You must stop them before the kingdom is destroyed!",
      ],
      knight_cont: [
        "However, I see there are still monsters remaining here...",
        "It would be best if we clean up all enemies that remain here before proceeding...",
        "Return to me once you have finished.",
      ],
      knight_cont2: [
        "I see you have defeated all the monsters. Well done brave hero",
        "The fight is not yet over, you must head east...",
      ],
    };
    return table[dialogueId] ?? ["..."];
  }

  completeStage() {
    this.inCutscene = true;
    this.player.setInputEnabled(false);

    this.finishAttempt("win");

    const cam = this.cameras.main;
    cam.fadeOut(1000, 0, 0, 0);

    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
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
      ...this.telemetryBase(2),
      extra: { from: "death_screen" },
    });

    this.deathOverlay?.destroy();
    this.deathText?.destroy();
    this.retryButton?.destroy();

    this.matter.world.resume();
    this.scene.restart();
  }

  // UPDATE LOOP
  update(time, delta) {
    if (this.dialogueUI) {
      this.dialogueUI.update();
      return;
    }

    if (!this.inCutscene && time >= this.nextNpcCheckTime) {
      this.nextNpcCheckTime = time + this.npcCheckIntervalMs;
      this.nearbyNpc = null;

      const px = this.player.x,
        py = this.player.y;

      for (const npc of this.npcs) {
        const dx = px - npc.x;
        const dy = py - npc.y;
        const r = npc.interactRadius ?? 60;
        if (dx * dx + dy * dy <= r * r) {
          this.nearbyNpc = npc;
          break;
        }
      }
    }

    if (!this.inCutscene && this.nearbyNpc) {
      const npc = this.nearbyNpc;
      this.talkPrompt.setVisible(true);

      const headOffset = 20;
      this.talkPrompt.setPosition(npc.x, npc.y - headOffset);

      if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
        this.startDialogue(npc);
      }
    } else {
      this.talkPrompt.setVisible(false);
    }

    const cam = this.cameras.main;
    this.background.tilePositionX = cam.scrollX * 0.05;
    this.mountain.tilePositionX = cam.scrollX * 0.1;
    this.tree1.tilePositionX = cam.scrollX * 0.15;
    this.tree2.tilePositionX = cam.scrollX * 0.18;
    this.tree3.tilePositionX = cam.scrollX * 0.21;

    this.coordText.setText(`x: ${Math.round(this.player.x)}\ny: ${Math.round(this.player.y)}`);

    if (performance.now() >= (this._hbNext ?? 0)) {
      this._hbNext = performance.now() + 10000;

      sendTelemetry("heartbeat", {
        ...this.telemetryBase(2),
        x_position: this.player.x,
        y_position: this.player.y,
        extra: {
          hp: this.player?.hp ?? null,
          enemies_remaining: this.stageState?.enemiesRemaining ?? null,
        },
      });
    }
  }
}
