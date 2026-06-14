/* Hub – gemeinsame Logik: Theme-Toggle, Timer, Checklisten, Celebration,
   Begrüßung & Meilenstein-Fortschritt (Dashboard) */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Theme ---------- */
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "dark";
  }
  function applyToggleIcons() {
    var dark = currentTheme() === "dark";
    document.querySelectorAll(".theme-toggle").forEach(function (b) {
      b.textContent = dark ? "☀️" : "🌙";
      b.setAttribute("aria-label", dark ? "Zum hellen Modus wechseln" : "Zum dunklen Modus wechseln");
    });
  }
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("hub-theme", t); } catch (e) {}
    applyToggleIcons();
  }
  document.querySelectorAll(".theme-toggle").forEach(function (b) {
    b.addEventListener("click", function () {
      setTheme(currentTheme() === "dark" ? "light" : "dark");
    });
  });
  applyToggleIcons();

  /* ---------- Audio (Signalton, erst nach Geste) ---------- */
  var audioCtx = null;
  function ensureAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  function beep() {
    if (!audioCtx) return;
    try {
      var t0 = audioCtx.currentTime;
      [880, 660, 990].forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = f;
        o.connect(g); g.connect(audioCtx.destination);
        var start = t0 + i * 0.18;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        o.start(start); o.stop(start + 0.17);
      });
    } catch (e) {}
  }

  /* ---------- Celebration: Konfetti + Toast ---------- */
  function fireConfetti() {
    var canvas = document.getElementById("confetti-canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "confetti-canvas";
      document.body.appendChild(canvas);
    }
    var ctx = canvas.getContext("2d");
    var W = (canvas.width = window.innerWidth);
    var H = (canvas.height = window.innerHeight);
    var colors = ["#5b8cff", "#7b5bff", "#34d399", "#22d3ee", "#ffb24d", "#ff6f61", "#f472b6"];
    var parts = [];
    for (var i = 0; i < 150; i++) {
      parts.push({
        x: W / 2 + (Math.random() - 0.5) * 140,
        y: H * 0.36,
        vx: (Math.random() - 0.5) * 12,
        vy: Math.random() * -14 - 4,
        g: 0.3 + Math.random() * 0.14,
        size: 5 + Math.random() * 7,
        color: colors[(Math.random() * colors.length) | 0],
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.4
      });
    }
    var start = performance.now();
    function frame(t) {
      var elapsed = t - start;
      ctx.clearRect(0, 0, W, H);
      var alive = false;
      var alpha = Math.max(0, 1 - elapsed / 2700);
      parts.forEach(function (p) {
        p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
        if (p.y < H + 30) alive = true;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (alive && elapsed < 2900) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    }
    requestAnimationFrame(frame);
  }

  function showToast(title, sub) {
    var t = document.querySelector(".celebrate-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "celebrate-toast";
      document.body.appendChild(t);
    }
    t.innerHTML =
      '<div class="ct-emoji">🎉</div>' +
      '<div class="ct-title">' + (title || "Alles geschafft!") + "</div>" +
      '<div class="ct-sub">' + (sub || "Stark durchgezogen.") + "</div>";
    requestAnimationFrame(function () { t.classList.add("show"); });
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("show"); }, 2700);
  }

  function celebrate(title, sub) {
    if (!reduceMotion) fireConfetti();
    showToast(title, sub);
  }
  window.hubCelebrate = celebrate; // für eigene Seiten-Skripte (z. B. Tagesplan)

  /* ---------- Timer ---------- */
  function fmt(s) {
    var m = Math.floor(s / 60), ss = s % 60;
    return m + ":" + (ss < 10 ? "0" : "") + ss;
  }
  document.querySelectorAll(".timer").forEach(function (el) {
    var total = parseInt(el.getAttribute("data-seconds"), 10) || 0;
    var remaining = total, ticking = null;
    el.innerHTML =
      '<button type="button" class="t-main"></button>' +
      '<button type="button" class="t-reset" title="Zurücksetzen">↺</button>';
    var main = el.querySelector(".t-main");
    var reset = el.querySelector(".t-reset");

    function render() { main.textContent = fmt(remaining); }
    function stop() { clearInterval(ticking); ticking = null; el.classList.remove("running"); }
    function tick() {
      remaining--; render();
      if (remaining <= 0) { stop(); el.classList.add("done"); beep(); }
    }
    function start() {
      if (ticking) { stop(); return; }
      if (remaining <= 0) remaining = total;
      el.classList.remove("done"); el.classList.add("running");
      ticking = setInterval(tick, 1000);
    }
    main.addEventListener("click", function () { ensureAudio(); start(); });
    reset.addEventListener("click", function () {
      stop(); remaining = total; el.classList.remove("done"); render();
    });
    render();
  });

  /* ---------- Persistente Checklisten ---------- */
  var pageKey = location.pathname.replace(/index\.html$/, "");
  function keyFor(listId, i) { return "hub-check:" + pageKey + ":" + listId + ":" + i; }

  function counts(listId) {
    var list = document.querySelector('[data-checklist="' + listId + '"]');
    if (!list) return { done: 0, total: 0 };
    var boxes = list.querySelectorAll('input[type="checkbox"]');
    var done = 0;
    boxes.forEach(function (b) { if (b.checked) done++; });
    return { done: done, total: boxes.length };
  }

  function updateProgress(listId) {
    var c = counts(listId);
    var pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    var fill = document.querySelector('[data-progress="' + listId + '"] .p-fill');
    if (fill) fill.style.width = pct + "%";
    var label = document.querySelector('[data-label="' + listId + '"]');
    if (label) {
      var unit = label.getAttribute("data-unit") || "";
      label.textContent = c.done + "/" + c.total + (unit ? " " + unit : "");
    }
  }

  document.querySelectorAll("[data-checklist]").forEach(function (list) {
    var listId = list.getAttribute("data-checklist");
    var boxes = list.querySelectorAll('input[type="checkbox"]');
    boxes.forEach(function (box, i) {
      var key = keyFor(listId, i);
      try { if (localStorage.getItem(key) === "1") box.checked = true; } catch (e) {}
      var item = box.closest(".check-item");
      if (item) item.classList.toggle("is-done", box.checked);
      box.addEventListener("change", function () {
        try { localStorage.setItem(key, box.checked ? "1" : "0"); } catch (e) {}
        if (item) item.classList.toggle("is-done", box.checked);
        updateProgress(listId);
        var c = counts(listId);
        if (box.checked && c.total > 0 && c.done === c.total) celebrate();
      });
    });
    updateProgress(listId);
  });

  document.querySelectorAll(".check-item .ci-body").forEach(function (body) {
    body.addEventListener("click", function () {
      var box = body.parentNode.querySelector('input[type="checkbox"]');
      if (box) { box.checked = !box.checked; box.dispatchEvent(new Event("change")); }
    });
  });

  document.querySelectorAll("[data-reset]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var listId = btn.getAttribute("data-reset");
      var list = document.querySelector('[data-checklist="' + listId + '"]');
      if (!list) return;
      list.querySelectorAll('input[type="checkbox"]').forEach(function (box, i) {
        box.checked = false;
        try { localStorage.setItem(keyFor(listId, i), "0"); } catch (e) {}
        var item = box.closest(".check-item");
        if (item) item.classList.remove("is-done");
      });
      updateProgress(listId);
    });
  });

  /* ---------- Begrüßung (Dashboard) ---------- */
  var greetEl = document.getElementById("greeting");
  if (greetEl) {
    var h = new Date().getHours();
    var hello =
      h < 5 ? "Gute Nacht" :
      h < 11 ? "Guten Morgen" :
      h < 14 ? "Moin" :
      h < 18 ? "Guten Tag" :
      h < 22 ? "Guten Abend" : "Gute Nacht";
    greetEl.textContent = hello + " 👋";
  }

  /* ---------- Meilenstein-Fortschritt (Dashboard, liest Tagesplan) ---------- */
  var msEl = document.getElementById("milestones");
  if (msEl) {
    var DEFAULT_TOTAL = 53;
    var total = parseInt(localStorage.getItem("hub:detail:total") || DEFAULT_TOTAL, 10) || DEFAULT_TOTAL;
    var done = parseInt(localStorage.getItem("hub:detail:done") || "0", 10) || 0;
    if (done > total) done = total;
    var pct = total ? Math.round((done / total) * 100) : 0;

    var MS = [
      { label: "Start", at: 0 },
      { label: "Wettkampfwoche", at: 11 },
      { label: "Radlager", at: 25 },
      { label: "Spielwoche", at: 39 },
      { label: "Review 🏁", at: total }
    ];

    var pts = MS.map(function (m) {
      var reached = m.at === 0 ? done > 0 : done >= m.at;
      var left = total ? (m.at / total) * 100 : 0;
      return '<div class="ms-pt' + (reached ? " reached" : "") + '" style="left:' + left + '%">' +
        '<div class="ms-dot"></div><div class="ms-label">' + m.label + "</div></div>";
    }).join("");

    msEl.innerHTML =
      '<div class="ms-head">' +
        '<span class="ms-title">🏁 Fortschritt · 8-Wochen-Plan</span>' +
        '<span class="ms-count">' + done + "/" + total + " Tage · " + pct + " %</span>" +
      "</div>" +
      '<div class="ms-track"><div class="ms-fill" style="width:' + pct + '%"></div>' + pts + "</div>";
  }
})();
