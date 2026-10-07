const IDRE = /^[A-Za-z0-9_]+$/;
const META = {
  works:     {category:'work', name:'作品', file:'works.json', flat:false},
  attribute: {category:'attribute', name:'属性', file:'attribute.json', flat:true},
  costume:   {category:'costume', name:'コスチューム', file:'costume.json', flat:true},
  situation: {category:'situation', name:'シチュ', file:'situation.json', flat:true},
};
const DB = {works:null, attribute:null, costume:null, situation:null};
let tab = 'works';
const esc = s => (s==null?'':String(s)).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const STORAGE_PREFIX = 'tagJsonEditor:';
function saveDB(key){
  try{ localStorage.setItem(STORAGE_PREFIX+key, JSON.stringify(DB[key])); }catch(e){}
}
function loadAllFromStorage(){
  Object.keys(META).forEach(k=>{
    try{
      const raw = localStorage.getItem(STORAGE_PREFIX+k);
      if(raw) DB[k] = JSON.parse(raw);
    }catch(e){}
  });
}
function clearStorage(key){
  if(!confirm('保存されている'+META[key].name+'のデータを消去しますか？（このタブの編集内容が失われます）')) return;
  try{ localStorage.removeItem(STORAGE_PREFIX+key); }catch(e){}
  DB[key] = null;
  render();
}
window.clearStorage = clearStorage;

function renderTabs(){
  const pending = INBOX.tags.length;
  document.getElementById('tabs').innerHTML = Object.keys(META).map(k=>
    `<button class="tab ${k===tab?'active':''}" onclick="switchTab('${k}')">${META[k].name}</button>`).join('')
    + `<button class="tab ${tab==='inbox'?'active':''}" onclick="switchTab('inbox')">未分類タグ${pending?` (${pending})`:''}</button>`;
}
function switchTab(k){ tab=k; render(); }
window.switchTab = switchTab;

function loadFile(key, input){
  const f = input.files[0];
  if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const d = JSON.parse(r.result);
      if(!Array.isArray(d.items)) throw new Error('items配列がありません');
      d.items.forEach(it=>{ if(META[key].flat){ } else { it.characters = it.characters||[]; } });
      DB[key] = d;
      saveDB(key);
      render();
    }catch(e){ alert('JSON読み込みエラー: '+e.message); }
  };
  r.readAsText(f, 'utf-8');
}
window.loadFile = loadFile;

function newBlank(key){
  const m = META[key];
  DB[key] = {version:1, category:m.category, name:m.name, items:[]};
  saveDB(key);
  render();
}
window.newBlank = newBlank;

function download(key){
  const data = JSON.stringify(DB[key], null, 2);
  const filename = META[key].file;
  if(window.claude && typeof window.claude.use === 'function'){
    window.claude.use('downloads').then(d=>{
      if(d){ d.save({filename, data}).catch(()=>fallbackDownload(filename,data)); }
      else fallbackDownload(filename,data);
    }).catch(()=>fallbackDownload(filename,data));
  } else {
    fallbackDownload(filename,data);
  }
}
window.download = download;
function fallbackDownload(filename,data){
  const blob = new Blob([data],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000);
}

// ---------- flat categories (attribute/costume/situation) ----------
function flatDupIds(items){
  const c={}; items.forEach(it=>{c[it.id]=(c[it.id]||0)+1;});
  return new Set(Object.keys(c).filter(k=>c[k]>1));
}
function updateFlatItem(key, idx, field, val){
  DB[key].items[idx][field] = val;
  saveDB(key);
  render();
}
window.updateFlatItem = updateFlatItem;
function removeFlatItem(key, idx){
  if(!confirm('このタグを削除しますか？')) return;
  DB[key].items.splice(idx,1); saveDB(key); render();
}
window.removeFlatItem = removeFlatItem;
function addFlatItem(key){
  const idEl = document.getElementById('new-id-'+key);
  const nameEl = document.getElementById('new-name-'+key);
  const id = idEl.value.trim(), name = nameEl.value.trim();
  const box = document.getElementById('flat-msg-'+key);
  if(!id || !name){ box.innerHTML='<div class="msg err">idと名前を入力してください</div>'; return; }
  if(!IDRE.test(id)){ box.innerHTML='<div class="msg err">idは半角英数字とアンダーバーのみ使用できます</div>'; return; }
  if(DB[key].items.some(it=>it.id===id)){ box.innerHTML='<div class="msg err">同じidが既に存在します: '+esc(id)+'</div>'; return; }
  DB[key].items.push({id,name});
  idEl.value=''; nameEl.value='';
  saveDB(key);
  render();
}
window.addFlatItem = addFlatItem;

