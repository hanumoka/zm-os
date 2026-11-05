import { zm, SdkError } from '@zm/sdk';
import type { CloudRecord, CloudWriteResult, CloudPut, CloudRemove } from '@zm/platform-contracts';
import './style.css';

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const note = element<HTMLTextAreaElement>('note'), status = element('status');
const buttons = ['save', 'reload', 'remove', 'retry', 'use-server', 'merge', 'import-local', 'restore-draft'];
let current: CloudRecord | undefined, latest: CloudRecord | undefined;
let busy = false, dirty = false, compatible = true, refreshing = false;
let localNote = '', recoveredDraft = '';
let pending: { kind: 'put'; data: CloudPut; text: string } | { kind: 'remove'; data: CloudRemove; text: string } | undefined;
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let draftQueue = Promise.resolve();
const recordLimit = 32 * 1024;
function fits(text: string): boolean { return new TextEncoder().encode(JSON.stringify({text})).byteLength + 4 <= recordLimit; }
function textOf(record: CloudRecord): string {
  if (!record.exists) return '';
  if (record.schemaVersion === 1 && record.value && typeof record.value === 'object' && !Array.isArray(record.value) && typeof record.value.text === 'string') return record.value.text;
  throw new Error('이 앱 버전이 읽을 수 없는 데이터 형식입니다. 서버 내용을 변경하지 않았습니다.');
}
function message(text: string, error = false): void { status.textContent = text; status.dataset.error = String(error); }
function render(): void {
  note.disabled = !current || busy || !!pending || !compatible;
  for (const id of buttons) element<HTMLButtonElement>(id).disabled = busy || !current || !compatible || (!!pending && id !== 'retry');
  element('retry').hidden = !pending;
  element('saved-version').textContent = current ? '서버 수정 번호 ' + current.revision : '연결 확인 중';
}
function cacheDraft(value: string | null): void {
  clearTimeout(draftTimer);
  if (value !== null && !fits(value)) { element('draft-status').textContent='초안이 너무 커 기기에 보관하지 않았습니다. 내용을 줄이거나 별도로 복사해 두세요.';return; }
  draftQueue = draftQueue.then(async () => {
    if (value === null) await zm.storage.remove('cloud-note-draft');
    else await zm.storage.set('cloud-note-draft', value);
  }).catch(() => { element('draft-status').textContent = '이 기기의 초안 보관을 확인하지 못했습니다. 창을 닫기 전에 서버 저장 결과를 확인하세요.'; });
}
function markDirty(): void {
  dirty = true; message('수정됨 · 아직 서버에 저장하지 않았습니다.');
  clearTimeout(draftTimer);draftTimer=setTimeout(()=>cacheDraft(note.value),350);
}
function applyRecord(record: CloudRecord): void {
  const text = textOf(record);
  current=record;latest=undefined;note.value=text;dirty=false;
  element('conflict').hidden=true;render();
}
function compare(record: CloudRecord): void {
  latest=record;
  element('server-note').textContent=textOf(record) || '(서버 메모가 비어 있습니다.)';
  element('conflict').hidden=false;
  message('다른 내용이 있습니다. 내 입력을 유지했으니 서버 내용과 비교해 주세요.',true);
}
async function reload(explicit = true): Promise<void> {
  if (busy || pending || refreshing || (!explicit && dirty)) return;
  const baseline=current;
  refreshing=true;
  // Focus can fire during typing: background reads must not disable the editor.
  if(explicit){busy=true;render();}
  try {
    const received=await zm.cloud.get('note');
    if(!explicit&&(pending||busy||current!==baseline))return;
    if(!explicit&&dirty&&received.generation===baseline?.generation&&received.revision===baseline.revision)return;
    if (dirty && note.value!==textOf(received)) compare(received);
    else { applyRecord(received); message(received.exists?'서버에 저장된 메모를 불러왔습니다.':'아직 서버에 저장된 메모가 없습니다.'); }
  } catch (error) { message(error instanceof Error?error.message:'서버 조회에 실패했습니다.',true); }
  finally { refreshing=false;if(explicit)busy=false;render(); }
}
async function submit(): Promise<void> {
  if (!current || busy || !pending) return;
  busy=true;render();
  const operation=pending;
  try {
    const result: CloudWriteResult=operation.kind==='put'
      ?await zm.cloud.put('note',operation.data):await zm.cloud.remove('note',operation.data);
    current={...result,value:operation.kind==='put'?{text:operation.text}:null};
    note.value=operation.text;dirty=false;pending=undefined;latest=undefined;
    element('conflict').hidden=true;cacheDraft(null);
    message(operation.kind==='put'?'서버에 저장했습니다. 같은 계정의 다른 기기에서도 불러올 수 있습니다.':'서버 메모를 삭제했습니다. 기존 로컬 메모는 별도로 남아 있을 수 있습니다.');
  } catch(error) {
    const code=error instanceof SdkError?error.code:'REQUEST_FAILED';
    const known=['CLOUD_REVISION_CONFLICT','CLOUD_STALE_GENERATION','CLOUD_QUOTA_EXCEEDED','CLOUD_REQUEST_REUSED','CLOUD_RECEIPT_LIMIT','CLOUD_RATE_LIMITED','INVALID_VALUE'];
    if (known.includes(code)) {
      pending=undefined;
      if(code==='CLOUD_REVISION_CONFLICT'||code==='CLOUD_STALE_GENERATION'){
        try { compare(await zm.cloud.get('note')); }
        catch {message('서버 내용이 변경됐지만 최신 내용은 읽지 못했습니다. 입력을 유지했습니다. 다시 불러와 비교하세요.',true);}
      } else message(error instanceof Error?error.message:'저장을 처리하지 못했습니다.',true);
    } else message('저장 결과를 확인하지 못했습니다. 입력을 보관하고 같은 요청으로 다시 확인할 수 있습니다.',true);
  } finally { busy=false;render(); }
}
function beginWrite(removing = false, baseline = current): void {
  if(!baseline||busy||pending||!compatible)return;
  if(!removing&&!fits(note.value)){message('메모는 UTF-8 기준 32 KiB 안에서 저장할 수 있습니다. 내용을 줄여 주세요. 입력은 유지했습니다.',true);return;}
  const base={generation:baseline.generation,expectedRevision:baseline.revision,requestId:crypto.randomUUID()};
  pending=removing?{kind:'remove',data:base,text:''}:{kind:'put',data:{...base,value:{text:note.value},schemaVersion:1},text:note.value};
  cacheDraft(note.value);void submit();
}
async function start(): Promise<void> {
  busy=true;render();
  try {
    await zm.runtime.ready();
    const user=await zm.identity.getAppUser();element('user').textContent='로그인 계정의 개인 메모 · 앱 사용자 '+user.appUserId.slice(0,8);
    const record=await zm.cloud.get('note');
    try{applyRecord(record);}catch(error){compatible=false;throw error;}
    message(record.exists?'서버 메모를 불러왔습니다.':'메모를 쓰고 서버에 저장해 주세요.');
    const [old,draft]=await Promise.all([zm.storage.get('note').catch(()=>null),zm.storage.get('cloud-note-draft').catch(()=>null)]);
    if(typeof old==='string'&&old){localNote=old;element('local-note').textContent=old;element('migration').hidden=false;}
    if(typeof draft==='string'&&draft&&draft!==note.value){recoveredDraft=draft;element('draft-note').textContent=draft;element('draft-recovery').hidden=false;}
  }catch(error){message(error instanceof Error?error.message:'연결하지 못했습니다.',true);element('startup-retry').hidden=false;}
  finally{busy=false;render();}
}
note.addEventListener('input',markDirty);
element('save').onclick=()=>beginWrite();
element('reload').onclick=()=>{void reload();};
element('retry').onclick=()=>{void submit();};
element('remove').onclick=()=>{element('delete-confirm').hidden=false;};
element('cancel-delete').onclick=()=>{element('delete-confirm').hidden=true;};
element('confirm-delete').onclick=()=>{element('delete-confirm').hidden=true;beginWrite(true);};
element('use-server').onclick=()=>{if(latest){applyRecord(latest);cacheDraft(null);message('내 입력 대신 확인한 서버 내용을 선택했습니다.');}};
element('merge').onclick=()=>{if(latest)beginWrite(false,latest);};
element('import-local').onclick=()=>{note.value=localNote;markDirty();element('migration').hidden=true;message('로컬 메모를 편집창으로 가져왔습니다. 서버에 저장을 눌러 복사하세요. 원본은 유지됩니다.');};
element('restore-draft').onclick=()=>{note.value=recoveredDraft;markDirty();element('draft-recovery').hidden=true;message('초안을 복원했습니다. 서버 내용과 비교한 뒤 저장하세요.');};
element('startup-retry').onclick=()=>{element('startup-retry').hidden=true;void start();};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty)cacheDraft(note.value);else if(!document.hidden&&current)void reload(false);});
window.addEventListener('focus',()=>{if(current)void reload(false);});
window.addEventListener('online',()=>{if(current&&!dirty&&!pending)void reload(false);});
setInterval(()=>{if(current&&!document.hidden&&!dirty&&!pending)void reload(false);},15000);
void start();
