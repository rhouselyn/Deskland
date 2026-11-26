# Deskland Windows 宿主

以 C# / .NET Framework 和 WebView2 把主题页面挂到 Windows 桌面图标层下方。

## 构建与运行

```powershell
powershell -ExecutionPolicy Bypass -File host\build.ps1
host\bin\Deskland.exe
```

构建脚本使用 Windows 自带的 C# 编译器，首次从 NuGet 下载固定版本的 WebView2 开发库。依赖保存在 `host/lib/`，输出位于 `host/bin/`；二者均不提交到仓库。

独立桌宠已替换为 qianyiai/KuroCat 4.7.0 的 Rust/Tauri 与 Canvas 引擎，构建需要 Node.js 20 或 22+、Rust MSVC 工具链、Visual Studio C++ Build Tools 和 Windows SDK。`host/KuroCat/build.ps1` 编译前端、设置页预览与 Rust 程序，生成 `host/bin/DesklandPet.exe`。设置仍保存在 Preview 的 `settings.json` 中独立的 `pet` 字段，角色与引擎数据位于 `%LOCALAPPDATA%\DesklandPreview\Pet`。迁移前保留 `settings-before-kurocat-v47.json`；退出宿主后桌宠随之关闭，不建立独立托盘或启动项，不运行原项目更新器。MCP HTTP 监听只在用户开启扩展时绑定本机地址。

## 常用参数

| 参数 | 行为 |
| --- | --- |
| 无参数 | 启动壁纸并打开设置；已运行时打开设置 |
| `--autostart` | 后台启动，不弹设置 |
| `--settings` | 打开设置 |
| `--menu` | 打开托盘菜单 |
| `--reload` | 在后台重新载入当前壁纸 |
| `--exit` | 正常退出，恢复系统壁纸 |
| `--exit-installed` | 安装器使用：仅退出使用当前可执行文件路径的实例 |

## 行为与数据

- 主题来自 `prototype/themes.json`，仅加载状态为 `ready` 的主题。
- 每 400ms 检查桌面图标位置，有变化才通知主题页面。
- 前台窗口最大化或全屏时暂停；壁纸启动不抢占前台，自身、不可见及 cloaked 窗口不会误触发暂停；托盘可手动暂停与继续。设置页按程序版本刷新缓存，缩略图使用内嵌图片和真实 `<img>`。
- Windows 11 24H2 及以后使用 Progman 分层子窗口；较早系统使用 WorkerW。
- 当前仅覆盖主显示器；系统壁纸幻灯片或 Windows 聚焦换图时可能短暂闪烁。
- 设置保存到 `%LOCALAPPDATA%\DesklandPreview\settings.json`，日志为同目录下的 `host.log`。
- 不提供账号登录、购买恢复或自动检查更新；不会启动时或打开设置时联网检查新版本。
- 分享只使用图标位置，主题页面会画示例图标和名字色块，不截取桌面窗口。
- 主题页面改动后，运行 `host\bin\Deskland.exe --reload`，也可以手动选择托盘的“重新载入”。修改宿主 C# 后需要退出并重新构建。

安装测试可设置绝对路径环境变量 `DESKLAND_PROFILE_DIR`，隔离设置、WebView2 缓存和单实例事件；此模式跳过旧数据迁移，并禁用开机启动写入。正常启动不设置此变量，继续使用原数据目录。

## 页面通信

设置页发送 `hello`、`set`、`reset`、`theme`、`lang`、`autostart`、分享相关消息；宿主发送初始化设置、图标矩形和分享结果。

主题页发送 `ready` 后，宿主依次传递设置和图标位置；随后传递参数变化、图标变化和暂停状态。设置与主题页面统一从本地虚拟域名加载。

## 草原人家

“桌面互动 → 透明任务栏”默认开启，只去掉 Windows 任务栏底色和边线，保留图标、托盘和时钟。关闭、恢复主题默认值、切换到其他主题或退出后恢复。Windows 11 使用固定版本的开源 ExplorerTAP 背景组件（构建时下载并校验），初始化在后台执行；浏览器预览不修改系统任务栏。不与其他任务栏美化工具同时使用。Windows 更新可能改变任务栏内部结构，需要重新验证兼容性。

草原世界存档为数据目录中的 `pastoral-world.json`，原子替换并保留 `.bak`；地点保存在该主题的设置中。默认使用深圳城市级参考地点及固定 17:29，可在设置页定位或手动输入其他地点。只有桌面实例保存模拟状态，预览接收只读快照。世界模拟测试：`node tools/test-pastoral.cjs`。
