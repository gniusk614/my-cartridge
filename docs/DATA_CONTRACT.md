# 게임팩 데이터 계약

스키마 버전 1.0.0은 첫 단일 스테이지를 위한 제한된 형식이다. DOCX에 실린 설명용 JSON에 배치와 의존 관계를 추가했다. 문서가 언급한 별도 정규 JSON은 제공되지 않았으므로 기존 파일과의 호환을 주장하지 않는다.

## 정규 파일

`schemas/game_pack.schema.json`은 Draft 2020-12이다. `examples/*.json`을 편집하고 `game/content`에 복사한다. 게임이 읽는 스키마도 콘텐츠 폴더에 동봉되며 `tools/check_content.py`로 복사본이 일치하는지 검사한다.

런타임 검증기는 현재 스키마에서 사용하는 type, enum, properties, required, additionalProperties, items, minItems, maxItems, minLength, maxLength, pattern, minimum, maximum을 지원한다. 범용 JSON Schema 엔진은 아니다. 새 키워드를 도입할 때 런타임 구현과 부정 테스트가 필요하다. 별도로 정식 jsonschema 라이브러리로 샘플을 검사한다.

## 진행 데이터

| 필드 | 의미와 제약 |
|---|---|
| pack_id | 소문자 영문으로 시작하는 영문·숫자·밑줄, 최대 64자. 로더 허용 목록에 등록 |
| pack_revision | 1 이상 정수. 현재 저장은 같은 개정에서만 복원 |
| chapters | 첫 빌드는 정확히 1개. winter_street만 허용 |
| mechanics | brawler와 collect를 모두 포함 |
| enemies[].type | street_thug 또는 bruiser |
| enemies[].position | 발바닥 기준 x 24~936, y 104~156 |
| enemies[].trigger_x | 플레이어가 이 x 이상에 있을 때 등장 후보 |
| enemies[].after | 여기에 지정된 적이 모두 처치된 후 등장. 같은 챕터 안 ID만 허용 |
| objectives[].type | defeat_count 또는 collect_clue |
| objectives[].target | 적 유형 또는 단서 ID |
| objectives[].count | 처치 수 또는 수집 수. 단서는 1만 허용 |
| objectives[].depends_on | 선행 목표 ID. 처치 목표의 선행 의존은 P0에서 지원하지 않음 |
| objectives[].position | 수집 목표의 단서 위치. 처치 목표에서는 예비 값으로만 보관 |
| ending.music_asset_key | demo_ending만 허용 |
| coop.enabled | false만 허용. 서버 협동은 미구현 |

모든 ID는 팩 안에서 중복 없이 지정한다. 의존성에 없는 ID나 순환, 실제 적 수보다 큰 목표 수, 수집 목표가 없는 단서, 플레이어가 0명/2명인 팩은 거부한다. 파일 경로·외부 URL·실행 코드를 받는 필드는 없다. sprite_key와 asset_key는 승인된 enum이며 이 빌드는 공용 임시 표현을 사용한다.

## 저장 복원

팩마다 `user://saves/{pack_id}.json`에 임시 파일 작성 후 이름을 바꿔 저장한다. `pack_id`, `pack_revision`, `stage_id`, `checkpoint_id`, `hp`, `collected_clue_ids`, `completed_objective_ids`, `defeated_actor_ids`, `ending_seen`, `saved_at`을 기록한다.

저장된 목표 완료 배열을 그대로 믿지 않는다. 해당 개정에 실제 존재하는 처치·수집 ID를 정리하고 목표를 다시 계산한다. 체력은 1~100 범위로 복원한다. 손상된 저장은 새 진행으로 복구한다. 사망 후 재시도에서는 체력을 100으로 돌리고 시작 지점에서 재개하되 처치·단서 사실을 유지한다. 첫 빌드의 체크포인트는 거리 입구 한 곳이다.

현재 개정이 다르면 이전 저장을 적용하지 않는다. 유료 고객 팩 개정 전에 명시적 마이그레이션 및 백업 정책을 구현해야 한다. 브라우저 IndexedDB의 실제 지속성은 환경에 따라 다르므로 실기기 새로고침·시크릿 모드·데이터 정리를 별도 검사한다.
