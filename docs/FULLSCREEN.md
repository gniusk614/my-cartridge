# 모바일 가로 화면과 전체화면

`게임 시작` 터치에서 Fullscreen API를 호출하고 완료 또는 거부 후 Screen Orientation API의 `lock('landscape')`를 시도한다. 일반 Android Chrome처럼 허용되는 환경에서는 브라우저가 가로 전체화면을 제공한다. 브라우저가 API를 노출해도 호출을 거부할 수 있으므로 기능 확인과 예외 처리를 모두 한다. 사용자 제스처 없는 페이지 로드 시 전체화면이나 OS 방향 강제를 보장할 수 없다.

## 가로 잠금 미지원 시 회전 대체

세로 뷰포트에서 시작하면 `game-surface`를 시계 방향 90도로 회전하고, 내부 CSS 크기는 뷰포트의 높이×너비로 교환한다. 실제 기기가 가로가 되면 CSS 회전을 해제한다. 이전의 ‘휴대폰을 가로로 돌려주세요’ 차단 화면과 세로 전환 일시정지 콜백은 제거했다. 방향 변경 시 잡고 있던 입력은 해제하고 새 터치를 받는다.

Godot Web의 `html/canvas_resize_policy=0`을 사용해 웹 셸이 캔버스 backing 크기를 DPR에 맞춰 지정한다. 브라우저 창 크기를 그대로 쓰는 policy 2에서는 CSS만 회전해도 게임은 세로 비율로 렌더되므로 이 설정을 함께 유지해야 한다. 게임은 기존 320×180 기준 expand 모드를 유지한다.

Godot Web은 캔버스의 변환 후 bounding rectangle을 기준으로 client 좌표를 정규화한다. 회전 모드의 캡처 리스너는 역회전한 touch/mouse 좌표를 그 기준에 맞춰 전달한다. 각 touch identifier, changedTouches, 취소 이벤트를 유지하며 전달한 이벤트를 재변환하지 않는다. 가로 화면에서는 원래 이벤트를 그대로 통과시킨다. 전체화면 HTML 버튼의 제스처는 캔버스로 가로채지 않는다.

안전영역은 물리 화면의 top/right/bottom/left를 회전한 게임의 left/top/right/bottom에 각각 대응시킨다. Godot은 이 CSS 픽셀 값을 논리 뷰포트 단위로 환산해 HUD·일시정지·조이스틱 활성 영역·액션 버튼을 배치한다. resize, orientationchange, visualViewport resize, fullscreenchange를 반영한다.

## iPhone Safari 제약

iPhone Safari에서는 일반 요소 전체화면과 방향 잠금이 지원되지 않거나 거부될 수 있다. CSS 대체는 게임 콘텐츠를 회전할 뿐 OS 방향, Safari 주소줄, 시스템 제스처를 강제로 변경하지 않는다. 화면이 세로인 상태에서는 게임 콘텐츠가 옆으로 보이며 기기를 그에 맞춰 잡아 플레이할 수 있다. 실제 기기를 가로로 바꾸면 자연스러운 가로 화면으로 돌아간다.

주소줄 없는 실행은 Safari의 공유 → `홈 화면에 추가` → 추가된 MY CARTRIDGE 아이콘 실행 경로를 이용한다. manifest의 landscape는 선호 설정이며 모든 iOS 버전에서 강제를 보장하지 않는다. 오프라인 service worker는 제공하지 않는다.

## 검증

- Godot 101개 검사, 기존 세 팩 봇 완주 10회 통과.
- Node 웹 셸 15개 검사: 제스처 후 호출 순서, API 미지원·비활성·거부, standalone, 로딩 실패, 회전 대체·DPR·안전영역, 다중 touch ID·cancel·마우스 좌표, HTML 오버레이 입력.
- 실제 Chrome 모바일 에뮬레이션: 844×390 가로와 390×844 세로 대체, DPR 2에서 캔버스 1688×780, 터치 메뉴·이동·점프·공격 3점 입력, 취소 후 정지·방향 변경 확인. 페이지/콘솔 오류 0개. 소프트웨어 WebGL의 ReadPixels 성능 경고는 실기기 성능 결과로 해석하지 않는다.
- Chrome 실제 시작 터치로 전체화면 진입(`game-shell`)과 종료 후 재시도 버튼 노출도 확인했다.
- Playwright WebKit 27.2: 두 화면 모드의 실제 메뉴 탭과 합성 다중 터치로 이동·공중 공격·취소 확인, 페이지/콘솔 오류 0개. macOS 테스트 엔진이며 iPhone Safari 실기기가 아니다.
- iPhone/Android 실기기의 API 성공 여부, 노치·홈 제스처·주소줄 변화와 조작감은 미검증.

웹 팩 및 셸 JS/CSS는 내용 해시 파일명으로 배포한다. 최신 검증은 [VALIDATION.md](VALIDATION.md), 입력 설계는 [MOBILE_UX.md](MOBILE_UX.md)를 참조한다.

참고: [Godot custom HTML shell](https://docs.godotengine.org/en/stable/tutorials/platform/web/customizing_html5_shell.html), [Screen Orientation lock](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock), [WebKit iPhone Fullscreen 제약 보고](https://bugs.webkit.org/show_bug.cgi?id=328773).
