# Roadmap phát triển Remix Study Edu

> Cập nhật: 08/08/2026  
> Phạm vi: nền tảng soạn đề, luyện tập, phòng thi có tài khoản, kíp thi ngắn hạn và
> vận hành các cấu trúc TSA, HSA, V-SAT, THPTQG.

## 1. Tầm nhìn và nguyên tắc

Mục tiêu của dự án là trở thành một nền tảng khảo thí có thể dùng cho cả luyện tập
hằng ngày lẫn kỳ thi thật, trong đó người tạo đề có thể:

- soạn đề từ LaTeX, nhập bảng/hình ảnh và nhiều dạng câu hỏi;
- chọn đúng cấu trúc của từng kỳ thi;
- mở phòng cho học sinh có tài khoản hoặc tạo kíp link ngắn hạn cho thí sinh tự do;
- theo dõi tiến độ, sự kiện giám sát và xuất dữ liệu đủ để chấm/đối soát;
- thay đổi profile cấu trúc theo từng năm mà không phải sửa code phòng thi.

Các nguyên tắc không thay đổi:

1. Dữ liệu chấm điểm và quyền truy cập phải được quyết định ở server.
2. Không gửi answer key, `latex_source`, mật khẩu, token hoặc dữ liệu quản trị
   xuống client nếu không cần thiết.
3. Luyện tập và thi chính thức là hai chế độ khác nhau. Chỉ chế độ thi chính thức
   mới bật full-screen, cảnh báo rời màn hình và chính sách giám sát tương ứng.
4. Một loại bài thi dùng đúng renderer và nhận diện của loại đó. TSA và THPTQG
   không bị đổi giao diện chỉ vì thêm kíp thi; kíp ngắn hạn phải chạy trên cùng
   runner tương ứng với bài thi gốc.
5. HSA 2026 là mốc baseline hiện tại. HSA 2027 chỉ được hiển thị là đề xuất/cấu
   hình tùy biến cho đến khi có quy chế chính thức.
6. Migration database là forward-only, có kiểm tra sau rollout và không sửa
   migration cũ đã phát hành.

## 2. Trạng thái hiện tại trong repository

### Đã có

- Phân loại phòng thi `TSA`, `HSA`, `VSAT`, `THPTQG` và profile cấu trúc riêng.
- HSA 2026 làm baseline; HSA 2027 được đánh dấu đề xuất; có profile `CUSTOM`.
- Renderer và shell riêng cho bài thi có cấu trúc đặc thù.
- Soạn đề LaTeX với:
  - `\choice[2]` và các dạng lựa chọn chuẩn;
  - `center`, `tabular`, `multicolumn`, `multirow`, `cline`;
  - `enumerate` compact;
  - `eqnarray*`, công thức inline/display;
  - ảnh đề, matching và các format câu hỏi đã được chuẩn hóa.
- Kíp thi ngắn hạn:
  - thời gian mở/đóng, thời gian gia hạn;
  - mật khẩu, số lượt, bật/tắt, xoay link;
  - chọn môn/phần cho V-SAT và THPTQG;
  - trường định danh tùy chỉnh như họ tên, lớp;
  - autosave, resume, submit và giới hạn lượt làm.
- Chế độ hiển thị điểm/đáp án theo cấu hình phát hành.
- Full-screen guard cho chế độ cần giám sát; luyện tập không ép full-screen.
- Xuất Excel gồm input thí sinh, câu đã chọn, đáp án chuẩn, kết quả từng câu,
  cấu hình kíp và sự kiện giám sát.
- Bảo vệ nội dung đề, ảnh private và endpoint guest bằng session/attempt.
- Rate-limit persistent tại migration `021_request_rate_limits.sql`.
- Audit log fail-closed cho thao tác quản trị kíp/export tại migration
  `022_exam_admin_audit_logs.sql`.
- Bộ test hiện tại pass; build và typecheck pass; lint không có error.

### Còn phải hoàn tất trước khi coi là production-ready

- Xác minh và rollout tuần tự các migration kíp/rate-limit/audit trên từng project
  Supabase; repository hiện chỉ là nguồn migration, không mặc định đã apply remote.
- Bật `RATE_LIMIT_REQUIRE_DB=1` sau khi xác minh migration `021` trên môi trường
  production.
- Có integration test thật với Supabase staging cho RLS, race condition và
  transaction boundary; test hiện tại chủ yếu là unit/static regression.
- Hoàn thiện dashboard giám sát realtime, phân quyền coi thi/reviewer và lịch sử
  audit có thể tra cứu.
- Bổ sung browser E2E cho các luồng quan trọng từ soạn đề tới xuất kết quả.
- Giảm 36 lint warning hiện có, ưu tiên warning ở runner và hook có thể gây bug.
- Chuẩn hóa observability: request id, lỗi theo route, latency, rate-limit denial,
  lỗi autosave và lỗi tải ảnh.

