// scenes/LevelOne.js
import { Fplayer } from "../player/Fplayer.js";
import { SkeletonEnemy } from "../entities/enemies/SkeletonEnemy.js";
import { HUD } from "../player/HUD.js";

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

    SkeletonEnemy.preload(this);
    Fplayer.preload(this);
  }

  create() {
    this.cursors = this.input.keyboard.createCursorKeys();

    this.createParallax();
    const groundLayer = this.createWorld();

    // player
    this.player = new Fplayer(this, 800, 290);
    this.physics.add.collider(this.player, groundLayer);

    // enemy projectiles
    this.enemyProjectiles = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image
    });

    // enemies
    this.enemies = this.physics.add.group();
    this.skeleton = new SkeletonEnemy(this, 600, 200, {
        target: this.player,
        groundLayer
      });
    this.enemies.add(this.skeleton);
    this.spawnEnemies(groundLayer);

    this.physics.add.collider(this.enemies, groundLayer);

    // sword overlap
    this.physics.add.overlap(
      this.player.swordHitbox,
      this.enemies,
      this.handleSwordHit,
      null,
      this
    );

    this.physics.add.overlap(this.player, this.enemyProjectiles, (player, arrow) => {
        arrow.destroy();

        const result = player.receiveHit({ damage: 10, source: arrow, canBeParried: true });

    });

    // cameras + hud
    this.setupCameras(groundLayer);
    this.hud = new HUD(this);
    this.events.on('player:hpChanged', (hp, maxHp) => {
        this.hud.setHP(hp / maxHp);
    });
    this.events.on('player:stChanged', (st, maxSt) => {
        this.hud.setStamina(st / maxSt);
    });
    this.cameras.main.ignore(this.hud.container);

    this.uiCam.ignore([
      this.background, this.dune1, this.dune2, this.dune3,
      groundLayer,
      this.player,
      this.player.swordHitbox,  
      this.enemies,
      this.enemyProjectiles
    ]);

    this.scale.on('resize', (size) => this.uiCam.setSize(size.width, size.height));
  }

  createParallax() {
    this.background = this.add.tileSprite(0, 0, 2000, 0, AssetKeys.BACKGROUND)
      .setOrigin(0, 0).setScrollFactor(0, 0);
    this.dune1 = this.add.tileSprite(0, 150, 2000, 0, AssetKeys.DUNE1)
      .setOrigin(0, 0).setScrollFactor(0, 0);
    this.dune2 = this.add.tileSprite(0, 170, 2000, 0, AssetKeys.DUNE2)
      .setOrigin(0, 0).setScrollFactor(0, 0).setScale(0.8);
    this.dune3 = this.add.tileSprite(0, 50, 2000, 0, AssetKeys.DUNE3)
      .setOrigin(0, 0).setScrollFactor(0, 0).setScale(1.5);
  }

  createWorld() {
    const map = this.make.tilemap({ key: 'desert' });
    const tileset = map.addTilesetImage('DesertLevel.tsx', 'tiles');
    const groundLayer = map.createLayer('Tile Layer 1', tileset, 0, 0);

    groundLayer.setCollisionByProperty({ collides: true });
    this.groundLayer = groundLayer;

    return groundLayer;
  }

  spawnEnemies(groundLayer) {
    const spawnPoints = [
      [1300, 850],
      [1200, 850],
      [1300, 650],
      [2500, 850],
      [2300, 500],
      [2800, 850],
      [800, 200]
    ];
  }

  setupCameras(groundLayer) {
    const cam = this.cameras.main;
    cam.setZoom(1.8);
    cam.startFollow(this.player, true, 0.1, 0.1);

    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.setScroll(0, 0);
    this.uiCam.setZoom(1);

    // Optional: keep world bounds correct if you use them
    cam.setBounds(0, 0, groundLayer.width, groundLayer.height);
  }

  handleSwordHit(hitbox, enemy) {
    if (!this.player.isAttacking) return;

    if (enemy.lastHitAttackId === this.player.attackId) return;

    enemy.lastHitAttackId = this.player.attackId;
    enemy.takeDamage(1);
  }

  update(time, delta) {

    const cam = this.cameras.main;
    this.background.tilePositionX = cam.scrollX * 0.05;
    this.dune1.tilePositionX = cam.scrollX * 0.1;
    this.dune2.tilePositionX = cam.scrollX * 0.15;
    this.dune3.tilePositionX = cam.scrollX * 0.18;
  }
}

