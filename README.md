# dsh-update-guard

> 隐藏 DSH 桌面版左下角的「新版本」按钮，并在插件设置页里查看**当前版本 → 最新版本**之间的全部改动。

一个纯浏览器侧的 DSH / this harness 插件。宿主半部是空的，不下载安装包、不调用 `quitAndInstall`、不改 `app-update.yml`、不写 `$DSH_HOME`。卸载即完全复原。

---

## 功能

| 功能 | 说明 |
| --- | --- |
| **开关** | 设置页里一键「隐藏 / 显示」「新版本」按钮。开关记在 `localStorage`，重启后保持。 |
| **精确匹配** | 只匹配文案恰为「新版本 / Update」的按钮，不会误伤插件市场的「有新版本」、预设中心的状态文字。 |
| **兜底选择器** | 若宿主改了 DOM 导致自动匹配失效，可在设置页填一个额外 CSS 选择器，无需改代码。 |
| **当前版本** | 自动从 `window.__DSH_BOOT__.release.version` 读取；读不到时可手动从下拉框选择。 |
| **最新版本** | 三级降级：官方 nightly feed → GitHub Releases API → 内置离线快照（37 个历史版本）。 |
| **累积改动** | 按版本分段列出「当前 → 最新」之间的每个 Release，按 **新增功能 / 体验优化 / 问题修复 / 其他变更** 分组；另提供「合并汇总」视图。 |
| **离线可用** | Release 正文已随插件打包，断网或 GitHub 限流时仍能查看。 |

截图里的「今日消费 ¥0.00」来自 `@linxin666/dsh-usage`，与本插件无关，本插件不会动它。

---

## 安装

本插件是**本地 `file:` 插件**，不发布到 npm 也能用（要发布见下方「发布到 GitHub」）。

1. 把整个目录放到 profile 的 `vendor/` 下，例如：

   ```
   %USERPROFILE%\.dsh\profiles\desktop\vendor\dsh-update-guard\
   ```

2. 编辑 `%USERPROFILE%\.dsh\profiles\desktop\package.json`，加**两处**：

   ```jsonc
   {
     "dsh": {
       "profile": {
         "bundles": [
           // ... 你现有的 bundle ...
           "dsh-update-guard"          // ← ① 加这一行
         ]
       }
     },
     "dependencies": {
       // ... 你现有的依赖 ...
       "dsh-update-guard": "file:./vendor/dsh-update-guard"   // ← ② 加这一行
     }
   }
   ```

3. 在 profile 目录执行一次依赖同步，然后**完全退出并重启 DSH**：

   ```bash
   cd %USERPROFILE%\.dsh\profiles\desktop
   pnpm install
   ```

   > 新增 bundle 会改变启动时的组合清单，通常需要重启才能生效；热重载不一定能带起来。

4. 打开 **设置 → 更新提示管家**，把「隐藏按钮（推荐）」点亮即可。

### 为什么不用改 `cordis.patch.yml`

profile 的 `cordis.yml` 说明组合顺序是「每个 bundle 自带的 patch 依次叠加」。本插件自带 `cordis.patch.yml`（只有一行 `- insert`），会随 bundle 自动生效，所以**主 patch 文件一个字都不用动**。

### 卸载 / 一键回滚

**手动卸载**：从 `package.json` 删掉那两行、删掉 `vendor/dsh-update-guard/` 目录、重启。所有隐藏标记在插件卸载钩子执行时也会被清掉。

