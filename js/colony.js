'use strict';
// Colonie Noire · monde ouvert : colonies (la tienne et les rivales), économie, reine, chambres,
// diplomatie, guerres entre colonies, raids, campagne et plan des fourmilières souterraines.
const SPECIES = [
  { id: 'rouges', name: 'Rouges', body: '#7a1a0a', gaster: '#2e0904', color: '#e0441f' },
  { id: 'fauves', name: 'Fauves', body: '#a8601e', gaster: '#5a2e0c', color: '#f2a93b' },
  { id: 'pales', name: 'Pâles', body: '#8e877c', gaster: '#57514a', color: '#d8d2c4' },
  { id: 'cuivrees', name: 'Cuivrées', body: '#7a4a22', gaster: '#3e2410', color: '#c8834a' },
  { id: 'emeraude', name: 'Émeraude', body: '#2c4430', gaster: '#16241a', color: '#5fd18a' },
  { id: 'dorees', name: 'Dorées', body: '#b08a2e', gaster: '#6a4e12', color: '#ffd166' },
];
const CHAMBERS = {
  grenier: { name: 'Grenier', desc: '+150 de réserve de nourriture', cost: 40 },
  nurserie: { name: 'Nurserie', desc: 'Les œufs éclosent deux fois plus vite', cost: 50 },
  caserne: { name: 'Caserne', desc: '+12 places et soldates plus robustes', cost: 60 },
  champignon: { name: 'Champignonnière', desc: 'Produit de la nourriture en continu', cost: 70 },
};
const CHAMBER_SLOTS = [[-28, -8], [28, -8], [-32, 20], [32, 20], [-16, 46], [16, 46], [-44, -26], [44, -26]];
const REGION = 192;

