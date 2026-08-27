# AECK Platform workspace

Đây là bề mặt React/Vite mới được nội suy từ hai bundle tham chiếu
`D:\New folder\newdata` và `D:\New folder\admin`. Workspace chạy song song với
ứng dụng Next/Vinext ở root; các runner, result/review, THPTQG, TSA, HSA và trình
soạn đề cũ vẫn thuộc ứng dụng legacy.

## Architecture

- React 19 + React Router Data Router
- TanStack Query for server state
- Zustand for the minimal authenticated UI snapshot
- Native `fetch` với `ApiResult` được kiểm tra bằng Zod
- Hono routes on a Cloudflare Worker
- Tailwind 4 theme/utilities plus isolated product CSS
- Shared contracts from `@aeck/contracts`
- AECK Crypto v3 (RSA-OAEP + AES-GCM + gzip) và fallback v2 được tải động

CSS/JavaScript minified chỉ được dùng để đọc route, hành vi, hierarchy và token;
không được copy vào source. Xem [PARITY.md](./PARITY.md) để biết ánh xạ route và
phạm vi đã giữ ở legacy.

## Local commands

From the repository root:

```sh
npm run dev:platform
npm run dev:platform:admin
npm run test:platform
npm run typecheck:platform
npm run build:platform
npm run build:platform:production
npm run build:vercel --workspace @aeck/platform
```

Hai lệnh development chọn Cloudflare `preview` và tự mở session theo vai trò.
`build:vercel` tạo parity preview có trang đăng nhập cho cả học viên và admin;
fixture chỉ được biên dịch trong preview. Production build loại fixture.

## Feature coverage

- Học viên: dashboard, khóa học/bài học, phòng luyện và danh sách bài thi, lịch sử,
  tiến độ, recap, IRT, nhập mã, tìm kiếm không dấu và thời khóa biểu giờ Việt Nam.
- Admin: dashboard, users/groups, courses/media, results/IRT, verification, plans,
  delivery, timetable, iLearn, audit, watermark, monitoring và workbench CRUD preview.
- Builder bổ sung: Lexical được lazy-load, lưu document có revision/content hash,
  phát hiện conflict `409 EDIT_CONFLICT`, và luôn có lối mở trình soạn cũ.
- Operations hub: trạng thái connector, Zoom meeting, Gemini OCR, VietQR và
  tracking thủ công khi hãng vận chuyển chưa phản hồi.
- Public signup: feature flag, Turnstile server-side, Supabase Auth signup và yêu
  cầu xác nhận email. Preview dùng token cố định, không giả làm Turnstile production.

## Data boundary

- `DATA_MODE=preview` serves reference fixtures for visual QA.
- `DATA_MODE=upstream` forwards dashboard requests to the configured legacy origin at `/api/platform/dashboard`.
- `DATA_MODE=disabled` returns a typed `UPSTREAM_UNAVAILABLE` result.
- `/api/*` runs Worker-first; SPA navigation falls back to `index.html`.
- No secret is stored in `wrangler.jsonc`.

Các cờ production mặc định đều đóng:

| Biến | Phạm vi | Ý nghĩa |
| --- | --- | --- |
| `PUBLIC_SIGNUP_ENABLED` | server | Mở endpoint đăng ký công khai |
| `VITE_PUBLIC_SIGNUP_ENABLED` | client | Hiện route/link đăng ký |
| `VITE_TURNSTILE_SITE_KEY` | client | Site key công khai của Turnstile |
| `TURNSTILE_SECRET` | secret server | Secret gọi Siteverify; không commit |
| `TURNSTILE_HOSTNAMES` | server | Hostname frontend được phép, phân tách bằng dấu phẩy |
| `SUPABASE_URL` | server | Supabase Auth origin |
| `SUPABASE_PUBLISHABLE_KEY` | server | Publishable key; không dùng service role |
| `OPERATIONS_INTEGRATIONS_ENABLED` | server | Mở operations connector |
| `LEGACY_API_ORIGIN` | server | Backend adapter đã xác minh |
| `VITE_LEGACY_APP_ORIGIN` | client | Origin mở các route protected/legacy |

Không bật signup production trước khi site key, secret, hostname allowlist, email
confirmation và redirect URL đã được kiểm tra end-to-end. Phiên này không tạo hay
áp migration Supabase vì chưa có project-scoped Supabase MCP.

## Vercel parity preview

`vercel.json` trong workspace tạo một project Vercel riêng:

- static SPA ở `dist/client` với deep-link fallback;
- `/api/*` được chuyển tới Hono Web Handler cùng origin;
- asset hash có cache immutable;
- không thay thế project/domain legacy ở root.

Project preview dùng fixture không nhạy cảm và mock login cho cả hai vai trò.
Cutover production chỉ được thực hiện sau khi backend adapter, Turnstile và
Supabase live vượt qua parity gate.

`LEGACY_API_ORIGIN` and the corresponding legacy dashboard endpoint must be configured before production traffic is switched. Supabase schema work is deliberately deferred until a project-scoped Supabase MCP connection can verify the live schema. No migration is created by this workspace.

## Protected visual boundary

Exam runners, questions, answers, result/review screens và authoring cũ không bị
restyle. Route tương ứng mở thẳng ứng dụng hiện tại. AECK exam crypto và toàn bộ UI
protected trong root giữ nguyên.