**一键回滚（推荐）**：安装时会在 profile 目录留下 `package.json.bak-pre-update-guard-<时间戳>` 备份。若担心重启后起不来，双击 `tools/rollback.cmd`（或在 `E:\dsh\` 下运行 `rollback-update-guard.ps1`）即可：

- 用备份还原 `package.json`
- 删掉 `node_modules/dsh-update-guard`
- 清掉 `pnpm-lock.yaml` 里本插件的 3 个条目
- 默认**保留** `vendor/dsh-update-guard` 源码（加 `-PurgeVendor` 才删）
- 不联网、不依赖 pnpm、不杀 DSH 进程、可重复运行（已回滚会直接提示"无需操作"）
- 每一步都留 `*.bak-before-rollback-<时间戳>` 二次备份

> 就算不跑回滚脚本也**不会让 DSH 起不来**：宿主对 `dsh.profile.bundles` 里每个条目是逐个 `try/catch` 的，解析失败的 bundle 只会进 `skippedBundles`，其余插件照常加载（源码里 `profile manifest and user patch errors still throw` —— 只有那两类才致命）。回滚脚本只是把状态彻底还原干净。

参数：

```powershell
.\rollback-update-guard.ps1 -Force          # 跳过确认提示
.\rollback-update-guard.ps1 -PurgeVendor    # 连源码目录一起删
```

---

## 它不做什么（重要）

- **不关闭后台检查。** 桌面 Host 主进程每 10 分钟轮询一次 feed（`DSH_DESKTOP_UPDATE_CHECK_INTERVAL_MS`，默认 600000ms），浏览器插件管不到。本插件只负责「看不见」。
  - 想真正关掉检查：把安装目录下 `resources/app-update.yml` 改名即可（源码里启用条件是 `app.isPackaged && existsSync(app-update.yml)`）。这是可逆的，但**不在本插件职责范围内，本插件绝不会替你做**。
- **不动已下载的安装包**（`@deepseek-aidsh-desktop-updater/pending/`）。
- **不触发、不阻止、不加速升级**。
- **不改动其它插件**，包括 `@linxin666/dsh-update`（那是插件自更新，与本插件无关）。

---

## 数据来源

| 用途 | 地址 |
| --- | --- |
| 最新版本号（首选） | `https://download.deepseek.com/dsh-desk/feeds/win-x64/nightly.yml` |
| 最新版本号（回退）+ Release 正文 | `https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=10` |
| 离线兜底 | 本仓库 `releases-snapshot.json` |

外部请求**只在打开设置页或点「刷新」时发生**，没有常驻轮询，不会刷 GitHub 限流（未认证 60 次/小时）。浏览器直连 feed 可能因 CORS 失败，此时自动降级到 GitHub，再降级到内置快照并在界面上标明来源。

---

## 发布到 GitHub

本目录本身就是完整的插件仓库，无需额外构建产物：

```bash
cd dsh-update-guard
git init
git add .
git commit -m "feat: dsh-update-guard v0.1.0"
git remote add origin https://github.com/flareskyqq/dsh-update-guard.git
git push -u origin main
```

用户也可以不经 npm 直接用 Git 安装（若宿主支持 `git+https` 依赖）：

```jsonc
"dsh-update-guard": "git+https://github.com/flareskyqq/dsh-update-guard.git"
```

`package.json` 里的 `repository.url` / `homepage` / `bugs.url` 已指向本仓库；fork 后记得改成你自己的地址。

若要发布到 npm：

```bash
npm publish --access public
```

---

## 维护：刷新内置快照

新版本发布后，重新抓取 Release 正文并内联进 `client.js`：

```bash
node tools/build-snapshot.mjs   # 需要网络，重新生成 releases-snapshot.json
node tools/inline-data.mjs      # 把快照 + locale 内联进 client.js
node --check client.js          # 语法自检
git add releases-snapshot.json client.js && git commit -m "chore: refresh release snapshot"
```

只改了文案时，只跑 `node tools/inline-data.mjs` 即可。

`tools/build-snapshot.mjs` 的分组解析对齐 DSH Release 正文的四种标题（`新增功能 / 体验优化 / 问题修复 / 其他变更`），同时兼容 `<h3 id="...">新增功能</h3>` 和 `### 新增功能` 两种写法。解析不到的条目会落到「其他」，不丢内容。

---

## 目录结构

```
dsh-update-guard/
├── package.json              # 插件清单：bundle patch + client 入口
├── cordis.patch.yml          # 只 insert 一行
├── index.js                  # 宿主半部：空 apply()
├── client.js                 # 全部逻辑（数据已内联，单文件自包含）
├── icon.svg
├── locale/
│   ├── zh.json
│   └── en.json
├── releases-snapshot.json    # 离线兜底：37 个版本的分组正文
├── tools/
│   ├── build-snapshot.mjs    # 维护脚本：抓 GitHub Releases
│   └── inline-data.mjs       # 维护脚本：内联数据到 client.js
├── README.md
├── CHANGELOG.md
├── LICENSE
└── .gitignore
```

---

## 兼容性

- 宿主：DSH / this harness **0.2.1-rc.x ~ 0.2.2-rc.1**（实测环境 `0.2.1-rc.2`）
- 平台：`web`（桌面版内置 Web UI 与 `dsh web` 均可用）
- 依赖：`react`（宿主提供）、`slots` / `locale` 两个客户端服务
- 与官方 0.2.2 的破坏性变更无耦合：不引用 `agent.model`、`Session Projection`、`tools.resolve` 等任何变动过的 API，因此升级宿主后本插件仍能加载（只是版本号读数会变）。

## 许可证

MIT
