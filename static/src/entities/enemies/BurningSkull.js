import { CATS } from "../../utils/physicsCategories.js";

export class BurningSkull extends Phaser.Physics.Matter.Sprite {
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, "burningSkull");

    scene.add.existing(this);

    this.target = deps.target;
    this.isEnemy = true;

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    const mainBody = Bodies.rectangle(0, 0, 20, 20, { label: "burningSkullBody" });

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
    this.maxHP = 15;
    this.hp = 15;
    this.isDead = false;
    this.isExploding = false;

    this.lastHitAttackId = -1;

    // AI — slow and floaty
    this.maxSpeed = 2.5;        
    this.steerForce = 0.002;
    this.arriveRadius = 24;

    this.aggroRange = 600;
    this.deaggroRange = 900;
    this.isAggro = false;

    // Explode when this close to player
    this.explodeRange = 40;

    // Hover wobble when not aggro
    this.wanderRadius = 30;
    this.hoverOffsetY = -40;
    this.hoverSide = Phaser.Math.RND.pick([-1, 1]);
    this.orbitSpeed = 0.0015;
    this.orbitRadius = 18;
    this.hoverHoldRadius = 30;

    // Facing
    this.facing = 1;
    this.setScale(1, 1);

    this.initAnimations(scene);
    this.play("burningSkull_fly");
  }

  // ASSET LOADING

  static preload(scene) {
    scene.load.spritesheet(
      "burningSkull",
      "/static/assets/Enemies/damned/Burning Skull.png",
      { frameWidth: 64, frameHeight: 64 }  // check actual size!
    );
  }

  // ANIMATIONS 
  // Row 0: fly     - frames 0–3  (4 frames)
  // Row 1: explode - frames 4–11 (8 frames, but sheet cols may vary)

  initAnimations(scene) {
    if (!scene.anims.exists("burningSkull_fly")) {
      scene.anims.create({
        key: "burningSkull_fly",
        frames: scene.anims.generateFrameNumbers("burningSkull", { start: 0, end: 4 }),
        frameRate: 8,
        repeat: -1,
      });
    }

    if (!scene.anims.exists("burningSkull_explode")) {
      scene.anims.create({
        key: "burningSkull_explode",
        frames: scene.anims.generateFrameNumbers("burningSkull", { start: 7, end: 13 }),
        frameRate: 12,
        repeat: 0,
      });
    }
  }

  //  HOVER POINT
  getHoverPoint(time) {
    const baseX = this.target.x;
    const baseY = this.target.y + this.hoverOffsetY;
    const t = time * this.orbitSpeed * this.hoverSide;

    return {
      x: baseX + Math.cos(t) * this.orbitRadius,
      y: baseY + Math.sin(t * 1.3) * (this.orbitRadius * 0.5),
    };
  }

  // AI / UPDATE 

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.isDead || !this.target) return;

    // Already exploding — wait for animation
    if (this.isExploding) return;

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    // Aggro check
    if (!this.isAggro) {
      if (dist <= this.aggroRange) {
        this.isAggro = true;
      } else {
        // Idle wobble
        const t = time * 0.002;
        const wx = Math.cos(t) * this.wanderRadius;
        const wy = Math.sin(t * 1.3) * (this.wanderRadius * 0.4);
        this.seek(this.x + wx, this.y + wy, true);
        return;
      }
    } else {
      if (dist >= this.deaggroRange) {
        this.isAggro = false;
        this.setVelocity(0, 0);
        return;
      }
    }

    // Face player
    if (dx < 0) {
      this.facing = -1;
      this.setScale(1, 1);
    } else {
      this.facing = 1;
      this.setScale(-1, 1);
    }

    // Close enough → EXPLODE!
    if (dist <= this.explodeRange) {
      this.explode();
      return;
    }

    // Chase player directly (no orbit — skulls just fly straight at you)
    this.seek(this.target.x, this.target.y + this.hoverOffsetY, false);
  }

  // SEEK 

  seek(tx, ty, gentle) {
    const vx = tx - this.x;
    const vy = ty - this.y;
    const d = Math.hypot(vx, vy) || 1;

    const speed = gentle ? this.maxSpeed * 0.35 : this.maxSpeed;
    const desiredSpeed = d < this.arriveRadius ? speed * (d / this.arriveRadius) : speed;

    const nx = vx / d;
    const ny = vy / d;

    const desiredVx = nx * desiredSpeed;
    const desiredVy = ny * desiredSpeed;

    const curV = this.body.velocity;

    const steerX = (desiredVx - curV.x) * (gentle ? this.steerForce * 0.5 : this.steerForce);
    const steerY = (desiredVy - curV.y) * (gentle ? this.steerForce * 0.5 : this.steerForce);

    this.applyForce({ x: steerX, y: steerY });

    const vNow = this.body.velocity;
    const vMag = Math.hypot(vNow.x, vNow.y);
    if (vMag > this.maxSpeed) {
      const s = this.maxSpeed / vMag;
      this.setVelocity(vNow.x * s, vNow.y * s);
    }
  }

  // EXPLODE

  explode() {
    if (this.isExploding || this.isDead) return;

    this.isExploding = true;
    this.setVelocity(0, 0);
    this.setStatic(true);

    this.play("burningSkull_explode", true);

    // Deal damage to player if close enough
    const dist = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    if (dist <= this.explodeRange * 1.5) {
      this.target.receiveHit?.({
        damage: 15,
        source: { x: this.x, y: this.y },
        canBeParried: false,
      });
    }

    this.once(
      Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "burningSkull_explode",
      () => {
        this.destroy();
      }
    );
  }

  // DAMAGE / DEATH 

  takeDamage(amount) {
    if (this.isDead || this.isExploding) return;
    this.hp -= amount;

    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => this.clearTint());

    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;

    // Dying still triggers explosion
    this.explode();

    const ss = this.scene.stageState;
    if (ss) {
      ss.enemiesRemaining = Math.max(0, (ss.enemiesRemaining ?? 0) - 1);
      if (ss.enemiesRemaining === 0) ss.stageCleared = true;
    }
  }

  // CLEANUP 

  destroy(fromScene) {
    const scene = this.scene;
    const world = scene?.matter?.world;

    if (world) {
      // nothing extra to remove
    }

    super.destroy(fromScene);
  }
}