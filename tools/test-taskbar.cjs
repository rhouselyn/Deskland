// Run the optional desktop check against a locally built host with WebView2 CDP enabled.
// Node 21: node --experimental-websocket tools/test-taskbar.cjs --live
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'prototype');
const themes = JSON.parse(fs.readFileSync(path.join(root, 'themes.json'))).themes;
const village = themes.find(t => t.id === 'pastoral');
const param = village.groups.flatMap(g => g.params).find(p => p.key === 'transparentTaskbar');
assert.equal(param.default, 1, 'new installations use the transparent taskbar preset');
assert.equal(param.options.length, 2);
for (const theme of themes.filter(t => t.id !== 'pastoral'))
  assert(!theme.groups?.some(g => g.params.some(p => p.key === param.key)));
for (const lang of ['zh-CN', 'en']) {
  const text = JSON.parse(fs.readFileSync(path.join(root, 'i18n', lang + '.json')));
  assert.equal(text.themes.pastoral.params.transparentTaskbar.options.length, 2);
  assert(text.ui.taskbarError);
}
console.log('PASS: taskbar defaults, theme scope and translations');

async function live() {
  const port = process.env.DESKLAND_CDP_PORT || '9237';
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const settings = pages.find(p => p.url.includes('/settings.html'));
  assert(settings, 'open the host settings first');
  const ws = new WebSocket(settings.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data), job = pending.get(m.id);
    if (job) { pending.delete(m.id); m.error ? job.reject(Error(m.error.message)) : job.resolve(m.result); }
  };
  const evaluate = async expression => {
    const n = ++id;
    const result = await new Promise((resolve, reject) => {
      pending.set(n, {resolve, reject});
      ws.send(JSON.stringify({id:n, method:'Runtime.evaluate', params:{expression, returnByValue:true, awaitPromise:true}}));
    });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  try {
    const result = await evaluate(`(async()=>{
      if(state.theme!=='pastoral')throw Error('Select Meadow Village before running the live check');
      const old=state.params.pastoral?.transparentTaskbar||0;
      const errors=[];const originalAlert=window.alert;window.alert=s=>errors.push(s);
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const checks=[];
      try{
        for(const value of [0,1,0,1]){
          setParam('transparentTaskbar',value);await wait(value?4000:1500);
          checks.push(state.params.pastoral.transparentTaskbar===value&&
            document.querySelector('.opts[data-key="transparentTaskbar"] button.on')?.dataset.opt===String(value));
        }
        return {checks,errors,preview:document.querySelector('#frame')?.src||document.querySelector('iframe')?.src};
      }finally{window.alert=originalAlert;setParam('transparentTaskbar',old);await wait(1500);}
    })()`);
    assert(result.checks.every(Boolean), 'the host must keep each requested value');
    assert.deepEqual(result.errors, [], 'the native helper must not reject the setting');
    assert(result.preview.includes('pastoral.html'));
    console.log('PASS: live host repeated on/off, settings readback and preview');
  } finally { ws.close(); }
}
if (process.argv.includes('--live')) live().catch(e => { console.error(e); process.exitCode = 1; });
