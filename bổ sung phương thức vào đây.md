# APIUYTIN OAuth Account Chooser — Hướng dẫn method cho bên thứ ba

Tài liệu đi kèm với [hướng dẫn tích hợp OAuth APIUYTIN đầy đủ](HUONG_DAN_TICH_HOP_APIUYTIN_OAUTH_CHOOSER.md). File này mô tả ranh giới method và contract request để website bên thứ ba triển khai.

Ví dụ chỉ dùng placeholder. Website tích hợp tự chịu trách nhiệm bảo vệ API key, lưu state, tạo session nội bộ và quản lý thời gian lưu profile.

## Contract cập nhật 2026-11-08

- `/oauth/google` yêu cầu `client_id`, `redirect_uri` HTTPS đã đăng ký và `state` không rỗng. State tối đa 2048 ký tự và phải do bên tích hợp sinh bằng CSPRNG.
- Token exchange chỉ chấp nhận đúng bốn field `client_id`, `api_key`, `code`, `redirect_uri`. `client_secret` hoặc field lạ trả `invalid_client`.
- `apiKey` chỉ trả plaintext một lần khi tạo project hoặc rotate key. `/session`, `GET /projects`, `project-info` và mọi response khác không trả lại key.
- Revoke đánh dấu project revoked trước, nên token/userinfo/project API bị chặn ngay cả khi cleanup nền chưa hoàn tất. Nếu request revoke timeout, đọc lại trạng thái trước khi thử thao tác khác.
- APIUYTIN profile dùng `id`/`sub` riêng của APIUYTIN. `verified_email` được chuẩn hóa từ thông tin email đã xác minh của Google; Google subject không lộ ra integration.
- Device cookie được kiểm tra cả token và bản ghi server-side còn hạn. Cookie hết hạn hoặc không còn bản ghi hợp lệ không được dùng để mở chooser.
- APIUYTIN I/O có timeout. Query transient có retry giới hạn; mutation không retry mù. Cleanup delete dùng ID xác định, chunk tối đa 50 và tối đa 6 chunk đồng thời.

## 1. Cấu hình

| Biến | Runtime | Mục đích |
| --- | --- | --- |
| APIUYTIN_CLIENT_ID | Server; có thể đưa vào public config | Định danh project dùng trong OAuth và token request |
| APIUYTIN_API_KEY | Chỉ server | Credential project cho token và project API |
| APIUYTIN_REDIRECT_URI | Server và URL redirect | Callback HTTPS đã đăng ký chính xác |
| APIUYTIN_API_BASE | Server | Mặc định là https://apiuytin.pages.dev/api/auth |
| APIUYTIN_OAUTH_START | URL điều hướng | Mặc định là https://apiuytin.pages.dev/oauth/google |

Kiểm tra cấu hình bắt buộc lúc server khởi động. Không đưa APIUYTIN_API_KEY vào NEXT_PUBLIC_*, VITE_*, REACT_APP_*, HTML, browser JavaScript, mobile bundle, cookie client hoặc query string. Dùng project riêng cho staging và production.

## 2. Các method đăng nhập người dùng

### createState()

**Mục đích:** Tạo nonce khó đoán cho một lần đăng nhập.

**Runtime:** Backend.

**Input:** Không có.

**Output:** Chuỗi URL-safe có ít nhất 128 bit entropy.

~~~js
import { randomBytes } from "node:crypto";

export function createState() {
  return randomBytes(32).toString("base64url");
}
~~~

Không tin state do caller tự truyền. Không dùng timestamp, email, bộ đếm hoặc một state dùng chung cho mọi người dùng.

### savePendingLogin(session, state, returnTo)

**Mục đích:** Gắn state với session browser hiện tại và một đường dẫn nội bộ được phép.

**Runtime:** Session store backend, Redis hoặc database.

**Dữ liệu lưu:** state, createdAt, browser session binding và returnTo đã kiểm tra.

**Chính sách:**

- TTL khoảng 10 phút.
- Mỗi tab có record riêng.
- Giới hạn số record đang chờ trên mỗi session.
- Xóa record hết hạn trước khi thêm record mới.
- Không redirect nếu không lưu được state.
- Không lưu API key, access token, email hoặc profile trong state record.

### buildLoginUrl(state, config)

**Mục đích:** Tạo URL redirect tới APIUYTIN. Method này không gọi API và không cần API key.

~~~js
export function buildLoginUrl(state, config) {
  const url = new URL("https://apiuytin.pages.dev/oauth/google");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}
~~~

Kiểm tra callback cấu hình là HTTPS và đã được đăng ký trên đúng project. Dùng URLSearchParams thay vì tự nối query string.