## 3. Kiến trúc đích

| Tầng | Trách nhiệm | Ranh giới bắt buộc |
|---|---|---|
| Authoring | Soạn đề, parse LaTeX, preview, lưu draft | Không để parser/HTML lỗi làm hỏng dữ liệu gốc |
| Content model | Exam, section, question, key, media, profile | Có version/snapshot, không phụ thuộc UI |
| Publishing | Draft, publish, khóa đề, chọn cấu trúc | Đề đã có attempt không bị thay đổi ngầm |
| Access | Tài khoản, enrollment, slot, token, password | Xác thực server; guest không truy cập trực tiếp bảng |
| Exam runner | Timer, section, answer, autosave, submit | Chấm và deadline ở server; renderer theo exam type |
| Monitoring | Full-screen, visibility, focus, network, resume | Lưu event có giới hạn, không kết luận gian lận tự động |
| Results | Score, answer review, release policy, export | Không lộ key trước thời điểm cấu hình |
| Operations | Audit, rate-limit, logs, backup, migration | Fail-closed ở hành động nhạy cảm |

Luồng dữ liệu đích:

`Authoring → Draft → Publish snapshot → Room/Slot access → Attempt snapshot
→ Autosave/Submit → Score/Release → Export/Audit`

Mọi bước chuyển trạng thái phải có validation server-side và có thể truy vết bằng
`exam_id`, `slot_id`, `attempt_id`, `admin_id` hoặc request id phù hợp.

## 4. Thứ tự ưu tiên tổng thể

| Mức | Ý nghĩa | Quy tắc |
|---|---|---|
| P0 | Chặn phát hành hoặc có rủi ro mất/lộ dữ liệu | Làm trước tính năng mới |
| P1 | Cần cho vận hành lớp/kỳ thi ổn định | Hoàn thành trong chu kỳ kế tiếp |
| P2 | Tăng năng suất, phân tích hoặc mở rộng sản phẩm | Chỉ làm sau khi P0/P1 ổn định |
| P3 | Ý tưởng dài hạn/thử nghiệm | Không đưa vào cam kết release |

Dependency chính:

`Schema/RLS → API contract → runner/guest → results/export → dashboard/analytics`

`Question model/LaTeX → editor preview → publish snapshot → all runners`

`Theme registry → exam-specific shell → responsive/accessibility QA`

## 5. Roadmap theo giai đoạn

### Giai đoạn 0 — Release gate và rollout dữ liệu (P0)

**Mục tiêu:** đưa phần đã có vào môi trường thật an toàn, không tạo migration
history sai và không mở nhầm quyền Data API.

**Hạng mục:**

- Viết runbook áp dụng theo thứ tự `017` đến `032`, bao gồm các migration khảo thí
  bắt đầu bằng `007` trong manifest hiện tại.
- Trên staging, xác minh:
  - bảng và function của rate-limit tồn tại;
  - bảng audit có RLS, policy select đúng admin và grant tối thiểu;
  - service role insert/update được audit;
  - anon/authenticated không thể đọc attempt/slot guest ngoài policy;
  - các foreign key/index không lỗi.
- Chỉ bật `RATE_LIMIT_REQUIRE_DB=1` sau khi kiểm tra thành công migration `021`.
- Smoke test các hành động:
  - tạo kíp;
  - sửa và tắt kíp;
  - xoay link;
  - bắt đầu, autosave, resume, submit;
  - mở ảnh đề;
  - release kết quả;
  - xuất Excel.
- Ghi rõ project nào đã apply migration; không dùng `schema.sql` để ghi đè
  database đang chạy.

**Tiêu chí nghiệm thu:**

- Không có endpoint nhạy cảm nào tiếp tục mutation khi audit preflight thất bại.
- Không có lỗi quyền RLS âm thầm trả về danh sách rỗng.
- Rate-limit không chạy degraded mode ở production.
- Có log và người chịu trách nhiệm rollback/forward-fix.

**Phụ thuộc:** không có.  
**Kích thước:** S.

### Giai đoạn 1 — Hardening nền tảng và tính đúng dữ liệu (P0)

**Mục tiêu:** không mất bài, không chấm sai và không để một request bất thường
làm lộ nội dung đề.

**Hạng mục:**

1. Chuẩn hóa API contract:
   - response/error code nhất quán;
   - request id và correlation id;
   - body size, key count, string length và array length dùng chung;
   - projection rõ ràng, không dùng `select('*')` ở public/learner route.
2. Chống race:
   - một attempt chỉ có một submit thành công;
   - autosave cũ không ghi đè phiên bản mới;
   - start/resume không tạo duplicate attempt;
   - rotate/disable slot không làm mất attempt đang chạy trái quy định.
