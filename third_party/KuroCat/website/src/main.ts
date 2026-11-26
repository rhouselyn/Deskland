import { KuroCatEngine, type KeyboardOrientation } from '../../src/catEngine';
import { catAudio } from '../../src/audio';
import type { KeyboardLayoutId } from '../../src/keyboardLayout';
import { BUILTIN_WEB_CATS } from './builtinCats';
import { keyboardEventToVk } from './webKeyMap';

const LOCAL_MIRROR_VERSION = 'v4.7.0';
const LOCAL_MIRROR_VER_NUM = '4.7.0';
const MACOS_MIRROR_VERSION = 'v4.7.0';

interface ReleaseAssetMap {
  win65: { name: string; primaryUrl: string; ghUrl: string; sizeText: string };
  macos: { name: string; primaryUrl: string; ghUrl: string; sizeText: string };
}

function buildDefaultAssets(): ReleaseAssetMap {
  const localBase = `/kurocat/releases/${LOCAL_MIRROR_VERSION}`;
  const ghBase = `https://github.com/qianyiai/kurocat/releases/download/${LOCAL_MIRROR_VERSION}`;
  const macLocalBase = `/kurocat/releases/${MACOS_MIRROR_VERSION}`;
  const macGhBase = `https://github.com/qianyiai/kurocat/releases/download/${MACOS_MIRROR_VERSION}`;
  const n65 = `KuroCat-${LOCAL_MIRROR_VER_NUM}-x64-setup.exe`;
  const nMac = `KuroCat-${MACOS_MIRROR_VERSION}-macos-universal.dmg`;
  return {
    win65: { name: n65, primaryUrl: `${localBase}/${n65}`, ghUrl: `${ghBase}/${n65}`, sizeText: '1.62 MB' },
    macos: { name: nMac, primaryUrl: `${macLocalBase}/${nMac}`, ghUrl: `${macGhBase}/${nMac}`, sizeText: '5.50 MB' },
  };
}

function formatBytesMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function applyReleaseUI(tag: string, assets: ReleaseAssetMap): void {
  const navPill = document.getElementById('nav-ver-pill');
  if (navPill) navPill.textContent = tag;

  const heroVer = document.getElementById('hero-release-label');
  if (heroVer) heroVer.textContent = `最新版本 ${tag}`;

  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  const heroBtn = document.getElementById('hero-primary-dl') as HTMLAnchorElement | null;
  const heroLabel = document.getElementById('hero-primary-dl-label');
  if (heroBtn && heroLabel) {
    if (isMac) {
      heroBtn.href = assets.macos.primaryUrl;
      heroLabel.textContent = `免费下载 macOS 通用版（${assets.macos.sizeText}）`;
    } else {
      heroBtn.href = assets.win65.primaryUrl;
      heroLabel.textContent = `免费下载 Windows 版（${assets.win65.sizeText}）`;
    }
  }

  (Object.keys(assets) as Array<keyof ReleaseAssetMap>).forEach((key) => {
    const item = assets[key];
    const nameEl = document.querySelector(`[data-asset-name="${key}"]`);
    const sizeEl = document.querySelector(`[data-asset-size="${key}"]`);
    const primaryEl = document.querySelector(`[data-dl-primary="${key}"]`) as HTMLAnchorElement | null;
    const ghEl = document.querySelector(`[data-dl-gh="${key}"]`) as HTMLAnchorElement | null;
    if (nameEl) nameEl.textContent = item.name;
    if (sizeEl) sizeEl.textContent = item.sizeText;
    if (primaryEl) primaryEl.href = item.primaryUrl;
    if (ghEl) {
      ghEl.href = item.ghUrl;
      ghEl.dataset.filename = item.name;
      ghEl.dataset.version = tag;
    }
  });
}

interface LiveStatsPayload {
  total_downloads?: number;
  qianyi_downloads?: number;
  today_downloads?: number;
  github_downloads?: number;
  combined_downloads?: number;
  updated_at_cst?: string;
}

