// ============ Early-game mission chain ============
const Missions = (() => {
  let current = 0;
  const counters = {};

  const chain = [
    {
      id: 'awaken',
      title: 'AWAKENING',
      desc: () => 'You awaken on an unfamiliar planet.<br>A crashed starship signal has been detected — proceed to the marked location.',
      check: () => {
        const d = Player.pos.distanceTo(Ship.state.pos);
        return d < 14;
      },
      onStart() {
        UI.addMarker('ship', 'CRASHED STARSHIP', '▲', 'amber');
      },
      onDone() {
        UI.notify('CRASHED STARSHIP FOUND', 'HULL SEVERELY DAMAGED · REPAIRS REQUIRED BEFORE TAKEOFF');
      },
    },
    {
      id: 'carbon',
      title: 'BASIC GATHERING · CARBON',
      desc: () => `The mining beam requires fuel. Use the <b style="color:#ffcf7a">MINING BEAM (LEFT MOUSE)</b> to mine trees.<br>COLLECT CARBON <span class="${Items.count('carbon') >= 20 ? 'done' : ''}">${Math.min(Items.count('carbon'), 20)}/20</span>`,
      check: () => Items.count('carbon') >= 20,
      onDone() { UI.notify('ENOUGH CARBON COLLECTED', 'CARBON RECHARGES THE MINING BEAM AND LIFE SUPPORT'); },
    },
    {
      id: 'ferrite',
      title: 'BASIC GATHERING · FERRITE DUST',
      desc: () => `The starship armor needs metal repairs. Mine rocks and terrain for ferrite dust.<br>COLLECT FERRITE DUST <span class="${Items.count('ferrite') >= 40 ? 'done' : ''}">${Math.min(Items.count('ferrite'), 40)}/40</span>`,
      check: () => Items.count('ferrite') >= 40,
      onDone() { UI.notify('ENOUGH FERRITE DUST COLLECTED', 'OPEN INVENTORY (TAB) TO CRAFT METAL PLATING'); },
    },
    {
      id: 'plate',
      title: 'FORGE · METAL PLATING',
      desc: () => `Open the <b style="color:#ffcf7a">INVENTORY (TAB)</b> and create metal plating with portable crafting.<br>METAL PLATING <span class="${Items.count('metalplate') >= 1 || craftedSet.has('metalplate') ? 'done' : ''}">${craftedSet.has('metalplate') ? 1 : Items.count('metalplate')}/1</span>`,
      check: () => Items.count('metalplate') >= 1 || craftedSet.has('metalplate'),
      onDone() { UI.notify('METAL PLATING FORGED', 'DI-HYDROGEN JELLY IS STILL NEEDED TO POWER THE THRUSTER'); },
    },
    {
      id: 'dihydrogen',
      title: 'GATHER · DI-HYDROGEN CRYSTALS',
      desc: () => `Find and mine the glowing <b style="color:#4fa8e8">BLUE CRYSTALS</b> on the surface.<br>COLLECT DI-HYDROGEN <span class="${Items.count('dihydrogen') >= 40 ? 'done' : ''}">${Math.min(Items.count('dihydrogen'), 40)}/40</span><br><span style="opacity:.6">TIP: CRYSTALS ARE RANDOMLY DISTRIBUTED ACROSS OPEN TERRAIN</span>`,
      check: () => Items.count('dihydrogen') >= 40,
      onDone() { UI.notify('DI-HYDROGEN COLLECTION COMPLETE', 'CRAFT DI-HYDROGEN JELLY IN THE INVENTORY'); },
    },
    {
      id: 'gel',
      title: 'CRAFT · DI-HYDROGEN JELLY',
      desc: () => `Craft di-hydrogen jelly in the inventory (Tab).<br>DI-HYDROGEN JELLY <span class="${Items.count('dihygel') >= 1 || craftedSet.has('dihygel') ? 'done' : ''}">${craftedSet.has('dihygel') ? 1 : Items.count('dihygel')}/1</span>`,
      check: () => Items.count('dihygel') >= 1 || craftedSet.has('dihygel'),
      onDone() { UI.notify('DI-HYDROGEN JELLY CRAFTED', 'RETURN TO THE STARSHIP AND REPAIR THE LAUNCH THRUSTER'); },
    },
    {
      id: 'thruster',
      title: 'REPAIR · LAUNCH THRUSTER',
      desc: () => `Return to the starship with the materials and press <b style="color:#ffcf7a">E</b> to open the repair panel.<br>LAUNCH THRUSTER ${Ship.repairs[0].fixed ? '<span class="done">✔ REPAIRED</span>' : '⚠ DAMAGED'}`,
      check: () => Ship.repairs[0].fixed,
      onStart() { UI.addMarker('ship', 'CRASHED STARSHIP', '▲', 'amber'); },
      onDone() { UI.notify('LAUNCH THRUSTER REPAIRED', 'THE PULSE ENGINE STILL NEEDS REPAIRS'); },
    },
    {
      id: 'pulse',
      title: 'REPAIR · PULSE ENGINE',
      desc: () => {
        const needNano = !Ship.repairs[1].fixed;
        return `The pulse engine requires a CARBON NANOTUBE (CARBON ×50) and METAL PLATING (FERRITE DUST ×30).<br>PULSE ENGINE ${Ship.repairs[1].fixed ? '<span class="done">✔ REPAIRED</span>' : '⚠ DAMAGED'}<br><span style="opacity:.6">CARBON ${Items.count('carbon')} · FERRITE DUST ${Items.count('ferrite')}</span>`;
      },
      check: () => Ship.repairs[1].fixed,
      onDone() { UI.notify('ALL STARSHIP SYSTEMS ONLINE', 'ALL SYSTEMS ONLINE · READY FOR TAKEOFF'); },
    },
    {
      id: 'launch',
      title: 'TAKEOFF',
      desc: () => `Board the starship (press E) and leave this planet.<br><span style="opacity:.6">HOLD W TO ACCELERATE AFTER TAKEOFF · PULL THE NOSE UP TO LEAVE THE ATMOSPHERE</span>`,
      check: () => Game.state === 'space',
      onDone() { UI.notify('PLANETARY ORBIT REACHED', 'WELCOME TO DEEP SPACE · VOXEL TRAVELER'); },
    },
    {
      id: 'travel',
      title: 'INTERSTELLAR TRAVEL',
      desc: () => `Use the <b style="color:#b08aff">PULSE ENGINE (SHIFT)</b> to travel to another planet.<br>Press <b style="color:#ffcf7a">E</b> near a planet to enter its atmosphere.<br><span style="opacity:.6">PLANETS EXPLORED: ${visitedCount()}/2</span>`,
      check: () => visitedCount() >= 2,
      onDone() { UI.notify('MISSION CHAIN COMPLETE', 'THIS VOXEL UNIVERSE IS NOW OPEN TO YOU'); },
    },
    {
      id: 'free',
      title: 'FREE EXPLORATION',
      desc: () => `The universe is boundless. Gather resources, explore planets, and roam the stars.<br><span style="opacity:.6">PLANETS EXPLORED: ${visitedCount()}/4</span>`,
      check: () => false,
    },
  ];

  const craftedSet = new Set();
  const visited = new Set([0]);
  function visitedCount() { return visited.size; }

  function start(creative = false) {
    current = creative ? chain.length - 1 : 0;
    craftedSet.clear();
    visited.clear(); visited.add(0);
    chain.forEach(m => { if (m.onStart) m._started = false; });
    if (creative) chain[current]._started = true;
    activate();
  }

  function activate() {
    const m = chain[current];
    if (m.onStart && !m._started) { m._started = true; m.onStart(); }
    refresh();
  }

  function refresh() {
    const m = chain[current];
    UI.setMission(`${String(current + 1).padStart(2, '0')} · ${m.title}`, m.desc());
  }

  let checkTimer = 0;
  function update(dt) {
    checkTimer -= dt;
    if (checkTimer > 0) return;
    checkTimer = 0.4;
    const m = chain[current];
    refresh();
    if (m.check()) {
      if (m.onDone) m.onDone();
      Sfx.missionDone();
      if (current < chain.length - 1) {
        current++;
        setTimeout(activate, 600);
      }
    }
  }

  function onCollect(id) { refresh(); }
  function onCraft(id) { craftedSet.add(id); refresh(); }
  function onVisitPlanet(idx) { visited.add(idx); refresh(); }

  return { start, update, onCollect, onCraft, onVisitPlanet, get current() { return chain[current]; }, get index() { return current; } };
})();