3. Snapshot:
   - lưu question order/option order và config tại thời điểm bắt đầu;
   - nếu đề bị sửa sau khi có attempt, bài cũ vẫn chấm theo snapshot;
   - xác định rõ version của key, points và scoring policy.
4. Auth/session:
   - xác minh active account ở mọi route learner/admin;
   - không dùng `user_metadata` cho quyết định quyền;
   - rà soát refresh token, cookie, cache header và service role;
   - xác định chính sách revoke session khi banned/logout.
5. Observability:
   - latency, status code, database error, R2 error;
   - rate-limit allowed/denied;
   - autosave conflict, submit conflict, fullscreen exit;
   - không ghi password, token, answer key, raw identity vào log.

**Tiêu chí nghiệm thu:**

- Integration test chứng minh submit idempotent và autosave versioned.
- Fuzz test JSON/answer không làm 500 hoặc vượt giới hạn.
- Không route public nào trả field authoring secret.
- P95 API learner/guest đạt mục tiêu nội bộ; export được tách khỏi mục tiêu
  latency thường vì là tác vụ nặng.

**Phụ thuộc:** Giai đoạn 0.  
**Kích thước:** M/L.

### Giai đoạn 2 — Chuẩn hóa domain và publishing (P0/P1)

**Mục tiêu:** tách logic nghiệp vụ khỏi route/UI và tạo một nguồn sự thật cho
mọi loại đề.

**Hạng mục:**

- Tạo domain types/schema dùng chung cho:
  - `Exam`;
  - `ExamSection`;
  - `Question`;
  - `QuestionKey`;
  - `ExamProfile`;
  - `Attempt`;
  - `AccessSlot`;
  - `ReleasePolicy`;
  - `MonitorEvent`.
- Validator theo `exam_type` và `section`:
  - số câu;
  - thời lượng;
  - loại câu;
  - points;
  - section bắt buộc;
  - cấu trúc HSA selection;
  - môn độc lập V-SAT/THPTQG.
- Trạng thái publishing:
  - draft;
  - ready for review;
  - published;
  - locked/archived.
- Publish tạo immutable content snapshot hoặc version rõ ràng.
- Chặn thay đổi key/points/ordering sau khi kỳ thi đã bắt đầu, trừ flow tạo
  version mới có audit.
- Tạo diagnostics trước publish: câu thiếu đáp án, đáp án không tồn tại, bảng
  không parse được, ảnh mất, duration không hợp lệ.

**Tiêu chí nghiệm thu:**

- Một validator dùng được cho admin UI, API và test.
- Không thể publish đề thiếu cấu trúc bắt buộc.
- Có thể rollback UI về draft mà không thay đổi attempt đã thi.
- Mọi thay đổi publish có người, thời gian và diff an toàn.

**Phụ thuộc:** Giai đoạn 1.  
**Kích thước:** L.

### Giai đoạn 3 — Authoring, LaTeX và media pipeline (P1)

**Mục tiêu:** giáo viên soạn được đề phức tạp mà kết quả preview, phòng thi và
export không lệch nhau.

**Hạng mục:**

1. Parser:
   - duy trì test cho `choice`, `True`, `loigiai`, `tabular`, `center`,
     `multicolumn`, `multirow`, `cline`, `enumerate`, `eqnarray`;
   - preserve topology bảng: cột, ô trống, đường kẻ, ô gộp;
   - thêm cảnh báo khi không thể biểu diễn chính xác.
2. TikZ/ảnh:
   - ưu tiên render ảnh fallback khi TikZ không thể parse an toàn;
   - worker/compiler có timeout, giới hạn kích thước và cache theo source hash;
   - ảnh có content type, kích thước và checksum;
   - preview, learner route, guest route dùng cùng asset identity.
3. Editor UX:
   - preview theo câu và theo toàn đề;
   - diff trước/sau khi import;
   - jump tới lỗi parser;
   - autosave draft và khôi phục phiên;
   - trạng thái upload/compiler rõ ràng.
4. Question format matrix:
   - single, multiple, text, inline;
   - true/false;
   - matching;
   - ordering/drag-drop;
   - câu có passage, bảng, nhiều ảnh.

**Tiêu chí nghiệm thu:**

- Mỗi format có fixture source, normalized model, rendered HTML và scoring test.
- Ảnh không bị 404 giữa admin preview, phòng tài khoản và phòng guest.
- Parser lỗi trả diagnostics có dòng/câu, không silently đổi nội dung toán học.
- Không có upload/compiler request không giới hạn.

**Phụ thuộc:** Giai đoạn 2.  
**Kích thước:** L.

### Giai đoạn 4 — Phòng thi thống nhất và UX theo loại bài (P1)

