# AGENTS_INSTRUCTION_INTERGRATE_API.md

## Hướng dẫn tích hợp APIUYTIN OAuth Account Chooser

- Tài liệu này dành cho website bên thứ ba, backend, QA, DevOps, security và support.
- Base URL production hiện tại: https://apiuytin.pages.dev.
- Auth API base hiện tại: https://apiuytin.pages.dev/api/auth.
- OAuth start URL hiện tại: https://apiuytin.pages.dev/oauth/google.
- Flow dùng client ID và API key; không dùng client secret.
- API key chỉ lưu và sử dụng ở backend.
- Browser chỉ khởi tạo navigation và nhận callback code cùng state.
- Web tích hợp không nhận Google access token, refresh token hoặc Google subject.
- Profile trả về định danh APIUYTIN ổn định qua id và sub.
- Authorization code chỉ dùng một lần.
- Redirect URI phải đăng ký trước và khớp chính xác.
- State phải do web tích hợp tạo, lưu và kiểm tra.
- Device chooser nhớ account theo device session APIUYTIN.
- Thiết bị mới có thể phải xác thực Google lại ở phía APIUYTIN.
- Rotate key làm key cũ mất hiệu lực sau CAS thành công.
- Revoke fail closed trước cleanup nền hoàn tất.
- Async không loại bỏ quota upstream hoặc giới hạn concurrency.

## Mục tiêu của tài liệu

1. Giúp một backend mới tích hợp login mà không xử lý Google trực tiếp.
2. Giải thích từng credential và phạm vi của nó.
3. Mô tả chooser, device, transaction, callback và token exchange.
4. Chỉ rõ profile contract mà bên thứ ba được nhận.
5. Chỉ rõ cách xử lý rotate, revoke, retry, race và tải cao.
6. Cung cấp ví dụ cho nhiều framework phổ biến.
7. Đưa ra test matrix và release gate có thể nghiệm thu.

## Đọc nhanh

1. Tạo project trong dashboard APIUYTIN.
2. Đăng ký callback HTTPS exact.
3. Lưu clientId và apiKey ở secret manager server-side.
4. Tạo state ngẫu nhiên và lưu với app session.
5. Redirect browser tới OAuth start URL.
6. Để APIUYTIN mở chooser và consent.
7. Nhận code cùng state ở callback.
8. Kiểm tra state trước token exchange.
9. Gửi đúng client_id, api_key, code và redirect_uri.
10. Validate profile và upsert theo APIUYTIN sub.
11. Tạo session nội bộ cho website.
12. Gọi userinfo khi cần.
13. Test cancel, replay, rotate, revoke và concurrency.

# 1. Kiến trúc tổng thể

## 1.1 Các bên tham gia

- Người dùng cuối điều khiển browser.
- Website tích hợp giữ session ứng dụng.
- APIUYTIN giữ project, apiUser, device account và transaction.
- Google chỉ là upstream verification khi APIUYTIN cần bootstrap.
- Secret manager giữ apiKey của website tích hợp.
- Database website giữ mapping provider user và app session.
- Monitoring giữ metric đã redact.
- QA dùng project test, không dùng production key.

## 1.2 Luồng thành công

1. User bấm nút đăng nhập tại website.
2. Backend tạo state bằng CSPRNG.
3. Backend lưu state với session ID, return path và expiry.
4. Browser chuyển hướng tới /oauth/google.
5. APIUYTIN kiểm tra client_id và redirect_uri.
6. APIUYTIN tạo transaction OAuth ngắn hạn.
7. APIUYTIN đọc hoặc tạo device session.
8. APIUYTIN hiển thị chooser account.
9. User chọn account hoặc thêm account.
10. User xem project, callback domain và dữ liệu chia sẻ.
11. User bấm Tiếp tục.
12. APIUYTIN consume transaction bằng CAS.
13. APIUYTIN phát code dùng một lần.
14. Browser quay lại callback với code và state.
15. Backend kiểm tra state.
16. Backend gọi token endpoint bằng bốn field bắt buộc.
17. APIUYTIN kiểm tra project, key, redirect, code và expiry.
18. APIUYTIN consume code bằng revision guard.
19. APIUYTIN trả access_token, expires_in và profile.
20. Website tạo session ứng dụng rồi redirect vào trang allowlist.

## 1.3 Luồng thêm account

1. Chooser đọc account APIUYTIN đã liên kết với device.
2. User bấm Thêm tài khoản.
3. APIUYTIN dùng Google server-side để bootstrap hoặc xác minh.
4. APIUYTIN upsert apiUser theo identity mapping.
5. APIUYTIN liên kết apiUser với device.
6. User quay lại consent của project.
7. User chọn account mới.
8. APIUYTIN phát code của project.
9. Website đổi code như flow thường.
10. Google token không bao giờ gửi cho website.

## 1.4 Luồng hủy

1. User bấm Hủy trên consent.
2. Transaction được đánh dấu canceled.
3. APIUYTIN redirect về callback đã đăng ký.
4. Callback có error=access_denied và state.
5. Website kiểm tra state.
6. Website không gọi token endpoint.
7. Website không tạo app session.
8. Website cho user thử lại.
9. Cancel không phải server outage.

## 1.5 Luồng thiết bị mới

- Device cookie không có hoặc hết hạn.
- Chooser không hiển thị account của device khác.
- User cần upstream verification để thêm account.
- APIUYTIN tạo device session mặc định khoảng 30 ngày.
- Cookie device có HttpOnly, Secure và SameSite=Lax.
- Server lưu hash hoặc định danh dẫn xuất của device.
- Website tích hợp không đọc cookie device bằng JavaScript.
- Device cookie không phải app session.
- Device cookie không phải access token.
- Xóa cookie làm chooser của thiết bị đó rỗng.

# 2. Credential và profile contract

## 2.1 clientId

- clientId là định danh project.
- clientId dùng trong OAuth start.
- clientId không thay thế apiKey.
- clientId không đủ để đổi code.
- clientId phải thuộc project active.
- clientId phải đi cùng callback đã đăng ký.
- clientId có thể xuất hiện trong URL OAuth.
- apiKey không được xuất hiện cùng URL.
- Ghim clientId theo environment.
- Không cắt prefix.
- Không đổi chữ hoa hoặc chữ thường.
- Không thêm whitespace.
- Không dùng clientId production cho load test.

## 2.2 apiKey

- apiKey là secret của project.
- APIUYTIN chỉ lưu hash của apiKey.
- Plaintext chỉ trả lúc tạo hoặc rotate.
- GET session không trả apiKey.
- GET projects không trả apiKey.
- project-info không trả apiKey.
- allusers không trả apiKey.
- Không gửi apiKey trong query string.
- Không gửi apiKey từ browser.
- Không đưa apiKey vào public environment.
- Không ghi apiKey vào log.
- Rotate ngay nếu key lộ.
- Revoke project nếu không còn tin cậy.
- Phân tách key theo environment.
- Ghi version secret, không ghi giá trị.

## 2.3 Authorization code

- Code sinh sau consent.
- Code gắn với project và redirectUri.
- Code có thời hạn ngắn, khoảng năm phút.
- Code chỉ consume một lần.
- Code không phải access token.
- Code không lưu trong localStorage.
- Code không ghi log nguyên văn.
- Code không gửi qua analytics.
- Code không retry mù.
- Code replay phải bị từ chối.
- Code mismatch phải bị từ chối.
- Code expired cần login attempt mới.
- Code không chứa Google token.

## 2.4 Access token

- Access token trả sau token exchange.
- Token dùng cho userinfo.
- expires_in hiện tại là 3600 giây.
- Token nên lưu server-side.
- Token không nằm trong URL.
- Token không nằm trong localStorage.
- Token không ghi log.
- Token không đưa vào telemetry.
- Token hết hạn thì bắt đầu OAuth attempt mới.
- Không tự chế refresh token.
- Userinfo dùng Bearer.
- Project revoked phải fail closed.

## 2.5 Profile contract

Token response và userinfo dùng profile cùng schema:

~~~json
{
  "id": "apiuytin-user-id",
  "sub": "apiuytin-user-id",
  "email": "user@example.com",
  "name": "User Name",
  "picture": "https://example.com/avatar.jpg",
  "given_name": "User",
  "family_name": "Name",
  "locale": "vi",
  "verified_email": true
}
~~~

Profile rules:

- id là APIUYTIN user ID.
- sub là APIUYTIN user ID ổn định.
- id và sub có cùng giá trị trong contract hiện tại.
- email dùng để hiển thị hoặc liên hệ.
- email không nên là primary key duy nhất.
- name là display name.
- picture là URL avatar có thể thay đổi.
- given_name và family_name có thể thiếu.
- locale dùng cho bản địa hóa.
- verified_email là boolean.
- Không đưa Google subject ra web tích hợp.
- Không trả Google access token.
- Không trả Google refresh token.
- Không lưu raw Google response vô hạn.

