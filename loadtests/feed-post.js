import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<700"]
  }
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000/api/v1";

export default function () {
  const feed = http.get(`${BASE_URL}/feed?limit=20`);
  check(feed, {
    "feed status is 200": (r) => r.status === 200
  });
  sleep(1);
}
