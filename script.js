/* =========================================================================
   Faceless Man Talks — script.js
   Vanilla JS, no dependencies. Everything here is progressive enhancement:
   the page is complete and readable without it.
   ========================================================================= */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const haptic = (p = 8) => {
    // tiny vibration on Android after a real tap; skipped silently everywhere else
    const ua = navigator.userActivation;
    if (!navigator.vibrate || (ua && !ua.hasBeenActive)) return;
    try { navigator.vibrate(p); } catch (e) { /* not supported */ }
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  let vh = window.innerHeight;
  let vw = window.innerWidth;

  /* ---------- tiny helpers ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /** Wrap every word of an element (keeping <em>, <strong>…) with makeWord(word, index). */
  function splitWords(node, makeWord) {
    let i = 0;
    const walk = (parent) => {
      Array.from(parent.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            frag.appendChild(makeWord(part, i++));
          });
          parent.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          walk(n);
        }
      });
    };
    walk(node);
    return i;
  }

  function splitChars(node) {
    const text = node.textContent;
    node.textContent = '';
    [...text].forEach((c, i) => {
      const s = el('span', 'ch', c);
      s.style.setProperty('--c', i);
      node.appendChild(s);
    });
  }

  /* =======================================================================
     1. Text splitting (headings rise word by word, intro paragraph scrubs)
     ======================================================================= */
  $$('[data-split]').forEach((h) => {
    splitWords(h, (word, i) => {
      const w = el('span', 'w');
      const inner = el('span', 'wi', word);
      inner.style.setProperty('--i', i);
      w.appendChild(inner);
      return w;
    });
  });

  const scrubs = $$('[data-scrub-words]').map((p) => {
    const words = [];
    splitWords(p, (word) => { const s = el('span', 'sw', word); words.push(s); return s; });
    return { el: p, words, last: -1 };
  });

  $$('[data-say]').forEach(splitChars);

  /* =======================================================================
     2. Hero: masthead letters, entrance, light, tilt, talking face
     ======================================================================= */
  const hero = $('[data-hero]');
  const mast = $('[data-mast]');
  const mastLetters = [];
  if (mast) {
    const word = mast.textContent.trim();
    mast.textContent = '';
    [...word].forEach((c, i) => {
      const ch = el('span', 'ch');
      const inn = el('span', 'ch__in', c);
      ch.style.setProperty('--i', i);
      ch.appendChild(inn);
      mast.appendChild(ch);
      mastLetters.push(ch);
    });
  }
  const heroIn = $$('[data-hero-in]');
  const heroDelays = [0.15, 0.62, 0.72, 0.84, 0.98];
  heroIn.forEach((n, i) => n.style.setProperty('--d', (heroDelays[i] || 0.6) + 's'));
  const bust = $('[data-bust-tilt]');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (hero) hero.classList.add('is-ready');
    setTimeout(() => bust && bust.classList.add('is-live'), 1800);
  }));

  const heroLight = $('.hero__light');
  if (hero && heroLight) {
    const setLight = (x, y) => {
      const r = hero.getBoundingClientRect();
      heroLight.style.setProperty('--lx', ((x - r.left) / r.width * 100).toFixed(1) + '%');
      heroLight.style.setProperty('--ly', ((y - r.top) / r.height * 100).toFixed(1) + '%');
    };
    if (finePointer && !reduceMotion) {
      let raf = 0;
      hero.addEventListener('mousemove', (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          setLight(e.clientX, e.clientY);
          if (!bust) return;
          const nx = e.clientX / vw - 0.5;
          const ny = e.clientY / vh - 0.5;
          bust.style.setProperty('--ry', (nx * 7).toFixed(2) + 'deg');
          bust.style.setProperty('--rx', (-ny * 5).toFixed(2) + 'deg');
          if (mast) mast.style.transform = `translate3d(${(-nx * 14).toFixed(1)}px, ${(-ny * 6).toFixed(1)}px, 0)`;
        });
      });
      hero.addEventListener('mouseleave', () => {
        if (!bust) return;
        bust.style.setProperty('--ry', '0deg');
        bust.style.setProperty('--rx', '0deg');
        if (mast) mast.style.transform = '';
      });
    } else if (!reduceMotion) {
      hero.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) setLight(t.clientX, t.clientY); }, { passive: true });
      hero.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) setLight(t.clientX, t.clientY); }, { passive: true });
    }
  }

  // tap the face: he talks
  const faceBtn = $('[data-face]');
  const faceBubble = $('[data-face-bubble]');
  const lines = [
    'Pull up a chair.',
    'Still learning. Like you.',
    'Knowledge means nothing without action.',
    "Can't live with what if.",
    "What's your free cash flow?",
    "I'll be cheering you on. From afar."
  ];
  let lineIx = 0;
  let faceTimer;
  if (faceBtn && faceBubble) {
    faceBtn.addEventListener('click', () => {
      faceBubble.textContent = lines[lineIx % lines.length];
      lineIx++;
      splitChars(faceBubble);
      faceBubble.classList.remove('is-typed', 'is-on');
      void faceBubble.offsetWidth;
      faceBubble.classList.add('is-on', 'is-typed');
      if (bust) {
        bust.classList.remove('is-shine');
        void bust.offsetWidth;
        bust.classList.add('is-shine');
      }
      haptic(6);
      clearTimeout(faceTimer);
      faceTimer = setTimeout(() => faceBubble.classList.remove('is-on'), 3600);
    });
  }

  /* =======================================================================
     3. Header: hide on scroll down, solid after leaving the top, progress
     ======================================================================= */
  const header = $('[data-header]');
  const progressBar = $('[data-progress]');
  let anchorY = window.scrollY;
  let menuOpen = false;
  function updateHeader(y) {
    if (!header) return;
    header.classList.toggle('is-scrolled', y > 24);
    if (Math.abs(y - anchorY) > 6) {
      const hide = y > anchorY && y > 320 && !menuOpen;
      header.classList.toggle('is-hidden', hide);
      anchorY = y;
    }
    if (y < 80) header.classList.remove('is-hidden');
    if (progressBar) {
      const max = root.scrollHeight - vh;
      progressBar.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1) : 0})`;
    }
  }

  /* =======================================================================
     4. Menu overlay
     ======================================================================= */
  const menu = $('[data-menu]');
  const menuOpenBtn = $('[data-menu-open]');
  const menuCloseBtn = $('[data-menu-close]');
  let menuTimer;
  function openMenu() {
    if (!menu) return;
    clearTimeout(menuTimer);
    menu.hidden = false;
    menuOpen = true;
    document.body.classList.add('is-locked');
    menuOpenBtn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    setTimeout(() => menuCloseBtn && menuCloseBtn.focus({ preventScroll: true }), 80);
  }
  function closeMenu(returnFocus) {
    if (!menu || !menuOpen) return;
    menuOpen = false;
    menu.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    menuOpenBtn.setAttribute('aria-expanded', 'false');
    menuTimer = setTimeout(() => { menu.hidden = true; }, 720);
    if (returnFocus) menuOpenBtn.focus({ preventScroll: true });
  }
  if (menu && menuOpenBtn) {
    menuOpenBtn.addEventListener('click', openMenu);
    menuCloseBtn && menuCloseBtn.addEventListener('click', () => closeMenu(true));
    $$('a', menu).forEach((a) => a.addEventListener('click', () => closeMenu(false)));
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeMenu(true); return; }
      if (e.key !== 'Tab') return;
      const f = $$('a, button', menu).filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* =======================================================================
     5. Reveal on scroll + talking bubbles
     ======================================================================= */
  $$('[data-stagger]').forEach((g) => {
    Array.from(g.children).forEach((c, i) => c.style.setProperty('--d', (i * 0.09).toFixed(2) + 's'));
  });

  function onReveal(n) {
    const say = n.matches('[data-say]') ? n : $('[data-say]', n);
    if (say) setTimeout(() => say.classList.add('is-typed'), n.matches('[data-fig]') ? 320 : 120);
  }

  const revealTargets = $$('[data-reveal], [data-split], [data-fig]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
        onReveal(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    revealTargets.forEach((n) => io.observe(n));
  } else {
    revealTargets.forEach((n) => { n.classList.add('is-in'); onReveal(n); });
  }

  /* =======================================================================
     6. Scroll engine: one rAF per frame, only for things near the viewport
     ======================================================================= */
  const nearby = new Set();
  const watchNear = (n) => n && nearIO && nearIO.observe(n);
  const nearIO = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) nearby.add(e.target); else nearby.delete(e.target); });
    requestTick();
  }, { rootMargin: '25% 0px 25% 0px' }) : null;

  const parallaxFigs = reduceMotion ? [] : $$('[data-parallax]');
  parallaxFigs.forEach(watchNear);
  scrubs.forEach((s) => watchNear(s.el));
  const labSheet = $('.lab__sheet');
  watchNear(labSheet);
  const wcards = $$('[data-wcard]');
  watchNear(hero);

  const ticker = $('[data-ticker]');
  const tickerTrack = $('[data-ticker-track]');
  let tickerAnim = null;
  let tickerRate = 1;
  let tickerSkew = 0;

  let lastY = window.scrollY;
  let lastT = performance.now();
  let velocity = 0;
  let ticking = false;

  function requestTick() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  function frame(t) {
    ticking = false;
    const y = window.scrollY;
    const dt = Math.max(16, t - lastT);
    const v = (y - lastY) / dt * 1000; // px per second
    velocity = lerp(velocity, v, 0.25);
    lastY = y; lastT = t;

    updateHeader(y);

    // hero: masthead letters drift apart, the bust sinks slower than the page
    if (hero && nearby.has(hero) && !reduceMotion) {
      const h = hero.offsetHeight || vh;
      const p = clamp(y / h, 0, 1);
      const mid = (mastLetters.length - 1) / 2;
      mastLetters.forEach((c, i) => c.style.setProperty('--sx', ((i - mid) * p * 26).toFixed(1) + 'px'));
      if (bust) {
        bust.style.setProperty('--by', (p * h * 0.16).toFixed(1) + 'px');
        bust.style.setProperty('--bs', (1 + p * 0.06).toFixed(3));
      }
    }

    // intro paragraph: words light up as you read down
    scrubs.forEach((s) => {
      if (!nearby.has(s.el)) return;
      const r = s.el.getBoundingClientRect();
      const p = clamp((vh * 0.88 - r.top) / (r.height + vh * 0.38), 0, 1);
      if (Math.abs(p - s.last) < 0.002) return;
      s.last = p;
      const n = s.words.length;
      const spread = 5;
      s.words.forEach((w, i) => {
        const k = clamp((p * (n + spread) - i) / spread, 0, 1);
        w.style.setProperty('--o', (0.16 + 0.84 * k).toFixed(3));
      });
    });

    // figures float a little against the scroll
    parallaxFigs.forEach((f) => {
      if (!nearby.has(f)) return;
      const r = f.getBoundingClientRect();
      const off = r.top + r.height / 2 - vh / 2;
      f.style.setProperty('--py', (-off * parseFloat(f.dataset.parallax || 0.06)).toFixed(1) + 'px');
    });

    // lab sheet grows into place
    if (labSheet && nearby.has(labSheet) && !reduceMotion) {
      const r = labSheet.getBoundingClientRect();
      const p = clamp((vh - r.top) / (vh * 0.7), 0, 1);
      labSheet.style.setProperty('--ls', (0.93 + 0.07 * easeOut(p)).toFixed(4));
    }

    // ticker reacts to scroll speed
    if (tickerAnim) {
      const target = 1 + Math.min(4, Math.abs(velocity) / 650);
      tickerRate = lerp(tickerRate, target, 0.12);
      tickerAnim.playbackRate = tickerRate;
      const sk = clamp(velocity / 900, -2.2, 2.2);
      tickerSkew = lerp(tickerSkew, sk, 0.2);
      if (ticker) ticker.style.setProperty('--skew', tickerSkew.toFixed(2) + 'deg');
      if (Math.abs(tickerRate - 1) > 0.01 || Math.abs(tickerSkew) > 0.02 || Math.abs(velocity) > 5) {
        velocity *= 0.9;
        requestTick();
      }
    }
  }

  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', () => { vh = window.innerHeight; vw = window.innerWidth; requestTick(); }, { passive: true });

  /* =======================================================================
     7. Ticker: endless tape with live-ish numbers
     ======================================================================= */
  if (ticker && tickerTrack) {
    const list = $('.ticker__list', tickerTrack);
    tickerTrack.appendChild(list.cloneNode(true));
    if (!reduceMotion && tickerTrack.animate) {
      tickerAnim = tickerTrack.animate(
        [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(-50%,0,0)' }],
        { duration: 56000, iterations: Infinity }
      );
      const items = $$('li', list).map((li) => {
        const b = $('b', li);
        const v = parseFloat(b.textContent);
        return { ix: li.dataset.tk, good: li.dataset.good, v, fixed: !isFinite(v) || v >= 100 };
      }).filter((it) => !it.fixed);
      setInterval(() => {
        if (document.hidden) return;
        const it = items[Math.floor(Math.random() * items.length)];
        const wantGood = Math.random() < 0.78;
        const dir = wantGood ? it.good : (it.good === 'up' ? 'down' : 'up');
        it.v = clamp(it.v + (Math.random() * 0.9 - 0.3), 0.2, 48);
        const txt = it.v.toFixed(2) + '%';
        $$(`li[data-tk="${it.ix}"] b`, tickerTrack).forEach((b) => {
          b.textContent = txt;
          b.className = `${dir} ${dir === it.good ? 'good' : 'bad'} flash`;
        });
      }, 1500);
    }
  }

  /* =======================================================================
     8. YouTube: lite embed, chapters, now-playing highlight, modal
     ======================================================================= */
  const isHttp = /^https?:/.test(location.protocol);
  function ytSrc(id, start) {
    const q = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', playsinline: '1', enablejsapi: '1' });
    if (start) q.set('start', String(Math.floor(start)));
    if (isHttp) q.set('origin', location.origin);
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${q}`;
  }
  function makeFrame(id, title, start) {
    const f = document.createElement('iframe');
    f.src = ytSrc(id, start);
    f.title = title || 'YouTube video player';
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    return f;
  }
  function ytCommand(frameEl, func, args) {
    if (!frameEl || !frameEl.contentWindow) return;
    frameEl.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), '*');
  }

  const players = [];
  $$('[data-player]').forEach((pl) => {
    const id = pl.dataset.yt;
    const btn = $('.player__btn', pl);
    const scope = pl.closest('.feature') || pl.parentElement;
    const chapterBtns = $$('[data-seek]', scope);
    const state = { pl, frame: null, chapterBtns, active: -1 };
    players.push(state);

    const setActive = (ix) => {
      if (ix === state.active) return;
      state.active = ix;
      chapterBtns.forEach((b, i) => b.classList.toggle('is-active', i === ix));
    };
    state.setTime = (t) => {
      let ix = -1;
      chapterBtns.forEach((b, i) => { if (t + 0.5 >= parseFloat(b.dataset.seek)) ix = i; });
      setActive(ix);
    };
    const load = (start) => {
      if (state.frame) {
        ytCommand(state.frame, 'seekTo', [start || 0, true]);
        ytCommand(state.frame, 'playVideo');
        return;
      }
      pl.classList.add('is-loading');
      const f = makeFrame(id, pl.dataset.title, start);
      f.addEventListener('load', () => {
        pl.classList.remove('is-loading');
        // ask the player to send us its current time (used to highlight chapters)
        f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'fmt', channel: 'widget' }), '*');
      });
      pl.appendChild(f);
      if (btn) btn.remove();
      state.frame = f;
    };
    if (btn) btn.addEventListener('click', () => { load(0); setActive(0); });
    chapterBtns.forEach((b, i) => b.addEventListener('click', () => {
      load(parseFloat(b.dataset.seek));
      setActive(i);
      const r = pl.getBoundingClientRect();
      if (r.top < 60 || r.bottom > vh) pl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }));
  });

  window.addEventListener('message', (e) => {
    if (typeof e.origin !== 'string' || !/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
    let d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
    if (!d || d.event !== 'infoDelivery' || !d.info || typeof d.info.currentTime !== 'number') return;
    const p = players.find((s) => s.frame && s.frame.contentWindow === e.source);
    if (p) p.setTime(d.info.currentTime);
  });

  // modal player for episode cards (cards are generated by tools/update-videos.mjs)
  const modal = $('[data-modal]');
  const modalFrame = modal ? $('[data-modal-frame]', modal) : null;
  let modalReturn = null;
  function openModal(id, title) {
    if (!modal) return;
    modalReturn = document.activeElement;
    $('[data-modal-title]', modal).textContent = title || 'Episode';
    $('[data-modal-link]', modal).href = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    modalFrame.textContent = '';
    modalFrame.appendChild(makeFrame(id, title, 0));
    modal.hidden = false;
    document.body.classList.add('is-locked');
    requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('is-open')));
    setTimeout(() => { const c = $('[data-modal-close].icon-btn', modal); c && c.focus({ preventScroll: true }); }, 60);
  }
  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(() => { modal.hidden = true; modalFrame.textContent = ''; }, 420);
    if (modalReturn) modalReturn.focus({ preventScroll: true });
  }
  if (modal) {
    $$('[data-modal-close]', modal).forEach((b) => b.addEventListener('click', closeModal));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }
  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-ep]');
    if (!card) return;
    e.preventDefault();
    openModal(card.dataset.ep, card.dataset.title);
  });

  /* =======================================================================
     9. Topic cards: tap to flip
     ======================================================================= */
  wcards.forEach((card) => {
    const btn = $('.wcard__flip', card);
    const toggle = () => {
      const on = card.classList.toggle('is-flipped');
      if (btn) btn.setAttribute('aria-pressed', String(on));
      haptic(6);
    };
    card.addEventListener('click', (e) => {
      if (e.target.closest('a') || e.target.closest('.wcard__flip')) return;
      toggle();
    });
    if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  });

  /* =======================================================================
     10. Odometer (rolling digits)
     ======================================================================= */
  function Odometer(node) {
    this.node = node;
    this.str = null;
    this.parts = [];
    this.sr = el('span', 'sr-only');
    node.setAttribute('aria-hidden', 'true');
    node.parentNode.insertBefore(this.sr, node.nextSibling);
  }
  Odometer.prototype.set = function (str) {
    if (str === this.str) return;
    const chars = [...str];
    const shape = chars.map((c) => (/\d/.test(c) ? 'd' : c)).join('');
    const oldShape = this.str == null ? null : [...this.str].map((c) => (/\d/.test(c) ? 'd' : c)).join('');
    if (shape !== oldShape) {
      this.node.textContent = '';
      this.parts = chars.map((c) => {
        if (/\d/.test(c)) {
          const d = el('span', 'odo__d');
          const strip = el('span', 'odo__strip');
          for (let k = 0; k < 10; k++) strip.appendChild(el('span', '', String(k)));
          d.appendChild(strip);
          this.node.appendChild(d);
          return strip;
        }
        this.node.appendChild(el('span', 'odo__s', c));
        return null;
      });
      // let the new strips start from 0 and roll to their digit
      void this.node.offsetWidth;
    }
    chars.forEach((c, i) => { if (this.parts[i]) this.parts[i].style.setProperty('--n', c); });
    this.str = str;
    this.sr.textContent = str;
  };

  /* =======================================================================
     11. Compound lab
     ======================================================================= */
  const lab = $('[data-lab]');
  if (lab) {
    const tabs = $$('[data-tab]', lab);
    const pill = $('.tabs__pill', lab);
    const panels = { money: $('[data-panel="money"]', lab), habits: $('[data-panel="habits"]', lab) };
    const inputs = {};
    $$('[data-input]', lab).forEach((i) => { inputs[i.dataset.input] = i; });
    const outs = {};
    $$('[data-out]', lab).forEach((o) => { (outs[o.dataset.out] = outs[o.dataset.out] || []).push(o); });
    const setOut = (k, v) => (outs[k] || []).forEach((o) => { o.textContent = v; });
    const odos = {};
    $$('[data-odo]', lab).forEach((o) => { odos[o.dataset.odo] = new Odometer(o); });
    const currencySel = $('[data-currency]', lab);
    const locales = { USD: 'en-US', GBP: 'en-GB', EUR: 'en-IE', CAD: 'en-CA', AUD: 'en-AU' };
    let currency = store.get('fmt-currency');
    if (!currency || !locales[currency]) {
      const lang = (navigator.language || 'en-US').toLowerCase();
      currency = lang.endsWith('-gb') ? 'GBP' : lang.endsWith('-au') ? 'AUD' : lang.endsWith('-ca') ? 'CAD'
        : /^(de|fr|es|it|nl|pt|fi|el|sk|sl|et|lv|lt|ga)\b/.test(lang) || lang.endsWith('-ie') ? 'EUR' : 'USD';
    }
    if (currencySel) {
      currencySel.value = currency;
      currencySel.addEventListener('change', () => { currency = currencySel.value; store.set('fmt-currency', currency); compute(); });
    }
    let money = null;
    const fmtMoney = (v) => {
      if (!money || money.c !== currency) {
        money = { c: currency, f: new Intl.NumberFormat(locales[currency], { style: 'currency', currency, maximumFractionDigits: 0 }) };
      }
      return money.f.format(Math.round(v));
    };
    const fmtX = (v) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2));

    const charts = {};
    $$('[data-chart]', lab).forEach((svg) => {
      charts[svg.dataset.chart] = {
        svg,
        line: $('.chart__line', svg),
        area: $('.chart__area', svg),
        paid: $('.chart__paid', svg),
        dot: $('.chart__dot', svg.parentNode),
        cur: null,
        anim: 0
      };
    });
    const W = 320, H = 170, PAD = 12, N = 48;
    const toPath = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    function drawChart(c, a, b) {
      // a: main series, b: secondary series (same length), values already 0..1
      c.line.setAttribute('d', toPath(a));
      c.area.setAttribute('d', toPath(a) + ` L ${W} ${H} L 0 ${H} Z`);
      c.paid.setAttribute('d', toPath(b));
      const last = a[a.length - 1];
      if (c.dot) { c.dot.style.left = (last[0] / W * 100).toFixed(2) + '%'; c.dot.style.top = (last[1] / H * 100).toFixed(2) + '%'; }
    }
    function animateChart(name, mainVals, subVals, max) {
      const c = charts[name];
      if (!c) return;
      const toPts = (vals) => vals.map((v, i) => [i / (vals.length - 1) * W, H - PAD - (v / max) * (H - PAD * 2.4)]);
      const target = { a: toPts(mainVals), b: toPts(subVals) };
      const from = c.cur || target;
      cancelAnimationFrame(c.anim);
      if (reduceMotion || !c.cur) { c.cur = target; drawChart(c, target.a, target.b); return; }
      const t0 = performance.now();
      const step = (t) => {
        const k = easeOut(clamp((t - t0) / 480, 0, 1));
        const mix = (A, B) => A.map((p, i) => [p[0], lerp(p[1], B[i][1], k)]);
        const cur = { a: mix(from.a, target.a), b: mix(from.b, target.b) };
        drawChart(c, cur.a, cur.b);
        c.cur = cur;
        if (k < 1) c.anim = requestAnimationFrame(step);
      };
      c.anim = requestAnimationFrame(step);
    }

    const fill = (input) => {
      const p = (input.value - input.min) / (input.max - input.min) * 100;
      input.style.setProperty('--p', p.toFixed(2) + '%');
    };

    let mode = 'money';
    function compute() {
      Object.values(inputs).forEach(fill);
      if (mode === 'money') {
        const m = parseFloat(inputs['m-amount'].value);
        const years = parseFloat(inputs['m-years'].value);
        const rate = parseFloat(inputs['m-rate'].value);
        const r = rate / 100 / 12;
        const fv = (t) => { const n = t * 12; return r === 0 ? m * n : m * ((Math.pow(1 + r, n) - 1) / r); };
        const total = fv(years);
        const paid = m * 12 * years;
        setOut('m-amount', fmtMoney(m));
        setOut('m-amount-2', fmtMoney(m));
        setOut('m-years', years === 1 ? '1 year' : `${years} years`);
        setOut('m-years-2', String(years));
        setOut('m-rate', `${rate}%`);
        setOut('m-paid', fmtMoney(paid));
        setOut('m-growth', fmtMoney(total - paid));
        setOut('m-axis', `Year ${years}`);
        odos['m-total'] && odos['m-total'].set(fmtMoney(total));
        const vals = [], sub = [];
        for (let i = 0; i < N; i++) { const t = years * i / (N - 1); vals.push(fv(t)); sub.push(m * 12 * t); }
        animateChart('money', vals, sub, Math.max(total, 1));
      } else {
        const rate = parseFloat(inputs['h-rate'].value);
        const days = parseFloat(inputs['h-days'].value);
        const up = Math.pow(1 + rate / 100, days);
        const down = Math.pow(1 - rate / 100, days);
        const rs = `${+rate.toFixed(1)}%`;
        setOut('h-rate', rs);
        setOut('h-rate-2', rs);
        setOut('h-days', `${days} days`);
        setOut('h-days-2', String(days));
        setOut('h-up', `${fmtX(up)}×`);
        setOut('h-down', `${down < 0.01 ? down.toFixed(3) : down.toFixed(2)}×`);
        setOut('h-lbl-up', `${rs} better a day`);
        setOut('h-lbl-down', `${rs} worse a day`);
        setOut('h-axis', `Day ${days}`);
        odos['h-total'] && odos['h-total'].set(fmtX(up));
        const vals = [], sub = [];
        for (let i = 0; i < N; i++) { const d = days * i / (N - 1); vals.push(Math.pow(1 + rate / 100, d)); sub.push(Math.pow(1 - rate / 100, d)); }
        animateChart('habits', vals, sub, Math.max(up, 1.0001));
      }
    }

    function movePill(t) {
      if (!pill || !t) return;
      pill.style.width = t.offsetWidth + 'px';
      pill.style.transform = `translateX(${t.offsetLeft - 4}px)`;
    }
    function selectTab(name, focus) {
      mode = name;
      tabs.forEach((t) => {
        const on = t.dataset.tab === name;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on) { movePill(t); if (focus) t.focus(); }
      });
      Object.keys(panels).forEach((k) => { if (panels[k]) panels[k].hidden = k !== name; });
      compute();
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => { selectTab(t.dataset.tab); haptic(5); });
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        selectTab(n.dataset.tab, true);
      });
    });
    Object.values(inputs).forEach((i) => i.addEventListener('input', compute));
    window.addEventListener('resize', () => movePill(tabs.find((t) => t.getAttribute('aria-selected') === 'true')), { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => movePill(tabs[0]));
    selectTab('money');
  }

  /* =======================================================================
     12. Hearts from afar
     ======================================================================= */
  const heartBtn = $('[data-heart]');
  const heartCount = $('[data-heart-count]');
  let hearts = 0;
  if (heartBtn) heartBtn.addEventListener('click', () => {
    hearts++;
    if (heartCount) heartCount.textContent = hearts === 1 ? 'Heart received. Right back at you.' : `${hearts} hearts sent, from afar`;
    haptic(10);
    if (reduceMotion || !document.body.animate) return;
    const r = heartBtn.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'float-heart');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-heart');
      svg.appendChild(use);
      svg.style.left = (r.left + r.width / 2 - 11) + 'px';
      svg.style.top = (r.top + r.height / 2 - 11) + 'px';
      svg.style.color = ['#ff6b8a', '#5b86ff', '#eef1f6'][i % 3];
      document.body.appendChild(svg);
      const dx = (Math.random() - 0.5) * 140;
      const dy = -120 - Math.random() * 140;
      svg.animate([
        { transform: 'translate(0,0) scale(.4)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(1.1)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(.8) rotate(${dx / 4}deg)`, opacity: 0 }
      ], { duration: 1200 + Math.random() * 500, delay: i * 40, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' })
        .onfinish = () => svg.remove();
    }
  });

  /* =======================================================================
     13. Touch ripples, magnetic buttons, custom cursor (mouse only)
     ======================================================================= */
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn');
    if (!b || reduceMotion) return;
    const r = b.getBoundingClientRect();
    const s = el('span', 'ripple');
    s.style.left = (e.clientX - r.left) + 'px';
    s.style.top = (e.clientY - r.top) + 'px';
    b.appendChild(s);
    setTimeout(() => s.remove(), 750);
  }, { passive: true });

  if (finePointer && !reduceMotion) {
    $$('[data-magnetic]').forEach((b) => {
      b.addEventListener('mousemove', (e) => {
        const r = b.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.22;
        const y = (e.clientY - r.top - r.height / 2) * 0.3;
        b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
      b.addEventListener('mouseleave', () => { b.style.transform = ''; });
    });

    const cursor = $('[data-cursor]');
    if (cursor) {
      root.classList.add('has-cursor');
      const dot = $('.cursor__dot', cursor);
      const ring = $('.cursor__ring', cursor);
      const label = $('[data-cursor-label]', cursor);
      let mx = -100, my = -100, rx = -100, ry = -100, running = false;
      const loop = () => {
        rx = lerp(rx, mx, 0.2); ry = lerp(ry, my, 0.2);
        ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
        if (Math.abs(rx - mx) > 0.2 || Math.abs(ry - my) > 0.2) requestAnimationFrame(loop);
        else running = false;
      };
      window.addEventListener('mousemove', (e) => {
        mx = e.clientX; my = e.clientY;
        dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
        if (!running) { running = true; requestAnimationFrame(loop); }
      }, { passive: true });
      const labelFor = (t) => {
        if (t.closest('.player__btn, [data-ep]')) return 'Play';
        if (t.closest('[data-wcard]')) return 'Flip';
        if (t.closest('[data-face]')) return 'Hi';
        return '';
      };
      document.addEventListener('mouseover', (e) => {
        const t = e.target;
        const l = labelFor(t);
        cursor.classList.toggle('is-label', !!l);
        if (l) label.textContent = l;
        cursor.classList.toggle('is-hover', !l && !!t.closest('a, button, summary, select, input, [data-row]'));
      });
      document.addEventListener('mousedown', () => cursor.classList.add('is-down'));
      document.addEventListener('mouseup', () => cursor.classList.remove('is-down'));
      document.addEventListener('mouseleave', () => { mx = my = -100; });
    }
  }

  /* =======================================================================
     14. Small things
     ======================================================================= */
  $$('[data-year]').forEach((n) => { n.textContent = String(new Date().getFullYear()); });

  requestTick();
  window.__fmt = true;
})();
