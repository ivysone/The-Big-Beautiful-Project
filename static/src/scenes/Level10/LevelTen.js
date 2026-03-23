import { BaseLevel } from "../BaseLevel.js";
import { levelTenConfig } from "./LevelTenConfig.js";

export class LevelTen extends BaseLevel {
  constructor() {
    super(levelTenConfig);
    this.boss = null;
    this.bossHpUi = null;
  }

  create() {
    super.create();

    this.findBoss();
    this.createBossHealthBar();

    this.events.once("shutdown", () => {
      this.destroyBossHealthBar();
      this.boss = null;
    });

    this.events.once("destroy", () => {
      this.destroyBossHealthBar();
      this.boss = null;
    });
  }

  update(time, delta) {
    super.update(time, delta);
    this.updateBossHealthBar();
  }

  getDialogueLines(dialogueId) {
    const table = {
      skullboss_intro: [
        "So... another fool crawls into my chamber.",
        "I have watched your struggle from the shadows.",
        "And I must say... I'm impressed",
        "You did well to make it this far but alas, this is as far as you go",
        "Come, little hero.",
        "Let your bones join the damned.",
      ],
    };

    return table[dialogueId] ?? ["..."];
  }

  findBoss() {
    if (this.boss && this.boss.active) return this.boss;

    if (Array.isArray(this.extraEnemies)) {
      this.boss =
        this.extraEnemies.find((enemy) => enemy?.constructor?.name === "SkullBoss") ||
        null;
    }

    return this.boss;
  }

  createBossHealthBar() {
    const boss = this.findBoss();
    if (!boss) return;

    const width = this.scale.width;
    const height = this.scale.height;

    const barWidth = 420;
    const barHeight = 20;
    const x = width / 2;
    const y = height - 40;

    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(10000);

    const title = this.add
      .text(x, y - 24, "SKULL BOSS", {
        fontSize: "18px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    const bg = this.add.rectangle(x, y, barWidth + 8, barHeight + 8, 0x000000, 0.8);
    const frame = this.add.rectangle(x, y, barWidth + 4, barHeight + 4)
      .setStrokeStyle(2, 0xffffff, 0.9);

    const fill = this.add
      .rectangle(x - barWidth / 2, y, barWidth, barHeight, 0xff3b30, 1)
      .setOrigin(0, 0.5);

    const hpText = this.add
      .text(x, y, `${boss.hp} / ${boss.maxHP}`, {
        fontSize: "14px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    container.add([title, bg, fill, frame, hpText]);

    this.bossHpUi = {
      container,
      title,
      bg,
      frame,
      fill,
      hpText,
      barWidth,
      barHeight,
    };

    this.updateBossHealthBar();
  }

  updateBossHealthBar() {
    const boss = this.findBoss();
    const ui = this.bossHpUi;

    if (!ui) {
      if (boss) this.createBossHealthBar();
      return;
    }

    if (!boss || !boss.active || boss.isDead) {
      ui.container.setVisible(false);
      return;
    }

    ui.container.setVisible(true);

    const hp = Math.max(0, boss.hp ?? 0);
    const maxHP = Math.max(1, boss.maxHP ?? 1);
    const ratio = Phaser.Math.Clamp(hp / maxHP, 0, 1);

    ui.fill.width = ui.barWidth * ratio;
    ui.hpText.setText(`${hp} / ${maxHP}`);

    if (ratio > 0.6) {
      ui.fill.fillColor = 0x35c759;
    } else if (ratio > 0.3) {
      ui.fill.fillColor = 0xffcc00;
    } else {
      ui.fill.fillColor = 0xff3b30;
    }
  }

  destroyBossHealthBar() {
    if (!this.bossHpUi) return;

    this.bossHpUi.container?.destroy(true);
    this.bossHpUi = null;
  }
}