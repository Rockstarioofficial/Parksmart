// Domain model — mirrors the Java design: Vehicle (Car/Bike/Truck), ParkingSlot, Ticket, FeeCalculator.
var RATES={bike:10,car:20,truck:40};
var ICON={bike:"\uD83C\uDFCD\uFE0F",car:"\uD83D\uDE97",truck:"\uD83D\uDE9A"};
var NAME={bike:"Bike",car:"Car",truck:"Truck"};
var ZONES=[{id:"A",type:"bike",n:8},{id:"B",type:"car",n:12},{id:"C",type:"truck",n:4}];
var SLOTS=[];ZONES.forEach(function(z){for(var i=1;i<=z.n;i++)SLOTS.push({id:z.id+i,type:z.type,zone:z.id});});
var KEY="parksmart.v1";
var state={tickets:[],seq:1000};
var MIN=60000,HR=3600000;

function save(){if(SRV)return;try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}}
function load(){try{var s=localStorage.getItem(KEY);if(s){var o=JSON.parse(s);if(o&&Array.isArray(o.tickets)){state=o;return true;}}}catch(e){}return false;}
function $(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}

// FeeCalculator (overloaded in Java: calculateFee(hours) / calculateFee(hours,type))
function fee(type,ms){var h=Math.max(1,Math.ceil(ms/HR));return h*RATES[type];}
function dur(ms){ms=Math.max(0,ms);var s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s%3600/60);s=s%60;
  return (h?h+"h ":"")+String(m).padStart(2,"0")+"m "+String(s).padStart(2,"0")+"s";}
function tm(ts){return new Date(ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});}
function inr(n){return "\u20B9"+n.toLocaleString("en-IN");}
function pad(n){return "#"+n;}

function activeTickets(){return state.tickets.filter(function(t){return !t.out;});}
function ticketAt(slot){return activeTickets().find(function(t){return t.slot===slot;});}
function freeSlot(type){return SLOTS.find(function(s){return s.type===type&&!ticketAt(s.id);});}

// SlotNotAvailableException equivalent
function park(plate,type,inTs){
  if(activeTickets().some(function(t){return t.plate===plate;}))throw new Error("DuplicateVehicle: "+plate+" is already parked.");
  var s=freeSlot(type);
  if(!s)throw new Error("SlotNotAvailable: no free "+NAME[type].toLowerCase()+" slots. Try again after an exit.");
  var t={id:++state.seq,plate:plate,type:type,slot:s.id,in:inTs||Date.now(),out:null,fee:0};
  state.tickets.push(t);return t;
}
function seed(){
  state={tickets:[],seq:1000};var n=Date.now();
  [["TN30AB1234","car",95],["TN28CD4521","bike",40],["TN34KL9087","truck",210],["KA05MN3344","car",18],["TN30ZX7781","bike",160],["TN36PQ1209","car",62]]
    .forEach(function(r){park(r[0],r[1],n-r[2]*MIN);});
  [["TN10RT5566","car",130,35],["TN45HG2210","bike",75,12],["TN22BB8080","truck",260,90]].forEach(function(r){
    var out=n-r[3]*MIN,t={id:++state.seq,plate:r[0],type:r[1],slot:(r[1]==="car"?"B":r[1]==="bike"?"A":"C")+"9",in:out-r[2]*MIN,out:out,fee:0};
    t.fee=fee(t.type,t.out-t.in);state.tickets.push(t);});
  save();
}

// ---------- rendering ----------
var toastT;
function toast(msg,err){var t=$("toast");t.textContent=msg;t.className="show"+(err?" err":"");clearTimeout(toastT);toastT=setTimeout(function(){t.className="";},3200);}

function startOfDay(){var d=new Date();d.setHours(0,0,0,0);return d.getTime();}
function renderStats(){
  var act=activeTickets(),now=Date.now(),total=SLOTS.length,occ=act.length;
  var accr=act.reduce(function(a,t){return a+fee(t.type,now-t.in);},0);
  var rev=state.tickets.filter(function(t){return t.out&&t.out>=startOfDay();}).reduce(function(a,t){return a+t.fee;},0);
  var pct=Math.round(occ/total*100);
  $("stats").innerHTML=
   '<div class="stat bl"><div class="num">'+total+'</div><span>Total slots</span></div>'+
   '<div class="stat dg"><div class="num">'+occ+'</div><span>Occupied ('+pct+'%)</span></div>'+
   '<div class="stat ok"><div class="num">'+(total-occ)+'</div><span>Available</span></div>'+
   '<div class="stat"><div class="num">'+inr(rev)+'</div><span>Collected today</span></div>'+
   '<div class="stat"><div class="num">'+inr(accr)+'</div><span>Accruing on parked vehicles</span></div>';
}
function renderLot(){
  var h='<h2>Live slot map</h2>';
  ZONES.forEach(function(z){
    var zs=SLOTS.filter(function(s){return s.zone===z.id;}),used=zs.filter(function(s){return ticketAt(s.id);}).length;
    h+='<div class="zone"><div class="zonehead"><span>Zone '+z.id+' \u00B7 '+NAME[z.type]+' bays <small>'+inr(RATES[z.type])+'/hr</small></span><small>'+used+' / '+zs.length+' taken</small></div>'+
       '<div class="bar"><i style="width:'+(used/zs.length*100)+'%"></i></div><div class="bays">';
    zs.forEach(function(s){
      var t=ticketAt(s.id);
      h+='<button class="bay '+s.type+(t?' used':' free')+'" data-slot="'+s.id+'" aria-label="Slot '+s.id+(t?' occupied by '+esc(t.plate):' free')+'"><span class="id">'+s.id+'</span><span class="ico">'+ICON[s.type]+'</span><span class="pl">'+(t?esc(t.plate):'Free')+'</span></button>';
    });
    h+='</div></div>';
  });
  $("lot").innerHTML=h;
}
function renderActive(){
  var q=$("search").value.trim().toUpperCase(),now=Date.now();
  var list=activeTickets().filter(function(t){return !q||t.plate.indexOf(q)>-1||t.slot.indexOf(q)>-1;}).sort(function(a,b){return a.in-b.in;});
  $("active").innerHTML=list.length?list.map(function(t){
    return '<tr><td>'+pad(t.id)+'</td><td>'+ICON[t.type]+' <span class="plate">'+esc(t.plate)+'</span></td><td>'+t.slot+'</td><td>'+tm(t.in)+'</td><td>'+dur(now-t.in)+'</td><td class="fee">'+inr(fee(t.type,now-t.in))+'</td><td><button class="btn sm" data-exit="'+t.id+'">Check out</button></td></tr>';
  }).join(""):'<tr><td colspan="7" class="empty">'+(q?"No parked vehicle matches \u201C"+esc(q)+"\u201D.":"The lot is empty. Park a vehicle to begin.")+'</td></tr>';
}
function renderHist(){
  var list=state.tickets.filter(function(t){return t.out;}).sort(function(a,b){return b.out-a.out;}).slice(0,8);
  $("hist").innerHTML=list.length?list.map(function(t){
    return '<tr><td>'+pad(t.id)+'</td><td>'+ICON[t.type]+' <span class="plate">'+esc(t.plate)+'</span></td><td>'+t.slot+'</td><td>'+dur(t.out-t.in)+'</td><td class="fee">'+inr(t.fee)+'</td></tr>';
  }).join(""):'<tr><td colspan="5" class="empty">No exits yet.</td></tr>';
}
function renderAll(){renderStats();renderLot();renderActive();renderHist();}

// ---------- actions ----------
function openModal(html){$("sheet").innerHTML=html;$("modal").classList.add("open");var b=$("sheet").querySelector("button");if(b)b.focus();}
function closeModal(){$("modal").classList.remove("open");}
function ticketRows(t,end){
  return '<div class="row"><span>Vehicle</span><b>'+ICON[t.type]+' '+esc(t.plate)+'</b></div><div class="row"><span>Slot</span><b>'+t.slot+'</b></div>'+
    '<div class="row"><span>Entry</span><b>'+tm(t.in)+'</b></div><div class="row"><span>Duration</span><b>'+dur(end-t.in)+'</b></div>'+
    '<div class="row"><span>Rate</span><b>'+inr(RATES[t.type])+' \u00D7 '+Math.max(1,Math.ceil((end-t.in)/HR))+' hr</b></div>';
}
function askExit(id){
  var t=state.tickets.find(function(x){return x.id===id&&!x.out;});if(!t)return;
  var now=Date.now();
  openModal('<h3>Check out ticket '+pad(t.id)+'</h3>'+ticketRows(t,now)+'<div class="total"><span>Amount due</span><span class="num">'+inr(fee(t.type,now-t.in))+'</span></div>'+
    '<div class="acts"><button class="btn" data-close>Cancel</button><button class="btn primary" data-pay="'+t.id+'">Collect payment</button></div>');
}
function pay(id){if(SRV){srvPay(id);return;}
  var t=state.tickets.find(function(x){return x.id===id&&!x.out;});if(!t)return;
  t.out=Date.now();t.fee=fee(t.type,t.out-t.in);save();renderAll();
  openModal('<h3>Receipt '+pad(t.id)+'</h3>'+ticketRows(t,t.out)+'<div class="total"><span>Paid</span><span class="num">'+inr(t.fee)+'</span></div>'+
    '<div class="acts"><button class="btn primary" data-close>Done</button></div>');
  toast("Slot "+t.slot+" is free again.");
}

