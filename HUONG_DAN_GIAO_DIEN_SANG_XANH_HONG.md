# Hướng dẫn tái tạo giao diện sáng xanh–hồng của hệ thống 10A1

## 1. Phạm vi

Tài liệu này mô tả giao diện sáng hiện tại của hệ thống điểm danh học sinh lớp 10A1.

Mục tiêu là để một AI khác có thể tái tạo đúng ngôn ngữ hình ảnh, bố cục và hành vi trực quan.

Tài liệu chỉ nói về frontend visual system: HTML, CSS, component presentation, responsive và accessibility.

Tài liệu không sửa backend, API, authentication, authorization, QR, token, điểm danh hoặc chống gian lận.

Mọi đoạn code trong tài liệu là code minh họa, không chứa secret và không phải bản sao đầy đủ của ứng dụng.

Khi áp dụng, phải đối chiếu source hiện tại trước khi thay đổi bất kỳ hook hoặc component nào.

## 2. Nguồn giao diện đã đối chiếu

index.html là HTML shell chính.

styles.css là nguồn token, màu, layout, component và responsive chính.

src/app.source.js là nguồn render view, landing, skeleton, theme và navigation.

src/pwa.source.js là nguồn hành vi PWA và install prompt phụ.

pwa.css là CSS cho lớp PWA trên mobile.

docs.html và docs.css là giao diện tài liệu độc lập.

policy.html, terms-of-service.html, offline.html và 404.html là các trang phụ độc lập.

directweb/index.html, directweb/style.css và directweb/animation.css là nhánh giao diện riêng.

dist/app.js là artifact sinh ra, không phải nơi nên sửa tay.

Nếu muốn đổi UI, ưu tiên sửa source chính rồi chạy quy trình build khi task cho phép.

## 3. Quy tắc không thay đổi logic

Không đổi ID initial-skeleton.

Không đổi ID public-view.

Không đổi ID app-shell.

Không đổi ID page-content.

Không đổi ID toast-region.

Không đổi ID modal-root.

Không đổi href đăng nhập /api/auth/login.

Không đổi callback OAuth.

Không đổi route điểm danh public.

Không đổi route share public.

Không đưa secret vào HTML, CSS hoặc JS trình duyệt.

Không hard-code email để quyết định quyền.

Không đưa QR token vào code minh họa.

Không hiển thị fingerprint, IP hoặc session nội bộ trong UI public.

Không dùng CSS để cấp quyền.

Không dùng animation để giả lập thành công API.

Không sửa generated artifact trực tiếp.

## 4. Tóm tắt visual identity

Nền sáng đi từ xanh pastel nhạt ở vùng trái sang xanh pha tím ở trung tâm.

Càng tiến về góc trên phải, màu nền càng pha hồng pastel.

Bề mặt card là trắng hoặc trắng hơi trong.

Chữ chính là xanh navy dịu.

Chữ phụ là xanh xám.

Màu xanh pastel là màu hành động chính.

Màu hồng pastel là màu nhấn và màu landing.

Xanh lá nhạt là màu active tab và thành công.

Cam là màu rotate hoặc hành động cần chú ý.

Đỏ là màu danger, logout, error hoặc xóa.

Button và nav item thường là pill hai đầu tròn.

Card dữ liệu dày dùng hình chữ nhật bo góc 16px.

Skeleton card dùng chữ nhật bo góc để phân biệt trạng thái loading.

Landing page nhẹ, tập trung và ít chữ.

App shell nhiều thông tin hơn nhưng vẫn giữ khoảng thở.

## 5. Tỉ lệ màu

Xanh pastel khoảng 65 phần trăm là định hướng cảm nhận, không phải phép tính diện tích CSS bắt buộc.

Hồng pastel khoảng 35 phần trăm là vùng nhấn, đặc biệt ở góc trên phải và landing action.

Trắng khoảng 5 phần trăm là vùng card, input và topbar tạo độ sạch.

Không cố tô đúng phần trăm bằng cách tăng bão hòa màu.

Nếu giao diện quá xanh, tăng vùng hồng mờ ở decoration.

Nếu giao diện quá hồng, giảm opacity decoration trước khi đổi text.

Màu chữ phải ưu tiên contrast hơn tỷ lệ trang trí.

## 6. Bảng token sáng chính xác

--ink là #1e3b58.

--muted là #5f7b99.

--faint là #8da6bf.

--line là #cfe2f2.

--paper là #ffffff.

--canvas là #eaf4ff.

--purple là #8fc7ee và thực tế đóng vai trò xanh pastel.

--purple-deep là #4f91c5.

--purple-soft là #e5f2fe.

--pink là #f1aec9.

--pink-deep là #b9678e.

--pink-soft là #ffe8f1.

--primary-ink là #17466a.

--orange là #f97316.

--orange-soft là #fff1e8.

--green là #16845b.

--green-soft là #e8f7f0.

--red là #cf3f59.

--red-soft là #ffedf0.

--yellow là #a16805.

--yellow-soft là #fff8df.

--navy là #386987.

--shadow là 0 16px 48px rgba(62,119,166,.12).

--shadow-sm là 0 4px 18px rgba(62,119,166,.08).

--radius là 999px.

--skeleton-base là #d5e9f8.

--skeleton-highlight là #f7fcff.

--font-brand là Lobster Two.

--font-body là Google Sans Flex.

--font-code trong source vẫn dùng Google Sans Flex.

## 7. Khai báo token mẫu

~~~css
:root {
  --ink: #1e3b58;
  --muted: #5f7b99;
  --faint: #8da6bf;
  --line: #cfe2f2;
  --paper: #ffffff;
  --canvas: #eaf4ff;
  --purple: #8fc7ee;
  --purple-deep: #4f91c5;
  --purple-soft: #e5f2fe;
  --pink: #f1aec9;
  --pink-deep: #b9678e;
  --pink-soft: #ffe8f1;
  --primary-ink: #17466a;
  --orange: #f97316;
  --green: #16845b;
  --red: #cf3f59;
  --navy: #386987;
  --shadow: 0 16px 48px rgba(62,119,166,.12);
  --shadow-sm: 0 4px 18px rgba(62,119,166,.08);
  --radius: 999px;
  --skeleton-base: #d5e9f8;
  --skeleton-highlight: #f7fcff;
  --font-brand: "Lobster Two", cursive;
  --font-body: "Google Sans Flex", sans-serif;
}
~~~

Dùng token thay vì lặp lại hex trong từng selector.

Tên token purple được giữ để tương thích source nhưng giá trị là xanh pastel.

Nếu thêm token mới, ưu tiên tên semantic như action-danger hoặc status-success.

## 8. Nền sáng

Body dùng nền gradient tuyến tính cố định.

Gradient bắt đầu bằng #eaf4ff ở phía trái.

Màu xanh giữ đến khoảng 48 phần trăm.

Vùng giữa pha #f0eefa ở khoảng 64 phần trăm.

Màu hồng rõ dần từ khoảng 82 phần trăm.

Điểm cuối có thể là #fff0f6.

Nền cố định khi cuộn tạo cảm giác mặt phẳng liên tục.

Không đặt gradient riêng trên mọi card.

Không đặt gradient vào input.

Ví dụ:

~~~css
html,
body {
  min-height: 100%;
}

body {
  background:
    linear-gradient(
      135deg,
      #eaf4ff 0%,
      #eaf4ff 48%,
      #f0eefa 64%,
      #f9e7f1 82%,
      #fff0f6 100%
    );
  background-attachment: fixed;
  color: var(--ink);
}
~~~

## 9. Font

Brand dùng Lobster Two.

Body dùng Google Sans Flex.

Font có dấu tiếng Việt phải load đúng.

Tên thương hiệu dùng cỡ vừa, không chiếm hết header.

Heading dùng body font đậm hoặc brand khi đúng ngữ cảnh.

Metadata dùng body font nhỏ hơn và muted.

Không dùng quá nhiều font family.

Không dùng font brand cho bảng dữ liệu.

Ví dụ:

~~~css
body {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.5;
}

.brand-name {
  font-family: var(--font-brand);
  font-size: 23.4px;
  line-height: 1;
}
~~~

## 10. Reset

Tất cả phần tử dùng box-sizing border-box.

html có min-width 320px.

Button, input, select và textarea kế thừa font.

Ảnh và SVG display block.

Ảnh có max-width 100 phần trăm.

Overflow ngang toàn cục được kiểm soát nhưng bảng có wrapper cuộn riêng.

Không xóa outline focus mà không có thay thế.

~~~css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  min-width: 320px;
}

body,
button,
input,
select,
textarea {
  font: inherit;
}

img,
svg {
  display: block;
  max-width: 100%;
}
~~~

## 11. Cấu trúc HTML shell

Skeleton phải tồn tại trước vùng app.

Toast region nằm ngoài page content.

Public view tách khỏi app shell.

App shell gồm sidebar và main content.

Main content gồm topbar và page content.

Mobile nav là vùng riêng.

Modal root nằm cuối body.

