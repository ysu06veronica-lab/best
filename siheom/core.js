/* 최고수학 시험 돌아보기 — 공통 (설정 · 서버 연결 · 문항 편집기 · 데모 서버)
   학생 앱(index.html) · 선생님(teacher.html) · 원장(admin.html) · 학부모(parent.html)가 같이 씁니다. reasons.js 를 먼저 불러야 합니다.
   FUNCTION_URL 이 비어 있으면 '데모 모드' — 이 기기 브라우저에만 저장되고, PC 채점·분석은 흉내만 냅니다. */
const CONFIG = {
  FUNCTION_URL: "https://ibafntrwdnusntkbenzf.supabase.co/functions/v1/siheom",          // 예: https://○○○○.supabase.co/functions/v1/siheom  (서버 설치 후 채움)
  ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImliYWZudHJ3ZG51c250a2JlbnpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NTExMDgsImV4cCI6MjEwNjAyNzEwOH0.mTM0xqZA4GGI-Q6eNled5tViuw59Sxl_apYugLqPY7c",              // Supabase anon public 키 (공개용)
  BRAND: "최고수학 시험 돌아보기",
  GRADES: ["중1", "중2", "중3", "고1", "고2", "고3"],
  SCHOOLS: ["예송중", "현송중", "해송중", "박문중", "송빛중", "능허대중", "사리울중", "포스코고", "인천여고", "대건고", "송도고", "신송고", "연송고", "박문여고", "해송고", "옥련여고", "인천외고", "인천국제고", "인제고"],
};
/* 학부모 안내에 들어가는 학습지 배송 문구 (원장님 2026-10-29) */
const PARENT_NOTICE = "학원에서 틀린 문제와 다시 볼 문항을 아이가 직접 다시 풀어 본 학습지를 가정으로 보내 드릴 예정입니다.";
const PARENT_ACK_TXT = "학습지를 받으시면 아래 '학습지 받았어요'를 눌러 주세요. 담임 선생님께 바로 전달됩니다.";
/* 준비 과정 점검 */
const PREP = [
  { k: "start", q: "시험 공부를 언제 시작했나요?", opts: ["4주 전 이상", "3주 전", "2주 전", "1주 전", "며칠 전"] },
  { k: "book", q: "교과서·학교 학습지를 몇 번 풀어 봤나요?", opts: ["3번 이상", "2번", "1번", "거의 못 봤다"] },
  { k: "redo", q: "틀렸던 문제를 다시 풀어 봤나요?", opts: ["모두 다시 풀었다", "절반 정도", "조금", "안 했다"] },
  { k: "time", q: "시험 시간은 어땠나요?", opts: ["여유 있었다", "딱 맞았다", "조금 모자랐다", "많이 모자랐다"] },
  { k: "feel", q: "시험이 얼마나 어렵게 느껴졌나요?", opts: ["쉬웠다", "보통", "어려웠다", "매우 어려웠다"] },
  { k: "hard", q: "가장 어려웠던 단원이나 문제 (적고 싶을 때만)", free: true },
];
/* 하단 질문 2개 — 개별 피드백지 고정 문구(2026-10-13)를 시험 이름에 맞춰 씁니다 */
function promiseQs(title) {
  const t = String(title || ""), mid = /중간/.test(t);
  const now = mid ? "중간고사" : /기말/.test(t) ? "기말고사" : "이번 시험";
  const next = mid ? "기말고사" : "다음 시험";
  return [`${now} 기간 동안 학원 숙제 이외에 개인적으로 진행한 수학 공부를 구체적으로 적어주세요.`,
          `${next} 점수 향상을 위해 꼭 해야할 공부와 다짐을 적어주세요.`];
}
const DEMO = !CONFIG.FUNCTION_URL;

/* ── 작은 도구 ── */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nl = s => esc(s).replace(/\n/g, "<br>");
const md = s => { if (!s) return ""; const d = new Date(String(s).length <= 10 ? s + "T00:00:00+09:00" : s); return `${d.getMonth() + 1}/${d.getDate()}`; };
/* 단계 (서버 status) → 화면 이름 */
const STAGE = {
  시험지제출: ["채점 중", "wait"], 처리중: ["처리 중", "work"], 원인입력: ["원인 입력 차례", "work"], 제출: ["분석 중", "wait"],
  선생님확인: ["담임 확인 중", "check"], 선생님완료: ["담임 완료", "done"], 승인: ["승인 · 공개", "ok"], 반려: ["반려", "no"], 열림: ["열림", "ok"], 닫힘: ["닫힘", "wait"],
};
const chip = (st, txt) => `<span class="chip ${(STAGE[st] || [])[1] || ""}">${esc(txt || (STAGE[st] || [st])[0])}</span>`;
const scoreOf = (items, wrong) => { const w = new Set(wrong || []); return (items || []).reduce((s, it) => s + (w.has(it.no) ? 0 : +it.pts || 0), 0); };
const fmt = n => (Math.round(n * 10) / 10).toString();
const nums = s => [...new Set(String(s || "").split(/[^0-9]+/).filter(Boolean).map(Number))].sort((a, b) => a - b);
function toast(msg) {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2600);
}
const reasonChips = keys => (keys || []).map(k => REASON_BY_KEY[k]).filter(Boolean)
  .map(r => `<span class="rc"><i>${esc(r.area || r.g)}</i>${esc(r.t)}</span>`).join("") || `<span class="sub">-</span>`;
/* 휴대폰 사진 → 긴 변 maxPx 로 줄인 jpg (data URL) */
function shrinkImage(file, maxPx = 2000, q = 0.82) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error("사진을 읽지 못했습니다")); };
    img.src = url;
  });
}
function zoom(src) { if (!src) return; const z = document.createElement("div"); z.id = "zoom"; z.innerHTML = `<img src="${esc(src)}" alt="">`; z.onclick = () => z.remove(); document.body.appendChild(z); }
/* data-img="경로" 인 <img> 들에 주소 채우기 */
async function fillImages(root, getUrls) {
  const els = $$("[data-img]", root); if (!els.length) return;
  try {
    const U = await getUrls([...new Set(els.map(i => i.dataset.img))]);
    els.forEach(im => { const u = U[im.dataset.img]; if (u) { im.src = u; im.onclick = () => zoom(u); } else im.alt = "그림을 불러오지 못했습니다"; });
  } catch (e) { toast(e.message); }
}

