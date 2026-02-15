export const DIFFICULTY_PRESETS = {
  easy: {
    id: "easy",
    playerIncomingDamageMult: 0.5,
    enemyDamageMult: 0.5,
    enemyHpMult: 0.5,
  },
  balanced: {
    id: "balanced",
    playerIncomingDamageMult: 1.0,
    enemyDamageMult: 1.0,
    enemyHpMult: 1.0,
  },
  hard: {
    id: "hard",
    playerIncomingDamageMult: 1.5,
    enemyDamageMult: 1.5,
    enemyHpMult: 1.5,
  },
};

export function getSelectedDifficultyId() {
  const raw = sessionStorage.getItem("selectedDifficulty") || "medium";
  // map your UI “medium” to spec-style “balanced”
  if (raw === "medium") return "balanced";
  if (raw === "easy" || raw === "hard") return raw;
  return "balanced";
}

export function getDifficultyConfig() {
  const id = getSelectedDifficultyId();
  return DIFFICULTY_PRESETS[id] ?? DIFFICULTY_PRESETS.balanced;
}

