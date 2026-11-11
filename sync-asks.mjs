
// 把云端 yxdr 挂单数据拉回本地：store/asks.db（独立库，不动 price.db）
// 用法：node sync-asks.mjs [--force]
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const REPO='llhhoo221634-hub/qiandao-huo', BRANCH='yxdr-data', API='https://api.github.com';
const DBP='/root/workspace/gh/store/asks.db', STAMP='/root/workspace/gh/store/.asks-sync';
const TOK=(process.env.GH_TOKEN||(fs.existsSync('/root/workspace/gh/.token')?fs.readFileSync('/root/workspace/gh/.token','utf8').trim():''));

const force=process.argv.includes('--force');
if(!force && fs.existsSync(STAMP)){
  const age=(Date.now()-fs.statSync(STAMP).mtimeMs)/1000;
  if(age<240){ console.log(JSON.stringify({skipped:true,ageSec:Math.round(age)})); process.exit(0); }
}

const db=new DatabaseSync(DBP);
db.exec(`CREATE TABLE IF NOT EXISTS asks(
  ts INTEGER PRIMARY KEY, gs TEXT, n INTEGER, pfs TEXT,
  min REAL, med REAL, max REAL, fire_total INTEGER, pulled_at INTEGER)`);
const ins=db.prepare('INSERT OR IGNORE INTO asks(ts,gs,n,pfs,min,med,max,fire_total,pulled_at) VALUES(?,?,?,?,?,?,?,?,?)');

const bj=(off=0)=>new Date(Date.now()+8*3600e3+off).toISOString().slice(0,10);
const days=[bj(-86400e3), bj(0)];
let added=0, fetched=0;
for(const day of days){
  const r=await fetch(API+'/repos/'+REPO+'/contents/yxdr/'+day+'.jsonl?ref='+BRANCH,
    {headers:{Authorization:'Bearer '+TOK,Accept:'application/vnd.github+json'}});
  if(r.status===404) continue;
  if(!r.ok){ console.log(JSON.stringify({error:'http '+r.status})); process.exit(1); }
  const txt=Buffer.from((await r.json()).content,'base64').toString('utf8');
  fetched+=txt.split('\n').filter(Boolean).length;
  for(const line of txt.split('\n')){
    if(!line.trim()) continue;
    let x; try{ x=JSON.parse(line); }catch(e){ continue; }
    if(!x.ts) continue;
    const res=ins.run(x.ts, x.gs||'', x.n||0, (x.pfs||[]).join(','), x.min??null, x.med??null, x.max??null, x.fireTotal||0, Date.now());
    if(res.changes) added++;
  }
}
fs.writeFileSync(STAMP, String(Date.now()));
const total=db.prepare('SELECT COUNT(*) c FROM asks').get().c;
const last=db.prepare('SELECT ts,med,min,max,n FROM asks ORDER BY ts DESC LIMIT 1').get();
console.log(JSON.stringify({added,fetched,total,latest:last?{ts:last.ts,med:last.med,min:last.min,max:last.max,n:last.n}:null,
  ageSec:last?Math.round((Date.now()-last.ts)/1000):null}));
db.close();
