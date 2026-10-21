# Tích hợp danh mục khóa học từ frontend tham chiếu

Ngày: 2026-09-30. Phạm vi: `/admin/content` và alias quản trị không thuộc giao diện thi.

Đây là một đợt tích hợp thực tế, chưa phải chuyển toàn bộ frontend hoặc đạt tương đồng pixel cho cả website. Dự án đã có nhiều màn lấy theo nguồn tham chiếu trước đợt này; không ghi nhận lại các màn đó là thay đổi mới.

## Nguồn đã dùng

| Nguồn | Phần tái sử dụng / đối chiếu |
| --- | --- |
| `D:\fbbbbbbbbbbbbb\admin-dashboard\src\components\DataTable.tsx` | Contract cột/render/row key, cấu trúc bảng và phân trang. |
| `D:\fbbbbbbbbbbbbb\admin-dashboard\src\pages\CoursesPage.tsx` | Danh mục khóa học, 10 dòng/trang, trạng thái, số bài, ngày tạo, thao tác quản lý. |
| `D:\fbbbbbbbbbbbbb\admin-dashboard\src\lib\download-csv.ts` | Xuất CSV UTF-8 có BOM, escape dấu nháy và tạo file tải cục bộ. |
| `D:\fbbbbbbbbbbbbb\admin-dashboard\src\styles.css`, `src\pages.css` | Bảng, course-cell và nhãn cột trên màn hình hẹp. |
| `D:\New folder\aeck\data\admin\index-CLyo2tY5.js` | Đối chiếu các field `lessonCount`, `createdAt`, phạm vi nhóm và cấu hình `pagination:{pageSize:10}` trong bundle. |
| `D:\New folder\aeck\data\admin\index-B5M3Ib0t.css` | Đối chiếu cấu trúc bảng Ant Design của nguồn; không nhập reset/global stylesheet. |
| `D:\New folder\aeck\data\newdata\Search-CXYBuDEs.js` | Đọc luồng tìm kiếm; phần hiển thị câu hỏi/đáp án thuộc vùng bảo vệ, không port. |

Không thực thi bundle cũ, không nhập API client nguồn, không dùng host production của nguồn. Mock API/localStorage trong prototype không được mang vào ứng dụng.

## Chức năng mới

- Dùng bảng tham chiếu làm chế độ mặc định; giữ chế độ danh sách có sẵn.
- Phân trang 10 khóa học, tính lại trang hợp lệ khi số kết quả giảm.
- Giữ bộ tìm kiếm không dấu tiếng Việt, lọc trạng thái và sắp xếp hiện có; đưa trạng thái vào URL qua `q`, `status`, `sort`, `view`, `page`. Reload/Back/Forward khôi phục bộ lọc.
- Cột ảnh/tên, mô tả mở rộng, trạng thái, số bài, ngày tạo và liên kết quản lý.
- Mở builder và hộp tạo khóa học hiện có. Không thay handler ghi/xóa/upload. Browser Back từ builder khôi phục URL danh sách; nút về danh sách của builder vẫn giữ hành vi cũ.
- Xuất toàn bộ kết quả đã lọc **trong tập dữ liệu đã tải**, không chỉ trang hiện tại. Không khẳng định đây là toàn bộ dữ liệu trên server nếu truy vấn nguồn bị giới hạn.
- CSV giữ tiếng Việt, nội dung nhiều dòng/dấu nháy; vô hiệu hóa tiền tố công thức từ chuỗi không tin cậy. Vô hiệu nút xuất khi loading, lỗi hoặc không có kết quả.
- Link sang `/courses`; không thay bằng preview dùng dữ liệu demo trong hash URL.

### Alias bổ sung trong đợt này

| URL | Đích |
| --- | --- |
| `/admin/course-management` | `/admin/content` |
| `/admin/course-management/:id` | `/admin/content/courses/:id` |
| `/admin/user-management` | `/admin/students` |
| `/admin/group-user-management` | `/admin/enrollments` |
| `/admin/access` | `/admin/enrollments` |
| `/admin/media-management` | `/admin/upload` |

Giữ query, encode ID và quyền của màn đích. Alias nhóm chỉ dẫn tới enrollment hiện tại, không cung cấp CRUD nhóm hoặc quyền kế thừa. Alias media không ánh xạ tùy tiện folder ID. Các alias dashboard/courses/schedule/audit đã tồn tại trước đợt này.

## Ranh giới và dữ liệu

