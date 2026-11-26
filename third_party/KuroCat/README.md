# 🐈‍⬛ KuroCat

> 🌐 **官方网站与网页端在线试玩 / 国内高速下载**：[**https://qianyi.one/kurocat**](https://qianyi.one/kurocat)

轻量级 **Windows（Win11/10 & Win7 SP1）/ macOS（10.15+ Apple Silicon & Intel）/ Linux（银河麒麟 KylinOS / Ubuntu / UOS）** 透明置顶桌面打字猫咪伴侣（开箱自带 **6 款手绘猫咪皮肤 + 🐳 大肥鱼（鲸鱼娘）**：经典小黑猫、暖奶茶布偶猫、大橘猫、三花猫、奶牛猫、暹罗猫、大肥鱼，支持**输密码自动闭眼/捂眼防偷窥**，并原生内置 **MCP 协议服务端**，支持用 AI 一句话定制或新增更多你自己的猫咪！），基于 **Tauri v2（Rust 全局原生钩子 + 内置 MCP 引擎 + HTML5 Canvas 2D）** 打造。单文件轻量低耗，零外部运行时依赖。

## 🎬 在线试玩预览 & 鲸鱼娘 14s 演示视频

<table>
  <tr>
    <td align="center" width="54%" valign="top">
      <a href="https://qianyi.one/kurocat/" target="_blank" rel="noopener">
        <img src="docs/playground-demo.webp" alt="KuroCat 官网实时网页试玩（7 款皮肤切换 · 65%/108 键 · 密码防偷窥）" width="400" />
      </a>
      <br/>
      <strong>🎮 <a href="https://qianyi.one/kurocat/">点此进入官网实时在线试玩（直接敲键盘 &amp; 摸猫头）→</a></strong>
      <br/>
      <sub>内置 6 款猫咪 + 🐳 大肥鱼 · 65%/108 键 · 正反双视角 · 密码防偷窥 · 20%–150% 无级缩放</sub>
    </td>
    <td align="center" width="46%" valign="top">
      <a href="https://qianyi.one/kurocat/#whale-demo" target="_blank" rel="noopener">
        <img src="docs/whale-demo.webp" alt="KuroCat 🐳 大肥鱼（鲸鱼娘）14s 演示视频（鼠标 + 打字 + 鲸尾三同动 · 加速笑开花 · 密码捂眼防偷窥）" width="272" />
      </a>
      <br/>
      <strong>🐳 <a href="https://qianyi.one/kurocat/#whale-demo">观看 1080×1920 60fps 含音效原版视频 →</a></strong>
      <br/>
      <sub>
        鼠标 + 手打字 + 鲸尾甩拍三同动 → 加速笑开花 → 密码捂眼防偷窥<br/>
        📥 <a href="https://qianyi.one/kurocat/media/whale-douyin-14s.mp4">下载原版 MP4（国内高速）</a> · <a href="https://github.com/qianyiai/kurocat/releases/download/v4.7.0/KuroCat-whale-demo-14s.mp4">GitHub 原片</a>
      </sub>
    </td>
  </tr>
</table>

## 📥 直接下载使用（Windows / Win7 / macOS / Linux）

前往 [Releases](https://github.com/qianyiai/kurocat/releases) 页面或直接点击下方最新 **`v4.7.0`** 安装包下载（所有版本均内置 **20%–150% 丝滑缩放滑动条**、右键一键切换 **65% 紧凑 / 108 全尺寸小键盘** 与 **面向猫咪 / 面向观众** 方向、**输密码自动闭眼/捂眼防偷窥**、**按住 `Alt` 随时解锁鼠标穿透**、**无边框 / 全屏优化游戏持续 Z 序置顶守护**、托盘一键 **以管理员身份重启（捕获游戏键鼠）** & **游戏反作弊护航暂停** 与 App 内自动新版本提醒及一键自升级）：

- **🪟 Windows 10 / 11（65% 经典安装版 · `v4.7.0`）**：[**`KuroCat-4.7.0-x64-setup.exe`**](https://github.com/qianyiai/kurocat/releases/download/v4.7.0/KuroCat-4.7.0-x64-setup.exe)（约 1.62 MB）｜[**官网国内高速下载**](https://qianyi.one/kurocat/#download)
  - 默认 65% 紧凑机械键盘，自动创建桌面 **`KuroCat`** 图标、开始菜单与系统卸载入口；右键或托盘随时一键切换 **108 键全尺寸小键盘**、**🐳 大肥鱼（鲸鱼娘）** 与 App 内一键更新。
  - **常见问题说明**：
    - **Edge / Chrome 浏览器提示「通常不会下载 `.exe`」怎么办？**（开源免费软件未购商业代码签名证书，全量源码公开可放心信任）：
      - **Edge 浏览器**：鼠标移到该下载条上 → 点右侧 **三个点 `···`** → 点 **「保留」** → 弹窗出现「删除」按钮时，点开旁边的 **下箭头 `▾`（显示更多）** → 选择 **「仍然保留」** 即可完成下载。
      - **Chrome 浏览器**：按 `Ctrl + J` 打开下载记录 → 点 **「保留危险文件」** → **「仍然保留」**。
      - **双击安装若弹出蓝框「Windows 已保护你的电脑」**：点 **「更多信息」** → 点 **「仍要运行」** 即可。
    - 极少数老版 Win10 / LTSC 精简版若提示缺少 `WebView2 Runtime`，安装微软官方 1.8 MB 引导程序（右键「以管理员身份运行」）即可：[`MicrosoftEdgeWebview2Setup.exe`](https://go.microsoft.com/fwlink/p/?LinkId=2124703)。
    - **游戏全屏 / 管理员权限 / 直播提示**：单机与常规游戏在 Win10/11 全屏优化（FSO）或「无边框窗口化」下内置持续 Z 序置顶守卫且绝不抢焦点（建议开启「锁定鼠标穿透」，按 `Alt` 随时解锁）；若游戏本身以管理员权限运行导致无法捕获键鼠，右键系统托盘点击 **「以管理员身份重启（捕获游戏键鼠）」** 即可无缝提权；直播录屏推荐 OBS 添加「窗口捕获」叠加；玩无畏契约 / 三角洲行动等强内核反作弊网游建议右键托盘开启 **「暂停监听并隐藏（游戏反作弊护航）」**。
- **🖥️ Windows 7 SP1（64 位专属兼容绿包版 · `v4.7.0`）**：[**`KuroCat-v4.7.0-win7-x64-portable.zip`**](https://github.com/qianyiai/kurocat/releases/download/v4.7.0/KuroCat-v4.7.0-win7-x64-portable.zip)（178.76 MB）｜[**官网国内高速下载**](https://qianyi.one/kurocat/releases/v4.7.0/KuroCat-v4.7.0-win7-x64-portable.zip)
  - 原生 PE 6.01 编译（零 Win8/Win10 DLL 依赖），内置微软官方最后一版支持 Win7 的离线 **WebView2 109.0.1518.78** 运行库，并搭载 **Win7 原生 256 级逐像素透明抗锯齿渲染（`UpdateLayeredWindow`）**，开不开 Aero 均无白底框与锯齿；解压后保持 `KuroCat.exe` 与 `WebView2Runtime` 同目录直接双击即可运行。
- **🍎 macOS 10.15 Catalina+（Apple Silicon M1–M4 & Intel 通用版 · `v4.7.0`）**：[**`KuroCat-v4.7.0-macos-universal.dmg`**](https://github.com/qianyiai/kurocat/releases/download/v4.7.0/KuroCat-v4.7.0-macos-universal.dmg)（5.50 MB）｜[**官网国内高速下载**](https://qianyi.one/kurocat/releases/v4.7.0/KuroCat-v4.7.0-macos-universal.dmg)
  - 打开 `.dmg` 将 `KuroCat.app` 拖入「应用程序」文件夹运行，内置 65% / 108 键切换与全部 7 款皮肤（含 🐳 大肥鱼鲸鱼娘）。
  - **首次打开说明（开源未公证应用）**：若提示「无法验证开发者」或「已损坏」，在终端执行一次 `xattr -cr /Applications/KuroCat.app` 后即可正常打开（后续 App 内一键升级会自动处理，无需再敲命令）。
  - **键盘与鼠标监听权限**：首次启动会自动弹出系统授权引导，请在「系统设置 → 隐私与安全性」中同时勾选 **「辅助功能」与「输入监控」** 里的 `KuroCat`（即开即生效，兼容 Karabiner-Elements；若覆盖升级后权限未生效，在列表中选中 `KuroCat` 点左下角 `-` 删除再重新 `+` 添加即可）。
  - **macOS Stdio MCP 路径**：`/Applications/KuroCat.app/Contents/MacOS/KuroCat`（参数 `--mcp`），或在桌宠运行时直接连接 `http://127.0.0.1:27420/mcp`。
- **🐧 Linux / 银河麒麟 KylinOS / 优麒麟 / Ubuntu / UOS（`v4.7.0`）**：
  - **x86_64（Intel / AMD / 兆芯 / 海光）**：[**`.deb`（1.87 MB）**](https://github.com/qianyiai/kurocat/releases/download/v4.7.0/KuroCat-v4.7.0-linux-amd64.deb) · [**`.AppImage`（77.01 MB）**](https://github.com/qianyiai/kurocat/releases/download/v4.7.0/KuroCat-v4.7.0-linux-amd64.AppImage)
  - **ARM64（飞腾 / 鲲鹏 / 树莓派）**：[**`.deb`（1.83 MB）**](https://github.com/qianyiai/kurocat/releases/download/v4.7.0/KuroCat-v4.7.0-linux-arm64.deb) · [**`.AppImage`（75.19 MB）**](https://github.com/qianyiai/kurocat/releases/download/v4.7.0/KuroCat-v4.7.0-linux-arm64.AppImage)
  - 原生动态加载 X11 `XRecord`（免 root 捕获全局键鼠，Wayland 自动支持 `evdev` 回退），官网亦提供全部国内高速镜像：[`https://qianyi.one/kurocat/#linux-download`](https://qianyi.one/kurocat/#linux-download)。

## ✨ 核心特性

<table>
  <tr>
    <td align="center" width="50%">
      <img src="website/public/assets/showcase-108key.webp" alt="65% 紧凑 / 108 键全尺寸 × 面向猫咪 / 面向观众双视角" />
      <br/><sub>65% 紧凑 / 108 键全尺寸 × 面向猫咪 / 面向观众双视角</sub>
    </td>
    <td align="center" width="50%">
      <img src="website/public/assets/showcase-mouse.webp" alt="鼠标左/右键独立高亮 + 自动更新提醒" />
      <br/><sub>鼠标左/右键独立双色高亮 + App 内自动更新提醒</sub>
    </td>
  </tr>
</table>

- **7 款内置皮肤（6 款猫咪 + 🐳 大肥鱼鲸鱼娘）+ MCP 无限自定义**：
  - **🐈‍⬛ 经典小黑猫** / **🐱 暖奶茶布偶猫** / **🍊 大橘猫**（虎斑 `M` 额纹 + 环纹尾） / **🌸 三花猫** / **🐄 奶牛猫**（燕尾服 + 白手套） / **🤎 暹罗猫**（挖煤重点色） / **🐳 大肥鱼（鲸鱼娘）**（三肢同步键鼠 + 鲸鱼尾拍打右侧功能键带水花特效 + 稳定 4 表情与手速腮红），右键或系统托盘 0.1 秒一键无缝切换。
  - **🙈 系统级输密码自动闭眼 / 捂眼防偷窥**：Windows（UI Automation `CurrentIsPassword` + Win32 `ES_PASSWORD`）与 macOS（`IsSecureEventInputEnabled` + `AXSecureTextField`）自动感知密码输入框，Rust 底层钩子直接拦截真实按键不外传——猫咪温柔闭眼、大肥鱼双手捂眼并覆盖键盘防窥遮罩，可右键/托盘随时开关。
  - **🤖 原生内置 MCP 服务（AI 一句话捏自己的猫）**：无需装 Node.js 或 Python，直接把自家猫照片发给 **Claude Desktop / Cursor / Antigravity / Windsurf / Cline**，AI 通过内置 MCP 工具自动生成橘猫（虎斑 `M` 额纹 + 环纹尾）、三花猫、奶牛猫、暹罗猫、英短蓝猫或带专属胎记斑块的独一无二桌宠，**0.4 秒热更新到桌面、无需重启**！
- **65% / 108 键全尺寸可选 + 键盘正反视角可选 + 鼠标左右键独立识别**：
  - 支持 **65% 紧凑机械键盘** 与 **108 键全尺寸机械键盘（完整 F1~F12、PrtSc/ScrLk/Pause、顶部 4 颗多媒体键、独立方向/编辑区与完整数字小键盘，含 2U 竖长 `+` 与独立小回车 `Num↵`）**，右键或托盘一键切换并自动平滑调整窗口宽度。
  - 支持 **「面向猫咪（180° 真实视角）」** 与 **「面向观众（正向字母易读视角）」** 自由切换，同步重投影 3D 梯形透视与鼠标左右键朝向！
  - 鼠标左键（`L`）、右键（`R`）、中键/滚轮完全独立区分高亮（左键用猫咪主强调色、右键用高对比珊瑚橙/天蓝色、各自带 3D 按下阴影与迷你 `LMB`/`RMB` 气泡），猫爪握鼠时自动露出双键并向对应按键偏移轻拍，支持左右键同时按住！
  - 纯打字时头部与上身随敲击节奏灵动左右晃动歪头，未敲键一侧自动蜷爪收在胸前。
- **App 内自动新版本提醒 & 一键升级**：启动后及定时静默检测 GitHub Releases 新版本，有更新时自动在猫头上方弹出轻量提醒条，右键猫咪或系统托盘点 **「检查更新」** 即可自动下载、SHA-256 校验并静默安装重启（Windows 安装版 / 绿色单文件版 / macOS 通用版均支持）。
- **摸头眯眼与呼噜互动**：鼠标移到猫头上自动切换为黑白描边小手光标，来回抚摸即触发慵懒细眯眼表情，并伴随 Web Audio 实时合成的温柔猫咪呼噜声（默认开启，可随时开关，不干扰自身键鼠声音）。
- **错落弹跳 3D 按键气泡**：键盘上方实时弹出白底立体键帽，支持一键隐藏（输密码更安心）。
- **智能鼠标穿透 & 系统托盘**：透明区域自动点击穿透不遮挡办公或游戏，右键猫咪或系统托盘可一键切换外观、使用 **20%–150% 丝滑滑动条**无级调节尺寸、开关 MCP 服务并**一键复制 MCP 配置**。

## 🤖 MCP 接入指南（用 AI 改猫 / 加自己的猫）

KuroCat `v4.0.0+` 单文件程序原生内置 **Stdio** 与 **本机 Streamable HTTP（`127.0.0.1:27420`）** 双模式 MCP Server，无需任何额外依赖！

### 最快接入方式
1. 运行 `KuroCat`，右键猫咪 → 确认勾选 **「开启 MCP 扩展」** → 点击 **「复制 MCP 配置」**。
2. 粘贴到你常用的 AI 客户端 MCP 配置文件（Claude Desktop / Cursor / Antigravity / Windsurf / Cline）：

**方式 A：Stdio 模式（通用推荐，所有 MCP 客户端均支持）**
```json
{
  "mcpServers": {
    "kurocat": {
      "command": "C:\\Users\\<你的用户名>\\AppData\\Local\\KuroCat\\KuroCat.exe",
      "args": ["--mcp"]
    }
  }
}
```

**方式 B：本机 HTTP 模式（桌宠运行时直接连接）**
```json
{
  "mcpServers": {
    "kurocat": {
      "url": "http://127.0.0.1:27420/mcp"
    }
  }
}
```

### 试试这样跟 AI 说
- *「帮我用 KuroCat MCP 新增一只大橘猫（虎斑纹 + 白手套 + 橘色高亮键盘），并马上切过去」*
- *「看这张我家三花猫的照片，用 KuroCat MCP 按它的花色和斑点给我捏一只专属桌宠！」*
- *「把桌宠放大到 125%，关闭悬浮按键气泡，切回小黑猫」*

### 内置 MCP 工具清单
| 工具名 | 功能说明 |
| --- | --- |
| `list_cats` | 查看所有内置与自定义猫咪外观及当前激活的猫 |
| `get_cat_schema` | 获取完整花色参数规范、6 种花纹（`solid`/`bicolor`/`tuxedo`/`tabby`/`calico`/`siamese`）、自定义斑点坐标与常见品种模板 |
| `upsert_cat` | 新增或修改任意自定义猫咪（毛色、花纹、耳朵、瞳色、尾巴、白手套、高亮色、自定义胎记斑块），实时热更新上屏 |
| `switch_cat` | 按 ID 秒切桌面当前显示的猫咪 |
| `delete_cat` | 删除指定自定义猫咪（或重置内置外观） |
| `get_settings` / `update_settings` | 读取或实时修改缩放比例、按键气泡、呼噜声、置顶、穿透锁定与开机自启 |

自定义猫咪配置保存在：
- **Windows**：`%APPDATA%\kuro-cat-pet\cats.json`
- **macOS**：`~/Library/Application Support/kuro-cat-pet/cats.json`

也可手动编辑，桌宠自动实时热重载。

## 🛠️ 本地源码构建

前置环境：Windows 10/11 或 macOS 11+、Node.js 18+、Rust 工具链（`cargo`）。

```bash
git clone https://github.com/qianyiai/kurocat.git
cd kurocat
npm install
npm run tauri:dev      # 本地热更新调试
npm run tauri:build    # 编译 Release 可执行文件与安装包
```

## 📄 开源协议与致谢

本项目基于 [MIT License](LICENSE) 开源。

- 内置皮肤 **🐳 大肥鱼（鲸鱼娘）** 运行时素材基于 MIT 开源项目 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（参考衍生 [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)）制作，完整许可声明见 `src/assets/dafeiyu/LICENSE-MIT.txt`。