/* 문항 1개의 원인 영역: 풀이 분석 > 선생님 원인 > 학생 원인 (처리/make_report.py 와 같은 규칙) */
function itemAreas(no, e) {
  const a = (((e.analysis || {})[no] || {}).areas || []).filter(t => AREAS.includes(t)); if (a.length) return a;
  for (const keys of [(e.teacher_reasons || {})[no], (e.reasons || {})[no]]) {
    const r = [...new Set((keys || []).map(k => REASON_BY_KEY[k]?.area).filter(Boolean))];
    if (r.length) return r; if ((keys || []).some(k => /^t/.test(k))) return ["시간"];
  }
  return [];
}
const AREA_NAME = { 계산: "계산", 이해: "이해(개념)", 문제해결: "문제해결", 추론: "추론", 실수: "마무리 실수", 시간: "시간 부족", "": "확인 필요" };
/* 영역별 놓친 점수 (한 문항에 영역이 여럿이면 배점을 나눔) */
function areaLoss(x, e) {
  const out = {}; (e.wrong || []).forEach(no => { const it = x.items[no - 1] || {}, ar = itemAreas(no, e); (ar.length ? ar : [""]).forEach(t => out[t] = (out[t] || 0) + (+it.pts || 0) / Math.max(1, ar.length)); });
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}
function unitRates(x, wrong) {
  const W = new Set(wrong || []), u = {};
  x.items.forEach(it => { const k = it.unit || "기타"; u[k] = u[k] || { tot: 0, got: 0, n: 0 }; u[k].tot += +it.pts || 0; u[k].n++; if (!W.has(it.no)) u[k].got += +it.pts || 0; });
  return Object.entries(u).map(([k, v]) => [k, v.tot ? v.got / v.tot * 100 : 0, v.n]);
}
const bars = (rows, unit, cls) => rows.map(([k, v, max]) => `<div class="br"><span>${esc(k)}</span><div class="bar ${cls || ""}"><i style="width:${Math.max(0, Math.min(100, v / (max || 100) * 100))}%"></i></div><b>${fmt(v)}${unit}</b></div>`).join("");

/* 담임 한마디 4칸 (원장님 2026-10-29 — 이 순서로) */
const TEACHER_PARTS = [
  { k: "good", t: "① 이번 시험 기간에 잘한 점", ph: "예: 시험 3주 전부터 교과서를 두 번 풀었음" },
  { k: "growth", t: "② 노력해서 성장한 점", ph: "예: 지난 시험보다 서술형 풀이를 끝까지 씀" },
  { k: "wrongGood", t: "③ 오답이지만 잘한 부분", ph: "예: 18번은 공식 선택과 식 세우기가 정확했는데 마지막 3³ 계산에서 실수", guide: "틀린 문항 중 접근·이해는 좋았는데 마지막 계산·옮겨 적기 등에서 아쉽게 틀린 문항을 꼭 한 개 이상 적어 주세요." },
  { k: "next", t: "④ 다음 시험 기간에 더 집중 · 주의할 부분", ph: "예: 입체도형 단원 개념 정리, 계산 후 검산 습관" },
];
/* 짧은 메모 4개 → 학부모님께 드리는 문단 초안 (바로 쓰는 간단 초안. 최고AI 다듬기를 맡기면 PC 처리 때 자연스럽게 고쳐 씀) */
function draftTeacher(n, name) {
  // 말투: 따뜻하고 완곡하게, 지적보다 보완 (처리/다듬기_말투.md — 최고AI 다듬기와 같은 기준)
  const t = s => String(s || "").trim().replace(/[.。]\s*$/, "");
  const out = [];
  if (t(n.good)) out.push(`${name ? name + " 학생은" : "이번 시험에서"} 이번 시험 기간에 ${t(n.good)} 모습이 참 좋았습니다.`);
  if (t(n.growth)) out.push(`특히 ${t(n.growth)} 부분에서 노력한 만큼 성장한 것이 느껴졌습니다.`);
  if (t(n.wrongGood)) out.push(`틀린 문제 중에서도 ${t(n.wrongGood)} 부분은 접근과 이해가 좋았기에 저희도 더 아쉬웠습니다.`);
  if (t(n.next)) out.push(`다음 시험 기간에는 ${t(n.next)}을(를) 조금 더 다지면 한층 좋아질 것으로 기대합니다. 학원에서도 곁에서 함께 챙기겠습니다.`);
  return out.join(" ");
}
/* ③ 칸 도움: 접근·이해는 괜찮고 계산·실수 영역으로 틀린 문항 → "18번 …" 제안 */
function wrongGoodHints(x, e) {
  return (e.wrong || []).filter(no => { const ar = itemAreas(no, e); return ar.length && ar.every(t => t === "계산" || t === "실수"); }).map(no => {
    const it = x.items[no - 1] || {}, a = (e.analysis || {})[no] || {};
    return `${no}번(${it.type || it.unit || ""})은 풀이 방향과 식 세우기가 좋았으나 ${a.wrong ? a.wrong.replace(/[.。]\s*$/, "") : "마지막 계산에서 실수"}`;
  });
}

/* ── 서버 연결 ── */
async function api(action, payload = {}) {
  if (DEMO) { const r = Mock.handle(action, JSON.parse(JSON.stringify(payload))); if (r.error) throw new Error(r.error); return r; }
  const res = await fetch(CONFIG.FUNCTION_URL, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: CONFIG.ANON_KEY, Authorization: "Bearer " + CONFIG.ANON_KEY },
    body: JSON.stringify({ action, ...payload }),
  });
  let j = {}; try { j = await res.json(); } catch (_) { throw new Error("서버 응답이 없습니다. 잠시 후 다시 시도해 주세요"); }
  if (!res.ok || j.error) throw new Error(j.error || "서버 오류");
  return j;
}

/* ===================================================================== */
/* 문항 편집기 — 선생님 페이지 · 원장 화면이 같이 씀
   틀린 문항: 캡처 · 학생 원인 · 선생님 원인 · 풀이 분석(고치기) / 다시 볼 문항: 캡처 · 최고AI가 고른 이유 · 담임 코멘트(필수) */
