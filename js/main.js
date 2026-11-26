'use strict';
// Colonie Noire · moteur de rendu, états du jeu (titre, histoire, jeu, pause, mort, fin) et boucle principale
const canvas = $('c');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.autoClear = false;
const scene = new T.Scene();
const cam = new T.PerspectiveCamera(74, 1, .04, 700);
makeTextures();

// ciel et éclairage
const SUN_DIR = new T.Vector3(.45, .55, .7).normalize();
const skyMat = new T.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, top: { value: new T.Color('#3f7fd0') }, mid: { value: new T.Color('#a9d3ee') }, bot: { value: new T.Color('#e9dcc0') }, sun: { value: SUN_DIR.clone() } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
  fragmentShader: `uniform vec3 top, mid, bot, sun; uniform float uTime; varying vec3 vD;
    float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
    float nn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(hh(i), hh(i + vec2(1., 0.)), f.x), mix(hh(i + vec2(0., 1.)), hh(i + vec2(1., 1.)), f.x), f.y); }
    float fb(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * nn(p); p *= 2.03; a *= .5; } return s; }
    void main(){ float y = vD.y; vec3 c = y > 0. ? mix(mid, top, pow(y, .6)) : mix(mid, bot, min(1., -y * 3.));
      if (y > 0.) { vec2 uv = vD.xz / (y + .12) * 1.4 + vec2(uTime * .012, uTime * .004); float cl = smoothstep(.52, .82, fb(uv)) * smoothstep(0., .3, y); c = mix(c, vec3(1., .98, .95) * (.82 + .18 * fb(uv * 2.7)), cl * .85); }
      float s = max(0., dot(vD, sun)); c += vec3(1., .85, .6) * (pow(s, 700.) * 5. + pow(s, 8.) * .28); gl_FragColor = linearToOutputTexel(vec4(c, 1.)); }`,
  side: T.BackSide, depthWrite: false, fog: false,
});
const sky = new T.Mesh(new T.SphereGeometry(500, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
// carte de reflets en cube (dégradé de ciel), sans PMREM pour rester compatible avec tous les GPU
function envFrom(top, mid, bot, sunOn) {
  const ct = new T.Color(top), cm = new T.Color(mid), cb = new T.Color(bot), N = 32, faces = [];
  const dirs = [(u, v) => [1, -v, -u], (u, v) => [-1, -v, u], (u, v) => [u, 1, v], (u, v) => [u, -1, -v], (u, v) => [u, -v, 1], (u, v) => [-u, -v, -1]];
  for (const f of dirs) {
    const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), id = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = f((x + .5) / N * 2 - 1, (y + .5) / N * 2 - 1), l = Math.hypot(...d), dy = d[1] / l;
      const col = dy > 0 ? cm.clone().lerp(ct, Math.pow(dy, .6)) : cm.clone().lerp(cb, Math.min(1, -dy * 3));
      if (sunOn) { const s = Math.max(0, (d[0] * SUN_DIR.x + d[1] * SUN_DIR.y + d[2] * SUN_DIR.z) / l); const k = Math.pow(s, 24) * 1.5; col.r += k; col.g += k * .9; col.b += k * .7; }
      const i = (y * N + x) * 4; id.data[i] = Math.min(255, col.r * 255); id.data[i + 1] = Math.min(255, col.g * 255); id.data[i + 2] = Math.min(255, col.b * 255); id.data[i + 3] = 255;
    }
    g.putImageData(id, 0, 0); faces.push(c);
  }
  const t = new T.CubeTexture(faces); t.encoding = T.LinearEncoding; t.needsUpdate = true; return t;
}
const ENV = { day: envFrom('#3f7fd0', '#a9d3ee', '#6b5a40', true), cave: envFrom('#4a3524', '#1c140d', '#0a0604', false) };
const hemi = new T.HemisphereLight('#cfe4ff', '#5e4a2e', .6); scene.add(hemi);
const sun = new T.DirectionalLight('#fff0d6', 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
{ const sc = sun.shadow.camera; sc.near = 1; sc.far = 220; sc.left = sc.bottom = -36; sc.right = sc.top = 36; }
sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; scene.add(sun, sun.target);
const lamp = new T.PointLight('#ffd7a0', 0, 24, 1.5); scene.add(lamp);

let world = new World(scene);
FX.init(scene); P.initVM(); POST.init();

const G = { state: 'boot', li: 0, L: null, lt: 0, time: 0, fired: new Set(), cool: {}, cocoons: 0, taken: [], cp: null, mode: 'story', chapterWorld: null, squad: 0, climb: 'assist', mouse: 'free', view: 'tps', cine: null, boss: null, queen: null, unlocked: 1, diff: 1, qual: ('ontouchstart' in window) ? 1 : 2, target: null, stats: {} };
const resetStats = () => { G.stats = { kills: 0, heads: 0, shots: 0, hits: 0, ahits: 0, time: 0, deaths: 0 }; };
resetStats();

function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
  cam.aspect = w / h; cam.updateProjectionMatrix(); VM.cam.aspect = w / h; VM.cam.updateProjectionMatrix();
  FX.setScale(h * renderer.getPixelRatio(), cam.fov); POST.resize(w, h, renderer.getPixelRatio());
}
function applyQuality() {
  const q = QUAL[G.qual];
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pr));
  const sh = q.shadow > 0;
  if (renderer.shadowMap.enabled !== sh || (sh && sun.shadow.mapSize.x !== q.shadow)) {
    renderer.shadowMap.enabled = sh;
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    if (sh) sun.shadow.mapSize.set(q.shadow, q.shadow);
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  }
  POST.on = q.bloom && !!POST.c; if (POST.bokeh) POST.bokeh.enabled = G.qual === 2;
  for (const b of document.querySelectorAll('.qual button')) b.classList.toggle('on', +b.dataset.q === G.qual);
  resize();
}
addEventListener('resize', resize); resize();

