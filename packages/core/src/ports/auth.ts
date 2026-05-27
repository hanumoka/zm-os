/**
 * AuthProvider Port (ADR-0017 §D1.2)
 *
 * 인증 추상화 인터페이스. LocalAuth(ADR-0018) / CloudAuth(ADR-0024+)가 이 인터페이스를 구현한다.
 */

import type { AdapterDescriptor, PortCallOptions } from './common';

export type UserId = string & { readonly __brand: 'UserId' };

export type Session = {
  readonly userId: UserId;
  readonly displayName: string;
  readonly issuedAt: number; // epoch ms
  readonly expiresAt: number | null; // null = 무기한 (LocalAuth POC)
};

export type SessionChangeEvent =
  | { type: 'signed-in'; session: Session }
  | { type: 'signed-out' }
  | { type: 'session-refreshed'; session: Session };

export interface AuthProvider {
  readonly descriptor: AdapterDescriptor;
  getSession(opts?: PortCallOptions): Promise<Session | null>;
  signIn(credentials: Readonly<Record<string, string>>, opts?: PortCallOptions): Promise<Session>;
  signOut(opts?: PortCallOptions): Promise<void>;
  subscribe(handler: (event: SessionChangeEvent) => void): () => void;
}
