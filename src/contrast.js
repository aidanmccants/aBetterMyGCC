// aBetterMyGCC dark-mode contrast pass.
// myGCC (and content that staff paste into it) hard-codes black text, dark
// borders and white boxes. CSS can't catch inline styles and one-off classes,
// so in dark mode this walks the page and flips any color that would be hard
// to read: dark text and lines get lighter, light backgrounds get darker. Hue
// is kept, so a red link stays red and a yellow highlight stays yellow.
// Everything it changes is recorded and put back when you leave dark mode.
(function () {
  'use strict';
  const root = document.documentElement;
  const SKIP = 'img, svg, video, canvas, iframe, picture, object, embed, [id^="gccx-"], [class*="gccx-"], #gccx-dash *, #gccx-plan *, #gccx-palette *';
  const touched = new Map(); // element -> { prop: [oldValue, oldPriority] }
  const done = new WeakSet();

  // ---------- color math ----------
  function parse(c) {
    const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)/.exec(c || '');
    if (!m) return null;
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  function lum({ r, g, b }) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function toHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }
  const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%, ${a})`;

  // Text/lines: map lightness L (dark) to a light value with the same hue.
  function lightFor(c, min) {
    const { h, s, l } = toHsl(c);
    // grays become the theme's ink; colored text keeps its hue, softened
    if (s < 12) return null; // use the CSS variable instead
    return hsl(h, Math.min(s, 70), Math.max(min, 100 - l));
  }
  // Backgrounds: map a light color to a dark one with the same hue.
  function darkFor(c) {
    const { h, s, l } = toHsl(c);
    if (s < 12) return null;
    return hsl(h, Math.min(s, 45), Math.max(12, Math.min(26, (100 - l) * 0.9)), c.a);
  }

  function set(el, prop, value) {
    const rec = touched.get(el) || {};
    if (!(prop in rec)) rec[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
    touched.set(el, rec);
    el.style.setProperty(prop, value, 'important');
  }

  function fix(el) {
    if (done.has(el)) return;
    done.add(el);
    if (el.matches(SKIP) || el.closest('svg')) return;
    // hidden elements (collapsed menus, tabs) are fixed too, so they read
    // correctly when they open; computed colors resolve while hidden
    const cs = getComputedStyle(el);

    // 1. light backgrounds -> dark
    const bg = parse(cs.backgroundColor);
    if (bg && bg.a > 0.35 && lum(bg) > 0.45) {
      set(el, 'background-color', darkFor(bg) || 'var(--x-surface)');
    }

    // 2. dark text -> light (only elements that hold their own text)
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const fg = parse(cs.color);
    if (fg && (hasText || /^(A|INPUT|SELECT|TEXTAREA|BUTTON|LABEL|TH|TD|LI)$/.test(el.tagName)) && lum(fg) < 0.18) {
      set(el, 'color', lightFor(fg, 72) || 'var(--x-ink)');
    }

    // 3. dark borders -> theme rule color
    for (const side of ['top', 'right', 'bottom', 'left']) {
      if (parseFloat(cs[`border-${side}-width`]) > 0 && cs[`border-${side}-style`] !== 'none') {
        const bc = parse(cs[`border-${side}-color`]);
        if (bc && bc.a > 0.2 && lum(bc) < 0.12) set(el, `border-${side}-color`, 'var(--x-rule-strong)');
        else if (bc && bc.a > 0.2 && lum(bc) > 0.6 && toHsl(bc).s < 12) set(el, `border-${side}-color`, 'var(--x-rule)');
      }
    }
    // 4. hr / rules drawn as dark boxes
    if (el.tagName === 'HR') set(el, 'border-color', 'var(--x-rule-strong)');
  }

  function sweep(node) {
    if (!root.classList.contains('gccx-dark') || !node || node.nodeType !== 1) return;
    fix(node);
    const w = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) fix(n);
  }

  function restore() {
    for (const [el, rec] of touched) {
      for (const [prop, [v, p]] of Object.entries(rec)) {
        if (v) el.style.setProperty(prop, v, p); else el.style.removeProperty(prop);
      }
    }
    touched.clear();
  }

  // Run after the theme has applied, then keep up with content myGCC adds later.
  let pending = new Set();
  let timer = null;
  const queue = (n) => {
    pending.add(n);
    clearTimeout(timer);
    timer = setTimeout(() => { const list = [...pending]; pending = new Set(); list.forEach(sweep); }, 60);
  };
  const mo = new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => n.nodeType === 1 && queue(n));
  });

  let wasDark = false;
  function sync() {
    const dark = root.classList.contains('gccx-dark');
    if (dark && !wasDark) {
      wasDark = true;
      // wait a frame so theme.css and the font are in place
      requestAnimationFrame(() => sweep(document.body));
      mo.observe(document.body, { childList: true, subtree: true });
    } else if (!dark && wasDark) {
      wasDark = false;
      mo.disconnect();
      restore();
      // allow a fresh pass next time dark mode turns on
      document.querySelectorAll('*').forEach((e) => done.delete(e));
    }
  }
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['class'] });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
  window.addEventListener('load', () => wasDark && sweep(document.body));
})();
