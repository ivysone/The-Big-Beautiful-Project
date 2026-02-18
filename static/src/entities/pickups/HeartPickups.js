export default class HeartPickup {
  constructor(scene, x, y, healAmount = 10) {
    this.scene = scene;
    this.healAmount = healAmount;

    // Use a Matter sprite because you want animation frames
    this.sprite = scene.matter.add.sprite(x, y, "heart_pickup", 0, {
      isSensor: true,
      isStatic: false,
      ignoreGravity: false, // set true if you want it to float
    });

    this.sprite.setDepth(10);
    this.sprite.setScale(1);
    this.sprite.setFrictionAir(0.05);
    this.sprite.setFixedRotation();

    // tags for collision detection
    this.sprite.isHeartPickup = true;
    this.sprite.heartPickupRef = this;

    // animation
    this.sprite.play("heart_idle");

    // IMPORTANT: tween the sprite, not the scene
    this.floatTween = scene.tweens.add({
      targets: this.sprite,
      y: y - 6,
      duration: 180,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  destroy() {
    if (this.floatTween) {
      this.floatTween.stop();
      this.scene.tweens.remove(this.floatTween);
      this.floatTween = null;
    }

    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
  }
}
