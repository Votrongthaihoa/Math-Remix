# Remix Study Education

Nền tảng soạn đề, phòng thi và luyện tập trực tuyến cho Remix Study Education.
Ứng dụng dùng React/TypeScript trên Vinext, Supabase cho dữ liệu và xác thực,
Cloudflare Worker/R2 cho triển khai và tài nguyên ảnh.

## Yêu cầu

- Node.js `>=22.13.0`
- Một project Supabase đang hoạt động cho môi trường chạy thật
- R2 chỉ bắt buộc khi dùng luồng tải/lưu ảnh đề trên môi trường triển khai

## Chạy local

```bash
copy .env.example .env.local
npm install
npm run dev
```

Điền các biến Supabase trong `.env.local` trước khi dùng API phòng thi:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` chỉ được dùng ở server route và không được đưa vào
client bundle. Không commit `.env.local` hoặc bất kỳ secret nào.

## Cơ sở dữ liệu

Migration nằm trong [`supabase/migrations`](supabase/migrations/README.md).
Project đã có lịch sử migration với hai file dùng tiền tố `007`; không đổi tên
file đã áp dụng. Với project mới, chạy `supabase/schema.sql` như bootstrap hoặc
chạy các migration theo manifest.

## Kiểm tra trước khi phát hành

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` đã bao gồm typecheck, build và toàn bộ test Node trong `tests/`.
CI chạy cùng các bước này trên Node 22.

## Các luồng chính

- Soạn đề LaTeX, bảng, hình ảnh và các dạng câu hỏi THPTQG.
- Phòng thi theo cấu trúc THPTQG, HSA 2026/2027 có thể cấu hình, V-SAT và TSA.
- Luyện tập có tài khoản và thi ngắn hạn cho thí sinh tự do.
- Kíp thi có thời gian mở/đóng, giới hạn lượt, nhận diện thí sinh, giám sát,
  xuất đáp án đã chọn và dữ liệu làm bài Excel.
- Kết quả/đáp án tuân theo cấu hình phát hành của bài thi; server không gửi
  điểm hoặc đáp án khi chưa được phép.

## Nguyên tắc phát triển

- Tài liệu audit và roadmap nằm tại [`docs/engineering-roadmap.md`](docs/engineering-roadmap.md).
- Route/UI inventory, visual boundaries và contract tạo màn hình mới nằm tại
  [`docs/ui-system.md`](docs/ui-system.md).
- API phải xác thực quyền ở server, giới hạn payload và không trả dữ liệu đáp án
  khi chưa được phát hành.
- Thay đổi database chỉ thêm migration mới theo thứ tự; không sửa migration đã
  chạy trên môi trường dùng thật.
