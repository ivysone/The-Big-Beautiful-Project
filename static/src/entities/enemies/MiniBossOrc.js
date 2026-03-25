import { OrcEnemy } from "./OrcEnemy.js";

export class MiniBossOrc extends OrcEnemy {
  constructor(scene, x, y, deps) {
    super(scene, x, y, deps);

    this.baseScale = 1.5;
    this.setScale(this.baseScale, this.baseScale);

    this.isMiniBoss = true;

    // Boss stats
    this.maxHP = 160;
    this.hp = 160;

    // Base tuning
    this.walkSpeed = 1.5;
    this.meleeRange = 46;
    this.aggroRange = 260;
    this.deaggroRange = 520;
    this.attackCooldownMs = 1800;

    // Boss phase/state
    this.phase = "idle";
    this.phaseUntil = 0;
    this.isEnraged = false;
    this.hasSummonedAtHalf = false;

    // Leap attack
    this.leapCooldownMs = 3500;
    this.lastLeapTime = -Infinity;
    this.leapWindupMs = 500;
    this.leapLandingDamage = 18;
    this.leapXSpeed = 5.5;
    this.leapYSpeed = -10.5;
    this.waitingForLeapLanding = false;

    // Charge attack
    this.chargeCooldownMs = 4500;
    this.lastChargeTime = -Infinity;
    this.chargeWindupMs = 450;
    this.chargeDurationMs = 900;
    this.chargeSpeed = 6.5;
    this.isCharging = false;

    // Summon
    this.summonCooldownMs = 9000;
    this.lastSummonTime = -Infinity;
    this.summonWindupMs = 900;
    this.maxSummonsPerFight = 1;
    this.summonsUsed = 0;

    // Optional visual distinction
    this.setScale(this.scaleX * 1.25, this.scaleY * 1.25);
    this.setDepth(950);
  }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    if (this.isDead || !this.target) return;

    // If stunned, let the base orc behavior stop it
    if (this.isStunned()) return;

    // Enrage trigger
    if (!this.isEnraged && this.hp <= this.maxHP * 0.5) {
      this.enterEnrage();
    }

    // Boss-only states override normal orc movement
    if (this.phase === "windup") {
      this.handleWindupPhase(time);
      return;
    }

    if (this.phase === "leap") {
      this.handleLeapPhase(time);
      return;
    }

    if (this.phase === "charge") {
      this.handleChargePhase(time);
      return;
    }

    if (this.phase === "summon") {
      this.handleSummonPhase(time);
      return;
    }

    if (this.phase === "recover") {
      if (time >= this.phaseUntil) {
        this.phase = "idle";
        this.isAttacking = false;
      } else {
        this.setVelocityX(0);
        return;
      }
    }

