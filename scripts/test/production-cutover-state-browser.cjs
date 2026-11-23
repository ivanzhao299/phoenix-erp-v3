// The real React panel and HTTP client, with pilot-only synthetic browser responses.
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const path=require('node:path');
const {createServer}=require('node:http');
const root=path.resolve('apps/web'),web=createRequire(path.join(root,'package.json'));
const vite=createRequire(createRequire(web.resolve('vitest/package.json')).resolve('vite/package.json'));
const {chromium}=web('@playwright/test');

(async()=>{
  const built=await vite('esbuild').build({absWorkingDir:root,bundle:true,write:false,outfile:'panel.js',jsx:'automatic',
    define:{'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_API_URL':'""'},
    stdin:{resolveDir:root,loader:'tsx',contents:`import {createRoot} from 'react-dom/client';
      import Panel from './src/components/breeding/ProductionCutoverStatePanel';
      import {LanguageProvider} from './src/contexts/LanguageContext';
      createRoot(document.getElementById('app')).render(<LanguageProvider><Panel id="owned" actor="1" company="A" warehouse="WH" houses={['A3','A4']}/></LanguageProvider>);`}});
  const js=built.outputFiles.find(f=>f.path.endsWith('.js')).text,css=built.outputFiles.find(f=>f.path.endsWith('.css'))?.text??'';
  const server=createServer((req,res)=>{if(req.url==='/panel.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}
    else if(req.url==='/panel.css'){res.setHeader('Content-Type','text/css');res.end(css);}
    else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/panel.css"><div id="app"></div><script src="/panel.js"></script>');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:840}});
      let paused=false,receipt,submissions=0,canManage=true;
      const row=(h)=>({house_code:h,product_code:'EGG',domain_state:'ACTIVE',scope_state:paused&&h==='A3'?'SUSPENDED':'ACTIVE',version:2,scope_intent:receipt?.intentKey??null});
      await page.route('**/api/**',async route=>{
        const url=new URL(route.request().url());let data,status=200;
        if(url.pathname.endsWith('/state-boundary')){
          const h=url.searchParams.get('houseCode');data={canManage,boundaryHash:'a'.repeat(64),members:(h?[h]:['A3','A4']).map(row)};
        }else if(url.pathname.endsWith('/upload/contract'))data={fileId:'OWNED-PROOF'};
        else if(url.pathname.endsWith('/state')){
          const body=route.request().postDataJSON();assert.equal(body.houseCode,'A3');assert.equal(body.state,'SUSPENDED');assert.equal(body.evidenceFileId,'OWNED-PROOF');
          submissions++;paused=true;receipt={intentKey:body.intentKey,state:body.state,houses:['A3']};data=receipt;
        }else if(url.pathname.includes('/state-receipts/')&&url.pathname.endsWith(receipt?.intentKey??'never'))data=receipt;
        else{status=404;data={};}
        await route.fulfill({status,json:data});
      });
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.getByText('A4 · 已启用',{exact:false}).waitFor();await page.getByRole('combobox').selectOption('A3');
      await page.getByText('A3 · 已启用',{exact:false}).waitFor();
      await page.locator('textarea').fill('Owned rehearsal');await page.locator('input[type=file]').first().setInputFiles({name:'count.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});
      await page.getByRole('button',{name:'确认暂停上述范围'}).click();await page.getByText('A3 · 已暂停',{exact:false}).waitFor();
      assert.equal(submissions,1);await page.reload();await page.getByRole('button',{name:'查回本设备上次启停回执'}).click();
      await page.getByRole('status').filter({hasText:receipt.intentKey}).waitFor();assert.equal(submissions,1);
      canManage=false;await page.getByRole('button',{name:'重新核对范围'}).click();await page.getByText('A4 · 已启用',{exact:false}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.close();
      console.log('Pilot state panel, single-house write and refresh recovery at width '+width+' passed');
    }
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
