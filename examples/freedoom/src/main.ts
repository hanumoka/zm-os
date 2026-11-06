import { zm } from '@zm/sdk';
import './style.css';

type Engine = { _zm_key(code: number, down: number): void; _zm_pause(value: number): void; _zm_restart(): void; FS: { writeFile(name: string, data: Uint8Array): void } };
declare global {
  var ZM_DOOM_DATA: string;
  var ZM_DOOM_SOURCE: string;
  var createDoom: (options: Record<string, unknown>) => Promise<Engine>;
}
const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('game'), play = el<HTMLButtonElement>('play');
const pause = el<HTMLButtonElement>('pause'), restart = el<HTMLButtonElement>('restart');
let engine: Engine | undefined, paused = true, loading = false, failed = false;
const held = new Set<number>();
const keymap: Record<string, number> = { ArrowLeft:172, ArrowRight:174, ArrowUp:173, ArrowDown:175, KeyW:173, KeyS:175, KeyA:160, KeyD:161, ControlLeft:163, ControlRight:163, Space:162, ShiftLeft:182, ShiftRight:182, Escape:27, Enter:13, Tab:9, Backspace:127, KeyY:121, KeyN:110, Digit1:49, Digit2:50, Digit3:51, Digit4:52, Digit5:53, Digit6:54, Digit7:55 };
async function unpack(encoded: string): Promise<Uint8Array> {
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function release(): void {
  held.forEach(code => engine?._zm_key(code, 0)); held.clear();
  document.querySelectorAll('[data-key]').forEach(button => { (button as HTMLElement).dataset.active = 'false'; });
}
function suspend(): void {
  if (!engine || paused || failed) return;
  release(); engine._zm_pause(1); paused = true;
  el('cover').hidden = false; el('cover-title').textContent = '잠시 멈췄습니다.';
  el('cover-description').textContent = '준비되면 이어서 플레이하세요. 창을 닫으면 진행 상황이 사라집니다.';
  play.textContent = '이어서 플레이'; pause.disabled = true;
  el('status').textContent = '일시 정지 · 게임 시간도 멈춥니다.';
}
function resume(): void {
  if (!engine || failed) return;
  paused = false; engine._zm_pause(0); el('cover').hidden = true; pause.disabled = false;
  el('status').textContent = '플레이 중 · E1M1 · 음향 및 영구 저장 없음'; canvas.focus({preventScroll:true});
}
function fail(): void {
  failed = true; release(); engine?._zm_pause(1); paused = true;
  el('cover').hidden = false; el('cover-title').textContent = '게임을 시작하지 못했습니다.';
  el('cover-description').textContent = '창을 닫고 다시 실행해 주세요. WebAssembly와 최신 브라우저가 필요합니다.';
  play.disabled = true; pause.disabled = true; restart.disabled = true;
  el('status').textContent = '실행 오류 · 다시 실행이 필요합니다.';
}
play.onclick = async () => {
  if (engine) { resume(); return; }
  if (loading || failed) return;
  loading = true; play.disabled = true; play.textContent = '엔진 불러오는 중';
  try {
    const wad = await unpack(ZM_DOOM_DATA);
    engine = await createDoom({ canvas, arguments:['-iwad', '/doom1.wad', '-warp', '1', '1', '-skill', '2', '-nosound'], preRun:[(module: Engine) => module.FS.writeFile('/doom1.wad', wad)], print:() => {}, printErr:() => {}, onAbort:fail, onExit:suspend });
    play.disabled = false; restart.disabled = false; resume();
  } catch { fail(); }
  finally { loading = false; }
};
pause.onclick = suspend;
restart.onclick = () => { if (engine && !failed) { release(); engine._zm_restart(); resume(); } };
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
canvas.addEventListener('keydown', event => {
  if (!engine || paused || !(event.code in keymap)) return;
  event.preventDefault(); const code = keymap[event.code];
  if (!held.has(code)) { held.add(code); engine._zm_key(code, 1); }
});
window.addEventListener('keyup', event => {
  const code = keymap[event.code];
  if (held.delete(code)) { event.preventDefault(); engine?._zm_key(code, 0); }
});
canvas.addEventListener('blur', event => { if (!(event.relatedTarget instanceof HTMLElement && event.relatedTarget.hasAttribute('data-key'))) suspend(); });
document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button => {
  const code = Number(button.dataset.key);
  button.onpointerdown = event => {
    if (!engine || paused) return;
    event.preventDefault(); button.setPointerCapture(event.pointerId); held.add(code); engine._zm_key(code, 1); button.dataset.active = 'true';
  };
  const up = (): void => { held.delete(code); engine?._zm_key(code, 0); button.dataset.active = 'false'; };
  button.onpointerup = up; button.onpointercancel = up; button.onlostpointercapture = up;
});
el('about').addEventListener('toggle', () => { if (el<HTMLDetailsElement>('about').open) suspend(); });
el<HTMLButtonElement>('load-source').onclick = async () => {
  const button = el<HTMLButtonElement>('load-source'); button.disabled = true;
  try {
    if (!globalThis.ZM_DOOM_SOURCE) await new Promise<void>((resolve, reject) => { const script = document.createElement('script'); script.src = './source-code.js'; script.onload = () => resolve(); script.onerror = reject; document.body.append(script); });
    const files = JSON.parse(new TextDecoder().decode(await unpack(ZM_DOOM_SOURCE))) as Record<string, string>;
    const select = el<HTMLSelectElement>('source-file'); select.replaceChildren();
    const ordered = Object.keys(files).sort((a, b) => Number(!/LICENSE|COPYING|BUILD/.test(a)) - Number(!/LICENSE|COPYING|BUILD/.test(b)) || a.localeCompare(b));
    ordered.forEach(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option); });
    select.onchange = () => { el<HTMLTextAreaElement>('source-text').value = files[select.value]; };
    el<HTMLTextAreaElement>('source-text').value = files[select.value]; el('source-panel').hidden = false; button.hidden = true;
  } catch { button.disabled = false; button.textContent = '소스를 불러오지 못했습니다. 다시 시도'; }
};
void zm.runtime.ready().then(() => { play.disabled = false; play.textContent = '게임 시작'; el('status').textContent = '준비 완료 · 게임 시작을 누르세요.'; }).catch(fail);
