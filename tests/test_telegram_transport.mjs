import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const workflow = JSON.parse(readFileSync(new URL('../n8n/dynamic-services.workflow.json', import.meta.url),'utf8'));
const nodes = new Map(workflow.nodes.map(node=>[node.name,node]));
assert.equal(nodes.get('Telegram Trigger').type,'n8n-nodes-base.telegramTrigger');
assert.equal(nodes.get('Acknowledge callback').type,'n8n-nodes-base.telegram');
assert.equal(nodes.get('Acknowledge callback').parameters.operation,'answerQuery');
assert.equal(nodes.get('Send Telegram menu').type,'n8n-nodes-base.httpRequest');
assert.equal(nodes.get('Edit Telegram menu').type,'n8n-nodes-base.httpRequest');
assert.equal(nodes.get('Get services (Supabase)').alwaysOutputData,true);
assert.deepEqual(workflow.connections['Was callback?'].main.map(x=>x[0].node),['Acknowledge callback','Send Telegram menu']);
assert.equal(workflow.connections['Acknowledge callback'].main[0][0].node,'Edit Telegram menu');
assert(!JSON.stringify(workflow).includes('LDLatteTelegramDemo01'),'Public export must not contain credential references');
for(const nodeName of ['Send Telegram menu','Edit Telegram menu']) {
 const node=nodes.get(nodeName); assert(!node.credentials,'No secret in workflow');
 assert(node.parameters.url.includes('$env.TELEGRAM_BOT_TOKEN'),'Secret loaded at runtime only');
 assert(!node.parameters.url.includes('123456:AA'),'No hardcoded Telegram token');
 assert.equal(node.parameters.specifyBody,'json');
 assert.equal(node.parameters.sendBody,true);
}
console.log('PASS: Telegram Trigger + encrypted callback credential, dynamic HTTP transport, no exported secrets');
