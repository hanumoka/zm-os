import type { AppManifest, AppType } from "@zm/platform-contracts";
export interface DeveloperApplication {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  description: string;
  status: string;
  reason?: string;
}
export interface ManagedApp {
  id: string;
  appType: AppType;
  ownerId: string;
  name: string;
  published: boolean;
  availability: string;
  revision: number;
  currentVersionId?: string;
  closureRequested?: boolean;
  closed?: boolean;
}
export interface AppVersion {
  id: string;
  appId: string;
  manifest: AppManifest;
  validationStatus: string;
  reviewStatus: string;
  reason?: string;
  validationError?: string;
}
export interface Report {
  id: string;
  appId: string;
  userId?: string;
  reason: string;
  status: string;
  resolution?: string;
}
export interface DeletionRequest {
  id: string;
  appId: string;
  appUserId: string;
  status: string;
  note?: string;
}
export interface OperatorUser {
  id: string;
  status: string;
  operator: boolean;
  developer: boolean;
  providers?: string[];
}
export type RunAction = (
  action: () => Promise<unknown>,
  success?: string,
) => Promise<void>;
export const labels: Record<string, string> = {
  active: "이용 중",
  suspended: "이용 정지",
  withdrawn: "탈퇴",
  pending: "대기",
  approved: "승인",
  rejected: "반려",
  changes_requested: "보완 요청",
  not_submitted: "미제출",
  in_review: "검수 중",
  passed: "검증 통과",
  failed: "검증 실패",
  running: "검증 중",
  queued: "처리 대기",
  allowed: "허용",
  normal_suspended: "일반 중지",
  emergency_suspended: "긴급 중지",
  processing: "처리 중",
  developer_reported_completed: "개발자 완료 보고",
  needs_attention: "확인 필요",
  completed: "처리 완료",
  resolved: "처리 완료",
  dismissed: "종결",
  open: "접수",
  revoked: "취소",
  not_verified: "미확인",
  not_applicable_in_trial: "이 로컬 시험에는 운영 백업 없음",
  not_requested: "탈퇴가 아직 접수되지 않음",
};
export function label(value: string): string {
  return labels[value] ?? value;
}
export const categories: Record<string, string> = {
  productivity: "생산성",
  education: "학습",
  tools: "도구",
  games: "게임",
};
export const appTypes: Record<AppType, string> = { default: "기본앱", developer: "개발자 앱" };
