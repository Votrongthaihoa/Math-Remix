# Tích hợp học viên và kho ảnh từ frontend tham chiếu

Ngày: 2026-09-30. Tiếp nối `reference-catalog-port.md`.

## Phạm vi đã triển khai

Đưa phần giao diện vận hành phù hợp từ `D:\fbbbbbbbbbbbbb\admin-dashboard` vào các route **đang được sử dụng** của dự án. Không thay cả ứng dụng bằng prototype và không coi route alias là hoàn tất chức năng.

| Màn | Thay đổi |
| --- | --- |
| `/admin/students` | Tóm tắt số học viên đã tải; bảng tên/email/mã/khóa học/trạng thái/thao tác; tìm không dấu; lọc trạng thái và đã/chưa cấp khóa; sắp xếp; 20 dòng/trang; xuất CSV theo toàn bộ tập đã lọc; hồ sơ chi tiết. |
| `/admin/upload` | Riêng kho ảnh công khai: lưới/danh sách, lọc đang dùng/chưa dùng, tìm không dấu, sắp xếp tên/ngày/dung lượng, xem nhanh và thông tin ảnh. |
| Sidebar admin không thuộc vùng thi | Cho `nav` chiếm đủ chiều ngang sidebar; kiểm tra mở rộng, thu gọn và drawer mobile. |

Học viên giữ nguyên handler tạo tài khoản và đổi mật khẩu. Kho ảnh giữ nguyên upload, copy URL, xóa có xác nhận và khóa xóa ảnh đang dùng. Không thực hiện các thao tác này trên dữ liệu thật trong đợt kiểm thử.

Hộp chi tiết dùng native `dialog`: hỗ trợ bàn phím, Escape, cô lập nền và trả focus về nút mở. Tên/email/file dài được xuống dòng; danh sách chuyển bố cục ở màn hình hẹp; URL trong input được chọn/sao chép thay vì cắt mất dữ liệu.

## Nguồn và những điều đã điều chỉnh

- `src/pages/StudentsPage.tsx`: cấu trúc summary, bảng theo column renderer, tìm/lọc và hồ sơ chi tiết. Dùng các field hiện có của `AdminProfileRow`, không tạo cohort, lastActive hoặc trạng thái pending/suspended giả.
- `src/components/DataTable.tsx`, `src/components/ui.tsx`: bảng/phân trang và tương tác hộp thoại; tiếp tục tái sử dụng bản port từ đợt danh mục.
- `src/pages/MediaManagementPage.tsx`: ý tưởng grid/list, bộ lọc và inspector. Không đem localStorage, metadata demo, thư mục hoặc thùng rác giả vào kho R2 hiện tại.
- Logic/CSS trong `D:\New folder\aeck\data` đã được đối chiếu trong đợt danh mục (xem tài liệu trước). Đợt này không chạy hoặc import bundle minified/API client của nguồn.

CSS mới dùng token `--brand-*`, `--alpha-*`, `--admin-*`, giữ đỏ–trắng/Lato, đặt dưới `.ui-shell.admin-app.product-shell:not(.protected-exam-surface)` và lớp component cụ thể. Không sửa global stylesheet để phục vụ giao diện mới.

Trạng thái lưới/lọc/sắp xếp ảnh được lưu trong query `publicView`, `publicUsage`, `publicSort`, cùng query tìm kiếm/phân trang sẵn có. Học viên giữ search state của parent để QuickFinder còn hoạt động; bộ lọc mới của học viên chỉ tồn tại trong màn hiện tại, chưa lưu qua reload.

## Ranh giới

- `app/platform.tsx` là file chung: chỉ thêm import/component cho tab học viên, bỏ bộ lọc inline đã được chuyển vào component. Handler tài khoản và các nhánh thi giữ nguyên trong đợt này.
- Không thay ảnh đề thi riêng tư, engine thi, câu hỏi/đáp án, submit, kết quả, review, preview hoặc authoring.
- Không sửa schema, migration, Auth, RLS hay dữ liệu production. Không có Supabase MCP theo dự án trong phiên này nên không khẳng định đã kiểm chứng backend live.
- CSV chỉ xuất dữ liệu đã tải, có BOM cho tiếng Việt và chống tiền tố công thức. Giữ cảnh báo giới hạn phân trang email của server; không khẳng định dữ liệu đầy đủ toàn hệ thống.

