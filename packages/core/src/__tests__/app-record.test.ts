import { describe, expect, it } from 'vitest';
import { normalizeAppRecord } from '../ports/app-repository';

/**
 * IDB에는 두 세대의 레코드가 섞여 있다. 이 계약이 깨지면 사용자가 업로드한 앱이
 * 목록에서 사라진다 — Composition Root(P5) 마이그레이션이 여기에 의존한다.
 */

const manifest = { id: 'com.acme.notes', name: 'Notes', version: '1.0.0' };

describe('레거시 레코드 승격', () => {
  it('htmlContent가 최상위에 있는 구형 레코드를 inline-html로 올린다', () => {
    const record = normalizeAppRecord({
      manifest,
      htmlContent: '<h1>hi</h1>',
      installedAt: 1700000000000,
    });
    expect(record).toEqual({
      manifest,
      source: 'user',
      installedAt: 1700000000000,
      contentRef: { kind: 'inline-html', html: '<h1>hi</h1>' },
    });
  });

  it('source가 없으면 user로 본다 — built-in은 IDB에 저장하지 않는다', () => {
    const record = normalizeAppRecord({ manifest, htmlContent: '<p/>', installedAt: 1 });
    expect(record?.source).toBe('user');
  });

  it('installedAt이 없으면 0으로 채운다 (레코드를 버리지 않는다)', () => {
    const record = normalizeAppRecord({ manifest, htmlContent: '<p/>' });
    expect(record?.installedAt).toBe(0);
    expect(record?.contentRef).toEqual({ kind: 'inline-html', html: '<p/>' });
  });
});

describe('현행 레코드 통과', () => {
  it('세 가지 contentVariant를 모두 보존한다', () => {
    const cases = [
      { kind: 'built-in-url', url: '/x.html' },
      { kind: 'blob-ref', blobKey: 'k1' },
      { kind: 'inline-html', html: '<b/>' },
    ] as const;
    for (const contentRef of cases) {
      const record = normalizeAppRecord({ manifest, source: 'user', installedAt: 5, contentRef });
      expect(record?.contentRef).toEqual(contentRef);
    }
  });

  it('built-in source를 보존한다', () => {
    const record = normalizeAppRecord({
      manifest,
      source: 'built-in',
      installedAt: 5,
      contentRef: { kind: 'built-in-url', url: '/a.html' },
    });
    expect(record?.source).toBe('built-in');
  });

  it('ownerId가 있으면 유지하고 없으면 넣지 않는다', () => {
    const base = { manifest, source: 'user', installedAt: 5, contentRef: { kind: 'blob-ref', blobKey: 'k' } };
    expect(normalizeAppRecord({ ...base, ownerId: 'u1' })?.ownerId).toBe('u1');
    expect(normalizeAppRecord(base)).not.toHaveProperty('ownerId');
  });
});

describe('판별 불가능한 값', () => {
  it('객체가 아니면 null', () => {
    for (const v of [null, undefined, 42, 'x', []]) {
      expect(normalizeAppRecord(v)).toBeNull();
    }
  });

  it('manifest가 없으면 null', () => {
    expect(normalizeAppRecord({ htmlContent: '<p/>', installedAt: 1 })).toBeNull();
  });

  it('콘텐츠 위치를 알 수 없으면 null — 빈 앱을 만들어내지 않는다', () => {
    expect(normalizeAppRecord({ manifest, installedAt: 1 })).toBeNull();
  });

  it('contentRef가 알 수 없는 kind면 null', () => {
    expect(
      normalizeAppRecord({ manifest, installedAt: 1, contentRef: { kind: 'ftp', url: 'x' } }),
    ).toBeNull();
  });

  it('contentRef의 필수 필드 타입이 틀리면 null', () => {
    expect(
      normalizeAppRecord({ manifest, installedAt: 1, contentRef: { kind: 'blob-ref', blobKey: 9 } }),
    ).toBeNull();
  });
});