// ambiance : surface (ciel, soleil, brume) ou souterrain (noir, lampe, champignons lumineux)
function setEnv(cave) {
  sky.visible = !cave; scene.background = cave ? new T.Color('#030201') : null;
  scene.fog = cave ? new T.FogExp2('#0b0806', .04) : new T.FogExp2('#c4d6dc', G.mode === 'open' ? .0125 : .0105);
  sun.visible = !cave; hemi.color.set(cave ? '#6a5440' : '#cfe4ff'); hemi.groundColor.set(cave ? '#120c08' : '#5e4a2e'); hemi.intensity = cave ? .34 : .6;
  lamp.intensity = cave ? 1.6 : 0;
  scene.environment = cave ? ENV.cave : ENV.day; VM.scene.environment = scene.environment;
  renderer.toneMappingExposure = cave ? 1.2 : .95; POST.mood(cave);
}
function loadLevel(i, cp) {
  if (cp && cp.li !== i) cp = null;
  const L = LEVELS[i]; Object.assign(G, { li: i, L, lt: 0, fired: new Set(), cool: {}, cocoons: 0, taken: cp ? cp.taken.slice() : [], boss: null, queen: null });
  if (!cp) G.cp = null;
  EN.clear(); PK.clear(); FX.clear(); ALLY.clear(); HUD.boss(null, null); HUD.clearSay(); HUD.prompt('');
  world.build(L);
  const cave = L.type === 'cave';
  setEnv(cave);
  for (const [t, x, z] of L.enemies) EN.spawn(t, x, z);
  for (const [t, x, z] of L.pickups || []) PK.spawn(t, x, z);
  if (!cave && world.highSpots) world.highSpots.slice(0, 5).forEach(h => PK.spawn('nectar', h.x, h.z));
  (L.cocoons || []).forEach(([x, z], idx) => { if (!G.taken.includes(idx)) PK.spawn('cocoon', x, z, { idx }); });
  G.cocoons = G.taken.length;
  if (L.setup) L.setup(L, G);
  P.spawn(cp ? { start: { x: cp.x, z: cp.z, yaw: cp.yaw } } : L);
  ALLY.spawnSquad();
  if (cp) {
    // reprise au point de sauvegarde : on ne rejoue pas les dialogues déjà vus
    L.events.forEach((ev, k) => {
      if (ev.on === 'cocoon') { for (let c = 1; c <= G.cocoons; c++) { const keep = G.cocoons; G.cocoons = c; if (!ev.when || ev.when(L, G)) G.fired.add(k); G.cocoons = keep; } }
      else if (!ev.on && (ev.at !== undefined || !ev.run || ev.cp)) G.fired.add(k);
    });
    for (const e of EN.list) if (Math.hypot(e.pos.x - cp.x, e.pos.z - cp.z) < 10) { e.pos.x += Math.sign(e.pos.x - cp.x || 1) * 12; e.home.copy(e.pos); }
  }
  world.flow(P.pos.x, P.pos.z);
  G.target = () => L.target(L, G);
  HUD.level(L.chapter, L.name); HUD.objective(L.objective(G));
  SFX.ambient(L.type);
}

