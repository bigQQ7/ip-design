/* IP造型诊断台 —— 静态前端 + Supabase（登录、数据库、图片存储） */
"use strict";

const CFG = window.APP_CONFIG || {};
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const SITE_URL = location.origin + location.pathname;
const SCREENS = ["login", "setpw", "config", "app"];
function screen(name){ SCREENS.forEach(s => $("#screen-" + s).hidden = s !== name); }
function showErr(node, msg){ node.textContent = msg; node.hidden = !msg; }

/* 分类：从数据库读取，管理员可以新建、删除 */
const DIMS = { hl: "亮点", feature: "主特征", style: "风格", species: "物种", shape: "造型特点" };
let CATS = {
  hl: ["五官表情", "剪影", "融合创意", "配色", "比例体型"],
  feature: ["耳朵", "头型", "帽子/头饰", "头顶元素", "尾巴", "嘴", "角", "表情", "体型", "发型"],
  style: ["3D软胶", "2D平面", "娃系"],
  species: ["兔", "猫", "熊", "狗", "考拉", "狐狸", "羊", "鸭", "小怪", "蘑菇"]
};

/* ---------------- 五层自查清单 ---------------- */
const LAYERS = [
  { n: 1, t: "一票否决：看着难不难受", items: [
    { q: "缩小和放大看，轮廓都不让人难受（没有一圈小鼓包、肿胀形、突兀凸起）", fix: "把轮廓上的鼓包合并成 3 到 5 个大团，左右对称或一大几小；删掉突兀的凸起。", hl: "剪影" },
    { q: "头大身小，重心在下，站得稳", fix: "头放大或身体缩短，头身比控制在 1:1 到 1:1.5，腿改短粗、脚放宽。", hl: "比例体型" },
    { q: "眼睛没有被头发或配件遮住", fix: "露出眼睛；坚持遮挡的话，用嘴型、腮和身体姿态把情绪补回来。", hl: "五官表情" } ] },
  { n: 2, t: "识别：能不能一眼认出、说清楚", items: [
    { q: "能用「一只____的____」说出它是什么", fix: "先定物种，再定一个跨界元素，写成「一只____的____」。", hl: "融合创意" },
    { q: "涂黑之后，正面和背面都认得出", fix: "把主特征放大到剪影级别，让背面也能看到它。", hl: "剪影" },
    { q: "物种特征是剪影里最大的形，而且只有一个主角", fix: "保留一个主特征并放大，另一个缩小或删掉；不要把物种特征关在面窗里。", hl: "剪影" } ] },
  { n: 3, t: "融合：元素是长出来的还是贴上去的", items: [
    { q: "拿掉创意元素，轮廓会塌掉（说明它是长出来的）", fix: "让创意元素替换掉一个原有部位，比如直接变成耳朵、头顶或头型。", hl: "融合创意" },
    { q: "这张脸换到别的角色上，能看出区别（不是通用娃娃脸）", fix: "把物种的鼻子、嘴型、腮的形状加进脸里，或者去掉面窗让五官直接长在脸上。", hl: "五官表情" },
    { q: "身体和头部用的是同一种形状语言（不是空白素体）", fix: "身体加肚皮色块、尾巴，手脚边缘呼应头部的造型。", hl: "比例体型" } ] },
  { n: 4, t: "秩序：体块、比例、颜色有主次", items: [
    { q: "大、中、小体块清楚，有一个最大的形压住全身", fix: "确定一个最大的形，其余部件缩小，拉开大小对比。", hl: "比例体型" },
    { q: "一个主色铺大面积，点缀色在两处以上呼应", fix: "选一个主色铺大面积，点缀色降到一两个，并让它在两个以上部位出现。", hl: "配色" },
    { q: "细节集中在头部，身体干净", fix: "删掉身体上的细节，留给头部。", hl: "比例体型" } ] },
  { n: 5, t: "加分：态度与完整度", items: [
    { q: "表情有态度，并且和造型、颜色说的是同一件事", fix: "先写一个性格词，再按这个性格改眼型和嘴型。", hl: "五官表情" },
    { q: "三视图、表情、动作放在一起，仍然是同一个角色", fix: "检查背面和侧面，主特征是否还在、是否变形。", hl: "剪影" } ] }
];

/* ---------------- 启动 ---------------- */
if (!window.supabase || !CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("你的")) { screen("config"); throw new Error("config missing"); }
const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
let me = null, profile = null, isAdmin = false, recovering = false, started = false;

sb.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") { recovering = true; enter(); }
  if (event === "SIGNED_OUT") { started = false; screen("login"); }
});
(async () => {
  const { data } = await sb.auth.getSession();
  if (data.session) enter(); else screen("login");
})();

async function enter(){
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { screen("login"); return; }
  me = user;
  const { data: prof } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!prof || prof.role === "blocked") {
    await sb.auth.signOut();
    screen("login"); showErr($("#loginErr"), "这个账号没有使用权限，请联系老师。"); return;
  }
  profile = prof; isAdmin = prof.role === "admin";
  if (!prof.password_set || recovering) {
    $("#setpwWho").textContent = (prof.username || prof.email) + "，请设置登录密码";
    screen("setpw"); return;
  }
  screen("app");
  if (!started) { started = true; startApp(); }
}

/* ---------------- 登录 / 密码 ---------------- */
$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  const err = $("#loginErr"); showErr(err, "");
  const id = $("#loginId").value.trim(), pw = $("#loginPw").value;
  const btn = $("#loginBtn"); btn.disabled = true; btn.textContent = "正在登录…";
  try {
    let email = id;
    if (!id.includes("@")) {
      const { data, error } = await sb.rpc("email_for_username", { u: id });
      if (error || !data) throw new Error("bad");
      email = data;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password: pw });
    if (error) throw error;
    await enter();
  } catch (x) {
    showErr(err, x?.message?.includes("Email not confirmed") ? "邮箱还没有确认，请先点邀请邮件里的链接。" : "账号或密码不对。");
  } finally { btn.disabled = false; btn.textContent = "登录"; }
};
$("#forgotBtn").onclick = () => { $("#forgotForm").hidden = !$("#forgotForm").hidden; };
$("#magicBtn").onclick = () => { $("#magicForm").hidden = !$("#magicForm").hidden; };
$("#magicForm").onsubmit = async e => {
  e.preventDefault();
  const msg = $("#magicMsg"); msg.hidden = false; msg.textContent = "发送中…";
  const { error } = await sb.auth.signInWithOtp({ email: $("#magicEmail").value.trim(), options: { shouldCreateUser: true, emailRedirectTo: SITE_URL } });
  msg.textContent = error ? (String(error.message).includes("invited") || String(error.message).includes("Database") ? "这个邮箱还没有被邀请，请联系老师。" : "发送没有成功，过一分钟再试。") : "登录链接已发送，去邮箱点链接进入（也看看垃圾邮件箱）。";
};
$("#forgotForm").onsubmit = async e => {
  e.preventDefault();
  const msg = $("#forgotMsg");
  const { error } = await sb.auth.resetPasswordForEmail($("#forgotEmail").value.trim(), { redirectTo: SITE_URL });
  msg.hidden = false;
  msg.textContent = error ? "发送没有成功，过一分钟再试。" : "如果这个邮箱是成员邮箱，你会收到一封重设密码的邮件。";
};
$("#setpwForm").onsubmit = async e => {
  e.preventDefault();
  const err = $("#setpwErr"); showErr(err, "");
  const a = $("#newPw").value, b = $("#newPw2").value;
  if (a.length < 8) return showErr(err, "密码至少 8 位。");
  if (a !== b) return showErr(err, "两次输入的密码不一样。");
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) return showErr(err, "保存没有成功：" + (error.message.includes("different") ? "新密码不能和旧密码一样。" : "请再试一次。"));
  await sb.rpc("mark_password_set");
  recovering = false; $("#newPw").value = ""; $("#newPw2").value = "";
  await enter();
};
$("#logoutBtn").onclick = () => sb.auth.signOut();

