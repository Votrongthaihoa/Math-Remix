# Áp dụng frontend tham chiếu vào AECK hiện tại

Ngày đối chiếu: 2026-09-29. Nguồn: `D:\fbbbbbbbbbbbbb` và các bundle gốc được tài liệu trong thư mục này dẫn tới.

## Phạm vi đã thống nhất

Giữ lõi dự án hiện tại và phát triển theo từng đợt nhỏ. Tái sử dụng bố cục, cách tìm kiếm, lọc và thao tác hữu ích từ frontend tham chiếu; nối chúng vào dữ liệu, quyền truy cập và handler hiện có. Không thay ứng dụng bằng prototype, không chuyển dữ liệu thật sang localStorage, không thay cơ chế đăng nhập hoặc engine thi.

Tài liệu này ghi lại đối chiếu mã nguồn, không xác nhận trạng thái triển khai production. Trong phiên kiểm tra không có công cụ Supabase MCP theo dự án được cung cấp; schema, RLS, Auth, Storage và migration đang chạy chưa được kiểm chứng trực tiếp. Tên bảng/field dưới đây mô tả code hiện tại, không khẳng định schema live có đầy đủ các thành phần đó.

## Nguồn nào chứng minh điều gì

| Nguồn đã đọc | Bằng chứng và giới hạn |
| --- | --- |
| `D:\fbbbbbbbbbbbbb\README.md` | Frontend tĩnh dùng hash router. Các file `live-tsa-*-data.js` là dữ liệu hiển thị; media thật, nộp bài và chấm bài không được triển khai trong bản này. |
| `admin-dashboard\README.md`, `src\lib\mock-api.ts` trong thư mục tham chiếu | Admin React/TypeScript/Vite có dữ liệu giả trong bộ nhớ và localStorage. `getDashboard()` chứa số liệu và phép tính minh họa; CRUD khóa học chỉ cập nhật dữ liệu trình duyệt. |
| `admin-dashboard\src\lib\catalog-preview.ts` | Preview giữa cổng admin và trang học gửi `exam_types`/`preview_courses` trong hash URL. Đây là chuyển dữ liệu xem trước, không phải đồng bộ API. |
| `docs\admin-route-inventory.md` trong thư mục tham chiếu | Chỉ tới production bundle gốc; lần quan sát admin được ghi lại gặp trang lỗi. Không có bằng chứng đối chiếu pixel với admin live hoạt động. |
| `D:\New folder\aeck\data\admin\index-CLyo2tY5.js` | Bundle gốc tồn tại, khoảng 4,37 MB. Có route, handler, field biểu mẫu và lời gọi API để đối chiếu. |
| `D:\New folder\aeck\data\admin\apiClient-CWA_5Kxp.js` | Bundle client API tồn tại, khoảng 1,24 MB. Có base URL, refresh JWT, header client và wrapper mã hóa dữ liệu. |

File phân tích `D:\New folder\aeck\phan_tich_chuc_nang_aeck.md` được tài liệu tham chiếu nhắc tới nhưng không tồn tại tại đường dẫn đó khi kiểm tra. Không dùng nội dung giả định từ file này. Không tìm thấy source map trong cây nguồn gốc đã đối chiếu.

Bundle trình duyệt cho biết client gửi gì và mong nhận gì. Nó không chứng minh thuật toán backend, validation trên server, quyền thực tế, schema dữ liệu hay cách chấm điểm. Danh sách API trong `admin-dashboard-architecture-blueprint.md` là đề xuất kiến trúc; chỉ xem là contract nguồn khi có lời gọi tương ứng trong bundle.

### Các contract đọc được trực tiếp từ bundle

Các offset bên dưới là vị trí ký tự trong chuỗi JavaScript đọc bằng UTF-8; có thể tìm lại bằng tên endpoint. Một dòng của bundle minified chứa nhiều module.

