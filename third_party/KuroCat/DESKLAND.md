# Deskland Preview integration

Source: https://github.com/qianyiai/kurocat
Version: 4.7.0, revision fa0f3504b434d366c41758dfedff03228fa9abae
License: MIT (LICENSE); BigFish assets retain src/assets/dafeiyu/LICENSE-MIT.txt.

The Rust global input hooks, password guard, hit testing, topmost guard, MCP,
Canvas animation engine and all seven built-in characters are reused.

Integration changes:
- src/main.ts hosts only the pet canvas. Deskland owns the settings UI.
- src-tauri/src/deskland.rs exchanges settings and counters over redirected
  stdio, and terminates the child when its host exits. Key events stay inside
  the pet process. --mcp retains the upstream stdio MCP mode.
- Data is isolated under LOCALAPPDATA/DesklandPreview/Pet. Startup uses only
  Deskland's startup setting; the independent registry/shortcut code is removed.
- The updater, update service calls and independent tray have been removed.
- MCP is off by default; its loopback listener opens only while enabled.
- The application identity is app.deskland.preview.pet; the executable is
  DesklandPet.exe. No upstream installer is built.
- The Canvas loop is idempotent and capped at 30fps. Reapplying preferences
  cannot start extra loops, and pausing cancels the active animation.
- Preview cards reuse canvases; replacing a card disposes its engine, including
  its window resize listener and scheduled animation. Closing the pet page
  also disposes the live renderer.

Build through host/build.ps1, requiring Node/npm, Rust (MSVC target), Visual
Studio C++ Build Tools and a Windows SDK. Generated output and dependencies
are excluded from source packages. Old pet settings are backed up before
migration; old sizes above 150% are clamped to the new engine's maximum.
