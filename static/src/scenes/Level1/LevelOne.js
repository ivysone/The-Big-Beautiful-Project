import { BaseLevel } from "../BaseLevel.js";
import { levelOneConfig } from "./LevelOneConfig.js";

export class LevelOne extends BaseLevel {
  constructor() {
    super(levelOneConfig);
  }

  getDialogueLines(dialogueId) {
    const table = {
      peasant_intro: [
        "Hello there, stranger...",
        "The desert has been dangerous lately.",
        "Many monsters have invaded our lands, and a strange curse has turned our own soldiers against us.",
        "If you're heading east, be careful.",
        "We would be grateful if you rid these lands of monsters!",
      ],
      knight_intro: [
        "Brave adventurer, I saw how you took care of those monsters, it was incredible.",
        "However, this place is just the beginning, the monsters are headed east to the Royal Kingdom...",
        "You must stop them before the kingdom is destroyed!",
      ],
      knight_cont: [
        "However, I see there are still monsters remaining here...",
        "It would be best if we clean up all enemies that remain here before proceeding...",
        "Return to me once you have finished.",
      ],
      knight_cont2: [
        "I see you have defeated all the monsters. Well done brave hero",
        "The fight is not yet over, you must head east...",
      ],
    };

    return table[dialogueId] ?? ["..."];
  }

  afterDialogueComplete(npc, dialogueId) {
    if (npc?.constructor?.name === "KnightNpc" && dialogueId === "knight_cont2" && this.stageState.stageCleared) {
      this.completeStage();
    }
  }
}