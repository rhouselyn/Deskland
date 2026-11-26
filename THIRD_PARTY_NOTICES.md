# 第三方依赖 / Third-party dependencies

## KuroCat

桌宠已替换为 qianyiai/KuroCat 4.7.0，MIT，Copyright (c) 2026 KuroCat Contributors。源码与完整许可位于 `third_party/KuroCat`。复用 Rust 全局输入、密码保护、置顶守护、Canvas 绘制与 MCP 皮肤服务，新增 Deskland 设置和生命周期桥接。自动更新、独立托盘和启动项已移除；MCP 默认关闭。

Source revision: https://github.com/qianyiai/kurocat/tree/fa0f3504b434d366c41758dfedff03228fa9abae . Integration notes: `third_party/KuroCat/DESKLAND.md`. BigFish assets originate from PC2005-cloud/dsh-pet with reference to QCYTSN/dsh-dafeiyu; their MIT notice is preserved and distributed in `third_party/KuroCat/src/assets/dafeiyu/LICENSE-MIT.txt`. Rust/npm build dependencies retain their upstream licenses. No release/update endpoints are used at runtime; optional MCP binds loopback only while enabled.

## TranslucentTB ExplorerTAP 2026.2

透明任务栏使用 TranslucentTB 的 ExplorerTAP.dll，仅改变 Windows 11 任务栏背景和边线，保留任务栏内容。未安装 TranslucentTB 应用，不接入其更新功能。组件为 GPL-3.0，适用本包附带的 `LICENSE`。构建脚本下载并校验官方 x64 归档，不提交二进制文件。

Windows 11 taskbar backgrounds use the unmodified GPL-3.0 ExplorerTAP helper from TranslucentTB 2026.2. Copyright TranslucentTB contributors. Corresponding source and build instructions: https://github.com/TranslucentTB/TranslucentTB/tree/d4636e439865df0a1a1419db408e055740ce5c74 . Source archive: https://github.com/TranslucentTB/TranslucentTB/archive/d4636e439865df0a1a1419db408e055740ce5c74.zip . Build dependencies and their notices are described in that repository. The helper is downloaded only at build time; it makes no network requests at runtime.

## Microsoft Edge WebView2

Windows 宿主使用 Microsoft Edge WebView2 SDK 与 WebView2 Runtime。构建脚本从 NuGet 获取开发库，本仓库不提交 SDK 二进制文件。

- 包：`Microsoft.Web.WebView2`，构建版本 `1.0.4191.47`。
- 包与许可信息：https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4191.47
- 文档：https://learn.microsoft.com/microsoft-edge/webview2/

WebView2 及 Windows / .NET Framework 组件适用各自的许可条款，不因本项目的 GPL-3.0 许可而变更。

The host uses the Microsoft Edge WebView2 SDK and Runtime. SDK binaries are downloaded by the build script and are not checked into this repository. Microsoft components retain their respective licenses.

## NSIS

Windows 安装包使用 NSIS 3.13 制作。便携编译器仅在构建时下载，不作为项目源码提交。NSIS 及其压缩模块适用各自许可，详见 https://nsis.sourceforge.io/License 。安装包附带项目对应源码 ZIP。

## SunCalc 1.9.0

Sun position and sunrise/sunset calculations: https://github.com/mourner/suncalc/tree/v1.9.0

BSD-2-Clause; copyright 2014 Vladimir Agafonkin. Full license: `prototype/vendor/suncalc-LICENSE.txt`. Bundled locally; no online service is used for solar calculations.