function formatCount(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString('en-US');
}

function refreshLiveDownloadStats(): void {
  void fetch('/kurocat/api/stats', { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<LiveStatsPayload>) : null))
    .then((data) => {
      if (!data) return;
      const qianyiDl =
        typeof data.qianyi_downloads === 'number'
          ? data.qianyi_downloads
          : typeof data.total_downloads === 'number'
            ? data.total_downloads
            : 0;
      const githubDl = typeof data.github_downloads === 'number' ? data.github_downloads : 0;
      const combinedDl =
        typeof data.combined_downloads === 'number' ? data.combined_downloads : qianyiDl + githubDl;
      const todayDl = typeof data.today_downloads === 'number' ? data.today_downloads : 0;

      if (combinedDl > 0) {
        const sep = document.getElementById('site-dl-sep');
        const txt = document.getElementById('site-dl-text');
        if (sep && txt) {
          sep.style.display = '';
          txt.style.display = '';
          txt.textContent = `累计下载 ${formatCount(combinedDl)} 次`;
        }
      }

      const totalEl = document.getElementById('live-dl-total');
      const ghEl = document.getElementById('live-dl-github');
      const qyEl = document.getElementById('live-dl-qianyi');
      const todayEl = document.getElementById('live-dl-today');
      const updatedEl = document.getElementById('live-stats-updated');

      if (totalEl) totalEl.textContent = `${formatCount(combinedDl)}`;
      if (ghEl) ghEl.textContent = `${formatCount(githubDl)}`;
      if (qyEl) qyEl.textContent = `${formatCount(qianyiDl)}`;
      if (todayEl) todayEl.textContent = formatCount(todayDl);
      if (updatedEl) {
        const timePart =
          typeof data.updated_at_cst === 'string' && data.updated_at_cst.length >= 19
            ? data.updated_at_cst.slice(11, 19)
            : new Date().toTimeString().slice(0, 8);
        updatedEl.textContent = `更新于 ${timePart} (UTC+8) · 每 30 秒自动刷新`;
      }
    })
    .catch(() => {});
}

function initDownloadTracking(): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-dl-gh]').forEach((link) => {
    link.addEventListener('click', () => {
      const filename = link.dataset.filename || '';
      const version = link.dataset.version || LOCAL_MIRROR_VERSION;
      if (!filename) return;
      const body = JSON.stringify({ filename, version });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/kurocat/api/track-outbound', new Blob([body], { type: 'application/json' }));
        } else {
          void fetch('/kurocat/api/track-outbound', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
          });
        }
      } catch {
        // Never block outbound navigation
      }
    });
  });
}

async function syncGithubMetadata(): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4500);
  try {
    const [repoRes, relRes] = await Promise.all([
      fetch('https://api.github.com/repos/qianyiai/kurocat', { signal: controller.signal }),
      fetch('https://api.github.com/repos/qianyiai/kurocat/releases/latest', { signal: controller.signal }),
    ]);

    if (repoRes.ok) {
      const repo = await repoRes.json();
      if (typeof repo.stargazers_count === 'number') {
        const sep = document.getElementById('github-stats-sep');
        const txt = document.getElementById('github-stats-text');
        if (sep && txt) {
          sep.style.display = '';
          txt.style.display = '';
          txt.textContent = `★ ${repo.stargazers_count} Stars`;
        }
      }
    }

    if (relRes.ok) {
      const rel = await relRes.json();
      const tag: string | undefined = rel.tag_name;
      const ghAssets: Array<{ name: string; browser_download_url: string; size: number }> = Array.isArray(rel.assets)
        ? rel.assets
        : [];
      if (tag && tag !== LOCAL_MIRROR_VERSION && ghAssets.length >= 2) {
        const defaults = buildDefaultAssets();
        const find = (pred: (n: string) => boolean) => ghAssets.find((a) => pred(a.name));
        const a65 = find((n) => n.endsWith('-x64-setup.exe') && !n.includes('108key'));
        const aMac = find((n) => n.endsWith('-macos-universal.dmg'));

        const updated: ReleaseAssetMap = {
          win65: a65
            ? { name: a65.name, primaryUrl: a65.browser_download_url, ghUrl: a65.browser_download_url, sizeText: formatBytesMB(a65.size) }
            : defaults.win65,
          macos: aMac
            ? { name: aMac.name, primaryUrl: aMac.browser_download_url, ghUrl: aMac.browser_download_url, sizeText: formatBytesMB(aMac.size) }
            : defaults.macos,
        };
        applyReleaseUI(tag, updated);
      }
    }
  } catch {
    // Gracefully stay on fast local mirror defaults if GitHub API is unreachable
  } finally {
    window.clearTimeout(timer);
  }
}