**Mục tiêu:** học sinh có trải nghiệm nhất quán về thao tác nhưng vẫn đúng đặc
thù TSA, HSA, V-SAT và THPTQG.

**Quy tắc giao diện:**

| Loại | Nhận diện cần giữ |
|---|---|
| TSA | Giữ renderer và trải nghiệm hiện tại; chỉ sửa bug/regression |
| THPTQG | Giữ form/phân phần và logic đề THPTQG; không đổi sang giao diện kíp chung |
| HSA | Dùng theme xanh lá đậm, hiển thị rõ 3 phần và selection profile |
| V-SAT | Dùng theme xanh cyan nhạt, nhấn mạnh môn độc lập |
| Kíp ngắn hạn | Chỉ thay access/identity shell; nội dung bên trong dùng runner của bài thi |

**Hạng mục:**

- Tách `ExamShell`, `ExamHeader`, `Timer`, `SectionNavigator`,
  `QuestionRenderer`, `AnswerControl`, `SubmitGuard`, `ResultReview`.
- Theme registry theo `exam_type`, không rải màu/label trong component.
- Hai policy runtime:
  - `practice`: không full-screen bắt buộc, không cảnh báo rời màn hình;
  - `official`: full-screen, cảnh báo, event visibility/focus và submit guard.
- Timer server-authoritative:
  - deadline tính từ slot + attempt start + duration;
  - đồng hồ client chỉ là projection;
  - hết giờ tự submit/expire theo policy.
- Resume:
  - khôi phục câu, section, answer và remaining time;
  - xử lý refresh/tab đóng/mất mạng;
  - cảnh báo nếu phiên đã submit hoặc hết hạn.
- Accessibility:
  - keyboard navigation;
  - focus state;
  - contrast theo từng theme;
  - screen-reader label;
  - responsive 360px đến desktop.
- Error UX:
  - mất mạng;
  - autosave pending;
  - conflict version;
  - session hết hạn;
  - slot đóng.

**Tiêu chí nghiệm thu:**

- Cùng một đề chạy đúng trên tài khoản và guest slot.
- Kíp THPTQG vẫn mở đúng renderer THPTQG; HSA/V-SAT dùng đúng theme.
- Luyện tập không gọi full-screen guard.
- Official runner không cho bỏ qua cảnh báo/submit guard bằng UI client.
- Browser E2E pass trên Chrome/Edge mobile viewport và desktop viewport.

**Phụ thuộc:** Giai đoạn 2 và 3.  
**Kích thước:** L.

### Giai đoạn 5 — Kíp ngắn hạn và vận hành thí sinh tự do (P1)

**Mục tiêu:** giáo viên tạo link thi ngắn hạn dễ dàng, thí sinh không tài khoản
thi được, dữ liệu vẫn gắn đúng với bài và kíp.

**Hạng mục:**

- Access lifecycle:
  - create;
  - preview;
  - enable/disable;
  - rotate;
  - expire;
  - archive.
- Form cấu hình:
  - thời gian mở/đóng;
  - thời lượng;
  - grace period;
  - số lượt;
  - mật khẩu;
  - trường input;
  - giám sát;
  - phát hành điểm/đáp án;
  - thời gian xuất dữ liệu.
- Identity:
  - họ tên là display name theo field được cấu hình;
  - lớp, trường, mã thí sinh và field tùy chỉnh được lưu snapshot;
  - export giữ được field lịch sử kể cả sau khi giáo viên đổi form.
- Link:
  - không hiển thị token raw trong log;
  - link hết hạn/khóa trả thông báo generic;
  - rotate vô hiệu hóa link cũ;
  - password không bao giờ lưu plaintext.
- Phân biệt:
  - slot mở kíp;
  - attempt đã bắt đầu;
  - attempt đang grace;
  - export window.

**Tiêu chí nghiệm thu:**

- Tạo slot cho bài generic, HSA, V-SAT và THPTQG theo đúng validation.
- Slot V-SAT/THPTQG luôn gắn đúng một section/môn.
- Thí sinh nhập input, refresh và resume không mất dữ liệu.
- Disable slot không xóa attempt đã có.
- Rate-limit và audit hoạt động trên create/start/progress/submit/image/export.

**Phụ thuộc:** Giai đoạn 0–4.  
**Kích thước:** M.

### Giai đoạn 6 — Kết quả, giám sát và xuất dữ liệu (P1)

**Mục tiêu:** người tạo kíp có thể trả lời được ba câu hỏi: ai đã thi, đã làm
gì, và dữ liệu có thể đối soát được không.

**Hạng mục:**

1. Dashboard kíp:
   - tổng số lượt;
   - đang thi;
   - đã nộp;
   - hết hạn;
   - điểm/độ hoàn thành;
   - số lần rời full-screen;
   - lỗi autosave;
   - filter theo lớp, trạng thái, thời gian, section.
