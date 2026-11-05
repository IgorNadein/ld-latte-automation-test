import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const workflow=JSON.parse(readFileSync(new URL('../n8n/dynamic-services.workflow.json',import.meta.url),'utf8'));
const by=Object.fromEntries(workflow.nodes.map(x=>[x.name,x]));
const code=by['Compose reply'].parameters.jsCode;
const compose=(kind, count)=>{
 const services=Array.from({length:count},(_,i)=>({id:i+1,name:'Услуга '+(i+1),active:true}));
 const context={kind, chatId:123,messageId:kind==='callback'?999:null,serviceId:kind==='callback'?1:null,isMenuReturn:kind==='callback',callbackId:kind==='callback'?'fake-id':null};
 const sandbox={$input:{all:()=>services.map(json=>({json}))},$:(name)=>({first:()=>({json:context})})};
 return runInNewContext('(function(){'+code+'})()',sandbox)[0].json;
};
const evalExpression=(code,ctx)=>{
 assert.match(code,/^=\{\{\s*[\s\S]*\}\}$/);
 return Function('$json','$','$env','return ('+code.slice(3,-2)+')')(ctx,()=>({first:()=>({json:ctx})}),{TELEGRAM_BOT_TOKEN:'TEST_NOT_REAL'});
};
for(const count of [0,2,5,9]) {
 for(const [name,kind,method] of [['Send Telegram menu','start','sendMessage'],['Edit Telegram menu','callback','editMessageText']]) {
  const ctx=compose(kind,count);
  const node=by[name];
  const url=evalExpression(node.parameters.url,ctx);
  assert.equal(url,'https://api.telegram.org/botTEST_NOT_REAL/'+method);
  const payload=JSON.parse(evalExpression(node.parameters.jsonBody,ctx));
  assert.equal(payload.text,ctx.text);assert.equal(payload.chat_id,123);assert.equal(payload.parse_mode,'HTML');
  if(method==='sendMessage') {
   assert(!Object.hasOwn(payload,'message_id'));
   if(count===0) assert(!Object.hasOwn(payload,'reply_markup')); else assert.equal(payload.reply_markup.inline_keyboard.length,count);
  } else {
   assert.equal(payload.message_id,999);
   assert.equal(payload.reply_markup.inline_keyboard.length,count);
  }
  if(count>0) {
   assert.equal(payload.reply_markup.inline_keyboard[0][0].callback_data,'service:1');
  }
  console.log('PASS: '+method+' with '+count+' active services produces Telegram API JSON');
 }
}
