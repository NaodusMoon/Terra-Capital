import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL;
const TEST_PATH = __ENV.K6_TEST_PATH || '/';

function envNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const P95_THRESHOLD_MS = envNumber(__ENV.K6_P95_MS, 800);
const MAX_FAILED_RATE = envNumber(__ENV.K6_MAX_FAILED_RATE, 0.05);
const ACCEPTED_STATUSES = [200, 301, 302, 307, 308];

if (!BASE_URL) {
  throw new Error('Missing BASE_URL environment variable');
}

export const options = {
  stages: [
    { duration: '20s', target: 5 },
    { duration: '60s', target: 20 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_duration: [`p(95)<${P95_THRESHOLD_MS}`],
    // Guardrail de disponibilidad con margen para fallos transitorios durante deploys.
    http_req_failed: [`rate<${MAX_FAILED_RATE}`],
  },
};

export default function () {
  const base = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
  const path = TEST_PATH.startsWith('/') ? TEST_PATH : `/${TEST_PATH}`;
  const url = `${base}${path}`;

  const res = http.get(url, {
    tags: { endpoint: 'home' },
    responseCallback: http.expectedStatuses(...ACCEPTED_STATUSES),
  });

  check(res, {
    'status is acceptable': (r) => ACCEPTED_STATUSES.includes(r.status),
  });

  sleep(1);
}
