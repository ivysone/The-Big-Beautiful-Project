// entities/Player.js
export class Fplayer extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, 'fChar');

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Body
    this.body.setSize(20, 39);
    this.body.setOffset(17, 25);
    this.offsetRight = { x: 17, y: 25 };
    this.offsetLeft = { x: 25, y: 25 };

    // Stats
    this.maxHP = 50;
    this.hp = 50;

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
    this.locked = false;

    // Sword Hitbox
    this.swordHitbox = scene.physics.add.sprite(x, y, null)
      .setOrigin(0.2, 0.2)
      .setVisible(false);

    this.swordHitbox.body.setAllowGravity(false);
    this.swordHitbox.body.immovable = true;
    this.swordHitbox.body.enable = false;
    this.isHitboxActive = false;

    // Default hitbox shape
    this.swordHitbox.body.setSize(50, 30);
    this.swordHitbox.body.setOffset(20, -10);

    // Inputs 
    this.keys = this.scene.input.keyboard.addKeys({
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
  }

  static preload(scene) {
    scene.load.spritesheet('fChar', '/static/assets/Player/female/maidBrown.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
  }

  destroy(fromScene) {
    if (this.swordHitbox) {
      this.swordHitbox.destroy();
      this.swordHitbox = null;
    }
    super.destroy(fromScene);
  }

  initAnimations(scene) {
    if (!scene.anims.exists('idle')) {
      scene.anims.create({
        key: 'idle',
        frames: scene.anims.generateFrameNumbers('fChar', { start: 0, end: 4 }),
        frameRate: 6,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('run')) {
      scene.anims.create({
        key: 'run',
        frames: scene.anims.generateFrameNumbers('fChar', { start: 26, end: 33 }),
        frameRate: 12,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('jump')) {
      scene.anims.create({
        key: 'jump',
        frames: scene.anims.generateFrameNumbers('fChar', { start: 34, end: 36 }),
        frameRate: 3,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('fall')) {
      scene.anims.create({
        key: 'fall',
        frames: scene.anims.generateFrameNumbers('fChar', { start: 37, end: 39 }),
        frameRate: 3,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('block')) {
      scene.anims.create({
        key: 'block',
        frames: scene.anims.generateFrameNumbers('fChar', { start: 57, end: 61 }),
        frameRate: 8,
        repeat: -1,
      });
    }

    if (!scene.anims.exists('parry')) {
      scene.anims.create({
        key: 'parry',
        frames: scene.anims.generateFrameNumbers('fChar', { start: 62, end: 66 }),
        frameRate: 8,
        repeat: 0,
      });
    }

    if (!scene.anims.exists('attack1')) {
      scene.anims.create({
        key: 'attack1',
        frames: scene.anims.generateFrameNumbers('fChar', { start: 10, end: 15 }),
        frameRate: 20,
        repeat: 0,
      });
    }

    if (!scene.anims.exists('attack2')) {
      scene.anims.create({
        key: 'attack2',
        frames: scene.anims.generateFrameNumbers('fChar', { start: 16, end: 21 }),
        frameRate: 18,
        repeat: 0,
      });
    }

    if (!scene.anims.exists('attack3')) {
      scene.anims.create({
        key: 'attack3',
        frames: scene.anims.generateFrameNumbers('fChar', { start: 22, end: 25 }),
        frameRate: 18,
        repeat: 0,
      });
    }

    if (!scene.anims.exists('death')) {
      scene.anims.create({
        key: 'death',
        frames: scene.anims.generateFrameNumbers('fChar', { start: 67, end: 77 }),
        frameRate: 12,
        repeat: 0,
      });
    }
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
      this.setVelocityX(dir * 140);
      this.setVelocityY(-120);
    }

    this.scene.events.emit('player:hpChanged', this.hp, this.maxHP);

    if (this.hp <= 0) this.die();
    return true;
  }

  /**
   * @param {{ damage:number, source?:any, canBeParried?:boolean }} attack
   * @returns {{ outcome:'parry'|'block'|'hit', damageTaken:number }}
   */
  receiveHit(attack) {
    if (this.isDead) return { outcome: 'hit', damageTaken: 0 };

    const now = this.scene.time.now;
    const damage = attack.damage ?? 1;

    // If blocking, try parry first, then block, else full hit
    if (this.isBlocking) {
      const inParryWindow = (now - this.blockStartTime) <= this.parryWindowMs;
      const parryAllowed = attack.canBeParried !== false;

      if (inParryWindow && parryAllowed) {
        // Must be able to pay parry stamina
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

      // Normal block
      if (!this.spendStamina(this.blockStaminaCost)) {
        this.takeDamage(damage, attack.source);
        return { outcome: 'hit', damageTaken: damage };
      }

      const reduced = Math.ceil(damage * this.blockDamageMult);
      this.takeDamage(reduced, attack.source);
      this.scene.events.emit('player:block');

      return { outcome: 'block', damageTaken: reduced };
    }

    // Not blocking
    this.takeDamage(damage, attack.source);
    return { outcome: 'hit', damageTaken: damage };
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;

    this.setVelocity(0, 0);
    this.body.enable = false;

    this.deactivateHitbox();

    this.play('death');
    this.scene.events.emit('player:died');
  }

  // Sword Hitbox Methods
  updateHitboxPosition() {
    if (!this.isHitboxActive || !this.swordHitbox) return;

    const offsetX = this.flipX ? -24 : -60;
    const offsetY = 20;

    this.swordHitbox.x = this.x + offsetX;
    this.swordHitbox.y = this.y + offsetY;
  }

  activateHitbox() {
    if (!this.swordHitbox) return;
    this.isHitboxActive = true;
    this.swordHitbox.body.enable = true;
    this.updateHitboxPosition();
  }

  deactivateHitbox() {
    if (!this.swordHitbox) return;
    this.isHitboxActive = false;
    this.swordHitbox.body.enable = false;
  }

  endAttackCleanup() {
    this.isAttacking = false;
    this.attackStage = 0;
    this.comboQueued = false;
    this.deactivateHitbox();
  }

  // Attack methods
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

    if (this.flipX) {
      this.swordHitbox.body.setSize(60, 30);
      this.swordHitbox.body.setOffset(0, -10);
    } else {
      this.swordHitbox.body.setSize(60, 30);
      this.swordHitbox.body.setOffset(40, -10);
    }

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

    this.swordHitbox.body.setSize(35, 60);
    this.swordHitbox.body.setOffset(30, -40);

    this.play('attack2', true);
    this.activateHitbox();

    const onComplete = (anim) => {
      if (anim.key !== 'attack2') return;
      this.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
      this.off(Phaser.Animations.Events.ANIMATION_STOP, onStopOrInterrupt);
      this.off(Phaser.Animations.Events.ANIMATION_INTERRUPT, onStopOrInterrupt);

      if (this.comboQueued) this.startAttack3();
      else this.endAttackCleanup();
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

  startAttack3() {
    if (!this.spendStamina(2)) {
      this.endAttackCleanup();
      return;
    }

    this.attackId++;
    this.isAttacking = true;
    this.attackStage = 3;
    this.comboQueued = false;

    this.setVelocityX(0);

    this.swordHitbox.body.setSize(35, 20);
    this.swordHitbox.body.setOffset(35, -15);

    this.play('attack3', true);
    this.activateHitbox();

    const onComplete = (anim) => {
      if (anim.key !== 'attack3') return;
      this.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
      this.off(Phaser.Animations.Events.ANIMATION_STOP, onStopOrInterrupt);
      this.off(Phaser.Animations.Events.ANIMATION_INTERRUPT, onStopOrInterrupt);

      this.endAttackCleanup();
    };

    const onStopOrInterrupt = (anim) => {
      if (anim.key !== 'attack3') return;
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

  // Lock controls
  lock() { this.locked = true; }
  unlock() { this.locked = false; }

  // Pre-update
  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    this.update(delta);
  }

  // Update
  update(deltaMs = 16.6) {
    if (this.locked || this.isDead) return;

    const speed = 180;
    const onGround = this.body.blocked.down;
    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    const movingHorizontally = Math.abs(vx) > 5;
    const now = this.scene.time.now;

    this.regenStamina(deltaMs);

    // Clear damage i-frames
    if (this.isDamageInvincible && (now - this.damageIFrameStart) > this.damageIFrameDuration) {
      this.isDamageInvincible = false;
    }

    // Keep hitbox glued to player while active
    this.updateHitboxPosition();

    //  Blocking input 
    if (this.keys.q.isDown && !this.isAttacking) {
      if (!this.isBlocking) this.startBlock();

      this.setVelocityX(0);
      if (this.anims.currentAnim?.key !== 'block') this.play('block', true);
      return;
    } else if (this.isBlocking) {
      this.endBlock();
    }

    //  Attacking 
    if (this.isAttacking) {
      // queue combos
      if ((this.attackStage === 1 || this.attackStage === 2) && Phaser.Input.Keyboard.JustDown(this.keys.r)) {
        this.comboQueued = true;
      }

      this.setVelocityX(0);
      return;
    }

    //  Start attack 
    if (Phaser.Input.Keyboard.JustDown(this.keys.r) && onGround) {
      this.startAttack1();
      return;
    }

    //  Movement 
    this.setVelocityX(0);

    if (this.keys.a.isDown || this.cursors.left.isDown) {
      this.setVelocityX(this.keys.s.isDown ? -speed / 2 : -speed);
      this.flipX = false;
      this.body.setOffset(this.offsetLeft.x, this.offsetLeft.y);
    } else if (this.keys.d.isDown || this.cursors.right.isDown) {
      this.setVelocityX(this.keys.s.isDown ? speed / 2 : speed);
      this.flipX = true;
      this.body.setOffset(this.offsetRight.x, this.offsetRight.y);
    }

    //  Jump 
    if ((Phaser.Input.Keyboard.JustDown(this.keys.space) || Phaser.Input.Keyboard.JustDown(this.cursors.up)) && onGround) {
      this.setVelocityY(-450);
    }

    // Animation state 
    if (onGround) {
      if (movingHorizontally) {
        if (this.anims.currentAnim?.key !== 'run') this.play('run');
      } else {
        if (this.anims.currentAnim?.key !== 'idle') this.play('idle');
      }
    } else {
      if (vy < -50) {
        if (this.anims.currentAnim?.key !== 'jump') this.play('jump');
      } else if (vy > 50) {
        if (this.anims.currentAnim?.key !== 'fall') this.play('fall');
      }
    }
  }
}