~~~html
<body>
  <div id="initial-skeleton" class="initial-skeleton"
       aria-busy="true"></div>
  <div id="toast-region" class="toast-region"
       aria-live="polite"></div>
  <main id="public-view" class="public-view"></main>
  <div id="app-shell" class="app-shell hidden">
    <aside id="sidebar" class="sidebar"></aside>
    <main id="main-content" class="main-content">
      <header class="topbar"></header>
      <section id="page-content" class="page-content"></section>
    </main>
  </div>
  <div id="mobile-react-nav-root"></div>
  <div id="modal-root"></div>
</body>
~~~

Không xóa hook DOM mà source render đang dùng.

## 12. Landing page

Landing chỉ hiển thị khi chưa có session app hợp lệ.

Logo và tên 10A1 nằm góc trên trái.

Theme toggle nằm góc trên phải.

Khối đăng nhập ở trung tâm.

Dòng nhắc đăng nhập nằm trên hành động.

Google button là circle 58x58 chỉ có biểu tượng G nhìn thấy.

QR scan button là pill dài có SVG QR.

Landing không cần card trắng lớn bao toàn bộ viewport.

Landing cần có khoảng thở và gradient nhìn được.

~~~html
<main class="public-page public-landing-minimal">
  <a class="public-brand" href="/" aria-label="Trang chủ 10A1">
    <img class="public-brand-logo" src="/logo.png"
         alt="" width="48" height="48">
    <span class="public-brand-name">10A1</span>
  </a>
  <button class="theme-toggle" type="button"
          aria-label="Đổi giao diện sáng tối">
    <svg aria-hidden="true" viewBox="0 0 24 24"></svg>
  </button>
  <section class="public-login-focus"
           aria-labelledby="landing-title">
    <h1 id="landing-title">
      Bạn cần đăng nhập để tiếp tục sử dụng phần mềm.
    </h1>
    <div class="public-login-actions">
      <a class="public-google-button" href="/api/auth/login"
         aria-label="Tiếp tục với Google">
        <svg aria-hidden="true" viewBox="0 0 24 24"></svg>
      </a>
      <a class="public-scan-button" href="/diemdanh">
        <svg aria-hidden="true" viewBox="0 0 24 24"></svg>
        <span>Quét mã QR không cần đăng nhập</span>
      </a>
    </div>
  </section>
</main>
~~~

## 13. CSS landing

public-page chiếm tối thiểu toàn viewport.

Padding ngang dùng clamp.

Pseudo-element tạo vùng xanh và hồng mờ.

Pseudo-element không nhận pointer event.

Landing có isolation để nội dung nằm trên decoration.

Brand absolute ở góc.

Focus area có max-width.

~~~css
.public-page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  padding: 28px clamp(20px, 5vw, 72px);
  isolation: isolate;
}

.public-page::before,
.public-page::after {
  position: absolute;
  z-index: -1;
  border-radius: 50%;
  content: "";
  pointer-events: none;
  filter: blur(8px);
}

.public-page::before {
  top: -160px;
  right: -120px;
  width: 520px;
  height: 520px;
  background: rgba(241, 174, 201, .30);
}

.public-page::after {
  bottom: -120px;
  left: -100px;
  width: 340px;
  height: 340px;
  background: rgba(143, 199, 238, .30);
}

.public-landing-minimal {
  display: grid;
  min-height: 100vh;
  place-items: center;
  padding: 24px;
}

.public-brand {
  position: absolute;
  top: 24px;
  left: 24px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--ink);
  text-decoration: none;
}

.public-brand-logo {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.public-brand-name {
  font-family: var(--font-brand);
  font-size: 23.4px;
}

.public-login-focus {
  width: min(100%, 640px);
  text-align: center;
}
~~~

## 14. Google button

Google button là link vì nó dẫn tới login endpoint.

Nút có nền trắng.

Nút có border line nhẹ.

Nút có shadow nhỏ.

Nút tròn 58x58.

SVG G khoảng 28x28.

Text dài có thể ẩn bằng CSS nhưng aria-label vẫn đủ.

Hover chỉ nâng nhẹ.

~~~css
.public-google-button {
  display: inline-grid;
  width: 58px;
  height: 58px;
  place-items: center;
  flex: 0 0 58px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  box-shadow: var(--shadow-sm);
  transition: transform .2s ease, box-shadow .2s ease;
}

.public-google-button svg {
  width: 28px;
  height: 28px;
}

.public-google-button:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
~~~

Không đổi href login khi chỉ đổi hình thức button.

## 15. QR scan button

QR scan button là action dài.

Button có min-height khoảng 72px ở landing.

Button có border-radius 999px.

Nền là pink-soft.

Chữ là pink-deep.

Icon QR giữ kích thước 24px.

Button width dùng min và max để không tràn.

~~~css
.public-scan-button {
  display: inline-flex;
  min-width: min(100%, 330px);
  min-height: 72px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 14px 24px;
  border: 1px solid var(--pink);
  border-radius: 999px;
  background: var(--pink-soft);
  color: var(--pink-deep);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: transform .2s ease, background .2s ease;
}

.public-scan-button:hover {
  transform: translateY(-2px);
  background: #ffdce9;
}

.public-scan-button svg {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
}
~~~

## 16. Landing mobile

Mobile giữ brand ở góc trái.

Theme toggle không che brand.

Khối action có thể xếp dọc.

Google button vẫn tròn 58x58.

QR button gần toàn chiều ngang.

Hai bên viewport chừa ít nhất 16px.

~~~css
@media (max-width: 760px) {
  .public-page {
    padding: 20px 16px;
  }

  .public-brand {
    top: 18px;
    left: 16px;
  }

  .public-login-focus {
    padding-top: 64px;
  }

  .public-login-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .public-scan-button {
    width: min(100%, 340px);
  }
}
~~~

## 17. Welcome notice

Welcome notice nằm ở landing.

Nội dung chính lớn hơn dòng tác giả.

Dòng tác giả là chữ nhỏ.

Nút đóng có aria-label.

Trạng thái đã xem do session hoặc cookie theo logic source quyết định.

CSS không tự hiển thị lại notice.

Không dùng notice thay toast API.

## 18. Landing skeleton

Landing skeleton phải có brand skeleton góc trái.

Có prompt skeleton trung tâm.

Có circle skeleton 58px cho Google.

Có pill skeleton cho scan QR.

Skeleton landing không dùng sidebar.

Skeleton phải có aria-busy.

Skeleton bị ẩn sau render thật.

~~~html
<div id="initial-skeleton"
     class="initial-skeleton"
     data-skeleton-layout="landing"
     aria-busy="true">
  <div class="landing-skeleton-brand">
    <span class="skeleton skeleton-circle"></span>
    <span class="skeleton skeleton-brand-word"></span>
  </div>
  <div class="landing-skeleton-center">
    <span class="skeleton skeleton-line skeleton-prompt"></span>
    <span class="skeleton skeleton-circle skeleton-google"></span>
    <span class="skeleton skeleton-pill skeleton-scan"></span>
  </div>
</div>
~~~

## 19. App skeleton

App skeleton có sidebar desktop 254px.

App skeleton có topbar 74px.

App skeleton có các card rectangular.

App skeleton không giống landing skeleton.

Skeleton bám bố cục view đích để giảm layout shift.

~~~html
<div class="app-skeleton" data-skeleton-layout="app">
  <aside class="app-skeleton-sidebar"></aside>
  <main class="app-skeleton-main">
    <div class="app-skeleton-topbar"></div>
    <div class="app-skeleton-content">
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    </div>
  </main>
</div>
~~~

## 20. Skeleton shimmer

Skeleton base là xanh nhạt.

Highlight là gần trắng.

Background size 220 phần trăm.

Animation dài khoảng 1.45 giây.

Theo giao diện hiện tại, shimmer skeleton vẫn chạy dù reduce motion.

Animation trang trí khác nên tôn trọng reduce motion.

~~~css
.skeleton {
  background:
    linear-gradient(
      105deg,
      var(--skeleton-base) 25%,
      var(--skeleton-highlight) 50%,
      var(--skeleton-base) 75%
    );
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.45s linear infinite;
}

@keyframes skeleton-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}
~~~

## 21. App shell

App shell là flex ngang.

Sidebar sticky rộng khoảng 254px.

Main content flex còn lại.

Main content phải có min-width 0.

~~~css
.app-shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  display: flex;
  width: 254px;
  min-height: 100vh;
  flex: 0 0 254px;
  flex-direction: column;
  padding: 26px 16px 18px;
  background:
    linear-gradient(160deg, #d9effc 0%, #c5e3f7 100%);
}

.main-content {
  min-width: 0;
  flex: 1;
}
~~~

## 22. Sidebar brand

Sidebar brand gồm logo và tên 10A1.

Dòng phụ Member operations nhỏ hơn nếu source còn hiển thị.

Brand link quay về trang chính.

Logo tròn, không méo.

Tên ngắn giúp sidebar gọn.

~~~html
<a class="sidebar-brand" href="/" aria-label="Trang chủ 10A1">
  <img class="sidebar-logo" src="/logo.png"
       alt="" width="48" height="48">
  <span class="sidebar-brand-copy">
    <strong>10A1</strong>
    <small>Member operations</small>
  </span>
</a>
~~~

## 23. Sidebar nav

Nav item PC là pill.

Nav item có SVG và label.

