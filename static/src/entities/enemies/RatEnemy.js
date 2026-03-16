import { findSegmentUnder, aStarSegments, edgeBetween } from "../../utils/platformPath.js";
import { CATS } from "../../utils/physicsCategories.js";

export class RatEnemy extends Phaser.Physics.Matter.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {{ target: Phaser.GameObjects.GameObject, groundLayer?: Phaser.Tilemaps.TilemapLayer }} deps
   */
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, 'rat');

    scene.add.existing(this);

    this.target = deps.target;
    this.groundLayer = deps.groundLayer;
    this.isEnemy = true;

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    const mainBody = Bodies.rectangle(0, 0, 20, 30, { label: 'ratBody' });
    const footSensor = Bodies.rectangle(0, 18, 16, 4, { isSensor: true, label: 'ratFoot' });

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

    this.setOrigin(0.5, 0.75);
    Phaser.Physics.Matter.Matter.Body.setPosition(this.body, { x, y });

    this.mainBody = mainBody;
    this.footSensor = footSensor;

    this.groundContacts = 0;
    this.isOnGround = false;

    scene.matter.world.on('collisionstart', this.handleCollStart, this);
    scene.matter.world.on('collisionend', this.handleCollEnd, this);

    // Stats
    this.maxHP = 10;
    this.hp = 10;
    this.isDead = false;

    this.lastHitAttackId = -1;

    // AI
    this.walkSpeed = 3.0;
    this.meleeRange = 30;
    this.attackCooldownMs = 1200;
    this.lastAttackTime = -Infinity;
    this.aggroRange = 200;
    this.deaggroRange = 400;
    this.isAggro = false;

    // Attack timing
    this.attackFps = 12;
    this.hitStartFrame = 3;
    this.hitEndFrame = 5;

    // Facing
    // Sprite sheet faces LEFT by default
    //   facing -1 (left)  - setScale(1, 1)   no flip
    //   facing  1 (right) - setScale(-1, 1)  flip
    this.facing = -1;
    this.setScale(1, 1);

    // Pathfinding
    this.path = null;
    this.pathIndex = 0;
    this.nextRepathTime = 0;
    this.repathIntervalMs = 300;

    // Jump
    this.jumpVelocity = -10;
    this.jumpCooldownMs = 600;
    this.lastJumpTime = -Infinity;

    // Melee sensor
    this.meleeSensor = scene.matter.add.rectangle(x, y, 28, 20, {
      isSensor: true,
      label: 'ratMelee'
    });
    this.meleeSensor.isEnemyMeleeHitbox = true;
    this.meleeSensor.owner = this;
    this.setMeleeActive(false);

    this.meleeSensor.isSensor = true;
    this.meleeSensor.collisionFilter.category = CATS.ENEMY_ATK;
    this.meleeSensor.collisionFilter.mask = CATS.PLAYER;

    this.initAnimations(scene);
    this.play('rat_idle');
  }

  // ASSET LOADING 
  static preload(scene) {
    scene.load.spritesheet('rat', '/static/assets/Enemies/mixed/Rat sheet.png', {
      frameWidth: 64,
      frameHeight: 64
    });
  }

  //ANIMATIONS 
  // Row 0: idle  - frames 0–4   (5 frames)
  // Row 1: run   - frames 5–12  (8 frames)
  // Row 2: attack- frames 13–18 (6 frames)
  // Row 3: death - frames 19–23 (5 frames)

  initAnimations(scene) {
  if (!scene.anims.exists('rat_idle')) {
    scene.anims.create({
      key: 'rat_idle',
      frames: scene.anims.generateFrameNumbers('rat', { start: 0, end: 4 }),
      frameRate: 8,
      repeat: -1
    });
  }

  if (!scene.anims.exists('rat_run')) {
    scene.anims.create({
      key: 'rat_run',
      frames: scene.anims.generateFrameNumbers('rat', { start: 8, end: 15 }),  
      frameRate: 10,
      repeat: -1
    });
  }

  if (!scene.anims.exists('rat_attack')) {
    scene.anims.create({
      key: 'rat_attack',
      frames: scene.anims.generateFrameNumbers('rat', { start: 16, end: 21 }),  
      frameRate: 12,
      repeat: 0
    });
  }

  if (!scene.anims.exists('rat_death')) {
    scene.anims.create({
      key: 'rat_death',
      frames: scene.anims.generateFrameNumbers('rat', { start: 24, end: 28 }),  
      frameRate: 8,
      repeat: 0
    });
  }
}

  // GROUND CHECK 

  computeOnGround() {
    const Matter = Phaser.Physics.Matter.Matter;
    const bodies = this.scene.matter.world.localWorld.bodies;

    const start = { x: this.x, y: this.y + 10 };
    const end   = { x: this.x, y: this.y + 20 };

    const hits = Matter.Query.ray(bodies, start, end);

    const hit = hits.find(h =>
      h.body !== this.body &&
      h.body !== this.mainBody &&
      h.body !== this.footSensor &&
      h.body !== this.meleeSensor
    );

    return !!hit;
  }

  // PATHFINDING 

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

  //COLLISION 

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

  //  STUN 

  stun(ms = 600) {
    const now = this.scene.time.now;
    this.stunnedUntil = Math.max(this.stunnedUntil ?? 0, now + ms);
    this.setTint?.(0xFFFFFF);
    this.setVelocity?.(-2 * this.facing, 1);
    this.setAngularVelocity?.(0);
  }

  isStunned() {
    return (this.stunnedUntil ?? 0) > this.scene.time.now;
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
      x: this.x + (16 * this.facing),
      y: this.y - 8
    });
  }

  // AI / UPDATE 

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    if (this.isDead || !this.target) return;

    if (this.isStunned()) return;

    if (this.stunnedUntil && this.stunnedUntil <= this.scene.time.now) {
      this.clearTint?.();
      this.stunnedUntil = 0;
    }

    if (this.meleeActive) this.updateMeleePosition();

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.isOnGround = this.computeOnGround();
    const verticalOK = Math.abs(dy) < 120;

    // Aggro
    if (!this.isAggro) {
      if (dist <= this.aggroRange && verticalOK) this.isAggro = true;
    } else {
      if (dist >= this.deaggroRange) {
        this.isAggro = false;
        this.path = null;
        this.setVelocityX(0);
        if (this.anims.currentAnim?.key !== 'rat_idle') this.play('rat_idle', true);
        return;
      }
    }

    if (!this.isAggro) {
      this.setVelocityX(0);
      if (this.anims.currentAnim?.key !== 'rat_idle') this.play('rat_idle', true);
      return;
    }

    // Sprite faces LEFT by default
    //   target to left  - facing = -1 - scale(1, 1)   no flip
    //   target to right - facing =  1 - scale(-1, 1)  flip
    if (dx < 0) {
      this.facing = -1;
      this.setScale(-1, 1);
    } else {
      this.facing = 1;
      this.setScale(1, 1);
    }

    if (this.isAttacking) {
      this.setVelocityX(0);
      return;
    }

    // In melee range - attack
    if (dist <= this.meleeRange) {
      const now = this.scene.time.now;
      if (now - this.lastAttackTime >= this.attackCooldownMs) {
        this.startMeleeAttack();
        this.lastAttackTime = now;
      } else {
        this.setVelocityX(0);
        if (this.anims.currentAnim?.key !== 'rat_idle') this.play('rat_idle', true);
      }
      return;
    }

    // Repath
    if (time >= this.nextRepathTime) {
      this.repathToTarget(time);
      this.nextRepathTime = time + this.repathIntervalMs;
    }

    const segs = this.scene.platformSegments;
    const edges = this.scene.platformEdges;

    if (!this.path || this.path.length < 2) {
      const dir = Math.sign(dx) || 1;
      this.setVelocityX(dir * this.walkSpeed);
    } else {
      const currId = this.path[this.pathIndex];
      const nextId = this.path[this.pathIndex + 1];

      const currSeg = segs[currId];
      const nextSeg = segs[nextId];

      let targetX = nextSeg.centerX;
      const edge = edgeBetween(edges, currId, nextId);

      if (edge?.type === 'jump') {
        targetX = Phaser.Math.Clamp(nextSeg.centerX, currSeg.x1 + 10, currSeg.x2 - 10);
      }

      const dxx = targetX - this.x;
      const dir = Math.sign(dxx) || 1;

      // Update facing to match movement
      this.facing = dir < 0 ? -1 : 1;
      this.setScale(this.facing === -1 ? 1 : -1, 1);

      this.setVelocityX(dir * this.walkSpeed);

      if (edge?.type === 'jump' && this.isOnGround && Math.abs(dxx) < 14) {
        const now = this.scene.time.now;
        if (now - this.lastJumpTime > this.jumpCooldownMs) {
          this.setVelocityY(this.jumpVelocity);
          this.lastJumpTime = now;
        }
      }

      if (Math.abs(dxx) < 12) {
        this.pathIndex++;
        if (this.pathIndex >= this.path.length - 1) this.path = null;
      }
    }

    if (this.anims.currentAnim?.key !== 'rat_run') this.play('rat_run', true);
  }

  //  ATTACK 
  startMeleeAttack() {
    if (this.isDead) return;

    this.isAttacking = true;
    this.setVelocityX(0);

    this.play('rat_attack', true);

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

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'rat_attack', () => {
      this.isAttacking = false;
      this.setMeleeActive(false);
      if (!this.isDead) this.play('rat_idle', true);
    });
  }

  // DAMAGE / DEATH 

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

    const ss = this.scene.stageState;
    if (ss) {
      ss.enemiesRemaining = Math.max(0, (ss.enemiesRemaining ?? 0) - 1);
      if (ss.enemiesRemaining === 0) ss.stageCleared = true;
    }

    this.play('rat_death');

    const HEAL_DROP_CHANCE = 0.30;
    if (Math.random() < HEAL_DROP_CHANCE) {
      this.scene.spawnHeartPickup(this.x, this.y);
    }

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'rat_death', () => {
      this.destroy();
    });
  }

  // CLEANUP 

  destroy(fromScene) {
    const scene = this.scene;
    const world = scene?.matter?.world;

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