$("inForm").addEventListener("submit",function(e){
  e.preventDefault();
  var p=$("plate").value.toUpperCase().replace(/[\s-]/g,""),type=$("type").value;
  if(!/^[A-Z0-9]{3,12}$/.test(p)){toast("Invalid plate: use 3-12 letters or digits.",true);$("plate").focus();return;}
  if(type==="auto"){toast("Choose the vehicle type, or let the camera detect it.",true);return;}
  var src=window.__gateSrc?"gate":"";window.__gateSrc=false;
  if(SRV){srvCheckin(p,type,src);return;}
  try{var t=park(p,type);save();renderAll();$("plate").value="";toast("Parked "+p+" in slot "+t.slot+" \u2013 ticket "+pad(t.id));}
  catch(err){toast(err.message,true);}
});
document.addEventListener("click",function(e){
  var el=e.target.closest("[data-exit],[data-slot],[data-pay],[data-close]");
  if(e.target===$("modal"))return closeModal();
  if(!el)return;
  if(el.hasAttribute("data-close"))return closeModal();
  if(el.dataset.pay)return pay(+el.dataset.pay);
  if(el.dataset.exit)return askExit(+el.dataset.exit);
  if(el.dataset.slot){var t=ticketAt(el.dataset.slot);if(t)askExit(t.id);else{var s=SLOTS.find(function(x){return x.id===el.dataset.slot;});$("type").value=s.type;$("plate").focus();toast("Slot "+s.id+" is free. Enter a plate to park.");}}
});
document.addEventListener("keydown",function(e){if(e.key==="Escape")closeModal();});
$("search").addEventListener("input",renderActive);
$("reset").addEventListener("click",function(){seed();renderAll();toast("Demo data restored.");});
$("theme").addEventListener("click",function(){
  var r=document.documentElement,dark=r.dataset.theme?r.dataset.theme==="dark":matchMedia("(prefers-color-scheme: dark)").matches;
  r.dataset.theme=dark?"light":"dark";try{localStorage.setItem("parksmart.theme",r.dataset.theme);}catch(e){}
});
try{var th=localStorage.getItem("parksmart.theme");if(th)document.documentElement.dataset.theme=th;}catch(e){}

$("rates").innerHTML=Object.keys(RATES).map(function(k){return '<span class="chip">'+ICON[k]+" "+NAME[k]+" "+inr(RATES[k])+"/hr</span>";}).join("");

function tick(){
  var d=new Date();
  $("clock").innerHTML=d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"})+"<small>"+d.toLocaleDateString([],{weekday:"short",day:"numeric",month:"short",year:"numeric"})+"</small>";
  renderStats();renderActive();
}
// ---------- Smart Gate v2: motion -> best frames -> OCR (worldwide templates) -> vehicle type -> auto entry / auto exit ----------
var STATES="AN AP AR AS BR CH CG DD DL DN GA GJ HP HR JH JK KA KL LA LD MH ML MN MP MZ NL OD OR PB PY RJ SK TN TR TS UK UP WB".split(" ");
var TOD={O:"0",Q:"0",D:"0",I:"1",L:"1",B:"8",S:"5",Z:"2",G:"6"},TOL={"0":"O","1":"I","8":"B","5":"S","2":"Z","6":"G"},TOLN={"0":"D","1":"I","8":"B","5":"S","2":"Z","6":"G"};
/* Plate templates. Tokens: L=letters, D=digits, A=letter-or-digit, with a count or range (L1-3). Spaces/hyphens in real plates are ignored.
   Only Latin letters and digits can be read (the bundled model is English); Arabic, Chinese, Japanese, Korean, Thai, Devanagari parts are skipped. */
var CC={ALL:"All known formats",IN:"India",GB:"United Kingdom",US:"USA",CA:"Canada",MX:"Mexico",BR:"Brazil",AR:"Argentina",DE:"Germany",FR:"France",IT:"Italy",ES:"Spain",PT:"Portugal",NL:"Netherlands",BE:"Belgium",IE:"Ireland",CH:"Switzerland",SE:"Sweden / Nordic",PL:"Poland",TR:"Turkey",RU:"Russia",AE:"UAE",SA:"Saudi Arabia",PK:"Pakistan",LK:"Sri Lanka",MY:"Malaysia",SG:"Singapore",ID:"Indonesia",PH:"Philippines",VN:"Vietnam",CN:"China (Latin part)",AU:"Australia",NZ:"New Zealand",ZA:"South Africa",NG:"Nigeria",KE:"Kenya",GEN:"Generic (any letters+digits, 5-9)"};
var TPL=[["IN","L2 D1-2 L1-3 D4",{st:1,noOI:1,w:4}],["IN","D2 L2 D4 L1-2",{w:2}],
 ["GB","L2 D2 L3",{w:3}],["GB","L1 D1-3 L3",{w:1}],["GB","L3 D1-3 L1",{w:1}],
 ["US,CA,MX,BR,AR,PK,LK,MY,PH,NG,AU,NZ,SE","L3 D4",{w:1}],["US,CA,MX,AR,AU,NZ,SE,PK,PH","L3 D3",{}],["US,CA,BE","D1 L3 D3",{w:2}],["US,CA","D3 L3",{}],["US","L2 D5",{}],["US","D2 L2 D3",{}],
 ["DE","L1-3 L1-2 D1-4 L0-1",{w:2}],["FR,IT,AR,AU,PT","L2 D3 L2",{w:3}],["ES","D4 L3",{w:3}],["PT,CH","D2 L2 D2",{}],["PT","L2 D2 L2",{}],["PT","D4 L2",{}],["PT","L2 D4",{}],
 ["NL","L2 D3 L1",{}],["NL","D2 L3 D1",{}],["NL","D1 L3 D2",{}],["NL","L3 D2 L1",{}],["NL","D3 L2 D1",{}],["NL","L1 D3 L2",{}],["NL","L2 D2 L2",{}],["NL","D2 L2 D2",{}],
 ["PL","L2-3 A4-5",{w:1}],["SE","L3 D2 A1",{}],["TR","D2 L1-3 D2-4",{w:2}],["RU","L1 D3 L2 D2-3",{w:3}],["BR","L3 D1 L1 D2",{w:3}],
 ["AE","L1-2 D1-5",{}],["SA","L3 D1-4",{}],["PK","L3 D3-4",{}],["PK","L2 D3-4",{}],["LK","L2-5 D4",{}],["MY","L1-3 D1-4 L0-1",{}],["SG","L2-3 D1-4 L1",{w:1}],["ID","L1-2 D1-4 L1-3",{}],["VN","D2 L1-2 D4-5",{w:2}],
 ["CN","L1 A5-6",{}],["AU","L2 D2 L2",{}],["NZ","L2 D4",{}],["ZA","L2-3 D3 L0-3",{}],["ZA","L2 D2 L2 L2",{}],["NG,KE","L3 D3 L1-2",{w:2}],["IE","D2-3 L1-2 D3-6",{w:1}],["CH","L2 D1-6",{}],["BE,NL","L3 D3",{}],
 ["GEN","A5-9",{gen:1}]];
