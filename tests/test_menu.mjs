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

function execute(kind, services, serviceId = null, isMenuReturn = false, messageId = null) {
  const ctx = { kind, chatId: 1234, callbackId: kind === 'callback' ? 'cb-1' : null, serviceId, isMenuReturn, messageId };
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

const clicked = execute('callback', base, 3);
assert.match(clicked.text, /выбрали услугу: Услуга 3/);
assert.equal(clicked.keyboard[0][0].callback_data, 'menu');
console.log('PASS: selecting a service sends its database name and return-menu button');
for (const count of [2,5,9]) {
  const values = base.map((s,i) => ({...s,active:i<count}));
  const back = execute('callback', values, null, true);
  assert.equal(back.keyboard.length, count);
  assert.equal(back.keyboard[0][0].text, 'Услуга 1');
  console.log('PASS: return to dynamic menu with '+count+' active services');
}
const backEmpty = execute('callback', noActive, null, true);
assert.equal(backEmpty.keyboard, null);
assert.match(backEmpty.text,/нет доступных услуг/);
console.log('PASS: return to empty catalog');
const edited = execute('callback', base, 1, false, 321);
assert.equal(edited.messageId, 321);
assert.equal(execute('callback', base, null, true, 321).messageId, 321);
assert.equal(execute('start', base).messageId, null);
console.log('PASS: callbacks carry original message ID for editMessageText; /start sends a new message');
const special = [{id:8,name:'Эко & <спорт> "пакет"',active:true}];
const escaped = execute('callback', special, 8);
assert.match(escaped.text, /Эко &amp; &lt;спорт&gt; &quot;пакет&quot;/);
assert.equal(execute('start',special).keyboard[0][0].text, special[0].name);
console.log('PASS: service names containing HTML characters keep keyboard text and escape message text');
const failure = execute('start', [{error:'Network refused'}]);
assert.match(failure.text,/Не удалось загрузить услуги/);
assert(!/нет доступных услуг/.test(failure.text));
assert.equal(failure.keyboard,null);
assert.match(execute('callback',[{error:'Network refused'}],5).text,/Не удалось загрузить услуги/);
console.log('PASS: REST outage is not misreported as empty catalog; clear retry message');
console.log('All 14 menu behavior groups passed.');