### startLoginRoute(request, response, session)

**Mục đích:** Bắt đầu một OAuth transaction.

**Trình tự:**

1. Yêu cầu hoặc tạo session browser của website tích hợp.
2. Sinh state mới bằng createState().
3. Kiểm tra returnTo và lưu state bằng savePendingLogin().
4. Lưu session thành công trước khi redirect.
5. Redirect tới URL do buildLoginUrl(state, config) tạo.
6. Không gắn API key vào URL hoặc HTML.

### validateAndConsumeState(session, returnedState)

**Mục đích:** Từ chối callback giả mạo, hết hạn hoặc bị replay.

**Điều kiện kiểm tra:**

- returnedState là chuỗi không rỗng.
- Có record khớp chính xác trong session của browser hiện tại.
- Record chưa hết hạn.
- Record chưa được consume.
- Record thuộc session đã bắt đầu login.

Dùng thao tác delete/CAS nguyên tử nếu session store hỗ trợ. Nếu kiểm tra thất bại, trả lỗi và không gọi token endpoint.

### parseCallback(query)

**Mục đích:** Đọc query callback như dữ liệu không đáng tin.

**Input:** code, state và error tùy chọn.

**Trình tự:**

1. Validate và consume state.
2. Nếu error là access_denied, trả kết quả cancelled.
3. Nếu có error khác, trả authorization failure.
4. Nếu không có error, yêu cầu code không rỗng.
5. Không giả định thứ tự query parameter.
6. Không ghi toàn bộ callback URL vào log.

### exchangeAuthorizationCode(code, config, fetchImpl)

**Mục đích:** Đổi one-time code lấy APIUYTIN access token và profile.

**Runtime:** Chỉ backend.

**Endpoint:** POST https://apiuytin.pages.dev/api/auth/oauth/token

**Body:**

~~~json
{
  "client_id": "pk_YOUR_CLIENT_ID",
  "api_key": "CHUOTAPI_SERVER_SIDE_KEY",
  "code": "ONE_TIME_CODE",
  "redirect_uri": "https://app.example.com/auth/apiuytin/callback"
}
~~~

~~~js
export async function exchangeAuthorizationCode(code, config, fetchImpl = fetch) {
  const response = await fetchImpl(
    "https://apiuytin.pages.dev/api/auth/oauth/token",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        api_key: config.apiKey,
        code,
        redirect_uri: config.redirectUri
      }),
      signal: AbortSignal.timeout(8000)
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("APIUYTIN token exchange failed");
    error.code = typeof payload?.error === "string"
      ? payload.error
      : "upstream_error";
    error.status = response.status;
    throw error;
  }

  if (
    typeof payload?.access_token !== "string" ||
    payload.token_type !== "Bearer" ||
    typeof payload.expires_in !== "number" ||
    !payload.user ||
    typeof payload.user.id !== "string"
  ) {
    throw new Error("Invalid APIUYTIN token response");
  }
  return payload;
}
~~~

Không gửi client_secret. Không tự động gửi lại cùng code sau timeout: server có thể đã consume code. Nếu không biết request đã hoàn tất chưa, bắt đầu transaction đăng nhập mới.

### validateTokenResponse(payload)

Yêu cầu các điều kiện sau:

- access_token là chuỗi không rỗng.
- token_type bằng Bearer.
- expires_in là số dương; giá trị hiện tại là 3600 giây.
- user là object.
- user.id là APIUYTIN ID không rỗng.
- user.sub bằng cùng APIUYTIN ID.

Các chuỗi profile tùy chọn có thể rỗng. Contract hiện tại không cấp refresh_token. Nếu dữ liệu sai, từ chối và không tạo local session.

### mapApiuytinProfile(user)

Ánh xạ các trường profile cần dùng trong ứng dụng:

~~~json
{
  "id": "APIUYTIN_STABLE_ID",
  "sub": "APIUYTIN_STABLE_ID",
  "email": "user@example.com",
  "name": "User Name",
  "picture": "https://example.com/avatar.jpg",
  "given_name": "User",
  "family_name": "Name",
  "locale": "vi",
  "verified_email": true
}
~~~

Dùng id hoặc sub làm định danh ổn định. Không thay bằng Google subject. Giữ verified_email ở kiểu boolean; không tự suy ra true khi thiếu giá trị.

### createLocalSession(session, profile)

**Điều kiện trước khi chạy:** state hợp lệ và đã consume; token exchange thành công; response và profile đã được validate; profile.id không rỗng.

**Thao tác:**