# 3. Endpoint contract

## 3.1 Health

~~~http
GET https://apiuytin.pages.dev/api/auth/health
Accept: application/json
~~~

Response:

~~~json
{
  "ok": true,
  "service": "apiuytin-auth",
  "baseUrl": "https://apiuytin.pages.dev/api/auth"
}
~~~

Health chỉ là liveness.
Health không chứng minh client ID đúng.
Health không chứng minh apiKey đúng.
Health không chứng minh callback đúng.
Health không chứng minh chooser render được.
Health không chứng minh userinfo hoạt động.
Production smoke phải chạy thêm flow OAuth với test account.

## 3.2 Discovery

~~~http
GET https://apiuytin.pages.dev/api/auth
Accept: application/json
~~~

Dùng discovery để đối chiếu endpoint hiện hành.
Không dùng discovery để đọc user data.
Không coi discovery là authenticated check.

## 3.3 OAuth start

~~~text
GET https://apiuytin.pages.dev/oauth/google?client_id=CLIENT_ID&redirect_uri=ENCODED_CALLBACK&state=OPAQUE_STATE
~~~

Bắt buộc:

- client_id.
- redirect_uri.
- state.

Giới hạn cần tôn trọng:

- client_id tối đa 256 ký tự.
- redirect_uri tối đa 2048 ký tự.
- state tối đa 2048 ký tự.
- mọi field non-empty.
- redirect production phải HTTPS.
- callback exact-match.
- apiKey không nằm trong URL.
- access token không nằm trong URL.
- client secret không nằm trong URL.

## 3.4 Token endpoint

~~~http
POST https://apiuytin.pages.dev/api/auth/oauth/token
Content-Type: application/json
Accept: application/json
~~~

Body chính xác:

~~~json
{
  "client_id": "pk_your_project_client_id",
  "api_key": "CHUOTAPI_server_only_secret",
  "code": "one-time-code",
  "redirect_uri": "https://app.example.com/auth/apiuytin/callback"
}
~~~

Không gửi client_secret.
Không gửi Google access token.
Không gửi Google refresh token.
Không gửi extra field tùy ý.
Không gửi apiKey trong query.
Không gửi code của transaction khác.
Không gửi redirect URI khác record project.

Response thành công:

~~~json
{
  "access_token": "opaque-access-token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "apiuytin-user-id",
    "sub": "apiuytin-user-id",
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

## 3.5 Token errors

- invalid_client HTTP 401 cho key, client, redirect sai hoặc body có field bị cấm.
- invalid_grant HTTP 400 cho code sai, expired, consumed hoặc mismatch.
- invalid_request HTTP 400 cho thiếu field hoặc kiểu dữ liệu sai.
- project_revoked HTTP 401 khi project đã revoke.
- token_expired HTTP 401 khi access token hết hạn.
- unauthorized HTTP 401 khi thiếu credential.
- Không retry vô hạn lỗi cấu hình.
- Không hiển thị raw error chứa chi tiết nội bộ.
- Map lỗi thành UX và log error code.

## 3.6 Userinfo

~~~http
GET https://apiuytin.pages.dev/api/auth/userinfo
Authorization: Bearer ACCESS_TOKEN
Accept: application/json
~~~

Userinfo trả profile trực tiếp, không bọc thêm trường user.
Userinfo dùng access token, không dùng apiKey.
Userinfo nên được gọi từ backend hoặc BFF có bảo vệ.

## 3.7 Project info

~~~http
GET https://apiuytin.pages.dev/api/auth/project-info
Authorization: Bearer CHUOTAPI_server_only_key
~~~

Response gồm id, name, clientId, redirectUri và status.
Response không gồm apiKey, apiKeyHash, client secret, access token hoặc Google token.

## 3.8 All users

~~~http
GET https://apiuytin.pages.dev/api/auth/allusers
Authorization: Bearer CHUOTAPI_server_only_key
~~~

All users là endpoint backend/admin theo project.
Không proxy allusers công khai.
Giới hạn role, audit access và tuân thủ privacy retention.

## 3.9 Rotate key

~~~http
POST https://apiuytin.pages.dev/api/auth/projects/PROJECT_ID/rotate-key
Cookie: apiuytin_session=...
Accept: application/json
~~~

- Chỉ owner dashboard gọi được.
- CAS hoặc revision guard ngăn hai rotation thắng cùng lúc.
- Key cũ mất hiệu lực sau thay đổi thành công.
- Key mới trả đúng một lần.
- Không gọi từ browser tích hợp.
- Sau rotate phải update secret manager.
- Sau rotate phải chạy smoke test.

## 3.10 Revoke project

~~~http
POST https://apiuytin.pages.dev/api/auth/projects/PROJECT_ID/revoke
Cookie: apiuytin_session=...
Accept: application/json
~~~

- Project mark revoked trước cleanup.
- API key fail closed ngay.
- Code mới không cấp cho project revoked.
- Cleanup có thể chạy nền bằng waitUntil.
- Response có thể báo cleanupScheduled.
- UI không cần chờ xóa toàn bộ relation.
- Gọi lại có thể báo alreadyRevoked.
- Revoke không giống logout.

# 4. Cài đặt project và callback

## 4.1 Tạo project

~~~http
POST https://apiuytin.pages.dev/api/auth/projects
Content-Type: application/json
Cookie: apiuytin_session=...
~~~

~~~json
{
  "name": "My Example Web",
  "redirectUri": "https://app.example.com/auth/apiuytin/callback"
}
~~~

Response tạo project trả API key một lần.
Ngay sau đó:

1. Lấy project.id.
2. Lấy project.clientId.
3. Lấy project.redirectUri.
4. Lấy project.apiKey.
5. Lưu apiKey vào secret manager.
6. Không refresh để tìm key.
7. Không kỳ vọng GET projects trả key.
8. Kiểm tra project-info bằng key.
9. Ghi secret version, không ghi plaintext.
10. Thiết lập owner rotation.

## 4.2 Redirect URI

- Là absolute URL.
- Dùng HTTPS production.
- Không fragment.
- Không username/password.
- Khớp scheme.
- Khớp host.
- Khớp port.
- Khớp path.
- Khớp trailing slash.
- Không wildcard.
- Không lấy từ user input.
- Không lấy từ header không tin cậy.
- Lưu theo environment.
- Test exact bằng fixture.

## 4.3 Environment

Mỗi environment nên có project, clientId, apiKey, callback, session store, state store, log sink, alert channel và test account phù hợp.
Không dùng production key ở local, CI hoặc load test.
Không dùng callback localhost trong production.

## 4.4 Secret manager

~~~text
APIUYTIN_BASE_URL
APIUYTIN_AUTH_BASE_URL
APIUYTIN_CLIENT_ID
APIUYTIN_API_KEY
APIUYTIN_REDIRECT_URI
APIUYTIN_HTTP_TIMEOUT_MS
~~~

Không dùng prefix public cho apiKey.
Startup được kiểm tra biến tồn tại nhưng không được log giá trị.

# 5. OAuth Account Chooser

## 5.1 Start route

Backend route nội bộ /login/apiuytin nên:

1. Kiểm tra user chưa đăng nhập hoặc cho phép reauth.
2. Tạo state bằng CSPRNG.
3. Lưu state với session ID.
4. Lưu return path allowlist.
5. Đặt expiry khoảng 10 phút.
6. Dựng URL bằng URL API.
7. Trả redirect 302.
8. Không gọi Google trực tiếp.
9. Không gọi token endpoint.
10. Không gửi apiKey ra browser.

## 5.2 Transaction

Transaction server-side giữ project, client ID, redirect URI, state, device hash, selected account, expiry, status và revision.
Transaction token trên consent là opaque.
Transaction có thể active, selected, canceled hoặc expired.
Continue và cancel phải kiểm tra status và dùng CAS.

## 5.3 Device chooser

- Cookie hiện tại là apiuytin_device.
- Cookie có HttpOnly.
- Cookie có Secure.
- Cookie có SameSite=Lax.
- Thời hạn mặc định khoảng 30 ngày.
- Browser không đọc trực tiếp.
- Server lưu hash hoặc định danh dẫn xuất.
- Account list chỉ thuộc device đó.
- Cookie không phải access token.
- Cookie không phải app session.
- Cookie không gửi Google credential cho website.

## 5.4 Consent UI

Consent nên hiển thị tên project, callback domain, account list, avatar, tên, email, Thêm tài khoản, Tiếp tục, Hủy và dữ liệu sẽ chia sẻ.
UI cần focus visible, keyboard navigation, Escape, screen reader label và responsive 375, 768, 1024, 1440 pixel.
Không hiển thị raw Google token.

## 5.5 Add account

- Giữ transaction ban đầu.
- Dùng flow add-account riêng.
- Google chỉ server-side.
- Upsert apiUser theo identity.
- Link account với device.
- Quay lại consent.
- Không tự phát code chỉ vì Google login thành công.
- User vẫn phải chọn account và đồng ý.
- Code gắn project và callback ban đầu.
- Website không thấy upstream token.

## 5.6 Continue

- Transaction active.
- Project active.
- Device đúng.
- Account thuộc device.
- Callback đúng.
- Relation deterministic.
- Transaction selected bằng CAS.
- Code issue một lần.
- Redirect về callback.
- Query có code và state.
- Không có access token trong query.
- Không có Google subject trong query.

## 5.7 Cancel

- Transaction canceled.
- Redirect callback registered.
- error=access_denied.
- Giữ state.
- Không issue code.
- Không tạo app session.
- Không gọi token.
- UX cho phép thử lại.
- Log outcome denied.

# 6. Callback và session

## 6.1 Thứ tự callback

1. Đọc query scalar.
2. Lấy error, code và state.
3. Tải state theo session.
4. Xác minh state.
5. Consume state atomically.
6. Xử lý error.
7. Kiểm tra code.
8. Gọi token server-side.
9. Validate response.
10. Upsert user.
11. Rotate app session.
12. Lưu token server-side nếu cần.
13. Xóa pending state.
14. Redirect path allowlist.
15. Trả no-store.

## 6.2 State

- CSPRNG.
- Entropy cao.
- TTL.
- Session binding.
- One-time consumption.
- Constant-time compare.
- Shared store khi nhiều instance.
- Correlation ID.
- Không email.
- Không apiKey.
- Không access token.
- Không log raw.
- Test mismatch.
- Test expiry.
- Test replay.
- Test nhiều tab.

## 6.3 Return path

- Chỉ relative path nội bộ.
- Allowlist route.
- Reject absolute URL.
- Reject protocol-relative URL.
- Reject host khác.
- Không tin next query trực tiếp.
- Lưu path server-side trong state.
- Fallback trang account.
- Test open redirect.

## 6.4 App session

- Tìm user theo provider apiuytin và sub.
- Tạo user nếu chưa có.
- Cập nhật profile.
- Tạo session ID mới.
- Set cookie HttpOnly Secure.
- Lưu token server-side nếu cần.
- Lưu expiry.
- Xóa state.
- Redirect sạch.
- Không đưa token vào client props.
- Không dùng device cookie làm app session.
- Không dùng dashboard cookie làm app session.

## 6.5 Logout

- Xóa app session.
- Xóa token server-side.
- Xóa pending state nếu cần.
- Không revoke project.
- Không rotate API key.
- Không xóa remembered account.
- Không xóa apiUser.
- Login lại phải chạy OAuth start mới.

# 7. Ví dụ code

## 7.1 Node.js URL builder

~~~javascript
const target = new URL("https://apiuytin.pages.dev/oauth/google");
target.searchParams.set("client_id", process.env.APIUYTIN_CLIENT_ID);
target.searchParams.set("redirect_uri", process.env.APIUYTIN_REDIRECT_URI);
target.searchParams.set("state", state);
return target.toString();
~~~

## 7.2 Node.js token exchange

~~~javascript
const response = await fetch(
  process.env.APIUYTIN_AUTH_BASE_URL + "/oauth/token",
  {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json"
    },
    body: JSON.stringify({
      client_id: process.env.APIUYTIN_CLIENT_ID,
      api_key: process.env.APIUYTIN_API_KEY,
      code,
      redirect_uri: process.env.APIUYTIN_REDIRECT_URI
    }),
    signal: AbortSignal.timeout(8000)
  }
);
const payload = await response.json();
if (!response.ok) throw new Error(payload.error || "oauth_token_failed");
return payload;
~~~

