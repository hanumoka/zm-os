# 제3자 고지 (Third-Party Notices)

이 저장소가 **배포하는 제3자 소프트웨어**의 저작권 고지와 라이선스 전문입니다.

`apps/web/public/` 아래에 vendored된 파일들은 이 저장소를 복제하거나 열람하는 누구에게나 그대로 전달됩니다. **MIT 라이선스는 "copies or substantial portions of the Software"에 저작권 고지와 허가 고지를 포함할 것을 요구하므로, 그 의무는 배포 시점이 아니라 지금 발생해 있습니다.**

★ **`public/phaser.min.js`는 원본의 라이선스 배너가 제거된 상태로 들어와 있습니다**(`MIT`·`copyright`·`license` 문자열 0건, 2026-09-03 실측). `pixi.min.js`는 일부만, `three.min.js`는 배너가 남아 있습니다. **이 파일이 그 결락을 메웁니다.**

## 범위

| 항목 | 값 |
|---|---|
| 측정일 | 2026-09-03 |
| 대상 | 이 저장소가 현재 배포하는 파일 (`apps/web/public/*.min.js`) |
| 확인 방법 | vendored 파일에 박힌 버전 문자열과 `node_modules`의 패키지 버전이 일치함을 대조 |

**이 파일은 프로덕션 번들의 고지가 아닙니다.** 빌드 산출물을 배포할 때는 번들에 들어가는 npm 의존성 전체가 대상이 되며, 그 목록은 이 파일의 상위집합입니다. 배포 착수 시 생성 도구로 다시 만들어야 합니다.

---

## Phaser 3.90.0

- 배포 파일: `apps/web/public/phaser.min.js`
- 프로젝트: https://phaser.io
- 라이선스: MIT

```text
The MIT License (MIT)

Copyright (c) 2024 Richard Davey, Phaser Studio Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## PixiJS 8.18.1

- 배포 파일: `apps/web/public/pixi.min.js`
- 프로젝트: https://pixijs.com
- 라이선스: MIT

```text
The MIT License

Copyright (c) 2013-2023 Mathew Groves, Chad Engler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## three.js r184

- 배포 파일: `apps/web/public/three.min.js`
- 프로젝트: https://threejs.org
- 라이선스: MIT
- 비고: 이 파일은 원본의 `@license` 배너를 유지하고 있습니다

```text
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## 이 저장소 자체의 라이선스

**아직 없습니다.** 선택은 `zm-docs`의 `DEC-0010`이 저장소 공개 범위 결정 뒤로 이연했습니다 — 공개 저장소에 permissive 라이선스를 붙이는 것은 회수 불가능한 허락이기 때문입니다.

**위 고지 의무는 그 이연과 무관합니다.** 자기 코드의 라이선스를 정하지 않은 것과, 남의 코드를 고지 없이 재배포하는 것은 다른 문제입니다.
