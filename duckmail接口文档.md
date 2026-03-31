# DuckMail API 接口文档（基于本注册机实现）

本文档根据项目内 `openai_reg.py` 对 DuckMail 的实际调用整理，**非官方文档**。若服务端行为变更，请以 DuckMail 实际响应为准。

## 1. 基础信息

| 项 | 值 |
|----|-----|
| Base URL | `https://api.duckmail.sbs` |
| 数据风格 | 与 [mail.gw](https://api.mail.gw) 类似，部分响应使用 **Hydra / API Platform** 集合格式（如 `hydra:member`） |
| 本项目中 HTTP 客户端 | `curl_cffi.requests`，`impersonate="chrome"`，超时多为 15s |

---

## 2. 认证方式（两种）

### 2.1 API Key（Bearer，用于管理端）

- **Header**：`Authorization: Bearer <duckmail_key>`
- **用途**：列出**已验证**域名、创建账户时部分场景需带此头（见下文 `/accounts`）。
- 项目中 key 形态示例：`dk_xxx`（见 README）。

### 2.2 邮箱 JWT（Bearer，用于读信）

- 通过 `POST /token` 用邮箱地址 + 密码换取。
- **Header**：`Authorization: Bearer <token>`
- **用途**：`GET /messages`、`GET /messages/{id}`。

---

## 3. 接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/domains` | 获取可用域名列表 |
| POST | `/accounts` | 创建临时邮箱账户 |
| POST | `/token` | 用邮箱密码换取 JWT |
| GET | `/messages` | 列出邮件（需邮箱 JWT） |
| GET | `/messages/{id}` | 读取单封邮件详情（需邮箱 JWT） |

---

## 4. 各接口说明

### 4.1 `GET /domains`

**用途**：创建随机邮箱前选取域名。

**请求头**

| 模式 | Headers |
|------|---------|
| 带 API Key | `Authorization: Bearer <duckmail_key>`，`Accept: application/json` |
| 公共模式（无 Key） | `Accept: application/json` |

**成功响应（对象形态，项目中的解析方式）**

- 根对象含 **`hydra:member`**：域名对象数组。
- 带 Key 时：仅使用 `isVerified === true` 的项，读取字段 **`domain`**。
- 公共模式：遍历 `hydra:member`（或兼容列表根），使用满足 **`domain` 非空**、**`isActive` 默认 true**、**`isPrivate` 默认 false** 的项。

**说明**：公共模式与带 Key 模式对域名字段的筛选条件在代码中不一致（已验证 vs 活跃/非私有），使用时以实际返回为准。

---

### 4.2 `POST /accounts`

**用途**：在选定域名上创建邮箱账户。

**请求头**

| 模式 | Headers |
|------|---------|
| 带 API Key | `Authorization: Bearer <duckmail_key>`，`Content-Type: application/json`，`Accept: application/json` |
| 公共模式 | `Content-Type: application/json`，`Accept: application/json`（无 API Key） |

**请求体（JSON）**

| 模式 | 字段 |
|------|------|
| 带 API Key | `address`（完整邮箱）、`password`、`expiresIn`（项目中为 **86400** 秒，即 24 小时） |
| 公共模式 | `address`、`password`（无 `expiresIn`） |

**成功状态码**：项目中按 **`200` 或 `201`** 视为创建成功。

---

### 4.3 `POST /token`

**用途**：用刚创建的 `address` + `password` 换取后续读信用的 JWT。

**请求头**

```
Content-Type: application/json
Accept: application/json
```

**请求体（JSON）**

```json
{
  "address": "user@example.com",
  "password": "<创建账户时使用的密码>"
}
```

**成功响应（项目中使用的字段）**

- HTTP `200`
- JSON 根对象字段 **`token`**：字符串，即邮箱 JWT。

---

### 4.4 `GET /messages`

**用途**：轮询收件箱列表，用于发现新邮件。

**请求头**

```
Authorization: Bearer <token>
Accept: application/json
```

其中 `<token>` 为 `/token` 返回的 JWT，**不是** API Key。

**成功响应（项目中的解析方式）**

- 根为**数组**：直接作为邮件列表；或
- 根为**对象**：取 **`hydra:member`** 或 **`messages`** 作为列表。

列表项至少需包含 **`id`**（字符串），用于请求详情接口。

---

### 4.5 `GET /messages/{id}`

**用途**：读取单封邮件，提取正文与发件人以匹配验证码或验证链接。

**请求头**：同 `/messages`。

**成功响应（项目中使用的字段）**

| 字段路径 | 说明 |
|----------|------|
| `from.address` | 发件人邮箱 |
| `subject` | 主题 |
| `intro` | 摘要（验证码轮询 `_poll_hydra_otp` 会拼接） |
| `text` | 纯文本正文 |
| `html` | HTML 正文；若为**数组**，则拼接为多行字符串 |

业务逻辑中会将 `subject`、`intro`、`text`、`html` 拼成一段文本，用正则提取 6 位数字验证码或验证链接（见 `get_oai_code` / `get_oai_verify`）。

---

## 5. 本注册机中的典型流程

1. **`GET /domains`** → 随机选一个可用域名。  
2. 生成本地部分随机前缀 + 随机密码。  
3. **`POST /accounts`** → 创建 `address` / `password`（带 Key 时带 `expiresIn`）。  
4. **`POST /token`** → 得到 `token`。  
5. 内部将凭证存为前缀 **`duckmail:`** + JWT，供后续步骤使用。  
6. 轮询 **`GET /messages`**，对新 **`id`** 调用 **`GET /messages/{id}`**，直到匹配 OpenAI 邮件并解析 OTP 或验证链接。

---

## 6. 配置说明（本项目）

- 邮箱源开关：`MAIL_SOURCES["duckmail"]`（`openai_reg.py`）。  
- DuckMail API Key 变量：**`DUCKMAIL_KEY`**（当前需在源码中填写）。  
- README 中的命令行参数 **`--duckmail-key`** 若与当前 `argparse` 不一致，以源码为准；若需命令行传入，需自行在 `main()` 中增加对应参数并赋值给 `DUCKMAIL_KEY`。

---

## 7. 限制与备注

- 代码注释称 **`duckmail.sbs` 相关域名可能被封**，实际可用性依赖网络与环境。  
- 未在项目中使用的 DuckMail 其它端点（删除账户、转发等）**不在本文档范围**。  
- 错误响应体格式未在项目中统一解析，排错时请结合 HTTP 状态码与响应正文。

---

## 8. 代码参考位置

实现集中在 `openai_reg.py`：

- 创建邮箱：`_try_duckmail`（约第 101–197 行）  
- 验证码轮询：`_poll_hydra_otp` + `get_oai_code` 中 `duckmail:` 分支  
- 验证链接轮询：`get_oai_verify` 中 `duckmail:` 分支  

常量：`DUCKMAIL_BASE = "https://api.duckmail.sbs"`。
