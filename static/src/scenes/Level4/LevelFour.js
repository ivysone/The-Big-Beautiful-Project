// scenes/LevelTwo.js
import { BaseLevel } from "./BaseLevel.js";
import { levelFourConfig } from "./configs/LevelFourConfig.js";

export class LevelFour extends BaseLevel {
  constructor() {
    super(levelFourConfig);
  }

  getDialogueLines(dialogueId) {
    const table = {
      peasant_intro: [
        "The forest ahead is cursed.",
        "Watch your footing, and avoid the dangerous ground.",
      ],
      knight_intro: [
        "You made it this far.",
        "The deeper woods are even more dangerous.",
      ],
    };

    return table[dialogueId] ?? ["..."];
  }
}