// --- scripts de chapitre
function fireEv(k, ev, data) {
  if (ev.repeat) G.cool[k] = ev.repeat; else G.fired.add(k);
  if (ev.say) HUD.say(WHO[ev.say[0]], ev.say[1]);
  if (ev.run) ev.run(G, data);
}
G.checkpoint = () => { G.cp = { li: G.li, x: P.pos.x, z: P.pos.z, yaw: P.yaw, taken: G.taken.slice() }; HUD.notice('Point de sauvegarde', 1.8); };
G.event = (name, data) => {
  if (G.state !== 'play' || !G.L) return;
  G.L.events.forEach((ev, k) => { if (ev.on === name && !G.fired.has(k) && (!ev.when || ev.when(G.L, G, data))) fireEv(k, ev, data); });
};
function runEvents(dt) {
  G.L.events.forEach((ev, k) => {
    if (G.fired.has(k) || ev.on || G.state !== 'play') return;
    if (ev.repeat && G.cool[k] > 0) { G.cool[k] -= dt; return; }
    if (ev.at !== undefined ? G.lt >= ev.at : ev.when && ev.when(G.L, G)) fireEv(k, ev);
  });
}

// --- écrans
const screens = ['title', 'story', 'pause', 'dead', 'end', 'evolve'];
function show(id) { for (const s of screens) $(s).hidden = s !== id; document.body.classList.toggle('playing', !id); }
function save() { SAVE.save(); }
function chapterButtons() {
  $('chapters').innerHTML = LEVELS.map((L, i) => `<button class="chap" data-i="${i}" ${i >= G.unlocked ? 'disabled' : ''}><b>${L.chapter}</b><span>${i < G.unlocked ? L.name : 'Verrouillé'}</span></button>`).join('');
  for (const b of $('chapters').querySelectorAll('button')) b.onclick = () => { SFX.init(); resetStats(); P.reset(); story(+b.dataset.i); };
  for (const b of document.querySelectorAll('#diff button')) b.classList.toggle('on', +b.dataset.d === G.diff);
  for (const b of document.querySelectorAll('#squad button')) b.classList.toggle('on', +b.dataset.s === G.squad);
  for (const b of document.querySelectorAll('.climbSeg button')) b.classList.toggle('on', b.dataset.c === G.climb);
  for (const b of document.querySelectorAll('.mouseSeg button')) b.classList.toggle('on', b.dataset.m === G.mouse);
  for (const b of document.querySelectorAll('.viewSeg button')) b.classList.toggle('on', b.dataset.v === G.view);
  $('bView').textContent = (G.view === 'fps' ? 'Vue : 1re personne' : 'Vue : 3e personne') + (IN.touch ? '' : ' · T');
  document.body.classList.toggle('freemouse', G.mouse !== 'lock');
  $('bOpenCont').disabled = !OW.hasSave(); $('bRestart').hidden = false;
  $('nectTitle').textContent = UP.nectar ? `Nectar en réserve : ${UP.nectar}` : '';
}
function titleScreen() {
  G.state = 'title'; HUD.show(false); show('title'); chapterButtons();
  if (!G.L || G.li !== 0) loadLevel(0);
  SFX.ambient('surface');
}
function story(i) {
  G.state = 'story'; HUD.show(false); show('story');
  const L = LEVELS[i];
  $('sChap').textContent = L.chapter; $('sName').textContent = L.name;
  $('sText').innerHTML = ''; for (const t of L.story) { const p = document.createElement('p'); p.textContent = t; $('sText').append(p); }
  const b = $('bStart'); b.disabled = true; b.textContent = 'Chargement…';
  setTimeout(() => { loadLevel(i); b.disabled = false; b.textContent = 'Commencer'; b.focus(); }, 60);
}
// --- cinématiques : survol du chapitre à l'arrivée, présentation des grandes ennemies
function startCine() {
  const L = G.L; SFX.init(); HUD.lock();
  if (!L.cine) { play(); return; }
  const pt = a => new T.Vector3(a[0], world.floorAt(a[0], a[2]) + a[1], a[2]);
  G.cine = { t: 0, dur: L.cineDur || 9, pos: new T.CatmullRomCurve3(L.cine.map(c => pt(c))), look: new T.CatmullRomCurve3(L.cine.map(c => pt(c.slice(3)))), lines: L.cineText || [], end: play };
  G.state = 'cine'; show(null); HUD.show(false); $('cine').hidden = false; $('cineText').textContent = '';
}
G.cut = (target, title, line, dur = 3) => {
  if (G.state !== 'play') return;
  const s = target.d ? target.d.scale : 1, c = target.pos.clone(), r = 4 + s * 2, a0 = Math.atan2(cam.position.x - c.x, cam.position.z - c.z);
  const hy = world.cave ? 1.2 + s * .8 : 4 + s * 1.6;
  const pts = [0, .5, 1].map(k => { const a = a0 + k * .9; const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r; return new T.Vector3(x, Math.min(world.ceilAt(x, z) - .6, Math.max(world.floorAt(x, z), c.y) + hy), z); });
  const look = new T.Vector3(c.x, c.y + s * .5, c.z);
  G.cine = { t: 0, dur, pos: new T.CatmullRomCurve3(pts), look: new T.CatmullRomCurve3([look, look.clone()]), lines: [title + (line ? ' · ' + line : '')], end: () => { G.state = 'play'; HUD.show(true); } };
  G.state = 'cine'; HUD.show(false); $('cine').hidden = false; $('cineText').textContent = '';
};
function cineFrame(dt) {
  const c = G.cine; c.t += dt; const k = Math.min(1, c.t / c.dur);
  cam.position.copy(c.pos.getPoint(k)); cam.lookAt(c.look.getPoint(k));
  const line = c.lines[Math.min(c.lines.length - 1, Math.floor(k * c.lines.length))] || '';
  if ($('cineText').textContent !== line) $('cineText').textContent = line;
  if (k >= 1) endCine();
}
function endCine() { if (!G.cine) return; const e = G.cine.end; G.cine = null; $('cine').hidden = true; e(); }
addEventListener('keydown', e => { if (G.state === 'cine' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) endCine(); });
$('c').addEventListener('mousedown', () => { if (G.state === 'cine') endCine(); });
$('cine').addEventListener('pointerdown', () => { if (G.state === 'cine') endCine(); });
function play() {
  SFX.init(); G.state = 'play'; show(null); HUD.show(true); if (!IN.locked) HUD.lock();
  if (G.mouse !== 'lock' && !IN.touch && !G.mouseHint) { G.mouseHint = true; HUD.notice('Souris libre : bouge la souris pour regarder, pousse-la au bord pour tourner · Échap : pause', 3.5); }
}
G.pause = () => { if (G.state !== 'play') return; chapterButtons(); $('bRestart').hidden = G.mode === 'open'; G.state = 'pause'; IN.fire = false; IN.k = {}; show('pause'); HUD.show(false); if (document.pointerLockElement) document.exitPointerLock(); };
G.die = () => {
  if (G.mode === 'open') {
    // monde ouvert : on se réveille à la fourmilière, sans ce qu'on portait
    OW.dropCarry(); G.stats.deaths++; HUD.notice('Tu es tombée… les ouvrières te ramènent à la fourmilière', 3);
    COL.player.food = Math.max(0, COL.player.food - 10);
    setTimeout(() => { P.reset(); if (OW.mode === 'nest' && !OW.nestCol.player) OW.exitNest(); if (OW.mode === 'nest') P.spawn(world.L); else P.spawn({ start: { x: COL.player.x, z: COL.player.z + 22, yaw: 0 } }); P.dead = false; }, 1800);
    return;
  }
  G.state = 'dead'; G.stats.deaths++; IN.fire = false; HUD.show(false);
  setTimeout(() => { if (document.pointerLockElement) document.exitPointerLock(); show('dead'); $('bRetry').textContent = G.cp ? 'Reprendre au point de sauvegarde' : 'Réessayer le chapitre'; $('deadMsg').textContent = ['Les Rouges t\'ont submergée.', 'Ta chitine a cédé.', 'La colonie compte encore sur toi.'][G.stats.deaths % 3]; }, 900);
};
G.complete = () => {
  if (G.state !== 'play') return;
  G.state = 'done'; HUD.show(false); if (document.pointerLockElement) document.exitPointerLock();
  G.unlocked = Math.max(G.unlocked, Math.min(LEVELS.length, G.li + 2)); save();
  if (G.li + 1 < LEVELS.length) { const n = G.li + 1; evolveScreen(() => { P.reset(); story(n); }); }
  else {
    show('end'); $('eText').innerHTML = ''; for (const t of EPILOGUE) { const p = document.createElement('p'); p.textContent = t; $('eText').append(p); }
    const s = G.stats, m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
    const acc = s.shots ? Math.min(100, Math.round(s.ahits / s.shots * 100)) : 0;
    $('eStats').innerHTML = [['Temps', `${m} min ${String(sec).padStart(2, '0')}`], ['Fourmis rouges abattues', s.kills], ['Tirs à la tête', s.heads], ['Précision de l\'acide', acc + ' %'], ['Chutes', s.deaths]]
      .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }
};
$('bPlay').onclick = () => { SFX.init(); resetStats(); resetUpgrades(); SAVE.save(); P.reset(); story(0); };
for (const b of document.querySelectorAll('#diff button')) b.onclick = () => { G.diff = +b.dataset.d; SAVE.save(); chapterButtons(); };
for (const b of document.querySelectorAll('.qual button')) b.onclick = () => { G.qual = +b.dataset.q; SAVE.save(); applyQuality(); };
$('bStart').onclick = startCine;
for (const b of document.querySelectorAll('.viewSeg button')) b.onclick = () => { G.view = b.dataset.v; SAVE.save(); chapterButtons(); };
G.toggleView = () => { G.view = G.view === 'fps' ? 'tps' : 'fps'; SAVE.save(); chapterButtons(); HUD.notice(G.view === 'fps' ? 'Vue à la première personne' : 'Vue à la troisième personne', 1.4); };
$('bView').addEventListener('mousedown', e => e.stopPropagation());
$('bView').addEventListener('pointerdown', e => e.stopPropagation());
$('bView').onclick = e => { e.stopPropagation(); G.toggleView(); };
for (const b of document.querySelectorAll('.mouseSeg button')) b.onclick = () => { G.mouse = b.dataset.m; SAVE.save(); chapterButtons(); };
for (const b of document.querySelectorAll('.climbSeg button')) b.onclick = () => { G.climb = b.dataset.c; SAVE.save(); chapterButtons(); };
for (const b of document.querySelectorAll('#squad button')) b.onclick = () => { G.squad = +b.dataset.s; SAVE.save(); chapterButtons(); };
$('bResume').onclick = () => { G.state = 'play'; show(null); HUD.show(true); HUD.lock(); };
$('bRestart').onclick = () => { P.reset(); loadLevel(G.li); play(); };
$('bRetry').onclick = () => { P.reset(); loadLevel(G.li, G.cp); play(); };
for (const id of ['bMenu', 'bMenu2', 'bMenu3']) $(id).onclick = () => { if (G.mode === 'open') OW.stop(); G.L = null; titleScreen(); };
$('bOpenNew').onclick = () => { SFX.init(); show(null); OW.start(false); play(); };
$('bOpenCont').onclick = () => { SFX.init(); show(null); OW.start(true); play(); };
$('sens').oninput = e => { P.sens = +e.target.value; try { localStorage.setItem('cn-sens', e.target.value); } catch (er) {} };

