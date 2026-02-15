import { CATS } from "../../utils/physicsCategories.js";

export class PeasantNpc extends Phaser.Physics.Matter.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    super(scene.matter.world, x, y, 'peasant');

    scene.add.existing(this);

    this.interactRadius = 60;
    this.dialogueId = "peasant_intro";
    this.portraitKey = "peasant_portrait";

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    const mainBody = Bodies.rectangle(0, 0, 20, 43, { label: 'peasantBody' });
    const footSensor = Bodies.rectangle(0, 24, 16, 4, { isSensor: true, label: 'peasantFoot' });

    const compoundBody = Body.create({
      parts: [mainBody, footSensor],
      friction: 0.0,
      restitution: 0
    });

    this.setExistingBody(compoundBody);
    this.setFixedRotation();
    this.setFrictionAir(0.05);

    this.setStatic(true);

    this.body.collisionFilter.category = CATS.NPC;
    this.body.collisionFilter.mask &= ~CATS.PLAYER;

    this.setOrigin(0.5, 0.68);

    Phaser.Physics.Matter.Matter.Body.setPosition(this.body, { x, y });

    this.mainBody = mainBody;
    this.footSensor = footSensor;

    // Animations
    this.initAnimations(scene);
    this.play('peasant_idle');
  }

  // ASSET LOADING
  static preload(scene) {
    scene.load.spritesheet('peasant','/static/assets/NPCs/peasant/peasantIdle.png', { 
      frameWidth: 64, 
      frameHeight: 64 
    });
  }

  // ANIMS
  initAnimations(scene) {

    if (!scene.anims.exists('peasant_idle')) {
      scene.anims.create({
        key: 'peasant_idle',
        frames: scene.anims.generateFrameNumbers('peasant', { start: 0, end: 4}),
        frameRate: 6,
        repeat: -1
      });
    }
  }
}