Active tab nền green pastel.

Active tab chữ green đậm.

Focus tab cũng nhìn thấy green focus.

Tổng quan dùng house SVG trên PC.

Owner-only item phải do render guard kiểm soát.

CSS không cấp quyền.

~~~css
.nav-item {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  text-align: left;
}

.nav-item.active,
.nav-item:focus-visible {
  background: #d2f3df;
  color: #246a47;
  box-shadow: 0 6px 16px rgba(47, 143, 96, .12);
}
~~~

## 24. Topbar

Topbar cao khoảng 74px trên desktop.

Topbar nền trắng trong suốt.

Topbar có border dưới nhẹ.

Topbar có theme toggle, notification theo quyền, user card và logout.

Không để quá nhiều action cạnh nhau ở mobile.

~~~css
.topbar {
  display: flex;
  height: 74px;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 clamp(16px, 3vw, 36px);
  border-bottom: 1px solid rgba(207, 226, 242, .85);
  background: rgba(255, 255, 255, .78);
  backdrop-filter: blur(14px);
}
~~~

## 25. User glass card

User card chứa avatar, tên, email hoặc chức vụ.

Nền trắng trong suốt.

Border xanh nhạt.

Radius pill.

Shadow nhẹ.

Backdrop blur chỉ là enhancement.

Nội dung vẫn phải đọc được nếu backdrop-filter không hỗ trợ.

~~~css
.topbar-user-card {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 6px 7px;
  border: 1px solid rgba(207, 226, 242, .95);
  border-radius: 999px;
  background: rgba(255, 255, 255, .70);
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(14px);
}

.topbar-user-card .avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
}
~~~

## 26. Logout

Logout là action nguy hiểm nên màu đỏ.

Logout dạng pill.

Chữ trắng.

Focus rõ.

Hover nhẹ.

Không đặt logout trắng vì dễ bị nhầm với user card.

~~~css
.topbar-logout {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  padding: 9px 15px;
  border: 1px solid var(--red);
  border-radius: 999px;
  background: var(--red);
  color: #fff;
  font-weight: 700;
}
~~~

## 27. Mobile navbar

Sidebar ẩn dưới 760px.

Mobile nav fixed ở đáy.

Mobile nav có blur.

Mobile nav có safe area.

Cell rộng tối thiểu khoảng 76px.

Page content phải chừa padding bottom.

~~~css
@media (max-width: 760px) {
  .sidebar {
    display: none;
  }

  .mobile-nav {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 40;
    display: flex;
    min-height: 64px;
    overflow-x: auto;
    padding-bottom: env(safe-area-inset-bottom);
    border-top: 1px solid rgba(207, 226, 242, .9);
    background: rgba(255, 255, 255, .88);
    backdrop-filter: blur(16px);
  }

  .mobile-nav-item {
    position: relative;
    min-width: 76px;
    min-height: 64px;
  }
}
~~~

## 28. Mobile focus orb

Orb là circle 45x45.

Orb có border đen mỏng 1px.

Orb nền green pastel.

Orb trượt bằng transition left.

Label nằm thấp hơn khoảng 7px theo source.

Active item không cần background riêng nếu orb đã hiện.

~~~css
.mobile-nav-focus {
  position: absolute;
  top: 6px;
  left: 50%;
  width: 45px;
  height: 45px;
  border: 1px solid #111;
  border-radius: 50%;
  background: #d2f3df;
  transform: translateX(-50%);
  transition:
    left .58s cubic-bezier(.22, 1, .36, 1),
    opacity .24s ease;
  will-change: left;
  pointer-events: none;
}
~~~

JavaScript thay đổi left, CSS tạo chuyển động.

## 29. Card system

Card chung có nền paper.

Card chung có line border.

Card chung có shadow.

Card chung có radius pill theo token.

Card dữ liệu dùng radius 16px.

Skeleton dùng radius 16px.

Public attendance dùng radius 16px.

Public share dùng radius 16px.

Attendance page card dùng radius 16px.

Không dùng pill cho bảng nhiều dòng.

~~~css
.card {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--paper);
  box-shadow: var(--shadow-sm);
}

.card--rectangular,
.attendance-page .card,
.public-attendance-card,
.public-share-card {
  border-radius: 16px;
}
~~~

## 30. Card thành viên

Member card hiển thị avatar, tên, email, lớp, role, permission và status theo view.

Toolbar có search và filter.

Danh sách nhiều cột có thể cuộn ngang.

Card compact giữ radius 16px.

Action quản trị chỉ render khi quyền cho phép.

Email dài phải wrap hoặc ellipsis.

Không hiển thị member directory ở overview nếu overview đang là hướng dẫn.

## 31. Card sự kiện

Event card hiển thị tên, thời gian, số buổi và status theo dữ liệu.

Nút share là action phụ.

Nút xóa là danger.

Status badge không quá đậm.

Grid nhiều card chuyển một cột ở mobile.

Form tạo event là card riêng.

## 32. Card điểm danh

Attendance card ưu tiên QR box.

QR box nền trắng và 222x222 ở desktop.

Countdown gần code.

Swap xanh lớn nằm gần dòng creator.

Rotate cam là nút riêng.

Close action rõ.

Attendance grid desktop hai cột.

Mobile xếp một cột.

~~~css
.attendance-grid {
  display: grid;
  grid-template-columns: .9fr 1.1fr;
  gap: 18px;
}

.qr-box {
  display: grid;
  width: 222px;
  height: 222px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
}

.attendance-swap-button {
  width: 52px;
  height: 52px;
  border: 1px solid var(--green);
  border-radius: 50%;
  background: var(--green);
  color: #fff;
}
~~~

## 33. Card tên điểm danh

Tên điểm danh là danh sách submission.

Mỗi nhóm sự kiện là card chữ nhật.

Mỗi dòng có tên và timestamp.

Timestamp ghi rõ giây, phút, giờ, ngày, tháng, năm.

Nút xóa list nằm ở header card khi quyền cho phép.

Form thêm thủ công có label.

Không hiển thị device hash hoặc dữ liệu nội bộ.

## 34. Card cài đặt

Account settings có profile card.

Avatar preview tròn.

Input và select nền trắng.

Save là primary blue.

Cancel là secondary.

Form card dùng 16px.

Grid hai cột PC, một cột mobile.

## 35. Card phân quyền

Role card chứa tên role và permission rows.

Màu xanh lá có thể biểu diễn allowed nhưng phải có chữ.

Nút giáng chức dùng arrow nếu chức năng đó tồn tại.

Nút xóa dùng trash, không dùng trash thay cho giáng chức.

Owner-only controls chỉ render khi backend state cho phép.

Card role là rectangle 16px.

## 36. Card quyền lực hóa

Power roles có nhóm built-in và custom.

Mỗi role có cấp, tên và action.

Action nguy hiểm tách khỏi action thông thường.

Không làm bảng quá rộng trên mobile.

Card chữ nhật giúp đọc nhiều dòng.

## 37. Card nhật ký

Audit là bảng trong card chữ nhật.

Header có title và filter nếu có.

Bảng có overflow ngang ở mobile.

Timestamp không co quá nhỏ.

Action có thể wrap.

Empty state không chỉ hiển thị header bảng.

## 38. Form controls

Input có nền trắng.

Border input là line xanh nhạt.

Focus input có outline.

Input public min-height khoảng 48px.

Input form khoảng 44px.

Input radius 11px.

Label ở trên input.

Error gần field.

Không dùng placeholder thay label.

~~~css
.form-field {
  display: grid;
  gap: 7px;
}

.form-field label {
  color: var(--ink);
  font-weight: 700;
}

.form-field input,
.form-field select,
.form-field textarea {
  width: 100%;
  min-height: 44px;
  padding: 10px 13px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: #fff;
  color: var(--ink);
}
~~~

## 39. Button system

Button inline-flex.

Min-height desktop khoảng 38px.

Padding ngang khoảng 15px.

Radius 999px.

Primary xanh pastel.

Secondary trắng.

Pink là accent.

Orange là rotate.

Danger là red.

Icon-only button cần aria-label.

Hover chỉ nâng nhẹ.

## 40. Focus ring

Focus visible chung màu hồng pha đỏ nhẹ.

Focus nav màu green pastel.

Focus có outline offset.

Không xóa focus.

~~~css
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 3px solid rgba(185, 103, 142, .38);
  outline-offset: 2px;
}

.nav-item:focus-visible,
.mobile-nav-item:focus-visible {
  outline: 3px solid rgba(47, 143, 96, .34);
}
~~~

## 41. Toast

Toast fixed góc trên phải.

Toast success nền xanh lá, chữ trắng.

Toast error nền đỏ, chữ trắng.

Toast width tối đa khoảng 360px.

Toast mobile có margin.

Toast có aria-live.

Toast không hiển thị stack trace.

~~~css
.toast-region {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 100;
  display: grid;
  width: min(360px, calc(100vw - 36px));
  gap: 10px;
}

.toast {
  padding: 12px 14px;
  border-radius: 16px;
  box-shadow: var(--shadow);
  color: #fff;
  font-weight: 700;
}

.toast.success {
  background: #16a34a;
}

