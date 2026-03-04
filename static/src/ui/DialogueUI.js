export class DialogueUI {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ portraitKey: string, lines: string[] }} data
   */
  constructor(scene, data) {
    this.scene = scene;
    this.lines = data.lines;
    this.index = 0;
    this.onComplete = null;

    const w = scene.scale.width;
    const h = scene.scale.height;

    // Dim background
    this.dim = scene.add.rectangle(0, 0, w, h, 0x000000, 0.35)
      .setOrigin(0).setScrollFactor(0).setDepth(20000);

    // Dialogue box
    this.box = scene.add.rectangle(40, h - 160, w - 80, 120, 0x000000, 0.75)
      .setOrigin(0).setScrollFactor(0).setDepth(20001);

    // Portrait on the right
    this.portrait = scene.add.image(w - 140, h - 170, data.portraitKey)
      .setScrollFactor(0).setDepth(20002).setScale(3);
    this.portrait.setOrigin(0.5, 1);

    // Text
    this.text = scene.add.text(70, h - 140, '', {
      fontSize: '18px',
      color: '#ffffff',
      wordWrap: { width: w - 260 } // leave space for portrait
    }).setScrollFactor(0).setDepth(20003);

    // Hint
    this.hint = scene.add.text(w - 260, h - 55, 'E: next   ESC: close', {
      fontSize: '14px',
      color: '#cccccc'
    }).setScrollFactor(0).setDepth(20003);

    this.advanceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.closeKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.renderLine();
  }

  renderLine() {
    this.text.setText(this.lines[this.index] ?? '');
  }

  update() {
    if (Phaser.Input.Keyboard.JustDown(this.advanceKey)) {
      this.index++;
      if (this.index >= this.lines.length) {
        this.onComplete?.();
      } else {
        this.renderLine();
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.closeKey)) {
      this.onComplete?.();
    }
  }

  destroy() {
    this.dim.destroy();
    this.box.destroy();
    this.portrait.destroy();
    this.text.destroy();
    this.hint.destroy();
  }
}
