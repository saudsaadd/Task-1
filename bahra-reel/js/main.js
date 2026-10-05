// Master timeline for the 60 s Bahra Electric reel.
// window.renderFrame(t) seeks everything to time t (seconds); the renderer
// calls it once per frame. window.SFX lists the sound cues for the mixer.
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const NS = 'http://www.w3.org/2000/svg';
  const TL = window.TIMELINE;
  const SFX = (window.SFX = []);
  const sfx = (t, type, gain = 1) => SFX.push({ t: +t.toFixed(3), type, gain });

  // seeded random so every render is identical
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // time at which a word of the voiceover starts (scene index, word prefix)
  function wt(scene, prefix, nth = 0) {
    for (const s of TL.scenes[scene].sentences) {
      for (const w of s.words) {
        const clean = w.w.toLowerCase().replace(/[^a-z-]/g, '');
        if (clean.startsWith(prefix.toLowerCase()) && nth-- === 0) return w.t;
      }
    }
    throw new Error('word not found: ' + prefix);
  }

  // ---------- build procedural decorations ----------
  $('#sparky').innerHTML = window.SPARKY_SVG;
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    parent.appendChild(e);
    return e;
  };
  for (let i = 0; i < 12; i++) el('rect', { x: -9, y: -182, width: 18, height: 58, rx: 9, transform: `rotate(${i * 30})` }, $('#s1-rays'));
  const steam = [0, 1, 2, 3].map(() => el('circle', { r: 10 }, $('#s1-steam')));
  const dots = (sel, n) => Array.from({ length: n }, () => el('circle', { r: 7, fill: '#FFE36E', filter: 'url(#glow)' }, $(sel)));
  const s1dots = dots('#s1-dots', 4), s3dots = dots('#s3-dots', 4);
  const stars = Array.from({ length: 34 }, () => {
    const s = el('circle', { cx: rnd() * 1080, cy: 520 + rnd() * 560, r: 1.5 + rnd() * 2.5 }, $('#s3-stars'));
    s._p = rnd() * 6; s._k = 1 + rnd() * 2.5;
    return s;
  });
  for (let i = 0; i < 16; i++) el('path', { d: 'M0,0 L-70,-1500 L70,-1500 Z', transform: `rotate(${i * 22.5})` }, $('#s5-rays'));
  const sparkles = [[140, 300], [930, 280], [110, 720], [970, 760], [220, 1010], [870, 1000], [540, 250], [330, 170], [760, 190], [60, 1180], [1020, 1180]]
    .map(([x, y]) => {
      const u = el('use', { href: '#sparkle', width: 40, height: 40, x: -20, y: -20 }, $('#s5-sparkles'));
      u._x = x; u._y = y; u._p = rnd() * 6; u._s = 1.1 + rnd() * 1.1;
      return u;
    });
  const wireLen = (p) => p.getTotalLength();
  const s1wire = $('#s1-wire'), s3wire = $('#s3-wire');
  const s1len = wireLen(s1wire), s3len = wireLen(s3wire);
  const currentPath = $('#s3-currentPath'), currentLen = currentPath.getTotalLength();
  currentPath.setAttribute('stroke-dasharray', `140 ${currentLen + 200}`);

  // ---------- character rig ----------
  const P = {
    x: 540, y: 1790, s: 1.15, lift: 0, sq: 1, head: 0, gaze: 0, gazeY: 0,
    L: { s: 16, e: 0, h: 0, hand: 'open', wave: 0 },
    R: { s: 16, e: 0, h: 0, hand: 'open', wave: 0 },
  };
  const rig = {
    root: $('#sp-root'), shadow: $('#sp-shadow'), body: $('#sp-body'), head: $('#sp-head'),
    eyes: $('#sp-eyes'), pupils: $('#sp-pupils'),
  };
  for (const side of ['L', 'R']) {
    const id = side === 'L' ? '#sp-armL' : '#sp-armR';
    rig[side] = {
      arm: $(id), fore: $(id + '-fore'), hand: $(id + '-hand'),
      hands: { open: $(id + ' .hand-open'), point: $(id + ' .hand-point'), thumb: $(id + ' .hand-thumb') },
    };
  }

  function applyCharacter(t) {
    const br = Math.sin(t * Math.PI * 2 / 2.6);
    const sx = P.s * (2 - P.sq), sy = P.s * P.sq;
    rig.root.setAttribute('transform', `translate(${P.x} ${P.y - P.lift}) scale(${sx} ${sy}) translate(-200 -700)`);
    const up = Math.max(0, P.lift), k = Math.max(.35, 1 - up / 700);
    rig.shadow.setAttribute('transform', `translate(0 ${up / P.s}) translate(200 700) scale(${k}) translate(-200 -700)`);
    rig.shadow.setAttribute('opacity', (.2 * k).toFixed(3));
    rig.body.setAttribute('transform', `translate(200 700) scale(1 ${1 + .012 * br}) translate(-200 -700)`);
    rig.head.setAttribute('transform', `translate(0 ${-1.5 * br}) rotate(${P.head + 2 * Math.sin(t * 1.15)} 200 268)`);
    for (const side of ['L', 'R']) {
      const a = P[side], r = rig[side];
      const rest = a.s < 30 ? 2.5 * br : 0;
      r.arm.setAttribute('transform', `rotate(${a.s + rest} 140 290)`);
      r.fore.setAttribute('transform', `rotate(${a.e + a.wave * 24 * Math.sin(t * Math.PI * 2 * 1.6)} 140 392)`);
      r.hand.setAttribute('transform', `rotate(${a.h} 140 452)`);
      for (const h in r.hands) r.hands[h].setAttribute('display', h === a.hand ? 'inline' : 'none');
    }
    const f = (t + .6) % 3.3, f2 = (t + .6 - .28) % 3.3;
    let lid = 1;
    if (f < .16) lid = 1 - .92 * Math.sin(f / .16 * Math.PI);
    else if (Math.floor((t + .6) / 3.3) % 3 === 1 && f2 >= 0 && f2 < .16) lid = 1 - .92 * Math.sin(f2 / .16 * Math.PI);
    rig.eyes.setAttribute('transform', `translate(0 193) scale(1 ${lid}) translate(0 -193)`);
    rig.pupils.setAttribute('transform', `translate(${P.gaze * 5} ${P.gazeY * 5})`);
  }

  // ---------- timeline helpers ----------
  const tl = gsap.timeline({ paused: true });
  gsap.set('.pop', { scale: 0, opacity: 0, transformOrigin: '50% 50%' });
  gsap.set('.tick', { scale: 0, opacity: 0, transformOrigin: '50% 50%' });

  const show = (sel, t) => tl.set(sel, { visibility: 'visible' }, t);
  const hide = (sel, t) => tl.set(sel, { visibility: 'hidden' }, t);
  function pop(sel, t, sound = 'pop') {
    tl.fromTo(sel, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: .5, ease: 'back.out(2)' }, t);
    if (sound) sfx(t, sound);
  }
  const unpop = (sel, t) => tl.to(sel, { scale: 0, opacity: 0, duration: .28, ease: 'back.in(2)' }, t);
  function headline(sel, tIn, tOut) {
    show(sel, tIn);
    tl.fromTo(`${sel} .card`, { scale: .7, opacity: 0 }, { scale: 1, opacity: 1, duration: .45, ease: 'back.out(1.8)' }, tIn);
    tl.fromTo(`${sel} .card span`, { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: .42, stagger: .08, ease: 'back.out(2.2)' }, tIn + .1);
    tl.to(`${sel} .card`, { scale: .85, opacity: 0, duration: .3, ease: 'power2.in' }, tOut);
    hide(sel, tOut + .32);
    sfx(tIn, 'swish', .8);
  }
  function arm(side, t, pose, dur = .38, ease = 'back.out(1.4)') {
    const { hand, ...nums } = pose;
    if (hand) tl.set(P[side], { hand }, t + (pose.s !== undefined && pose.s < 30 ? dur * .6 : 0));
    tl.to(P[side], { ...nums, duration: dur, ease }, t);
  }
  const rest = (side, t) => arm(side, t, { s: 16, e: 0, h: 0, wave: 0, hand: 'open' }, .45, 'power2.inOut');
  const thumbs = (side, t) => arm(side, t, { s: 28, e: 150, h: 0, hand: 'thumb' }, .42);
  function wave(side, t, until) {
    arm(side, t, { s: 112, e: 62, hand: 'open' }, .4);
    tl.to(P[side], { wave: 1, duration: .2 }, t + .25);
    tl.to(P[side], { wave: 0, duration: .2 }, until - .2);
    rest(side, until);
  }
  function hop(t, x, dur = .5, height = 120) {
    tl.to(P, { x, duration: dur, ease: 'power1.inOut' }, t);
    tl.to(P, { lift: height, duration: dur / 2, ease: 'power2.out' }, t);
    tl.to(P, { lift: 0, duration: dur / 2, ease: 'power2.in' }, t + dur / 2);
    squash(t + dur);
  }
  function squash(t) {
    tl.to(P, { sq: .86, duration: .07, ease: 'power2.out' }, t);
    tl.to(P, { sq: 1, duration: .4, ease: 'elastic.out(1, .4)' }, t + .07);
    sfx(t, 'land', .7);
  }
  // diagonal brand wipe; the scene swaps underneath at time T
  function wipe(T) {
    const bands = $$('#wipe .band');
    bands.forEach((b, i) => {
      tl.fromTo(b, { x: -2750 }, { x: -760, duration: .44, ease: 'power3.out', immediateRender: i === 0 }, T - .46 + i * .04);
      tl.to(b, { x: 1150, duration: .42, ease: 'power2.in' }, T + .14 - i * .04);
    });
    gsap.set(bands, { x: -2750 });
    sfx(T - .45, 'whoosh');
  }
  const cut = (T) => T + .04; // moment the screen is fully covered

  // =====================================================================
  // SCENE 1  0 - 12 s : meet Sparky in a smart city
  // =====================================================================
  tl.fromTo('#logoBar', { y: -280 }, { y: 0, duration: .75, ease: 'back.out(1.5)' }, .15);
  sfx(.15, 'swish', .7);
  tl.fromTo(P, { lift: 1500 }, { lift: 0, duration: .62, ease: 'power2.in' }, .2);
  squash(.82);
  headline('#h1', .95, 11.0);
  wave('R', 1.2, 4.7);
  pop('#s1-bubble .pop', wt(0, 'sparky') - .3);
  unpop('#s1-bubble .pop', 4.85);

  const tBahra = wt(0, 'bahra');
  arm('L', tBahra - .35, { s: 172, e: -8, hand: 'point' });
  tl.to(P, { gazeY: -1, gaze: -.3, duration: .3 }, tBahra - .35);
  tl.to('#logoBar', { scale: 1.14, duration: .22, ease: 'power2.out', yoyo: true, repeat: 1 }, tBahra);
  tl.fromTo('#logoBar .shine i', { left: -120 }, { left: 520, duration: .75, ease: 'power2.inOut' }, tBahra + .1);
  sfx(tBahra, 'chime', .7);
  rest('L', wt(0, 'innovation') - .2);
  tl.to(P, { gazeY: 0, gaze: -1, duration: .3 }, wt(0, 'innovation') - .2);
  pop('#s1-badgeL .pop', wt(0, 'innovation') - .1);
  tl.to(P, { gaze: 1, duration: .3 }, wt(0, 'safety') - .2);
  pop('#s1-badgeR .pop', wt(0, 'safety') - .1);
  thumbs('R', wt(0, 'safety') + .1);
  tl.to(P, { gaze: 0, duration: .3 }, wt(0, 'safety') + .6);
  rest('R', 11.0);

  // =====================================================================
  // SCENE 2  12 - 28 s : wires, cables, transformers, busbars
  // =====================================================================
  let T = 12;
  wipe(T);
  hide('#s1', cut(T)); show('#s2', cut(T));
  tl.set(P, { x: -260, y: 1800, s: .86, gaze: 1 }, cut(T));
  hop(T + .25, 205, .55, 170);
  headline('#h2', T + .4, 27.2);

  const reveal = (sel, t) => {
    tl.fromTo(sel, { x: 170, scale: .75, opacity: 0 }, { x: 0, scale: 1, opacity: 1, duration: .55, ease: 'back.out(1.6)' }, t);
    sfx(t, 'pop');
  };
  const tW = wt(1, 'wires'), tT = wt(1, 'transformers'), tB = wt(1, 'busbars');
  reveal('#card1 .pop', tW - .25);
  reveal('#card2 .pop', tT - .25);
  reveal('#card3 .pop', tB - .25);
  arm('R', tW - .35, { s: 164, e: 0, hand: 'point' });
  arm('R', tT - .3, { s: 152, e: 0 }, .3, 'power2.inOut');
  arm('R', tB - .3, { s: 130, e: 0 }, .3, 'power2.inOut');
  rest('R', tB + .9);
  tl.to(P, { gaze: 0, duration: .3 }, tB + .9);

  const tPerf = wt(1, 'performance');
  tl.to('#s2-cableGlow', { opacity: 1, duration: .25 }, wt(1, 'deliver'));
  tl.fromTo('#s2 .cardGlow', { opacity: 0 }, { opacity: 1, duration: .25, stagger: .14, yoyo: true, repeat: 1 }, tPerf - .1);
  sfx(tPerf - .1, 'zap', .55);
  thumbs('L', wt(1, 'project') - .2);
  rest('L', 24.4);
  ['#card1', '#card2', '#card3'].forEach((c, i) => pop(`${c} .chip`, 22.0 + i * .28));
  tl.fromTo('#s2-seal .pop', { scale: 2.6, opacity: 0, rotation: -40 }, { scale: 1, opacity: 1, rotation: -12, duration: .32, ease: 'power4.in' }, 24.6);
  sfx(24.9, 'stamp');
  wave('R', 25.4, 27.0);

  // =====================================================================
  // SCENE 3  28 - 45 s : protection & infrastructure
  // =====================================================================
  T = 28;
  wipe(T);
  hide('#s2', cut(T)); show('#s3', cut(T));
  tl.set(P, { x: 1300, y: 1512, s: .64, gaze: -1 }, cut(T));
  rest('L', cut(T)); rest('R', cut(T));
  hop(T + .25, 800, .55, 150);
  headline('#h3', T + .4, 44.2);

  const tSafe = wt(2, 'safety');
  show('#s3-shieldBig', tSafe - .7);
  pop('#s3-shieldBig .pop', tSafe - .7, 'shield');
  tl.fromTo('#s3-shieldBig .pulse', { scale: 1, opacity: .9 }, { scale: 1.5, opacity: 0, duration: .8, repeat: 1, ease: 'power1.out', transformOrigin: '50% 50%' }, tSafe - .4);
  tl.to('#s3-shieldBig .pop', { x: -136, y: -326, scale: .3, duration: .6, ease: 'power3.inOut' }, tSafe + .75);
  thumbs('R', tSafe - .5);
  rest('R', tSafe + .9);

  const strike = (t, withTag) => {
    tl.set('#s3-bolt', { opacity: 1 }, t);
    tl.fromTo('#s3-bolt', { strokeDasharray: 160, strokeDashoffset: 160 }, { strokeDashoffset: 0, duration: .1, ease: 'none' }, t);
    tl.to('#s3-bolt', { opacity: 0, duration: .4 }, t + .3);
    tl.fromTo('#flash', { opacity: .55 }, { opacity: 0, duration: .4, immediateRender: false }, t + .09);
    tl.set('#s3-currentPath', { opacity: 1 }, t + .12);
    tl.fromTo('#s3-currentPath', { strokeDashoffset: 140 }, { strokeDashoffset: -currentLen, duration: 1.0, ease: 'power1.in' }, t + .12);
    tl.set('#s3-currentPath', { opacity: 0 }, t + 1.12);
    tl.fromTo('#s3-earthRings .ring', { scale: 1, opacity: 1 }, { scale: 3.2, opacity: 0, duration: .9, stagger: .25, transformOrigin: '50% 50%' }, t + 1.0);
    sfx(t, 'thunder');
    if (withTag) pop('#tag-lp .pop', t + .2, null);
  };
  const tG = wt(2, 'grounding'), tL = wt(2, 'lightning');
  pop('#tag-gr .pop', tG - .1);
  arm('L', tG - .3, { s: 72, e: 0, hand: 'point' });
  tl.fromTo('#s3-earthRings .ring', { scale: 1, opacity: 1 }, { scale: 3.2, opacity: 0, duration: .9, stagger: .25, transformOrigin: '50% 50%' }, tG);
  arm('L', tL - .3, { s: 138, e: 0 }, .3, 'power2.inOut');
  strike(tL - .05, true);
  rest('L', tL + 1.1);

  const tC = wt(2, 'cable'), tD = wt(2, 'distribution');
  pop('#tile1 .pop', tC - .15);
  pop('#tile2 .pop', tC + .12);
  arm('R', tC - .3, { s: 168, e: 0, hand: 'point' });
  tl.to(P, { gaze: .6, gazeY: -1, duration: .3 }, tC - .3);
  pop('#tile3 .pop', tD - .15);
  pop('#tile4 .pop', tD + .12);
  rest('R', tD + .9);
  tl.to(P, { gaze: 0, gazeY: 0, duration: .3 }, tD + .9);
  ['#tile1', '#tile2', '#tile3', '#tile4'].forEach((s, i) => pop(`${s} .tick`, 38.7 + i * .3, 'ding'));
  strike(41.3, false);
  tl.to('#s3-shieldBig .pop', { scale: .38, duration: .18, yoyo: true, repeat: 1 }, 41.5);
  thumbs('R', 41.7);
  thumbs('L', 41.9);
  rest('R', 43.6); rest('L', 43.7);

  // =====================================================================
  // SCENE 4  45 - 49.7 s : switches & sockets, lights on
  // =====================================================================
  T = 45;
  wipe(T);
  hide('#s3', cut(T)); hide('#s3-shieldBig', cut(T));
  show('#s4', cut(T)); show('#s4-dark', cut(T)); show('#s4-light', cut(T));
  tl.set('#s4-dark', { opacity: .62 }, cut(T));
  tl.set(P, { x: 1300, y: 1722, s: .9, gaze: -1 }, cut(T));
  hop(T + .2, 1010, .42, 70);
  hop(T + .66, 770, .46, 80);
  const tPress = Math.max(46.55, wt(3, 'switches') + .15);
  arm('L', tPress - .45, { s: 117, e: -4, hand: 'point' }, .4);
  tl.to('#rockerA', { attr: { y: 92 }, duration: .08 }, tPress);
  tl.set('#ledA', { attr: { fill: '#34D27B' } }, tPress);
  tl.to('#s4-dark', { opacity: 0, duration: .4 }, tPress + .05);
  tl.to('#s4-light', { opacity: 1, duration: .3 }, tPress + .05);
  sfx(tPress, 'click');
  sfx(tPress + .06, 'shimmer', .8);
  rest('L', tPress + .35);
  tl.to(P, { gaze: 0, duration: .3 }, tPress + .35);
  thumbs('R', tPress + .5);
  const tInd = wt(3, 'industrial');
  show('#s4-icons', tInd - .6);
  $$('#s4-icons .pop').forEach((p, i) => pop(p, tInd - .55 + i * .16));

  // =====================================================================
  // END CARD  49.7 - 60 s : logo, trusted quality, call to action
  // =====================================================================
  T = 49.75;
  tl.fromTo('#flash', { opacity: 0 }, { opacity: 1, duration: .28, ease: 'power2.in', immediateRender: false }, T - .3);
  sfx(T - .35, 'whoosh', .8);
  hide('#s4', T); hide('#s4-dark', T); hide('#s4-light', T); hide('#s4-icons', T);
  show('#s5', T);
  rest('R', T);
  tl.set(P, { x: 540, y: 1838, s: .9, lift: -700, gaze: 0 }, T);
  tl.to('#flash', { opacity: 0, duration: .6 }, T + .02);
  tl.to('#logoBar', { y: 340, scale: 2.3, duration: .85, ease: 'power3.inOut' }, T - .1);
  tl.to('#logoBar .pill', { opacity: 0, duration: .45 }, T);
  sfx(T + .1, 'chime');
  tl.fromTo('#logoBar .shine i', { left: -120 }, { left: 520, duration: .8, ease: 'power2.inOut', immediateRender: false }, T + .8);
  tl.to(P, { lift: 0, duration: .55, ease: 'back.out(1.3)' }, T + .25);
  wave('R', T + .85, 52.9);

  const tTrust = wt(3, 'trusted');
  show('#tagline', tTrust - .45);
  tl.fromTo('#tagline .l1', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: .4, ease: 'power2.out' }, tTrust - .45);
  tl.fromTo('#tagline .l2', { scale: .4, opacity: 0 }, { scale: 1, opacity: 1, duration: .55, ease: 'back.out(2)' }, tTrust - .2);
  sfx(tTrust - .2, 'pop');

  const tCta = wt(3, 'choose');
  show('#cta', tCta - .15);
  tl.fromTo('#cta', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: .5, ease: 'back.out(2.2)' }, tCta - .15);
  sfx(tCta - .15, 'pop');
  const tLast = wt(3, 'bahra', 1);
  tl.to('#logoBar', { scale: 2.45, duration: .2, ease: 'power2.out', yoyo: true, repeat: 1 }, tLast);
  sfx(tLast, 'sparkle');
  thumbs('L', tLast - .3);
  rest('L', 57.0);
  wave('R', 56.6, 59.2);

  // ---------- captions ----------
  const chunks = [];
  for (const sc of TL.scenes) {
    for (const s of sc.sentences) {
      let cur = [];
      s.words.forEach((w, i) => {
        cur.push(w);
        const last = i === s.words.length - 1;
        if (last || cur.length >= 4 || /[,.!?]$/.test(w.w)) { chunks.push(cur); cur = []; }
      });
    }
  }
  for (let i = chunks.length - 1; i > 0; i--) {   // fold one-word tails into the previous line
    const joined = [...chunks[i - 1], ...chunks[i]].map((w) => w.w).join(' ');
    if (chunks[i].length === 1 && !/[,.!?]$/.test(chunks[i - 1].at(-1).w) && joined.length <= 30) {
      chunks[i - 1].push(...chunks[i]); chunks.splice(i, 1);
    }
  }
  chunks.forEach((c, i) => {
    c.start = c[0].t - .05;
    const end = c.at(-1).t + c.at(-1).d + .3;
    c.end = i + 1 < chunks.length ? Math.min(end, chunks[i + 1][0].t - .07) : end;
  });
  const capEl = $('#caption');
  let capShown = null;
  function applyCaption(t) {
    const c = chunks.find((c) => t >= c.start && t < c.end) || null;
    if (c !== capShown) {
      capEl.innerHTML = c ? `<div class="pill">${c.map((w) => `<b>${w.w}</b>`).join(' ')}</div>` : '';
      capShown = c;
    }
    if (!c) return;
    const words = capEl.querySelectorAll('b');
    c.forEach((w, i) => words[i].classList.toggle('on', t >= w.t && (t < w.t + w.d || i === c.length - 1)));
    const k = Math.min(1, (t - c.start) / .14);
    capEl.firstChild.style.transform = `scale(${.9 + .1 * (1 - (1 - k) ** 3)})`;
  }

  // ---------- procedural loops ----------
  const clouds = $$('#s1-clouds .cloud');
  const rotors = $$('#s1-turbines .rotor');
  const ctaRing = $('#cta .ring'), ctaBtn = $('#cta .btn');
  function along(path, len, list, t, speed) {
    list.forEach((d, i) => {
      const p = path.getPointAtLength((t * speed + i * len / list.length) % len);
      d.setAttribute('cx', p.x); d.setAttribute('cy', p.y);
    });
  }
  function ambient(t) {
    if (t < 12.6) {
      $('#s1-rays').setAttribute('transform', `rotate(${t * 9})`);
      clouds.forEach((c) => {
        const x = ((+c.dataset.x + +c.dataset.v * t + 400) % 1500) - 400;
        c.setAttribute('transform', `translate(${x} ${c.dataset.y}) scale(${c.dataset.s})`);
      });
      rotors.forEach((r) => r.setAttribute('transform', `rotate(${t * 110 + +(r.dataset.phase || 0)})`));
      steam.forEach((s, i) => {
        const p = (t * .42 + i / 4) % 1;
        s.setAttribute('cx', 87 + p * 50 + Math.sin(p * 5 + i) * 10);
        s.setAttribute('cy', 1170 - p * 250);
        s.setAttribute('r', 13 + p * 30);
        s.setAttribute('opacity', ((1 - p) * .9).toFixed(3));
      });
      along(s1wire, s1len, s1dots, t, 260);
    }
    if (t > 11.5 && t < 28.6) {
      $('#s2-cableGlow').setAttribute('stroke-dashoffset', (-(t * 520) % 632).toFixed(1));
    }
    if (t > 27.5 && t < 45.6) {
      stars.forEach((s) => s.setAttribute('opacity', (.25 + .75 * Math.abs(Math.sin(t * s._k + s._p))).toFixed(3)));
      along(s3wire, s3len, s3dots, t, 300);
    }
    if (t > 49) {
      $('#s5-rays').setAttribute('transform', `translate(540 640) rotate(${t * 7})`);
      sparkles.forEach((u) => {
        const v = Math.max(0, Math.sin(t * 2.2 + u._p));
        u.setAttribute('transform', `translate(${u._x} ${u._y}) scale(${(u._s * v).toFixed(3)}) rotate(${t * 40})`);
      });
      const tc = t - tCta;
      if (tc > .4) {
        const p = (tc % 1.3) / 1.3;
        ctaRing.style.transform = `scale(${1 + .16 * p}, ${1 + .45 * p})`;
        ctaRing.style.opacity = ((1 - p) * .85).toFixed(3);
        ctaBtn.style.transform = `scale(${1 + .025 * Math.sin(tc * Math.PI * 2 / 1.3)})`;
      } else {
        ctaRing.style.opacity = 0;
      }
    }
  }

  window.renderFrame = (t) => {
    tl.seek(t, true);
    ambient(t);
    applyCharacter(t);
    applyCaption(t);
  };
  SFX.sort((a, b) => a.t - b.t);
  Promise.all([
    document.fonts.load('italic 900 86px Saira'), document.fonts.load('italic 800 33px Saira'),
    ...[500, 600, 700, 800, 900].map((w) => document.fonts.load(`${w} 40px Poppins`)),
  ]).then(() => document.fonts.ready).then(() => {
    window.renderFrame(0);
    requestAnimationFrame(() => { window.READY = true; });
  });
})();