TPL.forEach(function(t){
  t.cc=t[0].split(",");t.p=t[1];t.o=t[2];t.tk=t[1].split(" ").map(function(s){var m=/^([LDA])(\d+)(?:-(\d+))?$/.exec(s);return {c:m[1],min:+m[2],max:+(m[3]||m[2])};});
  t.hasA=t.tk.some(function(k){return k.c==="A";});t.lo=t.tk.reduce(function(a,k){return a+k.min;},0);t.hi=t.tk.reduce(function(a,k){return a+k.max;},0);
});
function abs(p){return new URL(p,location.href).href;}
function loadScript(src){
  if(G0.sc[src])return G0.sc[src];
  return G0.sc[src]=new Promise(function(res,rej){var s=document.createElement("script");s.src=src;s.onload=res;s.onerror=function(){delete G0.sc[src];rej(new Error("load "+src));};document.head.appendChild(s);});
}
var G0={sc:{},ocrP:null,det:null,detState:"idle",ocrErr:null};
// ---- pure helpers ----
function toGray(im){var d=im.data,g=new Uint8Array(d.length/4);for(var i=0,j=0;j<g.length;i+=4,j++)g[j]=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8;return g;}
function motionScore(a,b,thr){var n=a.length,ch=0,sum=0;for(var i=0;i<n;i++){var d=a[i]-b[i];if(d<0)d=-d;if(d>thr)ch++;sum+=d;}return {frac:ch/n,mean:sum/n};}
function sharpness(g,w,h){var s=0,s2=0,n=0;for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){var i=y*w+x,l=4*g[i]-g[i-1]-g[i+1]-g[i-w]-g[i+w];s+=l;s2+=l*l;n++;}var m=s/n;return s2/n-m*m;}
function sharpen(g,w,h,amt){var o=new Uint8ClampedArray(g.length);for(var y=0;y<h;y++)for(var x=0;x<w;x++){var i=y*w+x;if(x<1||y<1||x>=w-1||y>=h-1){o[i]=g[i];continue;}
  var bl=(g[i-1]+g[i+1]+g[i-w]+g[i+w]+g[i]*4+g[i-w-1]+g[i-w+1]+g[i+w-1]+g[i+w+1])/12;o[i]=g[i]+amt*(g[i]-bl);}return o;}
function otsu(g){var hist=new Array(256).fill(0),i;for(i=0;i<g.length;i++)hist[g[i]]++;var tot=g.length,sum=0;for(i=0;i<256;i++)sum+=i*hist[i];
  var sB=0,wB=0,mx=0,th=127;for(i=0;i<256;i++){wB+=hist[i];if(!wB)continue;var wF=tot-wB;if(!wF)break;sB+=i*hist[i];var d=sB/wB-(sum-sB)/wF,v=wB*wF*d*d;if(v>mx){mx=v;th=i;}}return th;}
