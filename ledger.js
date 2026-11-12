export const categories = ['餐饮','购物','家居','交通','美容','宠物','旅行','居住','手续费','待分类'];
export const types = {expense:'消费', refund:'退款', transfer:'划转', income:'收入'};
export const groups = {cash:'现金与存款',restricted:'受限与定期资产',physical:'实物资产',debt:'待还负债'};
export const sources = ['微信支付','支付宝','信用卡','其他截图','手动'];
export const yen = cents => new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(cents/100);
export const id = () => globalThis.crypto.randomUUID();
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format();
export function shiftDays(date,days) {
  const day=new Date(date+'T00:00:00Z');
  day.setUTCDate(day.getUTCDate()+days);
  return day.toISOString().slice(0,10);
}
export function weekStart(date) {
  const weekday=new Date(date+'T00:00:00Z').getUTCDay();
  return shiftDays(date,-((weekday+6)%7));
}
export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
}
export function categoryFor(name, rules={}) {
  const key=normalize(name);
  if(Object.hasOwn(rules,key)) return rules[key];
  const options=[['餐饮',/咖啡|餐饮|餐厅|瑞幸|星巴克|麦当劳|奶茶/],['交通',/滴滴|高德打车|地铁|公交/],['美容',/美容|化妆品|护肤/],['宠物',/宠物|猫粮/],['旅行',/携程|航空|机票|酒店|铁路/],['家居',/宜家|家具|家居/],['居住',/房租|水电/],['手续费',/手续费|利息/]];
  return options.find(([,regex])=>regex.test(name))?.[0]??'待分类';
}
export const normalize = value => String(value??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function matches(row, candidates) {
  if(!row.cents || !row.date) return [];
  return candidates.filter(other=>{
    if(other.id===row.id || other.mergedInto || other.kind!==row.kind || other.cents!==row.cents || row.distinct?.includes(other.id) || other.distinct?.includes(row.id)) return false;
    if(row.order && other.order && row.order===other.order) return true;
    const days=Math.abs(Date.parse(row.date)-Date.parse(other.date))/86400000;
    if(days===0 && row.source==='信用卡' && other.source===row.source && row.account && row.account===other.account && row.time && other.time) {
      return row.time===other.time;
    }
    if(days===0) return true;
    const a=normalize(row.name), b=normalize(other.name);
    return days<=2 && row.source!==other.source && a.length>=2 && b.length>=2 && (a.includes(b)||b.includes(a));
  }).sort((a,b)=>Number(b.status==='confirmed')-Number(a.status==='confirmed'));
}
export const validTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);
export function creditRowKey(row) {
  if(row.source!=='信用卡'||!row.account||!validDate(row.date)||!validTime(row.time)||!row.cents) return '';
  return JSON.stringify([row.account,row.date,row.time,row.cents,row.kind]);
}

export function readCheckedBill(text) {
  const bill=JSON.parse(text);
  if(bill?.format!=='qianji-checked-bill-v1'||!Array.isArray(bill.rows)||!bill.rows.length||bill.rows.length>5000) {
    throw new Error('请选择钱迹已核对账单文件。');
  }
  const ids=new Set();
  return bill.rows.map(row=>{
    if(!row||typeof row.id!=='string'||!/^bill-[a-z0-9-]{1,90}$/.test(row.id)||ids.has(row.id)||
      typeof row.name!=='string'||!row.name.trim()||row.name.length>120||!validDate(row.date)||
      (row.time&&!validTime(row.time))||!Number.isSafeInteger(row.cents)||row.cents<=0||row.cents>9999999900||
      !Object.hasOwn(types,row.kind)||!sources.includes(row.source)||typeof row.account!=='string'||row.account.length>60||
      !categories.includes(row.category)) throw new Error('账单中有无效交易，请检查文件。');
    ids.add(row.id);
    return {id:row.id,name:row.name.trim(),date:row.date,time:row.time||'',cents:row.cents,kind:row.kind,
      source:row.source,account:row.account,category:row.category,tag:'',status:'confirmed',check:false};
  });
}

