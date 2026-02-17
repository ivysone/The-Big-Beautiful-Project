import { getSelectedDifficultyId } from "./config/difficulty.js";

let cachedMe = null;

export async function getMe() {
  if (cachedMe) return cachedMe;
  const res = await fetch("/api/me");
  cachedMe = await res.json();
  return cachedMe;
}

function getSessionId() {
  let id = localStorage.getItem("session_id");
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("session_id", id);
  }
  return id;
}

// simple in-memory queue
const queue = [];
let flushTimer = null;

export function sendTelemetry(event_type, payload = {}) {
  // keep payload small + consistent
  const body = {
    event_type,
    event_data: {
      ...payload,
      session_id: getSessionId(),
      ts: Date.now(),
    },
  };

  queue.push(body);

  // flush quickly but not on every event
  if (!flushTimer) {
    flushTimer = setTimeout(flush, 300);
  }
}

async function flush() {
  flushTimer = null;
  if (!queue.length) return;

  const batch = queue.splice(0, queue.length);

  try {
    await fetch("/api/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch.length === 1 ? batch[0] : { batch }),
    });
  } catch (e) {
    // if offline, re-queue (lightweight)
    queue.unshift(...batch);
  }
}
