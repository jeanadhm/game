'use strict';
// Colonie Noire · monde ouvert infini : la carte est générée par morceaux (48 × 48) autour de la joueuse.
// Milieux : prairie, sous-bois de pins, zone de cailloux. Chaque colonie a sa fourmilière modélisée.
const CH = 48, CHN = 48, ORES = .25, ON = CH / ORES + 1;
class OpenWorld extends World {
  constructor(scene, seed) {
    super(scene);
    this.seed = seed; this.cave = false; this.half = 1e7; this.chunks = new Map(); this.queue = [];
    this.root = new T.Group(); scene.add(this.root); this.group = this.root;
    this.hash = new Map(); this.climb = new Map(); this.flowers = []; this.food = []; this.mush = []; this.highSpots = [];
    this.L = { type: 'surface', seed }; this.floor = true;
    this.nn = 96; this.navX = 0; this.navZ = 0; this.walk = new Uint8Array(96 * 96); this.dist = new Float32Array(96 * 96); this.q = new Int32Array(96 * 96);
    const soil = TEX.soil.clone(); soil.needsUpdate = true; soil.repeat.set(CH / 7, CH / 7);
    const soilN = TEX.soilN.clone(); soilN.needsUpdate = true; soilN.repeat.copy(soil.repeat);
    this.groundMat = new T.MeshStandardMaterial({ map: soil, normalMap: soilN, normalScale: new T.Vector2(1.1, 1.1), vertexColors: true, roughness: .95 });
    this.makeGrass();
  }
  // --- relief : fonction continue (aucune limite de carte)
  biome(x, z) {
    return { pine: smoothstep(.12, .32, NOISE.fbm(x / 230 + 40, z / 230, 3)), rock: smoothstep(.18, .38, NOISE.fbm(x / 160 - 30, z / 160 + 11, 3)) };
  }
  floorAt(x, z) {
    let f = NOISE.fbm(x / 45 + 3.7, z / 45, 4) * 5 + NOISE.fbm(x / 8, z / 8, 2) * .5;
    const b = this.biome(x, z); if (b.rock > 0) f += NOISE.fbm(x / 14, z / 14, 3) * 3 * b.rock;
    for (const n of COL.nests) {
      const dx = x - n.x, dz = z - n.z; if (dx > n.r || dx < -n.r || dz > n.r || dz < -n.r) continue;
      const d = Math.hypot(dx, dz); if (d >= n.r) continue;
      f += n.h * Math.pow(1 - d / n.r, 1.2); if (d < n.r * .18) f -= n.h * .35 * Math.sqrt(1 - d / (n.r * .18));
    }
    return f;
  }
  ceilAt() { return 1e9; }
  wAt() { return 0; }
  solidPt(x, y, z) { return y < this.floorAt(x, z); }
  nearNest(x, z, m) { for (const n of COL.nests) if (Math.hypot(x - n.x, z - n.z) < n.r + m) return n; return null; }
  key(cx, cz) { return cx * 100003 + cz; }
  chunkAt(x, z) { return this.chunks.get(this.key(Math.floor(x / CH), Math.floor(z / CH))); }

