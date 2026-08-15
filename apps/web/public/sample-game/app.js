// sample-game 앱 로직.
//
// 원래는 index.html의 인라인 <script>였다. 호스트 CSP가 srcdoc 문서에 상속되고
// 앱 문서에는 nonce가 없어 프로덕션에서 차단됐다(2026-08-15 실측).
// 절대 경로 external classic script는 'self'로 통과하므로 여기로 옮겼다.
//
// index.html에서 상대 경로로 참조하면 안 된다 — srcdoc의 base URI는 부모 문서다.

(function () {
  var status = document.getElementById('status');

  function send(data) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(data, '*');
    }
  }

  var canTouchParentStorage = false;
  var canTouchParentDocument = false;
  var canTouchParentCookies = false;
  try { if (window.parent.localStorage) canTouchParentStorage = true; } catch (e) {}
  try { if (window.parent.document) canTouchParentDocument = true; } catch (e) {}
  try { if (window.parent.document && window.parent.document.cookie) canTouchParentCookies = true; } catch (e) {}

  send({
    type: 'isolation-check',
    canTouchParentStorage: canTouchParentStorage,
    canTouchParentDocument: canTouchParentDocument,
    canTouchParentCookies: canTouchParentCookies,
    origin: location.origin,
  });

  var allBlocked = !canTouchParentStorage && !canTouchParentDocument && !canTouchParentCookies;
  status.innerHTML =
    (allBlocked ? '<span class="ok">✅ 격리 OK</span>' : '<span class="fail">⚠ FAIL — 일부 access 가능</span>') +
    ' / origin: <code>' + location.origin + '</code>';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var x = 60, y = 60, vx = 3.2, vy = 2.3, r = 18;
  var hue = 215;

  function tick() {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    x += vx; y += vy;
    if (x < r) { x = r; vx = -vx; hue = (hue + 30) % 360; }
    if (x > canvas.width - r) { x = canvas.width - r; vx = -vx; hue = (hue + 30) % 360; }
    if (y < r) { y = r; vy = -vy; hue = (hue + 30) % 360; }
    if (y > canvas.height - r) { y = canvas.height - r; vy = -vy; hue = (hue + 30) % 360; }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'hsl(' + hue + ', 70%, 55%)';
    ctx.fill();
    requestAnimationFrame(tick);
  }
  tick();

  canvas.addEventListener('click', function (e) {
    var rect = canvas.getBoundingClientRect();
    send({
      type: 'click',
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top),
    });
  });

  send({ type: 'ready', game: 'bouncing-ball' });
})();