.toast.error {
  background: #dc2626;
}
~~~

## 42. Modal welcome

Modal có role dialog.

Modal có aria-modal.

Modal có heading.

Author nhỏ hơn.

Close button có label.

Modal card nền paper.

Backdrop đủ tối.

Không dùng modal cho mọi thông báo nhỏ.

## 43. Theme

Theme key là ntb-skill-club-theme.

Giá trị dark hoặc light.

Mặc định light nếu không có dark.

Theme đặt trên documentElement data-theme.

Theme toggle không gọi backend.

Theme toggle không đổi quyền.

Attendance view có rule ép light trong source hiện tại; không tự xóa nếu chưa có yêu cầu.

~~~js
const THEME_KEY = "ntb-skill-club-theme";

function readTheme() {
  return localStorage.getItem(THEME_KEY) === "dark"
    ? "dark"
    : "light";
}

function applyTheme(theme, persist) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  if (persist) {
    localStorage.setItem(THEME_KEY, next);
  }
}
~~~

## 44. Dark theme

Dark theme chuyển paper và canvas tối.

Text chuyển sáng.

Active nav vẫn green.

Toast success vẫn green/white.

Toast error vẫn red/white.

Landing brand và title sáng.

Google button vẫn trắng để nhận diện.

QR box có thể giữ trắng để QR tương phản.

Không làm dark thành gradient neon.

~~~css
html[data-theme="dark"] {
  --ink: #f4f8fb;
  --muted: #a9bfd0;
  --faint: #7f99ad;
  --line: #263743;
  --paper: #000;
  --canvas: #000;
}
~~~

## 45. Responsive breakpoints

Breakpoint chính là 760px.

Các vùng phụ có thể dùng 560px, 420px, 380px và 768px.

Kiểm tra viewport 320, 360, 390, 430, 560, 760, 768, 1024 và 1440px.

Không dùng breakpoint theo model điện thoại cụ thể.

Ưu tiên clamp và fluid sizing.

## 46. Public attendance

Public attendance có public nav.

Card nhập tên là rectangle 16px.

Input tối thiểu 48px.

Submit button rộng.

Event title rõ.

Start time rõ.

Không hiển thị admin data.

Expired state là card thông báo.

~~~css
.public-attendance-card {
  width: min(100%, 520px);
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--paper);
  box-shadow: var(--shadow);
}

.public-attendance-card input {
  min-height: 48px;
  font-size: 16px;
}

.public-attendance-card .submit {
  width: 100%;
}
~~~

## 47. Public share

Share card là rectangle 16px.

Hiển thị tên event.

Hiển thị thời gian cần thiết.

Hiển thị danh sách tên.

Hiển thị timestamp.

Không hiển thị email.

Không hiển thị role.

Không hiển thị member ID.

Không hiển thị session ID.

Không hiển thị token, device hash, fingerprint hoặc IP.

Route có no-store và noindex theo logic hiện tại.

~~~css
.public-share-list-row {
  display: grid;
  grid-template-columns: 30px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid var(--line);
}

@media (max-width: 560px) {
  .public-share-list-row {
    grid-template-columns: 26px 1fr;
  }

  .public-share-list-row time {
    grid-column: 2;
  }
}
~~~

## 48. Mobile page cards

Mobile page cards thường có override pill trong source legacy.

Các card dữ liệu có selector cụ thể để giữ radius 16px.

Không dùng một rule mobile global để đổi mọi card thành pill.

Attendance report, event, settings, role, audit và public cards cần kiểm tra riêng.

Skeleton luôn rectangular.

## 49. PWA

PWA install prompt là lớp phụ.

Prompt không phải landing core.

Prompt mặc định ẩn cho tới khi điều kiện mobile phù hợp.

Prompt không được che bottom nav.

PWA polling version không phải visual identity.

Không sửa PWA khi chỉ sửa landing.

## 50. Accessibility

Mỗi icon button có aria-label.

Mỗi input có label.

Icon cạnh text có aria-hidden.

Logo decorative có alt rỗng nếu chữ brand kế bên.

Skeleton có aria-busy.

Toast có aria-live.

Nav active có aria-current.

Dialog có role và modal.

Không dùng màu là tín hiệu duy nhất.

Focus ring phải thấy được.

Keyboard phải thao tác được.

## 51. Performance

Logo có width và height.

Font load có preconnect nếu source đã dùng.

Skeleton paint trước data.

Gradient chỉ vài lớp.

Shadow không quá nặng trên list dài.

Backdrop blur là enhancement.

Không tạo request logo lặp.

Không tạo interval không clear.

Không tạo listener trùng.

Không render hàng nghìn node không cần thiết.

## 52. Tổ chức CSS

Token ở đầu file.

Reset sau token.

Global focus sau reset.

Button và card sau reset.

Shell sau component chung.

Public và skeleton sau shell.

Page-specific sau component chung.

Responsive ở cuối hoặc module rõ.

Dark theme và exception phải dễ tìm.

Không dùng !important tùy tiện.

## 53. Tổ chức render

publicView dựng landing.

registrationView dựng form profile.

renderShell dựng app shell.

renderPage chọn view.

renderAttendance dựng host QR.

renderAttendanceReport dựng danh sách tên.

renderEvents dựng event cards.

renderSettings dựng settings.

renderPowerRoles dựng role cards.

renderAudit dựng audit.

renderPublicAttendanceLayout dựng public attendance.

renderPublicSharePage dựng share page.

showInitialSkeleton và hideInitialSkeleton quản lý loading.

applyTheme và toggleTheme quản lý theme.

Không gộp API mutation vào render-only function.

## 54. Navigation

Desktop nav item là pill.

Mobile nav item có orb.

Tổng quan có house icon PC.

Label mobile hạ xuống khoảng 7px.

Orb mobile 45x45.

Orb có viền 1px đen.

Orb trượt từ vị trí cũ tới vị trí mới.

Không dịch chuyển tức thời nếu muốn animation.

Không đổi màu active theo animation.

## 55. Code mẫu mobile orb

~~~js
function moveMobileFocus(orb, activeItem) {
  if (!orb || !activeItem) return;
  const center = activeItem.offsetLeft + activeItem.offsetWidth / 2;
  orb.style.left = center + "px";
  orb.setAttribute("aria-hidden", "true");
}
~~~

Transition ở CSS, không dùng setTimeout để giả lập.

## 56. Code mẫu skeleton

~~~js
function setSkeletonLayout(layout) {
  const skeleton = document.querySelector("#initial-skeleton");
  if (!skeleton) return;
  skeleton.dataset.skeletonLayout =
    layout === "app" ? "app" : "landing";
  skeleton.setAttribute("aria-busy", "true");
}

function hideSkeleton() {
  const skeleton = document.querySelector("#initial-skeleton");
  if (!skeleton) return;
  skeleton.setAttribute("aria-busy", "false");
  skeleton.hidden = true;
}
~~~

Source thật có thể dùng class khác nhưng contract phải tương đương.

## 57. Code mẫu toast

~~~js
function renderToast(kind, message) {
  const region = document.querySelector("#toast-region");
  if (!region) return;
  const toast = document.createElement("div");
  toast.className =
    "toast " + (kind === "success" ? "success" : "error");
  toast.setAttribute("role", "status");
  toast.textContent = message;
  region.appendChild(toast);
  window.setTimeout(function () {
    toast.remove();
  }, 4200);
}
~~~

Không dùng hàm mẫu này để thay helper production nếu source đã có.

## 58. Code mẫu public attendance

~~~html
<main class="public-page public-attendance-page">
  <section class="public-attendance-card">
    <p class="eyebrow">ĐIỂM DANH</p>
    <h1>Nhập tên để điểm danh</h1>
    <p class="muted">Hoạt động lớp 10A1</p>
    <form>
      <div class="form-field">
        <label for="attendance-name">Họ và tên</label>
        <input id="attendance-name" name="name"
               autocomplete="name">
      </div>
      <button class="button submit" type="submit">
        Gửi điểm danh
      </button>
    </form>
  </section>
</main>
~~~

Không đưa device identity vào form visible.

## 59. Code mẫu share card

~~~html
<article class="public-share-card">
  <p class="eyebrow">DANH SÁCH ĐIỂM DANH</p>
  <h1>Hoạt động lớp 10A1</h1>
  <ol class="public-share-list">
    <li class="public-share-list-row">
      <span aria-hidden="true">1</span>
      <span>Nguyễn Văn A</span>
      <time datetime="2026-10-13T08:00:00+07:00">
        08:00:00 · 13/10/2026
      </time>
    </li>
  </ol>
</article>
~~~

Tên và thời gian là dữ liệu public-safe giả lập.

## 60. Visual checklist cơ bản

Landing light PC.

Landing light mobile.

Landing dark PC.

Landing dark mobile.

App shell PC.

App shell mobile.

Sidebar active.

Mobile orb.

Topbar glass.

Logout red.

Member rectangle.

Event rectangle.

Attendance rectangle.

Report rectangle.

Settings rectangle.

Role rectangle.

Audit rectangle.

Public attendance rectangle.

Public share rectangle.

Skeleton landing.

Skeleton app.

## 61. Audit source bằng graph

Khi chưa biết project, gọi list_projects.