/* ---------------- 图片：私有存储 + 临时链接 ---------------- */
const urlCache = new Map();
async function signUrls(paths){
  const now = Date.now();
  const need = [...new Set(paths)].filter(p => p && !(urlCache.get(p)?.exp > now));
  for (let i = 0; i < need.length; i += 100) {
    const { data } = await sb.storage.from("images").createSignedUrls(need.slice(i, i + 100), 3600);
    (data || []).forEach(d => { if (d.signedUrl && !d.error) urlCache.set(d.path, { url: d.signedUrl, exp: now + 3300 * 1000 }); });
  }
}
function imgEl(path, alt){
  const im = el("img"); im.alt = alt || ""; im.loading = "lazy"; im.dataset.path = path || "";
  const c = urlCache.get(path); if (c && c.exp > Date.now()) im.src = c.url;
  return im;
}
async function hydrate(root){
  const ims = [...root.querySelectorAll("img[data-path]")].filter(i => !i.getAttribute("src"));
  if (!ims.length) return;
  await signUrls(ims.map(i => i.dataset.path));
  ims.forEach(i => {
    const c = urlCache.get(i.dataset.path);
    if (c) i.src = c.url;
    else { const ph = el("div", "empty", "图片还没上传"); ph.style.padding = "12px"; i.replaceWith(ph); }
  });
}
async function shrink(blob, max = 1400){
  try {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, "image/jpeg", 0.86));
  } catch (e) { return blob; }
}
async function uploadImage(file, folder){
  const blob = await shrink(file, 1400);
  const path = folder + "/" + crypto.randomUUID() + ".jpg";
  const { error } = await sb.storage.from("images").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}
function wireDrop(drop, input, onFiles){
  drop.onclick = () => input.click();
  drop.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
  input.onchange = () => { onFiles([...input.files]); input.value = ""; };
  ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => onFiles([...e.dataTransfer.files]));
}
const isImg = f => f && f.type && f.type.startsWith("image/");

/* ---------------- 标签页 ---------------- */
const TABS = { check: "check", lib: "library", sub: "recommend", review: "review", members: "members" };
function showTab(k){
  Object.keys(TABS).forEach(x => { $("#tab-" + x).setAttribute("aria-selected", String(x === k)); $("#view-" + x).hidden = x !== k; });
  try { history.replaceState(null, "", "#" + TABS[k]); } catch (e) {}
  if (k === "lib") renderLib();
  if (k === "review") loadReview();
  if (k === "members") loadMembers();
  if (k === "sub") loadMySubs();
}
Object.keys(TABS).forEach(k => $("#tab-" + k).onclick = () => showTab(k));

document.addEventListener("paste", e => {
  if ($("#screen-app").hidden || $("#tagDlg").open || $("#dlg").open) return;
  const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === "file" && i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  if (!$("#view-check").hidden) setSelfImage(files[0]);
  else if (!$("#view-sub").hidden) addPicked(files);
  else if (!$("#view-lib").hidden && isAdmin) runBulk(files);
});

async function startApp(){
  $("#whoami").textContent = (profile.username || profile.email) + (isAdmin ? " · 管理员" : "");
  $("#tab-review").hidden = !isAdmin; $("#tab-members").hidden = !isAdmin; $("#addWrap").hidden = !isAdmin;
  await loadCats();
  $("#q").oninput = renderLib;
  buildChecklist(); buildFilters();
  await loadRefs();
  if (isAdmin) refreshPending();
  const k = Object.keys(TABS).find(x => "#" + TABS[x] === location.hash);
  showTab(k && !$("#tab-" + k).hidden ? k : "check");
}

/* ---------------- 造型自查 ---------------- */
function setSelfImage(f){
  if (!isImg(f)) return;
  $("#preview").src = URL.createObjectURL(f); $("#preview").hidden = false; $("#dropHint").hidden = true;
}
wireDrop($("#drop"), $("#file"), fs => setSelfImage(fs[0]));
function buildChecklist(){
  const box = $("#checklist"); box.replaceChildren();
  LAYERS.forEach(L => {
    const sec = el("div", "layer");
    const h = el("div", "layer-h"); h.append(el("span", "lv", "L" + L.n), el("span", null, L.t)); sec.append(h);
    L.items.forEach((it, i) => {
      const lab = el("label", "ck"); lab.htmlFor = "ck-" + L.n + "-" + i;
      const cb = el("input"); cb.type = "checkbox"; cb.id = "ck-" + L.n + "-" + i;
      lab.append(cb, el("span", null, it.q)); sec.append(lab);
    });
    box.append(sec);
  });
}
$("#checkReset").onclick = () => { document.querySelectorAll("#checklist input").forEach(c => c.checked = false); $("#checkResult").replaceChildren(); };
$("#checkRun").onclick = () => {
  const misses = [];
  LAYERS.forEach(L => L.items.forEach((it, i) => { if (!$("#ck-" + L.n + "-" + i).checked) misses.push({ ...it, n: L.n }); }));
  const core = misses.filter(m => m.n <= 4);
  const failLayer = core.length ? core[0].n : null;
  const box = $("#checkResult"); box.replaceChildren();
  const head = el("div", "verdict");
  head.append(el("div", "stamp " + (failLayer ? "fail" : "pass"), failLayer ? "不达标" : "达标"));
  const s = el("div");
  s.append(el("strong", null, failLayer ? "卡在第 " + failLayer + " 层：" + LAYERS[failLayer - 1].t : "前四层都做到了"));
  s.append(el("div", "note", failLayer ? "先只改这一层的问题，改完再从第一层重新检查。" : (misses.length ? "第五层还有可以加分的地方。" : "五层全部做到，可以推荐到案例库。")));
  head.append(s); box.append(head);
  const focus = failLayer ? misses.filter(m => m.n === failLayer) : misses;
  if (focus.length) {
    box.append(el("h2", null, failLayer ? "先改这些" : "还可以更好"));
    const ol = el("ol", "fixes"); focus.forEach(m => ol.append(el("li", null, m.fix))); box.append(ol);
    const later = failLayer ? misses.filter(m => m.n !== failLayer) : [];
    if (later.length) box.append(el("p", "note", "后面几层还有 " + later.length + " 项没做到，改完第 " + failLayer + " 层再看。"));
  }
  const want = {};
  misses.forEach(m => { want[m.hl] = (want[m.hl] || 0) + (m.n === failLayer ? 3 : 1); });
  const sp = $("#selfSpecies").value.trim();
  const scored = refs.map(r => {
    let sc = 0; (r.highlights || []).forEach(h => sc += want[h] || 0);
    if (sp && (r.species || "").split(/[、,，\s\/]/).some(x => x && (x.includes(sp) || sp.includes(x)))) sc += 2;
    return { r, sc };
  }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 6);
  if (scored.length) {
    const keys = Object.keys(want).sort((a, b) => want[b] - want[a]).slice(0, 2);
    box.append(el("h2", null, "参考这些达标案例（亮点：" + keys.join("、") + "）"));
    const g = el("div", "cards"); scored.forEach(x => g.append(refCard(x.r, x.r.learn))); box.append(g);
    hydrate(g);
  }
};

