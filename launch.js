(() => {
  'use strict';

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  const el = {
    shade: document.getElementById('shade'),
    live: document.getElementById('live'),
    liveLabel: document.getElementById('liveLabel'),
    altValue: document.getElementById('altValue'),
    velValue: document.getElementById('velValue'),
    metValue: document.getElementById('metValue'),
    countdown: document.getElementById('countdown'),
    countdownValue: document.getElementById('countdownValue'),
    countdownLabel: document.getElementById('countdownLabel'),
    callout: document.getElementById('liftoffCallout'),
    endcard: document.getElementById('endcard'),
    statusWrap: document.querySelector('.mission__status'),
    statusText: document.getElementById('statusText'),
    detailText: document.getElementById('detailText'),
    audioBtn: document.getElementById('audioBtn'),
    audioLabel: document.getElementById('audioLabel'),
    replayBtn: document.getElementById('replayBtn')
  };

  const CFG = {
    countStart: 1.2,
    ignition: 4.2,
    liftoff: 4.9,
    separation: 8.6,
    meco: 12.7,
    reveal: 14.05
  };

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduceMotion = motionQuery.matches;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const pad2 = n => String(n).padStart(2, '0');
  const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
  const mixColor = (a, b, t) => [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t))
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rotatePoint(x, y, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  let W = 0;
  let H = 0;
  let DPR = 1;
  let padY = 0;
  let rocketX = 0;
  let R = 0;
  let coreW = 0;
  let boosterW = 0;
  let boosterOffset = 0;
  let towerX = 0;
  let towerH = 0;
  let towerW = 0;

  let stars = [];
  let ridges = [];
  let craters = [];
  let earthClouds = [];
  let cloudWisps = [];
  let facilityLights = [];
  let sprites = {};

  let particles = [];
  let sparks = [];
  let sceneTime = 0;
  let lastFrame = 0;
  let digitShown = null;
  let calloutShown = false;
  let phaseKey = '0';
  let liveShown = 'Live transmission';
  let uiTick = -1;
  let telemetryCache = { alt: '', vel: '', met: '' };
  let events = {
    engine: false,
    liftoff: false,
    separation: false,
    meco: false,
    reveal: false
  };
  let emission = { vent: 0, ground: 0, trail: 0, spark: 0 };
  let audioOn = false;
  let audio = null;
  let running = false;
  let replaying = false;
  let resizeQueued = false;

  function buildCraters() {
    const rand = mulberry32(9704);
    craters = Array.from({ length: 24 }, () => {
      const angle = rand() * TAU;
      const dist = Math.sqrt(rand()) * 0.72;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist * 0.9,
        r: 0.035 + rand() * 0.13,
        a: 0.035 + rand() * 0.1,
        maria: rand() > 0.78
      };
    });
  }

  function buildEarthClouds() {
    const rand = mulberry32(4431);
    earthClouds = Array.from({ length: 26 }, () => ({
      x: (rand() * 1.4) - 0.2,
      depth: Math.pow(rand(), 1.4) * 0.34,
      w: 0.05 + rand() * 0.28,
      h: 0.002 + rand() * 0.008,
      a: 0.025 + rand() * 0.065,
      tilt: (rand() - 0.5) * 0.035
    }));
  }

  function buildClouds() {
    const rand = mulberry32(1931);
    cloudWisps = [
      { x: 0.17, y: 0.31, size: 0.26, a: 0.045, drift: 0.0015 },
      { x: 0.44, y: 0.24, size: 0.34, a: 0.028, drift: -0.001 },
      { x: 0.74, y: 0.16, size: 0.21, a: 0.05, drift: 0.0012 },
      { x: 0.9, y: 0.33, size: 0.3, a: 0.035, drift: -0.0008 },
      { x: 0.34, y: 0.58, size: 0.46, a: 0.028, drift: 0.0007 },
      { x: 0.66, y: 0.63, size: 0.4, a: 0.025, drift: -0.0012 }
    ];
    for (let i = 0; i < 4; i += 1) {
      cloudWisps.push({
        x: rand(),
        y: 0.1 + rand() * 0.18,
        size: 0.12 + rand() * 0.12,
        a: 0.018 + rand() * 0.025,
        drift: (rand() - 0.5) * 0.002
      });
    }
  }

  function buildFacilityLights() {
    const rand = mulberry32(3107);
    facilityLights = Array.from({ length: 28 }, () => ({
      x: 0.12 + rand() * 0.78,
      y: rand() * 0.014,
      a: 0.16 + rand() * 0.52,
      size: 0.5 + rand() * 1.2,
      warm: rand() > 0.25
    }));
  }

  function createStars() {
    const rand = mulberry32(71239);
    const count = clamp(Math.round((W * H) / 6100), 150, 390);
    stars = Array.from({ length: count }, () => {
      const size = 0.3 + Math.pow(rand(), 2.2) * 1.8;
      return {
        x: rand(),
        y: Math.pow(rand(), 1.14) * 0.96,
        r: size,
        a: 0.22 + Math.pow(rand(), 1.7) * 0.7,
        tw: 0.35 + rand() * 1.8,
        ph: rand() * TAU,
        tint: rand(),
        flare: size > 1.35 && rand() > 0.45
      };
    });
  }

  function buildRidges() {
    function ridge(seed, base, amplitude, color) {
      const rand = mulberry32(seed);
      const points = [];
      const step = Math.max(16, W * 0.017);
      for (let x = -W * 0.12; x <= W * 1.12; x += step) {
        const wave =
          0.48 +
          Math.sin(x * 0.0031 + seed) * 0.22 +
          Math.sin(x * 0.0087 + seed * 1.7) * 0.12 +
          Math.sin(x * 0.017 + seed * 0.6) * 0.04 +
          (rand() - 0.5) * 0.09;
        points.push({ x, y: base - clamp(wave, 0.12, 0.92) * amplitude });
      }
      return { points, color };
    }
    ridges = [
      ridge(17.4, H * 0.716, H * 0.054, '#06131a'),
      ridge(58.2, H * 0.737, H * 0.027, '#040c11')
    ];
  }

  function makePuffSprite(seed, color) {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const rand = mulberry32(seed);
    g.translate(size / 2, size / 2);

    const core = g.createRadialGradient(0, 0, 0, 0, 0, size * 0.36);
    core.addColorStop(0, rgba(color, 0.22));
    core.addColorStop(0.5, rgba(color, 0.16));
    core.addColorStop(0.8, rgba(color, 0.05));
    core.addColorStop(1, rgba(color, 0));
    g.fillStyle = core;
    g.beginPath();
    g.arc(0, 0, size * 0.4, 0, TAU);
    g.fill();

    for (let i = 0; i < 28; i += 1) {
      const angle = rand() * TAU;
      const dist = Math.pow(rand(), 0.62) * size * 0.25;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist * 0.82;
      const radius = size * (0.075 + rand() * 0.14);
      const blob = g.createRadialGradient(
        x - radius * 0.18,
        y - radius * 0.24,
        0,
        x,
        y,
        radius
      );
      blob.addColorStop(0, rgba(color, 0.1 + rand() * 0.09));
      blob.addColorStop(0.55, rgba(color, 0.05 + rand() * 0.05));
      blob.addColorStop(1, rgba(color, 0));
      g.fillStyle = blob;
      g.beginPath();
      g.arc(x, y, radius, 0, TAU);
      g.fill();
    }

    return c;
  }

  function createPuffSprites() {
    sprites.cool = makePuffSprite(114, [157, 172, 178]);
    sprites.dark = makePuffSprite(288, [76, 88, 94]);
    sprites.warm = makePuffSprite(771, [221, 154, 103]);
    sprites.light = makePuffSprite(442, [196, 210, 212]);
  }

  function resize() {
    W = Math.max(320, window.innerWidth);
    H = Math.max(320, window.innerHeight);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;

    padY = H * 0.815;
    R = Math.min(H * 0.37, W * 0.62, 440);
    coreW = R * 0.145;
    boosterW = R * 0.072;
    boosterOffset = coreW * 0.5 + R * 0.022 + boosterW * 0.5;
    rocketX = W * 0.585;
    towerX = rocketX - R * 0.43;
    towerW = R * 0.15;
    towerH = R * 1.17;

    buildRidges();
    createStars();
  }

  function shortClock(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  }

  function announce(text) {
    if (!text) return;
    el.statusText.textContent = text;
  }

  function computeState(t) {
    const ft = Math.max(0, t - CFG.liftoff);
    const altPx = 0.5 * H * 0.075 * ft * ft;
    const rise =
      H * 0.22 * smoothstep(0, 3.4, ft) +
      H * 0.055 * smoothstep(7.0, 11.2, ft);
    const camY = Math.max(0, altPx - rise);
    const asc = smoothstep(0, 7.2, ft);
    const tilt =
      9 * DEG * smoothstep(1, 7.2, ft) +
      4 * DEG * smoothstep(7.2, 11.5, ft);
    const drift =
      R * 0.11 * smoothstep(0.8, 6.4, ft) +
      R * 0.022 * smoothstep(8, 11, ft);
    const throttle = clamp(
      smoothstep(CFG.ignition, CFG.ignition + 0.62, t) *
        (1 - smoothstep(CFG.meco - 0.15, CFG.meco + 0.85, t)),
      0,
      1
    );
    const sepElapsed = Math.max(0, t - CFG.separation);

    let shake = 0;
    if (t > CFG.ignition) {
      shake =
        (1.1 + 3.1 * Math.exp(-(t - CFG.ignition) * 2.2)) *
        smoothstep(CFG.ignition, CFG.ignition + 0.22, t);
      shake *= 1 - 0.55 * smoothstep(CFG.liftoff + 1, CFG.liftoff + 6, t);
    }
    if (t > CFG.separation) {
      shake += 3.3 * Math.exp(-(t - CFG.separation) * 4.4);
    }
    if (t > CFG.meco) {
      shake += 1.4 * Math.exp(-(t - CFG.meco) * 5.2);
    }
    shake *= reduceMotion ? 0.16 : 1;

    const shakeX =
      (Math.sin(t * 111.7) * 0.62 + Math.sin(t * 206.3) * 0.26) * shake;
    const shakeY =
      (Math.sin(t * 93.1 + 1.4) * 0.55 + Math.sin(t * 163.7) * 0.22) * shake;
    const roll = Math.sin(t * 67.3) * shake * 0.00016;

    let flash = 0;
    if (t >= CFG.ignition) flash += 0.095 * Math.exp(-(t - CFG.ignition) * 5.2);
    if (t >= CFG.liftoff) flash += 0.035 * Math.exp(-(t - CFG.liftoff) * 4.3);
    if (t >= CFG.separation) flash += 0.085 * Math.exp(-(t - CFG.separation) * 7.2);
    if (t >= CFG.meco) flash += 0.055 * Math.exp(-(t - CFG.meco) * 9);
    flash = Math.min(flash, 0.13);

    return {
      t,
      ft,
      altPx,
      rise,
      camY,
      asc,
      tilt,
      throttle,
      sepElapsed,
      x: rocketX + drift,
      engineY: padY - altPx,
      boosterAttached: t < CFG.separation,
      shakeX,
      shakeY,
      roll,
      flash
    };
  }

  function spawnPuff(options) {
    if (particles.length > 520) return;
    const rand = Math.random;
    particles.push({
      x: options.x,
      y: options.y,
      vx: options.vx || 0,
      vy: options.vy || 0,
      drag: options.drag ?? 0.22,
      buoy: options.buoy ?? 0,
      size: options.size,
      growth: options.growth,
      life: options.life,
      age: 0,
      alpha: options.alpha,
      kind: options.kind || 'cool',
      front: Boolean(options.front),
      rot: options.rot ?? rand() * TAU,
      spin: options.spin ?? (rand() - 0.5) * 0.08,
      stretch: options.stretch ?? 0.86 + rand() * 0.24
    });
  }

  function spawnSpark(x, y, options = {}) {
    if (sparks.length > 190) return;
    const rand = Math.random;
    sparks.push({
      x,
      y,
      vx: options.vx ?? (rand() - 0.5) * R * 0.75,
      vy: options.vy ?? R * (0.15 + rand() * 0.75),
      life: options.life ?? 0.45 + rand() * 0.75,
      age: 0,
      size: options.size ?? 0.65 + rand() * 2.1,
      heat: options.heat ?? 0.6 + rand() * 0.4,
      gravity: options.gravity ?? R * 0.9
    });
  }

  function pickGroundSmoke() {
    const roll = Math.random();
    if (roll < 0.28) return 'warm';
    if (roll < 0.39) return 'light';
    if (roll < 0.55) return 'dark';
    return 'cool';
  }

  function emitVent(dt) {
    emission.vent += dt * 2.8;
    while (emission.vent >= 1) {
      emission.vent -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      spawnPuff({
        x: rocketX + side * (boosterOffset + boosterW * 0.25) + (Math.random() - 0.5) * R * 0.02,
        y: padY - R * (0.33 + Math.random() * 0.2),
        vx: -side * R * (0.008 + Math.random() * 0.016),
        vy: -R * (0.02 + Math.random() * 0.02),
        drag: 0.55,
        size: R * (0.015 + Math.random() * 0.018),
        growth: 3.2,
        life: 1.7 + Math.random() * 1.4,
        alpha: 0.13 + Math.random() * 0.08,
        kind: Math.random() < 0.7 ? 'light' : 'cool'
      });
    }
  }

  function emitGroundSmoke(state, dt) {
    const strength = state.t > CFG.liftoff ? 1.28 : 0.8;
    emission.ground += dt * 40 * strength;
    while (emission.ground >= 1) {
      emission.ground -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const spread = Math.random();
      spawnPuff({
        x: rocketX + (Math.random() - 0.5) * R * 0.38,
        y: padY + R * (0.01 + Math.random() * 0.06),
        vx: side * R * (0.16 + spread * 0.95),
        vy: -R * (0.015 + Math.random() * 0.075),
        drag: 0.34,
        buoy: -R * 0.018,
        size: R * (0.055 + Math.random() * 0.085),
        growth: 2.8 + Math.random() * 2.7,
        life: 3.3 + Math.random() * 3.2,
        alpha: 0.24 + Math.random() * 0.22,
        kind: pickGroundSmoke(),
        front: Math.random() < 0.23,
        spin: (Math.random() - 0.5) * 0.05
      });
    }
  }

  function emitTrail(state, dt) {
    if (state.throttle < 0.02) return;
    emission.trail += dt * (34 + (1 - state.asc) * 18);
    while (emission.trail >= 1) {
      emission.trail -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const sourceX =
        state.boosterAttached && Math.random() < 0.44
          ? side * boosterOffset
          : (Math.random() - 0.5) * coreW * 0.3;
      const local = rotatePoint(sourceX, R * (0.045 + Math.random() * 0.08), state.tilt);
      spawnPuff({
        x: state.x + local.x + (Math.random() - 0.5) * R * 0.025,
        y: state.engineY + local.y + (Math.random() - 0.5) * R * 0.03,
        vx: (Math.random() - 0.5) * R * 0.15,
        vy: R * (0.04 + Math.random() * 0.17),
        drag: 0.5,
        buoy: -R * 0.006,
        size: R * (0.028 + Math.random() * 0.055),
        growth: 4.2 + Math.random() * 3.2,
        life: 2.1 + Math.random() * 2.6,
        alpha: 0.1 + Math.random() * 0.12,
        kind: Math.random() < 0.58 ? 'warm' : 'cool',
        front: false
      });
    }
  }

  function emitSparks(state, dt) {
    if (state.throttle < 0.02) return;
    emission.spark += dt * (17 + state.throttle * 16);
    while (emission.spark >= 1) {
      emission.spark -= 1;
      const p = rotatePoint(
        (Math.random() - 0.5) * coreW * 0.6,
        R * (0.06 + Math.random() * 0.16),
        state.tilt
      );
      spawnSpark(state.x + p.x, state.engineY + p.y, {
        vx: (Math.random() - 0.5) * R * 0.5,
        vy: R * (0.15 + Math.random() * 0.5),
        size: 0.55 + Math.random() * 1.6,
        life: 0.35 + Math.random() * 0.8
      });
    }
  }

  function ignitionBurst(state) {
    for (let i = 0; i < 27; i += 1) {
      const side = Math.random() < 0.5 ? -1 : 1;
      spawnPuff({
        x: rocketX + (Math.random() - 0.5) * R * 0.42,
        y: padY + Math.random() * R * 0.055,
        vx: side * R * (0.25 + Math.random() * 1.1),
        vy: -R * (0.015 + Math.random() * 0.11),
        drag: 0.38,
        buoy: -R * 0.02,
        size: R * (0.06 + Math.random() * 0.11),
        growth: 2.8 + Math.random() * 3.4,
        life: 3.6 + Math.random() * 3.6,
        alpha: 0.3 + Math.random() * 0.23,
        kind: pickGroundSmoke(),
        front: Math.random() < 0.24,
        spin: (Math.random() - 0.5) * 0.05
      });
    }
    for (let i = 0; i < 54; i += 1) {
      const side = Math.random() < 0.5 ? -1 : 1;
      spawnSpark(rocketX + (Math.random() - 0.5) * R * 0.3, padY - R * 0.01, {
        vx: side * R * (0.1 + Math.random() * 0.9),
        vy: R * (0.02 + Math.random() * 0.55),
        size: 0.7 + Math.random() * 2.4,
        life: 0.5 + Math.random() * 1.1
      });
    }
  }

  function liftoffBurst(state) {
    for (let i = 0; i < 18; i += 1) {
      const side = Math.random() < 0.5 ? -1 : 1;
      spawnPuff({
        x: rocketX + (Math.random() - 0.5) * R * 0.5,
        y: padY + Math.random() * R * 0.04,
        vx: side * R * (0.35 + Math.random() * 1.2),
        vy: -R * (0.015 + Math.random() * 0.1),
        drag: 0.35,
        buoy: -R * 0.02,
        size: R * (0.064 + Math.random() * 0.095),
        growth: 3 + Math.random() * 3,
        life: 3.6 + Math.random() * 3.2,
        alpha: 0.28 + Math.random() * 0.2,
        kind: pickGroundSmoke(),
        front: Math.random() < 0.3
      });
    }
  }

  function separationBurst(state) {
    for (const side of [-1, 1]) {
      const local = rotatePoint(side * boosterOffset, -R * 0.17, state.tilt);
      const x = state.x + local.x;
      const y = state.engineY + local.y;
      for (let i = 0; i < 11; i += 1) {
        spawnPuff({
          x: x + (Math.random() - 0.5) * boosterW * 1.6,
          y: y + (Math.random() - 0.5) * R * 0.08,
          vx: side * R * (0.1 + Math.random() * 0.35) + (Math.random() - 0.5) * R * 0.08,
          vy: -R * (0.015 + Math.random() * 0.07),
          drag: 0.5,
          buoy: -R * 0.008,
          size: R * (0.025 + Math.random() * 0.045),
          growth: 4,
          life: 1.8 + Math.random() * 1.8,
          alpha: 0.17 + Math.random() * 0.15,
          kind: Math.random() < 0.4 ? 'light' : 'cool'
        });
      }
      for (let i = 0; i < 12; i += 1) {
        spawnSpark(x, y, {
          vx: side * R * (0.15 + Math.random() * 0.6),
          vy: (Math.random() - 0.3) * R * 0.7,
          size: 0.6 + Math.random() * 1.8,
          life: 0.35 + Math.random() * 0.75
        });
      }
    }
  }

  function mecoBurst(state) {
    const p = rotatePoint(0, R * 0.04, state.tilt);
    for (let i = 0; i < 9; i += 1) {
      spawnPuff({
        x: state.x + p.x + (Math.random() - 0.5) * coreW,
        y: state.engineY + p.y + Math.random() * R * 0.05,
        vx: (Math.random() - 0.5) * R * 0.12,
        vy: R * (0.03 + Math.random() * 0.08),
        drag: 0.7,
        size: R * (0.02 + Math.random() * 0.03),
        growth: 4.5,
        life: 1.4 + Math.random() * 1.2,
        alpha: 0.1 + Math.random() * 0.08,
        kind: 'light'
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag;
      p.vy = p.vy * drag + p.buoy * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }

    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      s.age += dt;
      if (s.age >= s.life) {
        sparks.splice(i, 1);
        continue;
      }
      s.vy += s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
  }

  function updateSimulation(t, dt) {
    const state = computeState(t);

    if (!events.engine && t >= CFG.ignition) {
      events.engine = true;
      ignitionBurst(state);
    }
    if (!events.liftoff && t >= CFG.liftoff) {
      events.liftoff = true;
      liftoffBurst(state);
    }
    if (!events.separation && t >= CFG.separation) {
      events.separation = true;
      separationBurst(state);
    }
    if (!events.meco && t >= CFG.meco) {
      events.meco = true;
      mecoBurst(state);
    }

    if (t < CFG.ignition) emitVent(dt);
    if (t >= CFG.ignition && t < CFG.liftoff + 2.5) {
      emitGroundSmoke(state, dt);
    }
    if (t >= CFG.liftoff && t < CFG.meco + 0.7) {
      emitTrail(state, dt);
      emitSparks(state, dt);
    }

    updateParticles(dt);
    return state;
  }

  function initAudio() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return false;
    const ac = new AudioCtor();
    const master = ac.createGain();
    const compressor = ac.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.25;
    master.gain.value = 0;
    master.connect(compressor);
    compressor.connect(ac.destination);

    const buffer = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.021 * white) / 1.021;
      data[i] = brown * 3.4;
    }

    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const lowpass = ac.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 130;
    lowpass.Q.value = 0.7;
    const rumble = ac.createGain();
    rumble.gain.value = 0;
    source.connect(lowpass);
    lowpass.connect(rumble);
    rumble.connect(master);

    const highpass = ac.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 1200;
    highpass.Q.value = 0.5;
    const hiss = ac.createGain();
    hiss.gain.value = 0;
    source.connect(highpass);
    highpass.connect(hiss);
    hiss.connect(master);

    const sub = ac.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 33;
    const subGain = ac.createGain();
    subGain.gain.value = 0;
    sub.connect(subGain);
    subGain.connect(master);

    source.start();
    sub.start();

    audio = { ac, master, rumble, hiss, sub, subGain, lowpass };
    return true;
  }

  async function toggleAudio() {
    if (!audio && !initAudio()) {
      el.audioLabel.textContent = 'Audio unavailable';
      return;
    }
    try {
      if (audio.ac.state === 'suspended') await audio.ac.resume();
    } catch (error) {
      return;
    }
    audioOn = !audioOn;
    const now = audio.ac.currentTime;
    audio.master.gain.cancelScheduledValues(now);
    audio.master.gain.setTargetAtTime(audioOn ? 0.55 : 0, now, audioOn ? 0.22 : 0.08);
    el.audioBtn.classList.toggle('is-on', audioOn);
    el.audioBtn.setAttribute('aria-pressed', String(audioOn));
    el.audioBtn.setAttribute(
      'aria-label',
      audioOn ? 'Disable launch audio' : 'Enable launch audio'
    );
    el.audioLabel.textContent = audioOn ? 'Audio on' : 'Audio off';
    if (audioOn && sceneTime >= CFG.countStart && sceneTime < CFG.ignition) {
      cueTone(520, 0.11, 0.035);
    }
  }

  function cueTone(frequency, duration = 0.12, volume = 0.035) {
    if (!audioOn || !audio || audio.ac.state !== 'running') return;
    const ac = audio.ac;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function updateAudio(state) {
    if (!audio) return;
    const now = audio.ac.currentTime;
    const altitudeMuffle = 1 - 0.62 * state.asc;
    const engine = audioOn ? state.throttle : 0;
    audio.rumble.gain.setTargetAtTime(engine * 0.18 * altitudeMuffle, now, 0.08);
    audio.hiss.gain.setTargetAtTime(
      audioOn ? 0.0015 + engine * 0.022 * altitudeMuffle : 0,
      now,
      0.12
    );
    audio.subGain.gain.setTargetAtTime(engine * 0.11 * altitudeMuffle, now, 0.1);
    audio.sub.frequency.setTargetAtTime(31 + engine * 15, now, 0.15);
    audio.lowpass.frequency.setTargetAtTime(90 + engine * 210, now, 0.12);
  }

  function drawSky(state) {
    const asc = state.asc;
    const top = mixColor([2, 5, 11], [1, 2, 5], asc);
    const mid = mixColor([8, 18, 27], [2, 5, 11], asc);
    const low = mixColor([24, 43, 50], [4, 10, 17], asc);
    const ground = mixColor([12, 23, 27], [2, 5, 9], asc);

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, rgba(top, 1));
    sky.addColorStop(0.5, rgba(mid, 1));
    sky.addColorStop(0.77, rgba(low, 1));
    sky.addColorStop(1, rgba(ground, 1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const horizonGlow = ctx.createRadialGradient(
      W * 0.45,
      H * 0.71,
      0,
      W * 0.45,
      H * 0.71,
      W * 0.6
    );
    horizonGlow.addColorStop(0, `rgba(126, 158, 159, ${0.085 * (1 - asc * 0.8)})`);
    horizonGlow.addColorStop(0.42, `rgba(47, 87, 94, ${0.045 * (1 - asc * 0.8)})`);
    horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawNebula(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const blobs = [
      { x: 0.16, y: 0.16, r: 0.3, c: [52, 93, 138], a: 0.07 },
      { x: 0.76, y: 0.26, r: 0.25, c: [110, 77, 98], a: 0.038 },
      { x: 0.46, y: 0.43, r: 0.42, c: [45, 74, 89], a: 0.038 }
    ];
    for (const blob of blobs) {
      const radius = W * blob.r;
      const g = ctx.createRadialGradient(
        blob.x * W,
        blob.y * H,
        0,
        blob.x * W,
        blob.y * H,
        radius
      );
      g.addColorStop(0, rgba(blob.c, blob.a * (1 - state.asc * 0.25)));
      g.addColorStop(0.48, rgba(blob.c, blob.a * 0.38));
      g.addColorStop(1, rgba(blob.c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(blob.x * W - radius, blob.y * H - radius, radius * 2, radius * 2);
    }

    ctx.translate(W * 0.37, H * 0.31);
    ctx.rotate(-0.48);
    ctx.scale(1, 0.3);
    const band = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.37);
    band.addColorStop(0, 'rgba(164, 187, 218, 0.045)');
    band.addColorStop(0.5, 'rgba(102, 132, 164, 0.025)');
    band.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(-W * 0.6, -W * 0.6, W * 1.2, W * 1.2);
    ctx.restore();
  }

  function drawStars(state) {
    const shiftX = -state.t * 0.32 + Math.sin(state.t * 0.021) * 2;
    const shiftY = state.t * 0.18 + state.camY * 0.014;
    const brightness = 0.9 + state.asc * 0.1;
    const driftW = W + 40;
    const driftH = H + 40;

    ctx.save();
    for (const star of stars) {
      let x = (star.x * W + shiftX + 20) % driftW;
      let y = (star.y * H + shiftY + 20) % driftH;
      if (x < 0) x += driftW;
      if (y < 0) y += driftH;
      const twinkle = 0.65 + 0.35 * Math.sin(state.t * star.tw + star.ph);
      let alpha = star.a * twinkle * brightness;
      if (star.y > 0.63) alpha *= 0.62 + state.asc * 0.38;
      if (alpha <= 0.01) continue;

      let color;
      if (star.tint < 0.68) color = `rgba(226, 233, 240, ${alpha})`;
      else if (star.tint < 0.87) color = `rgba(241, 224, 195, ${alpha})`;
      else color = `rgba(185, 212, 245, ${alpha})`;

      ctx.fillStyle = color;
      if (star.r < 0.72) {
        ctx.fillRect(x, y, Math.max(0.8, star.r * 2), Math.max(0.8, star.r * 2));
      } else {
        ctx.beginPath();
        ctx.arc(x, y, star.r * 0.72, 0, TAU);
        ctx.fill();
      }

      if (star.flare) {
        ctx.strokeStyle = color.replace(/[\d.]+\)$/, `${alpha * 0.32})`);
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(x - star.r * 4, y);
        ctx.lineTo(x + star.r * 4, y);
        ctx.moveTo(x, y - star.r * 4);
        ctx.lineTo(x, y + star.r * 4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawMoon(state) {
    const radius = Math.min(W, H) * 0.043;
    const x = W * 0.815;
    const y = H * 0.19 + state.asc * H * 0.035;
    const alpha = 1 - state.asc * 0.42;
    if (alpha <= 0.02) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const halo = ctx.createRadialGradient(x, y, radius * 0.4, x, y, radius * 5.8);
    halo.addColorStop(0, `rgba(232, 214, 177, ${0.15 * alpha})`);
    halo.addColorStop(0.2, `rgba(189, 187, 172, ${0.07 * alpha})`);
    halo.addColorStop(0.55, `rgba(97, 120, 137, ${0.025 * alpha})`);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - radius * 6, y - radius * 6, radius * 12, radius * 12);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.clip();

    const disc = ctx.createRadialGradient(
      x - radius * 0.32,
      y - radius * 0.32,
      radius * 0.05,
      x,
      y,
      radius * 1.05
    );
    disc.addColorStop(0, '#f2ead8');
    disc.addColorStop(0.58, '#ded5c2');
    disc.addColorStop(1, '#bdb6a8');
    ctx.fillStyle = disc;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

    for (const crater of craters) {
      const cx = x + crater.x * radius;
      const cy = y + crater.y * radius;
      const cr = crater.r * radius;
      ctx.fillStyle = `rgba(72, 75, 76, ${crater.a * (crater.maria ? 0.75 : 0.48)})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cr, cr * 0.88, crater.x * 1.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(250, 242, 224, ${crater.a * 0.35})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(cx - cr * 0.12, cy - cr * 0.15, cr * 0.92, Math.PI * 0.95, Math.PI * 1.7);
      ctx.stroke();
    }

    const shade = ctx.createLinearGradient(
      x - radius,
      y - radius,
      x + radius,
      y + radius
    );
    shade.addColorStop(0, 'rgba(255, 250, 236, 0.03)');
    shade.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
    shade.addColorStop(1, 'rgba(31, 38, 43, 0.27)');
    ctx.fillStyle = shade;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(242, 236, 220, 0.18)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y, radius - 0.4, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawCloudWisps(state) {
    const fade = 1 - smoothstep(0.8, 4.8, state.ft);
    if (fade <= 0.01) return;
    ctx.save();
    for (const cloud of cloudWisps) {
      const drift = state.t * cloud.drift * W;
      const size = cloud.size * W;
      const x = cloud.x * W + drift;
      const y = cloud.y * H + state.camY * 0.025;
      const alpha = cloud.a * fade * (0.78 + Math.sin(state.t * 0.025 + cloud.x * 9) * 0.22);
      if (alpha < 0.002) continue;
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        sprites.cool,
        x - size * 0.5,
        y - size * 0.16,
        size,
        size * 0.32
      );
    }
    ctx.restore();
  }

  function drawHorizon(state) {
    const fade =
      (1 - smoothstep(H * 0.2, H * 0.9, state.camY)) *
      (1 - state.asc * 0.3);
    if (fade <= 0.01) return;
    const shift = state.camY * 0.22;

    ctx.save();
    ctx.translate(0, shift);
    ctx.globalAlpha = fade;

    const haze = ctx.createLinearGradient(0, H * 0.63, 0, H * 0.78);
    haze.addColorStop(0, 'rgba(79, 115, 124, 0)');
    haze.addColorStop(0.55, 'rgba(79, 115, 124, 0.055)');
    haze.addColorStop(1, 'rgba(8, 20, 24, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, H * 0.61, W, H * 0.2);

    const cityGlow = ctx.createRadialGradient(
      W * 0.28,
      H * 0.72,
      0,
      W * 0.28,
      H * 0.72,
      W * 0.28
    );
    cityGlow.addColorStop(0, 'rgba(214, 152, 95, 0.035)');
    cityGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = cityGlow;
    ctx.fillRect(0, H * 0.58, W, H * 0.22);

    for (let layer = 0; layer < ridges.length; layer += 1) {
      const ridge = ridges[layer];
      ctx.beginPath();
      ctx.moveTo(ridge.points[0].x, ridge.points[0].y);
      for (let i = 1; i < ridge.points.length; i += 1) {
        const prev = ridge.points[i - 1];
        const point = ridge.points[i];
        const midX = (prev.x + point.x) * 0.5;
        const midY = (prev.y + point.y) * 0.5;
        ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
      }
      ctx.lineTo(W * 1.12, H + 100);
      ctx.lineTo(-W * 0.12, H + 100);
      ctx.closePath();
      ctx.fillStyle = ridge.color;
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'screen';
    for (const light of facilityLights) {
      const x = light.x * W;
      const y = H * 0.731 + light.y * H;
      const color = light.warm ? '232, 168, 106' : '162, 200, 205';
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 6 + light.size * 3);
      glow.addColorStop(0, `rgba(${color}, ${light.a * 0.65})`);
      glow.addColorStop(0.28, `rgba(${color}, ${light.a * 0.2})`);
      glow.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(x - 10, y - 10, 20, 20);
      ctx.fillStyle = `rgba(${color}, ${light.a * 0.7})`;
      ctx.fillRect(x - 0.5, y - 0.5, light.size, light.size);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  function drawEarth(state) {
    const alpha = smoothstep(7.8, 10.7, state.t);
    if (alpha <= 0.002) return;

    const cx = W * 0.52;
    const top = H * 0.845;
    const rx = Math.max(W * 0.72, H * 0.9);
    const ry = H * 0.48;
    const cy = top + ry;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU);
    ctx.strokeStyle = 'rgba(76, 164, 213, 0.035)';
    ctx.lineWidth = 46;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(112, 197, 235, 0.055)';
    ctx.lineWidth = 17;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(177, 229, 250, 0.16)';
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.clip();

    const surface = ctx.createLinearGradient(0, top, 0, top + ry * 0.7);
    surface.addColorStop(0, '#17465d');
    surface.addColorStop(0.08, '#10384b');
    surface.addColorStop(0.28, '#08202f');
    surface.addColorStop(0.6, '#031019');
    surface.addColorStop(1, '#010407');
    ctx.fillStyle = surface;
    ctx.fillRect(0, top - 10, W, H);

    const limb = ctx.createLinearGradient(0, top, 0, top + H * 0.14);
    limb.addColorStop(0, 'rgba(121, 200, 230, 0.3)');
    limb.addColorStop(0.12, 'rgba(66, 144, 176, 0.08)');
    limb.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = limb;
    ctx.fillRect(0, top, W, H * 0.2);

    for (const cloud of earthClouds) {
      const x = (cloud.x - 0.2) * W;
      const y = top + cloud.depth * H * 0.65;
      const w = cloud.w * W;
      const h = cloud.h * H;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(cloud.tilt);
      ctx.fillStyle = `rgba(186, 224, 235, ${cloud.a})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, w, h, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    const nightSide = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    nightSide.addColorStop(0, 'rgba(0, 3, 6, 0.32)');
    nightSide.addColorStop(0.45, 'rgba(0, 3, 6, 0)');
    nightSide.addColorStop(0.8, 'rgba(6, 21, 30, 0.08)');
    nightSide.addColorStop(1, 'rgba(13, 36, 48, 0.22)');
    ctx.fillStyle = nightSide;
    ctx.fillRect(0, top - 2, W, H);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.04, Math.PI * 1.96);
    const rim = ctx.createLinearGradient(cx - rx, top, cx + rx, top);
    rim.addColorStop(0, 'rgba(126, 195, 225, 0.24)');
    rim.addColorStop(0.5, 'rgba(191, 235, 252, 0.7)');
    rim.addColorStop(1, 'rgba(234, 248, 255, 0.88)');
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.15;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function drawAuxiliaryStructures() {
    const tankX = rocketX + R * 1.74;
    const tankY = padY + R * 0.035;
    if (tankX > W + R * 0.3) return;
    ctx.save();
    const bodyGradient = ctx.createLinearGradient(0, tankY - R * 0.08, 0, tankY + R * 0.03);
    bodyGradient.addColorStop(0, '#1b252a');
    bodyGradient.addColorStop(0.5, '#0d1519');
    bodyGradient.addColorStop(1, '#070b0e');
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.roundRect(
      tankX - R * 0.19,
      tankY - R * 0.085,
      R * 0.38,
      R * 0.1,
      R * 0.035
    );
    ctx.fill();
    ctx.strokeStyle = 'rgba(139, 154, 158, 0.17)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(tankX - R * 0.12, tankY + R * 0.01, R * 0.022, R * 0.06);
    ctx.fillRect(tankX + R * 0.095, tankY + R * 0.01, R * 0.022, R * 0.06);
    const lamp = Math.sin(sceneTime * 2.2) > 0.15 ? 0.7 : 0.16;
    ctx.fillStyle = `rgba(255, 115, 71, ${lamp})`;
    ctx.beginPath();
    ctx.arc(tankX + R * 0.15, tankY - R * 0.05, Math.max(1, R * 0.006), 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawServiceArm(x1, y1, x2, y2, thickness) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy) || 1;
    const nx = (-dy / length) * thickness * 0.5;
    const ny = (dx / length) * thickness * 0.5;

    ctx.strokeStyle = 'rgba(95, 111, 116, 0.7)';
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(x1 + nx, y1 + ny);
    ctx.lineTo(x2 + nx, y2 + ny);
    ctx.moveTo(x1 - nx, y1 - ny);
    ctx.lineTo(x2 - nx, y2 - ny);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(73, 88, 94, 0.58)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    const panels = 4;
    for (let i = 0; i < panels; i += 1) {
      const a = i / panels;
      const b = (i + 1) / panels;
      const ax = lerp(x1, x2, a);
      const ay = lerp(y1, y2, a);
      const bx = lerp(x1, x2, b);
      const by = lerp(y1, y2, b);
      if (i % 2 === 0) {
        ctx.moveTo(ax + nx, ay + ny);
        ctx.lineTo(bx - nx, by - ny);
      } else {
        ctx.moveTo(ax - nx, ay - ny);
        ctx.lineTo(bx + nx, by + ny);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(169, 125, 88, 0.33)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(x1 + nx, y1 + ny - 0.5);
    ctx.lineTo(x2 + nx, y2 + ny - 0.5);
    ctx.stroke();

    ctx.fillStyle = 'rgba(35, 46, 51, 0.95)';
    ctx.fillRect(x2 - 3, y2 - 4, 6, 8);
    ctx.fillStyle = 'rgba(211, 147, 91, 0.32)';
    ctx.fillRect(x2 - 2.5, y2 - 3.5, 5, 1);
  }

  function drawTower(t) {
    const base = padY + R * 0.015;
    const top = padY - towerH;
    const half = towerW * 0.5;
    const levels = 15;

    const halfAt = y => {
      const u = clamp((y - top) / (base - top), 0, 1);
      return lerp(half * 0.72, half, u);
    };

    ctx.save();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(towerX, base + R * 0.012, R * 0.22, R * 0.025, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(19, 30, 35, 0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(towerX + 7, base - 2);
    ctx.lineTo(towerX + 4, top + 9);
    ctx.moveTo(towerX + 7 + towerW * 0.36, base - 2);
    ctx.lineTo(towerX + 4 + towerW * 0.32, top + 9);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(72, 87, 92, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(towerX - halfAt(base), base);
    ctx.lineTo(towerX - halfAt(top), top + 8);
    ctx.moveTo(towerX + halfAt(base), base);
    ctx.lineTo(towerX + halfAt(top), top + 8);
    ctx.stroke();

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(64, 79, 85, 0.68)';
    ctx.beginPath();
    for (let i = 0; i < levels; i += 1) {
      const y0 = base - (towerH / levels) * i;
      const y1 = base - (towerH / levels) * (i + 1);
      const xl0 = towerX - halfAt(y0);
      const xr0 = towerX + halfAt(y0);
      const xl1 = towerX - halfAt(y1);
      const xr1 = towerX + halfAt(y1);
      if (i % 2 === 0) {
        ctx.moveTo(xl0, y0);
        ctx.lineTo(xr1, y1);
      } else {
        ctx.moveTo(xr0, y0);
        ctx.lineTo(xl1, y1);
      }
      if (i % 2 === 1) {
        ctx.moveTo(xr0, y0);
        ctx.lineTo(xl0, y0);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(135, 148, 149, 0.23)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 2; i < levels; i += 4) {
      const y = base - (towerH / levels) * i;
      const h = halfAt(y);
      ctx.moveTo(towerX - h - 5, y);
      ctx.lineTo(towerX + h + 5, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(41, 55, 61, 0.85)';
    ctx.lineWidth = 0.9;
    const shaftW = towerW * 0.2;
    ctx.beginPath();
    ctx.moveTo(towerX - shaftW, base - R * 0.03);
    ctx.lineTo(towerX - shaftW, top + R * 0.08);
    ctx.moveTo(towerX + shaftW, base - R * 0.03);
    ctx.lineTo(towerX + shaftW, top + R * 0.08);
    for (let i = 2; i < levels - 1; i += 2) {
      const y = base - (towerH / levels) * i;
      ctx.moveTo(towerX - shaftW, y);
      ctx.lineTo(towerX + shaftW, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(89, 103, 107, 0.56)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(towerX + towerW * 0.45, top + R * 0.06);
    ctx.lineTo(towerX + towerW * 0.45, base - R * 0.02);
    ctx.stroke();

    const armUpperOpen = smoothstep(2.0, 3.45, t);
    const armLowerOpen = smoothstep(2.9, 4.3, t);
    const hingeUpper = {
      x: towerX + halfAt(padY - R * 0.63),
      y: padY - R * 0.63
    };
    const hingeLower = {
      x: towerX + halfAt(padY - R * 0.36),
      y: padY - R * 0.36
    };
    const armReach = rocketX - boosterOffset - boosterW * 0.45;

    function armAngle(hinge, baseY, open) {
      const dx = armReach - hinge.x;
      const angle = Math.atan2(baseY - hinge.y, dx);
      return angle - open * 1.15;
    }

    const upperEnd = {
      x: hingeUpper.x + Math.cos(armAngle(hingeUpper, hingeUpper.y, armUpperOpen)) *
        Math.abs(armReach - hingeUpper.x),
      y: hingeUpper.y + Math.sin(armAngle(hingeUpper, hingeUpper.y, armUpperOpen)) *
        Math.abs(armReach - hingeUpper.x)
    };
    const lowerEnd = {
      x: hingeLower.x + Math.cos(armAngle(hingeLower, hingeLower.y, armLowerOpen)) *
        Math.abs(armReach - hingeLower.x),
      y: hingeLower.y + Math.sin(armAngle(hingeLower, hingeLower.y, armLowerOpen)) *
        Math.abs(armReach - hingeLower.x)
    };

    drawServiceArm(hingeLower.x, hingeLower.y, lowerEnd.x, lowerEnd.y, 7);
    drawServiceArm(hingeUpper.x, hingeUpper.y, upperEnd.x, upperEnd.y, 8);

    ctx.fillStyle = 'rgba(41, 54, 59, 0.9)';
    for (const hinge of [hingeLower, hingeUpper]) {
      ctx.beginPath();
      ctx.arc(hinge.x, hinge.y, 3.2, 0, TAU);
      ctx.fill();
    }

    const craneY = top + 8;
    ctx.strokeStyle = 'rgba(69, 85, 90, 0.68)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(towerX - half * 0.7, craneY);
    ctx.lineTo(towerX - towerW * 1.75, craneY - 3);
    ctx.lineTo(towerX - towerW * 1.75, craneY + 1);
    ctx.moveTo(towerX, craneY);
    ctx.lineTo(towerX + towerW * 0.25, craneY);
    ctx.moveTo(towerX - towerW * 1.55, craneY - 3);
    ctx.lineTo(towerX - towerW * 1.55, craneY + R * 0.11);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(85, 100, 105, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(towerX, craneY);
    ctx.lineTo(towerX, top - R * 0.13);
    ctx.stroke();

    ctx.fillStyle = 'rgba(110, 121, 122, 0.5)';
    ctx.font = `500 ${Math.max(7, R * 0.026)}px ${getComputedStyle(document.documentElement).getPropertyValue('--display') || 'sans-serif'}`;
    ctx.textAlign = 'right';
    ctx.fillText('18', towerX + half * 0.82, top + towerH * 0.17);
    ctx.textAlign = 'left';

    const blink = (Math.sin(t * 2.35) + 1) * 0.5;
    const beaconAlpha = 0.35 + blink * 0.65;
    const beacons = [
      { x: towerX, y: top - R * 0.13, r: 1.6 },
      { x: towerX - towerW * 1.55, y: craneY + R * 0.11, r: 1.1 },
      { x: towerX + half * 0.4, y: padY - R * 0.28, r: 0.9 }
    ];
    for (const beacon of beacons) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const glow = ctx.createRadialGradient(
        beacon.x,
        beacon.y,
        0,
        beacon.x,
        beacon.y,
        R * 0.045
      );
      glow.addColorStop(0, `rgba(255, 92, 54, ${0.32 * beaconAlpha})`);
      glow.addColorStop(1, 'rgba(255, 92, 54, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(beacon.x - R * 0.05, beacon.y - R * 0.05, R * 0.1, R * 0.1);
      ctx.restore();
      ctx.fillStyle = `rgba(255, 128, 83, ${beaconAlpha})`;
      ctx.beginPath();
      ctx.arc(beacon.x, beacon.y, beacon.r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawFloodlights(t) {
    const lights = [
      { x: rocketX - R * 1.22, y: padY + R * 0.04, h: R * 0.46, dir: 1 },
      { x: rocketX + R * 1.25, y: padY + R * 0.04, h: R * 0.42, dir: -1 }
    ];
    const flicker = 0.94 + Math.sin(t * 7.7) * 0.02 + Math.sin(t * 13.1) * 0.015;

    ctx.save();
    for (const light of lights) {
      const headY = light.y - light.h;
      ctx.strokeStyle = 'rgba(37, 47, 51, 0.88)';
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(light.x, light.y);
      ctx.lineTo(light.x, headY + 2);
      ctx.moveTo(light.x - R * 0.028, light.y);
      ctx.lineTo(light.x, padY - R * 0.01);
      ctx.moveTo(light.x + R * 0.028, light.y);
      ctx.lineTo(light.x, padY - R * 0.01);
      ctx.stroke();

      ctx.fillStyle = '#111a1e';
      ctx.beginPath();
      ctx.roundRect(light.x - R * 0.05, headY - R * 0.017, R * 0.1, R * 0.034, 2);
      ctx.fill();

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const glow = ctx.createRadialGradient(
        light.x,
        headY,
        0,
        light.x,
        headY,
        R * 0.22
      );
      glow.addColorStop(0, `rgba(255, 221, 174, ${0.58 * flicker})`);
      glow.addColorStop(0.08, `rgba(255, 174, 107, ${0.22 * flicker})`);
      glow.addColorStop(1, 'rgba(255, 150, 81, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(light.x - R * 0.23, headY - R * 0.23, R * 0.46, R * 0.46);

      const beam = ctx.createLinearGradient(light.x, headY, rocketX, padY - R * 0.2);
      beam.addColorStop(0, `rgba(255, 195, 135, ${0.045 * flicker})`);
      beam.addColorStop(0.6, `rgba(255, 179, 112, ${0.018 * flicker})`);
      beam.addColorStop(1, 'rgba(255, 166, 97, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(light.x - R * 0.032, headY + R * 0.005);
      ctx.lineTo(rocketX - R * 0.16, padY - R * 0.22);
      ctx.lineTo(rocketX + R * 0.05, padY - R * 0.05);
      ctx.lineTo(light.x + R * 0.032, headY + R * 0.005);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = `rgba(255, 236, 199, ${0.85 * flicker})`;
      ctx.fillRect(light.x - R * 0.018, headY - 1, R * 0.036, 2);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawPad(t, state) {
    const apronTop = padY + R * 0.018;

    const ground = ctx.createLinearGradient(0, padY - R * 0.1, 0, padY + H * 0.9);
    ground.addColorStop(0, '#0b1215');
    ground.addColorStop(0.25, '#070b0d');
    ground.addColorStop(0.7, '#040607');
    ground.addColorStop(1, '#020304');
    ctx.fillStyle = ground;
    ctx.fillRect(-W * 0.25, padY - R * 0.12, W * 1.5, H * 2);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const foundationGlow = ctx.createRadialGradient(
      rocketX,
      padY,
      R * 0.1,
      rocketX,
      padY,
      R * 1.8
    );
    foundationGlow.addColorStop(0, 'rgba(204, 132, 78, 0.07)');
    foundationGlow.addColorStop(1, 'rgba(116, 86, 68, 0)');
    ctx.fillStyle = foundationGlow;
    ctx.fillRect(rocketX - R * 1.8, padY - R * 0.5, R * 3.6, R * 1.6);
    ctx.restore();

    const apron = ctx.createLinearGradient(0, apronTop, 0, padY + R * 0.3);
    apron.addColorStop(0, '#171c1d');
    apron.addColorStop(0.12, '#101517');
    apron.addColorStop(0.6, '#0a0e10');
    apron.addColorStop(1, '#060809');
    ctx.fillStyle = apron;
    ctx.beginPath();
    ctx.moveTo(rocketX - R * 1.52, apronTop);
    ctx.lineTo(rocketX + R * 1.52, apronTop);
    ctx.lineTo(rocketX + R * 2.05, padY + R * 0.29);
    ctx.lineTo(rocketX - R * 2.05, padY + R * 0.29);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(202, 195, 177, 0.15)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(rocketX - R * 1.52, apronTop);
    ctx.lineTo(rocketX + R * 1.52, apronTop);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(197, 190, 174, 0.045)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = -4; i <= 4; i += 1) {
      const topX = rocketX + i * R * 0.34;
      const bottomX = rocketX + i * R * 0.46;
      ctx.moveTo(topX, apronTop + 2);
      ctx.lineTo(bottomX, padY + R * 0.28);
    }
    for (let i = 1; i < 4; i += 1) {
      const y = lerp(apronTop, padY + R * 0.28, i / 4);
      const spread = lerp(1.52, 2.05, i / 4);
      ctx.moveTo(rocketX - R * spread, y);
      ctx.lineTo(rocketX + R * spread, y);
    }
    ctx.stroke();

    ctx.save();
    ctx.setLineDash([R * 0.034, R * 0.028]);
    ctx.strokeStyle = 'rgba(214, 204, 183, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(rocketX, padY + R * 0.105, R * 0.92, R * 0.11, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(214, 208, 191, 0.042)';
    ctx.font = `500 ${R * 0.2}px ${getComputedStyle(document.documentElement).getPropertyValue('--display') || 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.fillText('18', rocketX - R * 0.83, padY + R * 0.225);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(221, 176, 96, 0.23)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(rocketX - R * 0.52, padY + R * 0.16);
    ctx.lineTo(rocketX + R * 0.52, padY + R * 0.16);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(14, 19, 20, 0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([R * 0.026, R * 0.026]);
    ctx.beginPath();
    ctx.moveTo(rocketX - R * 0.52, padY + R * 0.16);
    ctx.lineTo(rocketX + R * 0.52, padY + R * 0.16);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    drawAuxiliaryStructures();

    const railY = padY - R * 0.005;
    ctx.strokeStyle = 'rgba(78, 92, 96, 0.35)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 0; i < 9; i += 1) {
      const x = rocketX - R * 1.4 + i * R * 0.35;
      if (x > rocketX - R * 0.26 && x < rocketX + R * 0.26) continue;
      ctx.moveTo(x, railY);
      ctx.lineTo(x, railY - R * 0.045);
    }
    ctx.moveTo(rocketX - R * 1.4, railY - R * 0.043);
    ctx.lineTo(rocketX - R * 0.23, railY - R * 0.043);
    ctx.moveTo(rocketX + R * 0.23, railY - R * 0.043);
    ctx.lineTo(rocketX + R * 1.4, railY - R * 0.043);
    ctx.stroke();

    const trenchY = padY + R * 0.01;
    ctx.fillStyle = 'rgba(1, 3, 4, 0.9)';
    ctx.beginPath();
    ctx.ellipse(rocketX, trenchY, R * 0.332, R * 0.033, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(102, 84, 69, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(rocketX, trenchY, R * 0.332, R * 0.033, 0, 0, TAU);
    ctx.stroke();

    const clampOpen = smoothstep(CFG.ignition, CFG.liftoff + 0.22, t);
    for (const side of [-1, 1]) {
      const pivotX = rocketX + side * R * 0.205;
      const pivotY = padY + R * 0.018;
      const reachX = rocketX + side * R * 0.085;
      const reachY = padY - R * 0.054;
      const angle = Math.atan2(reachY - pivotY, reachX - pivotX) - side * clampOpen * 0.78;
      const length = R * 0.145;
      const endX = pivotX + Math.cos(angle) * length;
      const endY = pivotY + Math.sin(angle) * length;

      ctx.strokeStyle = 'rgba(54, 64, 66, 0.95)';
      ctx.lineWidth = R * 0.018;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(150, 120, 94, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY - R * 0.004);
      ctx.lineTo(endX, endY - R * 0.004);
      ctx.stroke();
      ctx.fillStyle = '#222b2d';
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, R * 0.018, 0, TAU);
      ctx.fill();
    }

    drawFloodlights(t);
    drawTower(t);
  }

  function drawEngineLight(state) {
    if (state.throttle <= 0.015) return;
    const flicker = 0.88 + Math.sin(state.t * 47.1) * 0.07 + Math.sin(state.t * 73.3) * 0.05;
    const radius = R * (1.55 - state.asc * 0.48);
    const x = state.x;
    const y = padY - state.altPx;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, `rgba(255, 205, 142, ${0.23 * state.throttle * flicker})`);
    glow.addColorStop(0.1, `rgba(255, 154, 82, ${0.16 * state.throttle * flicker})`);
    glow.addColorStop(0.4, `rgba(232, 99, 45, ${0.055 * state.throttle * flicker})`);
    glow.addColorStop(1, 'rgba(170, 55, 19, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  function drawSmoke(state, frontPass) {
    const screenCam = state.camY;
    for (const puff of particles) {
      if (puff.front !== frontPass) continue;
      const age = puff.age / puff.life;
      const growth = 1 + (1 - Math.pow(1 - age, 2)) * puff.growth;
      const size = puff.size * growth;
      const screenY = puff.y + screenCam;
      if (
        screenY + size < -20 ||
        screenY - size > H + 20 ||
        puff.x + size < -20 ||
        puff.x - size > W + 20
      ) {
        continue;
      }
      const fadeIn = Math.min(1, puff.age * 7);
      const fadeOut = 1 - smoothstep(0.55, 1, age);
      const alpha = puff.alpha * fadeIn * fadeOut;
      if (alpha < 0.002) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(puff.x, puff.y);
      ctx.rotate(puff.rot);
      ctx.drawImage(
        sprites[puff.kind],
        -size * 0.5,
        -size * puff.stretch * 0.5,
        size,
        size * puff.stretch
      );
      ctx.restore();
    }
  }

  function drawSparks(state) {
    const screenCam = state.camY;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (const spark of sparks) {
      const screenY = spark.y + screenCam;
      if (screenY < -30 || screenY > H + 30) continue;
      const life = 1 - spark.age / spark.life;
      const alpha = clamp(life * 1.25, 0, 1) * spark.heat;
      if (alpha <= 0.01) continue;
      const dx = clamp(spark.vx * 0.012, -5, 5);
      const dy = clamp(spark.vy * 0.012, -5, 5);
      ctx.strokeStyle = `rgba(255, ${150 + Math.round(spark.heat * 90)}, ${70 + Math.round(spark.heat * 70)}, ${alpha})`;
      ctx.lineWidth = spark.size * (0.55 + life * 0.45);
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      ctx.lineTo(spark.x - dx, spark.y - dy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFins() {
    const h = coreW * 0.5;
    const finGradient = ctx.createLinearGradient(-h * 1.2, 0, h * 1.2, 0);
    finGradient.addColorStop(0, '#11181b');
    finGradient.addColorStop(0.55, '#263236');
    finGradient.addColorStop(1, '#0b1114');

    ctx.fillStyle = finGradient;
    ctx.beginPath();
    ctx.moveTo(-h * 0.82, -R * 0.2);
    ctx.quadraticCurveTo(-h * 1.16, -R * 0.075, -h * 1.13, -R * 0.012);
    ctx.lineTo(-h * 0.42, -R * 0.03);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(h * 0.82, -R * 0.2);
    ctx.quadraticCurveTo(h * 1.16, -R * 0.075, h * 1.13, -R * 0.012);
    ctx.lineTo(h * 0.42, -R * 0.03);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(165, 179, 180, 0.16)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-h * 0.88, -R * 0.185);
    ctx.quadraticCurveTo(-h * 1.11, -R * 0.072, -h * 1.09, -R * 0.018);
    ctx.moveTo(h * 0.88, -R * 0.185);
    ctx.quadraticCurveTo(h * 1.11, -R * 0.072, h * 1.09, -R * 0.018);
    ctx.stroke();
  }

  function drawBoosterBody(x, sign, state) {
    const w = boosterW;
    const tip = -R * 0.686;
    const bodyTop = -R * 0.565;
    ctx.save();
    ctx.translate(x, 0);

    ctx.beginPath();
    ctx.moveTo(-w * 0.46, bodyTop);
    ctx.bezierCurveTo(
      -w * 0.45,
      tip + R * 0.045,
      -w * 0.2,
      tip + R * 0.005,
      0,
      tip
    );
    ctx.bezierCurveTo(
      w * 0.2,
      tip + R * 0.005,
      w * 0.45,
      tip + R * 0.045,
      w * 0.46,
      bodyTop
    );
    ctx.lineTo(w * 0.42, -R * 0.022);
    ctx.lineTo(-w * 0.42, -R * 0.022);
    ctx.closePath();

    const body = ctx.createLinearGradient(-w * 0.6, 0, w * 0.6, 0);
    body.addColorStop(0, sign < 0 ? '#535d61' : '#434d52');
    body.addColorStop(0.24, '#afb2aa');
    body.addColorStop(0.5, '#d8d4c8');
    body.addColorStop(0.75, '#a5a59d');
    body.addColorStop(1, '#3d454a');
    ctx.fillStyle = body;
    ctx.fill();

    ctx.save();
    ctx.clip();
    const cap = ctx.createLinearGradient(0, tip, 0, bodyTop);
    cap.addColorStop(0, '#28343a');
    cap.addColorStop(0.5, '#151e22');
    cap.addColorStop(1, '#0c1215');
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.moveTo(-w * 0.6, tip - 2);
    ctx.lineTo(w * 0.6, tip - 2);
    ctx.lineTo(w * 0.6, bodyTop - R * 0.018);
    ctx.quadraticCurveTo(0, bodyTop + R * 0.012, -w * 0.6, bodyTop - R * 0.018);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(182, 92, 55, 0.78)';
    ctx.fillRect(-w, bodyTop + R * 0.016, w * 2, Math.max(1.2, R * 0.006));

    const warm = ctx.createLinearGradient(0, -R * 0.26, 0, 0);
    warm.addColorStop(0, 'rgba(255, 158, 91, 0)');
    warm.addColorStop(1, `rgba(255, 148, 76, ${0.07 + state.throttle * 0.28})`);
    ctx.fillStyle = warm;
    ctx.fillRect(-w, -R * 0.26, w * 2, R * 0.26);

    ctx.fillStyle = 'rgba(36, 43, 44, 0.34)';
    ctx.fillRect(-w * 0.12, bodyTop + R * 0.035, Math.max(0.5, w * 0.025), R * 0.47);
    ctx.fillStyle = 'rgba(225, 217, 201, 0.22)';
    ctx.fillRect(w * 0.31, bodyTop + R * 0.03, Math.max(0.5, w * 0.02), R * 0.5);
    ctx.restore();

    ctx.strokeStyle = 'rgba(17, 23, 25, 0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-w * 0.46, bodyTop);
    ctx.bezierCurveTo(-w * 0.45, tip + R * 0.045, -w * 0.2, tip + R * 0.005, 0, tip);
    ctx.bezierCurveTo(w * 0.2, tip + R * 0.005, w * 0.45, tip + R * 0.045, w * 0.46, bodyTop);
    ctx.stroke();

    ctx.fillStyle = '#1b2428';
    ctx.beginPath();
    ctx.moveTo(-w * 0.22, -R * 0.022);
    ctx.lineTo(w * 0.22, -R * 0.022);
    ctx.lineTo(w * 0.3, 0);
    ctx.lineTo(-w * 0.3, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(118, 133, 136, 0.25)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-w * 0.26, -R * 0.006);
    ctx.lineTo(w * 0.26, -R * 0.006);
    ctx.stroke();

    ctx.restore();
  }

  function drawPlume(x, y, width, length, throttle, vacuum, seed) {
    if (throttle <= 0.01) return;
    const pulse =
      Math.sin(sceneTime * 47.3 + seed * 2.1) * 0.5 +
      Math.sin(sceneTime * 82.7 + seed) * 0.35;
    const lengthScale = 1 + pulse * 0.06;
    const widthScale = 1 + vacuum * 0.72;
    const L = length * (0.58 + throttle * 0.42) * lengthScale;
    const Wf = width * widthScale;

    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'screen';

    const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, Wf * 3.2);
    bloom.addColorStop(0, `rgba(255, 238, 198, ${0.35 * throttle})`);
    bloom.addColorStop(0.24, `rgba(255, 176, 96, ${0.16 * throttle})`);
    bloom.addColorStop(1, 'rgba(255, 109, 42, 0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(-Wf * 3.2, -Wf * 3.2, Wf * 6.4, Wf * 6.4);

    function flameShape(w, len, tipOffset) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.5, 0);
      ctx.bezierCurveTo(
        -w * 0.72,
        len * 0.16,
        -w * 0.5 + tipOffset * 0.15,
        len * 0.66,
        tipOffset,
        len
      );
      ctx.bezierCurveTo(
        w * 0.42 + tipOffset * 0.3,
        len * 0.72,
        w * 0.7,
        len * 0.18,
        w * 0.5,
        0
      );
      ctx.closePath();
    }

    const outer = ctx.createLinearGradient(0, 0, 0, L);
    outer.addColorStop(0, `rgba(255, 158, 78, ${0.46 * throttle})`);
    outer.addColorStop(0.25, `rgba(255, 129, 51, ${0.36 * throttle})`);
    outer.addColorStop(0.68, `rgba(237, 88, 31, ${0.15 * throttle})`);
    outer.addColorStop(1, 'rgba(200, 50, 16, 0)');
    ctx.fillStyle = outer;
    flameShape(Wf * 1.15, L * 0.94, Math.sin(sceneTime * 55 + seed) * Wf * 0.11);
    ctx.fill();

    const middleGradient = ctx.createLinearGradient(0, 0, 0, L * 0.84);
    middleGradient.addColorStop(0, `rgba(255, 239, 198, ${0.82 * throttle})`);
    middleGradient.addColorStop(0.32, `rgba(255, 197, 111, ${0.6 * throttle})`);
    middleGradient.addColorStop(0.72, `rgba(255, 129, 53, ${0.22 * throttle})`);
    middleGradient.addColorStop(1, 'rgba(255, 109, 42, 0)');
    ctx.fillStyle = middleGradient;
    flameShape(Wf * 0.64, L * 0.8, Math.sin(sceneTime * 61 + seed * 1.7) * Wf * 0.06);
    ctx.fill();

    const core = ctx.createLinearGradient(0, 0, 0, L * 0.64);
    core.addColorStop(0, `rgba(255, 255, 242, ${0.95 * throttle})`);
    core.addColorStop(0.4, `rgba(255, 243, 204, ${0.65 * throttle})`);
    core.addColorStop(0.85, `rgba(255, 201, 124, ${0.16 * throttle})`);
    core.addColorStop(1, 'rgba(255, 177, 91, 0)');
    ctx.fillStyle = core;
    flameShape(Wf * 0.27, L * 0.55, Math.sin(sceneTime * 68.4 + seed) * Wf * 0.03);
    ctx.fill();

    if (vacuum < 0.7) {
      const diamondAlpha = (1 - vacuum / 0.7) * throttle;
      for (let i = 0; i < 5; i += 1) {
        const dy = L * (0.105 + i * 0.105);
        const dw = Wf * (0.17 - i * 0.023);
        const dh = Math.max(1, L * (0.009 - i * 0.0008));
        ctx.fillStyle = `rgba(255, 250, 226, ${0.22 * diamondAlpha})`;
        ctx.beginPath();
        ctx.ellipse(Math.sin(i * 2.1 + seed) * Wf * 0.025, dy, dw, dh, 0, 0, TAU);
        ctx.fill();
      }
    }

    const base = ctx.createRadialGradient(0, 0, 0, 0, 0, Wf * 1.05);
    base.addColorStop(0, `rgba(255, 255, 240, ${0.9 * throttle})`);
    base.addColorStop(0.28, `rgba(255, 226, 170, ${0.4 * throttle})`);
    base.addColorStop(1, 'rgba(255, 154, 80, 0)');
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(0, 0, Wf * 1.05, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  function drawNozzle(x, width, state) {
    const height = R * 0.073;
    const bell = ctx.createLinearGradient(x - width * 0.5, 0, x + width * 0.5, 0);
    bell.addColorStop(0, '#293236');
    bell.addColorStop(0.25, '#667174');
    bell.addColorStop(0.5, '#353f43');
    bell.addColorStop(0.8, '#171f23');
    bell.addColorStop(1, '#0a1013');

    ctx.fillStyle = bell;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.31, -height);
    ctx.quadraticCurveTo(x - width * 0.33, -height * 0.38, x - width * 0.5, 0);
    ctx.lineTo(x + width * 0.5, 0);
    ctx.quadraticCurveTo(x + width * 0.33, -height * 0.38, x + width * 0.31, -height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(196, 196, 180, 0.2)';
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.24, -height * 0.65);
    ctx.quadraticCurveTo(x - width * 0.24, -height * 0.2, x - width * 0.38, -1);
    ctx.moveTo(x + width * 0.24, -height * 0.65);
    ctx.quadraticCurveTo(x + width * 0.24, -height * 0.2, x + width * 0.38, -1);
    ctx.stroke();

    ctx.fillStyle = 'rgba(7, 11, 13, 0.95)';
    ctx.beginPath();
    ctx.ellipse(x, -0.6, width * 0.44, Math.max(0.8, height * 0.07), 0, 0, TAU);
    ctx.fill();

    if (state.throttle > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const hot = ctx.createRadialGradient(x, 0, 0, x, 0, width * 0.8);
      hot.addColorStop(0, `rgba(255, 245, 210, ${0.82 * state.throttle})`);
      hot.addColorStop(0.25, `rgba(255, 176, 99, ${0.36 * state.throttle})`);
      hot.addColorStop(1, 'rgba(255, 119, 47, 0)');
      ctx.fillStyle = hot;
      ctx.beginPath();
      ctx.ellipse(x, 0, width * 0.8, Math.max(1.5, height * 0.15), 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCore(state) {
    const h = coreW * 0.5;
    const tip = -R;
    const bodyTop = -R * 0.78;
    const bodyBase = -R * 0.068;

    function traceBody() {
      ctx.beginPath();
      ctx.moveTo(0, tip);
      ctx.bezierCurveTo(h * 0.28, -R * 0.965, h * 0.94, -R * 0.875, h, bodyTop);
      ctx.lineTo(h * 0.94, bodyBase);
      ctx.lineTo(-h * 0.94, bodyBase);
      ctx.lineTo(-h, bodyTop);
      ctx.bezierCurveTo(-h * 0.94, -R * 0.875, -h * 0.28, -R * 0.965, 0, tip);
      ctx.closePath();
    }

    ctx.save();
    traceBody();
    const body = ctx.createLinearGradient(-h, 0, h, 0);
    body.addColorStop(0, '#343e43');
    body.addColorStop(0.1, '#717a7c');
    body.addColorStop(0.27, '#c1c1b7');
    body.addColorStop(0.46, '#e2ddd0');
    body.addColorStop(0.62, '#cdc9bd');
    body.addColorStop(0.8, '#8e9290');
    body.addColorStop(0.96, '#4a5458');
    body.addColorStop(1, '#303a3f');
    ctx.fillStyle = body;
    ctx.fill();

    ctx.save();
    traceBody();
    ctx.clip();

    const rightShade = ctx.createLinearGradient(-h, 0, h, 0);
    rightShade.addColorStop(0, 'rgba(2, 8, 12, 0.3)');
    rightShade.addColorStop(0.33, 'rgba(2, 8, 12, 0)');
    rightShade.addColorStop(0.8, 'rgba(255, 255, 240, 0.055)');
    rightShade.addColorStop(1, 'rgba(255, 255, 240, 0)');
    ctx.fillStyle = rightShade;
    ctx.fillRect(-h, tip, h * 2, R);

    const lowerLight = ctx.createLinearGradient(0, bodyBase, 0, -R * 0.38);
    lowerLight.addColorStop(0, `rgba(255, 168, 96, ${0.08 + state.throttle * 0.26})`);
    lowerLight.addColorStop(0.35, `rgba(255, 147, 83, ${0.03 + state.throttle * 0.08})`);
    lowerLight.addColorStop(1, 'rgba(255, 133, 80, 0)');
    ctx.fillStyle = lowerLight;
    ctx.fillRect(-h, -R * 0.4, h * 2, R * 0.4);

    ctx.strokeStyle = 'rgba(36, 42, 43, 0.34)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(h * 0.17, -R * 0.72);
    ctx.lineTo(h * 0.17, -R * 0.095);
    ctx.moveTo(-h * 0.46, -R * 0.72);
    ctx.lineTo(-h * 0.46, -R * 0.12);
    ctx.stroke();

    ctx.fillStyle = 'rgba(28, 34, 35, 0.36)';
    ctx.fillRect(-h, -R * 0.322, h * 2, Math.max(2.5, R * 0.014));
    ctx.fillStyle = 'rgba(232, 228, 214, 0.18)';
    ctx.fillRect(-h, -R * 0.324, h * 2, 0.6);
    for (let i = 0; i < 7; i += 1) {
      ctx.fillStyle = 'rgba(226, 222, 209, 0.22)';
      ctx.beginPath();
      ctx.arc(-h * 0.72 + i * h * 0.24, -R * 0.302, 0.6, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(178, 92, 55, 0.78)';
    ctx.fillRect(-h, -R * 0.724, h * 2, Math.max(2, R * 0.008));
    ctx.fillStyle = 'rgba(58, 66, 66, 0.45)';
    ctx.fillRect(-h, -R * 0.19, h * 2, Math.max(1, R * 0.004));

    ctx.strokeStyle = 'rgba(32, 38, 39, 0.58)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, -R * 0.55, h * 0.24, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(182, 91, 54, 0.9)';
    ctx.beginPath();
    ctx.arc(0, -R * 0.55, Math.max(0.8, h * 0.05), 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(32, 38, 39, 0.45)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-h * 0.62, -R * 0.55);
    ctx.lineTo(-h * 0.3, -R * 0.55);
    ctx.moveTo(h * 0.3, -R * 0.55);
    ctx.lineTo(h * 0.62, -R * 0.55);
    ctx.stroke();

    ctx.font = `500 ${Math.max(5.2, coreW * 0.13)}px ${getComputedStyle(document.documentElement).getPropertyValue('--display') || 'sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(39, 45, 46, 0.54)';
    ctx.fillText('AURORA', 0, -R * 0.424);

    ctx.strokeStyle = 'rgba(30, 37, 39, 0.25)';
    ctx.lineWidth = Math.max(0.5, coreW * 0.018);
    ctx.beginPath();
    ctx.moveTo(h * 0.68, -R * 0.71);
    ctx.lineTo(h * 0.68, -R * 0.095);
    for (let i = 0; i < 8; i += 1) {
      const y = -R * 0.68 + i * R * 0.074;
      ctx.moveTo(h * 0.62, y);
      ctx.lineTo(h * 0.74, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(220, 219, 207, 0.13)';
    for (let i = 0; i < 7; i += 1) {
      const x = -h * 0.65 + i * h * 0.21;
      ctx.fillRect(x, -R * 0.12 - (i % 3) * R * 0.018, Math.max(0.4, h * 0.018), R * (0.02 + (i % 2) * 0.025));
    }

    ctx.fillStyle = 'rgba(21, 27, 30, 0.92)';
    ctx.beginPath();
    ctx.moveTo(-h * 1.04, tip - 2);
    ctx.lineTo(h * 1.04, tip - 2);
    ctx.lineTo(h * 1.04, -R * 0.788);
    ctx.quadraticCurveTo(0, -R * 0.755, -h * 1.04, -R * 0.788);
    ctx.closePath();
    ctx.fill();

    const noseLight = ctx.createLinearGradient(-h, tip, h, tip);
    noseLight.addColorStop(0, 'rgba(255, 255, 255, 0.02)');
    noseLight.addColorStop(0.7, 'rgba(255, 255, 255, 0.08)');
    noseLight.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
    ctx.fillStyle = noseLight;
    ctx.fillRect(-h, tip, h * 2, R * 0.22);

    ctx.strokeStyle = 'rgba(194, 99, 59, 0.9)';
    ctx.lineWidth = Math.max(1.2, R * 0.007);
    ctx.beginPath();
    ctx.moveTo(-h * 0.97, -R * 0.754);
    ctx.quadraticCurveTo(0, -R * 0.725, h * 0.97, -R * 0.754);
    ctx.stroke();

    ctx.restore();

    traceBody();
    ctx.strokeStyle = 'rgba(7, 12, 14, 0.72)';
    ctx.lineWidth = 1.05;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(204, 220, 225, 0.26)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(h * 0.8, -R * 0.86);
    ctx.bezierCurveTo(h * 0.98, -R * 0.77, h * 0.98, -R * 0.6, h * 0.93, -R * 0.3);
    ctx.stroke();

    const skirt = ctx.createLinearGradient(-h, 0, h, 0);
    skirt.addColorStop(0, '#1c2427');
    skirt.addColorStop(0.45, '#414b4e');
    skirt.addColorStop(1, '#12191c');
    ctx.fillStyle = skirt;
    ctx.beginPath();
    ctx.moveTo(-h * 0.94, bodyBase);
    ctx.lineTo(h * 0.94, bodyBase);
    ctx.lineTo(h * 0.83, -R * 0.01);
    ctx.lineTo(-h * 0.83, -R * 0.01);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(177, 181, 170, 0.14)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-h * 0.9, bodyBase);
    ctx.lineTo(-h * 0.8, -R * 0.012);
    ctx.stroke();

    drawNozzle(-coreW * 0.29, coreW * 0.23, state);
    drawNozzle(0, coreW * 0.26, state);
    drawNozzle(coreW * 0.29, coreW * 0.23, state);

    ctx.restore();
  }

  function drawSeparatedBoosters(state) {
    const ds = state.sepElapsed;
    if (ds <= 0) return;
    const alpha = 1 - smoothstep(2.7, 4.5, ds);
    if (alpha <= 0.01) return;

    for (const side of [-1, 1]) {
      const outward =
        side * (R * 0.105 * easeOutCubic(ds / 1.6) + R * 0.026 * Math.min(ds, 2.6) ** 2);
      const fall = R * (0.09 * ds + 0.14 * ds * ds);
      ctx.save();
      ctx.translate(side * boosterOffset + outward, fall);
      ctx.rotate(side * ds * 0.48);
      ctx.globalAlpha = alpha;
      drawBoosterBody(0, side, state);
      ctx.restore();
    }
  }

  function drawVehicle(state) {
    const throttle = state.throttle;
    ctx.save();
    ctx.translate(state.x, state.engineY);
    ctx.rotate(state.tilt);

    const vibration = throttle * (R * 0.0018 + (1 - state.asc) * R * 0.0052);
    if (vibration > 0.01) {
      ctx.translate(
        Math.sin(state.t * 89.3) * vibration * 0.42,
        Math.cos(state.t * 73.1) * vibration * 0.35
      );
    }

    if (!state.boosterAttached) drawSeparatedBoosters(state);

    if (throttle > 0.01) {
      if (state.boosterAttached) {
        drawPlume(
          -boosterOffset,
          -R * 0.002,
          boosterW * 1.02,
          R * 0.43,
          throttle,
          state.asc,
          11
        );
        drawPlume(
          boosterOffset,
          -R * 0.002,
          boosterW * 1.02,
          R * 0.43,
          throttle,
          state.asc,
          17
        );
      }
      drawPlume(
        0,
        0,
        coreW * 1.04,
        R * 0.72,
        throttle,
        state.asc,
        3
      );
    }

    drawFins();
    if (state.boosterAttached) {
      drawBoosterBody(-boosterOffset, -1, state);
      drawBoosterBody(boosterOffset, 1, state);
    }
    drawCore(state);

    ctx.restore();
  }

  function drawLensEffects(state) {
    if (state.throttle <= 0.02) return;
    const screenY = padY - state.rise;
    if (screenY < 0 || screenY > H) return;
    const lightX = clamp(state.x / W, 0.08, 0.92);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const streak = ctx.createLinearGradient(0, 0, W, 0);
    streak.addColorStop(0, 'rgba(255, 154, 76, 0)');
    streak.addColorStop(Math.max(0.02, lightX - 0.32), 'rgba(255, 154, 76, 0)');
    streak.addColorStop(lightX, `rgba(255, 201, 139, ${0.075 * state.throttle})`);
    streak.addColorStop(Math.min(0.98, lightX + 0.3), 'rgba(255, 154, 76, 0)');
    streak.addColorStop(1, 'rgba(255, 154, 76, 0)');
    ctx.fillStyle = streak;
    ctx.fillRect(0, screenY - 1.2, W, 2.4);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, screenY - 5, W, 10);
    ctx.restore();
  }

  function drawScreenFlash(state) {
    if (state.flash <= 0.001) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 203, 156, ${state.flash})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function render(state) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W * 0.5 + state.shakeX, H * 0.5 + state.shakeY);
    ctx.rotate(state.roll);
    ctx.translate(-W * 0.5, -H * 0.5);

    drawSky(state);
    drawNebula(state);
    drawStars(state);
    drawMoon(state);
    drawCloudWisps(state);
    drawHorizon(state);
    drawEarth(state);

    ctx.save();
    ctx.translate(0, state.camY);

    const towerTopScreen = padY - towerH + state.camY;
    if (towerTopScreen < H + R * 0.4) {
      drawPad(state.t, state);
    }

    drawEngineLight(state);
    drawSmoke(state, false);
    drawVehicle(state);
    drawSmoke(state, true);
    drawSparks(state);
    ctx.restore();

    drawLensEffects(state);
    drawScreenFlash(state);
    ctx.restore();
  }

  const PHASES = [
    {
      status: 'Hold / All systems nominal',
      detail: 'Aurora 7 is cleared for a night launch. Cryogenic tanks are stable and the flight computer has control.'
    },
    {
      status: 'Terminal count / automatic sequence',
      detail: 'The launch director has cleared Aurora 7. Cryogenic tanks are stable and flight control has the vehicle.'
    },
    {
      status: 'Ignition / main engines burning',
      detail: 'All three main engines are at full thrust. Hold-down clamps will release in under a second.'
    },
    {
      status: 'Liftoff / tower cleared',
      detail: 'Aurora 7 is climbing under full power. Pitch and roll programs are nominal; tracking has a solid lock.'
    },
    {
      status: 'Booster separation / core ascent',
      detail: 'The strap-on boosters have separated cleanly. The core stage is continuing toward orbit.'
    },
    {
      status: 'MECO / orbital coast',
      detail: 'Main engine cutoff is confirmed. Aurora 7 is coasting toward insertion on a stable trajectory.'
    },
    {
      status: 'Orbit achieved / signal nominal',
      detail: 'Aurora 7 is in a stable orbit above the Pacific. All systems are nominal and the mission is complete.'
    }
  ];

  function phaseIndex(t) {
    if (t >= CFG.reveal) return 6;
    if (t >= CFG.meco) return 5;
    if (t >= CFG.separation) return 4;
    if (t >= CFG.liftoff) return 3;
    if (t >= CFG.ignition) return 2;
    if (t >= CFG.countStart) return 1;
    return 0;
  }

  function countdownDigit(t) {
    if (t < CFG.countStart || t >= 4.7) return null;
    if (t < 2.2) return '3';
    if (t < 3.2) return '2';
    if (t < 4.2) return '1';
    return '0';
  }

  function updateStatus(t) {
    const index = phaseIndex(t);
    const key = String(index);
    if (key === phaseKey) return;
    phaseKey = key;
    announce(PHASES[index].status);
    el.detailText.textContent = PHASES[index].detail;
    el.statusWrap.classList.toggle('is-hot', index >= 2 && index < 5);
  }

  function updateCountdown(t) {
    const digit = countdownDigit(t);
    if (digit === digitShown) return;
    digitShown = digit;

    if (digit === null) {
      el.countdown.classList.remove('is-visible', 'is-zero');
      el.countdown.setAttribute('aria-hidden', 'true');
      return;
    }

    el.countdownValue.textContent = digit;
    el.countdown.classList.add('is-visible');
    el.countdown.classList.toggle('is-zero', digit === '0');
    el.countdown.setAttribute('aria-hidden', 'false');
    el.countdownLabel.textContent =
      digit === '0' ? 'Ignition / main engine start' : 'T− minus / terminal count';

    el.countdownValue.style.animation = 'none';
    void el.countdownValue.offsetWidth;
    el.countdownValue.style.animation = '';

    if (audioOn && audio && audio.ac.state === 'running') {
      cueTone(digit === '0' ? 700 : 470, digit === '0' ? 0.34 : 0.1, 0.035);
    }
  }

  function updateCallout(t) {
    const show = t >= CFG.liftoff && t < CFG.liftoff + 2.5;
    if (show === calloutShown) return;
    calloutShown = show;
    el.callout.classList.toggle('is-visible', show);
    el.callout.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  function updateLive(t) {
    const complete = t >= CFG.reveal;
    const label = complete ? 'Orbit achieved' : 'Live transmission';
    if (label === liveShown) return;
    liveShown = label;
    el.liveLabel.textContent = label;
    el.live.classList.toggle('is-complete', complete);
  }

  function updateTelemetry(t) {
    const tick = Math.floor(t * 15);
    if (tick === uiTick) return;
    uiTick = tick;

    const frozen = Math.min(t, CFG.reveal);
    const progress = clamp((frozen - CFG.liftoff) / (CFG.reveal - CFG.liftoff), 0, 1);
    const curve = smoothstep(0, 1, progress);
    const altitude = 218.4 * Math.pow(curve, 1.1);
    const velocity = 27600 * Math.pow(curve, 1.25);

    const altText = altitude.toFixed(1).padStart(5, '0');
    const velText = String(Math.round(velocity / 10) * 10).replace(
      /\B(?=(\d{3})+(?!\d))/g,
      ','
    );

    let metText;
    if (t < CFG.liftoff) {
      const digit = countdownDigit(t);
      const seconds = digit !== null ? Number(digit) : t < CFG.countStart ? 4 : 0;
      metText = `T− ${shortClock(seconds)}`;
    } else {
      const elapsed = Math.max(0, frozen - CFG.liftoff);
      metText = `T+ ${shortClock(elapsed)}`;
    }

    if (altText !== telemetryCache.alt) {
      el.altValue.textContent = altText;
      telemetryCache.alt = altText;
    }
    if (velText !== telemetryCache.vel) {
      el.velValue.textContent = velText;
      telemetryCache.vel = velText;
    }
    if (metText !== telemetryCache.met) {
      el.metValue.textContent = metText;
      telemetryCache.met = metText;
    }
  }

  function updateInterface(t) {
    updateCountdown(t);
    updateCallout(t);
    updateStatus(t);
    updateLive(t);
    updateTelemetry(t);

    if (!events.reveal && t >= CFG.reveal) {
      events.reveal = true;
      el.endcard.classList.add('is-visible');
    }
  }

  function resetScene() {
    sceneTime = 0;
    particles.length = 0;
    sparks.length = 0;
    events = {
      engine: false,
      liftoff: false,
      separation: false,
      meco: false,
      reveal: false
    };
    emission = { vent: 0, ground: 0, trail: 0, spark: 0 };
    digitShown = null;
    calloutShown = false;
    phaseKey = '0';
    liveShown = 'Live transmission';
    uiTick = -1;
    telemetryCache = { alt: '', vel: '', met: '' };

    el.endcard.classList.remove('is-visible');
    el.callout.classList.remove('is-visible');
    el.callout.setAttribute('aria-hidden', 'true');
    el.countdown.classList.remove('is-visible', 'is-zero');
    el.countdown.setAttribute('aria-hidden', 'true');
    el.countdownValue.textContent = '3';
    el.countdownValue.style.animation = 'none';
    el.countdownLabel.textContent = 'T− minus / terminal count';
    el.live.classList.remove('is-complete');
    el.liveLabel.textContent = 'Live transmission';
    el.statusWrap.classList.remove('is-hot');
    el.statusText.textContent = PHASES[0].status;
    el.detailText.textContent = PHASES[0].detail;
    el.altValue.textContent = '000.0';
    el.velValue.textContent = '0';
    el.metValue.textContent = 'T− 00:04';
  }

  function replay() {
    if (replaying) return;
    replaying = true;

    el.shade.style.transition = 'opacity 0.38s ease';
    el.shade.style.opacity = '1';

    window.setTimeout(() => {
      resetScene();
      lastFrame = 0;
      el.shade.style.transition = 'opacity 1.1s ease 0.08s';
      requestAnimationFrame(() => {
        el.shade.style.opacity = '0';
      });
      replaying = false;
    }, 400);
  }

  function frame(now) {
    if (!running) return;
    const dt = lastFrame ? clamp((now - lastFrame) / 1000, 0, 0.05) : 0.016;
    lastFrame = now;
    sceneTime += dt;

    const state = updateSimulation(sceneTime, dt);
    updateInterface(sceneTime);
    updateAudio(state);
    render(state);

    requestAnimationFrame(frame);
  }

  function queueResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      resize();
    });
  }

  function boot() {
    buildCraters();
    buildEarthClouds();
    buildClouds();
    buildFacilityLights();
    createPuffSprites();
    resize();
    resetScene();

    el.audioBtn.addEventListener('click', toggleAudio);
    el.replayBtn.addEventListener('click', replay);
    window.addEventListener('resize', queueResize);

    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', event => {
        reduceMotion = event.matches;
      });
    }

    el.shade.style.opacity = '1';
    el.shade.style.transition = 'none';
    requestAnimationFrame(() => {
      el.shade.style.transition = 'opacity 1.3s ease 0.1s';
      el.shade.style.opacity = '0';
    });

    running = true;
    requestAnimationFrame(frame);
  }

  boot();
})();
