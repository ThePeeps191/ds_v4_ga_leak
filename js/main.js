// ============ Main game controller ============
const Game = (() => {
  let renderer, planetScene, camera;
  let state = 'menu'; // menu | intro | planet | takeoff | atmo | entry | space | landing
  let clock = new THREE.Clock();
  let sunLight, ambLight, fogRef;
  let particles = [];
  let currentPlanetIdx = 0;
  let pointerLocked = false;
  let paused = false;

  // ---------- Initialization ----------
  function init() {
    const canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);

    camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 20000);

    // Planet surface scene
    planetScene = new THREE.Scene();
    Textures.buildAtlas();
    World.init(planetScene);
    ambLight = new THREE.AmbientLight(0xffffff, 0.55);
    planetScene.add(ambLight);
    sunLight = new THREE.DirectionalLight(0xfff4e0, 0.9);
    sunLight.position.set(80, 120, 40);
    planetScene.add(sunLight);

    Space.init();
    Player.init(camera, planetScene);
    Ship.build(planetScene);
    Ship.setCamera(camera);

    bindEvents();
    animate();
  }

  // ---------- Planet environment ----------
  function applyPlanetAtmosphere(config) {
    const fogColor = new THREE.Color(config.fog);
    planetScene.fog = new THREE.Fog(fogColor, 30, 150);
    planetScene.background = fogColor.clone().lerp(new THREE.Color(config.sky), 0.6);
    ambLight.intensity = 0.45 + config.ambient * 0.15;
    UI.setPlanetInfo(config.name, config.type + ' · ' + config.hazardName);
    UI.setEnvReadout(config.hazardName + ' · GRAVITY 1.02g');
  }

  // ---------- Start game ----------
  let creativeMode = false;
  async function startGame(creative = false) {
    creativeMode = creative;
    Sfx.init(); Sfx.resume();
    Sfx.uiClick();
    document.getElementById('main-menu').classList.add('hidden');

    // Opening text
    const intro = document.getElementById('intro-screen');
    const introText = document.getElementById('intro-text');
    intro.classList.remove('hidden');
    const lines = creative ? [
      '// CREATIVE PROTOCOL ACTIVATED',
      'EXOSUIT SYNCHRONIZATION COMPLETE. RESOURCE SYNTHESIZER POWER IS UNLIMITED.',
      '',
      'THIS VOXEL UNIVERSE IS YOURS TO SHAPE.',
    ] : [
      '// SIGNAL LOST · STELLAR DAY 1,024',
      'YOUR STARSHIP LOST POWER AT THE EDGE OF AN UNKNOWN SYSTEM,',
      'CRASHING ONTO A PLANET MADE OF BLOCKS.',
      '',
      'REPAIR THE STARSHIP — RETURN TO THE STARS.',
    ];
    introText.textContent = '';
    let skip = false;
    const skipFn = () => { skip = true; };
    intro.addEventListener('click', skipFn);
    for (const line of lines) {
      if (skip) break;
      for (const ch of line) {
        if (skip) break;
        introText.textContent += ch;
        await new Promise(r => setTimeout(r, 42));
      }
      introText.textContent += '\n';
      await new Promise(r => setTimeout(r, skip ? 0 : 350));
    }
    if (!skip) await new Promise(r => {
      const t = setTimeout(r, 1500);
      intro.addEventListener('click', () => { clearTimeout(t); r(); }, { once: true });
    });
    intro.removeEventListener('click', skipFn);

    await UI.fade(true, 600);
    intro.classList.add('hidden');

    // Initialize planet
    currentPlanetIdx = 0;
    const config = Space.planets[0].config;
    World.setPlanet(config);
    applyPlanetAtmosphere(config);

    // Pre-generate central chunks
    World.update(0, 0, 1000);

    // Place crashed starship and player
    Ship.placeLanded(6, -10, !creativeMode);
    World.flattenPad(-6, 8, 2);
    Player.spawnAt(-6, 8);
    Player.yaw = Math.atan2(-(Ship.state.pos.x - Player.pos.x), -(Ship.state.pos.z - Player.pos.z));
    Items.reset();
    if (creativeMode) {
      Items.setCreative(true);
      Ship.repairs.forEach(r => r.fixed = true);
    } else {
      Items.add('carbon', 5);
    }

    state = 'planet';
    document.getElementById('hud').classList.remove('hidden');
    Missions.start(creativeMode);
    Sfx.windLoop(config.hazardRate > 1.5 ? 1.6 : 1);

    await UI.fade(false, 1200);
    UI.notify(config.name, config.type + (creativeMode ? ' · CREATIVE MODE · INFINITE ITEMS' : ' · PLANETARY LANDING BEACON ESTABLISHED'));
    requestPointerLock();
  }

  // ---------- Takeoff sequence ----------
  async function boardShip() {
    if (!Ship.allRepaired()) {
      UI.openRepair('STARSHIP · DAMAGED COMPONENTS', Ship.repairs, () => { Missions.update(1); });
      return;
    }
    state = 'takeoff';
    document.exitPointerLock();
    UI.interactTip(null);
    UI.clearMarkers();
    Sfx.uiClick();
    Sfx.shipLoop();
    Ship.snapCamera();
    spawnDust(Ship.state.pos.x, Ship.state.pos.y - 0.8, Ship.state.pos.z);
    Ship.takeoff(() => {
      state = 'atmo';
      requestPointerLock();
      UI.notify('ATMOSPHERIC FLIGHT ENGAGED', 'HOLD W TO ACCELERATE · PULL UP TO LEAVE THE ATMOSPHERE · PRESS E TO LAND');
      document.getElementById('ship-hud').classList.remove('hidden');
    });
  }

  // ---------- Leave atmosphere → space ----------
  async function exitAtmosphere() {
    state = 'entry-out';
    Sfx.entryBoom();
    UI.setHeatOverlay(0.6);
    await UI.fade(true, 900, true);
    UI.setHeatOverlay(0);

    // Switch to space scene
    state = 'space';
    const p = Space.planets[currentPlanetIdx];
    // Position ship outside the planet surface
    const dir = new THREE.Vector3(0.3, 0.5, 0.8).normalize();
    Ship.state.pos.copy(p.mesh.position).add(dir.multiplyScalar(p.radius * 1.6));
    Ship.state.pitch = 0;
    Ship.state.speed = 40;
    Space.scene.add(Ship.group);
    Ship.applyTransform();
    Ship.snapCamera();
    Sfx.stopLoop('wind');
    Sfx.spaceLoop();
    updateSpaceMarkers();

    await UI.fade(false, 900, true);
    UI.notify('PLANETARY ORBIT', 'HOLD SHIFT TO ENGAGE PULSE ENGINE · PRESS E NEAR A PLANET TO ENTER ITS ATMOSPHERE');
  }

  // ---------- Enter atmosphere → planet ----------
  async function enterAtmosphere(planetEntry) {
    state = 'entry-in';
    Ship.setPulse(false);
    Sfx.entryBoom();

    // Atmospheric friction effect
    let t = 0;
    const entryAnim = setInterval(() => {
      t += 0.05;
      UI.setHeatOverlay(Math.min(1, t * 1.4));
    }, 50);

    await new Promise(r => setTimeout(r, 1600));
    await UI.fade(true, 900);
    clearInterval(entryAnim);
    UI.setHeatOverlay(0);
    UI.clearMarkers();

    // Switch to planet scene
    currentPlanetIdx = planetEntry.index;
    const config = planetEntry.config;
    World.setPlanet(config);
    applyPlanetAtmosphere(config);
    planetScene.add(Ship.group);

    Ship.state.pos.set(0, 180, 0);
    Ship.state.pitch = -0.55;
    Ship.state.yaw = Math.random() * Math.PI * 2;
    Ship.state.speed = 50;
    Ship.state.throttle = 0.6;
    Ship.state.mode = 'atmo';
    World.update(0, 0, 800);
    Ship.applyTransform();
    Ship.snapCamera();

    state = 'atmo';
    Sfx.stopLoop('space');
    Sfx.windLoop(config.hazardRate > 1.5 ? 1.6 : 1);
    Missions.onVisitPlanet(planetEntry.index);

    await UI.fade(false, 700);
    UI.setHeatOverlay(0.8);
    setTimeout(() => UI.setHeatOverlay(0), 1400);
    UI.notify(config.name, config.type + ' · FIND LEVEL GROUND AND PRESS E TO LAND');
  }

  // ---------- Landing ----------
  function landShip() {
    state = 'landing';
    Ship.land(() => {
      state = 'planet';
      spawnDust(Ship.state.pos.x, Ship.state.pos.y - 0.8, Ship.state.pos.z);
      document.getElementById('ship-hud').classList.add('hidden');
      // Player exits ship
      const s = Ship.state.pos;
      const px = s.x + Math.cos(Ship.state.yaw) * 4, pz = s.z - Math.sin(Ship.state.yaw) * 4;
      Player.spawnAt(px, pz);
      Player.pitch = 0;
      Player.yaw = Ship.state.yaw + Math.PI / 2;
      // Preserve survival state
      UI.notify('LANDING COMPLETE', 'PRESS E TO BOARD AGAIN');
    });
  }

  // ---------- Destruction particles ----------
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x333338, transparent: true, opacity: 0.55 });
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8830, transparent: true, opacity: 0.85 });
  const dustMat = new THREE.MeshBasicMaterial({ color: 0xbbaa88, transparent: true, opacity: 0.5 });
  let smokeTimer = 0;

  function spawnSmoke(x, y, z, fire = false) {
    const s = fire ? 0.16 : 0.3 + Math.random() * 0.3;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), fire ? fireMat : smokeMat);
    m.position.set(x + (Math.random() - 0.5) * 1.6, y, z + (Math.random() - 0.5) * 1.6);
    planetScene.add(m);
    particles.push({
      mesh: m, life: fire ? 0.5 : 1.8 + Math.random(),
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5),
      noGrav: true, grow: !fire,
    });
  }

  function spawnDust(x, y, z) {
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), dustMat);
      const a = Math.random() * Math.PI * 2;
      m.position.set(x + Math.cos(a) * 2, y + 0.3, z + Math.sin(a) * 2);
      planetScene.add(m);
      particles.push({
        mesh: m, life: 1 + Math.random(),
        vel: new THREE.Vector3(Math.cos(a) * 4, 0.5 + Math.random(), Math.sin(a) * 4),
        noGrav: true, grow: true,
      });
    }
  }

  function spawnBreakParticles(x, y, z, blockId) {
    const def = BLOCKS[blockId];
    const texIdx = def.tex ? def.tex[1] : 3;
    const n = 8;
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const [u0, v0] = Textures.uvFor(texIdx);
    const mat = new THREE.MeshLambertMaterial({ map: Textures.atlas });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6);
      planetScene.add(m);
      particles.push({
        mesh: m, life: 0.7 + Math.random() * 0.4,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 5, (Math.random() - 0.5) * 4),
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (!p.noGrav) p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.grow) p.mesh.scale.multiplyScalar(1 + dt * 1.2);
      else { p.mesh.rotation.x += dt * 5; p.mesh.rotation.y += dt * 4; }
      if (p.life <= 0) {
        planetScene.remove(p.mesh);
        particles.splice(i, 1);
      }
    }
    // Crashed ship emits smoke (while unrepaired)
    if (state === 'planet' && !Ship.allRepaired()) {
      smokeTimer -= dt;
      if (smokeTimer <= 0) {
        smokeTimer = 0.12;
        const s = Ship.state.pos;
        spawnSmoke(s.x - 1, s.y + 1.2, s.z + 1.5);
        if (Math.random() < 0.4) spawnSmoke(s.x + 1.2, s.y + 0.8, s.z - 0.5, true);
      }
    }
  }

  // ---------- Interaction detection ----------
  function updateInteract() {
    if (state !== 'planet') { return; }
    const d = Player.pos.distanceTo(Ship.state.pos);
    if (d < 6) {
      UI.interactTip(Ship.allRepaired() ? 'BOARD STARSHIP' : 'INSPECT DAMAGED STARSHIP COMPONENTS');
    } else {
      UI.interactTip(null);
    }
  }

  function interact() {
    if (state === 'planet') {
      const d = Player.pos.distanceTo(Ship.state.pos);
      if (d < 6) boardShip();
    } else if (state === 'atmo') {
      const alt = Ship.state.pos.y - World.surfaceHeight(Ship.state.pos.x, Ship.state.pos.z);
      if (alt < 45) landShip();
      else UI.notify('ALTITUDE TOO HIGH', 'DESCEND BELOW 45u TO LAND');
    } else if (state === 'space') {
      const { planet, dist } = Space.nearestPlanet(Ship.state.pos);
      if (planet && dist < planet.radius * 1.2) enterAtmosphere(planet);
    }
  }

  // ---------- Space markers ----------
  function updateSpaceMarkers() {
    UI.clearMarkers();
    Space.planets.forEach((p, i) => {
      UI.addMarker('planet' + i, p.config.name + ' · ' + p.config.type, '◉', i === currentPlanetIdx ? 'amber' : '');
    });
  }

  // ---------- Event bindings ----------
  function bindEvents() {
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const canvas = renderer.domElement;
    document.addEventListener('pointerlockchange', () => {
      pointerLocked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('click', () => {
      if (state === 'planet' || state === 'atmo' || state === 'space') {
        if (!pointerLocked && !UI.invOpen && !UI.repairOpen) requestPointerLock();
      }
    });
    document.addEventListener('mousemove', e => {
      if (!pointerLocked) return;
      if (state === 'planet') Player.onMouseMove(e.movementX, e.movementY);
      else if (state === 'atmo' || state === 'space') Ship.onMouseMove(e.movementX, e.movementY);
    });
    document.addEventListener('mousedown', e => {
      if (!pointerLocked || state !== 'planet') return;
      if (e.button === 0) Player.startMine();
      if (e.button === 2) Player.placeBlock();
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) Player.stopMine();
    });
    document.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('keydown', e => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (state === 'planet') UI.toggleInventory();
        return;
      }
      if (e.code === 'Escape') {
        if (UI.repairOpen) UI.closeRepair();
        if (UI.invOpen) UI.toggleInventory(false);
        return;
      }
      if (e.code === 'KeyE') { interact(); return; }
      if (state === 'planet') Player.setKey(e.code, true);
      Ship.setKey(e.code, true);
      if ((state === 'space') && e.code === 'ShiftLeft') Ship.setPulse(true);
    });
    document.addEventListener('keyup', e => {
      Player.setKey(e.code, false);
      Ship.setKey(e.code, false);
      if (e.code === 'ShiftLeft') Ship.setPulse(false);
    });

    // Menu buttons
    UI.$('btn-start').addEventListener('click', () => startGame(false));
    UI.$('btn-creative').addEventListener('click', () => startGame(true));
    UI.$('btn-help').addEventListener('click', () => { Sfx.init(); Sfx.uiClick(); UI.$('help-panel').classList.remove('hidden'); });
    UI.$('btn-help-close').addEventListener('click', () => { Sfx.uiClick(); UI.$('help-panel').classList.add('hidden'); });
    document.querySelectorAll('.menu-btn').forEach(b => b.addEventListener('mouseenter', () => { Sfx.init(); Sfx.uiHover(); }));
  }

  function requestPointerLock() {
    if (!UI.invOpen && !UI.repairOpen) renderer.domElement.requestPointerLock();
  }

  // ---------- Main loop ----------
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (state === 'planet') {
      if (!UI.invOpen && !UI.repairOpen && pointerLocked) Player.update(dt);
      World.update(Player.pos.x, Player.pos.z);
      updateParticles(dt);
      updateInteract();
      Missions.update(dt);
      // Ship marker
      if (Missions.index <= 7) {
        UI.updateMarker('ship', Ship.state.pos.clone().add(new THREE.Vector3(0, 3, 0)), camera, Player.pos);
      }
      renderer.render(planetScene, camera);
    }
    else if (state === 'takeoff' || state === 'landing') {
      Ship.updateAnim(dt);
      World.update(Ship.state.pos.x, Ship.state.pos.z);
      renderer.render(planetScene, camera);
    }
    else if (state === 'atmo') {
      Ship.updateFlight(dt, false);
      Ship.updateChaseCamera(dt, Ship.state.speed > 45 ? 0.06 : 0);
      World.update(Ship.state.pos.x, Ship.state.pos.z, 6);
      Missions.update(dt);
      // HUD
      const alt = Ship.state.pos.y - World.surfaceHeight(Ship.state.pos.x, Ship.state.pos.z);
      UI.$('ship-speed').textContent = Math.round(Ship.state.speed * 10);
      UI.$('ship-alt').textContent = Math.round(alt);
      UI.setBar('bar-pulse', Ship.state.pulseCharge);
      UI.$('ship-tip').textContent = alt < 45 ? 'PRESS E TO LAND' : (Ship.state.pos.y > 210 ? 'KEEP CLIMBING · ATMOSPHERIC EXIT IMMINENT' : '');
      // Leave atmosphere
      if (Ship.state.pos.y >= 252 && Ship.state.pitch > 0.25) exitAtmosphere();
      renderer.render(planetScene, camera);
    }
    else if (state === 'space') {
      Ship.updateFlight(dt, true);
      Ship.updateChaseCamera(dt, Ship.state.pulsing ? 0.3 : 0);
      Space.update(dt, Ship.state.pos);
      Missions.update(dt);
      const { planet, dist } = Space.nearestPlanet(Ship.state.pos);
      UI.$('ship-speed').textContent = Math.round(Ship.state.speed * 10);
      UI.$('ship-alt').textContent = planet ? Math.round(dist) : '---';
      UI.setBar('bar-pulse', Ship.state.pulseCharge);
      UI.$('ship-tip').textContent = (planet && dist < planet.radius * 1.2) ? 'PRESS E TO ENTER ATMOSPHERE' : (Ship.state.pulsing ? '// PULSE FLIGHT ACTIVE' : '');
      Space.planets.forEach((p, i) => UI.updateMarker('planet' + i, p.mesh.position, camera, Ship.state.pos));
      renderer.render(Space.scene, camera);
    }
    else if (state === 'entry-in' || state === 'entry-out') {
      // Subtle shake during transition
      camera.position.x += (Math.random() - 0.5) * 0.3;
      camera.position.y += (Math.random() - 0.5) * 0.3;
      if (state === 'entry-in') { Space.update(dt, Ship.state.pos); renderer.render(Space.scene, camera); }
      else renderer.render(planetScene, camera);
    }
    else if (state === 'menu') {
      // Do not render 3D while in menu
    }
  }

  window.addEventListener('DOMContentLoaded', init);

  return {
    get state() { return state; },
    requestPointerLock, spawnBreakParticles,
  };
})();
