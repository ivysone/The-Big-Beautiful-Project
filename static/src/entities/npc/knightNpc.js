import { CATS } from "../../utils/physicsCategories.js";

export class KnightNpc extends Phaser.Physics.Matter.Sprite {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   */
  constructor(scene, x, y) {
    super(scene.matter.world, x, y, 'knight');

    scene.add.existing(this);

    this.onDialogueComplete = (scene, dialogueId) => {
    if (dialogueId === "knight_intro") this.hasDoneIntro = true;
    };

    this.interactRadius = 60;
    this.dialogueResolver = (scene) => {
    const s = scene.stageState;

    if (!this.hasDoneIntro) return "knight_intro";

    if (!s.stageCleared) return "knight_cont";

    return "knight_cont2";
    };


    this.portraitKey = "knight_portrait";
    

    const { Bodies, Body } = Phaser.Physics.Matter.Matter;

    const mainBody = Bodies.rectangle(0, 0, 20, 43, { label: 'knightBody' });
    const footSensor = Bodies.rectangle(0, 24, 16, 4, { isSensor: true, label: 'knightFoot' });

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
    this.play('knight_idle');
  }

  // ASSET LOADING
  static preload(scene) {
    scene.load.spritesheet('knight','/static/assets/NPCs/knight/knightIdle.png', { 
      frameWidth: 64, 
      frameHeight: 64 
    });
  }

  // ANIMS
  initAnimations(scene) {

    if (!scene.anims.exists('knight_idle')) {
      scene.anims.create({
        key: 'knight_idle',
        frames: scene.anims.generateFrameNumbers('knight', { start: 0, end: 4}),
        frameRate: 6,
        repeat: -1
      });
    }
  }
}