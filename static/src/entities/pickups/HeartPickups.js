export default class HeartPickup {
  constructor(scene, x, y, healAmount = 10) {
    this.scene = scene;
    this.healAmount = healAmount;

    // Use a Matter sprite so we can play an animation
    this.sprite = scene.matter.add.sprite(x, y, "heart_pickup", 0, {
      isSensor: true,
      isStatic: true,
      ignoreGravity: true,
    });

    this.sprite.setDepth(10);
    this.sprite.setScale(1);
    this.sprite.setFrictionAir(0.05);

    // Tag for collision detection
    this.sprite.isHeartPickup = true;
    this.sprite.heartPickupRef = this;

    // Play the animation (make sure it's created in the scene)
    if (scene.anims.exists("heart_idle")) {
      this.sprite.play("heart_idle");
    }

    // Tween the heart sprite (not the scene)
    scene.tweens.add({
      targets: this.sprite,
      y: y - 6,
      duration: 180,
      yoyo: true,
      ease: "Sine.easeOut",
    });
  }

  destroy() {
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
  }
}
