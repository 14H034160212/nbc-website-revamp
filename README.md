# nbc.org.nz 改造包

> **说明**：这是一份**未经委托的第三方改造提案**，与 Northcote Baptist Church
> 没有隶属关系，也未经其审阅或采用。仓库里对现网站的技术描述均来自公开可见的
> 页面源码。其中的 `nbc-bible-reader.html`（多语言在线圣经）是通用组件，
> 任何教会网站都可以直接使用。

按提案实施的全部产物。原则是**最小改动**：不换主题、不重做站点、父主题
`my-religion` 一行不碰，所有代码写进目前空白的子主题 `my-religion-child`。

> **我没有网站后台和 FTP 权限**，所以无法直接部署。下面每个文件都是可以直接
> 粘贴／上传的成品，配上逐步上线说明。需要教会确认的信息在文末「资料来源与确认」一节。

---

## 目录

在线预览（可点的完整站点原型）：**https://nbc-website-revamp.pages.dev/**

```
src/
  addon.css                  只有新增功能需要的样式（不含排版改动）
  ask.html ask.js            圣经多语言问答：按主题查经 + 经文地址查询
  booknames.json             66 卷书名，6 种语言
  package.html               改造包说明页（开发者视角）
  i18n/zh-Hans.json ko.json  译文表：键=英文原文，值=译文
  i18n/mi.json               毛利文，有意只翻短语（见文件顶部说明）
  live/                      官网页面缓存，不入库（--fetch 生成）
build-site.py                以官网真实页面为底，注入功能增量，生成整站
assets/                      生成物：addon.css / ask.js
index.html sunday.html …     生成物：可直接部署的静态原型

—— 以下是真正要进 WordPress 的东西 ——

nbc-bible-reader.html          在线圣经，粘进「自定义 HTML」区块即可
nbc-proposal.html              提案文档

my-religion-child/
  style.css                    子主题样式（含 NBC 定制段落，原文件只有主题头注释）
  functions.php                子主题功能（全新文件，原本不存在）

pages/                         每个文件 = 一个「自定义 HTML」区块，整段粘贴
  vision-mission-values.html   替换 NBC_vision-mission-values.jpg 等三张图
  creed.html                   替换 Creed.jpg，轮盘改为内联 SVG
  strategic-principles.html    替换 NBC-Strategic-Principles.jpg
  first-visit.html             新页面：第一次来
  welcome-zh/ko/mi.html        三个母语落地页（Tier-0 方案，见下）

functions/                     Cloudflare Pages Function：圣经 AI 问答
  api/ask.js  api/_ask-core.mjs
  README.md                    部署、选型与教会需要拍板的事
scripts/                       本地测试与开发服务器

content/
  alt-text.md                  首页 15 张缺 alt 图片的替代文本，逐张写好
```

## 关于站点原型

`https://nbc-website-revamp.pages.dev/` 是**改造后网站的可点原型**。它刻意**不重新设计**：

- **底稿就是 nbc.org.nz 的真实页面**。`build-site.py --fetch` 抓下首页、
  On Sunday、Who We Are、Contact、Give 的原始 HTML，加载官网自己的样式表，
  只注入五样东西：① 原型声明条 ② 语言切换栏 ③ 导航里多出的一个 Bible 菜单
  （子项：Read the Bible / Find a Passage），外加 About Us 子菜单里的「第一次来」
  ④ 移动端底部操作条 ⑤ noindex + canonical。
  现有页面的其余部分**一行不改**。
- **多语言不是另做页面，是同一页只换文字**。`/zh/who-we-are/` 与 `/who-we-are/`
  是同一份 HTML：同样的照片、版式、字体、样式表，只有可见文本节点被替换成译文。
  URL 结构与 Polylang 一致（`/zh/services/`、`/ko/give-2/`），并输出 hreflang。
  译文在 `src/i18n/*.json`，按英文原文精确匹配——**没有机器翻译**，
  未翻译的字符串构建时会逐条列出来，不会悄悄漏掉。
  目前覆盖 5 个镜像页面 + 3 个自建页面，各 × 3 种语言，其余页面回落英文
  （提案里的分层策略）。声明条、跳过链接、移动操作条这些**我们自己加的外壳**
  不走词典（它们是在翻译之后注入的），字符串在 `build-site.py` 的 `CHROME` 里，
  同样按语言给。
- **新页面**（在线圣经、按主题查经、第一次来）用主题自己的
  页面外壳渲染，所以看起来是原生的，不像外挂上去的。
- **顶级导航只加一项**，不是两项：现有 7 项在 1280px 下已经顶到右边缘，
  再加两个顶级项会溢出。用一个带子菜单的父项，跟 About Us / Community 的组织方式一致。
  「第一次来」不占顶级位置，挂在 About Us 子菜单里 —— 它本来就该和
  Who We Are、On Sunday 放在一起。
