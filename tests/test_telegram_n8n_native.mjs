// Exercise the installed n8n 2.46.6 Telegram transport helper, not a mock of its markup encoder.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const workflow = JSON.parse(readFileSync(new URL('../n8n/dynamic-services.workflow.json', import.meta.url), 'utf8'));
const engineDir = process.env.N8N_ENGINE_DIR;
assert(engineDir, 'Set N8N_ENGINE_DIR to the directory where n8n is installed');
const require = createRequire(import.meta.url);
const { addAdditionalFields } = require(join(engineDir, 'node_modules/n8n-nodes-base/dist/nodes/Telegram/GenericFunctions.js'));
const expr = (source, json) => {
  if (typeof source !== 'string' || !source.startsWith('={{ ')) return source;
  assert(source.endsWith(' }}'));
  return Function('$json', '$', 'return (' + source.slice(4, -3) + ')')(
    json, () => ({ first: () => ({ json }) }),
  );
};
for (const nodeName of ['Send Telegram menu', 'Edit Telegram menu']) {
  const node = workflow.nodes.find(x => x.name === nodeName);
  assert(node, nodeName);
  assert.equal(node.parameters.replyMarkup, 'inlineKeyboard', 'n8n needs static replyMarkup to expose dependent fixedCollection');
  for (const count of [0, 2, 5, 9]) {
    const keyboard = Array.from({ length: count }, (_, i) => [{ text: `Услуга ${i + 1}`, callback_data: `service:${i + 1}` }]);
    const json = { chatId: 123, text: 'Выберите услугу', keyboard: count ? keyboard : null };
    const parameters = node.parameters;
    const context = {
      getNodeParameter: (name) => expr(parameters[name], json),
    };
    const body = { chat_id: json.chatId, text: json.text };
    addAdditionalFields.call(context, body, 0, 1.2, 'local-test');
    assert.equal(body.parse_mode, 'HTML');
    assert.deepEqual(body.reply_markup.inline_keyboard, keyboard, `${nodeName}: ${count} buttons`);
    if (nodeName === 'Send Telegram menu') assert(!body.text.includes('n8n]'), 'No attribution');
    console.log(`PASS ${nodeName}: real n8n native encoder produces ${count} buttons`);
  }
}
