# 보드게임 통계 배포 체크리스트

## 1. Render 환경 변수

통계 API 서비스의 `Environment`에 다음 값을 설정합니다.

- `DATABASE_URL`: PostgreSQL의 Internal Database URL
- `DATABASE_SSL`: Render 외부 DB를 사용하면 `true`, 같은 Render 내부 연결이면 DB 설정에 맞게 지정
- `ALLOWED_ORIGINS`: 메인 사이트와 통계 사이트 주소를 쉼표로 구분
- `NEXON_OPEN_API_KEY`: 기존 넥슨 API 기능을 계속 사용할 때만 설정

`DATABASE_URL`은 브라우저 코드나 GitHub 저장소에 직접 넣지 않습니다.

## 2. 데이터베이스 마이그레이션

Render Shell 또는 동일한 환경 변수가 설정된 로컬 터미널에서 한 번 실행합니다.

```bash
npm run db:migrate:boardgames
```

성공하면 `boardgame_play_events` 테이블과 조회용 인덱스가 생성됩니다. 이 SQL은 다시 실행해도 기존 데이터를 삭제하지 않습니다.

## 3. 배포 설정

- Root Directory: `stats-api`
- Build Command: `npm ci`
- Start Command: `npm start`
- Auto-Deploy: `main` 브랜치 사용 권장

## 4. 배포 후 읽기 전용 검증

```bash
npm run verify:deployment
```

다른 주소를 검사할 때는 `STATS_API_URL`을 지정합니다.

```bash
STATS_API_URL=https://example.onrender.com npm run verify:deployment
```

검증 항목은 API 버전, DB 연결, 마이그레이션 여부, 13개 모드 목록, 30일 통계 응답입니다. 실제 PLAY 이벤트는 생성하지 않습니다.

## 5. 정상 상태 기준

`GET /health`가 HTTP 200과 함께 아래 조건을 만족해야 합니다.

- `ok: true`
- `database.configured: true`
- `database.connected: true`
- `features.boardgameAnalytics: true`

이후 메인 사이트에서 보드게임 PLAY 버튼을 한 번 누르고 통계 사이트의 새로고침 버튼으로 집계 증가를 확인합니다.
