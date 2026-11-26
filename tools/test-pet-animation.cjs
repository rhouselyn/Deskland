const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../third_party/KuroCat/src/catEngine.ts'), 'utf8');
const methods = source.slice(source.indexOf('  public start(): void'), source.indexOf('  // ---- Flexible spine'))
  .replace(/public /g, '').replace(/\(\): void/g, '()').replace(/now: number/g, 'now');
let now = 0, nextId = 0;
const pending = new Map();
const context = vm.createContext({
  performance: {now: () => now},
  requestAnimationFrame: fn => {pending.set(++nextId, fn); return nextId;},
  cancelAnimationFrame: id => pending.delete(id)
});
vm.runInContext(`class Engine {
  rafId=0; running=false; lastTime=0; frameTime=0; renders=0; onAfterRender=null;
  update() {} render() {this.renders++;}
  ${methods}
} globalThis.engine=new Engine();`, context);
const engine = context.engine;
function step(time) {now=time; const jobs=[...pending.values()]; pending.clear(); jobs.forEach(fn=>fn(time));}
// The host sends pause=false again after every preference change, including slider input.
for (let i=0; i<40; i++) engine.start();
assert.equal(pending.size, 1, 'reapplying preferences must not multiply animation loops');
for (let i=1; i<=144; i++) step(i*1000/144);
assert(engine.renders>=28 && engine.renders<=31, `render at 30fps on a 144Hz display, got ${engine.renders}`);
engine.stop();
assert.equal(pending.size, 0, 'pause cancels every animation callback');
const frozen=engine.renders; step(1100); assert.equal(engine.renders, frozen);
engine.onAfterRender=()=>engine.stop(); engine.start(); step(1200);
assert.equal(pending.size, 0, 'stopping within a render callback must not reschedule');
engine.onAfterRender=null; engine.start(); engine.start(); assert.equal(pending.size, 1);
console.log('PASS: repeated settings keep one loop, 30fps on 144Hz, pause, callback stop and resume');
