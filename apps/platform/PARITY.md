# AECK platform parity manifest

## Nguồn tham chiếu

- Student bundle: `D:\New folder\newdata`
- Admin bundle: `D:\New folder\admin`
- Ảnh đối chiếu: `artifacts/reference-dashboard.png`,
  `artifacts/reference-courses.png` và `artifacts/admin-dashboard-mock-1280.png`

Bundle được đọc để nội suy route, API path, trạng thái, hierarchy, responsive và
CSS token. Source mới là React/TypeScript/CSS có cấu trúc; không chứa bundle
minified được copy lại.

## Học viên

| Nhóm | Route platform | Trạng thái |
| --- | --- | --- |
| Tổng quan | `/dashboard` | Native |
| Khóa học | `/courses`, `/course/study/:id` | Native |
| Phòng luyện | `/exam-rooms/:type`, `/assessment-list/:examRoomId` | Native catalog |
| Lịch sử/tiến độ | `/history`, `/exam-history`, `/progress`, `/recap` | Native |
| IRT | `/irt-exams`, `/irt-results`, `/irt-exam/:id/register` | Native catalog/registration |
| Tra cứu/TKB | `/search`, `/tkb` | Native |
| Nhập mã | `/enter` | Native |
| Hồ sơ | `/profile` | Native |
| Runner/result/review | `/assessment/*`, `/exam/test/*`, `/exam/result/*`, `/exam-answer/*` | Legacy bridge, protected |

## Admin

| Nhóm | Route platform | Trạng thái |
| --- | --- | --- |
| Dashboard | `/admin` | Native |
| Users/groups | `/admin/users`, `/admin/groups` | Native workbench |
| Courses/media | `/admin/courses/*`, `/admin/media/*` | Native workbench |
| Results/IRT | `/admin/results/*`, `/admin/irt/*` | Native workbench |
| Verification/plans | `/admin/verification/*`, `/admin/plans` | Native workbench |
| Delivery/TKB/iLearn | `/admin/delivery`, `/admin/tkb`, `/admin/ilearn/*` | Native workbench |
| Audit/watermark/monitoring | `/admin/audit`, `/admin/watermark`, `/admin/monitoring` | Native workbench |
| Operations connectors | `/admin/integrations` | Native, feature-gated |
| Builder bổ sung | `/admin/exam-builder/*` | Native Lexical, canonical HTML/LaTeX preserved |
| Đề thi cũ | `/admin/exams/*` | Legacy bridge, protected |
| Kho câu hỏi/soạn câu | `/admin/question-bank`, `/item/*` | Legacy bridge, protected |
| Kíp thi/bảo mật | `/admin/sessions/*`, `/admin/security` | Legacy bridge, protected |

Các alias gốc như `/user-management`, `/course-management`,
`/shipment-management`, `/tkb-management`, `/ilearn-management` và
`/watermark-trace` được redirect tới module platform tương ứng.

## Gate và giới hạn đã biết

- THPTQG, TSA, HSA, runner, result/review và trình soạn cũ được giữ nguyên theo
  yêu cầu; platform không normalize CSS của các bề mặt này.
- Admin bundle cho phép trích gần đầy đủ route/API vận hành. Student dump thiếu
  khoảng 43 dynamic chunk, nên không tuyên bố pixel/function parity 1:1 cho những
  màn hình không có source tham chiếu.
- Zoom/Gemini/VietQR/GHN production cần backend adapter thực và secret/config hợp
  lệ. Khi chưa có, cờ production đóng và shipment dùng fallback thủ công.
- Signup production cần Turnstile thật và Supabase live; preview chỉ chứng minh
  contract/UI bằng dữ liệu fixture.
