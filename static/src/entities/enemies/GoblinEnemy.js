import { findSegmentUnder, aStarSegments, edgeBetween } from "../../utils/platformPath.js";
import { CATS } from "../../utils/physicsCategories.js";

export class GoblinEnemy extends Phaser.Physics.Matter.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {{ target: Phaser.GameObjects.GameObject, groundLayer?: Phaser.Tilemaps.TilemapLayer }} deps
   */
  constructor(scene, x, y, deps) {
    super(scene.matter.world, x, y, 'goblin');

    scene.add.existing(this);

    this.target = deps.target;
    this.groundLayer = deps.groundLayer;
    this.isEnemy = true;

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    const mainBody = Bodies.rectangle(0, 0, 20, 43, { label: 'goblinBody' });
    const footSensor = Bodies.rectangle(0, 24, 16, 4, { isSensor: true, label: 'goblinFoot' });

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

    // Stats 
    this.maxHP = 30;
    this.hp = 30;
    this.isDead = false;

    this.lastHitAttackId = -1;

    // AI 
    this.walkSpeed = 2;        
    this.meleeRange = 40;     
    this.attackCooldownMs = 2000;
    this.lastAttackTime = -Infinity;
    this.aggroRange = 160;
    this.deaggroRange = 320; 
    this.isAggro = false;

    // Attack timing 
    this.attackFps = 12;
    this.hitStartFrame = 4;
    this.hitEndFrame = 6;

    // Facing 
    this.facing = 1;
    this.setScale(1, 1);

    // Pathfinding state
    this.path = null;
    this.pathIndex = 0;
    this.nextRepathTime = 0;
    this.repathIntervalMs = 350;

    // Jump
    this.jumpVelocity = -14;
    this.jumpCooldownMs = 700;
    this.lastJumpTime = -Infinity;

    // Melee sensor
    this.meleeSensor = scene.matter.add.rectangle(x, y, 36, 28, {
      isSensor: true,
      label: 'goblinMelee'
    });
    this.meleeSensor.isEnemyMeleeHitbox = true; 
    this.meleeSensor.owner = this;        
    this.setMeleeActive(false);

    this.meleeSensor.isSensor = true;
    this.meleeSensor.collisionFilter.category = CATS.ENEMY_ATK;
    this.meleeSensor.collisionFilter.mask = CATS.PLAYER;


    // Animations
    this.initAnimations(scene);
    this.play('goblin_idle');
  }

  // ASSET LOADING
  static preload(scene) {
    scene.load.spritesheet('goblin','/static/assets/Enemies/goblins/goblinGreen.png', { 
      frameWidth: 84, 
      frameHeight: 64 
    });
  }

  // ANIMS
  initAnimations(scene) {

    if (!scene.anims.exists('goblin_idle')) {
      scene.anims.create({
        key: 'goblin_idle',
        frames: scene.anims.generateFrameNumbers('goblin', { start: 12, end: 16}),
        frameRate: 8,
        repeat: -1
      });
    }

    if (!scene.anims.exists('goblin_run')) {
      scene.anims.create({
        key: 'goblin_run',
        frames: scene.anims.generateFrameNumbers('goblin', { start: 0, end: 5}),
        frameRate: 8,
        repeat: -1
      });
    }

    if (!scene.anims.exists('goblin_attack')) {
      scene.anims.create({
        key: 'goblin_attack',
        frames: scene.anims.generateFrameNumbers('goblin', { start: 32, end: 38}),
        frameRate: 8,
        repeat: 0
      });
    }

    if (!scene.anims.exists('goblin_death')) {
      scene.anims.create({
        key: 'goblin_death',
        frames: scene.anims.generateFrameNumbers('goblin', { start: 46, end: 56}),
        frameRate: 8,
        repeat: 0
      });
    }
  }

  computeOnGround() {
    const Matter = Phaser.Physics.Matter.Matter;
    const bodies = this.scene.matter.world.localWorld.bodies;

    const start = { x: this.x, y: this.y + 18 };
    const end   = { x: this.x, y: this.y + 30 };

    const hits = Matter.Query.ray(bodies, start, end);

    const hit = hits.find(h =>
      h.body !== this.body &&
      h.body !== this.mainBody &&
      h.body !== this.footSensor &&
      h.body !== this.meleeSensor
    );

    return !!hit;
  }


  repathToTarget(time) {
    const segs = this.scene.platformSegments;
    const edges = this.scene.platformEdges;
    if (!segs || !edges || !this.target) return;

    const startSeg = findSegmentUnder(segs, this.x, this.y + 20, 40);
    const goalSeg  = findSegmentUnder(segs, this.target.x, this.target.y + 20, 40);

    if (!startSeg || !goalSeg) {
      this.path = null;
      return;
    }

    const ids = aStarSegments(segs, edges, startSeg.id, goalSeg.id);
    if (!ids || ids.length < 1) {
      this.path = null;
      return;
    }

    this.path = ids;
    const i = ids.indexOf(startSeg.id);
    this.pathIndex = i >= 0 ? i : 0;
  }

  // COLLISION 
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


  // MELEE SENSOR 
  setMeleeActive(active) {
    if (!this.meleeSensor) return;
    this.meleeActive = active;
    this.meleeSensor.collisionFilter.mask = active ? 0xFFFFFFFF : 0;
  }

  updateMeleePosition() {
    if (!this.meleeSensor) return;

    const offsetX = 20 * this.facing;
    const offsetY = -24;

    Phaser.Physics.Matter.Matter.Body.setPosition(this.meleeSensor, {
      x: this.x + offsetX,
      y: this.y + offsetY
    });
  }

  //  AI / UPDATE
  preUpdate(time, delta) {
    super.preUpdate(time, delta);

    if (this.isDead || !this.target) return;

    if (this.isStunned(this.scene.time.now)) {
      return;
    }

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

    if (!this.isAggro) {
      if (dist <= this.aggroRange && verticalOK) this.isAggro = true;
    } else {
      if (dist >= this.deaggroRange) {
        this.isAggro = false;
        this.path = null;
        this.setVelocityX(0);
        if (this.anims.currentAnim?.key !== 'goblin_idle') this.play('goblin_idle', true);
        return;
      }
    }

    if (!this.isAggro) {
      this.setVelocityX(0);
      if (this.anims.currentAnim?.key !== 'goblin_idle') this.play('goblin_idle', true);
      return;
    }

    // face target
    if (dx < 0) {
      this.facing = -1;
      this.setScale(1, 1);
    } else {
      this.facing = 1;
      this.setScale(-1, 1);
    }

    // If currently attacking, do nothing
    if (this.isAttacking) {
      this.setVelocityX(0);
      return;
    }

    // In range -> attack if off cooldown
    if (dist <= this.meleeRange) {
      const now = this.scene.time.now;
      if (now - this.lastAttackTime >= this.attackCooldownMs) {
        this.startMeleeAttack();
        this.lastAttackTime = now;
      } else {
        this.setVelocityX(0);
        if (this.anims.currentAnim?.key !== 'goblin_idle') this.play('goblin_idle', true);
      }
      return;
    }

    // Repath occasionally
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
      // follow the path
      const currId = this.path[this.pathIndex];
      const nextId = this.path[this.pathIndex + 1];

      const currSeg = segs[currId];
      const nextSeg = segs[nextId];

      let targetX = nextSeg.centerX;
      const edge = edgeBetween(edges, currId, nextId);

      if (edge?.type === 'jump') {
        targetX = Phaser.Math.Clamp(nextSeg.centerX, currSeg.x1 + 10, currSeg.x2 - 10);
      }

      // Move toward target
      const dxx = targetX - this.x;
      const dir = Math.sign(dxx) || 1;

      // set facing to match motion
      this.facing = dir;
      this.setScale(dir === 1 ? -1 : 1, 1);

      this.setVelocityX(dir * this.walkSpeed);

      // Execute jump when the next edge is jump AND at takeoff AND grounded
      if (edge?.type === 'jump' && this.isOnGround && Math.abs(dxx) < 14) {
        // prevent jump spam
        const now = this.scene.time.now;
        if (now - this.lastJumpTime > this.jumpCooldownMs) {
          this.setVelocityY(this.jumpVelocity);
          this.lastJumpTime = now;
        }
      }

      // If close enough to the waypoint, advance
      if (Math.abs(dxx) < 12) {
        this.pathIndex++;
        if (this.pathIndex >= this.path.length - 1) {
          this.path = null;
        }
      }
    }


    if (this.anims.currentAnim?.key !== 'goblin_run') this.play('goblin_run', true);
  }

  startMeleeAttack() {
    if (this.isDead) return;

    this.isAttacking = true;
    this.setVelocityX(0);

    // Play attack animation
    this.play('goblin_attack', true);

    // Turn hitbox on/off based on frames
    const msPerFrame = 1000 / this.attackFps;
    const onDelay = this.hitStartFrame * msPerFrame;
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

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'goblin_attack', () => {
      this.isAttacking = false;
      this.setMeleeActive(false);
      if (!this.isDead) this.play('goblin_idle', true);
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

    this.play('goblin_death');

    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + 'goblin_death', () => {
      this.destroy();
    });
  }

  destroy(fromScene) {
    const scene = this.scene;
    const world = scene?.matter?.world;

    // If the scene is already shutting down / gone, skip Matter cleanup safely
    if (world) {
      world.off('collisionstart', this.handleCollStart, this);
      world.off('collisionend', this.handleCollEnd, this);

      if (this.meleeSensor) {
        world.remove(this.meleeSensor);
        this.meleeSensor = null;
      }
    } else {
      // still null it so we don't hold refs
      this.meleeSensor = null;
    }

    super.destroy(fromScene);
  }

}
