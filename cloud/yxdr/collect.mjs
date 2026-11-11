
// yxdr 比价采集：聚合 UU898/DD373/7881 的初火源质挂单，写 JSONL 到数据分支
// 用法：node collect.mjs [--once]   环境：GH_TOKEN(可选，有则回写仓库数据分支)
import crypto from 'node:crypto';

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const H={'User-Agent':UA,'Accept-Language':'zh-CN,zh;q=0.9','Content-Type':'application/json'};
const GID=3575, GSID=8;           // 火炬之光 / 国服 / SS11渴瘾症专家
const REPO='llhhoo221634-hub/qiandao-huo', BRANCH='yxdr-data';
const TOK=process.env.GH_TOKEN||'';

const md5=(s)=>crypto.createHash('md5').update(s).digest('hex');

export async function sample(){
  const js=await (await fetch('https://yxdr.com/cate/'+GID+'/CoinSale_yxb_8_0.js?ver=936',{headers:H})).text();
  const m=js.match(/window\.bijiaqiChanels=(\[[\s\S]*?\]);/);
  if(!m) throw new Error('no chanels');
  const chanels=JSON.parse(m[1]);
  const sec=await (await fetch('https://yxdr.com/bijia/coinsalesecret',{method:'POST',headers:H,body:JSON.stringify({GId:GID,GsId:GSID})})).json();
  const ts=Date.now(), rows=[];
  for(const c of chanels){
    const meta=JSON.parse(c.data);
    const secret=md5(sec.secret+'_'+meta.PfId+'_'+c.sign);
    const body={data:c.data,sign:c.sign,price1:0,price2:0,time:sec.time,secret};
    try{
      const r=await (await fetch('https://yxdr.com/bijia/coinsale',{method:'POST',headers:H,body:JSON.stringify(body)})).json();
      for(const x of (r.data||[])) rows.push({pf:meta.PfName,price:x.Price,number:x.Number,amount:x.Amount});
    }catch(e){ /* 单平台失败不影响整体 */ }
  }
  const ps=rows.map(r=>r.price).filter(p=>p>0).sort((a,b)=>a-b);
  const fire=rows.reduce((s,r)=>s+(r.amount>0?r.amount:0),0);
  return {ts,gs:'国服/SS11渴瘾症专家',n:rows.length,pfs:[...new Set(rows.map(r=>r.pf))],
          min:ps[0]??null,med:ps.length?ps[Math.floor(ps.length/2)]:null,max:ps.at(-1)??null,
          fireTotal:fire, rows};
}

async function ghApi(path,opt={}){
  const r=await fetch('https://api.github.com'+path,{...opt,headers:{Authorization:'Bearer '+TOK,Accept:'application/vnd.github+json','Content-Type':'application/json',...(opt.headers||{})}});
  if(!r.ok && r.status!==404) throw new Error(path+' '+r.status);
  return r.status===404?null:r.json();
}

async function append(line){
  if(!TOK) return;
  const day=new Date(Date.now()+8*3600e3).toISOString().slice(0,10);
  const path='yxdr/'+day+'.jsonl';
  const cur=await ghApi('/repos/'+REPO+'/contents/'+path+'?ref='+BRANCH);
  const prev=cur?Buffer.from(cur.content,'base64').toString('utf8'):'';
  const body={message:'data: yxdr '+day,content:Buffer.from(prev+line+'\n').toString('base64'),branch:BRANCH};
  if(cur) body.sha=cur.sha;
  await ghApi('/repos/'+REPO+'/contents/'+path,{method:'PUT',body:JSON.stringify(body)});
}

if(process.argv.includes('--once')){
  const s=await sample();
  const slim={ts:s.ts,gs:s.gs,n:s.n,pfs:s.pfs,min:s.min,med:s.med,max:s.max,fireTotal:s.fireTotal};
  console.log(JSON.stringify(slim));
  if(process.env.PUSH==='1'){ await append(JSON.stringify(slim)); console.log('pushed'); }
}
