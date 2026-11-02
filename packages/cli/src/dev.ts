import { build } from 'esbuild';
import { createServer, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { collectDirectory } from './bundle';
import { validateProject } from './project';
import path from 'node:path';

export async function serveDevelopment(directory: string): Promise<void> {
  const result = await validateProject(directory, { allowLocalHttp: true });
  const files = new Map((await collectDirectory(path.resolve(directory, 'dist'))).map(file => [file.path, file.data]));
  const manifest = JSON.stringify(result.manifest);
  const script = await build({ stdin: { contents: `
import { attachHostBridge, clearAppStorage } from ${JSON.stringify(fileURLToPath(import.meta.resolve('@zm/host-bridge')))};
const manifest=${manifest}; let bridge; let frame; let active=false; let online=true; let stopped=false; let user='alice';
const status=document.querySelector('#status');
function show(message){status.textContent=message;}
function end(reason){active=false;bridge?.dispose();frame?.remove();bridge=undefined;frame=undefined;show(reason);}
function start(){if(stopped){show('일반 중지 상태입니다. 새 실행이 차단됩니다.');return;}end('새 실행');active=true;const id=crypto.randomUUID();frame=document.createElement('iframe');frame.title='개발 앱';frame.sandbox='allow-scripts';frame.src='http://127.0.0.1:4322/index.html?instance='+id;
const session={id,appId:manifest.appId,appUserId:'test-app-user:'+manifest.appId+':'+user,versionId:'test-version',expiresAt:new Date(Date.now()+3600000).toISOString(),manifest,documentUrl:frame.src};
bridge=attachHostBridge({iframe:frame,userId:'test-user:'+user,session,authorize:async()=>{if(!online)throw new Error('시험: 네트워크 연결이 끊겼습니다.');if(!active){const error=new Error('시험: 실행 권한 없음');error.status=403;throw error;}},createCode:async()=>{throw new Error('시험 호스트는 실제 외부 서버 인증 코드를 발급하지 않습니다. 플랫폼에서 API 앱을 실행하세요.');},onClose:end});document.querySelector('#app').append(frame);show('시험 사용자 '+user+'로 실행 중');}
document.querySelector('#start').onclick=start;
document.querySelector('#user').onchange=(event)=>{user=event.target.value;end('사용자를 바꿨습니다. 다시 실행하세요.');};
document.querySelector('#normal').onclick=()=>{stopped=!stopped;show(stopped?'일반 중지: 기존 실행은 유지합니다.':'새 실행을 허용했습니다.');};
document.querySelector('#emergency').onclick=()=>end('긴급 중지: 실행과 SDK 연결을 종료했습니다.');
document.querySelector('#revoke').onclick=()=>end('동의를 철회한 상황입니다. 재동의 후 새 실행을 시험하세요.');
document.querySelector('#network').onclick=()=>{online=!online;show(online?'네트워크 복구':'네트워크 단절: SDK 권한 확인을 거부합니다.');};
document.querySelector('#clear').onclick=async()=>{if(confirm('현재 시험 사용자·앱의 이 기기 데이터만 삭제할까요?')){end('로컬 삭제');await clearAppStorage('test-user:'+user,manifest.appId);show('현재 기기 데이터를 삭제했습니다.');}};
start();
`, resolveDir: process.cwd(), loader: 'js' }, bundle: true, write: false, format: 'esm', target: 'es2022', platform: 'browser', logLevel: 'silent' });
  const hostScript = script.outputFiles[0]?.contents;
  if (!hostScript) throw new Error('시험 호스트를 빌드하지 못했습니다.');
  const send = (response: ServerResponse, type: string, body: string | Uint8Array): void => { response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); response.end(body); };
  const host = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4321');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; frame-src http://127.0.0.1:4322; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    if (url.pathname === '/host.js') { send(response, 'text/javascript; charset=utf-8', hostScript); return; }
    if (url.pathname === '/host.css') { send(response, 'text/css', 'body{font-family:system-ui;background:#eff3f0;color:#183d30;margin:0}header{padding:1rem;display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}h1{font-size:1.1rem}button,select{padding:.5rem}#status{padding:0 1rem;min-height:2rem}iframe{width:100%;height:72vh;border:0;background:white}'); return; }
    if (url.pathname !== '/') { response.writeHead(404).end(); return; }
    send(response, 'text/html; charset=utf-8', '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>zm-os 앱 시험 호스트</title><link rel="stylesheet" href="/host.css"><header><h1>앱 시험 호스트 · 모의 인증</h1><label>시험 사용자 <select id="user"><option>alice</option><option>bob</option></select></label><button id="start">새 실행</button><button id="normal">일반 중지 전환</button><button id="emergency">긴급 중지</button><button id="revoke">동의 철회</button><button id="network">연결 끊김 전환</button><button id="clear">현재 기기 데이터 삭제</button></header><p id="status" role="status"></p><main id="app"></main><script type="module" src="/host.js"></script></html>');
  });
  const assets = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:4322');
    const file = files.get(url.pathname.slice(1));
    if (!file) { response.writeHead(404).end(); return; }
    const contentType: Record<string, string> = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Content-Security-Policy', `default-src 'none'; script-src http://127.0.0.1:4322; style-src http://127.0.0.1:4322; img-src http://127.0.0.1:4322 data:; font-src http://127.0.0.1:4322; connect-src ${result.manifest.apiOrigins.join(' ') || "'none'"}; base-uri 'none'; form-action 'none'; frame-ancestors http://127.0.0.1:4321; sandbox allow-scripts`);
    send(response, contentType[path.extname(url.pathname)] ?? 'application/octet-stream', file);
  });
  await new Promise<void>((resolve, reject) => { assets.once('error', reject); assets.listen(4322, '127.0.0.1', resolve); });
  try { await new Promise<void>((resolve, reject) => { host.once('error', reject); host.listen(4321, '127.0.0.1', resolve); }); }
  catch (error) { assets.close(); throw error; }
  process.stdout.write('시험 호스트: http://127.0.0.1:4321 (종료: Ctrl+C)\n');
  const close = (): void => { host.close(); assets.close(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