/* ===================================================================== */
const Editor = (() => {
  function state(e) {
    const W = (e.wrong || []).slice().sort((a, b) => a - b);
    const RV = JSON.parse(JSON.stringify(e.review || {}));
    const TR = {}, AN = {}, RN = { ...(e.review_notes || {}) };
    W.forEach(w => { TR[w] = [...((e.teacher_reasons || {})[w] || [])]; const a = (e.analysis || {})[w] || {}; AN[w] = { areas: [...(a.areas || [])], stuck: a.stuck || "", wrong: a.wrong || "", fix: a.fix || "" }; });
    const C = { summary: "", units: {}, plan: [], teacher: "", notes: {}, polish: "", ...(e.comments || {}) };
    C.notes = { ...(C.notes || {}) };
    return { W, RV, TR, AN, RN, C, units: Object.keys(C.units || {}) };
  }
  function itemHead(x, no) { const it = x.items[no - 1] || {}; return `<b>${no}번</b><span>${esc(it.unit || "")}${it.type ? " · " + esc(it.type) : ""}${it.level ? " · " + esc(it.level) : ""} · ${fmt(+it.pts || 0)}점</span>`; }
  function crop(e, no) { const p = (e.crops || {})[no]; return p ? `<img class="crop" data-img="${esc(p)}" alt="${no}번 문항 캡처">` : `<div class="crop none">캡처 없음 — 아래 '시험지 전체'에서 확인</div>`; }
  function html(e, x, s, st, opt) {
    const ro = !!opt.readonly;
    const dis = ro ? "disabled" : "";
    const wrongCards = st.W.map(no => {
      const a = st.AN[no];
      return `<div class="qa" id="qa${no}"><div class="h">${itemHead(x, no)}<em class="tag wrongtag">틀린 문항</em></div>
        <div class="cols"><div>${crop(e, no)}</div><div>
          <div class="lab">학생이 고른 원인</div><div class="rcs">${reasonChips((e.reasons || {})[no])}</div>
          <details class="tpick" ${st.TR[no].length ? "open" : ""}><summary>선생님이 고른 원인 ${st.TR[no].length ? `(${st.TR[no].length}개)` : "— 학생 선택과 다를 때 펼쳐서 고르기"}</summary>
            ${REASON_GROUPS.map(g => `<div class="tg">${esc(g.g)}</div><div class="opts">${g.opts.map(([k, t]) => `<button class="opt ${st.TR[no].includes(k) ? "on" : ""}" data-tr="${no}" data-k="${k}" ${dis}>${esc(t)}</button>`).join("")}</div>`).join("")}</details>
          <div class="lab">풀이 분석 · 영역 <span class="who-edit">${e.edited_by ? "마지막 수정 " + esc(e.edited_by) : "최고AI 초안"}</span></div>
          <div class="opts">${AREAS.map(t => `<button class="opt ${a.areas.includes(t) ? "on" : ""}" data-ar="${no}" data-t="${t}" ${dis}>${t}</button>`).join("")}</div>
          <div class="lab">어디서 접근이 막혔나</div><textarea data-an="${no}:stuck" ${dis}>${esc(a.stuck)}</textarea>
          <div class="lab">어디서 틀렸나</div><textarea data-an="${no}:wrong" ${dis}>${esc(a.wrong)}</textarea>
          <div class="lab">다시 풀 때 (학생·학부모에게 보임)</div><textarea data-an="${no}:fix" ${dis}>${esc(a.fix)}</textarea>
        </div></div></div>`;
    }).join("");
    const RVN = Object.keys(st.RV).map(Number).sort((a, b) => a - b);
    const reviewCards = RVN.map(no => `<div class="qa rv" id="qa${no}"><div class="h">${itemHead(x, no)}<em class="tag rvtag">다시 볼 문항</em></div>
        <div class="cols"><div>${crop(e, no)}</div><div>
          <div class="lab">다시 볼 이유 (최고AI 판단 — 고칠 수 있음)</div><input data-rvwhy="${no}" value="${esc(st.RV[no].why || "")}" ${dis}>
          <div class="lab">담임 코멘트 <b class="need">*</b> (어떻게 다시 풀게 할지 · 학생·학부모에게 보임)</div>
          <textarea data-rn="${no}" placeholder="예: 답은 맞았지만 풀이가 없어 확인이 필요합니다. 수업 시간에 풀이 과정을 쓰면서 다시 풀게 하겠습니다." ${dis}>${esc(st.RN[no] || "")}</textarea>
        </div></div></div>`).join("");
    const pages = (e.pages || []).map((p, i) => `<img class="page" data-img="${esc(p)}" alt="시험지 ${i + 1}쪽">`).join("");
    const P = e.prep || {};
    const hints = wrongGoodHints(x, { ...e, analysis: st.AN, teacher_reasons: st.TR });
    st._hints = hints; st._name = s ? s.name : "";
    const pol = st.C.polish;
    return `
      <div class="card tcard"><h3>담임 선생님 한마디 <b class="need">*</b> <small class="sub">학생 화면 · 학부모 안내에 나갑니다</small></h3>
        <p class="sub">아래 4칸을 <b>순서대로 짧게</b> 적어 주세요(한 줄이면 충분합니다). '초안 만들기'를 누르면 문단이 만들어지고, '최고AI 다듬기'를 켜 두면 다음 처리 때 자연스러운 글로 다듬어 이 칸에 넣어 드립니다.</p>
        ${TEACHER_PARTS.map(q => `<label>${q.t}</label>${q.guide ? `<p class="guide">${esc(q.guide)}</p>` : ""}
          ${q.k === "wrongGood" && hints.length && !ro ? `<div class="opts hint">${hints.map((h, i) => `<button class="opt" data-hint="${i}">+ ${esc(h.length > 60 ? h.slice(0, 58) + "…" : h)}</button>`).join("")}</div>` : ""}
          <textarea class="short" data-note="${q.k}" placeholder="${esc(q.ph)}" ${dis}>${esc(st.C.notes[q.k] || "")}</textarea>`).join("")}
        <div class="row" style="margin-top:10px;flex-wrap:wrap">${ro ? "" : `<button class="btn sm" id="ed-draft">초안 만들기 ↓</button>
          <label class="ck"><input type="checkbox" id="ed-polish" ${pol === "요청" ? "checked" : ""}> 최고AI 다듬기</label>`}
          ${pol === "요청" ? `<span class="chip work">다듬기 대기 중</span>` : pol === "완료" ? `<span class="chip done">최고AI가 다듬음 — 확인 후 고쳐 주세요</span>` : ""}</div>
        <label>학부모님께 나가는 문장 (최종)</label>
        <textarea id="ed-tch" class="tall" ${dis} placeholder="초안 만들기를 누르거나 직접 적어 주세요">${esc(st.C.teacher)}</textarea></div>
      <h2>틀린 문항 (${st.W.length})</h2>${wrongCards || `<div class="card sub">틀린 문항 없음</div>`}
      <h2>다시 볼 문항 (${RVN.length}) <small class="sub">맞았지만 풀이가 틀렸거나 풀이 없이 답만 쓴 문항</small></h2>${reviewCards || `<div class="card sub">다시 볼 문항 없음</div>`}
      ${ro ? "" : `<details class="card"><summary><b>채점 고치기</b> <span class="sub">— 최고AI 채점이 틀렸을 때만</span></summary>
        <label>틀린 문항 번호</label><input id="ed-wrong" value="${esc(st.W.join(", "))}">
        <label>다시 볼 문항 번호</label><input id="ed-review" value="${esc(RVN.join(", "))}">
        <p class="sub" style="margin-top:6px">저장하면 목록이 바뀝니다. 새로 넣은 문항은 캡처가 없으니 아래 시험지 전체에서 확인해 주세요.</p></details>`}
      <details class="card" ${pages ? "" : "hidden"}><summary><b>시험지 전체 보기</b> <span class="sub">(${(e.pages || []).length}장)</span></summary><div class="pages">${pages}</div></details>
      <details class="card"><summary><b>리포트 문장</b> <span class="sub">— 최고AI 초안, 고칠 수 있음</span></summary>
        <label>종합 분석</label><textarea id="ed-sum" ${dis}>${esc(st.C.summary)}</textarea>
        ${st.units.map((k, i) => `<label>함께 다질 단원 — ${esc(k)}</label><textarea data-unit="${i}" ${dis}>${esc(st.C.units[k])}</textarea>`).join("")}
        <label>학원 관리 계획 (한 줄에 하나, 3줄까지)</label><textarea id="ed-plan" ${dis}>${esc((st.C.plan || []).join("\n"))}</textarea></details>
      <details class="card"><summary><b>학생이 적은 준비 과정 · 다짐</b></summary>
        <dl class="kv" style="margin-top:8px">${PREP.map(q => `<dt>${esc(q.q.replace(/\?.*$/, ""))}</dt><dd>${esc(P[q.k] || "-")}</dd>`).join("")}</dl>
        <p class="sub" style="margin-top:8px">■ ${esc(promiseQs(x.title)[0])}</p><pre class="box">${esc(e.promise1 || "-")}</pre>
        <p class="sub" style="margin-top:8px">■ ${esc(promiseQs(x.title)[1])}</p><pre class="box">${esc(e.promise2 || "-")}</pre></details>`;
  }
  function bind(root, st) {
    $$("[data-tr]", root).forEach(b => b.onclick = () => { const a = st.TR[b.dataset.tr], i = a.indexOf(b.dataset.k); i >= 0 ? a.splice(i, 1) : a.push(b.dataset.k); b.classList.toggle("on", i < 0); });
    $$("[data-ar]", root).forEach(b => b.onclick = () => { const a = st.AN[b.dataset.ar].areas, i = a.indexOf(b.dataset.t); i >= 0 ? a.splice(i, 1) : a.push(b.dataset.t); b.classList.toggle("on", i < 0); });
    $$("[data-an]", root).forEach(t => t.oninput = () => { const [w, f] = t.dataset.an.split(":"); st.AN[w][f] = t.value; });
    $$("[data-rn]", root).forEach(t => t.oninput = () => { st.RN[t.dataset.rn] = t.value; });
    $$("[data-rvwhy]", root).forEach(t => t.oninput = () => { st.RV[t.dataset.rvwhy].why = t.value; });
    $$("[data-note]", root).forEach(t => t.oninput = () => { st.C.notes[t.dataset.note] = t.value; });
    const hints = st._hints || [];
    $$("[data-hint]", root).forEach(b => b.onclick = () => { const ta = $('[data-note="wrongGood"]', root); const h = hints[+b.dataset.hint]; ta.value = (ta.value.trim() ? ta.value.trim() + ", " : "") + h; st.C.notes.wrongGood = ta.value; b.disabled = true; });
    const dr = $("#ed-draft", root); if (dr) dr.onclick = () => {
      const ta = $("#ed-tch", root); const d = draftTeacher(st.C.notes, st._name);
      if (!d) return toast("4칸 중 하나 이상 적어 주세요");
      if (ta.value.trim() && !confirm("지금 적힌 최종 문장을 새 초안으로 바꿀까요?")) return;
      ta.value = d; ta.focus();
    };
  }
  /* 저장할 값 모으기 */
  function payload(root, st) {
    const units = {}; st.units.forEach((k, i) => units[k] = ($(`[data-unit="${i}"]`, root)?.value || "").trim());
    const notes = {}; TEACHER_PARTS.forEach(q => notes[q.k] = (st.C.notes[q.k] || "").trim());
    const pc = $("#ed-polish", root);
    const polish = pc ? (pc.checked ? "요청" : (st.C.polish === "완료" ? "완료" : "")) : st.C.polish || "";
    const comments = { summary: ($("#ed-sum", root)?.value || "").trim(), units, plan: ($("#ed-plan", root)?.value || "").split("\n").map(v => v.trim()).filter(Boolean).slice(0, 3), teacher: ($("#ed-tch", root)?.value || "").trim(), notes, polish };
    const W = $("#ed-wrong", root) ? nums($("#ed-wrong", root).value) : st.W;
    const RVN = $("#ed-review", root) ? nums($("#ed-review", root).value).filter(n => !W.includes(n)) : Object.keys(st.RV).map(Number);
    const review = {}; RVN.forEach(n => review[n] = { why: (st.RV[n] || {}).why || "" });
    const analysis = {}; W.forEach(w => { const a = st.AN[w]; if (a && (a.areas.length || a.stuck.trim() || a.wrong.trim() || a.fix.trim())) analysis[w] = { areas: a.areas, stuck: a.stuck.trim(), wrong: a.wrong.trim(), fix: a.fix.trim() }; });
    const teacher_reasons = {}; W.forEach(w => { if (st.TR[w]) teacher_reasons[w] = st.TR[w]; });
    const review_notes = {}; RVN.forEach(n => { review_notes[n] = (st.RN[n] || "").trim(); });
    return { wrong: W, review, teacher_reasons, analysis, review_notes, comments };
  }
  /* 담임 완료 전 확인: 다시 볼 문항 코멘트 · 담임 코멘트 */
  function problem(pl) {
    const miss = Object.keys(pl.review).filter(k => !pl.review_notes[k]);
    if (miss.length) return { msg: `다시 볼 문항(${miss.join(", ")}번)에 코멘트를 적어 주세요`, at: "qa" + miss[0] };
    if (pl.comments.polish === "요청") return { msg: "최고AI 다듬기를 기다리는 중입니다. 다듬은 글을 확인한 뒤 완료해 주세요 (바로 끝내려면 '최고AI 다듬기'를 끄세요)", at: "ed-tch" };
    if (TEACHER_PARTS.some(q => !pl.comments.notes[q.k])) { const q = TEACHER_PARTS.find(q => !pl.comments.notes[q.k]); return { msg: `담임 한마디 '${q.t}' 칸을 적어 주세요`, at: "ed-tch" }; }
    if (!pl.comments.teacher) return { msg: "학부모님께 나가는 최종 문장을 적어 주세요 ('초안 만들기'를 누르면 만들어집니다)", at: "ed-tch" };
    return null;
  }
  return { state, html, bind, payload, problem };
})();