| Module | Bằng chứng trong `index-CLyo2tY5.js` | Contract client quan sát được |
| --- | --- | --- |
| Khóa học | Dòng 1369, offset khoảng 3.285.780 | `GET/POST /courses`; `GET/PUT/DELETE /courses/:id`; CRUD chapter/lesson; reorder chapter với `{chapterIds}`, lesson với `{lessonIds}`. |
| Biểu mẫu khóa học | Dòng 1421, offset khoảng 4.140.000 | `_id`, `title`, `thumbnailUrl`, `status`, `examTypes`; danh sách dùng `lessonCount`, `createdAt`; `examTypes` rỗng được hiển thị là “Mọi web”. |
| Người dùng | Dòng 1264, offset khoảng 2.576.000 | Phân trang, tìm kiếm, role và sort; API chi tiết, khóa/mở khóa, email verified, session và permissions riêng. |
| Dashboard | Dòng 1369, offset khoảng 3.270.118 | `/dashboard/stats` và `/dashboard/completed-profiles?page=&limit=&q=`. |
| Media | Dòng 1373, offset khoảng 3.421.393 | Folder/file CRUD, di chuyển, trash/restore, upload và tiến độ xử lý server. |
| TKB/iLearn | Dòng 1421, offset khoảng 4.268.198 | `/tkb/admin/all`, CRUD lịch; iLearn classes, sessions, materials, attendance và recordings. Các kiểu hiển thị gồm Zoom, Live Page, Video, iLearn. |
| Sức khỏe server | Dòng 1421, offset khoảng 4.208.327 | `/server-health`; UI mong có hardware/application/database/httpMetrics/history, làm mới mỗi 5 giây. |

`apiClient-CWA_5Kxp.js` dòng 191 gọi dịch vụ `server.aeck.vn/api/v2`, dùng JWT riêng, `X-Client-Id`, refresh token và wrapper mã hóa. Không sao chép client này vào AECK: ứng dụng hiện tại đã có `authenticatedFetch`, session bảo mật và các API thuộc dự án. Quyền admin của nguồn dùng giá trị role khác với dự án; không chuyển thẳng các giá trị role hoặc quy tắc cấp quyền từ bundle.

## Ánh xạ vào các phần đang có

“Có adapter” ở đây nghĩa là có đường dẫn/handler trong source local. Việc gọi thành công với tài khoản và hạ tầng thật cần kiểm chứng riêng.

| Nhóm màn tham chiếu | Đường dẫn và adapter AECK hiện tại | Phần có thể phát triển tiếp / giới hạn |
| --- | --- | --- |
| Trang công khai, đăng nhập, hồ sơ | `app/aeck-public-site.tsx`; các màn auth/profile trong `app/platform.tsx`; `lib/auth-client.ts` | Áp dụng bố cục và text safety trên dữ liệu hiện có. Giữ session, recovery và xử lý lỗi thật; không nhập phiên demo. |
| Tổng quan học viên, tiến độ, lịch sử tóm tắt | `app/student-dashboard.tsx`, `app/student-progress.tsx`; `/api/student-dashboard`, `/api/learning/continue`, `/api/exams?scope=history` | Dùng số liệu trả về thật. Không lấy số điểm, tổng học viên, heatmap hoặc tiến độ từ fixture. Review/đáp án vẫn thuộc vùng bảo vệ. |
| Danh mục, chi tiết khóa học | `/courses`, `/courses/:id`; các component Courses/CourseDetail trong `app/platform.tsx`; `/api/courses` | Tìm kiếm, sắp xếp, bộ lọc trên các field có sẵn và trạng thái rỗng/lỗi. Không tự biến tên khóa học thành phân loại nghiệp vụ đã được lưu. |
| Bài học, PDF, video | `/lessons/:id`; `/api/lesson-resources`, `/api/resource-content`, `/api/video-token`, `/api/lesson-pdf-download`, `/api/hls/*` | Giữ kiểm tra enrollment, token, quyền tải và player hiện tại. Không thay media thật bằng preview hoặc URL fixture. |
| Quản lý khóa học/chương/bài | `/admin/content`, `/admin/content/courses/:id`; AdminCourseBuilder trong `app/platform.tsx`; API cover/resource hiện có | Cải thiện danh sách và thao tác trên handler hiện tại. Chương, bài, tài nguyên dùng mô hình của dự án; không tạo kho dữ liệu song song. |
| Học viên, phiên, bảo mật | `/admin/students`, `/admin/security`; `/api/admin/users`, `/api/admin/security`, `/api/admin/sessions` | Ánh xạ thao tác vào contract đang có. Giữ gate quyền ở server, lỗi provider được làm sạch và phản hồi thao tác hoàn thành một phần. |
| Nhóm người dùng/quyền truy cập khóa học | `/admin/enrollments`; code quản lý enrollment hiện tại | Cấp quyền theo học viên có adapter. Nhóm có vòng đời, thành viên và quyền kế thừa của nguồn chưa có contract đã kiểm chứng tương đương. |
| Media/kho tài nguyên | `/admin/upload`, `/admin/hls-vault`, course builder; `/api/admin/images`, `lesson-files`, `lesson-videos`, `lesson-hls`, `hls-vault/*` | Dùng upload và tài nguyên hiện tại. Cây media toàn cục, chuyển thư mục, trash/restore của nguồn chưa được xem là tương đương kho ảnh/HLS. |
| TKB học viên và quản trị | `/tkb`, `/admin/timetable`; `app/admin-course-timetable.tsx`; `/api/timetable`, `/api/admin/timetable`, `/api/admin/course-timetable` | Có thể áp dụng lịch, lọc và điều hướng tuần. Giữ việc lấy join URL qua API kiểm tra quyền; không dùng Zoom URL fixture. |
| iLearn | Capability center và thông tin lịch hiện tại | Chưa kiểm chứng adapter cho lớp iLearn, điểm danh, ghi hình hoặc retry recording. Hiển thị link trên lịch không tương đương backend iLearn hoàn chỉnh. |
| Đề thi, ngân hàng câu hỏi, phòng thi, assessment | `/admin/exams`, `/admin/question-bank`, `/admin/sessions` và API exam/question hiện có | Chỉ ghi nhận mapping. Không đổi UI hoặc nghiệp vụ protected trong đợt áp dụng frontend tổng quát. |
| Kết quả, thống kê, IRT, chứng chỉ | Kết quả hiện tại mở từ kíp thi; `/admin/capabilities?module=irt` ghi nhận phần IRT chưa có adapter | Không thay điểm/chấm bài hoặc màn review. IRT, chứng chỉ và chuẩn hóa điểm cần contract, nguồn dữ liệu và yêu cầu riêng. |
| Minh chứng, gói học tập, giao hàng | Capability center cho `evidence`, `subscriptions`, `shipments`; các trang công khai liên quan | Có route mô tả không có nghĩa là có backend duyệt hồ sơ, thanh toán hay vận chuyển. Không đưa CRUD demo thành thao tác thành công thật. |
| Audit, watermark, sức khỏe server | `/admin/audit`, `/admin/server-health`, `app/admin-watermark-trace.tsx`; các API `/api/admin/audit`, `watermark-trace`, `server-health` | Dùng kết quả API hiện tại; watermark là flow của dự án. Health chỉ có status/checks/integrations/latency, không suy diễn CPU/RAM/Mongo/history của nguồn. |

