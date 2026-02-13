// scenes/LevelOne.js
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

const AssetKeys = {
  BACKGROUND: 'background',
  DUNE1: 'dune_1',
  DUNE2: 'dune_2',
  DUNE3: 'dune_3',
  FRAME: 'hudFrame',
  HP: 'hpFill',
  ST: 'stFill',
};

export class LevelOne extends Phaser.Scene {
  constructor() {
    super('LevelOne');
  }

  preload() {
    this.load.image(AssetKeys.BACKGROUND, '/static/assets/LevelDesign/DesertTiles/background/Background layer.png');
    this.load.image(AssetKeys.DUNE1, '/static/assets/LevelDesign/DesertTiles/background/Back layer.png');
    this.load.image(AssetKeys.DUNE2, '/static/assets/LevelDesign/DesertTiles/background/Middle Layer.png');
    this.load.image(AssetKeys.DUNE3, '/static/assets/LevelDesign/DesertTiles/background/Front Layer.png');

    this.load.image(AssetKeys.FRAME, '/static/assets/UI/HUD/Hp bar.png');
    this.load.image(AssetKeys.HP, '/static/assets/UI/HUD/red bar.png');
    this.load.image(AssetKeys.ST, '/static/assets/UI/HUD/blue bar.png');

    this.load.image('tiles', '/static/assets/LevelDesign/DesertTiles/DesertLevel.png');
    this.load.tilemapTiledJSON('desert', '/static/assets/maps/desertMap.tmj');

    this.load.image('peasant_portrait', '/static/assets/NPCs/peasant/peasantPortrait.png');
    this.load.image('knight_portrait', '/static/assets/NPCs/knight/knightPortrait.png');

    Mplayer.preload(this);
    ArcherEnemy.preload(this);
    GoblinEnemy.preload(this);
    PeasantNpc.preload(this);
    KnightNpc.preload(this);
  }

  create() {

    this.sentDeath = false;
    this.inCutscene = true;

    this.difficulty = getDifficultyConfig();
    console.log(this.difficulty.id);
    console.log(this.difficulty.enemyDamageMult);
    console.log(this.difficulty.enemyHpMult);

    // Telemetry Data
    this.stageStartMs = performance.now();
    this.sentStageStart = true;
    this.attemptId = (this.attemptId ?? 0) + 1;

    sendTelemetry("stage_start", {
      stage_number: 1,
      extra: {
        attempt_id: this.attemptId
      }
    });

    this.stageState = {
      stageCleared: false,
      enemiesRemaining: 0
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
      { isStatic: true, isSensor: true, label: 'deathZone' }
    );


    this.platformSegments = buildPlatformSegments(this.groundLayer, 32, 32);
    this.platformEdges = buildEdges(this.platformSegments, 64, 64, 600);

    this.npcs = [];
    this.npcs.push(new PeasantNpc(this, 350, 972));
    this.npcs.push(new KnightNpc(this, 9470, 1036));

    this.player = new Mplayer(this, 0, 972).setDepth(1000);

    // this.testEnemy = new GoblinEnemy(this, 300, 972, { target: this.player, groundLayer: this.groundLayer });
    // this.applyEnemyDifficulty(this.testEnemy);
    // console.log(this.testEnemy.hp);

    this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.talkPrompt = this.add.text(0, 0, 'E to talk', {
      fontSize: '8px',
      color: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      padding: { x: 6, y: 3 }
    })
      .setDepth(10000)
      .setVisible(false)
      .setOrigin(0.5, 1); 

    this.nearbyNpc = null;
    this.nextNpcCheckTime = 0;
    this.npcCheckIntervalMs = 100;


    // Collision handling (sword/enemy + arrow/player)
    this.setupMatterCollisions();

    // Cameras + HUD
    this.setupCameras(groundLayer);

    this.hud = new HUD(this);
    this.events.on('player:hpChanged', (hp, maxHp) => this.hud.setHP(hp / maxHp));
    this.events.on('player:stChanged', (st, maxSt) => this.hud.setStamina(st / maxSt));

    this.uiCam.ignore([
      this.background, this.dune1, this.dune2, this.dune3,
      groundLayer,
      this.player,
    ]);
    

    this.scale.on('resize', (size) => this.uiCam.setSize(size.width, size.height));

    this.coordText = this.add.text(10, 10, '', {
      fontSize: '14px',
      color: '#00ff00'
    }).setScrollFactor(0).setDepth(9999);

    this.spawnEnemies();

    this.playIntroCutscene();
  }

