# HƯỚNG DẪN TÍCH HỢP APIUYTIN OAUTH ACCOUNT CHOOSER

> Tài liệu tích hợp chi tiết cho web dùng APIUYTIN làm identity broker.
> Contract hiện tại: OAuth Authorization Code với Account Chooser.
> Production base: `https://apiuytin.pages.dev`.
> API base: `https://apiuytin.pages.dev/api/auth`.
> Tất cả credential trong ví dụ đều là placeholder.

## Mục lục

- Contract hiện hành và hướng dẫn tích hợp chuẩn.
- Credential model.
- Project setup.
- Account Chooser.
- Callback và token exchange.
- Profile và userinfo.
- Endpoint contract.
- Security.
- Async, retry và CAS.
- Migration.
- Ví dụ backend.
- Test và vận hành.

## Contract hiện hành và hướng dẫn tích hợp chuẩn

> Phần này được đối chiếu trực tiếp với các Cloudflare Functions hiện có ngày 08-11-2026. Đây là phần chuẩn cho bên tích hợp. Dùng phần này nếu gặp ví dụ cũ hoặc checklist phía dưới có nội dung khác.

### Mô hình credential

Mỗi project có hai credential:

- <code>clientId</code>: public identifier, giá trị lưu nội bộ bằng field <code>publishKey</code>, thường có tiền tố <code>pk_</code>. Dùng khi mở OAuth và đổi code.
- <code>apiKey</code>: credential server-side, thường có tiền tố <code>CHUOTAPI_</code>. Dùng đổi code, gọi project-info/allusers, hoặc kiểm tra project từ backend.
- API key plaintext chỉ trả trong response tạo project và rotate key. Các endpoint đọc session/project không thể khôi phục API key.
- API key không được đưa vào HTML, browser JavaScript, mobile bundle, query string, localStorage hay client cookie.
- Request token không dùng <code>client_secret</code>. Nếu có property <code>client_secret</code>, endpoint trả <code>invalid_client</code>.

### Chuẩn bị project

1. Owner đăng nhập dashboard APIUYTIN.
2. Tạo project bằng tên và callback HTTPS cố định.
3. Lưu <code>clientId</code> trong cấu hình đúng môi trường.
4. Lưu <code>apiKey</code> từ response tạo project vào secret manager.
5. Triển khai callback route ở backend website tích hợp.
6. Kiểm tra callback do browser gửi và callback khi đổi token dùng cùng một giá trị.
7. Tạo project riêng cho staging và production nếu cần tách quyền.

Payload tạo project qua dashboard API:

~~~json
{
  "name": "Example Web",
  "redirectUri": "https://app.example.com/auth/apiuytin/callback"
}
~~~

<code>redirectUri</code> phải là HTTPS, không có user/password hoặc fragment. APIUYTIN kiểm tra giá trị sau khi parse URL và so khớp callback với project đã đăng ký.

### Bắt đầu login

Bên tích hợp tạo state bằng CSPRNG ở backend, lưu state vào session server-side của browser hiện tại, rồi chuyển browser tới:

~~~text
GET https://apiuytin.pages.dev/oauth/google
    ?client_id=pk_YOUR_CLIENT_ID
    &redirect_uri=https%3A%2F%2Fapp.example.com%2Fauth%2Fapiuytin%2Fcallback
    &state=RANDOM_STATE
~~~

Tạo URL bằng URL API/URLSearchParams, không nối chuỗi thủ công. State nên có ít nhất 128 bit entropy, TTL khoảng 10 phút và record riêng cho từng tab. Không gửi API key trong URL.

APIUYTIN tìm project theo Client ID, yêu cầu project active và so callback với URI đã đăng ký. Sau đó tạo OAuth transaction gắn project, redirect URI, state, device hash và expiry. Transaction sống tối đa 10 phút.

### Account chooser và thiết bị

- APIUYTIN có cookie device tên <code>apiuytin_device</code>, HttpOnly, Secure, SameSite=Lax, Max-Age tối đa 30 ngày.
- Server-side chỉ lưu hash của device token.
- Chooser chỉ liệt kê tài khoản đã được nhớ trên device này.
- Người dùng chọn tài khoản, rồi bấm Tiếp tục để chia sẻ ID APIUYTIN và profile.
- Nếu chưa có account, chọn Thêm tài khoản để xác thực Google, tạo/cập nhật apiUser và liên kết account với device.
- Sau khi thêm account, APIUYTIN quay về transaction consent ban đầu.
- Thiết bị mới hoặc device cookie hết hạn cần xác thực Google để liên kết account vào device.
- Bấm Hủy sẽ redirect về callback với <code>error=access_denied</code> và state ban đầu nếu state đã được gửi.
- Google access/refresh token không được lưu lại làm credential của project và không được trả cho integration.

### Callback: validate và consume state

Callback nhận <code>code</code> hoặc <code>error</code> cùng state. Backend phải:

1. Đọc state và tìm record trong session server-side của browser.
2. Từ chối callback khi state thiếu, không khớp, hết hạn hoặc đã xử lý.
3. Consume/xóa state theo thao tác một lần trước khi hoàn tất login.
4. Nếu <code>error=access_denied</code>, hiển thị hủy đăng nhập và không gọi token endpoint.
5. Nếu không có error thì yêu cầu code dạng string không rỗng.
6. Đổi code từ backend; không chuyển API key xuống browser.
7. Chỉ tạo app session sau khi token response hợp lệ.
8. Redirect 303 tới local path đã whitelist để loại code và state khỏi URL.

Không dùng <code>returnTo</code> tùy ý từ query string. Lưu local path đã lọc vào state record tại lúc bắt đầu flow.

### Token exchange chính xác

Gửi request server-to-server:

~~~http
POST https://apiuytin.pages.dev/api/auth/oauth/token
Content-Type: application/json

{
  "client_id": "pk_YOUR_CLIENT_ID",
  "api_key": "CHUOTAPI_SERVER_SIDE_KEY",
  "code": "ONE_TIME_CODE",
  "redirect_uri": "https://app.example.com/auth/apiuytin/callback"
}
~~~

Response thành công:

~~~json
{
  "access_token": "SIGNED_ACCESS_TOKEN",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "user-apiuytin-id",
    "sub": "user-apiuytin-id",
    "email": "user@example.com",
    "name": "User Name",
    "picture": "https://example.com/avatar.jpg",
    "given_name": "User",
    "family_name": "Name",
    "locale": "vi",
    "verified_email": true
  }
}
~~~

- Code sống tối đa 5 phút, bind project/callback và chỉ đổi một lần.
- API key phải thuộc đúng project, project active, callback phải khớp URI đăng ký.
- <code>client_secret</code> bị từ chối.

Nếu API trả <code>key_rotation_conflict</code> (HTTP 409), rotation khác đã thắng
revision guard; không gửi lại cùng request một cách mù. Nếu OAuth start hoặc
consent trả <code>oauth_unavailable</code> (HTTP 503), bỏ transaction hiện tại,
backoff ngắn rồi tạo state và transaction mới. Với revoke timeout, đọc lại
project trước khi quyết định thao tác tiếp theo vì trạng thái revoked có thể đã
được ghi thành công.
- API key sai, project không active hoặc callback sai trả <code>invalid_client</code> HTTP 401.
- Code sai, hết hạn, đã dùng hoặc không khớp transaction trả <code>invalid_grant</code> HTTP 400.
- JSON hỏng trả <code>invalid_json</code> HTTP 400.
- Token hết hạn sau 3600 giây; contract không cấp refresh token.
- Không retry tự động cùng code sau timeout vì code có thể đã được consume.

### Profile và userinfo

Dùng <code>user.id</code> hoặc <code>user.sub</code> làm định danh APIUYTIN ổn định. Hai trường bằng nhau và không phải Google subject.

| Field | Kiểu | Giá trị khi thiếu |
| --- | --- | --- |
| id | string | Bắt buộc để tích hợp identity |
| sub | string | Cùng giá trị với id |
| email | string | Chuỗi rỗng |
| name | string | Chuỗi rỗng hoặc fallback từ email |
| picture | string | Chuỗi rỗng |
| given_name | string | Chuỗi rỗng |
| family_name | string | Chuỗi rỗng |
| locale | string | Chuỗi rỗng |
| verified_email | boolean | false trừ khi upstream xác nhận true |

Gọi userinfo khi cần xác minh lại profile theo access token:

~~~http
GET https://apiuytin.pages.dev/api/auth/userinfo
Authorization: Bearer SIGNED_ACCESS_TOKEN
~~~

<code>/userinfo</code> trả trực tiếp profile object, không bọc trong property <code>user</code>. Endpoint kiểm tra access token, expiry và project còn active.

### Phân biệt ba loại phiên/token

| Credential | Dùng ở | Mục đích | Thời hạn/ghi chú |
| --- | --- | --- | --- |
| <code>apiuytin_device</code> | Browser trên apiuytin.pages.dev | Nhớ account chooser trên device | Tối đa 30 ngày, HttpOnly |
| <code>apiuytin_session</code> | Owner dashboard APIUYTIN | Quản lý project | Session dashboard mặc định 7 ngày |
| API key project | Backend tích hợp | Token exchange, project-info, allusers | Owner rotate; key cũ bị thay |
| Access token | Backend tích hợp | Gọi userinfo cho end-user | 3600 giây; không có refresh token |

Không dùng API key làm access token userinfo. Không dùng access token owner session để quản lý project. Logout dashboard chỉ xóa <code>apiuytin_session</code>, không xóa tài khoản khỏi device chooser.

### Endpoint và auth

| Method | Path | Quyền cần dùng | Contract |
| --- | --- | --- | --- |
| GET | <code>/api/auth</code> | Public | Discovery |
| GET | <code>/api/auth/health</code> | Public | Health handler |
| GET | <code>/oauth/google</code> | Query client_id/redirect_uri/state | Bắt đầu chooser |
| GET | <code>/oauth/consent</code> | Transaction + device cookie | Hiển thị chooser |
| POST | <code>/oauth/consent</code> | Form consent + device cookie | Continue hoặc cancel |
| POST | <code>/api/auth/oauth/token</code> | JSON client_id/api_key/code/redirect_uri | Đổi code |
| GET | <code>/api/auth/userinfo</code> | Bearer access token | Đọc profile |
| GET | <code>/api/auth/session</code> | Owner cookie | Session dashboard |
| POST | <code>/api/auth/projects</code> | Owner cookie | Tạo project, key một lần |
| GET | <code>/api/auth/projects</code> | Owner cookie | Liệt kê project owner |
| PATCH | <code>/api/auth/projects/:id</code> | Owner cookie | Cập nhật redirectUri |
| POST | <code>/api/auth/projects/:id/rotate-key</code> | Owner cookie | Cấp key một lần |
| POST | <code>/api/auth/projects/:id/revoke</code> | Owner cookie | Thu hồi project |
| GET | <code>/api/auth/project-info</code> | Bearer API key | Đọc thông tin project |
| GET | <code>/api/auth/allusers</code> | Bearer API key | User đã login vào project |
| POST | <code>/api/auth/logout</code> | Owner cookie | Xóa dashboard session |

### Contract project API

- Tạo project nhận <code>{name, redirectUri}</code> camelCase và trả HTTP 201.
- Project response có <code>id</code>, <code>name</code>, <code>clientId</code>, <code>redirectUri</code>, <code>createdAt</code>, <code>status</code>.
- Chỉ response create hoặc rotate có property <code>apiKey</code>.
- GET session/projects và project-info không trả plaintext key hay key hash.
- PATCH project nhận <code>{redirectUri}</code>, kiểm tra owner, validate HTTPS và dùng revision guard.
- Rotate không nhận body. Key mới được lưu dạng hash và trả plaintext một lần.
- Revoke dùng owner cookie, đánh dấu project revoked trước khi cleanup.
- Runtime Pages schedule cleanup bằng <code>waitUntil</code>. Response <code>cleanupScheduled</code> cho biết công việc cleanup được schedule; không phải xác nhận mọi child record đã bị xóa.
- Project info và allusers cần header <code>Authorization: Bearer API_KEY</code>.
- allusers chỉ liệt kê user thuộc đúng project; response có profile fields và first/last login time.

### Retry và concurrency

- APIUYTIN dùng async I/O cho fetch tới Sanity và Google.
- Sanity query được retry tối đa ba attempt trong trường hợp transient 429/5xx/timeout, có delay và jitter.
- Sanity mutation không retry mù.
- Cleanup revoke chia tối đa 50 mutation mỗi request và chạy tối đa sáu chunk đồng thời.
- OAuth transaction/code consume có revision guard để chống race/replay.
- Bên tích hợp nên đặt timeout cho network call, dùng bounded concurrency và không fan-out vô hạn.
- Không thể loại bỏ quota của Google, Sanity hoặc Cloudflare bằng async hoặc thêm luồng.
- Request token có outcome không rõ sau timeout phải dẫn tới login mới, không gửi lại cùng code.
- Create/rotate/revoke có thể có outcome không rõ sau timeout; kiểm tra trạng thái trước khi chạy mutation tiếp theo.

### Code Node tối thiểu cho token exchange

~~~js
async function exchangeApiuytinCode(code, env) {
  const response = await fetch(
    "https://apiuytin.pages.dev/api/auth/oauth/token",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: env.APIUYTIN_CLIENT_ID,
        api_key: env.APIUYTIN_API_KEY,
        code,
        redirect_uri: env.APIUYTIN_REDIRECT_URI
      }),
      signal: AbortSignal.timeout(8000)
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload.error === "string"
      ? payload.error
      : "upstream_error";
    throw new Error("APIUYTIN_" + error);
  }
  if (
    !payload ||
    typeof payload.access_token !== "string" ||
    payload.token_type !== "Bearer" ||
    !payload.user ||
    typeof payload.user.id !== "string"
  ) {
    throw new Error("APIUYTIN_invalid_response");
  }
  return payload;
}
~~~

Hàm trên chỉ chạy ở backend. Caller phải validate và consume state trước khi gọi, rồi tạo app session từ <code>payload.user</code> sau khi exchange thành công.

### Xử lý access_denied và lỗi

- <code>access_denied</code>: người dùng bấm Hủy; không gọi token.
- <code>invalid_client</code>: kiểm tra project, API key, callback, status.
- <code>invalid_grant</code>: code sai/hết hạn/đã dùng; bắt đầu login mới.
- <code>token_expired</code>: yêu cầu người dùng login lại.
- <code>project_revoked</code>: owner đã revoke project; dừng request và báo vận hành.
- <code>invalid_api_key</code>: project API key sai, hết hiệu lực hoặc project không còn active.
- <code>unauthorized</code>: token hoặc owner session thiếu/sai; xác định loại credential endpoint mong đợi.
- Không expose raw upstream exception, API key hoặc access token cho browser.

### Bảo mật ứng dụng tích hợp

- Dùng HTTPS cho toàn bộ production origin và callback.
- State random, gắn session browser, có TTL và chỉ consume một lần.
- API key chỉ ở server environment/secret manager.
- Không log request body token, authorization header, code hoặc cookie.
- Giới hạn return path về local path đã whitelist.
- Regenerate local session ID sau login để chống session fixation.
- Không tạo session khi state, token response hoặc profile validation thất bại.
- Chỉ lưu profile field thực sự cần.
- Dùng APIUYTIN id làm stable user identifier, không dùng Google subject.
- Không coi việc logout app là xóa account chooser device.
- Dùng rate limit/queue bounded cho workload tích hợp.
- Không tự động retry token exchange, rotate key hoặc mutation khi outcome không rõ.

### Checklist nghiệm thu cho integration

- Tạo project và lưu key một lần.
- Login account đã nhớ trên device.
- Login thiết bị mới và thêm account.
- Mở nhiều tab với state độc lập.
- Hủy consent và xác nhận không gọi token.
- Thử state sai, hết hạn và replay.
- Thử redirect URI khác project.
- Thử code sai, hết hạn và replay.
- Xác nhận client_secret bị từ chối.
- Xác nhận profile có đủ 9 field.
- Gọi userinfo với access token và thử token hết hạn.
- Gọi project-info/allusers bằng API key ở backend.
- Rotate key, cập nhật secret store, xác nhận key cũ bị từ chối.
- Revoke project, xác nhận userinfo/project API ngừng hoạt động.
- Kiểm tra log không có key, code, token, cookie hoặc query callback.


## 1. Nguyên tắc bắt buộc

- Web tích hợp chỉ cần client ID và API key.
- Client ID là public project identifier.
- API key là server-side project credential.
- Không dùng client_secret trong token request.
- Google chỉ bootstrap apiUser khi cần.
- Người dùng chọn account APIUYTIN trên device.
- Device session được bảo vệ bằng cookie HttpOnly.
- Device session mặc định có thời hạn 30 ngày.
- Thiết bị mới cần xác thực Google một lần.
- Account đã nhớ không cần mở Google mỗi lần.
- Authorization code chỉ dùng một lần.
- Authorization code có thời hạn ngắn.
- Code bind với project và callback.
- Code consume dùng CAS/revision guard.
- Profile id và sub là APIUYTIN ID.
- Google subject không được trả cho integration.
- Google access token không được lưu.
- Google refresh token không được lưu.
- API key chỉ trả khi tạo hoặc rotate.
- API key hash mới được lưu persistence.
- GET projects không trả API key.
- GET session không trả API key.
- project-info không trả API key.
- Token response không trả API key.
- Callback phải kiểm tra state.
- Redirect URI phải exact và HTTPS.
- Không retry mutation mù.
- Query transient có retry giới hạn.
- Fan-out mutation tối đa concurrency 6.
- Mutation chunk tối đa 50.
## 2. URL cố định

| Tên | Method | URL | Mục đích |
| --- | --- | --- | --- |
| OAuth start | GET | `https://apiuytin.pages.dev/oauth/google` | Mở Account Chooser |
| API base | BASE | `https://apiuytin.pages.dev/api/auth` | API project và token |
| Health | GET | `/api/auth/health` | Health check |
| Discovery | GET | `/api/auth` | Endpoint discovery |
| Userinfo | GET | `/api/auth/userinfo` | Đọc profile |
| Token | POST | `/api/auth/oauth/token` | Đổi code |
| Project info | GET | `/api/auth/project-info` | Kiểm tra project |
| All users | GET | `/api/auth/allusers` | Danh sách login |
| Rotate key | POST | `/api/auth/projects/:id/rotate-key` | Cấp key mới |

## 3. Credential model

```text
{
  "clientId": "pk_EXAMPLE_CLIENT_ID",
  "apiKey": "CHUOTAPI_EXAMPLE_SERVER_KEY",
  "redirectUri": "https://app.example.com/auth/apiuytin/callback"
}
```

- Lưu client ID ở cấu hình integration.
- Lưu API key trong secret manager integration.
- Không đặt API key trong HTML.
- Không đặt API key trong browser JavaScript.
- Không đặt API key trong mobile bundle.
- Không đặt API key trong URL.
- Không đặt API key trong cookie client.
- Không đặt API key trong localStorage.
- Không đặt API key trong analytics.
- Không log Authorization header.
- Không log token request body.
- Không log token response body.
- Không gửi API key sang third-party.
- Không dùng client ID thay API key.
- Không dùng Google secret thay API key.
- Rotate key khi nghi ngờ lộ.
- Mất key không thể đọc lại từ GET projects.
- Owner phải nhận key mới sau rotate.
- Key cũ vô hiệu hóa sau CAS patch.
- Mỗi environment nên có project riêng.
## 4. OAuth flow tổng quát

```text
Integration browser
  -> GET /oauth/google?client_id&redirect_uri&state
APIUYTIN
  -> validate project và callback
  -> ensure device session
  -> create OAuth transaction
  -> render Account Chooser
User
  -> chọn account
  -> bấm Tiếp tục
APIUYTIN
  -> issue one-time code
  -> redirect callback?code=...&state=...
Integration backend
  -> POST /api/auth/oauth/token
  -> nhận access_token và APIUYTIN profile
  -> tạo local session
```

- Browser sinh state bằng nguồn random an toàn.
- Browser lưu state trong session của integration.
- Browser redirect tới APIUYTIN.
- APIUYTIN kiểm tra client ID.
- APIUYTIN kiểm tra callback exact.
- APIUYTIN kiểm tra project active.
- APIUYTIN kiểm tra device record.
- APIUYTIN tạo transaction.
- Chooser hiển thị project name.
- Chooser hiển thị callback host.
- Chooser hiển thị danh sách account.
- Chooser hiển thị dữ liệu chia sẻ.
- Chooser có Add account.
- Chooser có Continue.
- Chooser có Cancel.
- Cancel trả access_denied.
- Continue kiểm tra account thuộc device.
- Continue tạo project user.
- Continue phát code bằng CAS.
- Callback nhận code và state.
- Backend kiểm tra state.
- Backend đổi code bằng API key.
- Backend kiểm tra profile.
- Backend tạo session app.
- Backend xóa code khỏi URL.
- Backend không lưu Google token.
- Backend không trả Google subject.
- Backend xử lý lỗi theo status.
- Backend không retry code đã consume.
- Backend ghi audit không chứa secret.
## 5. GET /api/auth/health

Mục đích: Health service. Authentication: public.

- Trả 200 khi runtime hoạt động.
- Không cần cookie.
- Không cần Bearer.
- Không chứa secret.
- Không chứng minh Google login.
- Không chứng minh Sanity mutation.
- Dùng timeout ngắn.
- Dùng cho uptime.
- Không gọi quá dày.
- Body có ok true.
- Body có service.
- Body có baseUrl.
- Không cache credential.
- Monitor status.
- Alert sau threshold.
- Không dùng làm auth.
- Không gửi API key.
- Không ghi body nhạy cảm.
- Test sau deploy.
- Test custom domain.
- Ở local, với GET /api/auth/health, trả 200 khi runtime hoạt động.; kiểm tra cấu hình trước khi gọi network.
- Ở staging, với GET /api/auth/health, không cần cookie.; giữ secret ở server-side.
- Ở production, với GET /api/auth/health, không cần bearer.; không ghi credential vào log.
- Trong CI, với GET /api/auth/health, không chứa secret.; kiểm tra status code trước khi parse.
- Trong manual QA, với GET /api/auth/health, không chứng minh google login.; dùng timeout có giới hạn.
- Khi request đồng thời, với GET /api/auth/health, không chứng minh sanity mutation.; xử lý lỗi theo contract.
- Khi provider trả 429, với GET /api/auth/health, dùng timeout ngắn.; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx, với GET /api/auth/health, dùng cho uptime.; ghi metric không chứa PII.
- Khi callback bị refresh, với GET /api/auth/health, không gọi quá dày.; giữ correlation ID riêng.
- Khi user mở nhiều tab, với GET /api/auth/health, body có ok true.; chạy lại contract test sau thay đổi.
- Khi key vừa rotate, với GET /api/auth/health, body có service.; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke, với GET /api/auth/health, body có baseurl.; giữ secret ở server-side.
## 6. GET /api/auth

Mục đích: Discovery. Authentication: public.

- Trả danh sách endpoint.
- Có authorize.
- Có token.
- Có userinfo.
- Có project-info.
- Có allusers.
- Có projects.
- Có rotateKey.
- Không trả API key.
- Không trả session.
- Dùng kiểm tra contract.
- Có thể gọi từ monitor.
- Không thay thế docs.
- Không dùng làm permission.
- Kiểm tra status 200.
- Kiểm tra JSON.
- Không log secret.
- Test sau deploy.
- Test deployment URL.
- Test custom domain.
- Khi provider trả 5xx, với GET /api/auth, trả danh sách endpoint.; kiểm tra status code trước khi parse.
- Khi callback bị refresh, với GET /api/auth, có authorize.; dùng timeout có giới hạn.
- Khi user mở nhiều tab, với GET /api/auth, có token.; xử lý lỗi theo contract.
- Khi key vừa rotate, với GET /api/auth, có userinfo.; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke, với GET /api/auth, có project-info.; ghi metric không chứa PII.
- Khi device hết hạn, với GET /api/auth, có allusers.; giữ correlation ID riêng.
- Khi profile thiếu optional field, với GET /api/auth, có projects.; chạy lại contract test sau thay đổi.
- Khi log đang bật debug, với GET /api/auth, có rotatekey.; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment, với GET /api/auth, không trả api key.; giữ secret ở server-side.
- Khi migration dữ liệu cũ, với GET /api/auth, không trả session.; không ghi credential vào log.
- Khi network timeout, với GET /api/auth, dùng kiểm tra contract.; kiểm tra status code trước khi parse.
- Khi CAS conflict, với GET /api/auth, có thể gọi từ monitor.; dùng timeout có giới hạn.
## 7. GET /api/auth/session

Mục đích: Dashboard session. Authentication: dashboard cookie.

- Cookie HttpOnly.
- Cookie Secure.
- Session có expiry.
- Không có session trả user null.
- Projects chỉ của owner.
- Projects chỉ active.
- Project metadata có clientId.
- Không có apiKey.
- Không có apiKeyHash.
- Không có secretKey.
- Không có Google token.
- Không dùng cho end-user.
- Không gửi cookie cross-origin.
- Cache no-store.
- Test logout.
- Test expired cookie.
- Test owner isolation.
- Test reload dashboard.
- Test missing secret.
- Test response contract.
- Khi log đang bật debug, với GET /api/auth/session, cookie httponly.; không retry nghiệp vụ không idempotent.
- Khi rollback deployment, với GET /api/auth/session, cookie secure.; ghi metric không chứa PII.
- Khi migration dữ liệu cũ, với GET /api/auth/session, session có expiry.; giữ correlation ID riêng.
- Khi network timeout, với GET /api/auth/session, không có session trả user null.; chạy lại contract test sau thay đổi.
- Khi CAS conflict, với GET /api/auth/session, projects chỉ của owner.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401, với GET /api/auth/session, projects chỉ active.; giữ secret ở server-side.
- Khi response là 400, với GET /api/auth/session, project metadata có clientid.; không ghi credential vào log.
- Khi response là 200, với GET /api/auth/session, không có apikey.; kiểm tra status code trước khi parse.
- Khi user bấm Hủy, với GET /api/auth/session, không có apikeyhash.; dùng timeout có giới hạn.
- Khi user bấm Thêm account, với GET /api/auth/session, không có secretkey.; xử lý lỗi theo contract.
- Khi user bấm Tiếp tục, với GET /api/auth/session, không có google token.; không retry nghiệp vụ không idempotent.
- Khi chạy stress test, với GET /api/auth/session, không dùng cho end-user.; ghi metric không chứa PII.
## 8. POST /api/auth/projects

Mục đích: Create project. Authentication: dashboard cookie.

- Body JSON.
- Name không rỗng.
- Redirect HTTPS.
- Không credentials.
- Không fragment.
- Sinh client ID.
- Sinh API key.
- Lưu apiKeyHash.
- Lưu owner ID.
- Status active.
- Trả 201.
- Trả key một lần.
- Không lưu plaintext.
- Không retry mù.
- Test invalid JSON.
- Test invalid redirect.
- Test unauthorized.
- Test one-time response.
- Test no key on list.
- Test project owner.
- Khi response là 200, với POST /api/auth/projects, body json.; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy, với POST /api/auth/projects, name không rỗng.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account, với POST /api/auth/projects, redirect https.; giữ secret ở server-side.
- Khi user bấm Tiếp tục, với POST /api/auth/projects, không credentials.; không ghi credential vào log.
- Khi chạy stress test, với POST /api/auth/projects, không fragment.; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP, với POST /api/auth/projects, sinh client id.; dùng timeout có giới hạn.
- Khi kiểm tra keyboard, với POST /api/auth/projects, sinh api key.; xử lý lỗi theo contract.
- Khi kiểm tra mobile, với POST /api/auth/projects, lưu apikeyhash.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy, với POST /api/auth/projects, lưu owner id.; ghi metric không chứa PII.
- Ở local, với POST /api/auth/projects, status active.; giữ correlation ID riêng.
- Ở staging, với POST /api/auth/projects, trả 201.; chạy lại contract test sau thay đổi.
- Ở production, với POST /api/auth/projects, trả key một lần.; kiểm tra cấu hình trước khi gọi network.
## 9. GET /api/auth/projects

Mục đích: List projects. Authentication: dashboard cookie.

- Trả project owner.
- Không trả key.
- Không trả hash.
- Có clientId.
- Có redirectUri.
- Có createdAt.
- Có status.
- Chỉ active.
- Reload không khôi phục key.
- No-store.
- Test owner isolation.
- Test empty list.
- Test revoked hidden.
- Test response fields.
- Không dùng cho OAuth end-user.
- Không dùng để lấy profile.
- Không log secret.
- Test after rotate.
- Test after revoke.
- Test after deploy.
- Khi kiểm tra mobile, với GET /api/auth/projects, trả project owner.; không ghi credential vào log.
- Khi kiểm tra privacy, với GET /api/auth/projects, không trả key.; kiểm tra status code trước khi parse.
- Ở local, với GET /api/auth/projects, không trả hash.; dùng timeout có giới hạn.
- Ở staging, với GET /api/auth/projects, có clientid.; xử lý lỗi theo contract.
- Ở production, với GET /api/auth/projects, có redirecturi.; không retry nghiệp vụ không idempotent.
- Trong CI, với GET /api/auth/projects, có createdat.; ghi metric không chứa PII.
- Trong manual QA, với GET /api/auth/projects, có status.; giữ correlation ID riêng.
- Khi request đồng thời, với GET /api/auth/projects, chỉ active.; chạy lại contract test sau thay đổi.
- Khi provider trả 429, với GET /api/auth/projects, reload không khôi phục key.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 5xx, với GET /api/auth/projects, no-store.; giữ secret ở server-side.
- Khi callback bị refresh, với GET /api/auth/projects, test owner isolation.; không ghi credential vào log.
- Khi user mở nhiều tab, với GET /api/auth/projects, test empty list.; kiểm tra status code trước khi parse.
## 10. PATCH /api/auth/projects/:id

Mục đích: Update callback. Authentication: owner cookie.

- Owner check.
- Project lookup.
- JSON parse.
- HTTPS check.
- Credential check.
- Fragment check.
- Revision guard.
- Unchanged response.
- New redirect response.
- Old callback invalid.
- New callback exact.
- No API key response.
- Test unauthorized.
- Test wrong owner.
- Test invalid URL.
- Test same URL.
- Test race.
- Test slash.
- Test query.
- Test deploy.
- Khi request đồng thời, với PATCH /api/auth/projects/:id, owner check.; xử lý lỗi theo contract.
- Khi provider trả 429, với PATCH /api/auth/projects/:id, project lookup.; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx, với PATCH /api/auth/projects/:id, json parse.; ghi metric không chứa PII.
- Khi callback bị refresh, với PATCH /api/auth/projects/:id, https check.; giữ correlation ID riêng.
- Khi user mở nhiều tab, với PATCH /api/auth/projects/:id, credential check.; chạy lại contract test sau thay đổi.
- Khi key vừa rotate, với PATCH /api/auth/projects/:id, fragment check.; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke, với PATCH /api/auth/projects/:id, revision guard.; giữ secret ở server-side.
- Khi device hết hạn, với PATCH /api/auth/projects/:id, unchanged response.; không ghi credential vào log.
- Khi profile thiếu optional field, với PATCH /api/auth/projects/:id, new redirect response.; kiểm tra status code trước khi parse.
- Khi log đang bật debug, với PATCH /api/auth/projects/:id, old callback invalid.; dùng timeout có giới hạn.
- Khi rollback deployment, với PATCH /api/auth/projects/:id, new callback exact.; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ, với PATCH /api/auth/projects/:id, no api key response.; không retry nghiệp vụ không idempotent.
## 11. POST /api/auth/projects/:id/rotate-key

Mục đích: Rotate key. Authentication: owner cookie.

- Owner only.
- Project active.
- Random new key.
- Hash new key.
- CAS patch.
- Old key invalid.
- New key one-time.
- Session no key.
- Project list no key.
- Project info no key.
- Test unauthorized.
- Test wrong owner.
- Test CAS conflict.
- Test old key.
- Test new key.
- Test timeout policy.
- Test dashboard notice.
- Test secret manager.
- Test audit.
- Test deploy.
- Khi device hết hạn, với POST /api/auth/projects/:id/rotate-key, owner only.; giữ correlation ID riêng.
- Khi profile thiếu optional field, với POST /api/auth/projects/:id/rotate-key, project active.; chạy lại contract test sau thay đổi.
- Khi log đang bật debug, với POST /api/auth/projects/:id/rotate-key, random new key.; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment, với POST /api/auth/projects/:id/rotate-key, hash new key.; giữ secret ở server-side.
- Khi migration dữ liệu cũ, với POST /api/auth/projects/:id/rotate-key, cas patch.; không ghi credential vào log.
- Khi network timeout, với POST /api/auth/projects/:id/rotate-key, old key invalid.; kiểm tra status code trước khi parse.
- Khi CAS conflict, với POST /api/auth/projects/:id/rotate-key, new key one-time.; dùng timeout có giới hạn.
- Khi response là 401, với POST /api/auth/projects/:id/rotate-key, session no key.; xử lý lỗi theo contract.
- Khi response là 400, với POST /api/auth/projects/:id/rotate-key, project list no key.; không retry nghiệp vụ không idempotent.
- Khi response là 200, với POST /api/auth/projects/:id/rotate-key, project info no key.; ghi metric không chứa PII.
- Khi user bấm Hủy, với POST /api/auth/projects/:id/rotate-key, test unauthorized.; giữ correlation ID riêng.
- Khi user bấm Thêm account, với POST /api/auth/projects/:id/rotate-key, test wrong owner.; chạy lại contract test sau thay đổi.
## 12. POST /api/auth/projects/:id/revoke

Mục đích: Revoke project. Authentication: owner cookie. Project được đánh dấu revoked ngay; auth code, project user và transaction được dọn ở background. Revoke response không chờ số document xóa xong.

- Owner only.
- Delete project.
- Delete auth codes.
- Delete project users.
- Delete transactions.
- Chunk max 50.
- Concurrency max 6.
- No unbounded fan-out.
- Project no longer active.
- OAuth start rejected.
- Token rejected.
- Userinfo rejected.
- Test owner.
- Test wrong owner.
- Test cleanup.
- Test large cleanup.
- Test batch limit.
- Test status.
- Test audit.
- Test rollback policy.
- Khi response là 401, với POST /api/auth/projects/:id/revoke, owner only.; giữ secret ở server-side.
- Khi response là 400, với POST /api/auth/projects/:id/revoke, delete project.; không ghi credential vào log.
- Khi response là 200, với POST /api/auth/projects/:id/revoke, delete auth codes.; kiểm tra status code trước khi parse.
- Khi user bấm Hủy, với POST /api/auth/projects/:id/revoke, delete project users.; dùng timeout có giới hạn.
- Khi user bấm Thêm account, với POST /api/auth/projects/:id/revoke, delete transactions.; xử lý lỗi theo contract.
- Khi user bấm Tiếp tục, với POST /api/auth/projects/:id/revoke, chunk max 50.; không retry nghiệp vụ không idempotent.
- Khi chạy stress test, với POST /api/auth/projects/:id/revoke, concurrency max 6.; ghi metric không chứa PII.
- Khi kiểm tra CSP, với POST /api/auth/projects/:id/revoke, no unbounded fan-out.; giữ correlation ID riêng.
- Khi kiểm tra keyboard, với POST /api/auth/projects/:id/revoke, project no longer active.; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile, với POST /api/auth/projects/:id/revoke, oauth start rejected.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy, với POST /api/auth/projects/:id/revoke, token rejected.; giữ secret ở server-side.
- Ở local, với POST /api/auth/projects/:id/revoke, userinfo rejected.; không ghi credential vào log.
## 13. GET /api/auth/project-info

Mục đích: Project metadata. Authentication: Bearer api key.

- Bearer header.
- Hash key.
- Active project.
- Return ID.
- Return name.
- Return clientId.
- Return redirect.
- Return status.
- No plaintext key.
- No key hash.
- Invalid key 401.
- Rotated key old 401.
- New key 200.
- Do not call browser.
- Test header missing.
- Test header malformed.
- Test revoked.
- Test rotate.
- Test no secret fields.
- Test production.
- Khi kiểm tra CSP, với GET /api/auth/project-info, bearer header.; dùng timeout có giới hạn.
- Khi kiểm tra keyboard, với GET /api/auth/project-info, hash key.; xử lý lỗi theo contract.
- Khi kiểm tra mobile, với GET /api/auth/project-info, active project.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy, với GET /api/auth/project-info, return id.; ghi metric không chứa PII.
- Ở local, với GET /api/auth/project-info, return name.; giữ correlation ID riêng.
- Ở staging, với GET /api/auth/project-info, return clientid.; chạy lại contract test sau thay đổi.
- Ở production, với GET /api/auth/project-info, return redirect.; kiểm tra cấu hình trước khi gọi network.
- Trong CI, với GET /api/auth/project-info, return status.; giữ secret ở server-side.
- Trong manual QA, với GET /api/auth/project-info, no plaintext key.; không ghi credential vào log.
- Khi request đồng thời, với GET /api/auth/project-info, no key hash.; kiểm tra status code trước khi parse.
- Khi provider trả 429, với GET /api/auth/project-info, invalid key 401.; dùng timeout có giới hạn.
- Khi provider trả 5xx, với GET /api/auth/project-info, rotated key old 401.; xử lý lỗi theo contract.
## 14. GET /api/auth/allusers

Mục đích: Project users. Authentication: Bearer api key.

- Bearer header.
- Active project.
- Return APIUYTIN ID.
- Return email.
- Return displayName.
- Return avatar.
- Return given_name.
- Return family_name.
- Return locale.
- Return verified_email.
- Return timestamps.
- No Google subject.
- No Google token.
- Invalid key 401.
- Protect PII.
- Test empty.
- Test multiple users.
- Test profile update.
- Test rotation.
- Test revoke.
- Trong CI, với GET /api/auth/allusers, bearer header.; ghi metric không chứa PII.
- Trong manual QA, với GET /api/auth/allusers, active project.; giữ correlation ID riêng.
- Khi request đồng thời, với GET /api/auth/allusers, return apiuytin id.; chạy lại contract test sau thay đổi.
- Khi provider trả 429, với GET /api/auth/allusers, return email.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 5xx, với GET /api/auth/allusers, return displayname.; giữ secret ở server-side.
- Khi callback bị refresh, với GET /api/auth/allusers, return avatar.; không ghi credential vào log.
- Khi user mở nhiều tab, với GET /api/auth/allusers, return given_name.; kiểm tra status code trước khi parse.
- Khi key vừa rotate, với GET /api/auth/allusers, return family_name.; dùng timeout có giới hạn.
- Khi project vừa revoke, với GET /api/auth/allusers, return locale.; xử lý lỗi theo contract.
- Khi device hết hạn, với GET /api/auth/allusers, return verified_email.; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field, với GET /api/auth/allusers, return timestamps.; ghi metric không chứa PII.
- Khi log đang bật debug, với GET /api/auth/allusers, no google subject.; giữ correlation ID riêng.
## 15. POST /api/auth/oauth/token

Mục đích: Exchange code. Authentication: client ID plus api key.

- JSON body.
- client_id required.
- api_key required.
- code required.
- redirect_uri required.
- client_secret rejected.
- Project active.
- Key hash match.
- Redirect exact.
- Code hash lookup.
- Project binding.
- Client binding.
- Redirect binding.
- Expiry check.
- Consumed check.
- CAS consume.
- One success under race.
- Profile response.
- No Google token.
- No Google subject.
- Khi key vừa rotate, với POST /api/auth/oauth/token, json body.; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke, với POST /api/auth/oauth/token, client_id required.; giữ secret ở server-side.
- Khi device hết hạn, với POST /api/auth/oauth/token, api_key required.; không ghi credential vào log.
- Khi profile thiếu optional field, với POST /api/auth/oauth/token, code required.; kiểm tra status code trước khi parse.
- Khi log đang bật debug, với POST /api/auth/oauth/token, redirect_uri required.; dùng timeout có giới hạn.
- Khi rollback deployment, với POST /api/auth/oauth/token, client_secret rejected.; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ, với POST /api/auth/oauth/token, project active.; không retry nghiệp vụ không idempotent.
- Khi network timeout, với POST /api/auth/oauth/token, key hash match.; ghi metric không chứa PII.
- Khi CAS conflict, với POST /api/auth/oauth/token, redirect exact.; giữ correlation ID riêng.
- Khi response là 401, với POST /api/auth/oauth/token, code hash lookup.; chạy lại contract test sau thay đổi.
- Khi response là 400, với POST /api/auth/oauth/token, project binding.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200, với POST /api/auth/oauth/token, client binding.; giữ secret ở server-side.
## 16. GET /api/auth/userinfo

Mục đích: Profile read. Authentication: Bearer access token.

- Bearer header.
- Signature valid.
- Expiry valid.
- Project active.
- Profile present.
- Return id.
- Return sub.
- Return email.
- Return name.
- Return picture.
- Return given_name.
- Return family_name.
- Return locale.
- Return verified_email.
- No API key.
- No Google subject.
- No Google token.
- Expired 401.
- Revoked 401.
- Malformed 401.
- Khi network timeout, với GET /api/auth/userinfo, bearer header.; kiểm tra status code trước khi parse.
- Khi CAS conflict, với GET /api/auth/userinfo, signature valid.; dùng timeout có giới hạn.
- Khi response là 401, với GET /api/auth/userinfo, expiry valid.; xử lý lỗi theo contract.
- Khi response là 400, với GET /api/auth/userinfo, project active.; không retry nghiệp vụ không idempotent.
- Khi response là 200, với GET /api/auth/userinfo, profile present.; ghi metric không chứa PII.
- Khi user bấm Hủy, với GET /api/auth/userinfo, return id.; giữ correlation ID riêng.
- Khi user bấm Thêm account, với GET /api/auth/userinfo, return sub.; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục, với GET /api/auth/userinfo, return email.; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test, với GET /api/auth/userinfo, return name.; giữ secret ở server-side.
- Khi kiểm tra CSP, với GET /api/auth/userinfo, return picture.; không ghi credential vào log.
- Khi kiểm tra keyboard, với GET /api/auth/userinfo, return given_name.; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile, với GET /api/auth/userinfo, return family_name.; dùng timeout có giới hạn.
## 17. POST /api/auth/logout

Mục đích: Dashboard logout. Authentication: dashboard cookie.

- Clear session cookie.
- Return ok true.
- No project deletion.
- No API key rotation.
- No user deletion.
- No device deletion.
- No OAuth code consume.
- Idempotent client behavior.
- Test missing cookie.
- Test valid cookie.
- Test expired cookie.
- Test response.
- Test Set-Cookie.
- Test no secret.
- Test cross-origin policy.
- Test deployment.
- Test browser.
- Test dashboard.
- Test support.
- Test audit.
- Khi user bấm Tiếp tục, với POST /api/auth/logout, clear session cookie.; không retry nghiệp vụ không idempotent.
- Khi chạy stress test, với POST /api/auth/logout, return ok true.; ghi metric không chứa PII.
- Khi kiểm tra CSP, với POST /api/auth/logout, no project deletion.; giữ correlation ID riêng.
- Khi kiểm tra keyboard, với POST /api/auth/logout, no api key rotation.; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile, với POST /api/auth/logout, no user deletion.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy, với POST /api/auth/logout, no device deletion.; giữ secret ở server-side.
- Ở local, với POST /api/auth/logout, no oauth code consume.; không ghi credential vào log.
- Ở staging, với POST /api/auth/logout, idempotent client behavior.; kiểm tra status code trước khi parse.
- Ở production, với POST /api/auth/logout, test missing cookie.; dùng timeout có giới hạn.
- Trong CI, với POST /api/auth/logout, test valid cookie.; xử lý lỗi theo contract.
- Trong manual QA, với POST /api/auth/logout, test expired cookie.; không retry nghiệp vụ không idempotent.
- Khi request đồng thời, với POST /api/auth/logout, test response.; ghi metric không chứa PII.
## 18. GET /oauth/google

Mục đích: Start chooser. Authentication: public OAuth request.

- client_id required.
- redirect_uri required.
- state optional but recommended.
- HTTPS callback.
- Exact callback.
- Active project.
- Device lookup.
- Device create.
- Transaction create.
- 302 chooser.
- Set device cookie.
- No API key.
- No Google token.
- Unknown client 401.
- Bad URL 400.
- Test multiple projects.
- Test new device.
- Test remembered device.
- Test concurrent start.
- Test production.
- Ở staging, với GET /oauth/google, client_id required.; chạy lại contract test sau thay đổi.
- Ở production, với GET /oauth/google, redirect_uri required.; kiểm tra cấu hình trước khi gọi network.
- Trong CI, với GET /oauth/google, state optional but recommended.; giữ secret ở server-side.
- Trong manual QA, với GET /oauth/google, https callback.; không ghi credential vào log.
- Khi request đồng thời, với GET /oauth/google, exact callback.; kiểm tra status code trước khi parse.
- Khi provider trả 429, với GET /oauth/google, active project.; dùng timeout có giới hạn.
- Khi provider trả 5xx, với GET /oauth/google, device lookup.; xử lý lỗi theo contract.
- Khi callback bị refresh, với GET /oauth/google, device create.; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab, với GET /oauth/google, transaction create.; ghi metric không chứa PII.
- Khi key vừa rotate, với GET /oauth/google, 302 chooser.; giữ correlation ID riêng.
- Khi project vừa revoke, với GET /oauth/google, set device cookie.; chạy lại contract test sau thay đổi.
- Khi device hết hạn, với GET /oauth/google, no api key.; kiểm tra cấu hình trước khi gọi network.
## 19. Tổng quan kiến trúc

Mục tiêu của phần này: Hiểu ranh giới giữa browser, integration backend, APIUYTIN, Google và Sanity.

- Ở local, tổng quan kiến trúc: Browser chỉ khởi tạo redirect.; kiểm tra cấu hình trước khi gọi network.
- Ở staging, tổng quan kiến trúc: Integration backend giữ API key.; không ghi credential vào log.
- Ở production, tổng quan kiến trúc: APIUYTIN giữ transaction và profile.; dùng timeout có giới hạn.
- Trong CI, tổng quan kiến trúc: Google chỉ bootstrap account.; không retry nghiệp vụ không idempotent.
- Trong manual QA, tổng quan kiến trúc: Sanity là persistence phía APIUYTIN.; giữ correlation ID riêng.
- Khi request đồng thời, tổng quan kiến trúc: Browser chỉ khởi tạo redirect.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 429, tổng quan kiến trúc: Integration backend giữ API key.; không ghi credential vào log.
- Khi provider trả 5xx, tổng quan kiến trúc: APIUYTIN giữ transaction và profile.; dùng timeout có giới hạn.
- Khi callback bị refresh, tổng quan kiến trúc: Google chỉ bootstrap account.; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab, tổng quan kiến trúc: Sanity là persistence phía APIUYTIN.; giữ correlation ID riêng.
- Khi key vừa rotate, tổng quan kiến trúc: Browser chỉ khởi tạo redirect.; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke, tổng quan kiến trúc: Integration backend giữ API key.; không ghi credential vào log.
- Khi device hết hạn, tổng quan kiến trúc: APIUYTIN giữ transaction và profile.; dùng timeout có giới hạn.
- Khi profile thiếu optional field, tổng quan kiến trúc: Google chỉ bootstrap account.; không retry nghiệp vụ không idempotent.
- Khi log đang bật debug, tổng quan kiến trúc: Sanity là persistence phía APIUYTIN.; giữ correlation ID riêng.
- Khi rollback deployment, tổng quan kiến trúc: Browser chỉ khởi tạo redirect.; kiểm tra cấu hình trước khi gọi network.
- Khi migration dữ liệu cũ, tổng quan kiến trúc: Integration backend giữ API key.; không ghi credential vào log.
- Khi network timeout, tổng quan kiến trúc: APIUYTIN giữ transaction và profile.; dùng timeout có giới hạn.
- Khi CAS conflict, tổng quan kiến trúc: Google chỉ bootstrap account.; không retry nghiệp vụ không idempotent.
- Khi response là 401, tổng quan kiến trúc: Sanity là persistence phía APIUYTIN.; giữ correlation ID riêng.
- Khi response là 400, tổng quan kiến trúc: Browser chỉ khởi tạo redirect.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200, tổng quan kiến trúc: Integration backend giữ API key.; không ghi credential vào log.
- Khi user bấm Hủy, tổng quan kiến trúc: APIUYTIN giữ transaction và profile.; dùng timeout có giới hạn.
- Khi user bấm Thêm account, tổng quan kiến trúc: Google chỉ bootstrap account.; không retry nghiệp vụ không idempotent.
- Khi user bấm Tiếp tục, tổng quan kiến trúc: Sanity là persistence phía APIUYTIN.; giữ correlation ID riêng.
- Khi chạy stress test, tổng quan kiến trúc: Browser chỉ khởi tạo redirect.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra CSP, tổng quan kiến trúc: Integration backend giữ API key.; không ghi credential vào log.
- Khi kiểm tra keyboard, tổng quan kiến trúc: APIUYTIN giữ transaction và profile.; dùng timeout có giới hạn.
- Khi kiểm tra mobile, tổng quan kiến trúc: Google chỉ bootstrap account.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy, tổng quan kiến trúc: Sanity là persistence phía APIUYTIN.; giữ correlation ID riêng.
## 20. Chuẩn bị project

Mục tiêu của phần này: Tạo project và đăng ký callback trước khi tích hợp.

- Khi request đồng thời, chuẩn bị project: Callback phải HTTPS.; giữ secret ở server-side.
- Khi provider trả 429, chuẩn bị project: Callback phải thuộc domain kiểm soát.; kiểm tra status code trước khi parse.
- Khi provider trả 5xx, chuẩn bị project: Mỗi environment nên có project riêng.; xử lý lỗi theo contract.
- Khi callback bị refresh, chuẩn bị project: Owner phải lưu API key ngay lần đầu.; ghi metric không chứa PII.
- Khi user mở nhiều tab, chuẩn bị project: Tên project nên ngắn và dễ nhận diện.; chạy lại contract test sau thay đổi.
- Khi key vừa rotate, chuẩn bị project: Callback phải HTTPS.; giữ secret ở server-side.
- Khi project vừa revoke, chuẩn bị project: Callback phải thuộc domain kiểm soát.; kiểm tra status code trước khi parse.
- Khi device hết hạn, chuẩn bị project: Mỗi environment nên có project riêng.; xử lý lỗi theo contract.
- Khi profile thiếu optional field, chuẩn bị project: Owner phải lưu API key ngay lần đầu.; ghi metric không chứa PII.
- Khi log đang bật debug, chuẩn bị project: Tên project nên ngắn và dễ nhận diện.; chạy lại contract test sau thay đổi.
- Khi rollback deployment, chuẩn bị project: Callback phải HTTPS.; giữ secret ở server-side.
- Khi migration dữ liệu cũ, chuẩn bị project: Callback phải thuộc domain kiểm soát.; kiểm tra status code trước khi parse.
- Khi network timeout, chuẩn bị project: Mỗi environment nên có project riêng.; xử lý lỗi theo contract.
- Khi CAS conflict, chuẩn bị project: Owner phải lưu API key ngay lần đầu.; ghi metric không chứa PII.
- Khi response là 401, chuẩn bị project: Tên project nên ngắn và dễ nhận diện.; chạy lại contract test sau thay đổi.
- Khi response là 400, chuẩn bị project: Callback phải HTTPS.; giữ secret ở server-side.
- Khi response là 200, chuẩn bị project: Callback phải thuộc domain kiểm soát.; kiểm tra status code trước khi parse.
- Khi user bấm Hủy, chuẩn bị project: Mỗi environment nên có project riêng.; xử lý lỗi theo contract.
- Khi user bấm Thêm account, chuẩn bị project: Owner phải lưu API key ngay lần đầu.; ghi metric không chứa PII.
- Khi user bấm Tiếp tục, chuẩn bị project: Tên project nên ngắn và dễ nhận diện.; chạy lại contract test sau thay đổi.
- Khi chạy stress test, chuẩn bị project: Callback phải HTTPS.; giữ secret ở server-side.
- Khi kiểm tra CSP, chuẩn bị project: Callback phải thuộc domain kiểm soát.; kiểm tra status code trước khi parse.
- Khi kiểm tra keyboard, chuẩn bị project: Mỗi environment nên có project riêng.; xử lý lỗi theo contract.
- Khi kiểm tra mobile, chuẩn bị project: Owner phải lưu API key ngay lần đầu.; ghi metric không chứa PII.
- Khi kiểm tra privacy, chuẩn bị project: Tên project nên ngắn và dễ nhận diện.; chạy lại contract test sau thay đổi.
- Ở local, chuẩn bị project: Callback phải HTTPS.; giữ secret ở server-side.
- Ở staging, chuẩn bị project: Callback phải thuộc domain kiểm soát.; kiểm tra status code trước khi parse.
- Ở production, chuẩn bị project: Mỗi environment nên có project riêng.; xử lý lỗi theo contract.
- Trong CI, chuẩn bị project: Owner phải lưu API key ngay lần đầu.; ghi metric không chứa PII.
- Trong manual QA, chuẩn bị project: Tên project nên ngắn và dễ nhận diện.; chạy lại contract test sau thay đổi.
## 21. Client ID

Mục tiêu của phần này: Dùng client ID để xác định project trong OAuth.

- Khi key vừa rotate, client id: Client ID phải đúng environment.; không ghi credential vào log.
- Khi project vừa revoke, client id: Client ID được map từ publishKey cũ.; dùng timeout có giới hạn.
- Khi device hết hạn, client id: Không dùng client ID thay API key.; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field, client id: Client ID có thể xuất hiện trong URL.; giữ correlation ID riêng.
- Khi log đang bật debug, client id: Client ID không phải secret.; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment, client id: Client ID phải đúng environment.; không ghi credential vào log.
- Khi migration dữ liệu cũ, client id: Client ID được map từ publishKey cũ.; dùng timeout có giới hạn.
- Khi network timeout, client id: Không dùng client ID thay API key.; không retry nghiệp vụ không idempotent.
- Khi CAS conflict, client id: Client ID có thể xuất hiện trong URL.; giữ correlation ID riêng.
- Khi response là 401, client id: Client ID không phải secret.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 400, client id: Client ID phải đúng environment.; không ghi credential vào log.
- Khi response là 200, client id: Client ID được map từ publishKey cũ.; dùng timeout có giới hạn.
- Khi user bấm Hủy, client id: Không dùng client ID thay API key.; không retry nghiệp vụ không idempotent.
- Khi user bấm Thêm account, client id: Client ID có thể xuất hiện trong URL.; giữ correlation ID riêng.
- Khi user bấm Tiếp tục, client id: Client ID không phải secret.; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test, client id: Client ID phải đúng environment.; không ghi credential vào log.
- Khi kiểm tra CSP, client id: Client ID được map từ publishKey cũ.; dùng timeout có giới hạn.
- Khi kiểm tra keyboard, client id: Không dùng client ID thay API key.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra mobile, client id: Client ID có thể xuất hiện trong URL.; giữ correlation ID riêng.
- Khi kiểm tra privacy, client id: Client ID không phải secret.; kiểm tra cấu hình trước khi gọi network.
- Ở local, client id: Client ID phải đúng environment.; không ghi credential vào log.
- Ở staging, client id: Client ID được map từ publishKey cũ.; dùng timeout có giới hạn.
- Ở production, client id: Không dùng client ID thay API key.; không retry nghiệp vụ không idempotent.
- Trong CI, client id: Client ID có thể xuất hiện trong URL.; giữ correlation ID riêng.
- Trong manual QA, client id: Client ID không phải secret.; kiểm tra cấu hình trước khi gọi network.
- Khi request đồng thời, client id: Client ID phải đúng environment.; không ghi credential vào log.
- Khi provider trả 429, client id: Client ID được map từ publishKey cũ.; dùng timeout có giới hạn.
- Khi provider trả 5xx, client id: Không dùng client ID thay API key.; không retry nghiệp vụ không idempotent.
- Khi callback bị refresh, client id: Client ID có thể xuất hiện trong URL.; giữ correlation ID riêng.
- Khi user mở nhiều tab, client id: Client ID không phải secret.; kiểm tra cấu hình trước khi gọi network.
## 22. API key

Mục tiêu của phần này: Bảo vệ credential server-side của project.

- Khi rollback deployment, api key: API key cũ bị vô hiệu hóa sau rotate.; kiểm tra status code trước khi parse.
- Khi migration dữ liệu cũ, api key: Mất key thì rotate.; xử lý lỗi theo contract.
- Khi network timeout, api key: API key chỉ trả khi create hoặc rotate.; ghi metric không chứa PII.
- Khi CAS conflict, api key: API key chỉ lưu hash.; chạy lại contract test sau thay đổi.
- Khi response là 401, api key: API key không vào browser.; giữ secret ở server-side.
- Khi response là 400, api key: API key cũ bị vô hiệu hóa sau rotate.; kiểm tra status code trước khi parse.
- Khi response là 200, api key: Mất key thì rotate.; xử lý lỗi theo contract.
- Khi user bấm Hủy, api key: API key chỉ trả khi create hoặc rotate.; ghi metric không chứa PII.
- Khi user bấm Thêm account, api key: API key chỉ lưu hash.; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục, api key: API key không vào browser.; giữ secret ở server-side.
- Khi chạy stress test, api key: API key cũ bị vô hiệu hóa sau rotate.; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP, api key: Mất key thì rotate.; xử lý lỗi theo contract.
- Khi kiểm tra keyboard, api key: API key chỉ trả khi create hoặc rotate.; ghi metric không chứa PII.
- Khi kiểm tra mobile, api key: API key chỉ lưu hash.; chạy lại contract test sau thay đổi.
- Khi kiểm tra privacy, api key: API key không vào browser.; giữ secret ở server-side.
- Ở local, api key: API key cũ bị vô hiệu hóa sau rotate.; kiểm tra status code trước khi parse.
- Ở staging, api key: Mất key thì rotate.; xử lý lỗi theo contract.
- Ở production, api key: API key chỉ trả khi create hoặc rotate.; ghi metric không chứa PII.
- Trong CI, api key: API key chỉ lưu hash.; chạy lại contract test sau thay đổi.
- Trong manual QA, api key: API key không vào browser.; giữ secret ở server-side.
- Khi request đồng thời, api key: API key cũ bị vô hiệu hóa sau rotate.; kiểm tra status code trước khi parse.
- Khi provider trả 429, api key: Mất key thì rotate.; xử lý lỗi theo contract.
- Khi provider trả 5xx, api key: API key chỉ trả khi create hoặc rotate.; ghi metric không chứa PII.
- Khi callback bị refresh, api key: API key chỉ lưu hash.; chạy lại contract test sau thay đổi.
- Khi user mở nhiều tab, api key: API key không vào browser.; giữ secret ở server-side.
- Khi key vừa rotate, api key: API key cũ bị vô hiệu hóa sau rotate.; kiểm tra status code trước khi parse.
- Khi project vừa revoke, api key: Mất key thì rotate.; xử lý lỗi theo contract.
- Khi device hết hạn, api key: API key chỉ trả khi create hoặc rotate.; ghi metric không chứa PII.
- Khi profile thiếu optional field, api key: API key chỉ lưu hash.; chạy lại contract test sau thay đổi.
- Khi log đang bật debug, api key: API key không vào browser.; giữ secret ở server-side.
## 23. Redirect URI

Mục tiêu của phần này: Giữ callback binding chính xác.

- Khi response là 400, redirect uri: Không chấp nhận fragment.; dùng timeout có giới hạn.
- Khi response là 200, redirect uri: So sánh exact string canonical.; không retry nghiệp vụ không idempotent.
- Khi user bấm Hủy, redirect uri: Không dùng wildcard tùy tiện.; giữ correlation ID riêng.
- Khi user bấm Thêm account, redirect uri: Không chấp nhận HTTP production.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Tiếp tục, redirect uri: Không chấp nhận credentials trong URI.; không ghi credential vào log.
- Khi chạy stress test, redirect uri: Không chấp nhận fragment.; dùng timeout có giới hạn.
- Khi kiểm tra CSP, redirect uri: So sánh exact string canonical.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra keyboard, redirect uri: Không dùng wildcard tùy tiện.; giữ correlation ID riêng.
- Khi kiểm tra mobile, redirect uri: Không chấp nhận HTTP production.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy, redirect uri: Không chấp nhận credentials trong URI.; không ghi credential vào log.
- Ở local, redirect uri: Không chấp nhận fragment.; dùng timeout có giới hạn.
- Ở staging, redirect uri: So sánh exact string canonical.; không retry nghiệp vụ không idempotent.
- Ở production, redirect uri: Không dùng wildcard tùy tiện.; giữ correlation ID riêng.
- Trong CI, redirect uri: Không chấp nhận HTTP production.; kiểm tra cấu hình trước khi gọi network.
- Trong manual QA, redirect uri: Không chấp nhận credentials trong URI.; không ghi credential vào log.
- Khi request đồng thời, redirect uri: Không chấp nhận fragment.; dùng timeout có giới hạn.
- Khi provider trả 429, redirect uri: So sánh exact string canonical.; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx, redirect uri: Không dùng wildcard tùy tiện.; giữ correlation ID riêng.
- Khi callback bị refresh, redirect uri: Không chấp nhận HTTP production.; kiểm tra cấu hình trước khi gọi network.
- Khi user mở nhiều tab, redirect uri: Không chấp nhận credentials trong URI.; không ghi credential vào log.
- Khi key vừa rotate, redirect uri: Không chấp nhận fragment.; dùng timeout có giới hạn.
- Khi project vừa revoke, redirect uri: So sánh exact string canonical.; không retry nghiệp vụ không idempotent.
- Khi device hết hạn, redirect uri: Không dùng wildcard tùy tiện.; giữ correlation ID riêng.
- Khi profile thiếu optional field, redirect uri: Không chấp nhận HTTP production.; kiểm tra cấu hình trước khi gọi network.
- Khi log đang bật debug, redirect uri: Không chấp nhận credentials trong URI.; không ghi credential vào log.
- Khi rollback deployment, redirect uri: Không chấp nhận fragment.; dùng timeout có giới hạn.
- Khi migration dữ liệu cũ, redirect uri: So sánh exact string canonical.; không retry nghiệp vụ không idempotent.
- Khi network timeout, redirect uri: Không dùng wildcard tùy tiện.; giữ correlation ID riêng.
- Khi CAS conflict, redirect uri: Không chấp nhận HTTP production.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401, redirect uri: Không chấp nhận credentials trong URI.; không ghi credential vào log.
## 24. OAuth state

Mục tiêu của phần này: Chống CSRF và liên kết request với browser session.

- Khi chạy stress test, oauth state: State dùng random value.; xử lý lỗi theo contract.
- Khi kiểm tra CSP, oauth state: State có TTL.; ghi metric không chứa PII.
- Khi kiểm tra keyboard, oauth state: State phải exact match.; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile, oauth state: State phải consume một lần.; giữ secret ở server-side.
- Khi kiểm tra privacy, oauth state: State không chứa secret.; kiểm tra status code trước khi parse.
- Ở local, oauth state: State dùng random value.; xử lý lỗi theo contract.
- Ở staging, oauth state: State có TTL.; ghi metric không chứa PII.
- Ở production, oauth state: State phải exact match.; chạy lại contract test sau thay đổi.
- Trong CI, oauth state: State phải consume một lần.; giữ secret ở server-side.
- Trong manual QA, oauth state: State không chứa secret.; kiểm tra status code trước khi parse.
- Khi request đồng thời, oauth state: State dùng random value.; xử lý lỗi theo contract.
- Khi provider trả 429, oauth state: State có TTL.; ghi metric không chứa PII.
- Khi provider trả 5xx, oauth state: State phải exact match.; chạy lại contract test sau thay đổi.
- Khi callback bị refresh, oauth state: State phải consume một lần.; giữ secret ở server-side.
- Khi user mở nhiều tab, oauth state: State không chứa secret.; kiểm tra status code trước khi parse.
- Khi key vừa rotate, oauth state: State dùng random value.; xử lý lỗi theo contract.
- Khi project vừa revoke, oauth state: State có TTL.; ghi metric không chứa PII.
- Khi device hết hạn, oauth state: State phải exact match.; chạy lại contract test sau thay đổi.
- Khi profile thiếu optional field, oauth state: State phải consume một lần.; giữ secret ở server-side.
- Khi log đang bật debug, oauth state: State không chứa secret.; kiểm tra status code trước khi parse.
- Khi rollback deployment, oauth state: State dùng random value.; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ, oauth state: State có TTL.; ghi metric không chứa PII.
- Khi network timeout, oauth state: State phải exact match.; chạy lại contract test sau thay đổi.
- Khi CAS conflict, oauth state: State phải consume một lần.; giữ secret ở server-side.
- Khi response là 401, oauth state: State không chứa secret.; kiểm tra status code trước khi parse.
- Khi response là 400, oauth state: State dùng random value.; xử lý lỗi theo contract.
- Khi response là 200, oauth state: State có TTL.; ghi metric không chứa PII.
- Khi user bấm Hủy, oauth state: State phải exact match.; chạy lại contract test sau thay đổi.
- Khi user bấm Thêm account, oauth state: State phải consume một lần.; giữ secret ở server-side.
- Khi user bấm Tiếp tục, oauth state: State không chứa secret.; kiểm tra status code trước khi parse.
## 25. OAuth start

Mục tiêu của phần này: Khởi tạo flow Account Chooser.

- Ở local, oauth start: Gửi redirect_uri.; không retry nghiệp vụ không idempotent.
- Ở staging, oauth start: Gửi state.; giữ correlation ID riêng.
- Ở production, oauth start: Không gửi api_key.; kiểm tra cấu hình trước khi gọi network.
- Trong CI, oauth start: Bắt đầu lại nếu transaction hết hạn.; không ghi credential vào log.
- Trong manual QA, oauth start: Gửi client_id.; dùng timeout có giới hạn.
- Khi request đồng thời, oauth start: Gửi redirect_uri.; không retry nghiệp vụ không idempotent.
- Khi provider trả 429, oauth start: Gửi state.; giữ correlation ID riêng.
- Khi provider trả 5xx, oauth start: Không gửi api_key.; kiểm tra cấu hình trước khi gọi network.
- Khi callback bị refresh, oauth start: Bắt đầu lại nếu transaction hết hạn.; không ghi credential vào log.
- Khi user mở nhiều tab, oauth start: Gửi client_id.; dùng timeout có giới hạn.
- Khi key vừa rotate, oauth start: Gửi redirect_uri.; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke, oauth start: Gửi state.; giữ correlation ID riêng.
- Khi device hết hạn, oauth start: Không gửi api_key.; kiểm tra cấu hình trước khi gọi network.
- Khi profile thiếu optional field, oauth start: Bắt đầu lại nếu transaction hết hạn.; không ghi credential vào log.
- Khi log đang bật debug, oauth start: Gửi client_id.; dùng timeout có giới hạn.
- Khi rollback deployment, oauth start: Gửi redirect_uri.; không retry nghiệp vụ không idempotent.
- Khi migration dữ liệu cũ, oauth start: Gửi state.; giữ correlation ID riêng.
- Khi network timeout, oauth start: Không gửi api_key.; kiểm tra cấu hình trước khi gọi network.
- Khi CAS conflict, oauth start: Bắt đầu lại nếu transaction hết hạn.; không ghi credential vào log.
- Khi response là 401, oauth start: Gửi client_id.; dùng timeout có giới hạn.
- Khi response là 400, oauth start: Gửi redirect_uri.; không retry nghiệp vụ không idempotent.
- Khi response là 200, oauth start: Gửi state.; giữ correlation ID riêng.
- Khi user bấm Hủy, oauth start: Không gửi api_key.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account, oauth start: Bắt đầu lại nếu transaction hết hạn.; không ghi credential vào log.
- Khi user bấm Tiếp tục, oauth start: Gửi client_id.; dùng timeout có giới hạn.
- Khi chạy stress test, oauth start: Gửi redirect_uri.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra CSP, oauth start: Gửi state.; giữ correlation ID riêng.
- Khi kiểm tra keyboard, oauth start: Không gửi api_key.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra mobile, oauth start: Bắt đầu lại nếu transaction hết hạn.; không ghi credential vào log.
- Khi kiểm tra privacy, oauth start: Gửi client_id.; dùng timeout có giới hạn.
## 26. Device session

Mục tiêu của phần này: Nhớ account trên đúng thiết bị.

- Khi request đồng thời, device session: Cookie SameSite=Lax.; ghi metric không chứa PII.
- Khi provider trả 429, device session: Record server-side có expiry.; chạy lại contract test sau thay đổi.
- Khi provider trả 5xx, device session: Thiết bị mới cần Google.; giữ secret ở server-side.
- Khi callback bị refresh, device session: Cookie HttpOnly.; kiểm tra status code trước khi parse.
- Khi user mở nhiều tab, device session: Cookie Secure.; xử lý lỗi theo contract.
- Khi key vừa rotate, device session: Cookie SameSite=Lax.; ghi metric không chứa PII.
- Khi project vừa revoke, device session: Record server-side có expiry.; chạy lại contract test sau thay đổi.
- Khi device hết hạn, device session: Thiết bị mới cần Google.; giữ secret ở server-side.
- Khi profile thiếu optional field, device session: Cookie HttpOnly.; kiểm tra status code trước khi parse.
- Khi log đang bật debug, device session: Cookie Secure.; xử lý lỗi theo contract.
- Khi rollback deployment, device session: Cookie SameSite=Lax.; ghi metric không chứa PII.
- Khi migration dữ liệu cũ, device session: Record server-side có expiry.; chạy lại contract test sau thay đổi.
- Khi network timeout, device session: Thiết bị mới cần Google.; giữ secret ở server-side.
- Khi CAS conflict, device session: Cookie HttpOnly.; kiểm tra status code trước khi parse.
- Khi response là 401, device session: Cookie Secure.; xử lý lỗi theo contract.
- Khi response là 400, device session: Cookie SameSite=Lax.; ghi metric không chứa PII.
- Khi response là 200, device session: Record server-side có expiry.; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy, device session: Thiết bị mới cần Google.; giữ secret ở server-side.
- Khi user bấm Thêm account, device session: Cookie HttpOnly.; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục, device session: Cookie Secure.; xử lý lỗi theo contract.
- Khi chạy stress test, device session: Cookie SameSite=Lax.; ghi metric không chứa PII.
- Khi kiểm tra CSP, device session: Record server-side có expiry.; chạy lại contract test sau thay đổi.
- Khi kiểm tra keyboard, device session: Thiết bị mới cần Google.; giữ secret ở server-side.
- Khi kiểm tra mobile, device session: Cookie HttpOnly.; kiểm tra status code trước khi parse.
- Khi kiểm tra privacy, device session: Cookie Secure.; xử lý lỗi theo contract.
- Ở local, device session: Cookie SameSite=Lax.; ghi metric không chứa PII.
- Ở staging, device session: Record server-side có expiry.; chạy lại contract test sau thay đổi.
- Ở production, device session: Thiết bị mới cần Google.; giữ secret ở server-side.
- Trong CI, device session: Cookie HttpOnly.; kiểm tra status code trước khi parse.
- Trong manual QA, device session: Cookie Secure.; xử lý lỗi theo contract.
## 27. Account chooser

Mục tiêu của phần này: Cho người dùng chọn account APIUYTIN đã nhớ.

- Khi key vừa rotate, account chooser: Có Continue và Cancel.; giữ correlation ID riêng.
- Khi project vừa revoke, account chooser: Có Add account.; kiểm tra cấu hình trước khi gọi network.
- Khi device hết hạn, account chooser: Hiển thị project name.; không ghi credential vào log.
- Khi profile thiếu optional field, account chooser: Hiển thị callback host.; dùng timeout có giới hạn.
- Khi log đang bật debug, account chooser: Hiển thị avatar, name, email.; không retry nghiệp vụ không idempotent.
- Khi rollback deployment, account chooser: Có Continue và Cancel.; giữ correlation ID riêng.
- Khi migration dữ liệu cũ, account chooser: Có Add account.; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout, account chooser: Hiển thị project name.; không ghi credential vào log.
- Khi CAS conflict, account chooser: Hiển thị callback host.; dùng timeout có giới hạn.
- Khi response là 401, account chooser: Hiển thị avatar, name, email.; không retry nghiệp vụ không idempotent.
- Khi response là 400, account chooser: Có Continue và Cancel.; giữ correlation ID riêng.
- Khi response là 200, account chooser: Có Add account.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Hủy, account chooser: Hiển thị project name.; không ghi credential vào log.
- Khi user bấm Thêm account, account chooser: Hiển thị callback host.; dùng timeout có giới hạn.
- Khi user bấm Tiếp tục, account chooser: Hiển thị avatar, name, email.; không retry nghiệp vụ không idempotent.
- Khi chạy stress test, account chooser: Có Continue và Cancel.; giữ correlation ID riêng.
- Khi kiểm tra CSP, account chooser: Có Add account.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard, account chooser: Hiển thị project name.; không ghi credential vào log.
- Khi kiểm tra mobile, account chooser: Hiển thị callback host.; dùng timeout có giới hạn.
- Khi kiểm tra privacy, account chooser: Hiển thị avatar, name, email.; không retry nghiệp vụ không idempotent.
- Ở local, account chooser: Có Continue và Cancel.; giữ correlation ID riêng.
- Ở staging, account chooser: Có Add account.; kiểm tra cấu hình trước khi gọi network.
- Ở production, account chooser: Hiển thị project name.; không ghi credential vào log.
- Trong CI, account chooser: Hiển thị callback host.; dùng timeout có giới hạn.
- Trong manual QA, account chooser: Hiển thị avatar, name, email.; không retry nghiệp vụ không idempotent.
- Khi request đồng thời, account chooser: Có Continue và Cancel.; giữ correlation ID riêng.
- Khi provider trả 429, account chooser: Có Add account.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 5xx, account chooser: Hiển thị project name.; không ghi credential vào log.
- Khi callback bị refresh, account chooser: Hiển thị callback host.; dùng timeout có giới hạn.
- Khi user mở nhiều tab, account chooser: Hiển thị avatar, name, email.; không retry nghiệp vụ không idempotent.
## 28. Add account

Mục tiêu của phần này: Bootstrap account mới qua Google một lần.

- Khi rollback deployment, add account: Quay lại consent.; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ, add account: Kiểm tra transaction.; giữ secret ở server-side.
- Khi network timeout, add account: Kiểm tra device.; kiểm tra status code trước khi parse.
- Khi CAS conflict, add account: Ký Google state.; xử lý lỗi theo contract.
- Khi response là 401, add account: Upsert apiUser.; ghi metric không chứa PII.
- Khi response là 400, add account: Quay lại consent.; chạy lại contract test sau thay đổi.
- Khi response là 200, add account: Kiểm tra transaction.; giữ secret ở server-side.
- Khi user bấm Hủy, add account: Kiểm tra device.; kiểm tra status code trước khi parse.
- Khi user bấm Thêm account, add account: Ký Google state.; xử lý lỗi theo contract.
- Khi user bấm Tiếp tục, add account: Upsert apiUser.; ghi metric không chứa PII.
- Khi chạy stress test, add account: Quay lại consent.; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP, add account: Kiểm tra transaction.; giữ secret ở server-side.
- Khi kiểm tra keyboard, add account: Kiểm tra device.; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile, add account: Ký Google state.; xử lý lỗi theo contract.
- Khi kiểm tra privacy, add account: Upsert apiUser.; ghi metric không chứa PII.
- Ở local, add account: Quay lại consent.; chạy lại contract test sau thay đổi.
- Ở staging, add account: Kiểm tra transaction.; giữ secret ở server-side.
- Ở production, add account: Kiểm tra device.; kiểm tra status code trước khi parse.
- Trong CI, add account: Ký Google state.; xử lý lỗi theo contract.
- Trong manual QA, add account: Upsert apiUser.; ghi metric không chứa PII.
- Khi request đồng thời, add account: Quay lại consent.; chạy lại contract test sau thay đổi.
- Khi provider trả 429, add account: Kiểm tra transaction.; giữ secret ở server-side.
- Khi provider trả 5xx, add account: Kiểm tra device.; kiểm tra status code trước khi parse.
- Khi callback bị refresh, add account: Ký Google state.; xử lý lỗi theo contract.
- Khi user mở nhiều tab, add account: Upsert apiUser.; ghi metric không chứa PII.
- Khi key vừa rotate, add account: Quay lại consent.; chạy lại contract test sau thay đổi.
- Khi project vừa revoke, add account: Kiểm tra transaction.; giữ secret ở server-side.
- Khi device hết hạn, add account: Kiểm tra device.; kiểm tra status code trước khi parse.
- Khi profile thiếu optional field, add account: Ký Google state.; xử lý lỗi theo contract.
- Khi log đang bật debug, add account: Upsert apiUser.; ghi metric không chứa PII.
## 29. Consent

Mục tiêu của phần này: Xác nhận dữ liệu trước khi cấp code.

- Khi response là 400, consent: Account thuộc device.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200, consent: Profile được escape HTML.; không ghi credential vào log.
- Khi user bấm Hủy, consent: Dữ liệu chia sẻ hiển thị rõ.; dùng timeout có giới hạn.
- Khi user bấm Thêm account, consent: Hủy trả access_denied.; không retry nghiệp vụ không idempotent.
- Khi user bấm Tiếp tục, consent: Tiếp tục tạo code.; giữ correlation ID riêng.
- Khi chạy stress test, consent: Account thuộc device.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra CSP, consent: Profile được escape HTML.; không ghi credential vào log.
- Khi kiểm tra keyboard, consent: Dữ liệu chia sẻ hiển thị rõ.; dùng timeout có giới hạn.
- Khi kiểm tra mobile, consent: Hủy trả access_denied.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy, consent: Tiếp tục tạo code.; giữ correlation ID riêng.
- Ở local, consent: Account thuộc device.; kiểm tra cấu hình trước khi gọi network.
- Ở staging, consent: Profile được escape HTML.; không ghi credential vào log.
- Ở production, consent: Dữ liệu chia sẻ hiển thị rõ.; dùng timeout có giới hạn.
- Trong CI, consent: Hủy trả access_denied.; không retry nghiệp vụ không idempotent.
- Trong manual QA, consent: Tiếp tục tạo code.; giữ correlation ID riêng.
- Khi request đồng thời, consent: Account thuộc device.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 429, consent: Profile được escape HTML.; không ghi credential vào log.
- Khi provider trả 5xx, consent: Dữ liệu chia sẻ hiển thị rõ.; dùng timeout có giới hạn.
- Khi callback bị refresh, consent: Hủy trả access_denied.; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab, consent: Tiếp tục tạo code.; giữ correlation ID riêng.
- Khi key vừa rotate, consent: Account thuộc device.; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke, consent: Profile được escape HTML.; không ghi credential vào log.
- Khi device hết hạn, consent: Dữ liệu chia sẻ hiển thị rõ.; dùng timeout có giới hạn.
- Khi profile thiếu optional field, consent: Hủy trả access_denied.; không retry nghiệp vụ không idempotent.
- Khi log đang bật debug, consent: Tiếp tục tạo code.; giữ correlation ID riêng.
- Khi rollback deployment, consent: Account thuộc device.; kiểm tra cấu hình trước khi gọi network.
- Khi migration dữ liệu cũ, consent: Profile được escape HTML.; không ghi credential vào log.
- Khi network timeout, consent: Dữ liệu chia sẻ hiển thị rõ.; dùng timeout có giới hạn.
- Khi CAS conflict, consent: Hủy trả access_denied.; không retry nghiệp vụ không idempotent.
- Khi response là 401, consent: Tiếp tục tạo code.; giữ correlation ID riêng.
## 30. Callback

Mục tiêu của phần này: Nhận code và state tại integration backend.

- Khi chạy stress test, callback: Kiểm tra state.; giữ secret ở server-side.
- Khi kiểm tra CSP, callback: Không log query.; kiểm tra status code trước khi parse.
- Khi kiểm tra keyboard, callback: Đổi code ở backend.; xử lý lỗi theo contract.
- Khi kiểm tra mobile, callback: Tạo session nội bộ.; ghi metric không chứa PII.
- Khi kiểm tra privacy, callback: Đọc error trước code.; chạy lại contract test sau thay đổi.
- Ở local, callback: Kiểm tra state.; giữ secret ở server-side.
- Ở staging, callback: Không log query.; kiểm tra status code trước khi parse.
- Ở production, callback: Đổi code ở backend.; xử lý lỗi theo contract.
- Trong CI, callback: Tạo session nội bộ.; ghi metric không chứa PII.
- Trong manual QA, callback: Đọc error trước code.; chạy lại contract test sau thay đổi.
- Khi request đồng thời, callback: Kiểm tra state.; giữ secret ở server-side.
- Khi provider trả 429, callback: Không log query.; kiểm tra status code trước khi parse.
- Khi provider trả 5xx, callback: Đổi code ở backend.; xử lý lỗi theo contract.
- Khi callback bị refresh, callback: Tạo session nội bộ.; ghi metric không chứa PII.
- Khi user mở nhiều tab, callback: Đọc error trước code.; chạy lại contract test sau thay đổi.
- Khi key vừa rotate, callback: Kiểm tra state.; giữ secret ở server-side.
- Khi project vừa revoke, callback: Không log query.; kiểm tra status code trước khi parse.
- Khi device hết hạn, callback: Đổi code ở backend.; xử lý lỗi theo contract.
- Khi profile thiếu optional field, callback: Tạo session nội bộ.; ghi metric không chứa PII.
- Khi log đang bật debug, callback: Đọc error trước code.; chạy lại contract test sau thay đổi.
- Khi rollback deployment, callback: Kiểm tra state.; giữ secret ở server-side.
- Khi migration dữ liệu cũ, callback: Không log query.; kiểm tra status code trước khi parse.
- Khi network timeout, callback: Đổi code ở backend.; xử lý lỗi theo contract.
- Khi CAS conflict, callback: Tạo session nội bộ.; ghi metric không chứa PII.
- Khi response là 401, callback: Đọc error trước code.; chạy lại contract test sau thay đổi.
- Khi response là 400, callback: Kiểm tra state.; giữ secret ở server-side.
- Khi response là 200, callback: Không log query.; kiểm tra status code trước khi parse.
- Khi user bấm Hủy, callback: Đổi code ở backend.; xử lý lỗi theo contract.
- Khi user bấm Thêm account, callback: Tạo session nội bộ.; ghi metric không chứa PII.
- Khi user bấm Tiếp tục, callback: Đọc error trước code.; chạy lại contract test sau thay đổi.
## 31. Authorization code

Mục tiêu của phần này: Cấp code ngắn hạn và một lần.

- Ở local, authorization code: Code bind redirect.; không ghi credential vào log.
- Ở staging, authorization code: Code có expiry.; dùng timeout có giới hạn.
- Ở production, authorization code: Consume dùng CAS.; không retry nghiệp vụ không idempotent.
- Trong CI, authorization code: Code bind project.; giữ correlation ID riêng.
- Trong manual QA, authorization code: Code bind client.; kiểm tra cấu hình trước khi gọi network.
- Khi request đồng thời, authorization code: Code bind redirect.; không ghi credential vào log.
- Khi provider trả 429, authorization code: Code có expiry.; dùng timeout có giới hạn.
- Khi provider trả 5xx, authorization code: Consume dùng CAS.; không retry nghiệp vụ không idempotent.
- Khi callback bị refresh, authorization code: Code bind project.; giữ correlation ID riêng.
- Khi user mở nhiều tab, authorization code: Code bind client.; kiểm tra cấu hình trước khi gọi network.
- Khi key vừa rotate, authorization code: Code bind redirect.; không ghi credential vào log.
- Khi project vừa revoke, authorization code: Code có expiry.; dùng timeout có giới hạn.
- Khi device hết hạn, authorization code: Consume dùng CAS.; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field, authorization code: Code bind project.; giữ correlation ID riêng.
- Khi log đang bật debug, authorization code: Code bind client.; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment, authorization code: Code bind redirect.; không ghi credential vào log.
- Khi migration dữ liệu cũ, authorization code: Code có expiry.; dùng timeout có giới hạn.
- Khi network timeout, authorization code: Consume dùng CAS.; không retry nghiệp vụ không idempotent.
- Khi CAS conflict, authorization code: Code bind project.; giữ correlation ID riêng.
- Khi response là 401, authorization code: Code bind client.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 400, authorization code: Code bind redirect.; không ghi credential vào log.
- Khi response là 200, authorization code: Code có expiry.; dùng timeout có giới hạn.
- Khi user bấm Hủy, authorization code: Consume dùng CAS.; không retry nghiệp vụ không idempotent.
- Khi user bấm Thêm account, authorization code: Code bind project.; giữ correlation ID riêng.
- Khi user bấm Tiếp tục, authorization code: Code bind client.; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test, authorization code: Code bind redirect.; không ghi credential vào log.
- Khi kiểm tra CSP, authorization code: Code có expiry.; dùng timeout có giới hạn.
- Khi kiểm tra keyboard, authorization code: Consume dùng CAS.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra mobile, authorization code: Code bind project.; giữ correlation ID riêng.
- Khi kiểm tra privacy, authorization code: Code bind client.; kiểm tra cấu hình trước khi gọi network.
## 32. Token exchange

Mục tiêu của phần này: Đổi code lấy access token và profile.

- Khi request đồng thời, token exchange: Kiểm tra code.; kiểm tra status code trước khi parse.
- Khi provider trả 429, token exchange: Trả APIUYTIN profile.; xử lý lỗi theo contract.
- Khi provider trả 5xx, token exchange: Body JSON.; ghi metric không chứa PII.
- Khi callback bị refresh, token exchange: Chỉ nhận api_key.; chạy lại contract test sau thay đổi.
- Khi user mở nhiều tab, token exchange: Kiểm tra hash key.; giữ secret ở server-side.
- Khi key vừa rotate, token exchange: Kiểm tra code.; kiểm tra status code trước khi parse.
- Khi project vừa revoke, token exchange: Trả APIUYTIN profile.; xử lý lỗi theo contract.
- Khi device hết hạn, token exchange: Body JSON.; ghi metric không chứa PII.
- Khi profile thiếu optional field, token exchange: Chỉ nhận api_key.; chạy lại contract test sau thay đổi.
- Khi log đang bật debug, token exchange: Kiểm tra hash key.; giữ secret ở server-side.
- Khi rollback deployment, token exchange: Kiểm tra code.; kiểm tra status code trước khi parse.
- Khi migration dữ liệu cũ, token exchange: Trả APIUYTIN profile.; xử lý lỗi theo contract.
- Khi network timeout, token exchange: Body JSON.; ghi metric không chứa PII.
- Khi CAS conflict, token exchange: Chỉ nhận api_key.; chạy lại contract test sau thay đổi.
- Khi response là 401, token exchange: Kiểm tra hash key.; giữ secret ở server-side.
- Khi response là 400, token exchange: Kiểm tra code.; kiểm tra status code trước khi parse.
- Khi response là 200, token exchange: Trả APIUYTIN profile.; xử lý lỗi theo contract.
- Khi user bấm Hủy, token exchange: Body JSON.; ghi metric không chứa PII.
- Khi user bấm Thêm account, token exchange: Chỉ nhận api_key.; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục, token exchange: Kiểm tra hash key.; giữ secret ở server-side.
- Khi chạy stress test, token exchange: Kiểm tra code.; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP, token exchange: Trả APIUYTIN profile.; xử lý lỗi theo contract.
- Khi kiểm tra keyboard, token exchange: Body JSON.; ghi metric không chứa PII.
- Khi kiểm tra mobile, token exchange: Chỉ nhận api_key.; chạy lại contract test sau thay đổi.
- Khi kiểm tra privacy, token exchange: Kiểm tra hash key.; giữ secret ở server-side.
- Ở local, token exchange: Kiểm tra code.; kiểm tra status code trước khi parse.
- Ở staging, token exchange: Trả APIUYTIN profile.; xử lý lỗi theo contract.
- Ở production, token exchange: Body JSON.; ghi metric không chứa PII.
- Trong CI, token exchange: Chỉ nhận api_key.; chạy lại contract test sau thay đổi.
- Trong manual QA, token exchange: Kiểm tra hash key.; giữ secret ở server-side.
## 33. Access token

Mục tiêu của phần này: Dùng token đã ký để gọi userinfo.

- Khi key vừa rotate, access token: Tạo local session phù hợp.; dùng timeout có giới hạn.
- Khi project vừa revoke, access token: Gửi Bearer header.; không retry nghiệp vụ không idempotent.
- Khi device hết hạn, access token: Kiểm tra expiry.; giữ correlation ID riêng.
- Khi profile thiếu optional field, access token: Không đưa vào URL.; kiểm tra cấu hình trước khi gọi network.
- Khi log đang bật debug, access token: Không log token.; không ghi credential vào log.
- Khi rollback deployment, access token: Tạo local session phù hợp.; dùng timeout có giới hạn.
- Khi migration dữ liệu cũ, access token: Gửi Bearer header.; không retry nghiệp vụ không idempotent.
- Khi network timeout, access token: Kiểm tra expiry.; giữ correlation ID riêng.
- Khi CAS conflict, access token: Không đưa vào URL.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401, access token: Không log token.; không ghi credential vào log.
- Khi response là 400, access token: Tạo local session phù hợp.; dùng timeout có giới hạn.
- Khi response là 200, access token: Gửi Bearer header.; không retry nghiệp vụ không idempotent.
- Khi user bấm Hủy, access token: Kiểm tra expiry.; giữ correlation ID riêng.
- Khi user bấm Thêm account, access token: Không đưa vào URL.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Tiếp tục, access token: Không log token.; không ghi credential vào log.
- Khi chạy stress test, access token: Tạo local session phù hợp.; dùng timeout có giới hạn.
- Khi kiểm tra CSP, access token: Gửi Bearer header.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra keyboard, access token: Kiểm tra expiry.; giữ correlation ID riêng.
- Khi kiểm tra mobile, access token: Không đưa vào URL.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy, access token: Không log token.; không ghi credential vào log.
- Ở local, access token: Tạo local session phù hợp.; dùng timeout có giới hạn.
- Ở staging, access token: Gửi Bearer header.; không retry nghiệp vụ không idempotent.
- Ở production, access token: Kiểm tra expiry.; giữ correlation ID riêng.
- Trong CI, access token: Không đưa vào URL.; kiểm tra cấu hình trước khi gọi network.
- Trong manual QA, access token: Không log token.; không ghi credential vào log.
- Khi request đồng thời, access token: Tạo local session phù hợp.; dùng timeout có giới hạn.
- Khi provider trả 429, access token: Gửi Bearer header.; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx, access token: Kiểm tra expiry.; giữ correlation ID riêng.
- Khi callback bị refresh, access token: Không đưa vào URL.; kiểm tra cấu hình trước khi gọi network.
- Khi user mở nhiều tab, access token: Không log token.; không ghi credential vào log.
## 34. Userinfo

Mục tiêu của phần này: Đọc lại profile APIUYTIN.

- Khi rollback deployment, userinfo: Response có id/sub.; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ, userinfo: id bằng sub.; ghi metric không chứa PII.
- Khi network timeout, userinfo: Không có Google subject.; chạy lại contract test sau thay đổi.
- Khi CAS conflict, userinfo: Không có Google token.; giữ secret ở server-side.
- Khi response là 401, userinfo: Project phải active.; kiểm tra status code trước khi parse.
- Khi response là 400, userinfo: Response có id/sub.; xử lý lỗi theo contract.
- Khi response là 200, userinfo: id bằng sub.; ghi metric không chứa PII.
- Khi user bấm Hủy, userinfo: Không có Google subject.; chạy lại contract test sau thay đổi.
- Khi user bấm Thêm account, userinfo: Không có Google token.; giữ secret ở server-side.
- Khi user bấm Tiếp tục, userinfo: Project phải active.; kiểm tra status code trước khi parse.
- Khi chạy stress test, userinfo: Response có id/sub.; xử lý lỗi theo contract.
- Khi kiểm tra CSP, userinfo: id bằng sub.; ghi metric không chứa PII.
- Khi kiểm tra keyboard, userinfo: Không có Google subject.; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile, userinfo: Không có Google token.; giữ secret ở server-side.
- Khi kiểm tra privacy, userinfo: Project phải active.; kiểm tra status code trước khi parse.
- Ở local, userinfo: Response có id/sub.; xử lý lỗi theo contract.
- Ở staging, userinfo: id bằng sub.; ghi metric không chứa PII.
- Ở production, userinfo: Không có Google subject.; chạy lại contract test sau thay đổi.
- Trong CI, userinfo: Không có Google token.; giữ secret ở server-side.
- Trong manual QA, userinfo: Project phải active.; kiểm tra status code trước khi parse.
- Khi request đồng thời, userinfo: Response có id/sub.; xử lý lỗi theo contract.
- Khi provider trả 429, userinfo: id bằng sub.; ghi metric không chứa PII.
- Khi provider trả 5xx, userinfo: Không có Google subject.; chạy lại contract test sau thay đổi.
- Khi callback bị refresh, userinfo: Không có Google token.; giữ secret ở server-side.
- Khi user mở nhiều tab, userinfo: Project phải active.; kiểm tra status code trước khi parse.
- Khi key vừa rotate, userinfo: Response có id/sub.; xử lý lỗi theo contract.
- Khi project vừa revoke, userinfo: id bằng sub.; ghi metric không chứa PII.
- Khi device hết hạn, userinfo: Không có Google subject.; chạy lại contract test sau thay đổi.
- Khi profile thiếu optional field, userinfo: Không có Google token.; giữ secret ở server-side.
- Khi log đang bật debug, userinfo: Project phải active.; kiểm tra status code trước khi parse.
## 35. Profile mapping

Mục tiêu của phần này: Chuẩn hóa các field an toàn từ Google thành profile APIUYTIN.

- Khi response là 400, profile mapping: email có thể thay đổi.; không retry nghiệp vụ không idempotent.
- Khi response là 200, profile mapping: picture có thể trống.; giữ correlation ID riêng.
- Khi user bấm Hủy, profile mapping: locale có thể trống.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account, profile mapping: verified_email là boolean.; không ghi credential vào log.
- Khi user bấm Tiếp tục, profile mapping: id do APIUYTIN cấp.; dùng timeout có giới hạn.
- Khi chạy stress test, profile mapping: email có thể thay đổi.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra CSP, profile mapping: picture có thể trống.; giữ correlation ID riêng.
- Khi kiểm tra keyboard, profile mapping: locale có thể trống.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra mobile, profile mapping: verified_email là boolean.; không ghi credential vào log.
- Khi kiểm tra privacy, profile mapping: id do APIUYTIN cấp.; dùng timeout có giới hạn.
- Ở local, profile mapping: email có thể thay đổi.; không retry nghiệp vụ không idempotent.
- Ở staging, profile mapping: picture có thể trống.; giữ correlation ID riêng.
- Ở production, profile mapping: locale có thể trống.; kiểm tra cấu hình trước khi gọi network.
- Trong CI, profile mapping: verified_email là boolean.; không ghi credential vào log.
- Trong manual QA, profile mapping: id do APIUYTIN cấp.; dùng timeout có giới hạn.
- Khi request đồng thời, profile mapping: email có thể thay đổi.; không retry nghiệp vụ không idempotent.
- Khi provider trả 429, profile mapping: picture có thể trống.; giữ correlation ID riêng.
- Khi provider trả 5xx, profile mapping: locale có thể trống.; kiểm tra cấu hình trước khi gọi network.
- Khi callback bị refresh, profile mapping: verified_email là boolean.; không ghi credential vào log.
- Khi user mở nhiều tab, profile mapping: id do APIUYTIN cấp.; dùng timeout có giới hạn.
- Khi key vừa rotate, profile mapping: email có thể thay đổi.; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke, profile mapping: picture có thể trống.; giữ correlation ID riêng.
- Khi device hết hạn, profile mapping: locale có thể trống.; kiểm tra cấu hình trước khi gọi network.
- Khi profile thiếu optional field, profile mapping: verified_email là boolean.; không ghi credential vào log.
- Khi log đang bật debug, profile mapping: id do APIUYTIN cấp.; dùng timeout có giới hạn.
- Khi rollback deployment, profile mapping: email có thể thay đổi.; không retry nghiệp vụ không idempotent.
- Khi migration dữ liệu cũ, profile mapping: picture có thể trống.; giữ correlation ID riêng.
- Khi network timeout, profile mapping: locale có thể trống.; kiểm tra cấu hình trước khi gọi network.
- Khi CAS conflict, profile mapping: verified_email là boolean.; không ghi credential vào log.
- Khi response là 401, profile mapping: id do APIUYTIN cấp.; dùng timeout có giới hạn.
## 36. Dashboard session

Mục tiêu của phần này: Quản lý owner project qua cookie riêng.

- Khi chạy stress test, dashboard session: Session không trả API key.; ghi metric không chứa PII.
- Khi kiểm tra CSP, dashboard session: Logout xóa cookie.; chạy lại contract test sau thay đổi.
- Khi kiểm tra keyboard, dashboard session: Project list chỉ của owner.; giữ secret ở server-side.
- Khi kiểm tra mobile, dashboard session: Không dùng cho end-user.; kiểm tra status code trước khi parse.
- Khi kiểm tra privacy, dashboard session: Session HttpOnly.; xử lý lỗi theo contract.
- Ở local, dashboard session: Session không trả API key.; ghi metric không chứa PII.
- Ở staging, dashboard session: Logout xóa cookie.; chạy lại contract test sau thay đổi.
- Ở production, dashboard session: Project list chỉ của owner.; giữ secret ở server-side.
- Trong CI, dashboard session: Không dùng cho end-user.; kiểm tra status code trước khi parse.
- Trong manual QA, dashboard session: Session HttpOnly.; xử lý lỗi theo contract.
- Khi request đồng thời, dashboard session: Session không trả API key.; ghi metric không chứa PII.
- Khi provider trả 429, dashboard session: Logout xóa cookie.; chạy lại contract test sau thay đổi.
- Khi provider trả 5xx, dashboard session: Project list chỉ của owner.; giữ secret ở server-side.
- Khi callback bị refresh, dashboard session: Không dùng cho end-user.; kiểm tra status code trước khi parse.
- Khi user mở nhiều tab, dashboard session: Session HttpOnly.; xử lý lỗi theo contract.
- Khi key vừa rotate, dashboard session: Session không trả API key.; ghi metric không chứa PII.
- Khi project vừa revoke, dashboard session: Logout xóa cookie.; chạy lại contract test sau thay đổi.
- Khi device hết hạn, dashboard session: Project list chỉ của owner.; giữ secret ở server-side.
- Khi profile thiếu optional field, dashboard session: Không dùng cho end-user.; kiểm tra status code trước khi parse.
- Khi log đang bật debug, dashboard session: Session HttpOnly.; xử lý lỗi theo contract.
- Khi rollback deployment, dashboard session: Session không trả API key.; ghi metric không chứa PII.
- Khi migration dữ liệu cũ, dashboard session: Logout xóa cookie.; chạy lại contract test sau thay đổi.
- Khi network timeout, dashboard session: Project list chỉ của owner.; giữ secret ở server-side.
- Khi CAS conflict, dashboard session: Không dùng cho end-user.; kiểm tra status code trước khi parse.
- Khi response là 401, dashboard session: Session HttpOnly.; xử lý lỗi theo contract.
- Khi response là 400, dashboard session: Session không trả API key.; ghi metric không chứa PII.
- Khi response là 200, dashboard session: Logout xóa cookie.; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy, dashboard session: Project list chỉ của owner.; giữ secret ở server-side.
- Khi user bấm Thêm account, dashboard session: Không dùng cho end-user.; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục, dashboard session: Session HttpOnly.; xử lý lỗi theo contract.
## 37. Project list

Mục tiêu của phần này: Hiển thị metadata project an toàn.

- Ở local, project list: Không có apiKey.; giữ correlation ID riêng.
- Ở staging, project list: Reload không khôi phục key.; kiểm tra cấu hình trước khi gọi network.
- Ở production, project list: Có clientId.; không ghi credential vào log.
- Trong CI, project list: Có redirectUri.; dùng timeout có giới hạn.
- Trong manual QA, project list: Có status.; không retry nghiệp vụ không idempotent.
- Khi request đồng thời, project list: Không có apiKey.; giữ correlation ID riêng.
- Khi provider trả 429, project list: Reload không khôi phục key.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 5xx, project list: Có clientId.; không ghi credential vào log.
- Khi callback bị refresh, project list: Có redirectUri.; dùng timeout có giới hạn.
- Khi user mở nhiều tab, project list: Có status.; không retry nghiệp vụ không idempotent.
- Khi key vừa rotate, project list: Không có apiKey.; giữ correlation ID riêng.
- Khi project vừa revoke, project list: Reload không khôi phục key.; kiểm tra cấu hình trước khi gọi network.
- Khi device hết hạn, project list: Có clientId.; không ghi credential vào log.
- Khi profile thiếu optional field, project list: Có redirectUri.; dùng timeout có giới hạn.
- Khi log đang bật debug, project list: Có status.; không retry nghiệp vụ không idempotent.
- Khi rollback deployment, project list: Không có apiKey.; giữ correlation ID riêng.
- Khi migration dữ liệu cũ, project list: Reload không khôi phục key.; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout, project list: Có clientId.; không ghi credential vào log.
- Khi CAS conflict, project list: Có redirectUri.; dùng timeout có giới hạn.
- Khi response là 401, project list: Có status.; không retry nghiệp vụ không idempotent.
- Khi response là 400, project list: Không có apiKey.; giữ correlation ID riêng.
- Khi response là 200, project list: Reload không khôi phục key.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Hủy, project list: Có clientId.; không ghi credential vào log.
- Khi user bấm Thêm account, project list: Có redirectUri.; dùng timeout có giới hạn.
- Khi user bấm Tiếp tục, project list: Có status.; không retry nghiệp vụ không idempotent.
- Khi chạy stress test, project list: Không có apiKey.; giữ correlation ID riêng.
- Khi kiểm tra CSP, project list: Reload không khôi phục key.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard, project list: Có clientId.; không ghi credential vào log.
- Khi kiểm tra mobile, project list: Có redirectUri.; dùng timeout có giới hạn.
- Khi kiểm tra privacy, project list: Có status.; không retry nghiệp vụ không idempotent.
## 38. Redirect update

Mục tiêu của phần này: Cập nhật callback bằng owner session.

- Khi request đồng thời, redirect update: Test slash cuối URL.; chạy lại contract test sau thay đổi.
- Khi provider trả 429, redirect update: Owner check.; giữ secret ở server-side.
- Khi provider trả 5xx, redirect update: HTTPS check.; kiểm tra status code trước khi parse.
- Khi callback bị refresh, redirect update: Revision guard.; xử lý lỗi theo contract.
- Khi user mở nhiều tab, redirect update: Callback mới áp dụng request mới.; ghi metric không chứa PII.
- Khi key vừa rotate, redirect update: Test slash cuối URL.; chạy lại contract test sau thay đổi.
- Khi project vừa revoke, redirect update: Owner check.; giữ secret ở server-side.
- Khi device hết hạn, redirect update: HTTPS check.; kiểm tra status code trước khi parse.
- Khi profile thiếu optional field, redirect update: Revision guard.; xử lý lỗi theo contract.
- Khi log đang bật debug, redirect update: Callback mới áp dụng request mới.; ghi metric không chứa PII.
- Khi rollback deployment, redirect update: Test slash cuối URL.; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ, redirect update: Owner check.; giữ secret ở server-side.
- Khi network timeout, redirect update: HTTPS check.; kiểm tra status code trước khi parse.
- Khi CAS conflict, redirect update: Revision guard.; xử lý lỗi theo contract.
- Khi response là 401, redirect update: Callback mới áp dụng request mới.; ghi metric không chứa PII.
- Khi response là 400, redirect update: Test slash cuối URL.; chạy lại contract test sau thay đổi.
- Khi response là 200, redirect update: Owner check.; giữ secret ở server-side.
- Khi user bấm Hủy, redirect update: HTTPS check.; kiểm tra status code trước khi parse.
- Khi user bấm Thêm account, redirect update: Revision guard.; xử lý lỗi theo contract.
- Khi user bấm Tiếp tục, redirect update: Callback mới áp dụng request mới.; ghi metric không chứa PII.
- Khi chạy stress test, redirect update: Test slash cuối URL.; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP, redirect update: Owner check.; giữ secret ở server-side.
- Khi kiểm tra keyboard, redirect update: HTTPS check.; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile, redirect update: Revision guard.; xử lý lỗi theo contract.
- Khi kiểm tra privacy, redirect update: Callback mới áp dụng request mới.; ghi metric không chứa PII.
- Ở local, redirect update: Test slash cuối URL.; chạy lại contract test sau thay đổi.
- Ở staging, redirect update: Owner check.; giữ secret ở server-side.
- Ở production, redirect update: HTTPS check.; kiểm tra status code trước khi parse.
- Trong CI, redirect update: Revision guard.; xử lý lỗi theo contract.
- Trong manual QA, redirect update: Callback mới áp dụng request mới.; ghi metric không chứa PII.
## 39. Rotate key

Mục tiêu của phần này: Cấp key mới và vô hiệu hóa key cũ.

- Khi key vừa rotate, rotate key: Owner only.; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke, rotate key: Generate random.; không ghi credential vào log.
- Khi device hết hạn, rotate key: Hash new key.; dùng timeout có giới hạn.
- Khi profile thiếu optional field, rotate key: CAS patch.; không retry nghiệp vụ không idempotent.
- Khi log đang bật debug, rotate key: Return once.; giữ correlation ID riêng.
- Khi rollback deployment, rotate key: Owner only.; kiểm tra cấu hình trước khi gọi network.
- Khi migration dữ liệu cũ, rotate key: Generate random.; không ghi credential vào log.
- Khi network timeout, rotate key: Hash new key.; dùng timeout có giới hạn.
- Khi CAS conflict, rotate key: CAS patch.; không retry nghiệp vụ không idempotent.
- Khi response là 401, rotate key: Return once.; giữ correlation ID riêng.
- Khi response là 400, rotate key: Owner only.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200, rotate key: Generate random.; không ghi credential vào log.
- Khi user bấm Hủy, rotate key: Hash new key.; dùng timeout có giới hạn.
- Khi user bấm Thêm account, rotate key: CAS patch.; không retry nghiệp vụ không idempotent.
- Khi user bấm Tiếp tục, rotate key: Return once.; giữ correlation ID riêng.
- Khi chạy stress test, rotate key: Owner only.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra CSP, rotate key: Generate random.; không ghi credential vào log.
- Khi kiểm tra keyboard, rotate key: Hash new key.; dùng timeout có giới hạn.
- Khi kiểm tra mobile, rotate key: CAS patch.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy, rotate key: Return once.; giữ correlation ID riêng.
- Ở local, rotate key: Owner only.; kiểm tra cấu hình trước khi gọi network.
- Ở staging, rotate key: Generate random.; không ghi credential vào log.
- Ở production, rotate key: Hash new key.; dùng timeout có giới hạn.
- Trong CI, rotate key: CAS patch.; không retry nghiệp vụ không idempotent.
- Trong manual QA, rotate key: Return once.; giữ correlation ID riêng.
- Khi request đồng thời, rotate key: Owner only.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 429, rotate key: Generate random.; không ghi credential vào log.
- Khi provider trả 5xx, rotate key: Hash new key.; dùng timeout có giới hạn.
- Khi callback bị refresh, rotate key: CAS patch.; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab, rotate key: Return once.; giữ correlation ID riêng.
## 40. Revoke project

Mục tiêu của phần này: Vô hiệu hóa project ngay rồi dọn dữ liệu OAuth liên quan ở background. Các thao tác cleanup dùng Sanity query có truyền đầy đủ environment và có thể chạy lại nếu lần trước bị ngắt.

- Khi rollback deployment, revoke project: Dọn auth codes.; giữ secret ở server-side.
- Khi migration dữ liệu cũ, revoke project: Dọn project users.; kiểm tra status code trước khi parse.
- Khi network timeout, revoke project: Dọn transactions.; xử lý lỗi theo contract.
- Khi CAS conflict, revoke project: Chunk mutation.; ghi metric không chứa PII.
- Khi response là 401, revoke project: Owner only.; chạy lại contract test sau thay đổi.
- Khi response là 400, revoke project: Dọn auth codes.; giữ secret ở server-side.
- Khi response là 200, revoke project: Dọn project users.; kiểm tra status code trước khi parse.
- Khi user bấm Hủy, revoke project: Dọn transactions.; xử lý lỗi theo contract.
- Khi user bấm Thêm account, revoke project: Chunk mutation.; ghi metric không chứa PII.
- Khi user bấm Tiếp tục, revoke project: Owner only.; chạy lại contract test sau thay đổi.
- Khi chạy stress test, revoke project: Dọn auth codes.; giữ secret ở server-side.
- Khi kiểm tra CSP, revoke project: Dọn project users.; kiểm tra status code trước khi parse.
- Khi kiểm tra keyboard, revoke project: Dọn transactions.; xử lý lỗi theo contract.
- Khi kiểm tra mobile, revoke project: Chunk mutation.; ghi metric không chứa PII.
- Khi kiểm tra privacy, revoke project: Owner only.; chạy lại contract test sau thay đổi.
- Ở local, revoke project: Dọn auth codes.; giữ secret ở server-side.
- Ở staging, revoke project: Dọn project users.; kiểm tra status code trước khi parse.
- Ở production, revoke project: Dọn transactions.; xử lý lỗi theo contract.
- Trong CI, revoke project: Chunk mutation.; ghi metric không chứa PII.
- Trong manual QA, revoke project: Owner only.; chạy lại contract test sau thay đổi.
- Khi request đồng thời, revoke project: Dọn auth codes.; giữ secret ở server-side.
- Khi provider trả 429, revoke project: Dọn project users.; kiểm tra status code trước khi parse.
- Khi provider trả 5xx, revoke project: Dọn transactions.; xử lý lỗi theo contract.
- Khi callback bị refresh, revoke project: Chunk mutation.; ghi metric không chứa PII.
- Khi user mở nhiều tab, revoke project: Owner only.; chạy lại contract test sau thay đổi.
- Khi key vừa rotate, revoke project: Dọn auth codes.; giữ secret ở server-side.
- Khi project vừa revoke, revoke project: Dọn project users.; kiểm tra status code trước khi parse.
- Khi device hết hạn, revoke project: Dọn transactions.; xử lý lỗi theo contract.
- Khi profile thiếu optional field, revoke project: Chunk mutation.; ghi metric không chứa PII.
- Khi log đang bật debug, revoke project: Owner only.; chạy lại contract test sau thay đổi.
## 41. Project info

Mục tiêu của phần này: Kiểm tra project bằng API key server-side.

- Khi response là 400, project info: Project active.; không ghi credential vào log.
- Khi response là 200, project info: Không trả plaintext key.; dùng timeout có giới hạn.
- Khi user bấm Hủy, project info: Không gọi từ browser.; không retry nghiệp vụ không idempotent.
- Khi user bấm Thêm account, project info: Bearer API key.; giữ correlation ID riêng.
- Khi user bấm Tiếp tục, project info: Hash lookup.; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test, project info: Project active.; không ghi credential vào log.
- Khi kiểm tra CSP, project info: Không trả plaintext key.; dùng timeout có giới hạn.
- Khi kiểm tra keyboard, project info: Không gọi từ browser.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra mobile, project info: Bearer API key.; giữ correlation ID riêng.
- Khi kiểm tra privacy, project info: Hash lookup.; kiểm tra cấu hình trước khi gọi network.
- Ở local, project info: Project active.; không ghi credential vào log.
- Ở staging, project info: Không trả plaintext key.; dùng timeout có giới hạn.
- Ở production, project info: Không gọi từ browser.; không retry nghiệp vụ không idempotent.
- Trong CI, project info: Bearer API key.; giữ correlation ID riêng.
- Trong manual QA, project info: Hash lookup.; kiểm tra cấu hình trước khi gọi network.
- Khi request đồng thời, project info: Project active.; không ghi credential vào log.
- Khi provider trả 429, project info: Không trả plaintext key.; dùng timeout có giới hạn.
- Khi provider trả 5xx, project info: Không gọi từ browser.; không retry nghiệp vụ không idempotent.
- Khi callback bị refresh, project info: Bearer API key.; giữ correlation ID riêng.
- Khi user mở nhiều tab, project info: Hash lookup.; kiểm tra cấu hình trước khi gọi network.
- Khi key vừa rotate, project info: Project active.; không ghi credential vào log.
- Khi project vừa revoke, project info: Không trả plaintext key.; dùng timeout có giới hạn.
- Khi device hết hạn, project info: Không gọi từ browser.; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field, project info: Bearer API key.; giữ correlation ID riêng.
- Khi log đang bật debug, project info: Hash lookup.; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment, project info: Project active.; không ghi credential vào log.
- Khi migration dữ liệu cũ, project info: Không trả plaintext key.; dùng timeout có giới hạn.
- Khi network timeout, project info: Không gọi từ browser.; không retry nghiệp vụ không idempotent.
- Khi CAS conflict, project info: Bearer API key.; giữ correlation ID riêng.
- Khi response là 401, project info: Hash lookup.; kiểm tra cấu hình trước khi gọi network.
## 42. All users

Mục tiêu của phần này: Đọc danh sách user đã đăng nhập project.

- Khi chạy stress test, all users: Bảo vệ PII.; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP, all users: Không log toàn bộ.; xử lý lỗi theo contract.
- Khi kiểm tra keyboard, all users: Bearer API key.; ghi metric không chứa PII.
- Khi kiểm tra mobile, all users: Profile APIUYTIN.; chạy lại contract test sau thay đổi.
- Khi kiểm tra privacy, all users: Không Google subject.; giữ secret ở server-side.
- Ở local, all users: Bảo vệ PII.; kiểm tra status code trước khi parse.
- Ở staging, all users: Không log toàn bộ.; xử lý lỗi theo contract.
- Ở production, all users: Bearer API key.; ghi metric không chứa PII.
- Trong CI, all users: Profile APIUYTIN.; chạy lại contract test sau thay đổi.
- Trong manual QA, all users: Không Google subject.; giữ secret ở server-side.
- Khi request đồng thời, all users: Bảo vệ PII.; kiểm tra status code trước khi parse.
- Khi provider trả 429, all users: Không log toàn bộ.; xử lý lỗi theo contract.
- Khi provider trả 5xx, all users: Bearer API key.; ghi metric không chứa PII.
- Khi callback bị refresh, all users: Profile APIUYTIN.; chạy lại contract test sau thay đổi.
- Khi user mở nhiều tab, all users: Không Google subject.; giữ secret ở server-side.
- Khi key vừa rotate, all users: Bảo vệ PII.; kiểm tra status code trước khi parse.
- Khi project vừa revoke, all users: Không log toàn bộ.; xử lý lỗi theo contract.
- Khi device hết hạn, all users: Bearer API key.; ghi metric không chứa PII.
- Khi profile thiếu optional field, all users: Profile APIUYTIN.; chạy lại contract test sau thay đổi.
- Khi log đang bật debug, all users: Không Google subject.; giữ secret ở server-side.
- Khi rollback deployment, all users: Bảo vệ PII.; kiểm tra status code trước khi parse.
- Khi migration dữ liệu cũ, all users: Không log toàn bộ.; xử lý lỗi theo contract.
- Khi network timeout, all users: Bearer API key.; ghi metric không chứa PII.
- Khi CAS conflict, all users: Profile APIUYTIN.; chạy lại contract test sau thay đổi.
- Khi response là 401, all users: Không Google subject.; giữ secret ở server-side.
- Khi response là 400, all users: Bảo vệ PII.; kiểm tra status code trước khi parse.
- Khi response là 200, all users: Không log toàn bộ.; xử lý lỗi theo contract.
- Khi user bấm Hủy, all users: Bearer API key.; ghi metric không chứa PII.
- Khi user bấm Thêm account, all users: Profile APIUYTIN.; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục, all users: Không Google subject.; giữ secret ở server-side.
## 43. Health

Mục tiêu của phần này: Theo dõi khả dụng cơ bản.

- Ở local, health: Monitor với timeout ngắn.; dùng timeout có giới hạn.
- Ở staging, health: Không cần auth.; không retry nghiệp vụ không idempotent.
- Ở production, health: Trả 200 khi runtime hoạt động.; giữ correlation ID riêng.
- Trong CI, health: Không chứng minh OAuth E2E.; kiểm tra cấu hình trước khi gọi network.
- Trong manual QA, health: Không chứng minh Sanity.; không ghi credential vào log.
- Khi request đồng thời, health: Monitor với timeout ngắn.; dùng timeout có giới hạn.
- Khi provider trả 429, health: Không cần auth.; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx, health: Trả 200 khi runtime hoạt động.; giữ correlation ID riêng.
- Khi callback bị refresh, health: Không chứng minh OAuth E2E.; kiểm tra cấu hình trước khi gọi network.
- Khi user mở nhiều tab, health: Không chứng minh Sanity.; không ghi credential vào log.
- Khi key vừa rotate, health: Monitor với timeout ngắn.; dùng timeout có giới hạn.
- Khi project vừa revoke, health: Không cần auth.; không retry nghiệp vụ không idempotent.
- Khi device hết hạn, health: Trả 200 khi runtime hoạt động.; giữ correlation ID riêng.
- Khi profile thiếu optional field, health: Không chứng minh OAuth E2E.; kiểm tra cấu hình trước khi gọi network.
- Khi log đang bật debug, health: Không chứng minh Sanity.; không ghi credential vào log.
- Khi rollback deployment, health: Monitor với timeout ngắn.; dùng timeout có giới hạn.
- Khi migration dữ liệu cũ, health: Không cần auth.; không retry nghiệp vụ không idempotent.
- Khi network timeout, health: Trả 200 khi runtime hoạt động.; giữ correlation ID riêng.
- Khi CAS conflict, health: Không chứng minh OAuth E2E.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401, health: Không chứng minh Sanity.; không ghi credential vào log.
- Khi response là 400, health: Monitor với timeout ngắn.; dùng timeout có giới hạn.
- Khi response là 200, health: Không cần auth.; không retry nghiệp vụ không idempotent.
- Khi user bấm Hủy, health: Trả 200 khi runtime hoạt động.; giữ correlation ID riêng.
- Khi user bấm Thêm account, health: Không chứng minh OAuth E2E.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Tiếp tục, health: Không chứng minh Sanity.; không ghi credential vào log.
- Khi chạy stress test, health: Monitor với timeout ngắn.; dùng timeout có giới hạn.
- Khi kiểm tra CSP, health: Không cần auth.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra keyboard, health: Trả 200 khi runtime hoạt động.; giữ correlation ID riêng.
- Khi kiểm tra mobile, health: Không chứng minh OAuth E2E.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy, health: Không chứng minh Sanity.; không ghi credential vào log.
## 44. Discovery

Mục tiêu của phần này: Công bố endpoint public.

- Khi request đồng thời, discovery: Không trả secret.; xử lý lỗi theo contract.
- Khi provider trả 429, discovery: Có token endpoint.; ghi metric không chứa PII.
- Khi provider trả 5xx, discovery: Có userinfo.; chạy lại contract test sau thay đổi.
- Khi callback bị refresh, discovery: Có rotate key.; giữ secret ở server-side.
- Khi user mở nhiều tab, discovery: Dùng cho kiểm tra contract.; kiểm tra status code trước khi parse.
- Khi key vừa rotate, discovery: Không trả secret.; xử lý lỗi theo contract.
- Khi project vừa revoke, discovery: Có token endpoint.; ghi metric không chứa PII.
- Khi device hết hạn, discovery: Có userinfo.; chạy lại contract test sau thay đổi.
- Khi profile thiếu optional field, discovery: Có rotate key.; giữ secret ở server-side.
- Khi log đang bật debug, discovery: Dùng cho kiểm tra contract.; kiểm tra status code trước khi parse.
- Khi rollback deployment, discovery: Không trả secret.; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ, discovery: Có token endpoint.; ghi metric không chứa PII.
- Khi network timeout, discovery: Có userinfo.; chạy lại contract test sau thay đổi.
- Khi CAS conflict, discovery: Có rotate key.; giữ secret ở server-side.
- Khi response là 401, discovery: Dùng cho kiểm tra contract.; kiểm tra status code trước khi parse.
- Khi response là 400, discovery: Không trả secret.; xử lý lỗi theo contract.
- Khi response là 200, discovery: Có token endpoint.; ghi metric không chứa PII.
- Khi user bấm Hủy, discovery: Có userinfo.; chạy lại contract test sau thay đổi.
- Khi user bấm Thêm account, discovery: Có rotate key.; giữ secret ở server-side.
- Khi user bấm Tiếp tục, discovery: Dùng cho kiểm tra contract.; kiểm tra status code trước khi parse.
- Khi chạy stress test, discovery: Không trả secret.; xử lý lỗi theo contract.
- Khi kiểm tra CSP, discovery: Có token endpoint.; ghi metric không chứa PII.
- Khi kiểm tra keyboard, discovery: Có userinfo.; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile, discovery: Có rotate key.; giữ secret ở server-side.
- Khi kiểm tra privacy, discovery: Dùng cho kiểm tra contract.; kiểm tra status code trước khi parse.
- Ở local, discovery: Không trả secret.; xử lý lỗi theo contract.
- Ở staging, discovery: Có token endpoint.; ghi metric không chứa PII.
- Ở production, discovery: Có userinfo.; chạy lại contract test sau thay đổi.
- Trong CI, discovery: Có rotate key.; giữ secret ở server-side.
- Trong manual QA, discovery: Dùng cho kiểm tra contract.; kiểm tra status code trước khi parse.
## 45. Async I/O

Mục tiêu của phần này: Không block request độc lập.

- Khi key vừa rotate, async i/o: Không loop blocking.; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke, async i/o: Timeout hữu hạn.; giữ correlation ID riêng.
- Khi device hết hạn, async i/o: Request state riêng.; kiểm tra cấu hình trước khi gọi network.
- Khi profile thiếu optional field, async i/o: Không dùng global mutable auth state.; không ghi credential vào log.
- Khi log đang bật debug, async i/o: Network dùng async.; dùng timeout có giới hạn.
- Khi rollback deployment, async i/o: Không loop blocking.; không retry nghiệp vụ không idempotent.
- Khi migration dữ liệu cũ, async i/o: Timeout hữu hạn.; giữ correlation ID riêng.
- Khi network timeout, async i/o: Request state riêng.; kiểm tra cấu hình trước khi gọi network.
- Khi CAS conflict, async i/o: Không dùng global mutable auth state.; không ghi credential vào log.
- Khi response là 401, async i/o: Network dùng async.; dùng timeout có giới hạn.
- Khi response là 400, async i/o: Không loop blocking.; không retry nghiệp vụ không idempotent.
- Khi response là 200, async i/o: Timeout hữu hạn.; giữ correlation ID riêng.
- Khi user bấm Hủy, async i/o: Request state riêng.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account, async i/o: Không dùng global mutable auth state.; không ghi credential vào log.
- Khi user bấm Tiếp tục, async i/o: Network dùng async.; dùng timeout có giới hạn.
- Khi chạy stress test, async i/o: Không loop blocking.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra CSP, async i/o: Timeout hữu hạn.; giữ correlation ID riêng.
- Khi kiểm tra keyboard, async i/o: Request state riêng.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra mobile, async i/o: Không dùng global mutable auth state.; không ghi credential vào log.
- Khi kiểm tra privacy, async i/o: Network dùng async.; dùng timeout có giới hạn.
- Ở local, async i/o: Không loop blocking.; không retry nghiệp vụ không idempotent.
- Ở staging, async i/o: Timeout hữu hạn.; giữ correlation ID riêng.
- Ở production, async i/o: Request state riêng.; kiểm tra cấu hình trước khi gọi network.
- Trong CI, async i/o: Không dùng global mutable auth state.; không ghi credential vào log.
- Trong manual QA, async i/o: Network dùng async.; dùng timeout có giới hạn.
- Khi request đồng thời, async i/o: Không loop blocking.; không retry nghiệp vụ không idempotent.
- Khi provider trả 429, async i/o: Timeout hữu hạn.; giữ correlation ID riêng.
- Khi provider trả 5xx, async i/o: Request state riêng.; kiểm tra cấu hình trước khi gọi network.
- Khi callback bị refresh, async i/o: Không dùng global mutable auth state.; không ghi credential vào log.
- Khi user mở nhiều tab, async i/o: Network dùng async.; dùng timeout có giới hạn.
## 46. Retry query

Mục tiêu của phần này: Xử lý lỗi tạm thời an toàn.

- Khi rollback deployment, retry query: Backoff exponential.; ghi metric không chứa PII.
- Khi migration dữ liệu cũ, retry query: Có jitter.; chạy lại contract test sau thay đổi.
- Khi network timeout, retry query: Không log secret.; giữ secret ở server-side.
- Khi CAS conflict, retry query: Retry tối đa 3.; kiểm tra status code trước khi parse.
- Khi response là 401, retry query: Chỉ 429/5xx/network.; xử lý lỗi theo contract.
- Khi response là 400, retry query: Backoff exponential.; ghi metric không chứa PII.
- Khi response là 200, retry query: Có jitter.; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy, retry query: Không log secret.; giữ secret ở server-side.
- Khi user bấm Thêm account, retry query: Retry tối đa 3.; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục, retry query: Chỉ 429/5xx/network.; xử lý lỗi theo contract.
- Khi chạy stress test, retry query: Backoff exponential.; ghi metric không chứa PII.
- Khi kiểm tra CSP, retry query: Có jitter.; chạy lại contract test sau thay đổi.
- Khi kiểm tra keyboard, retry query: Không log secret.; giữ secret ở server-side.
- Khi kiểm tra mobile, retry query: Retry tối đa 3.; kiểm tra status code trước khi parse.
- Khi kiểm tra privacy, retry query: Chỉ 429/5xx/network.; xử lý lỗi theo contract.
- Ở local, retry query: Backoff exponential.; ghi metric không chứa PII.
- Ở staging, retry query: Có jitter.; chạy lại contract test sau thay đổi.
- Ở production, retry query: Không log secret.; giữ secret ở server-side.
- Trong CI, retry query: Retry tối đa 3.; kiểm tra status code trước khi parse.
- Trong manual QA, retry query: Chỉ 429/5xx/network.; xử lý lỗi theo contract.
- Khi request đồng thời, retry query: Backoff exponential.; ghi metric không chứa PII.
- Khi provider trả 429, retry query: Có jitter.; chạy lại contract test sau thay đổi.
- Khi provider trả 5xx, retry query: Không log secret.; giữ secret ở server-side.
- Khi callback bị refresh, retry query: Retry tối đa 3.; kiểm tra status code trước khi parse.
- Khi user mở nhiều tab, retry query: Chỉ 429/5xx/network.; xử lý lỗi theo contract.
- Khi key vừa rotate, retry query: Backoff exponential.; ghi metric không chứa PII.
- Khi project vừa revoke, retry query: Có jitter.; chạy lại contract test sau thay đổi.
- Khi device hết hạn, retry query: Không log secret.; giữ secret ở server-side.
- Khi profile thiếu optional field, retry query: Retry tối đa 3.; kiểm tra status code trước khi parse.
- Khi log đang bật debug, retry query: Chỉ 429/5xx/network.; xử lý lỗi theo contract.
## 47. Mutation safety

Mục tiêu của phần này: Không retry mutation gây duplicate.

- Khi response là 400, mutation safety: Concurrency max 6.; giữ correlation ID riêng.
- Khi response là 200, mutation safety: Unknown outcome phải điều tra.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Hủy, mutation safety: createIfNotExists.; không ghi credential vào log.
- Khi user bấm Thêm account, mutation safety: CAS patch.; dùng timeout có giới hạn.
- Khi user bấm Tiếp tục, mutation safety: Chunk max 50.; không retry nghiệp vụ không idempotent.
- Khi chạy stress test, mutation safety: Concurrency max 6.; giữ correlation ID riêng.
- Khi kiểm tra CSP, mutation safety: Unknown outcome phải điều tra.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard, mutation safety: createIfNotExists.; không ghi credential vào log.
- Khi kiểm tra mobile, mutation safety: CAS patch.; dùng timeout có giới hạn.
- Khi kiểm tra privacy, mutation safety: Chunk max 50.; không retry nghiệp vụ không idempotent.
- Ở local, mutation safety: Concurrency max 6.; giữ correlation ID riêng.
- Ở staging, mutation safety: Unknown outcome phải điều tra.; kiểm tra cấu hình trước khi gọi network.
- Ở production, mutation safety: createIfNotExists.; không ghi credential vào log.
- Trong CI, mutation safety: CAS patch.; dùng timeout có giới hạn.
- Trong manual QA, mutation safety: Chunk max 50.; không retry nghiệp vụ không idempotent.
- Khi request đồng thời, mutation safety: Concurrency max 6.; giữ correlation ID riêng.
- Khi provider trả 429, mutation safety: Unknown outcome phải điều tra.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 5xx, mutation safety: createIfNotExists.; không ghi credential vào log.
- Khi callback bị refresh, mutation safety: CAS patch.; dùng timeout có giới hạn.
- Khi user mở nhiều tab, mutation safety: Chunk max 50.; không retry nghiệp vụ không idempotent.
- Khi key vừa rotate, mutation safety: Concurrency max 6.; giữ correlation ID riêng.
- Khi project vừa revoke, mutation safety: Unknown outcome phải điều tra.; kiểm tra cấu hình trước khi gọi network.
- Khi device hết hạn, mutation safety: createIfNotExists.; không ghi credential vào log.
- Khi profile thiếu optional field, mutation safety: CAS patch.; dùng timeout có giới hạn.
- Khi log đang bật debug, mutation safety: Chunk max 50.; không retry nghiệp vụ không idempotent.
- Khi rollback deployment, mutation safety: Concurrency max 6.; giữ correlation ID riêng.
- Khi migration dữ liệu cũ, mutation safety: Unknown outcome phải điều tra.; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout, mutation safety: createIfNotExists.; không ghi credential vào log.
- Khi CAS conflict, mutation safety: CAS patch.; dùng timeout có giới hạn.
- Khi response là 401, mutation safety: Chunk max 50.; không retry nghiệp vụ không idempotent.
## 48. CAS race

Mục tiêu của phần này: Bảo vệ chọn account, consume code và rotate.

- Khi chạy stress test, cas race: Test concurrent requests.; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP, cas race: Đọc revision.; giữ secret ở server-side.
- Khi kiểm tra keyboard, cas race: Patch ifRevisionID.; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile, cas race: Xử lý conflict.; xử lý lỗi theo contract.
- Khi kiểm tra privacy, cas race: Không ghi đè âm thầm.; ghi metric không chứa PII.
- Ở local, cas race: Test concurrent requests.; chạy lại contract test sau thay đổi.
- Ở staging, cas race: Đọc revision.; giữ secret ở server-side.
- Ở production, cas race: Patch ifRevisionID.; kiểm tra status code trước khi parse.
- Trong CI, cas race: Xử lý conflict.; xử lý lỗi theo contract.
- Trong manual QA, cas race: Không ghi đè âm thầm.; ghi metric không chứa PII.
- Khi request đồng thời, cas race: Test concurrent requests.; chạy lại contract test sau thay đổi.
- Khi provider trả 429, cas race: Đọc revision.; giữ secret ở server-side.
- Khi provider trả 5xx, cas race: Patch ifRevisionID.; kiểm tra status code trước khi parse.
- Khi callback bị refresh, cas race: Xử lý conflict.; xử lý lỗi theo contract.
- Khi user mở nhiều tab, cas race: Không ghi đè âm thầm.; ghi metric không chứa PII.
- Khi key vừa rotate, cas race: Test concurrent requests.; chạy lại contract test sau thay đổi.
- Khi project vừa revoke, cas race: Đọc revision.; giữ secret ở server-side.
- Khi device hết hạn, cas race: Patch ifRevisionID.; kiểm tra status code trước khi parse.
- Khi profile thiếu optional field, cas race: Xử lý conflict.; xử lý lỗi theo contract.
- Khi log đang bật debug, cas race: Không ghi đè âm thầm.; ghi metric không chứa PII.
- Khi rollback deployment, cas race: Test concurrent requests.; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ, cas race: Đọc revision.; giữ secret ở server-side.
- Khi network timeout, cas race: Patch ifRevisionID.; kiểm tra status code trước khi parse.
- Khi CAS conflict, cas race: Xử lý conflict.; xử lý lỗi theo contract.
- Khi response là 401, cas race: Không ghi đè âm thầm.; ghi metric không chứa PII.
- Khi response là 400, cas race: Test concurrent requests.; chạy lại contract test sau thay đổi.
- Khi response là 200, cas race: Đọc revision.; giữ secret ở server-side.
- Khi user bấm Hủy, cas race: Patch ifRevisionID.; kiểm tra status code trước khi parse.
- Khi user bấm Thêm account, cas race: Xử lý conflict.; xử lý lỗi theo contract.
- Khi user bấm Tiếp tục, cas race: Không ghi đè âm thầm.; ghi metric không chứa PII.
## 49. Migration

Mục tiêu của phần này: Tương thích dữ liệu project cũ.

- Ở local, migration: Giữ publishKey.; kiểm tra cấu hình trước khi gọi network.
- Ở staging, migration: Giữ apiKeyHash.; không ghi credential vào log.
- Ở production, migration: Map ngoài thành clientId.; dùng timeout có giới hạn.
- Trong CI, migration: Bỏ secretKey logic.; không retry nghiệp vụ không idempotent.
- Trong manual QA, migration: Không fallback Google subject.; giữ correlation ID riêng.
- Khi request đồng thời, migration: Giữ publishKey.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 429, migration: Giữ apiKeyHash.; không ghi credential vào log.
- Khi provider trả 5xx, migration: Map ngoài thành clientId.; dùng timeout có giới hạn.
- Khi callback bị refresh, migration: Bỏ secretKey logic.; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab, migration: Không fallback Google subject.; giữ correlation ID riêng.
- Khi key vừa rotate, migration: Giữ publishKey.; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke, migration: Giữ apiKeyHash.; không ghi credential vào log.
- Khi device hết hạn, migration: Map ngoài thành clientId.; dùng timeout có giới hạn.
- Khi profile thiếu optional field, migration: Bỏ secretKey logic.; không retry nghiệp vụ không idempotent.
- Khi log đang bật debug, migration: Không fallback Google subject.; giữ correlation ID riêng.
- Khi rollback deployment, migration: Giữ publishKey.; kiểm tra cấu hình trước khi gọi network.
- Khi migration dữ liệu cũ, migration: Giữ apiKeyHash.; không ghi credential vào log.
- Khi network timeout, migration: Map ngoài thành clientId.; dùng timeout có giới hạn.
- Khi CAS conflict, migration: Bỏ secretKey logic.; không retry nghiệp vụ không idempotent.
- Khi response là 401, migration: Không fallback Google subject.; giữ correlation ID riêng.
- Khi response là 400, migration: Giữ publishKey.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200, migration: Giữ apiKeyHash.; không ghi credential vào log.
- Khi user bấm Hủy, migration: Map ngoài thành clientId.; dùng timeout có giới hạn.
- Khi user bấm Thêm account, migration: Bỏ secretKey logic.; không retry nghiệp vụ không idempotent.
- Khi user bấm Tiếp tục, migration: Không fallback Google subject.; giữ correlation ID riêng.
- Khi chạy stress test, migration: Giữ publishKey.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra CSP, migration: Giữ apiKeyHash.; không ghi credential vào log.
- Khi kiểm tra keyboard, migration: Map ngoài thành clientId.; dùng timeout có giới hạn.
- Khi kiểm tra mobile, migration: Bỏ secretKey logic.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy, migration: Không fallback Google subject.; giữ correlation ID riêng.
## 50. CSP

Mục tiêu của phần này: Giữ chooser không dùng inline script.

- Khi request đồng thời, csp: External JS.; giữ secret ở server-side.
- Khi provider trả 429, csp: External CSS.; kiểm tra status code trước khi parse.
- Khi provider trả 5xx, csp: Avatar theo img-src.; xử lý lỗi theo contract.
- Khi callback bị refresh, csp: Không inline handler.; ghi metric không chứa PII.
- Khi user mở nhiều tab, csp: script-src self.; chạy lại contract test sau thay đổi.
- Khi key vừa rotate, csp: External JS.; giữ secret ở server-side.
- Khi project vừa revoke, csp: External CSS.; kiểm tra status code trước khi parse.
- Khi device hết hạn, csp: Avatar theo img-src.; xử lý lỗi theo contract.
- Khi profile thiếu optional field, csp: Không inline handler.; ghi metric không chứa PII.
- Khi log đang bật debug, csp: script-src self.; chạy lại contract test sau thay đổi.
- Khi rollback deployment, csp: External JS.; giữ secret ở server-side.
- Khi migration dữ liệu cũ, csp: External CSS.; kiểm tra status code trước khi parse.
- Khi network timeout, csp: Avatar theo img-src.; xử lý lỗi theo contract.
- Khi CAS conflict, csp: Không inline handler.; ghi metric không chứa PII.
- Khi response là 401, csp: script-src self.; chạy lại contract test sau thay đổi.
- Khi response là 400, csp: External JS.; giữ secret ở server-side.
- Khi response là 200, csp: External CSS.; kiểm tra status code trước khi parse.
- Khi user bấm Hủy, csp: Avatar theo img-src.; xử lý lỗi theo contract.
- Khi user bấm Thêm account, csp: Không inline handler.; ghi metric không chứa PII.
- Khi user bấm Tiếp tục, csp: script-src self.; chạy lại contract test sau thay đổi.
- Khi chạy stress test, csp: External JS.; giữ secret ở server-side.
- Khi kiểm tra CSP, csp: External CSS.; kiểm tra status code trước khi parse.
- Khi kiểm tra keyboard, csp: Avatar theo img-src.; xử lý lỗi theo contract.
- Khi kiểm tra mobile, csp: Không inline handler.; ghi metric không chứa PII.
- Khi kiểm tra privacy, csp: script-src self.; chạy lại contract test sau thay đổi.
- Ở local, csp: External JS.; giữ secret ở server-side.
- Ở staging, csp: External CSS.; kiểm tra status code trước khi parse.
- Ở production, csp: Avatar theo img-src.; xử lý lỗi theo contract.
- Trong CI, csp: Không inline handler.; ghi metric không chứa PII.
- Trong manual QA, csp: script-src self.; chạy lại contract test sau thay đổi.
## 51. Accessibility

Mục tiêu của phần này: Hỗ trợ keyboard và screen reader.

- Khi key vừa rotate, accessibility: Focus first.; không ghi credential vào log.
- Khi project vừa revoke, accessibility: Focus trap.; dùng timeout có giới hạn.
- Khi device hết hạn, accessibility: Escape cancel.; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field, accessibility: Dialog role.; giữ correlation ID riêng.
- Khi log đang bật debug, accessibility: Aria label.; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment, accessibility: Focus first.; không ghi credential vào log.
- Khi migration dữ liệu cũ, accessibility: Focus trap.; dùng timeout có giới hạn.
- Khi network timeout, accessibility: Escape cancel.; không retry nghiệp vụ không idempotent.
- Khi CAS conflict, accessibility: Dialog role.; giữ correlation ID riêng.
- Khi response là 401, accessibility: Aria label.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 400, accessibility: Focus first.; không ghi credential vào log.
- Khi response là 200, accessibility: Focus trap.; dùng timeout có giới hạn.
- Khi user bấm Hủy, accessibility: Escape cancel.; không retry nghiệp vụ không idempotent.
- Khi user bấm Thêm account, accessibility: Dialog role.; giữ correlation ID riêng.
- Khi user bấm Tiếp tục, accessibility: Aria label.; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test, accessibility: Focus first.; không ghi credential vào log.
- Khi kiểm tra CSP, accessibility: Focus trap.; dùng timeout có giới hạn.
- Khi kiểm tra keyboard, accessibility: Escape cancel.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra mobile, accessibility: Dialog role.; giữ correlation ID riêng.
- Khi kiểm tra privacy, accessibility: Aria label.; kiểm tra cấu hình trước khi gọi network.
- Ở local, accessibility: Focus first.; không ghi credential vào log.
- Ở staging, accessibility: Focus trap.; dùng timeout có giới hạn.
- Ở production, accessibility: Escape cancel.; không retry nghiệp vụ không idempotent.
- Trong CI, accessibility: Dialog role.; giữ correlation ID riêng.
- Trong manual QA, accessibility: Aria label.; kiểm tra cấu hình trước khi gọi network.
- Khi request đồng thời, accessibility: Focus first.; không ghi credential vào log.
- Khi provider trả 429, accessibility: Focus trap.; dùng timeout có giới hạn.
- Khi provider trả 5xx, accessibility: Escape cancel.; không retry nghiệp vụ không idempotent.
- Khi callback bị refresh, accessibility: Dialog role.; giữ correlation ID riêng.
- Khi user mở nhiều tab, accessibility: Aria label.; kiểm tra cấu hình trước khi gọi network.
## 52. Responsive UI

Mục tiêu của phần này: Hiển thị đúng trên nhiều kích thước.

- Khi rollback deployment, responsive ui: 1440px không quá rộng.; kiểm tra status code trước khi parse.
- Khi migration dữ liệu cũ, responsive ui: Text dài wrap.; xử lý lỗi theo contract.
- Khi network timeout, responsive ui: 375px một cột.; ghi metric không chứa PII.
- Khi CAS conflict, responsive ui: 768px cân đối.; chạy lại contract test sau thay đổi.
- Khi response là 401, responsive ui: 1024px card trung tâm.; giữ secret ở server-side.
- Khi response là 400, responsive ui: 1440px không quá rộng.; kiểm tra status code trước khi parse.
- Khi response là 200, responsive ui: Text dài wrap.; xử lý lỗi theo contract.
- Khi user bấm Hủy, responsive ui: 375px một cột.; ghi metric không chứa PII.
- Khi user bấm Thêm account, responsive ui: 768px cân đối.; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục, responsive ui: 1024px card trung tâm.; giữ secret ở server-side.
- Khi chạy stress test, responsive ui: 1440px không quá rộng.; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP, responsive ui: Text dài wrap.; xử lý lỗi theo contract.
- Khi kiểm tra keyboard, responsive ui: 375px một cột.; ghi metric không chứa PII.
- Khi kiểm tra mobile, responsive ui: 768px cân đối.; chạy lại contract test sau thay đổi.
- Khi kiểm tra privacy, responsive ui: 1024px card trung tâm.; giữ secret ở server-side.
- Ở local, responsive ui: 1440px không quá rộng.; kiểm tra status code trước khi parse.
- Ở staging, responsive ui: Text dài wrap.; xử lý lỗi theo contract.
- Ở production, responsive ui: 375px một cột.; ghi metric không chứa PII.
- Trong CI, responsive ui: 768px cân đối.; chạy lại contract test sau thay đổi.
- Trong manual QA, responsive ui: 1024px card trung tâm.; giữ secret ở server-side.
- Khi request đồng thời, responsive ui: 1440px không quá rộng.; kiểm tra status code trước khi parse.
- Khi provider trả 429, responsive ui: Text dài wrap.; xử lý lỗi theo contract.
- Khi provider trả 5xx, responsive ui: 375px một cột.; ghi metric không chứa PII.
- Khi callback bị refresh, responsive ui: 768px cân đối.; chạy lại contract test sau thay đổi.
- Khi user mở nhiều tab, responsive ui: 1024px card trung tâm.; giữ secret ở server-side.
- Khi key vừa rotate, responsive ui: 1440px không quá rộng.; kiểm tra status code trước khi parse.
- Khi project vừa revoke, responsive ui: Text dài wrap.; xử lý lỗi theo contract.
- Khi device hết hạn, responsive ui: 375px một cột.; ghi metric không chứa PII.
- Khi profile thiếu optional field, responsive ui: 768px cân đối.; chạy lại contract test sau thay đổi.
- Khi log đang bật debug, responsive ui: 1024px card trung tâm.; giữ secret ở server-side.
## 53. Error handling

Mục tiêu của phần này: Không lộ chi tiết nội bộ.

- Khi response là 400, error handling: Correlation ID nội bộ.; dùng timeout có giới hạn.
- Khi response là 200, error handling: Status rõ.; không retry nghiệp vụ không idempotent.
- Khi user bấm Hủy, error handling: Message thân thiện.; giữ correlation ID riêng.
- Khi user bấm Thêm account, error handling: Không stack trace.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Tiếp tục, error handling: Không raw error.message.; không ghi credential vào log.
- Khi chạy stress test, error handling: Correlation ID nội bộ.; dùng timeout có giới hạn.
- Khi kiểm tra CSP, error handling: Status rõ.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra keyboard, error handling: Message thân thiện.; giữ correlation ID riêng.
- Khi kiểm tra mobile, error handling: Không stack trace.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy, error handling: Không raw error.message.; không ghi credential vào log.
- Ở local, error handling: Correlation ID nội bộ.; dùng timeout có giới hạn.
- Ở staging, error handling: Status rõ.; không retry nghiệp vụ không idempotent.
- Ở production, error handling: Message thân thiện.; giữ correlation ID riêng.
- Trong CI, error handling: Không stack trace.; kiểm tra cấu hình trước khi gọi network.
- Trong manual QA, error handling: Không raw error.message.; không ghi credential vào log.
- Khi request đồng thời, error handling: Correlation ID nội bộ.; dùng timeout có giới hạn.
- Khi provider trả 429, error handling: Status rõ.; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx, error handling: Message thân thiện.; giữ correlation ID riêng.
- Khi callback bị refresh, error handling: Không stack trace.; kiểm tra cấu hình trước khi gọi network.
- Khi user mở nhiều tab, error handling: Không raw error.message.; không ghi credential vào log.
- Khi key vừa rotate, error handling: Correlation ID nội bộ.; dùng timeout có giới hạn.
- Khi project vừa revoke, error handling: Status rõ.; không retry nghiệp vụ không idempotent.
- Khi device hết hạn, error handling: Message thân thiện.; giữ correlation ID riêng.
- Khi profile thiếu optional field, error handling: Không stack trace.; kiểm tra cấu hình trước khi gọi network.
- Khi log đang bật debug, error handling: Không raw error.message.; không ghi credential vào log.
- Khi rollback deployment, error handling: Correlation ID nội bộ.; dùng timeout có giới hạn.
- Khi migration dữ liệu cũ, error handling: Status rõ.; không retry nghiệp vụ không idempotent.
- Khi network timeout, error handling: Message thân thiện.; giữ correlation ID riêng.
- Khi CAS conflict, error handling: Không stack trace.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401, error handling: Không raw error.message.; không ghi credential vào log.
## 54. Privacy

Mục tiêu của phần này: Giảm dữ liệu và bảo vệ profile.

- Khi chạy stress test, privacy: Chỉ chia sẻ field thống nhất.; xử lý lỗi theo contract.
- Khi kiểm tra CSP, privacy: Không lưu Google token.; ghi metric không chứa PII.
- Khi kiểm tra keyboard, privacy: Không trả provider subject.; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile, privacy: Allusers cần bảo vệ.; giữ secret ở server-side.
- Khi kiểm tra privacy, privacy: Retention có policy.; kiểm tra status code trước khi parse.
- Ở local, privacy: Chỉ chia sẻ field thống nhất.; xử lý lỗi theo contract.
- Ở staging, privacy: Không lưu Google token.; ghi metric không chứa PII.
- Ở production, privacy: Không trả provider subject.; chạy lại contract test sau thay đổi.
- Trong CI, privacy: Allusers cần bảo vệ.; giữ secret ở server-side.
- Trong manual QA, privacy: Retention có policy.; kiểm tra status code trước khi parse.
- Khi request đồng thời, privacy: Chỉ chia sẻ field thống nhất.; xử lý lỗi theo contract.
- Khi provider trả 429, privacy: Không lưu Google token.; ghi metric không chứa PII.
- Khi provider trả 5xx, privacy: Không trả provider subject.; chạy lại contract test sau thay đổi.
- Khi callback bị refresh, privacy: Allusers cần bảo vệ.; giữ secret ở server-side.
- Khi user mở nhiều tab, privacy: Retention có policy.; kiểm tra status code trước khi parse.
- Khi key vừa rotate, privacy: Chỉ chia sẻ field thống nhất.; xử lý lỗi theo contract.
- Khi project vừa revoke, privacy: Không lưu Google token.; ghi metric không chứa PII.
- Khi device hết hạn, privacy: Không trả provider subject.; chạy lại contract test sau thay đổi.
- Khi profile thiếu optional field, privacy: Allusers cần bảo vệ.; giữ secret ở server-side.
- Khi log đang bật debug, privacy: Retention có policy.; kiểm tra status code trước khi parse.
- Khi rollback deployment, privacy: Chỉ chia sẻ field thống nhất.; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ, privacy: Không lưu Google token.; ghi metric không chứa PII.
- Khi network timeout, privacy: Không trả provider subject.; chạy lại contract test sau thay đổi.
- Khi CAS conflict, privacy: Allusers cần bảo vệ.; giữ secret ở server-side.
- Khi response là 401, privacy: Retention có policy.; kiểm tra status code trước khi parse.
- Khi response là 400, privacy: Chỉ chia sẻ field thống nhất.; xử lý lỗi theo contract.
- Khi response là 200, privacy: Không lưu Google token.; ghi metric không chứa PII.
- Khi user bấm Hủy, privacy: Không trả provider subject.; chạy lại contract test sau thay đổi.
- Khi user bấm Thêm account, privacy: Allusers cần bảo vệ.; giữ secret ở server-side.
- Khi user bấm Tiếp tục, privacy: Retention có policy.; kiểm tra status code trước khi parse.
## 55. Observability

Mục tiêu của phần này: Đo đúng trạng thái mà không lộ secret.

- Ở local, observability: Đo status.; không retry nghiệp vụ không idempotent.
- Ở staging, observability: Đo retry.; giữ correlation ID riêng.
- Ở production, observability: Đo CAS conflict.; kiểm tra cấu hình trước khi gọi network.
- Trong CI, observability: Redact headers.; không ghi credential vào log.
- Trong manual QA, observability: Đo latency.; dùng timeout có giới hạn.
- Khi request đồng thời, observability: Đo status.; không retry nghiệp vụ không idempotent.
- Khi provider trả 429, observability: Đo retry.; giữ correlation ID riêng.
- Khi provider trả 5xx, observability: Đo CAS conflict.; kiểm tra cấu hình trước khi gọi network.
- Khi callback bị refresh, observability: Redact headers.; không ghi credential vào log.
- Khi user mở nhiều tab, observability: Đo latency.; dùng timeout có giới hạn.
- Khi key vừa rotate, observability: Đo status.; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke, observability: Đo retry.; giữ correlation ID riêng.
- Khi device hết hạn, observability: Đo CAS conflict.; kiểm tra cấu hình trước khi gọi network.
- Khi profile thiếu optional field, observability: Redact headers.; không ghi credential vào log.
- Khi log đang bật debug, observability: Đo latency.; dùng timeout có giới hạn.
- Khi rollback deployment, observability: Đo status.; không retry nghiệp vụ không idempotent.
- Khi migration dữ liệu cũ, observability: Đo retry.; giữ correlation ID riêng.
- Khi network timeout, observability: Đo CAS conflict.; kiểm tra cấu hình trước khi gọi network.
- Khi CAS conflict, observability: Redact headers.; không ghi credential vào log.
- Khi response là 401, observability: Đo latency.; dùng timeout có giới hạn.
- Khi response là 400, observability: Đo status.; không retry nghiệp vụ không idempotent.
- Khi response là 200, observability: Đo retry.; giữ correlation ID riêng.
- Khi user bấm Hủy, observability: Đo CAS conflict.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account, observability: Redact headers.; không ghi credential vào log.
- Khi user bấm Tiếp tục, observability: Đo latency.; dùng timeout có giới hạn.
- Khi chạy stress test, observability: Đo status.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra CSP, observability: Đo retry.; giữ correlation ID riêng.
- Khi kiểm tra keyboard, observability: Đo CAS conflict.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra mobile, observability: Redact headers.; không ghi credential vào log.
- Khi kiểm tra privacy, observability: Đo latency.; dùng timeout có giới hạn.
## 56. Load testing

Mục tiêu của phần này: Xác minh invariants khi burst.

- Khi request đồng thời, load testing: 100 token.; ghi metric không chứa PII.
- Khi provider trả 429, load testing: No duplicate.; chạy lại contract test sau thay đổi.
- Khi provider trả 5xx, load testing: Replay rejected.; giữ secret ở server-side.
- Khi callback bị refresh, load testing: 100 authorize.; kiểm tra status code trước khi parse.
- Khi user mở nhiều tab, load testing: 100 consent.; xử lý lỗi theo contract.
- Khi key vừa rotate, load testing: 100 token.; ghi metric không chứa PII.
- Khi project vừa revoke, load testing: No duplicate.; chạy lại contract test sau thay đổi.
- Khi device hết hạn, load testing: Replay rejected.; giữ secret ở server-side.
- Khi profile thiếu optional field, load testing: 100 authorize.; kiểm tra status code trước khi parse.
- Khi log đang bật debug, load testing: 100 consent.; xử lý lỗi theo contract.
- Khi rollback deployment, load testing: 100 token.; ghi metric không chứa PII.
- Khi migration dữ liệu cũ, load testing: No duplicate.; chạy lại contract test sau thay đổi.
- Khi network timeout, load testing: Replay rejected.; giữ secret ở server-side.
- Khi CAS conflict, load testing: 100 authorize.; kiểm tra status code trước khi parse.
- Khi response là 401, load testing: 100 consent.; xử lý lỗi theo contract.
- Khi response là 400, load testing: 100 token.; ghi metric không chứa PII.
- Khi response là 200, load testing: No duplicate.; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy, load testing: Replay rejected.; giữ secret ở server-side.
- Khi user bấm Thêm account, load testing: 100 authorize.; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục, load testing: 100 consent.; xử lý lỗi theo contract.
- Khi chạy stress test, load testing: 100 token.; ghi metric không chứa PII.
- Khi kiểm tra CSP, load testing: No duplicate.; chạy lại contract test sau thay đổi.
- Khi kiểm tra keyboard, load testing: Replay rejected.; giữ secret ở server-side.
- Khi kiểm tra mobile, load testing: 100 authorize.; kiểm tra status code trước khi parse.
- Khi kiểm tra privacy, load testing: 100 consent.; xử lý lỗi theo contract.
- Ở local, load testing: 100 token.; ghi metric không chứa PII.
- Ở staging, load testing: No duplicate.; chạy lại contract test sau thay đổi.
- Ở production, load testing: Replay rejected.; giữ secret ở server-side.
- Trong CI, load testing: 100 authorize.; kiểm tra status code trước khi parse.
- Trong manual QA, load testing: 100 consent.; xử lý lỗi theo contract.
## 57. Production deploy

Mục tiêu của phần này: Đưa artifact đã kiểm thử lên Pages.

- Khi key vừa rotate, production deploy: Deploy.; giữ correlation ID riêng.
- Khi project vừa revoke, production deploy: Production smoke.; kiểm tra cấu hình trước khi gọi network.
- Khi device hết hạn, production deploy: Node check.; không ghi credential vào log.
- Khi profile thiếu optional field, production deploy: Pages compile.; dùng timeout có giới hạn.
- Khi log đang bật debug, production deploy: Local smoke.; không retry nghiệp vụ không idempotent.
- Khi rollback deployment, production deploy: Deploy.; giữ correlation ID riêng.
- Khi migration dữ liệu cũ, production deploy: Production smoke.; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout, production deploy: Node check.; không ghi credential vào log.
- Khi CAS conflict, production deploy: Pages compile.; dùng timeout có giới hạn.
- Khi response là 401, production deploy: Local smoke.; không retry nghiệp vụ không idempotent.
- Khi response là 400, production deploy: Deploy.; giữ correlation ID riêng.
- Khi response là 200, production deploy: Production smoke.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Hủy, production deploy: Node check.; không ghi credential vào log.
- Khi user bấm Thêm account, production deploy: Pages compile.; dùng timeout có giới hạn.
- Khi user bấm Tiếp tục, production deploy: Local smoke.; không retry nghiệp vụ không idempotent.
- Khi chạy stress test, production deploy: Deploy.; giữ correlation ID riêng.
- Khi kiểm tra CSP, production deploy: Production smoke.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard, production deploy: Node check.; không ghi credential vào log.
- Khi kiểm tra mobile, production deploy: Pages compile.; dùng timeout có giới hạn.
- Khi kiểm tra privacy, production deploy: Local smoke.; không retry nghiệp vụ không idempotent.
- Ở local, production deploy: Deploy.; giữ correlation ID riêng.
- Ở staging, production deploy: Production smoke.; kiểm tra cấu hình trước khi gọi network.
- Ở production, production deploy: Node check.; không ghi credential vào log.
- Trong CI, production deploy: Pages compile.; dùng timeout có giới hạn.
- Trong manual QA, production deploy: Local smoke.; không retry nghiệp vụ không idempotent.
- Khi request đồng thời, production deploy: Deploy.; giữ correlation ID riêng.
- Khi provider trả 429, production deploy: Production smoke.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 5xx, production deploy: Node check.; không ghi credential vào log.
- Khi callback bị refresh, production deploy: Pages compile.; dùng timeout có giới hạn.
- Khi user mở nhiều tab, production deploy: Local smoke.; không retry nghiệp vụ không idempotent.
## 58. Rollback

Mục tiêu của phần này: Khôi phục an toàn khi deploy lỗi.

- Khi rollback deployment, rollback: Chạy smoke sau rollback.; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ, rollback: Giữ deployment cũ.; giữ secret ở server-side.
- Khi network timeout, rollback: Kiểm tra health.; kiểm tra status code trước khi parse.
- Khi CAS conflict, rollback: Không xóa dữ liệu vội.; xử lý lỗi theo contract.
- Khi response là 401, rollback: Thông báo owner.; ghi metric không chứa PII.
- Khi response là 400, rollback: Chạy smoke sau rollback.; chạy lại contract test sau thay đổi.
- Khi response là 200, rollback: Giữ deployment cũ.; giữ secret ở server-side.
- Khi user bấm Hủy, rollback: Kiểm tra health.; kiểm tra status code trước khi parse.
- Khi user bấm Thêm account, rollback: Không xóa dữ liệu vội.; xử lý lỗi theo contract.
- Khi user bấm Tiếp tục, rollback: Thông báo owner.; ghi metric không chứa PII.
- Khi chạy stress test, rollback: Chạy smoke sau rollback.; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP, rollback: Giữ deployment cũ.; giữ secret ở server-side.
- Khi kiểm tra keyboard, rollback: Kiểm tra health.; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile, rollback: Không xóa dữ liệu vội.; xử lý lỗi theo contract.
- Khi kiểm tra privacy, rollback: Thông báo owner.; ghi metric không chứa PII.
- Ở local, rollback: Chạy smoke sau rollback.; chạy lại contract test sau thay đổi.
- Ở staging, rollback: Giữ deployment cũ.; giữ secret ở server-side.
- Ở production, rollback: Kiểm tra health.; kiểm tra status code trước khi parse.
- Trong CI, rollback: Không xóa dữ liệu vội.; xử lý lỗi theo contract.
- Trong manual QA, rollback: Thông báo owner.; ghi metric không chứa PII.
- Khi request đồng thời, rollback: Chạy smoke sau rollback.; chạy lại contract test sau thay đổi.
- Khi provider trả 429, rollback: Giữ deployment cũ.; giữ secret ở server-side.
- Khi provider trả 5xx, rollback: Kiểm tra health.; kiểm tra status code trước khi parse.
- Khi callback bị refresh, rollback: Không xóa dữ liệu vội.; xử lý lỗi theo contract.
- Khi user mở nhiều tab, rollback: Thông báo owner.; ghi metric không chứa PII.
- Khi key vừa rotate, rollback: Chạy smoke sau rollback.; chạy lại contract test sau thay đổi.
- Khi project vừa revoke, rollback: Giữ deployment cũ.; giữ secret ở server-side.
- Khi device hết hạn, rollback: Kiểm tra health.; kiểm tra status code trước khi parse.
- Khi profile thiếu optional field, rollback: Không xóa dữ liệu vội.; xử lý lỗi theo contract.
- Khi log đang bật debug, rollback: Thông báo owner.; ghi metric không chứa PII.
## 59. Incident response

Mục tiêu của phần này: Xử lý lộ key, lỗi provider và outage.

- Khi response là 400, incident response: Rotate key.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200, incident response: Giảm burst.; không ghi credential vào log.
- Khi user bấm Hủy, incident response: Kiểm tra CAS.; dùng timeout có giới hạn.
- Khi user bấm Thêm account, incident response: Redact log.; không retry nghiệp vụ không idempotent.
- Khi user bấm Tiếp tục, incident response: Ghi audit.; giữ correlation ID riêng.
- Khi chạy stress test, incident response: Rotate key.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra CSP, incident response: Giảm burst.; không ghi credential vào log.
- Khi kiểm tra keyboard, incident response: Kiểm tra CAS.; dùng timeout có giới hạn.
- Khi kiểm tra mobile, incident response: Redact log.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy, incident response: Ghi audit.; giữ correlation ID riêng.
- Ở local, incident response: Rotate key.; kiểm tra cấu hình trước khi gọi network.
- Ở staging, incident response: Giảm burst.; không ghi credential vào log.
- Ở production, incident response: Kiểm tra CAS.; dùng timeout có giới hạn.
- Trong CI, incident response: Redact log.; không retry nghiệp vụ không idempotent.
- Trong manual QA, incident response: Ghi audit.; giữ correlation ID riêng.
- Khi request đồng thời, incident response: Rotate key.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 429, incident response: Giảm burst.; không ghi credential vào log.
- Khi provider trả 5xx, incident response: Kiểm tra CAS.; dùng timeout có giới hạn.
- Khi callback bị refresh, incident response: Redact log.; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab, incident response: Ghi audit.; giữ correlation ID riêng.
- Khi key vừa rotate, incident response: Rotate key.; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke, incident response: Giảm burst.; không ghi credential vào log.
- Khi device hết hạn, incident response: Kiểm tra CAS.; dùng timeout có giới hạn.
- Khi profile thiếu optional field, incident response: Redact log.; không retry nghiệp vụ không idempotent.
- Khi log đang bật debug, incident response: Ghi audit.; giữ correlation ID riêng.
- Khi rollback deployment, incident response: Rotate key.; kiểm tra cấu hình trước khi gọi network.
- Khi migration dữ liệu cũ, incident response: Giảm burst.; không ghi credential vào log.
- Khi network timeout, incident response: Kiểm tra CAS.; dùng timeout có giới hạn.
- Khi CAS conflict, incident response: Redact log.; không retry nghiệp vụ không idempotent.
- Khi response là 401, incident response: Ghi audit.; giữ correlation ID riêng.
## 60. Support

Mục tiêu của phần này: Chẩn đoán lỗi mà không yêu cầu secret.

- Khi chạy stress test, support: Hỏi endpoint.; giữ secret ở server-side.
- Khi kiểm tra CSP, support: Hỏi timestamp.; kiểm tra status code trước khi parse.
- Khi kiểm tra keyboard, support: Hỏi correlation ID.; xử lý lỗi theo contract.
- Khi kiểm tra mobile, support: Không hỏi API key.; ghi metric không chứa PII.
- Khi kiểm tra privacy, support: Hỏi status.; chạy lại contract test sau thay đổi.
- Ở local, support: Hỏi endpoint.; giữ secret ở server-side.
- Ở staging, support: Hỏi timestamp.; kiểm tra status code trước khi parse.
- Ở production, support: Hỏi correlation ID.; xử lý lỗi theo contract.
- Trong CI, support: Không hỏi API key.; ghi metric không chứa PII.
- Trong manual QA, support: Hỏi status.; chạy lại contract test sau thay đổi.
- Khi request đồng thời, support: Hỏi endpoint.; giữ secret ở server-side.
- Khi provider trả 429, support: Hỏi timestamp.; kiểm tra status code trước khi parse.
- Khi provider trả 5xx, support: Hỏi correlation ID.; xử lý lỗi theo contract.
- Khi callback bị refresh, support: Không hỏi API key.; ghi metric không chứa PII.
- Khi user mở nhiều tab, support: Hỏi status.; chạy lại contract test sau thay đổi.
- Khi key vừa rotate, support: Hỏi endpoint.; giữ secret ở server-side.
- Khi project vừa revoke, support: Hỏi timestamp.; kiểm tra status code trước khi parse.
- Khi device hết hạn, support: Hỏi correlation ID.; xử lý lỗi theo contract.
- Khi profile thiếu optional field, support: Không hỏi API key.; ghi metric không chứa PII.
- Khi log đang bật debug, support: Hỏi status.; chạy lại contract test sau thay đổi.
- Khi rollback deployment, support: Hỏi endpoint.; giữ secret ở server-side.
- Khi migration dữ liệu cũ, support: Hỏi timestamp.; kiểm tra status code trước khi parse.
- Khi network timeout, support: Hỏi correlation ID.; xử lý lỗi theo contract.
- Khi CAS conflict, support: Không hỏi API key.; ghi metric không chứa PII.
- Khi response là 401, support: Hỏi status.; chạy lại contract test sau thay đổi.
- Khi response là 400, support: Hỏi endpoint.; giữ secret ở server-side.
- Khi response là 200, support: Hỏi timestamp.; kiểm tra status code trước khi parse.
- Khi user bấm Hủy, support: Hỏi correlation ID.; xử lý lỗi theo contract.
- Khi user bấm Thêm account, support: Không hỏi API key.; ghi metric không chứa PII.
- Khi user bấm Tiếp tục, support: Hỏi status.; chạy lại contract test sau thay đổi.
## 61. CI contract

Mục tiêu của phần này: Chặn deploy khi contract bị phá.

- Ở local, ci contract: Replay test.; không ghi credential vào log.
- Ở staging, ci contract: CSP test.; dùng timeout có giới hạn.
- Ở production, ci contract: Stress invariant.; không retry nghiệp vụ không idempotent.
- Trong CI, ci contract: Node check.; giữ correlation ID riêng.
- Trong manual QA, ci contract: Token test.; kiểm tra cấu hình trước khi gọi network.
- Khi request đồng thời, ci contract: Replay test.; không ghi credential vào log.
- Khi provider trả 429, ci contract: CSP test.; dùng timeout có giới hạn.
- Khi provider trả 5xx, ci contract: Stress invariant.; không retry nghiệp vụ không idempotent.
- Khi callback bị refresh, ci contract: Node check.; giữ correlation ID riêng.
- Khi user mở nhiều tab, ci contract: Token test.; kiểm tra cấu hình trước khi gọi network.
- Khi key vừa rotate, ci contract: Replay test.; không ghi credential vào log.
- Khi project vừa revoke, ci contract: CSP test.; dùng timeout có giới hạn.
- Khi device hết hạn, ci contract: Stress invariant.; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field, ci contract: Node check.; giữ correlation ID riêng.
- Khi log đang bật debug, ci contract: Token test.; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment, ci contract: Replay test.; không ghi credential vào log.
- Khi migration dữ liệu cũ, ci contract: CSP test.; dùng timeout có giới hạn.
- Khi network timeout, ci contract: Stress invariant.; không retry nghiệp vụ không idempotent.
- Khi CAS conflict, ci contract: Node check.; giữ correlation ID riêng.
- Khi response là 401, ci contract: Token test.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 400, ci contract: Replay test.; không ghi credential vào log.
- Khi response là 200, ci contract: CSP test.; dùng timeout có giới hạn.
- Khi user bấm Hủy, ci contract: Stress invariant.; không retry nghiệp vụ không idempotent.
- Khi user bấm Thêm account, ci contract: Node check.; giữ correlation ID riêng.
- Khi user bấm Tiếp tục, ci contract: Token test.; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test, ci contract: Replay test.; không ghi credential vào log.
- Khi kiểm tra CSP, ci contract: CSP test.; dùng timeout có giới hạn.
- Khi kiểm tra keyboard, ci contract: Stress invariant.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra mobile, ci contract: Node check.; giữ correlation ID riêng.
- Khi kiểm tra privacy, ci contract: Token test.; kiểm tra cấu hình trước khi gọi network.
## 62. Backend Node

Mục tiêu của phần này: Mẫu tích hợp Node/Express an toàn.

- Khi request đồng thời, backend node: env API key.; kiểm tra status code trước khi parse.
- Khi provider trả 429, backend node: redirect nội bộ.; xử lý lỗi theo contract.
- Khi provider trả 5xx, backend node: crypto.randomUUID.; ghi metric không chứa PII.
- Khi callback bị refresh, backend node: session server-side.; chạy lại contract test sau thay đổi.
- Khi user mở nhiều tab, backend node: fetch timeout.; giữ secret ở server-side.
- Khi key vừa rotate, backend node: env API key.; kiểm tra status code trước khi parse.
- Khi project vừa revoke, backend node: redirect nội bộ.; xử lý lỗi theo contract.
- Khi device hết hạn, backend node: crypto.randomUUID.; ghi metric không chứa PII.
- Khi profile thiếu optional field, backend node: session server-side.; chạy lại contract test sau thay đổi.
- Khi log đang bật debug, backend node: fetch timeout.; giữ secret ở server-side.
- Khi rollback deployment, backend node: env API key.; kiểm tra status code trước khi parse.
- Khi migration dữ liệu cũ, backend node: redirect nội bộ.; xử lý lỗi theo contract.
- Khi network timeout, backend node: crypto.randomUUID.; ghi metric không chứa PII.
- Khi CAS conflict, backend node: session server-side.; chạy lại contract test sau thay đổi.
- Khi response là 401, backend node: fetch timeout.; giữ secret ở server-side.
- Khi response là 400, backend node: env API key.; kiểm tra status code trước khi parse.
- Khi response là 200, backend node: redirect nội bộ.; xử lý lỗi theo contract.
- Khi user bấm Hủy, backend node: crypto.randomUUID.; ghi metric không chứa PII.
- Khi user bấm Thêm account, backend node: session server-side.; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục, backend node: fetch timeout.; giữ secret ở server-side.
- Khi chạy stress test, backend node: env API key.; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP, backend node: redirect nội bộ.; xử lý lỗi theo contract.
- Khi kiểm tra keyboard, backend node: crypto.randomUUID.; ghi metric không chứa PII.
- Khi kiểm tra mobile, backend node: session server-side.; chạy lại contract test sau thay đổi.
- Khi kiểm tra privacy, backend node: fetch timeout.; giữ secret ở server-side.
- Ở local, backend node: env API key.; kiểm tra status code trước khi parse.
- Ở staging, backend node: redirect nội bộ.; xử lý lỗi theo contract.
- Ở production, backend node: crypto.randomUUID.; ghi metric không chứa PII.
- Trong CI, backend node: session server-side.; chạy lại contract test sau thay đổi.
- Trong manual QA, backend node: fetch timeout.; giữ secret ở server-side.
## 63. Backend Python

Mục tiêu của phần này: Mẫu tích hợp FastAPI async.

- Khi key vừa rotate, backend python: no raw exception.; dùng timeout có giới hạn.
- Khi project vừa revoke, backend python: secrets token.; không retry nghiệp vụ không idempotent.
- Khi device hết hạn, backend python: httpx timeout.; giữ correlation ID riêng.
- Khi profile thiếu optional field, backend python: session middleware.; kiểm tra cấu hình trước khi gọi network.
- Khi log đang bật debug, backend python: JSON response.; không ghi credential vào log.
- Khi rollback deployment, backend python: no raw exception.; dùng timeout có giới hạn.
- Khi migration dữ liệu cũ, backend python: secrets token.; không retry nghiệp vụ không idempotent.
- Khi network timeout, backend python: httpx timeout.; giữ correlation ID riêng.
- Khi CAS conflict, backend python: session middleware.; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401, backend python: JSON response.; không ghi credential vào log.
- Khi response là 400, backend python: no raw exception.; dùng timeout có giới hạn.
- Khi response là 200, backend python: secrets token.; không retry nghiệp vụ không idempotent.
- Khi user bấm Hủy, backend python: httpx timeout.; giữ correlation ID riêng.
- Khi user bấm Thêm account, backend python: session middleware.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Tiếp tục, backend python: JSON response.; không ghi credential vào log.
- Khi chạy stress test, backend python: no raw exception.; dùng timeout có giới hạn.
- Khi kiểm tra CSP, backend python: secrets token.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra keyboard, backend python: httpx timeout.; giữ correlation ID riêng.
- Khi kiểm tra mobile, backend python: session middleware.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy, backend python: JSON response.; không ghi credential vào log.
- Ở local, backend python: no raw exception.; dùng timeout có giới hạn.
- Ở staging, backend python: secrets token.; không retry nghiệp vụ không idempotent.
- Ở production, backend python: httpx timeout.; giữ correlation ID riêng.
- Trong CI, backend python: session middleware.; kiểm tra cấu hình trước khi gọi network.
- Trong manual QA, backend python: JSON response.; không ghi credential vào log.
- Khi request đồng thời, backend python: no raw exception.; dùng timeout có giới hạn.
- Khi provider trả 429, backend python: secrets token.; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx, backend python: httpx timeout.; giữ correlation ID riêng.
- Khi callback bị refresh, backend python: session middleware.; kiểm tra cấu hình trước khi gọi network.
- Khi user mở nhiều tab, backend python: JSON response.; không ghi credential vào log.
## 64. Backend Go

Mục tiêu của phần này: Mẫu tích hợp Go context-aware.

- Khi rollback deployment, backend go: crypto/rand.; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ, backend go: context timeout.; ghi metric không chứa PII.
- Khi network timeout, backend go: close body.; chạy lại contract test sau thay đổi.
- Khi CAS conflict, backend go: secret manager.; giữ secret ở server-side.
- Khi response là 401, backend go: status check.; kiểm tra status code trước khi parse.
- Khi response là 400, backend go: crypto/rand.; xử lý lỗi theo contract.
- Khi response là 200, backend go: context timeout.; ghi metric không chứa PII.
- Khi user bấm Hủy, backend go: close body.; chạy lại contract test sau thay đổi.
- Khi user bấm Thêm account, backend go: secret manager.; giữ secret ở server-side.
- Khi user bấm Tiếp tục, backend go: status check.; kiểm tra status code trước khi parse.
- Khi chạy stress test, backend go: crypto/rand.; xử lý lỗi theo contract.
- Khi kiểm tra CSP, backend go: context timeout.; ghi metric không chứa PII.
- Khi kiểm tra keyboard, backend go: close body.; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile, backend go: secret manager.; giữ secret ở server-side.
- Khi kiểm tra privacy, backend go: status check.; kiểm tra status code trước khi parse.
- Ở local, backend go: crypto/rand.; xử lý lỗi theo contract.
- Ở staging, backend go: context timeout.; ghi metric không chứa PII.
- Ở production, backend go: close body.; chạy lại contract test sau thay đổi.
- Trong CI, backend go: secret manager.; giữ secret ở server-side.
- Trong manual QA, backend go: status check.; kiểm tra status code trước khi parse.
- Khi request đồng thời, backend go: crypto/rand.; xử lý lỗi theo contract.
- Khi provider trả 429, backend go: context timeout.; ghi metric không chứa PII.
- Khi provider trả 5xx, backend go: close body.; chạy lại contract test sau thay đổi.
- Khi callback bị refresh, backend go: secret manager.; giữ secret ở server-side.
- Khi user mở nhiều tab, backend go: status check.; kiểm tra status code trước khi parse.
- Khi key vừa rotate, backend go: crypto/rand.; xử lý lỗi theo contract.
- Khi project vừa revoke, backend go: context timeout.; ghi metric không chứa PII.
- Khi device hết hạn, backend go: close body.; chạy lại contract test sau thay đổi.
- Khi profile thiếu optional field, backend go: secret manager.; giữ secret ở server-side.
- Khi log đang bật debug, backend go: status check.; kiểm tra status code trước khi parse.
## 65. Backend PHP

Mục tiêu của phần này: Mẫu tích hợp Laravel.

- Khi response là 400, backend php: Http timeout.; không retry nghiệp vụ không idempotent.
- Khi response là 200, backend php: config secret.; giữ correlation ID riêng.
- Khi user bấm Hủy, backend php: status check.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account, backend php: Auth login.; không ghi credential vào log.
- Khi user bấm Tiếp tục, backend php: session state.; dùng timeout có giới hạn.
- Khi chạy stress test, backend php: Http timeout.; không retry nghiệp vụ không idempotent.
- Khi kiểm tra CSP, backend php: config secret.; giữ correlation ID riêng.
- Khi kiểm tra keyboard, backend php: status check.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra mobile, backend php: Auth login.; không ghi credential vào log.
- Khi kiểm tra privacy, backend php: session state.; dùng timeout có giới hạn.
- Ở local, backend php: Http timeout.; không retry nghiệp vụ không idempotent.
- Ở staging, backend php: config secret.; giữ correlation ID riêng.
- Ở production, backend php: status check.; kiểm tra cấu hình trước khi gọi network.
- Trong CI, backend php: Auth login.; không ghi credential vào log.
- Trong manual QA, backend php: session state.; dùng timeout có giới hạn.
- Khi request đồng thời, backend php: Http timeout.; không retry nghiệp vụ không idempotent.
- Khi provider trả 429, backend php: config secret.; giữ correlation ID riêng.
- Khi provider trả 5xx, backend php: status check.; kiểm tra cấu hình trước khi gọi network.
- Khi callback bị refresh, backend php: Auth login.; không ghi credential vào log.
- Khi user mở nhiều tab, backend php: session state.; dùng timeout có giới hạn.
- Khi key vừa rotate, backend php: Http timeout.; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke, backend php: config secret.; giữ correlation ID riêng.
- Khi device hết hạn, backend php: status check.; kiểm tra cấu hình trước khi gọi network.
- Khi profile thiếu optional field, backend php: Auth login.; không ghi credential vào log.
- Khi log đang bật debug, backend php: session state.; dùng timeout có giới hạn.
- Khi rollback deployment, backend php: Http timeout.; không retry nghiệp vụ không idempotent.
- Khi migration dữ liệu cũ, backend php: config secret.; giữ correlation ID riêng.
- Khi network timeout, backend php: status check.; kiểm tra cấu hình trước khi gọi network.
- Khi CAS conflict, backend php: Auth login.; không ghi credential vào log.
- Khi response là 401, backend php: session state.; dùng timeout có giới hạn.
## 66. Backend Workers

Mục tiêu của phần này: Mẫu tích hợp Cloudflare Workers.

- Khi chạy stress test, backend workers: fetch async.; ghi metric không chứa PII.
- Khi kiểm tra CSP, backend workers: no public key.; chạy lại contract test sau thay đổi.
- Khi kiểm tra keyboard, backend workers: no raw token.; giữ secret ở server-side.
- Khi kiểm tra mobile, backend workers: env secret.; kiểm tra status code trước khi parse.
- Khi kiểm tra privacy, backend workers: Response redirect.; xử lý lỗi theo contract.
- Ở local, backend workers: fetch async.; ghi metric không chứa PII.
- Ở staging, backend workers: no public key.; chạy lại contract test sau thay đổi.
- Ở production, backend workers: no raw token.; giữ secret ở server-side.
- Trong CI, backend workers: env secret.; kiểm tra status code trước khi parse.
- Trong manual QA, backend workers: Response redirect.; xử lý lỗi theo contract.
- Khi request đồng thời, backend workers: fetch async.; ghi metric không chứa PII.
- Khi provider trả 429, backend workers: no public key.; chạy lại contract test sau thay đổi.
- Khi provider trả 5xx, backend workers: no raw token.; giữ secret ở server-side.
- Khi callback bị refresh, backend workers: env secret.; kiểm tra status code trước khi parse.
- Khi user mở nhiều tab, backend workers: Response redirect.; xử lý lỗi theo contract.
- Khi key vừa rotate, backend workers: fetch async.; ghi metric không chứa PII.
- Khi project vừa revoke, backend workers: no public key.; chạy lại contract test sau thay đổi.
- Khi device hết hạn, backend workers: no raw token.; giữ secret ở server-side.
- Khi profile thiếu optional field, backend workers: env secret.; kiểm tra status code trước khi parse.
- Khi log đang bật debug, backend workers: Response redirect.; xử lý lỗi theo contract.
- Khi rollback deployment, backend workers: fetch async.; ghi metric không chứa PII.
- Khi migration dữ liệu cũ, backend workers: no public key.; chạy lại contract test sau thay đổi.
- Khi network timeout, backend workers: no raw token.; giữ secret ở server-side.
- Khi CAS conflict, backend workers: env secret.; kiểm tra status code trước khi parse.
- Khi response là 401, backend workers: Response redirect.; xử lý lỗi theo contract.
- Khi response là 400, backend workers: fetch async.; ghi metric không chứa PII.
- Khi response là 200, backend workers: no public key.; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy, backend workers: no raw token.; giữ secret ở server-side.
- Khi user bấm Thêm account, backend workers: env secret.; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục, backend workers: Response redirect.; xử lý lỗi theo contract.
## 67. FAQ

Mục tiêu của phần này: Các câu hỏi thường gặp của developer.

- Ở local, faq: id APIUYTIN.; giữ correlation ID riêng.
- Ở staging, faq: rotate khi mất key.; kiểm tra cấu hình trước khi gọi network.
- Ở production, faq: API key server-only.; không ghi credential vào log.
- Trong CI, faq: Google bootstrap.; dùng timeout có giới hạn.
- Trong manual QA, faq: Code one-time.; không retry nghiệp vụ không idempotent.
- Khi request đồng thời, faq: id APIUYTIN.; giữ correlation ID riêng.
- Khi provider trả 429, faq: rotate khi mất key.; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 5xx, faq: API key server-only.; không ghi credential vào log.
- Khi callback bị refresh, faq: Google bootstrap.; dùng timeout có giới hạn.
- Khi user mở nhiều tab, faq: Code one-time.; không retry nghiệp vụ không idempotent.
- Khi key vừa rotate, faq: id APIUYTIN.; giữ correlation ID riêng.
- Khi project vừa revoke, faq: rotate khi mất key.; kiểm tra cấu hình trước khi gọi network.
- Khi device hết hạn, faq: API key server-only.; không ghi credential vào log.
- Khi profile thiếu optional field, faq: Google bootstrap.; dùng timeout có giới hạn.
- Khi log đang bật debug, faq: Code one-time.; không retry nghiệp vụ không idempotent.
- Khi rollback deployment, faq: id APIUYTIN.; giữ correlation ID riêng.
- Khi migration dữ liệu cũ, faq: rotate khi mất key.; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout, faq: API key server-only.; không ghi credential vào log.
- Khi CAS conflict, faq: Google bootstrap.; dùng timeout có giới hạn.
- Khi response là 401, faq: Code one-time.; không retry nghiệp vụ không idempotent.
- Khi response là 400, faq: id APIUYTIN.; giữ correlation ID riêng.
- Khi response là 200, faq: rotate khi mất key.; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Hủy, faq: API key server-only.; không ghi credential vào log.
- Khi user bấm Thêm account, faq: Google bootstrap.; dùng timeout có giới hạn.
- Khi user bấm Tiếp tục, faq: Code one-time.; không retry nghiệp vụ không idempotent.
- Khi chạy stress test, faq: id APIUYTIN.; giữ correlation ID riêng.
- Khi kiểm tra CSP, faq: rotate khi mất key.; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard, faq: API key server-only.; không ghi credential vào log.
- Khi kiểm tra mobile, faq: Google bootstrap.; dùng timeout có giới hạn.
- Khi kiểm tra privacy, faq: Code one-time.; không retry nghiệp vụ không idempotent.
## 64. Scenario: Login account đã nhớ

Mục tiêu: xử lý login account đã nhớ mà vẫn giữ đúng authorization boundary.

- Ở local: kiểm tra state mới trong scenario login account đã nhớ; kiểm tra cấu hình trước khi gọi network.
- Ở staging: kiểm tra device cookie hợp lệ trong scenario login account đã nhớ; giữ secret ở server-side.
- Ở production: kiểm tra account card hiển thị trong scenario login account đã nhớ; không ghi credential vào log.
- Trong CI: kiểm tra continue trong scenario login account đã nhớ; kiểm tra status code trước khi parse.
- Trong manual QA: kiểm tra code callback trong scenario login account đã nhớ; dùng timeout có giới hạn.
- Khi request đồng thời: kiểm tra state mới trong scenario login account đã nhớ; xử lý lỗi theo contract.
- Khi provider trả 429: kiểm tra device cookie hợp lệ trong scenario login account đã nhớ; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx: kiểm tra account card hiển thị trong scenario login account đã nhớ; ghi metric không chứa PII.
- Khi callback bị refresh: kiểm tra continue trong scenario login account đã nhớ; giữ correlation ID riêng.
- Khi user mở nhiều tab: kiểm tra code callback trong scenario login account đã nhớ; chạy lại contract test sau thay đổi.
- Khi key vừa rotate: kiểm tra state mới trong scenario login account đã nhớ; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke: kiểm tra device cookie hợp lệ trong scenario login account đã nhớ; giữ secret ở server-side.
- Khi device hết hạn: kiểm tra account card hiển thị trong scenario login account đã nhớ; không ghi credential vào log.
- Khi profile thiếu optional field: kiểm tra continue trong scenario login account đã nhớ; kiểm tra status code trước khi parse.
- Khi log đang bật debug: kiểm tra code callback trong scenario login account đã nhớ; dùng timeout có giới hạn.
- Khi rollback deployment: kiểm tra state mới trong scenario login account đã nhớ; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ: kiểm tra device cookie hợp lệ trong scenario login account đã nhớ; không retry nghiệp vụ không idempotent.
- Khi network timeout: kiểm tra account card hiển thị trong scenario login account đã nhớ; ghi metric không chứa PII.
- Khi CAS conflict: kiểm tra continue trong scenario login account đã nhớ; giữ correlation ID riêng.
- Khi response là 401: kiểm tra code callback trong scenario login account đã nhớ; chạy lại contract test sau thay đổi.
- Khi response là 400: kiểm tra state mới trong scenario login account đã nhớ; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200: kiểm tra device cookie hợp lệ trong scenario login account đã nhớ; giữ secret ở server-side.
- Khi user bấm Hủy: kiểm tra account card hiển thị trong scenario login account đã nhớ; không ghi credential vào log.
- Khi user bấm Thêm account: kiểm tra continue trong scenario login account đã nhớ; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục: kiểm tra code callback trong scenario login account đã nhớ; dùng timeout có giới hạn.
## 65. Scenario: Login thiết bị mới

Mục tiêu: xử lý login thiết bị mới mà vẫn giữ đúng authorization boundary.

- Trong CI: kiểm tra chooser rỗng trong scenario login thiết bị mới; giữ secret ở server-side.
- Trong manual QA: kiểm tra add account trong scenario login thiết bị mới; không ghi credential vào log.
- Khi request đồng thời: kiểm tra Google bootstrap trong scenario login thiết bị mới; kiểm tra status code trước khi parse.
- Khi provider trả 429: kiểm tra quay lại consent trong scenario login thiết bị mới; dùng timeout có giới hạn.
- Khi provider trả 5xx: kiểm tra device cookie chưa có trong scenario login thiết bị mới; xử lý lỗi theo contract.
- Khi callback bị refresh: kiểm tra chooser rỗng trong scenario login thiết bị mới; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab: kiểm tra add account trong scenario login thiết bị mới; ghi metric không chứa PII.
- Khi key vừa rotate: kiểm tra Google bootstrap trong scenario login thiết bị mới; giữ correlation ID riêng.
- Khi project vừa revoke: kiểm tra quay lại consent trong scenario login thiết bị mới; chạy lại contract test sau thay đổi.
- Khi device hết hạn: kiểm tra device cookie chưa có trong scenario login thiết bị mới; kiểm tra cấu hình trước khi gọi network.
- Khi profile thiếu optional field: kiểm tra chooser rỗng trong scenario login thiết bị mới; giữ secret ở server-side.
- Khi log đang bật debug: kiểm tra add account trong scenario login thiết bị mới; không ghi credential vào log.
- Khi rollback deployment: kiểm tra Google bootstrap trong scenario login thiết bị mới; kiểm tra status code trước khi parse.
- Khi migration dữ liệu cũ: kiểm tra quay lại consent trong scenario login thiết bị mới; dùng timeout có giới hạn.
- Khi network timeout: kiểm tra device cookie chưa có trong scenario login thiết bị mới; xử lý lỗi theo contract.
- Khi CAS conflict: kiểm tra chooser rỗng trong scenario login thiết bị mới; không retry nghiệp vụ không idempotent.
- Khi response là 401: kiểm tra add account trong scenario login thiết bị mới; ghi metric không chứa PII.
- Khi response là 400: kiểm tra Google bootstrap trong scenario login thiết bị mới; giữ correlation ID riêng.
- Khi response là 200: kiểm tra quay lại consent trong scenario login thiết bị mới; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy: kiểm tra device cookie chưa có trong scenario login thiết bị mới; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account: kiểm tra chooser rỗng trong scenario login thiết bị mới; giữ secret ở server-side.
- Khi user bấm Tiếp tục: kiểm tra add account trong scenario login thiết bị mới; không ghi credential vào log.
- Khi chạy stress test: kiểm tra Google bootstrap trong scenario login thiết bị mới; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP: kiểm tra quay lại consent trong scenario login thiết bị mới; dùng timeout có giới hạn.
- Khi kiểm tra keyboard: kiểm tra device cookie chưa có trong scenario login thiết bị mới; xử lý lỗi theo contract.
## 66. Scenario: Thêm account thứ hai

Mục tiêu: xử lý thêm account thứ hai mà vẫn giữ đúng authorization boundary.

- Khi provider trả 429: kiểm tra Google state trong scenario thêm account thứ hai; không ghi credential vào log.
- Khi provider trả 5xx: kiểm tra link deterministic trong scenario thêm account thứ hai; kiểm tra status code trước khi parse.
- Khi callback bị refresh: kiểm tra chọn account mới trong scenario thêm account thứ hai; dùng timeout có giới hạn.
- Khi user mở nhiều tab: kiểm tra transaction còn hạn trong scenario thêm account thứ hai; xử lý lỗi theo contract.
- Khi key vừa rotate: kiểm tra device match trong scenario thêm account thứ hai; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke: kiểm tra Google state trong scenario thêm account thứ hai; ghi metric không chứa PII.
- Khi device hết hạn: kiểm tra link deterministic trong scenario thêm account thứ hai; giữ correlation ID riêng.
- Khi profile thiếu optional field: kiểm tra chọn account mới trong scenario thêm account thứ hai; chạy lại contract test sau thay đổi.
- Khi log đang bật debug: kiểm tra transaction còn hạn trong scenario thêm account thứ hai; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment: kiểm tra device match trong scenario thêm account thứ hai; giữ secret ở server-side.
- Khi migration dữ liệu cũ: kiểm tra Google state trong scenario thêm account thứ hai; không ghi credential vào log.
- Khi network timeout: kiểm tra link deterministic trong scenario thêm account thứ hai; kiểm tra status code trước khi parse.
- Khi CAS conflict: kiểm tra chọn account mới trong scenario thêm account thứ hai; dùng timeout có giới hạn.
- Khi response là 401: kiểm tra transaction còn hạn trong scenario thêm account thứ hai; xử lý lỗi theo contract.
- Khi response là 400: kiểm tra device match trong scenario thêm account thứ hai; không retry nghiệp vụ không idempotent.
- Khi response là 200: kiểm tra Google state trong scenario thêm account thứ hai; ghi metric không chứa PII.
- Khi user bấm Hủy: kiểm tra link deterministic trong scenario thêm account thứ hai; giữ correlation ID riêng.
- Khi user bấm Thêm account: kiểm tra chọn account mới trong scenario thêm account thứ hai; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục: kiểm tra transaction còn hạn trong scenario thêm account thứ hai; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test: kiểm tra device match trong scenario thêm account thứ hai; giữ secret ở server-side.
- Khi kiểm tra CSP: kiểm tra Google state trong scenario thêm account thứ hai; không ghi credential vào log.
- Khi kiểm tra keyboard: kiểm tra link deterministic trong scenario thêm account thứ hai; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile: kiểm tra chọn account mới trong scenario thêm account thứ hai; dùng timeout có giới hạn.
- Khi kiểm tra privacy: kiểm tra transaction còn hạn trong scenario thêm account thứ hai; xử lý lỗi theo contract.
- Ở local: kiểm tra device match trong scenario thêm account thứ hai; không retry nghiệp vụ không idempotent.
## 67. Scenario: Bấm Hủy

Mục tiêu: xử lý bấm hủy mà vẫn giữ đúng authorization boundary.

- Khi user mở nhiều tab: kiểm tra access_denied trong scenario bấm hủy; kiểm tra status code trước khi parse.
- Khi key vừa rotate: kiểm tra state giữ nguyên trong scenario bấm hủy; dùng timeout có giới hạn.
- Khi project vừa revoke: kiểm tra cancel intent trong scenario bấm hủy; xử lý lỗi theo contract.
- Khi device hết hạn: kiểm tra device match trong scenario bấm hủy; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field: kiểm tra transaction canceled trong scenario bấm hủy; ghi metric không chứa PII.
- Khi log đang bật debug: kiểm tra access_denied trong scenario bấm hủy; giữ correlation ID riêng.
- Khi rollback deployment: kiểm tra state giữ nguyên trong scenario bấm hủy; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ: kiểm tra cancel intent trong scenario bấm hủy; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout: kiểm tra device match trong scenario bấm hủy; giữ secret ở server-side.
- Khi CAS conflict: kiểm tra transaction canceled trong scenario bấm hủy; không ghi credential vào log.
- Khi response là 401: kiểm tra access_denied trong scenario bấm hủy; kiểm tra status code trước khi parse.
- Khi response là 400: kiểm tra state giữ nguyên trong scenario bấm hủy; dùng timeout có giới hạn.
- Khi response là 200: kiểm tra cancel intent trong scenario bấm hủy; xử lý lỗi theo contract.
- Khi user bấm Hủy: kiểm tra device match trong scenario bấm hủy; không retry nghiệp vụ không idempotent.
- Khi user bấm Thêm account: kiểm tra transaction canceled trong scenario bấm hủy; ghi metric không chứa PII.
- Khi user bấm Tiếp tục: kiểm tra access_denied trong scenario bấm hủy; giữ correlation ID riêng.
- Khi chạy stress test: kiểm tra state giữ nguyên trong scenario bấm hủy; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP: kiểm tra cancel intent trong scenario bấm hủy; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard: kiểm tra device match trong scenario bấm hủy; giữ secret ở server-side.
- Khi kiểm tra mobile: kiểm tra transaction canceled trong scenario bấm hủy; không ghi credential vào log.
- Khi kiểm tra privacy: kiểm tra access_denied trong scenario bấm hủy; kiểm tra status code trước khi parse.
- Ở local: kiểm tra state giữ nguyên trong scenario bấm hủy; dùng timeout có giới hạn.
- Ở staging: kiểm tra cancel intent trong scenario bấm hủy; xử lý lỗi theo contract.
- Ở production: kiểm tra device match trong scenario bấm hủy; không retry nghiệp vụ không idempotent.
- Trong CI: kiểm tra transaction canceled trong scenario bấm hủy; ghi metric không chứa PII.
## 68. Scenario: State sai

Mục tiêu: xử lý state sai mà vẫn giữ đúng authorization boundary.

- Khi device hết hạn: kiểm tra flow mới trong scenario state sai; dùng timeout có giới hạn.
- Khi profile thiếu optional field: kiểm tra callback state trong scenario state sai; xử lý lỗi theo contract.
- Khi log đang bật debug: kiểm tra session state trong scenario state sai; không retry nghiệp vụ không idempotent.
- Khi rollback deployment: kiểm tra exact compare trong scenario state sai; ghi metric không chứa PII.
- Khi migration dữ liệu cũ: kiểm tra fail closed trong scenario state sai; giữ correlation ID riêng.
- Khi network timeout: kiểm tra flow mới trong scenario state sai; chạy lại contract test sau thay đổi.
- Khi CAS conflict: kiểm tra callback state trong scenario state sai; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401: kiểm tra session state trong scenario state sai; giữ secret ở server-side.
- Khi response là 400: kiểm tra exact compare trong scenario state sai; không ghi credential vào log.
- Khi response là 200: kiểm tra fail closed trong scenario state sai; kiểm tra status code trước khi parse.
- Khi user bấm Hủy: kiểm tra flow mới trong scenario state sai; dùng timeout có giới hạn.
- Khi user bấm Thêm account: kiểm tra callback state trong scenario state sai; xử lý lỗi theo contract.
- Khi user bấm Tiếp tục: kiểm tra session state trong scenario state sai; không retry nghiệp vụ không idempotent.
- Khi chạy stress test: kiểm tra exact compare trong scenario state sai; ghi metric không chứa PII.
- Khi kiểm tra CSP: kiểm tra fail closed trong scenario state sai; giữ correlation ID riêng.
- Khi kiểm tra keyboard: kiểm tra flow mới trong scenario state sai; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile: kiểm tra callback state trong scenario state sai; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy: kiểm tra session state trong scenario state sai; giữ secret ở server-side.
- Ở local: kiểm tra exact compare trong scenario state sai; không ghi credential vào log.
- Ở staging: kiểm tra fail closed trong scenario state sai; kiểm tra status code trước khi parse.
- Ở production: kiểm tra flow mới trong scenario state sai; dùng timeout có giới hạn.
- Trong CI: kiểm tra callback state trong scenario state sai; xử lý lỗi theo contract.
- Trong manual QA: kiểm tra session state trong scenario state sai; không retry nghiệp vụ không idempotent.
- Khi request đồng thời: kiểm tra exact compare trong scenario state sai; ghi metric không chứa PII.
- Khi provider trả 429: kiểm tra fail closed trong scenario state sai; giữ correlation ID riêng.
## 69. Scenario: Redirect sai

Mục tiêu: xử lý redirect sai mà vẫn giữ đúng authorization boundary.

- Khi rollback deployment: kiểm tra client ID trong scenario redirect sai; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ: kiểm tra registered URI trong scenario redirect sai; không retry nghiệp vụ không idempotent.
- Khi network timeout: kiểm tra exact compare trong scenario redirect sai; ghi metric không chứa PII.
- Khi CAS conflict: kiểm tra invalid client trong scenario redirect sai; giữ correlation ID riêng.
- Khi response là 401: kiểm tra config fix trong scenario redirect sai; chạy lại contract test sau thay đổi.
- Khi response là 400: kiểm tra client ID trong scenario redirect sai; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200: kiểm tra registered URI trong scenario redirect sai; giữ secret ở server-side.
- Khi user bấm Hủy: kiểm tra exact compare trong scenario redirect sai; không ghi credential vào log.
- Khi user bấm Thêm account: kiểm tra invalid client trong scenario redirect sai; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục: kiểm tra config fix trong scenario redirect sai; dùng timeout có giới hạn.
- Khi chạy stress test: kiểm tra client ID trong scenario redirect sai; xử lý lỗi theo contract.
- Khi kiểm tra CSP: kiểm tra registered URI trong scenario redirect sai; không retry nghiệp vụ không idempotent.
- Khi kiểm tra keyboard: kiểm tra exact compare trong scenario redirect sai; ghi metric không chứa PII.
- Khi kiểm tra mobile: kiểm tra invalid client trong scenario redirect sai; giữ correlation ID riêng.
- Khi kiểm tra privacy: kiểm tra config fix trong scenario redirect sai; chạy lại contract test sau thay đổi.
- Ở local: kiểm tra client ID trong scenario redirect sai; kiểm tra cấu hình trước khi gọi network.
- Ở staging: kiểm tra registered URI trong scenario redirect sai; giữ secret ở server-side.
- Ở production: kiểm tra exact compare trong scenario redirect sai; không ghi credential vào log.
- Trong CI: kiểm tra invalid client trong scenario redirect sai; kiểm tra status code trước khi parse.
- Trong manual QA: kiểm tra config fix trong scenario redirect sai; dùng timeout có giới hạn.
- Khi request đồng thời: kiểm tra client ID trong scenario redirect sai; xử lý lỗi theo contract.
- Khi provider trả 429: kiểm tra registered URI trong scenario redirect sai; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx: kiểm tra exact compare trong scenario redirect sai; ghi metric không chứa PII.
- Khi callback bị refresh: kiểm tra invalid client trong scenario redirect sai; giữ correlation ID riêng.
- Khi user mở nhiều tab: kiểm tra config fix trong scenario redirect sai; chạy lại contract test sau thay đổi.
## 70. Scenario: Code hết hạn

Mục tiêu: xử lý code hết hạn mà vẫn giữ đúng authorization boundary.

- Khi CAS conflict: kiểm tra invalid_grant trong scenario code hết hạn; không retry nghiệp vụ không idempotent.
- Khi response là 401: kiểm tra không retry code trong scenario code hết hạn; ghi metric không chứa PII.
- Khi response là 400: kiểm tra start flow mới trong scenario code hết hạn; giữ correlation ID riêng.
- Khi response là 200: kiểm tra audit trong scenario code hết hạn; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy: kiểm tra expiresAt trong scenario code hết hạn; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account: kiểm tra invalid_grant trong scenario code hết hạn; giữ secret ở server-side.
- Khi user bấm Tiếp tục: kiểm tra không retry code trong scenario code hết hạn; không ghi credential vào log.
- Khi chạy stress test: kiểm tra start flow mới trong scenario code hết hạn; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP: kiểm tra audit trong scenario code hết hạn; dùng timeout có giới hạn.
- Khi kiểm tra keyboard: kiểm tra expiresAt trong scenario code hết hạn; xử lý lỗi theo contract.
- Khi kiểm tra mobile: kiểm tra invalid_grant trong scenario code hết hạn; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy: kiểm tra không retry code trong scenario code hết hạn; ghi metric không chứa PII.
- Ở local: kiểm tra start flow mới trong scenario code hết hạn; giữ correlation ID riêng.
- Ở staging: kiểm tra audit trong scenario code hết hạn; chạy lại contract test sau thay đổi.
- Ở production: kiểm tra expiresAt trong scenario code hết hạn; kiểm tra cấu hình trước khi gọi network.
- Trong CI: kiểm tra invalid_grant trong scenario code hết hạn; giữ secret ở server-side.
- Trong manual QA: kiểm tra không retry code trong scenario code hết hạn; không ghi credential vào log.
- Khi request đồng thời: kiểm tra start flow mới trong scenario code hết hạn; kiểm tra status code trước khi parse.
- Khi provider trả 429: kiểm tra audit trong scenario code hết hạn; dùng timeout có giới hạn.
- Khi provider trả 5xx: kiểm tra expiresAt trong scenario code hết hạn; xử lý lỗi theo contract.
- Khi callback bị refresh: kiểm tra invalid_grant trong scenario code hết hạn; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab: kiểm tra không retry code trong scenario code hết hạn; ghi metric không chứa PII.
- Khi key vừa rotate: kiểm tra start flow mới trong scenario code hết hạn; giữ correlation ID riêng.
- Khi project vừa revoke: kiểm tra audit trong scenario code hết hạn; chạy lại contract test sau thay đổi.
- Khi device hết hạn: kiểm tra expiresAt trong scenario code hết hạn; kiểm tra cấu hình trước khi gọi network.
## 71. Scenario: Code replay

Mục tiêu: xử lý code replay mà vẫn giữ đúng authorization boundary.

- Khi response là 200: kiểm tra invalid_grant trong scenario code replay; ghi metric không chứa PII.
- Khi user bấm Hủy: kiểm tra metric replay trong scenario code replay; giữ correlation ID riêng.
- Khi user bấm Thêm account: kiểm tra không cấp token trong scenario code replay; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục: kiểm tra consumedAt trong scenario code replay; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test: kiểm tra CAS conflict trong scenario code replay; giữ secret ở server-side.
- Khi kiểm tra CSP: kiểm tra invalid_grant trong scenario code replay; không ghi credential vào log.
- Khi kiểm tra keyboard: kiểm tra metric replay trong scenario code replay; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile: kiểm tra không cấp token trong scenario code replay; dùng timeout có giới hạn.
- Khi kiểm tra privacy: kiểm tra consumedAt trong scenario code replay; xử lý lỗi theo contract.
- Ở local: kiểm tra CAS conflict trong scenario code replay; không retry nghiệp vụ không idempotent.
- Ở staging: kiểm tra invalid_grant trong scenario code replay; ghi metric không chứa PII.
- Ở production: kiểm tra metric replay trong scenario code replay; giữ correlation ID riêng.
- Trong CI: kiểm tra không cấp token trong scenario code replay; chạy lại contract test sau thay đổi.
- Trong manual QA: kiểm tra consumedAt trong scenario code replay; kiểm tra cấu hình trước khi gọi network.
- Khi request đồng thời: kiểm tra CAS conflict trong scenario code replay; giữ secret ở server-side.
- Khi provider trả 429: kiểm tra invalid_grant trong scenario code replay; không ghi credential vào log.
- Khi provider trả 5xx: kiểm tra metric replay trong scenario code replay; kiểm tra status code trước khi parse.
- Khi callback bị refresh: kiểm tra không cấp token trong scenario code replay; dùng timeout có giới hạn.
- Khi user mở nhiều tab: kiểm tra consumedAt trong scenario code replay; xử lý lỗi theo contract.
- Khi key vừa rotate: kiểm tra CAS conflict trong scenario code replay; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke: kiểm tra invalid_grant trong scenario code replay; ghi metric không chứa PII.
- Khi device hết hạn: kiểm tra metric replay trong scenario code replay; giữ correlation ID riêng.
- Khi profile thiếu optional field: kiểm tra không cấp token trong scenario code replay; chạy lại contract test sau thay đổi.
- Khi log đang bật debug: kiểm tra consumedAt trong scenario code replay; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment: kiểm tra CAS conflict trong scenario code replay; giữ secret ở server-side.
## 72. Scenario: API key sai

Mục tiêu: xử lý api key sai mà vẫn giữ đúng authorization boundary.

- Khi user bấm Tiếp tục: kiểm tra rotate check trong scenario api key sai; giữ correlation ID riêng.
- Khi chạy stress test: kiểm tra no logging trong scenario api key sai; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP: kiểm tra hash mismatch trong scenario api key sai; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard: kiểm tra invalid_client trong scenario api key sai; giữ secret ở server-side.
- Khi kiểm tra mobile: kiểm tra secret manager trong scenario api key sai; không ghi credential vào log.
- Khi kiểm tra privacy: kiểm tra rotate check trong scenario api key sai; kiểm tra status code trước khi parse.
- Ở local: kiểm tra no logging trong scenario api key sai; dùng timeout có giới hạn.
- Ở staging: kiểm tra hash mismatch trong scenario api key sai; xử lý lỗi theo contract.
- Ở production: kiểm tra invalid_client trong scenario api key sai; không retry nghiệp vụ không idempotent.
- Trong CI: kiểm tra secret manager trong scenario api key sai; ghi metric không chứa PII.
- Trong manual QA: kiểm tra rotate check trong scenario api key sai; giữ correlation ID riêng.
- Khi request đồng thời: kiểm tra no logging trong scenario api key sai; chạy lại contract test sau thay đổi.
- Khi provider trả 429: kiểm tra hash mismatch trong scenario api key sai; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 5xx: kiểm tra invalid_client trong scenario api key sai; giữ secret ở server-side.
- Khi callback bị refresh: kiểm tra secret manager trong scenario api key sai; không ghi credential vào log.
- Khi user mở nhiều tab: kiểm tra rotate check trong scenario api key sai; kiểm tra status code trước khi parse.
- Khi key vừa rotate: kiểm tra no logging trong scenario api key sai; dùng timeout có giới hạn.
- Khi project vừa revoke: kiểm tra hash mismatch trong scenario api key sai; xử lý lỗi theo contract.
- Khi device hết hạn: kiểm tra invalid_client trong scenario api key sai; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field: kiểm tra secret manager trong scenario api key sai; ghi metric không chứa PII.
- Khi log đang bật debug: kiểm tra rotate check trong scenario api key sai; giữ correlation ID riêng.
- Khi rollback deployment: kiểm tra no logging trong scenario api key sai; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ: kiểm tra hash mismatch trong scenario api key sai; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout: kiểm tra invalid_client trong scenario api key sai; giữ secret ở server-side.
- Khi CAS conflict: kiểm tra secret manager trong scenario api key sai; không ghi credential vào log.
## 73. Scenario: API key rotate

Mục tiêu: xử lý api key rotate mà vẫn giữ đúng authorization boundary.

- Khi kiểm tra keyboard: kiểm tra new one-time trong scenario api key rotate; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile: kiểm tra owner session trong scenario api key rotate; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy: kiểm tra new random trong scenario api key rotate; giữ secret ở server-side.
- Ở local: kiểm tra CAS patch trong scenario api key rotate; không ghi credential vào log.
- Ở staging: kiểm tra old reject trong scenario api key rotate; kiểm tra status code trước khi parse.
- Ở production: kiểm tra new one-time trong scenario api key rotate; dùng timeout có giới hạn.
- Trong CI: kiểm tra owner session trong scenario api key rotate; xử lý lỗi theo contract.
- Trong manual QA: kiểm tra new random trong scenario api key rotate; không retry nghiệp vụ không idempotent.
- Khi request đồng thời: kiểm tra CAS patch trong scenario api key rotate; ghi metric không chứa PII.
- Khi provider trả 429: kiểm tra old reject trong scenario api key rotate; giữ correlation ID riêng.
- Khi provider trả 5xx: kiểm tra new one-time trong scenario api key rotate; chạy lại contract test sau thay đổi.
- Khi callback bị refresh: kiểm tra owner session trong scenario api key rotate; kiểm tra cấu hình trước khi gọi network.
- Khi user mở nhiều tab: kiểm tra new random trong scenario api key rotate; giữ secret ở server-side.
- Khi key vừa rotate: kiểm tra CAS patch trong scenario api key rotate; không ghi credential vào log.
- Khi project vừa revoke: kiểm tra old reject trong scenario api key rotate; kiểm tra status code trước khi parse.
- Khi device hết hạn: kiểm tra new one-time trong scenario api key rotate; dùng timeout có giới hạn.
- Khi profile thiếu optional field: kiểm tra owner session trong scenario api key rotate; xử lý lỗi theo contract.
- Khi log đang bật debug: kiểm tra new random trong scenario api key rotate; không retry nghiệp vụ không idempotent.
- Khi rollback deployment: kiểm tra CAS patch trong scenario api key rotate; ghi metric không chứa PII.
- Khi migration dữ liệu cũ: kiểm tra old reject trong scenario api key rotate; giữ correlation ID riêng.
- Khi network timeout: kiểm tra new one-time trong scenario api key rotate; chạy lại contract test sau thay đổi.
- Khi CAS conflict: kiểm tra owner session trong scenario api key rotate; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401: kiểm tra new random trong scenario api key rotate; giữ secret ở server-side.
- Khi response là 400: kiểm tra CAS patch trong scenario api key rotate; không ghi credential vào log.
- Khi response là 200: kiểm tra old reject trong scenario api key rotate; kiểm tra status code trước khi parse.
## 74. Scenario: Project revoke

Mục tiêu: xử lý project revoke mà vẫn giữ đúng authorization boundary.

- Ở local: kiểm tra owner check trong scenario project revoke; kiểm tra cấu hình trước khi gọi network.
- Ở staging: kiểm tra batch delete trong scenario project revoke; giữ secret ở server-side.
- Ở production: kiểm tra active check trong scenario project revoke; không ghi credential vào log.
- Trong CI: kiểm tra token reject trong scenario project revoke; kiểm tra status code trước khi parse.
- Trong manual QA: kiểm tra audit trong scenario project revoke; dùng timeout có giới hạn.
- Khi request đồng thời: kiểm tra owner check trong scenario project revoke; xử lý lỗi theo contract.
- Khi provider trả 429: kiểm tra batch delete trong scenario project revoke; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx: kiểm tra active check trong scenario project revoke; ghi metric không chứa PII.
- Khi callback bị refresh: kiểm tra token reject trong scenario project revoke; giữ correlation ID riêng.
- Khi user mở nhiều tab: kiểm tra audit trong scenario project revoke; chạy lại contract test sau thay đổi.
- Khi key vừa rotate: kiểm tra owner check trong scenario project revoke; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke: kiểm tra batch delete trong scenario project revoke; giữ secret ở server-side.
- Khi device hết hạn: kiểm tra active check trong scenario project revoke; không ghi credential vào log.
- Khi profile thiếu optional field: kiểm tra token reject trong scenario project revoke; kiểm tra status code trước khi parse.
- Khi log đang bật debug: kiểm tra audit trong scenario project revoke; dùng timeout có giới hạn.
- Khi rollback deployment: kiểm tra owner check trong scenario project revoke; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ: kiểm tra batch delete trong scenario project revoke; không retry nghiệp vụ không idempotent.
- Khi network timeout: kiểm tra active check trong scenario project revoke; ghi metric không chứa PII.
- Khi CAS conflict: kiểm tra token reject trong scenario project revoke; giữ correlation ID riêng.
- Khi response là 401: kiểm tra audit trong scenario project revoke; chạy lại contract test sau thay đổi.
- Khi response là 400: kiểm tra owner check trong scenario project revoke; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200: kiểm tra batch delete trong scenario project revoke; giữ secret ở server-side.
- Khi user bấm Hủy: kiểm tra active check trong scenario project revoke; không ghi credential vào log.
- Khi user bấm Thêm account: kiểm tra token reject trong scenario project revoke; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục: kiểm tra audit trong scenario project revoke; dùng timeout có giới hạn.
## 75. Scenario: Profile thiếu picture

Mục tiêu: xử lý profile thiếu picture mà vẫn giữ đúng authorization boundary.

- Trong CI: kiểm tra fallback avatar trong scenario profile thiếu picture; giữ secret ở server-side.
- Trong manual QA: kiểm tra profile contract trong scenario profile thiếu picture; không ghi credential vào log.
- Khi request đồng thời: kiểm tra no crash trong scenario profile thiếu picture; kiểm tra status code trước khi parse.
- Khi provider trả 429: kiểm tra optional field trong scenario profile thiếu picture; dùng timeout có giới hạn.
- Khi provider trả 5xx: kiểm tra empty picture trong scenario profile thiếu picture; xử lý lỗi theo contract.
- Khi callback bị refresh: kiểm tra fallback avatar trong scenario profile thiếu picture; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab: kiểm tra profile contract trong scenario profile thiếu picture; ghi metric không chứa PII.
- Khi key vừa rotate: kiểm tra no crash trong scenario profile thiếu picture; giữ correlation ID riêng.
- Khi project vừa revoke: kiểm tra optional field trong scenario profile thiếu picture; chạy lại contract test sau thay đổi.
- Khi device hết hạn: kiểm tra empty picture trong scenario profile thiếu picture; kiểm tra cấu hình trước khi gọi network.
- Khi profile thiếu optional field: kiểm tra fallback avatar trong scenario profile thiếu picture; giữ secret ở server-side.
- Khi log đang bật debug: kiểm tra profile contract trong scenario profile thiếu picture; không ghi credential vào log.
- Khi rollback deployment: kiểm tra no crash trong scenario profile thiếu picture; kiểm tra status code trước khi parse.
- Khi migration dữ liệu cũ: kiểm tra optional field trong scenario profile thiếu picture; dùng timeout có giới hạn.
- Khi network timeout: kiểm tra empty picture trong scenario profile thiếu picture; xử lý lỗi theo contract.
- Khi CAS conflict: kiểm tra fallback avatar trong scenario profile thiếu picture; không retry nghiệp vụ không idempotent.
- Khi response là 401: kiểm tra profile contract trong scenario profile thiếu picture; ghi metric không chứa PII.
- Khi response là 400: kiểm tra no crash trong scenario profile thiếu picture; giữ correlation ID riêng.
- Khi response là 200: kiểm tra optional field trong scenario profile thiếu picture; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy: kiểm tra empty picture trong scenario profile thiếu picture; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account: kiểm tra fallback avatar trong scenario profile thiếu picture; giữ secret ở server-side.
- Khi user bấm Tiếp tục: kiểm tra profile contract trong scenario profile thiếu picture; không ghi credential vào log.
- Khi chạy stress test: kiểm tra no crash trong scenario profile thiếu picture; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP: kiểm tra optional field trong scenario profile thiếu picture; dùng timeout có giới hạn.
- Khi kiểm tra keyboard: kiểm tra empty picture trong scenario profile thiếu picture; xử lý lỗi theo contract.
## 76. Scenario: Profile đổi tên

Mục tiêu: xử lý profile đổi tên mà vẫn giữ đúng authorization boundary.

- Khi provider trả 429: kiểm tra session policy trong scenario profile đổi tên; không ghi credential vào log.
- Khi provider trả 5xx: kiểm tra cache refresh trong scenario profile đổi tên; kiểm tra status code trước khi parse.
- Khi callback bị refresh: kiểm tra audit trong scenario profile đổi tên; dùng timeout có giới hạn.
- Khi user mở nhiều tab: kiểm tra same APIUYTIN ID trong scenario profile đổi tên; xử lý lỗi theo contract.
- Khi key vừa rotate: kiểm tra update profile trong scenario profile đổi tên; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke: kiểm tra session policy trong scenario profile đổi tên; ghi metric không chứa PII.
- Khi device hết hạn: kiểm tra cache refresh trong scenario profile đổi tên; giữ correlation ID riêng.
- Khi profile thiếu optional field: kiểm tra audit trong scenario profile đổi tên; chạy lại contract test sau thay đổi.
- Khi log đang bật debug: kiểm tra same APIUYTIN ID trong scenario profile đổi tên; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment: kiểm tra update profile trong scenario profile đổi tên; giữ secret ở server-side.
- Khi migration dữ liệu cũ: kiểm tra session policy trong scenario profile đổi tên; không ghi credential vào log.
- Khi network timeout: kiểm tra cache refresh trong scenario profile đổi tên; kiểm tra status code trước khi parse.
- Khi CAS conflict: kiểm tra audit trong scenario profile đổi tên; dùng timeout có giới hạn.
- Khi response là 401: kiểm tra same APIUYTIN ID trong scenario profile đổi tên; xử lý lỗi theo contract.
- Khi response là 400: kiểm tra update profile trong scenario profile đổi tên; không retry nghiệp vụ không idempotent.
- Khi response là 200: kiểm tra session policy trong scenario profile đổi tên; ghi metric không chứa PII.
- Khi user bấm Hủy: kiểm tra cache refresh trong scenario profile đổi tên; giữ correlation ID riêng.
- Khi user bấm Thêm account: kiểm tra audit trong scenario profile đổi tên; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục: kiểm tra same APIUYTIN ID trong scenario profile đổi tên; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test: kiểm tra update profile trong scenario profile đổi tên; giữ secret ở server-side.
- Khi kiểm tra CSP: kiểm tra session policy trong scenario profile đổi tên; không ghi credential vào log.
- Khi kiểm tra keyboard: kiểm tra cache refresh trong scenario profile đổi tên; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile: kiểm tra audit trong scenario profile đổi tên; dùng timeout có giới hạn.
- Khi kiểm tra privacy: kiểm tra same APIUYTIN ID trong scenario profile đổi tên; xử lý lỗi theo contract.
- Ở local: kiểm tra update profile trong scenario profile đổi tên; không retry nghiệp vụ không idempotent.
## 77. Scenario: Sanity 429

Mục tiêu: xử lý sanity 429 mà vẫn giữ đúng authorization boundary.

- Khi user mở nhiều tab: kiểm tra max three trong scenario sanity 429; kiểm tra status code trước khi parse.
- Khi key vừa rotate: kiểm tra final error trong scenario sanity 429; dùng timeout có giới hạn.
- Khi project vừa revoke: kiểm tra query retry trong scenario sanity 429; xử lý lỗi theo contract.
- Khi device hết hạn: kiểm tra backoff trong scenario sanity 429; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field: kiểm tra jitter trong scenario sanity 429; ghi metric không chứa PII.
- Khi log đang bật debug: kiểm tra max three trong scenario sanity 429; giữ correlation ID riêng.
- Khi rollback deployment: kiểm tra final error trong scenario sanity 429; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ: kiểm tra query retry trong scenario sanity 429; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout: kiểm tra backoff trong scenario sanity 429; giữ secret ở server-side.
- Khi CAS conflict: kiểm tra jitter trong scenario sanity 429; không ghi credential vào log.
- Khi response là 401: kiểm tra max three trong scenario sanity 429; kiểm tra status code trước khi parse.
- Khi response là 400: kiểm tra final error trong scenario sanity 429; dùng timeout có giới hạn.
- Khi response là 200: kiểm tra query retry trong scenario sanity 429; xử lý lỗi theo contract.
- Khi user bấm Hủy: kiểm tra backoff trong scenario sanity 429; không retry nghiệp vụ không idempotent.
- Khi user bấm Thêm account: kiểm tra jitter trong scenario sanity 429; ghi metric không chứa PII.
- Khi user bấm Tiếp tục: kiểm tra max three trong scenario sanity 429; giữ correlation ID riêng.
- Khi chạy stress test: kiểm tra final error trong scenario sanity 429; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP: kiểm tra query retry trong scenario sanity 429; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard: kiểm tra backoff trong scenario sanity 429; giữ secret ở server-side.
- Khi kiểm tra mobile: kiểm tra jitter trong scenario sanity 429; không ghi credential vào log.
- Khi kiểm tra privacy: kiểm tra max three trong scenario sanity 429; kiểm tra status code trước khi parse.
- Ở local: kiểm tra final error trong scenario sanity 429; dùng timeout có giới hạn.
- Ở staging: kiểm tra query retry trong scenario sanity 429; xử lý lỗi theo contract.
- Ở production: kiểm tra backoff trong scenario sanity 429; không retry nghiệp vụ không idempotent.
- Trong CI: kiểm tra jitter trong scenario sanity 429; ghi metric không chứa PII.
## 78. Scenario: Sanity 5xx

Mục tiêu: xử lý sanity 5xx mà vẫn giữ đúng authorization boundary.

- Khi device hết hạn: kiểm tra support trong scenario sanity 5xx; dùng timeout có giới hạn.
- Khi profile thiếu optional field: kiểm tra query retry trong scenario sanity 5xx; xử lý lỗi theo contract.
- Khi log đang bật debug: kiểm tra bounded delay trong scenario sanity 5xx; không retry nghiệp vụ không idempotent.
- Khi rollback deployment: kiểm tra no mutation retry trong scenario sanity 5xx; ghi metric không chứa PII.
- Khi migration dữ liệu cũ: kiểm tra alert trong scenario sanity 5xx; giữ correlation ID riêng.
- Khi network timeout: kiểm tra support trong scenario sanity 5xx; chạy lại contract test sau thay đổi.
- Khi CAS conflict: kiểm tra query retry trong scenario sanity 5xx; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401: kiểm tra bounded delay trong scenario sanity 5xx; giữ secret ở server-side.
- Khi response là 400: kiểm tra no mutation retry trong scenario sanity 5xx; không ghi credential vào log.
- Khi response là 200: kiểm tra alert trong scenario sanity 5xx; kiểm tra status code trước khi parse.
- Khi user bấm Hủy: kiểm tra support trong scenario sanity 5xx; dùng timeout có giới hạn.
- Khi user bấm Thêm account: kiểm tra query retry trong scenario sanity 5xx; xử lý lỗi theo contract.
- Khi user bấm Tiếp tục: kiểm tra bounded delay trong scenario sanity 5xx; không retry nghiệp vụ không idempotent.
- Khi chạy stress test: kiểm tra no mutation retry trong scenario sanity 5xx; ghi metric không chứa PII.
- Khi kiểm tra CSP: kiểm tra alert trong scenario sanity 5xx; giữ correlation ID riêng.
- Khi kiểm tra keyboard: kiểm tra support trong scenario sanity 5xx; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile: kiểm tra query retry trong scenario sanity 5xx; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy: kiểm tra bounded delay trong scenario sanity 5xx; giữ secret ở server-side.
- Ở local: kiểm tra no mutation retry trong scenario sanity 5xx; không ghi credential vào log.
- Ở staging: kiểm tra alert trong scenario sanity 5xx; kiểm tra status code trước khi parse.
- Ở production: kiểm tra support trong scenario sanity 5xx; dùng timeout có giới hạn.
- Trong CI: kiểm tra query retry trong scenario sanity 5xx; xử lý lỗi theo contract.
- Trong manual QA: kiểm tra bounded delay trong scenario sanity 5xx; không retry nghiệp vụ không idempotent.
- Khi request đồng thời: kiểm tra no mutation retry trong scenario sanity 5xx; ghi metric không chứa PII.
- Khi provider trả 429: kiểm tra alert trong scenario sanity 5xx; giữ correlation ID riêng.
## 79. Scenario: Mutation timeout

Mục tiêu: xử lý mutation timeout mà vẫn giữ đúng authorization boundary.

- Khi rollback deployment: kiểm tra unknown outcome trong scenario mutation timeout; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ: kiểm tra query state trong scenario mutation timeout; không retry nghiệp vụ không idempotent.
- Khi network timeout: kiểm tra no blind retry trong scenario mutation timeout; ghi metric không chứa PII.
- Khi CAS conflict: kiểm tra CAS trong scenario mutation timeout; giữ correlation ID riêng.
- Khi response là 401: kiểm tra incident trong scenario mutation timeout; chạy lại contract test sau thay đổi.
- Khi response là 400: kiểm tra unknown outcome trong scenario mutation timeout; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200: kiểm tra query state trong scenario mutation timeout; giữ secret ở server-side.
- Khi user bấm Hủy: kiểm tra no blind retry trong scenario mutation timeout; không ghi credential vào log.
- Khi user bấm Thêm account: kiểm tra CAS trong scenario mutation timeout; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục: kiểm tra incident trong scenario mutation timeout; dùng timeout có giới hạn.
- Khi chạy stress test: kiểm tra unknown outcome trong scenario mutation timeout; xử lý lỗi theo contract.
- Khi kiểm tra CSP: kiểm tra query state trong scenario mutation timeout; không retry nghiệp vụ không idempotent.
- Khi kiểm tra keyboard: kiểm tra no blind retry trong scenario mutation timeout; ghi metric không chứa PII.
- Khi kiểm tra mobile: kiểm tra CAS trong scenario mutation timeout; giữ correlation ID riêng.
- Khi kiểm tra privacy: kiểm tra incident trong scenario mutation timeout; chạy lại contract test sau thay đổi.
- Ở local: kiểm tra unknown outcome trong scenario mutation timeout; kiểm tra cấu hình trước khi gọi network.
- Ở staging: kiểm tra query state trong scenario mutation timeout; giữ secret ở server-side.
- Ở production: kiểm tra no blind retry trong scenario mutation timeout; không ghi credential vào log.
- Trong CI: kiểm tra CAS trong scenario mutation timeout; kiểm tra status code trước khi parse.
- Trong manual QA: kiểm tra incident trong scenario mutation timeout; dùng timeout có giới hạn.
- Khi request đồng thời: kiểm tra unknown outcome trong scenario mutation timeout; xử lý lỗi theo contract.
- Khi provider trả 429: kiểm tra query state trong scenario mutation timeout; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx: kiểm tra no blind retry trong scenario mutation timeout; ghi metric không chứa PII.
- Khi callback bị refresh: kiểm tra CAS trong scenario mutation timeout; giữ correlation ID riêng.
- Khi user mở nhiều tab: kiểm tra incident trong scenario mutation timeout; chạy lại contract test sau thay đổi.
## 80. Scenario: 100 OAuth start

Mục tiêu: xử lý 100 oauth start mà vẫn giữ đúng authorization boundary.

- Khi CAS conflict: kiểm tra same device trong scenario 100 oauth start; không retry nghiệp vụ không idempotent.
- Khi response là 401: kiểm tra unique hash trong scenario 100 oauth start; ghi metric không chứa PII.
- Khi response là 400: kiểm tra no global state trong scenario 100 oauth start; giữ correlation ID riêng.
- Khi response là 200: kiểm tra metrics trong scenario 100 oauth start; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy: kiểm tra independent transaction trong scenario 100 oauth start; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account: kiểm tra same device trong scenario 100 oauth start; giữ secret ở server-side.
- Khi user bấm Tiếp tục: kiểm tra unique hash trong scenario 100 oauth start; không ghi credential vào log.
- Khi chạy stress test: kiểm tra no global state trong scenario 100 oauth start; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP: kiểm tra metrics trong scenario 100 oauth start; dùng timeout có giới hạn.
- Khi kiểm tra keyboard: kiểm tra independent transaction trong scenario 100 oauth start; xử lý lỗi theo contract.
- Khi kiểm tra mobile: kiểm tra same device trong scenario 100 oauth start; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy: kiểm tra unique hash trong scenario 100 oauth start; ghi metric không chứa PII.
- Ở local: kiểm tra no global state trong scenario 100 oauth start; giữ correlation ID riêng.
- Ở staging: kiểm tra metrics trong scenario 100 oauth start; chạy lại contract test sau thay đổi.
- Ở production: kiểm tra independent transaction trong scenario 100 oauth start; kiểm tra cấu hình trước khi gọi network.
- Trong CI: kiểm tra same device trong scenario 100 oauth start; giữ secret ở server-side.
- Trong manual QA: kiểm tra unique hash trong scenario 100 oauth start; không ghi credential vào log.
- Khi request đồng thời: kiểm tra no global state trong scenario 100 oauth start; kiểm tra status code trước khi parse.
- Khi provider trả 429: kiểm tra metrics trong scenario 100 oauth start; dùng timeout có giới hạn.
- Khi provider trả 5xx: kiểm tra independent transaction trong scenario 100 oauth start; xử lý lỗi theo contract.
- Khi callback bị refresh: kiểm tra same device trong scenario 100 oauth start; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab: kiểm tra unique hash trong scenario 100 oauth start; ghi metric không chứa PII.
- Khi key vừa rotate: kiểm tra no global state trong scenario 100 oauth start; giữ correlation ID riêng.
- Khi project vừa revoke: kiểm tra metrics trong scenario 100 oauth start; chạy lại contract test sau thay đổi.
- Khi device hết hạn: kiểm tra independent transaction trong scenario 100 oauth start; kiểm tra cấu hình trước khi gọi network.
## 81. Scenario: 100 consent same account

Mục tiêu: xử lý 100 consent same account mà vẫn giữ đúng authorization boundary.

- Khi response là 200: kiểm tra stable code trong scenario 100 consent same account; ghi metric không chứa PII.
- Khi user bấm Hủy: kiểm tra duplicate invariant trong scenario 100 consent same account; giữ correlation ID riêng.
- Khi user bấm Thêm account: kiểm tra response trong scenario 100 consent same account; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục: kiểm tra same transaction trong scenario 100 consent same account; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test: kiểm tra CAS winner trong scenario 100 consent same account; giữ secret ở server-side.
- Khi kiểm tra CSP: kiểm tra stable code trong scenario 100 consent same account; không ghi credential vào log.
- Khi kiểm tra keyboard: kiểm tra duplicate invariant trong scenario 100 consent same account; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile: kiểm tra response trong scenario 100 consent same account; dùng timeout có giới hạn.
- Khi kiểm tra privacy: kiểm tra same transaction trong scenario 100 consent same account; xử lý lỗi theo contract.
- Ở local: kiểm tra CAS winner trong scenario 100 consent same account; không retry nghiệp vụ không idempotent.
- Ở staging: kiểm tra stable code trong scenario 100 consent same account; ghi metric không chứa PII.
- Ở production: kiểm tra duplicate invariant trong scenario 100 consent same account; giữ correlation ID riêng.
- Trong CI: kiểm tra response trong scenario 100 consent same account; chạy lại contract test sau thay đổi.
- Trong manual QA: kiểm tra same transaction trong scenario 100 consent same account; kiểm tra cấu hình trước khi gọi network.
- Khi request đồng thời: kiểm tra CAS winner trong scenario 100 consent same account; giữ secret ở server-side.
- Khi provider trả 429: kiểm tra stable code trong scenario 100 consent same account; không ghi credential vào log.
- Khi provider trả 5xx: kiểm tra duplicate invariant trong scenario 100 consent same account; kiểm tra status code trước khi parse.
- Khi callback bị refresh: kiểm tra response trong scenario 100 consent same account; dùng timeout có giới hạn.
- Khi user mở nhiều tab: kiểm tra same transaction trong scenario 100 consent same account; xử lý lỗi theo contract.
- Khi key vừa rotate: kiểm tra CAS winner trong scenario 100 consent same account; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke: kiểm tra stable code trong scenario 100 consent same account; ghi metric không chứa PII.
- Khi device hết hạn: kiểm tra duplicate invariant trong scenario 100 consent same account; giữ correlation ID riêng.
- Khi profile thiếu optional field: kiểm tra response trong scenario 100 consent same account; chạy lại contract test sau thay đổi.
- Khi log đang bật debug: kiểm tra same transaction trong scenario 100 consent same account; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment: kiểm tra CAS winner trong scenario 100 consent same account; giữ secret ở server-side.
## 82. Scenario: 100 token same code

Mục tiêu: xử lý 100 token same code mà vẫn giữ đúng authorization boundary.

- Khi user bấm Tiếp tục: kiểm tra metrics trong scenario 100 token same code; giữ correlation ID riêng.
- Khi chạy stress test: kiểm tra cleanup trong scenario 100 token same code; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP: kiểm tra one CAS winner trong scenario 100 token same code; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard: kiểm tra 99 invalid grant trong scenario 100 token same code; giữ secret ở server-side.
- Khi kiểm tra mobile: kiểm tra no duplicate token trong scenario 100 token same code; không ghi credential vào log.
- Khi kiểm tra privacy: kiểm tra metrics trong scenario 100 token same code; kiểm tra status code trước khi parse.
- Ở local: kiểm tra cleanup trong scenario 100 token same code; dùng timeout có giới hạn.
- Ở staging: kiểm tra one CAS winner trong scenario 100 token same code; xử lý lỗi theo contract.
- Ở production: kiểm tra 99 invalid grant trong scenario 100 token same code; không retry nghiệp vụ không idempotent.
- Trong CI: kiểm tra no duplicate token trong scenario 100 token same code; ghi metric không chứa PII.
- Trong manual QA: kiểm tra metrics trong scenario 100 token same code; giữ correlation ID riêng.
- Khi request đồng thời: kiểm tra cleanup trong scenario 100 token same code; chạy lại contract test sau thay đổi.
- Khi provider trả 429: kiểm tra one CAS winner trong scenario 100 token same code; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 5xx: kiểm tra 99 invalid grant trong scenario 100 token same code; giữ secret ở server-side.
- Khi callback bị refresh: kiểm tra no duplicate token trong scenario 100 token same code; không ghi credential vào log.
- Khi user mở nhiều tab: kiểm tra metrics trong scenario 100 token same code; kiểm tra status code trước khi parse.
- Khi key vừa rotate: kiểm tra cleanup trong scenario 100 token same code; dùng timeout có giới hạn.
- Khi project vừa revoke: kiểm tra one CAS winner trong scenario 100 token same code; xử lý lỗi theo contract.
- Khi device hết hạn: kiểm tra 99 invalid grant trong scenario 100 token same code; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field: kiểm tra no duplicate token trong scenario 100 token same code; ghi metric không chứa PII.
- Khi log đang bật debug: kiểm tra metrics trong scenario 100 token same code; giữ correlation ID riêng.
- Khi rollback deployment: kiểm tra cleanup trong scenario 100 token same code; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ: kiểm tra one CAS winner trong scenario 100 token same code; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout: kiểm tra 99 invalid grant trong scenario 100 token same code; giữ secret ở server-side.
- Khi CAS conflict: kiểm tra no duplicate token trong scenario 100 token same code; không ghi credential vào log.
## 83. Scenario: Nhiều project

Mục tiêu: xử lý nhiều project mà vẫn giữ đúng authorization boundary.

- Khi kiểm tra keyboard: kiểm tra key scope trong scenario nhiều project; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile: kiểm tra client isolation trong scenario nhiều project; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy: kiểm tra redirect isolation trong scenario nhiều project; giữ secret ở server-side.
- Ở local: kiểm tra owner isolation trong scenario nhiều project; không ghi credential vào log.
- Ở staging: kiểm tra profile scope trong scenario nhiều project; kiểm tra status code trước khi parse.
- Ở production: kiểm tra key scope trong scenario nhiều project; dùng timeout có giới hạn.
- Trong CI: kiểm tra client isolation trong scenario nhiều project; xử lý lỗi theo contract.
- Trong manual QA: kiểm tra redirect isolation trong scenario nhiều project; không retry nghiệp vụ không idempotent.
- Khi request đồng thời: kiểm tra owner isolation trong scenario nhiều project; ghi metric không chứa PII.
- Khi provider trả 429: kiểm tra profile scope trong scenario nhiều project; giữ correlation ID riêng.
- Khi provider trả 5xx: kiểm tra key scope trong scenario nhiều project; chạy lại contract test sau thay đổi.
- Khi callback bị refresh: kiểm tra client isolation trong scenario nhiều project; kiểm tra cấu hình trước khi gọi network.
- Khi user mở nhiều tab: kiểm tra redirect isolation trong scenario nhiều project; giữ secret ở server-side.
- Khi key vừa rotate: kiểm tra owner isolation trong scenario nhiều project; không ghi credential vào log.
- Khi project vừa revoke: kiểm tra profile scope trong scenario nhiều project; kiểm tra status code trước khi parse.
- Khi device hết hạn: kiểm tra key scope trong scenario nhiều project; dùng timeout có giới hạn.
- Khi profile thiếu optional field: kiểm tra client isolation trong scenario nhiều project; xử lý lỗi theo contract.
- Khi log đang bật debug: kiểm tra redirect isolation trong scenario nhiều project; không retry nghiệp vụ không idempotent.
- Khi rollback deployment: kiểm tra owner isolation trong scenario nhiều project; ghi metric không chứa PII.
- Khi migration dữ liệu cũ: kiểm tra profile scope trong scenario nhiều project; giữ correlation ID riêng.
- Khi network timeout: kiểm tra key scope trong scenario nhiều project; chạy lại contract test sau thay đổi.
- Khi CAS conflict: kiểm tra client isolation trong scenario nhiều project; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401: kiểm tra redirect isolation trong scenario nhiều project; giữ secret ở server-side.
- Khi response là 400: kiểm tra owner isolation trong scenario nhiều project; không ghi credential vào log.
- Khi response là 200: kiểm tra profile scope trong scenario nhiều project; kiểm tra status code trước khi parse.
## 84. Scenario: Nhiều tab

Mục tiêu: xử lý nhiều tab mà vẫn giữ đúng authorization boundary.

- Ở local: kiểm tra state per tab trong scenario nhiều tab; kiểm tra cấu hình trước khi gọi network.
- Ở staging: kiểm tra transaction per tab trong scenario nhiều tab; giữ secret ở server-side.
- Ở production: kiểm tra no overwrite trong scenario nhiều tab; không ghi credential vào log.
- Trong CI: kiểm tra callback mapping trong scenario nhiều tab; kiểm tra status code trước khi parse.
- Trong manual QA: kiểm tra cleanup trong scenario nhiều tab; dùng timeout có giới hạn.
- Khi request đồng thời: kiểm tra state per tab trong scenario nhiều tab; xử lý lỗi theo contract.
- Khi provider trả 429: kiểm tra transaction per tab trong scenario nhiều tab; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx: kiểm tra no overwrite trong scenario nhiều tab; ghi metric không chứa PII.
- Khi callback bị refresh: kiểm tra callback mapping trong scenario nhiều tab; giữ correlation ID riêng.
- Khi user mở nhiều tab: kiểm tra cleanup trong scenario nhiều tab; chạy lại contract test sau thay đổi.
- Khi key vừa rotate: kiểm tra state per tab trong scenario nhiều tab; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke: kiểm tra transaction per tab trong scenario nhiều tab; giữ secret ở server-side.
- Khi device hết hạn: kiểm tra no overwrite trong scenario nhiều tab; không ghi credential vào log.
- Khi profile thiếu optional field: kiểm tra callback mapping trong scenario nhiều tab; kiểm tra status code trước khi parse.
- Khi log đang bật debug: kiểm tra cleanup trong scenario nhiều tab; dùng timeout có giới hạn.
- Khi rollback deployment: kiểm tra state per tab trong scenario nhiều tab; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ: kiểm tra transaction per tab trong scenario nhiều tab; không retry nghiệp vụ không idempotent.
- Khi network timeout: kiểm tra no overwrite trong scenario nhiều tab; ghi metric không chứa PII.
- Khi CAS conflict: kiểm tra callback mapping trong scenario nhiều tab; giữ correlation ID riêng.
- Khi response là 401: kiểm tra cleanup trong scenario nhiều tab; chạy lại contract test sau thay đổi.
- Khi response là 400: kiểm tra state per tab trong scenario nhiều tab; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200: kiểm tra transaction per tab trong scenario nhiều tab; giữ secret ở server-side.
- Khi user bấm Hủy: kiểm tra no overwrite trong scenario nhiều tab; không ghi credential vào log.
- Khi user bấm Thêm account: kiểm tra callback mapping trong scenario nhiều tab; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục: kiểm tra cleanup trong scenario nhiều tab; dùng timeout có giới hạn.
## 85. Scenario: Browser refresh chooser

Mục tiêu: xử lý browser refresh chooser mà vẫn giữ đúng authorization boundary.

- Trong CI: kiểm tra device check trong scenario browser refresh chooser; giữ secret ở server-side.
- Trong manual QA: kiểm tra same account list trong scenario browser refresh chooser; không ghi credential vào log.
- Khi request đồng thời: kiểm tra no code issue trong scenario browser refresh chooser; kiểm tra status code trước khi parse.
- Khi provider trả 429: kiểm tra expiry trong scenario browser refresh chooser; dùng timeout có giới hạn.
- Khi provider trả 5xx: kiểm tra transaction check trong scenario browser refresh chooser; xử lý lỗi theo contract.
- Khi callback bị refresh: kiểm tra device check trong scenario browser refresh chooser; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab: kiểm tra same account list trong scenario browser refresh chooser; ghi metric không chứa PII.
- Khi key vừa rotate: kiểm tra no code issue trong scenario browser refresh chooser; giữ correlation ID riêng.
- Khi project vừa revoke: kiểm tra expiry trong scenario browser refresh chooser; chạy lại contract test sau thay đổi.
- Khi device hết hạn: kiểm tra transaction check trong scenario browser refresh chooser; kiểm tra cấu hình trước khi gọi network.
- Khi profile thiếu optional field: kiểm tra device check trong scenario browser refresh chooser; giữ secret ở server-side.
- Khi log đang bật debug: kiểm tra same account list trong scenario browser refresh chooser; không ghi credential vào log.
- Khi rollback deployment: kiểm tra no code issue trong scenario browser refresh chooser; kiểm tra status code trước khi parse.
- Khi migration dữ liệu cũ: kiểm tra expiry trong scenario browser refresh chooser; dùng timeout có giới hạn.
- Khi network timeout: kiểm tra transaction check trong scenario browser refresh chooser; xử lý lỗi theo contract.
- Khi CAS conflict: kiểm tra device check trong scenario browser refresh chooser; không retry nghiệp vụ không idempotent.
- Khi response là 401: kiểm tra same account list trong scenario browser refresh chooser; ghi metric không chứa PII.
- Khi response là 400: kiểm tra no code issue trong scenario browser refresh chooser; giữ correlation ID riêng.
- Khi response là 200: kiểm tra expiry trong scenario browser refresh chooser; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy: kiểm tra transaction check trong scenario browser refresh chooser; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account: kiểm tra device check trong scenario browser refresh chooser; giữ secret ở server-side.
- Khi user bấm Tiếp tục: kiểm tra same account list trong scenario browser refresh chooser; không ghi credential vào log.
- Khi chạy stress test: kiểm tra no code issue trong scenario browser refresh chooser; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP: kiểm tra expiry trong scenario browser refresh chooser; dùng timeout có giới hạn.
- Khi kiểm tra keyboard: kiểm tra transaction check trong scenario browser refresh chooser; xử lý lỗi theo contract.
## 86. Scenario: Cookie hết hạn

Mục tiêu: xử lý cookie hết hạn mà vẫn giữ đúng authorization boundary.

- Khi provider trả 429: kiểm tra Google required trong scenario cookie hết hạn; không ghi credential vào log.
- Khi provider trả 5xx: kiểm tra new link trong scenario cookie hết hạn; kiểm tra status code trước khi parse.
- Khi callback bị refresh: kiểm tra privacy trong scenario cookie hết hạn; dùng timeout có giới hạn.
- Khi user mở nhiều tab: kiểm tra device lookup fail trong scenario cookie hết hạn; xử lý lỗi theo contract.
- Khi key vừa rotate: kiểm tra new device trong scenario cookie hết hạn; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke: kiểm tra Google required trong scenario cookie hết hạn; ghi metric không chứa PII.
- Khi device hết hạn: kiểm tra new link trong scenario cookie hết hạn; giữ correlation ID riêng.
- Khi profile thiếu optional field: kiểm tra privacy trong scenario cookie hết hạn; chạy lại contract test sau thay đổi.
- Khi log đang bật debug: kiểm tra device lookup fail trong scenario cookie hết hạn; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment: kiểm tra new device trong scenario cookie hết hạn; giữ secret ở server-side.
- Khi migration dữ liệu cũ: kiểm tra Google required trong scenario cookie hết hạn; không ghi credential vào log.
- Khi network timeout: kiểm tra new link trong scenario cookie hết hạn; kiểm tra status code trước khi parse.
- Khi CAS conflict: kiểm tra privacy trong scenario cookie hết hạn; dùng timeout có giới hạn.
- Khi response là 401: kiểm tra device lookup fail trong scenario cookie hết hạn; xử lý lỗi theo contract.
- Khi response là 400: kiểm tra new device trong scenario cookie hết hạn; không retry nghiệp vụ không idempotent.
- Khi response là 200: kiểm tra Google required trong scenario cookie hết hạn; ghi metric không chứa PII.
- Khi user bấm Hủy: kiểm tra new link trong scenario cookie hết hạn; giữ correlation ID riêng.
- Khi user bấm Thêm account: kiểm tra privacy trong scenario cookie hết hạn; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục: kiểm tra device lookup fail trong scenario cookie hết hạn; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test: kiểm tra new device trong scenario cookie hết hạn; giữ secret ở server-side.
- Khi kiểm tra CSP: kiểm tra Google required trong scenario cookie hết hạn; không ghi credential vào log.
- Khi kiểm tra keyboard: kiểm tra new link trong scenario cookie hết hạn; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile: kiểm tra privacy trong scenario cookie hết hạn; dùng timeout có giới hạn.
- Khi kiểm tra privacy: kiểm tra device lookup fail trong scenario cookie hết hạn; xử lý lỗi theo contract.
- Ở local: kiểm tra new device trong scenario cookie hết hạn; không retry nghiệp vụ không idempotent.
## 87. Scenario: CSP chooser

Mục tiêu: xử lý csp chooser mà vẫn giữ đúng authorization boundary.

- Khi user mở nhiều tab: kiểm tra no inline trong scenario csp chooser; kiểm tra status code trước khi parse.
- Khi key vừa rotate: kiểm tra browser check trong scenario csp chooser; dùng timeout có giới hạn.
- Khi project vừa revoke: kiểm tra external CSS trong scenario csp chooser; xử lý lỗi theo contract.
- Khi device hết hạn: kiểm tra external JS trong scenario csp chooser; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field: kiểm tra script self trong scenario csp chooser; ghi metric không chứa PII.
- Khi log đang bật debug: kiểm tra no inline trong scenario csp chooser; giữ correlation ID riêng.
- Khi rollback deployment: kiểm tra browser check trong scenario csp chooser; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ: kiểm tra external CSS trong scenario csp chooser; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout: kiểm tra external JS trong scenario csp chooser; giữ secret ở server-side.
- Khi CAS conflict: kiểm tra script self trong scenario csp chooser; không ghi credential vào log.
- Khi response là 401: kiểm tra no inline trong scenario csp chooser; kiểm tra status code trước khi parse.
- Khi response là 400: kiểm tra browser check trong scenario csp chooser; dùng timeout có giới hạn.
- Khi response là 200: kiểm tra external CSS trong scenario csp chooser; xử lý lỗi theo contract.
- Khi user bấm Hủy: kiểm tra external JS trong scenario csp chooser; không retry nghiệp vụ không idempotent.
- Khi user bấm Thêm account: kiểm tra script self trong scenario csp chooser; ghi metric không chứa PII.
- Khi user bấm Tiếp tục: kiểm tra no inline trong scenario csp chooser; giữ correlation ID riêng.
- Khi chạy stress test: kiểm tra browser check trong scenario csp chooser; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP: kiểm tra external CSS trong scenario csp chooser; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard: kiểm tra external JS trong scenario csp chooser; giữ secret ở server-side.
- Khi kiểm tra mobile: kiểm tra script self trong scenario csp chooser; không ghi credential vào log.
- Khi kiểm tra privacy: kiểm tra no inline trong scenario csp chooser; kiểm tra status code trước khi parse.
- Ở local: kiểm tra browser check trong scenario csp chooser; dùng timeout có giới hạn.
- Ở staging: kiểm tra external CSS trong scenario csp chooser; xử lý lỗi theo contract.
- Ở production: kiểm tra external JS trong scenario csp chooser; không retry nghiệp vụ không idempotent.
- Trong CI: kiểm tra script self trong scenario csp chooser; ghi metric không chứa PII.
## 88. Scenario: Keyboard chooser

Mục tiêu: xử lý keyboard chooser mà vẫn giữ đúng authorization boundary.

- Khi device hết hạn: kiểm tra screen reader trong scenario keyboard chooser; dùng timeout có giới hạn.
- Khi profile thiếu optional field: kiểm tra focus first trong scenario keyboard chooser; xử lý lỗi theo contract.
- Khi log đang bật debug: kiểm tra tab trap trong scenario keyboard chooser; không retry nghiệp vụ không idempotent.
- Khi rollback deployment: kiểm tra escape trong scenario keyboard chooser; ghi metric không chứa PII.
- Khi migration dữ liệu cũ: kiểm tra radio labels trong scenario keyboard chooser; giữ correlation ID riêng.
- Khi network timeout: kiểm tra screen reader trong scenario keyboard chooser; chạy lại contract test sau thay đổi.
- Khi CAS conflict: kiểm tra focus first trong scenario keyboard chooser; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401: kiểm tra tab trap trong scenario keyboard chooser; giữ secret ở server-side.
- Khi response là 400: kiểm tra escape trong scenario keyboard chooser; không ghi credential vào log.
- Khi response là 200: kiểm tra radio labels trong scenario keyboard chooser; kiểm tra status code trước khi parse.
- Khi user bấm Hủy: kiểm tra screen reader trong scenario keyboard chooser; dùng timeout có giới hạn.
- Khi user bấm Thêm account: kiểm tra focus first trong scenario keyboard chooser; xử lý lỗi theo contract.
- Khi user bấm Tiếp tục: kiểm tra tab trap trong scenario keyboard chooser; không retry nghiệp vụ không idempotent.
- Khi chạy stress test: kiểm tra escape trong scenario keyboard chooser; ghi metric không chứa PII.
- Khi kiểm tra CSP: kiểm tra radio labels trong scenario keyboard chooser; giữ correlation ID riêng.
- Khi kiểm tra keyboard: kiểm tra screen reader trong scenario keyboard chooser; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile: kiểm tra focus first trong scenario keyboard chooser; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy: kiểm tra tab trap trong scenario keyboard chooser; giữ secret ở server-side.
- Ở local: kiểm tra escape trong scenario keyboard chooser; không ghi credential vào log.
- Ở staging: kiểm tra radio labels trong scenario keyboard chooser; kiểm tra status code trước khi parse.
- Ở production: kiểm tra screen reader trong scenario keyboard chooser; dùng timeout có giới hạn.
- Trong CI: kiểm tra focus first trong scenario keyboard chooser; xử lý lỗi theo contract.
- Trong manual QA: kiểm tra tab trap trong scenario keyboard chooser; không retry nghiệp vụ không idempotent.
- Khi request đồng thời: kiểm tra escape trong scenario keyboard chooser; ghi metric không chứa PII.
- Khi provider trả 429: kiểm tra radio labels trong scenario keyboard chooser; giữ correlation ID riêng.
## 89. Scenario: Mobile chooser

Mục tiêu: xử lý mobile chooser mà vẫn giữ đúng authorization boundary.

- Khi rollback deployment: kiểm tra 375 width trong scenario mobile chooser; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ: kiểm tra one column trong scenario mobile chooser; không retry nghiệp vụ không idempotent.
- Khi network timeout: kiểm tra wrap callback trong scenario mobile chooser; ghi metric không chứa PII.
- Khi CAS conflict: kiểm tra tap target trong scenario mobile chooser; giữ correlation ID riêng.
- Khi response là 401: kiểm tra no overflow trong scenario mobile chooser; chạy lại contract test sau thay đổi.
- Khi response là 400: kiểm tra 375 width trong scenario mobile chooser; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200: kiểm tra one column trong scenario mobile chooser; giữ secret ở server-side.
- Khi user bấm Hủy: kiểm tra wrap callback trong scenario mobile chooser; không ghi credential vào log.
- Khi user bấm Thêm account: kiểm tra tap target trong scenario mobile chooser; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục: kiểm tra no overflow trong scenario mobile chooser; dùng timeout có giới hạn.
- Khi chạy stress test: kiểm tra 375 width trong scenario mobile chooser; xử lý lỗi theo contract.
- Khi kiểm tra CSP: kiểm tra one column trong scenario mobile chooser; không retry nghiệp vụ không idempotent.
- Khi kiểm tra keyboard: kiểm tra wrap callback trong scenario mobile chooser; ghi metric không chứa PII.
- Khi kiểm tra mobile: kiểm tra tap target trong scenario mobile chooser; giữ correlation ID riêng.
- Khi kiểm tra privacy: kiểm tra no overflow trong scenario mobile chooser; chạy lại contract test sau thay đổi.
- Ở local: kiểm tra 375 width trong scenario mobile chooser; kiểm tra cấu hình trước khi gọi network.
- Ở staging: kiểm tra one column trong scenario mobile chooser; giữ secret ở server-side.
- Ở production: kiểm tra wrap callback trong scenario mobile chooser; không ghi credential vào log.
- Trong CI: kiểm tra tap target trong scenario mobile chooser; kiểm tra status code trước khi parse.
- Trong manual QA: kiểm tra no overflow trong scenario mobile chooser; dùng timeout có giới hạn.
- Khi request đồng thời: kiểm tra 375 width trong scenario mobile chooser; xử lý lỗi theo contract.
- Khi provider trả 429: kiểm tra one column trong scenario mobile chooser; không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx: kiểm tra wrap callback trong scenario mobile chooser; ghi metric không chứa PII.
- Khi callback bị refresh: kiểm tra tap target trong scenario mobile chooser; giữ correlation ID riêng.
- Khi user mở nhiều tab: kiểm tra no overflow trong scenario mobile chooser; chạy lại contract test sau thay đổi.
## 90. Scenario: Production deploy

Mục tiêu: xử lý production deploy mà vẫn giữ đúng authorization boundary.

- Khi CAS conflict: kiểm tra compile trong scenario production deploy; không retry nghiệp vụ không idempotent.
- Khi response là 401: kiểm tra upload trong scenario production deploy; ghi metric không chứa PII.
- Khi response là 400: kiểm tra health trong scenario production deploy; giữ correlation ID riêng.
- Khi response là 200: kiểm tra custom domain trong scenario production deploy; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy: kiểm tra node check trong scenario production deploy; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account: kiểm tra compile trong scenario production deploy; giữ secret ở server-side.
- Khi user bấm Tiếp tục: kiểm tra upload trong scenario production deploy; không ghi credential vào log.
- Khi chạy stress test: kiểm tra health trong scenario production deploy; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP: kiểm tra custom domain trong scenario production deploy; dùng timeout có giới hạn.
- Khi kiểm tra keyboard: kiểm tra node check trong scenario production deploy; xử lý lỗi theo contract.
- Khi kiểm tra mobile: kiểm tra compile trong scenario production deploy; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy: kiểm tra upload trong scenario production deploy; ghi metric không chứa PII.
- Ở local: kiểm tra health trong scenario production deploy; giữ correlation ID riêng.
- Ở staging: kiểm tra custom domain trong scenario production deploy; chạy lại contract test sau thay đổi.
- Ở production: kiểm tra node check trong scenario production deploy; kiểm tra cấu hình trước khi gọi network.
- Trong CI: kiểm tra compile trong scenario production deploy; giữ secret ở server-side.
- Trong manual QA: kiểm tra upload trong scenario production deploy; không ghi credential vào log.
- Khi request đồng thời: kiểm tra health trong scenario production deploy; kiểm tra status code trước khi parse.
- Khi provider trả 429: kiểm tra custom domain trong scenario production deploy; dùng timeout có giới hạn.
- Khi provider trả 5xx: kiểm tra node check trong scenario production deploy; xử lý lỗi theo contract.
- Khi callback bị refresh: kiểm tra compile trong scenario production deploy; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab: kiểm tra upload trong scenario production deploy; ghi metric không chứa PII.
- Khi key vừa rotate: kiểm tra health trong scenario production deploy; giữ correlation ID riêng.
- Khi project vừa revoke: kiểm tra custom domain trong scenario production deploy; chạy lại contract test sau thay đổi.
- Khi device hết hạn: kiểm tra node check trong scenario production deploy; kiểm tra cấu hình trước khi gọi network.
## 91. Scenario: Rollback

Mục tiêu: xử lý rollback mà vẫn giữ đúng authorization boundary.

- Khi response là 200: kiểm tra static asset trong scenario rollback; ghi metric không chứa PII.
- Khi user bấm Hủy: kiểm tra functions trong scenario rollback; giữ correlation ID riêng.
- Khi user bấm Thêm account: kiểm tra smoke trong scenario rollback; chạy lại contract test sau thay đổi.
- Khi user bấm Tiếp tục: kiểm tra old deployment trong scenario rollback; kiểm tra cấu hình trước khi gọi network.
- Khi chạy stress test: kiểm tra health trong scenario rollback; giữ secret ở server-side.
- Khi kiểm tra CSP: kiểm tra static asset trong scenario rollback; không ghi credential vào log.
- Khi kiểm tra keyboard: kiểm tra functions trong scenario rollback; kiểm tra status code trước khi parse.
- Khi kiểm tra mobile: kiểm tra smoke trong scenario rollback; dùng timeout có giới hạn.
- Khi kiểm tra privacy: kiểm tra old deployment trong scenario rollback; xử lý lỗi theo contract.
- Ở local: kiểm tra health trong scenario rollback; không retry nghiệp vụ không idempotent.
- Ở staging: kiểm tra static asset trong scenario rollback; ghi metric không chứa PII.
- Ở production: kiểm tra functions trong scenario rollback; giữ correlation ID riêng.
- Trong CI: kiểm tra smoke trong scenario rollback; chạy lại contract test sau thay đổi.
- Trong manual QA: kiểm tra old deployment trong scenario rollback; kiểm tra cấu hình trước khi gọi network.
- Khi request đồng thời: kiểm tra health trong scenario rollback; giữ secret ở server-side.
- Khi provider trả 429: kiểm tra static asset trong scenario rollback; không ghi credential vào log.
- Khi provider trả 5xx: kiểm tra functions trong scenario rollback; kiểm tra status code trước khi parse.
- Khi callback bị refresh: kiểm tra smoke trong scenario rollback; dùng timeout có giới hạn.
- Khi user mở nhiều tab: kiểm tra old deployment trong scenario rollback; xử lý lỗi theo contract.
- Khi key vừa rotate: kiểm tra health trong scenario rollback; không retry nghiệp vụ không idempotent.
- Khi project vừa revoke: kiểm tra static asset trong scenario rollback; ghi metric không chứa PII.
- Khi device hết hạn: kiểm tra functions trong scenario rollback; giữ correlation ID riêng.
- Khi profile thiếu optional field: kiểm tra smoke trong scenario rollback; chạy lại contract test sau thay đổi.
- Khi log đang bật debug: kiểm tra old deployment trong scenario rollback; kiểm tra cấu hình trước khi gọi network.
- Khi rollback deployment: kiểm tra health trong scenario rollback; giữ secret ở server-side.
## 92. Scenario: Credential incident

Mục tiêu: xử lý credential incident mà vẫn giữ đúng authorization boundary.

- Khi user bấm Tiếp tục: kiểm tra invalidate trong scenario credential incident; giữ correlation ID riêng.
- Khi chạy stress test: kiểm tra notify trong scenario credential incident; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP: kiểm tra rotate trong scenario credential incident; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard: kiểm tra redact trong scenario credential incident; giữ secret ở server-side.
- Khi kiểm tra mobile: kiểm tra audit trong scenario credential incident; không ghi credential vào log.
- Khi kiểm tra privacy: kiểm tra invalidate trong scenario credential incident; kiểm tra status code trước khi parse.
- Ở local: kiểm tra notify trong scenario credential incident; dùng timeout có giới hạn.
- Ở staging: kiểm tra rotate trong scenario credential incident; xử lý lỗi theo contract.
- Ở production: kiểm tra redact trong scenario credential incident; không retry nghiệp vụ không idempotent.
- Trong CI: kiểm tra audit trong scenario credential incident; ghi metric không chứa PII.
- Trong manual QA: kiểm tra invalidate trong scenario credential incident; giữ correlation ID riêng.
- Khi request đồng thời: kiểm tra notify trong scenario credential incident; chạy lại contract test sau thay đổi.
- Khi provider trả 429: kiểm tra rotate trong scenario credential incident; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 5xx: kiểm tra redact trong scenario credential incident; giữ secret ở server-side.
- Khi callback bị refresh: kiểm tra audit trong scenario credential incident; không ghi credential vào log.
- Khi user mở nhiều tab: kiểm tra invalidate trong scenario credential incident; kiểm tra status code trước khi parse.
- Khi key vừa rotate: kiểm tra notify trong scenario credential incident; dùng timeout có giới hạn.
- Khi project vừa revoke: kiểm tra rotate trong scenario credential incident; xử lý lỗi theo contract.
- Khi device hết hạn: kiểm tra redact trong scenario credential incident; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field: kiểm tra audit trong scenario credential incident; ghi metric không chứa PII.
- Khi log đang bật debug: kiểm tra invalidate trong scenario credential incident; giữ correlation ID riêng.
- Khi rollback deployment: kiểm tra notify trong scenario credential incident; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ: kiểm tra rotate trong scenario credential incident; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout: kiểm tra redact trong scenario credential incident; giữ secret ở server-side.
- Khi CAS conflict: kiểm tra audit trong scenario credential incident; không ghi credential vào log.
## 93. Scenario: Support request

Mục tiêu: xử lý support request mà vẫn giữ đúng authorization boundary.

- Khi kiểm tra keyboard: kiểm tra no secrets trong scenario support request; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile: kiểm tra status trong scenario support request; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy: kiểm tra endpoint trong scenario support request; giữ secret ở server-side.
- Ở local: kiểm tra timestamp trong scenario support request; không ghi credential vào log.
- Ở staging: kiểm tra correlation trong scenario support request; kiểm tra status code trước khi parse.
- Ở production: kiểm tra no secrets trong scenario support request; dùng timeout có giới hạn.
- Trong CI: kiểm tra status trong scenario support request; xử lý lỗi theo contract.
- Trong manual QA: kiểm tra endpoint trong scenario support request; không retry nghiệp vụ không idempotent.
- Khi request đồng thời: kiểm tra timestamp trong scenario support request; ghi metric không chứa PII.
- Khi provider trả 429: kiểm tra correlation trong scenario support request; giữ correlation ID riêng.
- Khi provider trả 5xx: kiểm tra no secrets trong scenario support request; chạy lại contract test sau thay đổi.
- Khi callback bị refresh: kiểm tra status trong scenario support request; kiểm tra cấu hình trước khi gọi network.
- Khi user mở nhiều tab: kiểm tra endpoint trong scenario support request; giữ secret ở server-side.
- Khi key vừa rotate: kiểm tra timestamp trong scenario support request; không ghi credential vào log.
- Khi project vừa revoke: kiểm tra correlation trong scenario support request; kiểm tra status code trước khi parse.
- Khi device hết hạn: kiểm tra no secrets trong scenario support request; dùng timeout có giới hạn.
- Khi profile thiếu optional field: kiểm tra status trong scenario support request; xử lý lỗi theo contract.
- Khi log đang bật debug: kiểm tra endpoint trong scenario support request; không retry nghiệp vụ không idempotent.
- Khi rollback deployment: kiểm tra timestamp trong scenario support request; ghi metric không chứa PII.
- Khi migration dữ liệu cũ: kiểm tra correlation trong scenario support request; giữ correlation ID riêng.
- Khi network timeout: kiểm tra no secrets trong scenario support request; chạy lại contract test sau thay đổi.
- Khi CAS conflict: kiểm tra status trong scenario support request; kiểm tra cấu hình trước khi gọi network.
- Khi response là 401: kiểm tra endpoint trong scenario support request; giữ secret ở server-side.
- Khi response là 400: kiểm tra timestamp trong scenario support request; không ghi credential vào log.
- Khi response là 200: kiểm tra correlation trong scenario support request; kiểm tra status code trước khi parse.
## 95. Backend integration: Node.js

Các nguyên tắc áp dụng cho Node.js:

- Ở local, Node.js: dùng crypto.randomUUID(); kiểm tra cấu hình trước khi gọi network.
- Ở staging, Node.js: dùng session server-side; giữ secret ở server-side.
- Ở production, Node.js: dùng fetch với AbortController; không ghi credential vào log.
- Trong CI, Node.js: dùng env API key; kiểm tra status code trước khi parse.
- Trong manual QA, Node.js: dùng redirect nội bộ; dùng timeout có giới hạn.
- Khi request đồng thời, Node.js: dùng check response.ok; xử lý lỗi theo contract.
- Khi provider trả 429, Node.js: dùng crypto.randomUUID(); không retry nghiệp vụ không idempotent.
- Khi provider trả 5xx, Node.js: dùng session server-side; ghi metric không chứa PII.
- Khi callback bị refresh, Node.js: dùng fetch với AbortController; giữ correlation ID riêng.
- Khi user mở nhiều tab, Node.js: dùng env API key; chạy lại contract test sau thay đổi.
- Khi key vừa rotate, Node.js: dùng redirect nội bộ; kiểm tra cấu hình trước khi gọi network.
- Khi project vừa revoke, Node.js: dùng check response.ok; giữ secret ở server-side.
- Khi device hết hạn, Node.js: dùng crypto.randomUUID(); không ghi credential vào log.
- Khi profile thiếu optional field, Node.js: dùng session server-side; kiểm tra status code trước khi parse.
- Khi log đang bật debug, Node.js: dùng fetch với AbortController; dùng timeout có giới hạn.
- Khi rollback deployment, Node.js: dùng env API key; xử lý lỗi theo contract.
- Khi migration dữ liệu cũ, Node.js: dùng redirect nội bộ; không retry nghiệp vụ không idempotent.
- Khi network timeout, Node.js: dùng check response.ok; ghi metric không chứa PII.
- Khi CAS conflict, Node.js: dùng crypto.randomUUID(); giữ correlation ID riêng.
- Khi response là 401, Node.js: dùng session server-side; chạy lại contract test sau thay đổi.
- Khi response là 400, Node.js: dùng fetch với AbortController; kiểm tra cấu hình trước khi gọi network.
- Khi response là 200, Node.js: dùng env API key; giữ secret ở server-side.
- Khi user bấm Hủy, Node.js: dùng redirect nội bộ; không ghi credential vào log.
- Khi user bấm Thêm account, Node.js: dùng check response.ok; kiểm tra status code trước khi parse.
- Khi user bấm Tiếp tục, Node.js: dùng crypto.randomUUID(); dùng timeout có giới hạn.
## 96. Backend integration: Python FastAPI

Các nguyên tắc áp dụng cho Python FastAPI:

- Trong manual QA, Python FastAPI: dùng httpx AsyncClient; giữ secret ở server-side.
- Khi request đồng thời, Python FastAPI: dùng session middleware; không ghi credential vào log.
- Khi provider trả 429, Python FastAPI: dùng env secret; kiểm tra status code trước khi parse.
- Khi provider trả 5xx, Python FastAPI: dùng JSON status; dùng timeout có giới hạn.
- Khi callback bị refresh, Python FastAPI: dùng không raw exception; xử lý lỗi theo contract.
- Khi user mở nhiều tab, Python FastAPI: dùng secrets.token_urlsafe; không retry nghiệp vụ không idempotent.
- Khi key vừa rotate, Python FastAPI: dùng httpx AsyncClient; ghi metric không chứa PII.
- Khi project vừa revoke, Python FastAPI: dùng session middleware; giữ correlation ID riêng.
- Khi device hết hạn, Python FastAPI: dùng env secret; chạy lại contract test sau thay đổi.
- Khi profile thiếu optional field, Python FastAPI: dùng JSON status; kiểm tra cấu hình trước khi gọi network.
- Khi log đang bật debug, Python FastAPI: dùng không raw exception; giữ secret ở server-side.
- Khi rollback deployment, Python FastAPI: dùng secrets.token_urlsafe; không ghi credential vào log.
- Khi migration dữ liệu cũ, Python FastAPI: dùng httpx AsyncClient; kiểm tra status code trước khi parse.
- Khi network timeout, Python FastAPI: dùng session middleware; dùng timeout có giới hạn.
- Khi CAS conflict, Python FastAPI: dùng env secret; xử lý lỗi theo contract.
- Khi response là 401, Python FastAPI: dùng JSON status; không retry nghiệp vụ không idempotent.
- Khi response là 400, Python FastAPI: dùng không raw exception; ghi metric không chứa PII.
- Khi response là 200, Python FastAPI: dùng secrets.token_urlsafe; giữ correlation ID riêng.
- Khi user bấm Hủy, Python FastAPI: dùng httpx AsyncClient; chạy lại contract test sau thay đổi.
- Khi user bấm Thêm account, Python FastAPI: dùng session middleware; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Tiếp tục, Python FastAPI: dùng env secret; giữ secret ở server-side.
- Khi chạy stress test, Python FastAPI: dùng JSON status; không ghi credential vào log.
- Khi kiểm tra CSP, Python FastAPI: dùng không raw exception; kiểm tra status code trước khi parse.
- Khi kiểm tra keyboard, Python FastAPI: dùng secrets.token_urlsafe; dùng timeout có giới hạn.
- Khi kiểm tra mobile, Python FastAPI: dùng httpx AsyncClient; xử lý lỗi theo contract.
## 97. Backend integration: Go

Các nguyên tắc áp dụng cho Go:

- Khi callback bị refresh, Go: dùng http.Client; không ghi credential vào log.
- Khi user mở nhiều tab, Go: dùng close response body; kiểm tra status code trước khi parse.
- Khi key vừa rotate, Go: dùng secret manager; dùng timeout có giới hạn.
- Khi project vừa revoke, Go: dùng status check; xử lý lỗi theo contract.
- Khi device hết hạn, Go: dùng crypto/rand; không retry nghiệp vụ không idempotent.
- Khi profile thiếu optional field, Go: dùng context timeout; ghi metric không chứa PII.
- Khi log đang bật debug, Go: dùng http.Client; giữ correlation ID riêng.
- Khi rollback deployment, Go: dùng close response body; chạy lại contract test sau thay đổi.
- Khi migration dữ liệu cũ, Go: dùng secret manager; kiểm tra cấu hình trước khi gọi network.
- Khi network timeout, Go: dùng status check; giữ secret ở server-side.
- Khi CAS conflict, Go: dùng crypto/rand; không ghi credential vào log.
- Khi response là 401, Go: dùng context timeout; kiểm tra status code trước khi parse.
- Khi response là 400, Go: dùng http.Client; dùng timeout có giới hạn.
- Khi response là 200, Go: dùng close response body; xử lý lỗi theo contract.
- Khi user bấm Hủy, Go: dùng secret manager; không retry nghiệp vụ không idempotent.
- Khi user bấm Thêm account, Go: dùng status check; ghi metric không chứa PII.
- Khi user bấm Tiếp tục, Go: dùng crypto/rand; giữ correlation ID riêng.
- Khi chạy stress test, Go: dùng context timeout; chạy lại contract test sau thay đổi.
- Khi kiểm tra CSP, Go: dùng http.Client; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra keyboard, Go: dùng close response body; giữ secret ở server-side.
- Khi kiểm tra mobile, Go: dùng secret manager; không ghi credential vào log.
- Khi kiểm tra privacy, Go: dùng status check; kiểm tra status code trước khi parse.
- Ở local, Go: dùng crypto/rand; dùng timeout có giới hạn.
- Ở staging, Go: dùng context timeout; xử lý lỗi theo contract.
- Ở production, Go: dùng http.Client; không retry nghiệp vụ không idempotent.
## 98. Backend integration: PHP Laravel

Các nguyên tắc áp dụng cho PHP Laravel:

- Khi device hết hạn, PHP Laravel: dùng redirect route; kiểm tra status code trước khi parse.
- Khi profile thiếu optional field, PHP Laravel: dùng Auth login; dùng timeout có giới hạn.
- Khi log đang bật debug, PHP Laravel: dùng status check; xử lý lỗi theo contract.
- Khi rollback deployment, PHP Laravel: dùng session state; không retry nghiệp vụ không idempotent.
- Khi migration dữ liệu cũ, PHP Laravel: dùng Http timeout; ghi metric không chứa PII.
- Khi network timeout, PHP Laravel: dùng config secret; giữ correlation ID riêng.
- Khi CAS conflict, PHP Laravel: dùng redirect route; chạy lại contract test sau thay đổi.
- Khi response là 401, PHP Laravel: dùng Auth login; kiểm tra cấu hình trước khi gọi network.
- Khi response là 400, PHP Laravel: dùng status check; giữ secret ở server-side.
- Khi response là 200, PHP Laravel: dùng session state; không ghi credential vào log.
- Khi user bấm Hủy, PHP Laravel: dùng Http timeout; kiểm tra status code trước khi parse.
- Khi user bấm Thêm account, PHP Laravel: dùng config secret; dùng timeout có giới hạn.
- Khi user bấm Tiếp tục, PHP Laravel: dùng redirect route; xử lý lỗi theo contract.
- Khi chạy stress test, PHP Laravel: dùng Auth login; không retry nghiệp vụ không idempotent.
- Khi kiểm tra CSP, PHP Laravel: dùng status check; ghi metric không chứa PII.
- Khi kiểm tra keyboard, PHP Laravel: dùng session state; giữ correlation ID riêng.
- Khi kiểm tra mobile, PHP Laravel: dùng Http timeout; chạy lại contract test sau thay đổi.
- Khi kiểm tra privacy, PHP Laravel: dùng config secret; kiểm tra cấu hình trước khi gọi network.
- Ở local, PHP Laravel: dùng redirect route; giữ secret ở server-side.
- Ở staging, PHP Laravel: dùng Auth login; không ghi credential vào log.
- Ở production, PHP Laravel: dùng status check; kiểm tra status code trước khi parse.
- Trong CI, PHP Laravel: dùng session state; dùng timeout có giới hạn.
- Trong manual QA, PHP Laravel: dùng Http timeout; xử lý lỗi theo contract.
- Khi request đồng thời, PHP Laravel: dùng config secret; không retry nghiệp vụ không idempotent.
- Khi provider trả 429, PHP Laravel: dùng redirect route; ghi metric không chứa PII.
## 99. Backend integration: Cloudflare Workers

Các nguyên tắc áp dụng cho Cloudflare Workers:

- Khi migration dữ liệu cũ, Cloudflare Workers: dùng no raw token; dùng timeout có giới hạn.
- Khi network timeout, Cloudflare Workers: dùng waitUntil audit; xử lý lỗi theo contract.
- Khi CAS conflict, Cloudflare Workers: dùng env secret; không retry nghiệp vụ không idempotent.
- Khi response là 401, Cloudflare Workers: dùng Response.redirect; ghi metric không chứa PII.
- Khi response là 400, Cloudflare Workers: dùng fetch async; giữ correlation ID riêng.
- Khi response là 200, Cloudflare Workers: dùng no public key; chạy lại contract test sau thay đổi.
- Khi user bấm Hủy, Cloudflare Workers: dùng no raw token; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Thêm account, Cloudflare Workers: dùng waitUntil audit; giữ secret ở server-side.
- Khi user bấm Tiếp tục, Cloudflare Workers: dùng env secret; không ghi credential vào log.
- Khi chạy stress test, Cloudflare Workers: dùng Response.redirect; kiểm tra status code trước khi parse.
- Khi kiểm tra CSP, Cloudflare Workers: dùng fetch async; dùng timeout có giới hạn.
- Khi kiểm tra keyboard, Cloudflare Workers: dùng no public key; xử lý lỗi theo contract.
- Khi kiểm tra mobile, Cloudflare Workers: dùng no raw token; không retry nghiệp vụ không idempotent.
- Khi kiểm tra privacy, Cloudflare Workers: dùng waitUntil audit; ghi metric không chứa PII.
- Ở local, Cloudflare Workers: dùng env secret; giữ correlation ID riêng.
- Ở staging, Cloudflare Workers: dùng Response.redirect; chạy lại contract test sau thay đổi.
- Ở production, Cloudflare Workers: dùng fetch async; kiểm tra cấu hình trước khi gọi network.
- Trong CI, Cloudflare Workers: dùng no public key; giữ secret ở server-side.
- Trong manual QA, Cloudflare Workers: dùng no raw token; không ghi credential vào log.
- Khi request đồng thời, Cloudflare Workers: dùng waitUntil audit; kiểm tra status code trước khi parse.
- Khi provider trả 429, Cloudflare Workers: dùng env secret; dùng timeout có giới hạn.
- Khi provider trả 5xx, Cloudflare Workers: dùng Response.redirect; xử lý lỗi theo contract.
- Khi callback bị refresh, Cloudflare Workers: dùng fetch async; không retry nghiệp vụ không idempotent.
- Khi user mở nhiều tab, Cloudflare Workers: dùng no public key; ghi metric không chứa PII.
- Khi key vừa rotate, Cloudflare Workers: dùng no raw token; giữ correlation ID riêng.
## 100. Backend integration: Next.js

Các nguyên tắc áp dụng cho Next.js:

- Khi response là 400, Next.js: dùng session cookie; xử lý lỗi theo contract.
- Khi response là 200, Next.js: dùng server route; không retry nghiệp vụ không idempotent.
- Khi user bấm Hủy, Next.js: dùng server environment; ghi metric không chứa PII.
- Khi user bấm Thêm account, Next.js: dùng no NEXT_PUBLIC API key; giữ correlation ID riêng.
- Khi user bấm Tiếp tục, Next.js: dùng no-store; chạy lại contract test sau thay đổi.
- Khi chạy stress test, Next.js: dùng redirect server; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra CSP, Next.js: dùng session cookie; giữ secret ở server-side.
- Khi kiểm tra keyboard, Next.js: dùng server route; không ghi credential vào log.
- Khi kiểm tra mobile, Next.js: dùng server environment; kiểm tra status code trước khi parse.
- Khi kiểm tra privacy, Next.js: dùng no NEXT_PUBLIC API key; dùng timeout có giới hạn.
- Ở local, Next.js: dùng no-store; xử lý lỗi theo contract.
- Ở staging, Next.js: dùng redirect server; không retry nghiệp vụ không idempotent.
- Ở production, Next.js: dùng session cookie; ghi metric không chứa PII.
- Trong CI, Next.js: dùng server route; giữ correlation ID riêng.
- Trong manual QA, Next.js: dùng server environment; chạy lại contract test sau thay đổi.
- Khi request đồng thời, Next.js: dùng no NEXT_PUBLIC API key; kiểm tra cấu hình trước khi gọi network.
- Khi provider trả 429, Next.js: dùng no-store; giữ secret ở server-side.
- Khi provider trả 5xx, Next.js: dùng redirect server; không ghi credential vào log.
- Khi callback bị refresh, Next.js: dùng session cookie; kiểm tra status code trước khi parse.
- Khi user mở nhiều tab, Next.js: dùng server route; dùng timeout có giới hạn.
- Khi key vừa rotate, Next.js: dùng server environment; xử lý lỗi theo contract.
- Khi project vừa revoke, Next.js: dùng no NEXT_PUBLIC API key; không retry nghiệp vụ không idempotent.
- Khi device hết hạn, Next.js: dùng no-store; ghi metric không chứa PII.
- Khi profile thiếu optional field, Next.js: dùng redirect server; giữ correlation ID riêng.
- Khi log đang bật debug, Next.js: dùng session cookie; chạy lại contract test sau thay đổi.
## 101. Backend integration: Express

Các nguyên tắc áp dụng cho Express:

- Khi user bấm Tiếp tục, Express: dùng middleware callback; không retry nghiệp vụ không idempotent.
- Khi chạy stress test, Express: dùng CSRF session; ghi metric không chứa PII.
- Khi kiểm tra CSP, Express: dùng fetch timeout; giữ correlation ID riêng.
- Khi kiểm tra keyboard, Express: dùng local session; chạy lại contract test sau thay đổi.
- Khi kiểm tra mobile, Express: dùng redacted error; kiểm tra cấu hình trước khi gọi network.
- Khi kiểm tra privacy, Express: dùng rate limit; giữ secret ở server-side.
- Ở local, Express: dùng middleware callback; không ghi credential vào log.
- Ở staging, Express: dùng CSRF session; kiểm tra status code trước khi parse.
- Ở production, Express: dùng fetch timeout; dùng timeout có giới hạn.
- Trong CI, Express: dùng local session; xử lý lỗi theo contract.
- Trong manual QA, Express: dùng redacted error; không retry nghiệp vụ không idempotent.
- Khi request đồng thời, Express: dùng rate limit; ghi metric không chứa PII.
- Khi provider trả 429, Express: dùng middleware callback; giữ correlation ID riêng.
- Khi provider trả 5xx, Express: dùng CSRF session; chạy lại contract test sau thay đổi.
- Khi callback bị refresh, Express: dùng fetch timeout; kiểm tra cấu hình trước khi gọi network.
- Khi user mở nhiều tab, Express: dùng local session; giữ secret ở server-side.
- Khi key vừa rotate, Express: dùng redacted error; không ghi credential vào log.
- Khi project vừa revoke, Express: dùng rate limit; kiểm tra status code trước khi parse.
- Khi device hết hạn, Express: dùng middleware callback; dùng timeout có giới hạn.
- Khi profile thiếu optional field, Express: dùng CSRF session; xử lý lỗi theo contract.
- Khi log đang bật debug, Express: dùng fetch timeout; không retry nghiệp vụ không idempotent.
- Khi rollback deployment, Express: dùng local session; ghi metric không chứa PII.
- Khi migration dữ liệu cũ, Express: dùng redacted error; giữ correlation ID riêng.
- Khi network timeout, Express: dùng rate limit; chạy lại contract test sau thay đổi.
- Khi CAS conflict, Express: dùng middleware callback; kiểm tra cấu hình trước khi gọi network.
## 102. Backend integration: Framework bất kỳ

Các nguyên tắc áp dụng cho Framework bất kỳ:

- Khi kiểm tra mobile, Framework bất kỳ: dùng exact callback; ghi metric không chứa PII.
- Khi kiểm tra privacy, Framework bất kỳ: dùng server token exchange; giữ correlation ID riêng.
- Ở local, Framework bất kỳ: dùng profile validation; chạy lại contract test sau thay đổi.
- Ở staging, Framework bất kỳ: dùng secret storage; kiểm tra cấu hình trước khi gọi network.
- Ở production, Framework bất kỳ: dùng contract test; giữ secret ở server-side.
- Trong CI, Framework bất kỳ: dùng random state; không ghi credential vào log.
- Trong manual QA, Framework bất kỳ: dùng exact callback; kiểm tra status code trước khi parse.
- Khi request đồng thời, Framework bất kỳ: dùng server token exchange; dùng timeout có giới hạn.
- Khi provider trả 429, Framework bất kỳ: dùng profile validation; xử lý lỗi theo contract.
- Khi provider trả 5xx, Framework bất kỳ: dùng secret storage; không retry nghiệp vụ không idempotent.
- Khi callback bị refresh, Framework bất kỳ: dùng contract test; ghi metric không chứa PII.
- Khi user mở nhiều tab, Framework bất kỳ: dùng random state; giữ correlation ID riêng.
- Khi key vừa rotate, Framework bất kỳ: dùng exact callback; chạy lại contract test sau thay đổi.
- Khi project vừa revoke, Framework bất kỳ: dùng server token exchange; kiểm tra cấu hình trước khi gọi network.
- Khi device hết hạn, Framework bất kỳ: dùng profile validation; giữ secret ở server-side.
- Khi profile thiếu optional field, Framework bất kỳ: dùng secret storage; không ghi credential vào log.
- Khi log đang bật debug, Framework bất kỳ: dùng contract test; kiểm tra status code trước khi parse.
- Khi rollback deployment, Framework bất kỳ: dùng random state; dùng timeout có giới hạn.
- Khi migration dữ liệu cũ, Framework bất kỳ: dùng exact callback; xử lý lỗi theo contract.
- Khi network timeout, Framework bất kỳ: dùng server token exchange; không retry nghiệp vụ không idempotent.
- Khi CAS conflict, Framework bất kỳ: dùng profile validation; ghi metric không chứa PII.
- Khi response là 401, Framework bất kỳ: dùng secret storage; giữ correlation ID riêng.
- Khi response là 400, Framework bất kỳ: dùng contract test; chạy lại contract test sau thay đổi.
- Khi response là 200, Framework bất kỳ: dùng random state; kiểm tra cấu hình trước khi gọi network.
- Khi user bấm Hủy, Framework bất kỳ: dùng exact callback; giữ secret ở server-side.
## 103. Test checklist tổng hợp

- Node check toàn bộ Functions.
- Node check toàn bộ frontend JavaScript.
- Static asset reference check.
- Health local.
- Landing local.
- Chooser script local.
- Health production.
- Discovery production.
- Session unauthenticated.
- OAuth start bad client.
- OAuth start bad redirect.
- Chooser empty device.
- Chooser remembered account.
- Add account.
- Cancel consent.
- State mismatch.
- Token missing fields.
- Token client_secret rejection.
- Token invalid client.
- Token invalid grant.
- Token replay.
- Profile full fields.
- No Google subject.
- No Google token.
- API key one-time.
- API key old rejection after rotate.
- Project-info no key response.
- Project list no key response.
- Allusers profile fields.
- Revoke cleanup.
- 100 concurrent authorize.
- 100 concurrent consent.
- 100 concurrent token.
- No duplicate apiUser.
- No duplicate device account.
- No duplicate auth code.
- Batch max six.
- Query retry max three.
- CSP check.
- Keyboard check.
- Responsive check.
- Production smoke.
- Rollback rehearsal.
- Credential redaction.
- Documentation review.
- Acceptance item 1: Ở local phải xác nhận node check toàn bộ functions.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 2: Khi provider trả 5xx phải xác nhận node check toàn bộ frontend javascript.; giữ secret ở server-side.
- Acceptance item 3: Khi log đang bật debug phải xác nhận static asset reference check.; không ghi credential vào log.
- Acceptance item 4: Khi response là 200 phải xác nhận health local.; kiểm tra status code trước khi parse.
- Acceptance item 5: Khi kiểm tra mobile phải xác nhận landing local.; dùng timeout có giới hạn.
- Acceptance item 6: Khi request đồng thời phải xác nhận chooser script local.; xử lý lỗi theo contract.
- Acceptance item 7: Khi device hết hạn phải xác nhận health production.; không retry nghiệp vụ không idempotent.
- Acceptance item 8: Khi response là 401 phải xác nhận discovery production.; ghi metric không chứa PII.
- Acceptance item 9: Khi kiểm tra CSP phải xác nhận session unauthenticated.; giữ correlation ID riêng.
- Acceptance item 10: Trong CI phải xác nhận oauth start bad client.; chạy lại contract test sau thay đổi.
- Acceptance item 11: Khi key vừa rotate phải xác nhận oauth start bad redirect.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 12: Khi network timeout phải xác nhận chooser empty device.; giữ secret ở server-side.
- Acceptance item 13: Khi user bấm Tiếp tục phải xác nhận chooser remembered account.; không ghi credential vào log.
- Acceptance item 14: Ở staging phải xác nhận add account.; kiểm tra status code trước khi parse.
- Acceptance item 15: Khi callback bị refresh phải xác nhận cancel consent.; dùng timeout có giới hạn.
- Acceptance item 16: Khi rollback deployment phải xác nhận state mismatch.; xử lý lỗi theo contract.
- Acceptance item 17: Khi user bấm Hủy phải xác nhận token missing fields.; không retry nghiệp vụ không idempotent.
- Acceptance item 18: Khi kiểm tra privacy phải xác nhận token client_secret rejection.; ghi metric không chứa PII.
- Acceptance item 19: Khi provider trả 429 phải xác nhận token invalid client.; giữ correlation ID riêng.
- Acceptance item 20: Khi profile thiếu optional field phải xác nhận token invalid grant.; chạy lại contract test sau thay đổi.
- Acceptance item 21: Khi response là 400 phải xác nhận token replay.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 22: Khi kiểm tra keyboard phải xác nhận profile full fields.; giữ secret ở server-side.
- Acceptance item 23: Trong manual QA phải xác nhận no google subject.; không ghi credential vào log.
- Acceptance item 24: Khi project vừa revoke phải xác nhận no google token.; kiểm tra status code trước khi parse.
- Acceptance item 25: Khi CAS conflict phải xác nhận api key one-time.; dùng timeout có giới hạn.
- Acceptance item 26: Khi chạy stress test phải xác nhận api key old rejection after rotate.; xử lý lỗi theo contract.
- Acceptance item 27: Ở production phải xác nhận project-info no key response.; không retry nghiệp vụ không idempotent.
- Acceptance item 28: Khi user mở nhiều tab phải xác nhận project list no key response.; ghi metric không chứa PII.
- Acceptance item 29: Khi migration dữ liệu cũ phải xác nhận allusers profile fields.; giữ correlation ID riêng.
- Acceptance item 30: Khi user bấm Thêm account phải xác nhận revoke cleanup.; chạy lại contract test sau thay đổi.
- Acceptance item 31: Ở local phải xác nhận 100 concurrent authorize.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 32: Khi provider trả 5xx phải xác nhận 100 concurrent consent.; giữ secret ở server-side.
- Acceptance item 33: Khi log đang bật debug phải xác nhận 100 concurrent token.; không ghi credential vào log.
- Acceptance item 34: Khi response là 200 phải xác nhận no duplicate apiuser.; kiểm tra status code trước khi parse.
- Acceptance item 35: Khi kiểm tra mobile phải xác nhận no duplicate device account.; dùng timeout có giới hạn.
- Acceptance item 36: Khi request đồng thời phải xác nhận no duplicate auth code.; xử lý lỗi theo contract.
- Acceptance item 37: Khi device hết hạn phải xác nhận batch max six.; không retry nghiệp vụ không idempotent.
- Acceptance item 38: Khi response là 401 phải xác nhận query retry max three.; ghi metric không chứa PII.
- Acceptance item 39: Khi kiểm tra CSP phải xác nhận csp check.; giữ correlation ID riêng.
- Acceptance item 40: Trong CI phải xác nhận keyboard check.; chạy lại contract test sau thay đổi.
- Acceptance item 41: Khi key vừa rotate phải xác nhận responsive check.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 42: Khi network timeout phải xác nhận production smoke.; giữ secret ở server-side.
- Acceptance item 43: Khi user bấm Tiếp tục phải xác nhận rollback rehearsal.; không ghi credential vào log.
- Acceptance item 44: Ở staging phải xác nhận credential redaction.; kiểm tra status code trước khi parse.
- Acceptance item 45: Khi callback bị refresh phải xác nhận documentation review.; dùng timeout có giới hạn.
- Acceptance item 46: Khi rollback deployment phải xác nhận node check toàn bộ functions.; xử lý lỗi theo contract.
- Acceptance item 47: Khi user bấm Hủy phải xác nhận node check toàn bộ frontend javascript.; không retry nghiệp vụ không idempotent.
- Acceptance item 48: Khi kiểm tra privacy phải xác nhận static asset reference check.; ghi metric không chứa PII.
- Acceptance item 49: Khi provider trả 429 phải xác nhận health local.; giữ correlation ID riêng.
- Acceptance item 50: Khi profile thiếu optional field phải xác nhận landing local.; chạy lại contract test sau thay đổi.
- Acceptance item 51: Khi response là 400 phải xác nhận chooser script local.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 52: Khi kiểm tra keyboard phải xác nhận health production.; giữ secret ở server-side.
- Acceptance item 53: Trong manual QA phải xác nhận discovery production.; không ghi credential vào log.
- Acceptance item 54: Khi project vừa revoke phải xác nhận session unauthenticated.; kiểm tra status code trước khi parse.
- Acceptance item 55: Khi CAS conflict phải xác nhận oauth start bad client.; dùng timeout có giới hạn.
- Acceptance item 56: Khi chạy stress test phải xác nhận oauth start bad redirect.; xử lý lỗi theo contract.
- Acceptance item 57: Ở production phải xác nhận chooser empty device.; không retry nghiệp vụ không idempotent.
- Acceptance item 58: Khi user mở nhiều tab phải xác nhận chooser remembered account.; ghi metric không chứa PII.
- Acceptance item 59: Khi migration dữ liệu cũ phải xác nhận add account.; giữ correlation ID riêng.
- Acceptance item 60: Khi user bấm Thêm account phải xác nhận cancel consent.; chạy lại contract test sau thay đổi.
- Acceptance item 61: Ở local phải xác nhận state mismatch.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 62: Khi provider trả 5xx phải xác nhận token missing fields.; giữ secret ở server-side.
- Acceptance item 63: Khi log đang bật debug phải xác nhận token client_secret rejection.; không ghi credential vào log.
- Acceptance item 64: Khi response là 200 phải xác nhận token invalid client.; kiểm tra status code trước khi parse.
- Acceptance item 65: Khi kiểm tra mobile phải xác nhận token invalid grant.; dùng timeout có giới hạn.
- Acceptance item 66: Khi request đồng thời phải xác nhận token replay.; xử lý lỗi theo contract.
- Acceptance item 67: Khi device hết hạn phải xác nhận profile full fields.; không retry nghiệp vụ không idempotent.
- Acceptance item 68: Khi response là 401 phải xác nhận no google subject.; ghi metric không chứa PII.
- Acceptance item 69: Khi kiểm tra CSP phải xác nhận no google token.; giữ correlation ID riêng.
- Acceptance item 70: Trong CI phải xác nhận api key one-time.; chạy lại contract test sau thay đổi.
- Acceptance item 71: Khi key vừa rotate phải xác nhận api key old rejection after rotate.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 72: Khi network timeout phải xác nhận project-info no key response.; giữ secret ở server-side.
- Acceptance item 73: Khi user bấm Tiếp tục phải xác nhận project list no key response.; không ghi credential vào log.
- Acceptance item 74: Ở staging phải xác nhận allusers profile fields.; kiểm tra status code trước khi parse.
- Acceptance item 75: Khi callback bị refresh phải xác nhận revoke cleanup.; dùng timeout có giới hạn.
- Acceptance item 76: Khi rollback deployment phải xác nhận 100 concurrent authorize.; xử lý lỗi theo contract.
- Acceptance item 77: Khi user bấm Hủy phải xác nhận 100 concurrent consent.; không retry nghiệp vụ không idempotent.
- Acceptance item 78: Khi kiểm tra privacy phải xác nhận 100 concurrent token.; ghi metric không chứa PII.
- Acceptance item 79: Khi provider trả 429 phải xác nhận no duplicate apiuser.; giữ correlation ID riêng.
- Acceptance item 80: Khi profile thiếu optional field phải xác nhận no duplicate device account.; chạy lại contract test sau thay đổi.
- Acceptance item 81: Khi response là 400 phải xác nhận no duplicate auth code.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 82: Khi kiểm tra keyboard phải xác nhận batch max six.; giữ secret ở server-side.
- Acceptance item 83: Trong manual QA phải xác nhận query retry max three.; không ghi credential vào log.
- Acceptance item 84: Khi project vừa revoke phải xác nhận csp check.; kiểm tra status code trước khi parse.
- Acceptance item 85: Khi CAS conflict phải xác nhận keyboard check.; dùng timeout có giới hạn.
- Acceptance item 86: Khi chạy stress test phải xác nhận responsive check.; xử lý lỗi theo contract.
- Acceptance item 87: Ở production phải xác nhận production smoke.; không retry nghiệp vụ không idempotent.
- Acceptance item 88: Khi user mở nhiều tab phải xác nhận rollback rehearsal.; ghi metric không chứa PII.
- Acceptance item 89: Khi migration dữ liệu cũ phải xác nhận credential redaction.; giữ correlation ID riêng.
- Acceptance item 90: Khi user bấm Thêm account phải xác nhận documentation review.; chạy lại contract test sau thay đổi.
- Acceptance item 91: Ở local phải xác nhận node check toàn bộ functions.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 92: Khi provider trả 5xx phải xác nhận node check toàn bộ frontend javascript.; giữ secret ở server-side.
- Acceptance item 93: Khi log đang bật debug phải xác nhận static asset reference check.; không ghi credential vào log.
- Acceptance item 94: Khi response là 200 phải xác nhận health local.; kiểm tra status code trước khi parse.
- Acceptance item 95: Khi kiểm tra mobile phải xác nhận landing local.; dùng timeout có giới hạn.
- Acceptance item 96: Khi request đồng thời phải xác nhận chooser script local.; xử lý lỗi theo contract.
- Acceptance item 97: Khi device hết hạn phải xác nhận health production.; không retry nghiệp vụ không idempotent.
- Acceptance item 98: Khi response là 401 phải xác nhận discovery production.; ghi metric không chứa PII.
- Acceptance item 99: Khi kiểm tra CSP phải xác nhận session unauthenticated.; giữ correlation ID riêng.
- Acceptance item 100: Trong CI phải xác nhận oauth start bad client.; chạy lại contract test sau thay đổi.
- Acceptance item 101: Khi key vừa rotate phải xác nhận oauth start bad redirect.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 102: Khi network timeout phải xác nhận chooser empty device.; giữ secret ở server-side.
- Acceptance item 103: Khi user bấm Tiếp tục phải xác nhận chooser remembered account.; không ghi credential vào log.
- Acceptance item 104: Ở staging phải xác nhận add account.; kiểm tra status code trước khi parse.
- Acceptance item 105: Khi callback bị refresh phải xác nhận cancel consent.; dùng timeout có giới hạn.
- Acceptance item 106: Khi rollback deployment phải xác nhận state mismatch.; xử lý lỗi theo contract.
- Acceptance item 107: Khi user bấm Hủy phải xác nhận token missing fields.; không retry nghiệp vụ không idempotent.
- Acceptance item 108: Khi kiểm tra privacy phải xác nhận token client_secret rejection.; ghi metric không chứa PII.
- Acceptance item 109: Khi provider trả 429 phải xác nhận token invalid client.; giữ correlation ID riêng.
- Acceptance item 110: Khi profile thiếu optional field phải xác nhận token invalid grant.; chạy lại contract test sau thay đổi.
- Acceptance item 111: Khi response là 400 phải xác nhận token replay.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 112: Khi kiểm tra keyboard phải xác nhận profile full fields.; giữ secret ở server-side.
- Acceptance item 113: Trong manual QA phải xác nhận no google subject.; không ghi credential vào log.
- Acceptance item 114: Khi project vừa revoke phải xác nhận no google token.; kiểm tra status code trước khi parse.
- Acceptance item 115: Khi CAS conflict phải xác nhận api key one-time.; dùng timeout có giới hạn.
- Acceptance item 116: Khi chạy stress test phải xác nhận api key old rejection after rotate.; xử lý lỗi theo contract.
- Acceptance item 117: Ở production phải xác nhận project-info no key response.; không retry nghiệp vụ không idempotent.
- Acceptance item 118: Khi user mở nhiều tab phải xác nhận project list no key response.; ghi metric không chứa PII.
- Acceptance item 119: Khi migration dữ liệu cũ phải xác nhận allusers profile fields.; giữ correlation ID riêng.
- Acceptance item 120: Khi user bấm Thêm account phải xác nhận revoke cleanup.; chạy lại contract test sau thay đổi.
- Acceptance item 121: Ở local phải xác nhận 100 concurrent authorize.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 122: Khi provider trả 5xx phải xác nhận 100 concurrent consent.; giữ secret ở server-side.
- Acceptance item 123: Khi log đang bật debug phải xác nhận 100 concurrent token.; không ghi credential vào log.
- Acceptance item 124: Khi response là 200 phải xác nhận no duplicate apiuser.; kiểm tra status code trước khi parse.
- Acceptance item 125: Khi kiểm tra mobile phải xác nhận no duplicate device account.; dùng timeout có giới hạn.
- Acceptance item 126: Khi request đồng thời phải xác nhận no duplicate auth code.; xử lý lỗi theo contract.
- Acceptance item 127: Khi device hết hạn phải xác nhận batch max six.; không retry nghiệp vụ không idempotent.
- Acceptance item 128: Khi response là 401 phải xác nhận query retry max three.; ghi metric không chứa PII.
- Acceptance item 129: Khi kiểm tra CSP phải xác nhận csp check.; giữ correlation ID riêng.
- Acceptance item 130: Trong CI phải xác nhận keyboard check.; chạy lại contract test sau thay đổi.
- Acceptance item 131: Khi key vừa rotate phải xác nhận responsive check.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 132: Khi network timeout phải xác nhận production smoke.; giữ secret ở server-side.
- Acceptance item 133: Khi user bấm Tiếp tục phải xác nhận rollback rehearsal.; không ghi credential vào log.
- Acceptance item 134: Ở staging phải xác nhận credential redaction.; kiểm tra status code trước khi parse.
- Acceptance item 135: Khi callback bị refresh phải xác nhận documentation review.; dùng timeout có giới hạn.
- Acceptance item 136: Khi rollback deployment phải xác nhận node check toàn bộ functions.; xử lý lỗi theo contract.
- Acceptance item 137: Khi user bấm Hủy phải xác nhận node check toàn bộ frontend javascript.; không retry nghiệp vụ không idempotent.
- Acceptance item 138: Khi kiểm tra privacy phải xác nhận static asset reference check.; ghi metric không chứa PII.
- Acceptance item 139: Khi provider trả 429 phải xác nhận health local.; giữ correlation ID riêng.
- Acceptance item 140: Khi profile thiếu optional field phải xác nhận landing local.; chạy lại contract test sau thay đổi.
- Acceptance item 141: Khi response là 400 phải xác nhận chooser script local.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 142: Khi kiểm tra keyboard phải xác nhận health production.; giữ secret ở server-side.
- Acceptance item 143: Trong manual QA phải xác nhận discovery production.; không ghi credential vào log.
- Acceptance item 144: Khi project vừa revoke phải xác nhận session unauthenticated.; kiểm tra status code trước khi parse.
- Acceptance item 145: Khi CAS conflict phải xác nhận oauth start bad client.; dùng timeout có giới hạn.
- Acceptance item 146: Khi chạy stress test phải xác nhận oauth start bad redirect.; xử lý lỗi theo contract.
- Acceptance item 147: Ở production phải xác nhận chooser empty device.; không retry nghiệp vụ không idempotent.
- Acceptance item 148: Khi user mở nhiều tab phải xác nhận chooser remembered account.; ghi metric không chứa PII.
- Acceptance item 149: Khi migration dữ liệu cũ phải xác nhận add account.; giữ correlation ID riêng.
- Acceptance item 150: Khi user bấm Thêm account phải xác nhận cancel consent.; chạy lại contract test sau thay đổi.
- Acceptance item 151: Ở local phải xác nhận state mismatch.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 152: Khi provider trả 5xx phải xác nhận token missing fields.; giữ secret ở server-side.
- Acceptance item 153: Khi log đang bật debug phải xác nhận token client_secret rejection.; không ghi credential vào log.
- Acceptance item 154: Khi response là 200 phải xác nhận token invalid client.; kiểm tra status code trước khi parse.
- Acceptance item 155: Khi kiểm tra mobile phải xác nhận token invalid grant.; dùng timeout có giới hạn.
- Acceptance item 156: Khi request đồng thời phải xác nhận token replay.; xử lý lỗi theo contract.
- Acceptance item 157: Khi device hết hạn phải xác nhận profile full fields.; không retry nghiệp vụ không idempotent.
- Acceptance item 158: Khi response là 401 phải xác nhận no google subject.; ghi metric không chứa PII.
- Acceptance item 159: Khi kiểm tra CSP phải xác nhận no google token.; giữ correlation ID riêng.
- Acceptance item 160: Trong CI phải xác nhận api key one-time.; chạy lại contract test sau thay đổi.
- Acceptance item 161: Khi key vừa rotate phải xác nhận api key old rejection after rotate.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 162: Khi network timeout phải xác nhận project-info no key response.; giữ secret ở server-side.
- Acceptance item 163: Khi user bấm Tiếp tục phải xác nhận project list no key response.; không ghi credential vào log.
- Acceptance item 164: Ở staging phải xác nhận allusers profile fields.; kiểm tra status code trước khi parse.
- Acceptance item 165: Khi callback bị refresh phải xác nhận revoke cleanup.; dùng timeout có giới hạn.
- Acceptance item 166: Khi rollback deployment phải xác nhận 100 concurrent authorize.; xử lý lỗi theo contract.
- Acceptance item 167: Khi user bấm Hủy phải xác nhận 100 concurrent consent.; không retry nghiệp vụ không idempotent.
- Acceptance item 168: Khi kiểm tra privacy phải xác nhận 100 concurrent token.; ghi metric không chứa PII.
- Acceptance item 169: Khi provider trả 429 phải xác nhận no duplicate apiuser.; giữ correlation ID riêng.
- Acceptance item 170: Khi profile thiếu optional field phải xác nhận no duplicate device account.; chạy lại contract test sau thay đổi.
- Acceptance item 171: Khi response là 400 phải xác nhận no duplicate auth code.; kiểm tra cấu hình trước khi gọi network.
- Acceptance item 172: Khi kiểm tra keyboard phải xác nhận batch max six.; giữ secret ở server-side.
- Acceptance item 173: Trong manual QA phải xác nhận query retry max three.; không ghi credential vào log.
- Acceptance item 174: Khi project vừa revoke phải xác nhận csp check.; kiểm tra status code trước khi parse.
- Acceptance item 175: Khi CAS conflict phải xác nhận keyboard check.; dùng timeout có giới hạn.
- Acceptance item 176: Khi chạy stress test phải xác nhận responsive check.; xử lý lỗi theo contract.
- Acceptance item 177: Ở production phải xác nhận production smoke.; không retry nghiệp vụ không idempotent.
- Acceptance item 178: Khi user mở nhiều tab phải xác nhận rollback rehearsal.; ghi metric không chứa PII.
- Acceptance item 179: Khi migration dữ liệu cũ phải xác nhận credential redaction.; giữ correlation ID riêng.
- Acceptance item 180: Khi user bấm Thêm account phải xác nhận documentation review.; chạy lại contract test sau thay đổi.
## 104. Production handoff

- Owner đã lưu client ID.
- Owner đã lưu API key trong secret manager.
- Integration đã đăng ký callback exact.
- Integration đã triển khai state validation.
- Integration đã triển khai access_denied handling.
- Integration đã triển khai token exchange backend.
- Integration đã triển khai user session.
- Integration đã redact credential log.
- Integration đã chạy contract test.
- Integration đã chạy stress test.
- Integration đã kiểm tra custom domain.
- Integration đã có rollback.
- Operator đã cấu hình health monitor.
- Operator đã cấu hình retry alert.
- Operator đã cấu hình CAS conflict alert.
- Operator đã cấu hình invalid_client alert.
- Operator đã cấu hình invalid_grant alert.
- Operator đã kiểm tra privacy.
- Operator đã kiểm tra CSP.
- Operator đã ghi deployment version.
## 105. Kết luận

Luồng tích hợp chuẩn là: tạo state, redirect tới Account Chooser, kiểm tra callback state, đổi one-time code bằng client ID và API key ở backend, nhận profile APIUYTIN, sau đó tạo session nội bộ.
Không có bước nào yêu cầu đưa API key vào browser.
Không có bước nào trả Google access token hoặc Google subject cho web tích hợp.
Khi thay đổi code, luôn chạy lại contract test, race test và production smoke.
Tài liệu này dùng placeholder; không thay thế secret manager hoặc policy bảo mật của ứng dụng.
## 106. Phụ lục phương thức tích hợp cho bên thứ ba

Phần này mô tả các phương thức mà một bên thứ ba nên triển khai trong adapter APIUYTIN của họ.
Tên hàm chỉ là gợi ý; bên tích hợp có thể dùng framework hoặc ngôn ngữ khác.
Mọi phương thức đổi code, đọc userinfo hoặc gọi project API phải chạy ở backend.
Mọi ví dụ dùng placeholder và không chứa credential thật.

- Tách lớp `ApiuytinConfig` khỏi lớp HTTP client.
- Tách lớp OAuth state khỏi lớp token exchange.
- Tách profile mapper khỏi user repository.
- Tách error mapper khỏi UI message.
- Tách secret manager khỏi request handler.
- Tách audit logger khỏi logger request thông thường.
- Tách retry policy query khỏi mutation policy.
- Tách dashboard owner methods khỏi end-user methods.
- Tách integration session khỏi dashboard session APIUYTIN.
- Tách test fixture khỏi credential production.
### 107. Phương thức `buildLoginUrl`

Mục đích: Tạo URL bắt đầu Account Chooser.

```js
async function buildLoginUrl(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- local, buildLoginUrl: Sinh state random; kiểm tra cấu hình trước network.
- staging, buildLoginUrl: Lưu state vào server session; dùng timeout hữu hạn.
- production, buildLoginUrl: Dùng client_id public; redact log.
- CI, buildLoginUrl: Dùng redirect_uri cố định; không retry mutation mù.
- server route, buildLoginUrl: Không gắn api_key; test invariant sau request.
- background worker, buildLoginUrl: Encode bằng URLSearchParams; kiểm tra cấu hình trước network.
- multi-tab browser, buildLoginUrl: Sinh state random; dùng timeout hữu hạn.
- mobile browser, buildLoginUrl: Lưu state vào server session; redact log.
- edge runtime, buildLoginUrl: Dùng client_id public; không retry mutation mù.
- container runtime, buildLoginUrl: Dùng redirect_uri cố định; test invariant sau request.
- high latency network, buildLoginUrl: Không gắn api_key; kiểm tra cấu hình trước network.
- provider 429, buildLoginUrl: Encode bằng URLSearchParams; dùng timeout hữu hạn.
- provider 5xx, buildLoginUrl: Sinh state random; redact log.
- secret rotation, buildLoginUrl: Lưu state vào server session; không retry mutation mù.
- project revoke, buildLoginUrl: Dùng client_id public; test invariant sau request.
- device expiry, buildLoginUrl: Dùng redirect_uri cố định; kiểm tra cấu hình trước network.
- profile update, buildLoginUrl: Không gắn api_key; dùng timeout hữu hạn.
- support diagnosis, buildLoginUrl: Encode bằng URLSearchParams; redact log.
- security review, buildLoginUrl: Sinh state random; không retry mutation mù.
- privacy review, buildLoginUrl: Lưu state vào server session; test invariant sau request.
- local, buildLoginUrl: Dùng client_id public; kiểm tra cấu hình trước network.
- staging, buildLoginUrl: Dùng redirect_uri cố định; dùng timeout hữu hạn.
- production, buildLoginUrl: Không gắn api_key; redact log.
- CI, buildLoginUrl: Encode bằng URLSearchParams; không retry mutation mù.
- server route, buildLoginUrl: Sinh state random; test invariant sau request.
- background worker, buildLoginUrl: Lưu state vào server session; kiểm tra cấu hình trước network.
- multi-tab browser, buildLoginUrl: Dùng client_id public; dùng timeout hữu hạn.
- mobile browser, buildLoginUrl: Dùng redirect_uri cố định; redact log.
- edge runtime, buildLoginUrl: Không gắn api_key; không retry mutation mù.
- container runtime, buildLoginUrl: Encode bằng URLSearchParams; test invariant sau request.
- high latency network, buildLoginUrl: Sinh state random; kiểm tra cấu hình trước network.
- provider 429, buildLoginUrl: Lưu state vào server session; dùng timeout hữu hạn.
- provider 5xx, buildLoginUrl: Dùng client_id public; redact log.
- secret rotation, buildLoginUrl: Dùng redirect_uri cố định; không retry mutation mù.
- project revoke, buildLoginUrl: Không gắn api_key; test invariant sau request.
### 108. Phương thức `saveOAuthState`

Mục đích: Lưu correlation state.

```js
async function saveOAuthState(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- CI, saveOAuthState: Gắn session hiện tại; giữ credential ở server-side.
- server route, saveOAuthState: Không lưu plaintext secret; kiểm tra status trước parse JSON.
- background worker, saveOAuthState: Không ghi query callback; giữ correlation ID.
- multi-tab browser, saveOAuthState: Consume sau callback; không gửi secret sang browser.
- mobile browser, saveOAuthState: Hỗ trợ nhiều tab; xóa dữ liệu tạm sau xử lý.
- edge runtime, saveOAuthState: Có TTL; giữ credential ở server-side.
- container runtime, saveOAuthState: Gắn session hiện tại; kiểm tra status trước parse JSON.
- high latency network, saveOAuthState: Không lưu plaintext secret; giữ correlation ID.
- provider 429, saveOAuthState: Không ghi query callback; không gửi secret sang browser.
- provider 5xx, saveOAuthState: Consume sau callback; xóa dữ liệu tạm sau xử lý.
- secret rotation, saveOAuthState: Hỗ trợ nhiều tab; giữ credential ở server-side.
- project revoke, saveOAuthState: Có TTL; kiểm tra status trước parse JSON.
- device expiry, saveOAuthState: Gắn session hiện tại; giữ correlation ID.
- profile update, saveOAuthState: Không lưu plaintext secret; không gửi secret sang browser.
- support diagnosis, saveOAuthState: Không ghi query callback; xóa dữ liệu tạm sau xử lý.
- security review, saveOAuthState: Consume sau callback; giữ credential ở server-side.
- privacy review, saveOAuthState: Hỗ trợ nhiều tab; kiểm tra status trước parse JSON.
- local, saveOAuthState: Có TTL; giữ correlation ID.
- staging, saveOAuthState: Gắn session hiện tại; không gửi secret sang browser.
- production, saveOAuthState: Không lưu plaintext secret; xóa dữ liệu tạm sau xử lý.
- CI, saveOAuthState: Không ghi query callback; giữ credential ở server-side.
- server route, saveOAuthState: Consume sau callback; kiểm tra status trước parse JSON.
- background worker, saveOAuthState: Hỗ trợ nhiều tab; giữ correlation ID.
- multi-tab browser, saveOAuthState: Có TTL; không gửi secret sang browser.
- mobile browser, saveOAuthState: Gắn session hiện tại; xóa dữ liệu tạm sau xử lý.
- edge runtime, saveOAuthState: Không lưu plaintext secret; giữ credential ở server-side.
- container runtime, saveOAuthState: Không ghi query callback; kiểm tra status trước parse JSON.
- high latency network, saveOAuthState: Consume sau callback; giữ correlation ID.
- provider 429, saveOAuthState: Hỗ trợ nhiều tab; không gửi secret sang browser.
- provider 5xx, saveOAuthState: Có TTL; xóa dữ liệu tạm sau xử lý.
- secret rotation, saveOAuthState: Gắn session hiện tại; giữ credential ở server-side.
- project revoke, saveOAuthState: Không lưu plaintext secret; kiểm tra status trước parse JSON.
- device expiry, saveOAuthState: Không ghi query callback; giữ correlation ID.
- profile update, saveOAuthState: Consume sau callback; không gửi secret sang browser.
- support diagnosis, saveOAuthState: Hỗ trợ nhiều tab; xóa dữ liệu tạm sau xử lý.
### 109. Phương thức `handleOAuthStart`

Mục đích: Endpoint local redirect người dùng.

```js
async function handleOAuthStart(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- multi-tab browser, handleOAuthStart: Trả 302; dùng timeout hữu hạn.
- mobile browser, handleOAuthStart: Không gọi token; redact log.
- edge runtime, handleOAuthStart: Không log state; không retry mutation mù.
- container runtime, handleOAuthStart: Có fallback lỗi; test invariant sau request.
- high latency network, handleOAuthStart: Kiểm tra cấu hình; kiểm tra cấu hình trước network.
- provider 429, handleOAuthStart: Tạo URL APIUYTIN; dùng timeout hữu hạn.
- provider 5xx, handleOAuthStart: Trả 302; redact log.
- secret rotation, handleOAuthStart: Không gọi token; không retry mutation mù.
- project revoke, handleOAuthStart: Không log state; test invariant sau request.
- device expiry, handleOAuthStart: Có fallback lỗi; kiểm tra cấu hình trước network.
- profile update, handleOAuthStart: Kiểm tra cấu hình; dùng timeout hữu hạn.
- support diagnosis, handleOAuthStart: Tạo URL APIUYTIN; redact log.
- security review, handleOAuthStart: Trả 302; không retry mutation mù.
- privacy review, handleOAuthStart: Không gọi token; test invariant sau request.
- local, handleOAuthStart: Không log state; kiểm tra cấu hình trước network.
- staging, handleOAuthStart: Có fallback lỗi; dùng timeout hữu hạn.
- production, handleOAuthStart: Kiểm tra cấu hình; redact log.
- CI, handleOAuthStart: Tạo URL APIUYTIN; không retry mutation mù.
- server route, handleOAuthStart: Trả 302; test invariant sau request.
- background worker, handleOAuthStart: Không gọi token; kiểm tra cấu hình trước network.
- multi-tab browser, handleOAuthStart: Không log state; dùng timeout hữu hạn.
- mobile browser, handleOAuthStart: Có fallback lỗi; redact log.
- edge runtime, handleOAuthStart: Kiểm tra cấu hình; không retry mutation mù.
- container runtime, handleOAuthStart: Tạo URL APIUYTIN; test invariant sau request.
- high latency network, handleOAuthStart: Trả 302; kiểm tra cấu hình trước network.
- provider 429, handleOAuthStart: Không gọi token; dùng timeout hữu hạn.
- provider 5xx, handleOAuthStart: Không log state; redact log.
- secret rotation, handleOAuthStart: Có fallback lỗi; không retry mutation mù.
- project revoke, handleOAuthStart: Kiểm tra cấu hình; test invariant sau request.
- device expiry, handleOAuthStart: Tạo URL APIUYTIN; kiểm tra cấu hình trước network.
- profile update, handleOAuthStart: Trả 302; dùng timeout hữu hạn.
- support diagnosis, handleOAuthStart: Không gọi token; redact log.
- security review, handleOAuthStart: Không log state; không retry mutation mù.
- privacy review, handleOAuthStart: Có fallback lỗi; test invariant sau request.
- local, handleOAuthStart: Kiểm tra cấu hình; kiểm tra cấu hình trước network.
### 110. Phương thức `handleCallbackError`

Mục đích: Xử lý callback có error.

```js
async function handleCallbackError(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- container runtime, handleCallbackError: Xóa state cũ; kiểm tra status trước parse JSON.
- high latency network, handleCallbackError: Hiển thị message an toàn; giữ correlation ID.
- provider 429, handleCallbackError: Cho phép login lại; không gửi secret sang browser.
- provider 5xx, handleCallbackError: Đọc access_denied; xóa dữ liệu tạm sau xử lý.
- secret rotation, handleCallbackError: Giữ correlation ID; giữ credential ở server-side.
- project revoke, handleCallbackError: Không gọi token khi thiếu code; kiểm tra status trước parse JSON.
- device expiry, handleCallbackError: Xóa state cũ; giữ correlation ID.
- profile update, handleCallbackError: Hiển thị message an toàn; không gửi secret sang browser.
- support diagnosis, handleCallbackError: Cho phép login lại; xóa dữ liệu tạm sau xử lý.
- security review, handleCallbackError: Đọc access_denied; giữ credential ở server-side.
- privacy review, handleCallbackError: Giữ correlation ID; kiểm tra status trước parse JSON.
- local, handleCallbackError: Không gọi token khi thiếu code; giữ correlation ID.
- staging, handleCallbackError: Xóa state cũ; không gửi secret sang browser.
- production, handleCallbackError: Hiển thị message an toàn; xóa dữ liệu tạm sau xử lý.
- CI, handleCallbackError: Cho phép login lại; giữ credential ở server-side.
- server route, handleCallbackError: Đọc access_denied; kiểm tra status trước parse JSON.
- background worker, handleCallbackError: Giữ correlation ID; giữ correlation ID.
- multi-tab browser, handleCallbackError: Không gọi token khi thiếu code; không gửi secret sang browser.
- mobile browser, handleCallbackError: Xóa state cũ; xóa dữ liệu tạm sau xử lý.
- edge runtime, handleCallbackError: Hiển thị message an toàn; giữ credential ở server-side.
- container runtime, handleCallbackError: Cho phép login lại; kiểm tra status trước parse JSON.
- high latency network, handleCallbackError: Đọc access_denied; giữ correlation ID.
- provider 429, handleCallbackError: Giữ correlation ID; không gửi secret sang browser.
- provider 5xx, handleCallbackError: Không gọi token khi thiếu code; xóa dữ liệu tạm sau xử lý.
- secret rotation, handleCallbackError: Xóa state cũ; giữ credential ở server-side.
- project revoke, handleCallbackError: Hiển thị message an toàn; kiểm tra status trước parse JSON.
- device expiry, handleCallbackError: Cho phép login lại; giữ correlation ID.
- profile update, handleCallbackError: Đọc access_denied; không gửi secret sang browser.
- support diagnosis, handleCallbackError: Giữ correlation ID; xóa dữ liệu tạm sau xử lý.
- security review, handleCallbackError: Không gọi token khi thiếu code; giữ credential ở server-side.
- privacy review, handleCallbackError: Xóa state cũ; kiểm tra status trước parse JSON.
- local, handleCallbackError: Hiển thị message an toàn; giữ correlation ID.
- staging, handleCallbackError: Cho phép login lại; không gửi secret sang browser.
- production, handleCallbackError: Đọc access_denied; xóa dữ liệu tạm sau xử lý.
- CI, handleCallbackError: Giữ correlation ID; giữ credential ở server-side.
### 111. Phương thức `validateCallbackState`

Mục đích: Kiểm tra CSRF state.

```js
async function validateCallbackState(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- provider 5xx, validateCallbackState: Không bypass theo môi trường; redact log.
- secret rotation, validateCallbackState: Audit kết quả; không retry mutation mù.
- project revoke, validateCallbackState: Exact comparison; test invariant sau request.
- device expiry, validateCallbackState: Reject missing state; kiểm tra cấu hình trước network.
- profile update, validateCallbackState: Reject expired state; dùng timeout hữu hạn.
- support diagnosis, validateCallbackState: Reject replay; redact log.
- security review, validateCallbackState: Không bypass theo môi trường; không retry mutation mù.
- privacy review, validateCallbackState: Audit kết quả; test invariant sau request.
- local, validateCallbackState: Exact comparison; kiểm tra cấu hình trước network.
- staging, validateCallbackState: Reject missing state; dùng timeout hữu hạn.
- production, validateCallbackState: Reject expired state; redact log.
- CI, validateCallbackState: Reject replay; không retry mutation mù.
- server route, validateCallbackState: Không bypass theo môi trường; test invariant sau request.
- background worker, validateCallbackState: Audit kết quả; kiểm tra cấu hình trước network.
- multi-tab browser, validateCallbackState: Exact comparison; dùng timeout hữu hạn.
- mobile browser, validateCallbackState: Reject missing state; redact log.
- edge runtime, validateCallbackState: Reject expired state; không retry mutation mù.
- container runtime, validateCallbackState: Reject replay; test invariant sau request.
- high latency network, validateCallbackState: Không bypass theo môi trường; kiểm tra cấu hình trước network.
- provider 429, validateCallbackState: Audit kết quả; dùng timeout hữu hạn.
- provider 5xx, validateCallbackState: Exact comparison; redact log.
- secret rotation, validateCallbackState: Reject missing state; không retry mutation mù.
- project revoke, validateCallbackState: Reject expired state; test invariant sau request.
- device expiry, validateCallbackState: Reject replay; kiểm tra cấu hình trước network.
- profile update, validateCallbackState: Không bypass theo môi trường; dùng timeout hữu hạn.
- support diagnosis, validateCallbackState: Audit kết quả; redact log.
- security review, validateCallbackState: Exact comparison; không retry mutation mù.
- privacy review, validateCallbackState: Reject missing state; test invariant sau request.
- local, validateCallbackState: Reject expired state; kiểm tra cấu hình trước network.
- staging, validateCallbackState: Reject replay; dùng timeout hữu hạn.
- production, validateCallbackState: Không bypass theo môi trường; redact log.
- CI, validateCallbackState: Audit kết quả; không retry mutation mù.
- server route, validateCallbackState: Exact comparison; test invariant sau request.
- background worker, validateCallbackState: Reject missing state; kiểm tra cấu hình trước network.
- multi-tab browser, validateCallbackState: Reject expired state; dùng timeout hữu hạn.
### 112. Phương thức `readCallbackCode`

Mục đích: Đọc one-time code.

```js
async function readCallbackCode(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- device expiry, readCallbackCode: Chuyển thẳng token exchange; giữ correlation ID.
- profile update, readCallbackCode: Đọc query server-side; không gửi secret sang browser.
- support diagnosis, readCallbackCode: Không lưu lâu; xóa dữ liệu tạm sau xử lý.
- security review, readCallbackCode: Không log; giữ credential ở server-side.
- privacy review, readCallbackCode: Không đưa vào template; kiểm tra status trước parse JSON.
- local, readCallbackCode: Reject empty value; giữ correlation ID.
- staging, readCallbackCode: Chuyển thẳng token exchange; không gửi secret sang browser.
- production, readCallbackCode: Đọc query server-side; xóa dữ liệu tạm sau xử lý.
- CI, readCallbackCode: Không lưu lâu; giữ credential ở server-side.
- server route, readCallbackCode: Không log; kiểm tra status trước parse JSON.
- background worker, readCallbackCode: Không đưa vào template; giữ correlation ID.
- multi-tab browser, readCallbackCode: Reject empty value; không gửi secret sang browser.
- mobile browser, readCallbackCode: Chuyển thẳng token exchange; xóa dữ liệu tạm sau xử lý.
- edge runtime, readCallbackCode: Đọc query server-side; giữ credential ở server-side.
- container runtime, readCallbackCode: Không lưu lâu; kiểm tra status trước parse JSON.
- high latency network, readCallbackCode: Không log; giữ correlation ID.
- provider 429, readCallbackCode: Không đưa vào template; không gửi secret sang browser.
- provider 5xx, readCallbackCode: Reject empty value; xóa dữ liệu tạm sau xử lý.
- secret rotation, readCallbackCode: Chuyển thẳng token exchange; giữ credential ở server-side.
- project revoke, readCallbackCode: Đọc query server-side; kiểm tra status trước parse JSON.
- device expiry, readCallbackCode: Không lưu lâu; giữ correlation ID.
- profile update, readCallbackCode: Không log; không gửi secret sang browser.
- support diagnosis, readCallbackCode: Không đưa vào template; xóa dữ liệu tạm sau xử lý.
- security review, readCallbackCode: Reject empty value; giữ credential ở server-side.
- privacy review, readCallbackCode: Chuyển thẳng token exchange; kiểm tra status trước parse JSON.
- local, readCallbackCode: Đọc query server-side; giữ correlation ID.
- staging, readCallbackCode: Không lưu lâu; không gửi secret sang browser.
- production, readCallbackCode: Không log; xóa dữ liệu tạm sau xử lý.
- CI, readCallbackCode: Không đưa vào template; giữ credential ở server-side.
- server route, readCallbackCode: Reject empty value; kiểm tra status trước parse JSON.
- background worker, readCallbackCode: Chuyển thẳng token exchange; giữ correlation ID.
- multi-tab browser, readCallbackCode: Đọc query server-side; không gửi secret sang browser.
- mobile browser, readCallbackCode: Không lưu lâu; xóa dữ liệu tạm sau xử lý.
- edge runtime, readCallbackCode: Không log; giữ credential ở server-side.
- container runtime, readCallbackCode: Không đưa vào template; kiểm tra status trước parse JSON.
### 113. Phương thức `exchangeAuthorizationCode`

Mục đích: Đổi code lấy token.

```js
async function exchangeAuthorizationCode(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- security review, exchangeAuthorizationCode: POST JSON; không retry mutation mù.
- privacy review, exchangeAuthorizationCode: Dùng client_id; test invariant sau request.
- local, exchangeAuthorizationCode: Dùng api_key server-side; kiểm tra cấu hình trước network.
- staging, exchangeAuthorizationCode: Dùng redirect_uri canonical; dùng timeout hữu hạn.
- production, exchangeAuthorizationCode: Timeout; redact log.
- CI, exchangeAuthorizationCode: Parse status; không retry mutation mù.
- server route, exchangeAuthorizationCode: POST JSON; test invariant sau request.
- background worker, exchangeAuthorizationCode: Dùng client_id; kiểm tra cấu hình trước network.
- multi-tab browser, exchangeAuthorizationCode: Dùng api_key server-side; dùng timeout hữu hạn.
- mobile browser, exchangeAuthorizationCode: Dùng redirect_uri canonical; redact log.
- edge runtime, exchangeAuthorizationCode: Timeout; không retry mutation mù.
- container runtime, exchangeAuthorizationCode: Parse status; test invariant sau request.
- high latency network, exchangeAuthorizationCode: POST JSON; kiểm tra cấu hình trước network.
- provider 429, exchangeAuthorizationCode: Dùng client_id; dùng timeout hữu hạn.
- provider 5xx, exchangeAuthorizationCode: Dùng api_key server-side; redact log.
- secret rotation, exchangeAuthorizationCode: Dùng redirect_uri canonical; không retry mutation mù.
- project revoke, exchangeAuthorizationCode: Timeout; test invariant sau request.
- device expiry, exchangeAuthorizationCode: Parse status; kiểm tra cấu hình trước network.
- profile update, exchangeAuthorizationCode: POST JSON; dùng timeout hữu hạn.
- support diagnosis, exchangeAuthorizationCode: Dùng client_id; redact log.
- security review, exchangeAuthorizationCode: Dùng api_key server-side; không retry mutation mù.
- privacy review, exchangeAuthorizationCode: Dùng redirect_uri canonical; test invariant sau request.
- local, exchangeAuthorizationCode: Timeout; kiểm tra cấu hình trước network.
- staging, exchangeAuthorizationCode: Parse status; dùng timeout hữu hạn.
- production, exchangeAuthorizationCode: POST JSON; redact log.
- CI, exchangeAuthorizationCode: Dùng client_id; không retry mutation mù.
- server route, exchangeAuthorizationCode: Dùng api_key server-side; test invariant sau request.
- background worker, exchangeAuthorizationCode: Dùng redirect_uri canonical; kiểm tra cấu hình trước network.
- multi-tab browser, exchangeAuthorizationCode: Timeout; dùng timeout hữu hạn.
- mobile browser, exchangeAuthorizationCode: Parse status; redact log.
- edge runtime, exchangeAuthorizationCode: POST JSON; không retry mutation mù.
- container runtime, exchangeAuthorizationCode: Dùng client_id; test invariant sau request.
- high latency network, exchangeAuthorizationCode: Dùng api_key server-side; kiểm tra cấu hình trước network.
- provider 429, exchangeAuthorizationCode: Dùng redirect_uri canonical; dùng timeout hữu hạn.
- provider 5xx, exchangeAuthorizationCode: Timeout; redact log.
### 114. Phương thức `validateTokenResponse`

Mục đích: Kiểm tra token response.

```js
async function validateTokenResponse(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- staging, validateTokenResponse: Kiểm tra token_type; không gửi secret sang browser.
- production, validateTokenResponse: Kiểm tra expires_in; xóa dữ liệu tạm sau xử lý.
- CI, validateTokenResponse: Kiểm tra user.id; giữ credential ở server-side.
- server route, validateTokenResponse: Kiểm tra user.sub; kiểm tra status trước parse JSON.
- background worker, validateTokenResponse: Không nhận Google token; giữ correlation ID.
- multi-tab browser, validateTokenResponse: Kiểm tra access_token; không gửi secret sang browser.
- mobile browser, validateTokenResponse: Kiểm tra token_type; xóa dữ liệu tạm sau xử lý.
- edge runtime, validateTokenResponse: Kiểm tra expires_in; giữ credential ở server-side.
- container runtime, validateTokenResponse: Kiểm tra user.id; kiểm tra status trước parse JSON.
- high latency network, validateTokenResponse: Kiểm tra user.sub; giữ correlation ID.
- provider 429, validateTokenResponse: Không nhận Google token; không gửi secret sang browser.
- provider 5xx, validateTokenResponse: Kiểm tra access_token; xóa dữ liệu tạm sau xử lý.
- secret rotation, validateTokenResponse: Kiểm tra token_type; giữ credential ở server-side.
- project revoke, validateTokenResponse: Kiểm tra expires_in; kiểm tra status trước parse JSON.
- device expiry, validateTokenResponse: Kiểm tra user.id; giữ correlation ID.
- profile update, validateTokenResponse: Kiểm tra user.sub; không gửi secret sang browser.
- support diagnosis, validateTokenResponse: Không nhận Google token; xóa dữ liệu tạm sau xử lý.
- security review, validateTokenResponse: Kiểm tra access_token; giữ credential ở server-side.
- privacy review, validateTokenResponse: Kiểm tra token_type; kiểm tra status trước parse JSON.
- local, validateTokenResponse: Kiểm tra expires_in; giữ correlation ID.
- staging, validateTokenResponse: Kiểm tra user.id; không gửi secret sang browser.
- production, validateTokenResponse: Kiểm tra user.sub; xóa dữ liệu tạm sau xử lý.
- CI, validateTokenResponse: Không nhận Google token; giữ credential ở server-side.
- server route, validateTokenResponse: Kiểm tra access_token; kiểm tra status trước parse JSON.
- background worker, validateTokenResponse: Kiểm tra token_type; giữ correlation ID.
- multi-tab browser, validateTokenResponse: Kiểm tra expires_in; không gửi secret sang browser.
- mobile browser, validateTokenResponse: Kiểm tra user.id; xóa dữ liệu tạm sau xử lý.
- edge runtime, validateTokenResponse: Kiểm tra user.sub; giữ credential ở server-side.
- container runtime, validateTokenResponse: Không nhận Google token; kiểm tra status trước parse JSON.
- high latency network, validateTokenResponse: Kiểm tra access_token; giữ correlation ID.
- provider 429, validateTokenResponse: Kiểm tra token_type; không gửi secret sang browser.
- provider 5xx, validateTokenResponse: Kiểm tra expires_in; xóa dữ liệu tạm sau xử lý.
- secret rotation, validateTokenResponse: Kiểm tra user.id; giữ credential ở server-side.
- project revoke, validateTokenResponse: Kiểm tra user.sub; kiểm tra status trước parse JSON.
- device expiry, validateTokenResponse: Không nhận Google token; giữ correlation ID.
### 115. Phương thức `createLocalSession`

Mục đích: Tạo session cho user app.

```js
async function createLocalSession(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- server route, createLocalSession: Cookie Secure; test invariant sau request.
- background worker, createLocalSession: Session expiry; kiểm tra cấu hình trước network.
- multi-tab browser, createLocalSession: Không nhét API key; dùng timeout hữu hạn.
- mobile browser, createLocalSession: Regenerate session ID; redact log.
- edge runtime, createLocalSession: Dùng APIUYTIN user ID; không retry mutation mù.
- container runtime, createLocalSession: Cookie HttpOnly; test invariant sau request.
- high latency network, createLocalSession: Cookie Secure; kiểm tra cấu hình trước network.
- provider 429, createLocalSession: Session expiry; dùng timeout hữu hạn.
- provider 5xx, createLocalSession: Không nhét API key; redact log.
- secret rotation, createLocalSession: Regenerate session ID; không retry mutation mù.
- project revoke, createLocalSession: Dùng APIUYTIN user ID; test invariant sau request.
- device expiry, createLocalSession: Cookie HttpOnly; kiểm tra cấu hình trước network.
- profile update, createLocalSession: Cookie Secure; dùng timeout hữu hạn.
- support diagnosis, createLocalSession: Session expiry; redact log.
- security review, createLocalSession: Không nhét API key; không retry mutation mù.
- privacy review, createLocalSession: Regenerate session ID; test invariant sau request.
- local, createLocalSession: Dùng APIUYTIN user ID; kiểm tra cấu hình trước network.
- staging, createLocalSession: Cookie HttpOnly; dùng timeout hữu hạn.
- production, createLocalSession: Cookie Secure; redact log.
- CI, createLocalSession: Session expiry; không retry mutation mù.
- server route, createLocalSession: Không nhét API key; test invariant sau request.
- background worker, createLocalSession: Regenerate session ID; kiểm tra cấu hình trước network.
- multi-tab browser, createLocalSession: Dùng APIUYTIN user ID; dùng timeout hữu hạn.
- mobile browser, createLocalSession: Cookie HttpOnly; redact log.
- edge runtime, createLocalSession: Cookie Secure; không retry mutation mù.
- container runtime, createLocalSession: Session expiry; test invariant sau request.
- high latency network, createLocalSession: Không nhét API key; kiểm tra cấu hình trước network.
- provider 429, createLocalSession: Regenerate session ID; dùng timeout hữu hạn.
- provider 5xx, createLocalSession: Dùng APIUYTIN user ID; redact log.
- secret rotation, createLocalSession: Cookie HttpOnly; không retry mutation mù.
- project revoke, createLocalSession: Cookie Secure; test invariant sau request.
- device expiry, createLocalSession: Session expiry; kiểm tra cấu hình trước network.
- profile update, createLocalSession: Không nhét API key; dùng timeout hữu hạn.
- support diagnosis, createLocalSession: Regenerate session ID; redact log.
- security review, createLocalSession: Dùng APIUYTIN user ID; không retry mutation mù.
### 116. Phương thức `getApiUserinfo`

Mục đích: Gọi userinfo bằng access token.

```js
async function getApiUserinfo(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- mobile browser, getApiUserinfo: No-store; xóa dữ liệu tạm sau xử lý.
- edge runtime, getApiUserinfo: Handle 401; giữ credential ở server-side.
- container runtime, getApiUserinfo: Map profile; kiểm tra status trước parse JSON.
- high latency network, getApiUserinfo: Bearer header; giữ correlation ID.
- provider 429, getApiUserinfo: No query token; không gửi secret sang browser.
- provider 5xx, getApiUserinfo: Timeout; xóa dữ liệu tạm sau xử lý.
- secret rotation, getApiUserinfo: No-store; giữ credential ở server-side.
- project revoke, getApiUserinfo: Handle 401; kiểm tra status trước parse JSON.
- device expiry, getApiUserinfo: Map profile; giữ correlation ID.
- profile update, getApiUserinfo: Bearer header; không gửi secret sang browser.
- support diagnosis, getApiUserinfo: No query token; xóa dữ liệu tạm sau xử lý.
- security review, getApiUserinfo: Timeout; giữ credential ở server-side.
- privacy review, getApiUserinfo: No-store; kiểm tra status trước parse JSON.
- local, getApiUserinfo: Handle 401; giữ correlation ID.
- staging, getApiUserinfo: Map profile; không gửi secret sang browser.
- production, getApiUserinfo: Bearer header; xóa dữ liệu tạm sau xử lý.
- CI, getApiUserinfo: No query token; giữ credential ở server-side.
- server route, getApiUserinfo: Timeout; kiểm tra status trước parse JSON.
- background worker, getApiUserinfo: No-store; giữ correlation ID.
- multi-tab browser, getApiUserinfo: Handle 401; không gửi secret sang browser.
- mobile browser, getApiUserinfo: Map profile; xóa dữ liệu tạm sau xử lý.
- edge runtime, getApiUserinfo: Bearer header; giữ credential ở server-side.
- container runtime, getApiUserinfo: No query token; kiểm tra status trước parse JSON.
- high latency network, getApiUserinfo: Timeout; giữ correlation ID.
- provider 429, getApiUserinfo: No-store; không gửi secret sang browser.
- provider 5xx, getApiUserinfo: Handle 401; xóa dữ liệu tạm sau xử lý.
- secret rotation, getApiUserinfo: Map profile; giữ credential ở server-side.
- project revoke, getApiUserinfo: Bearer header; kiểm tra status trước parse JSON.
- device expiry, getApiUserinfo: No query token; giữ correlation ID.
- profile update, getApiUserinfo: Timeout; không gửi secret sang browser.
- support diagnosis, getApiUserinfo: No-store; xóa dữ liệu tạm sau xử lý.
- security review, getApiUserinfo: Handle 401; giữ credential ở server-side.
- privacy review, getApiUserinfo: Map profile; kiểm tra status trước parse JSON.
- local, getApiUserinfo: Bearer header; giữ correlation ID.
- staging, getApiUserinfo: No query token; không gửi secret sang browser.
### 117. Phương thức `getProjectInfo`

Mục đích: Đọc metadata project bằng API key.

```js
async function getProjectInfo(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- high latency network, getProjectInfo: Cache ngắn nếu cần; kiểm tra cấu hình trước network.
- provider 429, getProjectInfo: Audit caller; dùng timeout hữu hạn.
- provider 5xx, getProjectInfo: Bearer api_key; redact log.
- secret rotation, getProjectInfo: Server-only; không retry mutation mù.
- project revoke, getProjectInfo: Không trả key ra client; test invariant sau request.
- device expiry, getProjectInfo: Handle invalid_api_key; kiểm tra cấu hình trước network.
- profile update, getProjectInfo: Cache ngắn nếu cần; dùng timeout hữu hạn.
- support diagnosis, getProjectInfo: Audit caller; redact log.
- security review, getProjectInfo: Bearer api_key; không retry mutation mù.
- privacy review, getProjectInfo: Server-only; test invariant sau request.
- local, getProjectInfo: Không trả key ra client; kiểm tra cấu hình trước network.
- staging, getProjectInfo: Handle invalid_api_key; dùng timeout hữu hạn.
- production, getProjectInfo: Cache ngắn nếu cần; redact log.
- CI, getProjectInfo: Audit caller; không retry mutation mù.
- server route, getProjectInfo: Bearer api_key; test invariant sau request.
- background worker, getProjectInfo: Server-only; kiểm tra cấu hình trước network.
- multi-tab browser, getProjectInfo: Không trả key ra client; dùng timeout hữu hạn.
- mobile browser, getProjectInfo: Handle invalid_api_key; redact log.
- edge runtime, getProjectInfo: Cache ngắn nếu cần; không retry mutation mù.
- container runtime, getProjectInfo: Audit caller; test invariant sau request.
- high latency network, getProjectInfo: Bearer api_key; kiểm tra cấu hình trước network.
- provider 429, getProjectInfo: Server-only; dùng timeout hữu hạn.
- provider 5xx, getProjectInfo: Không trả key ra client; redact log.
- secret rotation, getProjectInfo: Handle invalid_api_key; không retry mutation mù.
- project revoke, getProjectInfo: Cache ngắn nếu cần; test invariant sau request.
- device expiry, getProjectInfo: Audit caller; kiểm tra cấu hình trước network.
- profile update, getProjectInfo: Bearer api_key; dùng timeout hữu hạn.
- support diagnosis, getProjectInfo: Server-only; redact log.
- security review, getProjectInfo: Không trả key ra client; không retry mutation mù.
- privacy review, getProjectInfo: Handle invalid_api_key; test invariant sau request.
- local, getProjectInfo: Cache ngắn nếu cần; kiểm tra cấu hình trước network.
- staging, getProjectInfo: Audit caller; dùng timeout hữu hạn.
- production, getProjectInfo: Bearer api_key; redact log.
- CI, getProjectInfo: Server-only; không retry mutation mù.
- server route, getProjectInfo: Không trả key ra client; test invariant sau request.
### 118. Phương thức `getAllUsers`

Mục đích: Đọc danh sách user project.

```js
async function getAllUsers(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- secret rotation, getAllUsers: Avoid excessive polling; giữ credential ở server-side.
- project revoke, getAllUsers: Bearer api_key; kiểm tra status trước parse JSON.
- device expiry, getAllUsers: Admin-only route; giữ correlation ID.
- profile update, getAllUsers: Protect PII; không gửi secret sang browser.
- support diagnosis, getAllUsers: No browser call; xóa dữ liệu tạm sau xử lý.
- security review, getAllUsers: Handle empty list; giữ credential ở server-side.
- privacy review, getAllUsers: Avoid excessive polling; kiểm tra status trước parse JSON.
- local, getAllUsers: Bearer api_key; giữ correlation ID.
- staging, getAllUsers: Admin-only route; không gửi secret sang browser.
- production, getAllUsers: Protect PII; xóa dữ liệu tạm sau xử lý.
- CI, getAllUsers: No browser call; giữ credential ở server-side.
- server route, getAllUsers: Handle empty list; kiểm tra status trước parse JSON.
- background worker, getAllUsers: Avoid excessive polling; giữ correlation ID.
- multi-tab browser, getAllUsers: Bearer api_key; không gửi secret sang browser.
- mobile browser, getAllUsers: Admin-only route; xóa dữ liệu tạm sau xử lý.
- edge runtime, getAllUsers: Protect PII; giữ credential ở server-side.
- container runtime, getAllUsers: No browser call; kiểm tra status trước parse JSON.
- high latency network, getAllUsers: Handle empty list; giữ correlation ID.
- provider 429, getAllUsers: Avoid excessive polling; không gửi secret sang browser.
- provider 5xx, getAllUsers: Bearer api_key; xóa dữ liệu tạm sau xử lý.
- secret rotation, getAllUsers: Admin-only route; giữ credential ở server-side.
- project revoke, getAllUsers: Protect PII; kiểm tra status trước parse JSON.
- device expiry, getAllUsers: No browser call; giữ correlation ID.
- profile update, getAllUsers: Handle empty list; không gửi secret sang browser.
- support diagnosis, getAllUsers: Avoid excessive polling; xóa dữ liệu tạm sau xử lý.
- security review, getAllUsers: Bearer api_key; giữ credential ở server-side.
- privacy review, getAllUsers: Admin-only route; kiểm tra status trước parse JSON.
- local, getAllUsers: Protect PII; giữ correlation ID.
- staging, getAllUsers: No browser call; không gửi secret sang browser.
- production, getAllUsers: Handle empty list; xóa dữ liệu tạm sau xử lý.
- CI, getAllUsers: Avoid excessive polling; giữ credential ở server-side.
- server route, getAllUsers: Bearer api_key; kiểm tra status trước parse JSON.
- background worker, getAllUsers: Admin-only route; giữ correlation ID.
- multi-tab browser, getAllUsers: Protect PII; không gửi secret sang browser.
- mobile browser, getAllUsers: No browser call; xóa dữ liệu tạm sau xử lý.
### 119. Phương thức `rotateProjectKey`

Mục đích: Cấp key mới từ owner backend.

```js
async function rotateProjectKey(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- profile update, rotateProjectKey: Owner cookie; dùng timeout hữu hạn.
- support diagnosis, rotateProjectKey: Không gọi từ third-party end-user; redact log.
- security review, rotateProjectKey: CAS; không retry mutation mù.
- privacy review, rotateProjectKey: Lưu ngay key mới; test invariant sau request.
- local, rotateProjectKey: Invalidate old key; kiểm tra cấu hình trước network.
- staging, rotateProjectKey: Không retry mù; dùng timeout hữu hạn.
- production, rotateProjectKey: Owner cookie; redact log.
- CI, rotateProjectKey: Không gọi từ third-party end-user; không retry mutation mù.
- server route, rotateProjectKey: CAS; test invariant sau request.
- background worker, rotateProjectKey: Lưu ngay key mới; kiểm tra cấu hình trước network.
- multi-tab browser, rotateProjectKey: Invalidate old key; dùng timeout hữu hạn.
- mobile browser, rotateProjectKey: Không retry mù; redact log.
- edge runtime, rotateProjectKey: Owner cookie; không retry mutation mù.
- container runtime, rotateProjectKey: Không gọi từ third-party end-user; test invariant sau request.
- high latency network, rotateProjectKey: CAS; kiểm tra cấu hình trước network.
- provider 429, rotateProjectKey: Lưu ngay key mới; dùng timeout hữu hạn.
- provider 5xx, rotateProjectKey: Invalidate old key; redact log.
- secret rotation, rotateProjectKey: Không retry mù; không retry mutation mù.
- project revoke, rotateProjectKey: Owner cookie; test invariant sau request.
- device expiry, rotateProjectKey: Không gọi từ third-party end-user; kiểm tra cấu hình trước network.
- profile update, rotateProjectKey: CAS; dùng timeout hữu hạn.
- support diagnosis, rotateProjectKey: Lưu ngay key mới; redact log.
- security review, rotateProjectKey: Invalidate old key; không retry mutation mù.
- privacy review, rotateProjectKey: Không retry mù; test invariant sau request.
- local, rotateProjectKey: Owner cookie; kiểm tra cấu hình trước network.
- staging, rotateProjectKey: Không gọi từ third-party end-user; dùng timeout hữu hạn.
- production, rotateProjectKey: CAS; redact log.
- CI, rotateProjectKey: Lưu ngay key mới; không retry mutation mù.
- server route, rotateProjectKey: Invalidate old key; test invariant sau request.
- background worker, rotateProjectKey: Không retry mù; kiểm tra cấu hình trước network.
- multi-tab browser, rotateProjectKey: Owner cookie; dùng timeout hữu hạn.
- mobile browser, rotateProjectKey: Không gọi từ third-party end-user; redact log.
- edge runtime, rotateProjectKey: CAS; không retry mutation mù.
- container runtime, rotateProjectKey: Lưu ngay key mới; test invariant sau request.
- high latency network, rotateProjectKey: Invalidate old key; kiểm tra cấu hình trước network.
### 120. Phương thức `revokeProject`

Mục đích: Revoke project từ dashboard.

```js
async function revokeProject(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- privacy review, revokeProject: Dọn OAuth docs; kiểm tra status trước parse JSON.
- local, revokeProject: Chunk cleanup; giữ correlation ID.
- staging, revokeProject: Audit; không gửi secret sang browser.
- production, revokeProject: Không gọi client-side; xóa dữ liệu tạm sau xử lý.
- CI, revokeProject: Post-revoke smoke; giữ credential ở server-side.
- server route, revokeProject: Owner confirmation; kiểm tra status trước parse JSON.
- background worker, revokeProject: Dọn OAuth docs; giữ correlation ID.
- multi-tab browser, revokeProject: Chunk cleanup; không gửi secret sang browser.
- mobile browser, revokeProject: Audit; xóa dữ liệu tạm sau xử lý.
- edge runtime, revokeProject: Không gọi client-side; giữ credential ở server-side.
- container runtime, revokeProject: Post-revoke smoke; kiểm tra status trước parse JSON.
- high latency network, revokeProject: Owner confirmation; giữ correlation ID.
- provider 429, revokeProject: Dọn OAuth docs; không gửi secret sang browser.
- provider 5xx, revokeProject: Chunk cleanup; xóa dữ liệu tạm sau xử lý.
- secret rotation, revokeProject: Audit; giữ credential ở server-side.
- project revoke, revokeProject: Không gọi client-side; kiểm tra status trước parse JSON.
- device expiry, revokeProject: Post-revoke smoke; giữ correlation ID.
- profile update, revokeProject: Owner confirmation; không gửi secret sang browser.
- support diagnosis, revokeProject: Dọn OAuth docs; xóa dữ liệu tạm sau xử lý.
- security review, revokeProject: Chunk cleanup; giữ credential ở server-side.
- privacy review, revokeProject: Audit; kiểm tra status trước parse JSON.
- local, revokeProject: Không gọi client-side; giữ correlation ID.
- staging, revokeProject: Post-revoke smoke; không gửi secret sang browser.
- production, revokeProject: Owner confirmation; xóa dữ liệu tạm sau xử lý.
- CI, revokeProject: Dọn OAuth docs; giữ credential ở server-side.
- server route, revokeProject: Chunk cleanup; kiểm tra status trước parse JSON.
- background worker, revokeProject: Audit; giữ correlation ID.
- multi-tab browser, revokeProject: Không gọi client-side; không gửi secret sang browser.
- mobile browser, revokeProject: Post-revoke smoke; xóa dữ liệu tạm sau xử lý.
- edge runtime, revokeProject: Owner confirmation; giữ credential ở server-side.
- container runtime, revokeProject: Dọn OAuth docs; kiểm tra status trước parse JSON.
- high latency network, revokeProject: Chunk cleanup; giữ correlation ID.
- provider 429, revokeProject: Audit; không gửi secret sang browser.
- provider 5xx, revokeProject: Không gọi client-side; xóa dữ liệu tạm sau xử lý.
- secret rotation, revokeProject: Post-revoke smoke; giữ credential ở server-side.
### 121. Phương thức `mapApiUserProfile`

Mục đích: Map profile sang user domain.

```js
async function mapApiUserProfile(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- production, mapApiUserProfile: Optional fields; redact log.
- CI, mapApiUserProfile: Không dùng email key; không retry mutation mù.
- server route, mapApiUserProfile: Preserve unknown safely; test invariant sau request.
- background worker, mapApiUserProfile: Update profile; kiểm tra cấu hình trước network.
- multi-tab browser, mapApiUserProfile: id là primary key; dùng timeout hữu hạn.
- mobile browser, mapApiUserProfile: sub kiểm tra bằng id; redact log.
- edge runtime, mapApiUserProfile: Optional fields; không retry mutation mù.
- container runtime, mapApiUserProfile: Không dùng email key; test invariant sau request.
- high latency network, mapApiUserProfile: Preserve unknown safely; kiểm tra cấu hình trước network.
- provider 429, mapApiUserProfile: Update profile; dùng timeout hữu hạn.
- provider 5xx, mapApiUserProfile: id là primary key; redact log.
- secret rotation, mapApiUserProfile: sub kiểm tra bằng id; không retry mutation mù.
- project revoke, mapApiUserProfile: Optional fields; test invariant sau request.
- device expiry, mapApiUserProfile: Không dùng email key; kiểm tra cấu hình trước network.
- profile update, mapApiUserProfile: Preserve unknown safely; dùng timeout hữu hạn.
- support diagnosis, mapApiUserProfile: Update profile; redact log.
- security review, mapApiUserProfile: id là primary key; không retry mutation mù.
- privacy review, mapApiUserProfile: sub kiểm tra bằng id; test invariant sau request.
- local, mapApiUserProfile: Optional fields; kiểm tra cấu hình trước network.
- staging, mapApiUserProfile: Không dùng email key; dùng timeout hữu hạn.
- production, mapApiUserProfile: Preserve unknown safely; redact log.
- CI, mapApiUserProfile: Update profile; không retry mutation mù.
- server route, mapApiUserProfile: id là primary key; test invariant sau request.
- background worker, mapApiUserProfile: sub kiểm tra bằng id; kiểm tra cấu hình trước network.
- multi-tab browser, mapApiUserProfile: Optional fields; dùng timeout hữu hạn.
- mobile browser, mapApiUserProfile: Không dùng email key; redact log.
- edge runtime, mapApiUserProfile: Preserve unknown safely; không retry mutation mù.
- container runtime, mapApiUserProfile: Update profile; test invariant sau request.
- high latency network, mapApiUserProfile: id là primary key; kiểm tra cấu hình trước network.
- provider 429, mapApiUserProfile: sub kiểm tra bằng id; dùng timeout hữu hạn.
- provider 5xx, mapApiUserProfile: Optional fields; redact log.
- secret rotation, mapApiUserProfile: Không dùng email key; không retry mutation mù.
- project revoke, mapApiUserProfile: Preserve unknown safely; test invariant sau request.
- device expiry, mapApiUserProfile: Update profile; kiểm tra cấu hình trước network.
- profile update, mapApiUserProfile: id là primary key; dùng timeout hữu hạn.
### 122. Phương thức `normalizeApiError`

Mục đích: Chuẩn hóa lỗi APIUYTIN.

```js
async function normalizeApiError(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- background worker, normalizeApiError: Correlation ID; giữ correlation ID.
- multi-tab browser, normalizeApiError: No raw stack; không gửi secret sang browser.
- mobile browser, normalizeApiError: Retry only transient; xóa dữ liệu tạm sau xử lý.
- edge runtime, normalizeApiError: Map status; giữ credential ở server-side.
- container runtime, normalizeApiError: Map error code; kiểm tra status trước parse JSON.
- high latency network, normalizeApiError: Redact body; giữ correlation ID.
- provider 429, normalizeApiError: Correlation ID; không gửi secret sang browser.
- provider 5xx, normalizeApiError: No raw stack; xóa dữ liệu tạm sau xử lý.
- secret rotation, normalizeApiError: Retry only transient; giữ credential ở server-side.
- project revoke, normalizeApiError: Map status; kiểm tra status trước parse JSON.
- device expiry, normalizeApiError: Map error code; giữ correlation ID.
- profile update, normalizeApiError: Redact body; không gửi secret sang browser.
- support diagnosis, normalizeApiError: Correlation ID; xóa dữ liệu tạm sau xử lý.
- security review, normalizeApiError: No raw stack; giữ credential ở server-side.
- privacy review, normalizeApiError: Retry only transient; kiểm tra status trước parse JSON.
- local, normalizeApiError: Map status; giữ correlation ID.
- staging, normalizeApiError: Map error code; không gửi secret sang browser.
- production, normalizeApiError: Redact body; xóa dữ liệu tạm sau xử lý.
- CI, normalizeApiError: Correlation ID; giữ credential ở server-side.
- server route, normalizeApiError: No raw stack; kiểm tra status trước parse JSON.
- background worker, normalizeApiError: Retry only transient; giữ correlation ID.
- multi-tab browser, normalizeApiError: Map status; không gửi secret sang browser.
- mobile browser, normalizeApiError: Map error code; xóa dữ liệu tạm sau xử lý.
- edge runtime, normalizeApiError: Redact body; giữ credential ở server-side.
- container runtime, normalizeApiError: Correlation ID; kiểm tra status trước parse JSON.
- high latency network, normalizeApiError: No raw stack; giữ correlation ID.
- provider 429, normalizeApiError: Retry only transient; không gửi secret sang browser.
- provider 5xx, normalizeApiError: Map status; xóa dữ liệu tạm sau xử lý.
- secret rotation, normalizeApiError: Map error code; giữ credential ở server-side.
- project revoke, normalizeApiError: Redact body; kiểm tra status trước parse JSON.
- device expiry, normalizeApiError: Correlation ID; giữ correlation ID.
- profile update, normalizeApiError: No raw stack; không gửi secret sang browser.
- support diagnosis, normalizeApiError: Retry only transient; xóa dữ liệu tạm sau xử lý.
- security review, normalizeApiError: Map status; giữ credential ở server-side.
- privacy review, normalizeApiError: Map error code; kiểm tra status trước parse JSON.
### 123. Phương thức `withApiTimeout`

Mục đích: Bọc request bằng timeout.

```js
async function withApiTimeout(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- edge runtime, withApiTimeout: Close resources; không retry mutation mù.
- container runtime, withApiTimeout: Return typed error; test invariant sau request.
- high latency network, withApiTimeout: AbortController; kiểm tra cấu hình trước network.
- provider 429, withApiTimeout: Deadline hữu hạn; dùng timeout hữu hạn.
- provider 5xx, withApiTimeout: Không retry code mù; redact log.
- secret rotation, withApiTimeout: Record timeout metric; không retry mutation mù.
- project revoke, withApiTimeout: Close resources; test invariant sau request.
- device expiry, withApiTimeout: Return typed error; kiểm tra cấu hình trước network.
- profile update, withApiTimeout: AbortController; dùng timeout hữu hạn.
- support diagnosis, withApiTimeout: Deadline hữu hạn; redact log.
- security review, withApiTimeout: Không retry code mù; không retry mutation mù.
- privacy review, withApiTimeout: Record timeout metric; test invariant sau request.
- local, withApiTimeout: Close resources; kiểm tra cấu hình trước network.
- staging, withApiTimeout: Return typed error; dùng timeout hữu hạn.
- production, withApiTimeout: AbortController; redact log.
- CI, withApiTimeout: Deadline hữu hạn; không retry mutation mù.
- server route, withApiTimeout: Không retry code mù; test invariant sau request.
- background worker, withApiTimeout: Record timeout metric; kiểm tra cấu hình trước network.
- multi-tab browser, withApiTimeout: Close resources; dùng timeout hữu hạn.
- mobile browser, withApiTimeout: Return typed error; redact log.
- edge runtime, withApiTimeout: AbortController; không retry mutation mù.
- container runtime, withApiTimeout: Deadline hữu hạn; test invariant sau request.
- high latency network, withApiTimeout: Không retry code mù; kiểm tra cấu hình trước network.
- provider 429, withApiTimeout: Record timeout metric; dùng timeout hữu hạn.
- provider 5xx, withApiTimeout: Close resources; redact log.
- secret rotation, withApiTimeout: Return typed error; không retry mutation mù.
- project revoke, withApiTimeout: AbortController; test invariant sau request.
- device expiry, withApiTimeout: Deadline hữu hạn; kiểm tra cấu hình trước network.
- profile update, withApiTimeout: Không retry code mù; dùng timeout hữu hạn.
- support diagnosis, withApiTimeout: Record timeout metric; redact log.
- security review, withApiTimeout: Close resources; không retry mutation mù.
- privacy review, withApiTimeout: Return typed error; test invariant sau request.
- local, withApiTimeout: AbortController; kiểm tra cấu hình trước network.
- staging, withApiTimeout: Deadline hữu hạn; dùng timeout hữu hạn.
- production, withApiTimeout: Không retry code mù; redact log.
### 124. Phương thức `withQueryRetry`

Mục đích: Retry query idempotent.

```js
async function withQueryRetry(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- provider 429, withQueryRetry: Jitter; không gửi secret sang browser.
- provider 5xx, withQueryRetry: Max three; xóa dữ liệu tạm sau xử lý.
- secret rotation, withQueryRetry: 429; giữ credential ở server-side.
- project revoke, withQueryRetry: 5xx; kiểm tra status trước parse JSON.
- device expiry, withQueryRetry: Network; giữ correlation ID.
- profile update, withQueryRetry: Backoff; không gửi secret sang browser.
- support diagnosis, withQueryRetry: Jitter; xóa dữ liệu tạm sau xử lý.
- security review, withQueryRetry: Max three; giữ credential ở server-side.
- privacy review, withQueryRetry: 429; kiểm tra status trước parse JSON.
- local, withQueryRetry: 5xx; giữ correlation ID.
- staging, withQueryRetry: Network; không gửi secret sang browser.
- production, withQueryRetry: Backoff; xóa dữ liệu tạm sau xử lý.
- CI, withQueryRetry: Jitter; giữ credential ở server-side.
- server route, withQueryRetry: Max three; kiểm tra status trước parse JSON.
- background worker, withQueryRetry: 429; giữ correlation ID.
- multi-tab browser, withQueryRetry: 5xx; không gửi secret sang browser.
- mobile browser, withQueryRetry: Network; xóa dữ liệu tạm sau xử lý.
- edge runtime, withQueryRetry: Backoff; giữ credential ở server-side.
- container runtime, withQueryRetry: Jitter; kiểm tra status trước parse JSON.
- high latency network, withQueryRetry: Max three; giữ correlation ID.
- provider 429, withQueryRetry: 429; không gửi secret sang browser.
- provider 5xx, withQueryRetry: 5xx; xóa dữ liệu tạm sau xử lý.
- secret rotation, withQueryRetry: Network; giữ credential ở server-side.
- project revoke, withQueryRetry: Backoff; kiểm tra status trước parse JSON.
- device expiry, withQueryRetry: Jitter; giữ correlation ID.
- profile update, withQueryRetry: Max three; không gửi secret sang browser.
- support diagnosis, withQueryRetry: 429; xóa dữ liệu tạm sau xử lý.
- security review, withQueryRetry: 5xx; giữ credential ở server-side.
- privacy review, withQueryRetry: Network; kiểm tra status trước parse JSON.
- local, withQueryRetry: Backoff; giữ correlation ID.
- staging, withQueryRetry: Jitter; không gửi secret sang browser.
- production, withQueryRetry: Max three; xóa dữ liệu tạm sau xử lý.
- CI, withQueryRetry: 429; giữ credential ở server-side.
- server route, withQueryRetry: 5xx; kiểm tra status trước parse JSON.
- background worker, withQueryRetry: Network; giữ correlation ID.
### 125. Phương thức `withMutationGuard`

Mục đích: Bảo vệ mutation integration.

```js
async function withMutationGuard(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- project revoke, withMutationGuard: Idempotency key; test invariant sau request.
- device expiry, withMutationGuard: CAS if available; kiểm tra cấu hình trước network.
- profile update, withMutationGuard: No blind retry; dùng timeout hữu hạn.
- support diagnosis, withMutationGuard: Unknown outcome; redact log.
- security review, withMutationGuard: Audit; không retry mutation mù.
- privacy review, withMutationGuard: Manual recovery; test invariant sau request.
- local, withMutationGuard: Idempotency key; kiểm tra cấu hình trước network.
- staging, withMutationGuard: CAS if available; dùng timeout hữu hạn.
- production, withMutationGuard: No blind retry; redact log.
- CI, withMutationGuard: Unknown outcome; không retry mutation mù.
- server route, withMutationGuard: Audit; test invariant sau request.
- background worker, withMutationGuard: Manual recovery; kiểm tra cấu hình trước network.
- multi-tab browser, withMutationGuard: Idempotency key; dùng timeout hữu hạn.
- mobile browser, withMutationGuard: CAS if available; redact log.
- edge runtime, withMutationGuard: No blind retry; không retry mutation mù.
- container runtime, withMutationGuard: Unknown outcome; test invariant sau request.
- high latency network, withMutationGuard: Audit; kiểm tra cấu hình trước network.
- provider 429, withMutationGuard: Manual recovery; dùng timeout hữu hạn.
- provider 5xx, withMutationGuard: Idempotency key; redact log.
- secret rotation, withMutationGuard: CAS if available; không retry mutation mù.
- project revoke, withMutationGuard: No blind retry; test invariant sau request.
- device expiry, withMutationGuard: Unknown outcome; kiểm tra cấu hình trước network.
- profile update, withMutationGuard: Audit; dùng timeout hữu hạn.
- support diagnosis, withMutationGuard: Manual recovery; redact log.
- security review, withMutationGuard: Idempotency key; không retry mutation mù.
- privacy review, withMutationGuard: CAS if available; test invariant sau request.
- local, withMutationGuard: No blind retry; kiểm tra cấu hình trước network.
- staging, withMutationGuard: Unknown outcome; dùng timeout hữu hạn.
- production, withMutationGuard: Audit; redact log.
- CI, withMutationGuard: Manual recovery; không retry mutation mù.
- server route, withMutationGuard: Idempotency key; test invariant sau request.
- background worker, withMutationGuard: CAS if available; kiểm tra cấu hình trước network.
- multi-tab browser, withMutationGuard: No blind retry; dùng timeout hữu hạn.
- mobile browser, withMutationGuard: Unknown outcome; redact log.
- edge runtime, withMutationGuard: Audit; không retry mutation mù.
### 126. Phương thức `runOAuthHealthCheck`

Mục đích: Smoke check cho integration.

```js
async function runOAuthHealthCheck(input, context) {
  // Kiểm tra input và context trước khi gọi APIUYTIN.
  // API key chỉ được đọc từ server-side secret manager.
  // Trả về typed result hoặc typed integration error.
}
```

- support diagnosis, runOAuthHealthCheck: Discovery; xóa dữ liệu tạm sau xử lý.
- security review, runOAuthHealthCheck: Static chooser; giữ credential ở server-side.
- privacy review, runOAuthHealthCheck: Token contract mock; kiểm tra status trước parse JSON.
- local, runOAuthHealthCheck: No real secret output; giữ correlation ID.
- staging, runOAuthHealthCheck: Alert threshold; không gửi secret sang browser.
- production, runOAuthHealthCheck: Health; xóa dữ liệu tạm sau xử lý.
- CI, runOAuthHealthCheck: Discovery; giữ credential ở server-side.
- server route, runOAuthHealthCheck: Static chooser; kiểm tra status trước parse JSON.
- background worker, runOAuthHealthCheck: Token contract mock; giữ correlation ID.
- multi-tab browser, runOAuthHealthCheck: No real secret output; không gửi secret sang browser.
- mobile browser, runOAuthHealthCheck: Alert threshold; xóa dữ liệu tạm sau xử lý.
- edge runtime, runOAuthHealthCheck: Health; giữ credential ở server-side.
- container runtime, runOAuthHealthCheck: Discovery; kiểm tra status trước parse JSON.
- high latency network, runOAuthHealthCheck: Static chooser; giữ correlation ID.
- provider 429, runOAuthHealthCheck: Token contract mock; không gửi secret sang browser.
- provider 5xx, runOAuthHealthCheck: No real secret output; xóa dữ liệu tạm sau xử lý.
- secret rotation, runOAuthHealthCheck: Alert threshold; giữ credential ở server-side.
- project revoke, runOAuthHealthCheck: Health; kiểm tra status trước parse JSON.
- device expiry, runOAuthHealthCheck: Discovery; giữ correlation ID.
- profile update, runOAuthHealthCheck: Static chooser; không gửi secret sang browser.
- support diagnosis, runOAuthHealthCheck: Token contract mock; xóa dữ liệu tạm sau xử lý.
- security review, runOAuthHealthCheck: No real secret output; giữ credential ở server-side.
- privacy review, runOAuthHealthCheck: Alert threshold; kiểm tra status trước parse JSON.
- local, runOAuthHealthCheck: Health; giữ correlation ID.
- staging, runOAuthHealthCheck: Discovery; không gửi secret sang browser.
- production, runOAuthHealthCheck: Static chooser; xóa dữ liệu tạm sau xử lý.
- CI, runOAuthHealthCheck: Token contract mock; giữ credential ở server-side.
- server route, runOAuthHealthCheck: No real secret output; kiểm tra status trước parse JSON.
- background worker, runOAuthHealthCheck: Alert threshold; giữ correlation ID.
- multi-tab browser, runOAuthHealthCheck: Health; không gửi secret sang browser.
- mobile browser, runOAuthHealthCheck: Discovery; xóa dữ liệu tạm sau xử lý.
- edge runtime, runOAuthHealthCheck: Static chooser; giữ credential ở server-side.
- container runtime, runOAuthHealthCheck: Token contract mock; kiểm tra status trước parse JSON.
- high latency network, runOAuthHealthCheck: No real secret output; giữ correlation ID.
- provider 429, runOAuthHealthCheck: Alert threshold; không gửi secret sang browser.
## 127. Flow A: login account đã nhớ

Quy trình nên được triển khai như một state machine nhỏ, không dùng biến global để giữ trạng thái user.

- local: bước Tạo state; kiểm tra cấu hình trước network.
- staging: bước Redirect start; giữ credential ở server-side.
- production: bước Nhận chooser; dùng timeout hữu hạn.
- CI: bước Chọn account; kiểm tra status trước parse JSON.
- server route: bước Nhận code; redact log.
- background worker: bước Đổi token; giữ correlation ID.
- multi-tab browser: bước Tạo session; không retry mutation mù.
- mobile browser: bước Tạo state; không gửi secret sang browser.
- edge runtime: bước Redirect start; test invariant sau request.
- container runtime: bước Nhận chooser; xóa dữ liệu tạm sau xử lý.
- high latency network: bước Chọn account; kiểm tra cấu hình trước network.
- provider 429: bước Nhận code; giữ credential ở server-side.
- provider 5xx: bước Đổi token; dùng timeout hữu hạn.
- secret rotation: bước Tạo session; kiểm tra status trước parse JSON.
- project revoke: bước Tạo state; redact log.
- device expiry: bước Redirect start; giữ correlation ID.
- profile update: bước Nhận chooser; không retry mutation mù.
- support diagnosis: bước Chọn account; không gửi secret sang browser.
- security review: bước Nhận code; test invariant sau request.
- privacy review: bước Đổi token; xóa dữ liệu tạm sau xử lý.
- local: bước Tạo session; kiểm tra cấu hình trước network.
- staging: bước Tạo state; giữ credential ở server-side.
- production: bước Redirect start; dùng timeout hữu hạn.
- CI: bước Nhận chooser; kiểm tra status trước parse JSON.
- server route: bước Chọn account; redact log.
- background worker: bước Nhận code; giữ correlation ID.
- multi-tab browser: bước Đổi token; không retry mutation mù.
- mobile browser: bước Tạo session; không gửi secret sang browser.
- edge runtime: bước Tạo state; test invariant sau request.
- container runtime: bước Redirect start; xóa dữ liệu tạm sau xử lý.
- high latency network: bước Nhận chooser; kiểm tra cấu hình trước network.
- provider 429: bước Chọn account; giữ credential ở server-side.
- provider 5xx: bước Nhận code; dùng timeout hữu hạn.
- secret rotation: bước Đổi token; kiểm tra status trước parse JSON.
- project revoke: bước Tạo session; redact log.
- device expiry: bước Tạo state; giữ correlation ID.
- profile update: bước Redirect start; không retry mutation mù.
- support diagnosis: bước Nhận chooser; không gửi secret sang browser.
- security review: bước Chọn account; test invariant sau request.
- privacy review: bước Nhận code; xóa dữ liệu tạm sau xử lý.
- local: bước Đổi token; kiểm tra cấu hình trước network.
- staging: bước Tạo session; giữ credential ở server-side.
## 128. Flow B: device mới

Quy trình nên được triển khai như một state machine nhỏ, không dùng biến global để giữ trạng thái user.

- production: bước Chooser rỗng; giữ credential ở server-side.
- CI: bước Bấm Add account; dùng timeout hữu hạn.
- server route: bước Google bootstrap; kiểm tra status trước parse JSON.
- background worker: bước Tạo apiUser; redact log.
- multi-tab browser: bước Link device; giữ correlation ID.
- mobile browser: bước Quay lại consent; không retry mutation mù.
- edge runtime: bước Không có device link; không gửi secret sang browser.
- container runtime: bước Chooser rỗng; test invariant sau request.
- high latency network: bước Bấm Add account; xóa dữ liệu tạm sau xử lý.
- provider 429: bước Google bootstrap; kiểm tra cấu hình trước network.
- provider 5xx: bước Tạo apiUser; giữ credential ở server-side.
- secret rotation: bước Link device; dùng timeout hữu hạn.
- project revoke: bước Quay lại consent; kiểm tra status trước parse JSON.
- device expiry: bước Không có device link; redact log.
- profile update: bước Chooser rỗng; giữ correlation ID.
- support diagnosis: bước Bấm Add account; không retry mutation mù.
- security review: bước Google bootstrap; không gửi secret sang browser.
- privacy review: bước Tạo apiUser; test invariant sau request.
- local: bước Link device; xóa dữ liệu tạm sau xử lý.
- staging: bước Quay lại consent; kiểm tra cấu hình trước network.
- production: bước Không có device link; giữ credential ở server-side.
- CI: bước Chooser rỗng; dùng timeout hữu hạn.
- server route: bước Bấm Add account; kiểm tra status trước parse JSON.
- background worker: bước Google bootstrap; redact log.
- multi-tab browser: bước Tạo apiUser; giữ correlation ID.
- mobile browser: bước Link device; không retry mutation mù.
- edge runtime: bước Quay lại consent; không gửi secret sang browser.
- container runtime: bước Không có device link; test invariant sau request.
- high latency network: bước Chooser rỗng; xóa dữ liệu tạm sau xử lý.
- provider 429: bước Bấm Add account; kiểm tra cấu hình trước network.
- provider 5xx: bước Google bootstrap; giữ credential ở server-side.
- secret rotation: bước Tạo apiUser; dùng timeout hữu hạn.
- project revoke: bước Link device; kiểm tra status trước parse JSON.
- device expiry: bước Quay lại consent; redact log.
- profile update: bước Không có device link; giữ correlation ID.
- support diagnosis: bước Chooser rỗng; không retry mutation mù.
- security review: bước Bấm Add account; không gửi secret sang browser.
- privacy review: bước Google bootstrap; test invariant sau request.
- local: bước Tạo apiUser; xóa dữ liệu tạm sau xử lý.
- staging: bước Link device; kiểm tra cấu hình trước network.
- production: bước Quay lại consent; giữ credential ở server-side.
- CI: bước Không có device link; dùng timeout hữu hạn.
## 129. Flow C: thêm account

Quy trình nên được triển khai như một state machine nhỏ, không dùng biến global để giữ trạng thái user.

- server route: bước Google state; dùng timeout hữu hạn.
- background worker: bước Google callback; kiểm tra status trước parse JSON.
- multi-tab browser: bước Upsert idempotent; redact log.
- mobile browser: bước Chọn account mới; giữ correlation ID.
- edge runtime: bước Code profile mới; không retry mutation mù.
- container runtime: bước Transaction active; không gửi secret sang browser.
- high latency network: bước Device match; test invariant sau request.
- provider 429: bước Google state; xóa dữ liệu tạm sau xử lý.
- provider 5xx: bước Google callback; kiểm tra cấu hình trước network.
- secret rotation: bước Upsert idempotent; giữ credential ở server-side.
- project revoke: bước Chọn account mới; dùng timeout hữu hạn.
- device expiry: bước Code profile mới; kiểm tra status trước parse JSON.
- profile update: bước Transaction active; redact log.
- support diagnosis: bước Device match; giữ correlation ID.
- security review: bước Google state; không retry mutation mù.
- privacy review: bước Google callback; không gửi secret sang browser.
- local: bước Upsert idempotent; test invariant sau request.
- staging: bước Chọn account mới; xóa dữ liệu tạm sau xử lý.
- production: bước Code profile mới; kiểm tra cấu hình trước network.
- CI: bước Transaction active; giữ credential ở server-side.
- server route: bước Device match; dùng timeout hữu hạn.
- background worker: bước Google state; kiểm tra status trước parse JSON.
- multi-tab browser: bước Google callback; redact log.
- mobile browser: bước Upsert idempotent; giữ correlation ID.
- edge runtime: bước Chọn account mới; không retry mutation mù.
- container runtime: bước Code profile mới; không gửi secret sang browser.
- high latency network: bước Transaction active; test invariant sau request.
- provider 429: bước Device match; xóa dữ liệu tạm sau xử lý.
- provider 5xx: bước Google state; kiểm tra cấu hình trước network.
- secret rotation: bước Google callback; giữ credential ở server-side.
- project revoke: bước Upsert idempotent; dùng timeout hữu hạn.
- device expiry: bước Chọn account mới; kiểm tra status trước parse JSON.
- profile update: bước Code profile mới; redact log.
- support diagnosis: bước Transaction active; giữ correlation ID.
- security review: bước Device match; không retry mutation mù.
- privacy review: bước Google state; không gửi secret sang browser.
- local: bước Google callback; test invariant sau request.
- staging: bước Upsert idempotent; xóa dữ liệu tạm sau xử lý.
- production: bước Chọn account mới; kiểm tra cấu hình trước network.
- CI: bước Code profile mới; giữ credential ở server-side.
- server route: bước Transaction active; dùng timeout hữu hạn.
- background worker: bước Device match; kiểm tra status trước parse JSON.
## 130. Flow D: cancel

Quy trình nên được triển khai như một state machine nhỏ, không dùng biến global để giữ trạng thái user.

- multi-tab browser: bước Giữ state; kiểm tra status trước parse JSON.
- mobile browser: bước Không token exchange; redact log.
- edge runtime: bước Xóa pending state; giữ correlation ID.
- container runtime: bước Cho login lại; không retry mutation mù.
- high latency network: bước Bấm Hủy; không gửi secret sang browser.
- provider 429: bước Cancel server-side; test invariant sau request.
- provider 5xx: bước Callback access_denied; xóa dữ liệu tạm sau xử lý.
- secret rotation: bước Giữ state; kiểm tra cấu hình trước network.
- project revoke: bước Không token exchange; giữ credential ở server-side.
- device expiry: bước Xóa pending state; dùng timeout hữu hạn.
- profile update: bước Cho login lại; kiểm tra status trước parse JSON.
- support diagnosis: bước Bấm Hủy; redact log.
- security review: bước Cancel server-side; giữ correlation ID.
- privacy review: bước Callback access_denied; không retry mutation mù.
- local: bước Giữ state; không gửi secret sang browser.
- staging: bước Không token exchange; test invariant sau request.
- production: bước Xóa pending state; xóa dữ liệu tạm sau xử lý.
- CI: bước Cho login lại; kiểm tra cấu hình trước network.
- server route: bước Bấm Hủy; giữ credential ở server-side.
- background worker: bước Cancel server-side; dùng timeout hữu hạn.
- multi-tab browser: bước Callback access_denied; kiểm tra status trước parse JSON.
- mobile browser: bước Giữ state; redact log.
- edge runtime: bước Không token exchange; giữ correlation ID.
- container runtime: bước Xóa pending state; không retry mutation mù.
- high latency network: bước Cho login lại; không gửi secret sang browser.
- provider 429: bước Bấm Hủy; test invariant sau request.
- provider 5xx: bước Cancel server-side; xóa dữ liệu tạm sau xử lý.
- secret rotation: bước Callback access_denied; kiểm tra cấu hình trước network.
- project revoke: bước Giữ state; giữ credential ở server-side.
- device expiry: bước Không token exchange; dùng timeout hữu hạn.
- profile update: bước Xóa pending state; kiểm tra status trước parse JSON.
- support diagnosis: bước Cho login lại; redact log.
- security review: bước Bấm Hủy; giữ correlation ID.
- privacy review: bước Cancel server-side; không retry mutation mù.
- local: bước Callback access_denied; không gửi secret sang browser.
- staging: bước Giữ state; test invariant sau request.
- production: bước Không token exchange; xóa dữ liệu tạm sau xử lý.
- CI: bước Xóa pending state; kiểm tra cấu hình trước network.
- server route: bước Cho login lại; giữ credential ở server-side.
- background worker: bước Bấm Hủy; dùng timeout hữu hạn.
- multi-tab browser: bước Cancel server-side; kiểm tra status trước parse JSON.
- mobile browser: bước Callback access_denied; redact log.
## 131. Flow E: code replay

Quy trình nên được triển khai như một state machine nhỏ, không dùng biến global để giữ trạng thái user.

- edge runtime: bước Metric replay; redact log.
- container runtime: bước Không retry code; giữ correlation ID.
- high latency network: bước Flow mới; không retry mutation mù.
- provider 429: bước Code đã consume; không gửi secret sang browser.
- provider 5xx: bước Request thứ hai; test invariant sau request.
- secret rotation: bước invalid_grant; xóa dữ liệu tạm sau xử lý.
- project revoke: bước Không tạo session; kiểm tra cấu hình trước network.
- device expiry: bước Metric replay; giữ credential ở server-side.
- profile update: bước Không retry code; dùng timeout hữu hạn.
- support diagnosis: bước Flow mới; kiểm tra status trước parse JSON.
- security review: bước Code đã consume; redact log.
- privacy review: bước Request thứ hai; giữ correlation ID.
- local: bước invalid_grant; không retry mutation mù.
- staging: bước Không tạo session; không gửi secret sang browser.
- production: bước Metric replay; test invariant sau request.
- CI: bước Không retry code; xóa dữ liệu tạm sau xử lý.
- server route: bước Flow mới; kiểm tra cấu hình trước network.
- background worker: bước Code đã consume; giữ credential ở server-side.
- multi-tab browser: bước Request thứ hai; dùng timeout hữu hạn.
- mobile browser: bước invalid_grant; kiểm tra status trước parse JSON.
- edge runtime: bước Không tạo session; redact log.
- container runtime: bước Metric replay; giữ correlation ID.
- high latency network: bước Không retry code; không retry mutation mù.
- provider 429: bước Flow mới; không gửi secret sang browser.
- provider 5xx: bước Code đã consume; test invariant sau request.
- secret rotation: bước Request thứ hai; xóa dữ liệu tạm sau xử lý.
- project revoke: bước invalid_grant; kiểm tra cấu hình trước network.
- device expiry: bước Không tạo session; giữ credential ở server-side.
- profile update: bước Metric replay; dùng timeout hữu hạn.
- support diagnosis: bước Không retry code; kiểm tra status trước parse JSON.
- security review: bước Flow mới; redact log.
- privacy review: bước Code đã consume; giữ correlation ID.
- local: bước Request thứ hai; không retry mutation mù.
- staging: bước invalid_grant; không gửi secret sang browser.
- production: bước Không tạo session; test invariant sau request.
- CI: bước Metric replay; xóa dữ liệu tạm sau xử lý.
- server route: bước Không retry code; kiểm tra cấu hình trước network.
- background worker: bước Flow mới; giữ credential ở server-side.
- multi-tab browser: bước Code đã consume; dùng timeout hữu hạn.
- mobile browser: bước Request thứ hai; kiểm tra status trước parse JSON.
- edge runtime: bước invalid_grant; redact log.
- container runtime: bước Không tạo session; giữ correlation ID.
## 132. Flow F: key rotation

Quy trình nên được triển khai như một state machine nhỏ, không dùng biến global để giữ trạng thái user.

- high latency network: bước New key test; giữ correlation ID.
- provider 429: bước Update deploy secret; không retry mutation mù.
- provider 5xx: bước Owner xác nhận; không gửi secret sang browser.
- secret rotation: bước Generate key; test invariant sau request.
- project revoke: bước CAS patch; xóa dữ liệu tạm sau xử lý.
- device expiry: bước Lưu key; kiểm tra cấu hình trước network.
- profile update: bước Old key reject; giữ credential ở server-side.
- support diagnosis: bước New key test; dùng timeout hữu hạn.
- security review: bước Update deploy secret; kiểm tra status trước parse JSON.
- privacy review: bước Owner xác nhận; redact log.
- local: bước Generate key; giữ correlation ID.
- staging: bước CAS patch; không retry mutation mù.
- production: bước Lưu key; không gửi secret sang browser.
- CI: bước Old key reject; test invariant sau request.
- server route: bước New key test; xóa dữ liệu tạm sau xử lý.
- background worker: bước Update deploy secret; kiểm tra cấu hình trước network.
- multi-tab browser: bước Owner xác nhận; giữ credential ở server-side.
- mobile browser: bước Generate key; dùng timeout hữu hạn.
- edge runtime: bước CAS patch; kiểm tra status trước parse JSON.
- container runtime: bước Lưu key; redact log.
- high latency network: bước Old key reject; giữ correlation ID.
- provider 429: bước New key test; không retry mutation mù.
- provider 5xx: bước Update deploy secret; không gửi secret sang browser.
- secret rotation: bước Owner xác nhận; test invariant sau request.
- project revoke: bước Generate key; xóa dữ liệu tạm sau xử lý.
- device expiry: bước CAS patch; kiểm tra cấu hình trước network.
- profile update: bước Lưu key; giữ credential ở server-side.
- support diagnosis: bước Old key reject; dùng timeout hữu hạn.
- security review: bước New key test; kiểm tra status trước parse JSON.
- privacy review: bước Update deploy secret; redact log.
- local: bước Owner xác nhận; giữ correlation ID.
- staging: bước Generate key; không retry mutation mù.
- production: bước CAS patch; không gửi secret sang browser.
- CI: bước Lưu key; test invariant sau request.
- server route: bước Old key reject; xóa dữ liệu tạm sau xử lý.
- background worker: bước New key test; kiểm tra cấu hình trước network.
- multi-tab browser: bước Update deploy secret; giữ credential ở server-side.
- mobile browser: bước Owner xác nhận; dùng timeout hữu hạn.
- edge runtime: bước Generate key; kiểm tra status trước parse JSON.
- container runtime: bước CAS patch; redact log.
- high latency network: bước Lưu key; giữ correlation ID.
- provider 429: bước Old key reject; không retry mutation mù.
## 133. Flow G: project revoke

Quy trình nên được triển khai như một state machine nhỏ, không dùng biến global để giữ trạng thái user.

- provider 5xx: bước Cleanup audit; không retry mutation mù.
- secret rotation: bước Owner confirm; không gửi secret sang browser.
- project revoke: bước Delete transaction; test invariant sau request.
- device expiry: bước Delete code; xóa dữ liệu tạm sau xử lý.
- profile update: bước Project inactive; kiểm tra cấu hình trước network.
- support diagnosis: bước Token reject; giữ credential ở server-side.
- security review: bước Integration alert; dùng timeout hữu hạn.
- privacy review: bước Cleanup audit; kiểm tra status trước parse JSON.
- local: bước Owner confirm; redact log.
- staging: bước Delete transaction; giữ correlation ID.
- production: bước Delete code; không retry mutation mù.
- CI: bước Project inactive; không gửi secret sang browser.
- server route: bước Token reject; test invariant sau request.
- background worker: bước Integration alert; xóa dữ liệu tạm sau xử lý.
- multi-tab browser: bước Cleanup audit; kiểm tra cấu hình trước network.
- mobile browser: bước Owner confirm; giữ credential ở server-side.
- edge runtime: bước Delete transaction; dùng timeout hữu hạn.
- container runtime: bước Delete code; kiểm tra status trước parse JSON.
- high latency network: bước Project inactive; redact log.
- provider 429: bước Token reject; giữ correlation ID.
- provider 5xx: bước Integration alert; không retry mutation mù.
- secret rotation: bước Cleanup audit; không gửi secret sang browser.
- project revoke: bước Owner confirm; test invariant sau request.
- device expiry: bước Delete transaction; xóa dữ liệu tạm sau xử lý.
- profile update: bước Delete code; kiểm tra cấu hình trước network.
- support diagnosis: bước Project inactive; giữ credential ở server-side.
- security review: bước Token reject; dùng timeout hữu hạn.
- privacy review: bước Integration alert; kiểm tra status trước parse JSON.
- local: bước Cleanup audit; redact log.
- staging: bước Owner confirm; giữ correlation ID.
- production: bước Delete transaction; không retry mutation mù.
- CI: bước Delete code; không gửi secret sang browser.
- server route: bước Project inactive; test invariant sau request.
- background worker: bước Token reject; xóa dữ liệu tạm sau xử lý.
- multi-tab browser: bước Integration alert; kiểm tra cấu hình trước network.
- mobile browser: bước Cleanup audit; giữ credential ở server-side.
- edge runtime: bước Owner confirm; dùng timeout hữu hạn.
- container runtime: bước Delete transaction; kiểm tra status trước parse JSON.
- high latency network: bước Delete code; redact log.
- provider 429: bước Project inactive; giữ correlation ID.
- provider 5xx: bước Token reject; không retry mutation mù.
- secret rotation: bước Integration alert; không gửi secret sang browser.
## 134. Flow H: concurrent login

Quy trình nên được triển khai như một state machine nhỏ, không dùng biến global để giữ trạng thái user.

- project revoke: bước State riêng; không gửi secret sang browser.
- device expiry: bước Transaction riêng; test invariant sau request.
- profile update: bước Không global state; xóa dữ liệu tạm sau xử lý.
- support diagnosis: bước Bounded calls; kiểm tra cấu hình trước network.
- security review: bước No duplicate user; giữ credential ở server-side.
- privacy review: bước No duplicate link; dùng timeout hữu hạn.
- local: bước Metrics; kiểm tra status trước parse JSON.
- staging: bước State riêng; redact log.
- production: bước Transaction riêng; giữ correlation ID.
- CI: bước Không global state; không retry mutation mù.
- server route: bước Bounded calls; không gửi secret sang browser.
- background worker: bước No duplicate user; test invariant sau request.
- multi-tab browser: bước No duplicate link; xóa dữ liệu tạm sau xử lý.
- mobile browser: bước Metrics; kiểm tra cấu hình trước network.
- edge runtime: bước State riêng; giữ credential ở server-side.
- container runtime: bước Transaction riêng; dùng timeout hữu hạn.
- high latency network: bước Không global state; kiểm tra status trước parse JSON.
- provider 429: bước Bounded calls; redact log.
- provider 5xx: bước No duplicate user; giữ correlation ID.
- secret rotation: bước No duplicate link; không retry mutation mù.
- project revoke: bước Metrics; không gửi secret sang browser.
- device expiry: bước State riêng; test invariant sau request.
- profile update: bước Transaction riêng; xóa dữ liệu tạm sau xử lý.
- support diagnosis: bước Không global state; kiểm tra cấu hình trước network.
- security review: bước Bounded calls; giữ credential ở server-side.
- privacy review: bước No duplicate user; dùng timeout hữu hạn.
- local: bước No duplicate link; kiểm tra status trước parse JSON.
- staging: bước Metrics; redact log.
- production: bước State riêng; giữ correlation ID.
- CI: bước Transaction riêng; không retry mutation mù.
- server route: bước Không global state; không gửi secret sang browser.
- background worker: bước Bounded calls; test invariant sau request.
- multi-tab browser: bước No duplicate user; xóa dữ liệu tạm sau xử lý.
- mobile browser: bước No duplicate link; kiểm tra cấu hình trước network.
- edge runtime: bước Metrics; giữ credential ở server-side.
- container runtime: bước State riêng; dùng timeout hữu hạn.
- high latency network: bước Transaction riêng; kiểm tra status trước parse JSON.
- provider 429: bước Không global state; redact log.
- provider 5xx: bước Bounded calls; giữ correlation ID.
- secret rotation: bước No duplicate user; không retry mutation mù.
- project revoke: bước No duplicate link; không gửi secret sang browser.
- device expiry: bước Metrics; test invariant sau request.
## 135. Flow I: callback error

Quy trình nên được triển khai như một state machine nhỏ, không dùng biến global để giữ trạng thái user.

- profile update: bước Classify status; test invariant sau request.
- support diagnosis: bước No raw details; xóa dữ liệu tạm sau xử lý.
- security review: bước Correlation ID; kiểm tra cấu hình trước network.
- privacy review: bước Clear state; giữ credential ở server-side.
- local: bước User message; dùng timeout hữu hạn.
- staging: bước Retry new flow; kiểm tra status trước parse JSON.
- production: bước Read error; redact log.
- CI: bước Classify status; giữ correlation ID.
- server route: bước No raw details; không retry mutation mù.
- background worker: bước Correlation ID; không gửi secret sang browser.
- multi-tab browser: bước Clear state; test invariant sau request.
- mobile browser: bước User message; xóa dữ liệu tạm sau xử lý.
- edge runtime: bước Retry new flow; kiểm tra cấu hình trước network.
- container runtime: bước Read error; giữ credential ở server-side.
- high latency network: bước Classify status; dùng timeout hữu hạn.
- provider 429: bước No raw details; kiểm tra status trước parse JSON.
- provider 5xx: bước Correlation ID; redact log.
- secret rotation: bước Clear state; giữ correlation ID.
- project revoke: bước User message; không retry mutation mù.
- device expiry: bước Retry new flow; không gửi secret sang browser.
- profile update: bước Read error; test invariant sau request.
- support diagnosis: bước Classify status; xóa dữ liệu tạm sau xử lý.
- security review: bước No raw details; kiểm tra cấu hình trước network.
- privacy review: bước Correlation ID; giữ credential ở server-side.
- local: bước Clear state; dùng timeout hữu hạn.
- staging: bước User message; kiểm tra status trước parse JSON.
- production: bước Retry new flow; redact log.
- CI: bước Read error; giữ correlation ID.
- server route: bước Classify status; không retry mutation mù.
- background worker: bước No raw details; không gửi secret sang browser.
- multi-tab browser: bước Correlation ID; test invariant sau request.
- mobile browser: bước Clear state; xóa dữ liệu tạm sau xử lý.
- edge runtime: bước User message; kiểm tra cấu hình trước network.
- container runtime: bước Retry new flow; giữ credential ở server-side.
- high latency network: bước Read error; dùng timeout hữu hạn.
- provider 429: bước Classify status; kiểm tra status trước parse JSON.
- provider 5xx: bước No raw details; redact log.
- secret rotation: bước Correlation ID; giữ correlation ID.
- project revoke: bước Clear state; không retry mutation mù.
- device expiry: bước User message; không gửi secret sang browser.
- profile update: bước Retry new flow; test invariant sau request.
- support diagnosis: bước Read error; xóa dữ liệu tạm sau xử lý.
## 136. Flow J: production smoke

Quy trình nên được triển khai như một state machine nhỏ, không dùng biến global để giữ trạng thái user.

- security review: bước Chooser asset; xóa dữ liệu tạm sau xử lý.
- privacy review: bước Session unauthenticated; kiểm tra cấu hình trước network.
- local: bước Legacy secret reject; giữ credential ở server-side.
- staging: bước Custom domain; dùng timeout hữu hạn.
- production: bước Record result; kiểm tra status trước parse JSON.
- CI: bước Health; redact log.
- server route: bước Discovery; giữ correlation ID.
- background worker: bước Chooser asset; không retry mutation mù.
- multi-tab browser: bước Session unauthenticated; không gửi secret sang browser.
- mobile browser: bước Legacy secret reject; test invariant sau request.
- edge runtime: bước Custom domain; xóa dữ liệu tạm sau xử lý.
- container runtime: bước Record result; kiểm tra cấu hình trước network.
- high latency network: bước Health; giữ credential ở server-side.
- provider 429: bước Discovery; dùng timeout hữu hạn.
- provider 5xx: bước Chooser asset; kiểm tra status trước parse JSON.
- secret rotation: bước Session unauthenticated; redact log.
- project revoke: bước Legacy secret reject; giữ correlation ID.
- device expiry: bước Custom domain; không retry mutation mù.
- profile update: bước Record result; không gửi secret sang browser.
- support diagnosis: bước Health; test invariant sau request.
- security review: bước Discovery; xóa dữ liệu tạm sau xử lý.
- privacy review: bước Chooser asset; kiểm tra cấu hình trước network.
- local: bước Session unauthenticated; giữ credential ở server-side.
- staging: bước Legacy secret reject; dùng timeout hữu hạn.
- production: bước Custom domain; kiểm tra status trước parse JSON.
- CI: bước Record result; redact log.
- server route: bước Health; giữ correlation ID.
- background worker: bước Discovery; không retry mutation mù.
- multi-tab browser: bước Chooser asset; không gửi secret sang browser.
- mobile browser: bước Session unauthenticated; test invariant sau request.
- edge runtime: bước Legacy secret reject; xóa dữ liệu tạm sau xử lý.
- container runtime: bước Custom domain; kiểm tra cấu hình trước network.
- high latency network: bước Record result; giữ credential ở server-side.
- provider 429: bước Health; dùng timeout hữu hạn.
- provider 5xx: bước Discovery; kiểm tra status trước parse JSON.
- secret rotation: bước Chooser asset; redact log.
- project revoke: bước Session unauthenticated; giữ correlation ID.
- device expiry: bước Legacy secret reject; không retry mutation mù.
- profile update: bước Custom domain; không gửi secret sang browser.
- support diagnosis: bước Record result; test invariant sau request.
- security review: bước Health; xóa dữ liệu tạm sau xử lý.
- privacy review: bước Discovery; kiểm tra cấu hình trước network.
## 137. Phương thức HTTP wrapper dùng chung

- local: HTTP wrapper phải tạo request bằng url object..
- staging: HTTP wrapper phải dùng urlsearchparams cho oauth query..
- production: HTTP wrapper phải dùng json.stringify cho token body..
- CI: HTTP wrapper phải set content-type application/json..
- server route: HTTP wrapper phải set authorization bearer đúng scheme..
- background worker: HTTP wrapper phải dùng abortcontroller hoặc context timeout..
- multi-tab browser: HTTP wrapper phải kiểm tra response.ok..
- mobile browser: HTTP wrapper phải đọc body một lần..
- edge runtime: HTTP wrapper phải không retry 400..
- container runtime: HTTP wrapper phải không retry 401..
- high latency network: HTTP wrapper phải retry query 429 có giới hạn..
- provider 429: HTTP wrapper phải retry query 5xx có giới hạn..
- provider 5xx: HTTP wrapper phải không retry code exchange khi unknown outcome..
- secret rotation: HTTP wrapper phải không gửi api key qua query..
- project revoke: HTTP wrapper phải không ghi request body..
- device expiry: HTTP wrapper phải không ghi response body..
- profile update: HTTP wrapper phải redact url callback..
- support diagnosis: HTTP wrapper phải redact cookie header..
- security review: HTTP wrapper phải redact authorization header..
- privacy review: HTTP wrapper phải trả typed error..
- local: HTTP wrapper phải gắn correlation id..
- staging: HTTP wrapper phải ghi latency..
- production: HTTP wrapper phải ghi status..
- CI: HTTP wrapper phải ghi endpoint name..
- server route: HTTP wrapper phải không ghi code..
- background worker: HTTP wrapper phải không ghi access token..
- multi-tab browser: HTTP wrapper phải không ghi profile đầy đủ nếu không cần..
- mobile browser: HTTP wrapper phải đóng response body ở runtime cần đóng..
- edge runtime: HTTP wrapper phải không dùng http production..
- container runtime: HTTP wrapper phải kiểm tra dns và tls..
- high latency network: HTTP wrapper phải test network timeout..
- provider 429: HTTP wrapper phải tạo request bằng url object..
- provider 5xx: HTTP wrapper phải dùng urlsearchparams cho oauth query..
- secret rotation: HTTP wrapper phải dùng json.stringify cho token body..
- project revoke: HTTP wrapper phải set content-type application/json..
- device expiry: HTTP wrapper phải set authorization bearer đúng scheme..
- profile update: HTTP wrapper phải dùng abortcontroller hoặc context timeout..
- support diagnosis: HTTP wrapper phải kiểm tra response.ok..
- security review: HTTP wrapper phải đọc body một lần..
- privacy review: HTTP wrapper phải không retry 400..
- local: HTTP wrapper phải không retry 401..
- staging: HTTP wrapper phải retry query 429 có giới hạn..
- production: HTTP wrapper phải retry query 5xx có giới hạn..
- CI: HTTP wrapper phải không retry code exchange khi unknown outcome..
- server route: HTTP wrapper phải không gửi api key qua query..
## 138. Phương thức config loader

- Đọc APIUYTIN_CLIENT_ID.
- Đọc APIUYTIN_API_KEY từ secret manager.
- Đọc APIUYTIN_REDIRECT_URI.
- Kiểm tra client ID không rỗng.
- Kiểm tra API key không rỗng ở backend.
- Kiểm tra redirect là HTTPS production.
- Không expose API key trong config public.
- Tách local, staging và production.
- Không fallback production key ở local.
- Không log config object.
- Không serialize config vào HTML.
- Không đưa key vào telemetry.
- Fail fast nếu thiếu biến bắt buộc.
- Gắn environment name vào metrics, không gắn secret.
- Test config loader bằng placeholder.
- Test config loader với biến thiếu.
- Test config loader với redirect HTTP.
- Test config loader với key whitespace.
- Trim cấu hình public an toàn.
- Không trim token đã ký trong runtime.
- Dùng secret manager native của platform.
- Rotate key không sửa client ID.
- Rotate key cập nhật secret manager.
- Deploy sau khi secret update.
- Smoke token sau deploy.
- Rollback nếu config mismatch.
- Tài liệu chỉ dùng placeholder.
- Review config khi đổi domain.
- Review config khi đổi project.
- Review config mỗi release.
## 139. Phương thức state store

- local: state store phải hỗ trợ thao tác create, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác read, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác compare, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác consume, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác expire, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác delete, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác audit, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác create, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác read, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác compare, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác consume, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác expire, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác delete, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác audit, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác create, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác read, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác compare, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác consume, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác expire, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác delete, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác audit, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác create, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác read, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác compare, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác consume, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác expire, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác delete, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác audit, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác create, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác read, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác compare, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác consume, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác expire, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác delete, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác audit, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác create, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác read, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác compare, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác consume, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác expire, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác delete, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác audit, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác create, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác read, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác compare, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác consume, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác expire, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác delete, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác audit, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác create, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác read, TTL, session binding và không lưu API key.
- device expiry: state store phải hỗ trợ thao tác compare, TTL, session binding và không lưu API key.
- local: state store phải hỗ trợ thao tác consume, TTL, session binding và không lưu API key.
- background worker: state store phải hỗ trợ thao tác expire, TTL, session binding và không lưu API key.
- high latency network: state store phải hỗ trợ thao tác delete, TTL, session binding và không lưu API key.
## 140. Phương thức session adapter

- local: session adapter thực hiện create local session; profile key dùng APIUYTIN id, không dùng Google subject.
- mobile browser: session adapter thực hiện regenerate session ID; profile key dùng APIUYTIN id, không dùng Google subject.
- project revoke: session adapter thực hiện set HttpOnly cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- staging: session adapter thực hiện set Secure cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- edge runtime: session adapter thực hiện set SameSite policy; profile key dùng APIUYTIN id, không dùng Google subject.
- device expiry: session adapter thực hiện refresh profile; profile key dùng APIUYTIN id, không dùng Google subject.
- production: session adapter thực hiện logout local session; profile key dùng APIUYTIN id, không dùng Google subject.
- container runtime: session adapter thực hiện create local session; profile key dùng APIUYTIN id, không dùng Google subject.
- profile update: session adapter thực hiện regenerate session ID; profile key dùng APIUYTIN id, không dùng Google subject.
- CI: session adapter thực hiện set HttpOnly cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- high latency network: session adapter thực hiện set Secure cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- support diagnosis: session adapter thực hiện set SameSite policy; profile key dùng APIUYTIN id, không dùng Google subject.
- server route: session adapter thực hiện refresh profile; profile key dùng APIUYTIN id, không dùng Google subject.
- provider 429: session adapter thực hiện logout local session; profile key dùng APIUYTIN id, không dùng Google subject.
- security review: session adapter thực hiện create local session; profile key dùng APIUYTIN id, không dùng Google subject.
- background worker: session adapter thực hiện regenerate session ID; profile key dùng APIUYTIN id, không dùng Google subject.
- provider 5xx: session adapter thực hiện set HttpOnly cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- privacy review: session adapter thực hiện set Secure cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- multi-tab browser: session adapter thực hiện set SameSite policy; profile key dùng APIUYTIN id, không dùng Google subject.
- secret rotation: session adapter thực hiện refresh profile; profile key dùng APIUYTIN id, không dùng Google subject.
- local: session adapter thực hiện logout local session; profile key dùng APIUYTIN id, không dùng Google subject.
- mobile browser: session adapter thực hiện create local session; profile key dùng APIUYTIN id, không dùng Google subject.
- project revoke: session adapter thực hiện regenerate session ID; profile key dùng APIUYTIN id, không dùng Google subject.
- staging: session adapter thực hiện set HttpOnly cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- edge runtime: session adapter thực hiện set Secure cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- device expiry: session adapter thực hiện set SameSite policy; profile key dùng APIUYTIN id, không dùng Google subject.
- production: session adapter thực hiện refresh profile; profile key dùng APIUYTIN id, không dùng Google subject.
- container runtime: session adapter thực hiện logout local session; profile key dùng APIUYTIN id, không dùng Google subject.
- profile update: session adapter thực hiện create local session; profile key dùng APIUYTIN id, không dùng Google subject.
- CI: session adapter thực hiện regenerate session ID; profile key dùng APIUYTIN id, không dùng Google subject.
- high latency network: session adapter thực hiện set HttpOnly cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- support diagnosis: session adapter thực hiện set Secure cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- server route: session adapter thực hiện set SameSite policy; profile key dùng APIUYTIN id, không dùng Google subject.
- provider 429: session adapter thực hiện refresh profile; profile key dùng APIUYTIN id, không dùng Google subject.
- security review: session adapter thực hiện logout local session; profile key dùng APIUYTIN id, không dùng Google subject.
- background worker: session adapter thực hiện create local session; profile key dùng APIUYTIN id, không dùng Google subject.
- provider 5xx: session adapter thực hiện regenerate session ID; profile key dùng APIUYTIN id, không dùng Google subject.
- privacy review: session adapter thực hiện set HttpOnly cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- multi-tab browser: session adapter thực hiện set Secure cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- secret rotation: session adapter thực hiện set SameSite policy; profile key dùng APIUYTIN id, không dùng Google subject.
- local: session adapter thực hiện refresh profile; profile key dùng APIUYTIN id, không dùng Google subject.
- mobile browser: session adapter thực hiện logout local session; profile key dùng APIUYTIN id, không dùng Google subject.
- project revoke: session adapter thực hiện create local session; profile key dùng APIUYTIN id, không dùng Google subject.
- staging: session adapter thực hiện regenerate session ID; profile key dùng APIUYTIN id, không dùng Google subject.
- edge runtime: session adapter thực hiện set HttpOnly cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- device expiry: session adapter thực hiện set Secure cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- production: session adapter thực hiện set SameSite policy; profile key dùng APIUYTIN id, không dùng Google subject.
- container runtime: session adapter thực hiện refresh profile; profile key dùng APIUYTIN id, không dùng Google subject.
- profile update: session adapter thực hiện logout local session; profile key dùng APIUYTIN id, không dùng Google subject.
- CI: session adapter thực hiện create local session; profile key dùng APIUYTIN id, không dùng Google subject.
- high latency network: session adapter thực hiện regenerate session ID; profile key dùng APIUYTIN id, không dùng Google subject.
- support diagnosis: session adapter thực hiện set HttpOnly cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- server route: session adapter thực hiện set Secure cookie; profile key dùng APIUYTIN id, không dùng Google subject.
- provider 429: session adapter thực hiện set SameSite policy; profile key dùng APIUYTIN id, không dùng Google subject.
- security review: session adapter thực hiện refresh profile; profile key dùng APIUYTIN id, không dùng Google subject.
## 141. Phương thức profile repository

- local: profile repository cần find by id; không lưu Google access token hoặc refresh token.
- container runtime: profile repository cần create by id; không lưu Google access token hoặc refresh token.
- security review: profile repository cần update safe fields; không lưu Google access token hoặc refresh token.
- mobile browser: profile repository cần preserve audit timestamps; không lưu Google access token hoặc refresh token.
- profile update: profile repository cần ignore unknown fields; không lưu Google access token hoặc refresh token.
- background worker: profile repository cần handle missing optional field; không lưu Google access token hoặc refresh token.
- project revoke: profile repository cần avoid email primary key; không lưu Google access token hoặc refresh token.
- CI: profile repository cần find by id; không lưu Google access token hoặc refresh token.
- provider 5xx: profile repository cần create by id; không lưu Google access token hoặc refresh token.
- staging: profile repository cần update safe fields; không lưu Google access token hoặc refresh token.
- high latency network: profile repository cần preserve audit timestamps; không lưu Google access token hoặc refresh token.
- privacy review: profile repository cần ignore unknown fields; không lưu Google access token hoặc refresh token.
- edge runtime: profile repository cần handle missing optional field; không lưu Google access token hoặc refresh token.
- support diagnosis: profile repository cần avoid email primary key; không lưu Google access token hoặc refresh token.
- multi-tab browser: profile repository cần find by id; không lưu Google access token hoặc refresh token.
- device expiry: profile repository cần create by id; không lưu Google access token hoặc refresh token.
- server route: profile repository cần update safe fields; không lưu Google access token hoặc refresh token.
- secret rotation: profile repository cần preserve audit timestamps; không lưu Google access token hoặc refresh token.
- production: profile repository cần ignore unknown fields; không lưu Google access token hoặc refresh token.
- provider 429: profile repository cần handle missing optional field; không lưu Google access token hoặc refresh token.
- local: profile repository cần avoid email primary key; không lưu Google access token hoặc refresh token.
- container runtime: profile repository cần find by id; không lưu Google access token hoặc refresh token.
- security review: profile repository cần create by id; không lưu Google access token hoặc refresh token.
- mobile browser: profile repository cần update safe fields; không lưu Google access token hoặc refresh token.
- profile update: profile repository cần preserve audit timestamps; không lưu Google access token hoặc refresh token.
- background worker: profile repository cần ignore unknown fields; không lưu Google access token hoặc refresh token.
- project revoke: profile repository cần handle missing optional field; không lưu Google access token hoặc refresh token.
- CI: profile repository cần avoid email primary key; không lưu Google access token hoặc refresh token.
- provider 5xx: profile repository cần find by id; không lưu Google access token hoặc refresh token.
- staging: profile repository cần create by id; không lưu Google access token hoặc refresh token.
- high latency network: profile repository cần update safe fields; không lưu Google access token hoặc refresh token.
- privacy review: profile repository cần preserve audit timestamps; không lưu Google access token hoặc refresh token.
- edge runtime: profile repository cần ignore unknown fields; không lưu Google access token hoặc refresh token.
- support diagnosis: profile repository cần handle missing optional field; không lưu Google access token hoặc refresh token.
- multi-tab browser: profile repository cần avoid email primary key; không lưu Google access token hoặc refresh token.
- device expiry: profile repository cần find by id; không lưu Google access token hoặc refresh token.
- server route: profile repository cần create by id; không lưu Google access token hoặc refresh token.
- secret rotation: profile repository cần update safe fields; không lưu Google access token hoặc refresh token.
- production: profile repository cần preserve audit timestamps; không lưu Google access token hoặc refresh token.
- provider 429: profile repository cần ignore unknown fields; không lưu Google access token hoặc refresh token.
- local: profile repository cần handle missing optional field; không lưu Google access token hoặc refresh token.
- container runtime: profile repository cần avoid email primary key; không lưu Google access token hoặc refresh token.
- security review: profile repository cần find by id; không lưu Google access token hoặc refresh token.
- mobile browser: profile repository cần create by id; không lưu Google access token hoặc refresh token.
- profile update: profile repository cần update safe fields; không lưu Google access token hoặc refresh token.
- background worker: profile repository cần preserve audit timestamps; không lưu Google access token hoặc refresh token.
- project revoke: profile repository cần ignore unknown fields; không lưu Google access token hoặc refresh token.
- CI: profile repository cần handle missing optional field; không lưu Google access token hoặc refresh token.
- provider 5xx: profile repository cần avoid email primary key; không lưu Google access token hoặc refresh token.
- staging: profile repository cần find by id; không lưu Google access token hoặc refresh token.
- high latency network: profile repository cần create by id; không lưu Google access token hoặc refresh token.
- privacy review: profile repository cần update safe fields; không lưu Google access token hoặc refresh token.
- edge runtime: profile repository cần preserve audit timestamps; không lưu Google access token hoặc refresh token.
- support diagnosis: profile repository cần ignore unknown fields; không lưu Google access token hoặc refresh token.
- multi-tab browser: profile repository cần handle missing optional field; không lưu Google access token hoặc refresh token.
## 142. Phương thức error mapper

- local: map HTTP 400 và invalid_json thành lỗi nội bộ an toàn; Sửa body hoặc bắt đầu flow mới.
- CI: map HTTP 400 và invalid_grant thành lỗi nội bộ an toàn; Không retry code; tạo OAuth request mới.
- multi-tab browser: map HTTP 401 và invalid_client thành lỗi nội bộ an toàn; Kiểm tra client ID, API key và redirect URI ở backend.
- container runtime: map HTTP 401 và unauthorized thành lỗi nội bộ an toàn; Kiểm tra dashboard cookie hoặc Bearer token.
- provider 5xx: map HTTP 401 và invalid_api_key thành lỗi nội bộ an toàn; Kiểm tra key đã rotate hoặc project đã revoke.
- device expiry: map HTTP 401 và token_expired thành lỗi nội bộ an toàn; Thực hiện login flow mới.
- security review: map HTTP 401 và project_revoked thành lỗi nội bộ an toàn; Kiểm tra owner và project environment.
- staging: map HTTP 403 và device_session_mismatch thành lỗi nội bộ an toàn; Bắt đầu lại flow trên đúng browser/device.
- server route: map HTTP 409 và selection_conflict thành lỗi nội bộ an toàn; Hiển thị retry login mới, không retry code cũ.
- mobile browser: map HTTP 5xx và internal_error thành lỗi nội bộ an toàn; Giữ correlation ID và retry theo policy.
- high latency network: map HTTP network và timeout thành lỗi nội bộ an toàn; Retry request an toàn, không retry mutation mù.
- secret rotation: map HTTP 400 và invalid_json thành lỗi nội bộ an toàn; Sửa body hoặc bắt đầu flow mới.
- profile update: map HTTP 400 và invalid_grant thành lỗi nội bộ an toàn; Không retry code; tạo OAuth request mới.
- privacy review: map HTTP 401 và invalid_client thành lỗi nội bộ an toàn; Kiểm tra client ID, API key và redirect URI ở backend.
- production: map HTTP 401 và unauthorized thành lỗi nội bộ an toàn; Kiểm tra dashboard cookie hoặc Bearer token.
- background worker: map HTTP 401 và invalid_api_key thành lỗi nội bộ an toàn; Kiểm tra key đã rotate hoặc project đã revoke.
- edge runtime: map HTTP 401 và token_expired thành lỗi nội bộ an toàn; Thực hiện login flow mới.
- provider 429: map HTTP 401 và project_revoked thành lỗi nội bộ an toàn; Kiểm tra owner và project environment.
- project revoke: map HTTP 403 và device_session_mismatch thành lỗi nội bộ an toàn; Bắt đầu lại flow trên đúng browser/device.
- support diagnosis: map HTTP 409 và selection_conflict thành lỗi nội bộ an toàn; Hiển thị retry login mới, không retry code cũ.
- local: map HTTP 5xx và internal_error thành lỗi nội bộ an toàn; Giữ correlation ID và retry theo policy.
- CI: map HTTP network và timeout thành lỗi nội bộ an toàn; Retry request an toàn, không retry mutation mù.
- multi-tab browser: map HTTP 400 và invalid_json thành lỗi nội bộ an toàn; Sửa body hoặc bắt đầu flow mới.
- container runtime: map HTTP 400 và invalid_grant thành lỗi nội bộ an toàn; Không retry code; tạo OAuth request mới.
- provider 5xx: map HTTP 401 và invalid_client thành lỗi nội bộ an toàn; Kiểm tra client ID, API key và redirect URI ở backend.
- device expiry: map HTTP 401 và unauthorized thành lỗi nội bộ an toàn; Kiểm tra dashboard cookie hoặc Bearer token.
- security review: map HTTP 401 và invalid_api_key thành lỗi nội bộ an toàn; Kiểm tra key đã rotate hoặc project đã revoke.
- staging: map HTTP 401 và token_expired thành lỗi nội bộ an toàn; Thực hiện login flow mới.
- server route: map HTTP 401 và project_revoked thành lỗi nội bộ an toàn; Kiểm tra owner và project environment.
- mobile browser: map HTTP 403 và device_session_mismatch thành lỗi nội bộ an toàn; Bắt đầu lại flow trên đúng browser/device.
- high latency network: map HTTP 409 và selection_conflict thành lỗi nội bộ an toàn; Hiển thị retry login mới, không retry code cũ.
- secret rotation: map HTTP 5xx và internal_error thành lỗi nội bộ an toàn; Giữ correlation ID và retry theo policy.
- profile update: map HTTP network và timeout thành lỗi nội bộ an toàn; Retry request an toàn, không retry mutation mù.
- privacy review: map HTTP 400 và invalid_json thành lỗi nội bộ an toàn; Sửa body hoặc bắt đầu flow mới.
- production: map HTTP 400 và invalid_grant thành lỗi nội bộ an toàn; Không retry code; tạo OAuth request mới.
- background worker: map HTTP 401 và invalid_client thành lỗi nội bộ an toàn; Kiểm tra client ID, API key và redirect URI ở backend.
- edge runtime: map HTTP 401 và unauthorized thành lỗi nội bộ an toàn; Kiểm tra dashboard cookie hoặc Bearer token.
- provider 429: map HTTP 401 và invalid_api_key thành lỗi nội bộ an toàn; Kiểm tra key đã rotate hoặc project đã revoke.
- project revoke: map HTTP 401 và token_expired thành lỗi nội bộ an toàn; Thực hiện login flow mới.
- support diagnosis: map HTTP 401 và project_revoked thành lỗi nội bộ an toàn; Kiểm tra owner và project environment.
- local: map HTTP 403 và device_session_mismatch thành lỗi nội bộ an toàn; Bắt đầu lại flow trên đúng browser/device.
- CI: map HTTP 409 và selection_conflict thành lỗi nội bộ an toàn; Hiển thị retry login mới, không retry code cũ.
- multi-tab browser: map HTTP 5xx và internal_error thành lỗi nội bộ an toàn; Giữ correlation ID và retry theo policy.
- container runtime: map HTTP network và timeout thành lỗi nội bộ an toàn; Retry request an toàn, không retry mutation mù.
- provider 5xx: map HTTP 400 và invalid_json thành lỗi nội bộ an toàn; Sửa body hoặc bắt đầu flow mới.
- device expiry: map HTTP 400 và invalid_grant thành lỗi nội bộ an toàn; Không retry code; tạo OAuth request mới.
- security review: map HTTP 401 và invalid_client thành lỗi nội bộ an toàn; Kiểm tra client ID, API key và redirect URI ở backend.
- staging: map HTTP 401 và unauthorized thành lỗi nội bộ an toàn; Kiểm tra dashboard cookie hoặc Bearer token.
- server route: map HTTP 401 và invalid_api_key thành lỗi nội bộ an toàn; Kiểm tra key đã rotate hoặc project đã revoke.
- mobile browser: map HTTP 401 và token_expired thành lỗi nội bộ an toàn; Thực hiện login flow mới.
- high latency network: map HTTP 401 và project_revoked thành lỗi nội bộ an toàn; Kiểm tra owner và project environment.
- secret rotation: map HTTP 403 và device_session_mismatch thành lỗi nội bộ an toàn; Bắt đầu lại flow trên đúng browser/device.
- profile update: map HTTP 409 và selection_conflict thành lỗi nội bộ an toàn; Hiển thị retry login mới, không retry code cũ.
- privacy review: map HTTP 5xx và internal_error thành lỗi nội bộ an toàn; Giữ correlation ID và retry theo policy.
- production: map HTTP network và timeout thành lỗi nội bộ an toàn; Retry request an toàn, không retry mutation mù.
- background worker: map HTTP 400 và invalid_json thành lỗi nội bộ an toàn; Sửa body hoặc bắt đầu flow mới.
- edge runtime: map HTTP 400 và invalid_grant thành lỗi nội bộ an toàn; Không retry code; tạo OAuth request mới.
- provider 429: map HTTP 401 và invalid_client thành lỗi nội bộ an toàn; Kiểm tra client ID, API key và redirect URI ở backend.
- project revoke: map HTTP 401 và unauthorized thành lỗi nội bộ an toàn; Kiểm tra dashboard cookie hoặc Bearer token.
- support diagnosis: map HTTP 401 và invalid_api_key thành lỗi nội bộ an toàn; Kiểm tra key đã rotate hoặc project đã revoke.
- local: map HTTP 401 và token_expired thành lỗi nội bộ an toàn; Thực hiện login flow mới.
- CI: map HTTP 401 và project_revoked thành lỗi nội bộ an toàn; Kiểm tra owner và project environment.
- multi-tab browser: map HTTP 403 và device_session_mismatch thành lỗi nội bộ an toàn; Bắt đầu lại flow trên đúng browser/device.
- container runtime: map HTTP 409 và selection_conflict thành lỗi nội bộ an toàn; Hiển thị retry login mới, không retry code cũ.
- provider 5xx: map HTTP 5xx và internal_error thành lỗi nội bộ an toàn; Giữ correlation ID và retry theo policy.
- device expiry: map HTTP network và timeout thành lỗi nội bộ an toàn; Retry request an toàn, không retry mutation mù.
- security review: map HTTP 400 và invalid_json thành lỗi nội bộ an toàn; Sửa body hoặc bắt đầu flow mới.
- staging: map HTTP 400 và invalid_grant thành lỗi nội bộ an toàn; Không retry code; tạo OAuth request mới.
- server route: map HTTP 401 và invalid_client thành lỗi nội bộ an toàn; Kiểm tra client ID, API key và redirect URI ở backend.
- mobile browser: map HTTP 401 và unauthorized thành lỗi nội bộ an toàn; Kiểm tra dashboard cookie hoặc Bearer token.
## 143. Phương thức authorization service

- local: authorization service xử lý start bằng transaction riêng, state riêng và callback exact.
- provider 429: authorization service xử lý cancel bằng transaction riêng, state riêng và callback exact.
- production: authorization service xử lý resume bằng transaction riêng, state riêng và callback exact.
- secret rotation: authorization service xử lý add account bằng transaction riêng, state riêng và callback exact.
- server route: authorization service xử lý select account bằng transaction riêng, state riêng và callback exact.
- device expiry: authorization service xử lý finish bằng transaction riêng, state riêng và callback exact.
- multi-tab browser: authorization service xử lý restart bằng transaction riêng, state riêng và callback exact.
- support diagnosis: authorization service xử lý start bằng transaction riêng, state riêng và callback exact.
- edge runtime: authorization service xử lý cancel bằng transaction riêng, state riêng và callback exact.
- privacy review: authorization service xử lý resume bằng transaction riêng, state riêng và callback exact.
- high latency network: authorization service xử lý add account bằng transaction riêng, state riêng và callback exact.
- staging: authorization service xử lý select account bằng transaction riêng, state riêng và callback exact.
- provider 5xx: authorization service xử lý finish bằng transaction riêng, state riêng và callback exact.
- CI: authorization service xử lý restart bằng transaction riêng, state riêng và callback exact.
- project revoke: authorization service xử lý start bằng transaction riêng, state riêng và callback exact.
- background worker: authorization service xử lý cancel bằng transaction riêng, state riêng và callback exact.
- profile update: authorization service xử lý resume bằng transaction riêng, state riêng và callback exact.
- mobile browser: authorization service xử lý add account bằng transaction riêng, state riêng và callback exact.
- security review: authorization service xử lý select account bằng transaction riêng, state riêng và callback exact.
- container runtime: authorization service xử lý finish bằng transaction riêng, state riêng và callback exact.
- local: authorization service xử lý restart bằng transaction riêng, state riêng và callback exact.
- provider 429: authorization service xử lý start bằng transaction riêng, state riêng và callback exact.
- production: authorization service xử lý cancel bằng transaction riêng, state riêng và callback exact.
- secret rotation: authorization service xử lý resume bằng transaction riêng, state riêng và callback exact.
- server route: authorization service xử lý add account bằng transaction riêng, state riêng và callback exact.
- device expiry: authorization service xử lý select account bằng transaction riêng, state riêng và callback exact.
- multi-tab browser: authorization service xử lý finish bằng transaction riêng, state riêng và callback exact.
- support diagnosis: authorization service xử lý restart bằng transaction riêng, state riêng và callback exact.
- edge runtime: authorization service xử lý start bằng transaction riêng, state riêng và callback exact.
- privacy review: authorization service xử lý cancel bằng transaction riêng, state riêng và callback exact.
- high latency network: authorization service xử lý resume bằng transaction riêng, state riêng và callback exact.
- staging: authorization service xử lý add account bằng transaction riêng, state riêng và callback exact.
- provider 5xx: authorization service xử lý select account bằng transaction riêng, state riêng và callback exact.
- CI: authorization service xử lý finish bằng transaction riêng, state riêng và callback exact.
- project revoke: authorization service xử lý restart bằng transaction riêng, state riêng và callback exact.
- background worker: authorization service xử lý start bằng transaction riêng, state riêng và callback exact.
- profile update: authorization service xử lý cancel bằng transaction riêng, state riêng và callback exact.
- mobile browser: authorization service xử lý resume bằng transaction riêng, state riêng và callback exact.
- security review: authorization service xử lý add account bằng transaction riêng, state riêng và callback exact.
- container runtime: authorization service xử lý select account bằng transaction riêng, state riêng và callback exact.
- local: authorization service xử lý finish bằng transaction riêng, state riêng và callback exact.
- provider 429: authorization service xử lý restart bằng transaction riêng, state riêng và callback exact.
- production: authorization service xử lý start bằng transaction riêng, state riêng và callback exact.
- secret rotation: authorization service xử lý cancel bằng transaction riêng, state riêng và callback exact.
- server route: authorization service xử lý resume bằng transaction riêng, state riêng và callback exact.
- device expiry: authorization service xử lý add account bằng transaction riêng, state riêng và callback exact.
- multi-tab browser: authorization service xử lý select account bằng transaction riêng, state riêng và callback exact.
- support diagnosis: authorization service xử lý finish bằng transaction riêng, state riêng và callback exact.
- edge runtime: authorization service xử lý restart bằng transaction riêng, state riêng và callback exact.
- privacy review: authorization service xử lý start bằng transaction riêng, state riêng và callback exact.
- high latency network: authorization service xử lý cancel bằng transaction riêng, state riêng và callback exact.
- staging: authorization service xử lý resume bằng transaction riêng, state riêng và callback exact.
- provider 5xx: authorization service xử lý add account bằng transaction riêng, state riêng và callback exact.
- CI: authorization service xử lý select account bằng transaction riêng, state riêng và callback exact.
- project revoke: authorization service xử lý finish bằng transaction riêng, state riêng và callback exact.
- background worker: authorization service xử lý restart bằng transaction riêng, state riêng và callback exact.
- profile update: authorization service xử lý start bằng transaction riêng, state riêng và callback exact.
- mobile browser: authorization service xử lý cancel bằng transaction riêng, state riêng và callback exact.
- security review: authorization service xử lý resume bằng transaction riêng, state riêng và callback exact.
- container runtime: authorization service xử lý add account bằng transaction riêng, state riêng và callback exact.
## 144. Phương thức token service

- local: token service thực hiện validate code; không nhận client_secret và không trả Google credential.
- secret rotation: token service thực hiện validate client; không nhận client_secret và không trả Google credential.
- multi-tab browser: token service thực hiện validate api key; không nhận client_secret và không trả Google credential.
- privacy review: token service thực hiện validate redirect; không nhận client_secret và không trả Google credential.
- provider 5xx: token service thực hiện consume code; không nhận client_secret và không trả Google credential.
- background worker: token service thực hiện map profile; không nhận client_secret và không trả Google credential.
- security review: token service thực hiện create app session; không nhận client_secret và không trả Google credential.
- provider 429: token service thực hiện validate code; không nhận client_secret và không trả Google credential.
- server route: token service thực hiện validate client; không nhận client_secret và không trả Google credential.
- support diagnosis: token service thực hiện validate api key; không nhận client_secret và không trả Google credential.
- high latency network: token service thực hiện validate redirect; không nhận client_secret và không trả Google credential.
- CI: token service thực hiện consume code; không nhận client_secret và không trả Google credential.
- profile update: token service thực hiện map profile; không nhận client_secret và không trả Google credential.
- container runtime: token service thực hiện create app session; không nhận client_secret và không trả Google credential.
- production: token service thực hiện validate code; không nhận client_secret và không trả Google credential.
- device expiry: token service thực hiện validate client; không nhận client_secret và không trả Google credential.
- edge runtime: token service thực hiện validate api key; không nhận client_secret và không trả Google credential.
- staging: token service thực hiện validate redirect; không nhận client_secret và không trả Google credential.
- project revoke: token service thực hiện consume code; không nhận client_secret và không trả Google credential.
- mobile browser: token service thực hiện map profile; không nhận client_secret và không trả Google credential.
- local: token service thực hiện create app session; không nhận client_secret và không trả Google credential.
- secret rotation: token service thực hiện validate code; không nhận client_secret và không trả Google credential.
- multi-tab browser: token service thực hiện validate client; không nhận client_secret và không trả Google credential.
- privacy review: token service thực hiện validate api key; không nhận client_secret và không trả Google credential.
- provider 5xx: token service thực hiện validate redirect; không nhận client_secret và không trả Google credential.
- background worker: token service thực hiện consume code; không nhận client_secret và không trả Google credential.
- security review: token service thực hiện map profile; không nhận client_secret và không trả Google credential.
- provider 429: token service thực hiện create app session; không nhận client_secret và không trả Google credential.
- server route: token service thực hiện validate code; không nhận client_secret và không trả Google credential.
- support diagnosis: token service thực hiện validate client; không nhận client_secret và không trả Google credential.
- high latency network: token service thực hiện validate api key; không nhận client_secret và không trả Google credential.
- CI: token service thực hiện validate redirect; không nhận client_secret và không trả Google credential.
- profile update: token service thực hiện consume code; không nhận client_secret và không trả Google credential.
- container runtime: token service thực hiện map profile; không nhận client_secret và không trả Google credential.
- production: token service thực hiện create app session; không nhận client_secret và không trả Google credential.
- device expiry: token service thực hiện validate code; không nhận client_secret và không trả Google credential.
- edge runtime: token service thực hiện validate client; không nhận client_secret và không trả Google credential.
- staging: token service thực hiện validate api key; không nhận client_secret và không trả Google credential.
- project revoke: token service thực hiện validate redirect; không nhận client_secret và không trả Google credential.
- mobile browser: token service thực hiện consume code; không nhận client_secret và không trả Google credential.
- local: token service thực hiện map profile; không nhận client_secret và không trả Google credential.
- secret rotation: token service thực hiện create app session; không nhận client_secret và không trả Google credential.
- multi-tab browser: token service thực hiện validate code; không nhận client_secret và không trả Google credential.
- privacy review: token service thực hiện validate client; không nhận client_secret và không trả Google credential.
- provider 5xx: token service thực hiện validate api key; không nhận client_secret và không trả Google credential.
- background worker: token service thực hiện validate redirect; không nhận client_secret và không trả Google credential.
- security review: token service thực hiện consume code; không nhận client_secret và không trả Google credential.
- provider 429: token service thực hiện map profile; không nhận client_secret và không trả Google credential.
- server route: token service thực hiện create app session; không nhận client_secret và không trả Google credential.
- support diagnosis: token service thực hiện validate code; không nhận client_secret và không trả Google credential.
- high latency network: token service thực hiện validate client; không nhận client_secret và không trả Google credential.
- CI: token service thực hiện validate api key; không nhận client_secret và không trả Google credential.
- profile update: token service thực hiện validate redirect; không nhận client_secret và không trả Google credential.
- container runtime: token service thực hiện consume code; không nhận client_secret và không trả Google credential.
- production: token service thực hiện map profile; không nhận client_secret và không trả Google credential.
- device expiry: token service thực hiện create app session; không nhận client_secret và không trả Google credential.
- edge runtime: token service thực hiện validate code; không nhận client_secret và không trả Google credential.
- staging: token service thực hiện validate client; không nhận client_secret và không trả Google credential.
- project revoke: token service thực hiện validate api key; không nhận client_secret và không trả Google credential.
- mobile browser: token service thực hiện validate redirect; không nhận client_secret và không trả Google credential.
## 145. Phương thức project API service

- local: project API service thực hiện read project info bằng Bearer API key server-side và redact response nhạy cảm.
- support diagnosis: project API service thực hiện read all users bằng Bearer API key server-side và redact response nhạy cảm.
- project revoke: project API service thực hiện check key bằng Bearer API key server-side và redact response nhạy cảm.
- provider 429: project API service thực hiện check active status bằng Bearer API key server-side và redact response nhạy cảm.
- edge runtime: project API service thực hiện handle rotation bằng Bearer API key server-side và redact response nhạy cảm.
- background worker: project API service thực hiện handle revoke bằng Bearer API key server-side và redact response nhạy cảm.
- production: project API service thực hiện audit call bằng Bearer API key server-side và redact response nhạy cảm.
- privacy review: project API service thực hiện read project info bằng Bearer API key server-side và redact response nhạy cảm.
- profile update: project API service thực hiện read all users bằng Bearer API key server-side và redact response nhạy cảm.
- secret rotation: project API service thực hiện check key bằng Bearer API key server-side và redact response nhạy cảm.
- high latency network: project API service thực hiện check active status bằng Bearer API key server-side và redact response nhạy cảm.
- mobile browser: project API service thực hiện handle rotation bằng Bearer API key server-side và redact response nhạy cảm.
- server route: project API service thực hiện handle revoke bằng Bearer API key server-side và redact response nhạy cảm.
- staging: project API service thực hiện audit call bằng Bearer API key server-side và redact response nhạy cảm.
- security review: project API service thực hiện read project info bằng Bearer API key server-side và redact response nhạy cảm.
- device expiry: project API service thực hiện read all users bằng Bearer API key server-side và redact response nhạy cảm.
- provider 5xx: project API service thực hiện check key bằng Bearer API key server-side và redact response nhạy cảm.
- container runtime: project API service thực hiện check active status bằng Bearer API key server-side và redact response nhạy cảm.
- multi-tab browser: project API service thực hiện handle rotation bằng Bearer API key server-side và redact response nhạy cảm.
- CI: project API service thực hiện handle revoke bằng Bearer API key server-side và redact response nhạy cảm.
- local: project API service thực hiện audit call bằng Bearer API key server-side và redact response nhạy cảm.
- support diagnosis: project API service thực hiện read project info bằng Bearer API key server-side và redact response nhạy cảm.
- project revoke: project API service thực hiện read all users bằng Bearer API key server-side và redact response nhạy cảm.
- provider 429: project API service thực hiện check key bằng Bearer API key server-side và redact response nhạy cảm.
- edge runtime: project API service thực hiện check active status bằng Bearer API key server-side và redact response nhạy cảm.
- background worker: project API service thực hiện handle rotation bằng Bearer API key server-side và redact response nhạy cảm.
- production: project API service thực hiện handle revoke bằng Bearer API key server-side và redact response nhạy cảm.
- privacy review: project API service thực hiện audit call bằng Bearer API key server-side và redact response nhạy cảm.
- profile update: project API service thực hiện read project info bằng Bearer API key server-side và redact response nhạy cảm.
- secret rotation: project API service thực hiện read all users bằng Bearer API key server-side và redact response nhạy cảm.
- high latency network: project API service thực hiện check key bằng Bearer API key server-side và redact response nhạy cảm.
- mobile browser: project API service thực hiện check active status bằng Bearer API key server-side và redact response nhạy cảm.
- server route: project API service thực hiện handle rotation bằng Bearer API key server-side và redact response nhạy cảm.
- staging: project API service thực hiện handle revoke bằng Bearer API key server-side và redact response nhạy cảm.
- security review: project API service thực hiện audit call bằng Bearer API key server-side và redact response nhạy cảm.
- device expiry: project API service thực hiện read project info bằng Bearer API key server-side và redact response nhạy cảm.
- provider 5xx: project API service thực hiện read all users bằng Bearer API key server-side và redact response nhạy cảm.
- container runtime: project API service thực hiện check key bằng Bearer API key server-side và redact response nhạy cảm.
- multi-tab browser: project API service thực hiện check active status bằng Bearer API key server-side và redact response nhạy cảm.
- CI: project API service thực hiện handle rotation bằng Bearer API key server-side và redact response nhạy cảm.
- local: project API service thực hiện handle revoke bằng Bearer API key server-side và redact response nhạy cảm.
- support diagnosis: project API service thực hiện audit call bằng Bearer API key server-side và redact response nhạy cảm.
- project revoke: project API service thực hiện read project info bằng Bearer API key server-side và redact response nhạy cảm.
- provider 429: project API service thực hiện read all users bằng Bearer API key server-side và redact response nhạy cảm.
- edge runtime: project API service thực hiện check key bằng Bearer API key server-side và redact response nhạy cảm.
- background worker: project API service thực hiện check active status bằng Bearer API key server-side và redact response nhạy cảm.
- production: project API service thực hiện handle rotation bằng Bearer API key server-side và redact response nhạy cảm.
- privacy review: project API service thực hiện handle revoke bằng Bearer API key server-side và redact response nhạy cảm.
- profile update: project API service thực hiện audit call bằng Bearer API key server-side và redact response nhạy cảm.
- secret rotation: project API service thực hiện read project info bằng Bearer API key server-side và redact response nhạy cảm.
- high latency network: project API service thực hiện read all users bằng Bearer API key server-side và redact response nhạy cảm.
- mobile browser: project API service thực hiện check key bằng Bearer API key server-side và redact response nhạy cảm.
- server route: project API service thực hiện check active status bằng Bearer API key server-side và redact response nhạy cảm.
- staging: project API service thực hiện handle rotation bằng Bearer API key server-side và redact response nhạy cảm.
- security review: project API service thực hiện handle revoke bằng Bearer API key server-side và redact response nhạy cảm.
- device expiry: project API service thực hiện audit call bằng Bearer API key server-side và redact response nhạy cảm.
- provider 5xx: project API service thực hiện read project info bằng Bearer API key server-side và redact response nhạy cảm.
- container runtime: project API service thực hiện read all users bằng Bearer API key server-side và redact response nhạy cảm.
- multi-tab browser: project API service thực hiện check key bằng Bearer API key server-side và redact response nhạy cảm.
- CI: project API service thực hiện check active status bằng Bearer API key server-side và redact response nhạy cảm.
## 146. Phương thức SDK facade

- local: SDK facade method loginUrl phải có input validation, timeout, typed result, redacted logging và contract test.
- privacy review: SDK facade method callback phải có input validation, timeout, typed result, redacted logging và contract test.
- security review: SDK facade method exchangeCode phải có input validation, timeout, typed result, redacted logging và contract test.
- support diagnosis: SDK facade method userinfo phải có input validation, timeout, typed result, redacted logging và contract test.
- profile update: SDK facade method projectInfo phải có input validation, timeout, typed result, redacted logging và contract test.
- device expiry: SDK facade method allUsers phải có input validation, timeout, typed result, redacted logging và contract test.
- project revoke: SDK facade method normalizeError phải có input validation, timeout, typed result, redacted logging và contract test.
- secret rotation: SDK facade method isRetryable phải có input validation, timeout, typed result, redacted logging và contract test.
- provider 5xx: SDK facade method createSession phải có input validation, timeout, typed result, redacted logging và contract test.
- provider 429: SDK facade method logout phải có input validation, timeout, typed result, redacted logging và contract test.
- high latency network: SDK facade method health phải có input validation, timeout, typed result, redacted logging và contract test.
- container runtime: SDK facade method discovery phải có input validation, timeout, typed result, redacted logging và contract test.
- edge runtime: SDK facade method loginUrl phải có input validation, timeout, typed result, redacted logging và contract test.
- mobile browser: SDK facade method callback phải có input validation, timeout, typed result, redacted logging và contract test.
- multi-tab browser: SDK facade method exchangeCode phải có input validation, timeout, typed result, redacted logging và contract test.
- background worker: SDK facade method userinfo phải có input validation, timeout, typed result, redacted logging và contract test.
- server route: SDK facade method projectInfo phải có input validation, timeout, typed result, redacted logging và contract test.
- CI: SDK facade method allUsers phải có input validation, timeout, typed result, redacted logging và contract test.
- production: SDK facade method normalizeError phải có input validation, timeout, typed result, redacted logging và contract test.
- staging: SDK facade method isRetryable phải có input validation, timeout, typed result, redacted logging và contract test.
- local: SDK facade method createSession phải có input validation, timeout, typed result, redacted logging và contract test.
- privacy review: SDK facade method logout phải có input validation, timeout, typed result, redacted logging và contract test.
- security review: SDK facade method health phải có input validation, timeout, typed result, redacted logging và contract test.
- support diagnosis: SDK facade method discovery phải có input validation, timeout, typed result, redacted logging và contract test.
- profile update: SDK facade method loginUrl phải có input validation, timeout, typed result, redacted logging và contract test.
- device expiry: SDK facade method callback phải có input validation, timeout, typed result, redacted logging và contract test.
- project revoke: SDK facade method exchangeCode phải có input validation, timeout, typed result, redacted logging và contract test.
- secret rotation: SDK facade method userinfo phải có input validation, timeout, typed result, redacted logging và contract test.
- provider 5xx: SDK facade method projectInfo phải có input validation, timeout, typed result, redacted logging và contract test.
- provider 429: SDK facade method allUsers phải có input validation, timeout, typed result, redacted logging và contract test.
- high latency network: SDK facade method normalizeError phải có input validation, timeout, typed result, redacted logging và contract test.
- container runtime: SDK facade method isRetryable phải có input validation, timeout, typed result, redacted logging và contract test.
- edge runtime: SDK facade method createSession phải có input validation, timeout, typed result, redacted logging và contract test.
- mobile browser: SDK facade method logout phải có input validation, timeout, typed result, redacted logging và contract test.
- multi-tab browser: SDK facade method health phải có input validation, timeout, typed result, redacted logging và contract test.
- background worker: SDK facade method discovery phải có input validation, timeout, typed result, redacted logging và contract test.
- server route: SDK facade method loginUrl phải có input validation, timeout, typed result, redacted logging và contract test.
- CI: SDK facade method callback phải có input validation, timeout, typed result, redacted logging và contract test.
- production: SDK facade method exchangeCode phải có input validation, timeout, typed result, redacted logging và contract test.
- staging: SDK facade method userinfo phải có input validation, timeout, typed result, redacted logging và contract test.
- local: SDK facade method projectInfo phải có input validation, timeout, typed result, redacted logging và contract test.
- privacy review: SDK facade method allUsers phải có input validation, timeout, typed result, redacted logging và contract test.
- security review: SDK facade method normalizeError phải có input validation, timeout, typed result, redacted logging và contract test.
- support diagnosis: SDK facade method isRetryable phải có input validation, timeout, typed result, redacted logging và contract test.
- profile update: SDK facade method createSession phải có input validation, timeout, typed result, redacted logging và contract test.
- device expiry: SDK facade method logout phải có input validation, timeout, typed result, redacted logging và contract test.
- project revoke: SDK facade method health phải có input validation, timeout, typed result, redacted logging và contract test.
- secret rotation: SDK facade method discovery phải có input validation, timeout, typed result, redacted logging và contract test.
- provider 5xx: SDK facade method loginUrl phải có input validation, timeout, typed result, redacted logging và contract test.
- provider 429: SDK facade method callback phải có input validation, timeout, typed result, redacted logging và contract test.
- high latency network: SDK facade method exchangeCode phải có input validation, timeout, typed result, redacted logging và contract test.
- container runtime: SDK facade method userinfo phải có input validation, timeout, typed result, redacted logging và contract test.
- edge runtime: SDK facade method projectInfo phải có input validation, timeout, typed result, redacted logging và contract test.
- mobile browser: SDK facade method allUsers phải có input validation, timeout, typed result, redacted logging và contract test.
- multi-tab browser: SDK facade method normalizeError phải có input validation, timeout, typed result, redacted logging và contract test.
- background worker: SDK facade method isRetryable phải có input validation, timeout, typed result, redacted logging và contract test.
- server route: SDK facade method createSession phải có input validation, timeout, typed result, redacted logging và contract test.
- CI: SDK facade method logout phải có input validation, timeout, typed result, redacted logging và contract test.
- production: SDK facade method health phải có input validation, timeout, typed result, redacted logging và contract test.
- staging: SDK facade method discovery phải có input validation, timeout, typed result, redacted logging và contract test.
- local: SDK facade method loginUrl phải có input validation, timeout, typed result, redacted logging và contract test.
- privacy review: SDK facade method callback phải có input validation, timeout, typed result, redacted logging và contract test.
- security review: SDK facade method exchangeCode phải có input validation, timeout, typed result, redacted logging và contract test.
- support diagnosis: SDK facade method userinfo phải có input validation, timeout, typed result, redacted logging và contract test.
- profile update: SDK facade method projectInfo phải có input validation, timeout, typed result, redacted logging và contract test.
- device expiry: SDK facade method allUsers phải có input validation, timeout, typed result, redacted logging và contract test.
- project revoke: SDK facade method normalizeError phải có input validation, timeout, typed result, redacted logging và contract test.
- secret rotation: SDK facade method isRetryable phải có input validation, timeout, typed result, redacted logging và contract test.
- provider 5xx: SDK facade method createSession phải có input validation, timeout, typed result, redacted logging và contract test.
- provider 429: SDK facade method logout phải có input validation, timeout, typed result, redacted logging và contract test.
## 147. Ví dụ SDK facade Node.js

```js
export class ApiuytinClient {
  constructor(config) {
    this.clientId = config.clientId;
    this.apiKey = config.apiKey;
    this.redirectUri = config.redirectUri;
    this.baseUrl = config.baseUrl ?? 'https://apiuytin.pages.dev/api/auth';
  }
  buildLoginUrl(state) {
    const url = new URL('https://apiuytin.pages.dev/oauth/google');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  }
  async exchangeCode(code, signal) {
    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: this.clientId, api_key: this.apiKey, code, redirect_uri: this.redirectUri }),
      signal
    });
    if (!response.ok) throw new Error('APIUYTIN token exchange failed');
    return response.json();
  }
}
```

- Constructor không được log config.
- Constructor không được gửi network.
- apiKey chỉ được truyền ở backend.
- buildLoginUrl không đưa apiKey vào URL.
- exchangeCode chỉ nhận code từ callback backend.
- exchangeCode phải có timeout.
- exchangeCode không retry invalid_grant.
- exchangeCode validate response user.id.
- Facade nên expose typed error.
- Facade nên redact request.
## 148. Ví dụ SDK facade Python

```js
class ApiuytinClient:
    def __init__(self, client_id, api_key, redirect_uri, base_url=DEFAULT_BASE):
        self.client_id = client_id
        self.api_key = api_key
        self.redirect_uri = redirect_uri
        self.base_url = base_url

    def login_url(self, state):
        params = {'client_id': self.client_id, 'redirect_uri': self.redirect_uri, 'state': state}
        return str(httpx.URL('https://apiuytin.pages.dev/oauth/google', params=params))

    async def exchange_code(self, code):
        payload = {'client_id': self.client_id, 'api_key': self.api_key, 'code': code, 'redirect_uri': self.redirect_uri}
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(f'{self.base_url}/oauth/token', json=payload)
        response.raise_for_status()
        return response.json()
```

- Không đưa api_key vào client-side Python code nếu chạy trong browser-like runtime.
- Dùng environment secret cho api_key.
- Dùng session state cho state.
- Dùng timeout.
- Map HTTPStatusError.
- Không retry invalid_grant.
- Kiểm tra user.id.
- Không lưu raw response log.
- Gắn correlation ID.
- Test adapter bằng mock transport.
## 149. Ví dụ SDK facade Go

```js
type Client struct {
    ClientID string
    APIKey string
    RedirectURI string
    BaseURL string
}

func (c Client) LoginURL(state string) string {
    u, _ := url.Parse('https://apiuytin.pages.dev/oauth/google')
    q := u.Query()
    q.Set('client_id', c.ClientID)
    q.Set('redirect_uri', c.RedirectURI)
    q.Set('state', state)
    u.RawQuery = q.Encode()
    return u.String()
}

func (c Client) ExchangeCode(ctx context.Context, code string) (*TokenResponse, error) {
    payload := map[string]string{'client_id': c.ClientID, 'api_key': c.APIKey, 'code': code, 'redirect_uri': c.RedirectURI}
    return postToken(ctx, c.BaseURL+'/oauth/token', payload)
}
```

- Dùng context timeout.
- Dùng crypto/rand state.
- Không dùng math/rand state.
- Không log payload.
- Kiểm tra response status.
- Đóng body.
- Map invalid_grant.
- Map invalid_client.
- Kiểm tra user.id.
- Test bằng httptest server.
## 150. Ví dụ SDK facade PHP

```js
final class ApiuytinClient {
    public function __construct(private array $config) {}

    public function loginUrl(string $state): string {
        return 'https://apiuytin.pages.dev/oauth/google?'.http_build_query([
            'client_id' => $this->config['client_id'],
            'redirect_uri' => $this->config['redirect_uri'],
            'state' => $state,
        ]);
    }

    public function exchange(string $code): array {
        return Http::timeout(10)->post($this->config['base_url'].'/oauth/token', [
            'client_id' => $this->config['client_id'],
            'api_key' => $this->config['api_key'],
            'code' => $code,
            'redirect_uri' => $this->config['redirect_uri'],
        ])->throw()->json();
    }
}
```

- Config api_key phải nằm trong server environment.
- Không đưa config vào Blade.
- Session state phải có TTL.
- Http client phải có timeout.
- Map RequestException.
- Không retry code mù.
- Kiểm tra profile.
- Xóa state sau callback.
- Không ghi response.
- Test adapter bằng fake HTTP.
## 151. Phương thức test adapter

- local: chạy test testLoginUrlHasClientId và kiểm tra status, body, side effect, log redaction và cleanup.
- CI: chạy test testLoginUrlHasExactRedirect và kiểm tra status, body, side effect, log redaction và cleanup.
- multi-tab browser: chạy test testLoginUrlHasState và kiểm tra status, body, side effect, log redaction và cleanup.
- container runtime: chạy test testLoginUrlDoesNotHaveApiKey và kiểm tra status, body, side effect, log redaction và cleanup.
- provider 5xx: chạy test testCallbackRejectsMissingState và kiểm tra status, body, side effect, log redaction và cleanup.
- device expiry: chạy test testCallbackRejectsMismatchedState và kiểm tra status, body, side effect, log redaction và cleanup.
- security review: chạy test testCallbackHandlesAccessDenied và kiểm tra status, body, side effect, log redaction và cleanup.
- staging: chạy test testTokenPayloadUsesApiKey và kiểm tra status, body, side effect, log redaction và cleanup.
- server route: chạy test testTokenPayloadRejectsClientSecret và kiểm tra status, body, side effect, log redaction và cleanup.
- mobile browser: chạy test testTokenMapsApiuytinProfile và kiểm tra status, body, side effect, log redaction và cleanup.
- high latency network: chạy test testUserinfoUsesBearer và kiểm tra status, body, side effect, log redaction và cleanup.
- secret rotation: chạy test testProjectInfoDoesNotExposeKey và kiểm tra status, body, side effect, log redaction và cleanup.
- profile update: chạy test testRotateRequiresOwner và kiểm tra status, body, side effect, log redaction và cleanup.
- privacy review: chạy test testReplayIsRejected và kiểm tra status, body, side effect, log redaction và cleanup.
- production: chạy test testInvalidClientIsNotRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- background worker: chạy test testTransientQueryIsRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- edge runtime: chạy test testMutationIsNotBlindlyRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- provider 429: chạy test testProfileDoesNotExposeGoogleSubject và kiểm tra status, body, side effect, log redaction và cleanup.
- project revoke: chạy test testApiKeyNeverReachesBrowser và kiểm tra status, body, side effect, log redaction và cleanup.
- support diagnosis: chạy test testLogsRedactCredentials và kiểm tra status, body, side effect, log redaction và cleanup.
- local: chạy test testLoginUrlHasClientId và kiểm tra status, body, side effect, log redaction và cleanup.
- CI: chạy test testLoginUrlHasExactRedirect và kiểm tra status, body, side effect, log redaction và cleanup.
- multi-tab browser: chạy test testLoginUrlHasState và kiểm tra status, body, side effect, log redaction và cleanup.
- container runtime: chạy test testLoginUrlDoesNotHaveApiKey và kiểm tra status, body, side effect, log redaction và cleanup.
- provider 5xx: chạy test testCallbackRejectsMissingState và kiểm tra status, body, side effect, log redaction và cleanup.
- device expiry: chạy test testCallbackRejectsMismatchedState và kiểm tra status, body, side effect, log redaction và cleanup.
- security review: chạy test testCallbackHandlesAccessDenied và kiểm tra status, body, side effect, log redaction và cleanup.
- staging: chạy test testTokenPayloadUsesApiKey và kiểm tra status, body, side effect, log redaction và cleanup.
- server route: chạy test testTokenPayloadRejectsClientSecret và kiểm tra status, body, side effect, log redaction và cleanup.
- mobile browser: chạy test testTokenMapsApiuytinProfile và kiểm tra status, body, side effect, log redaction và cleanup.
- high latency network: chạy test testUserinfoUsesBearer và kiểm tra status, body, side effect, log redaction và cleanup.
- secret rotation: chạy test testProjectInfoDoesNotExposeKey và kiểm tra status, body, side effect, log redaction và cleanup.
- profile update: chạy test testRotateRequiresOwner và kiểm tra status, body, side effect, log redaction và cleanup.
- privacy review: chạy test testReplayIsRejected và kiểm tra status, body, side effect, log redaction và cleanup.
- production: chạy test testInvalidClientIsNotRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- background worker: chạy test testTransientQueryIsRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- edge runtime: chạy test testMutationIsNotBlindlyRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- provider 429: chạy test testProfileDoesNotExposeGoogleSubject và kiểm tra status, body, side effect, log redaction và cleanup.
- project revoke: chạy test testApiKeyNeverReachesBrowser và kiểm tra status, body, side effect, log redaction và cleanup.
- support diagnosis: chạy test testLogsRedactCredentials và kiểm tra status, body, side effect, log redaction và cleanup.
- local: chạy test testLoginUrlHasClientId và kiểm tra status, body, side effect, log redaction và cleanup.
- CI: chạy test testLoginUrlHasExactRedirect và kiểm tra status, body, side effect, log redaction và cleanup.
- multi-tab browser: chạy test testLoginUrlHasState và kiểm tra status, body, side effect, log redaction và cleanup.
- container runtime: chạy test testLoginUrlDoesNotHaveApiKey và kiểm tra status, body, side effect, log redaction và cleanup.
- provider 5xx: chạy test testCallbackRejectsMissingState và kiểm tra status, body, side effect, log redaction và cleanup.
- device expiry: chạy test testCallbackRejectsMismatchedState và kiểm tra status, body, side effect, log redaction và cleanup.
- security review: chạy test testCallbackHandlesAccessDenied và kiểm tra status, body, side effect, log redaction và cleanup.
- staging: chạy test testTokenPayloadUsesApiKey và kiểm tra status, body, side effect, log redaction và cleanup.
- server route: chạy test testTokenPayloadRejectsClientSecret và kiểm tra status, body, side effect, log redaction và cleanup.
- mobile browser: chạy test testTokenMapsApiuytinProfile và kiểm tra status, body, side effect, log redaction và cleanup.
- high latency network: chạy test testUserinfoUsesBearer và kiểm tra status, body, side effect, log redaction và cleanup.
- secret rotation: chạy test testProjectInfoDoesNotExposeKey và kiểm tra status, body, side effect, log redaction và cleanup.
- profile update: chạy test testRotateRequiresOwner và kiểm tra status, body, side effect, log redaction và cleanup.
- privacy review: chạy test testReplayIsRejected và kiểm tra status, body, side effect, log redaction và cleanup.
- production: chạy test testInvalidClientIsNotRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- background worker: chạy test testTransientQueryIsRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- edge runtime: chạy test testMutationIsNotBlindlyRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- provider 429: chạy test testProfileDoesNotExposeGoogleSubject và kiểm tra status, body, side effect, log redaction và cleanup.
- project revoke: chạy test testApiKeyNeverReachesBrowser và kiểm tra status, body, side effect, log redaction và cleanup.
- support diagnosis: chạy test testLogsRedactCredentials và kiểm tra status, body, side effect, log redaction và cleanup.
- local: chạy test testLoginUrlHasClientId và kiểm tra status, body, side effect, log redaction và cleanup.
- CI: chạy test testLoginUrlHasExactRedirect và kiểm tra status, body, side effect, log redaction và cleanup.
- multi-tab browser: chạy test testLoginUrlHasState và kiểm tra status, body, side effect, log redaction và cleanup.
- container runtime: chạy test testLoginUrlDoesNotHaveApiKey và kiểm tra status, body, side effect, log redaction và cleanup.
- provider 5xx: chạy test testCallbackRejectsMissingState và kiểm tra status, body, side effect, log redaction và cleanup.
- device expiry: chạy test testCallbackRejectsMismatchedState và kiểm tra status, body, side effect, log redaction và cleanup.
- security review: chạy test testCallbackHandlesAccessDenied và kiểm tra status, body, side effect, log redaction và cleanup.
- staging: chạy test testTokenPayloadUsesApiKey và kiểm tra status, body, side effect, log redaction và cleanup.
- server route: chạy test testTokenPayloadRejectsClientSecret và kiểm tra status, body, side effect, log redaction và cleanup.
- mobile browser: chạy test testTokenMapsApiuytinProfile và kiểm tra status, body, side effect, log redaction và cleanup.
- high latency network: chạy test testUserinfoUsesBearer và kiểm tra status, body, side effect, log redaction và cleanup.
- secret rotation: chạy test testProjectInfoDoesNotExposeKey và kiểm tra status, body, side effect, log redaction và cleanup.
- profile update: chạy test testRotateRequiresOwner và kiểm tra status, body, side effect, log redaction và cleanup.
- privacy review: chạy test testReplayIsRejected và kiểm tra status, body, side effect, log redaction và cleanup.
- production: chạy test testInvalidClientIsNotRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- background worker: chạy test testTransientQueryIsRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- edge runtime: chạy test testMutationIsNotBlindlyRetried và kiểm tra status, body, side effect, log redaction và cleanup.
- provider 429: chạy test testProfileDoesNotExposeGoogleSubject và kiểm tra status, body, side effect, log redaction và cleanup.
- project revoke: chạy test testApiKeyNeverReachesBrowser và kiểm tra status, body, side effect, log redaction và cleanup.
- support diagnosis: chạy test testLogsRedactCredentials và kiểm tra status, body, side effect, log redaction và cleanup.
## 152. Phương thức kiểm thử tải cao cho bên thứ ba

- local: loadOAuthStart phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- container runtime: loadConsentCallback phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- security review: loadTokenExchange phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- mobile browser: loadUserinfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- profile update: loadProjectInfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- background worker: loadAllUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- project revoke: loadConcurrentStates phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- CI: loadConcurrentTabs phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- provider 5xx: loadConcurrentUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- staging: loadRetryPaths phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- high latency network: loadRotationGuard phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- privacy review: loadRevokeCleanup phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- edge runtime: loadOAuthStart phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- support diagnosis: loadConsentCallback phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- multi-tab browser: loadTokenExchange phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- device expiry: loadUserinfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- server route: loadProjectInfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- secret rotation: loadAllUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- production: loadConcurrentStates phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- provider 429: loadConcurrentTabs phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- local: loadConcurrentUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- container runtime: loadRetryPaths phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- security review: loadRotationGuard phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- mobile browser: loadRevokeCleanup phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- profile update: loadOAuthStart phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- background worker: loadConsentCallback phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- project revoke: loadTokenExchange phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- CI: loadUserinfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- provider 5xx: loadProjectInfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- staging: loadAllUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- high latency network: loadConcurrentStates phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- privacy review: loadConcurrentTabs phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- edge runtime: loadConcurrentUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- support diagnosis: loadRetryPaths phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- multi-tab browser: loadRotationGuard phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- device expiry: loadRevokeCleanup phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- server route: loadOAuthStart phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- secret rotation: loadConsentCallback phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- production: loadTokenExchange phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- provider 429: loadUserinfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- local: loadProjectInfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- container runtime: loadAllUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- security review: loadConcurrentStates phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- mobile browser: loadConcurrentTabs phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- profile update: loadConcurrentUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- background worker: loadRetryPaths phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- project revoke: loadRotationGuard phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- CI: loadRevokeCleanup phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- provider 5xx: loadOAuthStart phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- staging: loadConsentCallback phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- high latency network: loadTokenExchange phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- privacy review: loadUserinfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- edge runtime: loadProjectInfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- support diagnosis: loadAllUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- multi-tab browser: loadConcurrentStates phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- device expiry: loadConcurrentTabs phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- server route: loadConcurrentUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- secret rotation: loadRetryPaths phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- production: loadRotationGuard phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- provider 429: loadRevokeCleanup phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- local: loadOAuthStart phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- container runtime: loadConsentCallback phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- security review: loadTokenExchange phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- mobile browser: loadUserinfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- profile update: loadProjectInfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- background worker: loadAllUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- project revoke: loadConcurrentStates phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- CI: loadConcurrentTabs phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- provider 5xx: loadConcurrentUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- staging: loadRetryPaths phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- high latency network: loadRotationGuard phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- privacy review: loadRevokeCleanup phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- edge runtime: loadOAuthStart phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- support diagnosis: loadConsentCallback phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- multi-tab browser: loadTokenExchange phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- device expiry: loadUserinfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- server route: loadProjectInfo phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- secret rotation: loadAllUsers phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- production: loadConcurrentStates phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
- provider 429: loadConcurrentTabs phải đo throughput, p95 latency, error rate, retry count, CAS conflict và duplicate count.
## 153. Checklist API dành cho bên thứ ba

- Checklist 1, local: Có client ID đúng environment.
- Checklist 2, provider 429: Có API key ở secret manager.
- Checklist 3, production: Có redirect URI exact.
- Checklist 4, secret rotation: Có state random.
- Checklist 5, server route: Có state TTL.
- Checklist 6, device expiry: Có state consume.
- Checklist 7, multi-tab browser: Có callback route server-side.
- Checklist 8, support diagnosis: Có access_denied handling.
- Checklist 9, edge runtime: Có invalid_client handling.
- Checklist 10, privacy review: Có invalid_grant handling.
- Checklist 11, high latency network: Có token timeout.
- Checklist 12, staging: Có userinfo mapping.
- Checklist 13, provider 5xx: Có local session.
- Checklist 14, CI: Có logout local.
- Checklist 15, project revoke: Có API key redaction.
- Checklist 16, background worker: Có access token redaction.
- Checklist 17, profile update: Có code redaction.
- Checklist 18, mobile browser: Có Authorization redaction.
- Checklist 19, security review: Có Cookie redaction.
- Checklist 20, container runtime: Có retry query.
- Checklist 21, local: Không retry mutation mù.
- Checklist 22, provider 429: Có CAS handling.
- Checklist 23, production: Có key rotation runbook.
- Checklist 24, secret rotation: Có project revoke runbook.
- Checklist 25, server route: Có health monitor.
- Checklist 26, device expiry: Có production smoke.
- Checklist 27, multi-tab browser: Có rollback.
- Checklist 28, support diagnosis: Có privacy review.
- Checklist 29, edge runtime: Có CSP review.
- Checklist 30, privacy review: Có keyboard QA.
- Checklist 31, high latency network: Có client ID đúng environment.
- Checklist 32, staging: Có API key ở secret manager.
- Checklist 33, provider 5xx: Có redirect URI exact.
- Checklist 34, CI: Có state random.
- Checklist 35, project revoke: Có state TTL.
- Checklist 36, background worker: Có state consume.
- Checklist 37, profile update: Có callback route server-side.
- Checklist 38, mobile browser: Có access_denied handling.
- Checklist 39, security review: Có invalid_client handling.
- Checklist 40, container runtime: Có invalid_grant handling.
- Checklist 41, local: Có token timeout.
- Checklist 42, provider 429: Có userinfo mapping.
- Checklist 43, production: Có local session.
- Checklist 44, secret rotation: Có logout local.
- Checklist 45, server route: Có API key redaction.
- Checklist 46, device expiry: Có access token redaction.
- Checklist 47, multi-tab browser: Có code redaction.
- Checklist 48, support diagnosis: Có Authorization redaction.
- Checklist 49, edge runtime: Có Cookie redaction.
- Checklist 50, privacy review: Có retry query.
- Checklist 51, high latency network: Không retry mutation mù.
- Checklist 52, staging: Có CAS handling.
- Checklist 53, provider 5xx: Có key rotation runbook.
- Checklist 54, CI: Có project revoke runbook.
- Checklist 55, project revoke: Có health monitor.
- Checklist 56, background worker: Có production smoke.
- Checklist 57, profile update: Có rollback.
- Checklist 58, mobile browser: Có privacy review.
- Checklist 59, security review: Có CSP review.
- Checklist 60, container runtime: Có keyboard QA.
- Checklist 61, local: Có client ID đúng environment.
- Checklist 62, provider 429: Có API key ở secret manager.
- Checklist 63, production: Có redirect URI exact.
- Checklist 64, secret rotation: Có state random.
- Checklist 65, server route: Có state TTL.
- Checklist 66, device expiry: Có state consume.
- Checklist 67, multi-tab browser: Có callback route server-side.
- Checklist 68, support diagnosis: Có access_denied handling.
- Checklist 69, edge runtime: Có invalid_client handling.
- Checklist 70, privacy review: Có invalid_grant handling.
- Checklist 71, high latency network: Có token timeout.
- Checklist 72, staging: Có userinfo mapping.
- Checklist 73, provider 5xx: Có local session.
- Checklist 74, CI: Có logout local.
- Checklist 75, project revoke: Có API key redaction.
- Checklist 76, background worker: Có access token redaction.
- Checklist 77, profile update: Có code redaction.
- Checklist 78, mobile browser: Có Authorization redaction.
- Checklist 79, security review: Có Cookie redaction.
- Checklist 80, container runtime: Có retry query.
## 154. Ghi chú bàn giao phương thức

- Mỗi method wrapper phải có input contract.
- Mỗi method wrapper phải có output contract.
- Mỗi method wrapper phải có timeout.
- Mỗi method wrapper phải có error mapping.
- Mỗi method wrapper phải có logging policy.
- Mỗi method wrapper phải có retry policy.
- Mỗi method wrapper phải có security boundary.
- Mỗi method wrapper phải có unit test.
- Mỗi method wrapper phải có integration test.
- Mỗi method wrapper phải có production smoke nếu liên quan endpoint.