function initPlayground(): void {
  const canvas = document.getElementById('kurocat-canvas') as HTMLCanvasElement | null;
  const viewport = document.getElementById('canvas-viewport') as HTMLDivElement | null;
  if (!canvas || !viewport) return;

  const engine = new KuroCatEngine(canvas, { embedded: true });
  let currentLayout: KeyboardLayoutId = '65';
  let currentOrient: KeyboardOrientation = 'cat';
  let currentSkinId = 'black';
  let autoDemoRunning = true;
  let autoDemoTimer: number | null = null;

  const statusPill = document.getElementById('stage-status-pill');
  const updateStatusPill = () => {
    if (!statusPill) return;
    const layoutText = currentLayout === '108' ? '108 全尺寸' : '65% 紧凑';
    const orientText = currentOrient === 'viewer' ? '面向观众' : '面向猫咪';
    statusPill.textContent = `${layoutText} · ${orientText}`;
  };

  engine.setCatAppearance('black', BUILTIN_WEB_CATS[0]);
  engine.setKeyboardConfig(currentLayout, currentOrient);
  engine.start();
  updateStatusPill();

  const ro = new ResizeObserver(() => engine.resize());
  ro.observe(viewport);

  // Build 6 skin buttons
  const skinHost = document.getElementById('skin-pills');
  if (skinHost) {
    BUILTIN_WEB_CATS.forEach((skin) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `skin-btn${skin.id === currentSkinId ? ' active' : ''}`;
      btn.dataset.skinId = skin.id;
      btn.textContent = `${skin.emoji || '🐱'} ${skin.name}`;
      btn.addEventListener('click', () => {
        currentSkinId = skin.id;
        engine.setCatAppearance(skin.id, skin);
        skinHost.querySelectorAll('.skin-btn').forEach((el) => {
          el.classList.toggle('active', (el as HTMLElement).dataset.skinId === skin.id);
        });
      });
      skinHost.appendChild(btn);
    });
  }

  // Layout & Orientation buttons
  const setLayout = (layout: KeyboardLayoutId) => {
    currentLayout = layout;
    engine.setKeyboardConfig(currentLayout, currentOrient);
    document.querySelectorAll('[data-layout]').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.layout === layout);
    });
    updateStatusPill();
  };

  const setOrient = (orient: KeyboardOrientation) => {
    currentOrient = orient;
    engine.setKeyboardConfig(currentLayout, currentOrient);
    document.querySelectorAll('[data-orient]').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.orient === orient);
    });
    updateStatusPill();
  };

  document.querySelectorAll('[data-layout]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = (btn as HTMLElement).dataset.layout === '108' ? '108' : '65';
      setLayout(val);
    });
  });

  document.querySelectorAll('[data-orient]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const val = (btn as HTMLElement).dataset.orient === 'viewer' ? 'viewer' : 'cat';
      setOrient(val);
    });
  });

  // Feature card button to jump & test 108-key
  const try108Btn = document.getElementById('try-108-btn');
  if (try108Btn) {
    try108Btn.addEventListener('click', () => {
      setLayout('108');
      setOrient('viewer');
      document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      startAutoDemo();
    });
  }

  // Feature card button to switch live playground directly to BigFish (鲸鱼娘)
  const tryDafeiyuBtn = document.getElementById('try-dafeiyu-btn');
  if (tryDafeiyuBtn) {
    tryDafeiyuBtn.addEventListener('click', () => {
      const fish = BUILTIN_WEB_CATS.find((c) => c.id === 'dafeiyu');
      if (fish) {
        currentSkinId = fish.id;
        engine.setCatAppearance(fish.id, fish);
        skinHost?.querySelectorAll('.skin-btn').forEach((el) => {
          el.classList.toggle('active', (el as HTMLElement).dataset.skinId === fish.id);
        });
      }
      setLayout('65');
      setOrient('viewer');
      document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      startAutoDemo();
    });
  }

  // Whale demo vertical video sound toggle
  const whaleVideo = document.getElementById('whale-demo-video') as HTMLVideoElement | null;
  const whaleSoundBtn = document.getElementById('whale-sound-toggle');
  if (whaleVideo && whaleSoundBtn) {
    const syncSoundBtn = () => {
      const muted = whaleVideo.muted;
      whaleSoundBtn.classList.toggle('active', !muted);
      whaleSoundBtn.textContent = muted ? '🔇 点此开启音效' : '🔊 音效已开启';
    };
    whaleSoundBtn.addEventListener('click', () => {
      whaleVideo.muted = !whaleVideo.muted;
      if (!whaleVideo.muted && whaleVideo.paused) {
        void whaleVideo.play().catch(() => {});
      }
      syncSoundBtn();
    });
    whaleVideo.addEventListener('volumechange', syncSoundBtn);
    syncSoundBtn();
  }

  // Backdrop switcher (Dark / Light desktop wallpaper preview)
  document.querySelectorAll('[data-backdrop]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.backdrop === 'light' ? 'light' : 'dark';
      viewport.classList.toggle('backdrop-light', mode === 'light');
      viewport.classList.toggle('backdrop-dark', mode === 'dark');
      document.querySelectorAll('[data-backdrop]').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.backdrop === mode);
      });
    });
  });

  // Bubbles & Purr toggles
  const btnBubbles = document.getElementById('btn-bubbles');
  if (btnBubbles) {
    btnBubbles.addEventListener('click', () => {
      engine.showKeyBubbles = !engine.showKeyBubbles;
      btnBubbles.classList.toggle('active', engine.showKeyBubbles);
    });
  }

  let purrEnabled = true;
  const btnPurr = document.getElementById('btn-purr');
  if (btnPurr) {
    btnPurr.addEventListener('click', () => {
      purrEnabled = !purrEnabled;
      catAudio.setEnabled(purrEnabled);
      btnPurr.classList.toggle('active', purrEnabled);
    });
  }

  // Password privacy interactive demo (manual toggle OR focusing the real <input type="password">)
  const btnPrivacy = document.getElementById('btn-privacy-demo');
  const pwdInput = document.getElementById('web-pwd-test') as HTMLInputElement | null;
  let manualPrivacyPinned = false;
  let pwdInputFocused = false;
  const syncPrivacyState = () => {
    const active = manualPrivacyPinned || pwdInputFocused;
    engine.setPrivacyMode(active);
    if (btnPrivacy) {
      btnPrivacy.classList.toggle('active', active);
      btnPrivacy.textContent = active ? '🙈 密码防偷窥中' : '🔒 密码防偷窥';
    }
  };
  if (btnPrivacy) {
    btnPrivacy.addEventListener('click', () => {
      manualPrivacyPinned = !manualPrivacyPinned;
      if (manualPrivacyPinned && autoDemoRunning) stopAutoDemo();
      syncPrivacyState();
    });
  }
  if (pwdInput) {
    pwdInput.addEventListener('focus', () => {
      pwdInputFocused = true;
      if (autoDemoRunning) stopAutoDemo();
      syncPrivacyState();
    });
    pwdInput.addEventListener('blur', () => {
      pwdInputFocused = false;
      syncPrivacyState();
    });
    pwdInput.addEventListener('keydown', () => {
      engine.onPrivacyTyping();
    });
  }

  // Scale slider (20% - 150%)
  const scaleSlider = document.getElementById('web-scale-slider') as HTMLInputElement | null;
  const scaleValBtn = document.getElementById('web-scale-val');
  const applyScalePct = (pct: number) => {
    const clamped = Math.max(20, Math.min(150, Math.round(pct)));
    engine.setRenderScale(clamped / 100);
    if (scaleSlider) scaleSlider.value = String(clamped);
    if (scaleValBtn) scaleValBtn.textContent = `${clamped}%`;
  };
  if (scaleSlider) {
    scaleSlider.addEventListener('input', () => applyScalePct(Number(scaleSlider.value)));
  }
  if (scaleValBtn) {
    scaleValBtn.addEventListener('click', () => applyScalePct(100));
  }

  // Auto-demo choreography (stops immediately when user starts typing/clicking)
  const btnAutoDemo = document.getElementById('btn-auto-demo');
  const DEMO_SCRIPT: Array<{ type: 'key'; vk: number; hold: number; gap: number } | { type: 'mouse'; btn: 'left' | 'right'; hold: number; gap: number }> = [
    { type: 'key', vk: 0x4b, hold: 90, gap: 165 }, // K
    { type: 'key', vk: 0x55, hold: 85, gap: 155 }, // U
    { type: 'key', vk: 0x52, hold: 90, gap: 160 }, // R
    { type: 'key', vk: 0x4f, hold: 85, gap: 170 }, // O
    { type: 'key', vk: 0x43, hold: 90, gap: 160 }, // C
    { type: 'key', vk: 0x41, hold: 85, gap: 155 }, // A
    { type: 'key', vk: 0x54, hold: 95, gap: 220 }, // T
    { type: 'key', vk: 0x20, hold: 90, gap: 260 }, // Space
    { type: 'mouse', btn: 'left', hold: 240, gap: 360 },
    { type: 'mouse', btn: 'right', hold: 240, gap: 420 },
    { type: 'key', vk: 0x48, hold: 80, gap: 150 }, // H
    { type: 'key', vk: 0x49, hold: 85, gap: 180 }, // I
    { type: 'key', vk: 0x0d, hold: 110, gap: 680 }, // Enter
  ];
  let demoStep = 0;

  const stopAutoDemo = () => {
    autoDemoRunning = false;
    if (autoDemoTimer !== null) {
      window.clearTimeout(autoDemoTimer);
      autoDemoTimer = null;
    }
    if (btnAutoDemo) {
      btnAutoDemo.classList.remove('active');
      btnAutoDemo.textContent = '▶ 自动演示';
    }
  };

  const runDemoTick = () => {
    if (!autoDemoRunning) return;
    const item = DEMO_SCRIPT[demoStep % DEMO_SCRIPT.length];
    demoStep += 1;
    if (item.type === 'key') {
      engine.onKeyDown(item.vk, false);
      window.setTimeout(() => engine.onKeyUp(item.vk), item.hold);
    } else {
      engine.onMouseDown(item.btn);
      window.setTimeout(() => engine.onMouseUp(item.btn), item.hold);
    }
    autoDemoTimer = window.setTimeout(runDemoTick, item.gap);
  };

  const startAutoDemo = () => {
    if (autoDemoTimer !== null) window.clearTimeout(autoDemoTimer);
    autoDemoRunning = true;
    if (btnAutoDemo) {
      btnAutoDemo.classList.add('active');
      btnAutoDemo.textContent = '⏸ 停止演示';
    }
    autoDemoTimer = window.setTimeout(runDemoTick, 240);
  };

  if (btnAutoDemo) {
    btnAutoDemo.addEventListener('click', () => {
      if (autoDemoRunning) stopAutoDemo();
      else startAutoDemo();
    });
  }

  // Dedicated L/R Mouse Demo button (great for mobile visitors!)
  const btnMouseDemo = document.getElementById('btn-mouse-demo');
  if (btnMouseDemo) {
    btnMouseDemo.addEventListener('click', () => {
      stopAutoDemo();
      engine.onMouseDown('left');
      window.setTimeout(() => {
        engine.onMouseUp('left');
        window.setTimeout(() => {
          engine.onMouseDown('right');
          window.setTimeout(() => engine.onMouseUp('right'), 320);
        }, 120);
      }, 320);
    });
  }

  // Real physical keyboard interaction
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (engine.privacyMode) {
      if (autoDemoRunning) stopAutoDemo();
      engine.onPrivacyTyping();
      return;
    }
    const vk = keyboardEventToVk(e);
    if (vk !== null) {
      if (autoDemoRunning) stopAutoDemo();
      engine.onKeyDown(vk, e.repeat);
    }
  });

  window.addEventListener('keyup', (e) => {
    const vk = keyboardEventToVk(e);
    if (vk !== null) {
      engine.onKeyUp(vk);
    }
  });

  // Real mouse move / petting / eye-tracking / L/R/M clicks on stage
  viewport.addEventListener('pointermove', (e) => {
    const rect = viewport.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    engine.onGlobalMouseMove(nx, ny);

    // Map stage coordinates into cat logical coordinates for accurate head petting
    const { w: lw, h: lh } = engine.getLogicalSize();
    const fit = Math.min((rect.width * 0.86) / lw, (rect.height * 0.86) / lh);
    const drawW = lw * fit;
    const drawH = lh * fit;
    const ox = (rect.width - drawW) * 0.5;
    const oy = (rect.height - drawH) * 0.52;
    const relX = (e.clientX - rect.left - ox) / Math.max(1, drawW);
    const relY = (e.clientY - rect.top - oy) / Math.max(1, drawH);

    // Cat head/body zone in normalized logical space
    const overHead = relX >= 0.30 && relX <= 0.72 && relY >= 0.14 && relY <= 0.52;
    viewport.classList.toggle('petting', overHead);
    engine.onWindowCursor(relX, relY, overHead);
  });

  viewport.addEventListener('pointerleave', () => {
    viewport.classList.remove('petting');
    engine.onWindowCursor(0.5, 0.5, false);
  });

  viewport.addEventListener('pointerdown', (e) => {
    if (autoDemoRunning) stopAutoDemo();
    const btnName = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    engine.onMouseDown(btnName);
  });

  window.addEventListener('pointerup', (e) => {
    const btnName = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    engine.onMouseUp(btnName);
  });

  viewport.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  viewport.addEventListener('wheel', () => {
    engine.onMouseWheel();
  }, { passive: true });

  // Kick off gentle live demo on load!
  startAutoDemo();
}