const COL = { list: [], nests: [], player: null, events: [], t: 0, raids: [], armies: [], q: 0, stats: { deposits: 0, fed: 0, dug: 0, beaten: 0 }, seed: 1 };
(() => {
  const rnd = (seed) => mkRng(seed);
  function make(o) {
    return Object.assign({ food: 60, workers: 14, soldiers: 6, scouts: 2, eggs: [], queenHp: 1400, queenMax: 1400, chambers: ['grenier'], rel: 0, status: 'neutre', aggr: .5, alive: true, known: false, wars: new Set(), raidT: 90 + Math.random() * 120, r: 18, h: 7, ratio: [.6, .3, .1] }, o);
  }
  COL.newGame = seed => {
    COL.seed = seed; COL.list = []; COL.nests = []; COL.events = []; COL.raids = []; COL.armies = []; COL.t = 0; COL.q = 0;
    COL.stats = { deposits: 0, fed: 0, dug: 0, beaten: 0 }; COL.regions = new Set();
    COL.player = make({ id: 'noire', name: 'Colonie Noire', species: { id: 'noire', name: 'Noires', body: '#141210', gaster: '#0b0a09', color: '#a6ff3d' }, x: 24, z: 24, r: 16, h: 6, food: 40, workers: 10, soldiers: 2, scouts: 0, rel: 100, status: 'joueuse', known: true, player: true, chambers: [] });
    COL.list.push(COL.player); COL.nests.push(COL.player);
    COL.ensure(0, 0);
  };
  // les colonies naissent avec le monde : une par région de 192 unités, au hasard mais toujours la même
  COL.region = (rx, rz) => {
    const key = rx + ',' + rz; if (COL.regions.has(key)) return; COL.regions.add(key);
    if (rx === 0 && rz === 0) return;
    const r = rnd((rx * 73856093) ^ (rz * 19349663) ^ COL.seed);
    const forced = rx === 1 && rz === 0;
    if (!forced && r() > .55) return;
    const ox = 1 + Math.floor(r() * 2), oz = 1 + Math.floor(r() * 2);
    const sp = forced ? SPECIES[0] : SPECIES[Math.floor(r() * SPECIES.length)];
    const dist = Math.hypot(rx, rz);
    const c = make({
      id: 'c' + rx + '_' + rz, name: sp.name + (() => { const k = COL.list.filter(o => o.species.id === sp.id).length; return k ? ' ' + ['du Nord', 'du Sud', 'de l\'Est', 'de l\'Ouest', 'des Pins', 'des Cailloux', 'du Ruisseau', 'des Racines'][(k - 1) % 8] + (k > 8 ? ' ' + k : '') : ''; })(),
      species: sp, x: rx * REGION + ox * CH + CH / 2, z: rz * REGION + oz * CH + CH / 2,
      food: 50 + dist * 30, workers: 12 + Math.floor(dist * 6 + r() * 8), soldiers: 6 + Math.floor(dist * 5 + r() * 6), scouts: 2,
      aggr: forced ? .85 : .2 + r() * .7, rel: forced ? -60 : Math.round(-20 + r() * 50), r: 18 + r() * 6, h: 6 + r() * 3,
      chambers: ['grenier', 'nurserie', 'caserne', 'champignon'].slice(0, 1 + Math.floor(dist + r() * 2)),
    });
    c.queenMax = c.queenHp = 1000 + dist * 400;
    if (forced) { c.status = 'guerre'; c.story = true; }
    COL.list.push(c); COL.nests.push(c);
  };
  COL.ensure = (x, z) => { const rx = Math.floor(x / REGION), rz = Math.floor(z / REGION); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) COL.region(rx + a, rz + b); };
  COL.get = id => COL.list.find(c => c.id === id);
  COL.isWar = id => { const c = COL.get(id); return c && c.alive && c.status === 'guerre'; };
  COL.cap = c => 20 + 14 * c.chambers.length + (c.chambers.includes('caserne') ? 12 : 0);
  COL.foodCap = c => 120 + 150 * c.chambers.filter(x => x === 'grenier').length;
  COL.pop = c => c.workers + c.soldiers + c.scouts;
  COL.log = (t, kind = 'info') => { COL.events.unshift({ t, kind, at: COL.t }); if (COL.events.length > 40) COL.events.pop(); HUD.feed(t); };

  // --- actions de la joueuse
  COL.feedQueen = n => {
    const c = COL.player, k = Math.min(n, Math.floor(c.food / 10));
    if (k <= 0) { HUD.notice('Pas assez de nourriture : 10 par œuf', 2); return 0; }
    if (COL.pop(c) + c.eggs.length + k > COL.cap(c)) { HUD.notice('La colonie est pleine : creuse une chambre', 2.2); return 0; }
    c.food -= k * 10; const hatch = c.chambers.includes('nurserie') ? 15 : 30;
    for (let i = 0; i < k; i++) c.eggs.push({ t: hatch + i * 1.5, caste: pickCaste(c.ratio) });
    COL.stats.fed += k; SFX.pick(); HUD.notice(`La Reine pond ${k} œuf${k > 1 ? 's' : ''}`, 2);
    return k;
  };
  function pickCaste(r) { const x = Math.random() * (r[0] + r[1] + r[2]); return x < r[0] ? 'workers' : x < r[0] + r[1] ? 'soldiers' : 'scouts'; }
  COL.dig = type => {
    const c = COL.player, d = CHAMBERS[type];
    if (c.chambers.length >= CHAMBER_SLOTS.length) { HUD.notice('Plus de place pour creuser', 2); return false; }
    if (c.food < d.cost) { HUD.notice(`Il faut ${d.cost} de nourriture`, 2); return false; }
    c.food -= d.cost; c.chambers.push(type); COL.stats.dug++; SFX.pick();
    COL.log(`Les ouvrières ont creusé une ${d.name.toLowerCase()}`);
    if (OW.mode === 'nest' && OW.nestCol === c) OW.rebuildNest();
    return true;
  };
  COL.gift = (c, n = 20) => {
    if (COL.player.food < n) { HUD.notice('Pas assez de nourriture', 1.6); return; }
    COL.player.food -= n; c.food += n; c.rel = Math.min(100, c.rel + 12); SFX.pick();
    COL.log(`Tu offres ${n} de nourriture aux ${c.name} (relation ${Math.round(c.rel)})`);
    if (c.status === 'guerre' && c.rel > -10) COL.peace(c);
  };
  COL.ally = c => {
    if (c.status === 'guerre') { HUD.notice('Il faut d\'abord signer une trêve', 2); return; }
    if (c.rel < 40) { HUD.notice(`Les ${c.name} refusent : relation trop basse (${Math.round(c.rel)} sur 40)`, 2.4); return; }
    c.status = 'alliee'; c.rel = Math.min(100, c.rel + 10); COL.log(`Alliance signée avec les ${c.name} !`, 'good');
  };
  COL.declare = (c, quiet) => {
    if (c.status === 'guerre' || !c.alive) return;
    c.status = 'guerre'; c.rel = Math.min(c.rel, -60);
    for (const o of COL.list) if (o.status === 'alliee' && o !== c) o.wars.add(c.id);
    if (!quiet) COL.log(`Guerre déclarée aux ${c.name} !`, 'bad');
  };
  COL.peace = c => { if (c.status !== 'guerre') return; if (c.rel < -45) { HUD.notice(`Les ${c.name} refusent la trêve (relation ${Math.round(c.rel)})`, 2.2); return; } c.status = 'neutre'; COL.log(`Trêve signée avec les ${c.name}`, 'good'); };
  COL.provoke = id => { const c = COL.get(id); if (!c || c.status === 'guerre') return; c.rel -= 30; if (c.status === 'alliee') c.status = 'neutre'; if (c.rel < -40) COL.declare(c); else HUD.notice(`Les ${c.name} n'apprécient pas (relation ${Math.round(c.rel)})`, 2); };
  COL.destroy = c => {
    c.alive = false; c.status = 'vaincue'; COL.stats.beaten++;
    const loot = Math.round(c.food * .5 + 40); COL.player.food = Math.min(COL.foodCap(COL.player), COL.player.food + loot);
    COL.log(`La colonie des ${c.name} est tombée ! Butin : ${loot} de nourriture`, 'good');
    for (const o of COL.list) if (o.alive && !o.player && o !== c) { o.rel += o.wars.has(c.id) ? 20 : -5; o.wars.delete(c.id); }
  };
  COL.sendArmy = (c, n) => {
    const p = COL.player; n = Math.min(n, p.soldiers); if (n <= 0) { HUD.notice('Aucune soldate disponible', 2); return; }
    if (c.status !== 'guerre') COL.declare(c);
    p.soldiers -= n; COL.armies.push({ from: p, to: c, n, x: p.x, z: p.z, own: true });
    COL.log(`${n} soldates partent attaquer les ${c.name}`);
  };

  // --- simulation (chaque seconde)
  let acc = 0;
  COL.tick = dt => {
    COL.t += dt; acc += dt;
    for (const c of COL.list) if (c.alive) for (let i = c.eggs.length - 1; i >= 0; i--) { const e = c.eggs[i]; e.t -= dt; if (e.t <= 0) { c[e.caste]++; c.eggs.splice(i, 1); if (c.player) HUD.feed(`Éclosion : une ${e.caste === 'workers' ? 'ouvrière' : e.caste === 'soldiers' ? 'soldate' : 'éclaireuse'}`); } }
    if (acc < 1) return; acc -= 1;
    for (const c of COL.list) {
      if (!c.alive) continue;
      const inc = c.workers * .045 * (1 + .25 * c.chambers.filter(x => x === 'champignon').length) + c.chambers.filter(x => x === 'champignon').length * .15;
      const up = COL.pop(c) * .008;
      c.food = clamp(c.food + inc - up, 0, COL.foodCap(c));
      if (c.food <= 0 && COL.pop(c) > 4) { c.workers = Math.max(2, c.workers - 1); if (c.player) COL.log('Famine : une ouvrière meurt de faim', 'bad'); }
      if (!c.player) {
        // les colonies rivales pondent selon leur caractère et leurs guerres
        if (c.food > 45 && COL.pop(c) + c.eggs.length < COL.cap(c)) { c.food -= 10; const war = c.status === 'guerre' || c.wars.size; c.eggs.push({ t: 25, caste: Math.random() < (war ? .55 : .25) + c.aggr * .2 ? 'soldiers' : 'workers' }); }
        if (c.food > 120 && c.chambers.length < 6 && Math.random() < .01) c.chambers.push(['caserne', 'grenier', 'champignon', 'nurserie'][Math.floor(Math.random() * 4)]);
        c.rel += (c.status === 'alliee' ? .02 : c.status === 'guerre' ? -.01 : (.5 - c.aggr) * .02);
        c.rel = clamp(c.rel, -100, 100);
      }
    }
    diplomacy();
    raids(1);
    marches(1);
    // découverte des colonies proches
    for (const c of COL.list) if (!c.known && Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 75) { c.known = true; COL.log(`Colonie découverte : les ${c.name} (${c.status})`); }
  };
  let dipT = 20;
  function diplomacy() {
    dipT -= 1; if (dipT > 0) return; dipT = 25 + Math.random() * 20;
    const ai = COL.list.filter(c => c.alive && !c.player && c.known);
    // guerres et paix entre colonies rivales
    const all = COL.list.filter(c => c.alive && !c.player);
    if (all.length >= 2 && Math.random() < .35) {
      const a = all[Math.floor(Math.random() * all.length)], b = all[Math.floor(Math.random() * all.length)];
      if (a !== b && Math.hypot(a.x - b.x, a.z - b.z) < REGION * 2.2) {
        if (!a.wars.has(b.id) && Math.random() < (a.aggr + b.aggr) / 2) { a.wars.add(b.id); b.wars.add(a.id); if (a.known || b.known) COL.log(`Les ${a.name} ont déclaré la guerre aux ${b.name}`); }
        else if (a.wars.has(b.id) && Math.random() < .3) { a.wars.delete(b.id); b.wars.delete(a.id); if (a.known || b.known) COL.log(`Les ${a.name} et les ${b.name} font la paix`); }
      }
    }
    // propositions faites à la joueuse
    for (const c of ai) {
      if (c.status === 'neutre' && c.rel > 55 && Math.random() < .3) { OW.propose(c, 'alliance'); break; }
      if (c.status === 'guerre' && c.rel > -30 && c.soldiers < COL.player.soldiers && Math.random() < .25) { OW.propose(c, 'treve'); break; }
      if (c.status === 'neutre' && c.rel < -35 && c.aggr > .55 && Math.random() < .4) { COL.declare(c, true); COL.log(`Les ${c.name} te déclarent la guerre !`, 'bad'); break; }
      // une alliée en guerre demande de l'aide
      if (c.status === 'alliee' && c.wars.size && Math.random() < .2) { const e = COL.get([...c.wars][0]); if (e && e.alive && e.status !== 'guerre') { OW.propose(c, 'aide', e); break; } }
    }
  }
  function raids(dt) {
    for (const c of COL.list) {
      if (!c.alive || c.player) continue;
      const targets = [];
      if (c.status === 'guerre') targets.push(COL.player);
      for (const id of c.wars) { const t = COL.get(id); if (t && t.alive) targets.push(t); }
      if (!targets.length) continue;
      c.raidT -= dt;
      if (c.raidT > 0 || c.soldiers < 8) continue;
      c.raidT = 120 + Math.random() * 120 - c.aggr * 50;
      const t = targets[Math.floor(Math.random() * targets.length)], n = Math.floor(c.soldiers * .5);
      c.soldiers -= n; COL.armies.push({ from: c, to: t, n, x: c.x, z: c.z, own: false });
      if (t.player) COL.log(`Les ${c.name} lancent un raid de ${n} soldates sur ta fourmilière !`, 'bad');
    }
  }
  // armées en marche sur la carte ; combat abstrait à l'arrivée, ou bataille réelle si la joueuse est là
  function marches(dt) {
    for (let i = COL.armies.length - 1; i >= 0; i--) {
      const a = COL.armies[i];
      if (!a.to.alive) { a.from.soldiers += a.n; COL.armies.splice(i, 1); continue; }
      const dx = a.to.x - a.x, dz = a.to.z - a.z, d = Math.hypot(dx, dz), sp = 3.2 * dt;
      if (d > 6) { a.x += dx / d * Math.min(sp, d); a.z += dz / d * Math.min(sp, d); continue; }
      COL.armies.splice(i, 1);
      const t = a.to;
      if (t.player && OW.defendHere(a)) continue;               // la joueuse défend en personne
      const att = a.n * (a.from.chambers.includes('caserne') ? 1.25 : 1), def = t.soldiers * (t.chambers.includes('caserne') ? 1.5 : 1.2) + t.workers * .15;
      if (att > def) {
        const lost = Math.round(t.soldiers), steal = Math.round(t.food * .35), dead = Math.round(t.workers * .15);
        t.soldiers = 0; t.food -= steal; t.workers -= dead; a.from.food += steal; a.from.soldiers += Math.max(1, Math.round(a.n - def * .6));
        if (a.own && !t.player && t.soldiers <= 0 && att > def * 2 + 10) { COL.destroy(t); continue; }
        if (t.player) COL.log(`Raid des ${a.from.name} : ${lost} soldates tuées, ${steal} de nourriture volée`, 'bad');
        else if (a.own) COL.log(`Victoire contre les ${t.name} : ${steal} de nourriture rapportée`, 'good');
        else if (t.known) COL.log(`Les ${a.from.name} ont pillé les ${t.name}`);
      } else {
        t.soldiers = Math.max(0, Math.round(t.soldiers - att * .7));
        if (t.player) COL.log(`Raid des ${a.from.name} repoussé par tes soldates`, 'good');
        else if (a.own) COL.log(`Ton armée a été repoussée par les ${t.name}`, 'bad');
      }
      if (t.player) a.from.rel -= 5;
    }
  }

  // --- campagne
  const QUESTS = [
    { t: () => `Rapporte de la nourriture à la fourmilière (${Math.min(20, COL.stats.deposits)}/20)`, done: () => COL.stats.deposits >= 20, target: () => nearestFood() },
    { t: () => 'Entre dans la fourmilière et nourris la Reine', done: () => COL.stats.fed >= 1, target: () => COL.player },
    { t: () => 'Creuse une nouvelle chambre (Tab, onglet Chambres)', done: () => COL.stats.dug >= 1, target: () => COL.player },
    { t: () => 'Explore le monde : trouve une autre colonie', done: () => COL.list.filter(c => !c.player && c.known).length >= 1, target: () => COL.list.find(c => !c.player && c.alive && !c.known) },
    { t: () => 'Fais une alliance (ou déclare une guerre) dans l\'onglet Diplomatie', done: () => COL.list.some(c => c.status === 'alliee' || (c.status === 'guerre' && !c.story)), target: () => null },
    { t: () => `Lève une armée d'au moins 5 soldates (${ALLY.list.filter(a => a.army).length}/5)`, done: () => ALLY.list.filter(a => a.army).length >= 5, target: () => COL.player },
    { t: () => 'Monte à l\'assaut de la fourmilière des Rouges et tue leur reine', done: () => COL.list.some(c => c.story && !c.alive), target: () => COL.list.find(c => c.story && c.alive) },
    { t: () => `Domine le monde des fourmis : ${COL.stats.beaten + COL.list.filter(c => c.status === 'alliee').length}/4 colonies vaincues ou alliées`, done: () => COL.stats.beaten + COL.list.filter(c => c.status === 'alliee').length >= 4, target: () => COL.list.find(c => c.alive && c.status === 'guerre') },
  ];
  function nearestFood() { let b = null, bd = 1e9; for (const f of (OW.surface ? OW.surface.food : [])) { if (f.taken) continue; const d = Math.hypot(f.x - P.pos.x, f.z - P.pos.z); if (d < bd) { bd = d; b = f; } } return P.carry ? COL.player : b; }
  COL.quest = () => QUESTS[Math.min(COL.q, QUESTS.length - 1)];
  COL.questTick = () => { const q = QUESTS[COL.q]; if (q && q.done()) { COL.q++; SFX.pick(); COL.log(COL.q >= QUESTS.length ? 'Tu règnes sur le monde des fourmis !' : 'Objectif accompli !', 'good'); } };

  // --- plan d'une fourmilière souterraine (la tienne ou celle d'une rivale)
  COL.nestLevel = c => {
    const shapes = [{ x: 0, z: -44, r: 7, h: 6 }, { a: [0, -44], b: [0, -14], r: 2.8, h: 4.6 }, { x: 0, z: -6, r: 8, h: 7 }, { a: [0, -6], b: [0, 22], r: 2.8, h: 4.6 }, { x: 0, z: 30, r: 11, h: 10 }];
    const fungus = [{ x: 0, z: -44, n: 6, color: '#6dffd6', light: true }, { x: 0, z: -6, n: 8, color: '#6dffd6', light: true }, { x: 0, z: 30, n: 10, r: 7, color: c.player ? '#c8ff6a' : '#ff7a3a', light: true }];
    const seeds = [], nursery = [], rooms = [];
    c.chambers.forEach((type, i) => {
      const [x, z] = CHAMBER_SLOTS[i], mx = x * .5 + (z > 10 ? 6 * Math.sign(x) : 0), mz = (z - 6) * .5 - 4;
      shapes.push({ x, z, r: 8, h: 7 }, { a: [0, -6], b: [mx, mz], r: 2.6, h: 4.4 }, { a: [mx, mz], b: [x, z], r: 2.6, h: 4.4 });
      rooms.push({ type, x, z });
      if (type === 'grenier') seeds.push({ x, z, n: Math.min(60, 10 + Math.round(c.food / 4)), r: 6 });
      if (type === 'nurserie') nursery.push({ x, z, n: Math.min(40, 8 + c.eggs.length * 2), r: 6 });
      if (type === 'champignon') fungus.push({ x, z, n: 24, r: 6, color: '#7dff8a', light: i < 3 });
      if (type === 'caserne') fungus.push({ x, z, n: 6, color: '#ffd37a' });
    });
    return { id: 'nid_' + c.id, chapter: c.player ? 'Ta fourmilière' : 'Assaut', name: c.name, type: 'cave', size: 110, seed: 31 + c.x, shapes, fungus, seeds, nursery, rooms, roots: 50,
      start: { x: 0, z: -42, yaw: Math.PI }, exit: { x: 0, z: -48, r: 2.6 }, enemies: [], pickups: [], events: [], objective: () => '', target: () => null };
  };
})();
