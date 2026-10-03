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
  document.getElementById('tabs').innerHTML = Object.keys(META).map(k=>
    `<button class="tab ${k===tab?'active':''}" onclick="switchTab('${k}')">${META[k].name}</button>`).join('');
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
  m.innerHTML = META[tab].flat ? renderFlat(tab) : renderWorks();
}
loadAllFromStorage();
render();