## 7.3 Node.js callback pseudo route

~~~javascript
app.get("/login/apiuytin", async (req, res) => {
  const state = crypto.randomBytes(32).toString("base64url");
  await stateStore.put(state, {
    sessionId: req.session.id,
    returnPath: "/account",
    expiresAt: Date.now() + 600000
  });
  res.redirect(buildLoginUrl(state));
});

app.get("/auth/apiuytin/callback", async (req, res) => {
  const state = readScalar(req.query.state);
  const code = readScalar(req.query.code);
  const error = readScalar(req.query.error);
  const record = await stateStore.consume(state, req.session.id);
  if (!record) return res.status(400).send("Invalid state");
  if (error === "access_denied") return res.redirect("/login?reason=cancelled");
  if (!code) return res.status(400).send("Missing code");
  const token = await exchangeCode(code);
  await createAppSession(req, token.user, token.access_token);
  return res.redirect(record.returnPath);
});
~~~

## 7.4 Userinfo

~~~javascript
const response = await fetch(
  process.env.APIUYTIN_AUTH_BASE_URL + "/userinfo",
  {
    headers: {
      "authorization": "Bearer " + accessToken,
      "accept": "application/json"
    },
    signal: AbortSignal.timeout(8000)
  }
);
const profile = await response.json();
~~~

## 7.5 Flask

~~~python
def exchange_code(code):
    response = requests.post(
        os.environ["APIUYTIN_AUTH_BASE_URL"] + "/oauth/token",
        json={
            "client_id": os.environ["APIUYTIN_CLIENT_ID"],
            "api_key": os.environ["APIUYTIN_API_KEY"],
            "code": code,
            "redirect_uri": os.environ["APIUYTIN_REDIRECT_URI"],
        },
        timeout=8,
    )
    response.raise_for_status()
    return response.json()
~~~

## 7.6 Go

~~~go
func exchangeCode(ctx context.Context, code string) (TokenResponse, error) {
    payload := map[string]string{
        "client_id": os.Getenv("APIUYTIN_CLIENT_ID"),
        "api_key": os.Getenv("APIUYTIN_API_KEY"),
        "code": code,
        "redirect_uri": os.Getenv("APIUYTIN_REDIRECT_URI"),
    }
    body, err := json.Marshal(payload)
    if err != nil { return TokenResponse{}, err }
    req, err := http.NewRequestWithContext(ctx, http.MethodPost,
        os.Getenv("APIUYTIN_AUTH_BASE_URL")+"/oauth/token", bytes.NewReader(body))
    if err != nil { return TokenResponse{}, err }
    req.Header.Set("Content-Type", "application/json")
    resp, err := sharedHTTPClient.Do(req)
    if err != nil { return TokenResponse{}, err }
    defer resp.Body.Close()
    return decodeTokenResponse(resp.Body, resp.StatusCode)
}
~~~

## 7.7 Cloudflare Worker boundary

~~~javascript
if (url.pathname === "/login/apiuytin") {
  const state = crypto.randomUUID();
  await env.STATE_KV.put("oauth:" + state,
    JSON.stringify({returnPath: "/account"}), {expirationTtl: 600});
  const target = new URL("https://apiuytin.pages.dev/oauth/google");
  target.searchParams.set("client_id", env.APIUYTIN_CLIENT_ID);
  target.searchParams.set("redirect_uri", env.APIUYTIN_REDIRECT_URI);
  target.searchParams.set("state", state);
  return Response.redirect(target.toString(), 302);
}
~~~

# 8. Bảo mật

## 8.1 Redirect security

- Exact-match callback.
- HTTPS production.
- Không wildcard.
- Không fragment.
- Không open redirect.
- Return path relative.
- Không truyền token qua query nội bộ.
- Callback no-store.
- Referrer-Policy.
- CSP.
- Không load analytics trước khi dọn query.
- Không đặt secret trong URL.
- Không tin host từ user input.

## 8.2 Cookie security

- App session HttpOnly.
- App session Secure production.
- SameSite theo flow.
- Device cookie không đọc bằng JS.
- Dashboard cookie không dùng làm API key.
- Không API key trong cookie browser.
- Session ID rotate sau login.
- Xóa cookie khi logout.
- Có expiry.
- Bảo vệ session fixation.

## 8.3 Logging security

Được log: request ID, route, status, latency, error code, retry count, environment và project ID theo policy.
Không log: API key, access token, code, state raw, cookie header, Google token, full callback URL, raw token body hoặc raw profile không cần thiết.

## 8.4 Privacy

- Chỉ lưu field cần cho sản phẩm.
- Provider user ID là APIUYTIN sub.
- Có retention.
- Giới hạn allusers.
- Không lưu Google token.
- Không chia profile cross tenant.
- Có audit.
- Picture có thể đổi.
- Locale không suy ra quốc tịch.
- verified_email không tự thay policy nghiệp vụ.

# 9. Async, race và tải cao

## 9.1 Giới hạn

