export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super("LevelSelectScene");
  }

  create() {
    const levels = [
      { label: "1 - Level One", key: "LevelOne" },
      { label: "2 - Level Two", key: "LevelTwo" },
      { label: "3 - Level Three", key: "LevelThree" },
      { label: "4 - Level Four", key: "LevelFour" },
      { label: "5 - Level Five (WIP)", key: "LevelFive" },
      { label: "6 - Level Six", key: "LevelSix" },
      { label: "7 - Level Seven", key: "LevelSeven" },
      { label: "8 - Level Eight (WIP)", key: "LevelEight" },
      { label: "9 - Level Nine (WIP)", key: "LevelNine" },
      { label: "10 - Level Ten", key: "LevelTen" },
    ];

    this.add.text(40, 30, "Level Select", {
      fontSize: "32px",
      color: "#ffffff",
    });

    levels.forEach((level, i) => {
      const y = 100 + i * 50;

      const txt = this.add.text(60, y, level.label, {
        fontSize: "24px",
        color: "#ffff66",
        backgroundColor: "#222222",
        padding: { x: 10, y: 6 },
      });

      txt.setInteractive({ useHandCursor: true });
      txt.on("pointerdown", () => {
        this.scene.start(level.key);
      });
    });

    this.input.keyboard.on("keydown-ESC", () => {
      this.scene.start("MainMenu");
    });
  }
}