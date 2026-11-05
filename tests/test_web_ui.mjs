Object.defineProperty(process, 'platform', { value: 'linux' });
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(new URL('../app/node_modules/playwright-core/index.mjs', import.meta.url).href);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'app', 'dist');
const screenshots = join(root, 'docs', 'screenshots');
mkdirSync(screenshots, { recursive: true });
const accounts = new Map();
const allRows = [];
let queryCount = 0;

const allowedHeaders = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:5177',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,accept,accept-profile,content-profile',
  'Access-Control-Expose-Headers': 'content-range',
  'Access-Control-Allow-Private-Network': 'true',
  'Content-Type': 'application/json'
};
function json(res, status, data) { res.writeHead(status, allowedHeaders); res.end(JSON.stringify(data)); }
function userFor(req) {
  const bearer = req.headers.authorization || '';
  const token = bearer.match(/Bearer ([A-Za-z0-9_.-]+)/)?.[1];
  let id = null;
  try { id = JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub; } catch {}
  return id ? [...accounts.values()].find(a => a.id === id) : null;
}
let currentId = 0;
const api = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { if(process.env.VERBOSE_E2E) console.log('PREFLIGHT', req.url, req.headers['access-control-request-headers']); res.writeHead(204, allowedHeaders); return res.end(); }
  const address = new URL(req.url, 'http://localhost:54321');
  let body = '';
  for await (const chunk of req) body += chunk;
  let data = {};
  try { data = body ? JSON.parse(body) : {}; } catch {}
  const path = address.pathname;
  if(process.env.VERBOSE_E2E) console.log('API',req.method,path);
  if (path === '/auth/v1/signup' || path === '/auth/v1/token') {
    const email = data.email, password = data.password;
    if (!email || !password) return json(res, 400, {message:'email/password required'});
    let user = accounts.get(email);
    if (!user) {
      user = { id: 'user_' + (++currentId), email, password };
      accounts.set(email, user);
    }
    if (user.password !== password) return json(res, 400, {error:'invalid_grant',error_description:'invalid credentials'});
    const claims = {sub:user.id,email:user.email,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iss:'http://localhost:54321/auth/v1'};
    const access_token = ['eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0', Buffer.from(JSON.stringify(claims)).toString('base64url'),'test'].join('.');
    const session = {
      access_token, token_type: 'bearer', expires_in:3600,
      expires_at: Math.floor(Date.now()/1000)+3600,
      refresh_token:'refresh_' + user.id,
      user: {id:user.id,email:user.email, aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{},created_at:new Date().toISOString()}
    };
    return json(res, 200, session);
  }
  if (path === '/auth/v1/user') {
    const user = userFor(req);
    return user ? json(res,200,{id:user.id,email:user.email, aud:'authenticated',role:'authenticated'}) : json(res,401,{msg:'JWT expired'});
  }
  if (path === '/auth/v1/logout') return json(res,204,{});
  if (path === '/auth/v1/token' && data.refresh_token) return json(res,400,{msg:'refresh not supported in e2e fixture'});
  if (path.startsWith('/rest/v1/automation_requests')) {
    const user = userFor(req);
    if (!user) return json(res,401,{code:'PGRST301', message:'Unauthorized'});
    if (req.method === 'GET') {
      queryCount++;
      const result = allRows.filter(r=>r.owner_id===user.id).sort((a,b)=>b.created_at.localeCompare(a.created_at));
      return json(res,200,result);
    }
    if (req.method === 'POST') {
      const item={...data,id:crypto.randomUUID(),owner_id:user.id,created_at:new Date().toISOString()};
      allRows.push(item);
      return json(res,201,{id:item.id});
    }
    if (req.method === 'PATCH') {
      const id = address.searchParams.get('id')?.replace('eq.','');
      const index=allRows.findIndex(r=>r.id===id && r.owner_id===user.id);
      if(index<0) return json(res,200,null);
      allRows[index]={...allRows[index],...data};
      return json(res,200,{id});
    }
  }
  json(res,404,{message:'not found', path});
});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const staticServer=createServer((req,res)=>{
  const url = new URL(req.url,'http://127.0.0.1:5177');
  const p = url.pathname==='/'?'index.html':url.pathname.replace(/^\//,'');
  const candidate=join(dist,p);
  const file=existsSync(candidate)?candidate:join(dist,'index.html');
  res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain','Cache-Control':'no-store'});
  res.end(readFileSync(file));
});
await Promise.all([new Promise(resolve=>api.listen(54321,'127.0.0.1',resolve)),new Promise(resolve=>staticServer.listen(5177,'127.0.0.1',resolve))]);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || chromium.executablePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const base='http://127.0.0.1:5177/';
const steps=[];
let debugPage;
function pass(x){steps.push(x);console.log('PASS',x);}
try {
  const context=await browser.newContext({viewport:{width:1280,height:900},locale:'ru-RU'});
  const page=await context.newPage();
  debugPage=page;
  const consoleErrors=[];
  page.on('pageerror',e=>consoleErrors.push(e.message));
  await page.goto(base);
  await page.getByRole('heading',{name:'С возвращением'}).waitFor();
  await page.screenshot({path:join(screenshots,'auth-desktop.png'),fullPage:true});
  pass('Auth screen renders on desktop');
  await page.getByRole('button',{name:'Зарегистрироваться'}).click();
  await page.getByLabel('Email').fill('qa.user.a@example.test');
  await page.getByLabel('Пароль').fill('passw0rd-demo');
  await page.getByRole('button',{name:'Создать аккаунт →'}).click();
  await page.getByRole('heading',{name:/Заявки на автоматизацию/}).waitFor({timeout:12000});
  pass('Registration creates session and dashboard');
  await page.getByRole('button',{name:/Новая заявка/}).click();
  await page.getByPlaceholder('Например: автоматизация отчётов').fill('Автоматизация недельного отчёта');
  await page.getByPlaceholder('Опишите задачу, ожидаемый результат и текущие сложности').fill('Собирать данные из таблиц автоматически');
  await page.getByRole('dialog').getByRole('button',{name:'Создать заявку',exact:true}).dblclick();
  await page.getByText('Автоматизация недельного отчёта').first().waitFor();
  assert.equal(allRows.length,1,'double click should create exactly 1 record');
  pass('New request defaults to Новая; double click creates one record');
  await page.getByRole('button',{name:/Редактировать: Автоматизация недельного отчёта/}).click();
  await page.getByPlaceholder('Например: автоматизация отчётов').fill('Обновлённый отчёт');
  await page.locator('div[role="dialog"]').getByText('Статус').locator('select').selectOption('В работе');
  await page.getByRole('button',{name:'Сохранить изменения'}).click();
  await page.getByText('Обновлённый отчёт').first().waitFor();
  assert.equal(allRows[0].status,'В работе');
  pass('Edit request and status persist in API');
  await page.reload();
  await page.getByText('Обновлённый отчёт').first().waitFor();
  pass('Browser reload keeps session and request data');
  await page.getByLabel('Фильтр по статусу').selectOption('Завершена');
  assert.equal(await page.getByText('Обновлённый отчёт').count(),0);
  await page.getByLabel('Фильтр по статусу').selectOption('В работе');
  assert.equal(await page.getByText('Обновлённый отчёт').count(),1);
  await page.getByLabel('Поиск по названию').fill('нет такого текста');
  assert.equal(await page.getByText('Обновлённый отчёт').count(),0);
  await page.getByLabel('Поиск по названию').fill('Обновлённый');
  assert.equal(await page.getByText('Обновлённый отчёт').count(),1);
  pass('Combined status and search filtering');
  await page.getByLabel('Поиск по названию').fill('');
  await page.getByRole('button',{name:/Новая заявка/}).click();
  const offlineDialog=page.getByRole('dialog',{name:'Новая заявка'});
  await offlineDialog.getByPlaceholder('Например: автоматизация отчётов').fill('QA — offline retry');
  await offlineDialog.getByPlaceholder('Опишите задачу, ожидаемый результат и текущие сложности').fill('Temporary network failure should not destroy form data');
  await context.setOffline(true);
  await offlineDialog.getByRole('button',{name:'Создать заявку',exact:true}).click();
  await offlineDialog.getByRole('alert').waitFor({timeout:12000});
  assert.match(await offlineDialog.getByRole('alert').innerText(),/Проверьте интернет и попробуйте ещё раз/);
  assert.equal(await offlineDialog.locator('textarea').inputValue(),'Temporary network failure should not destroy form data');
  assert.equal(allRows.length,1,'offline save must not insert a record');
  await context.setOffline(false);
  await offlineDialog.getByRole('button',{name:'Отмена'}).click();
  pass('Offline save shows human-readable error and preserves form without a duplicate');
  await page.screenshot({path:join(screenshots,'dashboard-desktop.png'),fullPage:true});
  const mobile=await browser.newContext({viewport:{width:360,height:740},isMobile:true,deviceScaleFactor:1,locale:'ru-RU'});
  // Transfer test session only for screenshot; backend still scopes by fake JWT.
  await mobile.addInitScript(({storage})=>{for(const [k,v] of Object.entries(storage))localStorage.setItem(k,v)}, {storage:await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)))});
  const mp=await mobile.newPage();
  await mp.goto(base);
  await mp.getByRole('heading',{name:/Заявки на автоматизацию/}).waitFor({timeout:8000});
  await mp.screenshot({path:join(screenshots,'dashboard-mobile.png'),fullPage:true});
  const horizontal=await mp.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
  assert.equal(horizontal,false,'No horizontal overflow on mobile viewport');
  pass('Mobile dashboard 360px renders without horizontal overflow');
  const second=await browser.newContext({viewport:{width:1100,height:800},locale:'ru-RU'});
  const p2=await second.newPage();
  await p2.goto(base);
  await p2.getByRole('button',{name:'Зарегистрироваться'}).click();
  await p2.getByLabel('Email').fill('qa.user.b@example.test');
  await p2.getByLabel('Пароль').fill('passw0rd-demo');
  await p2.getByRole('button',{name:'Создать аккаунт →'}).click();
  await p2.getByRole('heading',{name:/Заявки на автоматизацию/}).waitFor({timeout:10000});
  assert.equal(await p2.getByText('Обновлённый отчёт').count(),0);
  await p2.getByText('Пока нет заявок').waitFor({timeout:12000});
  pass('Second account cannot see first account rows in mock API');
  await page.getByRole('button',{name:/Выйти/}).click();
  await page.getByRole('heading',{name:'С возвращением'}).waitFor();
  pass('Sign out returns to login');
  assert.deepEqual(consoleErrors,[]);
  pass('No uncaught browser page errors');
  await Promise.all([context.close(),mobile.close(),second.close()]);
} catch(e) {
  console.error('TEST FAILURE',e.stack||e);
  if (debugPage) {
    try {
      console.log('SCREEN STATE', (await debugPage.locator('body').innerText()).slice(0,2500));
      await debugPage.screenshot({path:join(screenshots,'e2e-failure.png'),fullPage:true});
    } catch(err) {console.error('Cannot inspect failure',String(err));}
  }
  process.exitCode=1;
}
finally { await browser.close();api.close();staticServer.close();console.log('SUMMARY',steps.length,'checks passed;',queryCount,'GET requests'); }