- Query retry tối đa 3.
- Chunk mutation tối đa 50.
- Cleanup concurrency tối đa 6.
- HTTP timeout hữu hạn.
- Connection pool bounded.
- Load ramp-up.
- Queue backpressure.
- Circuit breaker khi upstream lỗi.
- Không Promise.all không giới hạn.
- Không spawn vô hạn thread.
- Rate limit upstream vẫn có thể xảy ra.

## 9.2 Race protection

- Transaction revision.
- Code revision.
- Project rotation revision.
- Deterministic identity key.
- createIfNotExists.
- CAS cho consume.
- Idempotency operation ID.
- Unique database constraint.
- Atomic state consume.
- Không giữ state trong biến process.
- Không retry mutation sau unknown outcome mà không reread.

## 9.3 Retry

Retry có thể áp dụng cho 429, 502, 503, 504 và timeout query idempotent.
Không retry vô điều kiện 400, 401, 403, 404, invalid_client, invalid_grant, state mismatch hoặc redirect mismatch.
Mỗi retry cần exponential backoff, jitter, deadline, request ID, metric và log sạch.

# 10. Kiểm thử

## 10.1 Test matrix

- Health 200.
- Discovery đúng endpoint.
- OAuth thiếu field.
- Callback sai.
- State sai.
- Transaction hết hạn.
- Device mới.
- Device nhiều account.
- Add account.
- Cancel.
- Continue.
- Token success.
- client_secret bị reject.
- invalid_client.
- invalid_grant.
- Code replay.
- Code expiry.
- Userinfo.
- Token expiry.
- Project revoked.
- Rotate.
- Old key rejected.
- Revoke.
- Cleanup background.
- Concurrency 50.
- Concurrency 100.
- No duplicate.
- CSP.
- Keyboard.
- Responsive.
- Screen reader.
- Production smoke.

## 10.2 Profile assertions

- id là string.
- sub là string.
- id bằng sub.
- verified_email là boolean.
- token_type là Bearer.
- expires_in là số dương.
- Token response có user.
- Userinfo trả profile trực tiếp.
- Không có Google access token.
- Không có Google refresh token.
- Không có Google subject.
- Optional fields có thể null.

## 10.3 Rotate test

1. project-info bằng key cũ thành công.
2. Owner rotate thành công.
3. Nhận key mới.
4. project-info bằng key mới thành công.
5. Key cũ bị từ chối.
6. Session không có key.
7. Project list không có key.
8. Token exchange dùng key mới.
9. Secret manager cập nhật.
10. Log không có plaintext.

## 10.4 Revoke test

1. Project active.
2. project-info bằng key active.
3. Owner revoke.
4. Response ok.
5. Key cũ fail closed ngay.
6. Token mới không cấp.
7. Code pending không consume theo project revoked.
8. Cleanup có thể chạy nền.
9. Second revoke không gây loop.
10. Secret runtime được gỡ.
11. Evidence có timestamp.
12. UI không chờ xóa toàn bộ record.

## 10.5 Load test

- Dùng project test.
- Dùng account test.
- State unique.
- Callback fixture unique.
- Ramp 5, 10, 25, 50, 100.
- Connection pool giới hạn.
- Timeout.
- Đo p50, p95, p99.
- Đếm 2xx, 4xx, 429, 5xx.
- Đếm duplicate user.
- Đếm duplicate device relation.
- Đếm duplicate code.
- Đếm retry.
- Đếm race conflict.
- Dừng khi upstream overload.
- Không dùng production key.

# 11. Triển khai

## 11.1 Trước deploy

- Project active.
- Callback exact.
- ClientId đúng.
- Key trong secret manager.
- State store shared.
- Session store shared.
- Timeout.
- Schema validator.
- Redaction.
- Negative tests.
- Load tests.
- Rotation runbook.
- Revoke runbook.
- Rollback.
- On-call.
- Test account.

## 11.2 Trong deploy

- Deploy callback backend.
- Kiểm tra secret injection.
- Health.
- Discovery.
- OAuth start.
- Chooser.
- Consent.
- Callback.
- Token.
- Userinfo.
- App session.
- Logs.
- Metrics.
- Mobile smoke.
- Không đổi key hoặc revoke nhầm project.

## 11.3 Sau deploy

- Monitor success.
- Monitor invalid_client.
- Monitor invalid_grant.
- Monitor 429.
- Monitor 5xx.
- Monitor p95.
- Monitor duplicate.
- Kiểm tra no-store.
- Kiểm tra cookie.
- Lưu smoke evidence.
- Cập nhật changelog.

## 11.4 Rollback

- Rollback code.
- Không rollback bằng cách commit key.
- Không phục hồi key nghi lộ.
- Cập nhật secret đúng version.
- Kiểm tra pending state.
- User dùng login attempt mới.
- Chạy smoke lại.
- Ghi unknown outcome nếu timeout.
- Ghi incident.

# 12. Migration

## 12.1 Client secret sang apiKey

1. Tìm mọi token request.
2. Tìm mọi field client_secret.
3. Thay bằng api_key.
4. Xóa fallback gửi cả hai.
5. Giữ API key server-only.
6. Test unknown field.
7. Cập nhật SDK sample.
8. Cập nhật docs bên thứ ba.
9. Rotate nếu secret cũ lộ.
10. Verify production.
11. Không đổi URL endpoint.
12. Ghi migration date.

## 12.2 Project cũ

- Giữ project ID.
- Giữ redirect URI.
- Map publishKey ra clientId.
- Dùng hash API key hiện tại.
- Key cũ hoạt động tới rotate.
- secretKeyHash không dùng.
- encryptedSecretKey không dùng.
- List và session không trả key.
- Profile cũ được bổ sung sau xác thực.
- Smoke trước và sau migration.
- Không tạo duplicate project chỉ vì đổi nhãn.

## 12.3 Identity cũ

- Provider là apiuytin.
- Provider user ID là sub.
- Không đổi sang Google subject.
- Không merge tự động chỉ bằng email.
- Unique constraint.
- Audit migration.
- Kiểm tra duplicate.
- Profile update không đổi user ID.
- Giữ first seen.
- Update last seen.
- Kiểm tra tenant isolation.

# 13. Hướng dẫn cho bên thứ ba

## 13.1 Thông tin cần cung cấp

- Base URL.
- Auth base URL.
- OAuth start URL.
- Token endpoint.
- Userinfo endpoint.
- Project-info endpoint.
- Rotate và revoke runbook.
- Callback registration instructions.
- Exact token body.
- Profile schema.
- Error catalog.
- Timeout guidance.
- Security warning.
- Staging environment.
- Support contact.
- Changelog.

## 13.2 Thông tin bên thứ ba cần chuẩn bị

- Website name.
- Environment.
- Callback exact.
- Server framework.
- Secret manager.
- State store.
- Session store.
- Owner kỹ thuật.
- Owner security.
- Timeout.
- Retry policy.
- Logging redaction.
- Privacy retention.
- Rotation owner.
- Incident contact.
- Smoke result.
- Load result.

## 13.3 Hướng dẫn tối giản

1. Tạo project.
2. Đăng ký callback.
3. Lưu clientId.
4. Lưu API key server-side.
5. Tạo state.
6. Redirect tới OAuth start.
7. Nhận callback.
8. Check state.
9. Đổi code.
10. Validate profile.
11. Upsert user.
12. Tạo session.
13. Gọi userinfo khi cần.
14. Test cancel.
15. Test replay.
16. Test rotate.
17. Test revoke.
18. Smoke production.

# 14. Playbook chi tiết

## Playbook 001 — Đọc contract trước khi tích hợp

### Mục tiêu
Hoàn thành hạng mục đọc contract trước khi tích hợp trong vai trò backend tích hợp.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, đọc contract trước khi tích hợp phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện đọc contract trước khi tích hợp bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công đọc contract trước khi tích hợp với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục đọc contract trước khi tích hợp hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 002 — Phân biệt clientId và apiKey

### Mục tiêu
Hoàn thành hạng mục phân biệt clientid và apikey trong vai trò project owner.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, phân biệt clientid và apikey phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện phân biệt clientid và apikey bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công phân biệt clientid và apikey với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục phân biệt clientid và apikey hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 003 — Chọn kiến trúc server-side

### Mục tiêu
Hoàn thành hạng mục chọn kiến trúc server-side trong vai trò QA.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, chọn kiến trúc server-side phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện chọn kiến trúc server-side bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công chọn kiến trúc server-side với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục chọn kiến trúc server-side hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 004 — Đăng ký callback URL

### Mục tiêu
Hoàn thành hạng mục đăng ký callback url trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, đăng ký callback url phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện đăng ký callback url bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công đăng ký callback url với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục đăng ký callback url hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 005 — Bảo vệ API key

