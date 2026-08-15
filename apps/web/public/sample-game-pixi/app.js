// sample-game-pixi 앱 로직.
//
// 원래는 index.html의 인라인 <script>였다. 호스트 CSP가 srcdoc 문서에 상속되고
// 앱 문서에는 nonce가 없어 프로덕션에서 차단됐다(2026-08-15 실측).
// 절대 경로 external classic script는 'self'로 통과하므로 여기로 옮겼다.
//
// index.html에서 상대 경로로 참조하면 안 된다 — srcdoc의 base URI는 부모 문서다.

(async function () {
  // ── 격리 검증 ─────────────────────────────────────────────────
  var statusEl = document.getElementById('isolation');
  var isolated = true;
  try { window.parent.localStorage.getItem('test'); isolated = false; } catch (e) { /* expected */ }
  try { window.top.document.cookie; isolated = false; } catch (e) { /* expected */ }
  statusEl.textContent = isolated ? '✅ 격리 OK' : '❌ 격리 실패';
  statusEl.style.color = isolated ? '#4ade80' : '#f87171';

  // ── Pixi.js Application ───────────────────────────────────────
  var W = 600, H = 400;
  var app = new PIXI.Application();
  await app.init({
    width: W,
    height: H,
    background: '#0f172a',
    antialias: true,
  });
  document.body.appendChild(app.canvas);

  var countEl = document.getElementById('particleCount');
  var particles = [];
  var MAX_PARTICLES = 200;
  var colors = [0x38bdf8, 0xa78bfa, 0xfbbf24, 0x4ade80, 0xf87171, 0xe879f9];

  function spawnParticle(x, y) {
    var g = new PIXI.Graphics();
    var radius = 2 + Math.random() * 4;
    var color = colors[Math.floor(Math.random() * colors.length)];
    g.circle(0, 0, radius);
    g.fill({ color: color, alpha: 0.7 + Math.random() * 0.3 });
    g.x = x !== undefined ? x : Math.random() * W;
    g.y = y !== undefined ? y : -10;
    g.vx = (Math.random() - 0.5) * 1.5;
    g.vy = 1 + Math.random() * 3;
    g.life = 1.0;
    g.decay = 0.003 + Math.random() * 0.005;
    app.stage.addChild(g);
    particles.push(g);
  }

  // 초기 파티클
  for (var i = 0; i < 50; i++) {
    spawnParticle(Math.random() * W, Math.random() * H);
  }

  // 클릭/터치로 파티클 폭발
  app.canvas.addEventListener('pointerdown', function (e) {
    var rect = app.canvas.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var py = e.clientY - rect.top;
    for (var j = 0; j < 20; j++) {
      spawnParticle(px, py);
    }
  });

  // ── 게임 루프 ─────────────────────────────────────────────────
  app.ticker.add(function () {
    // 자동 스폰
    if (particles.length < MAX_PARTICLES && Math.random() < 0.3) {
      spawnParticle();
    }

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      p.alpha = Math.max(0, p.life);

      // 바운스
      if (p.x < 0 || p.x > W) p.vx *= -1;

      // 제거
      if (p.life <= 0 || p.y > H + 20) {
        app.stage.removeChild(p);
        p.destroy();
        particles.splice(i, 1);
      }
    }

    countEl.textContent = 'particles: ' + particles.length;
  });
})();