/* ---------------- 案例库 ---------------- */
let refs = [];
async function loadRefs(){
  const { data, error } = await sb.from("refs").select("*").order("is_base", { ascending: false }).order("created_at", { ascending: true });
  if (!error) refs = data || [];
}
const uncategorized = r => !r.feature_cat && !r.feature && !r.species;
const FEAT_KW = { "帽子/头饰": ["帽", "头饰", "头套"], "头顶元素": ["头顶"] };
const SHAPE_TERMS = {
  "大耳朵": /大(?:圆|尖|垂)?耳/,
  "小耳朵": /小(?:圆|尖|垂)?耳/,
  "大脸": /大(?:圆|方)?脸/,
  "小脸": /小(?:圆|方)?脸/
};
// Store shape options in the existing feature dimension, which has admin-only writes.
const SHAPE_PREFIX = "造型特点：";
let shapeCats = Object.keys(SHAPE_TERMS);
const SHAPE_PARENT_PREFIX = "造型归属：";
const shapeParents = new Map();
function shapeParent(name){
  if (shapeParents.has(name)) return shapeParents.get(name);
  if (name.includes("耳")) return "耳朵";
  if (/脸|头型/.test(name)) return "头型";
  if (/嘴|口|喙/.test(name)) return "嘴";
  if (/眼|眉|表情/.test(name)) return "表情";
  if (/尾/.test(name)) return "尾巴";
  if (/角/.test(name)) return "角";
  if (/发/.test(name)) return "发型";
  if (/帽|头饰/.test(name)) return "帽子/头饰";
  if (/体|胖|瘦/.test(name)) return "体型";
  return null;
}
function matchesFeature(r, parent){
  return r.feature_cat === parent ||
    (FEAT_KW[parent] || [parent]).some(k => ((r.feature || "") + (r.fusion || "")).includes(k)) ||
    shapeCats.some(tag => shapeParent(tag) === parent && matchesShape(r, tag));
}
function selectFacet(key, value){
  active[key] = value;
  if (key === "feature") active.shape = null;
  buildFilters();
  renderLib();
}
function matchesShape(r, term){
  const pattern = Object.hasOwn(SHAPE_TERMS, term) ? SHAPE_TERMS[term] : null;
  return [r.feature, r.feature_cat, r.fusion].some(value =>
    pattern ? pattern.test(value || "") : (value || "").includes(term));
}
const FACETS = [
  { key: "feature", dim: "feature", label: "主特征", opts: () => CATS.feature, match: matchesFeature },
  { key: "shape", dim: "shape", label: "造型特点", opts: () => shapeCats.filter(tag => shapeParent(tag) === active.feature), match: matchesShape },
  { key: "species", dim: "species", label: "物种", opts: () => CATS.species, match: (r, v) => (r.species || "").includes(v) },
  { key: "src", label: "来源", admin: true, opts: ["教学组原始库", "学生推荐", "老师上传", "未分类"], match: (r, v) => v === "未分类" ? uncategorized(r) : v === "学生推荐" ? !!r.from_user : v === "老师上传" ? (!r.is_base && !r.from_user) : r.is_base }
];
const active = {};
let manageCats = false;
async function loadCats(){
  const { data, error } = await sb.from("categories").select("dim,name,sort,created_at").order("sort").order("created_at");
  if (error || !data || !data.length) return;
  const c = { hl: [], feature: [], style: [], species: [] };
  const storedShapes = new Map();
  shapeParents.clear();
  data.forEach(r => {
    if (r.dim === "feature" && r.name.startsWith(SHAPE_PARENT_PREFIX)) {
      try {
        const [name, parent] = JSON.parse(r.name.slice(SHAPE_PARENT_PREFIX.length));
        if (typeof name === "string" && typeof parent === "string") shapeParents.set(name, parent);
      } catch {}
    } else if (r.dim === "feature" && r.name.startsWith(SHAPE_PREFIX)) {
      storedShapes.set(r.name.slice(SHAPE_PREFIX.length), r.sort);
    } else if (c[r.dim]) {
      c[r.dim].push(r.name);
    }
  });
  shapeCats = [...new Set([...Object.keys(SHAPE_TERMS), ...storedShapes.keys()])]
    .filter(name => storedShapes.get(name) !== -1);
  CATS = c;
}
async function addCat(dim){
  const parent = dim === "shape" ? active.feature : null;
  if (dim === "shape" && !parent) return null;
  const name = (prompt("新建「" + DIMS[dim] + "」分类，输入名称：") || "").trim();
  if (!name) return null;
  const options = dim === "shape" ? shapeCats : CATS[dim];
  if (dim === "feature" && (name.startsWith(SHAPE_PREFIX) || name.startsWith(SHAPE_PARENT_PREFIX))) {
    alert("请在「造型特点」一栏新增这个分类。");
    return null;
  }
  if (options.includes(name)) {
    if (dim === "shape" && shapeParent(name) !== parent) alert("这个子分类已属于「" + (shapeParent(name) || "未分组") + "」。请使用不同名称。");
    return name;
  }
  const { error } = dim === "shape"
    ? await sb.from("categories").upsert([
        { dim: "feature", name: SHAPE_PREFIX + name, sort: options.length },
        { dim: "feature", name: SHAPE_PARENT_PREFIX + JSON.stringify([name, parent]), sort: options.length }
      ], { onConflict: "dim,name" })
    : await sb.from("categories").insert({ dim, name, sort: options.length });
  if (error) { alert("添加没有成功，请再试一次。"); return null; }
  if (dim === "shape") shapeParents.set(name, parent);
  options.push(name); buildFilters();
  return name;
}
async function delCat(dim, name){
  const dbDim = dim === "shape" ? "feature" : dim;
  const dbName = dim === "shape" ? SHAPE_PREFIX + name : name;
  const { error } = dim === "shape" && Object.hasOwn(SHAPE_TERMS, name)
    ? await sb.from("categories").upsert({ dim: dbDim, name: dbName, sort: -1 }, { onConflict: "dim,name" })
    : await sb.from("categories").delete().eq("dim", dbDim).eq("name", dbName);
  if (error) { alert("删除没有成功，请再试一次。"); return false; }
  if (dim === "shape") shapeCats = shapeCats.filter(x => x !== name);
  else CATS[dim] = CATS[dim].filter(x => x !== name);
  return true;
}
function buildFilters(){
  const f = $("#filters"); f.replaceChildren();
  FACETS.filter(F => (!F.admin || isAdmin) && (F.key !== "shape" || active.feature)).forEach(F => {
    const row = el("div", F.key === "shape" ? "chips subfilters" : "chips");
    row.append(el("span", "lbl", F.key === "shape" ? active.feature + "细分" : F.label));
    const all = el("button", "chip", "全部"); all.type = "button";
    all.setAttribute("aria-pressed", String(!active[F.key]));
    all.onclick = () => selectFacet(F.key, null);
    row.append(all);
    const opts = typeof F.opts === "function" ? F.opts() : F.opts;
    opts.forEach(o => {
      const c = el("button", "chip", manageCats && F.dim ? o + " ×" : o); c.type = "button";
      c.setAttribute("aria-pressed", String(active[F.key] === o));
      c.onclick = async () => {
        if (manageCats && F.dim) {
          if (!c.dataset.armed) { c.dataset.armed = "1"; c.textContent = "删除「" + o + "」？再点一次"; c.classList.add("chip-danger"); return; }
          if (!await delCat(F.dim, o)) return;
          if (active[F.key] === o) selectFacet(F.key, null);
          else { buildFilters(); renderLib(); }
          return;
        }
        selectFacet(F.key, active[F.key] === o ? null : o);
      };
      row.append(c);
    });
    if (isAdmin && F.dim) {
      const add = el("button", "chip chip-add", F.key === "shape" ? "+ 新子分类" : "+ 新分类"); add.type = "button";
      add.onclick = () => addCat(F.dim);
      row.append(add);
    }
    f.append(row);
  });
  if (isAdmin) {
    const m = el("button", "link", manageCats ? "完成" : "管理分类（删除不用的分类）"); m.type = "button";
    m.onclick = () => { manageCats = !manageCats; buildFilters(); };
    f.append(m);
    if (manageCats) f.append(el("p", "note", "点一个分类两次就会删除它。删除分类不会改动已经分好类的案例。"));
  }
}
/* 分类选择器：上传和编辑共用 */
function catPicker(root){
  root.replaceChildren();
  const groups = {};
  const make = (dim, label, multi) => {
    const wrap = el("div", "field"); wrap.append(el("span", null, label + (multi ? "（可多选）" : "")));
    const box = el("div", "chips"); wrap.append(box);
    const g = { sel: new Set() };
    g.draw = () => {
      box.replaceChildren();
      const list = CATS[dim].concat([...g.sel].filter(v => !CATS[dim].includes(v)));
      list.forEach(o => {
        const c = el("button", "chip", o); c.type = "button"; c.setAttribute("aria-pressed", String(g.sel.has(o)));
        c.onclick = () => { if (g.sel.has(o)) g.sel.delete(o); else { if (!multi) g.sel.clear(); g.sel.add(o); } g.draw(); };
        box.append(c);
      });
      if (isAdmin) {
        const a = el("button", "chip chip-add", "+ 新分类"); a.type = "button";
        a.onclick = async () => { const n = await addCat(dim); if (n) { if (!multi) g.sel.clear(); g.sel.add(n); g.draw(); } };
        box.append(a);
      }
    };
    groups[dim] = g; root.append(wrap); g.draw();
  };
  make("feature", "主特征分类", false); make("style", "风格", false); make("species", "物种", true);
  return {
    set(t){
      groups.feature.sel = new Set(t?.feature_cat ? [t.feature_cat] : []);
      groups.style.sel = new Set(t?.style ? [t.style] : []);
      groups.species.sel = new Set((t?.species || "").split(/[、,，]/).map(s => s.trim()).filter(Boolean));
      Object.values(groups).forEach(g => g.draw());
    },
    get(){
      return { feature_cat: [...groups.feature.sel][0] || "", style: [...groups.style.sel][0] || "", species: [...groups.species.sel].join("、") };
    }
  };
}
/* 缩略图按原图比例排版：横图更宽、竖图更窄，每行高度一致（超长图从顶部裁切） */
const RATIO = new Map();
try { Object.entries(JSON.parse(localStorage.getItem("ip-ratios") || "{}")).forEach(([k, v]) => RATIO.set(k, v)); } catch (e) {}
let ratioTimer = null;
function saveRatios(){ clearTimeout(ratioTimer); ratioTimer = setTimeout(() => { try { localStorage.setItem("ip-ratios", JSON.stringify(Object.fromEntries(RATIO))); } catch (e) {} }, 500); }
function applyRatio(card, r){
  const c = Math.min(2.4, Math.max(0.6, r || 1));
  card.style.flex = c + " 1 calc(var(--row) * " + c + ")";
  const ph = card.querySelector(".ph"); if (ph) ph.style.aspectRatio = String(c);
  const im = card.querySelector("img"); if (im) im.style.objectPosition = r < 0.6 ? "top center" : "center";
}
const selectedCases = new Set();
let batchMode = false;
let visibleCases = [];
function updateBatchCount(){
  $("#batchCount").textContent = "已选 " + selectedCases.size + " 张";
  $("#batchPreview").disabled = !selectedCases.size || $("#batchValue").selectedIndex < 0;
}
function loadBatchValues(){
  const field = $("#batchField").value;
  const options = field === "feature" ? shapeCats : ["", ...CATS[field === "feature_cat" ? "feature" : "species"]];
  $("#batchValue").replaceChildren(...options.map(value => {
    const option = el("option", null, value || "清除分类");
    option.value = value;
    return option;
  }));
  updateBatchCount();
}
$("#editBatch").onclick = () => {
  if (!isAdmin) return;
  batchMode = !batchMode;
  selectedCases.clear();
  $("#editBatch").textContent = batchMode ? "退出批量修改" : "批量修改分类";
  $("#editBatch").setAttribute("aria-pressed", String(batchMode));
  $("#batchControls").hidden = !batchMode;
  if (batchMode) loadBatchValues();
  renderLib();
};
$("#batchField").onchange = loadBatchValues;
$("#batchAll").onclick = () => {
  if (!isAdmin || !batchMode) return;
  visibleCases.forEach(r => selectedCases.add(r.id));
  renderLib();
};
$("#batchClear").onclick = () => { selectedCases.clear(); renderLib(); };
$("#batchPreview").onclick = () => {
  if (!isAdmin || !batchMode) return;
  const field = $("#batchField").value;
  const value = $("#batchValue").value;
  if (field === "feature" && !shapeCats.includes(value)) return;
  const changes = refs.filter(r => selectedCases.has(r.id)).map(r => ({
    id: r.id,
    before: r[field],
    after: field === "feature"
      ? (matchesShape(r, value) ? r.feature : [r.feature, value].filter(Boolean).join("；"))
      : value
  })).filter(change => typeof change.after === "string");
  previewReview(changes, field);
};

