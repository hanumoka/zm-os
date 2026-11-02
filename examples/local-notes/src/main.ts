import { zm } from '@zm/sdk';
import './style.css';
const note = document.querySelector<HTMLTextAreaElement>('#note')!;
const status = document.querySelector<HTMLElement>('#status')!;
const show = (error: unknown): void => { status.textContent = error instanceof Error ? error.message : '요청 실패'; };
async function start(): Promise<void> { await zm.runtime.ready(); const user = await zm.identity.getAppUser(); const saved = await zm.storage.get('note'); note.value = typeof saved === 'string' ? saved : ''; document.querySelector('#user')!.textContent = '앱 사용자: ' + user.appUserId; note.disabled = false; document.querySelector<HTMLButtonElement>('#save')!.disabled = false; document.querySelector<HTMLButtonElement>('#remove')!.disabled = false; }
document.querySelector('#save')!.addEventListener('click', () => { void zm.storage.set('note', note.value).then(() => { status.textContent = '현재 기기에 저장했습니다.'; }).catch(show); });
document.querySelector('#remove')!.addEventListener('click', () => { void zm.storage.remove('note').then(() => { note.value = ''; status.textContent = '메모를 삭제했습니다.'; }).catch(show); });
void start().catch(show);
