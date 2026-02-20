import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL;
const P95_THRESHOLD_MS = Number(__ENV.K6_P95_MS || 800);
const MAX_FAILED_RATE = Number(__ENV.K6_MAX_FAILED_RATE || 0.05);

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
  const res = http.get(BASE_URL, {
    tags: { endpoint: 'home' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
