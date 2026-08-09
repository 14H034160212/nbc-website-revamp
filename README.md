# nbc.org.nz 改造包

> **说明**：这是一份**未经委托的第三方改造提案**，与 Northcote Baptist Church
> 没有隶属关系，也未经其审阅或采用。仓库里对现网站的技术描述均来自公开可见的
> 页面源码。其中的 `nbc-bible-reader.html`（多语言在线圣经）是通用组件，
> 任何教会网站都可以直接使用。

按提案实施的全部产物。原则是**最小改动**：不换主题、不重做站点、父主题
`my-religion` 一行不碰，所有代码写进目前空白的子主题 `my-religion-child`。

> **我没有网站后台和 FTP 权限**，所以无法直接部署。下面每个文件都是可以直接
> 粘贴／上传的成品，配上逐步上线说明。需要教会提供的信息在文末「必须先补齐的
> 信息」一节，全部用 `{{ }}` 标记在文件里。

---

## 目录

```
nbc-bible-reader.html          在线圣经，22 KB，粘进「自定义 HTML」区块即可
nbc-proposal.html              提案文档（已发布为在线页面）

my-religion-child/
  style.css                    子主题样式（含 NBC 定制段落，原文件只有主题头注释）
  functions.php                子主题功能（全新文件，原本不存在）

pages/                         每个文件 = 一个「自定义 HTML」区块，整段粘贴
  vision-mission-values.html   替换 NBC_vision-mission-values.jpg 等三张图
  creed.html                   替换 Creed.jpg，轮盘改为内联 SVG
  strategic-principles.html    替换 NBC-Strategic-Principles.jpg
  first-visit.html             新页面：第一次来（英文）
  welcome-zh.html              新页面：/zh/ 中文落地页
  welcome-ko.html              新页面：/ko/ 한국어 落地页
  welcome-mi.html              新页面：/mi/ Te Reo Māori 落地页（双语）

content/
  alt-text.md                  首页 15 张缺 alt 图片的替代文本，逐张写好
```

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

**先把 `{{STREET_ADDRESS}}` 和 `{{MAP_URL}}` 换成真实值再发布**（见文末）。

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

## 必须先补齐的信息

这些在现网站上**找不到**，需要教会提供。文件里都用 `{{ }}` 标出来了。

| 标记 | 说明 | 出现在 |
|---|---|---|
| `{{STREET_ADDRESS}}` | 街道地址。**整个网站目前没有公布过地址**——首页页尾没有，Contact 页也没有，只有「Hillcrest, North Shore」。第一次来的人根本找不到门 | 4 个页面 + `functions.php` 的 `NBC_STREET` |
| `{{MAP_URL}}` | Google 地图链接。填了地址后 `functions.php` 会自动生成，页面里的按钮需要手填 | 4 个页面 |
| `{{PARKING}}` | 停车信息（场内车位？路边？） | `first-visit.html` |
| `NBC_POSTCODE` / `NBC_LAT` / `NBC_LNG` | 邮编与经纬度，用于结构化数据 | `functions.php` |

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
