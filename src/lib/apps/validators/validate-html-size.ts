import type { ValidationError } from './types';

export const MAX_HTML_BYTES = 5 * 1024 * 1024;

export function validateHtmlSize(htmlContent: string): ValidationError | null {
  const htmlByteLength = new TextEncoder().encode(htmlContent).length;
  if (htmlByteLength > MAX_HTML_BYTES) {
    return {
      ok: false,
      code: 'HTML_TOO_LARGE',
      message: `index.html이 너무 큽니다 (${(htmlByteLength / 1024 / 1024).toFixed(1)} MB). 최대 허용: ${MAX_HTML_BYTES / 1024 / 1024} MB`,
    };
  }
  return null;
}
