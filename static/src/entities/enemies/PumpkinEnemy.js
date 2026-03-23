import { CATS } from "../../utils/physicsCategories.js";

export class PumpkinEnemy extends Phaser.Physics.Matter.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {{ target: Phaser.GameObjects.GameObject }} deps
   */
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, "pumpkin");

    scene.add.existing(this);

    this.target = deps.target;
    this.isEnemy = true;

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;
    const mainBody = Bodies.rectangle(0, 0, 22, 18, { label: "pumpkinBody" });

    const compoundBody = Body.create({
      parts: [mainBody],
      friction: 0.1,
      restitution: 0,
    });

    this.setExistingBody(compoundBody);
    this.setFixedRotation();
    this.setFrictionAir(0.02);
    this.setIgnoreGravity(false);

    for (const part of this.body.parts) {
      part.collisionFilter.category = CATS.ENEMY;
      part.collisionFilter.mask = CATS.WORLD | CATS.NPC | CATS.PLAYER_ATK;
    }

    this.setOrigin(0.5, 0.5);
    Phaser.Physics.Matter.Matter.Body.setPosition(this.body, { x, y });

    this.mainBody = mainBody;

    // Stats
    this.maxHP = 20;
    this.hp = 20;
    this.isDead = false;

    // AI
    this.meleeRange = 60;
    this.aggroRange = 220;
    this.deaggroRange = 420;
    this.isAggro = false;

    // Attack
   this.attackCooldownMs = 1800;
   this.lastAttackTime = -Infinity;
   this.attackFps = 12;
   this.attackId = 0;
   this.hitThisAttack = new Set();


    // Grounded tracking 
    this.isGrounded = true;
    this.groundGraceUntil = 0;

    // Facing
    this.facing = 1;
    this.setScale(1, 1);

    // Melee sensor
    this.meleeSensor = scene.matter.add.rectangle(x, y, 22, 18, {
      isSensor: true,
      label: "pumpkinMelee",
    });
    this.meleeSensor.isEnemyMeleeHitbox = true;
    this.meleeSensor.owner = this;
    this.setMeleeActive(false);

    this.meleeSensor.collisionFilter.category = CATS.ENEMY_ATK;
    this.meleeSensor.collisionFilter.mask = CATS.PLAYER;

    // One-hit-per-jump
    this.attackId = 0;
    this.hitThisAttack = new Set();

    // Animations
    this.initAnimations(scene);
    this.play("pumpkin_idle");
}       

  static preload(scene) {
    scene.load.spritesheet("pumpkin", "/static/assets/Enemies/mixed/Pumpkin.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
  }

  initAnimations(scene) {
    if (!scene.anims.exists("pumpkin_idle")) {
      scene.anims.create({
        key: "pumpkin_idle",
        frames: scene.anims.generateFrameNumbers("pumpkin", { start: 0, end: 9 }),
        frameRate: 5,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('pumpkin_attack')) {
        scene.anims.create({
          key: 'pumpkin_attack',
          frames: scene.anims.generateFrameNumbers('pumpkin', { start: 10, end: 18}),
          frameRate: 8,
          repeat: 1
        });
      }

    if (!scene.anims.exists("pumpkin_death")) {
      scene.anims.create({
        key: "pumpkin_death",
        frames: scene.anims.generateFrameNumbers("pumpkin", { start: 19, end: 26 }),
        frameRate: 6,
        repeat: 0,
      });
    }
  }

  setMeleeActive(active) {
    if (!this.meleeSensor) return;
    this.meleeActive = active;
    this.meleeSensor.collisionFilter.mask = active ? 0xffffffff : 0;
  }

  updateMeleePosition() {
    if (!this.meleeSensor) return;
    const offsetY = -50;

    Phaser.Physics.Matter.Matter.Body.setPosition(this.meleeSensor, {
      x: this.x,
      y: this.y + offsetY,
    });
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.isDead || !this.target) return;

    // Maintain sensor placement while active
    if (this.meleeActive) this.updateMeleePosition();

    // Aggro by distance to player
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (!this.isAggro) {
      if (dist <= this.aggroRange) this.isAggro = true;
    } else {
      if (dist >= this.deaggroRange) {
        this.isAggro = false;
        if (this.anims.currentAnim?.key !== "pumpkin_idle") {
          this.play("pumpkin_idle", true);
        }
        return;
      }
    }

    // Face player for sprite + hitbox
    if (dx < 0) {
      this.facing = -1;
      this.setScale(1, 1);
    } else {
      this.facing = 1;
      this.setScale(-1, 1);
    }

    if (!this.isAttacking && dist <= this.meleeRange && time > this.attackCooldown) {
        this.startAttack(time);
        return;
      }
    if (!this.isAttacking) (this.play("pumpkin_idle", true));
    }
    
    

  startAttack() {
    if (this.isDead) return;

    this.attackId++;
    this.hitThisAttack.clear();

    this.play("pumpkin_attack", true);

    // Attack hitbox window during the jump
    this.scene.time.delayedCall(this.attackOnDelayMs, () => {
      if (!this.active || this.isDead) return;
      this.setMeleeActive(true);
      this.updateMeleePosition();
    });

    this.scene.time.delayedCall(this.attackOffDelayMs, () => {
      if (!this.active || this.isDead) return;
      this.setMeleeActive(false);
    });

    // When anim ends, go idle
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "pumpkin_attack", () => {
      if (!this.active || this.isDead) return;
      this.setMeleeActive(false);
      if (this.anims.currentAnim?.key !== "pumpkin_idle") this.play("pumpkin_idle", true);
    });
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.hp -= amount;

    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => this.clearTint());

    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;

    this.setVelocity(0, 0);
    this.setStatic(true);
    this.setMeleeActive(false);

    this.play("pumpkin_death");
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "pumpkin_death", () => {
      this.destroy();
    });
  }

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
