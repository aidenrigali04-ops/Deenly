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
const LOADTEST_EMAIL = __ENV.LOADTEST_EMAIL || "";
const LOADTEST_PASSWORD = __ENV.LOADTEST_PASSWORD || "";
const LOADTEST_POST_ID = Number(__ENV.LOADTEST_POST_ID || 0);

function getAuthToken() {
  if (!LOADTEST_EMAIL || !LOADTEST_PASSWORD) {
    return "";
  }

  const loginResponse = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      email: LOADTEST_EMAIL,
      password: LOADTEST_PASSWORD
    }),
    {
      headers: {
        "content-type": "application/json"
      }
    }
  );
  check(loginResponse, {
    "loadtest login status is 200": (res) => res.status === 200
  });

  return loginResponse.json("tokens.accessToken") || "";
}

export default function () {
  const feed = http.get(`${BASE_URL}/feed?limit=20`);
  check(feed, {
    "feed status is 200": (r) => r.status === 200
  });

  const token = getAuthToken();
  if (token && LOADTEST_POST_ID > 0) {
    const authedHeaders = {
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json"
      }
    };

    const followingFeed = http.get(
      `${BASE_URL}/feed?limit=20&followingOnly=true`,
      authedHeaders
    );
    check(followingFeed, {
      "authenticated feed status is 200": (res) => res.status === 200
    });

    const viewResponse = http.post(
      `${BASE_URL}/interactions/view`,
      JSON.stringify({
        postId: LOADTEST_POST_ID,
        watchTimeMs: 9000,
        completionRate: 72
      }),
      authedHeaders
    );
    check(viewResponse, {
      "authenticated view event status is 201": (res) => res.status === 201
    });
  }

  sleep(1);
}
