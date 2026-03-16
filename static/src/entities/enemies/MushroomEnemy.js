import { CATS } from "../../utils/physicsCategories.js";

export class MushroomEnemy extends Phaser.Physics.Matter.Sprite {
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, 'mushroom');

    scene.add.existing(this);

    this.target = deps.target;
    this.isEnemy = true;

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;
    const mainBody = Bodies.rectangle(24, 42, 20, 43, { label: 'mushroomBody' });
    const footSensor = Bodies.rectangle(24, 66, 16, 4, {
      isSensor: true,
      label: 'mushroomFoot'
    });

    const compoundBody = Body.create({
      parts: [mainBody, footSensor],
      friction: 0.0,
      restitution: 0
    });

    this.setExistingBody(compoundBody);
    this.setFixedRotation();
    this.setFrictionAir(0.04);

    for (const part of this.body.parts) {
      part.collisionFilter.category = CATS.ENEMY;
      part.collisionFilter.mask = CATS.WORLD | CATS.NPC | CATS.PLAYER_ATK;
    }

    Phaser.Physics.Matter.Matter.Body.setPosition(this.body, { x, y });

    this.mainBody = mainBody;
    this.footSensor = footSensor;

    // --- stats ---
    this.maxHP = 20;
    this.hp = 20;
    this.isDead = false;
    this.lastHitAttackId = -1;

    // --- movement & aggro ---
    this.aggroRange = 300;
    this.attackRange = 30;
    this.walkSpeed = 1.5;
    this.attackCooldownMs = 1500;
    this.lastAttackTime = -Infinity;
    this.attackDamage = 5;

    this.isAttacking = false;

    // --- attack hit window (frames 12-17, 10fps) ---
    this.attackFps = 10;
    this.hitStartFrame = 3;  // strike begins
    this.hitEndFrame = 4;    // strike ends

    // --- facing ---
    this.facing = 1;
    this.setScale(1, 1);

    // --- stun ---
    this.stunnedUntil = 0;

    // --- melee hitbox sensor ---
    this.meleeSensor = scene.matter.add.rectangle(x, y, 30, 24, {
      isSensor: true,
      label: 'mushroomMelee'
    });
    this.meleeSensor.isEnemyMeleeHitbox = true;
    this.meleeSensor.owner = this;
    this.setMeleeActive(false);

    this.meleeSensor.isSensor = true;
    this.meleeSensor.collisionFilter.category = CATS.ENEMY_ATK;
    this.meleeSensor.collisionFilter.mask = CATS.PLAYER;

    this.initAnimations(scene);
    this.play('mushroom_idle');
  }

  // --- preload ---

  static preload(scene) {
    scene.load.spritesheet('mushroom', '/static/assets/Enemies/mixed/Mushroom sheet.png', {
      frameWidth: 64,
      frameHeight: 64
    });
  }

  // --- animations ---
  // row 1: idle   (0-4),  col 5 empty
  // row 2: walk   (6-10), col 5 empty
  // row 3: attack (12-17)
  // row 4: death  (18-22)

  initAnimations(scene) {
    const anims = [
      { key: 'mushroom_idle',   start: 0,  end: 4,  frameRate: 6,  repeat: -1 },
      { key: 'mushroom_walk',   start: 6,  end: 10, frameRate: 8,  repeat: -1 },
      { key: 'mushroom_attack', start: 12, end: 17, frameRate: 10, repeat: 0  },
      { key: 'mushroom_death',  start: 18, end: 22, frameRate: 8,  repeat: 0  },
    ];

    for (const def of anims) {
      if (!scene.anims.exists(def.key)) {
        scene.anims.create({
          key: def.key,
          frames: scene.anims.generateFrameNumbers('mushroom', {
            start: def.start,
            end: def.end
          }),
          frameRate: def.frameRate,
          repeat: def.repeat
        });
      }
    }
  }

  // --- melee sensor helpers ---

  setMeleeActive(active) {
    if (!this.meleeSensor) return;
    this.meleeActive = active;
    this.meleeSensor.collisionFilter.mask = active ? 0xFFFFFFFF : 0;
  }

  updateMeleePosition() {
    if (!this.meleeSensor) return;
    Phaser.Physics.Matter.Matter.Body.setPosition(this.meleeSensor, {
      x: this.x + (18 * this.facing),
      y: this.y - 10
    });
  }

  // --- stun ---

  stun(ms = 600) {
    const now = this.scene.time.now;
    this.stunnedUntil = Math.max(this.stunnedUntil ?? 0, now + ms);
    this.setVelocityX(0);
    this.setTint(0xffff66);
  }

  _isStunned() {
    return (this.stunnedUntil ?? 0) > this.scene.time.now;
  }

  // --- main update loop ---

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.isDead || !this.target) return;

    // stun check
    if (this._isStunned()) {
      this.setVelocityX(0);
      return;
    }

    // clear stun tint once expired
    if (this.stunnedUntil && this.stunnedUntil <= time) {
      this.clearTint?.();
      this.stunnedUntil = 0;
    }

    if (this.meleeActive) this.updateMeleePosition();

    // hold still while attacking
    if (this.isAttacking) {
      this.setVelocityX(0);
      return;
    }

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const distance = Math.hypot(dx, dy);

    // face player
    if (dx < 0) {
      this.facing = -1;
      this.setScale(-1, 1);
    } else {
      this.facing = 1;
      this.setScale(1, 1);
    }

    if (distance <= this.attackRange) {
      // in range — stop and attack
      this.setVelocityX(0);
      const now = this.scene.time.now;
      if (now - this.lastAttackTime >= this.attackCooldownMs) {
        this.startAttack();
        this.lastAttackTime = now;
      } else {
        if (this.anims.currentAnim?.key !== 'mushroom_idle') {
          this.play('mushroom_idle', true);
        }
      }

    } else if (distance <= this.aggroRange) {
      // chase player
      this.setVelocityX(Math.sign(dx) * this.walkSpeed);
      if (this.anims.currentAnim?.key !== 'mushroom_walk') {
        this.play('mushroom_walk', true);
      }

    } else {
      // out of range
      this.setVelocityX(0);
      if (this.anims.currentAnim?.key !== 'mushroom_idle') {
        this.play('mushroom_idle', true);
      }
    }
  }

  // --- attack (sensor-based so parry works) ---

  startAttack() {
    if (this.isDead) return;

    this.isAttacking = true;
    this.setVelocityX(0);
    this.play('mushroom_attack', true);

    const msPerFrame = 1000 / this.attackFps;

    // turn hitbox on at strike start, off at strike end
    this.scene.time.delayedCall(this.hitStartFrame * msPerFrame, () => {
      if (!this.active || this.isDead) return;
      this.setMeleeActive(true);
      this.updateMeleePosition();
    });

    this.scene.time.delayedCall((this.hitEndFrame + 1) * msPerFrame, () => {
      if (!this.active || this.isDead) return;
      this.setMeleeActive(false);
    });

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'mushroom_attack', () => {
      this.isAttacking = false;
      this.setMeleeActive(false);
      if (!this.isDead && this.anims.currentAnim?.key !== 'mushroom_idle') {
        this.play('mushroom_idle', true);
      }
    });
  }

  // --- take damage ---

  takeDamage(amount) {
    if (this.isDead) return;
    this.hp -= amount;
    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => this.clearTint());
    if (this.hp <= 0) this.die();
  }

  // --- death ---

  die() {
    if (this.isDead) return;
    this.isDead = true;

    this.setVelocity(0, 0);
    this.setStatic(true);
    this.setMeleeActive(false);

    const ss = this.scene.stageState;
    if (ss) {
      ss.enemiesRemaining = Math.max(0, (ss.enemiesRemaining ?? 0) - 1);
      if (ss.enemiesRemaining === 0) ss.stageCleared = true;
    }

    this.play('mushroom_death');

    if (Math.random() < 0.30) this.scene.spawnHeartPickup(this.x, this.y);

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'mushroom_death', () => {
      this.destroy();
    });
  }

  // --- cleanup on destroy ---

  destroy(fromScene) {
    const world = this.scene?.matter?.world;

    if (this.meleeSensor) {
      if (world) world.remove(this.meleeSensor);
      this.meleeSensor = null;
    }

    super.destroy(fromScene);
  }
}