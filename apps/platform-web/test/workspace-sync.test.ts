import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { defaultWorkspace, type WorkspaceData, type WorkspaceView, type WorkspaceWrite } from "@zm/platform-contracts";
import { WorkspaceSync, type WorkspaceLocal, type WorkspaceTransport } from "../src/workspace-sync.js";
import { desktopReducer, emptyDesktop, fitRect } from "../src/desktop-state.js";

function local(legacy: WorkspaceData | null = null): WorkspaceLocal & { draft: string | null } {
  return { legacy, draft: null, readDraft() { return this.draft; }, writeDraft(value) { this.draft = value; }, writeGuest() {} };
}
function server() {
  const id=randomUUID();
  let current: WorkspaceView={userId:id,revision:0,workspace:defaultWorkspace(),updatedAt:null,lastRequestId:null};
  const transport: WorkspaceTransport={
    read: async()=>structuredClone(current),
    write: async request=>{
      if(current.lastRequestId===request.requestId)return structuredClone(current);
      if(current.revision!==request.revision)throw Object.assign(new Error("conflict"),{code:"WORKSPACE_CONFLICT"});
      current={userId:id,revision:current.revision+1,workspace:structuredClone(request.workspace),updatedAt:new Date().toISOString(),lastRequestId:request.requestId};
      return structuredClone(current);
    },
  };
  return {id,transport,read:()=>current};
}
function deferred<T>(): {promise:Promise<T>;resolve:(value:T)=>void} {
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};
}
async function settle(check:()=>boolean):Promise<void>{
  for(let i=0;i<60;i++){if(check())return;await new Promise(done=>setTimeout(done,5));}
  assert.ok(check(),"비동기 저장 완료 시간 초과");
}

