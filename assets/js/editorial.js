/* ============================================================
   Editorial system — shared behaviour
   1. Living efficient-frontier backdrop (dark)
   2. Home section folders (hover on desktop, tap anywhere)
   ============================================================ */

/* ── 1. Backdrop ── */
(function () {
  const canvas = document.getElementById('bg');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const INK = '236, 231, 219';   // luminous cream points
  const ACC = '216, 176, 106';   // amber optimal marker
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, DPR = 1, box = null, points = [], raf = 0;
  const mouse = { tx: 0, ty: 0, x: 0, y: 0 };

  function frontierY(t) { return Math.pow(t, 0.46); }
  function toScreen(nx, ny) {
    return { x: box.x0 + nx * (box.x1 - box.x0), y: box.yBot - ny * (box.yBot - box.yTop) };
  }
  function computeBox() {
    box = {
      x0: W * (W < 720 ? 0.16 : 0.34),
      x1: W * 0.95,
      yTop: H * 0.18,
      yBot: H * 0.88,
    };
  }
  function build() {
    const target = Math.round(Math.min(320, Math.max(130, (W * H) / 8200)));
    points = [];
    for (let i = 0; i < target; i++) {
      const t = Math.pow(Math.random(), 0.8);
      const f = frontierY(t);
      const u = Math.random();
      const ny = f * (0.08 + 0.92 * Math.pow(u, 1.3));
      points.push({
        hx: t, hy: ny,
        phase: Math.random() * Math.PI * 2,
        spd: 0.25 + Math.random() * 0.7,
        amp: 0.004 + Math.random() * 0.011,
        r: 0.7 + Math.random() * 1.3,
        a: 0.07 + Math.random() * 0.08 + (u > 0.86 ? 0.06 : 0),
      });
    }
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    computeBox(); build();
    if (reduce) draw(0);
  }
  function draw(timeMs) {
    const time = timeMs * 0.001;
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    const px = mouse.x, py = mouse.y;

    ctx.clearRect(0, 0, W, H);
    ctx.shadowBlur = 0;

    for (const p of points) {
      const ox = Math.sin(time * p.spd + p.phase) * p.amp;
      const oy = Math.cos(time * p.spd * 0.9 + p.phase) * p.amp * 0.8;
      const s = toScreen(p.hx + ox, p.hy + oy);
      ctx.beginPath();
      ctx.arc(s.x + px, s.y + py, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + INK + ',' + p.a.toFixed(3) + ')';
      ctx.fill();
    }

    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const s = toScreen(t, frontierY(t));
      if (i === 0) ctx.moveTo(s.x + px, s.y + py); else ctx.lineTo(s.x + px, s.y + py);
    }
    ctx.strokeStyle = 'rgba(' + INK + ',0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const tm = 0.5 + 0.36 * Math.sin(time * 0.13);
    const m = toScreen(tm, frontierY(tm));
    ctx.shadowColor = 'rgba(' + ACC + ',0.9)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(m.x + px, m.y + py, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' + ACC + ',0.95)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(m.x + px, m.y + py, 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(' + ACC + ',0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (!reduce) raf = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize, { passive: true });
  if (!reduce) {
    window.addEventListener('mousemove', function (e) {
      mouse.tx = (e.clientX / W - 0.5) * 14;
      mouse.ty = (e.clientY / H - 0.5) * 14;
    }, { passive: true });
  }
  resize();
  if (!reduce) raf = requestAnimationFrame(draw);
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
