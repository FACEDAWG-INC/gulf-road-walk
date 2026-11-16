/* Turns the raw OpenStreetMap downloads (tA..tD.json + q4.json coastline)
   into one compact scene.json the viewer loads.
   Run:  node data/process.js   (from the gulf-road-walk folder)            */
const fs = require('fs');
const path = require('path');
const D = __dirname;

const LAT0 = 29.33, LON0 = 48.05;
const KX = Math.cos(LAT0 * Math.PI / 180) * 111320, KZ = 110574;
// local metres: +x east, +z south. Stored as integer decimetres.
const X = lon => (lon - LON0) * KX;
const Z = lat => -(lat - LAT0) * KZ;
const q = v => Math.round(v * 10);

const seen = new Set();
const els = [];
for (const t of 'ABCD') {
  for (const e of JSON.parse(fs.readFileSync(path.join(D, `t${t}.json`))).elements) {
    const k = e.type + e.id;
    if (!seen.has(k)) { seen.add(k); els.push(e); }
  }
}

// ---- the Gulf Road itself (route 25) -> corridor filter -----------------
const routeWays = els.filter(e => e.type === 'way' && e.tags && e.tags.highway && e.tags.ref === '25');
const CELL = 250;
const grid = new Map();
const routeSegs = [];
for (const w of routeWays) {
  const pts = w.geometry.filter(p => p.lon >= 47.9995).map(p => [X(p.lon), Z(p.lat)]);
  if (pts.length < 2) continue;
  routeSegs.push(pts);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 25));
    for (let j = 0; j <= n; j++) {
      const x = ax + (bx - ax) * j / n, z = az + (bz - az) * j / n;
      const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(x, z);
    }
  }
}
function distToRoute(x, z, R) {
  const r = Math.ceil(R / CELL), cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let best = Infinity;
  for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) {
    const a = grid.get(i + ',' + j);
    if (!a) continue;
    for (let k = 0; k < a.length; k += 2) {
      const d = (a[k] - x) ** 2 + (a[k + 1] - z) ** 2;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}
const near = (pts, R) => pts.some(p => distToRoute(p[0], p[1], R) <= R);

const toPts = geom => geom.map(p => [X(p.lon), Z(p.lat)]);
const flat = pts => { const o = []; for (const p of pts) o.push(q(p[0]), q(p[1])); return o; };
function ring(pts) { // drop closing duplicate
  const a = pts.slice();
  if (a.length > 1 && a[0][0] === a[a.length - 1][0] && a[0][1] === a[a.length - 1][1]) a.pop();
  return a;
}
function area(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function centroid(pts) { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; }
function hash(n) { let h = (n ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const nameOf = t => t['name:en'] || t.name || '';
const num = v => { const f = parseFloat(v); return isFinite(f) ? f : null; };

// ---- Kuwait Towers: modelled by hand in the viewer from OSM positions ----
const TOWER_IDS = new Set([295611982, 295611984, 295611985, 1471548078, 1471548079, 1471548080, 1471548081, 1471548082, 1476369192, 1476369193]);
const byId = new Map(els.map(e => [e.id, e]));
const cOf = id => centroid(ring(toPts(byId.get(id).geometry))).map(v => +v.toFixed(1));
const towers = { main: cOf(1471548082), water: cOf(1476369192), light: cOf(295611985) };

const out = { origin: [LAT0, LON0], towers, buildings: [], roads: [], areas: [], pois: [], coast: [], route: [] };
for (const s of routeSegs) out.route.push(flat(s));

const stats = { tagged: 0, guessed: 0 };
const dupes = new Map();
function addBuilding(id, tags, pts) {
  pts = ring(pts);
  if (pts.length < 3) return;
  const A = Math.abs(area(pts));
  if (A < 6) return;
  const b = tags.building || tags['building:part'] || 'yes';
  const r = hash(id);
  let h = num(tags.height), m = num(tags.min_height) || 0, k = 0;
  if (/house|detached|residential|villa|semidetached/.test(b)) k = 1;
  else if (/apartments|dormitory/.test(b)) k = 2;
  else if (/commercial|retail|office|supermarket|mall/.test(b) || tags.shop) k = 3;
  else if (/mosque/.test(b) || tags.amenity === 'place_of_worship') k = 4;
  else if (/hotel/.test(b) || tags.tourism === 'hotel') k = 5;
  if (h == null && tags['building:levels']) { const l = num(tags['building:levels']); if (l) h = l * 3.4 + 1; }
  if (h == null) {
    stats.guessed++;
    if (/roof|carport|shed|kiosk|hut|garage/.test(b)) h = 3.2;
    else if (k === 1) h = 7.5 + r * 3;
    else if (k === 2) h = 22 + r * 30;
    else if (k === 3) h = 9 + r * 9;
    else if (k === 4) h = 9;
    else if (k === 5) h = 30 + r * 25;
    else if (A < 60) h = 3.5;
    else if (A < 420) h = 7 + r * 4;
    else if (A < 1600) h = r < 0.55 ? 10 + r * 12 : 22 + r * 30;
    else h = 9 + r * 8;
  } else stats.tagged++;
  if (b === 'bridge') { h = 14; m = 7; } // enclosed footbridges span the road, they don't stand on it
  const fp = flat(pts), dk = fp.length + '|' + fp.slice(0, 6).join(',');
  if (dupes.has(dk)) { const d = dupes.get(dk); d.h = Math.max(d.h, +h.toFixed(1)); return; }
  const o = { p: fp, h: +h.toFixed(1), k };
  dupes.set(dk, o);
  if (m) o.m = m;
  out.buildings.push(o);
  const n = nameOf(tags);
  if (n) { const c = centroid(pts); out.pois.push({ x: Math.round(c[0]), z: Math.round(c[1]), n }); }
}

const ROAD = {
  motorway: [0, 11], trunk: [0, 11], primary: [0, 10.5], motorway_link: [0, 7], trunk_link: [0, 7], primary_link: [0, 7],
  secondary: [1, 9], tertiary: [1, 8], secondary_link: [1, 6], tertiary_link: [1, 6],
  residential: [2, 6.5], unclassified: [2, 6.5], living_street: [2, 6], service: [2, 4.5], road: [2, 6],
  footway: [3, 2.6], path: [3, 2.2], pedestrian: [3, 5], cycleway: [3, 2.6], steps: [3, 2.4], track: [3, 3], corridor: [3, 2]
};
const AREA = {
  park: 'park', garden: 'park', playground: 'park', grass: 'park', recreation_ground: 'park', cemetery: 'park',
  pitch: 'pitch', track: 'pitch', beach: 'beach', sand: 'beach', water: 'water', swimming_pool: 'water',
  scrub: 'scrub', wood: 'scrub', forest: 'scrub', meadow: 'scrub'
};

for (const e of els) {
  const t = e.tags || {};
  if (e.type === 'node') {
    if (t.name && t.tourism) {
      const x = X(e.lon), z = Z(e.lat);
      if (distToRoute(x, z, 800) <= 800) out.pois.push({ x: Math.round(x), z: Math.round(z), n: nameOf(t) });
    }
    continue;
  }
  if (e.type === 'relation') {
    if (!t.building) continue;
    for (const mbr of e.members || []) {
      if (mbr.type === 'way' && mbr.role !== 'inner' && mbr.geometry) {
        const pts = toPts(mbr.geometry);
        if (near(pts, 650)) addBuilding(e.id * 31 + mbr.ref, t, pts);
      }
    }
    continue;
  }
  if (!e.geometry || e.geometry.length < 2) continue;
  if (TOWER_IDS.has(e.id)) continue;
  const pts = toPts(e.geometry);
  const closed = e.nodes[0] === e.nodes[e.nodes.length - 1] && pts.length > 3;

  if (t.building || t['building:part']) { if (closed && near(pts, 650)) addBuilding(e.id, t, pts); continue; }

  if (t.man_made === 'pier' || t.man_made === 'breakwater' || t.man_made === 'groyne') {
    if (!near(pts, 1200)) continue;
    if (closed) out.areas.push({ p: flat(ring(pts)), k: 'pier' });
    else out.roads.push({ p: flat(pts), w: t.man_made === 'pier' ? 4 : 6, k: 4 });
    continue;
  }
  if (t.highway) {
    if (!near(pts, 650)) continue;
    if (closed && t.area === 'yes') { out.areas.push({ p: flat(ring(pts)), k: 'plaza' }); continue; }
    const r = ROAD[t.highway];
    if (!r) continue;
    let w = r[1];
    const lanes = num(t.lanes);
    if (lanes && r[0] < 3) w = Math.max(w * 0.6, Math.min(lanes * 3.5 + 1, 22));
    const o = { p: flat(pts), w: +w.toFixed(1), k: r[0] };
    if (t.ref === '25') o.g = 1;
    out.roads.push(o);
    continue;
  }
  if (!closed) continue;
  let k = AREA[t.leisure] || AREA[t.natural] || AREA[t.landuse];
  if (!k && t.amenity === 'parking' && !t.building) k = 'parking';
  if (!k && t.leisure === 'marina') k = null;
  if (k && near(pts, 1000)) {
    out.areas.push({ p: flat(ring(pts)), k });
    const n = nameOf(t);
    if (n && k === 'park') { const c = centroid(pts); out.pois.push({ x: Math.round(c[0]), z: Math.round(c[1]), n }); }
  }
}

// ---- coastline: stitch ways into chains (land is on the left of travel) --
const cw = JSON.parse(fs.readFileSync(path.join(D, 'q4.json'))).elements.map(w => ({ nodes: w.nodes.slice(), pts: toPts(w.geometry) }));
const chains = [];
while (cw.length) {
  const c = cw.pop();
  let grew = true;
  while (grew && c.nodes[0] !== c.nodes[c.nodes.length - 1]) {
    grew = false;
    for (let i = 0; i < cw.length; i++) {
      const w = cw[i];
      if (w.nodes[0] === c.nodes[c.nodes.length - 1]) { c.nodes.push(...w.nodes.slice(1)); c.pts.push(...w.pts.slice(1)); }
      else if (w.nodes[w.nodes.length - 1] === c.nodes[0]) { c.nodes = w.nodes.concat(c.nodes.slice(1)); c.pts = w.pts.concat(c.pts.slice(1)); }
      else continue;
      cw.splice(i, 1); grew = true; break;
    }
  }
  chains.push(c);
}
for (const c of chains) {
  const closed = c.nodes[0] === c.nodes[c.nodes.length - 1];
  out.coast.push({ p: flat(closed ? ring(c.pts) : c.pts), c: closed ? 1 : 0 });
  console.log('coast chain', c.pts.length, 'pts', closed ? 'closed' : 'open',
    'from', c.pts[0].map(Math.round), 'to', c.pts[c.pts.length - 1].map(Math.round));
}

// de-duplicate POIs by name+nearby
const pk = new Set();
out.pois = out.pois.filter(p => { const k = p.n + '|' + Math.round(p.x / 60) + '|' + Math.round(p.z / 60); if (pk.has(k)) return false; pk.add(k); return true; });

const file = path.join(D, '..', 'scene.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log({ buildings: out.buildings.length, roads: out.roads.length, areas: out.areas.length, pois: out.pois.length, route: out.route.length, ...stats, towers, MB: +(fs.statSync(file).size / 1e6).toFixed(2) });
const j = out.pois.find(p => /Jumeirah/.test(p.n)); console.log('jumeirah', j);
