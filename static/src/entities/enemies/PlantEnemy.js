import { CATS } from "../../utils/physicsCategories.js";

export class PlantEnemy extends Phaser.Physics.Matter.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {{ target: Phaser.GameObjects.GameObject }} deps
   */
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, 'plant');

    scene.add.existing(this);

    this.target = deps.target;
    this.isEnemy = true;

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    // Static plant body — no movement
    const mainBody = Bodies.rectangle(0, 0, 24, 32, { label: 'plantBody' });

    const compoundBody = Body.create({
      parts: [mainBody],
      friction: 0.0,
      restitution: 0,
      isStatic: true,
    });

    this.setExistingBody(compoundBody);
    this.setFixedRotation();
    this.setStatic(true);

    for (const part of this.body.parts) {
      part.collisionFilter.category = CATS.ENEMY;
      part.collisionFilter.mask = CATS.WORLD | CATS.PLAYER_ATK;
    }

    this.setOrigin(0.5, 0.68);
    Phaser.Physics.Matter.Matter.Body.setPosition(this.body, { x, y });

    this.mainBody = mainBody;

    // Stats
    this.maxHP = 20;
    this.hp = 20;
    this.isDead = false;

    this.lastHitAttackId = -1;

    // AI — no movement, just attack range
    this.aggroRange = 120;      // how close before it wakes up
    this.attackRange = 80;      // how close before it bites
    this.attackCooldownMs = 2000;
    this.lastAttackTime = -Infinity;
    this.isAggro = false;

    // Attack timing
    this.attackFps = 10;
    this.hitStartFrame = 3;
    this.hitEndFrame = 5;

    // Melee sensor
    this.meleeSensor = scene.matter.add.rectangle(x, y, 60, 60, {
      isSensor: true,
      label: 'plantMelee'
    });
    this.meleeSensor.isEnemyMeleeHitbox = true;
    this.meleeSensor.owner = this;
    this.setMeleeActive(false);

    this.meleeSensor.isSensor = true;
    this.meleeSensor.collisionFilter.category = CATS.ENEMY_ATK;
    this.meleeSensor.collisionFilter.mask = CATS.PLAYER;

    this.initAnimations(scene);
    this.play('plant_idle');
  }

  // ASSET LOADING 

  static preload(scene) {
    scene.load.spritesheet('plant', '/static/assets/Enemies/mixed/Plant sheet.png', {
      frameWidth: 64,
      frameHeight: 64
    });
  }

  //  ANIMATIONS 
  // Row 0: idle   - frames 0–3   (4 frames)
  // Row 1: attack - frames 8–15  (8 frames, full row)
  // Row 2: hurt   - frames 16–21 (6 frames)
  // Row 3: death  - frames 24–24 (1 frame)

  initAnimations(scene) {
    if (!scene.anims.exists('plant_idle')) {
      scene.anims.create({
        key: 'plant_idle',
        frames: scene.anims.generateFrameNumbers('plant', { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1
      });
    }

    if (!scene.anims.exists('plant_attack')) {
      scene.anims.create({
        key: 'plant_attack',
        frames: scene.anims.generateFrameNumbers('plant', { start: 8, end: 15 }),
        frameRate: 10,
        repeat: 0
      });
    }

    if (!scene.anims.exists('plant_hurt')) {
      scene.anims.create({
        key: 'plant_hurt',
        frames: scene.anims.generateFrameNumbers('plant', { start: 16, end: 21 }),
        frameRate: 10,
        repeat: 0
      });
    }

    if (!scene.anims.exists('plant_death')) {
      scene.anims.create({
        key: 'plant_death',
        frames: scene.anims.generateFrameNumbers('plant', { start: 24, end: 27 }),
        frameRate: 8,
        repeat: 0
      });
    }
  }

  //  MELEE SENSOR 

  setMeleeActive(active) {
    if (!this.meleeSensor) return;
    this.meleeActive = active;
    this.meleeSensor.collisionFilter.mask = active ? 0xFFFFFFFF : 0;
  }

  updateMeleePosition() {
    if (!this.meleeSensor) return;
    Phaser.Physics.Matter.Matter.Body.setPosition(this.meleeSensor, {
      x: this.x,
      y: this.y - 10
    });
  }

  //  AI / UPDATE

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.isDead || !this.target) return;

    if (this.meleeActive) this.updateMeleePosition();

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    // Aggro check — wake up when player is close
    if (!this.isAggro) {
      if (dist <= this.aggroRange) {
        this.isAggro = true;
      } else {
        // Not aggro — just idle
        if (this.anims.currentAnim?.key !== 'plant_idle') {
          this.play('plant_idle', true);
        }
        return;
      }
    } else {
      // De-aggro if player moves too far
      if (dist > this.aggroRange * 1.5) {
        this.isAggro = false;
        if (this.anims.currentAnim?.key !== 'plant_idle') {
          this.play('plant_idle', true);
        }
        return;
      }
    }

    // Currently attacking — wait for it to finish
    if (this.isAttacking) return;

    // In attack range → attack if off cooldown
    if (dist <= this.attackRange) {
      const now = this.scene.time.now;
      if (now - this.lastAttackTime >= this.attackCooldownMs) {
        this.startAttack();
        this.lastAttackTime = now;
      }
      return;
    }

    // Aggro but player not in attack range — play idle (plant is alert but waiting)
    if (this.anims.currentAnim?.key !== 'plant_idle') {
      this.play('plant_idle', true);
    }
  }

  //  ATTACK 
  startAttack() {
    if (this.isDead) return;

    this.isAttacking = true;

    this.play('plant_attack', true);

    const msPerFrame = 1000 / this.attackFps;
    const onDelay  = this.hitStartFrame * msPerFrame;
    const offDelay = (this.hitEndFrame + 1) * msPerFrame;

    this.scene.time.delayedCall(onDelay, () => {
      if (!this.active || this.isDead) return;
      this.setMeleeActive(true);
      this.updateMeleePosition();
    });

    this.scene.time.delayedCall(offDelay, () => {
      if (!this.active || this.isDead) return;
      this.setMeleeActive(false);
    });

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'plant_attack', () => {
      this.isAttacking = false;
      this.setMeleeActive(false);
      if (!this.isDead) this.play('plant_idle', true);
    });
  }

  // DAMAGE / DEATH 
  takeDamage(amount) {
    if (this.isDead) return;
    this.hp -= amount;

    // Flash red
    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => this.clearTint());

    // Play hurt animation then return to idle
    this.play('plant_hurt', true);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'plant_hurt', () => {
      if (!this.isDead) this.play('plant_idle', true);
    });

    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;

    this.setMeleeActive(false);

    const ss = this.scene.stageState;
    if (ss) {
      ss.enemiesRemaining = Math.max(0, (ss.enemiesRemaining ?? 0) - 1);
      if (ss.enemiesRemaining === 0) ss.stageCleared = true;
    }

    this.play('plant_death');

    const HEAL_DROP_CHANCE = 0.30;
    if (Math.random() < HEAL_DROP_CHANCE) {
      this.scene.spawnHeartPickup(this.x, this.y);
    }

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'plant_death', () => {
      this.destroy();
    });
  }

  // CLEANUP

  destroy(fromScene) {
    const scene = this.scene;
    const world = scene?.matter?.world;

    if (world && this.meleeSensor) {
      world.remove(this.meleeSensor);
      this.meleeSensor = null;
    } else {
      this.meleeSensor = null;
    }

    super.destroy(fromScene);
  }
}