function lev(a,b){var m=a.length,n=b.length,p=[],i,j;for(j=0;j<=n;j++)p[j]=j;for(i=1;i<=m;i++){var c=[i];for(j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a.charAt(i-1)===b.charAt(j-1)?0:1));p=c;}return p[n];}
function cvCh(ch,cls,k,o){
  if(cls==="A")return /[A-Z0-9]/.test(ch)?[ch,0]:null;
  if(cls==="L"){if(/[A-Z]/.test(ch))return [ch,0];var mp=(o&&o.noOI&&k>=2)?TOLN:TOL;return mp[ch]?[mp[ch],1]:null;}
  if(/\d/.test(ch))return [ch,0];return TOD[ch]?[TOD[ch],1]:null;
}
function matchTok(w,tk,ti,pos,o){
  if(ti===tk.length)return pos===w.length?{s:"",c:0}:null;
  var t=tk[ti],best=null,acc="",c=0;
  for(var n=0;n<=t.max;n++){
    if(n>0){if(pos+n-1>=w.length)break;var r=cvCh(w.charAt(pos+n-1),t.c,pos+n-1,o);if(!r)break;acc+=r[0];c+=r[1];}
    if(n>=t.min){var rest=matchTok(w,tk,ti+1,pos+n,o);if(rest&&(!best||c+rest.c<best.c))best={s:acc+rest.s,c:c+rest.c};}
  }
  return best;
}
/* Finds the best plate in noisy OCR text for the chosen country profile (or all). Fixes O/0, I/1, B/8, S/5, Z/2, G/6 by position. */
function findPlate(raw,prof){var r=findPlateX(raw,prof);return r?r.p:null;}
function findPlateX(raw,prof){
  var t=String(raw).toUpperCase().replace(/[^A-Z0-9]/g,""),best=null,all=!prof||prof==="ALL";
  TPL.forEach(function(tp){
    if(all?tp.cc[0]==="GEN":tp.cc.indexOf(prof)<0)return;
    for(var i=0;i<t.length;i++)for(var len=tp.lo;len<=tp.hi&&i+len<=t.length;len++){
      if(all&&len<6)continue;
      var m=matchTok(t.substr(i,len),tp.tk,0,0,tp.o);if(!m||m.c>2||(m.c>0&&len<7&&all))continue;
      if(tp.o.st&&STATES.indexOf(m.s.substr(0,2))<0)continue;
      if(tp.o.gen&&!(/[A-Z]/.test(m.s)&&/\d/.test(m.s)&&m.c===0))continue;
      if(tp.hasA&&!tp.o.gen&&!/\d/.test(m.s))continue;
      var sc=len*10-m.c*3+(tp.o.w||0)+((tp.o.st&&/^[A-Z]{2}\d{2}/.test(m.s))?4:0);if(!best||sc>best.sc)best={p:m.s,sc:sc,c:m.c,i:i,len:len};
    }
  });
  return best;
}
function repairPlate(raw){return findPlate(raw,"ALL");}
function votePlates(c){
  var m={};c.forEach(function(x){if(!x.plate)return;var e=m[x.plate]||(m[x.plate]={plate:x.plate,votes:0,conf:0});e.votes++;e.conf=Math.max(e.conf,x.conf);});
  var a=Object.keys(m).map(function(k){return m[k];}).sort(function(p,q){return q.votes-p.votes||q.conf-p.conf;});
  return a[0]||null;
}
function boxBlurH(s,d,w,h,n){var half=n>>1;for(var y=0;y<h;y++){var o=y*w,sum=0,i;for(i=-half;i<=n-1-half;i++)sum+=s[o+Math.min(w-1,Math.max(0,i))];for(var x=0;x<w;x++){d[o+x]=sum/n;sum+=s[o+Math.min(w-1,x+n-half)]-s[o+Math.max(0,x-half)];}}}
function rlDeblur(g,w,h,L,it){
  var n=Math.max(2,Math.round(L)),N=g.length,a=new Float32Array(N),est=new Float32Array(N),t=new Float32Array(N),r=new Float32Array(N),u=new Float32Array(N),i,k;
  for(i=0;i<N;i++){a[i]=g[i]+1;est[i]=a[i];}
  for(k=0;k<(it||20);k++){boxBlurH(est,t,w,h,n);for(i=0;i<N;i++)r[i]=a[i]/(t[i]+1e-3);boxBlurH(r,u,w,h,n);for(i=0;i<N;i++)est[i]*=u[i];}
  var o=new Uint8ClampedArray(N);for(i=0;i<N;i++)o[i]=est[i]-1;return o;
}
function bboxOf(a,b,w,h,thr){var x0=w,y0=h,x1=-1,y1=-1;for(var y=0;y<h;y++)for(var x=0;x<w;x++){var d=a[y*w+x]-b[y*w+x];if(d<0)d=-d;if(d>thr){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}return x1<0?null:{x0:x0/w,y0:y0/h,x1:(x1+1)/w,y1:(y1+1)/h};}
function mapClass(c){return {car:"car",motorcycle:"bike",truck:"truck",bus:"truck"}[c]||null;}
window.PSG={pickBest:pickBest,findPlateX:findPlateX,rlDeblur:rlDeblur,bboxOf:bboxOf,repairPlate:repairPlate,findPlate:findPlate,votePlates:votePlates,motionScore:motionScore,sharpness:sharpness,sharpen:sharpen,mapClass:mapClass,lev:lev,otsu:otsu,TPL:TPL};

// ---- settings ----
function cfg(){
  var d={country:$("cfgCountry").value,near:$("cfgNear").value,delay:+$("cfgDelay").value,defType:$("cfgType").value};
  d.nearMin={near:0.15,normal:0.08,far:0.04}[d.near]||0.15;return d;
}
(function(){
  var sel=$("cfgCountry");sel.innerHTML=Object.keys(CC).map(function(k){return '<option value="'+k+'">'+CC[k]+'</option>';}).join("");
  try{var s=JSON.parse(localStorage.getItem("ps.cfg")||"{}");["cfgCountry","cfgNear","cfgDelay","cfgType"].forEach(function(i){if(s[i]!=null)$(i).value=s[i];});}catch(e){}
  ["cfgCountry","cfgNear","cfgDelay","cfgType"].forEach(function(i){$(i).addEventListener("change",function(){try{var o={};["cfgCountry","cfgNear","cfgDelay","cfgType"].forEach(function(k){o[k]=$(k).value;});localStorage.setItem("ps.cfg",JSON.stringify(o));}catch(e){}});});
})();

// ---- engines (bundled in /vendor, work offline) ----
function withTimeout(p,ms,label){return new Promise(function(res,rej){var t=setTimeout(function(){rej(new Error(label+" timed out"));},ms);p.then(function(v){clearTimeout(t);res(v);},function(e){clearTimeout(t);rej(e);});});}
function getOcr(){
  if(G0.ocrP)return G0.ocrP;
  if(location.protocol==="file:"){G0.ocrErr=new Error("file protocol");return Promise.reject(G0.ocrErr);}
  G0.ocrP=withTimeout(loadScript("vendor/tesseract.min.js").then(function(){return Tesseract.createWorker("eng",1,{workerPath:abs("vendor/worker.min.js"),corePath:abs("vendor/core"),langPath:abs("vendor/lang")});})
    .then(function(w){return w.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"}).then(function(){return w;});}),90000,"plate reader start")
    .catch(function(e){G0.ocrP=null;G0.ocrErr=e;throw e;});
  return G0.ocrP;
}
function getDetector(){
  if(G0.det)return G0.det;
  if(location.protocol==="file:"){G0.detState="off";return Promise.resolve(null);}
  G0.detState="loading";
  G0.det=loadScript("vendor/tf.min.js").then(function(){return loadScript("vendor/coco-ssd.min.js");})
    .then(function(){return cocoSsd.load({base:"mobilenet_v2",modelUrl:abs("vendor/coco/model.json")});})
    .then(function(m){G0.detState="ready";return m;}).catch(function(){G0.detState="off";return null;});
  return G0.det;
}
function detectType(cv){
  return getDetector().then(function(m){if(!m)return null;return m.detect(cv,10).then(function(ds){
    var best=null;ds.forEach(function(d){var t=mapClass(d.class);if(!t||d.score<0.3)return;var s=d.score*Math.sqrt(d.bbox[2]*d.bbox[3]);if(!best||s>best.s)best={type:t,score:d.score,s:s};});return best;});}).catch(function(){return null;});
}
// ---- image preparation variants for OCR ----
function grayOf(cv){return toGray(cv.getContext("2d",{willReadFrequently:true}).getImageData(0,0,cv.width,cv.height));}
function toCanvas(g,w,h,sc){var o=document.createElement("canvas");o.width=w;o.height=h;var x=o.getContext("2d"),im=x.createImageData(w,h);for(var i=0;i<g.length;i++){im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=g[i];im.data[i*4+3]=255;}x.putImageData(im,0,0);o.sc=sc||1;return o;}
function stretch(g){var mn=255,mx=0,i;for(i=0;i<g.length;i++){if(g[i]<mn)mn=g[i];if(g[i]>mx)mx=g[i];}var k=255/Math.max(1,mx-mn),o=new Uint8Array(g.length);for(i=0;i<g.length;i++)o[i]=(g[i]-mn)*k;return o;}
function prepContrast(cv,amt){var g=stretch(grayOf(cv));return toCanvas(amt===0?g:sharpen(g,cv.width,cv.height,amt==null?1.3:amt),cv.width,cv.height,1);}
function prepOtsu(cv){var g=stretch(grayOf(cv)),t=otsu(g),o=new Uint8Array(g.length);for(var i=0;i<g.length;i++)o[i]=g[i]>t?255:0;return toCanvas(o,cv.width,cv.height,1);}
function prepInvert(cv){var g=stretch(grayOf(cv)),o=new Uint8Array(g.length);for(var i=0;i<g.length;i++)o[i]=255-g[i];return toCanvas(sharpen(o,cv.width,cv.height,1),cv.width,cv.height,1);}
function prepUp(cv){var k=cv.width<900?2:1,c=document.createElement("canvas");c.width=cv.width*k;c.height=cv.height*k;var x=c.getContext("2d");x.imageSmoothingQuality="high";x.drawImage(cv,0,0,c.width,c.height);var g=stretch(grayOf(c)),t=otsu(g),o=new Uint8Array(g.length);for(var i=0;i<g.length;i++)o[i]=g[i]>t?255:0;return toCanvas(o,c.width,c.height,k);}
/* Finds the text line (rows with many vertical edges), crops tightly around it and zooms so letters are ~70px tall. */
function prepTight(cv){
  var w=cv.width,h=cv.height,g=stretch(grayOf(cv)),row=new Float32Array(h),y,x,d;
  for(y=0;y<h;y++){var c=0;for(x=1;x<w;x++){d=g[y*w+x]-g[y*w+x-1];if(d>40||d<-40)c++;}row[y]=c;}
  var sm=new Float32Array(h),R=Math.max(2,Math.round(h*0.015)),mx=0;
  for(y=0;y<h;y++){var s=0,n=0;for(var j=-R;j<=R;j++){var yy=y+j;if(yy>=0&&yy<h){s+=row[yy];n++;}}sm[y]=s/n;if(sm[y]>mx)mx=sm[y];}
  if(mx<3)return prepContrast(cv);
  var thr=mx*0.3,bs=-1,be=-1,cs=-1,best=0;
  for(y=0;y<=h;y++){if(y<h&&sm[y]>thr){if(cs<0)cs=y;}else if(cs>=0){if(y-cs>best){best=y-cs;bs=cs;be=y;}cs=-1;}}
  if(best<h*0.05)return prepContrast(cv);
  var col=new Float32Array(w),bh=be-bs;
  for(y=bs;y<be;y++)for(x=1;x<w;x++){d=g[y*w+x]-g[y*w+x-1];if(d>40||d<-40)col[x]++;}
  var mc=Math.max(1,bh*0.04),full=bh*0.9,x0=0,x1=w-1;
  while(x0<w&&(col[x0]<mc||col[x0]>full))x0++;while(x1>x0&&(col[x1]<mc||col[x1]>full))x1--;
  var px=Math.round(bh*0.5),py=Math.round(bh*0.35),cx0=Math.max(0,x0-px),cx1=Math.min(w,x1+px),cy0=Math.max(0,bs-py),cy1=Math.min(h,be+py),cw=cx1-cx0,ch=cy1-cy0,k=Math.min(3,Math.max(0.5,110/Math.max(1,bh)));
  var c2=document.createElement("canvas");c2.width=Math.max(8,Math.round(cw*k));c2.height=Math.max(8,Math.round(ch*k));var q=c2.getContext("2d");q.imageSmoothingQuality="high";q.drawImage(cv,cx0,cy0,cw,ch,0,0,c2.width,c2.height);
  var o=prepContrast(c2);o.sc=k;return o;
}
var ATT=[[7,prepContrast],[7,prepTight],[6,prepContrast],[7,prepOtsu],[7,prepInvert],[6,prepUp]];
var ocrQ=Promise.resolve();
function ocrExec(fn){var p=ocrQ.then(fn);ocrQ=p.catch(function(){});return p;}
function pickBest(c){
  var g={};c.forEach(function(x){if(!x.plate)return;var e=g[x.plate]||(g[x.plate]={plate:x.plate,votes:0,conf:0,sc:0,first:x});e.votes++;if(x.sc>e.sc)e.sc=x.sc;if(x.conf>e.conf)e.conf=x.conf;});
  return Object.keys(g).map(function(k){return g[k];}).sort(function(p,q){return q.sc-p.sc||q.votes-p.votes||q.conf-p.conf;})[0]||null;
}
/* Size of the plate text as a fraction of the camera frame, from the OCR words that cover the matched plate (null if unknown). */
function boxFor(words,fp,sc,k,vw){
  var pos=0,x0=1e9,x1=-1,y0=1e9,y1=-1,n=0,ys={};
  words.forEach(function(w){var L=w.t.length,a=pos,b=pos+L;pos=b;if(b<=fp.i||a>=fp.i+fp.len)return;n++;x0=Math.min(x0,w.bbox.x0);x1=Math.max(x1,w.bbox.x1);y0=Math.min(y0,w.bbox.y0);y1=Math.max(y1,w.bbox.y1);ys[Math.round(w.bbox.y0/Math.max(1,w.bbox.y1-w.bbox.y0))]=1;});
  if(!n)return {frac:null,aspect:null,lines:0};
  return {frac:vw?((x1-x0)/(sc*k))/vw:null,aspect:(x1-x0)/Math.max(1,y1-y0),lines:Object.keys(ys).length};
}
/* Finds the text line (rows with many vertical edges), crops tightly around it and zooms so letters are ~70px tall. */
function prepTight(cv){
  var w=cv.width,h=cv.height,g=stretch(grayOf(cv)),row=new Float32Array(h),y,x,d;
  for(y=0;y<h;y++){var c=0;for(x=1;x<w;x++){d=g[y*w+x]-g[y*w+x-1];if(d>40||d<-40)c++;}row[y]=c;}
  var sm=new Float32Array(h),R=Math.max(2,Math.round(h*0.015)),mx=0;
  for(y=0;y<h;y++){var s=0,n=0;for(var j=-R;j<=R;j++){var yy=y+j;if(yy>=0&&yy<h){s+=row[yy];n++;}}sm[y]=s/n;if(sm[y]>mx)mx=sm[y];}
  if(mx<3)return prepContrast(cv);
  var thr=mx*0.3,bs=-1,be=-1,cs=-1,best=0;
  for(y=0;y<=h;y++){if(y<h&&sm[y]>thr){if(cs<0)cs=y;}else if(cs>=0){if(y-cs>best){best=y-cs;bs=cs;be=y;}cs=-1;}}
  if(best<h*0.05)return prepContrast(cv);
  var col=new Float32Array(w),bh=be-bs;
  for(y=bs;y<be;y++)for(x=1;x<w;x++){d=g[y*w+x]-g[y*w+x-1];if(d>40||d<-40)col[x]++;}
  var mc=Math.max(1,bh*0.04),full=bh*0.9,x0=0,x1=w-1;
  while(x0<w&&(col[x0]<mc||col[x0]>full))x0++;while(x1>x0&&(col[x1]<mc||col[x1]>full))x1--;
  var px=Math.round(bh*0.5),py=Math.round(bh*0.35),cx0=Math.max(0,x0-px),cx1=Math.min(w,x1+px),cy0=Math.max(0,bs-py),cy1=Math.min(h,be+py),cw=cx1-cx0,ch=cy1-cy0,k=Math.min(3,Math.max(0.5,110/Math.max(1,bh)));
  var c2=document.createElement("canvas");c2.width=Math.max(8,Math.round(cw*k));c2.height=Math.max(8,Math.round(ch*k));var q=c2.getContext("2d");q.imageSmoothingQuality="high";q.drawImage(cv,cx0,cy0,cw,ch,0,0,c2.width,c2.height);
  var o=prepContrast(c2);o.sc=k;return o;
}
var ATT=[[7,prepContrast],[7,prepTight],[6,prepContrast],[7,prepOtsu],[7,prepInvert],[6,prepUp]];
var ocrQ=Promise.resolve();
function ocrExec(fn){var p=ocrQ.then(fn);ocrQ=p.catch(function(){});return p;}
function plateBox(r,plate,sc,k,vw){ // how wide the plate text is, as a fraction of the camera frame (null if unknown)
  var words=(r.data&&r.data.words)||[],x0=1e9,x1=-1,y0=1e9,y1=-1,n=0,ys={};
  words.forEach(function(w){var t=String(w.text).toUpperCase().replace(/[^A-Z0-9]/g,"");if(t.length<1||!w.bbox)return;if(plate.indexOf(t)>-1||(t.length>3&&t.indexOf(plate)>-1)){n++;x0=Math.min(x0,w.bbox.x0);x1=Math.max(x1,w.bbox.x1);y0=Math.min(y0,w.bbox.y0);y1=Math.max(y1,w.bbox.y1);ys[Math.round(w.bbox.y0/Math.max(1,(w.bbox.y1-w.bbox.y0)))]=1;}});
  if(!n)return {frac:null,aspect:null,lines:0};
  var wpx=(x1-x0)/(sc*k);return {frac:vw?wpx/vw:null,aspect:(x1-x0)/Math.max(1,y1-y0),lines:Object.keys(ys).length};
}
/* Reads one image with several preparations (single line, tight crop, block, binarised, inverted, upscaled) and keeps the best-scoring plate.
   meta={k,vw} lets it measure plate size. Stops early when two variants agree or a long clean read is found. */
function readPlate(cv,meta,maxAtt){
  var prof=cfg().country,texts=[],cands=[],p=Promise.resolve();
  ATT.slice(0,maxAtt||ATT.length).forEach(function(a){p=p.then(function(){
    var bst=pickBest(cands);if(bst&&(bst.votes>=2||(bst.conf>=85&&bst.sc>=90)))return;
    return ocrExec(function(){return getOcr().then(function(w){var pc=a[1](cv);return w.setParameters({tessedit_pageseg_mode:String(a[0])}).then(function(){return w.recognize(pc);}).then(function(r){return {r:r,pc:pc};});});}).then(function(o){
      var r=o.r,txt=r.data.text||"";texts.push(txt);
      var words=(r.data.words||[]).map(function(w){return {t:String(w.text).toUpperCase().replace(/[^A-Z0-9]/g,""),bbox:w.bbox};}).filter(function(w){return w.t.length&&w.bbox;});
      var fp=words.length?findPlateX(words.map(function(w){return w.t;}).join(""),prof):null,box={frac:null,aspect:null,lines:0};
      if(fp)box=boxFor(words,fp,o.pc.sc||1,meta?meta.k:1,meta?meta.vw:0);else fp=findPlateX(txt,prof);
      if(window.PSDEBUG)(window.PSDBG=window.PSDBG||[]).push({text:txt,conf:r.data.confidence,img:cv.toDataURL()});
      if(fp)cands.push({plate:fp.p,sc:fp.sc,conf:Math.round(r.data.confidence),frac:meta?box.frac:null,aspect:box.aspect,lines:box.lines});
    });
  });});
  return p.then(function(){
    var b=pickBest(cands);if(!b)return {plate:null,conf:0,sc:0,texts:texts,frac:null,aspect:null,lines:0};
    var f=b.first;return {plate:b.plate,conf:b.conf,sc:b.sc,texts:texts,frac:f.frac,aspect:f.aspect,lines:f.lines};
  });
}
function deblurCanvas(cv,L){var w=cv.width,h=cv.height,g=grayOf(cv);return toCanvas(rlDeblur(g,w,h,L,20),w,h,1);}
function chain(fns,arr){var p=Promise.resolve();fns.forEach(function(f){p=p.then(f).then(function(r){arr.push(r);});});return p;}
function resolveType(det,r,C){
  if(det)return {type:det.type,src:"camera"};
  if(r&&r.lines>=2&&r.aspect&&r.aspect<3)return {type:"bike",src:"estimated from plate shape"};
  return {type:C.defType,src:"default"};
}
// ---- say exactly why reading is unavailable ----
function why(e){
  if(location.protocol==="file:")return "Page opened as a file: browsers block the plate reader. Open it through http://localhost (run START-DEMO.bat) or a web host.";
  var m=String((e&&e.message)||e||"");
  if(/^load /.test(m))return "Plate reader files not found: keep the 'vendor' folder next to index.html ("+m.slice(5)+").";
  return "Plate reader could not start ("+m.slice(0,90)+")";
}
function fastShutter(track){
  try{
    var c=track.getCapabilities?track.getCapabilities():{},adv={};
    if(c.exposureMode&&c.exposureMode.indexOf("manual")>-1)adv.exposureMode="manual";
    if(c.exposureTime)adv.exposureTime=Math.max(c.exposureTime.min,Math.min(c.exposureTime.max,5));
    if(c.iso)adv.iso=Math.round(c.iso.min+(c.iso.max-c.iso.min)*0.7);
    if(Object.keys(adv).length)return track.applyConstraints({advanced:[adv]}).then(function(){return true;},function(){return false;});
  }catch(e){}
  return Promise.resolve(false);
}
// ---- exit helpers ----
function matchActive(texts){
  var act=activeTickets(),best=null,second=null;
  texts.forEach(function(tx){var t=String(tx).toUpperCase().replace(/[^A-Z0-9]/g,"");
    act.forEach(function(tk){var p=tk.plate,L=p.length,tol=L>=9?2:1;
      for(var l=L-1;l<=L+1;l++)for(var i=0;i+l<=t.length;i++){var d=lev(p,t.substr(i,l));
        if(d<=tol){if(!best||d<best.d)best={tk:tk,d:d};else if(tk!==best.tk&&d===best.d)second={tk:tk,d:d};}}});});
  return best&&!(second&&second.d===best.d&&second.tk!==best.tk)?best.tk:null;
}
function exitDone(t){
  toast("Exit: "+t.plate+" paid "+inr(t.fee)+" \u2013 bay "+t.slot+" is free");
  var l=$("xlog");l.innerHTML=esc(new Date().toLocaleTimeString()+"  "+t.plate+"  "+inr(t.fee))+"<br>"+l.innerHTML.split("<br>").slice(0,4).join("<br>");
}
function doExit(t){
  if(SRV){api("/api/exit",{plate:t.plate,src:"gate"}).then(function(r){exitDone(r);return srvLoad();}).catch(function(e){toast(e.message,true);needLogin(e);});return;}
  var x=state.tickets.find(function(k){return k.id===t.id&&!k.out;});if(!x)return;
  x.out=Date.now();x.fee=fee(x.type,x.out-x.in);save();renderAll();exitDone(x);
}

// ---- one gate = one camera. mode "entry" (ids as-is) or "exit" (ids prefixed x) ----
function makeGate(P,mode){
  var E=function(n){return $(P+n);},exit=(mode==="exit"),cam={stream:null},G={state:"idle",prev:null,frames:[],t0:0,quiet:0,cool:0,lastA:0,busy:false,force:false,armed:false,pending:null,cdT:null,recent:{},bbox:null,sm:null};
  function setStatus(t,c){var s=E("camStatus");s.textContent=t;s.className="pill "+(c||"");}
  function setGate(t,c){var s=E("gState");s.textContent=t;s.className="pill "+(c||"");}
  function fillDevices(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.enumerateDevices)return;
    navigator.mediaDevices.enumerateDevices().then(function(d){var sel=E("camSel"),cur=sel.value,cams=d.filter(function(x){return x.kind==="videoinput";});
      sel.innerHTML='<option value="">Default camera</option>'+cams.map(function(c,i){return '<option value="'+esc(c.deviceId)+'">'+esc(c.label||("Camera "+(i+1)))+'</option>';}).join("");sel.value=cur;}).catch(function(){});
  }
  function startCam(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){setStatus(window.isSecureContext?"No camera available":"Camera needs https:// or localhost","err");return;}
    var v={width:{ideal:1280},height:{ideal:720},frameRate:{ideal:60}},id=E("camSel").value;if(id)v.deviceId={exact:id};else v.facingMode="environment";
    navigator.mediaDevices.getUserMedia({video:v,audio:false}).then(function(s){
      cam.stream=s;var el=E("video");el.srcObject=s;el.play();E("frame").classList.add("on");E("camStart").textContent="Stop camera";fillDevices();
      var tr=s.getVideoTracks()[0],st=tr.getSettings?tr.getSettings():{};setStatus("Camera on","ok");
      G.armed=false;G.prev=null;G.state="idle";G.bbox=null;setGate("Loading vision engines…","busy");
      var info=(st.width||"?")+"x"+(st.height||"?")+" @ "+Math.round(st.frameRate||0)+" fps";
      Promise.all([fastShutter(tr),getOcr().catch(function(){return null;}),exit?null:getDetector()]).then(function(a){
        if(!cam.stream)return;
        if(!a[1]){setGate(why(G0.ocrErr),"err");return;}
        G.armed=true;setGate("Ready \u2013 "+info+" \u00B7 fast shutter "+(a[0]?"ON":"n/a")+(exit?"":" \u00B7 vehicle detector "+(G0.detState==="ready"?"ON":"off")),"ok");
      });
      gateLoop();
    }).catch(function(){setStatus("Camera blocked or not found \u2013 pick another camera or use manual entry","err");});
  }
  function stopCam(){
    if(cam.stream){cam.stream.getTracks().forEach(function(t){t.stop();});cam.stream=null;}
    G.armed=false;E("video").srcObject=null;E("frame").classList.remove("on","scan");E("camStart").textContent="Start "+(exit?"exit ":"")+"camera";hideBanner();G.frames=[];G.state="idle";
  }
  function gateLoop(){
    if(!cam.stream)return;try{gateTick();}catch(e){}
    var v=E("video");if(v.requestVideoFrameCallback)v.requestVideoFrameCallback(gateLoop);else setTimeout(gateLoop,33);
  }
  function gateTick(){
    var v=E("video"),now=realNow();if(!G.armed||!v.videoWidth||now-G.lastA<25)return;G.lastA=now;
    var sm=G.sm||(G.sm=document.createElement("canvas"));sm.width=96;sm.height=54;var x=sm.getContext("2d",{willReadFrequently:true});
    x.drawImage(v,0,0,96,54);var g=toGray(x.getImageData(0,0,96,54)),prev=G.prev,ms=prev?motionScore(g,prev,22):{frac:0};G.prev=g;
    var moving=ms.frac>0.015;if(prev&&moving)G.bbox=bboxOf(g,prev,96,54,22);
    E("mtr").style.width=Math.min(100,ms.frac*500)+"%";E("mtr").className=moving?"hot":"";
    if(G.busy||G.pending||now<G.cool||(!E("auto").checked&&!G.force))return;
    if(G.state==="idle"&&(moving||G.force)){G.state="capture";G.frames=[];G.t0=now;G.quiet=0;E("frame").classList.add("scan");setGate("Motion \u2013 capturing\u2026","busy");}
    if(G.state==="capture"){
      if(moving||G.force)grabFrame(v);G.quiet=moving?0:G.quiet+1;
      if(G.frames.length>=14||now-G.t0>1000||(G.quiet>=4&&G.frames.length>=3)||(G.force&&G.frames.length>=6))processBurst();
    }
  }
  function grabFrame(v){
    var vw=v.videoWidth,vh=v.videoHeight,zx=Math.round(vw*0.05),zy=Math.round(vh*0.2),zw=Math.round(vw*0.9),zh=Math.round(vh*0.6),rx=zx,ry=zy,rw=zw,rh=zh,bb=G.force?null:G.bbox,C=cfg();
    if(bb&&(bb.x1-bb.x0)<C.nearMin){return;} // object still too small = too far away
    if(bb){var mx=vw*0.03,my=vh*0.03,ax=Math.max(zx,bb.x0*vw-mx),ay=Math.max(zy,bb.y0*vh-my),bx=Math.min(zx+zw,bb.x1*vw+mx),by=Math.min(zy+zh,bb.y1*vh+my);
      if(bx-ax>vw*0.1&&by-ay>vh*0.08){rx=Math.round(ax);ry=Math.round(ay);rw=Math.round(bx-ax);rh=Math.round(by-ay);}}
    var k=rw<700?Math.min(3,700/rw):Math.min(1,900/rw);
    var c=document.createElement("canvas");c.width=Math.round(rw*k);c.height=Math.round(rh*k);var x=c.getContext("2d",{willReadFrequently:true});
    x.drawImage(v,rx,ry,rw,rh,0,0,c.width,c.height);
    var sh=sharpness(toGray(x.getImageData(0,0,c.width,c.height)),c.width,c.height);
    var f=document.createElement("canvas");f.width=640;f.height=Math.round(640*vh/vw);f.getContext("2d").drawImage(v,0,0,f.width,f.height);
    var comp=(!bb||(bb.x0>0.06&&bb.x1<0.94))?1:0.15;
    G.frames.push({crop:c,full:f,sharp:sh*comp,k:k,vw:vw});
    if(G.frames.length>6){G.frames.sort(function(p,q){return q.sharp-p.sharp;});G.frames.length=5;}
  }
  function processBurst(){
    if(!G.frames.length){G.state="idle";G.force=false;G.cool=realNow()+800;E("frame").classList.remove("scan");setGate("No frames captured \u2013 move closer or try again","warn");return;}
    G.busy=true;G.state="read";G.force=false;
    var C=cfg(),fr=G.frames.sort(function(a,b){return b.sharp-a.sharp;}).slice(0,3);G.frames=[];setGate("Reading "+fr.length+" best frames\u2026","busy");
    var typeP=exit?Promise.resolve(null):detectType(fr[0].full).then(function(t){return t||(fr[1]?detectType(fr[1].full):null);}),cands=[],texts=[];
    var seq=Promise.resolve();
    fr.forEach(function(f){seq=seq.then(function(){
      var w=pickBest(cands);if(w&&w.sc>=90&&(w.votes>=2||w.conf>=70))return;
      return readPlate(f.crop,{k:f.k,vw:f.vw}).then(function(r){texts=texts.concat(r.texts);if(r.plate)cands.push(r);});
    });});
    seq.then(function(){
      var b=pickBest(cands);if((b&&b.sc>=60)||(exit&&matchActive(texts)))return;
      setGate("Blurred \u2013 trying motion de-blur\u2026","busy");
      var p=Promise.resolve();[4,7,10,14,19,26].forEach(function(L){p=p.then(function(){
        var b2=pickBest(cands);if((b2&&b2.sc>=90)||(exit&&matchActive(texts)))return;
        return readPlate(deblurCanvas(fr[0].crop,L*fr[0].k),{k:fr[0].k,vw:fr[0].vw},1).then(function(r){texts=texts.concat(r.texts);if(r.plate)cands.push(r);});});});
      return p;
    }).then(function(){return typeP;}).then(function(det){
      var w=pickBest(cands),first=w?w.first:null;
      if(exit){var t=matchActive(texts)||(w&&activeTickets().filter(function(k){return k.plate===w.plate;})[0]);
        if(!t){setGate(w?w.plate+" is not parked \u2013 check the plate":"No plate read \u2013 move closer","warn");if(w)G.cool=realNow()+4000;return;}
        return offerExit(t,w?w.votes:1,w?w.conf:0,fr.length);}
      if(!w){setGate("No plate read in "+fr.length+" frames \u2013 move the plate closer","warn");return;}
      if(first&&first.frac!=null&&first.frac<C.nearMin){setGate("Plate too far away ("+Math.round(first.frac*100)+"% of frame) \u2013 move closer","warn");G.cool=realNow()+1200;return;}
      var ty=resolveType(det,first,C);offerPlate({plate:w.plate,conf:w.conf,votes:w.votes,n:cands.length,type:ty.type,tsrc:ty.src});
    }).catch(function(e){setGate(why(e),"err");E("auto").checked=false;})
    .then(function(){G.busy=false;G.state="idle";G.cool=Math.max(G.cool,realNow()+1500);E("frame").classList.remove("scan");});
  }
  // ---- offer with a cancellable countdown. No confidence threshold: any plate-shaped read is acted on. ----
  function offerPlate(r){
    var now=realNow();
    if(activeTickets().some(function(t){return t.plate===r.plate;})){setGate(r.plate+" is already parked","warn");G.cool=now+4000;return;}
    if(G.recent[r.plate]&&now-G.recent[r.plate]<15000)return;
    $("plate").value=r.plate;G.pending=r;showBanner(r,E("autopark").checked,false);
  }
  function offerExit(t,votes,conf,n){
    var now=realNow();if(G.recent[t.plate]&&now-G.recent[t.plate]<15000)return;
    G.pending={plate:t.plate,tk:t,votes:votes,conf:conf,n:n};showBanner(G.pending,E("autopark").checked,true);
  }
  function showBanner(r,auto,isExit){
    clearInterval(G.cdT);E("gate").hidden=false;E("gPlate").textContent=r.plate;
    var delay=cfg().delay;
    if(isExit){E("gType").textContent="\u00B7 bay "+r.tk.slot+" \u00B7 "+inr(fee(r.tk.type,Date.now()-r.tk.in))+" so far";}
    else{E("gSel").value=r.type;E("gType").textContent="\u00B7 "+NAME[r.type]+" ("+r.tsrc+")";}
    var info=r.votes+" of "+(r.n||r.votes)+" reads agree \u00B7 OCR "+r.conf+"%";
    setGate((isExit?"Exit plate: ":"Plate read: ")+r.plate,"ok");
    if(!auto){E("gInfo").textContent=info+" \u00B7 press "+(isExit?"Exit now":"Park now");return;}
    if(delay<=0){accept();return;}
    var n=delay;E("gInfo").textContent=info+" \u00B7 "+(isExit?"auto-exit":"auto-entry")+" in "+n+"s";
    G.cdT=setInterval(function(){n--;if(n<=0)accept();else E("gInfo").textContent=info+" \u00B7 "+(isExit?"auto-exit":"auto-entry")+" in "+n+"s";},1000);
  }
  function hideBanner(){clearInterval(G.cdT);G.pending=null;E("gate").hidden=true;}
  function accept(){
    var p=G.pending;if(!p)return;clearInterval(G.cdT);G.recent[p.plate]=realNow();G.cool=realNow()+3000;hideBanner();
    if(exit){doExit(p.tk);return;}
    $("plate").value=p.plate;$("type").value=E("gSel").value;window.__gateSrc=true;
    var f=$("inForm");if(f.requestSubmit)f.requestSubmit();else f.dispatchEvent(new Event("submit",{cancelable:true,bubbles:true}));
  }
  E("gGo").addEventListener("click",accept);
  E("gNo").addEventListener("click",function(){if(G.pending)G.recent[G.pending.plate]=realNow();hideBanner();setGate("Cancelled","warn");});
  E("camStart").addEventListener("click",function(){if(cam.stream){stopCam();setStatus("Camera off","");setGate("Idle","");}else startCam();});
  E("camRead").addEventListener("click",function(){
    if(!cam.stream){toast("Start the camera first.",true);return;}if(!G.armed){toast("Engines are still loading \u2013 wait for Ready.",true);return;}
    G.bbox=null;G.force=true;setGate("Reading the frame\u2026","busy");});
  fillDevices();
  return {start:startCam,stop:stopCam,offer:offerPlate,setStatus:setStatus,setGate:setGate,on:function(){return !!cam.stream;}};
}
var entry=makeGate("","entry"),xit=makeGate("x","exit");
function setStatus(t,c){entry.setStatus(t,c);}
function setGate(t,c){entry.setGate(t,c);}
function setMode(m){
  document.querySelectorAll("[data-mode]").forEach(function(b){b.setAttribute("aria-pressed",String(b.dataset.mode===m));});
  $("capture").hidden=(m==="manual");$("camBox").hidden=(m!=="camera");$("upBox").hidden=(m!=="upload");
  if(m!=="camera")entry.stop();
  if(m==="manual"){if($("type").value==="auto")$("type").value="car";$("plate").focus();}else $("type").value="auto";
}
document.querySelectorAll("[data-mode]").forEach(function(b){b.addEventListener("click",function(){setMode(b.dataset.mode);});});
$("file").addEventListener("change",function(){
  var f=this.files[0];if(!f)return;var img=new Image();
  img.onload=function(){
    var k=Math.min(1,1400/img.naturalWidth),c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);setStatus("Reading photo\u2026","busy");
    Promise.all([readPlate(c,null),detectType(c)]).then(function(a){
      if(!a[0].plate){setStatus("No plate found in photo","warn");return;}
      setStatus("Read "+a[0].plate,"ok");var ty=resolveType(a[1],a[0],cfg());entry.offer({plate:a[0].plate,conf:a[0].conf,votes:1,n:1,type:ty.type,tsrc:ty.src});
    }).catch(function(e){setStatus(why(e),"err");});
  };
  img.src=URL.createObjectURL(f);
});
$("selftest").addEventListener("click",function(){
  setStatus("Testing plate reader\u2026","busy");
  var c=document.createElement("canvas");c.width=520;c.height=120;var x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,520,120);x.fillStyle="#000";
  x.font="bold 56px Arial, Helvetica, sans-serif";x.textAlign="center";x.textBaseline="middle";x.fillText("TN30AB1234",260,60);
  readPlate(c,null,1).then(function(r){
    setStatus(r.plate?"Plate reader OK (read "+r.plate+")":"Plate reader runs but misread the test: "+(r.texts[0]||"").trim().slice(0,20),r.plate?"ok":"warn");
    getDetector().then(function(m){toast("Vehicle detector: "+(m?"ready":"not available \u2013 default type will be used"),!m);});
  }).catch(function(e){setStatus(why(e),"err");});
});
$("demo").addEventListener("click",function(){
  var pool=["TN30BC4821","KA03MJ5512","TN38PL9034","TN66RS2207","MH12AB7745"].filter(function(p){return !activeTickets().some(function(t){return t.plate===p;});});
  if(!pool.length){toast("All demo plates are already parked.",true);return;}
  entry.offer({plate:pool[Math.floor(Math.random()*pool.length)],conf:92,votes:3,n:4,type:["car","bike","truck"][Math.floor(Math.random()*3)],tsrc:"demo"});
});
(function(){
  var md=navigator.mediaDevices;
  if(!md||!md.enumerateDevices){$("tabCam").disabled=true;setStatus("No camera \u2013 manual mode","");return;}
  md.enumerateDevices().then(function(d){
    if(d.some(function(x){return x.kind==="videoinput";})){setStatus("Camera detected","ok");setMode("camera");}
    else{$("tabCam").disabled=true;setStatus("No camera \u2013 manual mode","");}
  }).catch(function(){setStatus("Manual mode","");});
})();

