/* Pong Wars – Star-Wars-Pong mit Pokémon-Übergang, Highscore & Schwierigkeiten */
(function () {
  "use strict";
  var btn = document.getElementById("pongBtn");
  if (!btn) return;

  var W = 960, H = 600, PW = 14, PH = 104, R = 11;
  var DIFFS = {
    padawan: { label: "Padawan", ball: 5.2, ai: 4.2, err: 70, mult: 1, color: "#6ee787" },
    jedi:    { label: "Jedi-Ritter", ball: 6.6, ai: 5.7, err: 38, mult: 2, color: "#3bcaff" },
    sith:    { label: "Sith-Lord", ball: 8.2, ai: 7.4, err: 16, mult: 3, color: "#ff434b" }
  };
  var MAXSPEED = 17.5;

  /* ---------- Overlay-DOM ---------- */
  var overlay = document.createElement("div");
  overlay.className = "pong-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    '<canvas id="pongCanvas" width="960" height="600"></canvas>' +
    '<button class="pong-close" id="pongClose" title="Schließen (Esc)">✕</button>' +
    '<button class="pong-mute" id="pongMute" title="Ton an/aus">🔊</button>' +
    '<div class="pong-screen" id="pongMenu">' +
      '<h2 class="pong-title">PONG&nbsp;WARS</h2>' +
      '<p class="pong-tag">Ein Duell der Macht</p>' +
      '<div class="pong-diffs">' +
        '<button class="sw-btn" data-diff="padawan">Padawan</button>' +
        '<button class="sw-btn" data-diff="jedi">Jedi-Ritter</button>' +
        '<button class="sw-btn" data-diff="sith">Sith-Lord</button>' +
      '</div>' +
      '<button class="sw-btn sw-start" id="pongStart">▶ Spiel starten</button>' +
      '<div class="pong-board" id="pongBoardMenu"></div>' +
      '<p class="pong-help">Steuerung: Maus / Finger bewegen · oder ↑ ↓ bzw. W S</p>' +
    '</div>' +
    '<div class="pong-screen" id="pongOver" hidden>' +
      '<h2 class="pong-over-title">Match beendet</h2>' +
      '<div class="pong-final" id="pongFinal"></div>' +
      '<div id="pongNameWrap">' +
        '<label>Dein Name für die Bestenliste:</label>' +
        '<input id="pongName" maxlength="14" autocomplete="off" spellcheck="false" />' +
        '<button class="sw-btn" id="pongSave">Speichern</button>' +
      '</div>' +
      '<div class="pong-board" id="pongBoardOver"></div>' +
      '<div class="pong-overactions">' +
        '<button class="sw-btn" id="pongRetry">▶ Nochmal</button>' +
        '<button class="sw-btn" id="pongToMenu">Menü</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var trans = document.createElement("div");
  trans.className = "pong-transition";
  trans.hidden = true;
  trans.innerHTML = '<div class="sweep"></div><div class="radar"></div><div class="flash"></div>';
  document.body.appendChild(trans);

  var canvas = overlay.querySelector("#pongCanvas");
  var ctx = canvas.getContext("2d");
  var menu = overlay.querySelector("#pongMenu");
  var over = overlay.querySelector("#pongOver");

  /* ---------- Zustand ---------- */
  var state = "idle"; // idle | playing | over
  var diffKey = localStorage.getItem("hub:pong:diff") || "jedi";
  if (!DIFFS[diffKey]) diffKey = "jedi";
  var muted = localStorage.getItem("hub:pong:muted") === "1";
  var raf = null, lastSavedIdx = -1;

  var player, ai, ball, stars, particles, pops, trail, lives, score, rally, curSpeed, aiAim, aiTimer, shake, keys;

  /* ---------- Audio ---------- */
  var actx = null;
  function audio() {
    if (muted) return null;
    try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); }
    catch (e) { actx = null; }
    return actx;
  }
  function blip(freq, dur, type) {
    var a = audio(); if (!a) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || "square"; o.frequency.value = freq;
    o.connect(g); g.connect(a.destination);
    var t = a.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
    o.start(t); o.stop(t + (dur || 0.12) + 0.02);
  }
  function saberHit() { blip(420 + Math.random() * 80, 0.1, "sawtooth"); }
  function scoreSfx() { blip(180, 0.28, "sawtooth"); setTimeout(function(){ blip(120, 0.3, "sine"); }, 60); }
  function loseSfx() { blip(90, 0.5, "sine"); }

  /* ---------- Highscore ---------- */
  function getScores() {
    try { return JSON.parse(localStorage.getItem("hub:pong:scores") || "[]"); } catch (e) { return []; }
  }
  function setScores(list) { try { localStorage.setItem("hub:pong:scores", JSON.stringify(list)); } catch (e) {} }
  function renderBoard(el, highlightIdx) {
    var list = getScores();
    if (!list.length) { el.innerHTML = '<h3>Bestenliste</h3><div class="pong-empty">Noch keine Einträge — sei der Erste!</div>'; return; }
    var rows = list.slice(0, 7).map(function (s, i) {
      var d = DIFFS[s.diff] ? s.diff : "jedi";
      return '<div class="pong-row' + (i === highlightIdx ? " me" : "") + '">' +
        '<span class="rk">' + (i + 1) + '</span>' +
        '<span class="nm">' + escapeHtml(s.name) + '</span>' +
        '<span class="dg dg-' + d + '">' + DIFFS[d].label + '</span>' +
        '<span class="sc">' + s.score + '</span></div>';
    }).join("");
    el.innerHTML = '<h3>Bestenliste</h3>' + rows;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- Übergang (Pokémon-Stil) ---------- */
  function playTransition(reveal) {
    trans.hidden = false;
    trans.className = "pong-transition";
    void trans.offsetWidth;
    trans.classList.add("close");
    blip(140, 0.5, "sawtooth");
    setTimeout(function () { trans.classList.remove("close"); trans.classList.add("cover"); blip(900, 0.06, "square"); }, 500);
    setTimeout(function () {
      if (reveal) reveal();
      trans.classList.remove("cover"); trans.classList.add("open");
    }, 620);
    setTimeout(function () { trans.hidden = true; trans.className = "pong-transition"; }, 1240);
  }

  /* ---------- Spielablauf ---------- */
  function openGame() {
    document.body.style.overflow = "hidden";
    playTransition(function () {
      overlay.hidden = false;
      showMenu();
    });
  }
  function showMenu() {
    state = "idle";
    stopLoop();
    over.hidden = true; menu.hidden = false;
    selectDiff(diffKey);
    renderBoard(overlay.querySelector("#pongBoardMenu"), -1);
    drawAttract();
  }
  function selectDiff(k) {
    diffKey = k; localStorage.setItem("hub:pong:diff", k);
    overlay.querySelectorAll(".pong-diffs .sw-btn").forEach(function (b) {
      b.classList.toggle("selected", b.getAttribute("data-diff") === k);
    });
  }
  function resetGame() {
    var d = DIFFS[diffKey];
    player = { y: H / 2 - PH / 2 };
    ai = { y: H / 2 - PH / 2 };
    lives = 3; score = 0; rally = 0; shake = 0;
    particles = []; pops = []; trail = [];
    stars = [];
    for (var i = 0; i < 130; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * 1.6 + 0.3 });
    aiAim = H / 2; aiTimer = 0;
    serve((Math.random() < 0.5 ? 1 : -1), d.ball);
    keys = { up: false, down: false };
  }
  function serve(dir, base) {
    curSpeed = base;
    var ang = (Math.random() - 0.5) * 0.6;
    ball = { x: W / 2, y: H / 2, vx: dir * curSpeed * Math.cos(ang), vy: curSpeed * Math.sin(ang), wait: 38 };
    rally = 0;
  }
  function startGame() {
    menu.hidden = true; over.hidden = true;
    resetGame();
    state = "playing";
    startLoop();
  }
  function gameOver() {
    state = "over";
    stopLoop();
    lastSavedIdx = -1;
    var d = DIFFS[diffKey];
    overlay.querySelector("#pongFinal").innerHTML =
      'Schwierigkeit: <b style="color:' + d.color + ';font-size:1rem">' + d.label + '</b><br>Dein Score: <b>' + score + "</b>";
    var input = overlay.querySelector("#pongName");
    input.value = localStorage.getItem("hub:pong:lastname") || "";
    input.disabled = false;
    overlay.querySelector("#pongSave").disabled = false;
    renderBoard(overlay.querySelector("#pongBoardOver"), -1);
    over.hidden = false; menu.hidden = true;
    setTimeout(function () { input.focus(); }, 50);
  }
  function saveScore() {
    var input = overlay.querySelector("#pongName");
    var name = (input.value || "Anonym").trim().slice(0, 14) || "Anonym";
    localStorage.setItem("hub:pong:lastname", name);
    var list = getScores();
    var entry = { name: name, score: score, diff: diffKey, t: Date.now() };
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    list = list.slice(0, 25);
    lastSavedIdx = list.indexOf(entry);
    setScores(list);
    input.disabled = true; overlay.querySelector("#pongSave").disabled = true;
    renderBoard(overlay.querySelector("#pongBoardOver"), lastSavedIdx);
  }
  function closeGame() {
    stopLoop();
    overlay.hidden = true;
    document.body.style.overflow = "";
    state = "idle";
  }

  /* ---------- Loop ---------- */
  function startLoop() { if (!raf) raf = requestAnimationFrame(loop); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = null; }
  function loop() {
    raf = requestAnimationFrame(loop);
    if (state === "playing" && !document.hidden) update();
    render();
  }

  function update() {
    var d = DIFFS[diffKey];
    // Sterne
    for (var i = 0; i < stars.length; i++) {
      stars[i].x -= stars[i].z * 0.6;
      if (stars[i].x < 0) { stars[i].x = W; stars[i].y = Math.random() * H; }
    }
    // Spieler-Paddle (Tastatur ergänzend, Maus via pointer)
    if (keys.up) player.y -= 9;
    if (keys.down) player.y += 9;
    player.y = clamp(player.y, 0, H - PH);

    // Ball wartet beim Aufschlag kurz
    if (ball.wait > 0) { ball.wait--; }
    else {
      ball.x += ball.vx; ball.y += ball.vy;
    }
    trail.push({ x: ball.x, y: ball.y }); if (trail.length > 14) trail.shift();

    // KI
    aiTimer--;
    if (aiTimer <= 0) { aiAim = ball.y + (Math.random() - 0.5) * 2 * d.err; aiTimer = 6 + Math.random() * 10; }
    var target = (ball.vx > 0 ? aiAim : H / 2) - PH / 2;
    var dy = target - ai.y;
    ai.y += clamp(dy, -d.ai, d.ai);
    ai.y = clamp(ai.y, 0, H - PH);

    // Wände
    if (ball.y < R) { ball.y = R; ball.vy = -ball.vy; wallFx(ball.x, R); }
    if (ball.y > H - R) { ball.y = H - R; ball.vy = -ball.vy; wallFx(ball.x, H - R); }

    // Schläger-Kollisionen
    if (ball.vx < 0 && ball.x - R <= PW + 14 && ball.x - R >= 14 && ball.y >= player.y - R && ball.y <= player.y + PH + R) {
      paddleHit(1, 14 + PW, player.y);
    }
    if (ball.vx > 0 && ball.x + R >= W - 14 - PW && ball.x + R <= W - 14 && ball.y >= ai.y - R && ball.y <= ai.y + PH + R) {
      paddleHit(-1, W - 14 - PW, ai.y);
    }
    // Austritte
    if (ball.x < -R) loseLife();
    else if (ball.x > W + R) aiMiss();

    // Partikel / Popups / Shake
    for (var p = particles.length - 1; p >= 0; p--) {
      var pt = particles[p];
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.15; pt.life--;
      if (pt.life <= 0) particles.splice(p, 1);
    }
    for (var q = pops.length - 1; q >= 0; q--) { pops[q].y -= 0.8; pops[q].life--; if (pops[q].life <= 0) pops.splice(q, 1); }
    if (shake > 0) shake *= 0.86;
  }

  function paddleHit(dir, edgeX, py) {
    var rel = clamp((ball.y - (py + PH / 2)) / (PH / 2), -1, 1);
    var ang = rel * 0.95;
    curSpeed = Math.min(curSpeed * 1.045, MAXSPEED);
    ball.vx = dir * curSpeed * Math.cos(ang);
    ball.vy = curSpeed * Math.sin(ang);
    ball.x = dir > 0 ? edgeX + R + 0.5 : edgeX - R - 0.5;
    var col = dir > 0 ? "#3bcaff" : "#ff434b";
    burst(ball.x, ball.y, col, 14);
    shake = 7; saberHit();
    if (dir > 0) { // Spieler hat getroffen
      rally++;
      var pts = Math.round(10 * DIFFS[diffKey].mult * (1 + (rally - 1) * 0.18));
      score += pts;
      pops.push({ x: ball.x, y: ball.y, txt: "+" + pts, life: 40, col: "#3bcaff" });
    }
  }
  function loseLife() {
    lives--; shake = 16; loseSfx();
    burst(8, ball.y, "#ff434b", 40);
    if (lives <= 0) { gameOver(); return; }
    serve(-1, DIFFS[diffKey].ball);
  }
  function aiMiss() {
    var pts = Math.round(50 * DIFFS[diffKey].mult);
    score += pts; shake = 10; scoreSfx();
    burst(W - 8, ball.y, "#6ee787", 34);
    pops.push({ x: W - 70, y: ball.y, txt: "+" + pts + "!", life: 55, col: "#6ee787" });
    serve(1, DIFFS[diffKey].ball);
  }
  function wallFx(x, y) { burst(x, y, "#9fb4d6", 5); blip(700, 0.04, "square"); }
  function burst(x, y, col, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = Math.random() * 5 + 1;
      particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 18 + Math.random() * 20, col: col });
    }
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- Render ---------- */
  function drawAttract() {
    // ruhiges Sternenfeld im Menü
    ctx.clearRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W / 2, H * 0.4, 50, W / 2, H * 0.4, 700);
    g.addColorStop(0, "#0a1024"); g.addColorStop(1, "#04050a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (var i = 0; i < 90; i++) ctx.fillRect((i * 137) % W, (i * 211) % H, 1.5, 1.5);
  }
  function render() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 720);
    g.addColorStop(0, "#0a1024"); g.addColorStop(1, "#04050a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (state !== "playing") { ctx.restore(); return; }

    if (shake > 0.4) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // Sterne
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      ctx.globalAlpha = 0.3 + s.z * 0.45;
      ctx.fillStyle = "#cfe3ff";
      ctx.fillRect(s.x, s.y, s.z + 0.6, s.z + 0.6);
    }
    ctx.globalAlpha = 1;

    // Mittellinie
    ctx.setLineDash([6, 14]); ctx.strokeStyle = "rgba(255,232,31,0.18)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);

    // Ball-Trail
    for (var t = 0; t < trail.length; t++) {
      var a = t / trail.length;
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = "#ffe81f";
      ctx.beginPath(); ctx.arc(trail[t].x, trail[t].y, R * a, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Paddles (Lichtschwerter)
    saber(14, player.y, "#3bcaff");
    saber(W - 14 - PW, ai.y, "#ff434b");

    // Ball
    ctx.shadowColor = "#ffe81f"; ctx.shadowBlur = 24;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(ball.x, ball.y, R, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;

    // Partikel
    for (var p = 0; p < particles.length; p++) {
      var pt = particles[p];
      ctx.globalAlpha = Math.max(0, pt.life / 34);
      ctx.fillStyle = pt.col;
      ctx.fillRect(pt.x, pt.y, 3, 3);
    }
    ctx.globalAlpha = 1;

    // Score-Popups
    ctx.font = "bold 22px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center";
    for (var q = 0; q < pops.length; q++) {
      ctx.globalAlpha = Math.max(0, pops[q].life / 55);
      ctx.fillStyle = pops[q].col;
      ctx.fillText(pops[q].txt, pops[q].x, pops[q].y);
    }
    ctx.globalAlpha = 1;

    // HUD
    ctx.shadowColor = "rgba(255,232,31,0.6)"; ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffe81f"; ctx.textAlign = "left";
    ctx.font = "bold 26px 'Trebuchet MS', sans-serif";
    ctx.fillText(String(score), 26, 40);
    ctx.shadowBlur = 0;
    ctx.font = "11px 'Trebuchet MS', sans-serif"; ctx.fillStyle = "#7e8699";
    ctx.fillText("SCORE", 26, 54);
    ctx.textAlign = "center"; ctx.fillStyle = "#8089a0";
    ctx.fillText(DIFFS[diffKey].label.toUpperCase(), W / 2, 26);
    // Leben (Saber-Ticks)
    for (var l = 0; l < lives; l++) {
      ctx.fillStyle = "#3bcaff"; ctx.shadowColor = "#3bcaff"; ctx.shadowBlur = 10;
      ctx.fillRect(W - 30 - l * 22, 26, 5, 22);
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  function saber(x, y, col) {
    ctx.shadowColor = col; ctx.shadowBlur = 22;
    ctx.fillStyle = col;
    roundRect(x, y, PW, PH, 7); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.shadowBlur = 8;
    roundRect(x + PW / 2 - 2, y + 6, 4, PH - 12, 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- Eingaben ---------- */
  function pointerY(e) {
    var rect = canvas.getBoundingClientRect();
    var cy = (e.touches ? e.touches[0].clientY : e.clientY);
    return (cy - rect.top) / rect.height * H;
  }
  canvas.addEventListener("pointermove", function (e) {
    if (state !== "playing") return;
    var y = pointerY(e);
    player.y += (y - PH / 2 - player.y) * 0.5;
    player.y = clamp(player.y, 0, H - PH);
  });
  canvas.addEventListener("pointerdown", function (e) {
    if (state !== "playing") return;
    var y = pointerY(e); player.y = clamp(y - PH / 2, 0, H - PH);
  });
  document.addEventListener("keydown", function (e) {
    if (overlay.hidden) return;
    if (e.key === "Escape") { closeGame(); return; }
    if (state !== "playing") return;
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { keys.up = true; e.preventDefault(); }
    if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { keys.down = true; e.preventDefault(); }
  });
  document.addEventListener("keyup", function (e) {
    if (!keys) return;
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") keys.up = false;
    if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") keys.down = false;
  });

  btn.addEventListener("click", openGame);
  overlay.querySelector("#pongClose").addEventListener("click", closeGame);
  overlay.querySelector("#pongStart").addEventListener("click", startGame);
  overlay.querySelector("#pongRetry").addEventListener("click", startGame);
  overlay.querySelector("#pongToMenu").addEventListener("click", showMenu);
  overlay.querySelector("#pongSave").addEventListener("click", saveScore);
  overlay.querySelector("#pongName").addEventListener("keydown", function (e) { if (e.key === "Enter") saveScore(); });
  overlay.querySelectorAll(".pong-diffs .sw-btn").forEach(function (b) {
    b.addEventListener("click", function () { selectDiff(b.getAttribute("data-diff")); });
  });
  var muteBtn = overlay.querySelector("#pongMute");
  function syncMute() { muteBtn.textContent = muted ? "🔇" : "🔊"; }
  syncMute();
  muteBtn.addEventListener("click", function () {
    muted = !muted; localStorage.setItem("hub:pong:muted", muted ? "1" : "0"); syncMute();
    if (!muted) audio();
  });
})();
