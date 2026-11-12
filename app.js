import {categories,types,groups,sources,yen,id,today,shiftDays,weekStart,validDate,validTime,normalize,categoryFor,matches,report,parseOCR,resolveOriginal,creditStatement,parseCreditStatement,creditRowKey,readCheckedBill,planBillImport} from './ledger.js?v=12';

const key='qianji-ledger-public-v1';
const empty=()=>({rows:[],assets:[],rules:{},budgets:{},imports:[],customCategories:[]});
let real=empty(), demo=empty(), mode='real', billDraft=null;
try {
  const saved=JSON.parse(localStorage.getItem(key)??'null');
  if(saved?.real) real=saved.real;
} catch { /* Start with a usable empty ledger. */ }

const monthNow=today().slice(0,7);
const shiftMonth=(period,offset)=>{
  const [year,index]=period.split('-').map(Number);
  return new Date(Date.UTC(year,index-1+offset,1)).toISOString().slice(0,7);
};
const sampleDate=day=>monthNow+'-'+String(day).padStart(2,'0');
const sample=(name,value,day,category,source,tag='',kind='expense')=>({id:id(),name,cents:Math.round(value*100),date:sampleDate(day),category,source,tag,kind,status:'confirmed'});
const home=sample('家居用品订单',1280,3,'家居','支付宝','搬家');
demo.rows=[
  home,{...sample('家居用品退货',360,6,'家居','支付宝','','refund'),refundOf:home.id},
  sample('周末往返机票',860,2,'旅行','信用卡','周末旅行'),
  sample('超市与日用品',328.6,5,'购物','支付宝'),
  sample('周末聚餐',218,7,'餐饮','微信支付'),
  sample('猫粮补货',189,5,'宠物','支付宝'),
  sample('日常打车',46.8,8,'交通','微信支付'),
  sample('工作日咖啡',27.5,9,'餐饮','微信支付'),
  {...sample('航旅票务',860,2,'旅行','支付宝'),status:'pending',check:false},
  {...sample('社区咖啡',19.9,9,'餐饮','微信支付'),status:'pending',check:false}
];
for(const [offset,name,amount,category] of [[-2,'周末短途旅行',1180,'旅行'],[-1,'房租',2400,'居住'],[-1,'超市与日用品',680,'购物']]){
  demo.rows.push({...sample(name,amount,8,category,'手动'),date:shiftMonth(monthNow,offset)+'-08'});
}
demo.assets=[
  {id:id(),name:'日常储蓄',group:'cash',cents:2350000,date:sampleDate(8),deposits:[{id:id(),date:sampleDate(5),cents:150000,note:'工资到账后转存'}]},
  {id:id(),name:'公积金',group:'restricted',cents:1280000,withdraw:200000,date:sampleDate(8),deposits:[{id:id(),date:sampleDate(7),cents:200000,note:'本月缴存'}]},
  {id:id(),name:'手机',group:'physical',cents:310000,original:699900,date:sampleDate(8)},
  {id:id(),name:'信用卡待还',group:'debt',cents:265000,date:sampleDate(8)}
];
demo.budgets[monthNow]=240000;

