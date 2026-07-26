# 职优 AI

AI 简历优化工具的 iOS App 与配套后端。**不是招聘平台**，不提供职位投递，只做一件事：把用户已有的简历改得更贴合他手上那个具体职位。

核心闭环：

> 上传或新建简历 → 粘贴目标职位 JD → AI 算出匹配度并指出缺失关键词 → 逐条给出改写建议 → 用户按条采纳 → 简历分提升 → 导出 PDF 并写入「记录」

想尽快在 iPhone 上看到界面，直接跳到 [手机验收](#手机验收最重要的一节)。

---

## 目录结构

```
apps/mobile      Expo（React Native）iOS App —— 产品本体，17 个路由屏
apps/web         Next.js 后端 —— AI 接口、OAuth 回调，以及 /admin 运营后台
packages/shared  跨端共享契约 —— Zod schema、计分规则、简历 HTML、中文文案、mock 数据
supabase         数据库迁移、种子数据、RLS 断言、本地栈配置
scripts          db-test-local.sh：不依赖 Docker 的数据层验证脚本
```

`packages/shared` 是移动端和后端唯一的共同真源。计分公式、`field_path` 白名单、界面文案都只写一遍，两端引用同一份，避免「App 上显示 84、服务端算出 86」这类漂移。

---

## 环境要求与安装

- Node.js >= 20（开发容器上验证过的是 v22）
- pnpm 10（仓库已用 `packageManager` 锁到 `pnpm@10.33.0`，用 corepack 的话版本会自动对齐）

```bash
pnpm install
```

安装完不需要额外的构建步骤——`packages/shared` 直接以 TypeScript 源码被引用，没有产物需要预编译。

根目录的 `.npmrc` 里有 `node-linker=hoisted`，这不是随手加的：React Native 的 Metro 打包器解析不了 pnpm 默认的符号链接布局，Expo 官方的 monorepo 指南要求扁平化的 `node_modules`。**不要改掉它**，改了 App 会在启动时报模块找不到。

---

## 手机验收（最重要的一节）

这一节是给项目所有者用 Expo Go 在 iPhone 上比对界面的完整流程。

### 1. 启动开发服务器

```bash
pnpm mobile
```

等价于 `pnpm --filter @zhiyou/mobile start`，也就是 `expo start`。

### 2. 扫码

终端里会打出一个二维码。用 iPhone **自带的相机 App** 对着扫（不用先打开 Expo Go），点弹出的横幅即可；或者打开 Expo Go 用它内置的扫码入口。App Store 里搜 "Expo Go" 安装。

### 3. 不填任何环境变量就是 mock 模式

**这正是验收界面该用的模式。** 只要 `EXPO_PUBLIC_SUPABASE_URL` 和 `EXPO_PUBLIC_SUPABASE_ANON_KEY` 有任意一个为空（包括根本不创建 `.env` 文件，也就是 clone 下来的默认状态），App 就跑在 mock 模式：

- **跳过登录**：不需要注册、不需要账号，扫码直接进首页
- 全部数据来自 `apps/mobile/lib/api.ts` 里的内存 mock，**不发任何网络请求**
- 登录页之外的 **16 个界面全部可走通**，且状态是连贯的——完成一次优化后，首页的简历分会变、「记录」里会多一条

16 个界面：首页 / 记录 / 我的（三个 Tab），简历列表、新建简历、简历详情、简历预览、模版列表、模版详情，优化流程的 JD 粘贴、分析中、匹配度、建议列表、完成，以及资料编辑、设置。

配上 Supabase 的两个变量之后，登录守卫会自动生效，mock 数据让位给真实后端。验收界面阶段不要填。

### 4. 手机和电脑不在同一局域网时

默认的局域网模式要求两台设备在同一个网段。如果不满足（公司网络隔离、手机走 4G 等），改用隧道模式：

```bash
pnpm --filter @zhiyou/mobile exec expo start --tunnel
```

`@expo/ngrok` 已经在 `apps/mobile` 的 devDependencies 里，不会再弹出「是否安装」的提示。隧道模式走公网中转，会明显慢一些，能用局域网就别用它。

---

## 数据层

**本阶段用原生 PostgreSQL 验证，不起 Supabase 本地栈。**

```bash
pnpm db:test:local
```

它跑的是 `scripts/db-test-local.sh`：临时起一个 PostgreSQL 16 实例（数据目录在 `mktemp -d` 里，脚本退出时连同实例一起清理），然后依次应用

1. `supabase/tests/_harness.sql` —— Supabase 兼容桩，复刻 `auth.uid()`、`anon`/`authenticated` 等角色和 storage 的表结构
2. `supabase/migrations/*.sql` —— 真正的迁移，按文件名顺序
3. `supabase/seed.sql` —— 演示用户与种子数据
4. `supabase/tests/rls.sql` —— RLS 断言

断言覆盖的是「用户 B 读不到、也改不动用户 A 的数据」「匿名身份只能读模版」以及 JD 长度、`field_path` 白名单这两条数据库层兜底约束。运营后台那四张表（`admin_users`、`ai_providers`、`ai_usage`、`admin_audit_log`）另有一组断言：anon 与 authenticated 一行都读不到、也写不进去，两个统计函数它们也调不动，只有 service_role 读得到；唯一的例外是 `ai_usage`——登录用户能插入 `user_id` 是自己的那一行（前台埋点用），但插不了别人的，插完也读不回来。任何一条不成立就以非零码退出。

脚本默认在 `/usr/lib/postgresql/16/bin` 找 Postgres 服务端二进制，路径不同就用 `PGBIN=... pnpm db:test:local` 覆盖。以 root 身份运行时会自动降权到 `postgres` 账号（Postgres 拒绝以 root 运行），需要换别的账号就设 `PG_RUNAS`。

### 为什么不用 `supabase start`

Supabase 官方的 Docker 镜像在当前开发环境拉不下来——registry 被策略代理封禁了。而 RLS 是安全关键，不能只靠肉眼审查 SQL，所以有了上面这条不依赖 Docker 的路径：迁移和断言都跑在**真正的 PostgreSQL** 上，只有 Supabase 特有的那部分是桩。

它验证不到的是 GoTrue 登录、PostgREST 和 Storage API —— 那些必须在真的 Supabase 栈上跑。

下面这几条命令保留在 `package.json` 里，**上线接 Supabase Cloud（或本地能拉到镜像）时才用**，现在跑会失败：

```bash
pnpm db:start    # supabase start
pnpm db:stop     # supabase stop
pnpm db:reset    # supabase db reset —— 重建库并重跑迁移与种子
pnpm db:test     # db reset 之后用 psql 跑 supabase/tests/rls.sql
```

---

## Web 后端

```bash
pnpm web
```

等价于 `pnpm --filter @zhiyou/web dev`，起在 <http://localhost:3000>。

这个 Next.js 应用没有面向用户的产品界面，职责是五条 AI 接口（简历解析、发起分析、读取分析、采纳建议、按模版起草）、OAuth 回调，以及给运营用的 [/admin 后台](#运营后台)。落地页只是一句说明。

### AI_PROVIDER=mock 与 claude 的区别

| | `mock`（默认） | `claude` |
| --- | --- | --- |
| 需要 `ANTHROPIC_API_KEY` | 不需要 | 必须 |
| 返回内容 | `packages/shared` 里从原型移植的固定数据 | 真实模型输出 |
| 计分 | 逐位复现原型：起始 76，四条建议每条 `score_delta = 2`，全采纳到上限 84 | 分值由模型给出 |

两条路径共用同一个公式 `min(score_before + Σ score_delta, max_score)`，前端代码完全一致——换 provider 不改任何界面代码。

`AI_PROVIDER` 不设置时按 `mock` 处理，所以没有 API Key 的人 clone 下来也能把全链路跑通。设成 `claude` 却没给 `ANTHROPIC_API_KEY` 会**直接报错**，不会悄悄退回 mock —— 那样只会让人误以为模型在工作。

这两个环境变量只是**兜底**。后台里一旦启用了某条 AI 接入，它就盖过 `AI_PROVIDER` / `ANTHROPIC_API_KEY`，理由见下一节。

---

## 运营后台

`/admin`，跟 Web 后端同一个 Next.js 应用，起在 <http://localhost:3000/admin>。它是**内部工具**，不是产品的一部分：没有注册入口，管理员账号和前台的 `auth.users` 完全是两套身份，前台用户不管拿到什么权限都不可能顺势变成管理员。

### 出厂账号

| | |
| --- | --- |
| 用户名 | `admin` |
| 口令 | `abc123` |

> **⚠️ 部署到公网之前必须先改口令。**
>
> 这个账号是迁移 `20260726000200_admin_console.sql` 直接插进 `admin_users` 的，口令写在这份 README 里，也就是说**全世界都知道它**。而后台能看到全站用户量、能读写 AI 接入配置——拿到它等于拿到你的模型账单。
>
> 出厂口令没改时（`admin_users.is_default_password = true`），后台每一页顶部都会挂一条红色警告条，直到改掉为止。改口令在导航里的「修改口令」（`/admin/password`），改完 `token_version` 加一，**所有已签发的会话立刻失效**，包括你自己那条——这是预期行为，重新登录即可。

登录接口有两道限流：按 IP + 用户名 10 次 / 15 分钟，按用户名（不分 IP）30 次失败 / 15 分钟。两个都是**进程内计数，只在单实例部署下成立**——多实例或 serverless 部署要上公网的话，得换成共享计数器或者把限流上移到反向代理。登录、登录失败、退出、改密、增删改接入、启用、连通性测试都会写进 `admin_audit_log`。

### 需要的环境变量

后台的三个变量都**没有内置默认值**，缺了就报错、不会静默降级。三个都是服务端专用，绝不能加 `EXPO_PUBLIC_` 前缀。

| 变量 | 作用 | 怎么生成 |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | 后台跨全体用户汇总，按定义要越过 RLS，只能用它 | 不是自己生成的：Supabase 控制台 → Project Settings → API → `service_role` secret；本地栈用 `supabase status` 打印的那个 |
| `ADMIN_SESSION_SECRET` | 后台会话 cookie 的 HMAC 签名密钥 | `openssl rand -base64 32` |
| `SETTINGS_ENCRYPTION_KEY` | 后台里填的 AI 平台 API Key 用它做 AES-256-GCM 静态加密后存进 `ai_providers` | `openssl rand -base64 32` |

```bash
# 一次生成两把，贴进 .env
echo "ADMIN_SESSION_SECRET=$(openssl rand -base64 32)"
echo "SETTINGS_ENCRYPTION_KEY=$(openssl rand -base64 32)"
```

几条容易踩的：

- **`ADMIN_SESSION_SECRET` 生产缺失直接抛错**，不会退回某个内置默认值——一把写在仓库里的密钥等于公开的密钥，任何读过源码的人都能自己签一张票据进后台，那比不加鉴权更糟，因为它看上去是有鉴权的。同理，少于 32 个字符也拒收（`openssl rand -base64 32` 出来是 44 个字符，留足了余量）。本地开发不填也能跑：进程内临时生成一把并打一条 warn，重启即登出。
- **`SETTINGS_ENCRYPTION_KEY` 生成后就不要再换。** 换一把之后已经存进数据库的 API Key 全部永久解不开，只能在后台一条条重填。它必须是 base64 编码的 32 字节。
- **`SUPABASE_SERVICE_ROLE_KEY` 只在 `apps/web/lib/admin/` 与 `apps/web/app/api/admin/` 下使用。** 前台 API 走 anon key + 调用者自己的 JWT，安全边界是 RLS；service_role 绕过全部 RLS，混进前台路由就等于把整库交出去。

### AI 接入怎么配

`/admin/settings`（导航里叫「AI 接入」）。分类维度是**协议**不是厂商：除 Anthropic 走自己的 Messages API 外，其余平台都用 OpenAI `/chat/completions` 兼容端点，所以适配器只有两个实现。

内置平台目录（`apps/web/lib/ai/catalog.ts`）：

| 平台 | 协议 | 备注 |
| --- | --- | --- |
| Anthropic Claude | `anthropic` | **唯一支持直接解析 PDF / 图片简历原件**的接入方式 |
| OpenAI | `openai_compatible` | |
| Google Gemini | `openai_compatible` | 用它的 OpenAI 兼容端点 |
| DeepSeek 深度求索 | `openai_compatible` | |
| 月之暗面 Kimi | `openai_compatible` | |
| 智谱 GLM | `openai_compatible` | |
| 阿里云百炼（通义千问） | `openai_compatible` | |
| 火山方舟（豆包） | `openai_compatible` | 部分账号要填「推理接入点 ID」（`ep-` 开头）而不是型号名 |
| xAI Grok | `openai_compatible` | |
| Mistral AI | `openai_compatible` | |
| 硅基流动 | `openai_compatible` | 型号名带组织前缀，照控制台全称填 |
| 自定义 OpenAI 兼容端点 | `openai_compatible` | 自建 / 中转 / vLLM 等，地址填到 `/chat/completions` 之前那一段 |

**型号是自由文本，不是白名单。** 下拉里那些只是建议值，能少打几个字而已，手填任意型号名都接受——各家平台几周就上一批新型号、下一批旧型号，把可选值写死在代码里等于给这个后台定了三个月的保质期。

每条接入可以「测试连通性」，结果（成功与否、错误信息、时间）存回 `ai_providers` 并显示在卡片上。API Key 提交后只回显后四位，编辑时留空表示不修改。**同一时刻只能启用一条接入**，这是数据库层的唯一约束，不是界面上的约定。

**数据库配置优先于环境变量。** 后台里启用的那条接入 > `AI_PROVIDER` / `ANTHROPIC_API_KEY`。这个方向不能反：后台存在的意义就是让不碰代码的人换平台换 Key，如果环境变量能盖过它，界面上显示「已启用 DeepSeek」而实际在打 Claude，排查起来毫无线索。环境变量只是没有后台配置时的兜底（本地 clone、CI、后台还没来得及配的那段时间）。改完配置最多 30 秒生效（配置缓存的 TTL）。

接口地址（`base_url`）默认只允许公网 HTTPS。指向 `127.0.0.1` / `10.x` / `192.168.x` / `169.254.169.254` 这类地址，或者用明文 `http`，都会被拒——服务端发这个请求时会把解密后的**明文 API Key** 放进请求头，地址填哪儿它就送到哪儿。局域网里自建了推理服务（Ollama、vLLM 等）确实需要时，用 `ADMIN_ALLOW_INSECURE_BASE_URL=1` 打开，打开之前先确认这台服务器所在网段里没有别的不该被后台碰到的东西。

### 看板有哪些指标

`/admin` 首页。全部数字来自 `apps/web/lib/admin/metrics.ts` 这一个函数，页面和 `/api/admin/metrics` 共用它，不会出现「页面和接口对不上」。

- **注册用户** —— 总数、今日新增、7 日新增、30 日新增、已验证邮箱占比
- **注册趋势** —— 最近 30 天每日注册数柱状图
- **活跃用户** —— DAU / WAU / MAU。口径是「发起过分析」而不是「登录过」，三个窗口都是**滚动**的（最近 24h / 7d / 30d）而不是自然日——按自然日算的话每天 UTC 零点一过 DAU 就掉回接近 0，看板上会像出了故障
- **内容量** —— 简历、目标职位、分析次数、完成优化
- **优化效果** —— 平均提升、累计提升、优化前 / 后平均分
- **AI 调用** —— 总次数；成功率 / 拒答率 / 契约错误率 / 错误率；按用途分组（简历解析 / 匹配分析 / 模版起草）；按结果分组；Token 合计（输入 / 输出 / 缓存读取）；延迟 P50 / P95；最近 30 天调用量
- **当前启用的接入** —— 名称、平台、型号、接入方式、最近一次连通性测试的结果。**这里不会出现 API Key**，密文和明文都不会

两条读法上的约定：**均值和分位数没有样本时显示 `--` 而不是 0**（「平均提升 0 分」和「还没人优化过」是两回事）；明细类指标最多取最近 20000 行，被截断时页面会写明「基于最近 N 条」，不会悄悄少算。

AI 调用数据来自 `ai_usage`，由前台路由在每次调模型后埋点写入。这张表用户能插入自己的行（RLS 策略只允许 `user_id = auth.uid()`），但**读不回来**——没有任何 select 策略，只有 service_role 读得到。

---

## 校验命令

| 命令 | 跑什么 |
| --- | --- |
| `pnpm typecheck` | 三个 workspace 并行 `tsc --noEmit` |
| `pnpm lint` | 三个 workspace 并行 ESLint，`--max-warnings 0` |
| `pnpm test` | mobile 用 jest + @testing-library/react-native 跑 7 个界面/流程测试套件；web 与 shared 用 vitest 跑计分、简历 HTML、mock provider、HTTP 辅助，以及后台的会话票据、口令哈希、密钥加解密、看板聚合、接入表单校验、连通性测试、平台目录、上游地址防护 |
| `pnpm db:test:local` | 上面那一节的迁移 + 种子 + RLS 断言 |
| `pnpm --filter @zhiyou/web smoke` | 绕开鉴权，直接调 mock provider 的三个方法，用共享 Zod schema 校验返回值 |
| `pnpm --filter @zhiyou/web build` | `next build`，产出 18 条路由（1 个落地页 + 4 个后台页面 + 7 条后台 API + 5 条前台 API + OAuth 回调）外加 `/_not-found` |
| `pnpm --filter @zhiyou/mobile run export:web` | `expo export --platform web`。`app.json` 里 `web.output` 是 `static`，导出会在 Node 里真的求值一遍每个路由模块，所以它能提前抓到「模块顶层就崩」这类运行期错误。后台的改动理论上碰不到移动端，跑它是为了确认这一点 |

`pnpm test` 当前是 60（mobile）+ 246（web）+ 34（shared）= **340** 个测试全绿，分布在 21 个测试文件里。上表的命令在没有任何 `.env`、没有 Docker、没有 API Key 的干净环境里都能跑通，这是有意保证的。

---

## 环境变量

以 `.env.example` 为准，复制成 `.env` 再填。`.env` 已在 `.gitignore` 里。

只有 `EXPO_PUBLIC_` 前缀的变量会被打进移动端包，**因此它们等同于公开信息**。`EXPO_PUBLIC_SUPABASE_ANON_KEY` 放在这里是设计如此——anon key 本来就是公开的，真正的访问控制在数据库的 RLS 策略上（就是 `pnpm db:test:local` 断言的那些）。

以下几个是**服务端专用，绝不能进移动端包**，也就是绝不能加 `EXPO_PUBLIC_` 前缀：

- `SUPABASE_SERVICE_ROLE_KEY` —— 绕过全部 RLS，泄露等于数据库裸奔
- `ANTHROPIC_API_KEY` —— 泄露等于替别人付账单
- `ADMIN_SESSION_SECRET` —— 泄露等于任何人都能自己签一张后台票据
- `SETTINGS_ENCRYPTION_KEY` —— 泄露等于 `ai_providers` 里存的所有 API Key 都能解开

后三个的生成方式与注意事项见 [运营后台 → 需要的环境变量](#需要的环境变量)。

`EXPO_PUBLIC_API_URL` 指向 Next.js 后端。真机调试时不能填 `127.0.0.1`（那是手机自己），要填电脑在局域网里的 IP。

---

## 当前未完成的部分

诚实列一下这一阶段没做完的事，避免验收时产生误会。

**Sign in with Apple 与三家 OAuth 暂缓。** Google / LinkedIn / Facebook 的 PKCE 登录，以及 Sign in with Apple 的原生流程，代码都已经写好（`apps/mobile/lib/auth.tsx`、`apps/web/app/auth/callback/route.ts`），但要真机联调需要两样现在还没有的东西：EAS dev build（Apple 登录依赖原生模块，Expo Go 里走不到）和各平台的真实凭据。`supabase/config.toml` 里三家 OAuth 目前是 `enabled = false`。所以现在的验收路径是 mock 模式，本来也不需要登录。

**界面需要人工比对。** 开发容器是 Linux，跑不了 iOS 模拟器，也就没法自动截图回归。UI 是否与原型一致，只能靠人拿 Expo Go 逐屏对照——这也是上面那一节被放在最重要位置的原因。

**移动端还没接后端。** `apps/mobile/lib/api.ts` 目前完全由内存 mock 支撑，不发网络请求。它的函数签名已经是最终形态，接 Supabase 与 Next.js API 时只改这一个文件，界面与 hook 不动。
