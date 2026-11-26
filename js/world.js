'use strict';
// Colonie Noire · monde : terrain (surface ou galeries), décor, collisions, ligne de vue, navigation
const EMPTY = [];
// --- décor modélisé dans Blender (models/nature.glb) : géométries et matériaux partagés
const NATC = {}, NATM = {};
function natGeo(name) {
  if (!ANT.nature) return null;
  if (NATC[name]) return NATC[name];
  let m = null; const o = ANT.nature.scene.getObjectByName(name); if (!o) return null;
  o.traverse(x => { if (!m && x.isMesh) m = x; });
  const g = m.geometry;
  if (g.attributes.color_1) { g.setAttribute('color', g.attributes.color_1); g.deleteAttribute('color_1'); }
  g.userData.keep = true; NATC[name] = g; return g;
}
function natMat(kind) {
  if (NATM[kind]) return NATM[kind];
  const base = { vertexColors: true };
  const m = kind === 'rock' ? new T.MeshStandardMaterial({ ...base, roughness: .9, normalMap: TEX.rockN, normalScale: new T.Vector2(1.3, 1.3) })
    : kind === 'veg' ? new T.MeshStandardMaterial({ ...base, roughness: .62, side: T.DoubleSide, emissive: '#0a1404' })
    : kind === 'wood' ? new T.MeshStandardMaterial({ ...base, roughness: .95 })
    : kind === 'soft' ? new T.MeshPhysicalMaterial({ ...base, roughness: .45, clearcoat: .4, clearcoatRoughness: .4 })
    : kind === 'cave' ? new T.MeshStandardMaterial({ ...base, roughness: .9, color: '#8a7a6a' })
    : new T.MeshStandardMaterial({ ...base, roughness: .75 });
  return (NATM[kind] = m);
}
function natMesh(name, kind) { const g = natGeo(name); if (!g) return null; const m = new T.Mesh(g, natMat(kind)); m.castShadow = m.receiveShadow = true; return m; }
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DZ8 = [0, 0, 1, -1, 1, -1, 1, -1];

class World {
  constructor(scene) { this.scene = scene; this.group = null; this.time = 0; this.windU = null; }