function renderFlat(key){
  const m = META[key];
  const d = DB[key];
  if(!d){
    return `<div class="card">
      <h3>${m.name} (${m.file})</h3>
      <input type="file" accept=".json" onchange="loadFile('${key}',this)">
      <div class="small" style="margin-top:6px">一度読み込んだ内容はブラウザに自動保存され、次回開いたときも引き継がれます</div>
      <div style="margin-top:8px"><button class="sec" onclick="newBlank('${key}')">新規で作成する</button></div>
    </div>`;
  }
  const dups = flatDupIds(d.items);
  const items = d.items.map((it,i)=>`
    <div class="item ${dups.has(it.id)?'dup':''}">
      <div class="row">
        <div class="field"><label>id</label><input type="text" value="${esc(it.id)}" onchange="updateFlatItem('${key}',${i},'id',this.value.trim())"></div>
        <div class="field" style="flex:2"><label>名前</label><input type="text" value="${esc(it.name)}" onchange="updateFlatItem('${key}',${i},'name',this.value.trim())"></div>
        <button class="danger" onclick="removeFlatItem('${key}',${i})">削除</button>
      </div>
    </div>`).join('');
  return `<div class="card">
    <h3>${m.name} (${m.file}) — ${d.items.length}件</h3>
    ${dups.size?`<div class="msg err">id重複: ${[...dups].map(esc).join(', ')}</div>`:''}
    ${items || '<div class="small">タグがありません</div>'}
    <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
      <div class="row">
        <input type="text" id="new-id-${key}" placeholder="新規id（半角英数_）">
        <input type="text" id="new-name-${key}" placeholder="新規名前">
        <button onclick="addFlatItem('${key}')">追加</button>
      </div>
      <div id="flat-msg-${key}"></div>
    </div>
    <div style="margin-top:10px"><button class="sec" onclick="download('${key}')">JSONをダウンロード</button>
    <label style="display:inline-block;margin-left:8px"><input type="file" accept=".json" onchange="loadFile('${key}',this)" style="font-size:12px"></label>
    <button class="ghost" style="margin-left:4px" onclick="clearStorage('${key}')">保存データを消去</button></div>
  </div>`;
}

// ---------- works ----------
function worksDupInfo(){
  const d = DB.works;
  const wIdCount={}, wNameCount={}, charGlobal={};
  d.items.forEach(w=>{
    wIdCount[w.id]=(wIdCount[w.id]||0)+1;
    wNameCount[w.name]=(wNameCount[w.name]||0)+1;
    (w.characters||[]).forEach(c=>{ charGlobal[c.id]=(charGlobal[c.id]||0)+1; });
  });
  return {wIdCount,wNameCount,charGlobal};
}
function updateWorkField(idx, field, val){
  DB.works.items[idx][field] = field==='aliases' ? val.split(',').map(s=>s.trim()).filter(Boolean) : val;
  saveDB('works');
  render();
}
window.updateWorkField = updateWorkField;
function removeWork(idx){
  if(!confirm('この作品を削除しますか？（キャラクターも全て削除されます）')) return;
  DB.works.items.splice(idx,1); saveDB('works'); render();
}
window.removeWork = removeWork;
function updateCharField(wIdx, cIdx, field, val){
  DB.works.items[wIdx].characters[cIdx][field] = field==='aliases' ? val.split(',').map(s=>s.trim()).filter(Boolean) : val;
  saveDB('works');
  render();
}
window.updateCharField = updateCharField;
function removeChar(wIdx, cIdx){
  if(!confirm('このキャラクターを削除しますか？')) return;
  DB.works.items[wIdx].characters.splice(cIdx,1); saveDB('works'); render();
}
window.removeChar = removeChar;