  setupMatterCollisions() {
    this.matter.world.on('collisionstart', (event) => {
      for (const pair of event.pairs) {
        const objA = pair.bodyA?.gameObject;
        const objB = pair.bodyB?.gameObject;

        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // player hits death zone
        if (objA === this.player && bodyB?.label === 'deathZone') {
          this.killPlayer('fell');
        }
        else if (objB === this.player && bodyA?.label === 'deathZone') {
          this.killPlayer('fell');
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
          const result = this.player.receiveHit({ damage: dmg, source: { x: owner?.x ?? this.player.x, y: owner?.y ?? this.player.y }, canBeParried: true });
          if (result?.parried) {
            owner?.stun?.(2000, this.time.now);
            sendTelemetry("parry_success", { stage_number: 1, extra: { enemy: owner?.constructor?.name ?? "unknown" } });
          } else {
            this.maybeLogDeath("Goblin");
          }
        }
        else if (objB === this.player && bodyA?.isEnemyMeleeHitbox) {
          const owner = bodyA.owner;
          const dmg = Math.round(8 * (this.difficulty.playerIncomingDamageMult ?? 1));
          const result = this.player.receiveHit({ damage: dmg, source: { x: owner?.x ?? this.player.x, y: owner?.y ?? this.player.y }, canBeParried: true });
          if (result?.parried) {
            owner?.stun?.(2000, this.time.now);
            sendTelemetry("parry_success", { stage_number: 1, extra: { enemy: owner?.constructor?.name ?? "unknown" } });
          } else {
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
          this.maybeLogDeath("projectile");
        }
        else if (objB === this.player && objA?.isEnemyProjectile) {
          const srcX = objA.x;
          const srcY = objA.y;

          objA.destroy();

          const dmg = Math.round(5 * (this.difficulty.playerIncomingDamageMult ?? 1));
          this.player.receiveHit({ damage: dmg, source: { x: srcX, y: srcY }, canBeParried: true });
          this.maybeLogDeath("projectile");
        }
      }
    });
  }

  killPlayer(cause = 'fell') {
    if (this.player?.isDead) return;
    this.player.receiveHit?.({ damage: 9999, source: { x: this.player.x, y: this.player.y }, canBeParried: false });
    this.maybeLogDeath(cause);
  }


  handleSwordHit(enemy) {
    if (!this.player.isAttacking) return;

    if (enemy.lastHitAttackId === this.player.attackId) return;
    enemy.lastHitAttackId = this.player.attackId;

    enemy.takeDamage(this.player.dmg);
  }

  createParallax() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.background = this.add.tileSprite(0, 0, w, h, AssetKeys.BACKGROUND)
      .setOrigin(0, 0).setScrollFactor(0, 0);

    this.dune1 = this.add.tileSprite(0, 150, w, h, AssetKeys.DUNE1)
      .setOrigin(0, 0).setScrollFactor(0, 0);

    this.dune2 = this.add.tileSprite(0, 170, w, h, AssetKeys.DUNE2)
      .setOrigin(0, 0).setScrollFactor(0, 0).setScale(0.8);

    this.dune3 = this.add.tileSprite(0, 50, w, h, AssetKeys.DUNE3)
      .setOrigin(0, 0).setScrollFactor(0, 0).setScale(1.5);
  }