2. Monitoring:
   - timeline theo attempt;
   - event type, timestamp, count;
   - phân biệt cảnh báo kỹ thuật và hành vi cần xem xét;
   - không tự động kết luận gian lận chỉ từ một event.
3. Release policy:
   - điểm;
   - đáp án;
   - lời giải;
   - khi làm xong;
   - khi tất cả thi xong;
   - sau mốc điểm;
   - release thủ công.
4. Excel:
   - `Tổng hợp`;
   - `Input thí sinh`;
   - `Câu đã chọn`;
   - `Đáp án từng câu`;
   - `Đối chiếu ngang`;
   - `Giám sát`;
   - `Cấu hình kíp`.
   - giữ answer raw/display, question order, input và monitor count;
   - column width, UTF-8/locale và filename an toàn.
5. Audit UI:
   - lọc theo admin/exam/room/slot/action/status;
   - xem thời điểm bắt đầu/kết thúc;
   - metadata chỉ là safe summary;
   - không hiển thị secret.

**Tiêu chí nghiệm thu:**

- Số điểm dashboard và Excel khớp với server scoring.
- Export ngoài window bị chặn và có audit failed/succeeded phù hợp.
- Không có đáp án chuẩn trước thời điểm release.
- Một attempt có thể đối chiếu từ input → answer → score → monitor event.

**Phụ thuộc:** Giai đoạn 1 và 5.  
**Kích thước:** L.

### Giai đoạn 7 — Profile cấu trúc kỳ thi và kiểm soát theo năm (P1/P2)

**Mục tiêu:** cập nhật cấu trúc đề bằng dữ liệu cấu hình, không hardcode lại
runner mỗi năm.

**Hạng mục:**

- `ExamProfile` có version, label, official/proposal, note, sections, duration,
  question count, scoring và selection policy.
- THPTQG:
  - catalog môn;
  - validation số câu/thời lượng;
  - phần đặc thù từng môn;
  - không trộn với form HSA/V-SAT.
- HSA:
  - HSA 2026 là profile chính thức baseline trong app;
  - HSA 2027 là proposal;
  - cho phép custom section/selection nhưng phải ghi nhãn custom.
- V-SAT:
  - subject template độc lập;
  - màu xanh cyan nhạt;
  - slot và export theo từng môn.
- TSA:
  - giữ cấu trúc/renderer đã có;
  - thêm version khi thay đổi chính thức.
- Validator báo mismatch giữa profile và nội dung đề trước publish.
- Tài liệu tham chiếu phải ghi rõ nguồn, ngày kiểm tra và mức độ chính thức.

**Tiêu chí nghiệm thu:**

- Tạo được đề theo profile 2026 và custom 2027 mà không sửa component runner.
- Proposal không bị hiển thị như quy chế chính thức.
- Đổi profile không làm mất dữ liệu attempt cũ.

**Phụ thuộc:** Giai đoạn 2 và 4.  
**Kích thước:** M.

### Giai đoạn 8 — Performance, reliability và scale (P2)

**Mục tiêu:** chịu được nhiều lớp thi đồng thời mà không giảm độ tin cậy.

**Hạng mục:**

- Query plan cho attempt/slot/export; composite index theo access pattern.
- Pagination cho dashboard và monitor events.
- Tách export nặng khỏi request thường nếu cần:
  - job/queue;
  - trạng thái pending/ready/failed;
  - link download private có hạn.
- Cache chỉ dùng cho dữ liệu public/immutable; không cache attempt/answer/private image.
- R2:
  - retry có giới hạn;
  - checksum;
  - lifecycle/cleanup;
  - quota monitoring.
- Database:
  - connection/pool monitoring;
  - bloat/vacuum;
  - backup/restore drill;
  - kiểm tra index FK và RLS performance.
- Web performance:
  - lazy-load editor và renderer lớn;
  - giảm bundle;
  - tối ưu ảnh;
  - không chặn first interaction bởi compiler.

**Tiêu chí nghiệm thu:**

- Có load test cho start/progress/submit và mở ảnh.
- Có restore drill trên staging.
- Export 10k attempt có cơ chế tiến độ hoặc timeout được kiểm soát.
- Không có query dashboard phụ thuộc full table scan khi dữ liệu tăng.

**Phụ thuộc:** Giai đoạn 1 và 6.  
**Kích thước:** L/XL.

### Giai đoạn 9 — Tính năng tương lai (P2/P3)

Chỉ bắt đầu sau khi các release gate P0/P1 ổn định:

