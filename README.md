# Lexicon｜私人英语词典

供平时英语学习的电子词典，中文界面，同时提供 Web 版和 Windows 桌面 App。搜索单词后，会展示释义、例句、词组、词形变化、近义词和反义词；释义、例句和词组里的每个英文单词都可以继续点击查询。

日常使用方式见 [使用说明.md](使用说明.md)。

## 功能

- 全中文界面，词性和界面提示均已本地化
- Windows 桌面 App：主窗口、系统托盘、`Ctrl+Shift+D` 全局快捷键
- 桌面速查窗是独立原生窗口，可直接切换系统级置顶，不依赖浏览器画中画能力
- 桌面截图在原屏幕上直接拖框选区，只把选区画面交给本地 OCR 识别
- 关闭主窗口后词典继续驻留托盘，可从托盘重新打开或退出
- 单词搜索，支持浏览器返回/前进和 `?q=word` 直达链接
- 输入时在搜索框下方实时给出拼写建议（模糊匹配 + 拼写纠错），按相似度从高到低排列，支持 ↑↓ 选择、Enter 查询、Esc 关闭
- 按英文缩写词性（`n.`、`v.`、`adj.`、`pron.` 等）切换释义
- 默认只展示前 2 条释义和前 5 个词组，其余可展开，常见词条尽量在一屏内读完
- 自动收起空的词形、同反义词等区块，减少无效留白
- 每条英文释义和例句自动附带中文机器翻译，并缓存 30 天以减少重复请求
- 释义与例句中的每个英文单词都可点击
- 近义词、反义词标注到具体义项，并分别显示为“此义近义词 / 此义反义词”
- 词形家族与派生形式
- 查询 `went`、`mice`、`studies`、`bigger` 这类变形词时自动跳转到原形词条，并可一键查看变形词本身
- 常见词组与搭配
- 关联词补充
- 词条加载后自动播放美式发音，也可点击按钮重播
- 每条例句都支持单独朗读，可与单词发音互斥播放
- 多张自然风景背景轮播，可在设置中勾选想看的图片，搜索后自动虚化背景
- 背景随机播放，但一轮内每张图都会出现且不重复，全部播完才重新洗牌进入下一轮
- 设置面板分为“背景图片 / 收藏单词 / 使用偏好”三页
- 词条标题旁的小星星用于收藏单词，收藏后变成橙黄色；收藏列表只显示单词，点击即可查询
- 使用偏好里可切换美音 / 英音，影响查词自动朗读和例句朗读的语音
- 搜索历史折叠在顶部按钮中，最多保留 100 条
- 邮箱账号与游客登录，可设置头像和用户名，并同步搜索历史、背景选择与个人资料
- 桌面端登录状态加密保存在本机，正常退出、强制结束或崩溃后重启仍保持登录
- 搜索按钮旁的“生成”会打开紧凑释义速查窗，支持文字、图片和屏幕截图识别
- 速查窗只显示释义，不自动朗读；可手动朗读，也可返回主界面查看完整词条
- 速查窗标题栏提供“置顶 / 取消置顶”；桌面版用原生窗口置顶，Web 版在 Chrome、Edge 中使用画中画窗口
- 置顶窗口关闭后会自动回到页面内悬浮窗；不支持画中画置顶的浏览器会给出提示
- 7 天本地缓存，减少重复请求
- 桌面、平板和手机响应式布局

## 技术栈

- React 19
- Vite 8
- Electron 45：Windows 桌面窗口、托盘、全局快捷键和原生置顶
- 纯 CSS 设计系统，无 UI 框架
- Document Picture-in-Picture API：Chrome/Edge 中的系统级速查窗置顶
- Tesseract.js 本地英文 OCR
- Vite/Electron 中间件统一代理 Merriam-Webster、Datamuse、Free Dictionary 和 MyMemory，避免 API Key 暴露并规避跨域问题

## 数据来源