// --- caméra du titre : travelling au ras du sol, entre les brins d'herbe
function titleCam() {
  const t = G.time * .045, cx = 0, cz = -26, r = 17;
  const x = cx + Math.sin(t) * r, z = cz + Math.cos(t) * r;
  cam.position.set(x, world.floorAt(x, z) + 2.4, z);
  const lx = cx + Math.sin(t + .5) * r * .45, lz = cz + Math.cos(t + .5) * r * .45;
  cam.lookAt(lx, world.floorAt(lx, lz) + 2.6, lz);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now; G.time += dt;
  if (G.state === 'play') {
    G.lt += dt; G.stats.time += dt;
    P.update(dt); if (G.mode === 'open') OW.update(dt); EN.update(dt, false); ALLY.update(dt); PK.update(dt); FX.update(dt); runEvents(dt);
    { const tg = G.target && G.target(); if (tg && Math.random() < dt * 10) { const ty = world.groundAt(tg.x, tg.z, (tg.y ?? 99) + 2); FX.glow.spawn(tg.x + rand(-.5, .5), ty + .2, tg.z + rand(-.5, .5), 0, rand(1.5, 3), 0, rand(1.5, 2.5), rand(.15, .3), FX.COL.spark, { a: .5 }); } }
    if (POST.bokeh && POST.on) { const d = new T.Vector3(); cam.getWorldDirection(d); const wb = world.rayBlock(cam.position, d, 60), h = EN.rayHit(cam.position, d, wb); POST.focus(h ? h.dist : wb, dt); }
    if (G.L.tick) G.L.tick(dt, G);
    if (G.state === 'play') HUD.objective(G.L.objective(G));
    HUD.update(dt); SFX.tick(dt); FX.motes(dt, world.cave);
  } else if (G.state === 'cine') {
    cineFrame(dt); EN.update(dt, true); ALLY.update(dt); FX.update(dt); HUD.update(dt);
    if (POST.bokeh) POST.focus(G.cine ? cam.position.distanceTo(G.cine.look.getPoint(1)) : 12, dt);
  } else if (G.state === 'title' || G.state === 'story') {
    if (G.state === 'title' && G.li === 0) titleCam();
    EN.update(dt, true); FX.update(dt); FX.motes(dt, world.cave); if (G.L && G.L.tick) G.L.tick(dt, G);
  } else if (G.state === 'dead' || G.state === 'done') { FX.update(dt); EN.update(dt, true); }
  if (world.floor) world.update(G.time);
  if (G.state === 'play' || G.state === 'pause' || G.state === 'colony' || G.state === 'map') P.syncModel(G.state === 'play' ? dt : 0); else if (P.model) P.model.root.visible = false;
  skyMat.uniforms.uTime.value = G.time;
  sun.target.position.set(Math.round(cam.position.x), 0, Math.round(cam.position.z));
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 100); sun.target.updateMatrixWorld();
  lamp.position.copy(cam.position); lamp.position.y += .3;
  sky.position.copy(cam.position);
  renderer.clear(); if (POST.on) POST.c.render(); else renderer.render(scene, cam);
  if ((G.state === 'play' || G.state === 'pause') && G.view === 'fps') { renderer.clearDepth(); renderer.render(VM.scene, VM.cam); }
}

// démarrage
function boot(d) {
  G.chapterWorld = world;
  SAVE.load();
  try { const s = localStorage.getItem('cn-sens'); if (s) { P.sens = +s; $('sens').value = s; } } catch (e) {}
  G.unlocked = clamp(Math.max(G.unlocked, (d && d.unlocked) || 1), 1, LEVELS.length);
  applyQuality(); HUD.nectar();
  ANT.load(() => { if (ANT.vm) P.useVMModel(); titleScreen(); requestAnimationFrame(frame); });
}
if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => ({ unlocked: G.unlocked }));
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot); else boot(window.claude && window.claude.hot && window.claude.hot.data || {});
