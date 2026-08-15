// sample-game-ipc 앱 로직.
//
// 원래는 index.html의 인라인 <script>였다. 호스트 CSP가 srcdoc 문서에 상속되고
// 앱 문서에는 nonce가 없어 프로덕션에서 차단됐다(2026-08-15 실측).
// 절대 경로 external classic script는 'self'로 통과하므로 여기로 옮겼다.
//
// index.html에서 상대 경로로 참조하면 안 된다 — srcdoc의 base URI는 부모 문서다.

(function () {
  'use strict';

  // ── DOM 참조 ────────────────────────────────────────────────────────────
  var dot         = document.getElementById('dot');
  var statusLabel = document.getElementById('status-label');
  var rpcCount    = document.getElementById('rpc-count');
  var resultArea  = document.getElementById('result-area');
  var btnPing     = document.getElementById('btn-ping');
  var btnTime     = document.getElementById('btn-time');
  var btnEcho     = document.getElementById('btn-echo');

  var _callCount = 0;

  // ── UI 헬퍼 ─────────────────────────────────────────────────────────────
  function updateStatusUI(status) {
    dot.className = 'dot ' + status;
    var labels = {
      idle:       '대기',
      connecting: '연결 중...',
      ready:      '연결됨',
      closed:     '닫힘',
      error:      '연결 오류',
    };
    statusLabel.textContent = labels[status] || status;
  }

  function enableButtons(enabled) {
    btnPing.disabled = !enabled;
    btnTime.disabled = !enabled;
    btnEcho.disabled = !enabled;
  }

  function appendResult(text, type) {
    // 첫 번째 "대기 중" 메시지 제거
    var first = resultArea.querySelector('.result-info');
    if (first && first.textContent === '호스트 연결 대기 중...') {
      first.remove();
    }
    var div = document.createElement('div');
    div.className = 'result-entry result-' + (type || 'ok');
    div.textContent = text;
    resultArea.appendChild(div);
    resultArea.scrollTop = resultArea.scrollHeight;
  }

  // ── IPC 준비 대기 ────────────────────────────────────────────────────────
  function waitForIpc() {
    if (typeof window.__zmosIpc === 'undefined') {
      // IPC 런타임이 아직 초기화 전 (발생 가능성 낮지만 방어)
      appendResult('⚠ window.__zmosIpc 없음 — IPC 런타임 미주입', 'err');
      return;
    }

    var ipc = window.__zmosIpc;

    function pollStatus() {
      var s = ipc.status;
      updateStatusUI(s);
      if (s === 'ready') {
        enableButtons(true);
        appendResult('✅ 호스트와 연결됨 (status: ready)', 'ok');
      } else if (s === 'error') {
        appendResult('❌ 핸드셰이크 타임아웃 또는 오류', 'err');
      } else if (s === 'connecting') {
        setTimeout(pollStatus, 100);
      }
    }
    pollStatus();
  }

  // ── RPC 호출 헬퍼 ────────────────────────────────────────────────────────
  function rpcCall(method, args) {
    var ipc = window.__zmosIpc;
    _callCount++;
    rpcCount.textContent = String(_callCount);

    ipc.call(method, args || []).then(function (result) {
      appendResult('[' + method + '] ✓ ' + JSON.stringify(result), 'ok');
    }).catch(function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      appendResult('[' + method + '] ✗ ' + msg, 'err');
    });
  }

  // ── 버튼 이벤트 ──────────────────────────────────────────────────────────
  btnPing.addEventListener('click', function () { rpcCall('ping'); });
  btnTime.addEventListener('click', function () { rpcCall('getTime'); });
  btnEcho.addEventListener('click', function () { rpcCall('echo', ['hello from app']); });

  // ── 초기화 ────────────────────────────────────────────────────────────────
  // DOMContentLoaded 후 IPC 런타임이 INIT을 전송하므로 약간 뒤에 폴링 시작
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForIpc);
  } else {
    waitForIpc();
  }
})();
