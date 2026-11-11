# 개발·제작 도구·모바일 테스트

게임은 Godot 4.7.2의 Compatibility 렌더러와 싱글 스레드 Web export를 사용한다. 공개 샘플은 가상 인물·사연만 포함한다. 원본 기획 자료와 로컬 작업 캐시는 Git에 올리지 않는다.

## 모바일에서 열기

https://gniusk614.github.io/my-cartridge/ 주소를 휴대폰 Safari 또는 Chrome에서 열고 `게임 시작`을 누른다. 이 사용자 제스처 안에서 전체화면을 요청하고 이어서 가로 잠금을 요청한다. 거부되거나 지원되지 않아도 시작하며, 세로 뷰포트에서는 게임 표면을 시계 방향 90도로 회전한다. 별도 회전 안내 화면이나 방향 전환에 따른 강제 일시정지는 없다. `현재 화면으로 시작`은 전체화면 요청을 생략하되 같은 가로 게임 배치를 사용한다.

왼쪽 아래 영역에 닿은 지점에서 조이스틱이 나타난다. 16% 데드존 바깥으로 밀면 기울기에 따라 기존 최대 이동 속도까지 연속적으로 변한다. 오른쪽 아래 큰 공격 버튼과 위쪽 점프, 왼쪽 위 살피기를 함께 누를 수 있다. 앉기는 K/Ctrl 키로만 제공한다. 게임 안의 `시작 / 이어하기`로 진행한다.

iPhone에서 주소줄 없이 실행하려면 Safari의 공유 메뉴에서 홈 화면에 추가한 뒤 아이콘으로 실행한다. 최초 로딩은 약 45 MiB의 압축 전 파일 크기이며 네트워크에 따라 시간이 걸린다. 저장은 기기·브라우저·주소마다 별개다.

Godot 자동 검사 147개, 웹 셸/스튜디오 단위 검사 39개, 브라우저 시나리오 28개와 세 팩을 순환한 실제 물리·입력 봇 완주 10회를 통과했다. Chrome 모바일 에뮬레이션에서 가로 및 세로 회전 대체 화면의 메뉴, 이동+점프+공격 3점 터치, 취소·회전을 확인했다. Playwright WebKit에서도 실제 메뉴 탭과 합성 다중 터치 이벤트의 게임 동작을 확인했다. 브라우저 숨김·이탈 이벤트의 일시정지와 실제 전투 기록의 IndexedDB 저장·새로고침·프로세스 재시작 복원을 자동 검사한다. 실기기의 조작감, 주소줄, 노치, 오디오, OS 홈 전환·강제 종료와 사생활 보호 저장은 별도 검증 대상이다.

## 코드 구조

- game/scripts/actors: 지상 이동, 독립 높이축 점프, 발판 착지, 앉기와 전투 액터.
- game/scripts/gameplay: 퀘스트, 전투 판정, 거리 발판과 카페 내부.
- game/scripts/data: 허용된 팩 로드, 스키마와 참조 검증.
- game/scripts/save: 팩별 저장 및 복원.
- game/scripts/ui: HUD·팝업, 플로팅 조이스틱과 포인터별 원형 액션 버튼. MobileInput 자동 로드는 키보드와 독립적인 아날로그 벡터만 보관한다.
- game/web: 시작 제스처·전체화면·가로 잠금, 회전 대체·역변환 터치 좌표와 CSS 안전영역.
- studio: 고객별 장면·맵·캐릭터·스토리 편집, 로컬 PNG 변환·전신 컷아웃 자동 동작·템플릿 시트·미리보기·독립 게임 ZIP.
- schemas 및 examples: 정규 데이터 계약과 가상 샘플.

## 변경 후 배포

```bash
bash tools/godot.sh --headless --editor --import --quit
bash tools/godot.sh --headless --fixed-fps 60 --script res://tests/test_runner.gd
mkdir -p build/web
bash tools/godot.sh --headless --export-release Web ../build/web/index.html
python3 tools/prepare_web.py
python3 tools/check_content.py
npm run test:unit
npm run test:browser  # 최초 npm ci 및 npx playwright install chromium webkit 필요
git add .
git commit -m "Update game and tested web export"
git push origin main
```

빌드된 Web 파일은 web/에 보관하고 GitHub Actions가 검사 후 Pages에 배포한다. prepare_web.py는 게임 소스와 에셋의 해시를 기록한다. 소스만 바뀌고 내보내기가 갱신되지 않으면 배포 검사가 실패한다. CI에서도 고정 버전 Godot 에디터를 설치해 import·물리 완주를 실행하고 Chromium/WebKit 브라우저 입력·복귀·저장 복원을 검사한다. 테스트용 팩은 공개 업로드 대상에 넣지 않는다. 실행과 격리 방식은 [BROWSER_TESTS.md](BROWSER_TESTS.md)를 따른다.

GitHub Pages 주소가 모든 사람에게 열려 있으므로 실제 고객의 개인 정보나 사연을 공개 샘플 팩에 넣지 않는다. 고객별 접근 제어는 향후 플랫폼 단계에서 구현한다.

## 모바일 변경 시 확인

입력 구현과 회귀 범위는 [MOBILE_UX.md](MOBILE_UX.md)를 따른다. 웹 셸의 CSS 회전만 바꾸고 터치 역변환이나 `canvas_resize_policy=0`을 누락하면 표시와 입력 좌표가 어긋난다. `tools/test_web_shell.mjs`는 이 연결, DPR, 안전영역 축 교환, 터치 ID 보존을 검사한다. Godot 테스트는 실제 InputEventScreenTouch/Drag를 뷰포트에 보내 이동 물리와 동시 액션을 검사한다.

## 고객 맞춤형 제작 우선순위

새 고객 콘텐츠는 먼저 `/studio/`에서 팩 데이터와 PNG로 만든다. 공통 게임 코드를 고객마다 수정하는 방식으로 늘리지 않는다. 제작 흐름·데이터 계약·현재 한도와 후속 확장은 [EPISODE_ENGINE.md](EPISODE_ENGINE.md), 세부 형식은 [DATA_CONTRACT.md](DATA_CONTRACT.md)를 따른다. 고객 데이터와 실제 사진을 샘플 JSON이나 공개 Pages에 커밋하지 않는다.

스튜디오는 배포 시 함께 생성하며 JS 모듈 의존성·CSS·스키마도 빌드 해시에 포함한다. 제작 미리보기와 고객용 ZIP의 실제 게임 동작은 `tools/browser/studio.spec.mjs`와 `tools/browser/body.spec.mjs`에서 확인한다. 전신 편집 사용법과 컷아웃 한계는 [FULL_BODY_CHARACTERS.md](FULL_BODY_CHARACTERS.md)를 따른다. 테스트를 통과한 공개 런타임을 재사용하므로 새 에피소드 제작에 Godot 재빌드는 필요하지 않다.