// ---------- Server mode: shared MySQL data, logins, admin console ----------
var SRV=false,token=null,poll=null,admTab="reports",realNow=Date.now.bind(Date),skew=0;
Date.now=function(){return realNow()+skew;};
try{token=sessionStorage.getItem("ps.tok");}catch(e){}
function api(path,body){
  var o={method:body?"POST":"GET",headers:{}};if(token)o.headers["X-Token"]=token;
  if(body){o.headers["Content-Type"]="application/x-www-form-urlencoded";o.body=new URLSearchParams(body).toString();}
  return fetch(path,o).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"Request failed");return j;});});
}
function needLogin(e){if(/sign in/i.test(e.message))showLogin();}
function showLogin(){
  token=null;try{sessionStorage.removeItem("ps.tok");}catch(e){}clearInterval(poll);poll=null;state.tickets=[];renderAll();
  ["who","logout","admin"].forEach(function(i){$(i).hidden=true;});$("login").classList.add("open");$("lu").focus();
}
function doLogin(){
  $("lerr").textContent="";
  api("/api/login",{username:$("lu").value.trim(),password:$("lp").value}).then(function(j){
    token=j.token;try{sessionStorage.setItem("ps.tok",token);}catch(e){}$("lp").value="";return srvLoad();
  }).catch(function(e){$("lerr").textContent=e.message;});
}
function srvLoad(){return api("/api/state").then(function(j){
  skew=j.now-realNow();state.tickets=j.tickets;
  $("who").textContent=j.user+" \u00B7 "+j.role;$("who").hidden=false;$("logout").hidden=false;$("login").classList.remove("open");
  if(j.role==="admin"){if($("admin").hidden){$("admin").hidden=false;loadAdmin();}}else $("admin").hidden=true;
  renderAll();
  if(!poll)poll=setInterval(function(){srvLoad().catch(needLogin);},3000);
});}
function srvStart(){
  SRV=true;$("reset").hidden=true;$("foot").textContent="Live shared data from MySQL. Every signed-in device sees the same slots and tickets.";
  if(token)srvLoad().catch(showLogin);else showLogin();
}
function srvCheckin(p,type,src){
  api("/api/checkin",{plate:p,type:type,src:src||""}).then(function(t){$("plate").value="";toast("Parked "+t.plate+" in slot "+t.slot+" \u2013 ticket "+pad(t.id));return srvLoad();})
   .catch(function(e){toast(e.message,true);needLogin(e);});
}
function srvPay(id){
  api("/api/checkout",{id:id}).then(function(t){
    openModal('<h3>Receipt '+pad(t.id)+'</h3>'+ticketRows(t,t.out)+'<div class="total"><span>Paid</span><span class="num">'+inr(t.fee)+'</span></div><div class="acts"><button class="btn primary" data-close>Done</button></div>');
    toast("Slot "+t.slot+" is free again.");return srvLoad();
  }).catch(function(e){closeModal();toast(e.message,true);needLogin(e);});
}
function tbl(head,rows){
  return '<div class="tablewrap"><table><thead><tr>'+head.map(function(x){return "<th>"+x+"</th>";}).join("")+'</tr></thead><tbody>'+
   (rows.length?rows.map(function(r){return "<tr>"+r.map(function(c){return "<td>"+esc(c)+"</td>";}).join("")+"</tr>";}).join(""):'<tr><td class="empty" colspan="'+head.length+'">No data yet.</td></tr>')+'</tbody></table></div>';
}
function loadAdmin(){
  var b=$("adminBody"),fail=function(e){b.innerHTML='<p class="empty">'+esc(e.message)+'</p>';needLogin(e);};
  if(admTab==="reports")api("/api/reports").then(function(j){
    var mx=Math.max.apply(null,[1].concat(j.hours.map(function(r){return r[1];})));
    b.innerHTML='<h3>Revenue, last 7 days</h3>'+tbl(["Date","Vehicles out","Revenue"],j.daily.map(function(r){return [r[0],r[1],inr(+r[2])];}))+
     '<h3>Busiest entry hours</h3>'+(j.hours.length?j.hours.map(function(r){return '<div class="hr"><span>'+String(r[0]).padStart(2,"0")+':00</span><div class="bar"><i style="width:'+(r[1]/mx*100)+'%"></i></div><b>'+r[1]+'</b></div>';}).join(""):'<p class="empty">No data yet.</p>')+
     '<h3>By vehicle type</h3>'+tbl(["Type","Visits","Revenue"],j.types.map(function(r){return [r[0],r[1],inr(+r[2])];}))+
     '<h3>Most frequent vehicles</h3>'+tbl(["Plate","Visits"],j.top);
  }).catch(fail);
  else if(admTab==="watch")api("/api/watchlist").then(function(j){
    b.innerHTML='<div class="opts"><input id="wp" placeholder="Plate" maxlength="14"><input id="wr" class="plain" placeholder="Reason (e.g. stolen)" maxlength="100"><button class="btn sm primary" id="wlAdd">Add to watchlist</button></div>'+
     '<div class="tablewrap"><table><thead><tr><th>Plate</th><th>Reason</th><th>Added by</th><th></th></tr></thead><tbody>'+(j.length?j.map(function(r){return '<tr><td><span class="plate">'+esc(r[0])+'</span></td><td>'+esc(r[1])+'</td><td>'+esc(r[2])+'</td><td><button class="btn sm" data-wl="'+esc(r[0])+'">Remove</button></td></tr>';}).join(""):'<tr><td colspan="4" class="empty">No watchlisted plates.</td></tr>')+'</tbody></table></div><p class="sub">A watchlisted plate is refused at check-in and logged.</p>';
  }).catch(fail);
  else if(admTab==="audit")api("/api/audit").then(function(j){b.innerHTML=tbl(["Time","User","Action","Detail"],j);}).catch(fail);
  else b.innerHTML='<h3>Add staff login</h3><div class="opts"><input id="un" class="plain" placeholder="Username"><input id="up" type="password" class="plain" placeholder="Password (8+ chars)"><select id="ur"><option value="attendant">Attendant</option><option value="admin">Admin</option></select><button class="btn sm primary" id="uAdd">Create login</button></div>'+
   '<h3>Change my password</h3><div class="opts"><input id="po" type="password" class="plain" placeholder="Current password"><input id="pn" type="password" class="plain" placeholder="New password (8+)"><button class="btn sm" id="pwSet">Update</button></div>'+
   '<h3>Backup</h3><div class="opts"><button class="btn sm" id="bk">Create backup now</button><span class="sub" id="bkr"></span></div>';
}
document.querySelectorAll("[data-adm]").forEach(function(b){b.addEventListener("click",function(){
  admTab=b.dataset.adm;document.querySelectorAll("[data-adm]").forEach(function(x){x.setAttribute("aria-pressed",String(x===b));});loadAdmin();});});
