import { getSelectedDifficultyId } from "./config/difficulty.js";

let cachedMe = null;

export async function getMe() {
  if (cachedMe) return cachedMe;
  const res = await fetch("/api/me");
  cachedMe = await res.json();
  return cachedMe;
}

export async function sendTelemetry(event_type, payload = {}) {
  const config_id = getSelectedDifficultyId();

  const me = await getMe();
  if (!me.logged_in) return;

  const body = {
    event_type,
    username: me.username,
    timestamp: new Date().toISOString(),
    config_id,
    ...payload
  };

  await fetch("/api/collect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
