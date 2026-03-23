import { BaseLevel } from "./BaseLevel.js";
import { levelThreeConfig } from "./configs/LevelThreeConfig.js";
import { OrcEnemy } from "../entities/enemies/OrcEnemy.js";
import { SlimeEnemy } from "../entities/enemies/SlimeEnemy.js";
import { DamnedEnemy } from "../entities/enemies/DamnedEnemy.js";
import { BurningSkull } from "../entities/enemies/BurningSkull.js";
import { EyeEnemy } from "../entities/enemies/EyeEnemy.js";
import { BatEnemy } from "../entities/enemies/BatEnemy.js";

const DEFENSE_ENEMIES = {
  OrcEnemy,
  DamnedEnemy,
  BurningSkull,
  EyeEnemy,
  BatEnemy
};

export class LevelThree extends BaseLevel {
  constructor() {
    super(levelThreeConfig);
  }


  create() {
    super.create();

    if (!this.anims.exists("portal_idle")) {
      this.anims.create({
        key: "portal_idle",
        frames: this.anims.generateFrameNumbers("portal", {
          start: 0,
          end: 9,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }

    this.defenseStarted = false;
  }

  playIntroCutscene() {
    const { targetX, duration } = this.levelConfig.introCutscene || {};

    if (targetX == null) {
      this.showLevelIntroDialogue();
      return;
    }

    this.player.setInputEnabled(false);
    this.inCutscene = true;
    this.player.play?.("run", true);

    this.tweens.add({
      targets: this.player,
      x: targetX,
      duration: duration ?? 2000,
      ease: "Linear",
      onComplete: () => {
        this.player.setVelocityX?.(0);
        this.player.play?.("idle", true);
        this.showLevelIntroDialogue();
      },
    });
  }

  showLevelIntroDialogue() {
    this.inCutscene = true;
    this.player.setInputEnabled(false);

    this.startDialogue({
      portraitKey: "knight_portrait",
      dialogueId: "level_three_intro",
      onDialogueComplete: () => {
        if (this.defenseStarted) return;
        this.defenseStarted = true;
        this.setupDefenseLevel();
      },
    });
  }

  getDialogueLines(dialogueId) {
    const table = {
      level_three_intro: [
        "The village is under attack by demonic forces",
        "Portals are opening all throughout the village.",
        "I must protect the houses until reinforcements arrive!",
      ],
    };

    return table[dialogueId] ?? ["..."];
  }

  setupDefenseLevel() {
    const defense = this.levelConfig.defense;
    if (!defense?.enabled) return;

    this.defenseState = {
      active: true,
      startTime: this.time.now,
      endTime: this.time.now + defense.durationMs,
      housesDestroyed: 0,
      housesRemaining: 0,
    };

    this.createDefenseHouses();
    this.createPortalPoints();
    this.createDefenseUI();
    this.scheduleDefenseWaves();
  }

  createDefenseHouses() {
    const defense = this.levelConfig.defense;
    this.defenseHouses = [];

    const housesLayer = this.map.getObjectLayer(defense.housesLayer);
    if (!housesLayer) {
      console.warn(`No object layer named "${defense.housesLayer}"`);
      return;
    }

    housesLayer.objects.forEach((obj, index) => {
      const centerX = obj.x + obj.width / 2;
      const centerY = obj.y + obj.height / 2;

      const zone = this.add.zone(centerX, centerY, obj.width, obj.height);

      this.matter.add.gameObject(zone, {
        isStatic: true,
        isSensor: true,
      });

      zone.label = "defenseHouse";
      zone.isDefenseHouse = true;
      zone.houseId = obj.name || `house_${index + 1}`;
      zone.houseHp = defense.houseMaxHp;
      zone.houseMaxHp = defense.houseMaxHp;
      zone.lastDamageAt = 0;
      zone.destroyed = false;

      // HP bar
      const barWidth = Math.max(50, obj.width * 0.8);
      const barY = obj.y - 60;

      zone.hpBarBg = this.add
        .rectangle(centerX, barY, barWidth, 8, 0x000000, 0.7)
        .setDepth(10001);

      zone.hpBarFill = this.add
        .rectangle(centerX - barWidth / 2, barY, barWidth, 6, 0x35c759, 1)
        .setOrigin(0, 0.5)
        .setDepth(10002);

      zone.hpBarWidth = barWidth;

      this.defenseHouses.push(zone);
      this.updateHouseHealthBar(zone);
    });

    this.defenseState.housesRemaining = this.defenseHouses.length;
  }

  updateHouseHealthBar(house) {
    if (!house?.hpBarFill || !house?.hpBarBg) return;

    const ratio = Phaser.Math.Clamp(house.houseHp / house.houseMaxHp, 0, 1);
    house.hpBarFill.width = house.hpBarWidth * ratio;

    if (ratio > 0.6) {
      house.hpBarFill.fillColor = 0x35c759;
    } else if (ratio > 0.3) {
      house.hpBarFill.fillColor = 0xffcc00;
    } else {
      house.hpBarFill.fillColor = 0xff3b30;
    }

    const visible = !house.destroyed;
    house.hpBarBg.setVisible(visible);
    house.hpBarFill.setVisible(visible);
  }

  createPortalPoints() {
    const defense = this.levelConfig.defense;
    this.portalPoints = [];

    const portalsLayer = this.map.getObjectLayer(defense.portalsLayer);
    if (!portalsLayer) {
      console.warn(`No object layer named "${defense.portalsLayer}"`);
      return;
    }

    portalsLayer.objects.forEach((obj, index) => {
      const x = obj.x;
      const y = obj.y - 25;

      // Create visual sprite
      const sprite = this.add
        .sprite(x, y, "portal")
        .setDepth(50000000); // adjust depth if needed

      sprite.play("portal_idle");

      // Store both logic + visual
      this.portalPoints.push({
        id: obj.name || `portal_${index + 1}`,
        x,
        y,
        sprite,
      });
    });
  }

  scheduleDefenseWaves() {
    const defense = this.levelConfig.defense;

    this.spawnDefenseWave();

    this.defenseWaveEvent = this.time.addEvent({
      delay: defense.waveIntervalMs,
      loop: true,
      callback: () => {
        if (!this.defenseState?.active) return;
        this.spawnDefenseWave();
      },
    });
  }

  spawnDefenseWave() {
    const defense = this.levelConfig.defense;

    if (!this.portalPoints?.length) {
      console.warn("No portal points found for defense spawning.");
      return;
    }

    for (let i = 0; i < defense.enemiesPerWave; i++) {
      const portal = Phaser.Utils.Array.GetRandom(this.portalPoints);
      const enemyType = Phaser.Utils.Array.GetRandom(defense.enemyTypes);
      const EnemyClass = DEFENSE_ENEMIES[enemyType];

      if (!EnemyClass) {
        console.warn(`Unknown defense enemy type: ${enemyType}`);
        continue;
      }

      const targetHouse = this.getNearestAliveHouse(portal.x, portal.y);

      const enemy = new EnemyClass(this, portal.x, portal.y, {
        target: targetHouse || this.player,
        groundLayer: this.groundLayer,
      });

      enemy.isDefenseEnemy = true;
      enemy.isAggro = true;
      enemy.aggroRange = 99999;
      enemy.deaggroRange = 99999;
      enemy.defenseTarget = targetHouse;

      this.applyEnemyDifficulty(enemy);
      this.enemies.push(enemy);

      console.log(
        `Spawned ${enemyType} at (${portal.x}, ${portal.y}) targeting house ${targetHouse?.houseId} at (${targetHouse?.x}, ${targetHouse?.y})`
      );
    }
  }

  createDefenseUI() {
    this.defenseText = this.add
    .text(20, 50, "", {
      fontSize: "18px",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.35)",
      padding: { x: 8, y: 6 },
    })
    .setScrollFactor(0)
    .setDepth(10000);
  }

  getNearestAliveHouse(x, y) {
    const alive = this.defenseHouses.filter((h) => h.active && h.houseHp > 0);
    if (!alive.length) return null;

    let best = alive[0];
    let bestDist = Number.POSITIVE_INFINITY;

    for (const house of alive) {
      const dx = x - house.x;
      const dy = y - house.y;
      const d2 = dx * dx + dy * dy;

      if (d2 < bestDist) {
        best = house;
        bestDist = d2;
      }
    }

    return best;
  }

  damageHouse(house, amount) {
    const defense = this.levelConfig.defense;
    if (!house || !house.active || house.houseHp <= 0) return;

    house.houseHp -= amount;
    house.houseHp = Math.max(0, house.houseHp);

    this.updateHouseHealthBar(house);

    if (house.houseHp <= 0 && house.active) {
      house.active = false;
      house.destroyed = true;
      house.setVisible(false);
      this.updateHouseHealthBar(house);

      this.defenseState.housesDestroyed += 1;
      this.defenseState.housesRemaining -= 1;

      if (this.defenseState.housesDestroyed >= defense.maxDestroyed) {
        this.killPlayer("village_destroyed");
      }
    }
  }

  updateEnemyHouseAttacks() {
    const defense = this.levelConfig.defense;
    if (!this.defenseState?.active || !Array.isArray(this.enemies)) return;

    for (const enemy of this.enemies) {
      if (
        !enemy ||
        !enemy.isDefenseEnemy ||
        enemy.isDead ||
        enemy.active === false ||
        !enemy.body?.position
      ) {
        continue;
      }

      const house = enemy.defenseTarget;

      if (!house || !house.active || house.houseHp <= 0) {
        continue;
      }

      const ex = enemy.body.position.x;
      const ey = enemy.body.position.y;
      const hx = house.x;
      const hy = house.y;

      const dx = hx - ex;
      const dy = hy - ey;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const attackRange = defense.enemyAttackRange ?? 60;
      if (dist > attackRange) continue;

      enemy.setVelocity?.(0, 0);

      const now = this.time.now;
      const cooldown = defense.houseHitCooldownMs ?? 1000;
      if (now - (enemy.lastHouseAttackAt ?? 0) < cooldown) {
        continue;
      }

      enemy.lastHouseAttackAt = now;

      enemy.play?.("attack", true);

      this.damageHouse(house, defense.houseDamagePerHit);
    }
  }

  update(time, delta) {
    super.update(time, delta);

    this.updateDefenseLevel();
  }

updateDefenseLevel() {
  if (!this.defenseState?.active) return;

  const msLeft = Math.max(0, this.defenseState.endTime - this.time.now);
  const secLeft = Math.ceil(msLeft / 1000);

  if (this.defenseText) {
    this.defenseText.setText(
      `Defend the village: ${secLeft}s\nHouses left: ${this.defenseState.housesRemaining}`
    );
  }

  this.updateEnemyTargets();
  this.updateEnemyHouseAttacks();

  if (msLeft <= 0) {
    this.defenseState.active = false;
    this.completeStage();
  }
}

  updateEnemyTargets() {
    if (!Array.isArray(this.enemies)) return;

    this.enemies = this.enemies.filter((enemy) => {
      return !!(
        enemy &&
        !enemy.isDead &&
        enemy.active !== false &&
        enemy.body &&
        enemy.body.position
      );
    });

    for (const enemy of this.enemies) {
      if (!enemy.isDefenseEnemy) continue;

      const currentTarget = enemy.defenseTarget;

      // Keep existing target while it's still alive
      if (currentTarget && currentTarget.active && currentTarget.houseHp > 0) {
        enemy.target = currentTarget;
        continue;
      }

      const ex = enemy.body.position.x;
      const ey = enemy.body.position.y;

      const targetHouse = this.getNearestAliveHouse(ex, ey);
      enemy.defenseTarget = targetHouse;
      enemy.target = targetHouse || this.player;
    }
  }
}