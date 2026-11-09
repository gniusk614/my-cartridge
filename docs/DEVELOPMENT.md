# 개발과 모바일 테스트

게임은 Godot 4.7.2의 Compatibility 렌더러와 싱글 스레드 Web export를 사용한다. 공개 샘플은 가상 인물·사연만 포함한다. 원본 기획 자료와 로컬 작업 캐시는 Git에 올리지 않는다.

## 모바일에서 열기

https://gniusk614.github.io/my-cartridge/ 주소를 휴대폰 Safari 또는 Chrome에서 열고 `가로 전체화면으로 시작`을 누른다. 가로 잠금을 지원하지 않는 브라우저에서는 기기를 직접 돌린다. iPhone에서 주소줄 없이 실행하려면 Safari의 공유 메뉴에서 홈 화면에 추가한 뒤 아이콘으로 실행한다. 첫 로딩에는 약 45 MiB의 압축 전 파일을 내려받으므로 네트워크 상황에 따라 시간이 걸릴 수 있다. 왼쪽 패드로 이동하고 오른쪽 점프·앉기·공격·살피기 버튼을 사용한다. 게임 안의 `시작 / 이어하기`로 시작한다.

현재 91개의 Godot 자동 검사와 웹 셸 검사 8개가 통과했고, 세 팩을 순환하는 실제 물리·입력 기반 봇 완주 10회를 확인했다. 실기기에서 이동과 점프/공격 동시 터치, 회전, 앱 복귀, 저장 후 새로고침을 확인해야 한다. 웹사이트의 저장은 기기·브라우저마다 별개이며 로컬 개발 주소의 저장을 자동 이전하지 않는다.

## 코드 구조

- game/scripts/actors: 지상 이동, 독립 높이축 점프, 발판 착지, 앉기와 전투 액터.
- game/scripts/gameplay: 퀘스트, 전투 판정, 거리 발판과 카페 내부.
- game/scripts/data: 허용된 팩 로드, 스키마와 참조 검증.
- game/scripts/save: 팩별 저장 및 복원.
- game/scripts/ui: HUD, 팝업과 멀티터치 버튼.
- schemas 및 examples: 정규 데이터 계약과 가상 샘플.

## 변경 후 배포

```bash
bash tools/godot.sh --headless --editor --import --quit
bash tools/godot.sh --headless --fixed-fps 60 --script res://tests/test_runner.gd
mkdir -p build/web
bash tools/godot.sh --headless --export-release Web ../build/web/index.html
python3 tools/prepare_web.py
python3 tools/check_content.py
git add .
git commit -m "Update game and tested web export"
git push origin main
```

빌드된 Web 파일은 web/에 보관하고 GitHub Actions가 검사 후 Pages에 배포한다. prepare_web.py는 게임 소스와 에셋의 해시를 기록한다. 소스만 바뀌고 내보내기가 갱신되지 않으면 배포 검사가 실패한다. CI에서 Godot 런타임 전체를 설치하거나 물리 완주 검사를 다시 실행하지는 않으므로 위 로컬 검사를 먼저 수행해야 한다.

GitHub Pages 주소가 모든 사람에게 열려 있으므로 실제 고객의 개인 정보나 사연을 공개 샘플 팩에 넣지 않는다. 고객별 접근 제어는 향후 플랫폼 단계에서 구현한다.