  createWorld() {
    this.map = this.make.tilemap({ key: 'desert' });
    const tileset = this.map.addTilesetImage('DesertLevel', 'tiles');

    this.backTiles   = this.map.createLayer('Background', tileset, 0, 0);
    this.groundLayer = this.map.createLayer('Floor', tileset, 0, 0);
    this.sandDecor   = this.map.createLayer('Sand', tileset, 0, 0);
    this.bushesDecor = this.map.createLayer('Bushes', tileset, 0, 0);
    this.treesDecor  = this.map.createLayer('Trees', tileset, 0, 0);
    this.dmgSources  = this.map.createLayer('DMG', tileset, 0, 0);

    this.groundLayer.setCollisionByProperty({ collides: true });
    this.matter.world.convertTilemapLayer(this.groundLayer);
    this.groundLayer.forEachTile(t => {
      const body = t.physics?.matterBody?.body;
      if (body) {
        body.collisionFilter.category = CATS.WORLD;
      }
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

    const goblinLayer = this.map.getObjectLayer('Goblins');
    const archerLayer = this.map.getObjectLayer('Archers');

    if (!goblinLayer) console.warn("No object layer named 'Goblins'");
    if (!archerLayer) console.warn("No object layer named 'Archers'");

    const goblinSpawns = goblinLayer?.objects ?? [];
    const archerSpawns = archerLayer?.objects ?? [];

    goblinSpawns.forEach(obj => {
      const enemy = new GoblinEnemy(this, obj.x, obj.y, { target: this.player, groundLayer: this.groundLayer });
      this.applyEnemyDifficulty(enemy);
      this.enemies.push(enemy);
      this.stageState.enemiesRemaining += 1;
    });

    archerSpawns.forEach(obj => {
      const enemy = new ArcherEnemy(this, obj.x, obj.y, { target: this.player, groundLayer: this.groundLayer });
      this.applyEnemyDifficulty(enemy);
      this.enemies.push(enemy);
      this.stageState.enemiesRemaining += 1;
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

  maybeLogDeath(cause = "unknown") {
    if (this.sentDeath) return;

    const hp = this.player?.hp ?? this.player?.currentHp;
    const isDead = this.player?.isDead ?? (typeof hp === "number" && hp <= 0);
    if (!isDead) return;

    this.sentDeath = true;

    sendTelemetry("death", {
      stage_number: 1,
      x_position: this.player.x,
      y_position: this.player.y,
      extra: { cause }
    });

    sendTelemetry("fail", {
      stage_number: 1,
      extra: { cause }
    });

    this.inCutscene = true;
    this.player?.setInputEnabled?.(false);
    this.matter.world.pause();
    this.showRetryUI();

  }

  playIntroCutscene() {
    // Disable player input
    this.player.setInputEnabled(false);

    // Play run animation
    this.player.play('run', true);

    this.tweens.add({
      targets: this.player,
      x: 300, 
      duration: 2000,
      ease: 'Linear',
      onComplete: () => {
        this.player.setVelocityX(0);
        this.player.play('idle', true);
        this.player.setInputEnabled(true);
        this.inCutscene = false;
      }
    });
  }

  startDialogue(npc) {
    this.inCutscene = true;
    this.talkPrompt.setVisible(false);

    const dialogueId =
    typeof npc.dialogueResolver === 'function'
      ? npc.dialogueResolver(this)
      : npc.dialogueId;

    this.activeDialogueNpc = npc;
    this.activeDialogueId = dialogueId;

    this.player.setInputEnabled(false);
    this.dialogueUI = new DialogueUI(this, {
      portraitKey: npc.portraitKey,
      lines: this.getDialogueLines(dialogueId)
    });

    this.dialogueUI.onComplete = () => this.endDialogue();
  }

  endDialogue() {

    const npc = this.activeDialogueNpc;
    const dialogueId = this.activeDialogueId;

    this.dialogueUI?.destroy();
    this.dialogueUI = null;

    npc?.onDialogueComplete?.(this, dialogueId);
    this.activeDialogueNpc = null;
    this.activeDialogueId = null;

    this.player.setInputEnabled(true);

    this.inCutscene = false;

    if (
      npc instanceof KnightNpc &&
      dialogueId === 'knight_cont2' &&
      this.stageState.stageCleared
    ) {
      this.completeStage();
    }
  }
  
  getDialogueLines(dialogueId) {
    const table = {
      peasant_intro: [
        "Hello there, stranger...",
        "The desert has been dangerous lately.",
        "Many monsters have invaded our lands, and a strange curse has turned our own soldiers against us.",
        "If you're heading east, be careful.",
        "We would be grateful if you rid these lands of monsters!"
      ],
      knight_intro: [
        "Brave adventurer, I saw how you took care of those monsters, it was incredible.",
        "However, this place is just the beginning, the monsters are headed east to the Royal Kingdom...",
        "You must stop them before the kingdom is destroyed!"
      ],
      knight_cont: [
        "However, I see there are still monsters remaining here...",
        "It would be best if we clean up all enemies that remain here before proceeding...",
        "Return to me once you have finished."
      ],
      knight_cont2: [
        "I see you have defeated all the monsters. Well done brave hero",
        "The fight is not yet over, you must head east..."
      ]
    };
    return table[dialogueId] ?? ["..."];
  }

  completeStage() {
    this.inCutscene = true;
    this.player.setInputEnabled(false);

    const duration_ms = Math.max(0, Math.floor(performance.now() - (this.stageStartMs ?? performance.now())));

    sendTelemetry("stage_complete", {
      stage_number: 1,
      extra: {
        result: "win",
        duration_ms
      }
    });

    const cam = this.cameras.main;
    cam.fadeOut(1000, 0, 0, 0);

    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {

    });
  }

  showRetryUI() {
    const cam = this.cameras.main;

    const cx = cam.centerX;
    const cy = cam.centerY;

    this.deathOverlay = this.add.rectangle(cx, cy, cam.width, cam.height, 0x000000, 0.55)
      .setScrollFactor(0)
      .setDepth(999);

    this.deathText = this.add.text(cx, cy - 40, "You died", { fontSize: "32px", color: "#ffffff" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000);

    this.retryButton = this.add.text(cx, cy + 20, "Retry", {
        fontSize: "28px",
        color: "#ffffff",
        backgroundColor: "#2d2d2d",
        padding: { left: 14, right: 14, top: 10, bottom: 10 }
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
      stage_number: 1,
      extra: { from: "death_screen" }
    });

    this.deathOverlay?.destroy();
    this.deathText?.destroy();
    this.retryButton?.destroy();

    this.matter.world.resume();
    this.scene.restart();
  }


  update(time, delta) {

    if (this.dialogueUI) {
      this.dialogueUI.update();
      return; 
    }

    if (!this.inCutscene && time >= this.nextNpcCheckTime) {
      this.nextNpcCheckTime = time + this.npcCheckIntervalMs;

      this.nearbyNpc = null;

      const px = this.player.x, py = this.player.y;

      for (const npc of this.npcs) {
        const dx = px - npc.x;
        const dy = py - npc.y;
        const r = npc.interactRadius ?? 60;
        if (dx*dx + dy*dy <= r*r) {
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
    this.dune1.tilePositionX = cam.scrollX * 0.1;
    this.dune2.tilePositionX = cam.scrollX * 0.15;
    this.dune3.tilePositionX = cam.scrollX * 0.18;

    this.coordText.setText(
      `x: ${Math.round(this.player.x)}\ny: ${Math.round(this.player.y)}`
    );
  }
}


