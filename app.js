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
  feature: ["耳朵", "头型", "帽子/头饰", "头顶元素", "尾巴", "嘴", "角", "眼睛", "腮帮子", "体型", "发型"],
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
const CASE_TYPES = ["可爱", "潮酷", "真人像盲盒"];
function normalizeFeature(name){
  if (["表情", "眼睛表情", "眼睛/表情", "眼型", "眼睛／表情"].includes(name)) return "眼睛";
  return name;
}
function normalizeShape(name){
  if (["豆豆眼", "小豆豆眼", "小眼", "小眼睛/豆豆眼"].includes(name)) return "小眼睛";
  if (["含情脉脉眼", "大眼", "含情眼"].includes(name)) return "大眼睛";
  return name;
}
function featureOptions(options){
  return [...new Set([...options.map(normalizeFeature), "眼睛", "腮帮子"])];
}
const SHAPE_TERMS = {
  "大耳朵": /大(?:圆|尖|垂)?耳/,
  "小耳朵": /小(?:圆|尖|垂)?耳/,
  "大脸": /大(?:圆|方)?脸/,
  "小脸": /小(?:圆|方)?脸/,
  "小眼睛": /小眼|豆豆眼/,
  "大眼睛": /大眼|含情脉脉眼/,
  "明显鼓腮": /明显鼓腮|大腮/,
  "轻微鼓腮": /轻微鼓腮|小腮/,
  "腮不明显": /腮不明显/
};
// Store shape options in the existing feature dimension, which has admin-only writes.
const SHAPE_PREFIX = "造型特点：";
let shapeCats = Object.keys(SHAPE_TERMS);
const SHAPE_PARENT_PREFIX = "造型归属：";
const shapeParents = new Map();
function shapeParent(name){
  if (/腮|脸颊/.test(name)) return "腮帮子";
  if (/眼|眉/.test(name)) return "眼睛";
  if (shapeParents.has(name)) return shapeParents.get(name);
  if (name.includes("耳")) return "耳朵";
  if (/脸|头型/.test(name)) return "头型";
  if (/嘴|口|喙/.test(name)) return "嘴";
  if (/表情/.test(name)) return null;
  if (/尾/.test(name)) return "尾巴";
  if (/角/.test(name)) return "角";
  if (/发/.test(name)) return "发型";
  if (/帽|头饰/.test(name)) return "帽子/头饰";
  if (/体|胖|瘦/.test(name)) return "体型";
  return null;
}
function matchesFeature(r, parent){
  return normalizeFeature(r.feature_cat) === parent ||
    (FEAT_KW[parent] || [parent]).some(k => ((r.feature || "") + (r.fusion || "")).includes(k)) ||
    shapeCats.some(tag => shapeParent(tag) === parent && matchesShape(r, tag));
}
function selectFacet(key, value){
  active[key] = value;
  if (key === "feature") active.shape = null;
  buildFilters();
  renderLib();
}
const SHAPE_MARKER = "\n[造型分类]";
function shapeSelection(r){
  const at = (r.feature || "").lastIndexOf(SHAPE_MARKER);
  if (at < 0) return null;
  try {
    const tags = JSON.parse(r.feature.slice(at + SHAPE_MARKER.length));
    return Array.isArray(tags) && tags.every(tag => typeof tag === "string") ? tags : null;
  } catch { return null; }
}
function featureDescription(r){
  return (r.feature || "").split(SHAPE_MARKER)[0];
}
function matchesShape(r, term){
  const selected = shapeSelection(r);
  if (selected) return selected.map(normalizeShape).includes(term);
  const pattern = Object.hasOwn(SHAPE_TERMS, term) ? SHAPE_TERMS[term] : null;
  return [r.feature, r.feature_cat, r.fusion].some(value =>
    pattern ? pattern.test(value || "") : (value || "").includes(term));
}
const FACETS = [
  { key: "type", label: "大类", opts: CASE_TYPES, match: (r, value) => r.style === value },
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
  c.feature = featureOptions(c.feature);
  shapeCats = [...new Set(shapeCats.map(normalizeShape))];
  CATS = c;
}
async function addCat(dim){
  const parent = dim === "shape" ? active.feature : null;
  if (dim === "shape" && !parent) return null;
  const enteredName = (prompt("新建「" + DIMS[dim] + "」分类，输入名称：") || "").trim();
  if (!enteredName) return null;
  const name = dim === "shape" ? normalizeShape(enteredName) : dim === "feature" ? normalizeFeature(enteredName) : enteredName;
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
  make("feature", "主特征分类", false); make("species", "物种", true);
  return {
    set(t){
      groups.feature.sel = new Set(t?.feature_cat ? [normalizeFeature(t.feature_cat)] : []);
      groups.species.sel = new Set((t?.species || "").split(/[、,，]/).map(s => s.trim()).filter(Boolean));
      Object.values(groups).forEach(g => g.draw());
    },
    get(){
      return { feature_cat: [...groups.feature.sel][0] || "", species: [...groups.species.sel].join("、") };
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
  const options = field === "feature" ? shapeCats : field === "style" ? ["", ...CASE_TYPES] : ["", ...CATS[field === "feature_cat" ? "feature" : "species"]];
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
      ? (matchesShape(r, value) ? r.feature : shapeSelection(r) ? featureDescription(r) + SHAPE_MARKER + JSON.stringify([...shapeSelection(r), value]) : [r.feature, value].filter(Boolean).join("；"))
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
    const labels = [...new Set([...(CASE_TYPES.includes(r.style) ? [r.style] : []), ...shapes, normalizeFeature(r.feature_cat), ...(r.species || "").split("、")].filter(Boolean))];
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
  const labels = { feature: "主特征（具体描述）", feature_cat: "主特征分类", species: "物种", style: "大类" };
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

const REVIEW_SUGGESTIONS = {"b00a3234-cad5-4fcb-ba6d-3d7440cbb3c5":{"type":"可爱","tags":[]},"96cbb0ff-6840-4c7c-9b0a-00fb5b8c3a12":{"type":"可爱","tags":[]},"ea92d33d-2624-4abd-a755-4c16d12134f5":{"type":null,"tags":["小眼睛"]},"ca58f3c5-8541-4b67-9331-f6a84e570f5f":{"type":"可爱","tags":["小眼睛"]},"3e666d7a-33d8-47e1-9596-3d84ce7aee8b":{"type":"可爱","tags":[]},"d9a15857-7006-43be-879a-da5bf829b778":{"type":"可爱","tags":[]},"5d162e1f-dac0-4dc8-9b99-24bbd90c4266":{"type":"可爱","tags":[]},"cd076109-94bc-4d58-a8a5-45bb81b8ecf3":{"type":"可爱","tags":["小眼睛"]},"bd9afecc-074b-4b6b-bac3-c8fa98ec46ec":{"type":"可爱","tags":[]},"a6c92724-840b-45ca-818e-93411051962e":{"type":"可爱","tags":["小眼睛"]},"11e84976-e33a-4972-807d-69f8ef2d7ff1":{"type":"可爱","tags":["大眼睛"]},"610cc3e9-b97d-4290-b314-c8c0dbbdd154":{"type":"可爱","tags":["小眼睛"]},"c037fdb7-f57a-4f3a-bc61-25376006272e":{"type":"可爱","tags":[]},"830018f2-40ce-41ad-8d3f-a61843b4b6c9":{"type":"可爱","tags":[]},"c85b8532-d31a-4439-9ff2-ee23ce156249":{"type":null,"tags":[]},"c9406b55-c8f7-47d6-a40d-06a5bcd108d2":{"type":"可爱","tags":[]},"84939b6f-b2ee-421a-8687-3328d19d1748":{"type":"可爱","tags":["小眼睛"]},"3945c0b5-062b-45d3-bffc-4d201ae7072a":{"type":"可爱","tags":[]},"90a582c2-c4db-4bfb-88a4-571f94fdf798":{"type":"可爱","tags":["小眼睛"]},"a20fa587-d95e-4ef7-8913-2597349a32ef":{"type":"可爱","tags":["小眼睛"]},"d969f03c-2b42-44da-80b4-3a96d6ef9f52":{"type":"可爱","tags":["小眼睛"]},"8f7d5df2-4f45-42b0-a420-a29acf10be85":{"type":"可爱","tags":[]},"bbffd5d7-c7d8-4ff9-bb35-5883521d0d54":{"type":"可爱","tags":["小眼睛"]},"2d1654ba-54e6-4eec-82c0-460a71125229":{"type":"真人像盲盒","tags":[]},"d92074f1-6541-4600-8ee2-127ebeab57da":{"type":"可爱","tags":["小眼睛"]},"7451b2ec-3dd0-40b2-895a-fff03dd357fe":{"type":null,"tags":[]},"1bdd5ba2-a085-4361-859f-8196765490a6":{"type":"可爱","tags":[]},"a66f46ed-de61-4acb-aac1-66d79ff11aae":{"type":null,"tags":[]},"4a16561f-9762-4314-9a95-815cc4819f6c":{"type":"可爱","tags":[]},"f51c9506-2f51-4051-884b-317715c3847b":{"type":"可爱","tags":[]},"45171815-4555-4b8c-bb16-7d4e587565fc":{"type":"可爱","tags":["小眼睛"]},"972345fa-5316-4e1e-9576-ab1355a181b3":{"type":"可爱","tags":[]},"019da32b-084e-496e-836e-cf57ab4a8558":{"type":"可爱","tags":["小眼睛"]},"8e744659-92bf-4b13-bd4a-9ad35c255757":{"type":"可爱","tags":[]},"f7ae18e2-7949-4710-94bb-6eb7e1e1af4c":{"type":"可爱","tags":[]},"831a633f-2a6d-4484-acd5-700b6602db06":{"type":null,"tags":[]},"d8ec14b7-a107-4aff-a264-ad001b4b143f":{"type":null,"tags":[]},"64778ae3-a372-443c-b1ea-bc9cc0e03918":{"type":null,"tags":[]},"6e58d50b-b710-4576-8e81-21929ac968e1":{"type":"可爱","tags":[]},"bc6955fc-840c-4e08-b1c0-855ad5fcb4c8":{"type":"真人像盲盒","tags":[]},"420b5e84-efcf-4e8d-80b3-dff2aa6a8f21":{"type":"可爱","tags":[]},"06161b6d-532b-4d9f-9e09-3216247d51c1":{"type":"可爱","tags":[]},"ccd31b73-38f2-4f8d-9a54-0fb667092f59":{"type":"可爱","tags":["明显鼓腮","小眼睛"]},"6bd2af85-0862-433f-97ee-bc2657c9c7d6":{"type":"可爱","tags":[]},"2be95944-bc6b-46da-a1ed-f7590da5d29e":{"type":"可爱","tags":["明显鼓腮"]},"d26ff2f9-b4f7-4e9b-9244-dcd899080e4e":{"type":"可爱","tags":[]},"9aacac7f-138a-4b01-9f09-1792361570eb":{"type":"可爱","tags":["大眼睛"]},"29efd91d-9796-4808-b545-5008f9d85abf":{"type":"可爱","tags":["小眼睛"]},"32a1044c-0073-45ee-b6eb-124c8366ecd5":{"type":"可爱","tags":["小眼睛"]},"77648bfa-78d2-4681-850d-9ac1588e15f8":{"type":null,"tags":[]},"94105aee-1319-4574-8c92-379186047ffe":{"type":"可爱","tags":["小眼睛"]},"b05aa024-931c-4460-84fc-ac2d35ed221e":{"type":"可爱","tags":["小眼睛"]},"a0d12937-90fc-4288-8b6f-5e6bedaa75aa":{"type":"可爱","tags":["明显鼓腮","大眼睛"]},"b7e63a84-5499-48e1-957e-7c02e10c670a":{"type":"可爱","tags":[]},"5237cef7-2820-4431-b677-2c1097d48ab0":{"type":"可爱","tags":["大眼睛"]},"cc21df2a-085b-424e-b782-b9a5ce7550d8":{"type":"可爱","tags":[]},"ebc65787-a490-4d1b-8436-a26249dbafa7":{"type":"可爱","tags":["小眼睛"]},"b45cac74-d846-4667-98e9-a890ae776ae4":{"type":null,"tags":[]},"9c53fd98-b484-44b4-9e2b-49870329d803":{"type":null,"tags":["大眼睛"]},"e5470c79-dba7-48ee-85ec-c8af3311d845":{"type":"可爱","tags":["大眼睛"]},"1268ae27-472f-4956-92b6-2faa0d053935":{"type":"可爱","tags":["大眼睛"]},"b6101837-f074-42d4-bb03-87fb254641b8":{"type":"可爱","tags":["小眼睛"]},"bd1e6686-29f7-4404-ab1c-ea0ef2107d92":{"type":null,"tags":[]},"29513f5f-d123-4770-ba6b-960eb2ed6b44":{"type":null,"tags":[]},"f60908a5-75a8-4fb5-a7c8-1fa4556e994a":{"type":"真人像盲盒","tags":[]},"8a3835c7-b91e-4968-8a45-506684c8a478":{"type":null,"tags":[]},"64602278-35d8-43a9-a58e-3fd0a3b16a26":{"type":null,"tags":[]},"bdd04810-fd12-4683-939b-ef8b858b3c3d":{"type":null,"tags":[]},"3292e289-d133-45bf-94d3-4a8b8f812b0a":{"type":"潮酷","tags":[]},"c7cf7ba5-2a24-488b-b2e9-500fb21ddc90":{"type":null,"tags":[]},"cec60cd2-a60e-424d-9f88-c6ab21f9c5c5":{"type":"可爱","tags":[]},"b967db22-7701-4670-9af3-ec7dfae3e6b6":{"type":"可爱","tags":[]},"37bf0d43-d3a4-40bc-b6ca-5669cb28e3e4":{"type":"可爱","tags":[]},"d9f6e3bd-09d6-444d-94c6-fc5d2cc35955":{"type":"可爱","tags":["小眼睛"]},"8b1a9922-d0fa-43f6-8fdb-d8c00294f570":{"type":"可爱","tags":[]},"0526e977-15cc-4e02-a7b2-1e909d9ecebe":{"type":null,"tags":[]},"a93a7f51-cff0-4274-af37-b66cb115381e":{"type":"可爱","tags":[]},"1efd92ff-7304-436b-83fd-d64158af4dac":{"type":null,"tags":[]},"13a1b6bd-1648-4adf-b2c9-fa642411707d":{"type":"可爱","tags":[]},"df5edcd3-c016-49be-8fbc-fe14dd86b3de":{"type":"可爱","tags":["明显鼓腮"]},"60948210-8fe3-45a0-8cf7-a988798fb28e":{"type":"可爱","tags":["小眼睛"]},"9db73e8e-9861-485b-b2e8-2f8098b87b8f":{"type":"可爱","tags":["小眼睛"]},"cdd1482d-2e9d-48e8-a3a3-1d2c4c10ae7b":{"type":"可爱","tags":["小眼睛"]},"8f2a0ba7-2027-4fb4-8f53-46f3b9bfa10a":{"type":null,"tags":[]},"9fc6e64d-fe9d-4711-bff8-bb07186f204b":{"type":"可爱","tags":["明显鼓腮","小眼睛"]},"24b1cf76-8dbb-4f03-a654-ff3f89a53020":{"type":"可爱","tags":["小眼睛"]},"eb820aab-580c-4fd5-ac08-cf868cf12769":{"type":"可爱","tags":["小眼睛"]},"be5c6361-c669-463e-ab14-6c7b0eeaecc4":{"type":"可爱","tags":["小眼睛"]},"a9440e45-33dd-4efc-8942-8ff060c8e640":{"type":"真人像盲盒","tags":[]},"5e7f27e6-bf9a-45b2-bc27-3fab580697a5":{"type":null,"tags":[]},"2bb55670-b41c-4039-8c76-3c4cfdb6b967":{"type":"可爱","tags":["明显鼓腮","大眼睛"]},"ace29ee4-fbb9-4c4d-9ba5-ce6613146e63":{"type":"可爱","tags":["明显鼓腮"]},"d2c10ea6-67a0-4a30-abe2-cc5f2f44aaf0":{"type":"可爱","tags":["大眼睛"]},"68b69265-6b1b-4a21-97ec-223403228469":{"type":"可爱","tags":["大眼睛"]},"a1f5c6ed-b58a-41ea-add2-bd189643535b":{"type":"可爱","tags":["小眼睛"]},"1bba2330-f679-4534-8e88-2c6137dc76d9":{"type":"可爱","tags":["小眼睛"]},"1c9055bb-ca11-43cf-a639-9307281fcd23":{"type":"可爱","tags":["小眼睛"]},"a6be0aca-431a-4707-b531-1ffa8bc582f5":{"type":null,"tags":[]},"a75bbd47-0676-4b92-947c-8158d778bee7":{"type":"可爱","tags":["小眼睛"]},"539683d3-93fa-41c5-b26a-ab645bb9d2b6":{"type":"可爱","tags":["小眼睛"]},"c63aa4d2-3a9e-46b7-a696-134d181aeb83":{"type":"可爱","tags":["小眼睛"]},"30725229-688d-4463-b674-bb8f48b3853b":{"type":"可爱","tags":["小眼睛"]},"a1aeda25-83b7-4439-a755-820c5fbf857c":{"type":"潮酷","tags":[]},"5213ecc7-7bab-4b54-b816-6e0352248ad9":{"type":"潮酷","tags":["大眼睛"]},"4a0771c4-19a6-44b0-a78d-0bce02cd2af7":{"type":"可爱","tags":["小眼睛"]},"1609fef2-64ac-4ef0-9e0d-f1048db393a8":{"type":"可爱","tags":["小眼睛"]},"5b9b818a-a4f4-45b4-81a0-0e80ebf79eee":{"type":"可爱","tags":["小眼睛"]},"37ad8a2c-42fe-4715-a618-2e2b9532e00d":{"type":"可爱","tags":["小眼睛"]},"6a5b0fcc-87ad-4c86-96ee-8aa5a0fd61e8":{"type":"可爱","tags":["小眼睛"]},"e1e4f1b7-ca0b-4df3-a813-7528ba106820":{"type":null,"tags":[]},"b88426ce-c88e-4f9c-b638-ef42bada9d66":{"type":"可爱","tags":["小眼睛"]},"f7bf88bb-fa16-4fe9-98a5-13766e51918f":{"type":"可爱","tags":[]},"b6ecb77d-5462-499b-8f6a-1ce18a2e318f":{"type":"可爱","tags":["小眼睛"]},"98784519-21bf-4801-a407-62c6778e5190":{"type":null,"tags":[]},"c6c78a42-b8dc-4107-82e0-851d4daea457":{"type":"可爱","tags":["小眼睛"]},"529ba26d-090a-4587-ab4f-5fcc7eb7de6e":{"type":"可爱","tags":["明显鼓腮"]},"e8c52867-ed5c-4ead-afb3-ffa421832ddb":{"type":"可爱","tags":["小眼睛"]},"22c7e9e5-4f44-47f1-bef6-567b1264ad3c":{"type":null,"tags":[]},"511f3f1f-7a5f-4ab5-b35b-3ca4255c4a4c":{"type":"可爱","tags":[]},"58a25a87-bde2-447a-a2e7-f758a39485ab":{"type":"潮酷","tags":["大眼睛"]},"58fe3e20-2084-48ef-905d-8ad770759b6b":{"type":"可爱","tags":["大眼睛"]},"87cbd009-ad7f-41df-9cc9-ff48bd051622":{"type":"可爱","tags":[]},"75f59397-91d6-4588-9085-244f7c5192f1":{"type":"可爱","tags":["明显鼓腮","小眼睛"]},"43d0769d-0621-4982-b208-d55a0aa91903":{"type":"可爱","tags":["明显鼓腮","小眼睛"]},"07511ee2-0d5b-40e5-8320-9840c03690a5":{"type":"可爱","tags":["小眼睛"]},"941422a4-a060-4c6c-8e09-78d7301e0713":{"type":"可爱","tags":["小眼睛"]},"26e23a73-544d-44c5-b630-39752618fb3d":{"type":"可爱","tags":["小眼睛"]},"5f3c5c93-5cc6-4379-8eb0-8b509903516e":{"type":"可爱","tags":["小眼睛"]},"34981aeb-7d5e-4eb1-a817-0cd305712f3d":{"type":"可爱","tags":["小眼睛"]},"eddb52e6-dd20-42ed-afea-b1816eef95c9":{"type":"可爱","tags":["小眼睛"]},"f1384883-49ec-44ef-b740-bb640a49ded0":{"type":"可爱","tags":["小眼睛"]},"9344382d-ad1c-4449-9d35-045aaffc6022":{"type":"潮酷","tags":["小眼睛"]},"71e6e0a3-b351-4e90-b9e1-1e1e4cc964d0":{"type":"潮酷","tags":["小眼睛"]},"63e83e8b-2d21-4f93-9904-d98cfe1867cd":{"type":"可爱","tags":["小眼睛"]},"e3ecfe6a-8102-42ee-bf1f-45711fda66ec":{"type":"可爱","tags":["小眼睛"]},"5b56ad59-5461-4c4b-b747-acadc97f88b2":{"type":"可爱","tags":["小眼睛"]},"75f5b28a-9aa4-430d-86f0-b72b7b3965a0":{"type":"可爱","tags":["小眼睛"]},"7a96c62e-160d-4071-b1f2-ad650a1e2b34":{"type":"可爱","tags":["小眼睛"]},"679094a0-f29d-4062-8ba6-cb7ec7736e66":{"type":"可爱","tags":["小眼睛"]},"c1ee960f-15f3-4f5d-b6d9-fa6288f277ba":{"type":"可爱","tags":["小眼睛"]},"a16e8f6a-aad4-4031-9420-a20ec09d2403":{"type":"可爱","tags":["明显鼓腮","小眼睛"]}};
$("#reviewTaxonomy").onclick = () => {
  if (!isAdmin) return;
  const first = visibleCases.find(r => !CASE_TYPES.includes(r.style)) || visibleCases[0];
  if (first) openRef(first);
};
let detailCases = [];
let detailIndex = -1;
let detailBusy = false;
let detailWheelAt = 0;
let detailWheelDistance = 0;
function moveDetail(step){
  if (detailBusy) return;
  const next = detailIndex + step;
  if (next < 0 || next >= detailCases.length) return;
  const r = refs.find(item => item.id === detailCases[next]);
  if (r) { detailIndex = next; drawRef(r); }
}
function openRef(r){
  if (detailBusy) return;
  detailCases = visibleCases.some(item => item.id === r.id)
    ? visibleCases.map(item => item.id) : refs.map(item => item.id);
  detailIndex = detailCases.indexOf(r.id);
  drawRef(r);
  if (!$("#dlg").open) $("#dlg").showModal();
}
function drawRef(r){
  const body = $("#dlgBody"); body.replaceChildren();
  const im = imgEl(r.image_path, r.name);
  const right = el("div");
  const navigation = el("div", "detail-nav");
  const prev = el("button", "btn ghost small", "← 上一张");
  const next = el("button", "btn ghost small", "下一张 →");
  prev.type = next.type = "button";
  prev.disabled = detailIndex <= 0;
  next.disabled = detailIndex < 0 || detailIndex >= detailCases.length - 1;
  prev.onclick = () => moveDetail(-1);
  next.onclick = () => moveDetail(1);
  navigation.append(prev, el("span", "note", detailIndex < 0 ? "" : (detailIndex + 1) + " / " + detailCases.length), next);
  right.append(navigation, el("h2", "h-first", r.name));
  if (isAdmin && r.id && refs.some(item => item.id === r.id)) {
    const status = el("p", "note", "点击分类自动保存。左右滑动图片或按方向键切换。");
    status.setAttribute("role", "status");
    const controls = el("fieldset", "quick-categories");
    const save = async patch => {
      if (detailBusy) return;
      detailBusy = true;
      controls.disabled = prev.disabled = next.disabled = $("#dlgClose").disabled = true;
      status.textContent = "正在保存…";
      try {
        let request = sb.from("refs").update(patch).eq("id", r.id);
        for (const key of Object.keys(patch)) {
          request = r[key] == null ? request.is(key, null) : request.eq(key, r[key]);
        }
        const { data, error } = await request.select("id").maybeSingle();
        if (error || !data) throw new Error();
        Object.assign(r, patch);
        renderLib();
        drawRef(r);
        $("#detailSaveStatus").textContent = "已保存";
      } catch {
        status.textContent = "保存失败，分类未改变。若其他人也在编辑，请关闭后刷新再试。";
      } finally {
        detailBusy = false;
        controls.disabled = $("#dlgClose").disabled = false;
        prev.disabled = detailIndex <= 0;
        next.disabled = detailIndex < 0 || detailIndex >= detailCases.length - 1;
      }
    };
    function group(label, options, selected, onChoose){
      const wrap = el("div", "field");
      wrap.append(el("span", null, label));
      const chips = el("div", "chips");
      options.forEach(value => {
        const button = el("button", "chip", value);
        button.type = "button";
        button.setAttribute("aria-pressed", String(selected.includes(value)));
        button.onclick = () => onChoose(value);
        chips.append(button);
      });
      wrap.append(chips); controls.append(wrap);
    }
    group("大类", CASE_TYPES, [r.style], value => save({ style: r.style === value ? "" : value }));
    group("主特征", featureOptions([...CATS.feature, r.feature_cat].filter(Boolean)), [normalizeFeature(r.feature_cat)], value =>
      save({ feature_cat: normalizeFeature(r.feature_cat) === value ? "" : value }));
    const selectedShapes = shapeCats.filter(tag => matchesShape(r, tag));
    function toggleShape(value){
      const values = shapeSelection(r)?.map(normalizeShape) || selectedShapes;
      // Eye size and cheek fullness are exclusive within each group.
      const parent = shapeParent(value);
      const exclusive = ["眼睛", "腮帮子"].includes(parent);
      const tags = values.includes(value) ? values.filter(tag => tag !== value)
        : [...values.filter(tag => !exclusive || shapeParent(tag) !== parent), value];
      save({ feature: featureDescription(r) + SHAPE_MARKER + JSON.stringify(tags) });
    }
    const childOptions = shapeCats.filter(tag => !["眼睛", "腮帮子"].includes(shapeParent(tag)) &&
      (shapeParent(tag) === normalizeFeature(r.feature_cat) || selectedShapes.includes(tag)));
    group("造型细分（可多选）", childOptions, selectedShapes, toggleShape);
    group("眼睛", shapeCats.filter(tag => shapeParent(tag) === "眼睛"), selectedShapes, toggleShape);
    group("腮帮子 · 按脸颊鼓起程度", shapeCats.filter(tag => shapeParent(tag) === "腮帮子"), selectedShapes, toggleShape);
    const species = (r.species || "").split(/[、,，]/).map(value => value.trim()).filter(Boolean);
    group("物种（可多选）", [...new Set([...CATS.species, ...species])], species, value =>
      save({ species: (species.includes(value) ? species.filter(item => item !== value) : [...species, value]).join("、") }));
    const proposal = REVIEW_SUGGESTIONS[r.id];
    if (proposal && !CASE_TYPES.includes(r.style)) {
      const review = el("div", "classification-proposal");
      review.append(el("strong", null, "待你核对的建议"));
      const tags = el("div", "chips");
      [proposal.type || "大类待确认", ...proposal.tags].forEach(tag => tags.append(el("span", "proposal-tag", tag)));
      review.append(tags);
      if (proposal.type) {
        const accept = el("button", "btn small", "确认这组建议");
        accept.type = "button";
        accept.onclick = () => {
          if (detailBusy) return;
          const suggestedParents = new Set(proposal.tags.map(shapeParent));
          const values = (shapeSelection(r)?.map(normalizeShape) || selectedShapes)
            .filter(tag => !suggestedParents.has(shapeParent(tag)));
          const patch = { style: proposal.type };
          if (proposal.tags.length) patch.feature = featureDescription(r) + SHAPE_MARKER +
            JSON.stringify([...new Set([...values, ...proposal.tags])]);
          save(patch);
        };
        review.append(accept);
      }
      review.append(el("p", "note", "建议依据上次导出图片。请对照当前图片确认，也可直接点上方分类修改。"));
      controls.append(review);
    }
    status.id = "detailSaveStatus";
    right.append(controls, status);
    const edit = el("button", "btn ghost small", "编辑文字描述");
    edit.type = "button";
    edit.onclick = () => {
      if (detailBusy) return;
      $("#dlg").close();
      openTagForm({ title: "分类与描述", tags: r, path: r.image_path, onSave: async tags => {
        const { error } = await sb.from("refs").update(tags).eq("id", r.id);
        if (error) throw error;
        await loadRefs(); renderLib();
      } });
    };
    const remove = el("button", "btn ghost small", "从案例库移除");
    remove.type = "button";
    remove.onclick = async () => {
      if (detailBusy) return;
      if (!remove.dataset.armed) {
        remove.dataset.armed = "1";
        remove.textContent = "再点一次确认移除";
        return;
      }
      detailBusy = true;
      remove.disabled = controls.disabled = $("#dlgClose").disabled = true;
      try {
        const { error } = await sb.from("refs").delete().eq("id", r.id);
        if (error) throw error;
        if (r.image_path.startsWith("refs/")) await sb.storage.from("images").remove([r.image_path]);
        $("#dlg").close();
        await loadRefs(); renderLib();
      } catch {
        status.textContent = "移除失败，请刷新页面确认后再试。";
      } finally {
        detailBusy = false;
        remove.disabled = controls.disabled = $("#dlgClose").disabled = false;
      }
    };
    const actions = el("div", "row");
    actions.append(edit, remove);
    right.append(actions);
  }
  const dl = el("dl");
  [["大类", CASE_TYPES.includes(r.style) ? r.style : ""], ["物种", r.species], ["主特征分类", normalizeFeature(r.feature_cat)], ["主特征", featureDescription(r)], ["跨界元素", r.fusion], ["配色", r.colors], ["表情", r.mood], ["借鉴点", r.learn], ["推荐理由", r.note]]
    .forEach(([key, value]) => { if (value) dl.append(el("dt", null, key), el("dd", null, value)); });
  right.append(dl);
  body.append(im, right);
  let start = null;
  im.style.touchAction = "pan-y";
  im.addEventListener("touchstart", event => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    start = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }, { passive: true });
  im.addEventListener("touchend", event => {
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) moveDetail(dx < 0 ? 1 : -1);
  }, { passive: true });
  hydrate(body);
}
$("#dlgClose").onclick = () => { if (!detailBusy) $("#dlg").close(); };
$("#dlg").addEventListener("cancel", event => { if (detailBusy) event.preventDefault(); });
$("#dlg").addEventListener("wheel", event => {
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || event.ctrlKey) return;
  event.preventDefault();
  const now = Date.now();
  if (now - detailWheelAt < 600 || detailBusy) return;
  detailWheelDistance += event.deltaX;
  if (Math.abs(detailWheelDistance) > 90) {
    moveDetail(detailWheelDistance > 0 ? 1 : -1);
    detailWheelDistance = 0;
    detailWheelAt = now;
  }
}, { passive: false });
$("#dlg").addEventListener("keydown", event => {
  if (event.target.matches("input,textarea,select")) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    moveDetail(event.key === "ArrowLeft" ? -1 : 1);
  }
});

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
let tagShapeSelection = null;
let tagPicker = null;
let tagSave = null;
function openTagForm({ title, tags, path, onSave, saveLabel }){
  $("#tagTitle").textContent = title;
  const p = $("#tagPreview"); p.replaceChildren(); if (path) { p.append(imgEl(path)); hydrate(p); }
  TAG_KEYS.forEach(k => $("#a-" + k).value = k === "feature" ? featureDescription(tags || {}) : tags?.[k] || "");
  tagShapeSelection = tags ? shapeSelection(tags) : null;
  tagPicker = catPicker($("#tagCats")); tagPicker.set(tags || {});
  showErr($("#tagErr"), ""); $("#tagSave").disabled = false; $("#tagSave").textContent = saveLabel || "保存";
  tagSave = onSave; $("#tagDlg").showModal();
}
$("#tagCancel").onclick = () => $("#tagDlg").close();
$("#tagForm").onsubmit = async e => {
  e.preventDefault();
  const t = {}; TAG_KEYS.forEach(k => t[k] = $("#a-" + k).value.trim());
  if (tagShapeSelection) t.feature += SHAPE_MARKER + JSON.stringify(tagShapeSelection);
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
