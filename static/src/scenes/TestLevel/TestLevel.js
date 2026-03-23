// scenes/LevelOne.js
import { BaseLevel } from "../BaseLevel.js";
import { testLevelConfig } from "./configs/TestLevelConfig.js";

export class TestLevel extends BaseLevel {
  constructor() {
    super(testLevelConfig);
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
}