Sau đó gọi get_architecture.

Dùng search_graph tìm render function.

Dùng trace_call_path tìm caller và callee.

Dùng get_code_snippet đọc function.

Dùng search_code cho selector hoặc literal.

Chỉ fallback đọc raw file khi cần chỉnh chính xác.

Graph giúp tránh mô tả renderer cũ nếu source có duplicate function.

## 62. Audit CSS

Đọc root token.

Đọc body background.

Đọc button.

Đọc card.

Đọc compact rectangular overrides.

Đọc shell.

Đọc public.

Đọc skeleton.

Đọc mobile query.

Đọc dark theme.

Đọc toast.

Đọc các rule cuối file vì cascade có thể override rule đầu.

## 63. Anti-pattern

Không biến mọi card thành pill.

Không biến mọi button thành gradient.

Không dùng pink-light làm body text.

Không dùng black shadow nặng.

Không thêm chart live nếu sản phẩm đã bỏ.

Không khôi phục chat, call hoặc Firebase Messaging.

Không làm Google button thành text dài trên mobile.

Không làm landing thành marketing page nặng.

Không sửa backend trong task UI.

Không sửa generated artifact bằng tay.

## 64. Quy trình cho AI khác

Đọc tài liệu này.

Đọc AGENTS.md.

Đọc source map.

Chụp baseline nếu được phép.

Tìm selector bằng graph.

Xác định desktop và mobile.

Xác định light và dark.

Tạo patch nhỏ.

Kiểm tra focus.

Kiểm tra skeleton.

Kiểm tra không đổi route.

Kiểm tra không đổi quyền.

Báo cáo file thay đổi.

## 65. Mẫu prompt giao việc

Giữ nguyên backend và logic.

Chỉ sửa phạm vi UI được nêu.

Giữ palette xanh pastel, hồng pastel, trắng.

Giữ card dữ liệu rectangular 16px.

Giữ button pill.

Giữ active nav green pastel.

Giữ Google button circle 58x58.

Giữ QR scan button pill.

Giữ landing skeleton.

Giữ app skeleton.

Kiểm tra PC, mobile, light và dark.

Không đưa secret hoặc dữ liệu thật vào ví dụ.

## 66. Ma trận page

Overview là trang hướng dẫn điểm danh.

Members là directory.

Attendance là host QR và scanner.

Attendance report là danh sách tên.

Events là event cards.

Account settings là profile form.

Power roles là role cards.

Audit là activity table.

Public attendance là form không cần login.

Public share là danh sách event public-safe.

Landing là login và QR entry.

## 67. Shape map

Logo là circle.

Avatar là circle.

Google action là circle.

Mobile focus là circle.

Button là pill.

Desktop nav item là pill.

QR scan action là pill.

Data card là rounded rectangle.

Form card là rounded rectangle.

QR box là rounded rectangle.

Skeleton card là rounded rectangle.

Toast là rounded rectangle.

Modal là rounded rectangle.

## 68. Color map

Canvas dùng xanh pastel.

Góc phải dùng hồng pastel.

Paper dùng trắng.

Text dùng navy.

Muted dùng blue gray.

Primary dùng blue pastel.

Accent dùng pink.

Active dùng green pastel.

Success dùng green/white.

Error dùng red/white.

Rotate dùng orange.

Danger dùng red.

Warning dùng yellow.

Skeleton dùng pale blue và white.

## 69. Spacing map

Brand desktop top 24.

Brand desktop left 24.

Brand mobile top 18.

Brand mobile left 16.

Sidebar top 26.

Sidebar horizontal 16.

Topbar desktop 74.

Topbar mobile 64.

Nav cell 76.

Focus orb 45.

Card gap 16 đến 24.

Public card padding 24.

Page bottom bù nav.

## 70. Typography map

Brand Lobster Two.

Body Google Sans Flex.

Brand 23.4px.

Public form heading khoảng 24px.

Page heading 24 đến 32px.

Card heading 18 đến 22px.

Metadata 13 đến 14px.

Button 15 đến 16px.

Input public 16px.

Không dùng all caps cho đoạn dài.

## 71. Motion map

Skeleton shimmer 1.45s linear.

Button hover lift nhỏ.

Orb slide .58s cubic-bezier .22,1,.36,1.

Toast enter nhẹ.

Modal enter nhẹ.

No heavy parallax.

No transform lớn.

No animation để biểu diễn security state.

Giữ shimmer theo yêu cầu source.

## 72. Privacy presentation map

Public attendance chỉ cần tên và trạng thái cần thiết.

Share chỉ cần event, names và timestamp.

Không lộ email.

Không lộ role.

Không lộ member ID.

Không lộ session ID.

Không lộ QR token.

Không lộ device hash.

Không lộ fingerprint.

Không lộ IP.

## 73. Acceptance criteria

Palette khớp.

Gradient khớp.

Font khớp.

Landing khớp.

Google button khớp.

QR button khớp.

Sidebar khớp.

Topbar khớp.

Active green khớp.

Mobile orb khớp.

Cards rectangle khớp.

Skeleton khớp.

Toast khớp.

Public form khớp.

Share card khớp.

No logic change.

## 74. Báo cáo UI-only

Ghi phạm vi.

Ghi file đọc.

Ghi file sửa.

Ghi selector đổi.

Ghi viewport kiểm tra.

Ghi theme kiểm tra.

Ghi accessibility kiểm tra.

Ghi build có hoặc không.

Ghi deploy có hoặc không.

Ghi phần chưa kiểm tra.

Nếu chỉ tạo tài liệu, ghi rõ source code không đổi.

## 75. Kết luận

Giao diện sáng 10A1 lấy xanh pastel làm nền.

Hồng pastel xuất hiện dần về góc trên phải.

Trắng tạo bề mặt sạch.

Navy tạo chữ dễ đọc.

Green pastel đánh dấu active.

Button dùng pill.

Card dữ liệu dùng chữ nhật 16px.

Landing gọn và tập trung.

App shell rõ.

Mobile có orb focus trượt mượt.

Skeleton riêng cho từng bố cục.

Toast success và error có semantic color.

Public page chỉ hiển thị dữ liệu an toàn.

Tài liệu này là baseline để AI khác tái tạo visual parity.



## 76. Bộ loop test visual theo nhóm và viewport