- Component chỉ nhận `AdminCourseRow` và `lessonsPerCourse` từ luồng tải hiện có. Không tạo field backend, không thêm dependency hay migration.
- Không đưa cột `examTypes`, instructor hoặc group scope của nguồn vào khi contract hiện tại chưa có field tương đương được xác minh.
- Không có Supabase MCP theo dự án trong phiên này: schema/RLS/Auth/Storage live và các thao tác với dữ liệu thật chưa được kiểm chứng. Browser test dùng phản hồi giả lập tại origin `.invalid`, chặn HTTP/WebSocket ngoài localhost và origin giả lập.
- Không đổi engine thi, câu hỏi, đáp án, submit, kết quả, review hay authoring. Không sửa `platform.tsx`, layout hoặc stylesheet global trong đợt này.
- CSS mới chỉ nằm dưới `.ui-shell.admin-app.product-shell:not(.protected-exam-surface) .admin-content-catalog`, dùng token thương hiệu hiện có. Bảng chuyển thành thẻ ở màn hình hẹp; tên dài tự xuống dòng, mô tả dùng `details` và nút có focus bàn phím.

## File thuộc đợt này

Hai file có sẵn được sửa có chủ đích:

- `app/admin-content-list.tsx`: bổ sung bảng/phân trang/xuất CSV/URL state, giữ handler và các trạng thái danh sách trước đó. File đã là untracked trước khi bắt đầu.
- `app/admin-route-map.ts`: chỉ bổ sung alias nêu trên vào phần code vốn đã có thay đổi của người dùng.

File mới:

- `app/admin-reference-data-table.tsx`
- `app/admin-reference-data-table.css`
- `app/admin-catalog-location.ts`
- `lib/download-csv.ts`
- `tests/admin-reference-catalog.test.mjs`
- `e2e/admin-reference-catalog.spec.ts`
- Tài liệu này.

Các thay đổi khác trong worktree, gồm protected files, `platform.tsx`, `admin-product-shell.css`, các test cũ và `docs/reference-frontend-integration.md`, có từ trước và được giữ nguyên.

## Kiểm chứng

- TypeScript `tsc --noEmit`: đạt.
- ESLint các file của đợt này: đạt, không warning.
- `next build`: đạt, sinh 56/56 trang. Build dùng cấu hình auth giả lập, không deploy.
- 86 test Node thuộc danh mục, URL, CSV, route parity, public site, product-shell và protected boundary: đạt.
- Playwright: **24/24 đạt** — 6 luồng × 4 viewport (1440, 768, 390, 320); Chromium trên desktop/tablet và WebKit trên mobile. Bao gồm lọc/phân trang/CSV, nội dung dài, bàn phím, loading/error/retry/empty, gate quyền, builder/Back, chuyển từ catalog sang admin exam và mở guest entry. Xem báo cáo kết quả cuối tại đường dẫn dưới.
- Ảnh chụp đã được kiểm tra trực quan. Các kiểm tra overflow chỉ áp dụng vùng danh mục mới; smoke protected kiểm tra entry và catalog quản trị, không phải toàn bộ quy trình làm/nộp/chấm bài.

Artifacts cục bộ:

`C:\Users\LENOVO\AppData\Local\Temp\aeck-frontend-compare-73270d1d14ba40f8886cae31fbc44ef1`

Trong đó: `reference-courses.png`, `before/`, `tests/**/catalog-table.png`, `tests/**/catalog-list.png`, `tests/**/protected-*.png`, `results.json`, `playwright-report/index.html`.

Browser QA chạy qua Next dev tại localhost. Lệnh khởi chạy production bị môi trường từ chối nên chưa xác minh runtime production/vinext/Cloudflare. Cảnh báo CSP về React development `eval()` cũng có trước thay đổi. Không nới CSP để phục vụ test.

## Còn lại

- Sidebar admin ngoài vùng catalog có hiện tượng nhãn bị cắt và khoảng trống lệch trên ảnh desktop; ảnh baseline đã có cùng hiện tượng. Không sửa chung stylesheet để che lỗi này trong đợt catalog.
- Tiếp tục đối chiếu từng màn vận hành có API sẵn, không coi có route là đã hoàn tất tính năng.
- Groups thực sự, iLearn/điểm danh/recording, IRT, minh chứng, gói học tập và giao hàng cần contract/schema/quyền được xác minh. Không port CRUD demo thành chức năng lưu dữ liệu thật.
- Mọi thay đổi khu vực đề/câu hỏi/đáp án cần yêu cầu riêng; migration/RLS/Auth/production cần ủy quyền đúng thao tác.
