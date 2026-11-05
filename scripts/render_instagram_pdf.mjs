Object.defineProperty(process, 'platform', { value: 'linux' });
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const src = join(docs, 'INSTAGRAM_INTEGRATION_PLAN.md');
const mdTemp=join(docs, '.print-input.md'), htmlTemp=join(docs, '.print-page.html');
const pdf=join(docs, 'LD_LATTE_Instagram_Integration_Plan.pdf');
const { chromium } = await import(new URL('../app/node_modules/playwright-core/index.mjs', import.meta.url).href);
const markdown=readFileSync(src,'utf8');
if(!markdown.includes('```mermaid')) throw Error('Mermaid diagram missing');
writeFileSync(mdTemp,markdown.replace(/```mermaid[\s\S]*?```/,'![Схема архитектуры Meta API](instagram-architecture.svg)'));
const cmd = spawnSync('pandoc', ['.print-input.md','-f','markdown+pipe_tables','-t','html5','-s','--css=print.css','-M','title=LD LATTE — Instagram Insights','-o','.print-page.html'],{cwd:docs,encoding:'utf8'});
if(cmd.status!==0) throw Error('pandoc failed: '+cmd.stderr);
let b;
try {
 b=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||chromium.executablePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--allow-file-access-from-files']});
 const p=await b.newPage();
 await p.goto(pathToFileURL(htmlTemp).href,{waitUntil:'domcontentloaded',timeout:19000});
 await p.emulateMedia({media:'print'});
 await p.evaluate(()=>document.fonts.ready);
 await p.pdf({path:pdf,preferCSSPageSize:true,landscape:true,printBackground:true,displayHeaderFooter:false});
 console.log('PDF_CREATED',pdf,'BODY_LENGTH',(await p.locator('body').innerText()).length);
}finally{
 if(b) await b.close();
 unlinkSync(mdTemp);unlinkSync(htmlTemp);
}
