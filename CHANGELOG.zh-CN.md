# 更新记录

每个版本改了什么，写给正在决定要不要装的人看。

本文件是 GitHub Release **中文**正文的来源；英文仍见 [CHANGELOG.md](CHANGELOG.md)。
GitHub Release 由 [Scripts/release-notes.py](Scripts/release-notes.py) 生成双语正文（中文在前）。
在打 tag 之前写好 `## x.y.z` 条目；语法与英文相同：列表、`**粗体**`、`` `代码` ``、`[链接](https://example.com)`。

应用版本就是这个标题，与 `VERSION` 文件以及 tag `v` 加该版本一致。

## 0.1.4

- **现在叫 Bot，不再叫同事。** 侧边栏列出每一个 Bot。可以新建、改名，删除时要输入它的名字。
- **每个 Bot 有自己的文件。** 可以挂上一个 GitHub 仓库，也可以粘贴任意 git 地址。检出目录在这个 Bot 自己的文件夹里，删掉 Bot 时一并去掉。
- **第一次打开会在这台 Mac 上准备工具。** Codex、Kimi、Grok 和 ego(lite)。已经装好的话可以跳过。
- **BlinkyBot 留在菜单栏。** 关掉窗口它还在运行。如果端口已经被别的程序占用，窗口会说明原因，并提供重试和复制诊断信息。
- **聊天可以用 Kimi 和 Grok。** 在模型菜单里选择。没有安装 CLI、Grok 没登录、用量到顶，都会在对话里说清楚。看板会显示 Bot 正在工作。
- **一次运行可以在 Rex 里打开。** 设置里有「在 Rex 中显示 Bot 活动」。每个 Bot 有自己的本地 Rex 会话；没装 Rex 时这项保持关闭。
- **浏览器任务走 ego(lite)。** BlinkyBot 不会改用别的浏览器。

## 0.1.3

- **Compose 能打开了。** 打包后的应用在 Next 启动时找不到 `@swc/helpers`，窗口停在「Compose is not open yet.」。现在独立服务器会把 Next 启动时要加载的包链到它能找到的位置。
- **Mac 打开检查挡住坏包。** CI 会启动打好的 BlinkyBot.app，并要求 `http://127.0.0.1:3000/api/version` 有响应。缺模块会让任务失败，发布不会继续。

## 0.1.2

- **BlinkyBot 可以自己更新。** BlinkyBot 菜单里有「Check for Updates…」。已安装的应用大约每 12 小时也会找一次新版本。设置里的 Updates 可以关掉自动检查。没有测试通道。
- **一次更新就是完整的应用。** Sparkle 安装的是发布页上的 zip，不是差分包，也不是磁盘映像。替换应用之前，BlinkyBot 会先停掉本地 Engine 和 Compose，然后再重新打开。
- **0.1.1 里没有更新器。** 需要先从磁盘映像手动安装 0.1.2。之后的版本可以在应用里更新。

## 0.1.1

- **Mac 应用在没有 Supabase 项目时也能打开。** 本地模式不再在第一屏创建 Supabase 客户端，缺少项目 URL 或 API key 不会让看板崩溃。
- **窗口是产品窗口。** 标题栏不再显示本机地址，后退、前进和刷新按钮也去掉了。
- **安装包更小。** 应用带上的是 Next.js standalone 服务器和精简后的 Engine，不是完整依赖树。Chromium 不进安装包，第一次需要时再下载。
- **安装方式是拖进「应用程序」。** 打开磁盘映像，把 BlinkyBot 拖到「应用程序」，再打开。它不是双击安装的 `.pkg`。

## 0.1.0

- **BlinkyBot 以 Mac 应用安装。** 打开后，它会在这台 Mac 上启动本地 Engine 和 Compose 界面。不需要 Docker，也不需要 Supabase 项目。
- **首批运行时是这台 Mac 上已有的 CLI。** Codex CLI、Kimi CLI、Grok CLI，以及已经安装的 Claude Code。
- **同事、记忆和审批留在这台 Mac 上。** 数据在 `~/Library/Application Support/BlinkyBot`。
- **协议是 AGPL-3.0-only。** 许可全文在应用包里，也在仓库里。本项目是 Rerun 的分支。
