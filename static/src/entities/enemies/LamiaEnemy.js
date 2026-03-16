import { findSegmentUnder, aStarSegments, edgeBetween } from "../../utils/platformPath.js";
import { CATS } from "../../utils/physicsCategories.js";

export class LamiaEnemy extends Phaser.Physics.Matter.Sprite {
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, 'lamia');

    scene.add.existing(this);

    this.target = deps.target;
    this.groundLayer = deps.groundLayer;
    this.isEnemy = true;

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    // snake-woman body — wider, shorter than typical enemy
    const mainBody = Bodies.rectangle(0, 0, 24, 46, { label: 'lamiaBody' });
    const footSensor = Bodies.rectangle(0, 26, 18, 4, { isSensor: true, label: 'lamiaFoot' });

    const compoundBody = Body.create({
      parts: [mainBody, footSensor],
      friction: 0.0,
      restitution: 0
    });

    this.setExistingBody(compoundBody);
    this.setFixedRotation();
    this.setFrictionAir(0.05);

    for (const part of this.body.parts) {
      part.collisionFilter.category = CATS.ENEMY;
      part.collisionFilter.mask = CATS.WORLD | CATS.NPC | CATS.PLAYER_ATK;
    }

    this.setOrigin(0.5, 0.68);

    Phaser.Physics.Matter.Matter.Body.setPosition(this.body, { x, y });

    this.mainBody = mainBody;
    this.footSensor = footSensor;

    this.groundContacts = 0;
    this.isOnGround = false;

    scene.matter.world.on('collisionstart', this.handleCollStart, this);
    scene.matter.world.on('collisionend', this.handleCollEnd, this);

    // --- stats ---
    this.maxHP = 45;
    this.hp = 45;
    this.isDead = false;
    this.lastHitAttackId = -1;

    // --- movement & aggro ---
    this.walkSpeed = 1.8;
    this.meleeRange = 44;
    this.attackCooldownMs = 1800;
    this.lastAttackTime = -Infinity;
    this.aggroRange = 180;
    this.deaggroRange = 340;
    this.isAggro = false;

    // --- attack hit window (frames 16-21, 10fps) ---
    this.attackFps = 10;
    this.hitStartFrame = 2;  // strike begins
    this.hitEndFrame = 4;    // strike ends

    // --- facing ---
    // sprite faces LEFT by default
    // left  → scale(1, 1)   no flip
    // right → scale(-1, 1)  flip
    this.facing = -1;
    this.setScale(1, 1);

    // --- pathfinding ---
    this.path = null;
    this.pathIndex = 0;
    this.nextRepathTime = 0;
    this.repathIntervalMs = 350;

    // --- jump ---
    this.jumpVelocity = -13;
    this.jumpCooldownMs = 750;
    this.lastJumpTime = -Infinity;

    // --- melee hitbox sensor ---
    this.meleeSensor = scene.matter.add.rectangle(x, y, 38, 30, {
      isSensor: true,
      label: 'lamiaMelee'
    });
    this.meleeSensor.isEnemyMeleeHitbox = true;
    this.meleeSensor.owner = this;
    this.setMeleeActive(false);

    this.meleeSensor.isSensor = true;
    this.meleeSensor.collisionFilter.category = CATS.ENEMY_ATK;
    this.meleeSensor.collisionFilter.mask = CATS.PLAYER;

    this.initAnimations(scene);
    this.play('lamia_idle');
  }

  // --- preload ---

  static preload(scene) {
    scene.load.spritesheet('lamia', '/static/assets/Enemies/mixed/Lamia sheet.png', {
      frameWidth: 64,
      frameHeight: 64
    });
  }

  // --- animations ---

  initAnimations(scene) {
    // row 1: idle (0-4), cols 5-7 empty
    if (!scene.anims.exists('lamia_idle')) {
      scene.anims.create({
        key: 'lamia_idle',
        frames: scene.anims.generateFrameNumbers('lamia', { start: 0, end: 4 }),
        frameRate: 8,
        repeat: -1
      });
    }

    // row 2: slither (8-15)
    if (!scene.anims.exists('lamia_run')) {
      scene.anims.create({
        key: 'lamia_run',
        frames: scene.anims.generateFrameNumbers('lamia', { start: 8, end: 15 }),
        frameRate: 8,
        repeat: -1
      });
    }

    // row 3: attack (16-21), cols 6-7 empty
    if (!scene.anims.exists('lamia_attack')) {
      scene.anims.create({
        key: 'lamia_attack',
        frames: scene.anims.generateFrameNumbers('lamia', { start: 16, end: 21 }),
        frameRate: 10,
        repeat: 0
      });
    }

    // row 4: death (24-29), cols 6-7 empty
    if (!scene.anims.exists('lamia_death')) {
      scene.anims.create({
        key: 'lamia_death',
        frames: scene.anims.generateFrameNumbers('lamia', { start: 24, end: 29 }),
        frameRate: 8,
        repeat: 0
      });
    }
  }

  // --- ground check (raycast downward) ---

  computeOnGround() {
    const Matter = Phaser.Physics.Matter.Matter;
    const bodies = this.scene.matter.world.localWorld.bodies;

    const start = { x: this.x, y: this.y + 20 };
    const end   = { x: this.x, y: this.y + 32 };

    const hits = Matter.Query.ray(bodies, start, end);

    const hit = hits.find(h =>
      h.body !== this.body &&
      h.body !== this.mainBody &&
      h.body !== this.footSensor &&
      h.body !== this.meleeSensor
    );

    return !!hit;
  }

  // --- pathfinding ---

  repathToTarget(time) {
    const segs = this.scene.platformSegments;
    const edges = this.scene.platformEdges;
    if (!segs || !edges || !this.target) return;

    const startSeg = findSegmentUnder(segs, this.x, this.y + 20, 40);
    const goalSeg  = findSegmentUnder(segs, this.target.x, this.target.y + 20, 40);

    if (!startSeg || !goalSeg) { this.path = null; return; }

    const ids = aStarSegments(segs, edges, startSeg.id, goalSeg.id);
    if (!ids || ids.length < 1) { this.path = null; return; }

    this.path = ids;
    const i = ids.indexOf(startSeg.id);
    this.pathIndex = i >= 0 ? i : 0;
  }

  // --- foot sensor collision tracking ---

  handleCollStart(event) {
    for (const pair of event.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (a === this.footSensor && b !== this.mainBody) this.groundContacts++;
      else if (b === this.footSensor && a !== this.mainBody) this.groundContacts++;
    }
    this.isOnGround = this.groundContacts > 0;
  }

  handleCollEnd(event) {
    for (const pair of event.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (a === this.footSensor && b !== this.mainBody) this.groundContacts = Math.max(0, this.groundContacts - 1);
      else if (b === this.footSensor && a !== this.mainBody) this.groundContacts = Math.max(0, this.groundContacts - 1);
    }
    this.isOnGround = this.groundContacts > 0;
  }

  // --- stun ---

  stun(ms = 800) {
    const now = this.scene.time.now;
    this.stunnedUntil = Math.max(this.stunnedUntil ?? 0, now + ms);
    this.setTint?.(0xFFFFFF);
    this.setVelocity?.(-2 * this.facing, 1);
    this.setAngularVelocity?.(0);
  }

  isStunned() {
    return (this.stunnedUntil ?? 0) > this.scene.time.now;
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
      x: this.x + (22 * this.facing),
      y: this.y - 24
    });
  }

  // --- main update loop ---

  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    if (this.isDead || !this.target) return;
    if (this.isStunned(this.scene.time.now)) return;

    if (this.stunnedUntil && this.stunnedUntil <= this.scene.time.now) {
      this.clearTint?.();
      this.stunnedUntil = 0;
    }

    if (this.meleeActive) this.updateMeleePosition();

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.isOnGround = this.computeOnGround();
    const verticalOK = Math.abs(dy) < 160;

    // aggro range check
    if (!this.isAggro) {
      if (dist <= this.aggroRange && verticalOK) this.isAggro = true;
    } else {
      if (dist >= this.deaggroRange) {
        this.isAggro = false;
        this.path = null;
        this.setVelocityX(0);
        if (this.anims.currentAnim?.key !== 'lamia_idle') this.play('lamia_idle', true);
        return;
      }
    }

    if (!this.isAggro) {
      this.setVelocityX(0);
      if (this.anims.currentAnim?.key !== 'lamia_idle') this.play('lamia_idle', true);
      return;
    }

    // face the player
    if (dx < 0) {
      this.facing = -1;
      this.setScale(1, 1);
    } else {
      this.facing = 1;
      this.setScale(-1, 1);
    }

    // hold still while attacking
    if (this.isAttacking) {
      this.setVelocityX(0);
      return;
    }

    // attack if close enough
    if (dist <= this.meleeRange) {
      const now = this.scene.time.now;
      if (now - this.lastAttackTime >= this.attackCooldownMs) {
        this.startMeleeAttack();
        this.lastAttackTime = now;
      } else {
        this.setVelocityX(0);
        if (this.anims.currentAnim?.key !== 'lamia_idle') this.play('lamia_idle', true);
      }
      return;
    }

    // repath every 350ms
    if (time >= this.nextRepathTime) {
      this.repathToTarget(time);
      this.nextRepathTime = time + this.repathIntervalMs;
    }

    const segs = this.scene.platformSegments;
    const edges = this.scene.platformEdges;

    if (!this.path || this.path.length < 2) {
      // no path found, walk straight at player
      this.setVelocityX((Math.sign(dx) || 1) * this.walkSpeed);
    } else {
      // follow waypoints
      const currSeg = segs[this.path[this.pathIndex]];
      const nextSeg = segs[this.path[this.pathIndex + 1]];

      let targetX = nextSeg.centerX;
      const edge = edgeBetween(edges, this.path[this.pathIndex], this.path[this.pathIndex + 1]);

      if (edge?.type === 'jump') {
        targetX = Phaser.Math.Clamp(nextSeg.centerX, currSeg.x1 + 10, currSeg.x2 - 10);
      }

      const dxx = targetX - this.x;
      const dir = Math.sign(dxx) || 1;

      this.facing = dir < 0 ? -1 : 1;
      this.setScale(this.facing === -1 ? 1 : -1, 1);
      this.setVelocityX(dir * this.walkSpeed);

      // jump to next platform
      if (edge?.type === 'jump' && this.isOnGround && Math.abs(dxx) < 14) {
        const now = this.scene.time.now;
        if (now - this.lastJumpTime > this.jumpCooldownMs) {
          this.setVelocityY(this.jumpVelocity);
          this.lastJumpTime = now;
        }
      }

      // reached waypoint, advance to next
      if (Math.abs(dxx) < 12) {
        this.pathIndex++;
        if (this.pathIndex >= this.path.length - 1) this.path = null;
      }
    }

    if (!this.isAttacking && this.anims.currentAnim?.key !== 'lamia_run') {
      this.play('lamia_run', true);
    }
  }

  // --- attack ---

  startMeleeAttack() {
    if (this.isDead) return;

    this.isAttacking = true;
    this.setVelocityX(0);
    this.play('lamia_attack', true);

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

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'lamia_attack', () => {
      this.isAttacking = false;
      this.setMeleeActive(false);
      if (!this.isDead && this.anims.currentAnim?.key !== 'lamia_idle') {
        this.play('lamia_idle', true);
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

    this.play('lamia_death');

    if (Math.random() < 0.30) this.scene.spawnHeartPickup(this.x, this.y);

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'lamia_death', () => {
      this.destroy();
    });
  }

  // --- cleanup on destroy ---

  destroy(fromScene) {
    const world = this.scene?.matter?.world;

    if (world) {
      world.off('collisionstart', this.handleCollStart, this);
      world.off('collisionend', this.handleCollEnd, this);
      if (this.meleeSensor) {
        world.remove(this.meleeSensor);
        this.meleeSensor = null;
      }
    } else {
      this.meleeSensor = null;
    }

    super.destroy(fromScene);
  }
}