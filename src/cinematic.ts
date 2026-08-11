/* ─────────────────────────────────────────────────────────────────────────
   Cinematic interaction engine — constellation, card tilt, ripple, magnetic.
   All GPU-safe: only transform / opacity, never layout properties.
   Each init() returns a cleanup function for React useEffect.
   ───────────────────────────────────────────────────────────────────────── */

const EASE_CINEMA = "cubic-bezier(0.16,1,0.3,1)";
const touch = () => window.matchMedia("(pointer: coarse)").matches;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── Constellation particle canvas ────────────────────────────────────── */
type Particle = {
  x: number; y: number;
  vx: number; vy: number;
  size: number; opacity: number;
};

export function initParticles(canvas: HTMLCanvasElement): () => void {
  if (reduced()) return () => {};

  const ctx = canvas.getContext("2d")!;
  const COUNT = 90;
  let w = 0, h = 0;
  let mx = -9999, my = -9999;
  let rafId = 0;

  const particles: Particle[] = [];

  function resize() {
    w = canvas.width  = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize, { passive: true });

  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      size: Math.random() * 1.4 + 0.3,
      opacity: Math.random() * 0.35 + 0.07,
    });
  }

  const onMove = (e: MouseEvent) => { mx = e.clientX; my = e.clientY; };
  window.addEventListener("mousemove", onMove, { passive: true });

  function draw() {
    ctx.clearRect(0, 0, w, h);

    particles.forEach(p => {
      /* subtle cursor repulsion */
      const dx = p.x - mx, dy = p.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        const force = (1 - dist / 120) * 0.4;
        p.vx += (dx / dist) * force * 0.06;
        p.vy += (dy / dist) * force * 0.06;
      }
      /* dampen so they don't accelerate forever */
      p.vx *= 0.992; p.vy *= 0.992;

      p.x += p.vx; p.y += p.vy;
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      if (p.y < -10) p.y = h + 10;
      if (p.y > h + 10) p.y = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,185,240,${p.opacity})`;
      ctx.fill();
    });

    /* connections */
    for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 110) {
          /* brighter near cursor */
          const nearCursor = Math.max(
            0,
            1 - Math.hypot(particles[i].x - mx, particles[i].y - my) / 300
          );
          const alpha = (1 - d / 110) * (0.055 + nearCursor * 0.08);
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(94,106,210,${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    rafId = requestAnimationFrame(draw);
  }
  rafId = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resize);
    window.removeEventListener("mousemove", onMove);
  };
}

/* ── 3. 3-D card tilt on hover ───────────────────────────────────────── */
export function initCardTilt(): () => void {
  if (touch() || reduced()) return () => {};

  const onMove = (e: MouseEvent) => {
    document.querySelectorAll<HTMLElement>(".deck-card").forEach(card => {
      const r = card.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / (r.width / 2);
      const dy = (e.clientY - cy) / (r.height / 2);
      if (Math.abs(dx) < 1.8 && Math.abs(dy) < 1.8) {
        card.style.setProperty("--tx", `${-dy * 6}deg`);
        card.style.setProperty("--ty", `${dx * 6}deg`);
        card.style.setProperty("--gx", `${50 + dx * 40}%`);
        card.style.setProperty("--gy", `${50 + dy * 40}%`);
      } else {
        card.style.setProperty("--tx", "0deg");
        card.style.setProperty("--ty", "0deg");
      }
    });
  };

  const onLeave = (e: MouseEvent) => {
    // On document-level mouseleave e.target can be the document itself (no .closest).
    const card = e.target instanceof Element ? e.target.closest<HTMLElement>(".deck-card") : null;
    if (card) {
      card.style.setProperty("--tx", "0deg");
      card.style.setProperty("--ty", "0deg");
    }
  };

  window.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseleave", onLeave);

  return () => {
    window.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseleave", onLeave);
  };
}

/* ── 4. Click ripple on buttons ──────────────────────────────────────── */
export function initRipple(): () => void {
  if (reduced()) return () => {};

  const handler = (e: MouseEvent) => {
    const btn = e.target instanceof Element ? e.target.closest<HTMLElement>("button,.play-btn") : null;
    if (!btn || (btn as HTMLButtonElement).disabled) return;

    const r = btn.getBoundingClientRect();
    const span = document.createElement("span");
    span.className = "ripple";
    const size = Math.max(r.width, r.height) * 2;
    span.style.cssText = `
      width:${size}px; height:${size}px;
      left:${e.clientX - r.left - size / 2}px;
      top:${e.clientY - r.top - size / 2}px;
    `;
    btn.appendChild(span);
    span.addEventListener("animationend", () => span.remove(), { once: true });
  };

  document.addEventListener("click", handler);
  return () => document.removeEventListener("click", handler);
}

/* ── 5. Magnetic pull on primary / big buttons ───────────────────────── */
export function initMagnetic(): () => void {
  if (touch() || reduced()) return () => {};

  const cleanups: Array<() => void> = [];

  function attach(btn: HTMLElement) {
    const onMove = (e: MouseEvent) => {
      const r = btn.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * 0.25;
      const dy = (e.clientY - (r.top + r.height / 2)) * 0.25;
      btn.style.transform = `translate(${dx}px,${dy}px)`;
    };
    const onLeave = () => {
      btn.style.transition = `transform 0.45s ${EASE_CINEMA}`;
      btn.style.transform = "";
      setTimeout(() => { btn.style.transition = ""; }, 450);
    };
    btn.addEventListener("mousemove", onMove, { passive: true });
    btn.addEventListener("mouseleave", onLeave);
    cleanups.push(() => {
      btn.removeEventListener("mousemove", onMove);
      btn.removeEventListener("mouseleave", onLeave);
    });
  }

  document.querySelectorAll<HTMLElement>("button.primary,button.big").forEach(attach);

  /* re-attach for dynamic buttons via MutationObserver */
  const mo = new MutationObserver(() => {
    document.querySelectorAll<HTMLElement>(
      "button.primary:not([data-magnetic]),button.big:not([data-magnetic])"
    ).forEach(btn => {
      btn.dataset.magnetic = "1";
      attach(btn);
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });

  return () => {
    mo.disconnect();
    cleanups.forEach(fn => fn());
  };
}
