# APIUYTIN product truth

## Purpose

APIUYTIN là lớp hạ tầng danh tính cho các website tích hợp. Website đối tác chuyển người dùng đến APIUYTIN để chọn tài khoản đã được ghi nhớ trên thiết bị, xác nhận chia sẻ hồ sơ, rồi nhận mã ủy quyền một lần qua callback đã đăng ký.

## Người dùng

- Nhà phát triển và đội ngũ vận hành đăng ký dự án, callback URL, Client ID và API key.
- Người dùng cuối chọn tài khoản APIUYTIN trong luồng OAuth của một website đối tác.

## Công việc chính

- Tạo và quản lý dự án tích hợp.
- Dùng Client ID ở bước bắt đầu OAuth.
- Dùng API key ở phía máy chủ để đổi authorization code lấy token và hồ sơ.
- Xem tài liệu, tổng quan người dùng, chính sách bảo mật và điều khoản dịch vụ.
- Cấp lại API key khi cần; key mới chỉ hiển thị một lần.

## Sự thật sản phẩm và ràng buộc

- Endpoint và selector chức năng hiện tại phải tiếp tục hoạt động.
- Hồ sơ trả cho website tích hợp dùng định danh APIUYTIN ổn định, không trả Google subject trực tiếp.
- Không đưa Google access token, refresh token hoặc API key vào trình duyệt tích hợp.
- Giao diện sản phẩm và tài liệu cần dùng tiếng Việt rõ ràng, có khả năng đọc tốt trên 375/390/768/1024/1440px.
- Các thao tác tương tác cần hỗ trợ bàn phím, focus rõ, Escape phù hợp và reduced motion.
- Hệ thống đang chạy trên Cloudflare Pages/Functions và dùng các dịch vụ lưu trữ phía máy chủ hiện có.

## Cam kết thương hiệu

Người dùng yêu cầu một giao diện API provider cao cấp, lấy cảm hứng từ sự tĩnh, rõ và có khoảng thở của các sản phẩm Anthropic/Claude nhưng không sao chép thương hiệu, bố cục độc quyền hay tài sản nhận diện của họ. APIUYTIN giữ logo hiện có và dùng một hệ thống riêng: nền than/giấy ấm, đường kẻ mảnh, điểm nhấn đất nung, kiểu chữ tiếng Việt dễ đọc và mật độ thông tin có chủ đích.

## Định hướng suy ra từ brief

- Màn hình dashboard là nơi vận hành: trạng thái dự án, credential, hành động cấp lại/thu hồi và tạo dự án phải được nhận ra trong vài giây.
- Màn hình tài liệu là nơi đọc: mục lục bám theo, code block dễ sao chép, nội dung dài không vỡ bố cục.
- Màn hình OAuth là nơi quyết định: tên project, domain callback, account đã nhớ, dữ liệu chia sẻ và hai hành động Hủy/Tiếp tục phải có thứ bậc rõ.
- Tín hiệu tin cậy đến từ thông tin cụ thể và trạng thái thật của hệ thống, không từ số liệu marketing tự tạo.

## Ngoài phạm vi

- Không thay đổi contract API, endpoint, cơ chế lưu trữ credential hoặc luồng OAuth trong lần cải tiến giao diện này.
- Không cài thêm plugin/skill, không đưa secret vào source hoặc tài liệu trình duyệt.
