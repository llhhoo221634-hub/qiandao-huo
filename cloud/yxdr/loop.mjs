// 长跑循环：每 60 秒采样一次，每 5 分钟回写一次数据分支；默认跑 5h46m
import { sample } from './collect.mjs';
const TOK=process.env.GH_TOKEN||'';
const REPO='llhhoo221634-hub/qiandao-huo', BRANCH='yxdr-data';
const MINUTES=Number(process.env.MINUTES||346);
const END=Date.now()+MINUTES*60e3;
const FLUSH_MS=5*60e3;
let buf=[], lastFlush=0, ok=0, fail=0;

async function ghApi(path,opt={}){
  const r=await fetch('https://api.github.com'+path,{...opt,headers:{Authorization:'Bearer '+TOK,Accept:'application/vnd.github+json','Content-Type':'application/json'}});
  if(!r.ok && r.status!==404) throw new Error(path+' '+r.status);
  return r.status===404?null:r.json();
}

async function flushOnce(){
  if(!TOK || !buf.length) return;
  const day=new Date(Date.now()+8*3600e3).toISOString().slice(0,10);
  const path='yxdr/'+day+'.jsonl';
  const cur=await ghApi('/repos/'+REPO+'/contents/'+path+'?ref='+BRANCH);
  const prev=cur?Buffer.from(cur.content,'base64').toString('utf8'):'';
  const body={message:'data: yxdr '+day+' +'+buf.length,
    content:Buffer.from(prev+buf.join('\n')+'\n').toString('base64'),branch:BRANCH};
  if(cur) body.sha=cur.sha;
  await ghApi('/repos/'+REPO+'/contents/'+path,{method:'PUT',body:JSON.stringify(body)});
  console.log(new Date().toISOString(),'flush',buf.length,'rows');
  buf=[]; lastFlush=Date.now();
}

async function flush(){
  if(!TOK || !buf.length) return;
  for(let attempt=0; attempt<4; attempt++){
    try{ await flushOnce(); return; }
    catch(e){
      if(!/(409|422|429|50\d)/.test(e.message)){ console.log('flush ERR',e.message); return; }
      await new Promise(r=>setTimeout(r, 1500+attempt*2500));
    }
  }
  console.log('flush giveup');
}

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
while(Date.now()<END){
  const t0=Date.now();
  try{
    const s=await sample();
    buf.push(JSON.stringify({ts:s.ts,gs:s.gs,n:s.n,pfs:s.pfs,min:s.min,med:s.med,max:s.max,fireTotal:s.fireTotal}));
    ok++;
  }catch(e){ fail++; console.log('ERR',e.message); }
  if(!lastFlush || Date.now()-lastFlush>FLUSH_MS) await flush();
  const wait=60000-(Date.now()-t0);
  if(wait>0) await sleep(wait);
}
await flush();
console.log('done ok='+ok+' fail='+fail);
