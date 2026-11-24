---
name: APIUYTIN Registry Desk
description: Giao diện hạ tầng danh tính tiếng Việt, tĩnh, rõ và có mật độ vận hành cao.
colors:
  ink: "#1e3b58"
  ink-soft: "#5f7b99"
  surface: "#e5f2fe"
  surface-card: "#ffffff"
  paper: "#eaf4ff"
  paper-soft: "#fff0f6"
  accent-blue: "#8fc7ee"
  accent-blue-deep: "#4f91c5"
  accent-pink: "#f1aec9"
  accent-pink-deep: "#b9678e"
  success: "#16845b"
  success-soft: "#e8f7f0"
  warning: "#a16805"
  danger: "#cf3f59"
  text-primary: "#1e3b58"
  text-secondary: "#5f7b99"
  text-muted: "#8da6bf"
typography:
  display:
    fontFamily: "Anthropic Sans, anthropicSans, DM Sans, Noto Sans, sans-serif"
    fontSize: "clamp(39px, 11.5vw, 70px)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.055em"
  body:
    fontFamily: "Anthropic Sans, anthropicSans, DM Sans, Noto Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Anthropic Mono, anthropicMono, Noto Sans Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "7px"
  md: "11px"
  lg: "15px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "42px"
  section: "clamp(72px, 8vw, 112px)"
components:
  button-primary:
    backgroundColor: "{colors.accent-blue-deep}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "0 18px"
  surface-card:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.md}"
    padding: "24px"
---

# Design System: APIUYTIN Registry Desk

## Overview

**Creative North Star: "Bàn đăng ký danh tính"**

APIUYTIN dùng một không gian vận hành sáng và thoáng: nền xanh pastel chuyển dần sang hồng pastel, đường kẻ mảnh và xanh lá làm tín hiệu lựa chọn. Cảm giác tham chiếu tinh thần của các sản phẩm AI provider cao cấp nhưng nhận diện vẫn là APIUYTIN: logo hiện có, nội dung tiếng Việt, thông tin cụ thể và các hành động thật của nền tảng.

Hệ thống ưu tiên sự rõ ràng hơn trang trí. Dashboard hiển thị trạng thái và hành động; tài liệu dùng reading rail ổn định; chooser đặt quyết định đồng ý/hủy lên trước. Chiều sâu đến từ các lớp nền và bóng trung tính có độ lệch, không từ glow hoặc gradient chữ.

**Key Characteristics:**

- Một stack Anthropic-style cho toàn bộ UI tiếng Việt, với DM Sans/Noto Sans làm fallback có dấu.
- Mono chỉ dùng cho code, URL, ID, trạng thái kỹ thuật và thời gian.
- Xanh pastel là màu hành động chính, hồng pastel là vùng nhấn, xanh lá nhạt dành cho active/focus.
- Scrollbar mảnh 4px, focus ring rõ, reduced motion được tôn trọng.

## Colors

Palette dùng xanh pastel và hồng pastel làm nền; xanh pastel là tín hiệu hành động chính; xanh lá, cam và đỏ dành cho active, cảnh báo và lỗi.

### Primary

