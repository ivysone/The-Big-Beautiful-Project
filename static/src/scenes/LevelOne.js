// scenes/LevelOne.js
import { Mplayer } from "../player/Mplayer.js";
import { ArcherEnemy } from "../entities/enemies/ArcherEnemy.js";
import { HUD } from "../player/HUD.js";
import { GoblinEnemy } from "../entities/enemies/GoblinEnemy.js";
import { buildPlatformSegments, buildEdges } from "../utils/platformPath.js";
import { sendTelemetry } from "../telemetry.js";

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

    Mplayer.preload(this);
    ArcherEnemy.preload(this);
    GoblinEnemy.preload(this);
  }

  create() {

    this.cursors = this.input.keyboard.createCursorKeys();

    this.createParallax();
    const groundLayer = this.createWorld();

    this.matter.world.setBounds(0, 0, groundLayer.width, groundLayer.height);

    this.platformSegments = buildPlatformSegments(this.groundLayer, 32, 32);
    this.platformEdges = buildEdges(this.platformSegments, 64, 64, 600);

    // Player
    this.player = new Mplayer(this, 200, 965);

    // Collision handling (sword/enemy + arrow/player)
    this.setupMatterCollisions();

    // Cameras + HUD
    this.setupCameras(groundLayer);

    this.hud = new HUD(this);
    this.events.on('player:hpChanged', (hp, maxHp) => this.hud.setHP(hp / maxHp));
    this.events.on('player:stChanged', (st, maxSt) => this.hud.setStamina(st / maxSt));
    this.cameras.main.ignore(this.hud.container);

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
  }

  setupMatterCollisions() {
    this.matter.world.on('collisionstart', (event) => {
      for (const pair of event.pairs) {
        const objA = pair.bodyA?.gameObject;
        const objB = pair.bodyB?.gameObject;

        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // Sword sensor hits enemy
        if (bodyA === this.player.swordSensor && objB?.isEnemy) {
          this.handleSwordHit(objB);
        } else if (bodyB === this.player.swordSensor && objA?.isEnemy) {
          this.handleSwordHit(objA);
        }

        // goblin melee sensor hits player
        if (objA === this.player && bodyB?.isEnemyMeleeHitbox) {
          const owner = bodyB.owner;
          this.player.receiveHit({ damage: 8, source: { x: owner?.x ?? this.player.x, y: owner?.y ?? this.player.y }, canBeParried: true });
          this.maybeLogDeath("Goblin");
        }
        else if (objB === this.player && bodyA?.isEnemyMeleeHitbox) {
          const owner = bodyA.owner;
          this.player.receiveHit({ damage: 8, source: { x: owner?.x ?? this.player.x, y: owner?.y ?? this.player.y }, canBeParried: true });
          this.maybeLogDeath("Goblin");
        }

        // arrow hits player
        if (objA === this.player && objB?.isEnemyProjectile) {
          const srcX = objB.x; 
          const srcY = objB.y;

          objB.destroy();

          this.player.receiveHit({ damage: 10, source: { x: srcX, y: srcY }, canBeParried: true });
          this.maybeLogDeath("projectile");
        }
        else if (objB === this.player && objA?.isEnemyProjectile) {
          const srcX = objA.x;
          const srcY = objA.y;

          objA.destroy();

          this.player.receiveHit({ damage: 10, source: { x: srcX, y: srcY }, canBeParried: true });
          this.maybeLogDeath("projectile");
        }
      }
    });
  }

  handleSwordHit(enemy) {
    if (!this.player.isAttacking) return;

    if (enemy.lastHitAttackId === this.player.attackId) return;
    enemy.lastHitAttackId = this.player.attackId;

    enemy.takeDamage(1);
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

    return this.groundLayer;
  }

  spawnEnemies() {
    if (!this.map) {
      console.warn("spawnEnemies(): this.map is missing (createWorld didn't store it)");
      return;
    }

    const goblinLayer = this.map.getObjectLayer('Goblins');
    const archerLayer = this.map.getObjectLayer('Archers');

    if (!goblinLayer) console.warn("No object layer named 'Goblins'");
    if (!archerLayer) console.warn("No object layer named 'Archers'");

    const goblinSpawns = goblinLayer?.objects ?? [];
    const archerSpawns = archerLayer?.objects ?? [];

    console.log("Goblin spawns:", goblinSpawns.length, goblinSpawns);
    console.log("Archer spawns:", archerSpawns.length, archerSpawns);

    goblinSpawns.forEach(obj => {
      new GoblinEnemy(this, obj.x, obj.y, { target: this.player, groundLayer: this.groundLayer });
    });

    archerSpawns.forEach(obj => {
      new ArcherEnemy(this, obj.x, obj.y, { target: this.player, groundLayer: this.groundLayer });
    });
  }


  setupCameras(groundLayer) {
    console.log('Object layers:', this.map.objects?.map(l => l.name));

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
  }


  update(time, delta) {
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


