const DEFAULT_API_URL = "https://maple-royal-timer-api-stats-api.onrender.com";
const EXPECTED_API_VERSION = "2026-08-13-boardgame-analytics-v1";
const EXPECTED_MODES = [
  "classic",
  "joker",
  "baseball",
  "kaprekar",
  "quinter9",
  "blossom",
  "stella",
  "equinox",
  "overheat",
  "blizzard",
  "relic",
  "survival",
  "ritual",
];

const apiBaseUrl = String(process.env.STATS_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
const failures = [];

async function getJson(path) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { accept: "application/json" },
  });
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    failures.push(`${path}: JSON 응답이 아닙니다.`);
  }

  return { response, body };
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

console.log(`Stats API deployment check: ${apiBaseUrl}`);

try {
  const health = await getJson("/health");
  check(health.response.ok, `/health: HTTP ${health.response.status}`);
  check(health.body?.apiVersion === EXPECTED_API_VERSION, "/health: API 버전이 최신이 아닙니다.");
  check(health.body?.database?.configured === true, "/health: DATABASE_URL이 설정되지 않았습니다.");
  check(health.body?.database?.connected === true, "/health: 데이터베이스에 연결되지 않았습니다.");
  check(health.body?.features?.boardgameAnalytics === true, "/health: 보드게임 통계 테이블 준비가 끝나지 않았습니다.");

  const modes = await getJson("/api/boardgame-play-events/modes");
  const receivedModes = Array.isArray(modes.body?.modes) ? modes.body.modes : [];
  check(modes.response.ok, `/api/boardgame-play-events/modes: HTTP ${modes.response.status}`);
  check(receivedModes.length === EXPECTED_MODES.length, `모드 수 불일치: ${receivedModes.length}/${EXPECTED_MODES.length}`);
  check(EXPECTED_MODES.every((mode) => receivedModes.includes(mode)), "13개 보드게임 모드 중 일부가 누락되었습니다.");

  const stats = await getJson("/api/stats/boardgames?days=30");
  check(stats.response.ok, `/api/stats/boardgames: HTTP ${stats.response.status}`);
  check(stats.body?.ok === true, "/api/stats/boardgames: 정상 집계 응답이 아닙니다.");
  check(Array.isArray(stats.body?.modes), "/api/stats/boardgames: modes 배열이 없습니다.");
  check(Array.isArray(stats.body?.daily) && stats.body.daily.length === 30, "/api/stats/boardgames: 30일 일별 집계가 올바르지 않습니다.");
  check(Array.isArray(stats.body?.devices), "/api/stats/boardgames: devices 배열이 없습니다.");
} catch (error) {
  failures.push(`API 요청 실패: ${error.message}`);
}

if (failures.length) {
  console.error("\nDeployment verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("\nDeployment verification passed.");
  console.log(`- API version: ${EXPECTED_API_VERSION}`);
  console.log(`- Board-game modes: ${EXPECTED_MODES.length}`);
  console.log("- Database, migration, aggregate API: ready");
}