- Đổi session ID sau khi đăng nhập để chống session fixation.
- Chỉ lưu các field profile ứng dụng cần dùng.
- Chỉ lưu access token ở server nếu cần gọi userinfo.
- Không lưu Google access token hoặc refresh token.
- Không đánh dấu đăng nhập thành công khi bất kỳ bước kiểm tra nào thất bại.

### clearOAuthCallbackUrl(returnTo)

**Mục đích:** Xóa code và state khỏi URL browser.

Sau khi xử lý, trả HTTP 303 tới local path đã lưu trong state record. Không redirect tới hostname từ query callback. Tránh tải analytics bên thứ ba khi authorization code còn trên thanh địa chỉ.

## 3. Method profile và project

### getUserinfo(accessToken)

- Endpoint: GET /api/auth/userinfo.
- Header: Authorization: Bearer ACCESS_TOKEN.
- Thành công: HTTP 200 và profile object trực tiếp.
- 401 unauthorized: token thiếu hoặc không hợp lệ.
- 401 token_expired: yêu cầu người dùng đăng nhập lại.
- 401 project_revoked: ngừng dùng project này.
- Access token hết hạn sau 3600 giây.
- Không có contract refresh token.

### getProjectInfo(apiKey)

- Endpoint: GET /api/auth/project-info.
- Header: Authorization: Bearer API_KEY.
- Runtime: chỉ backend.
- Response gồm project ID, name, clientId, redirectUri và status.
- Response không có plaintext apiKey hoặc apiKeyHash.

### getAllUsers(apiKey)

- Endpoint: GET /api/auth/allusers.
- Header: Authorization: Bearer API_KEY.
- Runtime: backend service có nhu cầu đọc user của project.
- Response chỉ gồm user đã đăng nhập vào project cụ thể.
- Response gồm profile fields và thời điểm login đầu/cuối.
- Kiểm tra quyền ứng dụng trước khi gửi danh sách về browser.
- Không lưu hoặc log toàn bộ kết quả nếu không có nhu cầu retention.

## 4. Method owner dashboard

Các thao tác này cần cookie owner session của dashboard APIUYTIN. Chúng không dùng end-user access token hoặc project API key. Website tích hợp thông thường tạo và quản lý project trong dashboard APIUYTIN.

| Method | Endpoint | Input | Kết quả quan trọng |
| --- | --- | --- | --- |
| getOwnerSession | GET /api/auth/session | Owner cookie | Owner và project active; không có key plaintext |
| createProject | POST /api/auth/projects | name, redirectUri | HTTP 201; key trả một lần |
| listProjects | GET /api/auth/projects | Owner cookie | Project active; không có key |
| updateRedirectUri | PATCH /api/auth/projects/:id | redirectUri | Project đã cập nhật |
| rotateProjectKey | POST /api/auth/projects/:id/rotate-key | Project ID | Key mới trả một lần |
| revokeProject | POST /api/auth/projects/:id/revoke | Project ID | Trạng thái revoke và cleanup scheduled |
| logoutOwner | POST /api/auth/logout | Owner cookie | Xóa dashboard cookie |

### createProject(name, redirectUri)

Body dùng camelCase:

~~~json
{
  "name": "Example Web",
  "redirectUri": "https://app.example.com/auth/apiuytin/callback"
}
~~~

redirectUri phải dùng HTTPS, không có username/password hoặc fragment. Lưu project.apiKey từ response vào secret manager ngay. Danh sách project không trả lại key.

### updateRedirectUri(projectId, redirectUri)

~~~http
PATCH /api/auth/projects/PROJECT_ID
Content-Type: application/json
Cookie: apiuytin_session=...

{"redirectUri":"https://app.example.com/auth/apiuytin/callback"}
~~~

Triển khai callback handler và config mới trước khi chuyển traffic. OAuth start và token exchange phải dùng cùng callback đã đăng ký.

### rotateProjectKey(projectId)

~~~http
POST /api/auth/projects/PROJECT_ID/rotate-key
Cookie: apiuytin_session=...
~~~

Chỉ owner được rotate. Key mới trả một lần trong project.apiKey. Key hiện tại bị thay sau revision-guarded write. Lưu key mới, cập nhật mọi server runtime, rồi gọi project-info để kiểm tra. Không retry mù sau timeout.

### revokeProject(projectId)

~~~http
POST /api/auth/projects/PROJECT_ID/revoke
Cookie: apiuytin_session=...
~~~

Project được đánh dấu revoked trước khi dọn authorization code, project-user records và OAuth transaction liên quan. Trên Pages, cleanup được schedule bằng waitUntil. cleanupScheduled chỉ biểu thị đã schedule, không xác nhận dọn xong.