  // --- grilles d'objets solides, une par morceau
  objTop(x, z) { const c = this.chunkAt(x, z); return c && c.otop ? this.cSamp(c, c.otop, x, z, -1e9) : -1e9; }
  objBot(x, z) { const c = this.chunkAt(x, z); return c && c.obot ? this.cSamp(c, c.obot, x, z, 1e9) : 1e9; }
  cSamp(c, A, x, z, empty) {
    const fx = (x - c.x0) / ORES, fz = (z - c.z0) / ORES, i0 = Math.floor(fx), r0 = Math.floor(fz);
    if (i0 < 0 || r0 < 0 || i0 >= ON - 1 || r0 >= ON - 1) return empty;
    const u = fx - i0, v = fz - r0, i = r0 * ON + i0, a = A[i], b = A[i + 1], d = A[i + ON], e = A[i + ON + 1];
    if (a === empty || b === empty || d === empty || e === empty) return v < .5 ? (u < .5 ? a : b) : (u < .5 ? d : e);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + d * (1 - u) * v + e * u * v;
  }
  raster(mesh) {
    const c = this.cur; if (!c) return;
    mesh.updateMatrixWorld(true); this.addClimb(mesh);
    if (!c.otop) { c.otop = new Float32Array(ON * ON).fill(-1e9); c.obot = new Float32Array(ON * ON).fill(1e9); }
    const g = mesh.geometry, pa = g.attributes.position, ix = g.index, M = mesh.matrixWorld;
    const vs = []; for (let i = 0; i < pa.count; i++) vs.push(new T.Vector3().fromBufferAttribute(pa, i).applyMatrix4(M));
    const cnt = ix ? ix.count : pa.count, I = k => ix ? ix.getX(k) : k;
    for (let k = 0; k < cnt; k += 3) {
      const a = vs[I(k)], b = vs[I(k + 1)], d = vs[I(k + 2)];
      const det = (b.z - d.z) * (a.x - d.x) + (d.x - b.x) * (a.z - d.z); if (Math.abs(det) < 1e-9) continue;
      const c0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, d.x) - c.x0) / ORES)), c1 = Math.min(ON - 1, Math.floor((Math.max(a.x, b.x, d.x) - c.x0) / ORES));
      const r0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, d.z) - c.z0) / ORES)), r1 = Math.min(ON - 1, Math.floor((Math.max(a.z, b.z, d.z) - c.z0) / ORES));
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
        const x = c.x0 + cc * ORES, z = c.z0 + rr * ORES;
        const l1 = ((b.z - d.z) * (x - d.x) + (d.x - b.x) * (z - d.z)) / det, l2 = ((d.z - a.z) * (x - d.x) + (a.x - d.x) * (z - d.z)) / det, l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        const y = l1 * a.y + l2 * b.y + l3 * d.y, i = rr * ON + cc;
        if (y > c.otop[i]) c.otop[i] = y; if (y < c.obot[i]) c.obot[i] = y;
      }
    }
  }
  addCol(x, z, r, top, bot = -1e9) { const c = { x, z, r, top, bot }; if (this.cur) this.cur.cols.push(c); this.hashCol(c); return c; }
  hashCol(c) {
    const k = 4, m = c.r + 2;
    for (let a = Math.floor((c.x - m) / k); a <= Math.floor((c.x + m) / k); a++)
      for (let b = Math.floor((c.z - m) / k); b <= Math.floor((c.z + m) / k); b++) { const key = a * 10007 + b; let l = this.hash.get(key); if (!l) this.hash.set(key, l = []); l.push(c); }
  }
  addClimb(mesh) { if (this.cur) this.cur.climbs.push(mesh); super.addClimb(mesh); }
  reindex() {
    this.hash = new Map(); this.climb = new Map(); const keep = this.cur; this.cur = null;
    for (const c of this.chunks.values()) { for (const k of c.cols) this.hashCol(k); for (const m of c.climbs) super.addClimb(m); }
    this.cur = keep;
  }

  // --- navigation : grille locale de 96 × 96 autour de la cible
  flow(tx, tz) {
    this.navX = Math.floor(tx) - 48; this.navZ = Math.floor(tz) - 48;
    for (let r = 0; r < 96; r++) for (let c = 0; c < 96; c++) {
      const x = this.navX + c + .5, z = this.navZ + r + .5, f = this.floorAt(x, z);
      let ok = this.objTop(x, z) - f <= .8;
      if (ok) for (const k of this.near(x, z)) if (k.r > .15 && Math.hypot(x - k.x, z - k.z) < k.r + .3 && k.top - f > .7) { ok = false; break; }
      this.walk[r * 96 + c] = ok ? 1 : 0;
    }
    super.flow(tx, tz);
  }
  cellOf(x, z) { return [clamp(Math.floor(x - this.navX), 0, 95), clamp(Math.floor(z - this.navZ), 0, 95)]; }
  nextStep(x, z) {
    if (x < this.navX || z < this.navZ || x >= this.navX + 96 || z >= this.navZ + 96) return null;
    const [c, r] = this.cellOf(x, z), D = this.dist, W = this.walk;
    let best = D[r * 96 + c], bc = -1, br = -1;
    for (let k = 0; k < 8; k++) {
      const cc = c + DX8[k], rr = r + DZ8[k]; if (cc < 0 || rr < 0 || cc >= 96 || rr >= 96) continue;
      if (k >= 4 && (!W[r * 96 + cc] || !W[rr * 96 + c])) continue;
      const d = D[rr * 96 + cc]; if (d < best) { best = d; bc = cc; br = rr; }
    }
    return bc < 0 ? null : [bc + this.navX + .5, br + this.navZ + .5];
  }

  // --- herbe partagée par tous les morceaux (vent et herbe qui s'écarte)
  makeGrass() {
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
    this.grassMat = mat; this.grassGeo = natGeo('grass');
  }

  // --- génération d'un morceau
  gen(cx, cz) {
    const ch = { cx, cz, x0: cx * CH, z0: cz * CH, group: new T.Group(), cols: [], climbs: [], food: [], flowers: [], mush: [], otop: null, obot: null };
    this.cur = ch; this.group = ch.group; this.chunks.set(this.key(cx, cz), ch);
    const rng = mkRng(((cx * 92837111) ^ (cz * 689287499) ^ (this.seed * 1013)) >>> 0), x0 = ch.x0, z0 = ch.z0;
    const fl0 = this.flowers.length, mu0 = this.mush.length;
    const b = this.biome(x0 + CH / 2, z0 + CH / 2);
    const R = (m = 6) => [x0 + m + rng() * (CH - 2 * m), z0 + m + rng() * (CH - 2 * m)];
    const free = (x, z, m) => !this.nearNest(x, z, m);
    // fourmilières dont le centre est dans ce morceau
    for (const n of COL.nests) {
      if (n.x < x0 || n.x >= x0 + CH || n.z < z0 || n.z >= z0 + CH) continue;
      const dome = natMesh('anthill', 'misc');
      if (dome) {
        dome.material = natMat('misc').clone(); dome.material.color.set(n.player ? '#6b5a4e' : n.alive ? n.species.color : '#3a3430').lerp(new T.Color('#ffffff'), n.player ? 0 : .55);
        const rr = n.r * 1.08; dome.scale.set(rr, n.h / .42 * 1.02, rr); dome.position.set(n.x, this.floorAt(n.x + n.r * 1.15, n.z) - .3, n.z); ch.group.add(dome); this.raster(dome);
      }
      const y = this.floorAt(n.x, n.z);
      const hole = new T.Mesh(new T.CircleGeometry(2.6, 32), new T.MeshBasicMaterial({ color: '#030201' })); hole.rotation.x = -Math.PI / 2; hole.position.set(n.x, y + .08, n.z); ch.group.add(hole);
      const glow = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: n.player ? '#a6ff3d' : n.species.color, transparent: true, opacity: .4, depthWrite: false, blending: T.AdditiveBlending }));
      glow.scale.set(7, 7, 1); glow.position.set(n.x, y + 1.4, n.z); ch.group.add(glow); n.glow = glow;
    }
    // cailloux
    const nr = Math.round(1 + b.rock * 7 + rng() * 2);
    for (let i = 0; i < nr; i++) {
      const s = 1.3 + Math.pow(rng(), 2) * (4 + b.rock * 5), [x, z] = R(Math.max(6, s + 1)); if (!free(x, z, s + 3)) continue;
      const m = natMesh('rock_' + Math.floor(rng() * 5), 'rock'); if (!m) break;
      m.scale.setScalar(s); m.position.set(x, this.floorAt(x, z) - s * .2, z); m.rotation.y = rng() * 6.28; ch.group.add(m); this.raster(m);
    }
    // feuilles, brindilles, champignons, fleurs
    for (let i = 0; i < 1 + Math.round(b.pine * 3 + rng()); i++) { const s = 7 + rng() * 7, [x, z] = R(s * .6 + 1); if (free(x, z, 6)) this.placeLeaf(null, x, z, this.floorAt(x, z) + .06, rng() * 6.28, 0, s, '#888', b.pine > .4 || rng() < .4); }
    for (let i = 0; i < Math.round(b.pine * 5 + rng() * 1.3); i++) { const len = 9 + rng() * 5, [x, z] = R(len * .55 + 1); if (free(x, z, 6)) this.twig(x, z, len, .5, rng() * Math.PI); }
    if (rng() < .3 + b.pine * .5) { const [x, z] = R(10); if (free(x, z, 8)) this.mushroom(x, z, .6, 3 + rng() * 5, rng() < .5 ? '#9b5a2c' : '#cdb48a'); }
    for (let i = 0; i < Math.round((1 - b.pine) * (1 - b.rock) * 2.2 * rng()); i++) { const [x, z] = R(5); if (free(x, z, 4)) this.flower(x, z, 16 + rng() * 12, rng()); }
    // herbe : grandes tiges (avec collision) et tapis d'herbe courte
    const dens = (1 - b.pine * .8) * (1 - b.rock * .6);
    ch.group.add(this.chunkGrass(ch, rng, Math.round(420 * dens), 6, 20, true, .8, 1.9, b));
    ch.group.add(this.chunkGrass(ch, rng, Math.round((G.qual === 0 ? 400 : 1200) * (.4 + dens * .6)), .9, 3.4, false, .3, .7, b));
    // aiguilles de pin au sol
    if (b.pine > .2 && natGeo('twig_0')) {
      const n = Math.round(b.pine * 70), im = new T.InstancedMesh(natGeo('twig_0'), natMat('wood'), n), m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
      for (let i = 0; i < n; i++) { const [x, z] = R(2), L = 2.5 + rng() * 2.5; e.set(0, rng() * 6.28, 0); q.setFromEuler(e); s.set(L * .35, L * .35, L); p.set(x, this.floorAt(x, z) - .02, z); m.compose(p, q, s); im.setMatrixAt(i, m); }
      im.receiveShadow = true; ch.group.add(im);
    }
    // nourriture : tas de graines, scarabée mort, gouttes de miellat
    const foods = [];
    if (rng() < .75) foods.push(['seed', 2 + Math.floor(rng() * 3)]);
    if (rng() < .18) foods.push(['beetle', 1]);
    if (rng() < .35) foods.push(['honey', 1]);
    for (const [type, k] of foods) {
      const [cx0, cz0] = R(8); if (!free(cx0, cz0, 6)) continue;
      for (let i = 0; i < k; i++) {
        const x = cx0 + (rng() - .5) * 3, z = cz0 + (rng() - .5) * 3;
        this.addFood(ch, type, x, z, rng);
      }
    }
    this.bakeChunk(ch);
    ch.flowers = this.flowers.slice(fl0); ch.mush = this.mush.slice(mu0);
    this.scene.add(ch.group);
    this.cur = null; this.group = this.root;
  }
  addFood(ch, type, x, z, rng) {
    const g = new T.Group(); let m, value, heavy = false;
    if (type === 'seed') { m = natMesh('seed', 'soft'); if (m) m.scale.setScalar(.9); value = 3; }
    else if (type === 'beetle') { m = natMesh('beetle', 'misc'); if (m) m.scale.setScalar(2.2); value = 15; heavy = true; }
    else { m = new T.Mesh(ANT.sph, new T.MeshPhysicalMaterial({ color: '#ffb02a', emissive: '#7a3d00', roughness: .05, clearcoat: 1, transparent: true, opacity: .85 })); m.scale.set(.32, .38, .32); value = 6; }
    if (!m) return;
    g.add(m); g.rotation.y = rng() * 6.28; g.position.set(x, this.floorAt(x, z) + (type === 'honey' ? .35 : .05), z); ch.group.add(g);
    const f = { type, value, heavy, x, z, g, m, taken: false, ch }; ch.food.push(f); this.food.push(f);
  }
  chunkGrass(ch, rng, n, minH, maxH, collide, minW, maxW, b) {
    const im = new T.InstancedMesh(this.grassGeo, this.grassMat, Math.max(1, n)), m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), e = new T.Euler(), tint = new T.Color();
    let k = 0;
    for (let t = 0; t < n * 4 && k < n; t++) {
      const x = ch.x0 + rng() * CH, z = ch.z0 + rng() * CH;
      if (collide && rng() > smoothstep(-.15, .35, NOISE.fbm(x / 28, z / 28, 3))) continue;
      if (this.nearNest(x, z, 2) || this.objTop(x, z) > this.floorAt(x, z)) continue;
      const hh = minH + rng() * (maxH - minH), ww = minW + rng() * (maxW - minW);
      e.set((rng() - .5) * .3, rng() * 6.28, (rng() - .5) * .3); q.setFromEuler(e); s.set(ww, hh, hh * .5); p.set(x, this.floorAt(x, z) - .15, z);
      m.compose(p, q, s); im.setMatrixAt(k, m);
      im.setColorAt(k, tint.setRGB(.78 + rng() * .4 + b.pine * .3, .82 + rng() * .32 - b.pine * .15, .66 + rng() * .3));
      k++;
      if (collide) this.addCol(x, z, .14 * ww + .06, p.y + hh * .8).grass = true;
    }
    im.count = k; im.castShadow = collide; im.receiveShadow = true; return im;
  }
  bakeChunk(ch) {
    const geo = new T.PlaneGeometry(CH, CH, CHN, CHN); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, nrm = geo.attributes.normal, col = new Float32Array(pos.count * 3), e = .5;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ch.x0 + CH / 2, z = pos.getZ(i) + ch.z0 + CH / 2, f = this.floorAt(x, z);
      pos.setXYZ(i, x, f, z);
      const n = new T.Vector3(this.floorAt(x - e, z) - this.floorAt(x + e, z), 2 * e, this.floorAt(x, z - e) - this.floorAt(x, z + e)).normalize(); nrm.setXYZ(i, n.x, n.y, n.z);
      const b = this.biome(x, z), v = .8 + NOISE.fbm(x / 6, z / 6, 3) * .5, gp = NOISE.fbm(x / 20 + 9, z / 20, 2);
      let r = .24 * v, g = .17 * v, bl = .1 * v;
      if (gp > .05) { const k = smoothstep(.05, .3, gp) * .6 * (1 - b.pine); r = lerp(r, .13, k); g = lerp(g, .16, k); bl = lerp(bl, .06, k); }
      r = lerp(r, .22 * v, b.pine * .8); g = lerp(g, .11 * v, b.pine * .8); bl = lerp(bl, .06 * v, b.pine * .8);
      r = lerp(r, .2 * v, b.rock * .6); g = lerp(g, .19 * v, b.rock * .6); bl = lerp(bl, .17 * v, b.rock * .6);
      const nn = this.nearNest(x, z, 4); if (nn) { const k = smoothstep(nn.r + 4, nn.r * .6, Math.hypot(x - nn.x, z - nn.z)); r = lerp(r, (nn.player ? .16 : .32) * v, k); g = lerp(g, (nn.player ? .12 : .15) * v, k); bl = lerp(bl, (nn.player ? .1 : .08) * v, k); }
      let occ = 0; for (const [ox, oz] of [[0, 0], [.8, 0], [-.8, 0], [0, .8], [0, -.8]]) if (this.objTop(x + ox, z + oz) > f + .25) occ++;
      const k = 1 - Math.min(.45, occ * .08);
      col[i * 3] = r * k; col[i * 3 + 1] = g * k; col[i * 3 + 2] = bl * k;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3)); geo.computeBoundingSphere();
    const m = new T.Mesh(geo, this.groundMat); m.receiveShadow = true; ch.group.add(m);
  }
  unload(ch) {
    this.scene.remove(ch.group);
    ch.group.traverse(o => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
    this.chunks.delete(this.key(ch.cx, ch.cz));
    this.food = this.food.filter(f => f.ch !== ch);
    const fs = new Set(ch.flowers), ms = new Set(ch.mush); this.flowers = this.flowers.filter(f => !fs.has(f)); this.mush = this.mush.filter(m => !ms.has(m));
  }
  stream(force) {
    const cx = Math.floor(P.pos.x / CH), cz = Math.floor(P.pos.z / CH), R = 2;
    let changed = false;
    for (const ch of [...this.chunks.values()]) if (Math.max(Math.abs(ch.cx - cx), Math.abs(ch.cz - cz)) > R + 1) { this.unload(ch); changed = true; }
    const need = [];
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) if (!this.chunks.has(this.key(cx + a, cz + b))) need.push([cx + a, cz + b, a * a + b * b]);
    need.sort((p, q) => p[2] - q[2]);
    for (const [x, z] of force ? need : need.slice(0, 1)) { this.gen(x, z); changed = true; }
    if (changed) this.reindex();
  }
  show(v) { for (const ch of this.chunks.values()) ch.group.visible = v; this.root.visible = v; }
  update(t) { super.update(t); }
  clear() { for (const ch of [...this.chunks.values()]) this.unload(ch); this.scene.remove(this.root); this.hash = new Map(); this.climb = new Map(); }
}
