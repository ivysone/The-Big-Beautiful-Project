function getSessionId() {
  let id = localStorage.getItem("session_id");
  if (!id) {
    id = `session_${Date.now()}`;
    localStorage.setItem("session_id", id);
  }
  return id;
}

let cachedUsername = null;
let usernamePromise = null;

async function getUsername() {
  if (cachedUsername) return cachedUsername;
  if (usernamePromise) return usernamePromise;

  usernamePromise = fetch("/api/me")
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      cachedUsername = data?.username || data?.name || "anonymous";
      return cachedUsername;
    })
    .catch(() => {
      cachedUsername = "anonymous";
      return cachedUsername;
    })
    .finally(() => {
      usernamePromise = null;
    });

  return usernamePromise;
}

// simple queue to avoid spamming POSTs
const queue = [];
let flushTimer = null;

export function sendTelemetry(event_type, payload = {}) {
  if (!cachedUsername) {
    getUsername();
    cachedUsername = "anonymous";
  }

  const evt = {
    username: cachedUsername,
    event_type,
    timestamp: new Date().toISOString(),
    session_id: payload.session_id || getSessionId(),

    stage_number: payload.stage_number ?? null,
    x_position: payload.x_position ?? payload.x ?? null,
    y_position: payload.y_position ?? payload.y ?? null,

    duration_seconds: payload.duration_seconds ?? (
      payload.duration_ms != null ? Math.round(payload.duration_ms / 1000) : null
    ),

    // everything else goes in `extra`
    extra: payload.extra ?? payload,
  };

  queue.push(evt);

  if (!flushTimer) flushTimer = setTimeout(flush, 250);
}

async function flush() {
  flushTimer = null;
  if (!queue.length) return;

  const batch = queue.splice(0, queue.length);

  try {
    // POST one by one
    for (const ev of batch) {
      const res = await fetch("/api/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ev),
      });

      if (!res.ok) {
        console.error("telemetry /api/collect failed", res.status, await res.text());
        break;
      }
    }
  } catch (e) {
    // requeue on network failure
    queue.unshift(...batch);
  }
}