function refCard(r, why, inLibrary = false){
  const b = el("button", "card"); b.type = "button";
  const ph = el("div", "ph"); ph.append(imgEl(r.image_path, r.name));
  b.append(ph);
  b.title = r.name; b.setAttribute("aria-label", r.name);
  if (!why) {
    b.classList.add("tile");
    applyRatio(b, RATIO.get(r.image_path));
    const im = ph.querySelector("img");
    if (im) im.addEventListener("load", () => {
      const nr = im.naturalWidth / im.naturalHeight;
      if (nr && Math.abs((RATIO.get(r.image_path) || 0) - nr) > 0.01) { RATIO.set(r.image_path, nr); saveRatios(); applyRatio(b, nr); }
    });
  }
  if (isAdmin && uncategorized(r)) ph.append(el("span", "unc-badge", "未分类"));
  if (why) { const bd = el("div", "bd"); bd.append(el("div", "why", why)); b.append(bd); }
  if (inLibrary) {
    const shapes = shapeCats.filter(tag => matchesShape(r, tag));
    const labels = [...new Set([...shapes, r.feature_cat, ...(r.species || "").split("、")].filter(Boolean))];
    if (labels.length) {
      const tags = el("div", "preview-tags");
      labels.forEach(label => tags.append(el("span", null, label)));
      ph.append(tags);
    }
    if (isAdmin && batchMode) {
      const mark = el("span", "batch-mark");
      function showSelection(){
        const selected = selectedCases.has(r.id);
        b.setAttribute("aria-pressed", String(selected));
        mark.textContent = selected ? "✓ 已选" : "○ 选择";
      }
      ph.append(mark);
      showSelection();
      b.onclick = () => {
        if (selectedCases.has(r.id)) selectedCases.delete(r.id);
        else selectedCases.add(r.id);
        showSelection();
        updateBatchCount();
      };
      return b;
    }
  }
  b.onclick = () => openRef(r);
  return b;
}
function renderLib(){
  const q = $("#q").value.trim();
  const list = refs.filter(r => {
    const hay = [r.name, r.species, r.fusion, r.feature, r.feature_cat, r.colors, r.style, r.mood, r.learn].join(" ");
    if (q && !q.split(/\s+/).every(w => hay.includes(w) || (Object.hasOwn(SHAPE_TERMS, w) && matchesShape(r, w)))) return false;
    return FACETS.every(F => !active[F.key] || F.match(r, active[F.key]));
  });
  $("#libCount").textContent = list.length + " / " + refs.length + " 个案例";
  visibleCases = list;
  updateBatchCount();
  const g = $("#libCards"); g.replaceChildren();
  if (!list.length) { g.append(el("div", "empty", refs.length ? "没有符合条件的案例，试试减少筛选条件。" : "案例库还是空的。")); return; }
  list.forEach(r => g.append(refCard(r, null, true)));
  hydrate(g);
}
/* ---------------- 管理员批量复核 ---------------- */
const reviewStatus = $("#reviewStatus");
const reviewDialog = $("#reviewImportDlg");
const reviewFile = $("#reviewFile");
let reviewChanges = [];

