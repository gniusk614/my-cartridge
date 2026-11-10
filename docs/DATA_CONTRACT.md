# 게임팩 데이터 계약 1.2

정규 계약은 `schemas/game_pack.schema.json`이며 실행용 복사본은 `game/content/game_pack.schema.json`이다. 스튜디오는 같은 스키마를 받아 검증한다. 기존 1.0.0 샘플 세 개를 유지하고 기존 맞춤형 1.1.0도 유지하며 새 제작은 1.2.0을 사용한다. 제작 흐름은 [EPISODE_ENGINE.md](EPISODE_ENGINE.md)를 따른다.

## 공통 원칙

팩에는 실행 코드·외부 URL·리소스 파일 경로를 넣지 않는다. 이미지도 `PNG + base64` 데이터로 내장하며 역할이 맞는 에셋 ID를 연결한다. 기본 샘플은 허용 목록에서 읽고, 업로드한 고객 팩은 구조·참조 검증을 통과한 뒤 메모리 카탈로그에 등록한다. 새 고객 팩을 등록하기 위해 소스 코드를 수정하지 않는다. 샘플과 같은 팩 ID는 사용하지 않는다.

런타임 검증기는 이 스키마의 type·enum·properties·required·additionalProperties·items·minItems·maxItems·minLength·maxLength·pattern·minimum·maximum을 지원한다. 참조·조건 그래프·도달 가능한 목표 수·이미지 시트·맵 경계는 별도로 검사한다. 정식 JSON Schema 검사도 기존 샘플에 계속 실행한다.

## 주요 데이터

| 항목 | 제약과 의미 |
|---|---|
| schema_version | 기존 `1.0.0`·`1.1.0` 또는 새 맞춤형 `1.2.0` |
| pack_id | 영문 소문자로 시작하는 소문자·숫자·밑줄, 최대 64자. 고객별·에피소드별 구분 |
| pack_revision | 1~9999. 현재는 같은 개정의 저장만 적용 |
| characters | 2~16명. player 1명, missing(이야기의 상대) 1명, 나머지 npc |
| characters[].sprite_key | `hero_base`·`missing_base` 또는 sprite_sheet 에셋 ID |
| characters[].appearance | 선택 항목. 피부·머리·상의·바지·포인트의 `#RRGGBB`, short/long 머리 형태 |
| characters[].portrait_key | 선택 항목. portrait 에셋 ID. 이야기 팝업의 초상화 |
| chapters | 1~8장면. 배열 순서가 진행 순서 |
| chapters[].map_id | maps에 정의한 맵 ID. 생략한 기존 팩은 원래 winter_street 맵 |
| chapters[].template | 기존 호환용 winter_street. 맞춤 맵은 map_id로 지정 |
| chapters[].mechanics | collect 필요. 적이 있으면 brawler도 필요 |
| chapters[].enemies | 0~32명, street_thug 또는 bruiser. 없는 장면은 전투 없이 진행 |
| enemies[].after | 같은 장면의 적 ID 선행 처치 배열. 없는 참조·순환 거부 |
| enemies[].sprite_key | 선택 항목. 기본 적 대신 사용할 sprite_sheet ID |
| chapters[].objectives | 1~32개, defeat_count 또는 collect_clue |
| objectives[].depends_on | 같은 장면의 선행 목표 ID. 순환 거부. 처치 목표의 선행 의존은 지원하지 않음 |
| clues | 에피소드 전체 1~32개. 각 기억에 수집 목표가 하나씩 필요 |
| clues[].speaker_id | 선택 항목. 해당 기억을 이야기하는 characters의 ID |
| ending | 최종 편지와 demo_ending 음악 키. 맞춤 오디오 업로드는 후속 확장 |
| coop.enabled | false. 온라인 협동 미구현 |

캐릭터·기억·장면·적·목표·맵·에셋 ID는 에피소드 안에서 중복 없이 지정한다. 같은 기억을 여러 장면의 수집 목표로 중복 연결하지 않는다. 목표 완료 여부는 저장된 완료 배열 대신 처치·수집 사실로 계산한다.

## 맵

maps는 최대 8개다. id·name·theme·width·spawn·door·surfaces·npcs를 지정한다. theme은 winter_street/garden/sunset이고 palette로 하늘·바닥·건물·장식 색을 바꿀 수 있다. background_key로 background PNG를 지정할 수 있다.

