export class ArcherEnemy extends Phaser.Physics.Matter.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {{ target: Phaser.GameObjects.GameObject, groundLayer?: Phaser.Tilemaps.TilemapLayer }} deps
   */
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, 'archer');

    scene.add.existing(this);

    this.target = deps.target;
    this.groundLayer = deps.groundLayer;

    // Flags for collision handling
    this.isEnemy = true;

    // Matter body
    const { Bodies, Body } = Phaser.Physics.Matter.Matter;
    const mainBody = Bodies.rectangle(24, 42, 20, 43, { label: 'archerBody' });
    const footSensor = Bodies.rectangle(24, 66, 16, 4, {
      isSensor: true,
      label: 'archerFoot'
    });

    const compoundBody = Body.create({
      parts: [mainBody, footSensor],
      friction: 0.0,
      restitution: 0
    });

    this.setExistingBody(compoundBody);
    this.setFixedRotation();
    this.setFrictionAir(0.04);

    Phaser.Physics.Matter.Matter.Body.setPosition(this.body, { x, y });

    this.mainBody = mainBody;
    this.footSensor = footSensor;

    // Stats
    this.maxHealth = 3;
    this.health = 3;
    this.isDead = false;

    // Sword overlap guard
    this.lastHitAttackId = -1;

    // AI params
    this.shootTimer = 0;
    this.shootCooldown = 100; 
    this.shootRange = 400;
    this.arrowSpeed = 8;  
    this.walkSpeed = 1.2;  
    this.isStunned = false;

    // Shooting state
    this.isShooting = false;

    // Attack animation timing
    this.attackFps = 10;
    this.attackFrames = 10;
    this.releaseFrame = 7;

    // Facing
    this.facing = 1;
    this.setScale(1, 1);

    this.initAnimations(scene);
    this.play('idleA');
  }

  static preload(scene) {
    scene.load.spritesheet('archer', 'assets/enemy/archer/archer.png', {
      frameWidth: 64,
      frameHeight: 64
    });

    scene.load.image('enemyArrow', 'assets/enemy/archer/arrow.png');
  }

  initAnimations(scene) {
    if (!scene.anims.exists('idleA')) {
      scene.anims.create({
        key: 'idleA',
        frames: scene.anims.generateFrameNumbers('archer', { start: 0, end: 4 }),
        frameRate: 5,
        repeat: -1
      });
    }

    if (!scene.anims.exists('deathA')) {
      scene.anims.create({
        key: 'deathA',
        frames: scene.anims.generateFrameNumbers('archer', { start: 45, end: 50 }),
        frameRate: 6,
        repeat: 0
      });
    }

    if (!scene.anims.exists('attackA')) {
      scene.anims.create({
        key: 'attackA',
        frames: scene.anims.generateFrameNumbers('archer', { start: 12, end: 21 }),
        frameRate: 10,
        repeat: 0
      });
    }
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.isDead || !this.target) return;

    if (this.isStunned) {
      this.setVelocityX(0);
      return;
    }

    const tick = delta / (2000 / 60);
    this.shootTimer += tick;

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const distance = Math.hypot(dx, dy);

    // Face player
    if (dx < 0) {
      this.facing = -1;
      this.setScale(-1, 1);
    } else {
      this.facing = 1;
      this.setScale(1, 1);
    }

    if (distance < this.shootRange) {
      // Slow down while aiming
      this.setVelocityX(this.body.velocity.x * 0.8);

      // Start shoot sequence only when not currently shooting
      if (!this.isShooting && this.shootTimer >= this.shootCooldown) {
        this.startShoot();
        this.shootTimer = 0;
      }
    } 
  }

  startShoot() {
    if (this.isDead) return;

    this.isShooting = true;
    this.setVelocityX(0);

    this.play('attackA', true);

    const delayMs = (this.releaseFrame / this.attackFps) * 1000;

    this.scene.time.delayedCall(delayMs, () => {
      if (!this.active || this.isDead || !this.target) return;

      const dxNow = this.target.x - this.x;
      const dyNow = this.target.y - this.y;

      const len = Math.hypot(dxNow, dyNow) || 1;
      const vx = (dxNow / len) * this.arrowSpeed;
      const vy = (dyNow / len) * this.arrowSpeed;

      this.spawnArrow(vx, vy);
    });

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'attackA', () => {
      this.isShooting = false;
      if (!this.isDead) this.play('idleA', true);
    });
  }

  spawnArrow(vx, vy) {
    const arrow = this.scene.matter.add.image(this.x, this.y - 5, 'enemyArrow');

    arrow.isEnemyProjectile = true;
    arrow.setFixedRotation();
    arrow.setIgnoreGravity(true);
    arrow.setVelocity(vx, vy);
    arrow.setRotation(Math.atan2(vy, vx));
    arrow.setDepth(5);

    this.scene.time.delayedCall(2500, () => {
      if (arrow && arrow.active) arrow.destroy();
    });
  }

  takeDamage(amount) {
    if (this.isDead) return;

    this.health -= amount;

    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => this.clearTint());

    if (this.health <= 0) this.die();
  }

  stun(ms = 600) {
    this.isStunned = true;
    this.setVelocityX(0);
    this.setTint(0xffff66);

    this.scene.time.delayedCall(ms, () => {
      if (!this.active) return;
      this.isStunned = false;
      this.clearTint();
    });
  }

  die() {
    if (this.isDead) return;

    this.isDead = true;

    this.setVelocity(0, 0);
    this.setStatic(true);

    this.play('deathA');

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'deathA', () => {
      this.destroy();
    });
  }
}
