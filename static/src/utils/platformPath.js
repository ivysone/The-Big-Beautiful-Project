// utils/platformPath.js

export function buildPlatformSegments(layer, tileW, tileH) {
  const map = layer.tilemap;
  const width = map.width;
  const height = map.height;

  const isCollide = (x, y) => {
    const t = layer.getTileAt(x, y);
    return !!(t && t.properties && t.properties.collides);
  };

  const isTop = (x, y) => isCollide(x, y) && !isCollide(x, y - 1);

  const visited = new Set();
  const segs = [];
  let id = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      if (!isTop(x, y)) continue;

      let x2 = x;
      while (x2 < width && isTop(x2, y)) {
        visited.add(`${x2},${y}`);
        x2++;
      }
      x2 -= 1;

      const px1 = x * tileW;
      const px2 = (x2 + 1) * tileW;
      const py = y * tileH; 

      segs.push({
        id: id++,
        y: py,
        x1: px1,
        x2: px2,
        centerX: (px1 + px2) / 2
      });
    }
  }

  return segs;
}

export function buildEdges(segs, jumpHeightPx, jumpDistPx, dropMaxPx) {
  const edges = new Map();
  for (const s of segs) edges.set(s.id, []);

  const overlap = (a, b) => Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const gap = (a, b) => Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2)); // 0 if overlaps

  for (const a of segs) {
    for (const b of segs) {
      if (a.id === b.id) continue;

      const dy = b.y - a.y;         
      const horizGap = gap(a, b);  
      const hasOverlap = overlap(a, b) > 0;

      // WALK
      if (Math.abs(dy) <= 6 && horizGap <= 48) {
        edges.get(a.id).push({ to: b.id, type: 'walk', cost: 1.0 });
      }

      // DROP 
      if (dy > 0 && dy <= dropMaxPx && hasOverlap) {
        edges.get(a.id).push({ to: b.id, type: 'drop', cost: 1.2 });
      }

      // JUMP 
      if (dy < 0 && Math.abs(dy) <= jumpHeightPx && horizGap <= jumpDistPx) {
        edges.get(a.id).push({ to: b.id, type: 'jump', cost: 1.8 });
      }
    }
  }

  return edges;
}


export function findSegmentUnder(segs, x, y, toleranceY = 40) {
  // Find the closest segment at/under y that overlaps x
  let best = null;
  let bestDy = Infinity;

  for (const s of segs) {
    if (x < s.x1 || x > s.x2) continue;
    const dy = s.y - y;
    if (dy >= -toleranceY && dy < bestDy) {
      bestDy = dy;
      best = s;
    }
  }

  return best;
}

export function aStarSegments(segs, edges, startId, goalId) {
  const byId = (id) => segs[id];

  const h = (id) => {
    const a = byId(id);
    const g = byId(goalId);
    return Math.abs(a.centerX - g.centerX) + Math.abs(a.y - g.y);
  };

  const open = new Set([startId]);
  const cameFrom = new Map();
  const gScore = new Map([[startId, 0]]);
  const fScore = new Map([[startId, h(startId)]]);

  while (open.size) {
    let current = null;
    let bestF = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) { bestF = f; current = id; }
    }

    if (current === goalId) {
      const path = [current];
      while (cameFrom.has(current)) {
        current = cameFrom.get(current);
        path.push(current);
      }
      return path.reverse();
    }

    open.delete(current);

    for (const e of edges.get(current) || []) {
      const tentative = (gScore.get(current) ?? Infinity) + e.cost;
      if (tentative < (gScore.get(e.to) ?? Infinity)) {
        cameFrom.set(e.to, current);
        gScore.set(e.to, tentative);
        fScore.set(e.to, tentative + h(e.to));
        open.add(e.to);
      }
    }
  }

  return null;
}

export function edgeBetween(edges, aId, bId) {
  const list = edges.get(aId) || [];
  return list.find(e => e.to === bId) || null;
}