- ngân hàng câu hỏi có tag, chủ đề, độ khó, version và reuse;
- blueprint kéo thả theo ma trận kiến thức;
- phân tích item: tỷ lệ chọn đáp án, discrimination, câu bất thường;
- báo cáo theo lớp, môn, section, cohort;
- reviewer workflow và comment trên câu hỏi;
- thông báo lịch thi và nhắc hạn;
- offline queue cho autosave trong mạng chập chờn;
- multi-tenant/role `teacher`, `invigilator`, `reviewer`, `admin`;
- data retention, export/delete theo chính sách tổ chức;
- adaptive practice;
- proctoring nâng cao chỉ sau khi có đánh giá pháp lý, quyền riêng tư và
  cơ chế human review.

## 6. Backlog ưu tiên có mã

| Mã | Ưu tiên | Hạng mục | Phụ thuộc | Kết quả |
|---|---:|---|---|---|
| REL-01 | P0 | Runbook rollout migration `017`–`032` | — | Staging/production có checklist |
| REL-02 | P0 | Bật required DB rate-limit | REL-01 | Không degraded ở production |
| SEC-01 | P0 | Supabase/RLS integration test | REL-01 | Không BOLA/IDOR |
| SEC-02 | P0 | Session revoke và active-account matrix | SEC-01 | Ban/logout có hiệu lực |
| DATA-01 | P0 | Attempt snapshot/version contract | — | Chấm đúng đề tại thời điểm thi |
| DATA-02 | P0 | Idempotent submit/autosave race test | DATA-01 | Không duplicate/mất bài |
| DATA-03 | P1 | Publish lock/version workflow | DATA-01 | Không sửa ngầm đề đang thi |
| EDIT-01 | P1 | Parser diagnostics + preview diff | DATA-03 | Import có cảnh báo rõ |
| EDIT-02 | P1 | TikZ/image compiler queue | EDIT-01 | Ảnh có retry/timeout/cache |
| ROOM-01 | P1 | Tách shared exam shell | DATA-03 | Runner dùng chung contract |
| ROOM-02 | P1 | Theme registry HSA/VSAT | ROOM-01 | Đúng màu/nhận diện |
| ROOM-03 | P1 | Official/practice policy matrix | ROOM-01 | Full-screen đúng chế độ |
| GUEST-01 | P1 | Slot lifecycle UI + audit history | REL-01 | Quản lý kíp trọn vòng đời |
| GUEST-02 | P1 | Guest resume/offline conflict UX | DATA-02 | Không mất bài |
| RESULT-01 | P1 | Dashboard monitor theo attempt | GUEST-01 | Người coi thi tra cứu được |
| RESULT-02 | P1 | Release/export permission matrix | GUEST-01 | Không lộ key |
| RESULT-03 | P1 | Audit log viewer | REL-01 | Có truy vết thao tác admin |
| PROFILE-01 | P1 | Profile validator theo năm | DATA-03 | Không hardcode cấu trúc |
| E2E-01 | P0 | E2E critical path | ROOM/GUEST/RESULT | Gate trước release |
| OPS-01 | P1 | Metrics, alert và error budget | SEC/DATA | Biết lỗi trước người dùng |
| SCALE-01 | P2 | Queue hóa export nặng | RESULT-02 | Không timeout request |

## 7. Ma trận kiểm thử bắt buộc

### Theo vai trò và chế độ

- Admin tạo/sửa/khóa/xoay/release/export.
- Học sinh có tài khoản: luyện tập và thi chính thức.
- Thí sinh tự do: nhập identity, password, start, resume, submit.
- Reviewer/invigilator tương lai: chỉ xem đúng phạm vi được cấp.
- Anonymous không có session hợp lệ: không đọc đề, ảnh, attempt hoặc result.

### Theo loại bài

- TSA: renderer hiện tại, section/timer/scoring.
- HSA 2026: 3 phần, selection phần 3, profile official.
- HSA 2027: proposal/custom, không gắn nhãn official.
- V-SAT: từng môn độc lập, theme cyan, slot theo section.
- THPTQG: từng môn độc lập, đúng renderer THPTQG, không dùng form HSA.

### Theo lỗi và bảo mật

- slot chưa mở, đang grace, đã đóng, bị disable;
- password sai, link cũ sau rotate;
- refresh, đóng tab, mất mạng, timeout;
- hai tab cùng attempt;
- autosave out-of-order;
- submit đồng thời;
- image asset không thuộc section/attempt;
- export trước/sau export window;
- audit table/function unavailable;
- rate-limit denied;
- RLS select/update/insert bằng anon và authenticated;
- answer key xuất hiện trong HTML, JSON, log, cache hoặc response error.

### Theo thiết bị

- desktop 1280px trở lên;
- tablet;
- mobile 360px/390px;
- Chrome/Edge desktop;
- Safari/iOS và Android browser nếu phát hành mobile;
- zoom 200%, keyboard-only và reduced-motion.