test("최초 로컬 설정 이전과 기존 서버 설정 우선",async()=>{
  const s=server(),l=local({...defaultWorkspace(),wallpaper:"night"});
  const a=new WorkspaceSync(s.id,s.transport,l);await a.start();await a.flush();
  assert.equal(s.read().workspace.wallpaper,"night");
  assert.equal(a.getSnapshot().phase,"ready");assert.equal(l.draft,null);
  const b=new WorkspaceSync(s.id,s.transport,local({...defaultWorkspace(),wallpaper:"sand"}));await b.start();
  assert.equal(b.getSnapshot().data.wallpaper,"night");assert.equal(s.read().revision,1);a.stop();b.stop();
});
test("서로 다른 브라우저 변경의 충돌·서버 선택·명시적 현재 설정 저장",async()=>{
  const s=server(),a=new WorkspaceSync(s.id,s.transport,local()),b=new WorkspaceSync(s.id,s.transport,local());
  await a.start();await b.start();
  a.edit({...a.getSnapshot().data,wallpaper:"sand"});await a.flush();
  b.edit({...b.getSnapshot().data,wallpaper:"night"});await b.flush();
  assert.equal(b.getSnapshot().phase,"conflict");assert.equal(b.getSnapshot().data.wallpaper,"night");
  assert.equal(s.read().workspace.wallpaper,"sand");
  await b.resolveConflict("local");assert.equal(s.read().workspace.wallpaper,"night");
  a.edit({...a.getSnapshot().data,wallpaper:"sky"});await a.flush();assert.equal(a.getSnapshot().phase,"conflict");
  await a.resolveConflict("server");assert.equal(a.getSnapshot().data.wallpaper,"night");
  a.stop();b.stop();
});
test("저장 응답 소실 후 새로고침은 동일 요청 결과를 확인하고 중복 수정하지 않음",async()=>{
  const s=server(),l=local();let once=true;
  const transport={...s.transport,write:async(request:WorkspaceWrite)=>{const result=await s.transport.write(request);if(once){once=false;throw new TypeError("network");}return result;}};
  const a=new WorkspaceSync(s.id,transport,l);await a.start();
  a.edit({...a.getSnapshot().data,wallpaper:"sand"});await a.flush();
  assert.equal(a.getSnapshot().phase,"offline");assert.ok(l.draft);assert.equal(s.read().revision,1);a.stop();
  const b=new WorkspaceSync(s.id,transport,l);await b.start();
  assert.equal(b.getSnapshot().data.wallpaper,"sand");assert.equal(b.getSnapshot().phase,"ready");
  assert.equal(s.read().revision,1);assert.equal(l.draft,null);b.stop();
});
test("동작 중 도착한 원격 설정에서 사용자가 바꾼 필드만 갱신",async()=>{
  const s=server(),a=new WorkspaceSync(s.id,s.transport,local()),b=new WorkspaceSync(s.id,s.transport,local());
  await a.start();await b.start();
  const finishDrag=():void=>a.edit(current=>({...current,positions:{...current.positions,store:{column:2,row:1}}}));
  b.edit(current=>({...current,wallpaper:"night"}));await b.flush();await a.refresh();
  finishDrag();await a.flush();
  assert.equal(s.read().workspace.wallpaper,"night");assert.deepEqual(s.read().workspace.positions.store,{column:2,row:1});a.stop();b.stop();
});
test("저장 중 추가 변경은 이전 응답으로 사라지지 않으며 순서대로 저장",async()=>{
  const s=server(),gate=deferred<void>();let first=true;
  const transport={...s.transport,write:async(request:WorkspaceWrite)=>{if(first){first=false;await gate.promise;}return s.transport.write(request);}};
  const a=new WorkspaceSync(s.id,transport,local());await a.start();
  a.edit({...a.getSnapshot().data,wallpaper:"sand"});const sending=a.flush();
  a.edit({...a.getSnapshot().data,wallpaper:"night"});gate.resolve();await sending;
  await settle(()=>a.getSnapshot().phase==="ready");
  assert.equal(s.read().revision,2);assert.equal(a.getSnapshot().data.wallpaper,"night");assert.equal(s.read().workspace.wallpaper,"night");a.stop();
});
test("화면 종료 뒤 늦은 응답과 다른 계정 응답을 적용하지 않음",async()=>{
  const s=server(),gate=deferred<WorkspaceView>();
  const a=new WorkspaceSync(s.id,{...s.transport,read:()=>gate.promise},local());
  const loading=a.start();a.stop();gate.resolve({...s.read(),workspace:{...defaultWorkspace(),wallpaper:"night"}});await loading;
  assert.equal(a.getSnapshot().data.wallpaper,"sky");
  const b=new WorkspaceSync(randomUUID(),s.transport,local());await b.start();
  assert.equal(b.getSnapshot().phase,"blocked");assert.equal(b.canEdit(),false);b.stop();
});
test("중단·다시 연결하는 동안 진행 중이던 저장도 잃지 않음",async()=>{
  const s=server(),l=local(),gate=deferred<void>();let first=true;
  const transport={...s.transport,write:async(request:WorkspaceWrite)=>{if(first){first=false;await gate.promise;}return s.transport.write(request);}};
  const a=new WorkspaceSync(s.id,transport,l);await a.start();
  a.edit({...a.getSnapshot().data,wallpaper:"night"});const saving=a.flush();a.stop();await a.start();gate.resolve();await saving;
  await settle(()=>a.getSnapshot().phase==="ready" && !l.draft);
  assert.equal(s.read().revision,1);assert.equal(s.read().workspace.wallpaper,"night");a.stop();
});
test("창 정렬·최대화·최소화·기존 창 복원은 실행 객체를 바꾸지 않음",()=>{
  let state=desktopReducer(emptyDesktop,{type:"open",window:{id:"system:store",title:"Store",kind:"system",system:"store"}});
  const rect=state.windows[0]!.rect;
  state=desktopReducer(state,{type:"snap",id:"system:store",side:"left"});
  state=desktopReducer(state,{type:"maximize",id:"system:store"});
  state=desktopReducer(state,{type:"maximize",id:"system:store"});
  assert.equal(state.windows[0]!.snap,"left");assert.deepEqual(state.windows[0]!.rect,rect);
  state=desktopReducer(state,{type:"open",window:{id:"system:store",title:"Store",kind:"system",system:"store"},layout:{rect,minimized:true,maximized:false,snap:"right"}});
  assert.equal(state.windows.length,1);assert.equal(state.active,null);assert.equal(state.windows[0]!.snap,"right");
  assert.deepEqual(fitRect(rect,390,600),{x:0,y:0,width:390,height:600});
});