- **首页的 Vision / CREED / Strategic Principles 图没有换成 HTML**——
  它们是 LayerSlider 的幻灯片，替换属于后台内容编辑，不是标记注入。
  HTML 版本在 `pages/` 里，可以在 `/preview` 查看。
- **子主题的排版改动没有进原型**。那部分会改变现有站点的观感，而这个原型要展示的是
  「现有设计 + 新功能」。排版是另一个可选步骤。
- `src/live/` 里的官网 HTML 缓存**不入库**；重新构建需要 `--fetch`。
- 现网站查不到的信息（街道地址、停车、办公时间）已经补齐并标注来源，见文末。
  当初的原则不变：查不到就渲染成黄色高亮标记，绝不编一个填进去。

> `pages/` 里的文件和 `nbc-bible-reader.html` 是**片段**——它们是给 WordPress
> 「自定义 HTML」区块用的，本身没有 `<!doctype>`、`<head>`、viewport。
> 浏览器直接打开也能渲染，但会进入 quirks mode 且手机不缩放，所以预览站上的
> `/bible/` / `preview.html` 由 `build-site.py` 包一层真正的文档结构。
> 改了片段之后重新跑一次 `python3 build-site.py` 即可。

---

## 上线顺序

### 第 0 步：备份与 staging（不要跳过）

1. 整站备份（文件 + 数据库）。主机商面板一般有一键备份；没有就用
   UpdraftPlus 免费版。
2. 克隆一份 staging 站点，下面每一步都先在 staging 做一遍。
3. 记下当前 `my-religion-child/style.css` 的内容（只有主题头注释），
   万一要回滚就是把它还原。

### 第 1 步：在线圣经（零风险，可以最先做）

1. 后台 → 页面 → 新建，标题 `Bible`，别名设为 `bible`。
2. 插入区块 → 搜索「自定义 HTML」。
3. 把 `nbc-bible-reader.html` **整个文件**粘进去。
4. 发布，访问 `/bible/` 检查。

不装插件、不改主题、不需要构建工具。想撤回就删掉这个页面，站点其余部分
完全不受影响。

### 第 2 步：三个母语落地页

对 `welcome-zh.html` / `welcome-ko.html` / `welcome-mi.html` 各重复一次：
新建页面 → 别名分别设为 `zh` / `ko` / `mi` → 插入「自定义 HTML」→ 粘贴 → 发布。

地址与地图链接已填入，但来源不是教会本人，**发布前请教会核一眼**（见文末）。

`welcome-ko.html` 请先找会众里的韩语弟兄姊妹读一遍再发布——事实是准确的，
但语气需要母语者确认。`welcome-mi.html` 是有意做成双语的，文件顶部注释说明了原因。

### 第 3 步：子主题（先 style.css，后 functions.php）

用 FTP 或主机文件管理器，上传到
`wp-content/themes/my-religion-child/`：

1. **先只传 `style.css`**。原文件只有主题头注释，新文件在其后追加了 NBC 定制段落，
   主题头保持不变。传完刷新前台，确认字号变大、行宽收窄、正文颜色变深。
   有问题就把旧文件传回去。
2. **确认没问题后再传 `functions.php`**。这个文件原本不存在。

   > ⚠️ `functions.php` 里的 PHP 语法错误会让整站白屏。上传前请用主机的
   > 在线编辑器或 `php -l functions.php` 检查一遍（我本机没有 PHP 环境，
   > 只做了结构检查：括号、引号、字符串全部配对，13 个函数名无重复，
   > 所有 hook 都指向已定义的函数）。**用 FTP 上传，不要用后台的
   > 「外观 → 主题文件编辑器」**——后者出错时你会连后台一起进不去。

传上去之后立刻检查：

- 页面顶部出现语言切换条（English / 中文 / 한국어 / Te Reo Māori）
- 手机上底部出现三个入口（Sunday 10am / Find us / Give）
- Tab 键按一下，左上角出现「Skip to content」
- 首页源码里出现 `application/ld+json`

### 第 4 步：拆掉图片里的文字

这是多语言的前提——翻译插件看不见图片里的字。

1. 打开现在放 `NBC_vision-mission-values.jpg` 的页面，把图片区块换成
   「自定义 HTML」区块，粘 `pages/vision-mission-values.html`。
2. 同理处理 `Creed.jpg` → `pages/creed.html`，
   `NBC-Strategic-Principles.jpg` → `pages/strategic-principles.html`。
3. 按 `content/alt-text.md` 逐张补 alt 文本（媒体库里改一次，全站生效）。

> `vision-mission-values.html` 现在用的是纯色渐变背景，**不是**原来那张照片——
> 因为那张照片本身已经把这些文字印在上面了，再叠一层 HTML 文字会重影。
> 想恢复照片，把带字的那半裁掉、或者找摄影师要一张干净的建筑照，
> 文件里的注释写了怎么换。

### 第 5 步：性能瘦身（最后做，逐条验证）