## 5. HTTP method dùng chung

### apiuytinRequest(path, options)

HTTP adapter backend nên:

1. Chỉ cho phép origin https://apiuytin.pages.dev.
2. Đặt timeout cho request.
3. Dùng JSON content type khi gửi JSON.
4. Chỉ đọc response body một lần.
5. Kiểm tra response.ok trước khi lấy success fields.
6. Chuẩn hóa lỗi thành error type nội bộ.
7. Redact Authorization, api_key, code, cookie và access_token.

Chỉ gắn API key dạng Bearer cho project-info/allusers. Token exchange dùng JSON body đã công bố. Không đặt API key trong URL.

### normalizeApiError(status, payload)

| API error | Hành động tích hợp |
| --- | --- |
| invalid_client | Dừng; kiểm tra Client ID, API key, project active và callback |
| invalid_grant | Không retry code; bắt đầu login mới |
| invalid_api_key | Kiểm tra key hiện tại sau rotation |
| unauthorized | Kiểm tra endpoint cần owner cookie hay user access token |
| token_expired | Đăng nhập lại; không có refresh token |
| project_revoked | Dừng request dùng project |
| access_denied | Trả người dùng về trạng thái chưa đăng nhập |
| key_rotation_conflict | Không retry mù; đọc lại project và xác nhận key đang được secret manager dùng |
| oauth_unavailable | Dừng flow hiện tại, backoff ngắn rồi tạo transaction OAuth mới |
| internal_error | Ghi correlation ID và điều tra |

Không trả stack trace hoặc credential cho browser.

### boundedReadRetry(operation)

Chỉ retry có giới hạn đối với request đọc. Policy phù hợp là tối đa ba lần khi gặp 429/5xx transient, exponential delay có jitter và tổng timeout. Dừng ngay với 4xx không thể khắc phục bằng retry.

Không áp dụng cho token exchange, create project, rotate key hoặc mutation. Request timeout không chứng minh mutation thất bại.

### redactAuthLogs(event)

Các field có thể ghi: operation name, environment alias, response status, duration và random correlation ID.

Ẩn hoặc bỏ:

- API key và access token.
- Authorization header và cookie.
- Authorization code và OAuth state.
- Callback URL đầy đủ và token request body.
- Google access/refresh token.
- Email/profile, trừ khi có mục đích được ghi nhận.

## 6. Retry an toàn

| Operation | Retry tự động | Lý do |
| --- | --- | --- |
| GET health hoặc discovery | Có giới hạn | Read-only |
| GET project-info/allusers | Có giới hạn với lỗi transient | Read-only |
| GET userinfo | Không retry 401 | Token có thể hết hạn hoặc bị revoke |
| POST oauth/token | Không retry cùng code | Code one-time, có thể đã consume |
| POST projects | Không retry mù | Project và key có thể đã tạo |
| POST rotate-key | Không retry mù | Mỗi lần rotate thay key hiện tại |
| POST revoke | Kiểm tra status sau timeout | Project có thể đã revoked |
| PATCH redirect URI | Đọc lại project khi không rõ kết quả | Update có thể đã áp dụng |

APIUYTIN retry query Sanity transient có giới hạn, không retry mutation mù. Revoke cleanup chia chunk tối đa 50 mutation mỗi request, tối đa sáu chunk song song. Những giới hạn này không bỏ qua quota Google, Sanity hoặc Cloudflare.

## 7. Checklist tích hợp backend

- Client ID, API key và callback thuộc đúng project/environment.
- API key chỉ nằm trong secret manager/backend.
- Mỗi login có state ngẫu nhiên riêng và được lưu server-side.
- State có TTL ngắn và consume một lần.
- access_denied không gọi token endpoint.
- Token endpoint nhận client_id, api_key, code và redirect_uri.
- Request không gửi client_secret.
- Không tạo local session trước token/profile validation.
- Dùng APIUYTIN id làm định danh.
- Dọn code/state khỏi callback URL bằng redirect nội bộ.
- Log đã ẩn API key, code, access token, cookie, state và authorization header.
- Sau rotate, kiểm tra bằng project-info.
- Revoke phải chặn truy cập project dù cleanup nền chưa hoàn tất.

## 8. Ranh giới tích hợp

APIUYTIN dùng Google khi thêm account hoặc xác thực device. Website bên thứ ba chỉ nhận APIUYTIN profile sau khi người dùng chọn account và đồng ý.

Website tích hợp tự triển khai browser session, CSRF state, callback route, app authorization, tạo account local, privacy/retention policy, secret manager, rate limit và monitoring.