Bài 1: nhóm landing, mục brand, kiểm tra trong viewport desktop 1440px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 2: nhóm shell, mục sidebar, kiểm tra trong viewport desktop 1440px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 3: nhóm cards, mục global card, kiểm tra trong viewport desktop 1440px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 4: nhóm attendance, mục QR box, kiểm tra trong viewport desktop 1440px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 5: nhóm forms, mục label, kiểm tra trong viewport desktop 1440px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 6: nhóm mobile, mục breakpoint, kiểm tra trong viewport desktop 1440px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 7: nhóm theme, mục light root, kiểm tra trong viewport desktop 1440px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 8: nhóm a11y, mục landmark, kiểm tra trong viewport desktop 1440px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 9: nhóm performance, mục font, kiểm tra trong viewport desktop 1440px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 10: nhóm review, mục graph, kiểm tra trong viewport desktop 1440px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 11: nhóm landing, mục theme toggle, kiểm tra trong viewport desktop 1024px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 12: nhóm shell, mục sidebar brand, kiểm tra trong viewport desktop 1024px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 13: nhóm cards, mục member card, kiểm tra trong viewport desktop 1024px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 14: nhóm attendance, mục code label, kiểm tra trong viewport desktop 1024px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 15: nhóm forms, mục input, kiểm tra trong viewport desktop 1024px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 16: nhóm mobile, mục bottom nav, kiểm tra trong viewport desktop 1024px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 17: nhóm theme, mục dark root, kiểm tra trong viewport desktop 1024px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 18: nhóm a11y, mục heading, kiểm tra trong viewport desktop 1024px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 19: nhóm performance, mục logo, kiểm tra trong viewport desktop 1024px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 20: nhóm review, mục architecture, kiểm tra trong viewport desktop 1024px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 21: nhóm landing, mục prompt, kiểm tra trong viewport tablet 768px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 22: nhóm shell, mục nav item, kiểm tra trong viewport tablet 768px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 23: nhóm cards, mục event card, kiểm tra trong viewport tablet 768px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 24: nhóm attendance, mục countdown, kiểm tra trong viewport tablet 768px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 25: nhóm forms, mục select, kiểm tra trong viewport tablet 768px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 26: nhóm mobile, mục cell width, kiểm tra trong viewport tablet 768px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 27: nhóm theme, mục canvas, kiểm tra trong viewport tablet 768px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 28: nhóm a11y, mục label, kiểm tra trong viewport tablet 768px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 29: nhóm performance, mục gradient, kiểm tra trong viewport tablet 768px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 30: nhóm review, mục render path, kiểm tra trong viewport tablet 768px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 31: nhóm landing, mục Google circle, kiểm tra trong viewport mobile 430px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 32: nhóm shell, mục active nav, kiểm tra trong viewport mobile 430px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 33: nhóm cards, mục attendance card, kiểm tra trong viewport mobile 430px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 34: nhóm attendance, mục creator line, kiểm tra trong viewport mobile 430px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 35: nhóm forms, mục textarea, kiểm tra trong viewport mobile 430px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 36: nhóm mobile, mục orb size, kiểm tra trong viewport mobile 430px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 37: nhóm theme, mục paper, kiểm tra trong viewport mobile 430px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 38: nhóm a11y, mục aria-label, kiểm tra trong viewport mobile 430px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 39: nhóm performance, mục shadow, kiểm tra trong viewport mobile 430px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 40: nhóm review, mục selector, kiểm tra trong viewport mobile 430px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 41: nhóm landing, mục QR pill, kiểm tra trong viewport mobile 390px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 42: nhóm shell, mục topbar, kiểm tra trong viewport mobile 390px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 43: nhóm cards, mục report card, kiểm tra trong viewport mobile 390px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 44: nhóm attendance, mục swap green, kiểm tra trong viewport mobile 390px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 45: nhóm forms, mục focus, kiểm tra trong viewport mobile 390px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 46: nhóm mobile, mục orb border, kiểm tra trong viewport mobile 390px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 47: nhóm theme, mục ink, kiểm tra trong viewport mobile 390px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 48: nhóm a11y, mục aria-current, kiểm tra trong viewport mobile 390px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 49: nhóm performance, mục blur, kiểm tra trong viewport mobile 390px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 50: nhóm review, mục cascade, kiểm tra trong viewport mobile 390px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 51: nhóm landing, mục gradient, kiểm tra trong viewport mobile 320px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 52: nhóm shell, mục glass user card, kiểm tra trong viewport mobile 320px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 53: nhóm cards, mục settings card, kiểm tra trong viewport mobile 320px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 54: nhóm attendance, mục rotate orange, kiểm tra trong viewport mobile 320px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 55: nhóm forms, mục error text, kiểm tra trong viewport mobile 320px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 56: nhóm mobile, mục orb transition, kiểm tra trong viewport mobile 320px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 57: nhóm theme, mục muted, kiểm tra trong viewport mobile 320px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 58: nhóm a11y, mục aria-busy, kiểm tra trong viewport mobile 320px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 59: nhóm performance, mục skeleton paint, kiểm tra trong viewport mobile 320px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 60: nhóm review, mục media query, kiểm tra trong viewport mobile 320px light; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 61: nhóm landing, mục landing skeleton, kiểm tra trong viewport desktop 1440px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 62: nhóm shell, mục logout, kiểm tra trong viewport desktop 1440px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 63: nhóm cards, mục role card, kiểm tra trong viewport desktop 1440px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 64: nhóm attendance, mục scanner frame, kiểm tra trong viewport desktop 1440px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 65: nhóm forms, mục hint text, kiểm tra trong viewport desktop 1440px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 66: nhóm mobile, mục safe area, kiểm tra trong viewport desktop 1440px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 67: nhóm theme, mục active color, kiểm tra trong viewport desktop 1440px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 68: nhóm a11y, mục aria-live, kiểm tra trong viewport desktop 1440px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 69: nhóm performance, mục listener, kiểm tra trong viewport desktop 1440px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 70: nhóm review, mục scope, kiểm tra trong viewport desktop 1440px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 71: nhóm landing, mục welcome modal, kiểm tra trong viewport mobile 390px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 72: nhóm shell, mục page content, kiểm tra trong viewport mobile 390px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 73: nhóm cards, mục audit card, kiểm tra trong viewport mobile 390px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 74: nhóm attendance, mục close action, kiểm tra trong viewport mobile 390px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 75: nhóm forms, mục submit button, kiểm tra trong viewport mobile 390px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 76: nhóm mobile, mục content offset, kiểm tra trong viewport mobile 390px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 77: nhóm theme, mục toast color, kiểm tra trong viewport mobile 390px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 78: nhóm a11y, mục dialog, kiểm tra trong viewport mobile 390px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 79: nhóm performance, mục timer, kiểm tra trong viewport mobile 390px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 80: nhóm review, mục secret check, kiểm tra trong viewport mobile 390px dark; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 81: nhóm landing, mục mobile stack, kiểm tra trong keyboard focus; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 82: nhóm shell, mục shell skeleton, kiểm tra trong keyboard focus; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 83: nhóm cards, mục public card, kiểm tra trong keyboard focus; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 84: nhóm attendance, mục expired state, kiểm tra trong keyboard focus; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 85: nhóm forms, mục mobile form, kiểm tra trong keyboard focus; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 86: nhóm mobile, mục overflow, kiểm tra trong keyboard focus; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 87: nhóm theme, mục focus color, kiểm tra trong keyboard focus; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 88: nhóm a11y, mục keyboard, kiểm tra trong keyboard focus; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 89: nhóm performance, mục layout shift, kiểm tra trong keyboard focus; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 90: nhóm review, mục handoff, kiểm tra trong keyboard focus; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 91: nhóm landing, mục undefined, kiểm tra trong slow network skeleton; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 92: nhóm shell, mục undefined, kiểm tra trong slow network skeleton; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 93: nhóm cards, mục undefined, kiểm tra trong slow network skeleton; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 94: nhóm attendance, mục undefined, kiểm tra trong slow network skeleton; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 95: nhóm forms, mục undefined, kiểm tra trong slow network skeleton; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 96: nhóm mobile, mục undefined, kiểm tra trong slow network skeleton; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 97: nhóm theme, mục undefined, kiểm tra trong slow network skeleton; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 98: nhóm a11y, mục undefined, kiểm tra trong slow network skeleton; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 99: nhóm performance, mục undefined, kiểm tra trong slow network skeleton; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 100: nhóm review, mục undefined, kiểm tra trong slow network skeleton; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 101: nhóm landing, mục brand, kiểm tra trong long Vietnamese label; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 102: nhóm shell, mục sidebar, kiểm tra trong long Vietnamese label; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 103: nhóm cards, mục global card, kiểm tra trong long Vietnamese label; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 104: nhóm attendance, mục QR box, kiểm tra trong long Vietnamese label; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 105: nhóm forms, mục label, kiểm tra trong long Vietnamese label; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 106: nhóm mobile, mục breakpoint, kiểm tra trong long Vietnamese label; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 107: nhóm theme, mục light root, kiểm tra trong long Vietnamese label; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 108: nhóm a11y, mục landmark, kiểm tra trong long Vietnamese label; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 109: nhóm performance, mục font, kiểm tra trong long Vietnamese label; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 110: nhóm review, mục graph, kiểm tra trong long Vietnamese label; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 111: nhóm landing, mục theme toggle, kiểm tra trong empty state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 112: nhóm shell, mục sidebar brand, kiểm tra trong empty state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 113: nhóm cards, mục member card, kiểm tra trong empty state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 114: nhóm attendance, mục code label, kiểm tra trong empty state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 115: nhóm forms, mục input, kiểm tra trong empty state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 116: nhóm mobile, mục bottom nav, kiểm tra trong empty state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 117: nhóm theme, mục dark root, kiểm tra trong empty state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 118: nhóm a11y, mục heading, kiểm tra trong empty state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 119: nhóm performance, mục logo, kiểm tra trong empty state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 120: nhóm review, mục architecture, kiểm tra trong empty state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 121: nhóm landing, mục prompt, kiểm tra trong error state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 122: nhóm shell, mục nav item, kiểm tra trong error state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 123: nhóm cards, mục event card, kiểm tra trong error state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 124: nhóm attendance, mục countdown, kiểm tra trong error state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 125: nhóm forms, mục select, kiểm tra trong error state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 126: nhóm mobile, mục cell width, kiểm tra trong error state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 127: nhóm theme, mục canvas, kiểm tra trong error state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 128: nhóm a11y, mục label, kiểm tra trong error state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 129: nhóm performance, mục gradient, kiểm tra trong error state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 130: nhóm review, mục render path, kiểm tra trong error state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 131: nhóm landing, mục Google circle, kiểm tra trong success state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 132: nhóm shell, mục active nav, kiểm tra trong success state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 133: nhóm cards, mục attendance card, kiểm tra trong success state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 134: nhóm attendance, mục creator line, kiểm tra trong success state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 135: nhóm forms, mục textarea, kiểm tra trong success state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 136: nhóm mobile, mục orb size, kiểm tra trong success state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 137: nhóm theme, mục paper, kiểm tra trong success state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 138: nhóm a11y, mục aria-label, kiểm tra trong success state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 139: nhóm performance, mục shadow, kiểm tra trong success state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 140: nhóm review, mục selector, kiểm tra trong success state; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 141: nhóm landing, mục QR pill, kiểm tra trong high density list; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 142: nhóm shell, mục topbar, kiểm tra trong high density list; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 143: nhóm cards, mục report card, kiểm tra trong high density list; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 144: nhóm attendance, mục swap green, kiểm tra trong high density list; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 145: nhóm forms, mục focus, kiểm tra trong high density list; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 146: nhóm mobile, mục orb border, kiểm tra trong high density list; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 147: nhóm theme, mục ink, kiểm tra trong high density list; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 148: nhóm a11y, mục aria-current, kiểm tra trong high density list; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 149: nhóm performance, mục blur, kiểm tra trong high density list; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 150: nhóm review, mục cascade, kiểm tra trong high density list; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 151: nhóm landing, mục gradient, kiểm tra trong scrollable table; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 152: nhóm shell, mục glass user card, kiểm tra trong scrollable table; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 153: nhóm cards, mục settings card, kiểm tra trong scrollable table; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 154: nhóm attendance, mục rotate orange, kiểm tra trong scrollable table; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 155: nhóm forms, mục error text, kiểm tra trong scrollable table; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 156: nhóm mobile, mục orb transition, kiểm tra trong scrollable table; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 157: nhóm theme, mục muted, kiểm tra trong scrollable table; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 158: nhóm a11y, mục aria-busy, kiểm tra trong scrollable table; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 159: nhóm performance, mục skeleton paint, kiểm tra trong scrollable table; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 160: nhóm review, mục media query, kiểm tra trong scrollable table; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 161: nhóm landing, mục landing skeleton, kiểm tra trong safe-area device; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 162: nhóm shell, mục logout, kiểm tra trong safe-area device; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 163: nhóm cards, mục role card, kiểm tra trong safe-area device; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 164: nhóm attendance, mục scanner frame, kiểm tra trong safe-area device; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 165: nhóm forms, mục hint text, kiểm tra trong safe-area device; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 166: nhóm mobile, mục safe area, kiểm tra trong safe-area device; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 167: nhóm theme, mục active color, kiểm tra trong safe-area device; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 168: nhóm a11y, mục aria-live, kiểm tra trong safe-area device; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 169: nhóm performance, mục listener, kiểm tra trong safe-area device; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 170: nhóm review, mục scope, kiểm tra trong safe-area device; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 171: nhóm landing, mục welcome modal, kiểm tra trong zoom 200 percent; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 172: nhóm shell, mục page content, kiểm tra trong zoom 200 percent; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 173: nhóm cards, mục audit card, kiểm tra trong zoom 200 percent; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 174: nhóm attendance, mục close action, kiểm tra trong zoom 200 percent; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 175: nhóm forms, mục submit button, kiểm tra trong zoom 200 percent; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 176: nhóm mobile, mục content offset, kiểm tra trong zoom 200 percent; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 177: nhóm theme, mục toast color, kiểm tra trong zoom 200 percent; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 178: nhóm a11y, mục dialog, kiểm tra trong zoom 200 percent; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 179: nhóm performance, mục timer, kiểm tra trong zoom 200 percent; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 180: nhóm review, mục secret check, kiểm tra trong zoom 200 percent; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 181: nhóm landing, mục mobile stack, kiểm tra trong reduced motion; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 182: nhóm shell, mục shell skeleton, kiểm tra trong reduced motion; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 183: nhóm cards, mục public card, kiểm tra trong reduced motion; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 184: nhóm attendance, mục expired state, kiểm tra trong reduced motion; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 185: nhóm forms, mục mobile form, kiểm tra trong reduced motion; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 186: nhóm mobile, mục overflow, kiểm tra trong reduced motion; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 187: nhóm theme, mục focus color, kiểm tra trong reduced motion; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 188: nhóm a11y, mục keyboard, kiểm tra trong reduced motion; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 189: nhóm performance, mục layout shift, kiểm tra trong reduced motion; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 190: nhóm review, mục handoff, kiểm tra trong reduced motion; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 191: nhóm landing, mục undefined, kiểm tra trong refresh after theme change; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 192: nhóm shell, mục undefined, kiểm tra trong refresh after theme change; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 193: nhóm cards, mục undefined, kiểm tra trong refresh after theme change; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 194: nhóm attendance, mục undefined, kiểm tra trong refresh after theme change; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 195: nhóm forms, mục undefined, kiểm tra trong refresh after theme change; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 196: nhóm mobile, mục undefined, kiểm tra trong refresh after theme change; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 197: nhóm theme, mục undefined, kiểm tra trong refresh after theme change; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 198: nhóm a11y, mục undefined, kiểm tra trong refresh after theme change; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 199: nhóm performance, mục undefined, kiểm tra trong refresh after theme change; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.
Bài 200: nhóm review, mục undefined, kiểm tra trong refresh after theme change; xác nhận màu, shape, khoảng cách, focus, không tràn và không thay đổi logic.

