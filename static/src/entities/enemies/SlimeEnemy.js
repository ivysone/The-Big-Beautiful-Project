import { CATS } from "../../utils/physicsCategories.js";

export class SlimeEnemy extends Phaser.Physics.Matter.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {{ target: Phaser.GameObjects.GameObject }} deps
   */
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, "slime");

    scene.add.existing(this);

    this.target = deps.target;
    this.isEnemy = true;
    this.isSlime = true;

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    // Main body (ground enemy)
    const mainBody = Bodies.rectangle(0, 0, 22, 18, { label: "slimeBody" });

    const compoundBody = Body.create({
      parts: [mainBody],
      friction: 0.01,
      restitution: 0.0,
    });

    this.setExistingBody(compoundBody);
    this.setFixedRotation();
    this.setFrictionAir(0.02);
    this.setIgnoreGravity(false);

    for (const part of this.body.parts) {
      part.collisionFilter.category = CATS.ENEMY;
      part.collisionFilter.mask = CATS.WORLD | CATS.NPC | CATS.PLAYER_ATK;
    }

    this.setOrigin(0.5, 0.70);
    Phaser.Physics.Matter.Matter.Body.setPosition(this.body, { x, y });

    this.mainBody = mainBody;

    // Stats
    this.maxHP = 25;
    this.hp = 25;
    this.isDead = false;

    // AI
    this.aggroRange = 260;
    this.deaggroRange = 520;
    this.isAggro = false;

    // Jump behavior
    this.jumpCooldownMs = 1200;
    this.lastJumpTime = -Infinity;
    this.jumpVX = 3.8;   
    this.jumpVY = -6.2;
    this.jumpVXClose = 2.4;

    // Attack window during jump
    this.attackOnDelayMs = 60;
    this.attackOffDelayMs = 620;

    // Grounded tracking 
    this.isGrounded = true;
    this.groundGraceUntil = 0;

    // Facing
    this.facing = 1;
    this.setScale(1, 1);

    // Melee sensor
    this.meleeSensor = scene.matter.add.rectangle(x, y, 22, 18, {
      isSensor: true,
      label: "slimeMelee",
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
    this.play("slime_idle");

    // Ground contact hooks
    this.setOnCollide((data) => {
      if (this.isDead) return;
      const other = data?.bodyB;
      if (other && (other.collisionFilter.category & CATS.WORLD)) {
        this.isGrounded = true;
        this.groundGraceUntil = this.scene.time.now + 120;
      }
    });
  }

  static preload(scene) {
    scene.load.spritesheet("slime", "/static/assets/Enemies/slime/blue.png", {
      frameWidth: 32,
      frameHeight: 32,
    });
  }

  initAnimations(scene) {
    if (!scene.anims.exists("slime_idle")) {
      scene.anims.create({
        key: "slime_idle",
        frames: scene.anims.generateFrameNumbers("slime", { start: 0, end: 4 }),
        frameRate: 5,
        repeat: -1,
      });
    }

    if (!scene.anims.exists("slime_jump")) {
      scene.anims.create({
        key: "slime_jump",
        frames: scene.anims.generateFrameNumbers("slime", { start: 8, end: 15 }),
        frameRate: 12,
        repeat: 0,
      });
    }

    if (!scene.anims.exists("slime_death")) {
      scene.anims.create({
        key: "slime_death",
        frames: scene.anims.generateFrameNumbers("slime", { start: 16, end: 21 }),
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
        if (this.anims.currentAnim?.key !== "slime_idle") this.play("slime_idle", true);
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

    if (!this.isAggro) {
      if (this.anims.currentAnim?.key !== "slime_idle") this.play("slime_idle", true);
      return;
    }

    // Jump only when grounded + cooldown + not already in jump anim
    const now = this.scene.time.now;
    const isJumpAnim = this.anims.currentAnim?.key === "slime_jump";

    if (this.isGrounded && !isJumpAnim && now - this.lastJumpTime >= this.jumpCooldownMs) {
      this.startJumpAttack();
      this.lastJumpTime = now;
      return;
    }

    // Otherwise idle anim
    if (!isJumpAnim && this.anims.currentAnim?.key !== "slime_idle") {
      this.play("slime_idle", true);
    }
  }

  startJumpAttack() {
    if (this.isDead) return;

    this.attackId++;
    this.hitThisAttack.clear();

    this.play("slime_jump", true);

    const dx = this.target.x - this.x;
    const dirX = Math.sign(dx) || this.facing;

    const close = Math.abs(dx) < 60;
    const vx = (close ? this.jumpVXClose : this.jumpVX) * dirX;
    const vy = this.jumpVY;

    this.setVelocity(vx, vy);

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
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "slime_jump", () => {
      if (!this.active || this.isDead) return;
      this.setMeleeActive(false);
      if (this.anims.currentAnim?.key !== "slime_idle") this.play("slime_idle", true);
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

    this.play("slime_death");
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "slime_death", () => {
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