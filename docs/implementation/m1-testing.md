# M1 实现文档（四）：自动化测试体系（单测流程 + E2E）

> 落地时间：2026-10-17。前序：[m0-core.md](m0-core.md)（core 57 单测）· [m1-web.md](m1-web.md)（web 31 单测）· [m1-react-line.md](m1-react-line.md)（react/adapter 14 单测）。
> 本文记录 E2E 体系（Playwright）与测试流程编排（git hooks）；单测本身散见各包 `test/`。

## 1. 定位与分层

| 层       | 工具                        | 覆盖                                                                              | 状态            |
| -------- | --------------------------- | --------------------------------------------------------------------------------- | --------------- |
| 单元测试 | Vitest（turbo `test` 编排） | packages/* 全部公开行为（core resolve/token、web 后端、react 绑定、adapter 注入） | 114 个，既有    |
| E2E      | Playwright（`e2e/` 根目录） | 发布链路（demo 构建产物 preview）+ 真实浏览器降级探测 + 校准值终验                | 12 个，本次新增 |

E2E 补单测之不足的三个点：

1. **jsdom 测不了渲染承诺**——backdrop-filter / CSS 变量的 computed style 只有真实浏览器可断言；
2. **安全降级（核心卖点）需真实探测**——probe 走环境 API（CSS.supports / matchMedia），E2E 用 `addInitScript` 在页面脚本前覆写，复验单测 mock 路径；
3. **发布链路验收**——preview 消费 build 产物，即"零改动接入"的最终形态（与用户真实项目同路径）。

## 2. E2E 架构

配置 [playwright.config.ts](../../playwright.config.ts)：双 webServer（antd-mobile 演示 preview `:4174` / workbench preview `:4175`，端口避开 dev 的 5173-5177，federation R6 顺延）；375×812 移动端视口；trace 首次重试起录。

浏览器：`channel: "chromium"`——用完整 chromium 的 new headless 而非默认 chrome-headless-shell。**安装方式（国内网络）**：手动下载 zip 后本地镜像安装：

```bash
mkdir -p /tmp/pw-mirror/builds/cft/<版本>/mac-x64
cp ~/Downloads/chrome-mac-x64.zip /tmp/pw-mirror/builds/cft/<版本>/mac-x64/
cd /tmp/pw-mirror && python3 -m http.server 8901 &
PLAYWRIGHT_DOWNLOAD_HOST=http://127.0.0.1:8901 pnpm exec playwright install chromium
```

ffmpeg / headless-shell 二进制缺失不影响运行（video 录制才需要 ffmpeg；channel chromium 不需要 shell）。

## 3. 用例清单（e2e/）

### workbench.spec.ts（resolve 决策链终验，5+1 用例）

| 用例               | 断言核心                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| 三卡片渲染         | bar/card/control 三 variant 就位                                                                        |
| 默认 ios27 regular | tier=css、`--glass-blur`=6px（校准锚点）                                                                |
| 风格切换           | ios27→ios26 blur 6px→16px，切回还原                                                                     |
| 强度插值           | preset strong→12px、subtle→2px（ios27 锚点 2/6/12）                                                     |
| 能力模拟           | 关 backdropFilter → tier=solid、blur 归 0px                                                             |
| 无障碍优先         | 勾 reduce-transparency → tier=solid（**resolve 语义：压档到不透明材质而非 none**）+ `a11y:` reason 徽章 |

### antd-mobile.spec.ts（零改动接入发布链路，4 用例）

`#liquid-glass-web-style` 单例注入；`.lg-surface` ≥2（GlassSurface + adapter 发现的 TabBar）且 computed backdrop-filter 非 none；Switch 交互不受玻璃化影响；Dialog 弹层开闭完整（弹层玻璃变量断言留待 tokenMap 实测补全——数据包 tokenMap 诚实留空，见 m1-react-line）。

### degrade.spec.ts（安全降级真实探测，2 用例）

`addInitScript` 覆写 `CSS.supports`（backdrop-filter false）/ `matchMedia`（prefers-reduced-transparency matches）→ 真实 probe 降档 → 断言玻璃滤镜消失 **且页面组件可交互**（降级 ≠ 白屏）。

## 4. 流程编排

- **pre-push**（lefthook piped 串行）：`pnpm typecheck` → `pnpm test`——推上去 = 类型与测试双过；turbo 缓存命中秒过。
- **E2E 不进 hooks**（太重）：`pnpm e2e`（build + 全量 spec）按需 / 里程碑收尾必跑；`pnpm e2e:only` 复用产物快速重跑（spec 调试用）。
- **CI 预留**：远端仓库建立后 Actions 顺序 install → lint → typecheck → test → build → e2e（config 已读 `process.env.CI`：retries=2 / github reporter / 不复用已有 server）。
- 单测不重复 E2E 的范围：单测锁逻辑（jsdom 可 mock），E2E 锁"真实浏览器承诺"。

## 5. 决定记录

| #   | 决定                                             | 原因                                                                            |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| 1   | E2E 走 preview（构建产物）而非 dev server        | 验收用户真实接入路径；顺带回归 build 产物                                       |
| 2   | 断言 computed style / DOM 文本，不做截图视觉回归 | 零 flaky；视觉回归等 M2 webgpu 后端再议                                         |
| 3   | `channel: "chromium"` 完整浏览器                 | headless-shell 国内下载困难；完整 chromium 可手动 zip + 本地镜像装              |
| 4   | E2E 目录放根级 `e2e/`（非 workspace 包）         | 只有一个 runner，无独立包必要；vitest 各包 include 不会误抓                     |
| 5   | `playwright` 包不显式安装                        | `@playwright/test` 传递依赖已含同版本 playwright，显式装是重复                  |
| 6   | 降级用例分两层                                   | workbench 面板交互 = resolve 语义层；antd demo addInitScript = probe 真实探测层 |

## 6. 后续

- ~~`@mf-types` 官方类型通道切换~~ **已完成（2026-10-17）**：测试体系就位后按 §4.1 三步落地（loadRemote + include @mf-types + 显式 runtime 依赖），详见 playground-federation-design.md §4.1
- MF host 挂载 remote 的联调 E2E（双 dev server 编排）留 v2
- CI 流水线等远端仓库建立后落地