  clear() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
    this.group = null;
  }

  build(L) {
    this.clear(); this.L = L;
    this.group = new T.Group(); this.scene.add(this.group);
    const S = L.size, h = S / 2, res = .5, n = Math.round(S / res) + 1;
    Object.assign(this, { S, half: h, res, n, cave: L.type === 'cave' });
    this.floor = new Float32Array(n * n); this.ceil = new Float32Array(n * n); this.w = new Float32Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = -h + c * res, z = -h + r * res, i = r * n + c, o = this.cave ? this.caveAt(x, z) : this.surfAt(x, z);
      this.floor[i] = o.f; this.ceil[i] = o.c; this.w[i] = o.w;
    }
    this.hash = new Map(); this.cols = []; this.flowers = [];
    this.ores = .25; this.on = Math.round(S / this.ores) + 1;
    this.otop = new Float32Array(this.on * this.on).fill(-1e9); this.obot = new Float32Array(this.on * this.on).fill(1e9);
    this.buildGround();
    const rng = mkRng(L.seed || 1);
    if (this.cave) this.decorCave(rng); else this.decorSurface(rng);
    this.buildNav();
  }

  // --- champs de hauteur
  surfAt(x, z) {
    const L = this.L, h = this.half;
    let f = NOISE.fbm(x / 45, z / 45, 4) * 5 + NOISE.fbm(x / 8, z / 8, 2) * .5;
    const d = h - Math.max(Math.abs(x), Math.abs(z));
    f += Math.pow(smoothstep(10, 0, d), 2) * 9;
    if (L.mound) {
      const m = L.mound, dm = Math.hypot(x - m.x, z - m.z);
      f += m.h * Math.pow(Math.max(0, 1 - dm / m.r), 1.2);
      if (dm < m.r * .18) f -= m.h * .35 * Math.sqrt(1 - dm / (m.r * .18));
    }
    return { f, c: 1e9, w: smoothstep(6, 1.5, d) };
  }
  caveAt(x, z) {
    const L = this.L; let q = 9, hs = 0, ws = 0;
    const wob = NOISE.fbm(x / 7, z / 7, 3);
    for (const s of L.shapes) {
      let d;
      if (s.b) {
        const ax = s.a[0], az = s.a[1], dx = s.b[0] - ax, dz = s.b[1] - az, l2 = dx * dx + dz * dz;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
        d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      } else d = Math.hypot(x - s.x, z - s.z);
      const qq = d / s.r + wob * .22; if (qq < q) q = qq;
      const wt = Math.pow(Math.max(0, 1.25 - qq), 3) + 1e-6; hs += s.h * wt; ws += wt;
    }
    let w = clamp(q, 0, 1);
    for (const p of L.pillars || EMPTY) { const d = Math.hypot(x - p.x, z - p.z) + wob * .6; w = Math.max(w, smoothstep(p.r, p.r * .45, d)); }
    const H = hs / ws, base = NOISE.fbm(x / 30 + 7, z / 30, 3) * 1.6, w2 = w * w;
    let f = base + H * .5 * (1 - Math.sqrt(Math.max(0, 1 - w2 * w2))) + NOISE.fbm(x / 2.5, z / 2.5, 2) * .12 * (1 - w);
    let c = base + H - H * .5 * (1 - Math.sqrt(Math.max(0, 1 - w2))) - Math.max(0, NOISE.fbm(x / 1.8 + 3, z / 1.8, 2)) * 1.1 * (1 - w);
    if (f > c) f = c = (f + c) / 2;
    return { f, c, w };
  }

  buildGround() {
    const { n, S } = this, cave = this.cave, L = this.L;
    const geo = new T.PlaneGeometry(S, S, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(n * n * 3);
    for (let i = 0; i < n * n; i++) {
      const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, this.floor[i]);
      const v = .8 + NOISE.fbm(x / 6, z / 6, 3) * .5, g = NOISE.fbm(x / 20 + 9, z / 20, 2);
      let r, gg, b;
      if (cave) { const wl = this.w[i]; r = .2 * v; gg = .13 * v; b = .08 * v; const k = 1 - wl * .45; r *= k; gg *= k; b *= k; }
      else {
        r = .24 * v; gg = .17 * v; b = .1 * v;
        if (g > .05) { const k = smoothstep(.05, .3, g) * .6; r = lerp(r, .13, k); gg = lerp(gg, .16, k); b = lerp(b, .06, k); }
        if (L.mound) { const dm = Math.hypot(x - L.mound.x, z - L.mound.z), k = smoothstep(L.mound.r * 1.15, L.mound.r * .6, dm); r = lerp(r, .34 * v, k); gg = lerp(gg, .14 * v, k); b = lerp(b, .07 * v, k); }
      }
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    TEX.soil.repeat.set(S / 7, S / 7);
    TEX.soilN.repeat.copy(TEX.soil.repeat);
    const mat = new T.MeshStandardMaterial({ map: TEX.soil, normalMap: TEX.soilN, normalScale: new T.Vector2(1.1, 1.1), vertexColors: true, roughness: .95 });
    const m = new T.Mesh(geo, mat); m.receiveShadow = true; this.group.add(m);
    if (cave) {
      const cg = geo.clone(), cp = cg.attributes.position, cc = cg.attributes.color;
      for (let i = 0; i < n * n; i++) { cp.setY(i, this.ceil[i]); cc.setXYZ(i, cc.getX(i) * .7, cc.getY(i) * .66, cc.getZ(i) * .62); }
      cg.computeVertexNormals();
      this.group.add(new T.Mesh(cg, new T.MeshStandardMaterial({ map: TEX.soil, normalMap: TEX.soilN, vertexColors: true, roughness: 1, side: T.BackSide })));
    }
  }

  // --- requêtes
  samp(A, x, z) {
    const { n, res, half } = this;
    const fx = clamp((x + half) / res, 0, n - 1.001), fz = clamp((z + half) / res, 0, n - 1.001);
    const c = fx | 0, r = fz | 0, u = fx - c, v = fz - r, i = r * n + c;
    return A[i] * (1 - u) * (1 - v) + A[i + 1] * u * (1 - v) + A[i + n] * (1 - u) * v + A[i + n + 1] * u * v;
  }
  floorAt(x, z) { return this.samp(this.floor, x, z); }
  ceilAt(x, z) { return this.cave ? this.samp(this.ceil, x, z) : 1e9; }
  wAt(x, z) { return this.samp(this.w, x, z); }

  addCol(x, z, r, top, bot = -1e9) {
    const c = { x, z, r, top, bot }; this.cols.push(c);
    const k = 4, m = r + 2;
    for (let a = Math.floor((x - m) / k); a <= Math.floor((x + m) / k); a++)
      for (let b = Math.floor((z - m) / k); b <= Math.floor((z + m) / k); b++) {
        const key = a * 10007 + b; let l = this.hash.get(key); if (!l) this.hash.set(key, l = []); l.push(c);
      }
    return c;
  }
  near(x, z) { return this.hash.get(Math.floor(x / 4) * 10007 + Math.floor(z / 4)) || EMPTY; }

  leafTop(c, x, z) {
    const dx = x - c.x, dz = z - c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    const lx = (co * dx - si * dz) / c.sx, v = si * dx + co * dz, t = v / (c.sz * c.cp) + .5;
    if (t < 0 || t > 1) return -1e9;
    if (Math.abs(lx) > .44 * Math.pow(Math.sin(Math.PI * t), .7)) return -1e9;
    return c.y + v * c.tp + lx * lx * .9 * c.sy * c.cp + .04;
  }
  topAt(c, x, z) {
    if (c.leaf) return this.leafTop(c, x, z);
    const d2 = (x - c.x) ** 2 + (z - c.z) ** 2;
    if (c.dome) { const D = c.dome, k = d2 / (D.R * D.R); return k >= 1 ? -1e9 : D.y0 + D.h * Math.sqrt(1 - k); }
    return d2 < (c.r * .85) ** 2 ? c.top : -1e9;
  }
  // grille fine des objets solides : hauteur du dessus et du dessous, obtenue en rastérisant leurs triangles
  raster(mesh) {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry, pa = g.attributes.position, ix = g.index, M = mesh.matrixWorld, n = this.on, r = this.ores, h = this.half;
    const vs = []; for (let i = 0; i < pa.count; i++) vs.push(new T.Vector3().fromBufferAttribute(pa, i).applyMatrix4(M));
    const cnt = ix ? ix.count : pa.count, I = k => ix ? ix.getX(k) : k;
    for (let k = 0; k < cnt; k += 3) {
      const a = vs[I(k)], b = vs[I(k + 1)], c = vs[I(k + 2)];
      const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z); if (Math.abs(det) < 1e-9) continue;
      const c0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) + h) / r)), c1 = Math.min(n - 1, Math.floor((Math.max(a.x, b.x, c.x) + h) / r));
      const r0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) + h) / r)), r1 = Math.min(n - 1, Math.floor((Math.max(a.z, b.z, c.z) + h) / r));
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
        const x = -h + cc * r, z = -h + rr * r;
        const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det, l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        const y = l1 * a.y + l2 * b.y + l3 * c.y, i = rr * n + cc;
        if (y > this.otop[i]) this.otop[i] = y; if (y < this.obot[i]) this.obot[i] = y;
      }
    }
  }
  oSamp(A, x, z, empty) {
    const n = this.on, r = this.ores, h = this.half, fx = (x + h) / r, fz = (z + h) / r, c = Math.floor(fx), rr = Math.floor(fz);
    if (c < 0 || rr < 0 || c >= n - 1 || rr >= n - 1) return empty;
    const u = fx - c, v = fz - rr, i = rr * n + c, a = A[i], b = A[i + 1], d = A[i + n], e = A[i + n + 1];
    if (a === empty || b === empty || d === empty || e === empty) return v < .5 ? (u < .5 ? a : b) : (u < .5 ? d : e);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + d * (1 - u) * v + e * u * v;
  }
  objTop(x, z) { return this.oSamp(this.otop, x, z, -1e9); }
  objBot(x, z) { return this.oSamp(this.obot, x, z, 1e9); }
  solidAt(x, y, z) { const t = this.objTop(x, z); return t > -1e8 && y < t && y > this.objBot(x, z) - .05; }
  groundAt(x, z, y) {
    let g = this.floorAt(x, z);
    { const t = this.objTop(x, z); if (t > g && t <= y + .5) g = t; }
    for (const c of this.near(x, z)) { const t = this.topAt(c, x, z); if (t > g && t <= y + .5) g = t; }
    return g;
  }
  walkable(x, z, y, step) {
    if (this.wAt(x, z) > .7) return false;
    { const t = this.objTop(x, z); if (t > y + step && this.objBot(x, z) < y + .9) return false; }
    const f = this.groundAt(x, z, y);
    if (f > y + step) return false;
    if (this.cave && this.ceilAt(x, z) - Math.max(f, y) < .75) return false;
    return true;
  }
  // déplace un corps (pieds en p) avec glissement le long des murs
  move(p, dx, dz, r, step) {
    const l = Math.hypot(dx, dz), ax = l > 1e-5 ? dx / l * r * .8 : 0, az = l > 1e-5 ? dz / l * r * .8 : 0;
    if (this.walkable(p.x + dx, p.z + dz, p.y, step) && this.walkable(p.x + dx + ax, p.z + dz + az, p.y, step + .1)) { p.x += dx; p.z += dz; }
    else if (this.walkable(p.x + dx, p.z, p.y, step)) p.x += dx;
    else if (this.walkable(p.x, p.z + dz, p.y, step)) p.z += dz;
    this.pushOut(p, r);
  }
  pushOut(p, r) {
    for (const c of this.near(p.x, p.z)) {
      if (c.leaf || p.y + .6 < c.bot) continue;
      if (c.dome ? p.y >= this.topAt(c, p.x, p.z) - .3 : p.y >= c.top - .05) continue;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + (c.grass ? Math.min(r, .42) : r);
      if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
    }
  }
  los(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz), st = Math.ceil(d / .7);
    for (let i = 1; i < st; i++) {
      const t = i / st, x = a.x + dx * t, y = a.y + dy * t, z = a.z + dz * t;
      if (y < this.floorAt(x, z) - .05) return false;
      if (this.cave && y > this.ceilAt(x, z)) return false;
      if (this.solidAt(x, y, z)) return false;
      for (const c of this.near(x, z)) if (!c.leaf && c.r > .9 && y < c.top && y > c.bot && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r * .8) return false;
    }
    return true;
  }

  rayBlock(o, d, max) {
    for (let t = .3; t < max; t += .35) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y < this.floorAt(x, z) || (this.cave && y > this.ceilAt(x, z)) || this.wAt(x, z) > .85 || this.solidAt(x, y, z)) return t;
      for (const c of this.near(x, z)) if (!c.leaf && y < c.top && y > c.bot && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return t;
    }
    return max;
  }

  // --- navigation (champ de flux recalculé vers la joueuse)
  buildNav() {
    const nn = this.nn = Math.round(this.S), h = this.half;
    this.walk = new Uint8Array(nn * nn); this.dist = new Float32Array(nn * nn); this.q = new Int32Array(nn * nn);
    for (let r = 0; r < nn; r++) for (let c = 0; c < nn; c++) {
      const x = -h + c + .5, z = -h + r + .5;
      let ok = this.wAt(x, z) < .66;
      if (ok && this.objTop(x, z) - this.floorAt(x, z) > .8) ok = false;
      if (ok) { const f = this.floorAt(x, z); for (const k of this.near(x, z)) if (!k.leaf && !k.cap && k.r > .15 && Math.hypot(x - k.x, z - k.z) < k.r + .3 && k.top - f > .7) { ok = false; break; } }
      this.walk[r * nn + c] = ok ? 1 : 0;
    }
  }
  cellOf(x, z) { const h = this.half; return [clamp(Math.floor(x + h), 0, this.nn - 1), clamp(Math.floor(z + h), 0, this.nn - 1)]; }
  flow(tx, tz) {
    const nn = this.nn, D = this.dist, W = this.walk, q = this.q; D.fill(1e9);
    const [c, r] = this.cellOf(tx, tz); let qh = 0, qt = 0; const s = r * nn + c; D[s] = 0; q[qt++] = s;
    while (qh < qt) {
      const i = q[qh++], ci = i % nn, ri = (i / nn) | 0, d = D[i] + 1;
      for (let k = 0; k < 8; k++) {
        const cc = ci + DX8[k], rr = ri + DZ8[k];
        if (cc < 0 || rr < 0 || cc >= nn || rr >= nn) continue;
        const j = rr * nn + cc;
        if (!W[j] || D[j] <= d) continue;
        if (k >= 4 && (!W[ri * nn + cc] || !W[rr * nn + ci])) continue;
        D[j] = d; q[qt++] = j;
      }
    }
  }
  nextStep(x, z) {
    const [c, r] = this.cellOf(x, z), nn = this.nn, D = this.dist, W = this.walk;
    let best = D[r * nn + c], bc = -1, br = -1;
    for (let k = 0; k < 8; k++) {
      const cc = c + DX8[k], rr = r + DZ8[k];
      if (cc < 0 || rr < 0 || cc >= nn || rr >= nn) continue;
      if (k >= 4 && (!W[r * nn + cc] || !W[rr * nn + c])) continue;
      const d = D[rr * nn + cc]; if (d < best) { best = d; bc = cc; br = rr; }
    }
    return bc < 0 ? null : [bc - this.half + .5, br - this.half + .5];
  }

  // --- décor de surface
  decorSurface(rng) {
    this.mush = [];
    const L = this.L, h = this.half, g = this.group; this.highSpots = [];
    const clear = (x, z) => (L.clear || EMPTY).some(c => Math.hypot(x - c[0], z - c[1]) < c[2]);
    // rochers
    const rockGeos = [0, 1, 2, 3].map(s => this.rockGeo(s * 7.3 + (L.seed || 1)));
    const rockCols = ['#8d8478', '#7a7268', '#9a8f80', '#6e675f'];
    const rockMats = rockCols.map(c => new T.MeshStandardMaterial({ color: c, map: TEX.rock, normalMap: TEX.rockN, normalScale: new T.Vector2(1.4, 1.4), roughness: .88 }));
    const placeRock = (x, z, s) => {
      const y = this.floorAt(x, z) - s * .2;
      const m = natMesh('rock_' + Math.floor(rng() * 5), 'rock') || new T.Mesh(rockGeos[Math.floor(rng() * 4)], rockMats[Math.floor(rng() * 4)]);
      m.scale.setScalar(s); m.position.set(x, y, z); m.rotation.y = rng() * 6.28; m.castShadow = m.receiveShadow = true; g.add(m);
      this.raster(m);
      if (s > 4) this.highSpots.push({ x, z });
    };
    for (const r of L.rocks || EMPTY) placeRock(r[0], r[1], r[2]);
    for (let i = 0; i < (L.rockCount || 45); i++) {
      const x = (rng() * 2 - 1) * (h - 8), z = (rng() * 2 - 1) * (h - 8); if (clear(x, z)) continue;
      placeRock(x, z, 1.4 + Math.pow(rng(), 2.2) * 7);
    }
    this.addGrass(rng, L.grass || 2400, clear);
    // gravillons (instanciés, sans collision)
    const pg = natGeo('pebble') || rockGeos[0], pm = new T.InstancedMesh(pg, natGeo('pebble') ? natMat('rock') : rockMats[2], 500), mt = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sv = new T.Vector3(), pv = new T.Vector3();
    for (let i = 0; i < 500; i++) {
      const x = (rng() * 2 - 1) * h, z = (rng() * 2 - 1) * h, s = .12 + rng() * .45;
      e.set(rng() * 3, rng() * 6, rng() * 3); q.setFromEuler(e); sv.set(s, s, s); pv.set(x, this.floorAt(x, z), z);
      mt.compose(pv, q, sv); pm.setMatrixAt(i, mt);
    }
    pm.receiveShadow = true; g.add(pm);
    // feuilles mortes
    const lg = natGeo('leaf_green') ? null : this.leafGeo(), leafCols = ['#6f8f2e', '#8a7a2a', '#9a5a22', '#6b4a1e', '#a8762c'];
    for (let i = 0; i < (L.leaves || 22); i++) {
      const x = (rng() * 2 - 1) * (h - 10), z = (rng() * 2 - 1) * (h - 10); if (clear(x, z)) continue;
      const s = 7 + rng() * 8, f = this.floorAt(x, z);
      if (Math.abs(this.floorAt(x + s * .4, z) - f) > .9 || Math.abs(this.floorAt(x, z + s * .4) - f) > .9) continue;
      this.placeLeaf(lg, x, z, f + .06, rng() * 6.28, 0, s, leafCols[Math.floor(rng() * leafCols.length)], rng() < .45);
    }
    this.leafGeom = lg; this.leafCols = leafCols;
    // champignons
    for (let i = 0; i < (L.mushrooms || 7); i++) {
      const x = (rng() * 2 - 1) * (h - 12), z = (rng() * 2 - 1) * (h - 12); if (clear(x, z)) continue;
      this.mushroom(x, z, .5 + rng() * .7, 3 + rng() * 6, rng() < .5 ? '#9b5a2c' : '#cdb48a');
    }
    // fleurs
    for (let i = 0; i < (L.flowers || 9); i++) {
      const x = (rng() * 2 - 1) * (h - 10), z = (rng() * 2 - 1) * (h - 10); if (clear(x, z)) continue;
      this.flower(x, z, 18 + rng() * 12, rng());
    }
    // brindilles
    for (let i = 0; i < (L.twigs || 10); i++) {
      const x = (rng() * 2 - 1) * (h - 15), z = (rng() * 2 - 1) * (h - 15); if (clear(x, z)) continue;
      this.twig(x, z, 12 + rng() * 12, .45 + rng() * .35, rng() * Math.PI);
    }
    // gouttes de rosée
    const dewMat = new T.MeshPhysicalMaterial({ color: '#e6f6ff', roughness: 0, metalness: 0, transparent: true, opacity: .38, clearcoat: 1, envMapIntensity: 2.5 });
    for (let i = 0; i < 30; i++) {
      const x = (rng() * 2 - 1) * (h - 8), z = (rng() * 2 - 1) * (h - 8), r = .35 + rng() * 1.1;
      const m = new T.Mesh(ANT.sph, dewMat); m.scale.set(r, r * .82, r); m.position.set(x, this.floorAt(x, z) + r * .7, z); g.add(m);
    }
    if (L.mound) this.anthill(L.mound);
    // feuilles posées en rampe jusqu'aux chapeaux des champignons : on peut y monter et sauter de l'un à l'autre
    for (const mu of this.mush) {
      for (let tries = 0; tries < 6; tries++) {
        const a = rng() * 6.28, rim = mu.R * .55, tx = mu.x + Math.cos(a) * rim, tz = mu.z + Math.sin(a) * rim, ht = mu.y0 + mu.h * .835 + .2;
        const fb0 = this.floorAt(tx, tz), sz = Math.max(10, (ht - fb0) / .55), p = Math.asin(clamp((ht - fb0) / sz, 0, .62));
        const hs = sz * Math.cos(p), bx = tx + Math.cos(a) * hs, bz = tz + Math.sin(a) * hs;
        if (Math.max(Math.abs(bx), Math.abs(bz)) > h - 10 || this.wAt(bx, bz) > .2) continue;
        const fb = this.floorAt(bx, bz), p2 = Math.asin(clamp((ht - fb) / sz, 0, .7));
        this.placeLeaf(this.leafGeom, (tx + bx) / 2, (tz + bz) / 2, (ht + fb) / 2 - .05, Math.atan2(-Math.cos(a), -Math.sin(a)), p2, sz, this.leafCols[Math.floor(rng() * 5)]);
        this.highSpots.unshift({ x: mu.x, z: mu.z });
        break;
      }
    }
  }
  placeLeaf(geo, x, z, y, yaw, pitch, s, col, dry) {
    const nm = natMesh(dry ? 'leaf_dry' : 'leaf_green', 'veg');
    if (nm) {
      nm.scale.set(s * .72, s * .45, s); nm.position.set(x, y, z); nm.rotation.set(-pitch, yaw, 0, 'YXZ'); this.group.add(nm);
      this.raster(nm); return;
    }
    const m = new T.Mesh(geo, new T.MeshStandardMaterial({ map: TEX.leaf, color: col, side: T.DoubleSide, roughness: .75 }));
    m.scale.set(s * .7, s * .5, s); m.position.set(x, y, z); m.rotation.set(-pitch, yaw, 0, 'YXZ'); m.receiveShadow = m.castShadow = true; this.group.add(m);
    const c = this.addCol(x, z, s * .55, y + s * .5, -1e9);
    Object.assign(c, { leaf: true, y, yaw, cp: Math.cos(pitch), tp: Math.tan(pitch), sx: s * .7, sy: s * .5, sz: s });
  }

  addGrass(rng, count, clear) {
    const segs = 8, pos = [], col = [], idx = [], c0 = new T.Color('#16300c'), c1 = new T.Color('#7fb437'), c2 = new T.Color('#c3d86a');
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, w = .5 * Math.pow(1 - t, .65) + .008, z = t * t * .38, fold = .07 * (1 - t);
      const cc = c0.clone().lerp(c1, Math.min(1, t * 1.4)); if (t > .7) cc.lerp(c2, (t - .7) * 1.2);
      pos.push(-w, t, z, 0, t, z + fold, w, t, z);
      for (let k = 0; k < 3; k++) col.push(cc.r * (k === 1 ? 1.1 : .92), cc.g * (k === 1 ? 1.1 : .92), cc.b);
    }
    for (let i = 0; i < segs; i++) { const a = i * 3; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const ng = natGeo('grass'); const bladeGeo = ng || geo;
    const u = { value: 0 }, push = { value: new T.Vector3(0, -999, 0) }; this.windU = u; this.pushU = push;
    const mat = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: .55, emissive: '#0d1a04', emissiveIntensity: 1 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = u; sh.uniforms.uPush = push;
      sh.vertexShader = 'uniform float uTime; uniform vec3 uPush;\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          float hh = position.y * position.y, H = length(instanceMatrix[1].xyz);
          vec3 ip = instanceMatrix[3].xyz;
          float gust = max(0., sin(dot(ip.xz, vec2(.05, .032)) - uTime * 1.5)); gust *= gust;
          float sway = sin(uTime * 2.2 + ip.x * .37 + ip.z * .29) * .1 + sin(uTime * 3.7 + ip.z * .6) * .04 + gust * .6 + .12;
          mvPosition.xz += normalize(vec2(1., .55)) * sway * hh * min(H, 22.) * .3;
          vec2 dp = mvPosition.xz - uPush.xz; float pr = smoothstep(2.6, .3, length(dp)) * step(abs(uPush.y - ip.y), 6.);
          mvPosition.xz += normalize(dp + 1e-4) * pr * hh * 2.2; mvPosition.y -= pr * hh * 1.1;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
    };
    const place = (n, mode, minH, maxH, collide, minW, maxW) => {
      const tint = new T.Color(), im = new T.InstancedMesh(bladeGeo, mat, n), m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), e = new T.Euler();
      let k = 0, tries = 0;
      while (k < n && tries < n * 10) {
        tries++;
        let x, z;
        if (mode === 'in') { x = (rng() * 2 - 1) * this.half; z = (rng() * 2 - 1) * this.half; const dens = smoothstep(-.15, .35, NOISE.fbm(x / 28, z / 28, 3)); if (rng() > dens || clear(x, z)) continue; }
        else if (mode === 'cover') { x = (rng() * 2 - 1) * this.half; z = (rng() * 2 - 1) * this.half; if (rng() > .25 + smoothstep(-.3, .3, NOISE.fbm(x / 20 + 4, z / 20, 3)) || this.objTop(x, z) > this.floorAt(x, z)) continue; }
        else { x = (rng() * 2 - 1) * (this.half + 70); z = (rng() * 2 - 1) * (this.half + 70); if (Math.max(Math.abs(x), Math.abs(z)) < this.half - 6) continue; }
        const hh = minH + rng() * (maxH - minH), ww = minW + rng() * (maxW - minW);
        e.set((rng() - .5) * .3, rng() * 6.28, (rng() - .5) * .3); q.setFromEuler(e); s.set(ww, hh, hh * .5);
        p.set(x, (mode === 'out' ? this.floorAt(clamp(x, -this.half, this.half), clamp(z, -this.half, this.half)) : this.floorAt(x, z)) - .15, z);
        m.compose(p, q, s); im.setColorAt(k, tint.setRGB(.78 + rng() * .4, .82 + rng() * .32, .66 + rng() * .3)); im.setMatrixAt(k++, m);
        if (collide) this.addCol(x, z, .14 * ww + .06, p.y + hh * .8).grass = true;
      }
      im.count = k; return im;
    };
    const near = place(count, 'in', 6, 20, true, .8, 1.9); near.castShadow = true; near.receiveShadow = true; this.group.add(near);
    const cover = place(G.qual === 0 ? 3000 : 9000, 'cover', .9, 3.4, false, .3, .7); cover.receiveShadow = true; this.group.add(cover);
    this.group.add(place(1400, 'out', 22, 50, false, .8, 1.9));
    // trèfles éparpillés
    const cg = natGeo('clover');
    if (cg) {
      const im = new T.InstancedMesh(cg, natMat('veg'), 260), m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sv = new T.Vector3(), p = new T.Vector3(); let k = 0;
      for (let i = 0; i < 1500 && k < 260; i++) {
        const x = (rng() * 2 - 1) * this.half, z = (rng() * 2 - 1) * this.half; if (NOISE.fbm(x / 15 + 9, z / 15, 2) < .1 || clear(x, z) || this.objTop(x, z) > this.floorAt(x, z)) continue;
        const sc = 2.5 + rng() * 3; e.set(0, rng() * 6.28, 0); q.setFromEuler(e); sv.set(sc, sc, sc); p.set(x, this.floorAt(x, z) - .1, z); m.compose(p, q, sv); im.setMatrixAt(k++, m);
      }
      im.count = k; im.castShadow = true; im.receiveShadow = true; this.group.add(im);
    }
  }
  update(t) {
    if (this.windU) this.windU.value = t;
    if (this.pushU) this.pushU.value.copy(P.pos);
    for (const f of this.flowers) { const g = Math.max(0, Math.sin(t * 1.5 - f.ph * .1)); f.lean.rotation.z = f.z0 + Math.sin(t * 1.1 + f.ph) * .025 + g * g * .05; f.lean.rotation.x = f.x0 + Math.sin(t * .9 + f.ph * 2) * .02; }
  }

  rockGeo(seed) {
    const g = new T.IcosahedronGeometry(1, 3), p = g.attributes.position, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 1 + NOISE.fbm(v.x * 1.4 + seed * 3.1, v.z * 1.4 + v.y * 1.7, 4) * .45;
      v.multiplyScalar(k); v.y *= .62; p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  leafGeo() {
    const sh = new T.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(.55, .15, .6, .7, 0, 1); sh.bezierCurveTo(-.6, .7, -.55, .15, 0, 0);
    const g = new T.ShapeGeometry(sh, 14), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      uv.setXY(i, x + .5, y);
      p.setXYZ(i, x, x * x * .9 + Math.sin(y * Math.PI) * .04, y - .5);
    }
    g.computeVertexNormals(); return g;
  }
  mushroom(x, z, r, hgt, cap) {
    const nm = natMesh(cap === '#9b5a2c' ? 'mush_brown' : 'mush_parasol', 'misc');
    if (nm) {
      const y = this.floorAt(x, z) - .15; nm.scale.setScalar(hgt); nm.position.set(x, y, z); nm.rotation.y = x * 7; this.group.add(nm); this.raster(nm);
      (this.mush || (this.mush = [])).push({ x, z, y0: y + hgt * .97, R: .38 * hgt, h: (cap === '#9b5a2c' ? .2 : .14) * hgt });
      return;
    }
    const y = this.floorAt(x, z), g = new T.Group();
    const st = new T.Mesh(new T.CylinderGeometry(r * .8, r, hgt, 14), new T.MeshStandardMaterial({ color: '#e6dcc6', roughness: .8 }));
    st.position.y = hgt / 2; st.castShadow = st.receiveShadow = true; g.add(st);
    const cp = new T.Mesh(new T.SphereGeometry(1, 28, 12, 0, 6.29, 0, Math.PI / 2), new T.MeshStandardMaterial({ color: cap, roughness: .55 }));
    cp.scale.set(r * 3.4, r * 1.7, r * 3.4); cp.position.y = hgt - .1; cp.castShadow = true; g.add(cp);
    const gill = new T.Mesh(new T.CircleGeometry(r * 3.35, 28), new T.MeshStandardMaterial({ color: '#d8c3a0', roughness: 1 }));
    gill.rotation.x = Math.PI / 2; gill.position.y = hgt - .1; g.add(gill);
    g.position.set(x, y - .2, z); this.group.add(g);
    this.addCol(x, z, r + .1, y + hgt);
    const y0 = y - .3 + hgt, R = r * 3.3, top = this.addCol(x, z, R, y0 + r * 1.7, y0 - .15);
    top.dome = { y0, h: r * 1.7, R }; top.cap = true;
    (this.mush || (this.mush = [])).push({ x, z, y0, R, h: r * 1.7 });
  }
  flower(x, z, hgt, k) {
    const y = this.floorAt(x, z), g = new T.Group();
    const lean = new T.Group(); lean.rotation.z = (k - .5) * .18; lean.rotation.x = .08; g.add(lean);
    const nm = natMesh(k < .7 ? 'dandelion' : 'puffball', 'veg');
    if (nm) {
      nm.scale.setScalar(hgt); nm.rotation.y = k * 20; lean.add(nm);
      g.position.set(x, y - .2, z); this.group.add(g); g.updateMatrixWorld(true); this.raster(nm);
      this.flowers.push({ lean, z0: lean.rotation.z, x0: lean.rotation.x, ph: k * 9 });
      return;
    }
    const st = new T.Mesh(new T.CylinderGeometry(.18, .28, hgt, 8), new T.MeshStandardMaterial({ color: '#4c7a22', roughness: .7 }));
    st.position.y = hgt / 2; st.castShadow = true; lean.add(st);
    const head = new T.Group(); head.position.y = hgt; head.rotation.x = -.5; lean.add(head);
    const yellow = k < .5;
    const disc = new T.Mesh(new T.CylinderGeometry(1.1, .9, .45, 20), new T.MeshStandardMaterial({ color: yellow ? '#d98f05' : '#e0b21a', roughness: .8 }));
    head.add(disc);
    const pm = new T.MeshStandardMaterial({ color: yellow ? '#ffd23a' : '#fbf7ea', roughness: .6, side: T.DoubleSide });
    for (let i = 0; i < 16; i++) { const p = new T.Mesh(ANT.sph, pm), a = i / 16 * 6.283; p.scale.set(.42, .06, 1.5); p.position.set(Math.sin(a) * 2, 0, Math.cos(a) * 2); p.rotation.y = a; p.castShadow = true; head.add(p); }
    g.position.set(x, y - .2, z); this.group.add(g);
    this.addCol(x, z, .35, y + hgt);
    this.flowers.push({ lean, z0: lean.rotation.z, x0: lean.rotation.x, ph: k * 9 });
  }
  twig(x, z, len, r, rot) {
    const nm = natMesh('twig_' + (len > 18 ? 1 : 0), 'wood');
    if (nm) {
      nm.scale.setScalar(len); nm.rotation.y = rot; nm.position.set(x - Math.sin(rot) * len / 2, this.floorAt(x, z) - .12, z - Math.cos(rot) * len / 2);
      this.group.add(nm); this.raster(nm); return;
    }
    const g = new T.Mesh(new T.CylinderGeometry(r * .8, r, len, 10), new T.MeshStandardMaterial({ color: '#5a3e22', map: TEX.rock, roughness: .95 }));
    g.rotation.set(0, rot, Math.PI / 2, 'YXZ');
    const y = this.floorAt(x, z) + r * .7; g.position.set(x, y, z); g.castShadow = g.receiveShadow = true; this.group.add(g);
    this.raster(g);
  }
  anthill(m) {
    const y = this.floorAt(m.x, m.z);
    const hole = new T.Mesh(new T.CircleGeometry(2.6, 32), new T.MeshBasicMaterial({ color: '#030201' }));
    hole.rotation.x = -Math.PI / 2; hole.position.set(m.x, y + .08, m.z); this.group.add(hole);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#ff5a1f', transparent: true, opacity: .35, depthWrite: false, blending: T.AdditiveBlending }));
    glow.scale.set(7, 7, 1); glow.position.set(m.x, y + 1.2, m.z); this.group.add(glow);
    const rim = natMesh('nest_rim', 'misc'); if (rim) { rim.scale.setScalar(2.7); rim.position.set(m.x, y - .1, m.z); this.group.add(rim); this.raster(rim); }
    // granules rouges du dôme
    const rg = this.rockGeo(99), im = new T.InstancedMesh(rg, new T.MeshStandardMaterial({ color: '#8a4a2c', roughness: .9 }), 420);
    const mt = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3(), r = mkRng(5);
    for (let i = 0; i < 420; i++) {
      const a = r() * 6.28, d = 3 + Math.pow(r(), .7) * m.r * 1.05, x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d, k = .15 + r() * .5;
      e.set(r() * 3, r() * 6, r() * 3); q.setFromEuler(e); s.set(k, k, k); p.set(x, this.floorAt(x, z), z); mt.compose(p, q, s); im.setMatrixAt(i, mt);
    }
    im.castShadow = im.receiveShadow = true; this.group.add(im);
  }

  // --- décor des galeries
  decorCave(rng) {
    const L = this.L, g = this.group;
    const openSpot = (cx, cz, rad) => { for (let k = 0; k < 20; k++) { const a = rng() * 6.28, d = rng() * rad, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (this.wAt(x, z) < .55) return [x, z]; } return [cx, cz]; };
    // champignons lumineux
    const lights = [];
    for (const f of L.fungus || EMPTY) {
      const col = new T.Color(f.color || '#6dffd6');
      const capM = new T.MeshStandardMaterial({ color: col.clone().multiplyScalar(.35), emissive: col, emissiveIntensity: .5, roughness: .4 });
      const stM = new T.MeshStandardMaterial({ color: '#8a7f70', emissive: col, emissiveIntensity: .12, roughness: .7 });
      const fg = natGeo('fungus');
      if (fg) {
        const fm = new T.MeshStandardMaterial({ vertexColors: true, color: col.clone().lerp(new T.Color('#ffffff'), .3), emissive: col, emissiveIntensity: .55, roughness: .4 });
        for (let i = 0; i < Math.ceil((f.n || 10) / 3); i++) { const [x, z] = openSpot(f.x, f.z, f.r || 4), m = new T.Mesh(fg, fm), k = .9 + rng() * 1.3; m.scale.setScalar(k); m.position.set(x, this.floorAt(x, z) - .05, z); m.rotation.y = rng() * 6.28; g.add(m); }
      }
      for (let i = 0; i < (fg ? 0 : (f.n || 10)); i++) {
        const [x, z] = openSpot(f.x, f.z, f.r || 4), y = this.floorAt(x, z), h = .3 + rng() * 1.1, r = .15 + rng() * .5;
        const st = new T.Mesh(limbGeo(h, .05 + r * .15), stM); st.rotation.z = Math.PI / 2 + (rng() - .5) * .4; st.position.set(x, y, z); g.add(st);
        const cp = new T.Mesh(ANT.sph, capM); cp.scale.set(r, r * .45, r); cp.position.set(x, y + h, z); g.add(cp);
      }
      const sp = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: col, transparent: true, opacity: .5, depthWrite: false, blending: T.AdditiveBlending }));
      sp.scale.set(9, 9, 1); sp.position.set(f.x, this.floorAt(f.x, f.z) + 1.4, f.z); g.add(sp);
      if (f.light && lights.length < 6) { const l = new T.PointLight(col, 1.7, 20, 1.6); l.position.set(f.x, this.floorAt(f.x, f.z) + 2.2, f.z); g.add(l); lights.push(l); }
    }
    // racines suspendues
    const rootM = new T.MeshStandardMaterial({ color: '#5a3b22', roughness: .9 });
    for (let i = 0; i < (L.roots || 60); i++) {
      const s = L.shapes[Math.floor(rng() * L.shapes.length)];
      const [x, z] = s.b ? openSpot(lerp(s.a[0], s.b[0], rng()), lerp(s.a[1], s.b[1], rng()), s.r * .6) : openSpot(s.x, s.z, s.r * .8);
      const c = this.ceilAt(x, z), f = this.floorAt(x, z), len = Math.min(c - f - 1.6, 1 + rng() * 4); if (len < .6) continue;
      const nr = natMesh('root_' + (i % 3), 'wood');
      if (nr) { nr.scale.set(len * .9, len, len * .9); nr.position.set(x, c + .25, z); nr.rotation.y = rng() * 6.28; nr.castShadow = false; g.add(nr); continue; }
      const m = new T.Mesh(new T.CylinderGeometry(.02, .05 + rng() * .1, len, 6), rootM);
      m.position.set(x, c - len / 2 + .2, z); m.rotation.set((rng() - .5) * .3, 0, (rng() - .5) * .3); g.add(m);
    }
    // arches de racines à l'entrée des tunnels (là où un tunnel quitte une chambre)
    if (natGeo('arch')) for (const t of L.shapes) {
      if (!t.b) continue;
      for (const [p, q] of [[t.a, t.b], [t.b, t.a]]) {
        const room = L.shapes.find(r => !r.b && Math.hypot(r.x - p[0], r.z - p[1]) < .5); if (!room) continue;
        const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz), d = room.r - .8; if (l < d + 2) continue;
        const x = p[0] + dx / l * d, z = p[1] + dz / l * d, m = natMesh('arch', 'wood');
        m.scale.setScalar(t.r * 2.3); m.position.set(x, this.floorAt(x, z) - .1, z); m.rotation.y = Math.atan2(dx, dz) + Math.PI / 2; g.add(m); this.raster(m);
      }
    }
    // cailloux
    const rgeo = this.rockGeo(3 + (L.seed || 1)), rmat = new T.MeshStandardMaterial({ color: '#6c5a48', map: TEX.rock, normalMap: TEX.rockN, roughness: .9 });
    for (let i = 0; i < (L.rockCount || 30); i++) {
      const s = L.shapes[Math.floor(rng() * L.shapes.length)];
      const [x, z] = s.b ? openSpot(lerp(s.a[0], s.b[0], rng()), lerp(s.a[1], s.b[1], rng()), s.r * .5) : openSpot(s.x, s.z, s.r * .85);
      const k = .3 + rng() * (s.b ? .5 : 1.3), y = this.floorAt(x, z);
      const m = natMesh('rock_' + (i % 5), 'cave') || new T.Mesh(rgeo, rmat); m.scale.setScalar(k); m.position.set(x, y - k * .2, z); m.rotation.y = rng() * 6; g.add(m);
      this.raster(m);
    }
    // réserves de graines
    const seedM = [new T.MeshStandardMaterial({ color: '#c9a46a', roughness: .5 }), new T.MeshStandardMaterial({ color: '#a8783a', roughness: .45 })];
    for (const sd of L.seeds || EMPTY) for (let i = 0; i < sd.n; i++) {
      const [x, z] = openSpot(sd.x, sd.z, sd.r), k = .45 + rng() * .5;
      const m = natMesh('seed', 'soft') || new T.Mesh(ANT.sph, seedM[i % 2]); if (m.geometry === ANT.sph) m.scale.set(k * 1.2, k * .7, k * .8); else m.scale.setScalar(k * 1.1); m.position.set(x, this.floorAt(x, z) + k * .5, z); m.rotation.y = rng() * 6; g.add(m);
    }
    // œufs et larves (nurserie)
    const eggM = new T.MeshPhysicalMaterial({ color: '#f3ead2', roughness: .35, clearcoat: .6, transmission: 0 });
    for (const nu of L.nursery || EMPTY) for (let i = 0; i < nu.n; i++) {
      const [x, z] = openSpot(nu.x, nu.z, nu.r), y = this.floorAt(x, z);
      const ne = natMesh(i % 3 ? 'egg' : 'larva', 'soft'); if (ne) { ne.scale.setScalar(i % 3 ? .3 : .55); ne.position.set(x, y + (i % 3 ? .18 : .12), z); ne.rotation.y = rng() * 6; g.add(ne); continue; }
      if (i % 3) { const m = new T.Mesh(ANT.sph, eggM); m.scale.set(.22, .2, .32); m.position.set(x, y + .2, z); m.rotation.y = rng() * 6; g.add(m); }
      else { const m = new T.Mesh(new T.TorusGeometry(.4, .22, 10, 16, 4.2), eggM); m.position.set(x, y + .25, z); m.rotation.set(Math.PI / 2, 0, rng() * 6); g.add(m); }
    }
  }
}
