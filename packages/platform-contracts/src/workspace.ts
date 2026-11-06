import { z } from "zod";

export const systemApps = ["store", "mine", "account", "workspace", "developer", "operator"] as const;
export const systemAppSchema = z.enum(systemApps);
export const wallpaperSchema = z.enum(["sky", "sand", "night"]);
const cellSchema = z.object({ column: z.number().int().min(0).max(999), row: z.number().int().min(0).max(999) }).strict();
export const desktopPositionsSchema = z.object({
  store: cellSchema, mine: cellSchema, account: cellSchema, workspace: cellSchema, developer: cellSchema, operator: cellSchema,
}).partial().strict();
export const windowLayoutSchema = z.object({
  rect: z.object({
    x: z.number().min(0).max(10000), y: z.number().min(0).max(10000),
    width: z.number().min(1).max(10000), height: z.number().min(1).max(10000),
  }).strict(),
  minimized: z.boolean(),
  maximized: z.boolean(),
  snap: z.enum(["left", "right"]).nullable(),
}).strict();
const windowBase = { key: z.string().uuid(), layout: windowLayoutSchema };
export const savedWindowSchema = z.discriminatedUnion("kind", [
  z.object({ ...windowBase, kind: z.literal("system"), system: systemAppSchema }).strict(),
  z.object({ ...windowBase, kind: z.literal("app"), appId: z.string().uuid(), name: z.string().min(1).max(80).optional() }).strict(),
]);
export const workspaceSchema = z.object({
  schemaVersion: z.literal(1),
  wallpaper: wallpaperSchema,
  positions: desktopPositionsSchema,
  windows: z.array(savedWindowSchema).max(24).refine(windows => new Set(windows.map(w => w.key)).size === windows.length, "창 식별자가 중복되었습니다."),
}).strict();
export const workspaceWriteSchema = z.object({
  expectedUserId: z.string().uuid(),
  revision: z.number().int().min(0).max(2147483646),
  requestId: z.string().uuid(),
  workspace: workspaceSchema,
}).strict();
export type WorkspaceData = z.infer<typeof workspaceSchema>;
export type SavedWindow = z.infer<typeof savedWindowSchema>;
export type WindowLayout = z.infer<typeof windowLayoutSchema>;
export type WorkspaceWrite = z.infer<typeof workspaceWriteSchema>;
export const workspaceDraftSchema = z.object({ revision: z.number().int().min(0), workspace: workspaceSchema, pending: workspaceWriteSchema.nullable() }).strict();
export type WorkspaceDraft = z.infer<typeof workspaceDraftSchema>;
export interface WorkspaceView {
  userId: string;
  revision: number;
  workspace: WorkspaceData;
  updatedAt: string | null;
  lastRequestId: string | null;
}
export function defaultWorkspace(): WorkspaceData {
  return { schemaVersion: 1, wallpaper: "sky", positions: {}, windows: [] };
}
