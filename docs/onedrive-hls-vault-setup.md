# OneDrive HLS Vault trong Math Remix

## Encode và upload từ trang quản trị

Quản trị viên có thể dùng `Quản trị → Encode HLS` (`/admin/hls-vault`) để chọn MP4 local. Trình duyệt sẽ tải FFmpeg WebAssembly, encode hai rendition `1080p` và `720p` ngay trên máy, sau đó gửi từng manifest/segment đã mã hóa qua server Graph proxy vào `VideoVault/<videoId>/`. MP4 gốc không được gửi lên website và master key không được gửi xuống client.

Sau khi tool báo hoàn tất, vào trình soạn khóa học, chọn `OneDrive HLS Vault`, nhập cùng `videoId` và tạo resource cho lesson. Tool không tự tạo database resource để tách riêng bước upload file và bước gắn video vào lesson.

Math Remix hỗ trợ resource `hls_vault` trong lesson. Người quản trị chỉ lưu mã
video ổn định, ví dụ `lesson01`; không lưu URL CDN tạm thời, access token hay
refresh token vào `lesson_resources`.

## Chuẩn bị video

Giữ nguyên cùng một `MEDIA_MASTER_KEY_HEX` khi encode và khi chạy website:

```powershell
$env:MEDIA_MASTER_KEY_HEX="64-hex-characters-or-more"
& D:\onedrive-hls-vault\tools\encode_ffmpeg_hls.ps1 `
  -InputFile "D:\Videos\lesson01.mp4" `
  -VideoId "lesson01"
```

Upload toàn bộ thư mục output `lesson01` vào:

```text
OneDrive/VideoVault/lesson01/
  master.m3u8
  1080p/
  720p/
```

Không upload `key.bin`. Script encode tạo key tạm từ master key rồi xóa thư
mục tạm sau khi hoàn tất.

## Cấu hình website

Đặt các biến server-only trong Vercel/local environment:

```text
ONEDRIVE_HLS_ROOT=VideoVault
MEDIA_MASTER_KEY_HEX=<cùng giá trị dùng khi encode>
```

Website dùng kết nối Microsoft Graph delegated hiện có để đọc folder HLS. Kết
nối Microsoft trước trong trang quản trị nếu chưa có connection hoạt động.

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
