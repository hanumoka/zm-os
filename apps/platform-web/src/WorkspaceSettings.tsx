import type { UserView } from "@zm/platform-contracts";
import { SectionTitle } from "./components";
import { systemTitles } from "./Desktop";
import type { WorkspaceSync, WorkspaceSnapshot } from "./workspace-sync";

interface Props {
  user: UserView | null;
  sync: WorkspaceSync;
  snapshot: WorkspaceSnapshot;
  busy: boolean;
  openWindowCount: number;
  onSaveLayout: () => void;
  onRestoreLayout: () => void;
  onLogin: () => void;
}
export function WorkspaceSettings({ user, sync, snapshot, busy, openWindowCount, onSaveLayout, onRestoreLayout, onLogin }: Props): React.JSX.Element {
  const labels = { loading: "불러오는 중", ready: user ? "서버에 저장됨" : "이 브라우저에 저장", saving: "저장 중", offline: "저장 상태 확인 필요", conflict: "설정 충돌", blocked: "로그인 확인 필요" };
  return <div className="workspace-settings">
    <SectionTitle title="작업공간" description="내 배경과 아이콘 배치를 이어 쓰고, 저장한 창 배치를 다시 엽니다." />
    <section className="workspace-status" aria-label="작업공간 동기화">
      <p role="status"><strong>{snapshot.revision === 0 && snapshot.phase === "ready" && user ? "변경할 때 서버에 저장됩니다" : labels[snapshot.phase]}</strong></p>
      <p>{user ? "같은 서버에 같은 계정으로 접속하면 배경과 아이콘 배치를 함께 사용합니다." : "로그인하면 다른 브라우저에서도 내 환경을 사용할 수 있습니다."}</p>
      {snapshot.updatedAt && <small>마지막 서버 저장: {new Date(snapshot.updatedAt).toLocaleString("ko-KR")}</small>}
      {snapshot.message && <p role="alert">{snapshot.message}</p>}
      {!user && <button onClick={onLogin}>로그인</button>}
      {snapshot.phase === "conflict" && <div className="workspace-conflict">
        <p>현재 브라우저의 변경은 이 탭에 보관되어 있습니다. 다른 기기의 설정을 사용할지, 현재 설정을 서버에 저장할지 선택하세요.</p>
        <div className="actions"><button onClick={()=>{void sync.resolveConflict("server");}}>서버 설정 사용</button>
          <button onClick={()=>{void sync.resolveConflict("local");}}>현재 브라우저 설정 저장</button></div>
      </div>}
      {snapshot.phase === "offline" && <button onClick={()=>{void sync.retry();}}>작업공간 다시 시도</button>}
      {snapshot.phase === "blocked" && <button onClick={onLogin}>내 계정에서 확인</button>}
    </section>
    <section className="form-section" aria-labelledby="workspace-wallpaper-title">
      <h2 id="workspace-wallpaper-title">바탕화면 배경</h2>
      <div className="workspace-wallpapers">{(["sky","sand","night"] as const).map((value,index)=><button key={value}
        disabled={!sync.canEdit()} aria-pressed={snapshot.data.wallpaper===value}
        onClick={()=>sync.edit(current=>({...current,wallpaper:value}))}>
        <span className={"os-wallpaper-swatch "+value}/>{["하늘","모래","밤"][index]}
      </button>)}</div>
      <p>아이콘은 바탕화면에서 드래그하거나 Alt와 방향키로 이동하세요. 작은 화면에서는 보이는 위치만 조정합니다.</p>
    </section>
    <section className="form-section" aria-labelledby="workspace-windows-title">
      <h2 id="workspace-windows-title">창 배치</h2>
      <p>창 제목줄의 좌우 정렬 버튼으로 작업 화면을 나눌 수 있습니다. 배치를 저장한 뒤 새로 접속한 환경에서 직접 복원하세요.</p>
      <p>저장 대상: 현재 {openWindowCount}개 창 · 저장된 배치: {snapshot.data.windows.length}개 창</p>
      <p className="muted">작업공간 설정 창과 검수 미리보기는 제외합니다. 앱 내부의 미저장 내용은 복원하지 않습니다.</p>
      <div className="actions">
        <button disabled={!user || !sync.canEdit() || busy || openWindowCount>24} onClick={onSaveLayout}>현재 창 배치 저장</button>
        <button disabled={!user || busy || snapshot.phase!=="ready" || snapshot.revision===0 || snapshot.data.windows.length===0} onClick={onRestoreLayout}>저장한 창 복원</button>
      </div>
      {openWindowCount>24 && <p role="alert">창 배치는 최대 24개까지 저장할 수 있습니다. 일부 창을 닫고 다시 저장하세요.</p>}
      <ul className="workspace-window-list">{snapshot.data.windows.map((entry,index)=><li key={entry.key}>
        {index+1}. {entry.kind==="system" ? systemTitles[entry.system] : entry.name ?? "인앱"} · {entry.layout.maximized ? "최대화" : entry.layout.snap==="left" ? "왼쪽" : entry.layout.snap==="right" ? "오른쪽" : "자유 배치"}{entry.layout.minimized ? " · 최소화" : ""}
      </li>)}</ul>
      <small>복원할 때 현재 권한을 확인합니다. 재동의가 필요하거나 중지된 앱은 안내 후 건너뛰고, 기존에 열린 창은 유지합니다.</small>
    </section>
  </div>;
}
