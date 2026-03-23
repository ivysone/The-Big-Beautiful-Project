// scenes/LevelTwo.js
import { BaseLevel } from "./BaseLevel.js";
import { levelTwoConfig } from "./configs/LevelTwoConfig.js";

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
    };

    return table[dialogueId] ?? ["..."];
  }
}