- 释义、例句、音标和词性：优先使用 Merriam-Webster 官方 API，依次尝试 Learner's Dictionary 和 Collegiate Dictionary
- 备用释义与例句：Free Dictionary API（Wiktionary 数据）
- 近义词、反义词、词组、词形和关联词：Datamuse API
- 义项级近反义词映射：先按释义文本查询 Datamuse，再与整词近反义词取交集
- 释义中文翻译：MyMemory Translation API
- 拼写建议：本地常用词表（[FrequencyWords](https://github.com/hermitdave/FrequencyWords) 的 en_50k，MIT 许可）加本机搜索历史与词典缓存，不联网也能纠错
- 图片/截图英文识别：Tesseract.js 在浏览器本地识别，图片不会上传
- 自动发音：浏览器内置的 en-US 语音合成；不可用时回退到词典音频
- 背景照片：Unsplash

公开词典数据并不保证每个词都有例句或词组；界面会明确显示“暂无数据”，而不是伪造内容。

## 配置

复制环境变量模板并填入 Merriam-Webster API Key：

```powershell
Copy-Item .env.example .env.local
```

```dotenv
MW_LEARNERS_API_KEY=your_learner_key
MW_COLLEGIATE_API_KEY=your_collegiate_key
```

密钥只在 Vite 或 Electron 的服务端代理中使用，不会进入前端构建产物。没有配置密钥时，应用会自动使用 Wiktionary 备用数据源。

安装版桌面 App 从 `%APPDATA%\Lexicon\.env.local` 读取密钥；开发模式也会读取项目根目录的 `.env.local`。

## 账号与云同步

账号功能使用 Supabase。把项目 URL 和 publishable/anon key 写入 `.env.local`（这两个值会进入前端构建产物，属于可公开的客户端密钥，真正的数据隔离由 RLS 完成）：

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_key
```

然后在 Supabase 后台完成两步：

1. 打开 SQL Editor，执行 [supabase/schema.sql](supabase/schema.sql)。它会创建 `profiles`、`search_history`、`user_settings`、`favorites` 四张表、RLS 策略和自动清理触发器。
   如果之前已经执行过旧版 schema，只需再执行 [supabase/migrations/20261125_profile_fields.sql](supabase/migrations/20261125_profile_fields.sql) 增加头像和用户名字段，并执行 [supabase/migrations/20261127_favorites.sql](supabase/migrations/20261127_favorites.sql) 增加收藏表。
2. 打开 Authentication → Providers，启用 **Anonymous sign-ins**（游客登录）。邮箱登录默认已开启；若希望注册后立即登录，可在 Authentication → Settings 关闭 “Confirm email”。

同步规则：

- 搜索历史：登录时合并本地与云端记录，按最近查询排序，最多保留 100 条；之后每次查词自动上传。
- 背景选择：按最后修改时间比较，本地和云端以较新的一方为准；之后每次勾选会自动上传。
- 收藏单词：登录时把本地与云端收藏取并集，本地新增的补写云端；之后每次收藏/取消都会同步，每人最多 500 条。
- 头像和用户名：在账号面板点“编辑资料”设置；头像会自动裁剪为 256×256 方形并压缩，用户名最多 24 个字符。
- 游客登录：数据绑定当前设备的匿名账号，换设备或退出后无法找回，建议需要长期保存时使用邮箱账号。
- 退出登录不会删除本机历史或背景设置，只会停止云同步。
- 桌面端的 Supabase 会话同时写入 `%APPDATA%\Lexicon\supabase-auth.json`，通过 Electron safeStorage 加密；即使进程被强制结束也不会丢登录态。点“退出登录”会同时清除该备份。

会话持久化的实现与验证：

- `src/lib/supabase.js` 把 Supabase 的存储层接到预加载脚本暴露的 `authStorage`，主进程由 `electron/auth-store.cjs` 读写加密文件。
- 写入顺序是“先临时文件、再原子重命名”，并用队列串行化，避免刷新 token 时并发读写互相覆盖。
- 使用 safeStorage 的异步接口；系统加密密钥轮换（`shouldReEncrypt`）后会自动重新加密写回。
- Web 版直接用浏览器 `localStorage`；桌面版在此基础上多一层加密文件，文件缺失时会用 `localStorage` 兜底并补写。
- 加密文件依赖同一份用户配置里的 `Local State` 生成密钥，迁移或备份 `%APPDATA%\Lexicon` 时请把 `Local State` 一起带上，否则会话无法解密，只能重新登录。

```powershell
npm run build
npm run check:session        # 桌面版：登录 -> 重启 -> 仍登录 -> 退出登录
npm run preview              # 另开终端，供下面的 Web 测试使用
npm run check:session:web    # Web 版：登录 -> 刷新页面 -> 仍登录

# 也可以直接验证已打包的 exe
$env:LEXICON_EXECUTABLE = 'release/win-unpacked/Lexicon.exe'
npm run check:session
```

两个脚本分别位于 [scripts/session-persistence-e2e.mjs](scripts/session-persistence-e2e.mjs) 和 [scripts/session-persistence-web.mjs](scripts/session-persistence-web.mjs)，均使用 `playwright-core` 驱动真实窗口；Web 版默认使用本机 Edge，可用 `LEXICON_WEB_URL` 改地址。它们会创建临时游客账号，测试结束不会影响本机配置。

部署后可运行自检：

```powershell
npm run check:supabase
npm run check:supabase -- --with-guest
```

第一条检查认证开关和四张表是否存在；第二条会创建一个临时游客账号，实际读写历史、背景设置和收藏，验证 RLS 后清理测试数据。若表显示“不存在”，说明 SQL 没有执行在当前 URL 对应的项目里；请核对项目 ref 是否为 `yfihddduxmragnfcslbk`。

## 运行

```powershell
npm install
npm run dev
```

打开终端输出的本地地址，通常是 `http://127.0.0.1:5173/`。

生产构建与预览：

```powershell
npm run build
npm run preview
```

Merriam-Webster 代理由 Vite 的预览服务器提供，因此请使用 `npm run preview` 验证生产构建。若直接把 `dist/` 放到纯静态服务器，应用仍可运行，但 MW 请求不可用时会回退到 Wiktionary。

桌面 App 开发：

```powershell
npm run app:dev
```

生成免安装目录：

```powershell
npm run desktop:pack
```

运行 `release\win-unpacked\Lexicon.exe`。

生成 Windows 安装包：

```powershell
npm run desktop:build
```

安装包位于 `release\Lexicon-1.0.0-Setup.exe`。桌面版关闭主窗口后会驻留托盘；托盘菜单可重新打开词典、打开速查窗或退出。`Ctrl+Shift+D` 可从任意应用唤起释义速查窗。

## 目录

```text
src/
  App.jsx                 页面、搜索流程和词典展示
  FloatingApp.jsx         桌面原生速查窗的渲染入口
  components/
    FloatingLookup.jsx    紧凑释义速查悬浮窗、图片与截图输入
    Icons.jsx             内联 SVG 图标
    TranslatedText.jsx    英文内容的中文机译
    WordText.jsx          可点击单词、词组和词条 chip
  lib/
    dictionary.js         词典 API、Datamuse、缓存和最近记录
    favorites.js          收藏单词的本机存储
    fuzzy.js              编辑距离与 Jaro-Winkler 相似度、拼写建议排序
    morphology.js         变形词还原规则与不规则词表
    preferences.js        使用偏好（发音口音）存储
    suggest.js            加载常用词表，合并本地历史给出拼写建议
    wordlist.js           常用词表加载（拼写建议与词形还原共用）
    ocr.js                本地 Tesseract 英文图片识别
    pos.js                词性缩写
    speech.js             美式语音选择
    text.js               单词切分、词形过滤和文本工具
  styles.css              完整视觉系统与响应式样式
public/
  backgrounds/            自然风景背景图
  words/en-50k.txt        拼写建议用的常用词表（按词频排序）
  tesseract/              OCR worker、WASM 核心和英文模型
vite.config.js            React 构建配置与 Merriam-Webster API 代理
electron/
  main.cjs                Electron 主进程、窗口、托盘、快捷键和 IPC
  capture.cjs             全屏截图、选区裁剪和截图会话管理
  capture-overlay.html    原生截图框选层界面
  capture-preload.cjs     框选层与主进程的安全桥接
  preload.cjs             安全的渲染端桥接
  server.cjs              桌面版本地静态服务与外部 API 代理
  settings.cjs            窗口位置和置顶状态持久化
  env.cjs                 桌面版 API Key 读取
scripts/
  build-desktop.mjs       可复用的 Windows 打包脚本
build/                    应用与托盘图标
.env.example              环境变量模板（不包含真实密钥）
```

## 已知限制

- 界面为中文，但释义与例句保留公开词典数据源中的英文原文。
- 中文释义与例句译文均为机器翻译，可能不适用于专业术语、习语或复杂语法上下文。
- 自动发音优先使用浏览器本地语音；若系统没有可用的 en-US 语音，或浏览器拦截自动播放，仍可点击“美音”按钮重播。
- Merriam-Webster 数据受其 API 套餐和调用额度约束；未配置密钥或额度用尽时自动回退到 Wiktionary。
- 义项级近反义词采用启发式映射，个别冷门或跨词性关系可能缺失或不够精确。
- Free Dictionary API 和 Merriam-Webster 均以单词词条为主，不提供可靠的多词短语词条；搜索短语时会引导用户点击其中的单词。
- 例句和词组取决于公开数据源，不是每个词都有。
- 不规则词形（如 go → went）不一定能被 Datamuse 的前缀规则覆盖；已展示的词形都来自数据源返回结果。
- Web 版屏幕截图需要浏览器授予画面捕捉权限，桌面版不需要；OCR 主要针对英文，低清图片可能识别不准。
- Windows 安装包未配置代码签名证书，首次运行时可能出现 SmartScreen 提示。
