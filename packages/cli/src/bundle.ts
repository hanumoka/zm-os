import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { manifestSchema, TEST_LIMITS, type AppManifest } from '@zm/platform-contracts';

export interface BundleFile { path: string; data: Buffer }
export interface BundleResult { manifest: AppManifest; files: BundleFile[]; hash: string }
export interface BundleOptions { expectedAppId?: string; allowLocalHttp?: boolean }

const extensions = new Set(['.html', '.js', '.css', '.wasm', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.json', '.mp3', '.wav', '.woff', '.woff2', '.ttf']);
export function validatePath(name: string): void {
  if (!name || name.length > 240 || /[\\:%]/.test(name) || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || name.startsWith('/') || name.normalize('NFC') !== name) throw new Error('안전하지 않은 번들 경로입니다.');
  if (name.split('/').some(part => !part || part === '..' || part.startsWith('.') || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('안전하지 않은 번들 경로입니다.');
  if (!extensions.has(path.posix.extname(name).toLowerCase())) throw new Error('허용하지 않는 번들 파일 형식입니다.');
  if (/(?:secret|credentials|private[-_]?key)/i.test(path.posix.basename(name))) throw new Error('비밀정보 파일로 의심되는 이름입니다.');
}

function finish(files: BundleFile[], hash: string, options: BundleOptions): BundleResult {
  const manifestFile = files.find(file => file.path === 'manifest.json');
  if (!manifestFile || !files.some(file => file.path === 'index.html')) throw new Error('manifest.json과 index.html이 필요합니다.');
  if (manifestFile.data.length > TEST_LIMITS.messageBytes) throw new Error('매니페스트 크기 한도를 초과했습니다.');
  const manifest = manifestSchema.parse(JSON.parse(manifestFile.data.toString('utf8')));
  if (options.expectedAppId && manifest.appId !== options.expectedAppId) throw new Error('등록 앱과 번들의 앱 ID가 다릅니다.');
  for (const origin of manifest.apiOrigins) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && !(options.allowLocalHttp && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('API 서버는 HTTPS여야 합니다. 시험 모드는 loopback HTTP만 허용합니다.');
  }
  for (const file of files) {
    if (['.js', '.html', '.json'].includes(path.posix.extname(file.path).toLowerCase())) {
      const content = file.data.toString('utf8');
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/.test(content)) throw new Error('번들에 비밀정보로 의심되는 값이 있습니다.');
    }
  }
  return { manifest, files, hash };
}

/** Sequential streaming extraction. Declared sizes and actual emitted bytes are both bounded. */
export async function validateZip(buffer: Buffer, options: BundleOptions = {}): Promise<BundleResult> {
  if (buffer.length > TEST_LIMITS.zipBytes || buffer.length < 4) throw new Error('ZIP 크기 한도를 벗어났습니다.');
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, file) => error || !file ? reject(error ?? new Error('ZIP 읽기 실패')) : resolve(file)));
  return new Promise((resolve, reject) => {
    let settled = false;
    let total = 0;
    let count = 0;
    const files: BundleFile[] = [];
    const names = new Set<string>();
    const fail = (error: unknown): void => { if (settled) return; settled = true; clearTimeout(timer); zip.close(); reject(error instanceof Error ? error : new Error('ZIP 검사 실패')); };
    const timer = setTimeout(() => fail(new Error('ZIP 검사 시간 한도를 초과했습니다.')), 10000);
    zip.on('error', fail);
    zip.on('close', () => clearTimeout(timer));
    zip.on('entry', (entry: yauzl.Entry) => {
      try {
        if (++count > TEST_LIMITS.files) throw new Error('번들 파일 수 한도를 초과했습니다.');
        if (entry.fileName.endsWith('/')) {
          validatePath(entry.fileName + 'directory.json'); zip.readEntry(); return;
        }
        validatePath(entry.fileName);
        const nameKey = entry.fileName.toLowerCase();
        if (names.has(nameKey)) throw new Error('중복된 번들 파일 경로입니다.');
        names.add(nameKey);
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (mode && mode !== 0x8000) throw new Error('일반 파일 이외의 ZIP 항목은 허용하지 않습니다.');
        if (entry.isEncrypted() || entry.uncompressedSize > TEST_LIMITS.expandedBytes || total + entry.uncompressedSize > TEST_LIMITS.expandedBytes) throw new Error('압축 해제 크기 또는 암호화 제한을 위반했습니다.');
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { fail(error ?? new Error('ZIP 파일 읽기 실패')); return; }
          const chunks: Buffer[] = []; let bytes = 0;
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length; total += chunk.length;
            if (bytes > entry.uncompressedSize || total > TEST_LIMITS.expandedBytes) { stream.destroy(); fail(new Error('실제 압축 해제 크기가 한도를 넘었습니다.')); return; }
            chunks.push(chunk);
          });
          stream.on('end', () => {
            if (settled) return;
            if (bytes !== entry.uncompressedSize) { fail(new Error('파일 크기가 ZIP 기록과 다릅니다.')); return; }
            files.push({ path: entry.fileName, data: Buffer.concat(chunks) }); zip.readEntry();
          });
        });
      } catch (error) { fail(error); }
    });
    zip.on('end', () => {
      if (settled) return;
      try { const result = finish(files, createHash('sha256').update(buffer).digest('hex'), options); settled = true; clearTimeout(timer); resolve(result); }
      catch (error) { fail(error); }
    });
    zip.readEntry();
  });
}

export async function collectDirectory(directory: string): Promise<BundleFile[]> {
  const root = path.resolve(directory); const files: BundleFile[] = []; let total = 0;
  const walk = async (folder: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error('심볼릭 링크는 번들에 포함할 수 없습니다.');
      if (entry.isDirectory()) { validatePath(relative + '/directory.json'); await walk(path.join(folder, entry.name), relative + '/'); continue; }
      validatePath(relative);
      if (!entry.isFile()) throw new Error('일반 파일만 번들에 포함할 수 있습니다.');
      const absolute = path.join(folder, entry.name);
      const stat = await lstat(absolute);
      total += stat.size;
      if (total > TEST_LIMITS.expandedBytes || files.length >= TEST_LIMITS.files) throw new Error('번들 파일 수 또는 크기 한도를 초과했습니다.');
      files.push({ path: relative, data: await readFile(absolute) });
    }
  };
  await walk(root, '');
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function createZip(files: BundleFile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile(); const chunks: Buffer[] = []; let bytes = 0;
    zip.outputStream.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > TEST_LIMITS.zipBytes) { (zip.outputStream as Readable).destroy(new Error('ZIP 크기 한도 초과')); return; } chunks.push(chunk); });
    zip.outputStream.on('error', reject); zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    try { for (const file of files) { validatePath(file.path); zip.addBuffer(file.data, file.path, { mtime: new Date('2026-01-01T00:00:00Z'), mode: 0o100644 }); } zip.end(); }
    catch (error) { (zip.outputStream as Readable).destroy(); reject(error); }
  });
}
