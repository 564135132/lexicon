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
- 按英文缩写词性（`n.`、`v.`、`adj.`、`pron.` 等）切换释义
- 默认只展示前 2 条释义和前 5 个词组，其余可展开，常见词条尽量在一屏内读完
- 自动收起空的词形、同反义词等区块，减少无效留白
- 每条英文释义和例句自动附带中文机器翻译，并缓存 30 天以减少重复请求
- 释义与例句中的每个英文单词都可点击
- 近义词、反义词标注到具体义项，并分别显示为“此义近义词 / 此义反义词”
- 词形家族与派生形式
- 常见词组与搭配
- 关联词补充
- 词条加载后自动播放美式发音，也可点击按钮重播
- 每条例句都支持单独朗读，可与单词发音互斥播放
- 三张自然风景背景轮播，搜索后自动虚化背景
- 搜索历史折叠在顶部按钮中，最多保留 100 条
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
    ocr.js                本地 Tesseract 英文图片识别
    pos.js                词性缩写
    speech.js             美式语音选择
    text.js               单词切分、词形过滤和文本工具
  styles.css              完整视觉系统与响应式样式
public/
  backgrounds/            自然风景背景图
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