export function planBillImport(incoming, existing) {
  const knownIds=new Set(existing.map(row=>row.id));
  const knownCreditRows=new Set(existing.map(creditRowKey).filter(Boolean));
  const additions=[];
  for(const row of incoming) {
    const key=creditRowKey(row);
    if(knownIds.has(row.id)||(key&&knownCreditRows.has(key))) continue;
    const status=matches(row,existing).length?'pending':'confirmed';
    additions.push({...row,status});
    knownIds.add(row.id);
    if(key) knownCreditRows.add(key);
  }
  return {additions,skipped:incoming.length-additions.length,pending:additions.filter(row=>row.status==='pending').length};
}

export function creditStatement(text) {
  const compact=text.normalize('NFKC').replace(/\s/g,'');
  const period=compact.match(/(20\d{2})-(0[1-9]|1[0-2])未出账单/);
  const bank=compact.match(/中信(?:和)?银行[^\n]{0,25}?\((\d{4})\)/);
  if(!period||!bank) return null;
  return {year:Number(period[1]),month:Number(period[2]),account:'中信信用卡 · '+bank[1]};
}

function ocrLines(tsv, left=Infinity, right=-Infinity) {
  const groups=new Map();
  for(const line of (tsv??'').split('\n')) {
    const [level,page,block,paragraph,row,,x,y,width,height,,word]=line.split('\t');
    if(level!=='5'||!word?.trim()||Number(x)>=left||Number(x)+Number(width)<=right) continue;
    const key=[page,block,paragraph,row].join(':');
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push({x:Number(x),y:Number(y)+Number(height)/2,word});
  }
  return [...groups.values()].map(words=>({
    y:words.map(word=>word.y).sort((a,b)=>a-b)[Math.floor(words.length/2)],
    text:words.sort((a,b)=>a.x-b.x).map(word=>word.word).join(' ').normalize('NFKC')
  })).sort((a,b)=>a.y-b.y);
}