## 77. Checklist triển khai lại từng component

Component 1: Landing page phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 1: Landing page phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 1: Landing page không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 1: Landing page phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 2: Landing skeleton phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 2: Landing skeleton phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 2: Landing skeleton không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 2: Landing skeleton phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 3: Google circle phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 3: Google circle phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 3: Google circle không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 3: Google circle phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 4: QR scan pill phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 4: QR scan pill phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 4: QR scan pill không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 4: QR scan pill phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 5: Theme toggle phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 5: Theme toggle phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 5: Theme toggle không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 5: Theme toggle phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 6: Welcome modal phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 6: Welcome modal phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 6: Welcome modal không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 6: Welcome modal phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 7: App shell phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 7: App shell phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 7: App shell không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 7: App shell phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 8: Sidebar brand phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 8: Sidebar brand phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 8: Sidebar brand không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 8: Sidebar brand phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 9: Desktop nav phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 9: Desktop nav phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 9: Desktop nav không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 9: Desktop nav phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 10: Overview nav house phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 10: Overview nav house phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 10: Overview nav house không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 10: Overview nav house phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 11: Topbar phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 11: Topbar phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 11: Topbar không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 11: Topbar phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 12: Glass user card phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 12: Glass user card phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 12: Glass user card không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 12: Glass user card phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 13: Logout button phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 13: Logout button phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 13: Logout button không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 13: Logout button phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 14: Mobile nav phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 14: Mobile nav phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 14: Mobile nav không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 14: Mobile nav phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 15: Mobile focus orb phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 15: Mobile focus orb phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 15: Mobile focus orb không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 15: Mobile focus orb phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 16: Member card phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 16: Member card phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 16: Member card không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 16: Member card phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 17: Event card phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 17: Event card phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 17: Event card không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 17: Event card phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 18: Attendance QR card phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 18: Attendance QR card phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 18: Attendance QR card không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 18: Attendance QR card phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 19: Attendance report card phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 19: Attendance report card phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 19: Attendance report card không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 19: Attendance report card phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 20: Account settings card phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 20: Account settings card phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 20: Account settings card không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 20: Account settings card phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 21: Power roles card phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 21: Power roles card phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 21: Power roles card không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 21: Power roles card phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 22: Audit card phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 22: Audit card phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 22: Audit card không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 22: Audit card phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 23: Public attendance card phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 23: Public attendance card phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 23: Public attendance card không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 23: Public attendance card phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 24: Public share card phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 24: Public share card phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 24: Public share card không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 24: Public share card phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 25: Toast phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 25: Toast phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 25: Toast không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 25: Toast phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 26: Dialog phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 26: Dialog phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 26: Dialog không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 26: Dialog phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 27: Input field phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 27: Input field phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 27: Input field không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 27: Input field phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 28: Select field phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 28: Select field phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 28: Select field không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 28: Select field phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 29: Empty state phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 29: Empty state phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 29: Empty state không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 29: Empty state phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 30: Error state phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 30: Error state phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 30: Error state không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 30: Error state phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 31: Dark theme phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 31: Dark theme phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 31: Dark theme không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 31: Dark theme phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.
Component 32: App skeleton phải dùng token chung, có semantics đúng, có focus rõ, có responsive rule và không thay đổi API.
Component 32: App skeleton phải được kiểm tra ở light desktop, light mobile, dark desktop và dark mobile.
Component 32: App skeleton không được chứa secret, token QR, IP, fingerprint hoặc thông tin quản trị ngoài phạm vi.
Component 32: App skeleton phải có fallback khi font, blur, animation hoặc asset không sẵn sàng.

## 78. Checklist màu chi tiết

Màu kiểm tra 1: nền xanh #eaf4ff phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 1: nền xanh #eaf4ff phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 2: vùng pha tím #f0eefa phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 2: vùng pha tím #f0eefa phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 3: góc hồng #fff0f6 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 3: góc hồng #fff0f6 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 4: paper #ffffff phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 4: paper #ffffff phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 5: ink #1e3b58 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 5: ink #1e3b58 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 6: muted #5f7b99 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 6: muted #5f7b99 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 7: line #cfe2f2 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 7: line #cfe2f2 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 8: primary #8fc7ee phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 8: primary #8fc7ee phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 9: primary deep #4f91c5 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 9: primary deep #4f91c5 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 10: pink #f1aec9 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 10: pink #f1aec9 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 11: pink deep #b9678e phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 11: pink deep #b9678e phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 12: pink soft #ffe8f1 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 12: pink soft #ffe8f1 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 13: green #16845b phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 13: green #16845b phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 14: green soft #e8f7f0 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 14: green soft #e8f7f0 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 15: red #cf3f59 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 15: red #cf3f59 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 16: red soft #ffedf0 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 16: red soft #ffedf0 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 17: orange #f97316 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 17: orange #f97316 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 18: yellow #a16805 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 18: yellow #a16805 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 19: navy #386987 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 19: navy #386987 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 20: skeleton base #d5e9f8 phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 20: skeleton base #d5e9f8 phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 21: skeleton highlight #f7fcff phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 21: skeleton highlight #f7fcff phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 22: focus xanh lá phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 22: focus xanh lá phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 23: toast success xanh lá chữ trắng phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 23: toast success xanh lá chữ trắng phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 24: toast error đỏ chữ trắng phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 24: toast error đỏ chữ trắng phải có contrast phù hợp trong light, dark, hover và focus.
Màu kiểm tra 25: dark text sáng phải giữ đúng vai trò semantic, không bị thay bằng màu tùy ý ở component khác.
Màu kiểm tra 25: dark text sáng phải có contrast phù hợp trong light, dark, hover và focus.