### Khác biệt cần giải quyết trước khi thêm persistence

| Field/khái niệm nguồn | Code AECK hiện tại | Quyết định |
| --- | --- | --- |
| `_id` | `id` | Dùng ID hiện tại; ID trong fixture hoặc Mongo ID nguồn không chứng minh có bản ghi tương ứng. |
| `thumbnailUrl` | `cover_url` | Tái sử dụng upload cover của dự án. |
| `status: published/draft` | `published: boolean` | Có thể ánh xạ hai trạng thái này; `archived` trong prototype chưa có semantics tương đương. |
| `examTypes: string[]` | Chưa có field này trong select của `/api/courses` và `saveCourse()` đã kiểm tra | Không thêm ghi database theo giả định. Bộ lọc tạm thời phải nói đúng field đang dùng; không quảng bá là quản lý loại kỳ thi động. |
| Group scope/`group-user` | Mã hiện tại dùng enrollment theo học viên | Cần xác minh schema và quyết định quyền kế thừa trước khi bổ sung group. |
| Source admin role/permissions | `lib/admin-permissions.ts`, `lib/admin-authorization-server.ts` | Giữ quyền từ Auth-owned `app_metadata`; menu/role demo không cấp quyền server. |

## Route tương thích

`app/admin-route-map.ts` và `app/[...slug]/page.tsx` đã có alias cho nhiều URL gốc của bundle. Không cần dựng lại các màn này để giữ liên kết cũ hoạt động.

| URL gốc của bundle | Điểm đến hiện tại |
| --- | --- |
| `/course-management`, `/course-management/:id` | `/admin/content`, `/admin/content/courses/:id` |
| `/user-management`, `/group-user-management` | `/admin/students`, `/admin/enrollments` |
| `/media-management` | `/admin/upload`; chi tiết folder nguồn không tương đương folder hiện tại |
| `/tkb-management`, `/admin-log`, `/server-health` | `/admin/timetable`, `/admin/audit`, `/admin/server-health` |
| `/exam-management`, `/question-bank`, `/exam-room-management`, `/assessment-management` | Các màn exam/question/session hiện tại, giữ protected boundary |
| Các module legacy chưa có adapter | `/admin/capabilities?module=...` theo route map |

