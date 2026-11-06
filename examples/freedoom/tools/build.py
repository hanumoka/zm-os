"""Rebuild the redistributable, single-level Freedoom web example (Python + Docker)."""
from pathlib import Path
import base64
import gzip
import hashlib
import io
import json
import re
import struct
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.build-cache'
PUBLIC = ROOT / 'public'
ENGINE_REV = 'e257a09527062bfb986b6e5e0780839b6cbd5b71'
IMAGE = 'emscripten/emsdk:4.0.10@sha256:90b757eb11fa9a0e3ce4d2d9f76d932a56018e4accc37b5a28b2783751e60eb7'
DOWNLOADS = {
    'engine': (f'https://codeload.github.com/ozkl/doomgeneric/zip/{ENGINE_REV}', 'e10d8506e52462a015c4bbbefe2acb68414a548aef65361adf68f50c2d216c34'),
    'data': ('https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip', '3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59'),
}


def download(key):
    url, digest = DOWNLOADS[key]
    destination = CACHE / (key + '.zip')
    if not destination.exists():
        with urllib.request.urlopen(url, timeout=120) as response:
            destination.write_bytes(response.read())
    data = destination.read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('Upstream checksum mismatch: ' + key)
    return zipfile.ZipFile(io.BytesIO(data))


def name(data):
    return data.split(b'\0')[0].decode('ascii')


def subset_wad(data, engine):
    count, directory = struct.unpack_from('<ii', data, 4)
    lumps = []
    for index in range(count):
        pos, size, raw_name = struct.unpack_from('<ii8s', data, directory + index * 16)
        lumps.append((name(raw_name), data[pos:pos + size]))
    by_name = dict(lumps)
    first = next(i for i, item in enumerate(lumps) if item[0] == 'E1M1')
    level = lumps[first:first + 11]
    sidedefs = dict(level)['SIDEDEFS']
    wanted = {'SKY1'}
    for start in range(0, len(sidedefs), 30):
        wanted.update(name(sidedefs[start + field:start + field + 8]) for field in (4, 12, 20))
    # The engine initializes every stock switch pair, including unused pairs.
    wanted.update(re.findall(r'"(SW[12][A-Z0-9]+)"', (engine / 'p_switch.c').read_text()))
    textures = []
    for key in ('TEXTURE1', 'TEXTURE2'):
        if key not in by_name:
            continue
        raw = by_name[key]
        total, = struct.unpack_from('<i', raw)
        for i in range(total):
            pos, = struct.unpack_from('<i', raw, 4 + i * 4)
            patches, = struct.unpack_from('<h', raw, pos + 20)
            textures.append((name(raw[pos:pos + 8]), raw[pos:pos + 22 + patches * 10]))
    names = [item[0] for item in textures]
    # Preserve complete animated wall ranges in their original order.
    for end, start in re.findall(r'\{true,\s*"([A-Z0-9]+)",\s*"([A-Z0-9]+)"', (engine / 'p_spec.c').read_text()):
        if start in names and end in names:
            wanted.update(names[names.index(start):names.index(end) + 1])
    wanted.add(textures[0][0])  # texture index zero means "no texture" in Doom.
    chosen = [item for item in textures if item[0] in wanted]
    pnames = by_name['PNAMES']
    patch_names = [name(pnames[i:i + 8]) for i in range(4, len(pnames), 8)]
    required_patches = set()
    for _, raw in chosen:
        count, = struct.unpack_from('<h', raw, 20)
        required_patches.update(patch_names[struct.unpack_from('<h', raw, 26 + 10 * i)[0]] for i in range(count))
    offset = 4 + len(chosen) * 4
    offsets = []
    for _, raw in chosen:
        offsets.append(offset)
        offset += len(raw)
    texture1 = struct.pack('<i', len(chosen)) + b''.join(struct.pack('<i', i) for i in offsets) + b''.join(raw for _, raw in chosen)
    selected = []
    in_patches = False
    skip_map = 0
    for key, raw in lumps:
        if re.fullmatch(r'E\dM\d', key):
            skip_map = 11
        if skip_map:
            skip_map -= 1
            continue
        if key == 'P_START':
            in_patches = True
        elif key == 'P_END':
            in_patches = False
        elif in_patches and raw and key not in required_patches:
            continue
        if key.startswith(('DS', 'DP', 'DEMO')) or key == 'TEXTURE2':
            continue
        selected.append((key, texture1 if key == 'TEXTURE1' else raw))
    selected.extend(level)
    body = bytearray()
    entries = bytearray()
    for key, raw in selected:
        entries.extend(struct.pack('<ii8s', 12 + len(body), len(raw), key.encode('ascii')))
        body.extend(raw)
    return struct.pack('<4sii', b'IWAD', len(selected), 12 + len(body)) + body + entries


def encode(data):
    return base64.b64encode(gzip.compress(data, compresslevel=9, mtime=0)).decode('ascii')


