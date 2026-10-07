/* ============================================================
   Editorial system — shared behaviour
   1. Living night-sky backdrop (dark)
      · drifting nebula + three parallax star layers + meteors
      · cursor lens, proximity constellation links, click ripples
      · project constellations: Murmur (Raft ring), Sable (LSM
        tiers), Halo (the efficient frontier and its marker)
   2. Home section folders (hover on desktop, tap anywhere)
   ============================================================ */

/* ── 1. Backdrop ── */
(function () {
  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const INK = '236, 231, 219';   // luminous cream points
  const ICE = '170, 192, 232';   // cool blue-white stars
  const ACC = '216, 176, 106';   // amber optimal marker
  const TINTS = [INK, ICE, ACC];
  const SOLID = TINTS.map(function (c) { return 'rgb(' + c + ')'; });
  const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
  const TAU = Math.PI * 2;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isHome = !document.body.classList.contains('sub');

  const EDGE = 60;     // star field overscan, so drift and parallax never show a seam
  const LENS = 180;    // cursor influence radius
  const LINK = 112;    // max length of a cursor-drawn constellation line
  const LAYERS = [     // far → near
    { d: 0.18, density: 1 / 3600,  max: 480, r0: 0.35, r1: 0.85, a0: 0.14, a1: 0.42 },
    { d: 0.45, density: 1 / 9500,  max: 190, r0: 0.70, r1: 1.30, a0: 0.28, a1: 0.66 },
    { d: 1.00, density: 1 / 26000, max: 70,  r0: 1.10, r1: 2.00, a0: 0.55, a1: 1.00 },
  ];

  let W = 0, H = 0, DPR = 1, box = null, raf = 0, last = 0;
  let stars = [], cloud = [], nebula = [], ripples = [], meteors = [], nextMeteor = 3.5;
  let wx = 0, wy = 0, wb = 0;                         // warp() outputs
  const near = [];                                    // x, y, boost triples of stars lit by the cursor
  const mouse = { tx: 0, ty: 0, x: 0, y: 0 };         // parallax, −0.5 … 0.5
  const ptr = { x: -9999, y: -9999, on: 0, target: 0 };

  /* Project constellations. `amt` eases 0 → 1 while the project is in focus. */
  const murmur = { amt: 0, cx: 0, cy: 0, x: 0, y: 0, R: 60, rot: 0, leader: 0, term: 3, beat: 0.6, elect: 7, flash: [0, 0, 0, 0, 0], pulses: [], nx: [], ny: [] };
  const sable  = { amt: 0, cx: 0, cy: 0, x: 0, y: 0, R: 60, clock: 0.4, fill: [0, 0, 0], tiers: [], sparks: [] };
  const halo   = { amt: 0, x: -9999, y: -9999 };
  const con = { murmur: murmur, sable: sable, halo: halo };
  let active = null, rowKey = null, nearKey = null, viewKey = null;
  const rows = [];

  /* ── Sprites ── */
  function makeGlow(rgb) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(' + rgb + ',1)');
    grad.addColorStop(0.16, 'rgba(' + rgb + ',0.42)');
    grad.addColorStop(0.5, 'rgba(' + rgb + ',0.08)');
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return c;
  }
  const GLOW = TINTS.map(makeGlow);
  function glow(tint, x, y, size, alpha) {
    if (alpha <= 0.004) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.drawImage(GLOW[tint], x - size, y - size, size * 2, size * 2);
  }
  function dot(tint, x, y, r, alpha) {
    if (alpha <= 0.004) return;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.fillStyle = SOLID[tint];
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // Each blob: [x, y, radius, rgb, alpha, rotation?, squash?] in viewport fractions. Painted small, drawn stretched.
  function makeNebula(blobs) {
    const c = document.createElement('canvas');
    c.width = Math.max(64, Math.round(W / 6)); c.height = Math.max(64, Math.round(H / 6));
    const g = c.getContext('2d');
    const span = Math.max(c.width, c.height);
    g.globalCompositeOperation = 'lighter';
    blobs.forEach(function (b) {
      const r = b[2] * span;
      g.save();
      g.translate(b[0] * c.width, b[1] * c.height);
      if (b[5]) { g.rotate(b[5]); g.scale(1, b[6]); }
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, 'rgba(' + b[3] + ',' + b[4] + ')');
      grad.addColorStop(0.5, 'rgba(' + b[3] + ',' + (b[4] * 0.36).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(' + b[3] + ',0)');
      g.fillStyle = grad; g.fillRect(-r, -r, r * 2, r * 2);
      g.restore();
    });
    return c;
  }

  /* ── Geometry ── */
  function frontierY(t) { return Math.pow(t, 0.46); }
  function toScreen(nx, ny) {
    return { x: box.x0 + nx * (box.x1 - box.x0), y: box.yBot - ny * (box.yBot - box.yTop) };
  }
  function layout() {
    const small = W < 720;
    box = {
      x0: W * (small ? 0.16 : 0.34),
      x1: W * 0.95,
      yTop: H * 0.18,
      yBot: H * 0.88,
    };
    const R = Math.max(40, Math.min(92, Math.min(W, H) * 0.085));
    murmur.R = sable.R = R;
    murmur.cx = W * (small ? 0.74 : 0.71); murmur.cy = H * (small ? 0.12 : 0.17);
    sable.cx = Math.min(W * 0.80, W - R * 1.4); sable.cy = H * 0.76;
  }
  function build() {
    const area = W * H;
    stars = [];
    LAYERS.forEach(function (L, li) {
      const n = Math.round(Math.min(L.max, area * L.density));
      for (let i = 0; i < n; i++) {
        const roll = Math.random();
        stars.push({
          x: Math.random() * (W + EDGE * 2),
          y: Math.random() * (H + EDGE * 2) - EDGE,
          d: L.d,
          r: L.r0 + Math.random() * (L.r1 - L.r0),
          a: L.a0 + Math.random() * (L.a1 - L.a0),
          tw: Math.random() < 0.12 ? 2.6 + Math.random() * 2.4 : 0.3 + Math.random() * 1.1,
          phase: Math.random() * TAU,
          tint: roll < 0.7 ? 0 : roll < 0.88 ? 1 : 2,
          big: li === 2,
          spike: li === 2 && Math.random() < 0.24,
          link: li > 0,
        });
      }
    });

    // A galactic band: fine dust concentrated along the diagonal the frontier follows. It does not drift.
    const bandN = Math.round(Math.min(340, area / 4200)), sigma = Math.min(W, H) * 0.075;
    for (let i = 0; i < bandN; i++) {
      const t = Math.random(), g = (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
      const roll = Math.random();
      stars.push({
        x: W * (0.30 + 0.75 * t) + g * sigma * 0.8 + EDGE,
        y: H * (1.05 - 1.0 * t) + g * sigma * 0.6 + (Math.random() - 0.5) * sigma,
        d: 0.18, still: true,
        r: 0.3 + Math.random() * 0.45,
        a: (0.10 + Math.random() * 0.26) * (1 - Math.min(1, Math.abs(g) / 2.4)),
        tw: 0.3 + Math.random() * 1.1,
        phase: Math.random() * TAU,
        tint: roll < 0.6 ? 0 : roll < 0.9 ? 1 : 2,
        big: false, spike: false, link: false,
      });
    }

    // The frontier's feasible set: a denser band of points under the curve.
    const target = Math.round(Math.min(240, Math.max(80, area / 9500)));
    cloud = [];
    for (let i = 0; i < target; i++) {
      const t = Math.pow(Math.random(), 0.8);
      const f = frontierY(t);
      const u = Math.random();
      cloud.push({
        hx: t, hy: f * (0.08 + 0.92 * Math.pow(u, 1.3)),
        phase: Math.random() * TAU,
        spd: 0.25 + Math.random() * 0.7,
        amp: 0.004 + Math.random() * 0.011,
        r: 0.7 + Math.random() * 1.2,
        a: 0.14 + Math.random() * 0.14 + (u > 0.86 ? 0.12 : 0),
      });
    }

    // Sable's LSM levels, in units of R around its centre; each level wider than the last.
    sable.tiers = [3, 5, 7].map(function (n, tier) {
      const half = [0.5, 0.86, 1.22][tier], out = [];
      for (let i = 0; i < n; i++) {
        out.push({
          ox: -half + (2 * half * i) / (n - 1) + (Math.random() - 0.5) * 0.1,
          oy: (tier - 1) * 0.62 + (Math.random() - 0.5) * 0.12,
          flash: 0,
        });
      }
      return out;
    });
    sable.sparks = []; sable.fill = [0, 0, 0];

    nebula = [
      makeNebula([[0.82, 0.24, 0.38, '216, 150, 84', 0.21], [0.97, 0.88, 0.32, '158, 92, 136', 0.15]]),
      makeNebula([[0.60, 0.76, 0.46, '64, 98, 184', 0.24], [0.46, 0.08, 0.26, '70, 120, 170', 0.10],
        [0.68, 0.52, 0.62, '176, 186, 222', 0.085, -Math.atan2(H, W * 0.75), 0.17]]),
    ];
  }
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // Mobile URL bars resize the viewport constantly; keep the same sky unless it really changed.
    const rebuild = w !== W || Math.abs(h - H) > 140 || !stars.length;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = w; H = h;
    canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layout();
    if (rebuild) build();
    if (reduce) { step(0); draw(0); }
  }

  /* ── Cursor lens + click ripples: displaces a point and reports how lit it is ── */
  function warp(x, y, d) {
    wx = x; wy = y; wb = 0;
    if (ptr.on > 0.01) {
      const dx = x - ptr.x, dy = y - ptr.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < LENS && dist > 0.01) {
        const f = 1 - dist / LENS;
        const push = 135 * f * f * (1 - f) * (0.35 + 0.65 * d) * ptr.on;   // zero at the cursor, peaks a third of the way out
        wx += (dx / dist) * push; wy += (dy / dist) * push;
        wb = f * ptr.on;
      }
    }
    for (let i = 0; i < ripples.length; i++) {
      const rp = ripples[i];
      const dx = x - rp.x, dy = y - rp.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = (1 - Math.abs(dist - rp.r) / 46) * rp.life;
      if (k > 0) {
        wx += (dx / dist) * 12 * k * d; wy += (dy / dist) * 12 * k * d;
        wb += k * 0.9;
      }
    }
  }

  /* ── Simulation ── */
  function pick(n) { return Math.floor(Math.random() * n); }
  function sableSpark(ox, oy, tier, idx, counts) {
    sable.sparks.push({ ox: ox, oy: oy, tier: tier, idx: idx, t: 0, counts: counts });
  }
  function step(dt) {
    const k = reduce ? 1 : 1 - Math.exp(-dt * 5);
    for (const key in con) con[key].amt += ((active === key ? 1 : 0) - con[key].amt) * k;
    ptr.on += (ptr.target - ptr.on) * (1 - Math.exp(-dt * 7));
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    if (!dt) return;

    // Murmur: the leader heartbeats every follower, each acks, and now and then a new term begins.
    const m = murmur;
    m.rot += dt * 0.05;
    for (let i = 0; i < 5; i++) m.flash[i] -= m.flash[i] * Math.min(1, dt * 4);
    m.beat -= dt;
    if (m.beat <= 0) {
      m.beat = 1.3;
      for (let i = 0; i < 5; i++) if (i !== m.leader) m.pulses.push({ a: m.leader, b: i, t: 0, ack: false });
    }
    m.elect -= dt;
    if (m.elect <= 0) {
      m.elect = 6 + Math.random() * 4;
      m.leader = (m.leader + 1 + pick(4)) % 5;
      m.term++; m.flash[m.leader] = 1.6; m.beat = 0.5;
    }
    for (let i = m.pulses.length - 1; i >= 0; i--) {
      const p = m.pulses[i];
      p.t += dt / 0.55;
      if (p.t < 1) continue;
      m.flash[p.b] = Math.max(m.flash[p.b], p.ack ? 0.5 : 1);
      m.pulses.splice(i, 1);
      if (!p.ack) m.pulses.push({ a: p.b, b: p.a, t: 0, ack: true });
    }

    // Sable: writes land in L0; every third arrival merges two neighbours down a level.
    const s = sable;
    s.tiers.forEach(function (tier) {
      tier.forEach(function (st) { st.flash -= st.flash * Math.min(1, dt * 3.5); });
    });
    s.clock -= dt;
    if (s.clock <= 0) {
      s.clock = 0.34 + Math.random() * 0.3;
      const i = pick(s.tiers[0].length), st = s.tiers[0][i];
      sableSpark(st.ox + (Math.random() - 0.5) * 0.3, st.oy - 0.6, 0, i, true);
    }
    for (let i = s.sparks.length - 1; i >= 0; i--) {
      const sp = s.sparks[i];
      sp.t += dt / 0.6;
      if (sp.t < 1) continue;
      s.tiers[sp.tier][sp.idx].flash = 1;
      s.sparks.splice(i, 1);
      if (!sp.counts || sp.tier === 2 || ++s.fill[sp.tier] < 3) continue;
      s.fill[sp.tier] = 0;
      const up = s.tiers[sp.tier], a = pick(up.length - 1), to = pick(s.tiers[sp.tier + 1].length);
      up[a].flash = up[a + 1].flash = 0.8;
      sableSpark(up[a].ox, up[a].oy, sp.tier + 1, to, true);
      sableSpark(up[a + 1].ox, up[a + 1].oy, sp.tier + 1, to, false);
    }

    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].r += dt * 520; ripples[i].life -= dt / 1.5;
      if (ripples[i].life <= 0) ripples.splice(i, 1);
    }

    nextMeteor -= dt;
    if (nextMeteor <= 0) {
      nextMeteor = 5 + Math.random() * 8;
      const ang = Math.PI * (0.80 + Math.random() * 0.12), v = 700 + Math.random() * 400;
      meteors.push({
        x: W * (0.35 + Math.random() * 0.75), y: H * (Math.random() * 0.35) - 20,
        vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        len: 110 + Math.random() * 90, t: 0, life: 0.7 + Math.random() * 0.4,
      });
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const mt = meteors[i];
      mt.t += dt; mt.x += mt.vx * dt; mt.y += mt.vy * dt;
      if (mt.t >= mt.life) meteors.splice(i, 1);
    }
  }

  /* ── Rendering ── */
  function label(x, y, align, title, sub, amt) {
    if (!isHome || amt < 0.02) return;
    ctx.font = '11px ' + MONO; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = amt; ctx.fillStyle = SOLID[2]; ctx.fillText(title, x, y);
    ctx.globalAlpha = amt * 0.72; ctx.fillStyle = SOLID[0]; ctx.fillText(sub, x, y + 15);
  }

  function drawMurmur(time, px, py) {
    const m = murmur, R = m.R, I = 0.24 + 0.76 * m.amt;
    const cx = m.x = m.cx + px * 0.7, cy = m.y = m.cy + py * 0.7;
    for (let i = 0; i < 5; i++) {
      const ang = m.rot + (i * TAU) / 5 - Math.PI / 2;
      m.nx[i] = cx + Math.cos(ang) * R; m.ny[i] = cy + Math.sin(ang) * R * 0.84;
    }
    ctx.strokeStyle = SOLID[0]; ctx.lineWidth = 0.6 + 0.4 * m.amt;
    for (let hop = 1; hop <= 2; hop++) {      // ring, then the cross-links
      ctx.globalAlpha = hop === 1 ? 0.09 + 0.56 * m.amt : 0.04 + 0.22 * m.amt;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const j = (i + hop) % 5;
        ctx.moveTo(m.nx[i], m.ny[i]); ctx.lineTo(m.nx[j], m.ny[j]);
      }
      ctx.stroke();
    }
    for (const p of m.pulses) {
      const e = p.t * p.t * (3 - 2 * p.t);
      const x = m.nx[p.a] + (m.nx[p.b] - m.nx[p.a]) * e, y = m.ny[p.a] + (m.ny[p.b] - m.ny[p.a]) * e;
      glow(p.ack ? 0 : 2, x, y, p.ack ? 4 : 6, I * (p.ack ? 0.5 : 0.95));
      dot(p.ack ? 0 : 2, x, y, p.ack ? 0.8 : 1.2, I * (p.ack ? 0.6 : 1));
    }
    for (let i = 0; i < 5; i++) {
      const lead = i === m.leader, f = Math.min(1, m.flash[i]);
      glow(lead ? 2 : 0, m.nx[i], m.ny[i], (lead ? 16 : 11) * (1 + 0.6 * f), I * (0.6 + 0.4 * f));
      dot(lead ? 2 : 0, m.nx[i], m.ny[i], lead ? 2.6 : 1.9, I * (0.8 + 0.2 * f));
    }
    ctx.globalAlpha = 0.5 * I; ctx.strokeStyle = SOLID[2]; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(m.nx[m.leader], m.ny[m.leader], 6.5 + 1.5 * Math.sin(time * 2.4), 0, TAU); ctx.stroke();
    label(cx, cy + R * 0.84 + 24, 'center', 'murmur', 'term ' + m.term + ' · leader n' + (m.leader + 1), m.amt);
  }

  function drawSable(px, py) {
    const s = sable, R = s.R, I = 0.24 + 0.76 * s.amt;
    const cx = s.x = s.cx + px * 0.7, cy = s.y = s.cy + py * 0.7;
    ctx.strokeStyle = SOLID[0]; ctx.lineWidth = 0.6 + 0.4 * s.amt;
    ctx.globalAlpha = 0.09 + 0.56 * s.amt;
    ctx.beginPath();
    s.tiers.forEach(function (tier) {
      tier.forEach(function (st, i) {
        if (i === 0) ctx.moveTo(cx + st.ox * R, cy + st.oy * R); else ctx.lineTo(cx + st.ox * R, cy + st.oy * R);
      });
    });
    ctx.stroke();
    for (const sp of s.sparks) {
      const to = s.tiers[sp.tier][sp.idx], e = sp.t * sp.t * (3 - 2 * sp.t);
      const x = cx + (sp.ox + (to.ox - sp.ox) * e) * R, y = cy + (sp.oy + (to.oy - sp.oy) * e) * R;
      glow(2, x, y, 5.5, I * 0.9);
      dot(2, x, y, 1.1, I);
    }
    s.tiers.forEach(function (tier, ti) {
      tier.forEach(function (st) {
        const x = cx + st.ox * R, y = cy + st.oy * R, tint = st.flash > 0.25 ? 2 : 0;
        glow(tint, x, y, 10 * (1 + 0.7 * st.flash), I * (0.55 + 0.45 * st.flash));
        dot(tint, x, y, 1.8, I * (0.8 + 0.2 * st.flash));
      });
      if (isHome && s.amt > 0.02) {
        ctx.font = '9px ' + MONO; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = s.amt * 0.6; ctx.fillStyle = SOLID[0];
        ctx.fillText('L' + ti, cx + tier[0].ox * R - 12, cy + (ti - 1) * 0.62 * R);
      }
    });
    label(cx, cy + R * 0.62 + 30, 'center', 'sable', 'memtable → L0 → L1 → L2', s.amt);
  }

  function drawFrontier(time, px, py) {
    const h = halo.amt, bw = box.x1 - box.x0, bh = box.yBot - box.yTop;
    const veilCloud = (1 + 0.9 * h) * (1 - 0.55 * sable.amt);

    ctx.fillStyle = SOLID[0];
    for (const p of cloud) {
      const ox = Math.sin(time * p.spd + p.phase) * p.amp;
      const oy = Math.cos(time * p.spd * 0.9 + p.phase) * p.amp * 0.8;
      const s = toScreen(p.hx + ox, p.hy + oy);
      warp(s.x + px, s.y + py, 0.5);
      ctx.globalAlpha = Math.min(1, p.a * veilCloud + wb * 0.5);
      ctx.beginPath(); ctx.arc(wx, wy, p.r, 0, TAU); ctx.fill();
    }

    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const s = toScreen(t, frontierY(t));
      if (i === 0) ctx.moveTo(s.x + px, s.y + py); else ctx.lineTo(s.x + px, s.y + py);
    }
    if (h > 0.01) { ctx.globalAlpha = 0.1 * h; ctx.strokeStyle = SOLID[2]; ctx.lineWidth = 5; ctx.stroke(); }
    ctx.globalAlpha = 0.2 + 0.6 * h; ctx.strokeStyle = SOLID[h > 0.5 ? 2 : 0]; ctx.lineWidth = 1;
    ctx.stroke();

    const tm = 0.5 + 0.36 * Math.sin(time * 0.13);
    const m = toScreen(tm, frontierY(tm));
    const mx = halo.x = m.x + px, my = halo.y = m.y + py;

    if (h > 0.01) {
      // Tangent at the marker: the capital market line touching the frontier.
      const sx = bw, sy = -0.46 * Math.pow(tm, -0.54) * bh, n = Math.sqrt(sx * sx + sy * sy);
      const ux = sx / n, uy = sy / n, reach = Math.min(W, H) * 0.34;
      ctx.globalAlpha = 0.45 * h; ctx.strokeStyle = SOLID[2]; ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 6]);
      ctx.beginPath(); ctx.moveTo(mx - ux * reach, my - uy * reach); ctx.lineTo(mx + ux * reach, my + uy * reach); ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 3; i++) {
        const ph = (time * 0.45 + i / 3) % 1;
        ctx.globalAlpha = (1 - ph) * 0.7 * h; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(mx, my, 8 + ph * 34, 0, TAU); ctx.stroke();
      }
    }
    glow(2, mx, my, 16 + 10 * h, 0.7 + 0.3 * h);
    dot(2, mx, my, 3, 0.95);
    ctx.globalAlpha = 0.28 + 0.4 * h; ctx.strokeStyle = SOLID[2]; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(mx, my, 8, 0, TAU); ctx.stroke();
    label(mx - 16, my - 30, 'right', 'halo',
      'σ ' + (0.06 + 0.26 * tm).toFixed(2) + ' · μ ' + (0.03 + 0.13 * frontierY(tm)).toFixed(2), h);
  }

  function draw(time) {
    const px = mouse.x * 44, py = mouse.y * 44;
    const FW = W + EDGE * 2;
    const dim = 1 - 0.28 * Math.max(murmur.amt, sable.amt, halo.amt);

    ctx.clearRect(0, 0, W, H);

    // Nebula: two colour fields breathing and sliding against each other.
    for (let i = 0; i < nebula.length; i++) {
      const dir = i ? -1 : 1;
      ctx.globalAlpha = 0.8 + 0.2 * Math.sin(time * 0.11 + i * 2);
      ctx.drawImage(nebula[i],
        -W * 0.06 + dir * Math.sin(time * 0.05) * W * 0.025 + px * 0.08,
        -H * 0.06 + dir * Math.cos(time * 0.04) * H * 0.025 + py * 0.08,
        W * 1.12, H * 1.12);
    }

    near.length = 0;
    for (const s of stars) {
      const x = (s.still ? s.x : ((s.x - time * 2.4 * s.d) % FW + FW) % FW) - EDGE + px * s.d;
      warp(x, s.y + py * s.d, s.d);
      const a = Math.min(1, s.a * (0.62 + 0.38 * Math.sin(time * s.tw + s.phase)) * dim + wb * 0.55);
      const r = s.r * (1 + wb * 0.5);
      if (s.big) glow(s.tint, wx, wy, r * (5 + wb * 5), a * 0.5);
      ctx.globalAlpha = a; ctx.fillStyle = SOLID[s.tint];
      if (r < 0.8) ctx.fillRect(wx - r, wy - r, r * 2, r * 2);
      else { ctx.beginPath(); ctx.arc(wx, wy, r, 0, TAU); ctx.fill(); }
      if (s.spike) {
        const len = r * (5 + wb * 4);
        ctx.globalAlpha = a * 0.3;
        ctx.fillRect(wx - len, wy - 0.3, len * 2, 0.6);
        ctx.fillRect(wx - 0.3, wy - len, 0.6, len * 2);
      }
      if (s.link && wb > 0.04 && near.length < 240) near.push(wx, wy, wb);
    }

    // Stars the cursor (or a ripple) has lit join into passing constellations.
    ctx.strokeStyle = SOLID[0]; ctx.lineWidth = 0.6;
    for (let i = 0; i < near.length; i += 3) {
      for (let j = i + 3; j < near.length; j += 3) {
        const dx = near[i] - near[j], dy = near[i + 1] - near[j + 1], d2 = dx * dx + dy * dy;
        if (d2 > LINK * LINK) continue;
        ctx.globalAlpha = Math.min(1, Math.min(near[i + 2], near[j + 2]) * (1 - Math.sqrt(d2) / LINK) * 0.75);
        ctx.beginPath(); ctx.moveTo(near[i], near[i + 1]); ctx.lineTo(near[j], near[j + 1]); ctx.stroke();
      }
    }

    drawFrontier(time, px * 0.5, py * 0.5);
    drawMurmur(time, px, py);
    drawSable(px, py);

    for (const mt of meteors) {
      const fade = Math.sin((mt.t / mt.life) * Math.PI), v = Math.sqrt(mt.vx * mt.vx + mt.vy * mt.vy);
      const tx = mt.x - (mt.vx / v) * mt.len, ty = mt.y - (mt.vy / v) * mt.len;
      const grad = ctx.createLinearGradient(mt.x, mt.y, tx, ty);
      grad.addColorStop(0, 'rgba(' + INK + ',' + (0.85 * fade).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(' + INK + ',0)');
      ctx.globalAlpha = 1; ctx.strokeStyle = grad; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(mt.x, mt.y); ctx.lineTo(tx, ty); ctx.stroke();
      glow(0, mt.x, mt.y, 7, fade * 0.8);
    }

    ctx.strokeStyle = SOLID[2]; ctx.lineWidth = 1;
    for (const rp of ripples) {
      ctx.globalAlpha = 0.16 * rp.life;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.06 * rp.life;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r * 0.8, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function frame(ms) {
    const time = ms * 0.001;
    step(Math.min(0.05, Math.max(0, time - last)));
    last = time;
    draw(time);
    raf = requestAnimationFrame(frame);
  }

  /* ── Which constellation is in focus ── */
  function sync() {
    active = rowKey || nearKey || viewKey;
    rows.forEach(function (r) { r.el.classList.toggle('is-lit', !rowKey && r.key === nearKey); });
    if (reduce) { step(0); draw(0); }
  }
  // Pointing at a constellation in the sky lights its row, the same as hovering the row lights the sky.
  function probe() {
    let key = null;
    if (Math.hypot(ptr.x - murmur.x, ptr.y - murmur.y) < murmur.R * 1.45) key = 'murmur';
    else if (Math.hypot(ptr.x - sable.x, ptr.y - sable.y) < sable.R * 1.6) key = 'sable';
    else if (Math.hypot(ptr.x - halo.x, ptr.y - halo.y) < 46) key = 'halo';
    if (key !== nearKey) { nearKey = key; sync(); }
  }

  if (isHome) {
    document.querySelectorAll('.home a[href*="projects.html#"]').forEach(function (el) {
      const key = el.hash.slice(1);
      if (!con[key]) return;
      if (el.closest('.featured')) rows.push({ el: el, key: key });
      function on() { rowKey = key; sync(); }
      function off() { if (rowKey === key) { rowKey = null; sync(); } }
      el.addEventListener('mouseenter', on); el.addEventListener('mouseleave', off);
      el.addEventListener('focus', on); el.addEventListener('blur', off);
    });
  } else if ('IntersectionObserver' in window) {
    // On the projects page the sky follows whichever write-up is being read.
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) viewKey = en.target.id;
        else if (viewKey === en.target.id) viewKey = null;
      });
      sync();
    }, { rootMargin: '-40% 0px -40% 0px' });
    Object.keys(con).forEach(function (key) {
      const el = document.querySelector('article#' + key);
      if (el) io.observe(el);
    });
  }

  window.addEventListener('resize', resize, { passive: true });
  if (!reduce) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      mouse.tx = e.clientX / W - 0.5; mouse.ty = e.clientY / H - 0.5;
      ptr.x = e.clientX; ptr.y = e.clientY; ptr.target = 1;
      if (isHome) probe();
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () {
      ptr.target = 0;
      if (nearKey) { nearKey = null; sync(); }
    });
    window.addEventListener('pointerdown', function (e) {
      ripples.push({ x: e.clientX, y: e.clientY, r: 0, life: 1 });
      if (ripples.length > 4) ripples.shift();
    }, { passive: true });
  }
  resize();
  if (!reduce) raf = requestAnimationFrame(frame);
})();

/* ── 2. Section folders ── */
(function () {
  const folders = Array.from(document.querySelectorAll('.folder'));
  if (!folders.length) return;
  function closeAll(except) {
    folders.forEach(function (f) {
      if (f === except) return;
      f.classList.remove('is-open');
      f.querySelector('.folder-trigger').setAttribute('aria-expanded', 'false');
    });
  }
  folders.forEach(function (f) {
    const btn = f.querySelector('.folder-trigger');
    btn.addEventListener('click', function () {
      const open = f.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) closeAll(f);
    });
    // Hover takes over from any pinned (clicked/keyboard) flyout so two never overlap.
    f.addEventListener('mouseenter', function () { closeAll(null); });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.menu')) closeAll(null);
  });
})();