function addCharacter(){
  const mode = document.querySelector('input[name=work-mode]:checked').value;
  const msgBox = document.getElementById('add-msg');
  let workIdx;
  if(mode==='existing'){
    const sel = document.getElementById('work-select');
    workIdx = Number(sel.value);
    if(isNaN(workIdx)){ msgBox.innerHTML='<div class="msg err">作品を選択してください</div>'; return; }
  } else {
    const newId = document.getElementById('new-work-id').value.trim();
    const newName = document.getElementById('new-work-name').value.trim();
    const newAliases = document.getElementById('new-work-aliases').value.trim();
    if(!newId || !newName){ msgBox.innerHTML='<div class="msg err">新規作品のidと名前を入力してください</div>'; return; }
    if(!IDRE.test(newId)){ msgBox.innerHTML='<div class="msg err">作品idは半角英数字とアンダーバーのみです</div>'; return; }
    if(DB.works.items.some(w=>w.id===newId)){ msgBox.innerHTML='<div class="msg err">同じ作品idが既に存在します: '+esc(newId)+'</div>'; return; }
    if(DB.works.items.some(w=>w.name===newName)){ msgBox.innerHTML='<div class="msg err">同じ作品名が既に存在します: '+esc(newName)+'</div>'; return; }
    const w = {id:newId, name:newName, characters:[]};
    if(newAliases) w.aliases = newAliases.split(',').map(s=>s.trim()).filter(Boolean);
    DB.works.items.push(w);
    workIdx = DB.works.items.length-1;
  }
  const cid = document.getElementById('new-char-id').value.trim();
  const cname = document.getElementById('new-char-name').value.trim();
  const caliases = document.getElementById('new-char-aliases').value.trim();
  if(!cid || !cname){ msgBox.innerHTML='<div class="msg err">キャラクターidと名前を入力してください</div>'; return; }
  if(!IDRE.test(cid)){ msgBox.innerHTML='<div class="msg err">キャラクターidは半角英数字とアンダーバーのみです</div>'; return; }
  const work = DB.works.items[workIdx];
  if(work.characters.some(c=>c.id===cid)){ msgBox.innerHTML='<div class="msg err">この作品内に同じキャラクターidが既に存在します: '+esc(cid)+'</div>'; return; }
  const c = {id:cid, name:cname};
  if(caliases) c.aliases = caliases.split(',').map(s=>s.trim()).filter(Boolean);
  work.characters.push(c);
  ['new-char-id','new-char-name','new-char-aliases','new-work-id','new-work-name','new-work-aliases'].forEach(id=>{const e=document.getElementById(id); if(e) e.value='';});
  saveDB('works');
  render();
}
window.addCharacter = addCharacter;
function toggleWorkMode(){
  const mode = document.querySelector('input[name=work-mode]:checked').value;
  document.getElementById('existing-work-box').style.display = mode==='existing'?'':'none';
  document.getElementById('new-work-box').style.display = mode==='new'?'':'none';
}
window.toggleWorkMode = toggleWorkMode;

