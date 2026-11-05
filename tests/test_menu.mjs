// Execute node logic from exported n8n JSON without Telegram credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const flow = JSON.parse(readFileSync(new URL('../n8n/dynamic-services.workflow.json', import.meta.url), 'utf8'));
const code = flow.nodes.find(n => n.name === 'Compose reply')?.parameters?.jsCode;
assert(code, 'Compose reply node is missing');
const base = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1, name: 'Услуга ' + (i + 1), active: true,
}));

function execute(kind, services, serviceId = null) {
  const ctx = { kind, chatId: 1234, callbackId: kind === 'callback' ? 'cb-1' : null, serviceId };
  const sandbox = {
    $input: { all: () => services.map(s => ({ json: s })) },
    $: name => {
      assert.equal(name, 'Normalize update');
      return { first: () => ({ json: ctx }) };
    },
  };
  return runInNewContext("(function(){" + code + "})()", sandbox)[0].json;
}

for (const count of [2, 5, 9]) {
  const result = execute('start', base.map((s, i) => ({...s,active:i<count})));
  assert.equal(result.keyboard.length, count, count + ' active services');
  assert(result.keyboard.every(row => row.length === 1 && row[0].callback_data.startsWith('service:')));
  console.log('PASS: /start with ' + count + ' active services');
}
const renamed = [{ id: 1, name: 'Новое название', active: true }];
assert.equal(execute('start', renamed).keyboard[0][0].text, 'Новое название');
console.log('PASS: rename without workflow update');
const noActive = base.map(s => ({...s,active:false}));
assert.equal(execute('start', noActive).keyboard, null);
assert.match(execute('start', noActive).text, /нет доступных услуг/);
console.log('PASS: empty catalog');
assert.match(execute('callback', base, 3).text, /Услуга 3/);
assert.match(execute('callback', base.map(s => ({...s,active:s.id!==3})), 3).text, /больше недоступна/);
assert.match(execute('callback', base, 88).text, /больше недоступна/);
console.log('PASS: callback by ID, stale and unknown ID');
console.log('All 7 menu behavior checks passed.');