def main():
    CACHE.mkdir(exist_ok=True)
    PUBLIC.mkdir(exist_ok=True)
    engine_zip = download('engine')
    engine_zip.extractall(CACHE / 'engine')
    upstream = CACHE / 'engine' / ('doomgeneric-' + ENGINE_REV)
    engine = upstream / 'doomgeneric'
    game = engine / 'g_game.c'
    source = game.read_text()
    # Explicit single-level adaptation: menu and exit both return to E1M1.
    source = source.replace('gamemap = wminfo.next+1;', 'gamemap = 1; /* zm-os single-level demo */')
    source = source.replace('gameepisode = episode;', 'gameepisode = 1; /* zm-os single-level demo */')
    source = source.replace('gamemap = map;', 'gamemap = 1; /* zm-os single-level demo */')
    game.write_text(source)
    data_zip = download('data')
    wad_name = next(n for n in data_zip.namelist() if n.endswith('/freedoom1.wad'))
    wad = subset_wad(data_zip.read(wad_name), engine)
    (PUBLIC / 'game-data.js').write_text('globalThis.ZM_DOOM_DATA="' + encode(wad) + '";\n', encoding='utf-8')
    objects = re.search(r'SRC_DOOM = (.+)', (engine / 'Makefile').read_text())[1].split()
    sources = ['/example/.build-cache/engine/doomgeneric-' + ENGINE_REV + '/doomgeneric/' + item[:-2] + '.c' for item in objects if item != 'doomgeneric_xlib.o']
    args = ['emcc', *sources, '/example/engine/doomgeneric_zm.c', '-I/example/.build-cache/engine/doomgeneric-' + ENGINE_REV + '/doomgeneric', '-O2', '-DDOOMGENERIC_RESX=320', '-DDOOMGENERIC_RESY=200', '-sSINGLE_FILE=1', '-sDYNAMIC_EXECUTION=0', '-sMODULARIZE=1', '-sEXPORT_NAME=createDoom', '-sENVIRONMENT=web', '-sALLOW_MEMORY_GROWTH=1', '-sSTACK_SIZE=1048576', '-sFORCE_FILESYSTEM=1', '-sEXPORTED_RUNTIME_METHODS=["FS"]', '-o', '/example/public/engine.js']
    subprocess.run(['docker', 'run', '--rm', '--mount', 'type=bind,source=' + str(ROOT) + ',target=/example', IMAGE, *args], check=True)
    # Ship corresponding engine source (all C/headers, build metadata and modifications)
    # inside the submitted app, readable without opening a network connection.
    source_files = {}
    notices = ['LICENSE', 'system/lib/libc/musl/COPYRIGHT', 'system/lib/compiler-rt/LICENSE.TXT', 'system/lib/libcxx/LICENSE.TXT']
    license_command = 'import json;from pathlib import Path;p=Path("/emsdk/upstream/emscripten");print(json.dumps({n:(p/n).read_text() for n in ' + repr(notices) + '}))'
    source_files.update({'toolchain/' + key: value for key, value in json.loads(subprocess.check_output(['docker', 'run', '--rm', IMAGE, 'python3', '-c', license_command])).items()})
    for path in sorted(upstream.rglob('*')):
        if path.is_file() and (path.suffix in ('.c', '.h') or path.name.startswith(('Makefile', 'LICENSE', 'README', 'CMakeLists'))):
            source_files['doomgeneric/' + path.relative_to(upstream).as_posix()] = path.read_text(errors='replace')
    for path in (ROOT / 'engine' / 'doomgeneric_zm.c', Path(__file__), ROOT / 'README.md'):
        source_files[path.relative_to(ROOT).as_posix()] = path.read_text(encoding='utf-8')
    for path in sorted((ROOT / 'src').glob('*')):
        source_files[path.relative_to(ROOT).as_posix()] = path.read_text(encoding='utf-8')
    for filename in ('index.html', 'manifest.json'):
        source_files[filename] = (ROOT / filename).read_text(encoding='utf-8')
    for package in ('sdk', 'platform-contracts'):
        package_root = ROOT.parents[1] / 'packages' / package
        for path in sorted((package_root / 'src').glob('*.ts')):
            if not path.name.endswith('.test.ts'):
                source_files['platform/packages/' + package + '/src/' + path.name] = path.read_text(encoding='utf-8')
        source_files['platform/packages/' + package + '/package.json'] = (package_root / 'package.json').read_text(encoding='utf-8')
    for key in data_zip.namelist():
        if key.endswith(('COPYING.txt', 'CREDITS.txt', 'CREDITS-MUSIC.txt')):
            source_files['freedoom/' + key.split('/')[-1]] = data_zip.read(key).decode('utf-8')
    source_files['BUILD.json'] = json.dumps({'engineCommit': ENGINE_REV, 'toolchain': IMAGE, 'downloads': DOWNLOADS, 'command': args, 'changes': ['Single E1M1 level', 'No audio; required music lookup resources retained', 'Unused maps, wall patches and sound effects removed', 'Canvas/keyboard bridge replaces native display']}, indent=2)
    archive = json.dumps(source_files, ensure_ascii=False).encode('utf-8')
    (PUBLIC / 'source-code.js').write_text('globalThis.ZM_DOOM_SOURCE="' + encode(archive) + '";\n', encoding='utf-8')
    print(json.dumps({'wadBytes': len(wad), 'sourceFiles': len(source_files), 'generated': {p.name: p.stat().st_size for p in PUBLIC.iterdir()}}, indent=2))


if __name__ == '__main__':
    main()