### Mục tiêu
Hoàn thành hạng mục bảo vệ api key trong vai trò security owner.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, bảo vệ api key phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện bảo vệ api key bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công bảo vệ api key với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục bảo vệ api key hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 006 — Tạo project lần đầu

### Mục tiêu
Hoàn thành hạng mục tạo project lần đầu trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, tạo project lần đầu phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện tạo project lần đầu bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công tạo project lần đầu với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục tạo project lần đầu hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 007 — Tách môi trường

### Mục tiêu
Hoàn thành hạng mục tách môi trường trong vai trò SRE.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, tách môi trường phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện tách môi trường bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công tách môi trường với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục tách môi trường hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 008 — Kiểm tra health và discovery

### Mục tiêu
Hoàn thành hạng mục kiểm tra health và discovery trong vai trò data owner.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, kiểm tra health và discovery phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện kiểm tra health và discovery bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công kiểm tra health và discovery với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục kiểm tra health và discovery hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 009 — Tạo state chống CSRF

### Mục tiêu
Hoàn thành hạng mục tạo state chống csrf trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, tạo state chống csrf phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện tạo state chống csrf bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công tạo state chống csrf với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục tạo state chống csrf hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 010 — Dựng URL OAuth

### Mục tiêu
Hoàn thành hạng mục dựng url oauth trong vai trò project owner.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, dựng url oauth phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện dựng url oauth bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công dựng url oauth với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục dựng url oauth hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 011 — Mở OAuth Account Chooser

### Mục tiêu
Hoàn thành hạng mục mở oauth account chooser trong vai trò QA.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, mở oauth account chooser phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện mở oauth account chooser bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công mở oauth account chooser với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục mở oauth account chooser hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 012 — Hiểu transaction OAuth

### Mục tiêu
Hoàn thành hạng mục hiểu transaction oauth trong vai trò DevOps.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, hiểu transaction oauth phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện hiểu transaction oauth bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công hiểu transaction oauth với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục hiểu transaction oauth hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 013 — Hiểu device session

### Mục tiêu
Hoàn thành hạng mục hiểu device session trong vai trò security owner.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, hiểu device session phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện hiểu device session bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công hiểu device session với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục hiểu device session hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 014 — Account remembered

### Mục tiêu
Hoàn thành hạng mục account remembered trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, account remembered phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện account remembered bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công account remembered với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục account remembered hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 015 — Thiết bị mới

### Mục tiêu
Hoàn thành hạng mục thiết bị mới trong vai trò SRE.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, thiết bị mới phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện thiết bị mới bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công thiết bị mới với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục thiết bị mới hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 016 — Thêm account

### Mục tiêu
Hoàn thành hạng mục thêm account trong vai trò data owner.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, thêm account phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện thêm account bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công thêm account với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục thêm account hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 017 — Chọn account và consent

### Mục tiêu
Hoàn thành hạng mục chọn account và consent trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, chọn account và consent phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện chọn account và consent bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công chọn account và consent với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục chọn account và consent hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 018 — Hủy consent

### Mục tiêu
Hoàn thành hạng mục hủy consent trong vai trò project owner.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, hủy consent phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện hủy consent bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công hủy consent với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục hủy consent hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 019 — Callback success

### Mục tiêu
Hoàn thành hạng mục callback success trong vai trò QA.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, callback success phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện callback success bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công callback success với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục callback success hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 020 — Callback access denied

### Mục tiêu
Hoàn thành hạng mục callback access denied trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, callback access denied phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện callback access denied bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công callback access denied với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục callback access denied hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 021 — Xác thực state

### Mục tiêu
Hoàn thành hạng mục xác thực state trong vai trò security owner.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, xác thực state phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện xác thực state bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công xác thực state với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục xác thực state hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 022 — Consume state atomically

### Mục tiêu
Hoàn thành hạng mục consume state atomically trong vai trò frontend boundary.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, consume state atomically phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện consume state atomically bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công consume state atomically với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục consume state atomically hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 023 — Authorization code một lần

### Mục tiêu
Hoàn thành hạng mục authorization code một lần trong vai trò SRE.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, authorization code một lần phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện authorization code một lần bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công authorization code một lần với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục authorization code một lần hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 024 — Body token chính xác

### Mục tiêu
Hoàn thành hạng mục body token chính xác trong vai trò data owner.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, body token chính xác phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện body token chính xác bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công body token chính xác với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục body token chính xác hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 025 — Từ chối client secret

### Mục tiêu
Hoàn thành hạng mục từ chối client secret trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, từ chối client secret phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện từ chối client secret bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công từ chối client secret với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục từ chối client secret hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 026 — Kiểm tra redirect khi đổi code

### Mục tiêu
Hoàn thành hạng mục kiểm tra redirect khi đổi code trong vai trò project owner.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, kiểm tra redirect khi đổi code phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện kiểm tra redirect khi đổi code bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công kiểm tra redirect khi đổi code với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục kiểm tra redirect khi đổi code hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 027 — Invalid client

### Mục tiêu
Hoàn thành hạng mục invalid client trong vai trò QA.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, invalid client phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện invalid client bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công invalid client với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục invalid client hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 028 — Invalid grant

### Mục tiêu
Hoàn thành hạng mục invalid grant trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, invalid grant phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện invalid grant bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công invalid grant với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục invalid grant hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 029 — Lưu access token

### Mục tiêu
Hoàn thành hạng mục lưu access token trong vai trò security owner.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, lưu access token phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện lưu access token bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công lưu access token với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục lưu access token hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 030 — Access token expiry

### Mục tiêu
Hoàn thành hạng mục access token expiry trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, access token expiry phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện access token expiry bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công access token expiry với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục access token expiry hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 031 — Gọi userinfo

### Mục tiêu
Hoàn thành hạng mục gọi userinfo trong vai trò SRE.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, gọi userinfo phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện gọi userinfo bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công gọi userinfo với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục gọi userinfo hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 032 — Bearer header

### Mục tiêu
Hoàn thành hạng mục bearer header trong vai trò data owner.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, bearer header phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện bearer header bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công bearer header với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục bearer header hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 033 — Profile APIUYTIN

### Mục tiêu
Hoàn thành hạng mục profile apiuytin trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, profile apiuytin phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện profile apiuytin bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công profile apiuytin với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục profile apiuytin hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 034 — Ý nghĩa id và sub

### Mục tiêu
Hoàn thành hạng mục ý nghĩa id và sub trong vai trò project owner.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, ý nghĩa id và sub phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện ý nghĩa id và sub bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công ý nghĩa id và sub với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục ý nghĩa id và sub hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 035 — Không dùng Google subject

### Mục tiêu
Hoàn thành hạng mục không dùng google subject trong vai trò QA.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, không dùng google subject phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện không dùng google subject bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công không dùng google subject với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục không dùng google subject hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 036 — Profile picture

### Mục tiêu
Hoàn thành hạng mục profile picture trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, profile picture phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện profile picture bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công profile picture với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục profile picture hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 037 — given name và family name

### Mục tiêu
Hoàn thành hạng mục given name và family name trong vai trò security owner.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, given name và family name phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện given name và family name bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công given name và family name với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục given name và family name hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 038 — locale

### Mục tiêu
Hoàn thành hạng mục locale trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, locale phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện locale bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công locale với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục locale hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 039 — verified email

### Mục tiêu
Hoàn thành hạng mục verified email trong vai trò SRE.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, verified email phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện verified email bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công verified email với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục verified email hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 040 — Upsert user

### Mục tiêu
Hoàn thành hạng mục upsert user trong vai trò data owner.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, upsert user phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện upsert user bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công upsert user với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục upsert user hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 041 — Mapping identity

### Mục tiêu
Hoàn thành hạng mục mapping identity trong vai trò backend tích hợp.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, mapping identity phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện mapping identity bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công mapping identity với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục mapping identity hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 042 — Tạo app session

### Mục tiêu
Hoàn thành hạng mục tạo app session trong vai trò project owner.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, tạo app session phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện tạo app session bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công tạo app session với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục tạo app session hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 043 — Session fixation

### Mục tiêu
Hoàn thành hạng mục session fixation trong vai trò QA.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, session fixation phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện session fixation bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công session fixation với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục session fixation hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 044 — Logout website

### Mục tiêu
Hoàn thành hạng mục logout website trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, logout website phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện logout website bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công logout website với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục logout website hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 045 — Project info

### Mục tiêu
Hoàn thành hạng mục project info trong vai trò security owner.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, project info phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện project info bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công project info với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục project info hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 046 — All users