$("#reviewExport").onclick = async () => {
  if (!isAdmin) return;
  const button = $("#reviewExport");
  button.disabled = true;
  try {
    const cases = refs.filter(r => r.image_path);
    if (!cases.length) { reviewStatus.textContent = "案例库里没有可导出的图片。"; return; }
    const zip = new JSZip();
    const manifest = [];
    const skipped = [];
    for (const [i, r] of cases.entries()) {
      reviewStatus.textContent = "正在导出 " + (i + 1) + " / " + cases.length;
      try {
        const { data, error } = await sb.storage.from("images").download(r.image_path);
        if (error || !data?.size) throw new Error("图片无法下载");
        const ext = r.image_path.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "img";
        const file = "images/" + r.id + "." + ext;
        zip.file(file, data);
        manifest.push({ id: r.id, name: r.name, file, feature: r.feature, feature_cat: r.feature_cat, fusion: r.fusion });
      } catch {
        skipped.push(r.name);
      }
    }
    if (!manifest.length) throw new Error("图片无法下载");
    zip.file("cases.json", JSON.stringify({ version: 1, cases: manifest, skipped }, null, 2));
    const url = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
    const link = el("a");
    link.href = url;
    link.download = "案例图片-分类复核.zip";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    reviewStatus.textContent = "已导出 " + manifest.length + " 个案例。" +
      (skipped.length ? " " + skipped.length + " 张下载失败，名单在压缩包内。" : "");
  } catch {
    reviewStatus.textContent = "导出失败，请刷新页面后重试。";
  } finally {
    button.disabled = false;
  }
};

$("#reviewImport").onclick = () => { if (isAdmin) reviewFile.click(); };
reviewFile.onchange = async () => {
  const file = reviewFile.files[0];
  reviewFile.value = "";
  if (!isAdmin || !file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.version !== 1 || !Array.isArray(payload.changes) || !payload.changes.length) throw new Error();
    const seen = new Set();
    for (const change of payload.changes) {
      if (!change || typeof change.id !== "string" || seen.has(change.id) ||
          !(change.before === null || typeof change.before === "string") ||
          typeof change.after !== "string") throw new Error();
      seen.add(change.id);
    }
    previewReview(payload.changes, "feature");
  } catch {
    reviewStatus.textContent = "无法读取分类结果，请选择有效的分类 JSON 文件。";
  }
};

function previewReview(changes, field){
  const labels = { feature: "主特征（具体描述）", feature_cat: "主特征分类", species: "物种" };
  const byId = new Map(refs.map(r => [r.id, r]));
  const preview = $("#reviewChanges");
  preview.replaceChildren();
  reviewChanges = [];
  for (const change of changes) {
    const r = byId.get(change.id);
    const label = r?.name || change.id;
    const after = change.after.trim();
    if (!r || r[field] !== change.before) {
      preview.append(el("li", null, label + "：案例不存在或描述已更新，跳过。"));
    } else if (r[field] !== after) {
      const row = el("li", null, label);
      row.append(el("div", null, "原描述：" + (r[field] || "（空）")),
        el("div", null, "新描述：" + (after || "（空）")));
      preview.append(row);
      reviewChanges.push({ ...change, after, row, field });
    }
  }
  $("#reviewApply").disabled = !reviewChanges.length;
  $("#reviewImportStatus").textContent = reviewChanges.length + " 条可以保存。";
  $("#reviewField").textContent = "确认后更新：" + labels[field];
  reviewDialog.showModal();
}

$("#reviewClose").onclick = () => reviewDialog.close();
reviewDialog.addEventListener("cancel", e => {
  if ($("#reviewClose").disabled) e.preventDefault();
});
$("#reviewApply").onclick = async () => {
  if (!isAdmin || !reviewChanges.length) return;
  $("#reviewApply").disabled = $("#reviewClose").disabled = true;
  let saved = 0;
  try {
    for (const change of reviewChanges) {
      try {
        const update = sb.from("refs").update({ [change.field]: change.after }).eq("id", change.id);
        const guarded = change.before === null ? update.is(change.field, null) : update.eq(change.field, change.before);
        const { data, error } = await guarded.select("id").maybeSingle();
        if (error || !data) throw new Error();
        change.row.append(el("div", null, "已保存"));
        saved++;
      } catch {
        change.row.append(el("div", null, "未保存，案例可能已被更新。"));
      }
    }
    $("#reviewImportStatus").textContent = "已保存 " + saved + " / " + reviewChanges.length + " 条。";
    await loadRefs();
    renderLib();
  } finally {
    reviewChanges = [];
    $("#reviewClose").disabled = false;
  }
};

