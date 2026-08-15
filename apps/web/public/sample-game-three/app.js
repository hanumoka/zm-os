// sample-game-three 앱 로직.
//
// 원래는 index.html의 인라인 <script>였다. 호스트 CSP가 srcdoc 문서에 상속되고
// 앱 문서에는 nonce가 없어 프로덕션에서 차단됐다(2026-08-15 실측).
// 절대 경로 external classic script는 'self'로 통과하므로 여기로 옮겼다.
//
// index.html에서 상대 경로로 참조하면 안 된다 — srcdoc의 base URI는 부모 문서다.

(function () {
  // ── 격리 검증 ─────────────────────────────────────────────────
  var statusEl = document.getElementById('isolation');
  var isolated = true;
  try { window.parent.localStorage.getItem('test'); isolated = false; } catch (e) { /* expected */ }
  try { window.top.document.cookie; isolated = false; } catch (e) { /* expected */ }
  statusEl.textContent = isolated ? '✅ 격리 OK' : '❌ 격리 실패';
  statusEl.style.color = isolated ? '#4ade80' : '#f87171';

  // ── Three.js Scene ────────────────────────────────────────────
  var W = 600, H = 400;
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  var camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 100);
  camera.position.z = 6;

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  // ── 조명 ──────────────────────────────────────────────────────
  var ambient = new THREE.AmbientLight(0x404060, 1.5);
  scene.add(ambient);

  var dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(3, 4, 5);
  scene.add(dirLight);

  var pointLight = new THREE.PointLight(0xa78bfa, 3, 20);
  pointLight.position.set(-2, 2, 3);
  scene.add(pointLight);

  // ── 큐브 생성 ─────────────────────────────────────────────────
  var cubes = [];
  var colors = [0x38bdf8, 0xa78bfa, 0xfbbf24, 0x4ade80, 0xf87171, 0xe879f9];
  var geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);

  for (var i = 0; i < 12; i++) {
    var material = new THREE.MeshStandardMaterial({
      color: colors[i % colors.length],
      metalness: 0.3,
      roughness: 0.4,
    });
    var cube = new THREE.Mesh(geometry, material);
    var angle = (i / 12) * Math.PI * 2;
    var radius = 2.5;
    cube.position.x = Math.cos(angle) * radius;
    cube.position.y = Math.sin(angle) * radius;
    cube.position.z = (Math.random() - 0.5) * 2;
    cube.rotSpeed = {
      x: 0.01 + Math.random() * 0.02,
      y: 0.01 + Math.random() * 0.02,
    };
    scene.add(cube);
    cubes.push(cube);
  }

  // ── 중앙 와이어프레임 구 ──────────────────────────────────────
  var sphereGeo = new THREE.IcosahedronGeometry(1.2, 1);
  var wireframe = new THREE.WireframeGeometry(sphereGeo);
  var lineMat = new THREE.LineBasicMaterial({ color: 0x64748b, opacity: 0.5, transparent: true });
  var sphere = new THREE.LineSegments(wireframe, lineMat);
  scene.add(sphere);

  // ── 마우스 인터랙션 ───────────────────────────────────────────
  var mouseX = 0, mouseY = 0;
  renderer.domElement.addEventListener('pointermove', function (e) {
    var rect = renderer.domElement.getBoundingClientRect();
    mouseX = ((e.clientX - rect.left) / W - 0.5) * 2;
    mouseY = -((e.clientY - rect.top) / H - 0.5) * 2;
  });

  // ── 애니메이션 루프 ───────────────────────────────────────────
  var fpsEl = document.getElementById('fpsCounter');
  var lastTime = performance.now();
  var frameCount = 0;

  function animate() {
    requestAnimationFrame(animate);

    var now = performance.now();
    frameCount++;
    if (now - lastTime >= 1000) {
      fpsEl.textContent = 'FPS: ' + frameCount;
      frameCount = 0;
      lastTime = now;
    }

    var time = now * 0.001;

    // 큐브 회전
    for (var i = 0; i < cubes.length; i++) {
      var c = cubes[i];
      c.rotation.x += c.rotSpeed.x;
      c.rotation.y += c.rotSpeed.y;
      var angle = (i / cubes.length) * Math.PI * 2 + time * 0.3;
      c.position.x = Math.cos(angle) * 2.5;
      c.position.y = Math.sin(angle) * 2.5;
    }

    // 와이어프레임 구 회전
    sphere.rotation.x = time * 0.2;
    sphere.rotation.y = time * 0.3;

    // 카메라 마우스 추종
    camera.position.x += (mouseX * 2 - camera.position.x) * 0.05;
    camera.position.y += (mouseY * 2 - camera.position.y) * 0.05;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  }

  animate();
})();