### Mục tiêu
Hoàn thành hạng mục all users trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, all users phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện all users bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công all users với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục all users hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 047 — Rotate API key

### Mục tiêu
Hoàn thành hạng mục rotate api key trong vai trò SRE.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, rotate api key phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện rotate api key bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công rotate api key với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục rotate api key hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 048 — Revoke project

### Mục tiêu
Hoàn thành hạng mục revoke project trong vai trò data owner.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, revoke project phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện revoke project bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công revoke project với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục revoke project hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 049 — Revoke fail closed

### Mục tiêu
Hoàn thành hạng mục revoke fail closed trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, revoke fail closed phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện revoke fail closed bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công revoke fail closed với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục revoke fail closed hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 050 — Revoke cleanup nền

### Mục tiêu
Hoàn thành hạng mục revoke cleanup nền trong vai trò project owner.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, revoke cleanup nền phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện revoke cleanup nền bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công revoke cleanup nền với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục revoke cleanup nền hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 051 — API key chỉ lưu hash

### Mục tiêu
Hoàn thành hạng mục api key chỉ lưu hash trong vai trò QA.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, api key chỉ lưu hash phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện api key chỉ lưu hash bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công api key chỉ lưu hash với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục api key chỉ lưu hash hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 052 — Không hiển thị key lần hai

### Mục tiêu
Hoàn thành hạng mục không hiển thị key lần hai trong vai trò DevOps.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, không hiển thị key lần hai phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện không hiển thị key lần hai bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công không hiển thị key lần hai với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục không hiển thị key lần hai hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 053 — Migration project cũ

### Mục tiêu
Hoàn thành hạng mục migration project cũ trong vai trò security owner.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, migration project cũ phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện migration project cũ bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công migration project cũ với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục migration project cũ hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 054 — Migration client secret

### Mục tiêu
Hoàn thành hạng mục migration client secret trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, migration client secret phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện migration client secret bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công migration client secret với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục migration client secret hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 055 — Profile migration

### Mục tiêu
Hoàn thành hạng mục profile migration trong vai trò SRE.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, profile migration phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện profile migration bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công profile migration với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục profile migration hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 056 — Error mapping

### Mục tiêu
Hoàn thành hạng mục error mapping trong vai trò data owner.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, error mapping phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện error mapping bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công error mapping với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục error mapping hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 057 — Return path allowlist

### Mục tiêu
Hoàn thành hạng mục return path allowlist trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, return path allowlist phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện return path allowlist bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công return path allowlist với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục return path allowlist hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 058 — Open redirect

### Mục tiêu
Hoàn thành hạng mục open redirect trong vai trò project owner.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, open redirect phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện open redirect bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công open redirect với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục open redirect hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 059 — Cookie HttpOnly Secure

### Mục tiêu
Hoàn thành hạng mục cookie httponly secure trong vai trò QA.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, cookie httponly secure phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện cookie httponly secure bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công cookie httponly secure với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục cookie httponly secure hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 060 — SameSite

### Mục tiêu
Hoàn thành hạng mục samesite trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, samesite phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện samesite bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công samesite với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục samesite hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 061 — CSP callback

### Mục tiêu
Hoàn thành hạng mục csp callback trong vai trò security owner.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, csp callback phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện csp callback bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công csp callback với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục csp callback hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 062 — Referrer policy

### Mục tiêu
Hoàn thành hạng mục referrer policy trong vai trò frontend boundary.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, referrer policy phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện referrer policy bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công referrer policy với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục referrer policy hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 063 — Không log credential

### Mục tiêu
Hoàn thành hạng mục không log credential trong vai trò SRE.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, không log credential phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện không log credential bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công không log credential với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục không log credential hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 064 — Redaction log

### Mục tiêu
Hoàn thành hạng mục redaction log trong vai trò data owner.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, redaction log phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện redaction log bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công redaction log với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục redaction log hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 065 — Correlation ID

### Mục tiêu
Hoàn thành hạng mục correlation id trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, correlation id phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện correlation id bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công correlation id với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục correlation id hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 066 — Auth metrics

### Mục tiêu
Hoàn thành hạng mục auth metrics trong vai trò project owner.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, auth metrics phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện auth metrics bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công auth metrics với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục auth metrics hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 067 — Latency metrics

### Mục tiêu
Hoàn thành hạng mục latency metrics trong vai trò QA.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, latency metrics phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện latency metrics bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công latency metrics với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục latency metrics hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 068 — Health không thay E2E

### Mục tiêu
Hoàn thành hạng mục health không thay e2e trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, health không thay e2e phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện health không thay e2e bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công health không thay e2e với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục health không thay e2e hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 069 — Retry query

### Mục tiêu
Hoàn thành hạng mục retry query trong vai trò security owner.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, retry query phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện retry query bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công retry query với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục retry query hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 070 — Backoff và jitter

### Mục tiêu
Hoàn thành hạng mục backoff và jitter trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, backoff và jitter phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện backoff và jitter bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công backoff và jitter với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục backoff và jitter hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 071 — Không retry mutation mù

### Mục tiêu
Hoàn thành hạng mục không retry mutation mù trong vai trò SRE.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, không retry mutation mù phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện không retry mutation mù bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công không retry mutation mù với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục không retry mutation mù hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 072 — CAS revision guard

### Mục tiêu
Hoàn thành hạng mục cas revision guard trong vai trò data owner.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, cas revision guard phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện cas revision guard bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công cas revision guard với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục cas revision guard hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 073 — createIfNotExists

### Mục tiêu
Hoàn thành hạng mục createifnotexists trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, createifnotexists phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện createifnotexists bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công createifnotexists với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục createifnotexists hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 074 — Idempotency key

### Mục tiêu
Hoàn thành hạng mục idempotency key trong vai trò project owner.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, idempotency key phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện idempotency key bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công idempotency key với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục idempotency key hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 075 — Concurrency bounded

### Mục tiêu
Hoàn thành hạng mục concurrency bounded trong vai trò QA.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, concurrency bounded phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện concurrency bounded bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công concurrency bounded với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục concurrency bounded hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 076 — Chunk mutation

### Mục tiêu
Hoàn thành hạng mục chunk mutation trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, chunk mutation phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện chunk mutation bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công chunk mutation với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục chunk mutation hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 077 — Rate limit upstream

### Mục tiêu
Hoàn thành hạng mục rate limit upstream trong vai trò security owner.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, rate limit upstream phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện rate limit upstream bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công rate limit upstream với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục rate limit upstream hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 078 — Google quota

### Mục tiêu
Hoàn thành hạng mục google quota trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, google quota phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện google quota bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công google quota với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục google quota hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 079 — Sanity quota

### Mục tiêu
Hoàn thành hạng mục sanity quota trong vai trò SRE.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, sanity quota phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện sanity quota bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công sanity quota với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục sanity quota hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 080 — Cloudflare runtime

### Mục tiêu
Hoàn thành hạng mục cloudflare runtime trong vai trò data owner.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, cloudflare runtime phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện cloudflare runtime bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công cloudflare runtime với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục cloudflare runtime hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 081 — Nhiều request đồng thời

### Mục tiêu
Hoàn thành hạng mục nhiều request đồng thời trong vai trò backend tích hợp.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, nhiều request đồng thời phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện nhiều request đồng thời bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công nhiều request đồng thời với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục nhiều request đồng thời hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 082 — Nhiều tab browser

### Mục tiêu
Hoàn thành hạng mục nhiều tab browser trong vai trò project owner.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, nhiều tab browser phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện nhiều tab browser bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công nhiều tab browser với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục nhiều tab browser hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 083 — Nhiều instance backend

### Mục tiêu
Hoàn thành hạng mục nhiều instance backend trong vai trò QA.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, nhiều instance backend phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện nhiều instance backend bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công nhiều instance backend với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục nhiều instance backend hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 084 — Shared state store

### Mục tiêu
Hoàn thành hạng mục shared state store trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, shared state store phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện shared state store bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công shared state store với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục shared state store hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 085 — Connection pool

### Mục tiêu
Hoàn thành hạng mục connection pool trong vai trò security owner.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, connection pool phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện connection pool bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công connection pool với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục connection pool hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 086 — HTTP timeout

### Mục tiêu
Hoàn thành hạng mục http timeout trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, http timeout phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện http timeout bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công http timeout với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục http timeout hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 087 — Circuit breaker