function openRef(r){
  const body = $("#dlgBody"); body.replaceChildren();
  const im = imgEl(r.image_path, r.name);
  const right = el("div"); right.append(el("h2", "h-first", r.name));
  const dl = el("dl");
  [["物种", r.species], ["主特征分类", r.feature_cat], ["主特征", r.feature], ["跨界元素", r.fusion], ["配色", r.colors], ["风格", r.style], ["表情", r.mood], ["借鉴点", r.learn], ["推荐理由", r.note]]
    .forEach(([k, v]) => { if (v) dl.append(el("dt", null, k), el("dd", null, v)); });
  right.append(dl);
  if (isAdmin && r.id) {
    const acts = el("div", "row");
    const ed = el("button", "btn ghost small", uncategorized(r) ? "分类" : "编辑分类"); ed.type = "button";
    ed.onclick = () => { $("#dlg").close(); openTagForm({ title: "分类与标签", tags: r, path: r.image_path, onSave: async t => {
      const { error } = await sb.from("refs").update(t).eq("id", r.id); if (error) throw error; await loadRefs(); renderLib(); } }); };
    const rm = el("button", "btn ghost small", "从案例库移除"); rm.type = "button";
    rm.onclick = async () => {
      if (!rm.dataset.armed) { rm.dataset.armed = "1"; rm.textContent = "再点一次确认移除"; rm.classList.add("danger"); return; }
      rm.disabled = true;
      const { error } = await sb.from("refs").delete().eq("id", r.id);
      if (error) { rm.textContent = "移除没有成功"; return; }
      if (r.image_path.startsWith("refs/")) await sb.storage.from("images").remove([r.image_path]);
      $("#dlg").close(); await loadRefs(); renderLib();
    };
    acts.append(ed, rm); right.append(acts);
  }
  body.append(im, right);
  hydrate(body);
  $("#dlg").showModal();
}
$("#dlgClose").onclick = () => $("#dlg").close();

/* 老师批量上传 */
$("#bulkOpen").onclick = () => $("#bulkFile").click();
$("#bulkFile").onchange = () => { const fs = [...$("#bulkFile").files]; $("#bulkFile").value = ""; runBulk(fs); };
let upFiles = [], upPicker = null;
function runBulk(files){
  files = files.filter(isImg);
  if (!files.length) return;
  if ($("#upDlg").open) { upFiles = upFiles.concat(files); drawUpThumbs(); return; }
  upFiles = files;
  upPicker = catPicker($("#upCats")); upPicker.set({});
  drawUpThumbs();
  $("#upGo").disabled = false;
  $("#upDlg").showModal();
}
function drawUpThumbs(){
  const t = $("#upThumbs"); t.replaceChildren();
  upFiles.forEach((f, i) => {
    const w = el("div", "thumb"); const im = el("img"); im.src = URL.createObjectURL(f); im.alt = "";
    const x = el("button", "thumb-x", "×"); x.type = "button"; x.setAttribute("aria-label", "移除这张");
    x.onclick = () => { upFiles.splice(i, 1); drawUpThumbs(); if (!upFiles.length) $("#upDlg").close(); };
    w.append(im, x); t.append(w);
  });
  $("#upCount").textContent = "已选 " + upFiles.length + " 张，可以继续粘贴添加。";
}
$("#upCancel").onclick = () => { upFiles = []; $("#upDlg").close(); };
$("#upForm").onsubmit = async e => {
  e.preventDefault();
  const tags = upPicker.get();
  const files = upFiles; upFiles = []; $("#upDlg").close();
  const prog = $("#bulkProg");
  const label = [tags.feature_cat, tags.species, tags.style].filter(Boolean).join(" · ");
  for (const f of files) {
    const nm = (f.name || "粘贴的图片").replace(/\.[^.]+$/, "");
    const li = el("li", null, nm + "：上传中…"); prog.prepend(li);
    try {
      const path = await uploadImage(f, "refs");
      const { error } = await sb.from("refs").insert({ name: nm === "image" ? "新案例" : nm, image_path: path, ...tags });
      if (error) throw error;
      li.textContent = nm + "：已加入" + (label ? "，分类：" + label : "，还没分类，在「来源 → 未分类」里点开它分类");
    } catch (x) { li.textContent = nm + "：没有成功，请再试一次"; li.style.color = "var(--fail)"; }
  }
  await loadRefs(); renderLib();
};

/* 导入基础案例图片（文件名 r01.jpg ~ r78.jpg） */
$("#baseOpen").onclick = () => $("#baseFile").click();
$("#baseFile").onchange = async () => {
  const files = [...$("#baseFile").files].filter(f => /^r\d{2}\.jpe?g$/i.test(f.name)); $("#baseFile").value = "";
  const li = el("li", null, ""); $("#bulkProg").prepend(li);
  if (!files.length) { li.textContent = "没有找到 r01.jpg 这样命名的图片。"; return; }
  let ok = 0;
  for (const f of files) {
    li.textContent = "正在导入基础案例图片 " + (ok + 1) + " / " + files.length + "…";
    const { error } = await sb.storage.from("images").upload("base/" + f.name.toLowerCase().replace(".jpeg", ".jpg"), f, { contentType: "image/jpeg", upsert: true });
    if (!error) ok++;
  }
  li.textContent = "基础案例图片导入完成：" + ok + " / " + files.length + " 张。";
  urlCache.clear(); renderLib();
};

/* ---------------- 分类表单 ---------------- */
const TAG_KEYS = ["name", "feature", "fusion", "colors", "mood", "learn"];
let tagPicker = null;
let tagSave = null;
function openTagForm({ title, tags, path, onSave, saveLabel }){
  $("#tagTitle").textContent = title;
  const p = $("#tagPreview"); p.replaceChildren(); if (path) { p.append(imgEl(path)); hydrate(p); }
  TAG_KEYS.forEach(k => $("#a-" + k).value = tags?.[k] || "");
  tagPicker = catPicker($("#tagCats")); tagPicker.set(tags || {});
  showErr($("#tagErr"), ""); $("#tagSave").disabled = false; $("#tagSave").textContent = saveLabel || "保存";
  tagSave = onSave; $("#tagDlg").showModal();
}
$("#tagCancel").onclick = () => $("#tagDlg").close();
$("#tagForm").onsubmit = async e => {
  e.preventDefault();
  const t = {}; TAG_KEYS.forEach(k => t[k] = $("#a-" + k).value.trim());
  Object.assign(t, tagPicker.get());
  if (!t.name) return showErr($("#tagErr"), "请填写名字。");
  $("#tagSave").disabled = true;
  try { await tagSave(t); $("#tagDlg").close(); }
  catch (x) { showErr($("#tagErr"), "保存没有成功，请再试一次。"); $("#tagSave").disabled = false; }
};