## 8. Definition of Done

Một hạng mục chỉ được đánh dấu hoàn thành khi:

- có validation và authorization ở server;
- có migration mới nếu thay đổi schema, kèm index/RLS/grant;
- có unit/regression test và integration test nếu đụng Supabase;
- có E2E nếu ảnh hưởng luồng người dùng chính;
- không lộ answer key, token, password, raw identity hoặc authoring secret;
- có loading/error/empty/conflict state ở UI;
- đã kiểm tra desktop/mobile và đúng theme;
- build, typecheck, lint và test pass;
- có metric/log/alert phù hợp;
- cập nhật tài liệu và migration manifest;
- ghi rõ rollback hoặc forward-fix;
- không làm thay đổi ngoài ý muốn renderer TSA/THPTQG.

## 9. Quy trình release và rollback

1. Mỗi thay đổi đi qua branch/PR với test liên quan.
2. Chạy typecheck, lint, build và toàn bộ test.
3. Với schema:
   - tạo migration số mới;
   - review FK, index, RLS, grant, constraint;
   - apply trên staging;
   - chạy verification query/advisor phù hợp;
   - smoke test route;
   - ghi trạng thái migration.
4. Deploy application tương thích ngược trước hoặc cùng migration.
5. Chỉ bật feature flag/`RATE_LIMIT_REQUIRE_DB=1` sau khi database đã sẵn sàng.
6. Theo dõi lỗi, latency, denial rate, submit conflict và export failure.
7. Nếu có lỗi:
   - tắt feature flag hoặc quay về flow an toàn;
   - không xóa audit/attempt để “rollback”;
   - dùng migration forward-fix cho dữ liệu;
   - khôi phục backup khi có nguy cơ mất dữ liệu;
   - ghi incident và test hồi quy.

## 10. Chỉ số vận hành cần theo dõi

- tỷ lệ start thành công;
- tỷ lệ autosave thành công và conflict;
- tỷ lệ submit thành công;
- số attempt bị expire;
- thời gian tải câu hỏi/ảnh;
- rate-limit denial theo scope;
- số lần rời full-screen theo attempt;
- tỷ lệ export thành công/thất bại;
- thời gian tạo workbook hoặc job export;
- lỗi parser/compiler theo format;
- lỗi authentication/session;
- số audit `failed` theo action;
- tỷ lệ lỗi theo exam type và browser.

Mục tiêu ban đầu là phát hiện được lỗi mất bài, lộ dữ liệu, sai scoring và lỗi
renderer trước khi người dùng phải báo; ngưỡng cảnh báo cụ thể sẽ được chốt sau
khi có baseline staging/production.

## 11. Quyết định sản phẩm đã chốt

- Kíp ngắn hạn không có renderer riêng; dùng runner của bài thi tương ứng.
- Tên thí sinh trong header/result/export là họ tên được nhập ở bước xác thực.
- Export phải bao gồm input, câu đã chọn, câu trả lời, đáp án/kết quả theo policy,
  số lần rời full-screen và sự kiện giám sát.
- Số câu đúng/điểm chỉ hiển thị theo cấu hình của người tạo kíp.
- Full-screen và cảnh báo chỉ áp dụng cho thi chính thức; luyện tập không áp dụng.
- HSA dùng xanh lá đậm; V-SAT dùng xanh cyan nhạt.
- TSA và THPTQG giữ nhận diện/renderer hiện tại, chỉ sửa lỗi hoặc thay đổi có
  review riêng.
- HSA 2026 là baseline; HSA 2027 là proposal có thể tùy biến.
- Audit admin fail-closed trước mutation; hoàn tất audit sau mutation là
  best-effort.
- Không apply migration Supabase remote chỉ bằng việc cập nhật `schema.sql`;
  phải rollout migration tuần tự và xác minh từng môi trường.

## 12. Cập nhật sau review kiến trúc (2026-08-08)

Phần này là bản ghi đè có hiệu lực cho các mục tương ứng ở các phần trước của
roadmap. Mục tiêu là biến cấu hình thi thành một contract dùng chung, thay vì
để route/UI tự diễn giải từng tùy chọn.

### 12.1. ExamPolicy là lớp policy runtime chuẩn

Mỗi attempt phải nhận một policy đã chuẩn hóa ở server và lưu bản snapshot bất
biến tại thời điểm bắt đầu. Contract gồm:

```text
ExamPolicy
├── access: audience, accountRequired, rosterMode, allowedClasses, maxAttempts
├── timing: opensAt, closesAt, durationMinutes, gracePeriodMinutes
├── randomization: shuffleQuestions, shuffleOptions, questionPoolSize, seedStrategy
├── navigation: allowBacktrack, allowSkip, requireAnswerBeforeNext, lockCompletedSections
├── integrity: fullscreen, visibility/focus, copy/paste, context menu, device limit
├── release: score/answers visibility, threshold, hideWrongAnswers
├── network: save state, offline draft
└── review: manual review, score override, regrade version
```