### Mục tiêu
Hoàn thành hạng mục circuit breaker trong vai trò SRE.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, circuit breaker phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện circuit breaker bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công circuit breaker với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục circuit breaker hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 088 — Load test 50 request

### Mục tiêu
Hoàn thành hạng mục load test 50 request trong vai trò data owner.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, load test 50 request phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện load test 50 request bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công load test 50 request với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục load test 50 request hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 089 — Load test 100 request

### Mục tiêu
Hoàn thành hạng mục load test 100 request trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, load test 100 request phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện load test 100 request bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công load test 100 request với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục load test 100 request hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 090 — Đếm duplicate apiUser

### Mục tiêu
Hoàn thành hạng mục đếm duplicate apiuser trong vai trò project owner.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, đếm duplicate apiuser phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện đếm duplicate apiuser bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công đếm duplicate apiuser với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục đếm duplicate apiuser hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 091 — Đếm duplicate device relation

### Mục tiêu
Hoàn thành hạng mục đếm duplicate device relation trong vai trò QA.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, đếm duplicate device relation phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện đếm duplicate device relation bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công đếm duplicate device relation với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục đếm duplicate device relation hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 092 — Đếm duplicate code

### Mục tiêu
Hoàn thành hạng mục đếm duplicate code trong vai trò DevOps.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, đếm duplicate code phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện đếm duplicate code bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công đếm duplicate code với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục đếm duplicate code hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 093 — Node.js

### Mục tiêu
Hoàn thành hạng mục node.js trong vai trò security owner.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, node.js phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện node.js bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công node.js với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục node.js hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 094 — Express

### Mục tiêu
Hoàn thành hạng mục express trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, express phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện express bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công express với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục express hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 095 — Next.js

### Mục tiêu
Hoàn thành hạng mục next.js trong vai trò SRE.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, next.js phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện next.js bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công next.js với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục next.js hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 096 — Nuxt

### Mục tiêu
Hoàn thành hạng mục nuxt trong vai trò data owner.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, nuxt phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện nuxt bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công nuxt với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục nuxt hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 097 — React frontend boundary

### Mục tiêu
Hoàn thành hạng mục react frontend boundary trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, react frontend boundary phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện react frontend boundary bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công react frontend boundary với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục react frontend boundary hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 098 — Vue frontend boundary

### Mục tiêu
Hoàn thành hạng mục vue frontend boundary trong vai trò project owner.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, vue frontend boundary phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện vue frontend boundary bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công vue frontend boundary với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục vue frontend boundary hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 099 — Flask

### Mục tiêu
Hoàn thành hạng mục flask trong vai trò QA.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, flask phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện flask bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công flask với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục flask hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 100 — Django

### Mục tiêu
Hoàn thành hạng mục django trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, django phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện django bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công django với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục django hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 101 — Go net http

### Mục tiêu
Hoàn thành hạng mục go net http trong vai trò security owner.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, go net http phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện go net http bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công go net http với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục go net http hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 102 — Laravel

### Mục tiêu
Hoàn thành hạng mục laravel trong vai trò frontend boundary.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, laravel phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện laravel bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công laravel với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục laravel hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 103 — Cloudflare Worker

### Mục tiêu
Hoàn thành hạng mục cloudflare worker trong vai trò SRE.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, cloudflare worker phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện cloudflare worker bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công cloudflare worker với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục cloudflare worker hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 104 — Spring

### Mục tiêu
Hoàn thành hạng mục spring trong vai trò data owner.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, spring phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện spring bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công spring với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục spring hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 105 — ASP.NET Core

### Mục tiêu
Hoàn thành hạng mục asp.net core trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, asp.net core phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện asp.net core bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công asp.net core với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục asp.net core hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 106 — Mobile browser

### Mục tiêu
Hoàn thành hạng mục mobile browser trong vai trò project owner.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, mobile browser phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện mobile browser bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công mobile browser với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục mobile browser hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 107 — Responsive chooser

### Mục tiêu
Hoàn thành hạng mục responsive chooser trong vai trò QA.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, responsive chooser phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện responsive chooser bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công responsive chooser với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục responsive chooser hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 108 — Keyboard navigation

### Mục tiêu
Hoàn thành hạng mục keyboard navigation trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, keyboard navigation phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện keyboard navigation bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công keyboard navigation với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục keyboard navigation hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 109 — Screen reader

### Mục tiêu
Hoàn thành hạng mục screen reader trong vai trò security owner.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, screen reader phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện screen reader bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công screen reader với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục screen reader hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 110 — Profile privacy

### Mục tiêu
Hoàn thành hạng mục profile privacy trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, profile privacy phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện profile privacy bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công profile privacy với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục profile privacy hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 111 — Data retention

### Mục tiêu
Hoàn thành hạng mục data retention trong vai trò SRE.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, data retention phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện data retention bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công data retention với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục data retention hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 112 — Multi tenant

### Mục tiêu
Hoàn thành hạng mục multi tenant trong vai trò data owner.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, multi tenant phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện multi tenant bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công multi tenant với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục multi tenant hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 113 — Tenant isolation

### Mục tiêu
Hoàn thành hạng mục tenant isolation trong vai trò backend tích hợp.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, tenant isolation phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện tenant isolation bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công tenant isolation với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục tenant isolation hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 114 — Production deploy

### Mục tiêu
Hoàn thành hạng mục production deploy trong vai trò project owner.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, production deploy phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện production deploy bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công production deploy với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục production deploy hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 115 — Post deploy smoke

### Mục tiêu
Hoàn thành hạng mục post deploy smoke trong vai trò QA.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, post deploy smoke phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện post deploy smoke bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công post deploy smoke với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục post deploy smoke hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 116 — Rollback

### Mục tiêu
Hoàn thành hạng mục rollback trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, rollback phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện rollback bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công rollback với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục rollback hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 117 — Runbook invalid client

### Mục tiêu
Hoàn thành hạng mục runbook invalid client trong vai trò security owner.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, runbook invalid client phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện runbook invalid client bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công runbook invalid client với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục runbook invalid client hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 118 — Runbook invalid grant

### Mục tiêu
Hoàn thành hạng mục runbook invalid grant trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, runbook invalid grant phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện runbook invalid grant bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công runbook invalid grant với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục runbook invalid grant hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 119 — Runbook key lộ

### Mục tiêu
Hoàn thành hạng mục runbook key lộ trong vai trò SRE.
Hạng mục liên quan tới /api/auth/projects/:id/revoke.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, runbook key lộ phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/revoke.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện runbook key lộ bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/revoke bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công runbook key lộ với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/revoke.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/revoke đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục runbook key lộ hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 120 — Runbook revoke chậm

### Mục tiêu
Hoàn thành hạng mục runbook revoke chậm trong vai trò data owner.
Hạng mục liên quan tới /api/auth/health.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, runbook revoke chậm phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/health.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện runbook revoke chậm bằng contract đã đăng ký.
2. Gọi /api/auth/health bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công runbook revoke chậm với project test.
- Xác nhận request đi đúng /api/auth/health.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/health đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục runbook revoke chậm hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 121 — Support ticket

### Mục tiêu
Hoàn thành hạng mục support ticket trong vai trò backend tích hợp.
Hạng mục liên quan tới /oauth/google.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, support ticket phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/google.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện support ticket bằng contract đã đăng ký.
2. Gọi /oauth/google bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công support ticket với project test.
- Xác nhận request đi đúng /oauth/google.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/google đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục support ticket hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 122 — Contract fixture

### Mục tiêu
Hoàn thành hạng mục contract fixture trong vai trò project owner.
Hạng mục liên quan tới /oauth/consent.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, contract fixture phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /oauth/consent.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện contract fixture bằng contract đã đăng ký.
2. Gọi /oauth/consent bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công contract fixture với project test.
- Xác nhận request đi đúng /oauth/consent.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /oauth/consent đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục contract fixture hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 123 — Schema validation

### Mục tiêu
Hoàn thành hạng mục schema validation trong vai trò QA.
Hạng mục liên quan tới /api/auth/oauth/token.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, schema validation phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/oauth/token.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện schema validation bằng contract đã đăng ký.
2. Gọi /api/auth/oauth/token bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công schema validation với project test.
- Xác nhận request đi đúng /api/auth/oauth/token.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/oauth/token đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục schema validation hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 124 — Security review

### Mục tiêu
Hoàn thành hạng mục security review trong vai trò DevOps.
Hạng mục liên quan tới /api/auth/userinfo.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, security review phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/userinfo.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện security review bằng contract đã đăng ký.
2. Gọi /api/auth/userinfo bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công security review với project test.
- Xác nhận request đi đúng /api/auth/userinfo.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/userinfo đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục security review hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 125 — Go live sign off