function initMcpCodeTabs(): void {
  const snippets: Record<string, { raw: string; html: string }> = {
    win: {
      raw: `{\n  "mcpServers": {\n    "kurocat": {\n      "command": "C:\\\\Users\\\\<你的用户名>\\\\AppData\\\\Local\\\\KuroCat\\\\KuroCat.exe",\n      "args": ["--mcp"]\n    }\n  }\n}`,
      html: `<span class="c-dim">// Windows Stdio 模式（Claude / Cursor / Antigravity 通用）</span>\n{\n  <span class="c-key">"mcpServers"</span>: {\n    <span class="c-key">"kurocat"</span>: {\n      <span class="c-key">"command"</span>: <span class="c-str">"C:\\\\Users\\\\&lt;你的用户名&gt;\\\\AppData\\\\Local\\\\KuroCat\\\\KuroCat.exe"</span>,\n      <span class="c-key">"args"</span>: [<span class="c-str">"--mcp"</span>]\n    }\n  }\n}`,
    },
    mac: {
      raw: `{\n  "mcpServers": {\n    "kurocat": {\n      "command": "/Applications/KuroCat.app/Contents/MacOS/KuroCat",\n      "args": ["--mcp"]\n    }\n  }\n}`,
      html: `<span class="c-dim">// macOS Stdio 模式（零依赖直连 App 内置二进制）</span>\n{\n  <span class="c-key">"mcpServers"</span>: {\n    <span class="c-key">"kurocat"</span>: {\n      <span class="c-key">"command"</span>: <span class="c-str">"/Applications/KuroCat.app/Contents/MacOS/KuroCat"</span>,\n      <span class="c-key">"args"</span>: [<span class="c-str">"--mcp"</span>]\n    }\n  }\n}`,
    },
    http: {
      raw: `{\n  "mcpServers": {\n    "kurocat": {\n      "url": "http://127.0.0.1:27420/mcp"\n    }\n  }\n}`,
      html: `<span class="c-dim">// 本机 Streamable HTTP 模式（桌宠运行时直接连接）</span>\n{\n  <span class="c-key">"mcpServers"</span>: {\n    <span class="c-key">"kurocat"</span>: {\n      <span class="c-key">"url"</span>: <span class="c-str">"http://127.0.0.1:27420/mcp"</span>\n    }\n  }\n}`,
    },
  };

  let active = 'win';
  const codeEl = document.getElementById('mcp-code');
  const copyBtn = document.getElementById('copy-mcp-btn');

  const render = (key: string) => {
    active = key;
    if (codeEl) codeEl.innerHTML = snippets[key].html;
  };
  render('win');

  document.querySelectorAll('[data-mcp-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = (btn as HTMLElement).dataset.mcpTab || 'win';
      document.querySelectorAll('[data-mcp-tab]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      render(key);
    });
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(snippets[active].raw).then(() => {
        copyBtn.textContent = '已复制 ✓';
        window.setTimeout(() => {
          copyBtn.textContent = '复制配置';
        }, 1600);
      });
    });
  }

  // macOS xattr copy
  const xattrBtn = document.getElementById('copy-xattr-btn');
  if (xattrBtn) {
    xattrBtn.addEventListener('click', () => {
      navigator.clipboard.writeText('xattr -cr /Applications/KuroCat.app').then(() => {
        xattrBtn.textContent = '已复制 ✓';
        window.setTimeout(() => {
          xattrBtn.textContent = '复制命令';
        }, 1600);
      });
    });
  }

  // Prompt chips copy
  document.querySelectorAll('.prompt-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const prompt = (chip as HTMLElement).dataset.prompt || '';
      const em = chip.querySelector('em');
      navigator.clipboard.writeText(prompt).then(() => {
        if (em) {
          em.textContent = '已复制 ✓';
          window.setTimeout(() => {
            em.textContent = '复制';
          }, 1500);
        }
      });
    });
  });
}

function initPolish(): void {
  // Pointer specular highlight on stage cards
  document.querySelectorAll('.stage-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const ev = e as PointerEvent;
      const rect = card.getBoundingClientRect();
      (card as HTMLElement).style.setProperty('--mx', `${ev.clientX - rect.left}px`);
      (card as HTMLElement).style.setProperty('--my', `${ev.clientY - rect.top}px`);
    });
  });

  // Scroll reveal (low threshold so tall sections on mobile & hash jumps never stay hidden)
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    },
    { threshold: 0.01 }
  );
  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

  if (window.location.hash) {
    const target = document.querySelector(window.location.hash);
    if (target) {
      target.classList.add('visible');
      target.closest('.reveal')?.classList.add('visible');
    }
  }
}

applyReleaseUI(LOCAL_MIRROR_VERSION, buildDefaultAssets());
initDownloadTracking();
initPlayground();
initMcpCodeTabs();
initPolish();
void syncGithubMetadata();
