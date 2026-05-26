import type JSZip from 'jszip';
import type { ValidationError } from './types';

function hasPathTraversal(p: string): boolean {
  if (p.includes('..')) return true;
  if (p.startsWith('/')) return true;
  if (/^[a-zA-Z]:[/\\]/.test(p)) return true;
  if (p.includes('\\')) return true;
  return false;
}

export function validatePathTraversal(zip: JSZip): ValidationError | null {
  for (const entryPath of Object.keys(zip.files)) {
    if (hasPathTraversal(entryPath)) {
      return {
        ok: false,
        code: 'PATH_TRAVERSAL',
        message: `위험한 파일 경로가 포함되어 있습니다: "${entryPath}"`,
      };
    }
  }
  return null;
}
