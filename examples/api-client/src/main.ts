import { zm } from '@zm/sdk';
import './style.css';

const api = 'http://127.0.0.1:4320';
let sessionToken: string | undefined;
const status = document.querySelector<HTMLElement>('#status')!;
const note = document.querySelector<HTMLTextAreaElement>('#note')!;
const loadButton = document.querySelector<HTMLButtonElement>('#load')!;
const saveButton = document.querySelector<HTMLButtonElement>('#save')!;
function failed(error: unknown): void { status.textContent = error instanceof Error ? error.message : '요청에 실패했습니다.'; }
async function request(route: string, method = 'GET', body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(api + route, { method, headers: { 'content-type': 'application/json', ...(sessionToken ? { authorization: 'Bearer ' + sessionToken } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(7000), credentials: 'omit', redirect: 'error' });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : '서버 요청에 실패했습니다.');
  return data;
}
async function load(): Promise<void> { const data = await request('/note'); note.value = typeof data.note === 'string' ? data.note : ''; status.textContent = '서버에서 읽었습니다. 권한 확인 시각: ' + String(data.admittedAt); }
document.querySelector('#connect')!.addEventListener('click', () => {
  void (async (): Promise<void> => {
    await zm.runtime.ready();
    const attempt = await request('/auth/attempt', 'POST', {});
    const code = await zm.auth.createCode(String(attempt.challenge));
    const auth = await request('/auth/complete', 'POST', { attemptId: attempt.attemptId, code: code.code });
    sessionToken = String(auth.sessionToken);
    document.querySelector('#user')!.textContent = '앱 사용자: ' + String(auth.appUserId);
    loadButton.disabled = false; saveButton.disabled = false; await load();
  })().catch(failed);
});
loadButton.addEventListener('click', () => { void load().catch(failed); });
saveButton.addEventListener('click', () => { void request('/note', 'PUT', { note: note.value }).then(data => { status.textContent = '서버에 저장했습니다. 권한 확인 시각: ' + String(data.admittedAt); }).catch(failed); });
