const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..', 'prototype');
const source = fs.readFileSync(path.join(root, 'meadow-scene.js'), 'utf8');
const controls = source.slice(source.indexOf('let paused = false;'), source.indexOf('function draw(now)'));
function scene(pastoral = true) {
  const pending = new Map(); let next = 0, draws = 0, updates = 0;
  const context = vm.createContext({
    PASTORAL: pastoral, pastoralSettings: {batterySaver: 1}, P: {cap30: true},
    lastT: 0, curMix: 0, morphT0: 0, morphDur: 100, fpsEMA: 0, frameN: 0,
    performance: {now: () => 1000},
    requestAnimationFrame: fn => {pending.set(++next, fn); return next;},
    cancelAnimationFrame: id => pending.delete(id),
    refresh() {}, preparePastoral() {updates++;}, draw() {draws++;},
    stepSkyClouds() {}, updateStats() {}
  });
  const run = code => vm.runInContext(code, context);
  run(controls); run('animationFrame = requestAnimationFrame(frame)');
  const step = () => {const jobs = [...pending.values()]; pending.clear(); jobs.forEach(fn => fn(2000));};
  return {run, pending, step, counts: () => [draws, updates]};
}
const s = scene();
s.run('onBattery = true; syncPowerSaving()');
assert.equal(s.pending.size, 0, 'unplugging cancels all animation callbacks');
const frozen = s.counts(); s.step(); assert.deepEqual(s.counts(), frozen);
s.run('syncPowerSaving()'); assert.equal(s.pending.size, 0, 'one-off redraw stays stopped');
s.run('pastoralSettings.batterySaver = 0; syncPowerSaving()');
assert.equal(s.pending.size, 1, 'turning saver off resumes animation');
s.run('pastoralSettings.batterySaver = 1; syncPowerSaving()');
assert.equal(s.pending.size, 0, 'default/reset stops animation on battery');
s.run('setRecordingActive(true)'); assert.equal(s.pending.size, 1);
s.run('setRecordingActive(false)'); assert.equal(s.pending.size, 0, 'recording restores saving');
s.run('paused = true; onBattery = false; syncPowerSaving()');
const before = s.counts(); s.step(); assert.deepEqual(s.counts(), before, 'AC does not clear manual pause');
s.run('paused = false'); s.step(); assert(s.counts()[0] > before[0]);
s.run('syncPowerSaving(); syncPowerSaving()'); assert.equal(s.pending.size, 1, 'no duplicate loops');
const other = scene(false); other.run('onBattery = true; syncPowerSaving()');
assert.equal(other.pending.size, 1, 'other themes retain existing behavior');
const theme = JSON.parse(fs.readFileSync(path.join(root, 'themes.json'))).themes.find(t => t.id === 'pastoral');
const param = theme.groups.flatMap(g => g.params).find(p => p.key === 'batterySaver');
assert.equal(param.default, 1);
for (const lang of ['zh-CN', 'en']) {
  const text = JSON.parse(fs.readFileSync(path.join(root, 'i18n', lang + '.json'))).themes.pastoral;
  assert.equal(text.groups.length, theme.groups.length);
  assert.equal(text.params.batterySaver.options.length, param.options.length);
}
for (const [key, value] of [['showIconClouds',0], ['iconLighting',1]]) {
  const setting = theme.groups.flatMap(g => g.params).find(p => p.key === key);
  assert.equal(setting.default, value);
  for (const lang of ['zh-CN','en']) {
    const translations = JSON.parse(fs.readFileSync(path.join(root, 'i18n', lang + '.json'))).themes.pastoral.params;
    if (key === 'showIconClouds') {
      assert.deepEqual([setting.min,setting.max,setting.step,setting.format],[0,1,.01,'percent']);
      assert.equal(translations[key].options, undefined);
      assert(translations[key].label);
    } else assert.equal(translations[key].options.length, 2);
  }
}
console.log('PASS: battery freeze, redraw, toggle/reset, AC/manual pause, recording and translations');
const share = fs.readFileSync(path.join(root, 'share.js'), 'utf8');
const record = share.slice(share.indexOf('  function record(onProgress)'), share.indexOf('  function recordNow('));
let recordingTime = 0;
const failedRecording = vm.createContext({
  busy: false, paused: true, hostPause: null, frameN: 0,
  performance: {now: () => recordingTime += 1000}, pickMime: () => 'video/mp4', settled: () => true,
  setTimeout: fn => fn(),
  recordNow: () => Promise.reject(Error('encoder failed')),
  setRecordingActive: v => s.run('setRecordingActive(' + v + ')')
});
s.run('onBattery = true; syncPowerSaving()');
vm.runInContext(record, failedRecording);
vm.runInContext('record()', failedRecording).then(() => {
  throw Error('expected encoder failure');
}, err => {
  assert.equal(err.message, 'encoder failed');
  assert.equal(failedRecording.busy, false);
  assert.equal(failedRecording.paused, true);
  assert.equal(s.pending.size, 0, 'encoder failure restores battery saving');
  console.log('PASS: recording failure restores pause and battery saving');
});
