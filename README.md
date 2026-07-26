# 职优 AI

AI 简历优化工具的 iOS App 与配套后端。**不是招聘平台**，不提供职位投递，只做一件事：把用户已有的简历改得更贴合他手上那个具体职位。

核心闭环：

> 上传或新建简历 → 粘贴目标职位 JD → AI 算出匹配度并指出缺失关键词 → 逐条给出改写建议 → 用户按条采纳 → 简历分提升 → 导出 PDF 并写入「记录」

想尽快在 iPhone 上看到界面，直接跳到 [手机验收](#手机验收最重要的一节)。

---

## 目录结构

```
apps/mobile      Expo（React Native）iOS App —— 产品本体，17 个路由屏
apps/web         Next.js 后端 —— AI 接口与 OAuth 回调，页面只有一个说明性落地页
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

断言覆盖的是「用户 B 读不到、也改不动用户 A 的数据」「匿名身份只能读模版」以及 JD 长度、`field_path` 白名单这两条数据库层兜底约束。任何一条不成立就以非零码退出。

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

这个 Next.js 应用没有产品界面，职责是五条 AI 接口（简历解析、发起分析、读取分析、采纳建议、按模版起草）和 OAuth 回调。落地页只是一句说明。

### AI_PROVIDER=mock 与 claude 的区别

| | `mock`（默认） | `claude` |
| --- | --- | --- |
| 需要 `ANTHROPIC_API_KEY` | 不需要 | 必须 |
| 返回内容 | `packages/shared` 里从原型移植的固定数据 | 真实模型输出 |
| 计分 | 逐位复现原型：起始 76，四条建议每条 `score_delta = 2`，全采纳到上限 84 | 分值由模型给出 |

两条路径共用同一个公式 `min(score_before + Σ score_delta, max_score)`，前端代码完全一致——换 provider 不改任何界面代码。

`AI_PROVIDER` 不设置时按 `mock` 处理，所以没有 API Key 的人 clone 下来也能把全链路跑通。设成 `claude` 却没给 `ANTHROPIC_API_KEY` 会**直接报错**，不会悄悄退回 mock —— 那样只会让人误以为模型在工作。

---

## 校验命令

| 命令 | 跑什么 |
| --- | --- |
| `pnpm typecheck` | 三个 workspace 并行 `tsc --noEmit` |
| `pnpm lint` | 三个 workspace 并行 ESLint，`--max-warnings 0` |
| `pnpm test` | mobile 用 jest + @testing-library/react-native 跑 7 个界面/流程测试套件；web 与 shared 用 vitest 跑计分、简历 HTML、mock provider、HTTP 辅助 |
| `pnpm db:test:local` | 上面那一节的迁移 + 种子 + RLS 断言 |
| `pnpm --filter @zhiyou/web smoke` | 绕开鉴权，直接调 mock provider 的三个方法，用共享 Zod schema 校验返回值 |
| `pnpm --filter @zhiyou/web build` | `next build`，产出 7 条路由（1 个落地页 + 5 条 API + OAuth 回调） |
| `pnpm --filter @zhiyou/mobile run export:web` | `expo export --platform web`。`app.json` 里 `web.output` 是 `static`，导出会在 Node 里真的求值一遍每个路由模块，所以它能提前抓到「模块顶层就崩」这类运行期错误 |

`pnpm test` 当前是 60（mobile）+ 15（web）+ 34（shared）= 109 个测试全绿。上表的命令在没有任何 `.env`、没有 Docker、没有 API Key 的干净环境里都能跑通，这是有意保证的。

---

## 环境变量

以 `.env.example` 为准，复制成 `.env` 再填。`.env` 已在 `.gitignore` 里。

只有 `EXPO_PUBLIC_` 前缀的变量会被打进移动端包，**因此它们等同于公开信息**。`EXPO_PUBLIC_SUPABASE_ANON_KEY` 放在这里是设计如此——anon key 本来就是公开的，真正的访问控制在数据库的 RLS 策略上（就是 `pnpm db:test:local` 断言的那些）。

以下两个是**服务端专用，绝不能进移动端包**，也就是绝不能加 `EXPO_PUBLIC_` 前缀：

- `SUPABASE_SERVICE_ROLE_KEY` —— 绕过全部 RLS，泄露等于数据库裸奔
- `ANTHROPIC_API_KEY` —— 泄露等于替别人付账单

`EXPO_PUBLIC_API_URL` 指向 Next.js 后端。真机调试时不能填 `127.0.0.1`（那是手机自己），要填电脑在局域网里的 IP。

---

## 当前未完成的部分

诚实列一下这一阶段没做完的事，避免验收时产生误会。

**Sign in with Apple 与三家 OAuth 暂缓。** Google / LinkedIn / Facebook 的 PKCE 登录，以及 Sign in with Apple 的原生流程，代码都已经写好（`apps/mobile/lib/auth.tsx`、`apps/web/app/auth/callback/route.ts`），但要真机联调需要两样现在还没有的东西：EAS dev build（Apple 登录依赖原生模块，Expo Go 里走不到）和各平台的真实凭据。`supabase/config.toml` 里三家 OAuth 目前是 `enabled = false`。所以现在的验收路径是 mock 模式，本来也不需要登录。

**界面需要人工比对。** 开发容器是 Linux，跑不了 iOS 模拟器，也就没法自动截图回归。UI 是否与原型一致，只能靠人拿 Expo Go 逐屏对照——这也是上面那一节被放在最重要位置的原因。

**移动端还没接后端。** `apps/mobile/lib/api.ts` 目前完全由内存 mock 支撑，不发网络请求。它的函数签名已经是最终形态，接 Supabase 与 Next.js API 时只改这一个文件，界面与 hook 不动。
