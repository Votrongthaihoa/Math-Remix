# OneDrive HLS Vault trong Math Remix

## Encode và upload bằng FFmpeg native local

Để encode nhanh hơn, chạy `scripts/encode-hls-native.mjs` trên máy có FFmpeg native. Máy local sẽ encode hai rendition `1080p` và `720p`, sau đó upload từng manifest/segment qua API admin vào `VideoVault/<videoId>/`. MP4 gốc không được upload lên website. Sau khi upload xong, web tự đọc OneDrive, rewrite HLS và phát video qua gateway có kiểm tra quyền.

Trang `Quản trị → Encode HLS` (`/admin/hls-vault`) có thể điều khiển FFmpeg native local qua một agent trên `127.0.0.1`; nếu agent chưa chạy, trang vẫn có tùy chọn FFmpeg WebAssembly dự phòng trong trình duyệt.

Sau khi tool báo hoàn tất, vào trình soạn khóa học, chọn `OneDrive HLS Vault`, nhập cùng `videoId` và tạo resource cho lesson. Tool không tự tạo database resource để tách riêng bước upload file và bước gắn video vào lesson.

Math Remix hỗ trợ resource `hls_vault` trong lesson. Người quản trị chỉ lưu mã
video ổn định, ví dụ `lesson01`; không lưu URL CDN tạm thời, access token hay
refresh token vào `lesson_resources`.

## Chuẩn bị máy encode local

FFmpeg native mặc định được tìm tại `C:\ffmpeg\bin\ffmpeg.exe`. Có thể cài ở vị trí khác và truyền `--ffmpeg` hoặc đặt `FFMPEG_PATH`.

Script cần một Supabase access token còn hạn của tài khoản admin. Đặt token trong file local, không commit file này và không dán token vào log:

```powershell
$env:REMIX_API_ORIGIN="https://api.mathremix.pro.vn"
$env:REMIX_ACCESS_TOKEN_FILE="D:\secrets\remix-access-token.txt"

npm.cmd run encode:hls:native -- `
  --input "D:\Videos\lesson01.mp4" `
  --video-id "lesson01"
```

Có thể truyền trực tiếp token bằng `REMIX_ACCESS_TOKEN`, nhưng file token là lựa chọn an toàn hơn. Có thể giữ output HLS local để kiểm tra bằng `--keep-output`; mặc định thư mục tạm và khóa media local sẽ bị xóa sau khi chạy.

Trước khi chạy encode thật, kiểm tra riêng FFmpeg bằng lệnh không cần MP4, access token hoặc API:

```powershell
npm.cmd run encode:hls:native -- --check-ffmpeg
```

Nếu FFmpeg đã được thêm vào `PATH`, có thể chỉ rõ bằng `--ffmpeg ffmpeg`; nếu cài ở thư mục khác, dùng đường dẫn đầy đủ với `--ffmpeg`. Trên một số Windows dev shell, `node`/`npm` có thể bị app execution alias rỗng trong `C:\Windows\System32` che khuất Node thật; `npm.cmd` sẽ gọi đúng Node cài tại `C:\Program Files\nodejs`.

## Dùng FFmpeg native từ giao diện web

Mở terminal tại thư mục repo và giữ agent chạy trong lúc dùng trang quản trị:

```powershell
npm.cmd run ffmpeg:agent
```

Sau đó mở `Quản trị → Encode HLS`, chọn `FFmpeg native trên máy`, chọn MP4, nhập `videoId` và bấm `Encode native và upload`. Trình duyệt gửi MP4 vào agent local; agent gọi FFmpeg native và dùng session admin hiện tại để gọi API. Access token chỉ nằm trong bộ nhớ của agent trong thời gian job, không ghi vào file hoặc log.

Agent chỉ lắng nghe trên `127.0.0.1:49321` và chỉ nhận request từ các origin Math Remix hoặc localhost. Nếu dùng site production khác origin, truyền thêm origin khi khởi động:

```powershell
npm.cmd run ffmpeg:agent -- --web-origin https://mathremix.pro.vn
```

Các tùy chọn hữu ích:

```text
--api-origin <origin>   API Math Remix, mặc định https://api.mathremix.pro.vn
--ffmpeg <path>         Đường dẫn ffmpeg.exe
--threads <n>           Số luồng encode, mặc định số CPU - 1
--keep-output           Giữ thư mục HLS tạm sau khi upload
```

Script lấy khóa AES-128 theo video từ endpoint admin, chỉ dùng khóa đó trong lúc encode, rồi xóa file khóa tạm. Master key chỉ tồn tại trong server runtime và không được đặt trên máy local.

## Cấu hình website

Đặt các biến server-only trong Vercel/local environment:

```text
ONEDRIVE_HLS_ROOT=VideoVault
MEDIA_MASTER_KEY_HEX=<cùng giá trị dùng khi encode>
```

Website dùng kết nối Microsoft Graph delegated hiện có để đọc folder HLS. Kết
nối Microsoft trước trong trang quản trị nếu chưa có connection hoạt động. API
upload sẽ tự tạo `VideoVault/<videoId>/1080p` và `720p` trước khi nhận file.

## Migration

Chạy migration forward-only:

```text
supabase/migrations/045_hls_vault_resources.sql
```

Migration chỉ mở rộng check constraint để nhận `hls_vault`; không xóa bảng,
không ghi dữ liệu và không thay đổi RLS. Production vẫn cần dry-run/apply theo
quy trình phát hành của repository.

## Thêm video vào lesson

Trong `Quản trị → Tài nguyên → khóa học → bài học → Thêm nội dung`, chọn
`OneDrive HLS Vault`, nhập tên nội dung và `Mã video HLS`, ví dụ `lesson01`.

Khi học viên mở bài:

1. Math Remix kiểm tra session, account status, enrollment và lesson publish.
2. Server cấp content token ngắn hạn gắn với user và resource.
3. Manifest được đọc qua `/api/hls/...`, rewrite các playlist/segment và key về
   route có kiểm soát quyền.
4. AES-128 key được derive từ `MEDIA_MASTER_KEY_HEX` trong server runtime; key
   không nằm trên OneDrive.

Đây là AES-128 HLS, chưa phải DRM Widevine/FairPlay. Người có quyền xem vẫn có
thể instrument trình duyệt để lấy nội dung/key.