## File của đợt này

Mới:

- `app/admin-student-roster.tsx`, `app/admin-student-roster.css`, `app/admin-roster-query.ts`
- `app/admin-reference-dialog.tsx`, `app/admin-reference-dialog.css`
- `app/admin-public-media-query.ts`, `app/admin-public-media-reference.css`
- `tests/admin-reference-operations.test.mjs`
- Tài liệu này.

Sửa có chủ đích:

- `app/platform.tsx`: tab học viên như trên, giữ nguyên các thay đổi có sẵn của người dùng.
- `app/admin-upload.tsx`: tính năng kho ảnh công khai.
- `app/admin-source-reference.css`: thêm `width: 100%` và `align-self: stretch` cho nav desktop không thuộc vùng thi.
- `app/admin-reference-data-table.tsx/.css`: nhãn phân trang tùy theo màn và scope cho roster.
- `e2e/admin-reference-catalog.spec.ts`: mở rộng fixture và kiểm thử từ 6 lên 12 luồng.
- `tests/product-shell-ui.test.mjs`: chuyển kiểm tra source của roster sang component mới, không xóa assertion cảnh báo/đổi mật khẩu.

`app/admin-students.tsx` và `app/admin-enrollments.tsx` đã có trong worktree nhưng không phải component được `platform.tsx` dùng; không sửa chúng rồi coi như đã tích hợp. Các thay đổi khác của người dùng, gồm protected files, được giữ nguyên.

## Kiểm chứng

- 96 test Node liên quan đến danh mục, roster, media, route/quyền, CSV, product-shell, public site và protected boundary: đạt.
- TypeScript `tsc --noEmit`: đạt.
- `next build` trên source cuối: đạt, sinh 56/56 trang với auth origin giả lập; không deploy.
- ESLint các file triển khai/test liên quan: không lỗi; 10 warning có sẵn ở `platform.tsx` và `admin-upload.tsx` (ảnh `<img>` và component `Overview` không được sử dụng).
- Playwright: **48/48 đạt**, 12 luồng × 4 viewport (1440, 768, 390, 320). Chromium desktop/tablet; WebKit mobile. Có dữ liệu dài, CSV, bàn phím/focus, error/retry/empty/loading, quyền, modal tạo tài khoản qua request **giả lập**, ảnh đang dùng bị khóa xóa và private-tab gate. Hai kiểm tra mobile bổ sung chờ drawer mở hết, xác nhận cạnh không ra ngoài viewport và nhãn không bị cắt: 2/2 đạt (`rail-report`, `rail-results.json`, `rail-tests`).
- Protected smoke gồm điều hướng từ danh mục sang admin exam catalog và guest entry ở 4 viewport; không phải kiểm thử trọn quy trình làm/nộp/chấm bài.
- Hash ảnh admin exam catalog trùng baseline của đợt danh mục ở cả 4 viewport. Guest entry có timestamp động nên không trùng hash; đã đối chiếu trực quan bố cục ở 320px, chỉ thời gian thay đổi.
- Browser QA chỉ dùng localhost và auth origin `.invalid`; chặn HTTP/WebSocket ngoài hai origin này. Không tạo tài khoản hay ghi R2/Supabase thật.

Artifacts: `C:\Users\LENOVO\AppData\Local\Temp\aeck-reference-operations` (`report/index.html`, `results.json`, `tests/**.png`).

Browser QA chạy bằng Next dev. Chưa kiểm chứng runtime production/vinext/Cloudflare; lần khởi chạy production trước bị môi trường chặn, không thử vượt giới hạn đó. Cảnh báo CSP development đã có trước và không được nới lỏng để kiểm thử.

Đã dừng đúng server QA localhost:3107 sau kiểm thử; không dừng server khác. Không commit/push/deploy, không xóa hoặc khôi phục các thay đổi có sẵn trong worktree.

## Chưa port

CRUD nhóm/quyền kế thừa, cohort/hoạt động gần đây, media folder/trash/rename/move, iLearn, IRT và các chức năng chưa có contract được xác minh không được dựng thành dữ liệu giả. Vùng đề/câu hỏi/đáp án vẫn cần yêu cầu riêng theo `AGENTS.md`.