Nguyên tắc thực thi:

- policy được normalize và validate ở server;
- `exam_attempts.policy_snapshot` và `guest_exam_attempts.policy_snapshot` là
  nguồn sự thật của attempt cũ;
- seed random chỉ nằm trong server snapshot, projection công khai phải loại seed;
- slot được quyền quyết định thời gian mở/đóng và grace; cấu hình lưu trong đề
  không được kéo dài deadline của slot;
- chỉ hiển thị trong admin những option đã có enforcement tương ứng ở runner/API.

Hiện đã có `lib/exam-policy.ts`, snapshot cho account/guest, randomization có seed,
navigation policy ở runner/API, roster allowlist, monitoring, scoring version và
regrade có audit. Các giới hạn còn phụ thuộc rollout là enforcement đồng thời nhiều
thiết bị, section backtrack/lock ở server và workflow release thủ công cho account;
không được coi là production-ready nếu chưa kiểm tra trên staging.

### 12.2. Giai đoạn 0 được tách thành release gate nhỏ hơn

Thay cho một task Giai đoạn 0 cỡ S, dùng các gate sau; tổng effort được đánh giá
là M vì bao gồm cả staging verification và production handoff:

| Gate | Phạm vi | Kết quả bắt buộc |
|---|---|---|
| 0A — Migration verification | `017`–`032`, manifest, schema drift, FK/index/constraint | Có checklist/query xác minh từng môi trường |
| 0B — Security verification | RLS, grants, active account, audit preflight, rate-limit | Không BOLA/IDOR; mutation nhạy cảm fail-closed |
| 0C — Critical smoke | create/update/disable/rotate slot, start/autosave/resume/submit, image, release, Excel | Critical path chạy trên staging |
| 0D — Production rollout | flag, owner rollback/forward-fix, log/alert, post-deploy check | Chỉ bật `RATE_LIMIT_REQUIRE_DB=1` sau khi 0A–0C pass |

### 12.3. E2E gate mới

`E2E-01` cũ không còn là một gate duy nhất phụ thuộc vào các hạng mục P1. Backlog
được thay bằng:

| Mã | Ưu tiên | Phạm vi |
|---|---:|---|
| E2E-00 | P0 | Core: login → start → autosave → refresh/resume → submit → score |
| E2E-01 | P1 | Phòng thi có tài khoản, practice/exam và policy full-screen |
| E2E-02 | P1 | Guest slot: identity/password → start/resume → timeout/submit |
| E2E-03 | P1 | Release/export: score, answer visibility, export window, Excel |
| E2E-04 | P1 | TSA/HSA/V-SAT/THPTQG: đúng runner, section, theme và timing |

`E2E-00` là continuous release gate, không chờ ROOM/GUEST/RESULT hoàn thành mới
chạy. Mỗi E2E phải kiểm tra cả success path và failure path quan trọng.

### 12.4. Các policy cần hoàn thiện tiếp theo

- Randomization: seed theo attempt, đảo câu/đáp án, pool câu hỏi và giữ order khi
  resume; account runner chỉ bật sau khi content manifest hỗ trợ đầy đủ.
- Navigation: cho quay lại/bỏ qua/bắt buộc trả lời/khóa section; phải enforce ở
  server khi submit section, không chỉ khóa nút trên client.
- Integrity: copy/paste/context menu, concurrent device/session và backoff khi
  đoán password; event chỉ là tín hiệu cần review, không tự kết luận gian lận.
- Roster: open/enrolled/class/allowlist với projection và authorization riêng.
- Network UX: `saved`, `saving`, `offline`, `retrying`, conflict version và
  recovery rõ ràng cho thí sinh.
- Regrade/manual review: tạo key version mới, chấm lại có audit, score override
  có lý do/người duyệt và không sửa trực tiếp lịch sử attempt.

### 12.5. Audit và vận hành tương lai

Audit hiện tại fail-closed trước mutation và completion audit là best-effort. Khi
đưa hệ thống vào kỳ thi có yêu cầu truy vết cao, bổ sung transactional outbox hoặc
audit cùng transaction để không còn khoảng hở mutation thành công nhưng audit
hoàn tất thất bại. Không xóa attempt/audit để rollback; chỉ forward-fix và ghi
incident.

### 12.6. Thứ tự build tiếp theo

```text
0A–0D rollout verification
  → E2E-00 core integrity
  → policy enforcement/navigation
  → E2E-01 account room
  → E2E-02 guest slot
  → E2E-03 release/export
  → E2E-04 exam-type regression
  → regrade/reviewer/analytics/scale
```
