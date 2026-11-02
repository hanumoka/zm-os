import { build as esbuild } from 'esbuild';
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { manifestSchema } from '@zm/platform-contracts';
import { collectDirectory, createZip, validateZip, type BundleOptions, type BundleResult } from './bundle';

export async function buildProject(directory: string): Promise<string> {
  const root = path.resolve(directory);
  const manifest = manifestSchema.parse(JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')));
  const output = path.join(root, 'dist');
  const stage = path.join(root, '.zm-build-' + randomUUID());
  await mkdir(stage);
  try {
    const manifestText = JSON.stringify(manifest, null, 2) + '\n';
    await writeFile(path.join(stage, 'manifest.json'), manifestText);
    await copyFile(path.join(root, 'index.html'), path.join(stage, 'index.html'));
    await esbuild({ entryPoints: [path.join(root, 'src', 'main.ts')], bundle: true, outfile: path.join(stage, 'app.js'), format: 'esm', target: 'es2022', platform: 'browser', sourcemap: false, alias: { '@zm/sdk': fileURLToPath(import.meta.resolve('@zm/sdk')) }, logLevel: 'silent' });
    try {
      for (const file of await collectDirectory(path.join(root, 'public'))) {
        if (['manifest.json', 'index.html', 'app.js', 'app.css'].includes(file.path)) throw new Error('public 파일이 생성 파일과 충돌합니다.');
        await mkdir(path.dirname(path.join(stage, file.path)), { recursive: true });
        await writeFile(path.join(stage, file.path), file.data);
      }
    } catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
    const files = await collectDirectory(stage);
    await validateZip(await createZip(files), { allowLocalHttp: true });
    // Only replace a non-symlink dist owned by this builder. The marker is outside the submitted bundle.
    const marker = path.join(root, '.zm-output.json');
    let previous: string[] = [];
    try {
      const parsed: unknown = JSON.parse(await readFile(marker, 'utf8'));
      if (!Array.isArray(parsed) || !parsed.every(item => typeof item === 'string')) throw new Error('출력 파일 목록이 올바르지 않습니다.');
      previous = parsed;
    } catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
    let exists = false;
    try { const stat = await lstat(output); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('dist는 일반 디렉터리여야 합니다.'); exists = true; }
    catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
    if (exists) {
      const actual = (await collectDirectory(output)).map(file => file.path).sort();
      if (JSON.stringify(actual) !== JSON.stringify([...previous].sort())) throw new Error('dist에 도구가 관리하지 않는 파일이 있습니다. 다른 위치에 보관한 뒤 재시도하세요.');
      // Absolute target is a fixed direct child of the supplied project, verified above and never a link.
      await rm(output, { recursive: true });
    }
    await rename(stage, output);
    await writeFile(marker, JSON.stringify(files.map(file => file.path)) + '\n');
    return output;
  } finally {
    // The temporary path was created here as a direct child, with a fresh random suffix.
    await rm(stage, { recursive: true, force: true });
  }
}

export async function packProject(directory: string, output: string, options: BundleOptions = {}): Promise<BundleResult> {
  const root = path.resolve(directory);
  const files = await collectDirectory(path.join(root, 'dist'));
  const zip = await createZip(files);
  const result = await validateZip(zip, options);
  const destination = path.resolve(output);
  if (destination.startsWith(path.join(root, 'dist') + path.sep)) throw new Error('ZIP 출력은 dist 바깥에 두세요.');
  await writeFile(destination, zip, { flag: 'wx' });
  return result;
}

export async function validateProject(directory: string, options: BundleOptions = {}): Promise<BundleResult> {
  const source = path.resolve(directory);
  if ((await lstat(source)).isFile()) return validateZip(await readFile(source), options);
  const folder = (await readdir(source)).includes('dist') ? path.join(source, 'dist') : source;
  return validateZip(await createZip(await collectDirectory(folder)), options);
}