## 79. Checklist shape và khoảng cách

Shape 1: kiểm tra logo circle trên desktop, mobile và dark theme.
Shape 1: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 2: kiểm tra avatar circle trên desktop, mobile và dark theme.
Shape 2: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 3: kiểm tra Google circle 58x58 trên desktop, mobile và dark theme.
Shape 3: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 4: kiểm tra mobile orb 45x45 trên desktop, mobile và dark theme.
Shape 4: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 5: kiểm tra desktop nav pill trên desktop, mobile và dark theme.
Shape 5: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 6: kiểm tra button pill trên desktop, mobile và dark theme.
Shape 6: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 7: kiểm tra QR scan pill trên desktop, mobile và dark theme.
Shape 7: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 8: kiểm tra data card rectangle 16px trên desktop, mobile và dark theme.
Shape 8: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 9: kiểm tra skeleton rectangle 16px trên desktop, mobile và dark theme.
Shape 9: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 10: kiểm tra QR box rectangle 16px trên desktop, mobile và dark theme.
Shape 10: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 11: kiểm tra public form rectangle 16px trên desktop, mobile và dark theme.
Shape 11: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 12: kiểm tra share card rectangle 16px trên desktop, mobile và dark theme.
Shape 12: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 13: kiểm tra sidebar padding 26px 16px trên desktop, mobile và dark theme.
Shape 13: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 14: kiểm tra topbar height 74px trên desktop, mobile và dark theme.
Shape 14: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 15: kiểm tra mobile topbar height 64px trên desktop, mobile và dark theme.
Shape 15: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 16: kiểm tra mobile nav cell 76px trên desktop, mobile và dark theme.
Shape 16: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 17: kiểm tra mobile label offset 7px trên desktop, mobile và dark theme.
Shape 17: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 18: kiểm tra public brand top-left trên desktop, mobile và dark theme.
Shape 18: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 19: kiểm tra landing toggle top-right trên desktop, mobile và dark theme.
Shape 19: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 20: kiểm tra page bottom safe area trên desktop, mobile và dark theme.
Shape 20: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 21: kiểm tra card gap 16px trên desktop, mobile và dark theme.
Shape 21: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 22: kiểm tra grid gap 18px trên desktop, mobile và dark theme.
Shape 22: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 23: kiểm tra public card padding 24px trên desktop, mobile và dark theme.
Shape 23: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 24: kiểm tra QR size 222px trên desktop, mobile và dark theme.
Shape 24: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.
Shape 25: kiểm tra toast margin 18px trên desktop, mobile và dark theme.
Shape 25: nếu sai, sửa selector cụ thể thay vì đổi global card hoặc global button.

## 80. Checklist accessibility và privacy

A11y/privacy 1: xác nhận button icon có aria-label ở mọi view liên quan.
A11y/privacy 1: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 2: xác nhận link brand có accessible name ở mọi view liên quan.
A11y/privacy 2: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 3: xác nhận input có label ở mọi view liên quan.
A11y/privacy 3: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 4: xác nhận nav active có aria-current ở mọi view liên quan.
A11y/privacy 4: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 5: xác nhận skeleton có aria-busy ở mọi view liên quan.
A11y/privacy 5: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 6: xác nhận toast có aria-live ở mọi view liên quan.
A11y/privacy 6: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 7: xác nhận dialog có aria-modal ở mọi view liên quan.
A11y/privacy 7: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 8: xác nhận SVG decorative có aria-hidden ở mọi view liên quan.
A11y/privacy 8: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 9: xác nhận focus-visible có outline ở mọi view liên quan.
A11y/privacy 9: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 10: xác nhận keyboard không bị khóa ở mọi view liên quan.
A11y/privacy 10: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 11: xác nhận màu không phải tín hiệu duy nhất ở mọi view liên quan.
A11y/privacy 11: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 12: xác nhận public page không có email ở mọi view liên quan.
A11y/privacy 12: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 13: xác nhận public page không có role ở mọi view liên quan.
A11y/privacy 13: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 14: xác nhận public page không có member ID ở mọi view liên quan.
A11y/privacy 14: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 15: xác nhận public page không có session ID ở mọi view liên quan.
A11y/privacy 15: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 16: xác nhận public page không có QR token ở mọi view liên quan.
A11y/privacy 16: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 17: xác nhận public page không có device hash ở mọi view liên quan.
A11y/privacy 17: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 18: xác nhận public page không có fingerprint ở mọi view liên quan.
A11y/privacy 18: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 19: xác nhận public page không có IP ở mọi view liên quan.
A11y/privacy 19: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 20: xác nhận source không có secret ở mọi view liên quan.
A11y/privacy 20: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 21: xác nhận sample data dùng example.invalid ở mọi view liên quan.
A11y/privacy 21: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 22: xác nhận UI không quyết định quyền ở mọi view liên quan.
A11y/privacy 22: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 23: xác nhận CSS không gọi API ở mọi view liên quan.
A11y/privacy 23: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 24: xác nhận toast không chứa stack trace ở mọi view liên quan.
A11y/privacy 24: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.
A11y/privacy 25: xác nhận modal trả focus nếu source hỗ trợ ở mọi view liên quan.
A11y/privacy 25: nếu phát hiện thiếu, ghi lỗi UI riêng và không tự sửa backend hoặc authorization.

## 81. Checklist bàn giao

Bàn giao 1: ghi file đã đọc.
Bàn giao 2: ghi file đã sửa.
Bàn giao 3: ghi selector đã đổi.
Bàn giao 4: ghi token đã đổi.
Bàn giao 5: ghi breakpoint đã đổi.
Bàn giao 6: ghi viewport đã kiểm tra.
Bàn giao 7: ghi light đã kiểm tra.
Bàn giao 8: ghi dark đã kiểm tra.
Bàn giao 9: ghi keyboard đã kiểm tra.
Bàn giao 10: ghi reduced motion đã kiểm tra.
Bàn giao 11: ghi skeleton đã kiểm tra.
Bàn giao 12: ghi public page đã kiểm tra.
Bàn giao 13: ghi authenticated page đã kiểm tra.
Bàn giao 14: ghi build status.
Bàn giao 15: ghi deploy status.
Bàn giao 16: ghi phần chưa thể kiểm tra.
Bàn giao 17: xác nhận không đổi backend.
Bàn giao 18: xác nhận không đổi API.
Bàn giao 19: xác nhận không đổi auth.
Bàn giao 20: xác nhận không đổi role.
Bàn giao 21: xác nhận không đổi QR.
Bàn giao 22: xác nhận không đổi điểm danh.
Bàn giao 23: xác nhận không đổi chống gian lận.
Bàn giao 24: xác nhận không lộ secret.
Bàn giao 25: đính kèm file hướng dẫn.

## 82. Kết luận sử dụng

Đây là tài liệu baseline cho giao diện sáng xanh–hồng hiện tại.

AI khác nên dùng token và selector ở tài liệu này như điểm xuất phát, sau đó đối chiếu source mới nhất.

Nếu source thay đổi, phải cập nhật tài liệu để tránh hướng dẫn sai.

Nếu task yêu cầu đổi logic, hãy tách riêng khỏi task UI.

Nếu task yêu cầu đổi layout, hãy giữ route, state, permission và API contract.

Nếu task yêu cầu đổi màu, hãy kiểm tra contrast và dark theme.

Nếu task yêu cầu đổi card, hãy phân biệt shell card với data card.

Nếu task yêu cầu đổi mobile, hãy kiểm tra bottom nav và safe area.

Nếu task yêu cầu đổi loading, hãy giữ skeleton riêng cho landing và app.

Nếu task yêu cầu đổi public page, hãy giữ nguyên privacy boundary.

Tài liệu đã cung cấp token, HTML mẫu, CSS mẫu, JS mẫu, component contract, responsive rule, accessibility rule, performance rule, privacy rule và checklist.

Không nên coi số dòng lớn là thay thế cho review trực quan.

Không nên coi screenshot một viewport là đủ để kết luận parity.

Không nên coi CSS đẹp là đủ nếu keyboard hoặc mobile bị hỏng.

Không nên coi frontend guard là authorization.

Không nên đưa credential vào bất kỳ ví dụ nào.

Khi hoàn thành một thay đổi UI, hãy báo rõ những gì đã thay đổi và những gì cố ý không thay đổi.