Prototype mới trong `D:\fbbbbbbbbbbbbb\admin-dashboard` lại dùng các URL như `/admin/dashboard`, `/admin/courses`, `/admin/courses/:id`, `/admin/*-management`. Chúng không tự động được hỗ trợ bởi alias cho URL gốc. Đây là một đợt tương thích nhỏ có thể triển khai tiếp: chỉ thêm alias có điểm đến rõ, giữ ID/query cần thiết và gate quyền của màn đích. Không đổi `/dashboard` học viên thành dashboard quản trị. Không chuyển ID source thành bản ghi thật nếu chưa có mapping.

Route có tên permission trong `lib/admin-permissions.ts` chưa đủ chứng minh màn hình đã được triển khai. Cần kiểm tra cả route admission, redirect, route mode, gate quyền và page đích. Route mới không được phân loại sẽ giữ trạng thái protected theo `app/ui-route-mode.ts`.

## Các đợt triển khai và điều kiện nghiệm thu

1. **Danh mục học viên và quản trị trên dữ liệu hiện tại.** Cải thiện tìm kiếm/lọc/sắp xếp và điều hướng tới builder hiện có. Giữ create/edit/delete/upload handler; không thêm field backend. Kiểm tra kết quả lọc, reset, danh sách rỗng, lỗi tải, số lượng hiển thị và link chi tiết.
2. **Alias và điều hướng từ prototype.** Bổ sung các URL đã có màn tương đương, kèm test route. Không tạo màn trống rồi đánh dấu module hoàn thành; module thiếu adapter tiếp tục hiện giới hạn rõ ràng.
3. **Chi tiết khóa học, bài học và lịch.** Chọn từng màn để áp dụng tương tác từ nguồn. Kiểm tra enrollment, draft/published, token hết hạn, lỗi resource, join lịch và tài khoản không có quyền. Giữ player và watermark tài khoản hiện có.
4. **Các màn vận hành có API sẵn.** Lần lượt đối chiếu users/security, audit, media và server health. Kiểm tra quyền khác nhau và contract lỗi; chỉ hiển thị metric thật mà API trả về.
5. **Mở rộng domain còn thiếu.** Exam types động, groups, iLearn, IRT, minh chứng, gói học tập, giao hàng: lấy schema/contract live qua Supabase MCP theo dự án, xác định dữ liệu và quyền, rồi lập thay đổi riêng. Migrations, RLS, Auth, dữ liệu production và deploy Edge Function cần người dùng cho phép đúng thao tác. Không áp dụng chúng trong đợt frontend này.

Mỗi đợt frontend cần chạy ứng dụng, kiểm tra Playwright ở desktop và viewport hẹp, quan sát clipping/overflow, keyboard/focus và trạng thái loading/error/empty. Dùng tên ngắn, tên tiếng Việt/Anh dài và chuỗi không ngắt phù hợp với màn. Build/typecheck không thay thế kiểm tra trình duyệt.

Các màn liên quan dữ liệu thật cần kiểm tra với session được cấp quyền và backend khả dụng. Browser test dùng route interception hoặc fixture chỉ xác nhận hành vi UI theo contract đã giả lập; không xác nhận Supabase/RLS, upload, player hoặc production. Ghi rõ phần chưa kiểm chứng khi bàn giao.

## Ranh giới bảo vệ và công việc có sẵn

- Giữ toàn bộ exam runner, câu hỏi, lựa chọn/trạng thái trả lời, submit, kết quả, review, lời giải, preview và authoring theo `AGENTS.md`. Yêu cầu áp dụng frontend chung không cấp quyền đổi các màn này.
- Thay đổi `app/platform.tsx` phải giới hạn trong component/màn được chọn. CSS sản phẩm dùng wrapper cụ thể, token thương hiệu hiện có; không mở rộng selector sang `.exam-shell` hoặc normalize các component protected.
- Trước/sau mỗi đợt kiểm tra `git status --short`; giữ các sửa đổi đang có của người dùng và chỉ nhận trách nhiệm cho các file/hunk thuộc đợt đó.
- Tài liệu này bổ sung kết quả đối chiếu mới. `docs/source-ui-migration-map.md` mô tả đợt snapshot cũ; các câu về trạng thái nguồn hoặc sự cho phép trong tài liệu lịch sử không thay thế guardrail và phạm vi được người dùng xác nhận ở phiên hiện tại.
