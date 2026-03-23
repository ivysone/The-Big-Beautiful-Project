import { BaseLevel } from "../BaseLevel.js";
import { levelTwoConfig } from "./LevelTwoConfig.js";

export class LevelTwo extends BaseLevel {
  constructor() {
    super(levelTwoConfig);
  }

  getDialogueLines(dialogueId) {
    const table = {
      peasant_intro: [
        "The forest ahead is cursed.",
        "Watch your footing, and avoid the plantlife.",
      ],
      knight_intro: [
        "Well done making it this far.",
        "The village beyond these woods is under attack",
        "Please help them"
      ],
      knight_cont: [
        "There are still monsters roaming these woods",
        "It would be best if we clean up all enemies that remain here before proceeding...",
        "Return to me once you have finished.",
      ],
      knight_cont2: [
        "I see you have defeated all the monsters. Well done brave hero",
        "The fight is not yet over, you must save the village!",
      ],
    };

    return table[dialogueId] ?? ["..."];
  }
}