`functions.php` 第 6 节按页卸载了 LayerSlider、timetable、Simple Calendar、
Instagram、YouTube、Twitter、Contact Form 7 的 CSS/JS。句柄名是从线上 HTML
里实际读出来的，不是猜的。

**建议先把整个 `nbc_slim_assets` 函数体注释掉，然后一个小节一个小节地放开**，
每放开一节就把站点点一遍。判断某页到底加载了什么：以管理员身份访问
`任意页面/?nbc_debug=assets`，页尾会列出该页实际加载的全部句柄。
查菜单位置名用 `?nbc_debug=menus`。

---

## 资料来源与确认

这些在现网站上**找不到**。除停车外，其余来自第三方资料，
发布前值得教会看一眼。

| 项 | 状态 |
|---|---|
| 办公室开放时间 | ✅ **教会确认**：周一至周五 09:00–15:00。写在电话号码底下——人查开放时间时想知道的就是"什么时候打过去有人接"。Google 上那条「周日 10:00–12:30」是聚会加茶点，**不是**办公室办公，两者没有混写。 |
| 街道地址 | ✅ 67 Eban Avenue, Hillcrest, Auckland 0627 |
| 停车 | ✅ **教会告知**：教会停车场或路边均可；旁边咖啡厅的车位请留给他们的客人。无障碍车位/入口这一项仍来自 Google 资料，未经确认。 |
| `NBC_LAT` / `NBC_LNG` | ✅ -36.7954715, 174.7360854 |
| 银行账号 | ⓘ 刻意**不**放进仓库（仓库是公开的）。奉献页指向 `nbc.org.nz/give-2/`。 |

> **停车和办公时间已由教会（亦文牧师）确认。** 停车：教会停车场或路边均可，
> 但**不要占用旁边咖啡厅的车位**，那会影响邻居的生意。这句话在「第一次来」
> 页面上说一次，比事后在人家停车场立个牌子好，也是教会该有的样子。
> 办公时间：周一至周五 09:00–15:00，与 Google 上的一致。
>
> **还没经教会确认的只剩两项，都来自 Google 商家资料：**街道地址
> （另经 OpenStreetMap——该建筑标记为 place_of_worship——以及 Zenbu、Kompass
> 交叉验证，电话也一致），以及无障碍车位/入口。

`functions.php` 的结构化数据做了保护：地址为空时**不会**输出空的 address 字段——
输出一个空地址比不输出更糟。

已从现网站核实、无需再问的信息：主日 10:00 开始、约 11:15 结束、
每月第一主日圣餐、学期中开设学龄前至 Year 9 课程、母婴室带小厨房和实时视频、
会后 morning tea、电话 (09) 480 7064、邮箱 office@nbc.org.nz。
奉献银行账号见教会官网 `/give-2/` 页面，本仓库不复制。

---

## 我在实施中改掉的两个 bug

留个记录，避免以后重复踩。

1. **CSS 优先级打架**。子主题里 `.entry-content h2 { color: ... }`（0,2,1）
   会盖掉粘贴区块里的 `.nbc-creed__title { color:#fff }`（0,1,0），
   结果深色背景上出现深色标题。已把区块选择器提权为
   `.nbc-creed .nbc-creed__title`。按钮同理——`.entry-content a` 的蓝色和下划线
   会盖掉按钮样式，已在 `style.css` 里用同等优先级的选择器修正。

2. **`wp_body_open` 可能不存在**。这个 hook 是 WordPress 5.2 引入的，需要主题
   自己调用；`my-religion` 是 2019 年的主题，很可能没调。挂在上面的语言切换器
   和 skip link 会静默不显示。`functions.php` 里加了检测：如果 hook 没触发，
   就在页尾用 `<template>` 输出同样的内容再移动到 `<body>` 开头。

---

## 验证记录

- 在线圣经用无头 Chrome 做了端到端验证：KJV 单栏取回并渲染 36 节；
  和合本简体 × Te Reo Māori 双栏对照（诗篇 23）正常；界面四语切换正常。
- getBible API v2 实测：12 个译本全部返回 200，`Access-Control-Allow-Origin: *`。
- 7 个粘贴区块 + 子主题 CSS 一起渲染截图检查，修掉了上面两个 bug 和
  `.nbc-facts` 网格空格子露出灰色的问题。
- `functions.php` 通过结构检查（括号/引号配对、函数名唯一、hook 指向已定义函数）。
  **注意：这不等于 `php -l`，上线前请务必在 staging 用真正的 PHP 跑一次。**

---

## 回滚

| 做了什么 | 怎么撤 |
|---|---|
| 粘贴的页面 | 删除该页面 |
| `style.css` | 传回原文件（只有主题头注释那一段） |
| `functions.php` | 直接删除这个文件，站点回到原状 |
| 图片换成 HTML 区块 | 把区块换回原来的图片区块 |

没有任何一步修改数据库结构或父主题文件。