function renderWorks(){
  const d = DB.works;
  if(!d){
    return `<div class="card">
      <h3>作品/キャラクター (works.json)</h3>
      <input type="file" accept=".json" onchange="loadFile('works',this)">
      <div class="small" style="margin-top:6px">一度読み込んだ内容はブラウザに自動保存され、次回開いたときも引き継がれます</div>
      <div style="margin-top:8px"><button class="sec" onclick="newBlank('works')">新規で作成する</button></div>
    </div>`;
  }
  const {wIdCount,wNameCount,charGlobal} = worksDupInfo();
  const totalChars = d.items.reduce((s,w)=>s+(w.characters||[]).length,0);
  const worksHtml = d.items.map((w,wi)=>{
    const isDup = wIdCount[w.id]>1 || wNameCount[w.name]>1;
    const chars = (w.characters||[]).map((c,ci)=>{
      const dup = charGlobal[c.id]>1;
      return `<div class="char ${dup?'dup':''}">
        <input type="text" class="field" value="${esc(c.id)}" onchange="updateCharField(${wi},${ci},'id',this.value.trim())">
        <input type="text" class="field" style="flex:1" value="${esc(c.name)}" onchange="updateCharField(${wi},${ci},'name',this.value.trim())">
        <input type="text" class="field" style="flex:1" placeholder="別名(カンマ区切り)" value="${esc((c.aliases||[]).join(', '))}" onchange="updateCharField(${wi},${ci},'aliases',this.value)">
        <button class="ghost" onclick="removeChar(${wi},${ci})">削除</button>
      </div>`;
    }).join('') || '<div class="small" style="padding:6px 0">キャラクターなし</div>';
    return `<details class="work ${isDup?'dup':''}">
      <summary><span>${esc(w.name)} <span class="small">(${esc(w.id)}) ・キャラ${(w.characters||[]).length}件</span></span></summary>
      <div class="work-body">
        <div class="row" style="margin:6px 0">
          <div class="field"><label>作品id</label><input type="text" value="${esc(w.id)}" onchange="updateWorkField(${wi},'id',this.value.trim())"></div>
          <div class="field" style="flex:2"><label>作品名</label><input type="text" value="${esc(w.name)}" onchange="updateWorkField(${wi},'name',this.value.trim())"></div>
        </div>
        <div class="row"><div class="field" style="flex:1"><label>別名(カンマ区切り)</label><input type="text" value="${esc((w.aliases||[]).join(', '))}" onchange="updateWorkField(${wi},'aliases',this.value)"></div></div>
        <button class="danger" style="margin:6px 0" onclick="removeWork(${wi})">作品を削除</button>
        <div>${chars}</div>
      </div>
    </details>`;
  }).join('');

  const dupList = [];
  Object.keys(wIdCount).forEach(k=>{ if(wIdCount[k]>1) dupList.push('作品id: '+k); });
  Object.keys(wNameCount).forEach(k=>{ if(wNameCount[k]>1) dupList.push('作品名: '+k); });
  Object.keys(charGlobal).forEach(k=>{ if(charGlobal[k]>1) dupList.push('キャラid: '+k); });

  const workOptions = d.items.map((w,i)=>`<option value="${i}">${esc(w.name)} (${esc(w.id)})</option>`).join('');

  return `<div class="card">
    <h3>作品/キャラクター (works.json) — 作品${d.items.length}件・キャラ${totalChars}件</h3>
    ${dupList.length?`<div class="msg err">重複を検出: ${dupList.map(esc).join(' / ')}</div>`:''}
    <div class="overflow">${worksHtml}</div>
  </div>
  <div class="card">
    <h3>キャラクター（または作品）を追加</h3>
    <div class="row" style="margin-bottom:6px">
      <label><input type="radio" name="work-mode" value="existing" checked onchange="toggleWorkMode()"> 既存の作品を選択</label>
      <label><input type="radio" name="work-mode" value="new" onchange="toggleWorkMode()"> 新規作品を追加</label>
    </div>
    <div id="existing-work-box"><select id="work-select" style="width:100%">
      <option value="">-- 作品を選択 --</option>${workOptions}
    </select></div>
    <div id="new-work-box" style="display:none">
      <div class="row">
        <input type="text" id="new-work-id" placeholder="新規作品id（半角英数_）">
        <input type="text" id="new-work-name" placeholder="新規作品名">
      </div>
      <input type="text" id="new-work-aliases" placeholder="作品の別名(カンマ区切り・任意)" style="width:100%;margin-top:6px">
    </div>
    <div style="border-top:1px solid var(--border);margin:10px 0 6px;padding-top:8px" class="small">キャラクター情報</div>
    <div class="row">
      <input type="text" id="new-char-id" placeholder="キャラid（半角英数_）">
      <input type="text" id="new-char-name" placeholder="キャラ名">
    </div>
    <input type="text" id="new-char-aliases" placeholder="キャラの別名(カンマ区切り・任意)" style="width:100%;margin-top:6px">
    <div style="margin-top:8px"><button onclick="addCharacter()">追加</button></div>
    <div id="add-msg"></div>
  </div>
  <div class="card">
    <button class="sec" onclick="download('works')">JSONをダウンロード</button>
    <label style="display:inline-block;margin-left:8px"><input type="file" accept=".json" onchange="loadFile('works',this)" style="font-size:12px"></label>
    <button class="ghost" style="margin-left:4px" onclick="clearStorage('works')">保存データを消去</button>
  </div>`;
}

function render(){
  renderTabs();
  const m = document.getElementById('main');
  m.innerHTML = tab==='inbox' ? renderInbox() : (META[tab].flat ? renderFlat(tab) : renderWorks());
}


