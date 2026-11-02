#!/usr/bin/env node
import path from 'node:path';
import { initialize } from './template';
import { buildProject, packProject, validateProject } from './project';
import { serveDevelopment } from './dev';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const directory = args[1] && !args[1].startsWith('--') ? args[1] : '.';
  const json = args.includes('--json');
  const option = (name: string): string | undefined => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const report = (data: Record<string, unknown>): void => { process.stdout.write(json ? JSON.stringify({ ok: true, ...data }) + '\n' : Object.entries(data).map(([key, value]) => `${key}: ${String(value)}`).join('\n') + '\n'); };
  switch (command) {
    case 'init': await initialize(directory, option('--app-id')); report({ command, directory: path.resolve(directory) }); break;
    case 'build': report({ command, output: await buildProject(directory) }); break;
    case 'validate': {
      const result = await validateProject(directory, { allowLocalHttp: args.includes('--local-test') });
      report({ command, appId: result.manifest.appId, version: result.manifest.version, files: result.files.length, hash: result.hash }); break;
    }
    case 'pack': {
      const output = option('--out') ?? path.resolve(directory, 'app.zip');
      const result = await packProject(directory, output, { allowLocalHttp: args.includes('--local-test') });
      report({ command, output, appId: result.manifest.appId, version: result.manifest.version, hash: result.hash }); break;
    }
    case 'dev': await serveDevelopment(directory); break;
    default: throw new Error('사용법: zm-app init <새 폴더> [--app-id UUID] | build <폴더> | validate <폴더/ZIP> [--local-test] | pack <폴더> [--out ZIP] [--local-test] | dev <폴더>. --json 지원.');
  }
}
void main().catch(error => {
  const message = error instanceof Error ? error.message : '명령에 실패했습니다.';
  process.stderr.write(process.argv.includes('--json') ? JSON.stringify({ ok: false, code: 'COMMAND_FAILED', message }) + '\n' : message + '\n');
  process.exitCode = 1;
});