    if (!this.isAggro) return;
    if (this.isAttacking) return;

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    // Decide if we should do a special attack before normal melee/pathing
    if (this.trySpecialAttack(time, dist, dx, dy)) {
      return;
    }
  }

  trySpecialAttack(time, dist, dx, dy) {
    const now = this.scene.time.now;

    // Summon once around half hp
    if (
      !this.hasSummonedAtHalf &&
      this.hp <= this.maxHP * 0.5 &&
      this.summonsUsed < this.maxSummonsPerFight &&
      now - this.lastSummonTime >= this.summonCooldownMs
    ) {
      this.startSummon();
      this.hasSummonedAtHalf = true;
      this.lastSummonTime = now;
      return true;
    }

    // Leap if player is mid-range
    if (
      dist > 60 &&
      dist < 220 &&
      this.isOnGround &&
      now - this.lastLeapTime >= this.leapCooldownMs
    ) {
      this.startLeapAttack();
      this.lastLeapTime = now;
      return true;
    }

    // Charge if player is on roughly same vertical level
    if (
      dist > 80 &&
      dist < 260 &&
      Math.abs(dy) < 40 &&
      now - this.lastChargeTime >= this.chargeCooldownMs
    ) {
      this.startChargeAttack();
      this.lastChargeTime = now;
      return true;
    }

    return false;
  }

  enterEnrage() {
    this.isEnraged = true;

    this.walkSpeed *= 1.25;
    this.attackCooldownMs = Math.max(900, this.attackCooldownMs - 500);
    this.chargeSpeed *= 1.2;
    this.leapXSpeed *= 1.15;

    this.setTint(0xffaa44);
    this.scene.time.delayedCall(250, () => {
      if (this.active && !this.isDead) this.clearTint();
    });
  }

  startLeapAttack() {
    if (this.isDead) return;

    this.phase = "windup";
    this.phaseAttack = "leap";
    this.phaseUntil = this.scene.time.now + this.leapWindupMs;
    this.isAttacking = true;

    this.setVelocityX(0);

    if (this.anims.currentAnim?.key !== "orc_idle") {
      this.play("orc_idle", true);
    }
  }

  startChargeAttack() {
    if (this.isDead) return;

    this.phase = "windup";
    this.phaseAttack = "charge";
    this.phaseUntil = this.scene.time.now + this.chargeWindupMs;
    this.isAttacking = true;

    this.setVelocityX(0);

    if (this.anims.currentAnim?.key !== "orc_idle") {
      this.play("orc_idle", true);
    }
  }

  startSummon() {
    if (this.isDead) return;

    this.phase = "summon";
    this.phaseUntil = this.scene.time.now + this.summonWindupMs;
    this.isAttacking = true;
    this.setVelocityX(0);

    if (this.anims.currentAnim?.key !== "orc_idle") {
      this.play("orc_idle", true);
    }
  }

  handleWindupPhase(time) {
    this.setVelocityX(0);

    // simple shake like SkullBoss windup
    const shakeX = Phaser.Math.Between(-2, 2);
    this.x += shakeX;

    if (time < this.phaseUntil) return;

    if (this.phaseAttack === "leap") {
      const dir = Math.sign(this.target.x - this.x) || 1;
      this.facing = dir;
      this.setScale(dir === 1 ? -1 : 1, 1);

      this.setVelocity(dir * this.leapXSpeed, this.leapYSpeed);
      this.phase = "leap";
      this.waitingForLeapLanding = true;
      return;
    }

    if (this.phaseAttack === "charge") {
      const dir = Math.sign(this.target.x - this.x) || 1;
      this.facing = dir;
      this.setScale(dir === 1 ? -1 : 1, 1);

      this.phase = "charge";
      this.phaseUntil = time + this.chargeDurationMs;
      this.isCharging = true;
      this.setVelocityX(dir * this.chargeSpeed);

      if (this.anims.currentAnim?.key !== "orc_run") {
        this.play("orc_run", true);
      }
      return;
    }

    this.phase = "idle";
    this.isAttacking = false;
  }

  handleLeapPhase(time) {
    // Wait until he lands
    if (this.waitingForLeapLanding && this.isOnGround) {
      this.waitingForLeapLanding = false;
      this.doSlamShockwave();
      this.phase = "recover";
      this.phaseUntil = time + 500;
      this.setVelocityX(0);

      if (this.anims.currentAnim?.key !== "orc_idle") {
        this.play("orc_idle", true);
      }
    }
  }

  handleChargePhase(time) {
    const dir = this.facing || 1;
    this.setVelocityX(dir * this.chargeSpeed);

    if (time >= this.phaseUntil) {
      this.isCharging = false;
      this.phase = "recover";
      this.phaseUntil = time + 400;
      this.setVelocityX(0);

      if (this.anims.currentAnim?.key !== "orc_idle") {
        this.play("orc_idle", true);
      }
    }
  }

  handleSummonPhase(time) {
    this.setVelocityX(0);

    if (time < this.phaseUntil) return;

    this.spawnMinions();
    this.summonsUsed += 1;

    this.phase = "recover";
    this.phaseUntil = time + 700;
  }

  doSlamShockwave() {
    if (!this.target) return;

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 90) {
      if (typeof this.target.takeDamage === "function") {
        this.target.takeDamage(this.leapLandingDamage);
      }

      if (this.target.body) {
        const forceX = Math.sign(dx) * 0.02;
        const forceY = -0.02;
        this.target.applyForce?.({ x: forceX, y: forceY });
      }
    }

    this.scene.cameras.main.shake(120, 0.006);
  }

  spawnMinions() {
    const spawnOffsets = [-40, 40];

    for (const offset of spawnOffsets) {
      const enemy = new OrcEnemy(this.scene, this.x + offset, this.y, {
        target: this.target,
        groundLayer: this.groundLayer
      });

      enemy.isSummon = true;

      if (Array.isArray(this.scene.enemies)) {
        this.scene.enemies.push(enemy);
      }
    }
  }

  takeDamage(amount) {
    if (this.isDead) return;

    super.takeDamage(amount);

    if (!this.isDead && !this.isStunned()) {
      this.stun(180);
    }
  }

  die() {
    if (this.isDead) return;

    super.die();
    this.scene.events.emit("miniboss:defeated", this);
  }
}