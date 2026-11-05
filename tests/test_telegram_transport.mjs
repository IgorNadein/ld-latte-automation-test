import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = JSON.parse(readFileSync(new URL('../n8n/dynamic-services.workflow.json', import.meta.url), 'utf8'));
const nodes = new Map(workflow.nodes.map(node => [node.name, node]));
const native = ['Acknowledge callback', 'Send Telegram menu', 'Edit Telegram menu'];
for (const name of native) assert.equal(nodes.get(name)?.type, 'n8n-nodes-base.telegram', name);
assert.equal(nodes.get('Telegram Trigger')?.type, 'n8n-nodes-base.telegramTrigger');
assert.equal(nodes.get('Get services (Supabase)')?.alwaysOutputData, true, 'Empty catalog must still proceed');
assert(!JSON.stringify(workflow).includes('TELEGRAM_BOT_TOKEN'), 'Use native encrypted Telegram credentials, not a token in HTTP URL');
assert(!JSON.stringify(workflow).includes('LDLatteTelegramDemo01'), 'Export must remain independent of demo credential');
for (const name of native) assert.equal(nodes.get(name).credentials, undefined, 'Public export has no credentials');
assert.deepEqual(workflow.connections['Was callback?'].main.map(branch => branch[0].node), ['Acknowledge callback', 'Send Telegram menu']);
assert.equal(workflow.connections['Acknowledge callback'].main[0][0].node,'Edit Telegram menu');
assert.equal(nodes.get('Acknowledge callback').parameters.operation, 'answerQuery');
assert.equal(nodes.get('Edit Telegram menu').parameters.operation, 'editMessageText');
const extract = (expression, context) => {
  assert(expression.startsWith('={{ ') && expression.endsWith(' }}'), expression);
  return Function('$json', '$', 'return (' + expression.slice(4,-3) + ')')(context, () => ({first:()=>({json:context})}));
};
const render = (node, context) => {
  const replyMarkup = node.parameters.replyMarkup.startsWith('=') ? extract(node.parameters.replyMarkup, context) : node.parameters.replyMarkup;
  if (replyMarkup === 'none') return null;
  assert.equal(replyMarkup,'inlineKeyboard');
  const shape = extract(node.parameters.inlineKeyboard, context);
  return shape.rows.map(item=>item.row.buttons.map(btn=>({text:btn.text,callback_data:btn.additionalFields.callback_data})));
};
for (const count of [2,5,9]) {
  const keyboard = Array.from({length:count},(_,i)=>[{text:'Услуга '+(i+1),callback_data:'service:'+(i+1)}]);
  const context={keyboard};
  for(const name of ['Send Telegram menu','Edit Telegram menu']) assert.deepEqual(render(nodes.get(name), context), keyboard);
  console.log('PASS: native Telegram nodes build '+count+' dynamic buttons');
}
for(const name of ['Send Telegram menu','Edit Telegram menu']) assert.deepEqual(render(nodes.get(name),{keyboard:null}), []);
console.log('PASS: empty catalog builds zero buttons; credentials stay out of public export');