// ---------- x_bookmarker 連携: 未分類タグ ----------
// x_bookmarker の「カテゴリ未設定タグを書き出し」で作った JSON を読み込み、
// カテゴリ(とキャラなら作品)を選ぶだけで各JSONへ追加できる。
const INBOX_KEY = STORAGE_PREFIX+'inbox';
const INBOX = {tags:[]}; // {name,count,cat,id,work}
const CAT_OPTIONS = [
  ['','（未選択）'], ['work','作品'], ['char','キャラクター'], ['attribute','属性'], ['costume','コスチューム'], ['situation','シチュ'],
];
const nkey = s => String(s==null?'':s).normalize('NFKC').toLowerCase().trim();
function saveInbox(){ try{ localStorage.setItem(INBOX_KEY, JSON.stringify(INBOX)); }catch(e){} }
function loadInbox(){
  try{ const raw = localStorage.getItem(INBOX_KEY); if(raw){ const d = JSON.parse(raw); if(Array.isArray(d.tags)) INBOX.tags = d.tags; } }catch(e){}
}
/** 既に登録済みの名前(作品/キャラ/属性/コスチューム/シチュ。別名も含む)のキー集合 */
function registeredKeys(){
  const set = new Set();
  const add = it => { if(!it) return; set.add(nkey(it.name)); (it.aliases||[]).forEach(a=>set.add(nkey(a))); };
  ['works','attribute','costume','situation'].forEach(k=>{
    if(!DB[k]) return;
    DB[k].items.forEach(it=>{ add(it); (it.characters||[]).forEach(add); });
  });
  return set;
}
function loadInboxFile(input){
  const f = input.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const d = JSON.parse(r.result);
      if(d.kind!=='xbm-uncategorized-tags' || !Array.isArray(d.tags)) throw new Error('x_bookmarkerの「カテゴリ未設定タグを書き出し」で作ったJSONではありません');
      const have = new Set(INBOX.tags.map(t=>nkey(t.name)));
      const reg = registeredKeys();
      let add=0, skipReg=0;
      d.tags.forEach(t=>{
        const name = String(t&&t.name||'').trim();
        if(!name || have.has(nkey(name))) return;
        if(reg.has(nkey(name))){ skipReg++; return; }
        INBOX.tags.push({name, count:Number(t.count)||0, cat:'', id:'', work:''});
        have.add(nkey(name)); add++;
      });
      INBOX.tags.sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name,'ja'));
      saveInbox();
      INBOX.msg = `${add}件を追加${skipReg?`（登録済みのため${skipReg}件は除外）`:''}`;
      render();
    }catch(e){ alert('読み込みエラー: '+e.message); }
  };
  r.readAsText(f,'utf-8');
  input.value='';
}
window.loadInboxFile = loadInboxFile;
function setInbox(i, field, val){
  INBOX.tags[i][field] = val;
  if(field==='cat' && val!=='char') INBOX.tags[i].work='';
  saveInbox(); render();
}
window.setInbox = setInbox;
function removeInbox(i){ INBOX.tags.splice(i,1); saveInbox(); render(); }
window.removeInbox = removeInbox;
function clearInbox(){
  if(!confirm('未分類タグの一覧をすべて消去しますか？（各JSONには影響しません）')) return;
  INBOX.tags = []; saveInbox(); render();
}
window.clearInbox = clearInbox;
function bulkCat(cat){
  INBOX.tags.forEach(t=>{ if(!t.cat){ t.cat = cat; if(cat!=='char') t.work=''; } });
  saveInbox(); render();
}
window.bulkCat = bulkCat;

/** idの自動生成: 名前から決まる短い英数字 (重複したら連番) */
function autoId(prefix, name, used){
  let h = 5381;
  for(const ch of name) h = ((h*33) ^ ch.codePointAt(0)) >>> 0;
  const base = prefix + h.toString(36);
  let id = base, n = 2;
  while(used.has(id)) id = base + '_' + (n++);
  return id;
}
function usedIds(cat){
  const used = new Set();
  if(cat==='work'||cat==='char'){
    if(DB.works) DB.works.items.forEach(w=>{ if(cat==='work') used.add(w.id); (w.characters||[]).forEach(c=>{ if(cat==='char') used.add(c.id); }); });
  } else if(DB[cat]) DB[cat].items.forEach(it=>used.add(it.id));
  return used;
}
const CAT_JSON = {work:'works', char:'works', attribute:'attribute', costume:'costume', situation:'situation'};
const ID_PREFIX = {work:'w_', char:'c_', attribute:'a_', costume:'k_', situation:'s_'};