- **Xanh pastel** (#8fc7ee): nền hành động, vùng điều hướng và highlight nhẹ.
- **Xanh pastel đậm** (#4f91c5): nút chính, liên kết hành động và marker của route.
- **Hồng pastel** (#f1aec9): vùng nhấn và trạng thái landing.

### Secondary

- **Xanh lá active** (#16845b): tab đang chọn, focus và dữ liệu hợp lệ.
- **Xanh lá mềm** (#e8f7f0): nền của tab active và trạng thái thành công.
- **Hổ phách cảnh báo** (#a16805): cảnh báo cần đọc.
- **Đỏ lỗi** (#cf3f59): thu hồi, lỗi và hành động nguy hiểm.

### Neutral

- **Xanh nền** (#eaf4ff): nền ứng dụng và vùng chuyển sắc.
- **Xanh surface** (#e5f2fe): rail và bề mặt phụ.
- **Bề mặt trắng** (#ffffff): panel nổi nhẹ.
- **Hồng góc phải** (#fff0f6): vùng nhấn nền.
- **Chữ chính** (#1e3b58): nội dung quan trọng.
- **Chữ phụ** (#5f7b99): mô tả và nội dung hỗ trợ.

### Named Rules

**The Signal Scarcity Rule.** Xanh lá chỉ xuất hiện khi người dùng cần nhận biết active, focus hoặc thành công; không dùng làm trang trí nền.

## Typography

**Display Font:** Anthropic Sans / anthropicSans (nếu hệ thống có), sau đó DM Sans, Noto Sans và system sans fallback

**Body Font:** Anthropic Sans / anthropicSans (nếu hệ thống có), sau đó DM Sans, Noto Sans và system sans fallback

**Label/Mono Font:** Anthropic Mono / anthropicMono (nếu hệ thống có), sau đó Noto Sans Mono

**Character:** Stack Anthropic-style giữ nhịp chữ gọn, thân thiện và rõ ở mật độ cao; DM Sans và Noto Sans đảm bảo fallback có dấu tiếng Việt. Mono được giữ trong phạm vi kỹ thuật để phân biệt dữ liệu máy với ngôn ngữ sản phẩm.

### Hierarchy

- **Display** (600, `clamp(39px, 11.5vw, 70px)`, 1.02): hero dashboard và chooser.
- **Headline** (600, `clamp(28px, 3.5vw, 50px)`, 1.15): đầu section và tài liệu.
- **Title** (600, 16–22px, 1.3): card, project và nhóm nội dung.
- **Body** (400, 15–17px, 1.6–1.75): mô tả, hướng dẫn; tài liệu giữ measure khoảng 65–75ch.
- **Label** (600, 11–12px, 1.4, mono): URL, code, ID, trạng thái và nhãn phụ.

### Named Rules

**The Vietnamese First Rule.** Font chính phải đọc tốt dấu tiếng Việt; mono không được dùng làm giọng văn mặc định.

## Layout

Dashboard dùng rail trái 224px ở desktop, top command bar 68px và vùng nội dung tối đa 1280px. Dưới 1180px rail thu gọn còn 76px; dưới 768px rail trở thành bottom dock và drawer hiện có. Hero dùng hai cột với copy trước, code surface sau; mobile xếp dọc.

Tài liệu dùng reading rail khoảng 232px và content column rộng, sidebar bám theo ở desktop rồi trở thành thanh mục lục ngang ở tablet/mobile. Các surface giữ khoảng thở 72–112px giữa section; controls có chiều cao tối thiểu 44px.

## Elevation & Depth

Mặc định là các lớp màu phẳng và đường kẻ hairline. Bóng chỉ dùng cho dialog, terminal surface, drawer và dock để biểu thị lớp nổi thật; không dùng colored glow hoặc shadow không có độ lệch.

### Shadow Vocabulary

- **Low:** `0 2px 12px rgba(0, 0, 0, 0.2)`: hover nhẹ và controls nổi.
- **Medium:** `0 18px 44px rgba(0, 0, 0, 0.28)`: terminal, dock và surface vận hành.
- **High:** `0 30px 80px rgba(0, 0, 0, 0.42)`: dialog và drawer.

### Named Rules

**The Tonal Depth Rule.** Nếu có thể diễn đạt chiều sâu bằng đổi tone hoặc hairline, không thêm shadow.

## Shapes

Góc bo nhỏ và ổn định: 7px cho control, 11px cho panel/card, 15px cho surface lớn. Border 1px, không dùng border accent dày. Các account option, project card và code block dùng cùng ngôn ngữ góc và đường kẻ.

## Components

### Buttons

- **Shape:** góc gọn 7–9px, cao tối thiểu 44px.
- **Primary:** xanh pastel đậm, chữ trắng, không gradient.
- **Hover / Focus:** đổi tone, bóng trung tính rất nhẹ, focus ring xanh lá 2px với offset 3px.
- **Secondary / Ghost:** nền trong, border trung tính, hover chuyển sang surface phụ.

### Cards / Containers

- **Corner Style:** 11px cho card, 15px cho dialog lớn.
- **Background:** surface card trên nền app; light mode dùng paper/surface trắng ấm.
- **Shadow Strategy:** flat-by-default, chỉ nâng lớp khi có tác vụ/modal.
- **Border:** hairline theo `--workspace-line` hoặc `--border-default`.
- **Internal Padding:** 16–28px tùy mật độ.

### Inputs / Fields

- **Style:** nền surface phụ, border 1px, góc 8–11px, chữ theo stack Anthropic-style.
- **Focus:** border terracotta và focus ring rõ.
- **Error / Disabled:** dùng danger hoặc muted state, giữ label và recovery message cụ thể.

### Navigation

Rail desktop dùng nhãn tiếng Việt và icon SVG một nét; item active dùng xanh lá nhạt cùng marker 2px. Tablet thu gọn rail; mobile dùng dock/drawer hiện có, không thay đổi route hoặc selector.

### Identity route marker

Một đường dọc mảnh và node tròn nhỏ nối project detail, flow steps và consent context. Nó là dấu hiệu định hướng, không thay thế bảng dữ liệu hay control chuẩn.

## Do's and Don'ts

### Do:

- **Do** dùng tiếng Việt rõ ràng cho mọi nhãn người dùng nhìn thấy.
- **Do** để Client ID, API key, callback URL và code dùng mono để quét nhanh.
- **Do** giữ focus, Escape, reduced motion và responsive 375/768/1024/1440px.
- **Do** dùng icon SVG nhất quán, không dùng emoji làm icon.
- **Do** coi API key là dữ liệu nhạy cảm và chỉ hiển thị theo đúng contract hiện có.

### Don't:

- **Don't** nhúng hoặc sao chép font độc quyền, logo hay tài sản Claude; giao diện chỉ ưu tiên family Anthropic nếu thiết bị đã có và dùng DM Sans/Noto Sans fallback có giấy phép rõ ràng.
- **Don't** dùng gradient chữ, glow màu, shadow cứng hoặc nền kính như trang trí.
- **Don't** biến code, ledger hoặc terminal thành costume thay cho navigation/control chuẩn.
- **Don't** đổi ID, name, data attribute, endpoint hoặc form contract chỉ vì mục tiêu thẩm mỹ.