/* ---------------- 学生推荐 ---------------- */
let picked = [];
const MAX_PICK = 12;
wireDrop($("#subDrop"), $("#subFile"), fs => addPicked(fs));
function addPicked(files){
  showErr($("#subErr"), "");
  files.filter(isImg).forEach(f => {
    if (picked.length >= MAX_PICK) { showErr($("#subErr"), "一次最多 " + MAX_PICK + " 张，先提交这一批。"); return; }
    picked.push({ key: crypto.randomUUID(), file: f, url: URL.createObjectURL(f), note: "", state: "" });
  });
  renderPicked();
}
function renderPicked(){
  const box = $("#subPicked"); box.replaceChildren();
  $("#subHint").textContent = picked.length ? "已选 " + picked.length + " 张，可以继续点击、拖入或粘贴" : "点击、拖入或直接粘贴图片，可以一次多张";
  picked.forEach((p, i) => {
    const row = el("div", "sub-item"); row.style.gridTemplateColumns = "72px minmax(0,1fr) auto";
    const im = el("img"); im.src = p.url; im.alt = ""; im.style.width = im.style.height = "72px";
    const mid = el("div");
    const inp = el("input", "inp"); inp.id = "pick-" + p.key; inp.placeholder = "这张的推荐理由（可不填）"; inp.value = p.note; inp.style.width = "100%";
    inp.oninput = () => p.note = inp.value; mid.append(inp);
    if (p.state) mid.append(el("p", "note", p.state));
    const rm = el("button", "btn ghost small", "移除"); rm.type = "button"; rm.onclick = () => { picked.splice(i, 1); renderPicked(); };
    row.append(im, mid, rm); box.append(row);
  });
}
$("#subSend").onclick = async () => {
  const err = $("#subErr"); showErr(err, "");
  if (!picked.length) return showErr(err, "先选至少一张图。");
  const btn = $("#subSend"); btn.disabled = true;
  const shared = $("#subNote").value.trim(), src = $("#subSrc").value.trim();
  let failed = 0;
  for (let i = 0; i < picked.length; i++) {
    const p = picked[i]; btn.textContent = "正在提交 " + (i + 1) + " / " + picked.length + "…";
    try {
      const path = await uploadImage(p.file, "subs/" + me.id);
      const { error } = await sb.from("submissions").insert({ user_id: me.id, image_path: path, note: p.note.trim() || shared, src });
      if (error) throw error;
      p.done = true;
    } catch (e) { failed++; p.state = "没有提交成功"; }
  }
  picked = picked.filter(p => !p.done); renderPicked();
  if (failed) showErr(err, failed + " 张没有提交成功，留在列表里了，可以再点一次提交。");
  else { $("#subNote").value = ""; $("#subSrc").value = ""; }
  btn.disabled = false; btn.textContent = "提交推荐";
  loadMySubs();
};
const ST = { pending: ["待审核", "warn"], approved: ["已收录", "pass"], rejected: ["未通过", "fail"] };
async function loadMySubs(){
  const box = $("#mySubs");
  const { data, error } = await sb.from("submissions").select("*").eq("user_id", me.id).order("created_at", { ascending: false });
  box.replaceChildren();
  if (error) { box.append(el("div", "empty", "加载没有成功，刷新页面再试。")); return; }
  if (!data.length) { box.append(el("div", "empty", "还没有推荐。看到好看的 IP，传上来给大家参考吧。")); return; }
  data.forEach(it => {
    const row = el("div", "sub-item");
    const r = el("div"); const st = ST[it.status] || ST.pending;
    r.append(el("span", "pill " + st[1], st[0]));
    const p = el("p", null, it.note || "（没有写推荐理由）"); p.style.cssText = "margin:6px 0 0;font-size:14px"; r.append(p);
    if (it.status === "rejected" && it.reason) r.append(el("p", "note", "老师的意见：" + it.reason));
    let act = el("span");
    if (it.status === "pending") {
      act = el("button", "btn ghost small", "撤回"); act.type = "button";
      act.onclick = async () => { act.disabled = true; await sb.from("submissions").delete().eq("id", it.id); await sb.storage.from("images").remove([it.image_path]); loadMySubs(); };
    }
    row.append(imgEl(it.image_path), r, act); box.append(row);
  });
  hydrate(box);
}