$("adminBody").addEventListener("click",function(e){
  var b=e.target.closest("button");if(!b)return;
  var ok=function(m){return function(){toast(m);loadAdmin();};},bad=function(x){toast(x.message,true);};
  if(b.dataset.wl)api("/api/watchlist/remove",{plate:b.dataset.wl}).then(ok("Removed from watchlist.")).catch(bad);
  else if(b.id==="wlAdd")api("/api/watchlist",{plate:$("wp").value,reason:$("wr").value}).then(ok("Added to watchlist.")).catch(bad);
  else if(b.id==="uAdd")api("/api/users",{username:$("un").value,password:$("up").value,role:$("ur").value}).then(function(){toast("Login created.");$("un").value="";$("up").value="";}).catch(bad);
  else if(b.id==="pwSet")api("/api/password",{old:$("po").value,new:$("pn").value}).then(function(){toast("Password updated.");$("po").value="";$("pn").value="";}).catch(bad);
  else if(b.id==="bk")api("/api/backup",{}).then(function(j){$("bkr").textContent="Saved to "+j.folder+" ("+j.rows.tickets+" tickets)";}).catch(bad);
});
$("lgo").addEventListener("click",doLogin);
["lu","lp"].forEach(function(i){$(i).addEventListener("keydown",function(e){if(e.key==="Enter")doLogin();});});
$("logout").addEventListener("click",function(){api("/api/logout",{}).catch(function(){}).then(showLogin);});

function begin(){if(!load()||!state.tickets.length)seed();renderAll();}
fetch("/api/ping").then(function(r){return r.json();}).then(function(j){if(j&&j.ok)srvStart();else begin();}).catch(begin);
tick();setInterval(tick,1000);