export function parseCreditStatement(fullTsv, amountTsv, statement, crop, rules={}) {
  const left=ocrLines(fullTsv,crop.x);
  const right=ocrLines(fullTsv,Infinity,crop.x);
  const dates=left.flatMap(line=>{
    const m=line.text.match(/^(\d{2})\s*-\s*(\d{2})(?=\s|[0-2]\d:)/);
    if(!m) return [];
    const year=statement.year-Number(Number(m[1])>statement.month);
    const date=year+'-'+m[1]+'-'+m[2];
    if(!validDate(date)) return [];
    const time=line.text.slice(m[0].length).match(/^\s*((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)(?!\d)/)?.[1]??'';
    return [{...line,date,time}];
  });
  const decimal=text=>text.match(/-?\d+\.\d{2}(?!\d)/)?.[0];
  const fromColumn=ocrLines(amountTsv).flatMap(line=>{
    const value=decimal(line.text.replace(/[¥￥\s]/g,''));
    return value?[{y:line.y/crop.scale+crop.y,value,verified:true}]:[];
  });
  const close=crop.height*.023;
  const fullAmounts=right.flatMap(line=>{
    const text=line.text.replace(/[¥￥]/g,'').replace(/-\s+/g,'-').trim();
    const whole=text.match(/(?:^|\s)(-?\d{3,})$/)?.[1];
    const value=decimal(text)??whole?.replace(/(?=\d{2}$)/,'.');
    return value?[{y:line.y,value,verified:false}]:[];
  });
  const fromFull=fullAmounts.filter(line=>!fromColumn.some(other=>Math.abs(other.y-line.y)<close));
  const rows=[];
  for(const {y,value,verified} of [...fromColumn,...fromFull].sort((a,b)=>a.y-b.y)) {
    const detail=dates.find(line=>line.y>y+crop.height*.012&&line.y<y+crop.height*.048);
    const merchant=left.findLast(line=>Math.abs(line.y-y)<close&&!dates.some(date=>date.y===line.y)&&/\p{L}/u.test(line.text));
    const clipped=!detail&&dates.length&&y>crop.height*.91&&y>dates.at(-1).y&&merchant;
    if(!detail&&!clipped) continue;
    const clean=text=>text.replace(/(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'').trim();
    const name=clean(merchant?.text??'').replace(/[\s*，。]+$/u,'');
    if(/账单金额|还款金额|客服热线|在线客服/.test(name)) continue;
    const status=clean(detail?.text??'');
    const kind=/还款/.test(status)||(/还款/.test(name)&&value.startsWith('-'))?'transfer':
      /退款|冲正/.test(status)||value.startsWith('-')?'refund':'expense';
    const cents=Math.round(Math.abs(Number(value))*100);
    if(!Number.isSafeInteger(cents)||!cents) continue;
    const alternative=verified&&fullAmounts.find(other=>Math.abs(other.y-y)<close&&Number(other.value)!==Number(value));
    rows.push({id:id(),name,date:detail?.date??'',time:detail?.time??'',cents,kind,source:'信用卡',
      account:statement.account,category:categoryFor(name,rules),tag:'',order:'',status:'pending',
      check:!detail||!detail.time||!name||!verified||Boolean(alternative),
      hint:[merchant?.text,detail?.text??'截图底部日期不完整，请对照原账单补录。',
        alternative?'金额识别结果不一致：'+value+' 或 '+alternative.value:value].filter(Boolean).join(' / ')});
  }
  return rows;
}
export function resolveOriginal(indexed, key) {
  let original=indexed.get(key);
  while(original?.mergedInto) original=indexed.get(original.mergedInto);
  return original;
}
export function report(rows, from, to) {
  const period=rows.filter(row=>row.status==='confirmed'&&!row.mergedInto&&row.date>=from&&row.date<=to);
  const indexed=new Map(rows.map(row=>[row.id,row]));
  const byCategory=Object.create(null), byTag=Object.create(null);
  let gross=0, refunds=0, transfers=0, income=0, crossMonth=0;
  for(const row of period) {
    if(row.kind==='transfer') { transfers+=row.cents; continue; }
    if(row.kind==='income') { income+=row.cents; continue; }
    const original=row.kind==='refund'&&row.refundOf ? resolveOriginal(indexed,row.refundOf) : null;
    const target=original??row;
    const sign=row.kind==='refund'?-1:1;
    if(sign===1) gross+=row.cents;
    else {
      refunds+=row.cents;
      if(original && original.date.slice(0,7)!==row.date.slice(0,7)) crossMonth+=row.cents;
    }
    byCategory[target.category]=(byCategory[target.category]??0)+sign*row.cents;
    if(target.tag) byTag[target.tag]=(byTag[target.tag]??0)+sign*row.cents;
  }
  const sorted=map=>Object.entries(map).sort((a,b)=>b[1]-a[1]);
  return {period,gross,refunds,net:gross-refunds,transfers,income,crossMonth,byCategory:sorted(byCategory),byTag:sorted(byTag)};
}
const dateRE=/(?<!\d)(?:(20\d{2})\s*[-/.年]\s*)?(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?:日)?(?!\d|[.:]\d)/g;
const amountRE=/(?:[¥￥]\s*)?[+\-−]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}(?!\d)|[¥￥]\s*[+\-−]?\s*\d+(?![\d.])/g;
const header=/^(?:本月|合计|总计|账单总额|账单金额|应还款|应还金额|还款金额|可用额度|累计|剩余|支出合计|收入合计|本期账单|余额|账单首页|总支出|总收入|最低还款|优惠|实付合计)/;
const label=/^(?:交易时间|支付时间|付款时间|创建时间|支付方式|付款方式|支付状态|交易状态|交易单号|订单编号|订单号|交易单号|商品说明|当前状态|账单详情|交易详情|支付成功|支付完成|付款成功|商户全称|交易成功|收单机构|查看|账单|交易日期|交易金额|实付金额|付款金额|金额|时间|付款账户|账单服务|退款时间|退款金额|商户名称|商户)$/;
export function parseOCR(raw, source, month, rules={}) {
  const lines=raw.normalize('NFKC').replace(/(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,space=>space.includes('\n')?space:'').split('\n')
    .map(line=>line.trim().replace(/(?<=\d)\s*[.]\s*(?=\d)/g,'.')).filter(Boolean);
  const candidates=[];
  const dateAt=line=>{
    for(const match of line.matchAll(dateRE)) {
      if(line[match.index+match[0].length]==='元') continue;
      const [whole,y,m,d]=match;
      if(!y && !/[-/月]/.test(whole)) continue;
      // A month/day without a year stays editable and uses the selected year.
      const date=(y??month.slice(0,4))+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');
      if(validDate(date)) return {date,inferred:!y,whole};
    }
    return null;
  };
  const clean=line=>{
    let name=line;
    const found=dateAt(name);
    if(found) name=name.replace(found.whole,'');
    return name.replace(amountRE,'').replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g,'')
      .replace(/^(?:交易金额|付款金额|实付金额|退款金额|商户名称|商户|商品说明|收款方)\s*[:：]?\s*/,'')
      .replace(/^[\s:：|·-]+|[\s:：|·-]+$/g,'').trim();
  };
  const eligible=name=>name&& !header.test(name) && !label.test(name) && /\p{L}/u.test(name)
    && !/^(?:支付方式|付款方式|订单编号|交易单号|商户单号|交易时间|支付时间|退款时间|创建时间|信用卡尾号|选择账单)/.test(name);
  let lastDated=-Infinity, dateContext=null;
  for(let i=0;i<lines.length;i++) {
    const line=lines[i], dateHere=dateAt(line);
    if(dateHere) {dateContext=dateHere;lastDated=i;}
    if(header.test(line)||/^(?:交易时间|支付时间|退款时间|付款时间|订单编号|交易单号)/.test(line)) continue;
    const amountLine=dateHere?line.replace(dateHere.whole,''):line;
    const money=[...amountLine.matchAll(amountRE)];
    if(money.length!==1) continue;
    const next=lines.slice(i+1,i+3);
    const followingDate=next.find(l=>dateAt(l)&&![...l.replace(dateAt(l).whole,'').matchAll(amountRE)].length);
    const date=dateHere??(i-lastDated<=4?dateContext:null)??(followingDate?dateAt(followingDate):null);
    const inline=clean(line);
    const context=lines.slice(Math.max(0,i-2),i+2);
    const nearby=[lines[i-1],lines[i+1],lines[i-2]].filter(Boolean)
      .filter(l=>![...l.replace(dateAt(l)?.whole??'','').matchAll(amountRE)].length).map(clean);
    const name=eligible(inline)?inline:nearby.find(eligible)??'';
    const cents=Math.round(Math.abs(Number(money[0][0].replace(/[¥￥,\s]/g,'').replace('−','-')))*100);
    if(!Number.isSafeInteger(cents)||cents<=0) continue;
    const sign=money[0][0].replace(/[¥￥\s]/g,'')[0];
    const details=name+' '+line;
    const kind=/信用卡还款|账户互转|公积金提取|余额提现|转账/.test(details)?'transfer':
      /退款|退货|冲正/.test(details)?'refund':
      /工资|加班费|薪资/.test(details)?'income':'expense';
    const order=lines.length<=16?lines.map(l=>l.match(/(?:交易单号|订单编号|订单号)\s*[:：]?\s*([0-9A-Z-]{8,})/i)?.[1]).find(Boolean)??'':'';
    candidates.push({id:id(),name,date:date?.date??'',cents,kind,source,category:categoryFor(name,rules),tag:'',order,
      status:'pending',check:!date||date.inferred||!name||sign==='+'||kind!=='expense'||!dateHere||!eligible(inline),hint:context.join(' / ').replace(/\d{8,}/g,'••••').slice(0,280)});
  }
  return candidates;
}
