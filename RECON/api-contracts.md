# Observable API contracts

Status: sanitized inventory. No authorization/cookie headers or response user data are retained.

## App bootstrap observed on `/courses?examType=HSA`

- Document: `GET https://alpha.aeck.vn/courses?examType=<value>` -> 200 HTML.
- No XHR/fetch response was captured during the initial reload after network observation was enabled. Course content may arrive through an already-cached/runtime path or a subsequent chunk/flow; this is not yet resolved.
- Normal authenticated navigation was subsequently verified across dashboard, courses, one redacted study-detail route, history, timetable, portal, and the HSA catalog. The read-only page context did not provide a sanitized request-schema capture, so no headers, bodies, response values, cookies, or storage were inspected.

## Browser-delivered bundle signals

- Observable API origin: `https://server.aeck.vn`.
- Observable auth path strings: `/auth/login`, `/auth/register`, `/auth/logout`.
- Other origin signals: `https://account.aeck.vn`, `https://aeck.vn`.

Bundle strings are not sufficient to define full request or response contracts. Endpoints will be documented only when normal user flows actually issue them.

## Public capture

- Public route crawl observed document/chunk requests on `aeck.vn` and sanitized API calls on `server.aeck.vn`, including public course/package reads and auth key registration/refresh flows. Raw headers and payloads are not retained.

## Local product-shell smoke contracts

The local Playwright smoke stubs only the routes needed to exercise UI states; these are not claims about the live target API:

- `/api/lesson-resources`
- `/api/video-token`
- `/api/resource-content`
- `/api/security/session`
- exam/catalog and admin fixtures used by protected visual regression

The study smoke verifies loading, PDF/video switching, retry after a mocked 503, lesson navigation and responsive curriculum behavior without submitting an exam or mutating production data.
