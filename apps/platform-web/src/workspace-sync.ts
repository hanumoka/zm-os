import { defaultWorkspace, workspaceSchema, workspaceDraftSchema, type WorkspaceDraft, type WorkspaceData, type WorkspaceView, type WorkspaceWrite } from "@zm/platform-contracts";

export type SyncPhase = "loading" | "ready" | "saving" | "offline" | "conflict" | "blocked";
export interface WorkspaceSnapshot {
  data: WorkspaceData;
  phase: SyncPhase;
  revision: number;
  updatedAt: string | null;
  message: string;
}
export interface WorkspaceTransport {
  read(): Promise<WorkspaceView>;
  write(request: WorkspaceWrite): Promise<WorkspaceView>;
}
export interface WorkspaceLocal {
  legacy: WorkspaceData | null;
  readDraft(): string | null;
  writeDraft(value: string | null): void;
  writeGuest(value: WorkspaceData): void;
}
const equal = (a: WorkspaceData, b: WorkspaceData): boolean => JSON.stringify(a) === JSON.stringify(b);
const restricted = (error: unknown): boolean => {
  const e = error as { status?: number; code?: string };
  return e.status === 401 || e.status === 403 || e.code === "CURRENT_ACCOUNT_CHANGED";
};

// One controller per account view. Requests are serialized; stale replies never cross accounts.
export class WorkspaceSync {
  private state: WorkspaceSnapshot;
  private listeners = new Set<() => void>();
  private base: WorkspaceView | null = null;
  private pending: WorkspaceWrite | null = null;
  private dirty = false;
  private writing = false;
  private reading = false;
  private active = false;
  private epoch = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(readonly userId: string | null, private transport: WorkspaceTransport, private local: WorkspaceLocal) {
    this.state = { data: local.legacy ?? defaultWorkspace(), phase: userId ? "loading" : "ready", revision: 0, updatedAt: null, message: "" };
  }
  getSnapshot = (): WorkspaceSnapshot => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private update(change: Partial<WorkspaceSnapshot>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  private persist(): void {
    if (!this.userId) return;
    try {
      this.local.writeDraft(this.dirty ? JSON.stringify({ revision: this.base?.revision ?? 0, workspace: this.state.data, pending: this.pending }) : null);
    } catch {
      this.update({ message: "이 탭에 미저장 설정을 보관하지 못했습니다. 저장이 확인되기 전에 새로고침하지 마세요." });
    }
  }
  private verified(value: WorkspaceView): WorkspaceView {
    if (value.userId !== this.userId) throw Object.assign(new Error("로그인 계정이 바뀌었습니다."), { code: "CURRENT_ACCOUNT_CHANGED" });
    return { ...value, workspace: workspaceSchema.parse(value.workspace) };
  }
  async start(): Promise<void> {
    this.active = true;
    const epoch = ++this.epoch;
    if (!this.userId) { this.update({ phase: "ready" }); return; }
    this.update({ phase: "loading", message: "" });
    let draft: WorkspaceDraft | null = null;
    try {
      const parsed = workspaceDraftSchema.safeParse(JSON.parse(this.local.readDraft() ?? "null"));
      if (parsed.success && (!parsed.data.pending || parsed.data.pending.expectedUserId === this.userId)) draft = parsed.data;
    } catch { /* Invalid or unavailable local data never replaces server settings. */ }
    try {
      const server = this.verified(await this.transport.read());
      if (!this.active || epoch !== this.epoch) return;
      this.base = server;
      this.pending = draft?.pending ?? null;
      this.dirty = !!draft;
      this.update({ data: draft?.workspace ?? server.workspace, revision: server.revision, updatedAt: server.updatedAt, phase: "ready" });
      if (draft) {
        const acknowledged = this.pending?.requestId === server.lastRequestId && equal(this.pending.workspace, server.workspace);
        if (acknowledged) this.pending = null;
        if (equal(draft.workspace, server.workspace)) { this.pending = null; this.dirty = false; this.persist(); }
        else if (acknowledged || draft.revision === server.revision) { this.persist(); void this.flush(); }
        else this.update({ phase: "conflict", message: "보관된 미저장 설정과 서버 설정이 다릅니다. 작업공간에서 사용할 설정을 선택해 주세요." });
      } else if (server.revision === 0 && this.local.legacy) {
        this.edit(this.local.legacy);
      }
    } catch (error) {
      if (this.active && epoch === this.epoch) this.update({ phase: restricted(error) ? "blocked" : "offline", message: "작업공간을 불러오지 못했습니다. 연결과 로그인 상태를 확인한 뒤 다시 시도해 주세요." });
    }
  }
  stop(): void {
    this.active = false; this.epoch++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  canEdit(): boolean { return this.active && (!this.userId || !!this.base) && !["loading", "blocked"].includes(this.state.phase); }
  edit(data: WorkspaceData | ((current: WorkspaceData) => WorkspaceData)): void {
    if (!this.canEdit()) return;
    const parsed = workspaceSchema.parse(typeof data === "function" ? data(this.state.data) : data);
    if (!this.userId) {
      this.update({ data: parsed });
      try { this.local.writeGuest(parsed); } catch { this.update({ message: "이 브라우저에 배치를 저장하지 못했습니다." }); }
      return;
    }
    this.dirty = true;
    this.update({ data: parsed });
    this.persist();
    if (this.state.phase === "conflict" || this.state.phase === "offline") return;
    if (this.timer) clearTimeout(this.timer);
    this.update({ phase: "saving" });
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, 250);
  }
  async flush(): Promise<void> {
    if (!this.active || !this.userId || !this.base || !this.dirty || this.writing || ["conflict", "blocked"].includes(this.state.phase)) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const epoch = this.epoch;
    this.pending ??= { expectedUserId: this.userId, revision: this.base.revision, requestId: crypto.randomUUID(), workspace: this.state.data };
    const sent = this.pending;
    this.writing = true;
    this.update({ phase: "saving", message: "" }); this.persist();
    try {
      const saved = this.verified(await this.transport.write(sent));
      if (!this.active || epoch !== this.epoch) return;
      this.base = saved; this.pending = null;
      this.dirty = !equal(this.state.data, sent.workspace);
      this.update({ revision: saved.revision, updatedAt: saved.updatedAt, phase: this.dirty ? "saving" : "ready" });
      this.persist();
    } catch (error) {
      if (!this.active || epoch !== this.epoch) return;
      const code = (error as { code?: string }).code;
      if (code === "WORKSPACE_CONFLICT" || code === "WORKSPACE_REQUEST_REUSED") {
        this.update({ phase: "conflict", message: "다른 창이나 기기의 설정과 충돌했습니다. 작업공간에서 사용할 설정을 선택해 주세요." });
      } else this.update({ phase: restricted(error) ? "blocked" : "offline", message: "설정 저장을 확인하지 못했습니다. 이 탭의 변경을 보관했습니다. 다시 시도해 주세요." });
    } finally {
      this.writing = false;
      if (this.active && this.dirty && ["saving", "ready"].includes(this.state.phase)) void this.flush();
    }
  }
  async refresh(): Promise<void> {
    if (!this.active || !this.userId || this.reading || this.writing || this.dirty || this.state.phase === "loading") return;
    if (!this.base) { await this.start(); return; }
    const epoch = this.epoch;
    this.reading = true;
    try {
      const server = this.verified(await this.transport.read());
      if (!this.active || epoch !== this.epoch || this.dirty || this.writing) return;
      this.base = server;
      this.update({ data: server.workspace, revision: server.revision, updatedAt: server.updatedAt, phase: "ready", message: "" });
    } catch (error) {
      if (this.active && epoch === this.epoch) this.update({ phase: restricted(error) ? "blocked" : "offline", message: "다른 기기의 변경을 확인하지 못했습니다. 마지막으로 확인한 설정을 표시합니다." });
    } finally { this.reading = false; }
  }
  async retry(): Promise<void> {
    if (!this.base) await this.start();
    else if (this.dirty) await this.flush();
    else await this.refresh();
  }
  async resolveConflict(choice: "server" | "local"): Promise<void> {
    if (!this.active || this.writing) return;
    const epoch = this.epoch;
    this.update({ phase: "loading", message: "" });
    try {
      const server = this.verified(await this.transport.read());
      if (!this.active || epoch !== this.epoch) return;
      this.base = server; this.pending = null;
      this.dirty = choice === "local";
      this.update({ data: choice === "server" ? server.workspace : this.state.data, revision: server.revision, updatedAt: server.updatedAt, phase: "ready" });
      this.persist();
      if (this.dirty) await this.flush();
    } catch (error) {
      if (this.active && epoch === this.epoch) this.update({ phase: restricted(error) ? "blocked" : "conflict", message: "최신 설정을 확인하지 못해 변경하지 않았습니다. 다시 선택해 주세요." });
    }
  }
}
