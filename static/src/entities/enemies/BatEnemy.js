import { CATS } from "../../utils/physicsCategories.js";

export class BatEnemy extends Phaser.Physics.Matter.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {{ target: Phaser.GameObjects.GameObject }} deps
   */
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, "bat");

    scene.add.existing(this);

    this.target = deps.target;
    this.isEnemy = true;

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    const mainBody = Bodies.rectangle(0, 0, 20, 20, { label: "batBody" });

    const compoundBody = Body.create({
      parts: [mainBody],
      friction: 0.0,
      restitution: 0,
    });

    this.setExistingBody(compoundBody);
    this.setFixedRotation();
    this.setFrictionAir(0.08);
    this.setIgnoreGravity(true);

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

    // Flight tuning
    this.maxSpeed = 3.0;
    this.steerForce = 0.0012;
    this.arriveRadius = 24;

    this.hoverOffsetY = -30;
    this.hoverOffsetX = 20;
    this.wanderRadius = 40;
    this.hoverSide = Phaser.Math.RND.pick([-1, 1]);

    // Hover feel
    this.hoverHoldRadius = 35;
    this.orbitSpeed = 0.002;
    this.orbitRadius = 22;

    // Reposition after attack 
    this.repositionMs = 900;
    this.repositionUntil = 0;

    // Attacks
    this.attackCooldownMs = 1800;
    this.lastAttackTime = -Infinity;
    this.attackFps = 12;
    this.hitStartFrame = 4;
    this.hitEndFrame = 6;
    this.attackId = 0;
    this.hitThisAttack = new Set();

    // Dash window
    this.dashDurationMs = 280;
    this.dashEndTime = 0;

    // Facing
    this.facing = 1;
    this.setScale(1, 1);

    // Melee sensor
    this.meleeSensor = scene.matter.add.rectangle(x, y, 25, 25, {
      isSensor: true,
      label: "batMelee",
    });
    this.meleeSensor.isEnemyMeleeHitbox = true;
    this.meleeSensor.owner = this;
    this.setMeleeActive(false);

    this.meleeSensor.collisionFilter.category = CATS.ENEMY_ATK;
    this.meleeSensor.collisionFilter.mask = CATS.PLAYER;

    // Animations
    this.initAnimations(scene);
    this.play("bat_idle");
  }

  static preload(scene) {
    scene.load.spritesheet("bat", "/static/assets/Enemies/mixed/bat.png", {
      frameWidth: 64,
      frameHeight: 64,
    });
  }

  initAnimations(scene) {
    if (!scene.anims.exists("bat_idle")) {
      scene.anims.create({
        key: "bat_idle",
        frames: scene.anims.generateFrameNumbers("bat", { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1,
      });
    }

    if (!scene.anims.exists("bat_attack")) {
      scene.anims.create({
        key: "bat_attack",
        frames: scene.anims.generateFrameNumbers("bat", { start: 6, end: 11 }),
        frameRate: 5,
        repeat: 0,
      });
    }

    if (!scene.anims.exists("bat_death")) {
      scene.anims.create({
        key: "bat_death",
        frames: scene.anims.generateFrameNumbers("bat", { start: 12, end: 16 }),
        frameRate: 5,
        repeat: 0,
      });
    }
  }

  setMeleeActive(active) {
    if (!this.meleeSensor) return;
    this.meleeActive = active;
    this.meleeSensor.collisionFilter.mask = active ? 0xFFFFFFFF : 0;
  }

  updateMeleePosition() {
    if (!this.meleeSensor) return;
    const offsetX = 34 * this.facing;
    const offsetY = -30; 
    Phaser.Physics.Matter.Matter.Body.setPosition(this.meleeSensor, {
        x: this.x,
        y: this.y + offsetY,
    });
  }

  getHoverPoint(time) {
    const baseX = this.target.x + this.hoverOffsetX * this.hoverSide;
    const baseY = this.target.y + this.hoverOffsetY;

    const t = time * this.orbitSpeed * this.hoverSide;

    return {
      x: baseX + Math.cos(t) * this.orbitRadius,
      y: baseY + Math.sin(t * 1.3) * (this.orbitRadius * 0.5),
    };
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.isDead || !this.target) return;

    if (this.meleeActive) this.updateMeleePosition();

    // Aggro check
    const hpForAggro = this.getHoverPoint(time);
    const distToHover = Math.hypot(hpForAggro.x - this.x, hpForAggro.y - this.y);

    if (!this.isAggro) {
      if (distToHover <= this.aggroRange) this.isAggro = true;
    } else {
      if (distToHover >= this.deaggroRange) {
        this.isAggro = false;
        this.setVelocity(0, 0);
        if (this.anims.currentAnim?.key !== "bat_idle") this.play("bat_idle", true);
        return;
      }
    }

    // Not aggro -> idle hover wiggle
    if (!this.isAggro) {
      const t = time * 0.002;
      const wx = Math.cos(t) * this.wanderRadius;
      const wy = Math.sin(t * 1.3) * (this.wanderRadius * 0.4);
      this.seek(this.x + wx, this.y + wy, true);
      if (this.anims.currentAnim?.key !== "bat_idle") this.play("bat_idle", true);
      return;
    }

    // Face player
    const dxPlayer = this.target.x - this.x;
    if (dxPlayer < 0) {
      this.facing = -1;
      this.setScale(1, 1);
    } else {
      this.facing = 1;
      this.setScale(-1, 1);
    }

    if (this.scene.time.now < this.dashEndTime) {
      if (this.meleeActive) this.updateMeleePosition();
      return;
    }

    // Reposition
    if (this.scene.time.now < this.repositionUntil) {
      const hp = this.getHoverPoint(time);
      this.seek(hp.x, hp.y, false);
      if (this.anims.currentAnim?.key !== "bat_idle") this.play("bat_idle", true);
      return;
    }

    // If close enough to player -> try attack, otherwise drift back to hover
    const distToPlayer = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (distToPlayer <= this.meleeRange) {
      const now = this.scene.time.now;

      if (now - this.lastAttackTime >= this.attackCooldownMs) {
        this.startMeleeAttack();
        this.lastAttackTime = now;
      } else {
        // During cooldown, prefer returning to hover rather than sitting on the player
        const hp = this.getHoverPoint(time);
        this.seek(hp.x, hp.y, true);
        if (this.anims.currentAnim?.key !== "bat_idle") this.play("bat_idle", true);
      }
      return;
    }

    // Normal hover/chase behaviour
    const hp = this.getHoverPoint(time);
    const dHover = Math.hypot(hp.x - this.x, hp.y - this.y);

    if (dHover > this.hoverHoldRadius) this.seek(hp.x, hp.y, false);
    else this.seek(hp.x, hp.y, true);

    if (this.anims.currentAnim?.key !== "bat_idle") this.play("bat_idle", true);
  }

  /**
   * Steer toward a point.
   * @param {number} tx
   * @param {number} ty
   * @param {boolean} gentle if true, slower and floatier
   */
  seek(tx, ty, gentle) {
    const vx = tx - this.x;
    const vy = ty - this.y;
    const d = Math.hypot(vx, vy) || 1;

    // Arrive
    const speed = gentle ? this.maxSpeed * 0.35 : this.maxSpeed;
    const desiredSpeed = d < this.arriveRadius ? speed * (d / this.arriveRadius) : speed;

    const nx = vx / d;
    const ny = vy / d;

    const desiredVx = nx * desiredSpeed;
    const desiredVy = ny * desiredSpeed;

    // Current velocity from Matter body
    const curV = this.body.velocity;

    // Steering force
    const steerX = (desiredVx - curV.x) * (gentle ? this.steerForce * 0.5 : this.steerForce);
    const steerY = (desiredVy - curV.y) * (gentle ? this.steerForce * 0.5 : this.steerForce);

    this.applyForce({ x: steerX, y: steerY });

    // Hard clamp speed
    const vNow = this.body.velocity;
    const vMag = Math.hypot(vNow.x, vNow.y);
    if (vMag > this.maxSpeed) {
      const s = this.maxSpeed / vMag;
      this.setVelocity(vNow.x * s, vNow.y * s);
    }
  }

  startMeleeAttack() {
    if (this.isDead) return;

    this.isAttacking = true;

    this.attackId++;
    this.hitThisAttack.clear();

    const px = this.target.x;
    const py = this.target.y;

    // Direction to player
    let dx = px - this.x;
    let dy = py - this.y;

    dy *= 0.35;

    const len = Math.hypot(dx, dy) || 1;

    const dirX = dx / len;
    const dirY = dy / len;

    const dashSpeed = 6;

    this.setVelocity(dirX * dashSpeed, dirY * dashSpeed);

    this.dashEndTime = this.scene.time.now + 220;

    this.play("bat_attack", true);

    this.scene.time.delayedCall(40, () => {
        if (!this.active || this.isDead) return;
        this.setMeleeActive(true);
        this.updateMeleePosition();
    });

    this.scene.time.delayedCall(220, () => {
        if (!this.active || this.isDead) return;
        this.setMeleeActive(false);
    });

    this.once(
        Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "bat_attack",
        () => {
        this.isAttacking = false;
        this.setMeleeActive(false);
        this.repositionUntil = this.scene.time.now + this.repositionMs;
        }
    );
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

    this.play("bat_death");
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "bat_death", () => {
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