/* ===================================================================== */
/* 데모 서버 (FUNCTION_URL 이 비었을 때, 이 기기 브라우저에만 저장) — PC 채점·분석은 흉내만 냄 */
/* ===================================================================== */
const Mock = (() => {
  const KEY = "ex_demo_v4"; let db = null, seq = 100;
  const now = () => new Date().toISOString();
  const AK = typeof REASON_BY_KEY !== "undefined" ? Object.keys(REASON_BY_KEY) : [];
  function svg(no, kind, lines) {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="300"><rect width="720" height="300" fill="#fff"/>
      <text x="24" y="44" font-family="sans-serif" font-size="26" fill="#182B49">${no}. ${kind}</text>
      <text x="24" y="84" font-family="sans-serif" font-size="20" fill="#5B6478">(데모 문항 캡처 — 실제로는 학생 시험지에서 잘라 냅니다)</text>
      ${(lines || []).map((l, i) => `<text x="${60 + i * 10}" y="${140 + i * 42}" font-family="cursive, sans-serif" font-size="26" fill="#2B4C9B">${l}</text>`).join("")}
      ${kind.includes("틀") ? `<path d="M600 60 l60 60 M660 60 l-60 60" stroke="#C8102E" stroke-width="6"/>` : `<circle cx="630" cy="90" r="34" fill="none" stroke="#C8102E" stroke-width="5"/>`}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  }
  function page(i) {
    const s = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="840"><rect width="600" height="840" fill="#fff" stroke="#ccc"/><text x="30" y="50" font-family="sans-serif" font-size="24" fill="#182B49">2026 2학기 기말 수학 — ${i}쪽 (데모 시험지)</text>
      ${[0, 1, 2, 3, 4].map(k => `<rect x="30" y="${80 + k * 150}" width="540" height="130" fill="none" stroke="#E4E2D8"/><text x="44" y="${110 + k * 150}" font-size="20" fill="#182B49">${(i - 1) * 5 + k + 1}. 문항</text>`).join("")}</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  }
  function seed() {
    const U = ["기본 도형", "기본 도형", "작도와 합동", "작도와 합동", "작도와 합동", "다각형", "다각형", "다각형", "다각형", "원과 부채꼴", "원과 부채꼴", "원과 부채꼴",
      "다면체와 회전체", "다면체와 회전체", "다면체와 회전체", "입체도형의 겉넓이와 부피", "입체도형의 겉넓이와 부피", "입체도형의 겉넓이와 부피", "자료의 정리와 해석", "자료의 정리와 해석"];
    const T = ["평행선의 성질", "위치 관계", "작도 순서", "합동 조건", "합동 증명", "대각선의 개수", "내각의 크기의 합", "외각의 크기의 합", "정다각형", "호의 길이", "부채꼴의 넓이", "중심각과 현",
      "다면체의 면·모서리·꼭짓점", "회전체의 단면", "정다면체", "기둥의 겉넓이", "뿔의 부피", "구의 겉넓이와 부피", "줄기와 잎 그림", "도수분포표와 히스토그램"];
    const L = ["하", "중", "하", "중", "중상", "중", "중", "중", "중상", "하", "중", "중", "중", "중상", "상", "중", "중상", "상", "하", "중"];
    const P = [4, 4, 4, 5, 5, 4, 5, 5, 5, 4, 5, 5, 4, 5, 6, 5, 6, 7, 6, 6];
    const items = U.map((u, i) => ({ no: i + 1, pts: P[i], unit: u, type: T[i], level: L[i], ans: String((i % 5) + 1) }));
    const pages = ["ph/1/u2/page_1.jpg", "ph/1/u2/page_2.jpg", "ph/1/u2/page_3.jpg", "ph/1/u2/page_4.jpg"];
    const files = {}; pages.forEach((p, i) => files[p] = page(i + 1));
    const mk = (id, sid, extra) => {
      const crops = {}; [...(extra.wrong || []), ...Object.keys(extra.review || {}).map(Number)].forEach(n => { const pth = `cr/${id}/${n}.jpg`; crops[n] = pth; files[pth] = svg(n, (extra.wrong || []).includes(n) ? "틀린 문항" : "다시 볼 문항", n === 18 ? ["V = 4/3 × π × 3³", "= 4/3 × π × 9 = 12π"] : n === 9 ? ["답: ④ (풀이 없음)"] : ["풀이 …", "x = 3"]); });
      return { id, exam_id: 1, student_id: sid, pages: id === 1 ? pages : [], teacher_wrong: null, reasons: {}, teacher_reasons: {}, analysis: {}, review_notes: {}, comments: {}, prep: {}, promise1: "", promise2: "",
        admin_notes: "", edited_by: null, report_path: null, set_path: null, card_path: null, parent_token: null, parent_ack_at: null, parent_opened_at: null, teacher_done_at: null, created_at: now(), updated_at: now(), crops, ...extra };
    };
    const A = { 5: { areas: ["이해"], stuck: "합동 조건 중 SAS를 써야 하는데 끼인각이 아닌 각을 골랐습니다.", wrong: "두 변과 한 각을 찾았지만 그 각이 두 변 사이의 각인지 확인하지 않았습니다.", fix: "각이 두 변 사이에 있는지 그림에 표시하고 확인하기" },
      14: { areas: ["문제해결"], stuck: "회전축을 포함하는 평면으로 자른 단면을 떠올리지 못했습니다.", wrong: "", fix: "회전체를 축으로 반 자른 그림을 먼저 그리기" },
      18: { areas: ["계산"], stuck: "", wrong: "구의 부피 공식은 맞게 썼지만 3³을 9로 계산했습니다.", fix: "거듭제곱은 곱셈으로 풀어 쓰고 검산하기" } };
    const prep = { start: "2주 전", book: "1번", redo: "조금", time: "조금 모자랐다", feel: "어려웠다", hard: "구의 부피" };
    return {
      files,
      teachers: [{ id: "t1", name: "박지은", code: "T1111", status: "active" }, { id: "t2", name: "김종원", code: "T2222", status: "active" }],
      students: [
        { id: "u1", code: "E0101", pin: "1234", name: "김예송", school: "예송중", grade: "중1", teacher: "박지은", class_name: "M중1A", status: "active" },
        { id: "u2", code: "E0102", pin: "1234", name: "박현우", school: "예송중", grade: "중1", teacher: "박지은", class_name: "M중1A", status: "active" },
        { id: "u3", code: "E0103", pin: "1234", name: "이송도", school: "예송중", grade: "중1", teacher: "김종원", class_name: "T중1D", status: "active" },
        { id: "u4", code: "E0104", pin: "1234", name: "최해송", school: "예송중", grade: "중1", teacher: "박지은", class_name: "M중1B", status: "active" },
        { id: "u5", code: "E0105", pin: "1234", name: "정민준", school: "예송중", grade: "중1", teacher: "김종원", class_name: "T중1D", status: "active" },
        { id: "u6", code: "E0106", pin: "1234", name: "한송이", school: "", grade: "중1", teacher: "박지은", class_name: "M중1B", status: "active" },
      ],
      exams: [{ id: 1, school: "예송중", grade: "중1", title: "2026 2학기 기말 수학 (데모)", exam_date: "2026-12-01", items, status: "열림", created_at: now() }],
      entries: [
        mk(1, "u2", { status: "선생님확인", wrong: [5, 14, 18], review: { 9: { why: "풀이 없이 정답만 썼습니다 (찍어서 맞혔을 수 있음)" }, 12: { why: "답은 맞았지만 풀이 중간에 중심각 비례식을 거꾸로 썼습니다" } },
          reasons: { 5: ["b2"], 14: ["c5", "k2"], 18: ["a5", "t2"] }, analysis: A, prep, promise1: "학원 숙제 외에 교과서를 한 번 더 풀었습니다.", promise2: "틀린 문제를 다시 풀고 검산하는 습관을 들이겠습니다.",
          comments: { summary: "몇몇 단원에서 놓친 점수를 채우면 한 단계 올라설 수 있는 위치입니다.", units: { "다면체와 회전체": "회전체의 단면 유형에서 5점을 놓쳤고, 원인은 주로 문제해결 영역입니다." }, plan: ["풀이를 줄 맞춰 쓰고 한 번 검산하는 습관을 함께 연습하겠습니다."], teacher: "" } }),
        mk(2, "u3", { status: "승인", wrong: [14, 18], review: { 9: { why: "풀이 없이 정답만 썼습니다" } }, reasons: { 14: ["c6"], 18: ["a5"] }, analysis: { 14: A[14], 18: A[18] }, prep,
          review_notes: { 9: "수업 시간에 풀이 과정을 쓰면서 다시 풀게 하겠습니다." }, comments: { summary: "전 범위를 고르게 준비했습니다.", units: {}, plan: ["거듭제곱 계산을 검산하는 습관을 함께 연습하겠습니다."],
            notes: { good: "시험 3주 전부터 교과서를 두 번 풀었음", growth: "서술형 풀이를 끝까지 쓰게 됨", wrongGood: "18번은 구의 부피 공식 선택과 식 세우기가 정확했는데 3³ 계산에서 실수", next: "입체도형 단원 개념 정리와 계산 후 검산" },
            teacher: "송도 학생은 이번 시험 기간에 시험 3주 전부터 교과서를 두 번 풀며 꾸준히 준비했습니다. 지난 시험보다 서술형 풀이를 끝까지 쓰게 된 점은 노력한 만큼 성장한 부분입니다. 18번은 구의 부피 공식을 정확히 고르고 식도 바르게 세웠는데, 마지막 3³ 계산에서 실수가 나와 더 아쉬웠습니다. 다음 시험 기간에는 입체도형 단원의 개념을 한 번 더 정리하고 계산 후 검산하는 습관을 학원에서 함께 챙기겠습니다.", polish: "완료" },
          promise1: "교과서를 두 번 풀었습니다.", promise2: "계산 실수를 줄이겠습니다.", parent_token: "demo0000000000000000000000000001", teacher_done_at: now(), approved_at: now(), edited_by: "선생님 김종원" }),
        mk(3, "u4", { status: "원인입력", wrong: [3, 7], review: { 11: { why: "풀이 없이 정답만 썼습니다" } } }),
        mk(4, "u5", { status: "선생님완료", wrong: [15], review: {}, reasons: { 15: ["b1"] }, analysis: { 15: { areas: ["이해"], stuck: "정다면체가 5가지뿐인 이유를 연결하지 못했습니다.", wrong: "", fix: "정다면체 표를 직접 채워 보기" } }, prep,
          comments: { summary: "", units: {}, plan: [], teacher: "개념 정리를 한 번 더 하면 충분히 오를 수 있습니다." }, teacher_done_at: now(), promise1: "-", promise2: "-" }),
      ],
    };
  }
  const load = () => { try { db = JSON.parse(localStorage.getItem(KEY)); } catch (_) { db = null; } if (!db) { db = seed(); save(); } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* 데모 저장 공간 가득 — 사진이 많을 때 */ } };
  const auth = p => { const s = db.students.find(x => x.code === String(p.code || "").trim().toUpperCase() && x.pin === String(p.pin || "") && x.status !== "inactive"); if (!s) throw new Error("학생 코드 또는 비밀번호가 맞지 않습니다 (데모: E0101 / 1234)"); return s; };
  const tauth = p => { const t = db.teachers.find(x => x.code === String(p.tcode || "").trim() && x.status !== "inactive"); if (!t) throw new Error("선생님 코드가 맞지 않습니다 (데모: T1111 박지은 · T2222 김종원)"); return t; };
  const isAdmin = p => { if (p.admin !== "0000") throw new Error("관리 코드가 맞지 않습니다 (데모: 0000)"); };
  const pub = s => ({ id: s.id, code: s.code, name: s.name, school: s.school || "", grade: s.grade, teacher: s.teacher, class_name: s.class_name || "" });
  const N = (x, n) => [...new Set((x || []).map(v => Math.trunc(+v)).filter(v => v >= 1 && v <= n))].sort((a, b) => a - b);
  const cleanR = (x, wrong) => { const r = {}; wrong.forEach(w => r[w] = [...new Set(((x || {})[w] || []).filter(k => AK.includes(k)))]); return r; };
  const urlsFor = paths => { const u = {}; (paths || []).forEach(q => { if (db.files[q]) u[q] = db.files[q]; }); return u; };
  const exam = id => db.exams.find(x => x.id === id);
  function staff(p, e, who) {
    const n = exam(e.exam_id).items.length;
    if (Array.isArray(p.wrong)) e.wrong = N(p.wrong, n);
    if (p.review) { const r = {}; Object.entries(p.review).forEach(([k, v]) => { if (+k >= 1 && +k <= n) r[k] = { why: String(v.why || "") }; }); e.review = r; }
    if (p.teacher_reasons) e.teacher_reasons = cleanR(p.teacher_reasons, N(Object.keys(p.teacher_reasons), n));
    if (p.analysis) e.analysis = p.analysis;
    if (p.review_notes) e.review_notes = p.review_notes;
    if (p.comments) {
      e.comments = p.comments;
      // 데모: PC 처리 때 최고AI가 하는 '다듬기'를 바로 흉내
      if (e.comments.polish === "요청") { const s = db.students.find(y => y.id === e.student_id); e.comments.teacher = "[데모 — 실제로는 최고AI가 다듬은 글] " + draftTeacher(e.comments.notes || {}, s ? s.name : ""); e.comments.polish = "완료"; }
    }
    e.edited_by = who; e.updated_at = now();
  }
  const doneProb = e => { const miss = Object.keys(e.review || {}).filter(k => !String((e.review_notes || {})[k] || "").trim()); if (miss.length) return `다시 볼 문항(${miss.join(", ")}번)에 코멘트를 적어 주세요`; if (!String((e.comments || {}).teacher || "").trim()) return "담임 코멘트를 적어 주세요"; return ""; };
  /* 데모 전용: PC 채점 · 분석 흉내 */
  function fakeGrade(e) {
    e.wrong = [3, 7, 16]; e.review = { 11: { why: "풀이 없이 정답만 썼습니다 (찍어서 맞혔을 수 있음)" } }; e.crops = {};
    [3, 7, 16, 11].forEach(n => { const p = `cr/${e.id}/${n}.jpg`; e.crops[n] = p; db.files[p] = svg(n, n === 11 ? "다시 볼 문항" : "틀린 문항", ["풀이 …", "x = 3"]); });
    e.status = "원인입력";
  }
  function fakeAnalyze(e) {
    e.analysis = {}; e.wrong.forEach(n => { const ar = [...new Set((e.reasons[n] || []).map(k => REASON_BY_KEY[k]?.area).filter(Boolean))]; e.analysis[n] = { areas: ar, stuck: "(데모) 최고AI가 시험지 풀이를 보고 접근이 막힌 곳을 적습니다.", wrong: "(데모) 틀린 줄과 이유를 적습니다.", fix: "(데모) 다시 풀 때 확인할 점" }; });
    e.comments = { summary: "(데모) 종합 분석 초안", units: {}, plan: ["(데모) 학원 관리 계획 초안"], teacher: (e.comments || {}).teacher || "" };
    e.status = "선생님확인";
  }
  function run(a, p) {
    switch (a) {
      case "login": return { student: pub(auth(p)) };
      case "set_school": { const s = auth(p); if (s.school) throw new Error("학교는 이미 정해져 있습니다"); if (!String(p.school || "").trim()) throw new Error("학교를 골라 주세요"); s.school = String(p.school).trim(); return { ok: true }; }
      case "home": {
        const s = auth(p);
        if (!s.school) return { student: pub(s), exams: [], entries: [], needSchool: true };
        const entries = db.entries.filter(e => e.student_id === s.id).map(e => {
          const open = e.status === "승인";
          return { id: e.id, exam_id: e.exam_id, status: e.status, pages: e.pages, wrong: e.status === "시험지제출" ? [] : e.wrong, review: e.status === "시험지제출" ? {} : e.review, crops: e.status === "시험지제출" ? {} : e.crops,
            reasons: e.reasons, prep: e.prep, promise1: e.promise1, promise2: e.promise2, admin_notes: open ? e.admin_notes : null,
            analysis: open ? e.analysis : null, review_notes: open ? e.review_notes : null, teacher_comment: open ? (e.comments || {}).teacher || "" : null, has_report: false, has_set: false };
        });
        const mine = new Set(entries.map(e => e.exam_id));
        return { student: pub(s), exams: db.exams.filter(x => x.school === s.school && x.grade === s.grade && (x.status === "열림" || mine.has(x.id))).map(x => ({ ...x, items: x.items.map(it => ({ ...it, ans: undefined })) })), entries };
      }
      case "page_put": { const s = auth(p); const path = `ph/${p.exam_id}/${s.id}/page_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.jpg`; db.files[path] = p.data; return { path }; }
      case "pages_submit": {
        const s = auth(p); const x = exam(+p.exam_id);
        if (!x || x.school !== s.school || x.grade !== s.grade) throw new Error("우리 학교 시험이 아닙니다");
        const pages = (p.pages || []).filter(q => db.files[q]).slice(0, 10); if (!pages.length) throw new Error("시험지 사진을 1장 이상 올려 주세요");
        let e = db.entries.find(y => y.exam_id === x.id && y.student_id === s.id);
        if (e && !["시험지제출", "반려"].includes(e.status)) throw new Error("이미 채점이 시작되었습니다");
        if (!e) { e = { id: ++seq, exam_id: x.id, student_id: s.id, wrong: [], review: {}, crops: {}, reasons: {}, teacher_reasons: {}, analysis: {}, review_notes: {}, comments: {}, prep: {}, created_at: now() }; db.entries.push(e); }
        Object.assign(e, { pages, status: "시험지제출" });
        fakeGrade(e);   // 데모: PC 채점을 바로 흉내
        return { ok: true, demo: "데모라서 채점을 바로 흉내 냈습니다" };
      }
      case "reasons_submit": {
        const s = auth(p); const e = db.entries.find(y => y.exam_id === +p.exam_id && y.student_id === s.id);
        if (!e || e.status !== "원인입력") throw new Error("지금은 원인을 적는 단계가 아닙니다");
        const reasons = cleanR(p.reasons, e.wrong);
        if (e.wrong.some(w => reasonProblem(reasons[w]))) throw new Error("틀린 문항마다 원인을 골라 주세요 (영역에서 1개 이상)");
        if (!String(p.promise1 || "").trim() || !String(p.promise2 || "").trim()) throw new Error("아래 두 질문에 답을 적어 주세요");
        Object.assign(e, { reasons, prep: p.prep || {}, promise1: p.promise1, promise2: p.promise2, status: "제출" });
        fakeAnalyze(e);   // 데모: PC 분석을 바로 흉내
        return { ok: true };
      }
      case "file_url": { const s = auth(p); return { urls: urlsFor((p.paths || []).filter(q => q.includes(s.id) || db.entries.some(e => e.student_id === s.id && Object.values(e.crops || {}).includes(q)))) }; }
      case "t_queue": {
        const t = tauth(p); const S = db.students.filter(s => s.teacher === t.name); const ids = S.map(s => s.id);
        const E = db.entries.filter(e => ids.includes(e.student_id)); const xs = new Set(E.map(e => e.exam_id));
        return { teacher: { name: t.name }, students: S, exams: db.exams.filter(x => xs.has(x.id)), entries: E.map(e => ({ ...e, parent_token: undefined })) };
      }
      case "t_url": { tauth(p); return { urls: urlsFor(p.paths) }; }
      case "t_save": {
        const t = tauth(p); const e = db.entries.find(y => y.id === +p.id);
        if (!e || db.students.find(s => s.id === e.student_id)?.teacher !== t.name) throw new Error("내 담당 학생 기록이 아닙니다");
        if (!["선생님확인", "선생님완료"].includes(e.status)) throw new Error(e.status === "승인" ? "이미 원장님이 승인했습니다" : "아직 분석 전입니다");
        const before = JSON.stringify(e); staff(p, e, "선생님 " + t.name);
        if (p.done === true) { const pr = doneProb(e); if (pr) { Object.assign(e, JSON.parse(before)); throw new Error(pr); } e.status = "선생님완료"; e.teacher_done_at = now(); }
        else if (p.done === false) { e.status = "선생님확인"; e.teacher_done_at = null; }
        return { ok: true };
      }
      case "admin_queue": { isAdmin(p); return { teachers: db.teachers, students: db.students, exams: [...db.exams].reverse(), entries: [...db.entries].reverse() }; }
      case "admin_url": { isAdmin(p); return { urls: urlsFor(p.paths) }; }
      case "admin_exam_save": {
        isAdmin(p); const x = p.exam; if (!x.school || !x.title) throw new Error("학교와 시험 이름을 적어 주세요");
        if (!(x.items || []).length) throw new Error("문항 표를 붙여넣어 주세요");
        let r = db.exams.find(y => y.id === +x.id); if (!r) { r = { id: ++seq, created_at: now() }; db.exams.push(r); }
        Object.assign(r, { school: x.school, grade: x.grade, title: x.title, exam_date: x.exam_date || null, items: x.items.map((it, i) => ({ ...it, no: i + 1 })), status: x.status === "닫힘" ? "닫힘" : "열림" });
        return { ok: true, id: r.id };
      }
      case "admin_entry_save": {
        isAdmin(p); const e = db.entries.find(y => y.id === +p.id); if (!e) throw new Error("없는 기록입니다");
        const before = JSON.stringify(e); staff(p, e, "원장");
        if ("admin_notes" in p) e.admin_notes = p.admin_notes || "";
        if (p.go === "승인") {
          if (!["선생님완료", "선생님확인", "승인"].includes(e.status)) { Object.assign(e, JSON.parse(before)); throw new Error("아직 분석 전입니다"); }
          const pr = doneProb(e); if (pr && !p.force) { Object.assign(e, JSON.parse(before)); throw new Error(pr + " (그래도 승인하려면 한 번 더 누르세요)"); }
          e.status = "승인"; e.approved_at = now(); if (!e.parent_token) e.parent_token = "demo" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        } else if (p.go === "선생님에게") { e.status = "선생님확인"; e.teacher_done_at = null; }
        else if (p.go === "학생에게") e.status = "원인입력";
        else if (p.go === "다시채점") e.status = "시험지제출";
        else if (p.go === "다시분석") e.status = "제출";
        return { ok: true };
      }
      case "admin_student_save": {
        isAdmin(p); const x = p.student; const code = String(x.code || "").trim().toUpperCase();
        if (!code || !x.name) throw new Error("학생 코드와 이름은 꼭 적어 주세요"); if (!/^\d{4}$/.test(String(x.pin || ""))) throw new Error("비밀번호는 숫자 4자리입니다");
        if (db.students.some(s => s.code === code && s.id !== x.id)) throw new Error("이미 있는 학생 코드입니다");
        let s = db.students.find(y => y.id === x.id); if (!s) { s = { id: "u" + Math.random().toString(36).slice(2, 10) }; db.students.push(s); }
        Object.assign(s, { code, pin: String(x.pin), name: x.name, school: x.school || "", grade: x.grade, teacher: x.teacher || "", class_name: x.class_name || "", status: x.status || "active" }); return { ok: true };
      }
      case "admin_teacher_save": {
        isAdmin(p); const x = p.teacher; if (!x.name || String(x.code || "").length < 4) throw new Error("이름과 4자 이상 코드를 적어 주세요");
        if (db.teachers.some(t => t.code === x.code && t.id !== x.id)) throw new Error("이미 쓰는 코드입니다");
        let t = db.teachers.find(y => y.id === x.id); if (!t) { t = { id: "t" + Math.random().toString(36).slice(2, 8) }; db.teachers.push(t); }
        Object.assign(t, { name: x.name, code: x.code, status: x.status || "active" }); return { ok: true };
      }
      case "parent_view": {
        const e = db.entries.find(y => y.parent_token && y.parent_token === p.t);
        if (!e || e.status !== "승인") throw new Error("열 수 없는 안내입니다. 학원으로 문의해 주세요");
        if (!e.parent_opened_at) e.parent_opened_at = now();
        const s = db.students.find(y => y.id === e.student_id), x = exam(e.exam_id), crops = {};
        Object.entries(e.crops || {}).forEach(([k, v]) => { if (db.files[v]) crops[k] = db.files[v]; });
        return { student: { name: s.name, teacher: s.teacher }, exam: { ...x, items: x.items.map(it => ({ ...it, ans: undefined })) }, wrong: e.wrong, review: e.review, crops, reasons: e.reasons,
          teacher_reasons: e.teacher_reasons, analysis: e.analysis, review_notes: e.review_notes, comments: e.comments, ack_at: e.parent_ack_at };
      }
      case "parent_ack": {
        const e = db.entries.find(y => y.parent_token && y.parent_token === p.t); if (!e || e.status !== "승인") throw new Error("열 수 없는 안내입니다");
        if (!e.parent_ack_at) e.parent_ack_at = now(); return { ack_at: e.parent_ack_at };
      }
      default: throw new Error("알 수 없는 요청: " + a);
    }
  }
  function handle(a, p) { if (!db) load(); seq = Math.max(seq, ...db.exams.map(x => x.id), ...db.entries.map(x => x.id)); try { const r = run(a, p); save(); return r; } catch (e) { return { error: e.message }; } }
  function reset() { localStorage.removeItem(KEY); db = null; }
  return { handle, reset };
})();
if (DEMO && typeof location !== "undefined" && new URLSearchParams(location.search).get("reset") === "1") Mock.reset();
