// entities/Enemy.js
export class SkeletonEnemy extends Phaser.Physics.Arcade.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {{ target: Phaser.GameObjects.Sprite, projectiles: Phaser.Physics.Arcade.Group, groundLayer?: Phaser.Tilemaps.TilemapLayer }} deps
   */
  constructor(scene, x, y, deps) {
    super(scene, x, y, 'skeleton');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.target = deps.target;
    this.groundLayer = deps.groundLayer;

    // Hitbox
    this.body.setSize(20, 38);
    this.body.setOffset(15, 25);

    // Stats
    this.maxHealth = 3;
    this.health = 3;
    this.isDead = false;

    // Sword overlap guard
    this.lastHitAttackId = -1;

    // AI params
    this.walkSpeed = 60;
    this.isStunned = false;

    // Shooting state
    this.isAttacking = false;

    // Attack animation timing
    this.attackFps = 10;    
    this.attackFrames = 10;    
    this.releaseFrame = 7;   

    this.initAnimations(scene);
    this.play('skele_walk');
  }

  static preload(scene) {
    scene.load.spritesheet('skeleton', '/static/assets/Enemies/skeletons/defaultSkeleton.png', {
      frameWidth: 64,
      frameHeight: 64
    });
  }

  initAnimations(scene) {
    if (!scene.anims.exists('skele_idle')) {
      scene.anims.create({
        key: 'skele_idle',
        frames: scene.anims.generateFrameNumbers('skeleton', { start: 31, end: 35 }),
        frameRate: 7,
        repeat: -1
      });
    }

    if (!scene.anims.exists('skele_walk')) {
      scene.anims.create({
        key: 'skele_walk',
        frames: scene.anims.generateFrameNumbers('skeleton', { start: 0, end: 7 }),
        frameRate: 8,
        repeat: -1
      });
    }
  }

  preUpdate(time, delta) {
    if (this.isStunned) {
      this.setVelocityX(0);
      return;
    }

    super.preUpdate(time, delta);
    if (this.isDead || !this.target) return;

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const distance = Math.hypot(dx, dy);

    // Face player always (optional)
    this.setFlipX(dx < 0);

    if (!this.isAttacking) {
    const dir = Math.sign(dx);
    this.setVelocityX(dir * this.walkSpeed);

    if (this.anims.currentAnim?.key !== 'skele_walk') {
        this.play('skele_walk', true);
    }
    }
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
    this.body.enable = false;
    this.setVelocity(0, 0);
    this.play('deathA');

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'deathA', () => {
      this.destroy();
    });
  }
}