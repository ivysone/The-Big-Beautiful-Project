import { CATS } from "../utils/physicsCategories.js";

export class Mplayer extends Phaser.Physics.Matter.Sprite {
  constructor(scene, x, y) {
    super(scene.matter.world, x, y, 'mChar');

    this.setOrigin(5000, 1);
    this.setScale(1, 1);
    this.facing = 1;

    scene.add.existing(this);
    

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    // main collision box 
    const mainBody   = Bodies.rectangle(0, 0, 20, 43, { label: 'playerBody' });
    const footSensor = Bodies.rectangle(0, 24, 16, 4,  { isSensor: true, label: 'playerFoot' });

    const compoundBody = Body.create({
      parts: [mainBody, footSensor],
      friction: 0.0,
      restitution: 0
    });

    this.setExistingBody(compoundBody);
    this.setFixedRotation();
    this.setFrictionAir(0.02);

    for (const part of this.body.parts) {
      part.collisionFilter.category = CATS.PLAYER;
      part.collisionFilter.mask = CATS.WORLD | CATS.NPC | CATS.ENEMY_ATK; 
    }


    this.setOrigin(0.35, 0.65);

    Phaser.Physics.Matter.Matter.Body.setPosition(this.body, { x, y });

    this.mainBody = mainBody;
    this.footSensor = footSensor;

    scene.matter.world.on('collisionstart', this.handleCollStart, this);
    scene.matter.world.on('collisionend', this.handleCollEnd, this);


    // Stats
    this.maxHP = 5000;
    this.hp = 5000;

    this.maxSt = 30;
    this.st = 30;
    this.stRegenPerSec = 5;
    this.stRegenDelayMs = 500;
    this.lastStSpendTime = -Infinity;

    this.isDead = false;

    // Blocking + Parry
    this.isBlocking = false;
    this.blockStartTime = 0;

    this.parryWindowMs = 180;
    this.parrySuccess = false;
    this.parryLockMs = 250;

    this.blockDamageMult = 0.25;
    this.blockStaminaCost = 15;
    this.parryStaminaCost = 10;
    this.blockCooldownMs = 250;
    this.lastBlockEnd = -Infinity;

    // i-Frames
    this.isDamageInvincible = false;
    this.damageIFrameStart = 0;
    this.damageIFrameDuration = 350;

    // Attacks
    this.isAttacking = false;
    this.attackStage = 0;
    this.comboQueued = false;
    this.attackId = 0;

    this.flipX = true;

    // Lock
    this.inputEnabled = false;

    // Sword Sensor
    this.swordSensor = scene.matter.add.rectangle(x, y, 1, 1, {
      isSensor: true
    });

    this.swordSensor.gameObject = this.swordSensor;
    this.isHitboxActive = false;
    this.setSwordSensorActive(false);

    this.swordSensor.collisionFilter.category = CATS.PLAYER_ATK;
    this.swordSensor.collisionFilter.mask = CATS.ENEMY;


    // Inputs
    this.keys = scene.input.keyboard.addKeys({
      a: Phaser.Input.Keyboard.KeyCodes.A,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      r: Phaser.Input.Keyboard.KeyCodes.R,
      q: Phaser.Input.Keyboard.KeyCodes.Q,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    this.cursors = scene.input.keyboard.createCursorKeys();

    this.initAnimations(scene);
    this.play('idle');

    this.groundContacts = 0;
    this.isOnGround = false;
  }

  static preload(scene) {
    scene.load.spritesheet('mChar', '/static/assets/Player/male/knight.png', {
      frameWidth: 69,
      frameHeight: 58,
    });

    scene.load.spritesheet('mCharRun', '/static/assets/Player/male/run/run.png', {
      frameWidth: 69,
      frameHeight: 58,
    });
  }

  setInputEnabled(enabled) {
    this.inputEnabled = enabled;
  }

  handleCollStart(event) {
    for (const pair of event.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;

      if (a === this.footSensor && b !== this.mainBody) {
        this.groundContacts++;
      } else if (b === this.footSensor && a !== this.mainBody) {
        this.groundContacts++;
      }
    }

    this.isOnGround = this.groundContacts > 0;
  }

  handleCollEnd(event) {
    for (const pair of event.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;

      if (a === this.footSensor && b !== this.mainBody) {
        this.groundContacts = Math.max(0, this.groundContacts - 1);
      } else if (b === this.footSensor && a !== this.mainBody) {
        this.groundContacts = Math.max(0, this.groundContacts - 1);
      }
    }

    this.isOnGround = this.groundContacts > 0;
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


  // enable/disable sword sensor
  setSwordSensorActive(active) {
    this.isHitboxActive = active;
    if (!this.swordSensor) return;
    const body = this.swordSensor;
    body.collisionFilter.mask = active ? 0xFFFFFFFF : 0;
  }

  // Position sword sensor each frame
  updateHitboxPosition() {
    if (!this.isHitboxActive || !this.swordSensor) return;

    const offsetX = 24 * this.facing;
    const offsetY = -20;

    Phaser.Physics.Matter.Matter.Body.setPosition(this.swordSensor, {
      x: this.x + offsetX,
      y: this.y + offsetY
    });
  }

  // Stamina methods
  spendStamina(amount) {
    if (amount <= 0) return true;
    if (this.st < amount) return false;

    this.st = Math.max(0, this.st - amount);
    this.lastStSpendTime = this.scene.time.now;

    this.scene.events.emit('player:stChanged', this.st, this.maxSt);
    return true;
  }

  regenStamina(deltaMs) {
    if (this.st >= this.maxSt) return;

    const now = this.scene.time.now;
    if (now - this.lastStSpendTime < this.stRegenDelayMs) return;

    const regenAmount = this.stRegenPerSec * (deltaMs / 1000);
    const old = this.st;

    this.st = Math.min(this.maxSt, this.st + regenAmount);

    if (Math.floor(old) !== Math.floor(this.st)) {
      this.scene.events.emit('player:stChanged', this.st, this.maxSt);
    }
  }

  // Damage methods
  takeDamage(amount, source = null) {
    if (this.isDead) return false;

    const now = this.scene.time.now;
    if (this.isDamageInvincible && (now - this.damageIFrameStart) < this.damageIFrameDuration) {
      return false;
    }

    this.hp = Math.max(0, this.hp - amount);

    this.setTint(0xff5555);
    this.scene.time.delayedCall(120, () => this.clearTint());

    this.isDamageInvincible = true;
    this.damageIFrameStart = now;

    if (source) {
      const dir = Math.sign(this.x - source.x) || 1;
      this.setVelocity(dir * 4, -3);
    }

    this.scene.events.emit('player:hpChanged', this.hp, this.maxHP);

    if (this.hp <= 0) this.die();
    return true;
  }

  receiveHit(attack) {
    if (this.isDead) return { outcome: 'hit', damageTaken: 0 };

    const now = this.scene.time.now;
    const damage = attack.damage ?? 1;

    if (this.isBlocking) {
      const inParryWindow = (now - this.blockStartTime) <= this.parryWindowMs;
      const parryAllowed = attack.canBeParried !== false;

      if (inParryWindow && parryAllowed) {
        if (!this.spendStamina(this.parryStaminaCost)) {
          this.takeDamage(damage, attack.source);
          return { outcome: 'hit', damageTaken: damage };
        }

        this.parrySuccess = true;
        this.play('parry', true);

        this.locked = true;
        this.scene.time.delayedCall(this.parryLockMs, () => (this.locked = false));

        this.scene.events.emit('player:parry');
        return { outcome: 'parry', damageTaken: 0 };
      }

      if (!this.spendStamina(this.blockStaminaCost)) {
        this.takeDamage(damage, attack.source);
        return { outcome: 'hit', damageTaken: damage };
      }

      const reduced = Math.ceil(damage * this.blockDamageMult);
      this.takeDamage(reduced, attack.source);
      this.scene.events.emit('player:block');

      return { outcome: 'block', damageTaken: reduced };
    }

    this.takeDamage(damage, attack.source);
    return { outcome: 'hit', damageTaken: damage };
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;

    this.setVelocity(0, 0);
    this.setStatic(true); 

    this.setSwordSensorActive(false);

    this.play('death');
    this.scene.events.emit('player:died');
  }

  // Attack methods
  setSwordShape(w, h) {
    if (!this.swordSensor) return;

    this.scene.matter.world.remove(this.swordSensor);
    this.swordSensor = this.scene.matter.add.rectangle(this.x, this.y, w, h, { isSensor: true });
    this.setSwordSensorActive(this.isHitboxActive);
  }

  activateHitbox() {
    this.setSwordSensorActive(true);
    this.updateHitboxPosition();
  }

  deactivateHitbox() {
    this.setSwordSensorActive(false);
  }

  endAttackCleanup() {
    this.isAttacking = false;
    this.attackStage = 0;
    this.comboQueued = false;
    this.deactivateHitbox();
  }

  startAttack1() {
    if (!this.spendStamina(2)) {
      this.endAttackCleanup();
      return;
    }

    this.attackId++;
    this.isAttacking = true;
    this.attackStage = 1;
    this.comboQueued = false;

    this.setVelocityX(0);

    this.setSwordShape(35, 40);

    this.play('attack1', true);
    this.activateHitbox();

    const onComplete = (anim) => {
      if (anim.key !== 'attack1') return;
      this.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
      this.off(Phaser.Animations.Events.ANIMATION_STOP, onStopOrInterrupt);
      this.off(Phaser.Animations.Events.ANIMATION_INTERRUPT, onStopOrInterrupt);

      if (this.comboQueued) this.startAttack2();
      else this.endAttackCleanup();
    };

    const onStopOrInterrupt = (anim) => {
      if (anim.key !== 'attack1') return;
      this.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
      this.off(Phaser.Animations.Events.ANIMATION_STOP, onStopOrInterrupt);
      this.off(Phaser.Animations.Events.ANIMATION_INTERRUPT, onStopOrInterrupt);

      this.endAttackCleanup();
    };

    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
    this.on(Phaser.Animations.Events.ANIMATION_STOP, onStopOrInterrupt);
    this.on(Phaser.Animations.Events.ANIMATION_INTERRUPT, onStopOrInterrupt);
  }

  startAttack2() {
    if (!this.spendStamina(2)) {
      this.endAttackCleanup();
      return;
    }

    this.attackId++;
    this.isAttacking = true;
    this.attackStage = 2;
    this.comboQueued = false;

    this.setVelocityX(0);

    this.setSwordShape(35, 40);

    this.play('attack2', true);
    this.activateHitbox();

    const onComplete = (anim) => {
      if (anim.key !== 'attack2') return;
      this.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
      this.off(Phaser.Animations.Events.ANIMATION_STOP, onStopOrInterrupt);
      this.off(Phaser.Animations.Events.ANIMATION_INTERRUPT, onStopOrInterrupt);

      this.endAttackCleanup();
    };

    const onStopOrInterrupt = (anim) => {
      if (anim.key !== 'attack2') return;
      this.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
      this.off(Phaser.Animations.Events.ANIMATION_STOP, onStopOrInterrupt);
      this.off(Phaser.Animations.Events.ANIMATION_INTERRUPT, onStopOrInterrupt);

      this.endAttackCleanup();
    };

    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
    this.on(Phaser.Animations.Events.ANIMATION_STOP, onStopOrInterrupt);
    this.on(Phaser.Animations.Events.ANIMATION_INTERRUPT, onStopOrInterrupt);
  }

  // Blocking methods
  startBlock() {
    const now = this.scene.time.now;
    if (now - this.lastBlockEnd < this.blockCooldownMs) return;

    this.isBlocking = true;
    this.parrySuccess = false;
    this.blockStartTime = now;

    this.setVelocityX(0);
    this.play('block', true);
  }

  endBlock() {
    if (!this.isBlocking) return;

    this.isBlocking = false;
    this.lastBlockEnd = this.scene.time.now;
    this.parrySuccess = false;
  }

  lock() { this.locked = true; }
  unlock() { this.locked = false; }

  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    this.update(delta);
  }

  computeOnGround() {
    const Matter = Phaser.Physics.Matter.Matter;
    const bodies = this.scene.matter.world.localWorld.bodies;

    const start = { x: this.x, y: this.y + 18 };
    const end   = { x: this.x, y: this.y + 26 };

    const collisions = Matter.Query.ray(bodies, start, end);

    const hit = collisions.find(c => c.body !== this.body && c.body !== this.swordSensor);
    return !!hit;
  }

  update(deltaMs = 16.6) {

    if (!this.inputEnabled) {
      this.setVelocityX(0);
      return;
    }

    if (this.locked || this.isDead) return;

    const speed = 3.2;
    const now = this.scene.time.now;

    this.regenStamina(deltaMs);

    if (this.isDamageInvincible && (now - this.damageIFrameStart) > this.damageIFrameDuration) {
      this.isDamageInvincible = false;
    }

    this.updateHitboxPosition();

    // ground
    const onGround = this.isOnGround;
    const vy = this.body.velocity.y;
    const movingHorizontally = Math.abs(this.body.velocity.x) > 0.05;

    // Blocking input
    if (this.keys.q.isDown && !this.isAttacking) {
      if (!this.isBlocking) this.startBlock();
      this.setVelocityX(0);
      if (this.anims.currentAnim?.key !== 'block') this.play('block', true);
      return;
    } else if (this.isBlocking) {
      this.endBlock();
    }

    // Attacking
    if (this.isAttacking) {
      if ((this.attackStage === 1) && Phaser.Input.Keyboard.JustDown(this.keys.r)) {
        this.comboQueued = true;
      }
      this.setVelocityX(0);
      return;
    }

    // Start attack
    if (Phaser.Input.Keyboard.JustDown(this.keys.r) && onGround) {
      this.startAttack1();
      return;
    }

    // Movement
    let vx = 0;
    let left = this.keys.a.isDown || this.cursors.left.isDown;
    let right = this.keys.d.isDown || this.cursors.right.isDown;

    if (left) {
      vx = this.keys.s.isDown ? -speed / 2 : -speed;
      this.facing = -1;
      this.setScale(-1, 1);
    } else if (right) {
      vx = this.keys.s.isDown ? speed / 2 : speed;
      this.facing = 1;
      this.setScale(1, 1);
    }

    this.setVelocityX(vx);


    // Jump
    if ((Phaser.Input.Keyboard.JustDown(this.keys.space) || Phaser.Input.Keyboard.JustDown(this.cursors.up)) && onGround) {
      this.setVelocityY(-10); // tune
    }

    // Animations
    const isMoving = Math.abs(vx) > 0.01;
    if (onGround) {
      if (isMoving) {
        if (this.anims.currentAnim?.key !== 'run') this.play('run');
      } else {
        if (this.anims.currentAnim?.key !== 'idle') this.play('idle');
      }
    } else {
      if (vy < -1) {
        if (this.anims.currentAnim?.key !== 'jump') this.play('jump');
      } else if (vy > 1) {
        if (this.anims.currentAnim?.key !== 'fall') this.play('fall');
      }
    }
  }

  initAnimations(scene) {
    if (!scene.anims.exists('idle')) {
      scene.anims.create({
        key: 'idle',
        frames: scene.anims.generateFrameNumbers('mChar', { start: 22, end: 26 }),
        frameRate: 6,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('run')) {
      scene.anims.create({
        key: 'run',
        frames: scene.anims.generateFrameNumbers('mCharRun', { start: 0, end: 5 }),
        frameRate: 12,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('jump')) {
      scene.anims.create({
        key: 'jump',
        frames: scene.anims.generateFrameNumbers('mChar', { start: 17, end: 18 }),
        frameRate: 3,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('fall')) {
      scene.anims.create({
        key: 'fall',
        frames: scene.anims.generateFrameNumbers('mChar', { start: 18, end: 21 }),
        frameRate: 3,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('block')) {
      scene.anims.create({
        key: 'block',
        frames: scene.anims.generateFrameNumbers('mChar', { start: 27, end: 31 }),
        frameRate: 8,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('parry')) {
      scene.anims.create({
        key: 'parry',
        frames: scene.anims.generateFrameNumbers('mChar', { start: 32, end: 36 }),
        frameRate: 8,
        repeat: 0,
      });
    }

    if (!scene.anims.exists('attack1')) {
      scene.anims.create({
        key: 'attack1',
        frames: scene.anims.generateFrameNumbers('mChar', { start: 37, end: 42 }),
        frameRate: 17,
        repeat: 0,
      });
    }

    if (!scene.anims.exists('attack2')) {
      scene.anims.create({
        key: 'attack2',
        frames: scene.anims.generateFrameNumbers('mChar', { start: 42, end: 46 }),
        frameRate: 15,
        repeat: 0,
      });
    }

    if (!scene.anims.exists('death')) {
      scene.anims.create({
        key: 'death',
        frames: scene.anims.generateFrameNumbers('mChar', { start: 53, end: 65 }),
        frameRate: 12,
        repeat: 0,
      });
    }
  }
}