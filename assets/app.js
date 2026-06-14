/* Hub – gemeinsame Logik: Theme-Toggle, Timer, persistente Checklisten */
(function () {
  "use strict";

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

  /* ---------- Audio (Signalton, erst nach Geste initialisiert) ---------- */
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
      remaining--;
      render();
      if (remaining <= 0) { stop(); el.classList.add("done"); beep(); }
    }
    function start() {
      if (ticking) { stop(); return; }
      if (remaining <= 0) remaining = total;
      el.classList.remove("done");
      el.classList.add("running");
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

  function updateProgress(listId) {
    var list = document.querySelector('[data-checklist="' + listId + '"]');
    if (!list) return;
    var boxes = list.querySelectorAll('input[type="checkbox"]');
    var done = 0;
    boxes.forEach(function (b) { if (b.checked) done++; });
    var pct = boxes.length ? Math.round((done / boxes.length) * 100) : 0;
    var fill = document.querySelector('[data-progress="' + listId + '"] .p-fill');
    if (fill) fill.style.width = pct + "%";
    var label = document.querySelector('[data-label="' + listId + '"]');
    if (label) {
      var unit = label.getAttribute("data-unit") || "";
      label.textContent = done + "/" + boxes.length + (unit ? " " + unit : "");
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
      });
    });
    updateProgress(listId);
  });

  /* Klick auf den Textkörper schaltet die zugehörige Checkbox */
  document.querySelectorAll(".check-item .ci-body").forEach(function (body) {
    body.addEventListener("click", function () {
      var box = body.parentNode.querySelector('input[type="checkbox"]');
      if (box) { box.checked = !box.checked; box.dispatchEvent(new Event("change")); }
    });
  });

  /* Zurücksetzen-Buttons */
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
})();