const $=selector=>document.querySelector(selector);
const icons={
  trend:'M3 18l6-7 5 4 7-9 M15 6h6v6',
  home:'M3 10l9-7 9 7v10H3z M9 20v-6h6v6',
  list:'M5 6h14 M5 12h14 M5 18h14 M2 6h.1 M2 12h.1 M2 18h.1',
  chart:'M4 19V5 M4 19h16 M9 15v-4 M14 15V8 M19 15V5',
  wallet:'M3 7h17a1 1 0 0 1 1 1v11H4a1 1 0 0 1-1-1V7l14-4v4 M21 12h-5v3h5',
  upload:'M12 16V4 M7 9l5-5 5 5 M4 16v4h16v-4',
  plus:'M12 5v14 M5 12h14',
  left:'M15 5l-7 7 7 7',right:'M9 5l7 7-7 7',
  close:'M6 6l12 12 M18 6L6 18',check:'M5 12l4 4L19 6',
  shield:'M12 22s7-4 7-11V5l-7-3-7 3v6c0 7 7 11 7 11z M9 12l2 2 4-4',
  scan:'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M7 12h10',
  lock:'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2',
  box:'M4 7l8-4 8 4v10l-8 4-8-4z M4 7l8 4 8-4 M12 11v10',
  card:'M3 6h18v12H3z M3 10h18 M7 14h3',
  settings:'M5 6h14 M5 12h14 M5 18h14 M9 4v4 M15 10v4 M10 16v4'
};
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+icons[name]+'"/></svg>';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const button=(label,action,style='',glyph='')=>'<button type="button" class="btn '+style+'" data-action="'+esc(action)+'">'+(glyph?icon(glyph):'')+esc(label)+'</button>';
const link=(label,action)=>'<button type="button" class="link" data-action="'+esc(action)+'">'+esc(label)+'</button>';
const blank=text=>'<p class="empty">'+esc(text)+'</p>';
const badge=(text,warn=false)=>'<span class="badge'+(warn?' warn':'')+'">'+esc(text)+'</span>';
const brand='<div class="brand"><span class="brand-mark">'+icon('trend')+'</span><div><b>钱迹</b><small>PERSONAL LEDGER</small></div></div>';
const nav={home:['总览','home'],list:['流水','list'],report:['报表','chart'],assets:['资产','wallet']};
const reportLabels={week:'周报',month:'月报',year:'年报'};
let reportWeek=weekStart(today());
let page='home', assetGroup='', depositQuery='', depositDraft=null, month=monthNow, filter='all', categoryFilter='', range=null, reportMode='month', reportYear=monthNow.slice(0,4), toastTimer, busy=false;
const data=()=>mode==='demo'?demo:real;
const dialog=$('#dialog');
const deleteDialog=$('#delete-transaction-dialog');
const reviewRows=()=>data().rows.filter(row=>row.status==='pending'&&!row.mergedInto);
const cleanRows=()=>reviewRows().filter(row=>!row.check&&row.date&&row.name&&row.cents&&matches(row,data().rows).length===0);
const overlaps=row=>matches(row,data().rows);
const monthEnd=month=>{const [y,m]=month.split('-').map(Number);return month+'-'+new Date(Date.UTC(y,m,0)).getUTCDate();};
const dates=()=>{
  if(page==='report'&&reportMode==='week')return [reportWeek,shiftDays(reportWeek,6)];
  if(page==='report'&&reportMode==='year')return [reportYear+'-01-01',reportYear+'-12-31'];
  if(range&&(page==='report'||(page==='list'&&categoryFilter)))return range;
  return [month+'-01',monthEnd(month)];
};
const getReport=()=>report(data().rows,...dates());
const totals=()=>data().assets.reduce((out,row)=>{out[row.group]+=row.cents??0;return out;},{cash:0,restricted:0,physical:0,debt:0});
const netAssets=a=>a.cash+a.restricted+a.physical-a.debt;
const signed=row=>(row.kind==='expense'?'−':row.kind==='refund'||row.kind==='income'?'+':'')+yen(row.cents);
const kindLabel=row=>types[row.kind]??'待确认';
const dateLabel=row=>row.date?[row.date,row.time].filter(Boolean).join(' '):'日期待确认';
function toast(message) {
  $('#toast').textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('#toast').textContent='',4200);
}
function persist() {
  try { localStorage.setItem(key,JSON.stringify({real})); return true; }
  catch { toast('浏览器存储不可用，请检查浏览器设置。'); return false; }
}
function changed(message) {const saved=persist();render();if(saved&&message)toast(message);}
function setPage(next,nextFilter='all',cat='') {
  page=next;assetGroup='';filter=nextFilter;categoryFilter=cat;render();window.scrollTo(0,0);
}
function navButtons() {
  return Object.entries(nav).map(([key,[label,glyph]])=>'<button class="nav-btn '+(key===page?'active':'')+'" data-action="nav:'+key+'" '+(key===page?'aria-current="page"':'')+'>'+icon(glyph)+esc(label)+'</button>').join('');
}
function top() {
  const showMonth=page!=='assets'&&(page!=='report'||reportMode==='month');
  return '<header class="top">'+brand+'<div class="page-heading"><div class="kicker">我的财务</div><h1 class="top-title">'+(page==='report'?reportLabels[reportMode]:nav[page][0])+'</h1></div><div class="actions">'+
    (showMonth?'<div class="date-pill"><button type="button" data-action="month:-1" aria-label="上个月">'+icon('left')+'</button><input id="month" aria-label="选择月份" type="month" value="'+month+'"><button type="button" data-action="month:1" aria-label="下个月">'+icon('right')+'</button></div>':'')+
    '<button type="button" class="icon-btn" data-action="settings" aria-label="账本设置">'+icon('settings')+'</button></div></header>';
}
const section=(title,desc='',extra='')=>'<div class="section-top"><div><h2>'+esc(title)+'</h2>'+(desc?'<p>'+esc(desc)+'</p>':'')+'</div>'+extra+'</div>';
const isSpending=row=>row.kind==='expense'||row.kind==='refund';
const ledgerIndex=()=>new Map(data().rows.map(row=>[row.id,row]));
const rowCategory=(row,index)=>row.kind==='refund'?(resolveOriginal(index,row.refundOf)?.category??row.category):row.category;
const suggestedCategory=row=>row.category==='待分类'?categoryFor(row.name,data().rules):row.category;
const chipTone={餐饮:'food',购物:'shopping',家居:'home',交通:'travel',美容:'shopping',宠物:'food',旅行:'travel',居住:'home',手续费:'neutral',待分类:'pending'};
const categoryChip=name=>'<span class="tx-chip chip-'+(Object.hasOwn(chipTone,name)?chipTone[name]:'neutral')+'">'+esc(name||'待分类')+'</span>';
function txRows(rows,edit=true) {
  const index=ledgerIndex();
  return rows.map(row=>'<div class="tx"><span class="square">'+icon(row.kind==='expense'?'list':'trend')+'</span><div class="tx-info"><b>'+esc(row.name||'商户待确认')+'</b><small>'+esc([dateLabel(row),row.source].filter(Boolean).join(' · '))+'</small><div class="tx-labels">'+
    (isSpending(row)?categoryChip(rowCategory(row,index)):'')+(row.kind!=='expense'?'<span class="tx-chip chip-neutral">'+esc(kindLabel(row))+'</span>':'')+
    (row.tag?'<span class="tx-chip chip-event">'+esc(row.tag)+'</span>':'')+'</div></div><span class="money '+(row.kind==='refund'?'positive':'')+'">'+signed(row)+'</span>'+(edit?button('详情','edit:'+row.id,'small'):'')+'</div>').join('');
}
function bars(summary, limit=Infinity, action='cat') {
  const entries=summary.byCategory.slice(0,limit);
  const max=Math.max(1,...entries.map(([,n])=>Math.abs(n)));
  const base=summary.byCategory.reduce((total,[,n])=>total+Math.max(0,n),0);
  return entries.map(([name,n],i)=>'<button class="barline" data-action="'+action+':'+esc(name)+'"><span>'+categoryChip(name)+'<b class="money">'+yen(n)+(base&&n>=0?' · '+Math.round(n/base*100)+'%':'')+'</b>'+icon('right')+'</span><span class="bar-track"><span class="bar-fill" style="--pct:'+Math.abs(n)/max*100+'%;--bar:'+['#34775f','#66a177','#92b98a','#b4cda3'][i%4]+'"></span></span></button>').join('')||blank('确认交易后，这里会显示消费去向。');
}
function budgetStatus(difference) {
  return (difference>=0?'剩余预算':'超出预算')+' '+yen(Math.abs(difference));
}
function hero(summary,label='已录净消费',budget,pending=reviewRows().length) {
  const budgetRow=budget==null?'':'<div class="hero-budget"><span>本月预算 <strong>'+yen(budget)+'</strong></span><strong>'+budgetStatus(budget-summary.net)+'</strong></div>';
  return '<section class="hero"><div class="hero-top"><span class="hero-label">'+label+'</span>'+badge(mode==='demo'?'示例账本':'个人账本')+'</div><div class="hero-amount">'+yen(summary.net)+'</div>'+budgetRow+'<div class="hero-foot"><span>消费<strong>'+yen(summary.gross)+'</strong></span><span>退款<strong>'+yen(summary.refunds)+'</strong></span><span>待核对<strong>'+pending+' 笔</strong></span></div></section>';
}
function homeView(summary) {
  const assets=totals();
  const pending=reviewRows().length;
  return hero(summary,'本月已录净消费',data().budgets[month])+
  '<section class="upload"><div class="copy"><span class="square">'+icon('scan')+'</span><div><b>批量导入支付截图</b><p>微信、支付宝、信用卡 · 自动提取并查重</p></div></div>'+button('上传截图','upload','primary','upload')+'</section>'+
  (mode==='demo'?'<div class="notice">当前为独立的示例账本。上传截图会进入你的个人账本。 '+link('打开个人账本','mode:real')+'</div>':'')+
  (pending?'<section class="panel review">'+section('有 '+pending+' 笔交易待核对','核对后才计入月报，疑似重复会单独标出。',button('去核对','pending','small'))+'</section>':'')+
  '<div class="grid"><section class="panel">'+section('钱花在哪','按已确认交易汇总',link('查看月报','open-month-report'))+bars(summary,4)+'</section><section class="panel">'+section('我的资产','手动更新的余额与估值',link('查看资产','nav:assets'))+'<div class="asset-quick"><span>可动用资金</span><strong>'+yen(assets.cash)+'</strong></div><div class="asset-quick"><span>估算净资产</span><strong>'+yen(netAssets(assets))+'</strong></div></section></div>'+
  '<section class="panel stack">'+section('最近确认','按交易日期排序',link('查看流水','nav:list'))+(txRows([...summary.period].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4))||blank('这个月还没有已确认交易。'))+'</section>';
}
function reviewCard(row) {
  const same=overlaps(row);
  const ready=row.date&&row.name&&row.cents;
  return '<article class="candidate"><div class="tx"><div class="tx-info"><b>'+esc(row.name||'商户待确认')+'</b><small>'+esc([dateLabel(row),row.source,kindLabel(row)].join(' · '))+'</small><div class="tx-labels">'+categoryChip(row.category)+'</div></div><strong class="money">'+yen(row.cents)+'</strong></div>'+
  (same.length?'<div class="compare"><strong>疑似重复 · '+same.length+' 笔</strong><br>'+esc(same.slice(0,2).map(x=>x.name+' · '+x.source+' · '+dateLabel(x)).join(' / '))+'</div>':row.check?'<div class="compare"><strong>请检查日期、时间、金额和交易类型</strong></div>':'')+
  '<div class="actions">'+button(same.length?'比较并处理':'核对详情','edit:'+row.id,'small'+(same.length?' primary':''))+
  (!same.length&&ready&&!row.check?button('确认入账','approve:'+row.id,'small primary','check'):'')+
  button('移除','remove:'+row.id,'small ghost danger')+'</div></article>';
}
function listView(summary) {
  const pending=reviewRows();
  const merged=data().rows.filter(r=>r.mergedInto);
  const tabs=[['all','已入账'],['pending','待核对 '+pending.length],['merged','已合并 '+merged.length]];
  const index=ledgerIndex();
  const chosen=filter==='all'?(categoryFilter?summary.period.filter(r=>isSpending(r)&&rowCategory(r,index)===categoryFilter):summary.period):[];
  return '<section class="panel">'+section('交易流水','导入、纠错和核对重复交易')+'<div class="actions">'+button('上传截图','upload','primary','upload')+button('手动补录','new','','plus')+'</div><div class="filter">'+tabs.map(([key,label])=>button(label,'filter:'+key,'small tab '+(key===filter?'active':''))).join('')+'</div>'+
  (filter==='pending'?(cleanRows().length?'<div class="notice">有 '+cleanRows().length+' 笔字段齐全、暂无重复提示的交易。 '+link('批量确认','batch')+'</div>':'')+(pending.map(reviewCard).join('')||blank('没有待核对的交易。'))+
  (data().imports.length?'<details><summary>最近导入批次</summary>'+data().imports.slice(-5).reverse().map(item=>'<p>'+esc(item.date+' · '+item.source+' · '+item.files+' 张，产生 '+item.count+' 笔候选'+(item.duplicates?'，跳过 '+item.duplicates+' 笔重复交易':'')+'，'+item.skipped+' 张需查看')+'</p>').join('')+'</details>':'')
  :filter==='merged'?(merged.map(row=>'<div class="tx"><div class="tx-info"><b>'+esc(row.name)+'</b><small>'+esc(row.source+' · '+row.date)+' · 已合并</small></div><span class="money">'+yen(row.cents)+'</span>'+button('撤销合并','undo:'+row.id,'small')+'</div>').join('')||blank('还没有合并记录。'))
  :(categoryFilter?'<div class="notice">筛选：'+esc(categoryFilter)+' '+link('清除筛选','filter:all')+'</div>':'')+(txRows([...chosen].sort((a,b)=>b.date.localeCompare(a.date)))||blank('这个月还没有符合条件的已确认交易。')))+'</section>';
}
function reportTabs() {
  return '<div class="report-switch" role="group" aria-label="报表类型">'+
    Object.entries(reportLabels).map(([key,label])=>'<button type="button" data-action="report-mode:'+key+'" aria-pressed="'+(key===reportMode)+'">'+label+'</button>').join('')+'</div>';
}
function categoryPanel(summary) {
  return '<section class="panel">'+section('消费结构','按分类汇总净支出，点标签查看每笔交易。',summary.byCategory.length?link('查看分类明细','report-cat'):'')+bars(summary,Infinity,'report-cat')+'</section>';
}
function reportCategory(name) {
  const summary=getReport(), [from,to]=dates(), index=ledgerIndex();
  const entries=summary.byCategory;
  const selected=entries.find(([key])=>key===name)??entries[0];
  if(!selected)return;
  const [category,net]=selected;
  const rows=summary.period.filter(row=>isSpending(row)&&rowCategory(row,index)===category).sort((a,b)=>b.date.localeCompare(a.date));
  const gross=rows.reduce((sum,row)=>sum+(row.kind==='expense'?row.cents:0),0);
  modal('消费分类明细','<p class="sub">'+esc(from)+' 至 '+esc(to)+'</p><div class="filter">'+
    entries.map(([key])=>button(key,'report-cat:'+key,'small tab '+(key===category?'active':''))).join('')+'</div>'+
    '<div class="category-totals"><div><small>消费</small><strong>'+yen(gross)+'</strong></div><div><small>退款</small><strong>'+yen(gross-net)+'</strong></div><div><small>净支出</small><strong>'+yen(net)+'</strong></div></div>'+
    '<p class="sub stack">'+rows.length+' 笔已确认交易</p>'+txRows(rows));
}
function largeExpenses(summary) {
  const top=summary.period.filter(row=>row.kind==='expense').sort((a,b)=>b.cents-a.cents).slice(0,5);
  if(!top.length)return '<section class="panel">'+section('大额支出','按原消费金额取前 5 笔')+blank('还没有消费记录。')+'</section>';
  const groups=new Map();
  for(const row of top){
    const name=row.category||'待分类';
    groups.set(name,(groups.get(name)??0)+row.cents);
  }
  const amount=top.reduce((sum,row)=>sum+row.cents,0);
  const topGroups=[...groups].sort((a,b)=>b[1]-a[1]);
  const unclassified=top.filter(row=>row.category==='待分类');
  const suggestions=unclassified.map(row=>[row,suggestedCategory(row)]).filter(([,category])=>category!=='待分类');
  const largest=top[0];
  return '<section class="panel">'+section('大额支出','按原消费金额取前 5 笔，退款另在分类净额中扣除。')+
    '<div class="large-insight"><b>前 '+top.length+' 笔合计 '+yen(amount)+'，占同期消费 '+Math.round(amount/summary.gross*100)+'%</b>'+
    '<p>最大一笔是 '+esc(largest.name||'商户待确认')+' '+yen(largest.cents)+(largest.tag?'，归入「'+esc(largest.tag)+'」事件':'')+'。</p>'+
    '<div class="tx-labels">'+topGroups.map(([name,cents])=>'<button type="button" class="spend-chip" data-action="report-cat:'+esc(name)+'">'+categoryChip(name)+'<span>'+yen(cents)+'</span></button>').join('')+'</div>'+
    (unclassified.length?'<p>'+unclassified.length+' 笔待分类，可点交易详情补全。</p>':'')+
    suggestions.map(([row,category])=>'<p>'+esc(row.name)+' · 建议分类「'+esc(category)+'」 '+link('去确认','edit:'+row.id)+'</p>').join('')+'</div>'+txRows(top)+'</section>';
}
function annualView(summary) {
  const months=Array.from({length:12},(_,index)=>{
    const key=reportYear+'-'+String(index+1).padStart(2,'0');
    const rollup=report(data().rows,key+'-01',monthEnd(key));
    return {key,rollup,recorded:rollup.period.some(isSpending)};
  });
  const recorded=months.filter(item=>item.recorded);
  const max=Math.max(1,...recorded.map(item=>Math.abs(item.rollup.net)));
  const highest=recorded.reduce((best,item)=>!best||item.rollup.net>best.rollup.net?item:best,null);
  return reportTabs()+hero(summary,reportYear+' 年已录净消费')+
    '<section class="panel stack">'+section('逐月比较','按自然月统计，点月份打开对应月报。','<div class="date-pill"><button type="button" data-action="year:-1" aria-label="上一年">'+icon('left')+'</button><input class="report-year" id="report-year" type="number" min="2000" max="2099" value="'+reportYear+'" aria-label="报表年份"><button type="button" data-action="year:1" aria-label="下一年">'+icon('right')+'</button></div>')+
    (recorded.length?'<div class="annual-summary"><span>有消费或退款记录 <b>'+recorded.length+' 个月</b></span><span>净支出最高 <b>'+Number(highest.key.slice(5))+' 月 · '+yen(highest.rollup.net)+'</b></span></div>':'')+
    '<div class="annual-months">'+months.map(({key,rollup,recorded},i)=>{
      const previous=months[i-1];
      const difference=recorded&&previous?.recorded?rollup.net-previous.rollup.net:null;
      const biggest=rollup.byCategory.find(([,cents])=>cents>0);
      const compare=difference===null?'':difference===0?'较上月持平':'较上月 '+(difference>0?'+':'−')+yen(Math.abs(difference));
      return '<button type="button" class="annual-row" data-action="report-month:'+key+'"><span class="annual-month">'+(i+1)+' 月</span><span class="annual-chart">'+
        (recorded?'<span class="bar-track"><span class="bar-fill" style="--pct:'+Math.abs(rollup.net)/max*100+'%;--bar:'+(rollup.net<0?'#6484ad':'#39785f')+'"></span></span>':'')+
        '<small>'+[biggest?'主要分类 · '+esc(biggest[0]):'',compare].filter(Boolean).join('　')+'</small></span><strong>'+(recorded?yen(rollup.net):'无记录')+'</strong>'+icon('right')+'</button>';
    }).join('')+'</div><p class="sub">净消费 = 已确认消费 − 退款。仅当相邻两个月都有消费或退款记录时显示差额。</p></section>'+
    '<div class="stack">'+categoryPanel(summary)+'</div>';
}
function weeklyView(summary) {
  const [from,to]=dates();
  const current=reportWeek===weekStart(today());
  const endLabel=from.slice(0,4)===to.slice(0,4)?to.slice(5):to;
  const pending=reviewRows().filter(row=>row.date>=from&&row.date<=to).length;
  return reportTabs()+'<div class="week-picker" role="group" aria-label="选择统计周">'+
    button('上一周','week:-1','small','left')+
    '<span class="week-period" aria-live="polite">'+from+' 至 '+endLabel+'</span>'+
    '<button type="button" class="btn small" data-action="week:1"'+(current?' disabled':'')+'>下一周'+icon('right')+'</button>'+
    '</div>'+hero(summary,'当周已录净消费',undefined,pending)+
    '<div class="stack">'+categoryPanel(summary)+'</div>';
}
function reportView(summary) {
  if(reportMode==='week')return weeklyView(summary);
  if(reportMode==='year')return annualView(summary);
  const [from,to]=dates();
  const seen=[...new Set(summary.period.flatMap(r=>[r.source,...data().rows.filter(x=>x.mergedInto===r.id).map(x=>x.source)]))];
  const first=summary.byCategory.find(([,n])=>n>0);
  const budget=data().budgets[month];
  const actualDays=summary.period.map(r=>r.date).sort();
  const advice=first?'<div class="advice"><b>'+esc(first[0])+'是当前最大净支出分类，'+yen(first[1])+'。</b> '+link('看分类明细','report-cat:'+first[0])+'<br>从金额最大的几笔开始，区分日常支出和一次性支出，再决定下月额度。</div>':'';
  const event=summary.byTag.find(([,n])=>n>0);
  return reportTabs()+hero(summary,range?'区间已录净消费':'本月已录净消费',range?undefined:budget)+
    '<section class="panel stack">'+section('统计范围','月报仅反映已确认流水。')+'<form class="report-date" id="date-form"><label class="field">开始<input type="date" name="from" value="'+from+'" required></label><label class="field">结束<input type="date" name="to" value="'+to+'" required></label><div class="actions" style="align-self:end"><button class="btn small" type="submit">应用区间</button>'+(range?button('恢复自然月','reset-range','small'):'')+'</div></form><div class="cover">'+seen.map(x=>badge(x)).join('')+badge(actualDays.length?actualDays.at(0)+' 至 '+actualDays.at(-1):'暂无已确认流水')+'</div></section>'+
    '<div class="grid equal">'+categoryPanel(summary)+largeExpenses(summary)+'</div>'+
    '<div class="grid equal"><section class="panel">'+section('事件与其他流向','阶段性消费单独查看')+(summary.byTag.map(([tag,n])=>'<div class="tx"><div class="tx-info"><b>'+esc(tag)+'</b></div><strong class="money">'+yen(n)+'</strong></div>').join('')||blank('给交易加上事件标签后，这里会显示汇总。'))+
    '<p class="sub">收入 '+yen(summary.income)+' · 划转 '+yen(summary.transfers)+(summary.crossMonth?' · 跨月退款 '+yen(summary.crossMonth):'')+'</p></section>'+
    '<section class="panel">'+section('预算和复盘','预算由你设置，按自然月比较')+
    (!range?'<form class="budget" id="budget-form"><label class="field">本月消费预算（元）<input type="number" name="budget" min="0" max="99999999" step=".01" value="'+asYuan(budget)+'" placeholder="例如 2500" required></label><button class="btn small primary">保存</button></form>'+(budget==null?'':'<p class="sub">'+budgetStatus(budget-summary.net)+'</p>'):'')+
    (advice||blank('有已确认的消费后，这里会给出复盘建议。'))+(event?'<div class="advice">'+esc(event[0])+'相关支出 '+yen(event[1])+'。如果属于一次性安排，可在制定常规月预算时单独考虑。</div>':'')+'</section></div>';
}
const assetStyles={cash:['wallet','余额'],restricted:['lock','余额'],physical:['box','估值'],debt:['card','待还金额']};
const depositable=group=>group==='cash'||group==='restricted';
const getAsset=assetId=>data().assets.find(row=>row.id===assetId);
const depositTotal=(asset,period)=> (asset.deposits??[]).reduce((sum,row)=>sum+(row.date.startsWith(period+'-')?row.cents:0),0);
const monthLabel=period=>period.slice(0,4)+' 年 '+Number(period.slice(5))+' 月';
function depositRecords(records) {
  const matching=records.filter(({asset,entry})=>
    [asset.name,entry.date,entry.note,entry.cents/100,yen(entry.cents)].some(value=>String(value??'').toLowerCase().includes(depositQuery.toLowerCase())));
  return '<section class="panel stack" id="deposit-records">'+section('存入记录',monthLabel(month)+' · '+records.length+' 笔已确认')+
    (records.length||depositQuery?'<form class="deposit-search" id="deposit-search"><input name="query" type="search" aria-label="查询存入记录" placeholder="按账户、备注、日期或金额查找" maxlength="160" value="'+esc(depositQuery)+'"><button class="btn small">查询</button>'+(depositQuery?button('清除','deposit-search-clear','small ghost'):'')+'</form>':'')+
    (matching.map(({asset,entry})=>'<button type="button" class="asset-item" data-action="deposit-detail:'+asset.id+':'+entry.id+'"><span class="square">'+icon('wallet')+'</span><span class="tx-info"><b>'+esc(asset.name)+'</b><small>'+esc(entry.date)+(entry.note?' · '+esc(entry.note):'')+'</small></span><span class="money positive">+'+yen(entry.cents)+'</span>'+icon('right')+'</button>').join('')||
      blank(depositQuery?'没有匹配的存入记录。':'本月还没有已确认的存入。'))+'</section>';
}
function showDepositRecords() {
  $('#deposit-records')?.scrollIntoView({block:'nearest'});
}
function assetsView() {
  const a=totals();
  const assets=data().assets;
  const records=assets.filter(row=>depositable(row.group)).flatMap(asset=>(asset.deposits??[]).filter(entry=>entry.date.startsWith(month+'-')).map(entry=>({asset,entry})))
    .sort((a,b)=>b.entry.date.localeCompare(a.entry.date)||(b.entry.confirmedAt??'').localeCompare(a.entry.confirmedAt??''));
  const deposited=records.reduce((sum,{entry})=>sum+entry.cents,0);
  const monthPicker='<div class="date-pill"><button type="button" data-action="month:-1" aria-label="上个月">'+icon('left')+'</button><input id="month" aria-label="存入统计月份" type="month" value="'+month+'"><button type="button" data-action="month:1" aria-label="下个月">'+icon('right')+'</button></div>';
  const hero='<section class="hero"><div class="hero-top"><span class="hero-label">估算净资产</span>'+badge(mode==='demo'?'示例账本':'按已录资产与负债估算')+'</div><div class="hero-amount">'+yen(netAssets(a))+'</div><div class="hero-foot"><span>可动用资金<strong>'+yen(a.cash)+'</strong></span><span>待还负债<strong>'+yen(a.debt)+'</strong></span></div></section>';
  const deposits='<section class="panel stack"><div class="asset-month"><div><h2>月度存入</h2><p class="sub">'+monthLabel(month)+' · '+(mode==='demo'?'示例记录':'已确认存入')+'</p><strong>'+yen(deposited)+'</strong></div>'+monthPicker+'</div>'+
    '<div class="actions deposit-quick">'+button('记一笔存入','deposit-new','primary small','plus')+
    (!assetGroup?link('查看存入记录','deposit-records'):'')+(mode==='demo'?link('打开个人账本','asset-personal'):'')+'</div></section>';
  if(assetGroup) {
    const [glyph,amountLabel]=assetStyles[assetGroup];
    const items=assets.filter(row=>row.group===assetGroup);
    return hero+deposits+'<section class="panel stack">'+button('全部分类','asset-back','ghost small','left')+
      '<div class="stack">'+section(groups[assetGroup],amountLabel+'合计 '+yen(a[assetGroup])+' · '+items.length+' 项',button('添加分类','asset-new:'+assetGroup,'small primary','plus'))+'</div>'+
      (items.map(row=>'<button class="asset-item" data-action="asset-detail:'+row.id+'"><span class="square">'+icon(glyph)+'</span><span class="tx-info"><b>'+esc(row.name)+'</b><small>'+(depositable(row.group)?'本期存入 '+yen(depositTotal(row,month)):'更新 '+esc(row.date))+'</small></span><span class="money">'+(row.cents==null?'未估值':yen(row.cents))+'</span>'+icon('right')+'</button>').join('')||blank('该分类还没有记录。'))+'</section>';
  }
  return hero+deposits+'<section class="panel stack">'+section('资产与负债','点开分类可查看具体账户或物品。',button('添加资产','asset-new','small primary','plus'))+
    '<div class="asset-cards">'+Object.entries(groups).map(([key,label])=>{
      const [glyph,amountLabel]=assetStyles[key];
      const items=assets.filter(row=>row.group===key);
      const sub=depositable(key)?'本期存入 '+yen(items.reduce((sum,row)=>sum+depositTotal(row,month),0)):'';
      return '<button class="asset-card asset-'+key+'" data-action="asset-group:'+key+'"><span class="asset-card-top"><span class="square">'+icon(glyph)+'</span>'+icon('right')+'</span><span class="asset-card-name">'+label+'</span><strong>'+yen(a[key])+'</strong><small>'+amountLabel+'合计 · '+items.length+' 项</small>'+(sub?'<span class="asset-chip">'+sub+'</span>':'')+'</button>';
    }).join('')+'</div></section>'+depositRecords(records);
}
function render() {
  $('#rail').innerHTML=brand+'<nav class="side-nav" aria-label="主导航">'+navButtons()+'</nav><div class="rail-foot">'+icon('shield')+' 截图在本机识别<br>'+link('账本与备份','settings')+'</div>';
  $('#mobile-nav').innerHTML=navButtons();
  const summary=getReport();
  $('#app').innerHTML='<div class="shell">'+top()+({home:homeView,list:listView,report:reportView,assets:assetsView}[page])(summary)+'</div>';
}
function field(label,name,value='',type='text',extras='',wide=false,errorId='') {
  const input='<label class="field'+(wide&&!errorId?' wide':'')+'">'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extras+(errorId?' aria-describedby="'+errorId+'"':'')+'></label>';
  return errorId?'<div'+(wide?' class="wide"':'')+'>'+input+'<span class="field-error" id="'+errorId+'" aria-live="polite"></span></div>':input;
}
const choice=(label,name,values,selected,wide=false)=>'<label class="field'+(wide?' wide':'')+'">'+esc(label)+'<select name="'+name+'">'+values.map(([value,text])=>'<option value="'+esc(value)+'" '+(value===selected?'selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label>';
const options=items=>items.map(x=>[x,x]);
const asYuan=cents=>cents==null?'':cents/100;
const categoryNames=()=>[...categories,...(data().customCategories??[])];
const categoryKey=name=>name.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
function categoryField(selected) {
  const names=[...new Set([...categoryNames(),selected])];
  return '<div class="row-category"><div id="existing-category">'+choice('分类','category',options(names),selected)+
    link('＋ 新增分类','category-new')+'</div><div id="new-category" hidden>'+
    field('新分类名称','newCategory','','text','maxlength="24" placeholder="如运动、订阅" required disabled')+
    link('使用已有分类','category-existing')+'</div></div>';
}
function toggleCategory(adding) {
  const form=$('#row-form');
  if(!form) return;
  $('#existing-category').hidden=adding;
  $('#new-category').hidden=!adding;
  form.elements.newCategory.disabled=!adding;
  const focus=adding?form.elements.newCategory:form.elements.category;
  focus.focus();
}
function modal(title,content) {
  dialog.innerHTML='<div class="dialog-head"><h2>'+esc(title)+'</h2><button type="button" class="icon-btn" data-action="close" aria-label="关闭">'+icon('close')+'</button></div>'+content;
  if(!dialog.open)dialog.showModal();
}
function editRow(row) {
  const isNew=!row;
  const r=row??{id:id(),name:'',date:month===monthNow?today():month+'-01',category:'待分类',source:'手动',kind:'expense',tag:'',order:''};
  const same=isNew?[]:overlaps(r);
  const originals=data().rows.filter(x=>x.id!==r.id&&x.kind==='expense'&&x.status==='confirmed'&&!x.mergedInto)
    .sort((a,b)=>b.date.localeCompare(a.date));
  modal(isNew?'手动补录':r.status==='pending'?'核对交易':'编辑交易',
    '<form id="row-form" data-id="'+r.id+'"><div class="fields">'+
    field('商户或说明','name',r.name,'text','required maxlength="120"',true)+
    field('交易日期','date',r.date,'date','required')+field('金额（元）','amount',asYuan(r.cents),'number','required min=".01" max="99999999" step=".01"')+
    (r.source==='信用卡'?field('交易时间（可选）','time',r.time,'text','placeholder="HH:MM:SS" maxlength="8"'):'')+
    choice('交易类型','kind',Object.entries(types),r.kind)+categoryField(suggestedCategory(r))+
    choice('截图来源','source',options(sources),r.source)+field('付款账户（可选）','account',r.account,'text','maxlength="60"')+
    field('事件标签（可选）','tag',r.tag,'text','maxlength="40" placeholder="如搬家"')+field('订单号（可选）','order',r.order,'text','maxlength="100"')+
    '<div class="wide" id="refund-field" '+(r.kind==='refund'?'':'hidden')+'>'+choice('关联原消费','refundOf',[['','暂不关联'],...originals.map(x=>[x.id,x.date+' · '+x.name+' · '+yen(x.cents)])],r.refundOf??'',true)+'</div>'+
    '<label class="check wide"><input type="checkbox" name="remember"> 记住该商户的分类</label></div>'+
    (r.hint?'<details><summary>查看识别片段</summary><pre>'+esc(r.hint)+'</pre></details>':'')+
    (same.length?'<div class="compare"><strong>发现相同金额的候选</strong><p>选中同一笔进行合并，或确认它们是不同交易。</p>'+same.map(x=>'<div class="tx"><div class="tx-info"><b>'+esc(x.name||'商户待确认')+'</b><small>'+esc([x.date,x.source,x.status==='confirmed'?'已入账':'待核对'].join(' · '))+'</small></div><strong class="money">'+yen(x.cents)+'</strong>'+button(x.status==='confirmed'?'并入这笔':'将候选并入当前', (x.status==='confirmed'?'merge:':'keep-current:')+r.id+':'+x.id,'small')+'</div>').join('')+'</div>':'')+
    '<div id="form-note" class="sub" aria-live="polite"></div><div class="actions form-actions">'+(!isNew&&r.status==='confirmed'?button('删除','remove:'+r.id,'ghost danger'):'')+
    (same.length?'<button class="btn" name="decision" value="distinct">分别保留</button>':'')+
    '<button class="btn primary" name="decision" value="save">'+(same.length?'保存修改':isNew?'记入账本':r.status==='pending'?'确认入账':'保存')+'</button></div></form>');
}
function assetDetail(asset,success='') {
  const [,amountLabel]=assetStyles[asset.group];
  const entries=[['所属分类',groups[asset.group]],[amountLabel,asset.cents==null?'未估值':yen(asset.cents)],['更新日期',asset.date]];
  if(asset.withdraw!=null)entries.push(['预计本期可提取',yen(asset.withdraw)]);
  if(asset.original!=null)entries.push(['购入原价',yen(asset.original)]);
  if(asset.purchased)entries.push(['购入日期',asset.purchased]);
  if(asset.note)entries.push(['备注',asset.note]);
  const deposits=(asset.deposits??[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const periods=[...new Set(deposits.map(row=>row.date.slice(0,7)))];
  const history=periods.map(period=>'<div class="asset-history"><div class="asset-history-head"><strong>'+monthLabel(period)+'</strong><span class="money">'+yen(depositTotal(asset,period))+'</span></div>'+
    deposits.filter(row=>row.date.startsWith(period+'-')).map(row=>'<div class="tx"><span class="tx-info"><b>'+esc(row.date)+'</b>'+(row.note?'<small>'+esc(row.note)+'</small>':'')+'</span><span class="money positive">+'+yen(row.cents)+'</span>'+button('编辑','deposit-edit:'+asset.id+':'+row.id,'small')+'</div>').join('')+'</div>').join('');
  modal(asset.name,(success?'<p class="notice asset-success" role="status">'+icon('check')+esc(success)+'</p>':'')+'<dl class="asset-details">'+entries.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>'+
    '<div class="actions form-actions">'+button('编辑资产','asset-edit:'+asset.id,'small')+'</div>'+
    (depositable(asset.group)?'<section class="stack">'+section('存入历史',monthLabel(month)+'已存入 '+yen(depositTotal(asset,month)),button('记一笔存入','deposit-new:'+asset.id,'small primary','plus'))+
      '<p class="sub">存入记录和余额分开维护。余额变化时，可在「编辑资产」中更新。</p>'+(history||blank('还没有存入记录。'))+'</section>':''));
}
function editDeposit(asset,entry) {
  depositDraft=null;
  const accounts=data().assets.filter(row=>depositable(row.group));
  if(!accounts.length){
    modal('记一笔存入','<p class="notice">先添加一个储蓄或公积金等账户，再记录存入。</p>'+button('添加资产','asset-new','primary','plus'));
    return;
  }
  const r=entry??{id:id(),date:month===monthNow?today():month+'-01'};
  const existing=Boolean(asset?.deposits?.some(row=>row.id===r.id));
  modal(existing?'编辑存入':'记一笔存入','<p class="notice">第 1 步，共 2 步 · 填写存入信息'+(mode==='demo'?' · 示例账本':'')+'</p>'+
    '<form id="deposit-form" data-id="'+r.id+'"><div class="fields">'+
    (asset?'<input type="hidden" name="asset" value="'+asset.id+'"><p class="wide sub">'+esc(asset.name)+' · '+esc(groups[asset.group])+'</p>':
      choice('存入账户','asset',accounts.map(row=>[row.id,row.name+' · '+groups[row.group]]),accounts[0].id,true))+
    field('存入日期','date',r.date,'date','required')+field('存入金额（元）','amount',asYuan(r.cents),'number','required min=".01" max="99999999" step=".01"')+
    field('备注（可选）','note',r.note,'text','maxlength="160" placeholder="如工资转存、公积金缴存"',true)+'</div>'+
    '<div id="form-note" class="sub" aria-live="polite"></div><div class="actions form-actions">'+
    (existing?button('删除存入','deposit-remove:'+asset.id+':'+r.id,'ghost danger'):'')+'<button class="btn primary">下一步：核对</button></div></form>');
}
function depositDetails(asset,entry) {
  const entries=[['存入账户',asset.name],['存入日期',entry.date],['存入金额',yen(entry.cents)],['备注',entry.note||'未填写']];
  return '<dl class="asset-details">'+entries.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>';
}
function reviewDeposit(asset,entry) {
  modal('核对存入','<p class="notice">第 2 步，共 2 步 · 确认后计入 '+monthLabel(entry.date.slice(0,7))+' 的存入记录。</p>'+
    depositDetails(asset,entry)+'<p class="sub stack">存入记录单独汇总，账户余额在「编辑资产」里维护。</p>'+
    '<div id="form-note" class="sub" aria-live="polite"></div><div class="actions form-actions">'+button('返回修改','deposit-review-back')+
    button('确认计入','deposit-confirm','primary','check')+'</div>');
}
function confirmDeposit() {
  if(!depositDraft)return;
  const {assetId,entry}=depositDraft;
  const asset=getAsset(assetId);
  if(!asset||!depositable(asset.group))return;
  const previous=asset.deposits;
  asset.deposits=[...(previous??[]).filter(row=>row.id!==entry.id),{...entry,confirmedAt:new Date().toISOString()}];
  if(mode==='real'&&!persist()){
    asset.deposits=previous;
    $('#form-note').textContent='存入尚未保存，请检查浏览器存储后再试。';
    return;
  }
  depositDraft=null;
  month=entry.date.slice(0,7);
  depositQuery='';
  assetGroup='';
  dialog.close();
  render();
  showDepositRecords();
  toast(mode==='demo'?'已计入示例账本。':'已确认并保存，可在「存入记录」查询。');
}
function editAsset(row,group) {
  const r=row??{id:id(),name:'',group:group??'cash',date:today()};
  const creatingCategory=!row&&Boolean(group);
  const assetField=(label,name,value,type,extras,wide)=>field(label,name,value,type,extras,wide,'asset-error-'+name);
  modal(row?'编辑资产或负债':creatingCategory?'添加分类':'添加资产或负债','<form id="asset-form" data-id="'+r.id+'" data-category="'+creatingCategory+'" novalidate><div class="fields">'+
    assetField('名称','name',r.name,'text','required maxlength="80" placeholder="如银行卡、公积金、手机"',true)+
    choice('分组','group',Object.entries(groups),r.group)+assetField('更新日期','date',r.date,'date','required')+
    assetField('余额、估值或待还本金（元）','amount',asYuan(r.cents),'number','min="0" max="99999999" step=".01"',true)+
    '<div class="wide" id="asset-extra">'+
    '<div id="withdraw-field" '+(r.group==='restricted'?'':'hidden')+'>'+assetField('预计本期可提取（元）','withdraw',asYuan(r.withdraw),'number','min="0" max="99999999" step=".01"')+'</div>'+
    '<div id="original-field" '+(r.group==='physical'?'':'hidden')+'>'+assetField('购入原价（元）','original',asYuan(r.original),'number','min="0" max="99999999" step=".01"')+assetField('购入日期（可选）','purchased',r.purchased,'date')+'</div></div>'+
    assetField('备注（可选）','note',r.note,'text','maxlength="160" placeholder="如型号、颜色或存款用途"',true)+'</div>'+
    '<p class="sub">实物可先留空估值。待还本金按账户录入，同一笔分期归入一个负债账户。</p><div id="form-note" class="sub" aria-live="polite"></div><div class="actions form-actions">'+(row?button('删除','asset-remove:'+r.id,'ghost danger'):'')+'<button class="btn primary">'+(creatingCategory?'创建分类':'保存记录')+'</button></div></form>');
}
function uploadDialog() {
  modal('批量导入截图','<div class="notice">截图在当前浏览器识别。导入后先核对金额、日期和疑似重复，再确认入账。</div>'+
    '<form id="upload-form">'+choice('账单来源','source',options(sources.slice(0,4)),'微信支付',true)+
    '<p class="sub">每批最多 12 张，建议使用 PNG、JPEG 或 WebP 截图。不同平台可分批上传，照样交叉查重。</p>'+
    '<div class="file-box stack"><input name="screens" type="file" accept="image/*" multiple required aria-label="选择账单截图"></div>'+
    '<p id="ocr-status" class="sub" aria-live="polite"></p><progress id="ocr-progress" max="1" value="0" hidden></progress>'+
    '<div class="actions form-actions"><button class="btn primary" id="start-ocr">'+icon('scan')+'开始识别</button></div></form>');
}
function settings() {
  modal('账本与备份','<p class="notice">个人账本保存在当前浏览器。换设备或清除站点数据前，可以导出 JSON 留存。完整账本暂不支持直接导回。截图原图不会保存到账本。</p>'+
    '<div class="actions">'+button('导入已核对账单','checked-bill','primary')+button('导出个人账本','export')+button(mode==='demo'?'打开个人账本':'查看示例账本',mode==='demo'?'mode:real':'mode:demo','ghost')+'</div>'+
    '<details><summary>清空本机个人账本</summary><p>会清除该浏览器内的交易、资产和预算。</p>'+button('确认清空','clear','danger')+'</details>');
}
function checkedBillDialog() {
  billDraft=null;
  modal('导入已核对账单','<p class="notice">选择已核对的账单 JSON 文件。交易保存在当前浏览器的个人账本。</p>'+
    '<form id="checked-bill-form"><div class="file-box"><input type="file" name="bill" accept=".json,application/json" required aria-label="选择账单文件"></div>'+
    '<p class="sub" id="bill-note" role="status"></p><div class="actions form-actions"><button class="btn primary">检查账单</button></div></form>');
}
async function previewCheckedBill(form) {
  const file=form.elements.bill.files[0];
  if(!file||file.size>5*1024*1024){$('#bill-note').textContent='请选择 5 MB 以内的账单文件。';return;}
  try {
    const rows=readCheckedBill(await file.text());
    if(!form.isConnected) return;
    billDraft=rows;
    const {additions,skipped,pending}=planBillImport(rows,real.rows);
    const days=rows.map(row=>row.date).sort();
    const net=report(rows,days[0],days.at(-1)).net;
    modal('确认导入账单','<p class="notice">'+esc(days[0]+' 至 '+days.at(-1))+' · '+rows.length+' 笔 · 净消费 '+yen(net)+'</p>'+
      '<p class="sub">将入账 '+(additions.length-pending)+' 笔，待核对 '+pending+' 笔，跳过 '+skipped+' 笔已存在的记录。</p>'+
      '<div class="actions form-actions">'+button('返回','checked-bill')+button(additions.length?'确认导入':'打开个人账本','checked-bill-confirm','primary')+'</div>');
  } catch(error) {
    if(form.isConnected) $('#bill-note').textContent=error instanceof SyntaxError?'文件格式无法读取，请选择有效的账单 JSON。':error.message;
  }
}
function confirmCheckedBill() {
  if(!billDraft) return;
  const {additions,pending}=planBillImport(billDraft,real.rows);
  const previous=real, previousMode=mode;
  real={...real,rows:[...real.rows,...additions]};
  mode='real';
  if(!persist()){real=previous;mode=previousMode;return;}
  month=billDraft.map(row=>row.date).sort().at(-1).slice(0,7);
  reportYear=month.slice(0,4);
  billDraft=null;
  range=null;
  dialog.close();
  setPage('home');
  toast(additions.length?'已入账 '+(additions.length-pending)+' 笔'+(pending?'，另有 '+pending+' 笔待核对。':'。'):'账单交易已存在。');
}
const getRow=value=>data().rows.find(x=>x.id===value);
function amountOf(form,name) {
  const raw=form.get(name);
  if(raw==null||raw==='')return null;
  const val=Math.round(Number(raw)*100);
  return Number.isSafeInteger(val)&&val>=0&&val<=9999999900?val:null;
}
function assetFieldError(input,message='') {
  const error=document.getElementById(input.getAttribute('aria-describedby'));
  if(!error) return;
  error.textContent=message;
  if(message) input.setAttribute('aria-invalid','true');
  else input.removeAttribute('aria-invalid');
}
function saveAsset(form) {
  const values=new FormData(form), group=values.get('group'), name=values.get('name').trim(), date=values.get('date');
  const cents=amountOf(values,'amount'), note=form.querySelector('#form-note');
  note.textContent='';
  const messages={
    name:!name?'请填写名称。':'',
    date:!validDate(date)?'请填写有效的更新日期。':'',
    amount:!values.get('amount')&&group!=='physical'?'请填写'+assetStyles[group][1]+'。':'',
    purchased:values.get('purchased')&&!validDate(values.get('purchased'))?'请填写有效的购入日期。':''
  };
  let firstInvalid;
  for(const input of form.querySelectorAll('input[aria-describedby]')) {
    const message=input.closest('[hidden]')?'':messages[input.name]||
      (!input.validity.valid?(input.type==='number'?'请输入 0 至 99,999,999 元，最多两位小数。':input.validationMessage):'');
    assetFieldError(input,message);
    if(message&&!firstInvalid) firstInvalid=input;
  }
  if(firstInvalid){firstInvalid.focus();return;}

  const book=data(), previous=book.assets;
  const prior=previous.find(row=>row.id===form.dataset.id);
  if(prior?.deposits?.length&&!depositable(group)){note.textContent='有存入历史的资产仅可归入现金、存款或受限与定期资产。';return;}
  const asset={id:form.dataset.id,name,date,group,cents,note:values.get('note').trim(),deposits:prior?.deposits??[]};
  if(group==='restricted')asset.withdraw=amountOf(values,'withdraw');
  if(group==='physical'){
    asset.original=amountOf(values,'original');
    asset.purchased=values.get('purchased');
  }
  book.assets=prior?previous.map(row=>row.id===asset.id?asset:row):[...previous,asset];
  if(!persist()){
    book.assets=previous;
    note.textContent='保存失败，请检查浏览器存储设置后重试。';
    return;
  }
  if(assetGroup)assetGroup=group;
  render();
  assetDetail(asset,prior?'已保存资产记录。':form.dataset.category==='true'?'创建分类成功':'已添加资产。');
}
function updateRow(form,decision) {
  const values=new FormData(form), row=getRow(form.dataset.id);
  const read=name=>String(values.get(name)??'').trim();
  const note=message=>$('#form-note').textContent=message;
  const addingCategory=values.has('newCategory');
  const input=read('newCategory').replace(/\s+/gu,' ');
  if(addingCategory&&(!input||input.length>24))return note('请输入 1 到 24 个字符的分类名称。');
  const existingCategory=addingCategory?categoryNames().find(name=>categoryKey(name)===categoryKey(input)):undefined;
  const draft={...row,id:form.dataset.id,name:read('name'),date:read('date'),time:read('time'),cents:amountOf(values,'amount'),kind:read('kind'),
    category:addingCategory?(existingCategory??input):read('category'),source:read('source'),account:read('account'),tag:read('tag'),order:read('order'),
    refundOf:read('kind')==='refund'?read('refundOf'):'',check:false};
  if(!draft.name||!draft.cents||!validDate(draft.date))return note('请填写有效的商户、交易日期和金额。');
  if(draft.time&&!validTime(draft.time))return note('请输入有效的交易时间，例如 09:30:00。');
  const same=matches(draft,data().rows);
  if(decision==='distinct'){
    draft.distinct=[...new Set([...(row?.distinct??[]),...same.map(x=>x.id)])];
  }
  draft.status=same.length&&decision!=='distinct'?(row?.status??'pending'):'confirmed';
  if(draft.status==='confirmed')delete draft.hint;
  const book=data(), previous={rows:book.rows,rules:book.rules,customCategories:book.customCategories};
  if(addingCategory&&!existingCategory)book.customCategories=[...(book.customCategories??[]),draft.category];
  if(values.has('remember')&&draft.category!=='待分类')book.rules={...book.rules,[normalize(draft.name)]:draft.category};
  book.rows=row?book.rows.map(item=>item.id===row.id?draft:item):[...book.rows,draft];
  if(!persist()) {
    Object.assign(book,previous);
    return note('保存失败，请检查浏览器存储设置后重试。');
  }
  dialog.close();
  if(draft.status==='pending'){
    setPage('list','pending');
    toast('已保存为待核对，请处理疑似重复。');
  } else {
    render();
    toast('已确认交易，月报已更新。');
  }
}
function requestTransactionDeletion(row) {
  if(data().rows.some(item=>item.mergedInto===row.id)) {
    const note=$('#row-form #form-note');
    if(note)note.textContent='请先到「已合并」撤销关联的合并记录。';
    else toast('请先到「已合并」撤销关联的合并记录。');
    return;
  }
  deleteDialog.innerHTML='<div class="dialog-head"><h2 id="delete-transaction-title">删除交易</h2></div>'+
    '<p class="notice warn">'+esc(row.name||'商户待确认')+' · '+esc(dateLabel(row))+' · '+yen(row.cents)+'</p>'+
    '<p class="sub">删除后将从流水和报表移除。</p><p id="delete-transaction-note" class="sub" role="status"></p>'+
    '<div class="actions form-actions"><button type="button" class="btn" data-action="cancel-remove" autofocus>取消</button>'+
    button('确认删除','confirm-remove:'+row.id,'danger solid')+'</div>';
  deleteDialog.showModal();
}
function deleteTransaction(row) {
  const book=data();
  if(book.rows.some(item=>item.mergedInto===row.id)) {
    $('#delete-transaction-note').textContent='请先到「已合并」撤销关联的合并记录。';
    return;
  }
  const previous=book.rows;
  book.rows=previous.filter(item=>item.id!==row.id);
  if(!persist()) {
    book.rows=previous;
    $('#delete-transaction-note').textContent='删除失败，请检查浏览器存储设置后重试。';
    return;
  }
  deleteDialog.close();
  if(dialog.open)dialog.close();
  render();
  toast('已删除交易。');
}
function merge(from,to) {
  const row=getRow(from), target=getRow(to);
  if(!row||!target||row.mergedInto||target.mergedInto||!overlaps(row).some(x=>x.id===target.id))return;
  row.mergedInto=to;
  row.status='pending';
  delete row.hint;
  dialog.close();
  changed('已合并，报表只统计保留的一笔。');
}
function switchMode(next) {
  mode=next;
  depositQuery='';depositDraft=null;
  range=null;
  dialog.close();
  persist();
  setPage('home');
}
const ocrPath=name=>new URL('./ocr/'+name,import.meta.url).href;
let engineScript;
function withTimeout(task, milliseconds, message) {
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);});
  return Promise.race([task,timeout]).finally(()=>clearTimeout(timer));
}
function loadEngine() {
  if(window.Tesseract?.createWorker)return Promise.resolve();
  engineScript??=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const fail=()=>{
      clearTimeout(timer);
      script.remove();
      engineScript=null;
      reject(new Error('识别组件下载失败，请检查网络后重试。'));
    };
    const timer=setTimeout(fail,30000);
    script.src=ocrPath('tesseract.min.js');
    script.onload=()=>{
      if(!window.Tesseract?.createWorker){fail();return;}
      clearTimeout(timer);
      resolve();
    };
    script.onerror=fail;
    document.head.append(script);
  });
  return engineScript;
}
async function createOcrWorker(languages,logger=()=>{}) {
  if(typeof Worker!=='function'||typeof WebAssembly!=='object') {
    throw new Error('当前浏览器无法运行截图识别，请用系统浏览器打开此网址。');
  }
  await loadEngine();
  let rejectStartup;
  const startupError=new Promise((_,reject)=>{rejectStartup=reject;});
  const opening=window.Tesseract.createWorker(languages,1,{
    workerPath:ocrPath('worker.min.js'),
    corePath:ocrPath('tesseract-core-lstm.wasm.js'),
    langPath:ocrPath(''),
    workerBlobURL:false,
    cacheMethod:'none',
    logger,
    errorHandler:reason=>rejectStartup?.(new Error(String(reason)))
  });
  try {
    return await withTimeout(Promise.race([opening,startupError]),60000,'识别组件加载超时，请检查网络后重试。');
  } catch(error) {
    void opening.then(worker=>worker.terminate()).catch(()=>{});
    if(error instanceof Error && error.message.includes('加载超时'))throw error;
    throw new Error('识别组件启动失败。请检查网络，或用系统浏览器打开此网址。',{cause:error});
  } finally {
    rejectStartup=null;
  }
}
async function fingerprint(file) {
  try {
    if(!globalThis.crypto?.subtle)return '';
    const bytes=await new Response(file).arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  } catch {return '';}
}
async function prepareOcrImage(file) {
  const url=URL.createObjectURL(file);
  try {
    const image=new Image();
    await withTimeout(new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(new Error('无法读取图片，请换成 PNG 或 JPEG 截图'));
      image.src=url;
    }),15000,'读取图片超时，请重新选图');
    const width=image.naturalWidth,height=image.naturalHeight;
    if(!width||!height)throw new Error('无法读取图片尺寸，请重新选图');
    const scale=Math.min(1,4096/Math.max(width,height),Math.sqrt(6000000/(width*height)));
    if(scale===1&&['image/png','image/jpeg','image/webp'].includes(file.type))return {pixels:image,input:file};
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));
    canvas.height=Math.max(1,Math.round(height*scale));
    canvas.getContext('2d',{alpha:false}).drawImage(image,0,0,canvas.width,canvas.height);
    return {pixels:canvas,input:canvas};
  } finally {URL.revokeObjectURL(url);}
}
function creditAmountColumn(pixels) {
  const width=pixels.naturalWidth||pixels.width, height=pixels.naturalHeight||pixels.height, scale=2;
  const x=Math.round(width*.713), y=Math.round(height*.172);
  const cropWidth=Math.max(1,Math.round(width*.951)-x), cropHeight=Math.max(1,Math.round(height*.98)-y);
  const canvas=document.createElement('canvas');
  canvas.width=cropWidth*scale;canvas.height=cropHeight*scale;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(pixels,x,y,cropWidth,cropHeight,0,0,canvas.width,canvas.height);
  const pixelsData=context.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<pixelsData.data.length;i+=4) {
    const level=pixelsData.data[i]*.299+pixelsData.data[i+1]*.587+pixelsData.data[i+2]*.114;
    pixelsData.data[i]=pixelsData.data[i+1]=pixelsData.data[i+2]=level<211?0:255;
  }
  context.putImageData(pixelsData,0,0);
  return {canvas,x,y,scale,height};
}
async function importImages(form) {
  if(busy)return;
  const files=[...form.elements.screens.files];
  const status=$('#ocr-status'), progress=$('#ocr-progress');
  if(!files.length||files.length>12){status.textContent='每批请选择 1–12 张图片。';return;}
  if(files.some(file=>file.size>15*1024*1024)){status.textContent='单张图片请控制在 15 MB 以内。';return;}
  busy=true;form.elements.screens.disabled=true;form.elements.source.disabled=true;$('#start-ocr').disabled=true;progress.hidden=false;
  const source=form.elements.source.value, batch={date:today(),source,files:files.length,count:0,skipped:0,duplicates:0,issues:[]};
  const importMonth=month;
  let worker, amountWorker, fileIndex=0;
  const known=new Set(real.rows.map(creditRowKey).filter(Boolean));
  const hashes=new Set(real.rows.map(row=>row.hash).filter(Boolean));
  const unread=[];
  try {
    status.textContent='正在加载中文识别组件，首次使用可能需要片刻…';
    worker=await createOcrWorker('chi_sim+eng',message=>{
      if(message.status==='recognizing text')progress.value=(fileIndex+message.progress)/files.length;
    });
    await withTimeout(worker.setParameters({tessedit_pageseg_mode:'6'}),15000,'识别组件响应超时，请重试。');
    for(const file of files) {
      status.textContent='正在识别第 '+(fileIndex+1)+' / '+files.length+' 张…';
      try {
        const hash=await fingerprint(file);
        if(hash&&hashes.has(hash)) {
          batch.skipped++;batch.issues.push(file.name+'：同一张截图已导入');
        } else {
          const image=await prepareOcrImage(file);
          const result=await withTimeout(worker.recognize(image.input,{}, {tsv:source==='信用卡'}),60000,'识别超时，请尝试单张较小的截图');
          const text=result.data.text;
          const statement=source==='信用卡'&&creditStatement(text);
          let rows;
          if(statement) {
            if(!amountWorker) {
              amountWorker=await createOcrWorker('eng');
              await withTimeout(amountWorker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:'0123456789.-¥'}),15000,'金额识别组件响应超时');
            }
            const crop=creditAmountColumn(image.pixels);
            const amountResult=await withTimeout(amountWorker.recognize(crop.canvas,{}, {tsv:true}),60000,'金额识别超时，请尝试单张较小的截图');
            rows=parseCreditStatement(result.data.tsv,amountResult.data.tsv,statement,crop,real.rules);
          } else rows=parseOCR(text,source,importMonth,real.rules);
          if(rows.length) {
            if(hash)hashes.add(hash);
            for(const row of rows) {
              const key=creditRowKey(row);
              if(key&&known.has(key)) {batch.duplicates++;continue;}
              if(key) known.add(key);
              real.rows.push({...row,hash});batch.count++;
            }
            persist();
          } else {
            batch.skipped++;batch.issues.push(file.name+'：没有读到可用的金额');
            unread.push({name:file.name,text});
          }
        }
      } catch(error) {
        const reason=error instanceof Error&&/超时|请重新选图|无法读取图片|组件/.test(error.message)
          ?error.message:'识别失败，请换清晰截图或补录';
        batch.skipped++;
        batch.issues.push(file.name+'：'+reason);
        if(reason.includes('超时')&&!reason.includes('读取图片')) {
          const remaining=files.length-fileIndex-1;
          batch.skipped+=remaining;
          if(remaining)batch.issues.push('还有 '+remaining+' 张未处理，请分批重新导入。');
          break;
        }
      }
      fileIndex++;progress.value=fileIndex/files.length;
    }
    real.imports.push(batch);
    mode='real';range=null;persist();setPage('list','pending');
    modal('导入完成','<p class="notice">识别出 '+batch.count+' 笔候选'+(batch.duplicates?'，跳过 '+batch.duplicates+' 笔重复交易':'')+'，'+batch.skipped+' 张未入候选队列。请核对后入账。</p>'+
      batch.issues.map(x=>'<p class="sub">'+esc(x)+'</p>').join('')+
      unread.filter(x=>x.text).map(x=>'<details><summary>查看 '+esc(x.name)+' 的识别文字</summary><pre>'+esc(x.text)+'</pre></details>').join('')+
      '<div class="actions form-actions">'+button('手动补录','new')+button('查看待核对','close','primary')+'</div>');
  } catch (error) {
    console.error('OCR setup failed',error);
    status.textContent=error instanceof Error?error.message:'识别组件未加载成功，请重试，也可以先手动补录。';
  } finally {
    if(worker)await worker.terminate().catch(()=>{});
    if(amountWorker)await amountWorker.terminate().catch(()=>{});
    busy=false;
    if(form.isConnected){progress.hidden=true;form.elements.screens.disabled=false;form.elements.source.disabled=false;$('#start-ocr').disabled=false;}
  }
}
dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();else depositDraft=null;});
dialog.addEventListener('input',event=>{
  const input=event.target;
  if(input.form?.id==='asset-form'&&input.hasAttribute('aria-invalid'))assetFieldError(input);
});
document.addEventListener('change',event=>{
  const input=event.target;
  if(input.id==='report-year'){
    if(/^20\d{2}$/.test(input.value))reportYear=input.value;
    else input.value=reportYear;
    render();
  }
  if(input.id==='month'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.value)){month=input.value;reportYear=month.slice(0,4);range=null;render();}
  if(input.form?.id==='row-form'&&input.name==='kind')$('#refund-field').hidden=input.value!=='refund';
  if(input.form?.id==='asset-form'&&input.name==='group'){
    $('#withdraw-field').hidden=input.value!=='restricted';
    $('#original-field').hidden=input.value!=='physical';
    if(input.value==='physical'&&!input.form.elements.amount.value)assetFieldError(input.form.elements.amount);
  }
});
document.addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.target;
  if(form.id==='row-form')updateRow(form,event.submitter?.value??'save');
  if(form.id==='upload-form')void importImages(form);
  if(form.id==='checked-bill-form')void previewCheckedBill(form);
  if(form.id==='date-form'){
    const values=new FormData(form), from=values.get('from'), to=values.get('to');
    if(!validDate(from)||!validDate(to)||from>to){toast('结束日期应在开始日期当天或之后。');return;}
    range=[from,to];render();
  }
  if(form.id==='budget-form'){
    const amount=amountOf(new FormData(form),'budget');
    if(amount!=null){data().budgets[month]=amount;changed('已保存本月预算。');}
  }
  if(form.id==='asset-form')saveAsset(form);
  if(form.id==='deposit-search'){
    depositQuery=new FormData(form).get('query').trim();
    render();
    showDepositRecords();
  }
  if(form.id==='deposit-form'){
    const values=new FormData(form), date=values.get('date'), cents=amountOf(values,'amount');
    const asset=getAsset(values.get('asset'));
    if(!asset||!depositable(asset.group)||!validDate(date)||!cents){$('#form-note').textContent='请填写有效的存入账户、日期和金额。';return;}
    const entry={id:form.dataset.id,date,cents,note:values.get('note').trim()};
    depositDraft={assetId:asset.id,entry};
    reviewDeposit(asset,entry);
  }
});
document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action]');
  if(!el||busy)return;
  const [action,...parts]=el.dataset.action.split(':');
  const [first,second]=parts;
  const value=action==='cat'||action==='report-cat'?parts.join(':'):first;
  const row=getRow(value);
  if(action==='nav')setPage(value);
  if(action==='open-month-report'){reportMode='month';range=null;setPage('report');}
  if(action==='month'){
    month=shiftMonth(month,Number(value));
    reportYear=month.slice(0,4);
    range=null;render();
  }
  if(action==='settings')settings();
  if(action==='mode')switchMode(value);
  if(action==='upload')uploadDialog();
  if(action==='checked-bill')checkedBillDialog();
  if(action==='checked-bill-confirm')confirmCheckedBill();
  if(action==='close'){depositDraft=null;billDraft=null;dialog.close();}
  if(action==='pending')setPage('list','pending');
  if(action==='filter'){filter=value;categoryFilter='';render();}
  if(action==='cat'){range=null;setPage('list','all',value);}
  if(action==='report-cat')reportCategory(value);
  if(action==='report-mode'&&Object.hasOwn(reportLabels,value)&&reportMode!==value){
    reportMode=value;
    render();
  }
  if(action==='week'&&page==='report'&&reportMode==='week'){
    reportWeek=shiftDays(reportWeek,7*Number(value));
    render();
  }
  if(action==='year'){
    reportYear=String(Math.min(2099,Math.max(2000,Number(reportYear)+Number(value))));
    render();
  }
  if(action==='report-month'){
    month=value;
    range=null;
    reportMode='month';
    render();
    window.scrollTo(0,0);
  }
  if(action==='reset-range'){range=null;render();}
  if(action==='new')editRow();
  if(action==='edit'&&row)editRow(row);
  if(action==='category-new')toggleCategory(true);
  if(action==='category-existing')toggleCategory(false);
  if(action==='approve'&&row&&!row.check&&!overlaps(row).length){row.status='confirmed';delete row.hint;changed('已入账。');}
  if(action==='batch'){
    const batch=cleanRows();
    modal('批量确认','<p class="notice">以下 '+batch.length+' 笔目前暂无重复提示。请确认识别金额后入账。</p>'+txRows(batch,false)+
      '<div class="actions form-actions">'+button('返回','close')+button('确认全部','batch-confirm','primary')+'</div>');
  }
  if(action==='batch-confirm'){const batch=cleanRows();for(const r of batch){r.status='confirmed';delete r.hint;}dialog.close();changed('已确认 '+batch.length+' 笔交易。');}
  if(action==='merge')merge(value,second);
  if(action==='keep-current')merge(second,value);
  if(action==='undo'&&row){delete row.mergedInto;setPage('list','pending');changed('已撤销合并，请重新核对。');}
  if(action==='remove'&&row)requestTransactionDeletion(row);
  if(action==='cancel-remove')deleteDialog.close();
  if(action==='confirm-remove'&&row&&deleteDialog.open)deleteTransaction(row);
  if(action==='asset-group'&&Object.hasOwn(groups,value)){assetGroup=value;render();}
  if(action==='asset-back'){assetGroup='';render();}
  if(action==='asset-new')editAsset(null,value);
  if(action==='asset-detail'){const asset=getAsset(value);if(asset)assetDetail(asset);}
  if(action==='asset-edit'){const asset=getAsset(value);if(asset)editAsset(asset);}
  if(action==='asset-personal'){switchMode('real');setPage('assets');}
  if(action==='deposit-records')showDepositRecords();
  if(action==='deposit-search-clear'){depositQuery='';render();showDepositRecords();}
  if(action==='deposit-new')editDeposit(getAsset(value));
  if(action==='deposit-edit'||action==='deposit-detail'){
    const asset=getAsset(value);
    const entry=asset?.deposits?.find(record=>record.id===second);
    if(asset&&entry){
      if(action==='deposit-edit')editDeposit(asset,entry);
      else modal('已确认存入',depositDetails(asset,entry)+'<div class="actions form-actions">'+button('编辑存入','deposit-edit:'+asset.id+':'+entry.id)+'</div>');
    }
  }
  if(action==='deposit-review-back'&&depositDraft){
    const asset=getAsset(depositDraft.assetId);
    if(asset)editDeposit(asset,depositDraft.entry);
  }
  if(action==='deposit-confirm')confirmDeposit();
  if(action==='deposit-remove'){
    const asset=getAsset(value);
    if(asset?.deposits?.some(record=>record.id===second)&&window.confirm('删除这笔存入记录？')){
      asset.deposits=asset.deposits.filter(record=>record.id!==second);
      changed('已删除存入记录。');
      assetDetail(asset);
    }
  }
  if(action==='asset-remove'){
    const asset=getAsset(value);
    if(asset&&window.confirm(asset.deposits?.length?'删除这项资产及其存入历史？':'删除这项记录？')){
      data().assets=data().assets.filter(r=>r.id!==value);dialog.close();changed('已删除资产记录。');
    }
  }
  if(action==='export'){
    const url=URL.createObjectURL(new Blob([JSON.stringify(real,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='钱迹-个人账本-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(action==='clear'&&window.confirm('确认清空个人账本？此操作无法撤销。')){real=empty();switchMode('real');toast('个人账本已清空。');}
});
render();