/* ---------------- 审核（管理员） ---------------- */
let subs = [], people = {}, revStatus = "pending";
const sel = new Set();
[...$("#revFilter").children].forEach(b => b.onclick = () => { revStatus = b.dataset.st; [...$("#revFilter").children].forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderReview(); });
async function refreshPending(){
  const { count } = await sb.from("submissions").select("id", { count: "exact", head: true }).eq("status", "pending");
  $("#pendCount").textContent = count ? String(count) : "";
}
async function loadPeople(){
  const { data } = await sb.from("profiles").select("id,email,username,role");
  people = {}; (data || []).forEach(p => people[p.id] = p);
}
async function loadReview(){
  const [{ data }] = await Promise.all([sb.from("submissions").select("*").order("created_at", { ascending: false }), loadPeople()]);
  subs = data || []; renderReview();
}
const whoOf = id => { const p = people[id]; return p ? (p.username || p.email) : "已删除的成员"; };
const pend = () => subs.filter(s => s.status === "pending");
const targets = () => { const p = pend(); const s = p.filter(x => sel.has(x.id)); return s.length ? s : p; };
function armConfirm(btn, label, fn){
  const base = btn.textContent;
  btn.onclick = async () => {
    if (!btn.dataset.armed) {
      btn.dataset.armed = "1"; btn.textContent = label(); btn.classList.add("danger");
      setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = base; btn.classList.remove("danger"); } }, 5000);
      return;
    }
    delete btn.dataset.armed; btn.textContent = base; btn.classList.remove("danger");
    btn.disabled = true; try { await fn(); } finally { btn.disabled = false; }
  };
}
async function approve(it, tags){
  const row = { name: tags?.name || (it.src ? it.src.slice(0, 30) : "学生推荐"), image_path: it.image_path, from_user: it.user_id, note: it.note || "", ...(tags || {}) };
  const { error } = await sb.from("refs").insert(row); if (error) throw error;
  const { error: e2 } = await sb.from("submissions").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", it.id); if (e2) throw e2;
}
async function reject(it, reason){
  const { error } = await sb.from("submissions").update({ status: "rejected", reason: reason || "", reviewed_at: new Date().toISOString() }).eq("id", it.id);
  if (error) throw error;
}
async function afterReview(msg){ $("#bulkMsg").textContent = msg; sel.clear(); await Promise.all([loadReview(), loadRefs(), refreshPending()]); }
armConfirm($("#bulkOk"), () => "确认通过 " + targets().length + " 条", async () => {
  const list = targets(); let ok = 0;
  for (const it of list) { $("#bulkMsg").textContent = "正在收录 " + (ok + 1) + " / " + list.length + "…"; try { await approve(it); ok++; } catch (e) {} }
  await afterReview("已收录 " + ok + " 条，它们在案例库「来源 → 未分类」里，点开就能分类。");
});
armConfirm($("#bulkNo"), () => "确认退回 " + targets().length + " 条", async () => {
  const list = targets(); const reason = $("#bulkReason").value.trim(); let ok = 0;
  for (const it of list) { try { await reject(it, reason); ok++; } catch (e) {} }
  $("#bulkReason").value = "";
  await afterReview("已退回 " + ok + " 条。");
});
$("#selAll").onchange = () => { sel.clear(); if ($("#selAll").checked) pend().forEach(x => sel.add(x.id)); renderReview(); };
function renderReview(){
  const p = pend();
  $("#pendCount").textContent = p.length ? String(p.length) : "";
  [...sel].forEach(id => { if (!p.some(x => x.id === id)) sel.delete(id); });
  const isPend = revStatus === "pending";
  $("#bulkBar").hidden = !isPend || !p.length;
  $("#selAll").checked = p.length > 0 && sel.size === p.length;
  $("#selInfo").textContent = sel.size ? "已选 " + sel.size + " 条，批量操作只作用于选中的" : "不勾选时，批量操作作用于全部 " + p.length + " 条";
  const list = subs.filter(s => s.status === revStatus);
  const box = $("#revList"); box.replaceChildren();
  if (!list.length) { box.append(el("div", "empty", isPend ? "没有待审核的推荐。" : "这里还是空的。")); return; }
  list.forEach(it => {
    const card = el("div", "rev");
    const im = imgEl(it.image_path, "学生推荐的造型图");
    im.onclick = () => openRef({ name: "学生推荐", image_path: it.image_path, note: it.note });
    const r = el("div");
    const top = el("div", "meta");
    if (isPend) { const cb = el("input"); cb.type = "checkbox"; cb.id = "sel-" + it.id; cb.checked = sel.has(it.id); cb.onchange = () => { cb.checked ? sel.add(it.id) : sel.delete(it.id); renderReview(); }; top.append(cb); }
    top.append(document.createTextNode(whoOf(it.user_id) + " · " + new Date(it.created_at).toLocaleDateString("zh-CN") + (it.src ? " · 出处：" + it.src : "")));
    r.append(top);
    const n = el("p", null, "推荐理由：" + (it.note || "（没有填写）")); n.style.margin = "6px 0 0"; r.append(n);
    if (isPend) {
      const acts = el("div", "row");
      const ok = el("button", "btn small", "收录并分类"); ok.type = "button";
      ok.onclick = () => openTagForm({ title: "收录并分类", saveLabel: "确认收录", path: it.image_path, tags: { name: it.src ? it.src.slice(0, 30) : "" }, onSave: async t => { await approve(it, t); await afterReview("已收录 1 条。"); } });
      const quick = el("button", "btn ghost small", "直接收录（稍后分类）"); quick.type = "button";
      quick.onclick = async () => { quick.disabled = true; try { await approve(it); await afterReview("已收录 1 条，稍后在案例库「未分类」里分类。"); } catch (e) { quick.disabled = false; quick.textContent = "没有成功，再试一次"; } };
      acts.append(ok, quick); r.append(acts);
      const acts2 = el("div", "row");
      const rs = el("input", "inp"); rs.id = "reason-" + it.id; rs.placeholder = "不通过的原因（学生能看到，可不填）";
      const no = el("button", "btn ghost small", "不通过"); no.type = "button";
      no.onclick = async () => { no.disabled = true; try { await reject(it, rs.value.trim()); await afterReview("已退回 1 条。"); } catch (e) { no.disabled = false; no.textContent = "没有成功，再试一次"; } };
      acts2.append(rs, no); r.append(acts2);
    } else if (it.status === "rejected" && it.reason) r.append(el("p", "note", "不通过原因：" + it.reason));
    card.append(im, r); box.append(card);
  });
  hydrate(box);
}

/* ---------------- 成员与邀请（管理员） ---------------- */
// 发送邀请用一个不保存登录状态的独立连接，避免影响管理员自己的登录。
const inviter = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "ip-inviter" } });
async function sendInvite(email){
  const { error: e1 } = await sb.from("invites").upsert({ email: email.toLowerCase() });
  if (e1) throw e1;
  const { error } = await inviter.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: SITE_URL } });
  if (error) throw error;
}
$("#inviteSend").onclick = async () => {
  const emails = $("#inviteEmails").value.split(/[\s,，;；]+/).map(s => s.trim()).filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  const prog = $("#inviteProg");
  if (!emails.length) { prog.prepend(el("li", null, "没有找到有效的邮箱，每行写一个。")); return; }
  const btn = $("#inviteSend"); btn.disabled = true;
  for (const em of emails) {
    const li = el("li", null, em + "：发送中…"); prog.prepend(li);
    try { await sendInvite(em); li.textContent = em + "：邀请邮件已发送"; }
    catch (e) { li.textContent = em + "：没有发送成功" + (String(e?.message || "").includes("rate") ? "（发送太频繁，过一会儿再试）" : ""); li.style.color = "var(--fail)"; }
  }
  btn.disabled = false; $("#inviteEmails").value = "";
  loadMembers();
};
async function loadMembers(){
  const [{ data: inv }] = await Promise.all([sb.from("invites").select("*").order("invited_at", { ascending: false }), loadPeople()]);
  const box = $("#memberList"); box.replaceChildren();
  const byEmail = {}; Object.values(people).forEach(p => byEmail[(p.email || "").toLowerCase()] = p);
  const rows = [];
  Object.values(people).forEach(p => rows.push({ email: p.email, p }));
  (inv || []).forEach(i => { if (!byEmail[i.email.toLowerCase()]) rows.push({ email: i.email, p: null }); });
  if (!rows.length) { box.append(el("div", "empty", "还没有成员。")); return; }
  rows.forEach(({ email, p }) => {
    const row = el("div", "member");
    const left = el("div"); left.append(el("div", null, p?.username ? p.username + "（" + email + "）" : email));
    const status = !p ? ["已邀请，还没进入", "warn"] : p.role === "admin" ? ["管理员", "pass"] : p.role === "blocked" ? ["已停用", "fail"] : ["成员", "pass"];
    left.append(el("span", "pill " + status[1], status[0]));
    const act = el("div", "row"); act.style.marginTop = "0";
    if (!p) {
      const again = el("button", "btn ghost small", "重发邀请"); again.type = "button";
      again.onclick = async () => { again.disabled = true; try { await sendInvite(email); again.textContent = "已重发"; } catch (e) { again.textContent = "发送太频繁，稍后再试"; } };
      const del = el("button", "btn ghost small", "取消邀请"); del.type = "button";
      del.onclick = async () => { await sb.from("invites").delete().eq("email", email); loadMembers(); };
      act.append(again, del);
    } else if (p.role !== "admin") {
      const tog = el("button", "btn ghost small", p.role === "blocked" ? "恢复使用" : "停用"); tog.type = "button";
      tog.onclick = async () => { tog.disabled = true; await sb.from("profiles").update({ role: p.role === "blocked" ? "student" : "blocked" }).eq("id", p.id); loadMembers(); };
      act.append(tog);
    }
    row.append(left, act); box.append(row);
  });
}
