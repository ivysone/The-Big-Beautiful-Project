// scenes/LevelTwo.js
import { BaseLevel } from "./BaseLevel.js";
import { levelThreeConfig } from "./configs/LevelThreeConfig.js";

export class LevelThree extends BaseLevel {
  constructor() {
    super(levelThreeConfig);
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