### Mục tiêu
Hoàn thành hạng mục go live sign off trong vai trò security owner.
Hạng mục liên quan tới /api/auth/project-info.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, go live sign off phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/project-info.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện go live sign off bằng contract đã đăng ký.
2. Gọi /api/auth/project-info bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công go live sign off với project test.
- Xác nhận request đi đúng /api/auth/project-info.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/project-info đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục go live sign off hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 126 — Tài liệu bên thứ ba

### Mục tiêu
Hoàn thành hạng mục tài liệu bên thứ ba trong vai trò frontend boundary.
Hạng mục liên quan tới /api/auth/allusers.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, tài liệu bên thứ ba phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/allusers.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện tài liệu bên thứ ba bằng contract đã đăng ký.
2. Gọi /api/auth/allusers bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công tài liệu bên thứ ba với project test.
- Xác nhận request đi đúng /api/auth/allusers.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/allusers đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục tài liệu bên thứ ba hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 127 — Changelog contract

### Mục tiêu
Hoàn thành hạng mục changelog contract trong vai trò SRE.
Hạng mục liên quan tới /api/auth/projects.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, changelog contract phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện changelog contract bằng contract đã đăng ký.
2. Gọi /api/auth/projects bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công changelog contract với project test.
- Xác nhận request đi đúng /api/auth/projects.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục changelog contract hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

## Playbook 128 — Checklist cuối

### Mục tiêu
Hoàn thành hạng mục checklist cuối trong vai trò data owner.
Hạng mục liên quan tới /api/auth/projects/:id/rotate-key.
Mục tiêu là giữ contract hiện hành, bảo vệ credential và tạo evidence có thể kiểm tra.
Không thêm endpoint mới nếu contract hiện tại đã đủ.

### Bối cảnh
Trong OAuth Account Chooser, checklist cuối phải tách browser, backend website và APIUYTIN.
Browser không được biết apiKey; backend kiểm tra state, đổi code và tạo app session.
APIUYTIN giữ transaction, device account, project relation và one-time code.
Profile phải dùng APIUYTIN id hoặc sub làm identity ổn định.
Mutation cần CAS, revision hoặc idempotency guard.

### Chuẩn bị
1. Xác nhận environment và endpoint /api/auth/projects/:id/rotate-key.
2. Xác nhận project, clientId, callback và secret version cùng environment.
3. Chuẩn bị requestId và log redaction.
4. Chuẩn bị fixture không có key, code, token hoặc dữ liệu thật.
5. Xác nhận state store và session store dùng được ở mọi instance.
6. Xác nhận timeout và connection pool có giới hạn.
7. Xác nhận owner biết rotate và revoke nếu thao tác làm đổi trạng thái.

### Quy trình
1. Thực hiện checklist cuối bằng contract đã đăng ký.
2. Gọi /api/auth/projects/:id/rotate-key bằng method và header đúng.
3. Kiểm tra HTTP status trước khi đọc dữ liệu.
4. Validate JSON và kiểu dữ liệu trước khi persist.
5. Nếu là OAuth, kiểm tra state trước token exchange.
6. Nếu là code, không retry sau unknown outcome.
7. Nếu là key, chỉ dùng ở server và không log.
8. Nếu là profile, giữ provider user ID ổn định.
9. Nếu là query, retry bounded với exponential backoff và jitter.
10. Nếu là mutation, reread trạng thái khi conflict.
11. Ghi evidence đã redact.

### Kiểm soát bảo mật
Không đưa apiKey, access token, authorization code hoặc raw state vào browser storage.
Không gửi client_secret trong token body.
Không dùng email hoặc avatar thay cho APIUYTIN id/sub.
Không log Authorization header hoặc full callback URL.
Không cho return path thành absolute URL ngoài allowlist.
Không dùng wildcard redirect URI.
Không tạo fan-out vô hạn.
Không dùng production credential cho load test.

### Happy path
- Chạy thành công checklist cuối với project test.
- Xác nhận request đi đúng /api/auth/projects/:id/rotate-key.
- Xác nhận response có status và schema đúng.
- Xác nhận profile có id, sub và verified_email đúng kiểu.
- Xác nhận log chỉ có requestId, status, latency và error code sạch.
- Xác nhận thay đổi đúng phạm vi.
- Xác nhận không tạo duplicate record.

### Negative path
- Thiếu field bắt buộc.
- Field rỗng hoặc sai kiểu.
- Credential sai hoặc credential cũ.
- Redirect mismatch.
- State mismatch hoặc state expired.
- Code expired hoặc code replay.
- Project revoked.
- Timeout, 429 và 5xx.
- Hai request đồng thời.
- Browser nhiều tab.
- Backend nhiều instance.

### Tiêu chí nghiệm thu
- [ ] Contract của /api/auth/projects/:id/rotate-key đã được snapshot.
- [ ] ApiKey không xuất hiện trong browser, log hoặc artifact.
- [ ] Error mapping không lộ dữ liệu nội bộ.
- [ ] Retry có giới hạn và không retry mutation mù.
- [ ] CAS hoặc idempotency đã kiểm tra nếu có mutation.
- [ ] Profile mapping dùng APIUYTIN id/sub.
- [ ] Evidence đã gắn vào release record.
- [ ] Owner và reviewer đã biết trade-off.

### Khi fail
Dừng rollout nếu lỗi liên quan credential, redirect, state hoặc replay.
Giữ requestId, timestamp, status, latency và error code đã redact.
Không gửi plaintext secret cho support.
Nếu nghi apiKey lộ, rotate; nếu project không tin cậy, revoke.
Sau khi sửa, chạy lại happy path, negative path và smoke.

### Evidence
- Environment.
- Project ID nếu policy cho phép.
- Endpoint.
- Method.
- Status.
- Latency.
- Request ID.
- Schema assertion.
- Security scan.
- Concurrency result nếu có.
- Người thực hiện.
- Người review.

### Kết luận playbook
Hạng mục checklist cuối hoàn tất khi request, response, security assertion và failure path đã pass.
Tài liệu và fixture phải cập nhật cùng change record.
Health check đơn lẻ không phải bằng chứng cho login E2E.

# 15. Kết luận và sign-off

Tích hợp đúng nghĩa là browser mở chooser, APIUYTIN cấp code một lần, backend đổi code bằng clientId và apiKey, sau đó website tạo session nội bộ.
Google chỉ là upstream dùng khi cần bootstrap account hoặc device; Google subject và token không trở thành contract của bên thứ ba.
APIUYTIN id và sub là identity ổn định cho mapping user.
State, exact redirect, one-time code, CAS, revision, retry bounded và secret redaction là control bắt buộc.
Async giúp request độc lập chạy đồng thời có kiểm soát; nó không xóa rate limit.
Rotate key làm key cũ mất hiệu lực; revoke làm project fail closed trước cleanup background.

## Checklist cuối
- [ ] Project đúng environment và active.
- [ ] Callback HTTPS exact.
- [ ] clientId đúng.
- [ ] apiKey server-only.
- [ ] State random, bound, TTL và one-time.
- [ ] Browser không biết apiKey.
- [ ] Token body chỉ có client_id, api_key, code, redirect_uri.
- [ ] client_secret bị reject.
- [ ] Code replay bị reject.
- [ ] Profile id/sub là APIUYTIN identity.
- [ ] Không có Google token.
- [ ] Userinfo dùng Bearer access token.
- [ ] Rotate pass và key cũ rejected.
- [ ] Revoke fail closed.
- [ ] Cleanup revoke được monitor.
- [ ] Retry bounded.
- [ ] Concurrency bounded.
- [ ] Load test dùng project test.
- [ ] Log redact.
- [ ] UI keyboard, screen reader và responsive pass.
- [ ] Production smoke pass.
- [ ] Owner, security và release sign-off.

## Không được làm
- Không đưa apiKey vào frontend.
- Không dùng client_secret.
- Không lưu Google token.
- Không dùng Google subject làm provider ID.
- Không bỏ state hoặc exact redirect.
- Không retry code mù.
- Không dùng Promise.all vô hạn.
- Không dùng production key cho load test.
- Không coi health 200 là E2E.
- Không gửi credential trong support ticket.

## Support ticket sạch
Gửi requestId, timestamp, environment, endpoint, status, error code, latency, flow step và repro rate.
Không gửi apiKey, access_token, code, state raw, cookie, Google token hoặc full callback URL.

## Changelog
Ngày cập nhật:
Environment:
Endpoint ảnh hưởng:
Contract thay đổi:
Security test:
Load test:
Production smoke:
Rollback:
Owner:
Reviewer:

Tài liệu kết thúc.