function applyInbox(){
  const targets = INBOX.tags.filter(t=>t.cat);
  const box = document.getElementById('inbox-msg');
  if(!targets.length){ box.innerHTML='<div class="msg warn">カテゴリを選んだタグがありません</div>'; return; }
  // 事前チェック (何も変更せずに全部検証する)
  const errs = [];
  const need = new Set(targets.map(t=>CAT_JSON[t.cat]));
  need.forEach(k=>{ if(!DB[k]) errs.push(`「${META[k].name}」タブでJSONを読み込んでください`); });
  const plan = [];
  const used = {work:usedIds('work'), char:usedIds('char'), attribute:usedIds('attribute'), costume:usedIds('costume'), situation:usedIds('situation')};
  targets.forEach(t=>{
    if(t.cat==='char'){
      if(!DB.works) return;
      const w = DB.works.items.find(x=>x.id===t.work);
      if(!w){ errs.push(`「${t.name}」: 所属する作品を選んでください`); return; }
    }
    let id = (t.id||'').trim();
    if(id){
      if(!IDRE.test(id)){ errs.push(`「${t.name}」: idは半角英数字とアンダーバーのみです`); return; }
      if(used[t.cat].has(id)){ errs.push(`「${t.name}」: idが重複しています (${id})`); return; }
    } else id = autoId(ID_PREFIX[t.cat], t.name, used[t.cat]);
    used[t.cat].add(id);
    plan.push({t, id});
  });
  if(errs.length){ box.innerHTML = errs.map(e=>`<div class="msg err">${esc(e)}</div>`).join(''); return; }
  plan.forEach(({t,id})=>{
    if(t.cat==='work') DB.works.items.push({id, name:t.name, characters:[]});
    else if(t.cat==='char') DB.works.items.find(x=>x.id===t.work).characters.push({id, name:t.name});
    else DB[t.cat].items.push({id, name:t.name});
  });
  need.forEach(k=>saveDB(k));
  const done = new Set(plan.map(p=>p.t));
  INBOX.tags = INBOX.tags.filter(t=>!done.has(t));
  saveInbox();
  INBOX.msg = `${plan.length}件を追加しました。各タブでJSONをダウンロードしてリポジトリに反映してください`;
  render();
}
window.applyInbox = applyInbox;

function renderInbox(){
  const msg = INBOX.msg ? `<div class="msg ok">${esc(INBOX.msg)}</div>` : '';
  INBOX.msg = '';
  const workOptions = (sel)=> '<option value="">-- 作品を選択 --</option>' + (DB.works?DB.works.items:[]).map(w=>`<option value="${esc(w.id)}" ${w.id===sel?'selected':''}>${esc(w.name)}</option>`).join('');
  const rows = INBOX.tags.map((t,i)=>`
    <div class="item">
      <div class="row">
        <div style="flex:2;min-width:120px"><b>${esc(t.name)}</b> <span class="small">${t.count}件</span></div>
        <select onchange="setInbox(${i},'cat',this.value)">${CAT_OPTIONS.map(([v,l])=>`<option value="${v}" ${v===t.cat?'selected':''}>${l}</option>`).join('')}</select>
        <button class="ghost" onclick="removeInbox(${i})">除外</button>
      </div>
      ${t.cat?`<div class="row" style="margin-top:6px">
        ${t.cat==='char'?`<select onchange="setInbox(${i},'work',this.value)" style="flex:1 1 140px">${workOptions(t.work)}</select>`:''}
        <input type="text" placeholder="id（空欄で自動）" value="${esc(t.id)}" onchange="setInbox(${i},'id',this.value.trim())">
      </div>`:''}
    </div>`).join('');
  const nSet = INBOX.tags.filter(t=>t.cat).length;
  return `<div class="card">
    <h3>未分類タグ（x_bookmarkerから連携）— ${INBOX.tags.length}件</h3>
    <div class="small" style="margin-bottom:8px">x_bookmarkerの「カテゴリ未設定タグを書き出し（jsonmaker用）」で作ったJSONを読み込みます。カテゴリを選んで「選択分を各JSONに追加」を押すと反映されます。追加先のJSON（作品/属性/コスチューム/シチュ）は先に各タブで読み込んでおいてください。</div>
    <input type="file" accept=".json" onchange="loadInboxFile(this)">
    ${msg}
    <div id="inbox-msg"></div>
  </div>
  ${INBOX.tags.length?`<div class="card">
    <div class="row" style="margin-bottom:8px"><span class="small">未選択を一括:</span>
      ${CAT_OPTIONS.filter(o=>o[0]).map(([v,l])=>`<button class="sec" onclick="bulkCat('${v}')">${l}</button>`).join('')}
    </div>
    ${rows}
    <div style="margin-top:10px" class="row">
      <button onclick="applyInbox()" ${nSet?'':'disabled'}>選択分(${nSet}件)を各JSONに追加</button>
      <button class="ghost" onclick="clearInbox()">一覧を消去</button>
    </div>
  </div>`:''}`;
}
loadInbox();
loadAllFromStorage();
render();
