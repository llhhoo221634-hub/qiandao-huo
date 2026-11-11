
// 探针：从当前出口 IP 拉 yxdr 比价 API，验证机房 IP 是否可通行
import crypto from 'node:crypto';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const H={'User-Agent':UA,'Accept-Language':'zh-CN,zh;q=0.9','Content-Type':'application/json'};
const GID=3575, GSID=8;
const ip=await (await fetch('https://ipinfo.io/json',{headers:{'User-Agent':UA}})).text();
console.log('EGRESS', ip.replace(/\s+/g,' ').slice(0,200));
const js=await (await fetch('https://yxdr.com/cate/3575/CoinSale_yxb_8_0.js?ver=936',{headers:H})).text();
const m=js.match(/window\.bijiaqiChanels=(\[[\s\S]*?\]);/);
if(!m){console.log('NO_CHANELS len='+js.length);process.exit(0);}
const chanels=JSON.parse(m[1]);
const sec=await (await fetch('https://yxdr.com/bijia/coinsalesecret',{method:'POST',headers:H,body:JSON.stringify({GId:GID,GsId:GSID})})).json();
console.log('SECRET ok', !!sec.secret);
let n=0;
for(const c of chanels){
  const pf=JSON.parse(c.data).PfId;
  const s=crypto.createHash('md5').update(sec.secret+'_'+pf+'_'+c.sign).digest('hex');
  const r=await (await fetch('https://yxdr.com/bijia/coinsale',{method:'POST',headers:H,body:JSON.stringify({data:c.data,sign:c.sign,price1:0,price2:0,time:sec.time,secret:s})})).text();
  console.log('PF',pf,'len',r.length,'head',r.slice(0,120).replace(/\s+/g,' '));
  try{const j=JSON.parse(r);n+=(j.data||[]).length;}catch(e){}
}
console.log('ROWS',n);