맵 너비는 640~1920이며 이동 영역은 x 24~width-24, y 104~156이다. 적·목표·시작·출입구·NPC 위치가 경계를 벗어나면 거부한다. 발판은 x/y/width/depth/height로 정의하고 최대 32개다. 지면 사각형은 이동 영역 안에 있어야 한다. 독립 높이축 점프·착지는 기존 물리를 사용한다.

NPC는 character_id·position·text로 정의한다. player 역할을 NPC로 배치하지 않는다. NPC는 피격 영역을 제거하고 이동 AI를 끈 대화 인물이며, 일반 전투 적과 분리한다. 출입구의 공통 실내 편지방은 현재 고정 구조다.

## 장식 박스와 이미지

1.2.0의 maps[].props는 선택 배열이며 최대 64개다. 각 항목의 id·name·position·width·height·layer·flip_x를 저장한다. asset_key가 없으면 기본 회색 박스이며, 지정하면 prop PNG에 연결한다. 캐릭터·목표·맵 등과 같은 전역 ID 중복 검사에 포함한다. 장식에는 충돌·전투·상호작용 판정이 없다.

position은 이미지 아래 중앙이다. 너비 4~256, 높이 4~180이며 이미지 전체가 x 0~맵 너비, y 0~180 안에 있어야 한다. layer는 behind(캐릭터 뒤)/front(캐릭터 앞), flip_x는 좌우 반전이다. 장식 이미지는 바깥 장면에서만 표시하고 공통 실내에서는 숨긴다. 기본 박스와 PNG 모두 같은 저장·미리보기·ZIP 경로를 사용한다. 그림 교체는 배치 정보를 바꾸지 않는다.

## PNG 에셋과 스프라이트

assets는 최대 32개이며 각 항목에 id·kind·width·height·png_base64를 넣는다. kind는 portrait/sprite_sheet/background/prop이다. 선택 항목 name은 보관함 표시 이름(1~80자)이다. 한 변은 최대 2048, PNG base64 한 항목은 최대 2,000,000자, 전체는 12,000,000자·8,388,608픽셀 이하다. 게임팩 가져오기는 전체 JSON 16,000,000자 이하로 제한한다.

런타임은 PNG 시그니처와 IHDR 크기를 검사해 선언 크기와 일치하는지 확인하고 실제 PNG 디코드까지 검사한다. 압축 전 이미지 한도를 넘는 입력을 디코드하지 않는다. PNG 아닌 데이터·깨진 이미지·다른 kind의 참조는 거부한다.

sprite_sheet에는 frame_width(8~128)·frame_height(8~128)·animations가 필요하다. 이미지 크기는 셀 크기로 나누어져야 한다. animations의 idle/move/attack은 필수이고 jump/crouch/hurt/down은 선택이다. 각 동작은 row(0부터)·frames·fps를 갖는다. 시트를 벗어나는 행·프레임은 거부하고 선택 동작이 없으면 idle을 사용한다. 원본은 오른쪽 방향, 발 기준은 셀 아래 중앙이다. 왼쪽은 반전한다. 이 프레임 정의는 그림 표현을 바꾸며 전투의 피해량·타격 범위·점프 물리를 바꾸지 않는다.

## 저장

팩별 `user://saves/{pack_id}.json`에 임시 파일을 쓰고 이름을 바꾼다. 필드는 기존 pack_id·pack_revision·stage_id·checkpoint_id·hp·collected_clue_ids·completed_objective_ids·defeated_actor_ids·ending_seen·saved_at을 유지한다. stage_id는 첫 장면뿐 아니라 팩 안의 현재 장면 ID를 허용한다.

저장 ID는 팩 전체에서 허용된 ID만 남기고 중복을 제거한다. 모든 장면의 목표를 처치·수집 사실로 재계산하고, 첫 미완료 장면보다 뒤를 가리키는 저장은 첫 미완료 장면으로 복구한다. 사망 시 현재 장면 입구에서 체력을 회복하고 이미 얻은 기억·처치 사실은 유지한다. 실내 위치·공중 위치는 저장하지 않는다.

개정이 다르면 저장을 적용하지 않는 기존 정책을 유지한다. 고객 팩 개정의 마이그레이션·백업과 실기기 저장 지속성은 별도 작업이다. 스튜디오 미리보기는 `user://studio_preview`, 자동 검사는 전용 폴더만 사용한다.
