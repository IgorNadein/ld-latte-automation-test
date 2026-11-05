#!/usr/bin/env python3
"""Real n8n HTTP Request node + local mock Telegram receiver, no credentials."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
ENGINE = Path(os.environ.get('N8N_ENGINE_DIR', '/tmp/ld-latte-n8n-engine'))
CLI = ENGINE / 'node_modules' / '.bin' / 'n8n'
PORT = 19455

class MockTelegram(BaseHTTPRequestHandler):
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get('Content-Length','0')))
        try:
            body = json.loads(raw)
            result = {'ok': True, 'payload': body, 'method': self.path.strip('/')}
            response = json.dumps(result).encode()
            self.send_response(200)
        except (ValueError, TypeError):
            response = b'{"ok":false}'
            self.send_response(400)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(response)))
        self.end_headers()
        self.wfile.write(response)
    def log_message(self, *_):
        return

def node(id, name, typ, params, x):
    return {'id':id,'name':name,'type':typ,'typeVersion':{'n8n-nodes-base.manualTrigger':1,'n8n-nodes-base.code':2,'n8n-nodes-base.httpRequest':4.2}[typ], 'position':[x,260],'parameters':params}

def flow(name, id, template, cases):
    trigger=node('manual','Manual Trigger','n8n-nodes-base.manualTrigger',{},100)
    generate=node('generate','Compose reply','n8n-nodes-base.code',{'mode':'runOnceForAllItems','jsCode':cases},340)
    request=node('request','Telegram HTTP','n8n-nodes-base.httpRequest',dict(template['parameters']),580)
    request['parameters']['url']='=\u007b\u007b '+f"'http://127.0.0.1:{PORT}/"+('editMessageText' if 'Edit' in name else 'sendMessage')+"' }}"
    # Preserve actual HTTP node options and body expressions; remove all credentials.
    checker=node('checker','Assert HTTP Payload','n8n-nodes-base.code',{'mode':'runOnceForAllItems','jsCode':(
        "const values=$input.all().map(x=>x.json);"
        "if(values.length!=="+('1' if 'Edit' in name else '4')+") throw Error('Wrong request count '+values.length);"
        "for(const entry of values){"
        "const p=entry.payload; const n=Number(p.text.split('_')[1]);"
        "const keyboard=p.reply_markup?.inline_keyboard;"
        "if(entry.ok!==true||entry.method!=="+('"editMessageText"' if 'Edit' in name else '"sendMessage"')+") throw Error('Not Telegram mock response');"
        "if(n===0){if("+('keyboard?.length!==0' if 'Edit' in name else 'p.reply_markup!==undefined')+") throw Error('Empty catalog payload incorrect');}"
        "else if(!Array.isArray(keyboard)||keyboard.length!==n) throw Error('Expected '+n+' buttons got '+(keyboard?.length??'none'));"
        "if(n>0&&!keyboard.every(row=>row.length===1&&row[0].callback_data.startsWith('service:'))) throw Error('Missing callback data');"
        "if(entry.method==='editMessageText'&&p.message_id!==456) throw Error('Wrong message to edit');"
        "}return [{json:{passed:true, cases:values.length}}];"
    )},820)
    return {'id':id,'name':name,'nodes':[trigger,generate,request,checker],'connections':{
        'Manual Trigger':{'main':[[{'node':'Compose reply','type':'main','index':0}]]},
        'Compose reply':{'main':[[{'node':'Telegram HTTP','type':'main','index':0}]]},
        'Telegram HTTP':{'main':[[{'node':'Assert HTTP Payload','type':'main','index':0}]]},
    },'settings':{'executionOrder':'v1'}}

cases_send = "return [0,2,5,9].map(n=>{ const keyboard=n?Array.from({length:n},(_,i)=>[{text:'Услуга '+(i+1),callback_data:'service:'+(i+1)}]):null; const telegramPayload={chat_id:12345,text:'CASE_'+n,parse_mode:'HTML'}; if(keyboard) telegramPayload.reply_markup={inline_keyboard:keyboard};return {json:{chatId:12345,text:'CASE_'+n,keyboard,telegramPayload}}; });"
cases_edit = "const keyboard=Array.from({length:5},(_,i)=>[{text:'Услуга '+(i+1),callback_data:'service:'+(i+1)}]); return [{json:{chatId:12345,messageId:456,text:'CASE_5',keyboard,telegramPayload:{chat_id:12345,message_id:456,text:'CASE_5',parse_mode:'HTML',reply_markup:{inline_keyboard:keyboard}}}}];"


def main():
    if not CLI.exists():
        raise SystemExit(f'n8n CLI not installed: {CLI}')
    w=json.loads((ROOT/'n8n/dynamic-services.workflow.json').read_text())
    live={n['name']:n for n in w['nodes']}
    for n in ['Send Telegram menu','Edit Telegram menu']:
        assert live[n]['type']=='n8n-nodes-base.httpRequest', n
    workflows=[flow('LD LATTE Send Telegram HTTP Test','LDLatteSendHttpPayloadTest',live['Send Telegram menu'],cases_send),
               flow('LD LATTE Edit Telegram HTTP Test','LDLatteEditHttpPayloadTest',live['Edit Telegram menu'],cases_edit)]
    # This is intentionally isolated: no access to the live DB, Telegram token, or Supabase secrets.
    with tempfile.TemporaryDirectory(prefix='n8n-telegram-http-') as temp:
        temp_path=Path(temp)
        source=temp_path/'workflows.json'
        source.write_text(json.dumps(workflows,ensure_ascii=False))
        env=dict(os.environ, N8N_USER_FOLDER=str(temp_path/'n8n'),N8N_ENCRYPTION_KEY='local-synthetic-no-real-tokens-e2e-2026', N8N_DIAGNOSTICS_ENABLED='false', N8N_PERSONALIZATION_ENABLED='false', N8N_VERSION_NOTIFICATIONS_ENABLED='false',N8N_BLOCK_ENV_ACCESS_IN_NODE='false',N8N_PORT='19678',N8N_RUNNERS_BROKER_PORT='19679')
        with ThreadingHTTPServer(('127.0.0.1',PORT), MockTelegram) as server:
            thread=Thread(target=server.serve_forever,daemon=True)
            thread.start()
            cmd=[str(CLI),'import:workflow','--input='+str(source)]
            res=subprocess.run(cmd,cwd=ENGINE,env=env,capture_output=True,text=True,timeout=150)
            if res.returncode:raise RuntimeError('Import failed '+res.stderr[-450:]+res.stdout[-450:])
            print('PASS: imported isolated HTTP-test workflows into n8n')
            for item in workflows:
                res=subprocess.run([str(CLI),'execute','--id='+item['id']],cwd=ENGINE,env=env,capture_output=True,text=True,timeout=150)
                if res.returncode or 'passed' not in res.stdout and 'Execution was successful' not in res.stdout:
                    raise RuntimeError('n8n workflow failed: '+item['name']+' '+res.stdout[-750:]+res.stderr[-750:])
                print('PASS: actual n8n HTTP Request node: '+item['name'])
            server.shutdown()

if __name__=='__main__': main()
