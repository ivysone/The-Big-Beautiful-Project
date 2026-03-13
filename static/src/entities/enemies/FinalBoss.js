import { CATS } from "../../utils/physicsCategories.js";

export class SkullBoss extends Phaser.Physics.Matter.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {{ target: Phaser.GameObjects.GameObject }} deps
   */
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, "skullBoss");

    scene.add.existing(this);

    this.target = deps.target;
    this.isEnemy = true;
    this.isBoss = true;

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    const mainBody = Bodies.circle(0, 10, 34, { label: "skullBossBody" });

    const compoundBody = Body.create({
      parts: [mainBody],
      friction: 0.0,
      restitution: 0,
    });

    this.setExistingBody(compoundBody);
    this.setFixedRotation();
    this.setIgnoreGravity(true);
    this.setFrictionAir(0.06);

    for (const part of this.body.parts) {
      part.collisionFilter.category = CATS.ENEMY;
      part.collisionFilter.mask = CATS.WORLD | CATS.NPC | CATS.PLAYER_ATK;
    }

    this.setOrigin(0.5, 0.5);
    Phaser.Physics.Matter.Matter.Body.setPosition(this.body, { x, y });

    this.mainBody = mainBody;

    this.setScale(1.5);

    // Boss stats
    this.maxHP = 300;
    this.hp = this.maxHP;
    this.isDead = false;
    

    // Aggro / combat
    this.aggroRange = 420;
    this.deaggroRange = 700;
    this.isAggro = false;
    this.isStandby = true;
    this.phase = "idle";
    this.phaseUntil = 0;

    // Standby interaction
    this.interactRadius = 200;
    this.interactPromptText = "E to talk";
    this.portraitKey = "skullBoss_portrait";

    this.dialogueResolver = () => {
      if (this.isStandby) return "skullboss_intro";
      return null;
    };

    this.onDialogueComplete = (scene, dialogueId) => {
      if (dialogueId === "skullboss_intro" && this.isStandby) {
        this.exitStandby();
      }
    };

    // Flight tuning
    this.maxSpeed = 4.2;
    this.steerForce = 0.0018;
    this.arriveRadius = 40;

    // Orbit / positioning
    this.orbitRadius = 180;
    this.orbitSpeed = 0.0023;
    this.orbitDirection = Phaser.Math.RND.pick([-1, 1]);
    this.orbitYOffset = -40;
    this.preferredHeight = -80;

    // Attack cadence
    this.attackCooldownMs = 2200;
    this.lastAttackTime = -Infinity;

    // Dash attack
    this.dashSpeed = 9;
    this.dashDurationMs = 450;
    this.dashEndTime = 0;
    this.dashVector = { x: 0, y: 0 };

    // Dash telegraph
    this.dashWindupMs = 1000;
    this.dashWindupEndTime = 0;
    this.dashShakeAmount = 6;
    this.baseDashWindupPos = { x: x, y: y };

    // Fire attack
    this.fireDurationMs = 1400;
    this.fireTickMs = 120;
    this.lastFireTick = 0;
    this.fireHeightAbovePlayer = 70;
    this.fireAlignTolerance = 8;

    // Facing
    this.facing = 1;
    this.setScale(-1.5, 1.5);

    // Dash hitbox
    this.dashSensor = scene.matter.add.circle(x, y, 40, {
      isSensor: true,
      label: "skullBossDash",
    });
    this.dashSensor.isEnemyMeleeHitbox = true;
    this.dashSensor.owner = this;
    this.dashSensor.collisionFilter.category = CATS.ENEMY_ATK;
    this.dashSensor.collisionFilter.mask = 0;

    // Fire hitbox
    this.fireSensor = scene.matter.add.rectangle(x, y, 150, 40, {
      isSensor: true,
      label: "skullBossFire",
    });
    this.fireSensor.isEnemyMeleeHitbox = true;
    this.fireSensor.owner = this;
    this.fireSensor.collisionFilter.category = CATS.ENEMY_ATK;
    this.fireSensor.collisionFilter.mask = 0;

    this.dashActive = false;
    this.fireActive = false;

    // Animation flags
    this.isAttacking = false;

    this.initAnimations(scene);
    this.play("skullIdle");
  }

  static preload(scene) {
    scene.load.spritesheet("skullBoss", "/static/assets/Enemies/damned/Large Skull.png", {
      frameWidth: 128,
      frameHeight: 128,
    });
  }

  initAnimations(scene) {
    if (!scene.anims.exists("skullIdle")) {
      scene.anims.create({
        key: "skullIdle",
        frames: scene.anims.generateFrameNumbers("skullBoss", { start: 0, end: 9 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    if (!scene.anims.exists("skullAttack")) {
      scene.anims.create({
        key: "skullAttack",
        frames: scene.anims.generateFrameNumbers("skullBoss", { start: 10, end: 29 }),
        frameRate: 10,
        repeat: -1,
      });
    }

    if (!scene.anims.exists("skullDeath")) {
      scene.anims.create({
        key: "skullDeath",
        frames: scene.anims.generateFrameNumbers("skullBoss", { start: 30, end: 39 }),
        frameRate: 8,
        repeat: 0,
      });
    }
  }

  enterStandby() {
    this.isStandby = true;
    this.phase = "standby";
    this.isAggro = false;
    this.isAttacking = false;

    this.setVelocity(0, 0);
    this.setDashActive(false);
    this.setFireActive(false);
    this.clearTint();

    if (this.anims.currentAnim?.key !== "skullIdle") {
      this.play("skullIdle", true);
    }
  }

  exitStandby() {
    this.isStandby = false;
    this.phase = "idle";
  }

  interact(player) {
    if (!this.isStandby) return;
    this.exitStandby();
  }

  setDashActive(active) {
    this.dashActive = active;
    if (this.dashSensor) {
      this.dashSensor.collisionFilter.mask = active ? CATS.PLAYER : 0;
    }
  }

  setFireActive(active) {
    this.fireActive = active;
    if (this.fireSensor) {
      this.fireSensor.collisionFilter.mask = active ? CATS.PLAYER : 0;
    }
  }

  updateAttackSensors() {
    const Body = Phaser.Physics.Matter.Matter.Body;

    if (this.dashSensor) {
      Body.setPosition(this.dashSensor, {
        x: this.x,
        y: this.y,
      });
    }

    if (this.fireSensor) {
      const fireOffsetY = 55; // adjust until it sits right under the skull
      Body.setPosition(this.fireSensor, {
        x: this.x,
        y: this.y + fireOffsetY,
      });

      // keep it flat, not rotated
      Body.setAngle(this.fireSensor, 0);
    }
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.isDead || !this.target) return;

    if (this.isStandby) {
      this.setVelocity(0, 0);
      this.setDashActive(false);
      this.setFireActive(false);
      this.updateAttackSensors();

      if (this.anims.currentAnim?.key !== "skullIdle") {
        this.play("skullIdle", true);
      }

      return;
    }

    this.updateAttackSensors();

    const distToPlayer = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      this.target.x,
      this.target.y
    );

    // Aggro
    if (!this.isAggro) {
      if (distToPlayer <= this.aggroRange) this.isAggro = true;
    } else {
      if (distToPlayer >= this.deaggroRange) {
        this.isAggro = false;
        this.phase = "idle";
        this.setVelocity(0, 0);
        this.setDashActive(false);
        this.setFireActive(false);
        if (this.anims.currentAnim?.key !== "skullIdle") {
          this.play("skullIdle", true);
        }
        return;
      }
    }

    if (!this.isAggro) {
      this.idleFloat(time);
      return;
    }

    this.updateFacing();

    // Dash Windup
    if (this.phase === "dash_windup") {
      this.handleDashWindupPhase(time);
      return;
    }

    // Dash phase
    if (this.phase === "dash") {
      this.handleDashPhase(time);
      return;
    }

    // Fire Align
    if (this.phase === "fire_align") {
      this.handleFireAlignPhase(time);
      return;
    }

    // Fire phase
    if (this.phase === "fire") {
      this.handleFirePhase(time);
      return;
    }

    // Recover phase
    if (this.phase === "recover") {
      if (time >= this.phaseUntil) {
        this.phase = "circle";
      } else {
        this.circlePlayer(time, true);
        return;
      }
    }

    // Default combat movement
    this.phase = "circle";
    this.circlePlayer(time, false);

    const now = this.scene.time.now;
    if (now - this.lastAttackTime >= this.attackCooldownMs) {
      this.chooseAttack(distToPlayer);
      this.lastAttackTime = now;
    }
  }

  idleFloat(time) {
    const t = time * 0.0018;
    const tx = this.x + Math.cos(t) * 0.6;
    const ty = this.y + Math.sin(t * 1.5) * 0.4;
    this.seek(tx, ty, true);

    if (this.anims.currentAnim?.key !== "skullIdle") {
      this.play("skullIdle", true);
    }
  }

  updateFacing() {
    const dx = this.target.x - this.x;
    this.facing = dx < 0 ? -1 : 1;

    const absScaleX = Math.abs(this.scaleX) || 1.5;
    this.setScale(this.facing < 0 ? absScaleX : -absScaleX, Math.abs(this.scaleY) || 1.5);
  }

  circlePlayer(time, gentle = false, playAnim = true) {
    const angle = time * this.orbitSpeed * this.orbitDirection;

    const tx = this.target.x + Math.cos(angle) * this.orbitRadius;
    const ty =
      this.target.y +
      this.orbitYOffset +
      Math.sin(angle * 1.6) * 30 +
      this.preferredHeight;

    this.seek(tx, ty, gentle);

    if (playAnim && this.anims.currentAnim?.key !== "skullIdle") {
      this.play("skullIdle", true);
    }
  }

  chooseAttack(distToPlayer) {
    if (this.isDead) return;

    // Bias by range:
    // - closer = more likely dash
    // - mid/far = more likely fire
    const roll = Math.random();

    if (distToPlayer < 140 && roll < 0.65) {
      this.startDashAttack();
      return;
    }

    if (distToPlayer < 320) {
      if (roll < 0.55) this.startFireAttack();
      else this.startDashAttack();
      return;
    }

    this.startFireAttack();
  }

  handleDashWindupPhase(time) {
    const Body = Phaser.Physics.Matter.Matter.Body;

    this.setVelocity(0, 0);
    this.setDashActive(false);
    this.setFireActive(false);

    if (this.anims.currentAnim?.key !== "skullIdle") {
      this.play("skullIdle", true);
    }

    const shakeX = Phaser.Math.Between(-this.dashShakeAmount, this.dashShakeAmount);
    const shakeY = Phaser.Math.Between(-this.dashShakeAmount, this.dashShakeAmount);

    Body.setPosition(this.body, {
      x: this.baseDashWindupPos.x + shakeX,
      y: this.baseDashWindupPos.y + shakeY,
    });

    if (time >= this.dashWindupEndTime) {
      Body.setPosition(this.body, {
        x: this.baseDashWindupPos.x,
        y: this.baseDashWindupPos.y,
      });

      this.phase = "dash";
      this.setDashActive(true);

      this.setVelocity(
        this.dashVector.x * this.dashSpeed,
        this.dashVector.y * this.dashSpeed
      );

      this.dashEndTime = this.scene.time.now + this.dashDurationMs;
    }
  }

  startDashAttack() {
    if (this.isDead || !this.target) return;

    this.phase = "dash_windup";
    this.isAttacking = true;

    this.setDashActive(false);
    this.setFireActive(false);

    this.setVelocity(0, 0);

    this.baseDashWindupPos.x = this.x;
    this.baseDashWindupPos.y = this.y;

    this.dashWindupEndTime = this.scene.time.now + this.dashWindupMs;

    // Face the player before the dash
    let dx = this.target.x - this.x;
    let dy = this.target.y - this.y;
    const len = Math.hypot(dx, dy) || 1;

    this.dashVector.x = dx / len;
    this.dashVector.y = dy / len;

    if (this.anims.currentAnim?.key !== "skullIdle") {
      this.play("skullIdle", true);
    }

  }

  handleDashPhase(time) {
    this.setDashActive(true);
    this.setFireActive(false);

    this.setVelocity(
      this.dashVector.x * this.dashSpeed,
      this.dashVector.y * this.dashSpeed
    );

    if (this.anims.currentAnim?.key !== "skullIdle") {
      this.play("skullIdle", true);
    }

    if (time >= this.dashEndTime) {
      this.setDashActive(false);
      this.isAttacking = false;

      this.phase = "recover";
      this.phaseUntil = time + 500;
    }
  }

  startFireAttack() {
    if (this.isDead || !this.target) return;

    this.phase = "fire_align";
    this.isAttacking = true;

    this.setDashActive(false);
    this.setFireActive(false);

    // keep idle while moving into place
    if (this.anims.currentAnim?.key !== "skullIdle") {
      this.play("skullIdle", true);
    }
  }

  handleFireAlignPhase(time) {
    const targetX = this.target.x;
    const targetY = this.target.y - this.fireHeightAbovePlayer;

    this.seek(targetX, targetY, false);

    if (this.anims.currentAnim?.key !== "skullIdle") {
      this.play("skullIdle", true);
    }

    const dx = Math.abs(this.x - targetX);
    const dy = Math.abs(this.y - targetY);

    if (dx <= 24 && dy <= this.fireAlignTolerance) {
      this.phase = "fire";
      this.phaseUntil = this.scene.time.now + this.fireDurationMs;
      this.lastFireTick = 0;

      this.setVelocity(0, 0);
      this.play("skullAttack", true);
    }
  }

  handleFirePhase(time) {
    this.setVelocity(0, 0);
    this.setDashActive(false);

    if (this.anims.currentAnim?.key !== "skullAttack") {
      this.play("skullAttack", true);
    }

    const frame = this.anims.currentFrame?.index ?? 0;
    console.log(frame);
    if (frame >= 5) {
      this.setFireActive(true);
    }

    if (time - this.lastFireTick >= this.fireTickMs) {
      this.lastFireTick = time;
      this.emitFire();
    }

    if (time >= this.phaseUntil) {
      this.setFireActive(false);
      this.isAttacking = false;
      this.phase = "recover";
      this.phaseUntil = time + 700;

      if (this.anims.currentAnim?.key !== "skullIdle") {
        this.play("skullIdle", true);
      }
    }
  }

  emitFire() {
    if (!this.scene || !this.target) return;

    // Direction boss is facing
    const dirX = this.facing;
    const dirY = 0;

    const spawnX = this.x + dirX * 60;
    const spawnY = this.y + 8;

    // Replace this with your own projectile / flame prefab if you have one
    // Example event-based spawn:
    this.scene.events.emit("boss-fireball", {
      x: spawnX,
      y: spawnY,
      vx: dirX * 4,
      vy: dirY + Phaser.Math.FloatBetween(-0.4, 0.4),
      owner: this,
      damage: 10,
    });
  }

  /**
   * Steer toward a point.
   * @param {number} tx
   * @param {number} ty
   * @param {boolean} gentle
   */
  seek(tx, ty, gentle = false) {
    const vx = tx - this.x;
    const vy = ty - this.y;
    const d = Math.hypot(vx, vy) || 1;

    const speed = gentle ? this.maxSpeed * 0.55 : this.maxSpeed;
    const desiredSpeed = d < this.arriveRadius
      ? speed * (d / this.arriveRadius)
      : speed;

    const nx = vx / d;
    const ny = vy / d;

    const desiredVx = nx * desiredSpeed;
    const desiredVy = ny * desiredSpeed;

    const curV = this.body.velocity;

    const steerScale = gentle ? this.steerForce * 0.65 : this.steerForce;
    const steerX = (desiredVx - curV.x) * steerScale;
    const steerY = (desiredVy - curV.y) * steerScale;

    this.applyForce({ x: steerX, y: steerY });

    const vNow = this.body.velocity;
    const vMag = Math.hypot(vNow.x, vNow.y);
    if (vMag > this.maxSpeed) {
      const s = this.maxSpeed / vMag;
      this.setVelocity(vNow.x * s, vNow.y * s);
    }
  }

  takeDamage(amount) {
    if (this.isDead) return;

    this.hp -= amount;

    this.setTint(0xff8844);
    this.scene.time.delayedCall(80, () => {
      if (this.active) this.clearTint();
    });

    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.isDead) return;

    this.isDead = true;
    this.phase = "dead";

    this.setVelocity(0, 0);
    this.setStatic(true);
    this.setDashActive(false);
    this.setFireActive(false);

    this.play("skullDeath");

    this.once(
      Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + "skullDeath",
      () => {
        this.destroy();
      }
    );
  }

  destroy(fromScene) {
    const world = this.scene?.matter?.world;

    if (world && this.dashSensor) {
      world.remove(this.dashSensor);
      this.dashSensor = null;
    } else {
      this.dashSensor = null;
    }

    if (world && this.fireSensor) {
      world.remove(this.fireSensor);
      this.fireSensor = null;
    } else {
      this.fireSensor = null;
    }

    super.destroy(fromScene);
  }
}
