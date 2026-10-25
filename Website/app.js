/* =====================================================================
   MIRAI — India Market-Fit Engine
   Runs entirely on the real trained bundle (titles.json / states.json /
   model_meta.json / market.json / social.json). Gemini is used ONLY for
   the two things the dataset has no signal for: merchandise ideas and
   go-to-market copywriting — everything else (score, regions, gender,
   localization, revenue math) is computed from the real data, in the open.
   ===================================================================== */

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];
const INR_PER_USD = 87; // approx FX, Oct 2026 — illustrative only

const DB = {
  titles: [],
  states: null,
  meta: null,
  market: null,
  social: null,
  catalog: null,
};
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));

let PROFILE = null; // the currently analyzed title (real or synthesized)

/* ------------------------------------------------------------ LANGUAGE */
let LANG = (() => {
  try {
    return localStorage.getItem("mirai_lang") || "en";
  } catch (e) {
    return "en";
  }
})();
const I18N = {
  en: {
    "nav.analyzer": "Analyzer",
    "nav.dashboard": "Dashboard",
    "nav.score": "Market Score",
    "nav.regions": "Regions",
    "nav.localization": "Localization",
    "nav.revenue": "Revenue",
    "nav.launch": "Launch",
    "beta.badge": "β · 825 real titles",
    "hero.h1": "MIRAI<br>Market-Fit <em>for Indian Audiences</em>",
    "hero.sub":
      "Pick a real title, or describe a new one — scored by a model trained on 825 real titles + 5 years of India search data.",
    "mode.existing": "Pick a real title",
    "mode.custom": "Describe a new concept",
    "lbl.catFilter": "Filter by category",
    "lbl.titleSearch": "Title",
    "ph.titleSearch": "Start typing… e.g. Solo Leveling, Naruto",
    "lbl.customName": "Working title",
    "ph.customName": "e.g. Kaiju Requiem: Tokyo Protocol",
    "lbl.genreSelect": "Category / genre (pick several)",
    "lbl.fmtSelect": "Format",
    "lbl.srcSelect": "Source material",
    "note.custom": "Estimated from the nearest real comparable titles.",
    "btn.run": "Run analysis ⟳",
    "btn.copy": "Copy summary ⧉",
    "cat.all": "All categories",
    "stat.fans": "anime fans in India",
    "stat.corr": "model accuracy (cross-val)",
    "stat.titles": "real titles scored",
    "stat.states": "India states/UTs",
    "stat.survey": "India survey respondents",
    "title.hint": "{n} titles{f} — pick one exactly as listed.",
    "toast.pickTitle": "Pick a title from the list.",
    "toast.pickCat": "Pick at least one category.",
    "toast.done": "Analysis complete ✓",
    "toast.runFirst": "Run an analysis first.",
    "toast.copied": "Summary copied",
    "toast.copyFail": "Copy failed",
    "empty.msg": "No title analyzed yet.",
    "empty.cta": "Go to Analyzer",
    "dash.gist": "one-glance summary",
    "dash.real": "REAL TITLE",
    "dash.est": "ESTIMATED",
    "dash.of100": "/ 100",
    "dash.percentile": "Beats {p}% of titles",
    "tile.score": "Market score",
    "tile.regions": "Regions",
    "tile.localization": "Localization",
    "tile.revenue": "Revenue",
    "tile.launch": "Launch",
    "tile.gender": "Gender / audience",
    "tile.score.sub": "demand {d} · {skew}",
    "tile.regions.sub": "biggest reach: {reach}",
    "tile.localization.sub": "leading language, {hub}",
    "tile.revenue.sub": "est. Year-1 revenue",
    "tile.launch.sub": "go-to-market + merch ideas",
    "tile.gender.sub": "male {m}% · female {f}% · general {n}%",
    "cta.score": "Full breakdown →",
    "cta.regions": "All 34 states →",
    "cta.localization": "Language priority →",
    "cta.revenue": "5-year trend →",
    "cta.launch": "Full strategy →",
    "cta.gender": "Demographic detail →",
    "pro.revenue.banner": "PRO · Revenue trend",
    "pro.launch.banner": "PRO · Launch strategy",
    "crumb.dashboard": "← Dashboard",
    "score.fit.veryhigh": "Very strong fit",
    "score.fit.high": "Strong fit",
    "score.fit.mid": "Moderate fit",
    "score.fit.low": "Niche fit",
    "score.gist.sub": "Beats {p}% of 825 titles · confidence {c}",
    "score.driving": "What's driving the score",
    "score.who": "Who it's for",
    "score.archetypes": "Closest audience archetypes",
    "score.comparable": "Comparable titles",
    "score.method": "Methodology & honesty",
    "score.details": "Why these numbers",
    "score.whatMeans": "What does this score mean?",
    "skew.male": "Skews male",
    "skew.female": "Skews female",
    "skew.balanced": "Balanced appeal",
    "gender.male": "male",
    "gender.female": "female",
    "gender.general": "general",
    "regions.gist.sub": "strongest hub: {hub} ({mps}/100)",
    "regions.lift": "Where this title over-indexes",
    "regions.liftWhy": "Why this, not just the biggest state?",
    "regions.liftNote":
      "Raw fit and raw opportunity are both dominated by factors that have nothing to do with this title: opportunity is population × fit, so the most populous state (Uttar Pradesh) usually wins regardless of genre; raw fit is dominated by a handful of states with a structurally high anime baseline (notably in the Northeast). This instead compares this title's fit in each state to that state's own average across all 825 real titles — so it surfaces where this specific title does better than that state's typical title.",
    "regions.affinity": "Top by taste-fit",
    "regions.opportunity": "Top by scale opportunity",
    "regions.hubs": "Language hubs, ranked by fit",
    "regions.all": "All {n} states / UTs",
    "regions.details": "Table details",
    "th.state": "State",
    "th.hub": "Hub",
    "th.fit": "Fit",
    "th.opp": "Opportunity",
    "th.pop": "Pop (M)",
    "th.quad": "Quadrant",
    "loc.gist.sub": "national survey vs. real state search-interest",
    "loc.compare": "Two signals, compared",
    "loc.details": "Why two signals?",
    "loc.survey": "National survey",
    "loc.hub": "Strongest hub — Trends search",
    "loc.dub.en": "Dubbed (English)",
    "loc.subs": "Subtitles",
    "loc.dub.hi": "Hindi dub",
    "loc.priority": "Funding priority by hub",
    "loc.fundHi": "Fund Hindi dub",
    "loc.fundEn": "Fund English dub + subs",
    "loc.priorityTag": "PRIORITY",
    "loc.watchTag": "WATCH",
    "rev.gist.sub": "{pct}% share of India's ~${mkt}M anime market",
    "rev.year1": "Year-1 addressable revenue",
    "rev.trend": "5-year trend",
    "rev.commentary": "Monetisation commentary",
    "rev.sources": "Source audit",
    "rev.details": "How is this calculated?",
    "rev.age.title": "Which age group, which kind of anime?",
    "rev.age.sub":
      "Illustrative starting points by age band — then check your own idea against a specific age group below.",
    "rev.age.select": "Target age group",
    "rev.age.placeholder": "Describe your anime idea (genre, tone, format)…",
    "rev.age.check": "Check my idea",
    "rev.age.alt": "Suggest an idea for this group",
    "rev.haircut":
      "Discounted {pct}% below the raw model estimate for execution/confidence risk — see below.",
    "rev.range": "Year 1 range",
    "rev.share": "of the India anime market",
    "rev.cagr": "India market CAGR",
    "launch.gist.sub": "{dub} first, in {hub}",
    "launch.roadmap": "Go-to-market roadmap",
    "launch.phase1": "Phase 1 — Prove it",
    "launch.phase2": "Phase 2 — Expand",
    "launch.phase3": "Phase 3 — Monetise",
    "launch.angle": "Marketing angle",
    "launch.merch": "Merchandise ideas",
    "launch.risks": "Risks to manage",
    "launch.improve": "How to improve this score",
    "launch.improve.sub":
      "This title beats {pctl}% of the real catalog. Here's what's driving that, worst factor first, and what can realistically be done about each.",
    "ai.live": "AI-grounded recommendation.",
    "ai.fallback": "Data-grounded recommendation.",
    "ai.loading": "Generating recommendation…",
    "ai.regen": "Regenerate ⟳",
    "footer.note": "Scores are relative rankings, not revenue guarantees.",
  },
  hi: {
    "nav.analyzer": "विश्लेषक",
    "nav.dashboard": "डैशबोर्ड",
    "nav.score": "मार्केट स्कोर",
    "nav.regions": "क्षेत्र",
    "nav.localization": "भाषा रणनीति",
    "nav.revenue": "रेवेन्यू",
    "nav.launch": "लॉन्च",
    "beta.badge": "β · 825 असली टाइटल",
    "hero.h1": "MIRAI<br>भारतीय दर्शकों के लिए <em>मार्केट-फ़िट</em>",
    "hero.sub":
      "कोई असली टाइटल चुनें, या नया कॉन्सेप्ट बताएं — 825 टाइटल + 5 साल के भारत सर्च डेटा पर प्रशिक्षित मॉडल से स्कोर।",
    "mode.existing": "असली टाइटल चुनें",
    "mode.custom": "नया कॉन्सेप्ट बताएं",
    "lbl.catFilter": "श्रेणी से फ़िल्टर करें",
    "lbl.titleSearch": "टाइटल",
    "ph.titleSearch": "टाइप करें… जैसे Solo Leveling, Naruto",
    "lbl.customName": "वर्किंग टाइटल",
    "ph.customName": "जैसे Kaiju Requiem: Tokyo Protocol",
    "lbl.genreSelect": "श्रेणी / जॉनर (कई चुनें)",
    "lbl.fmtSelect": "फ़ॉर्मेट",
    "lbl.srcSelect": "स्रोत सामग्री",
    "note.custom": "सबसे मिलते-जुलते असली टाइटल से अनुमानित।",
    "btn.run": "विश्लेषण करें ⟳",
    "btn.copy": "सारांश कॉपी करें ⧉",
    "cat.all": "सभी श्रेणियाँ",
    "stat.fans": "भारत में एनिमे फ़ैन",
    "stat.corr": "मॉडल सटीकता (cross-val)",
    "stat.titles": "असली स्कोर किए टाइटल",
    "stat.states": "भारत के राज्य/UT",
    "stat.survey": "भारत सर्वे प्रतिभागी",
    "title.hint": "{n} टाइटल{f} — सूची से सही नाम चुनें।",
    "toast.pickTitle": "सूची से कोई टाइटल चुनें।",
    "toast.pickCat": "कम से कम एक श्रेणी चुनें।",
    "toast.done": "विश्लेषण पूरा ✓",
    "toast.runFirst": "पहले विश्लेषण चलाएँ।",
    "toast.copied": "सारांश कॉपी हुआ",
    "toast.copyFail": "कॉपी विफल",
    "empty.msg": "अभी कोई टाइटल विश्लेषित नहीं है।",
    "empty.cta": "विश्लेषक पर जाएँ",
    "dash.gist": "एक नज़र में सारांश",
    "dash.real": "असली टाइटल",
    "dash.est": "अनुमानित",
    "dash.of100": "/ 100",
    "dash.percentile": "{p}% टाइटलों से बेहतर",
    "tile.score": "मार्केट स्कोर",
    "tile.regions": "क्षेत्र",
    "tile.localization": "भाषा रणनीति",
    "tile.revenue": "रेवेन्यू",
    "tile.launch": "लॉन्च",
    "tile.gender": "लिंग / दर्शक",
    "tile.score.sub": "डिमांड {d} · {skew}",
    "tile.regions.sub": "सबसे बड़ी पहुँच: {reach}",
    "tile.localization.sub": "{hub} में अग्रणी भाषा",
    "tile.revenue.sub": "अनुमानित वर्ष-1 रेवेन्यू",
    "tile.launch.sub": "गो-टू-मार्केट + मर्च आइडिया",
    "tile.gender.sub": "पुरुष {m}% · महिला {f}% · सामान्य {n}%",
    "cta.score": "पूरा विवरण →",
    "cta.regions": "सभी 34 राज्य →",
    "cta.localization": "भाषा प्राथमिकता →",
    "cta.revenue": "5-वर्ष का ट्रेंड →",
    "cta.launch": "पूरी रणनीति →",
    "cta.gender": "विस्तृत जानकारी →",
    "pro.revenue.banner": "PRO · रेवेन्यू ट्रेंड",
    "pro.launch.banner": "PRO · लॉन्च रणनीति",
    "crumb.dashboard": "← डैशबोर्ड",
    "score.fit.veryhigh": "बहुत मजबूत फ़िट",
    "score.fit.high": "मजबूत फ़िट",
    "score.fit.mid": "औसत फ़िट",
    "score.fit.low": "नीश फ़िट",
    "score.gist.sub": "825 में से {p}% टाइटलों से बेहतर · विश्वास {c}",
    "score.driving": "स्कोर किससे बन रहा है",
    "score.who": "यह किसके लिए है",
    "score.archetypes": "सबसे करीबी दर्शक आर्केटाइप",
    "score.comparable": "तुलनीय टाइटल",
    "score.method": "पद्धति व पारदर्शिता",
    "score.details": "ये आँकड़े क्यों",
    "score.whatMeans": "इस स्कोर का मतलब क्या है?",
    "skew.male": "पुरुष-प्रधान",
    "skew.female": "महिला-प्रधान",
    "skew.balanced": "संतुलित अपील",
    "gender.male": "पुरुष",
    "gender.female": "महिला",
    "gender.general": "सामान्य",
    "regions.gist.sub": "सबसे मजबूत हब: {hub} ({mps}/100)",
    "regions.lift": "यह टाइटल कहाँ सबसे ज़्यादा उभरता है",
    "regions.liftWhy": "सिर्फ़ सबसे बड़ा राज्य क्यों नहीं?",
    "regions.liftNote":
      "कच्चा फ़िट और कच्चा अवसर दोनों ऐसे कारकों से प्रभावित हैं जिनका इस टाइटल से कोई लेना-देना नहीं: अवसर = जनसंख्या × फ़िट, इसलिए सबसे बड़ी आबादी वाला राज्य (उत्तर प्रदेश) लगभग हमेशा जॉनर चाहे जो भी हो, आगे रहता है; कच्चा फ़िट कुछ राज्यों (खासकर पूर्वोत्तर) के सहज रूप से उच्च बेसलाइन से प्रभावित है। यह इसके बजाय हर राज्य में इस टाइटल के फ़िट की तुलना उस राज्य के 825 असली टाइटलों के औसत फ़िट से करता है — ताकि पता चले कि यह टाइटल उस राज्य के सामान्य टाइटल से कहाँ बेहतर करता है।",
    "regions.affinity": "सबसे ज़्यादा पसंद",
    "regions.opportunity": "सबसे बड़ा अवसर",
    "regions.hubs": "भाषा हब, फ़िट अनुसार",
    "regions.all": "सभी {n} राज्य / UT",
    "regions.details": "टेबल विवरण",
    "th.state": "राज्य",
    "th.hub": "हब",
    "th.fit": "फ़िट",
    "th.opp": "अवसर",
    "th.pop": "जनसंख्या (M)",
    "th.quad": "क्वाड्रंट",
    "loc.gist.sub": "राष्ट्रीय सर्वे बनाम असली राज्य सर्च-रुचि",
    "loc.compare": "दो संकेत, साथ-साथ",
    "loc.details": "दो संकेत क्यों?",
    "loc.survey": "राष्ट्रीय सर्वे",
    "loc.hub": "सबसे मजबूत हब — सर्च रुचि",
    "loc.dub.en": "डब (अंग्रेज़ी)",
    "loc.subs": "सबटाइटल",
    "loc.dub.hi": "हिंदी डब",
    "loc.priority": "हब अनुसार प्राथमिकता",
    "loc.fundHi": "हिंदी डब में निवेश करें",
    "loc.fundEn": "अंग्रेज़ी डब + सबटाइटल",
    "loc.priorityTag": "प्राथमिकता",
    "loc.watchTag": "निगरानी",
    "rev.gist.sub": "भारत के ~${mkt}M एनिमे मार्केट का {pct}% हिस्सा",
    "rev.year1": "वर्ष-1 संभावित रेवेन्यू",
    "rev.trend": "5-वर्ष का ट्रेंड",
    "rev.commentary": "मुद्रीकरण टिप्पणी",
    "rev.sources": "स्रोत विवरण",
    "rev.details": "यह गणना कैसे हुई?",
    "rev.age.title": "किस आयु वर्ग के लिए किस तरह की एनीमे?",
    "rev.age.sub":
      "आयु वर्ग के अनुसार उदाहरण सुझाव — नीचे अपने खुद के आइडिया को किसी खास आयु वर्ग के लिए जांचें।",
    "rev.age.select": "लक्षित आयु वर्ग",
    "rev.age.placeholder": "अपना एनीमे आइडिया बताएं (जॉनर, टोन, फॉर्मेट)…",
    "rev.age.check": "मेरा आइडिया जांचें",
    "rev.age.alt": "इस आयु वर्ग के लिए आइडिया सुझाएं",
    "rev.haircut":
      "विश्वास/जोखिम के कारण मूल मॉडल अनुमान से {pct}% कम किया गया — नीचे देखें।",
    "rev.range": "वर्ष 1 सीमा",
    "rev.share": "भारत एनिमे मार्केट का",
    "rev.cagr": "भारत मार्केट CAGR",
    "launch.gist.sub": "{hub} में पहले {dub}",
    "launch.roadmap": "गो-टू-मार्केट रोडमैप",
    "launch.phase1": "चरण 1 — साबित करें",
    "launch.phase2": "चरण 2 — विस्तार करें",
    "launch.phase3": "चरण 3 — मुद्रीकरण करें",
    "launch.angle": "मार्केटिंग एंगल",
    "launch.merch": "मर्चेंडाइज़ आइडिया",
    "launch.risks": "जोखिम प्रबंधन",
    "launch.improve": "स्कोर कम क्यों है — और इसे कैसे सुधारें",
    "launch.improve.sub":
      "यह शीर्षक असली कैटलॉग के {pctl}% से आगे है। नीचे सबसे कमज़ोर फैक्टर पहले दिए गए हैं, साथ में हर एक पर क्या किया जा सकता है।",
    "ai.live": "AI-आधारित सुझाव।",
    "ai.fallback": "डेटा-आधारित सुझाव।",
    "ai.loading": "सुझाव बन रहा है…",
    "ai.regen": "फिर से बनाएँ ⟳",
    "footer.note": "स्कोर सापेक्ष रैंकिंग हैं, रेवेन्यू की गारंटी नहीं।",
  },
  ja: {
    "nav.analyzer": "アナライザー",
    "nav.dashboard": "ダッシュボード",
    "nav.score": "市場スコア",
    "nav.regions": "地域",
    "nav.localization": "ローカライズ",
    "nav.revenue": "収益",
    "nav.launch": "ローンチ",
    "beta.badge": "β・825タイトルで学習",
    "hero.h1": "MIRAI<br>インド市場への<em>マーケットフィット</em>",
    "hero.sub":
      "実在のタイトルを選ぶか、新しい企画を入力 — 825タイトル+5年分のインド検索データで学習したモデルがスコア化します。",
    "mode.existing": "実在のタイトルを選ぶ",
    "mode.custom": "新しい企画を入力",
    "lbl.catFilter": "カテゴリで絞り込み",
    "lbl.titleSearch": "タイトル",
    "ph.titleSearch": "入力してください… 例: Solo Leveling, Naruto",
    "lbl.customName": "仮タイトル",
    "ph.customName": "例: Kaiju Requiem: Tokyo Protocol",
    "lbl.genreSelect": "カテゴリ / ジャンル（複数選択可）",
    "lbl.fmtSelect": "フォーマット",
    "lbl.srcSelect": "原作",
    "note.custom": "最も近い実在タイトルから推定。",
    "btn.run": "分析を実行 ⟳",
    "btn.copy": "要約をコピー ⧉",
    "cat.all": "すべてのカテゴリ",
    "stat.fans": "インドのアニメファン",
    "stat.corr": "モデル精度（交差検証）",
    "stat.titles": "実測スコア済みタイトル",
    "stat.states": "インドの州/準州",
    "stat.survey": "インド調査回答者数",
    "title.hint": "{n}件のタイトル{f} — リストにある通りに選んでください。",
    "toast.pickTitle": "リストからタイトルを選んでください。",
    "toast.pickCat": "カテゴリを1つ以上選んでください。",
    "toast.done": "分析完了 ✓",
    "toast.runFirst": "先に分析を実行してください。",
    "toast.copied": "要約をコピーしました",
    "toast.copyFail": "コピーに失敗しました",
    "empty.msg": "まだタイトルが分析されていません。",
    "empty.cta": "アナライザーへ",
    "dash.gist": "ひと目でわかる要約",
    "dash.real": "実在タイトル",
    "dash.est": "推定",
    "dash.of100": "/ 100",
    "dash.percentile": "{p}%のタイトルを上回る",
    "tile.score": "市場スコア",
    "tile.regions": "地域",
    "tile.localization": "ローカライズ",
    "tile.revenue": "収益",
    "tile.launch": "ローンチ",
    "tile.gender": "性別 / 想定視聴者",
    "tile.score.sub": "需要 {d} ・ {skew}",
    "tile.regions.sub": "最大リーチ: {reach}",
    "tile.localization.sub": "{hub}で優勢な言語",
    "tile.revenue.sub": "初年度想定収益",
    "tile.launch.sub": "市場投入戦略＋グッズ案",
    "tile.gender.sub": "男性 {m}% ・ 女性 {f}% ・ 一般 {n}%",
    "cta.score": "詳細を見る →",
    "cta.regions": "全34州を見る →",
    "cta.localization": "言語優先度を見る →",
    "cta.revenue": "5年間のトレンド →",
    "cta.launch": "戦略の全体を見る →",
    "cta.gender": "詳細データ →",
    "pro.revenue.banner": "PRO・収益トレンド",
    "pro.launch.banner": "PRO・ローンチ戦略",
    "crumb.dashboard": "← ダッシュボード",
    "score.fit.veryhigh": "非常に高い適合度",
    "score.fit.high": "高い適合度",
    "score.fit.mid": "中程度の適合度",
    "score.fit.low": "ニッチな適合度",
    "score.gist.sub": "825タイトル中{p}%を上回る ・ 信頼度 {c}",
    "score.driving": "スコアを決める要因",
    "score.who": "想定視聴者",
    "score.archetypes": "近いオーディエンス層",
    "score.comparable": "類似タイトル",
    "score.method": "算出方法と透明性",
    "score.details": "この数値について",
    "score.whatMeans": "このスコアの意味は？",
    "skew.male": "男性寄り",
    "skew.female": "女性寄り",
    "skew.balanced": "バランス型",
    "gender.male": "男性",
    "gender.female": "女性",
    "gender.general": "一般",
    "regions.gist.sub": "最有力ハブ: {hub}（{mps}/100）",
    "regions.lift": "このタイトルが特に強い地域",
    "regions.liftWhy": "なぜ最大州だけではないのか？",
    "regions.liftNote":
      "単純な「フィット」も単純な「機会」も、このタイトル自体とは関係のない要因に左右されます。機会＝人口×フィットなので、ジャンルに関わらず人口最大のウッタル・プラデーシュ州がほぼ常に上位に来ます。フィットも、構造的にアニメ関心度が高い一部の州（特に北東部）に偏っています。この指標は、各州でのこのタイトルのフィットを、その州の825タイトル全体の平均フィットと比較し、このタイトルがその州の典型的なタイトルよりどれだけ強いかを示します。",
    "regions.affinity": "嗜好フィット上位",
    "regions.opportunity": "市場規模機会上位",
    "regions.hubs": "言語ハブ（適合度順）",
    "regions.all": "全{n}州 / 準州",
    "regions.details": "表の詳細",
    "th.state": "州",
    "th.hub": "ハブ",
    "th.fit": "適合度",
    "th.opp": "機会",
    "th.pop": "人口(M)",
    "th.quad": "象限",
    "loc.gist.sub": "全国調査 対 実際の州別検索関心",
    "loc.compare": "2つのシグナルを比較",
    "loc.details": "なぜ2つのシグナル？",
    "loc.survey": "全国調査",
    "loc.hub": "最有力ハブ — 検索トレンド",
    "loc.dub.en": "英語吹替",
    "loc.subs": "字幕",
    "loc.dub.hi": "ヒンディー語吹替",
    "loc.priority": "ハブ別の優先度",
    "loc.fundHi": "ヒンディー語吹替に投資",
    "loc.fundEn": "英語吹替＋字幕に投資",
    "loc.priorityTag": "優先",
    "loc.watchTag": "要観察",
    "rev.gist.sub": "インドの約${mkt}M市場の{pct}%",
    "rev.year1": "初年度想定収益",
    "rev.trend": "5年間のトレンド",
    "rev.commentary": "収益化コメント",
    "rev.sources": "出典一覧",
    "rev.details": "算出方法は？",
    "rev.age.title": "どの年齢層に、どんなアニメを？",
    "rev.age.sub":
      "年齢層別の参考案です — 下で自分のアイデアを特定の年齢層に合わせて確認できます。",
    "rev.age.select": "対象年齢層",
    "rev.age.placeholder":
      "あなたのアニメのアイデアを入力してください（ジャンル、トーン、形式など）…",
    "rev.age.check": "アイデアを確認",
    "rev.age.alt": "この年齢層向けの案を提案",
    "rev.haircut":
      "信頼度・実行リスクを考慮し、モデルの元の推定値から{pct}%割り引いています — 詳細は下記。",
    "rev.range": "初年度のレンジ",
    "rev.share": "インドのアニメ市場に対する割合",
    "rev.cagr": "インド市場CAGR",
    "launch.gist.sub": "まず{hub}で{dub}",
    "launch.roadmap": "市場投入ロードマップ",
    "launch.phase1": "フェーズ1 — 実証",
    "launch.phase2": "フェーズ2 — 拡大",
    "launch.phase3": "フェーズ3 — 収益化",
    "launch.angle": "マーケティングの切り口",
    "launch.merch": "グッズ案",
    "launch.risks": "管理すべきリスク",
    "launch.improve": "スコアが低い理由 — そして改善方法",
    "launch.improve.sub":
      "このタイトルは実データの{pctl}%を上回っています。最も弱い要因から順に、それぞれに対して現実的にできることを示します。",
    "ai.live": "AIによる推奨（データ根拠あり）。",
    "ai.fallback": "データに基づく推奨。",
    "ai.loading": "推奨を生成中…",
    "ai.regen": "再生成 ⟳",
    "footer.note":
      "スコアは相対的なランキングであり、収益を保証するものではありません。",
  },
};
function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
  if (vars)
    Object.entries(vars).forEach(([k, v]) => {
      s = s.replace(new RegExp("\\{" + k + "\\}", "g"), v);
    });
  return s;
}
function applyI18N() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
}
function setLang(l) {
  LANG = l;
  try {
    localStorage.setItem("mirai_lang", l);
  } catch (e) {}
  document
    .querySelectorAll("#langToggle button")
    .forEach((b) => b.classList.toggle("on", b.dataset.lang === l));
  applyI18N();
  populateControls();
  routeFromHash();
}

/* ---------------------------------------------------------------- DATA */
async function fetchJSON(path) {
  const r = await fetch(path, { cache: "force-cache" });
  if (!r.ok) throw new Error("failed to load " + path);
  return r.json();
}

async function loadAll() {
  const files = [
    ["titles", "data/titles.json"],
    ["states", "data/states.json"],
    ["meta", "data/model_meta.json"],
    ["market", "data/market.json"],
    ["social", "data/social.json"],
    ["catalog", "data/catalog_meta.json"],
    ["trends", "data/trends_regional.json"],
  ];
  let done = 0;
  for (const [key, path] of files) {
    DB[key] = await fetchJSON(path);
    done++;
    const p = $("splashProg");
    if (p) p.textContent = `${done} / ${files.length} datasets`;
  }
  DB.titles = DB.titles; // array
  DB.stateNames = DB.states.states.map((s) => s.name);
  DB.stateByName = Object.fromEntries(DB.states.states.map((s) => [s.name, s]));
  // total weight for revenue-share normalisation (power-law over the real catalog)
  DB.sumWeight3 = DB.titles.reduce(
    (s, t) => s + Math.pow((t.pctl ?? 50) / 100, 3),
    0,
  );
  // Replace each real title's regional fit with a genre-aware blend of the REAL per-state
  // Google Trends z-scores already shipped in states.json (states[].z, one real search-
  // interest series per topical/channel/generic query, plus anchor_profiles mapping each
  // topical query to the genres it represents) — instead of the trained dataset's own
  // per-title 'm' field, which barely varies by genre at all (verified: ~90% of titles
  // shared the same #1 state regardless of genre, because 'm' is dominated by each state's
  // static baseline). This blends queries by real genre overlap with the title, so it's
  // built entirely from the real data already provided, just used properly.
  DB.titles.forEach((t) => applyTrendsRegional(t));
  DB.titleById = Object.fromEntries(DB.titles.map((t) => [t.id, t]));
  // per-state baseline fit (average 'm' for that state across all 825 real titles, now
  // trends-corrected) — used to find where THIS title over-indexes vs. that state's
  // typical title (see stateLift()).
  const sums = {},
    counts = {};
  DB.titles.forEach((t) => {
    (t.sd || []).forEach((s) => {
      sums[s.s] = (sums[s.s] || 0) + s.m;
      counts[s.s] = (counts[s.s] || 0) + 1;
    });
  });
  DB.stateBaselineM = {};
  Object.keys(sums).forEach((name) => {
    DB.stateBaselineM[name] = sums[name] / counts[name];
  });
}

const NAMED_TITLE_QUERIES = [
  "naruto",
  "one piece",
  "attack on titan",
  "demon slayer",
  "jujutsu kaisen",
];
const TOPICAL_BUCKET_KEY = {
  "action anime": "action",
  "romance anime": "romance",
  "horror anime": "horror",
};
// Builds a genre-aware per-state fit (0-100) from the REAL per-query Google Trends region
// tables the user supplied (data/trends_regional.json, parsed directly from their CSVs).
// NOTE: states.json's own pre-baked z-scores were tried first and rejected — cross-checking
// showed they compress away almost all of the real differentiation between the leading
// states for different queries (e.g. action-anime's real Nagaland=100/Manipur=68 split
// becomes a near-tied 0.789/0.79 in z), which is exactly why the trained titles' own 'sd.m'
// barely varies by genre. The raw per-query CSV values preserve that real spread, so they
// drive the ranking; states.json.anchor_profiles (genre/tag lists per query) still decides,
// via real Jaccard overlap with the title's own genres+tags, how much weight each query gets.
function trendsFitForProfile(p) {
  const TR = DB.trends,
    S = DB.states;
  if (!TR || !S) return null;
  const nameLower = (p.t || "").toLowerCase();
  const namedKey = NAMED_TITLE_QUERIES.find((k) => nameLower.includes(k));
  const titleTags = [...(p.g || []), ...(p.tg || [])];
  const weights = {}; // bucket key -> weight
  Object.entries(TOPICAL_BUCKET_KEY).forEach(([query, bucketKey]) => {
    const profile = (S.anchor_profiles && S.anchor_profiles[query]) || [];
    weights[bucketKey] = jaccard(titleTags, profile);
  });
  let totalW = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalW < 0.05) {
    ["action", "romance", "horror"].forEach((k) => {
      weights[k] = (weights[k] || 0) + 0.3;
    });
    totalW = 0.9;
  }
  const genericW = Math.max(0.35, totalW * 0.35);
  weights.anime = (weights.anime || 0) + genericW * 0.55;
  weights.anime_india = (weights.anime_india || 0) + genericW * 0.45;
  weights[p.fmt === "MOVIE" ? "movies" : "series"] =
    (weights[p.fmt === "MOVIE" ? "movies" : "series"] || 0) + genericW * 0.3;
  weights.streaming = (weights.streaming || 0) + genericW * 0.15;
  if (p.src === "MANGA") weights.manga = (weights.manga || 0) + genericW * 0.2;
  if (namedKey) weights.__named = 1.4; // named-title CSV gets the strongest, most specific weight

  totalW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  DB.stateNames.forEach((name) => {
    let sum = 0;
    Object.entries(weights).forEach(([k, w]) => {
      if (!w) return;
      const bucket = k === "__named" ? TR.titles[namedKey] : TR.buckets[k];
      if (bucket) sum += (bucket[name] ?? 25) * w;
    });
    out[name] = sum / totalW;
  });
  return out;
}
// Overwrites a profile's per-state fit/opportunity with the real Trends-derived signal.
// Works in place on real titles (loadAll) and is also called on synthesized profiles.
function applyTrendsRegional(p) {
  const tfit = trendsFitForProfile(p);
  if (!tfit || !p.sd) return p;
  p.sd.forEach((s) => {
    s.m = Math.round((tfit[s.s] ?? s.m) * 10) / 10;
  });
  const totalOpp = p.sd.reduce((sum, x) => sum + x.m * x.p, 0) || 1;
  p.sd.forEach((x) => (x.o = Math.round(((x.m * x.p) / totalOpp) * 1000) / 10));
  p.topaff = [...p.sd]
    .sort((a, b) => b.m - a.m)
    .slice(0, 5)
    .map((x) => x.s);
  p.topopp = [...p.sd]
    .sort((a, b) => b.o - a.o)
    .slice(0, 5)
    .map((x) => x.s);
  return p;
}
// states where this title's fit (m) beats that state's own average fit across the
// real 825-title catalog the most — i.e. genuine title-specific lift, not just a state's
// structural baseline or its population.
function stateLift(sd) {
  return [...sd]
    .map((s) => ({ ...s, lift: s.m - (DB.stateBaselineM[s.s] ?? s.m) }))
    .sort((a, b) => b.lift - a.lift);
}

/* ------------------------------------------------------------ GEMINI */
async function geminiGenerate(prompt) {
  for (const model of GEMINI_MODELS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 14000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: ctrl.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 500, temperature: 0.8 },
          }),
        },
      );
      clearTimeout(timer);
      if (!res.ok) continue;
      const j = await res.json();
      const text =
        j?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
      if (text.trim()) return { text: text.trim(), model };
    } catch (e) {
      /* try next model */
    }
  }
  return null;
}

async function renderGeminiBlock(container, cacheKey, buildPrompt, fallback) {
  const profile = PROFILE; // capture by reference: if the user switches titles (or it
  // becomes null) before this in-flight request resolves, we must not write into or
  // re-render for whatever profile is active by then — only for the one this was for.
  if (!profile) return;
  if (!profile._gemini) profile._gemini = {};
  const key = cacheKey + "_" + LANG;
  const renderText = (text, isLive) => {
    if (PROFILE !== profile) return; // stale — a different title is showing now
    const paras = text
      .split(/\n+/)
      .filter(Boolean)
      .map((p) => `<p>${esc(p)}</p>`)
      .join("");
    container.innerHTML = `<div class="gen-text">${paras}</div>
      <p class="note">${isLive ? t("ai.live") : t("ai.fallback")}
      <button class="btn ghost" id="regen-${key}" style="margin-left:8px;padding:4px 10px;font-size:10px">${t("ai.regen")}</button></p>`;
    const btn = $(`regen-${key}`);
    if (btn)
      btn.onclick = () => {
        profile._gemini[key] = null;
        renderGeminiBlock(container, cacheKey, buildPrompt, fallback);
      };
  };
  if (profile._gemini[key]) {
    renderText(profile._gemini[key].text, profile._gemini[key].live);
    return;
  }
  container.innerHTML = `<div class="loading"><div class="spin"></div> ${t("ai.loading")}</div>`;
  const langSuffix =
    LANG === "hi"
      ? " Respond only in Hindi (Devanagari script)."
      : LANG === "ja"
        ? " Respond only in Japanese."
        : "";
  const prompt = buildPrompt() + langSuffix;
  const result = await geminiGenerate(prompt);
  if (result) {
    profile._gemini[key] = { text: result.text, live: true };
    renderText(result.text, true);
  } else {
    const fb = fallback();
    profile._gemini[key] = { text: fb, live: false };
    renderText(fb, false);
  }
}

/* ------------------------------------------------------- SIMILARITY ENGINE */
function jaccard(a, b) {
  const sa = new Set(a),
    sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const uni = new Set([...sa, ...sb]).size;
  return uni ? inter / uni : 0;
}
function wavg(items, getVal, getW) {
  let num = 0,
    den = 0;
  for (const it of items) {
    const w = getW(it) || 0.001;
    const v = getVal(it);
    if (v == null) continue;
    num += v * w;
    den += w;
  }
  return den ? num / den : null;
}

function synthesizeProfile({ name, genres, fmt, src }) {
  const scored = DB.titles
    .map((t) => {
      const jac = jaccard(t.g, genres);
      const fmtBonus = t.fmt === fmt ? 0.15 : 0;
      const srcBonus = t.src === src ? 0.1 : 0;
      return { t, sim: jac * 0.75 + fmtBonus + srcBonus };
    })
    .filter((x) => x.sim > 0.05)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 16);
  const pool = scored.length
    ? scored
    : DB.titles.slice(0, 10).map((t) => ({ t, sim: 0.05 }));

  // attribution: union of factor names, weighted avg points (missing -> 0)
  const factorNames = [
    ...new Set(pool.flatMap((x) => x.t.attr.map((a) => a.f))),
  ];
  const attr = factorNames
    .map((f) => ({
      f,
      p:
        Math.round(
          wavg(
            pool,
            (x) => x.t.attr.find((a) => a.f === f)?.p ?? 0,
            (x) => x.sim,
          ) * 10,
        ) / 10,
    }))
    .sort((a, b) => Math.abs(b.p) - Math.abs(a.p));

  // archetypes: union by label
  const archLabels = [
    ...new Set(pool.flatMap((x) => x.t.arch.map((a) => a.l))),
  ].slice(0, 4);
  const arch = archLabels.map((l) => ({
    l,
    a: Math.round(
      wavg(
        pool,
        (x) => x.t.arch.find((a) => a.l === l)?.a ?? null,
        (x) => x.sim,
      ) || 0,
    ),
    s:
      Math.round(
        (wavg(
          pool,
          (x) => x.t.arch.find((a) => a.l === l)?.s ?? null,
          (x) => x.sim,
        ) || 0) * 10,
      ) / 10,
  }));

  // demographic fit: union of 5 buckets, weighted avg, renormalised to 100
  const demoKeys = [...new Set(pool.flatMap((x) => Object.keys(x.t.demo)))];
  let demo = {};
  demoKeys.forEach((k) => {
    demo[k] =
      wavg(
        pool,
        (x) => x.t.demo[k] ?? null,
        (x) => x.sim,
      ) || 0;
  });
  const demoSum = Object.values(demo).reduce((a, b) => a + b, 0) || 1;
  Object.keys(demo).forEach(
    (k) => (demo[k] = Math.round((demo[k] / demoSum) * 1000) / 10),
  );

  // state detail: weighted avg per state
  const sd = DB.stateNames.map((name) => {
    const m = wavg(
      pool,
      (x) => x.t.sd.find((s) => s.s === name)?.m ?? null,
      (x) => x.sim,
    );
    const f = wavg(
      pool,
      (x) => x.t.sd.find((s) => s.s === name)?.f ?? null,
      (x) => x.sim,
    );
    return {
      s: name,
      h: DB.stateByName[name].hub,
      m: Math.round((m ?? 50) * 10) / 10,
      f: Math.round((f ?? 50) * 10) / 10,
      p: DB.stateByName[name].pop_m,
      q: "Estimated",
      b: [],
    };
  });
  const totalOpp = sd.reduce((s, x) => s + x.m * x.p, 0) || 1;
  sd.forEach((x) => (x.o = Math.round(((x.m * x.p) / totalOpp) * 1000) / 10));
  const topaff = [...sd]
    .sort((a, b) => b.f - a.f)
    .slice(0, 5)
    .map((x) => x.s);
  const topopp = [...sd]
    .sort((a, b) => b.o - a.o)
    .slice(0, 5)
    .map((x) => x.s);

  const mps = wavg(
    pool,
    (x) => x.t.mps,
    (x) => x.sim,
  );
  const profile = {
    id: "custom-" + Date.now(),
    t: name || "Untitled Project",
    fmt,
    src,
    ep: null,
    stu: null,
    g: genres,
    tg: [],
    seq: false,
    mps: Math.round(mps * 10) / 10,
    dem:
      Math.round(
        wavg(
          pool,
          (x) => x.t.dem,
          (x) => x.sim,
        ) * 10,
      ) / 10,
    dlo:
      Math.round(
        wavg(
          pool,
          (x) => x.t.dlo,
          (x) => x.sim,
        ) * 10,
      ) / 10,
    dhi:
      Math.round(
        wavg(
          pool,
          (x) => x.t.dhi,
          (x) => x.sim,
        ) * 10,
      ) / 10,
    reach:
      Math.round(
        wavg(
          pool,
          (x) => x.t.reach,
          (x) => x.sim,
        ) * 10,
      ) / 10,
    qual:
      Math.round(
        wavg(
          pool,
          (x) => x.t.qual,
          (x) => x.sim,
        ) * 10,
      ) / 10,
    conf: "Estimated",
    pctl:
      Math.round(
        wavg(
          pool,
          (x) => x.t.pctl,
          (x) => x.sim,
        ) * 10,
      ) / 10,
    attr,
    arch,
    demo,
    cmp: pool.slice(0, 4).map((x) => x.t.t),
    narr: [
      `Estimated from ${pool.length} comparable real titles in the trained catalog (closest matches: ${pool
        .slice(0, 3)
        .map((x) => x.t.t)
        .join(", ")}).`,
    ],
    stage: "concept",
    status: "ESTIMATED",
    date: null,
    img: null,
    col: "#ff2d4f",
    topaff,
    topopp,
    sd,
    _synth: true,
    _comparables: pool
      .slice(0, 8)
      .map((x) => ({ t: x.t.t, sim: Math.round(x.sim * 100) })),
  };
  // use the directly-known name/genres/format (more precise than the comparable-pool
  // average) to re-derive the region signal from the real Trends CSVs.
  applyTrendsRegional(profile);
  return profile;
}

/* ----------------------------------------------------------- HELPERS */
function genderSplit(demo) {
  const get = (needle) =>
    Object.entries(demo).find(([k]) => k.toLowerCase().includes(needle))?.[1] ||
    0;
  const male = get("shounen") + get("seinen");
  const female = get("shoujo") + get("josei");
  const neutral = get("kids");
  let skew = "Balanced / broad appeal";
  if (male > female + 15) skew = "Skews male";
  else if (female > male + 15) skew = "Skews female";
  return {
    male: Math.round(male * 10) / 10,
    female: Math.round(female * 10) / 10,
    neutral: Math.round(neutral * 10) / 10,
    skew,
  };
}
function hubAgg(sd) {
  const byHub = {};
  sd.forEach((s) => {
    (byHub[s.h] ||= []).push(s);
  });
  return Object.entries(byHub)
    .map(([hub, arr]) => {
      const pop = arr.reduce((a, b) => a + b.p, 0) || 1;
      const mps = arr.reduce((a, b) => a + b.m * b.p, 0) / pop;
      return {
        hub,
        mps: Math.round(mps * 10) / 10,
        states: arr.map((a) => a.s),
        pop,
      };
    })
    .sort((a, b) => b.mps - a.mps);
}
function hubLangZ(hub) {
  const states = DB.states.states.filter((s) => s.hub === hub);
  if (!states.length) return { hindi: 0.5, english: 0.5 };
  const pop = states.reduce((a, b) => a + b.pop_m, 0) || 1;
  const hindi =
    states.reduce((a, b) => a + (b.z["hindi dubbed anime"] || 0) * b.pop_m, 0) /
    pop;
  const english =
    states.reduce(
      (a, b) => a + (b.z["english dubbed anime"] || 0) * b.pop_m,
      0,
    ) / pop;
  return { hindi, english };
}
function parseNum(str) {
  const m = String(str)
    .replace(/,/g, "")
    .match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : null;
}
function marketFacts() {
  const rows = DB.market.raw_facts;
  const sizes25 = rows
    .filter((r) => r.metric.includes("market size (2025)"))
    .map((r) => parseNum(r.value));
  const sizes34 = rows
    .filter((r) => r.metric.includes("2034 forecast"))
    .map((r) => parseNum(r.value));
  const cagrs = rows
    .filter((r) => r.metric.includes("CAGR"))
    .map((r) => parseNum(r.value));
  const fans = parseNum(
    rows.find((r) => r.metric.includes("fans in India"))?.value,
  );
  const viewers = parseNum(
    rows.find((r) => r.metric.includes("Active anime viewers"))?.value,
  );
  return {
    size25: {
      low: Math.min(...sizes25),
      high: Math.max(...sizes25),
      mid: sizes25.reduce((a, b) => a + b, 0) / sizes25.length,
    },
    size34: { low: Math.min(...sizes34), high: Math.max(...sizes34) },
    cagr: { low: Math.min(...cagrs) / 100, high: Math.max(...cagrs) / 100 },
    fansM: fans,
    viewersM: viewers,
  };
}
function fmtCr(usdMillions) {
  const inrCr = (usdMillions * 1e6 * INR_PER_USD) / 1e7; // crore
  if (inrCr >= 100) return "₹" + (inrCr / 100).toFixed(1) + " hundred cr";
  return "₹" + inrCr.toFixed(1) + " cr";
}
function toast(m) {
  const t = $("toast");
  t.textContent = m;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}
function bar(label, val, desc, color) {
  return `<div class="bar"><div class="top"><span>${esc(label)}</span><span>${Math.round(val)}</span></div>
    <div class="t"><i style="width:${clamp(val)}%;${color ? `background:${color}` : ""}"></i></div>
    ${desc ? `<p style="font-size:12px;color:var(--mute);margin-top:2px">${esc(desc)}</p>` : ""}</div>`;
}
function hbar(name, val, max, color) {
  return `<div class="sbar"><span class="nm">${esc(name)}</span><div class="st"><i style="width:${clamp((val / max) * 100)}%;background:${color}"></i></div><span class="val">${typeof val === "number" ? val.toFixed(1) : val}</span></div>`;
}
/* one-glance header shown at the very top of every detail tab */
function gist(icon, label, bigValue, sub) {
  return `<div class="gist"><div class="gicon">${icon}</div><div><div class="glabel">${esc(label)}</div><div class="gnum">${bigValue}</div>${sub ? `<div class="gsub">${sub}</div>` : ""}</div></div>`;
}
function details(summary, bodyHtml) {
  return `<details><summary>${esc(summary)}</summary>${bodyHtml}</details>`;
}
// deterministic, factor-specific advice for the "how to improve this score" launch section —
// keyed off the model's own attribution factor names so it's grounded in the real breakdown,
// not generic encouragement.
const FACTOR_ADVICE = {
  "Historical audience priors":
    "The model's prior for titles like this has underperformed historically in India — consider leaning into a sub-genre or hook that already has a track record here rather than fighting the base rate.",
  "Source material":
    "Source material is working against this one — manga/LN adaptations and established IP tend to outperform originals in India; if possible, anchor the pitch to recognizable source material.",
  "Studio track record":
    "The attached studio's past India performance is soft — pairing with a studio that has a stronger India track record, or leaning harder on marketing to compensate, are the two realistic options.",
  "Genre mix":
    "Genre mix is already a net positive here — keep it, and avoid diluting it by adding too many secondary genres that blur the pitch.",
  "Format & length":
    "Format/length is working against this — a shorter season, movie, or different episode count may fit India viewing habits better; see the Format dropdown on Analyzer.",
  "Themes & tags":
    "Specific themes/tags are soft — tightening the pitch around the 1-2 tags with the strongest India resonance (see Comparable titles) usually helps more than broadening it.",
  "Release timing":
    "Release timing is a drag — avoid clashing with major tentpole releases or cricket windows; the Launch roadmap's phase 1 timing should be revisited.",
  "India audience signal (survey)":
    "Direct India audience signal is weak — this is the hardest one to fix quickly; a longer pre-launch community-building phase (see Phase 1) is the main lever.",
  "Franchise position":
    "No franchise/sequel credit is being given — if this is part of a larger franchise, make that connection more explicit in positioning and marketing.",
};
function factorAdvice(a) {
  const advice =
    FACTOR_ADVICE[a.f] ||
    (a.p < 0
      ? "This factor is pulling the score down — treat it as a fixed constraint and compensate elsewhere in the launch plan."
      : "This factor is already working in the title's favour — don't dilute it.");
  const color = a.p >= 0 ? "#34d399" : "#ff2d4f";
  return `<div class="risk"><span class="lv" style="background:${color}22;color:${color};border:1px solid ${color}55;border-radius:6px;padding:3px 6px;text-align:center">${a.p > 0 ? "+" : ""}${a.p}</span><div><b>${esc(a.f)}</b><br><span style="color:var(--mute)">${esc(advice)}</span></div></div>`;
}

/* --------------------------------------------------------------- UI INIT */
function populateControls() {
  const catVal = $("catFilter").value;
  $("catFilter").innerHTML =
    `<option value="">${t("cat.all")}</option>` +
    DB.catalog.genres
      .map((g) => `<option value="${esc(g)}">${esc(g)}</option>`)
      .join("");
  $("catFilter").value = catVal || "";
  rebuildTitleList($("catFilter").value);
  const gSel = $("genreSelect").selectedOptions
    ? Array.from($("genreSelect").selectedOptions).map((o) => o.value)
    : [];
  $("genreSelect").innerHTML = DB.catalog.genres
    .map(
      (g) =>
        `<option value="${esc(g)}" ${gSel.includes(g) ? "selected" : ""}>${esc(g)}</option>`,
    )
    .join("");
  const fmtVal = $("fmtSelect").value,
    srcVal = $("srcSelect").value;
  $("fmtSelect").innerHTML = DB.catalog.formats
    .map(
      (f) => `<option value="${esc(f)}">${esc(f.replace("_", " "))}</option>`,
    )
    .join("");
  $("srcSelect").innerHTML = DB.catalog.sources
    .map(
      (s) => `<option value="${esc(s)}">${esc(s.replace("_", " "))}</option>`,
    )
    .join("");
  $("fmtSelect").value = fmtVal || "TV";
  $("srcSelect").value = srcVal || "MANGA";
  const heroStats = [
    [
      DB.market ? "~" + Math.round(marketFacts().fansM) + "M" : "—",
      t("stat.fans"),
    ],
    [Math.round(DB.meta.demand_cv.spearman_blend * 100) + "%", t("stat.corr")],
    [DB.meta.counts.titles_scored, t("stat.titles")],
    [DB.states.states.length, t("stat.states")],
    [Math.round(DB.meta.audience_survey.n_india_respondents), t("stat.survey")],
  ];
  $("heroStats").innerHTML = heroStats
    .map(
      ([a, b]) => `<div class="stat"><b>${a}</b><span>${esc(b)}</span></div>`,
    )
    .join("");
}
function rebuildTitleList(genreFilter) {
  const list = genreFilter
    ? DB.titles.filter((tt) => tt.g.includes(genreFilter))
    : DB.titles;
  $("titleList").innerHTML = list
    .slice(0, 2000)
    .map((tt) => `<option value="${esc(tt.t)}">`)
    .join("");
  $("titleHint").textContent = t("title.hint", {
    n: list.length,
    f: genreFilter ? " — " + genreFilter : "",
  });
}

function setupControls() {
  $("catFilter").onchange = (e) => rebuildTitleList(e.target.value);
  $("modeExisting").onclick = () => {
    $("modeExisting").classList.add("on");
    $("modeCustom").classList.remove("on");
    $("existingPanel").style.display = "";
    $("customPanel").style.display = "none";
  };
  $("modeCustom").onclick = () => {
    $("modeCustom").classList.add("on");
    $("modeExisting").classList.remove("on");
    $("customPanel").style.display = "";
    $("existingPanel").style.display = "none";
  };
  document
    .querySelectorAll("#langToggle button")
    .forEach((b) => (b.onclick = () => setLang(b.dataset.lang)));

  $("runBtn").onclick = () => {
    const mode = $("modeCustom").classList.contains("on")
      ? "custom"
      : "existing";
    if (mode === "existing") {
      const name = $("titleSearch").value.trim();
      const found = DB.titles.find(
        (tt) => tt.t.toLowerCase() === name.toLowerCase(),
      );
      if (!found) {
        toast(t("toast.pickTitle"));
        return;
      }
      PROFILE = found;
      PROFILE._gemini = null;
    } else {
      const genres = Array.from($("genreSelect").selectedOptions).map(
        (o) => o.value,
      );
      if (!genres.length) {
        toast(t("toast.pickCat"));
        return;
      }
      PROFILE = synthesizeProfile({
        name: $("customName").value.trim(),
        genres,
        fmt: $("fmtSelect").value,
        src: $("srcSelect").value,
      });
    }
    renderDashboard();
    location.hash = "#dashboard";
    toast(t("toast.done"));
  };

  $("copyBtn").onclick = () => {
    if (!PROFILE) {
      toast(t("toast.runFirst"));
      return;
    }
    const g = genderSplit(PROFILE.demo);
    const topState =
      stateLift(PROFILE.sd)[0]?.s ||
      PROFILE.topopp[0] ||
      PROFILE.topaff[0] ||
      "—";
    const txt = `MIRAI — ${PROFILE.t}\n${PROFILE.g.join(" · ")} | ${PROFILE.fmt} | ${PROFILE.src}\nMarket-fit score: ${PROFILE.mps}/100 (percentile ${PROFILE.pctl})\nTop state: ${topState}\nAudience skew: ${g.skew} (male ${g.male}% / female ${g.female}% / general ${g.neutral}%)`;
    navigator.clipboard.writeText(txt).then(
      () => toast(t("toast.copied")),
      () => toast(t("toast.copyFail")),
    );
  };
}

/* --------------------------------------------------------------- PAGES */
function emptyState(msg) {
  return `<div id="emptyState"><div class="em">🍥</div><p>${esc(msg || t("empty.msg"))}</p><a class="btn primary" href="#analyzer" style="margin-top:14px;display:inline-flex">${esc(t("empty.cta"))}</a></div>`;
}

function renderDashboard() {
  const el = $("dashBody");
  if (!PROFILE) {
    el.innerHTML = emptyState();
    return;
  }
  const p = PROFILE;
  const g = genderSplit(p.demo);
  const lift = stateLift(p.sd);
  const topState = lift[0]?.s || p.topopp[0] || "—";
  const topReach = p.topopp[0] || topState;
  // use the exact same revenueProjection() the Revenue tab uses — previously this
  // recomputed its own (year-0, uncompounded) number here, which could visibly
  // disagree with the Revenue tab's (year-1, CAGR-compounded) headline for the same title.
  const { mf, share, years: dashYears } = revenueProjection(p);
  const rev1 = dashYears[1].mid;
  const hubs = hubAgg(p.sd);
  const topHub = hubs[0];
  const hl = hubLangZ(topHub.hub);
  const dubLabel = hl.hindi >= hl.english ? t("loc.dub.hi") : t("loc.dub.en");
  el.innerHTML = `
    <div class="dashTop">
      <div class="dashId">
        <h2>${esc(p.t)} ${p._synth ? `<span class="badge purple">${esc(t("dash.est"))}</span>` : `<span class="badge green">${esc(t("dash.real"))}</span>`}</h2>
        <div class="pill-row" style="margin-top:10px">${p.g.map((x) => `<span class="tag">${esc(x)}</span>`).join("")} <span class="tag">${esc(p.fmt)}</span><span class="tag">${esc(p.src.replace("_", " "))}</span></div>
      </div>
      <div class="dashScoreBox">
        <div class="dsNum">${p.mps}</div>
        <div class="dsOf">${esc(t("dash.of100"))} · MPS</div>
        <div class="dsPctl">${esc(t("dash.percentile", { p: p.pctl }))}</div>
      </div>
    </div>
    <div class="tiles">
      <div class="tile" data-go="score">
        <div class="tico">🎯</div>
        <div class="ti">${esc(t("tile.score"))} <span class="badge">${esc(p.conf)}</span></div>
        <div class="tv">${p.mps}<span style="font-size:14px;color:var(--mute)"> /100</span></div>
        <div class="ts">${esc(t("tile.score.sub", { d: p.dem, skew: g.skew }))}</div>
        <div class="tcta">${esc(t("cta.score"))}</div>
      </div>
      <div class="tile" data-go="regions">
        <div class="tico">🗺️</div>
        <div class="ti">${esc(t("tile.regions"))}</div>
        <div class="tv" style="font-size:22px">${esc(topState)}</div>
        <div class="ts">${esc(t("tile.regions.sub", { reach: topReach }))}</div>
        <div class="tcta">${esc(t("cta.regions"))}</div>
      </div>
      <div class="tile" data-go="localization">
        <div class="tico">🗣️</div>
        <div class="ti">${esc(t("tile.localization"))}</div>
        <div class="tv" style="font-size:22px">${esc(dubLabel)}</div>
        <div class="ts">${esc(t("tile.localization.sub", { hub: topHub.hub }))}</div>
        <div class="tcta">${esc(t("cta.localization"))}</div>
      </div>
      <div class="tile premium" data-go="revenue">
        <div class="tico">💰</div>
        <div class="ti">${esc(t("tile.revenue"))} <span class="badge gold">PRO</span></div>
        <div class="tv">${fmtCr(rev1)}</div>
        <div class="ts">${esc(t("tile.revenue.sub"))} (${(share * 100).toFixed(2)}%)</div>
        <div class="tcta">${esc(t("cta.revenue"))}</div>
      </div>
      <div class="tile premium" data-go="launch">
        <div class="tico">🚀</div>
        <div class="ti">${esc(t("tile.launch"))} <span class="badge gold">PRO</span></div>
        <div class="tv" style="font-size:22px">${esc(topState)}</div>
        <div class="ts">${esc(t("tile.launch.sub"))}</div>
        <div class="tcta">${esc(t("cta.launch"))}</div>
      </div>
      <div class="tile" data-go="score">
        <div class="tico">⚧</div>
        <div class="ti">${esc(t("tile.gender"))}</div>
        <div class="tv" style="font-size:22px">${esc(g.skew)}</div>
        <div class="ts">${esc(t("tile.gender.sub", { m: g.male, f: g.female, n: g.neutral }))}</div>
        <div class="tcta">${esc(t("cta.gender"))}</div>
      </div>
    </div>`;
  el.querySelectorAll(".tile").forEach(
    (el2) => (el2.onclick = () => (location.hash = "#" + el2.dataset.go)),
  );
}

function renderScore() {
  const el = $("scoreBody");
  if (!PROFILE) {
    el.innerHTML = emptyState();
    return;
  }
  const p = PROFILE;
  const g = genderSplit(p.demo);
  const circ = 2 * Math.PI * 76;
  // MPS in the real trained catalog is a compressed, relative score: across all 825 real
  // titles it only ever ranges ~16-66, median ~44 — no title ever approaches 100 (confirmed
  // against the real data). Reading fit off a fixed MPS threshold (e.g. ">=70 is strong")
  // would make it mathematically impossible for ANY title to rank "strong" or above. The
  // percentile (p.pctl) already ranks this title against the real 825-title distribution
  // correctly, so fit level is read off that instead.
  const fitLabel =
    p.pctl >= 90
      ? t("score.fit.veryhigh")
      : p.pctl >= 70
        ? t("score.fit.high")
        : p.pctl >= 35
          ? t("score.fit.mid")
          : t("score.fit.low");
  el.innerHTML = `
    ${gist("🎯", p.t, `${p.mps}<span style="font-size:22px;color:var(--mute)"> /100</span>`, `${esc(fitLabel)} · ${esc(t("score.gist.sub", { p: p.pctl, c: p.conf }))}`)}
    <div class="card" style="margin-top:14px">
      <div class="gauge">
        <div class="ring">
          <svg viewBox="0 0 170 170" width="170" height="170">
            <circle cx="85" cy="85" r="76" fill="none" stroke="#1d2030" stroke-width="12"/>
            <circle cx="85" cy="85" r="76" fill="none" stroke="url(#g1)" stroke-width="12" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - p.mps / 100)}" transform="rotate(-90 85 85)"/>
            <defs><linearGradient id="g1"><stop offset="0" stop-color="#ff2d4f"/><stop offset="1" stop-color="#fbbf24"/></linearGradient></defs>
          </svg>
          <div class="n"><div><b>${p.mps}</b><br><small class="mono">/ 100 MPS</small></div></div>
        </div>
        <div style="flex:1;min-width:240px">
          <div style="font-size:22px;font-weight:700">${esc(fitLabel)}</div>
          <p class="sub" style="margin-top:6px">${esc(t("score.gist.sub", { p: p.pctl, c: p.conf }))} · demand ${p.dem} (${p.dlo}–${p.dhi})</p>
          ${p._synth ? `<p class="note">${t("note.custom")} ${p._comparables.map((c) => `${esc(c.t)} (${c.sim}%)`).join(", ")}</p>` : ""}
        </div>
      </div>
      ${details(t("score.details"), `<div style="margin-top:12px">${p.narr.map((n) => `<p class="note" style="margin-top:6px">${esc(n)}</p>`).join("")}</div>`)}
    </div>

    <div class="card" style="margin-top:18px">
      <h3>${esc(t("score.whatMeans"))}</h3>
      <div id="scoreGemini"></div>
    </div>

    <div class="grid2" style="margin-top:18px">
      <div class="card">
        <h3>${esc(t("score.driving"))}</h3>
        ${p.attr.map((a) => bar(a.f, 50 + a.p * 2, `${a.p > 0 ? "+" : ""}${a.p} pts`, a.p >= 0 ? "linear-gradient(90deg,#34d399,#22d3ee)" : "linear-gradient(90deg,#ff2d4f,#ff2d4f)")).join("")}
      </div>
      <div class="card">
        <h3>${esc(t("score.who"))}</h3>
        ${Object.entries(p.demo)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) =>
            hbar(k, v, 100, "linear-gradient(90deg,#ff2d4f,#a78bfa)"),
          )
          .join("")}
        <p class="badge ${g.skew.includes("male") ? "" : g.skew.includes("female") ? "purple" : "gold"}" style="margin-top:10px">${esc(t("tile.gender.sub", { m: g.male, f: g.female, n: g.neutral }))}</p>
      </div>
    </div>

    <div class="grid2" style="margin-top:18px">
      <div class="card">
        <h3>${esc(t("score.archetypes"))}</h3>
        ${p.arch.map((a) => bar(a.l, a.a, `${a.s}%`)).join("")}
      </div>
      <div class="card">
        <h3>${esc(t("score.comparable"))}</h3>
        <div class="pill-row">${(p.cmp || []).map((c) => `<span class="tag">${esc(c)}</span>`).join("") || '<span class="note">—</span>'}</div>
        ${details(
          t("score.method"),
          `
          <div style="margin-top:12px">
            <div class="srcbox"><b>${(DB.meta.demand_cv.spearman_blend * 100).toFixed(0)}%</b>&nbsp;cross-val rank-correlation (Spearman)</div>
            <div class="srcbox"><b>${(DB.meta.demand_cv.auc_top20pct * 100).toFixed(0)}%</b>&nbsp;AUC identifying top-20% titles</div>
            <div class="srcbox"><b>${DB.meta.counts.titles_scored}</b>&nbsp;titles scored (${DB.meta.counts.by_stage.released} released, ${DB.meta.counts.by_stage.airing_new} airing, ${DB.meta.counts.by_stage.upcoming} upcoming)</div>
            <p class="note">${esc(DB.meta.limitations[0])}</p>
          </div>`,
        )}
      </div>
    </div>`;

  const allMps = DB.titles.map((x) => x.mps);
  const dsMin = Math.min(...allMps).toFixed(1),
    dsMax = Math.max(...allMps).toFixed(1);
  const dsMed = [...allMps]
    .sort((a, b) => a - b)
    [Math.floor(allMps.length / 2)].toFixed(1);
  const sEl = $("scoreGemini");
  renderGeminiBlock(
    sEl,
    "scoremeaning",
    () =>
      `You are a data analyst explaining a scoring model to a non-technical founder. In 2 short paragraphs (no headers, no markdown, no bullets), explain why a Market Potential Score (MPS) of ${p.mps} out of a nominal 100 can still represent a "${fitLabel}" title. Ground it in these real facts: across the ${DB.meta.counts.titles_scored} real titles this model was trained on and scores, MPS values only ever range from ${dsMin} to ${dsMax}, with a median of ${dsMed} — no title in the real catalog ever gets close to 100, because MPS is a compressed, relative demand-intensity score, not a 0-100 "quality" percentage. This title's percentile is ${p.pctl} (confidence: ${p.conf}), meaning it beats ${p.pctl}% of the ${DB.meta.counts.titles_scored} real titles scored. Explain plainly why percentile, not the raw MPS number, is the fair way to judge this title, and reassure them the number isn't a bug.`,
    () =>
      `An MPS of ${p.mps}/100 looks low at a glance, but across all ${DB.meta.counts.titles_scored} real titles this model has scored, MPS only ever ranges from ${dsMin} to ${dsMax} with a median of ${dsMed} — no title, however popular, ever gets close to 100. MPS is a compressed, relative demand-intensity score, not a 0-100 quality grade, so a "low-looking" number can still be near the top of the real distribution.\n\nThe number that actually tells you how this title stacks up is its percentile: ${p.pctl}, meaning it beats ${p.pctl}% of the ${DB.meta.counts.titles_scored} real titles in the training catalog. That — combined with the "${fitLabel}" label and the ${esc(p.conf)} confidence rating — is the fair way to read this score, not the raw MPS number on its own.`,
  );
}

function renderRegions() {
  const el = $("regionsBody");
  if (!PROFILE) {
    el.innerHTML = emptyState();
    return;
  }
  const p = PROFILE;
  const sorted = [...p.sd].sort((a, b) => b.m - a.m);
  const hubs = hubAgg(p.sd);
  const lift = stateLift(p.sd);
  const topState = lift[0]?.s || p.topopp[0] || p.topaff[0] || "—";
  el.innerHTML = `
    ${gist("🗺️", t("tile.regions"), esc(topState), esc(t("regions.gist.sub", { hub: hubs[0].hub, mps: hubs[0].mps })))}
    <div class="card" style="margin-top:14px">
      <h3>${esc(t("regions.lift"))}</h3>
      <div class="pill-row">${lift
        .slice(0, 5)
        .map(
          (s, i) =>
            `<span class="tag">${i + 1}. ${esc(s.s)} (+${s.lift.toFixed(1)})</span>`,
        )
        .join("")}</div>
      ${details(t("regions.liftWhy"), `<p class="note" style="margin-top:8px">${esc(t("regions.liftNote"))}</p>`)}
    </div>
    <div class="grid2" style="margin-top:18px">
      <div class="card">
        <h3>${esc(t("regions.affinity"))}</h3>
        <div class="pill-row">${p.topaff.map((s, i) => `<span class="tag">${i + 1}. ${esc(s)}</span>`).join("")}</div>
      </div>
      <div class="card">
        <h3>${esc(t("regions.opportunity"))}</h3>
        <div class="pill-row">${p.topopp.map((s, i) => `<span class="tag">${i + 1}. ${esc(s)}</span>`).join("")}</div>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <h3>${esc(t("regions.hubs"))}</h3>
      ${hubs.map((h) => hbar(h.hub, h.mps, 100, "linear-gradient(90deg,#22d3ee,#34d399)")).join("")}
    </div>
    <div class="card" style="margin-top:18px">
      ${details(
        t("regions.all", { n: sorted.length }),
        `
        <table style="margin-top:12px">
          <thead><tr><th>${esc(t("th.state"))}</th><th>${esc(t("th.hub"))}</th><th>${esc(t("th.fit"))}</th><th>${esc(t("th.opp"))}</th><th>${esc(t("th.pop"))}</th><th>${esc(t("th.quad"))}</th></tr></thead>
          <tbody>${sorted
            .map(
              (s) => `<tr><td>${esc(s.s)}</td><td>${esc(s.h)}</td>
            <td><span class="idx mono" style="color:var(--cyan)">${s.m}</span></td>
            <td>${s.o}%</td><td>${s.p}</td><td><span class="tag">${esc(s.q || "—")}</span></td></tr>`,
            )
            .join("")}</tbody>
        </table>`,
      )}
    </div>`;
}

function renderLocalization() {
  const el = $("localizationBody");
  if (!PROFILE) {
    el.innerHTML = emptyState();
    return;
  }
  const p = PROFILE;
  const hubs = hubAgg(p.sd).map((h) => ({ ...h, lang: hubLangZ(h.hub) }));
  const survey = DB.meta.audience_survey.language_preference;
  const leadDub =
    hubs[0].lang.hindi >= hubs[0].lang.english
      ? t("loc.dub.hi")
      : t("loc.dub.en");
  el.innerHTML = `
    ${gist("🗣️", t("tile.localization"), esc(leadDub), esc(t("loc.gist.sub")))}
    <div class="card" style="margin-top:14px">
      <h3>${esc(t("loc.compare"))}</h3>
      ${details(t("loc.details"), `<p class="note" style="margin-top:8px">National self-reported survey (n=${DB.meta.audience_survey.n_india_respondents}, skews toward platform-savvy fans) vs. state-level Google-Trends search interest (large-N proxy, what people actually search for where they live). The model treats both as soft priors — neither is ground truth.</p>`)}
      <div class="grid2" style="margin-top:12px">
        <div>
          <p class="note" style="margin-bottom:6px"><b style="color:var(--text)">${esc(t("loc.survey"))}</b></p>
          ${hbar(t("loc.dub.en"), survey.dubbed_english_share * 100, 100, "#ff2d4f")}
          ${hbar(t("loc.subs"), survey.subtitles_share * 100, 100, "#fbbf24")}
          ${hbar(t("loc.dub.hi"), survey.hindi_share * 100, 100, "#22d3ee")}
        </div>
        <div>
          <p class="note" style="margin-bottom:6px"><b style="color:var(--text)">${esc(t("loc.hub"))} (${esc(hubs[0].hub)})</b></p>
          ${hbar(t("loc.dub.hi"), hubs[0].lang.hindi * 100, 100, "#22d3ee")}
          ${hbar(t("loc.dub.en"), hubs[0].lang.english * 100, 100, "#ff2d4f")}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      <h3>${esc(t("loc.priority"))}</h3>
      <ul class="rules">
        ${hubs
          .slice(0, 6)
          .map((h) => {
            const lead =
              h.lang.hindi > h.lang.english ? t("loc.fundHi") : t("loc.fundEn");
            return `<li><b>${esc(h.hub)} — ${esc(lead)} <span class="tag">${h.mps >= 55 ? esc(t("loc.priorityTag")) : esc(t("loc.watchTag"))}</span></b>
            <p>Fit ${h.mps}/100 · ${h.states.length} state(s), pop ${h.pop.toFixed(0)}M.</p></li>`;
          })
          .join("")}
      </ul>
    </div>`;
}

function revenueProjection(p) {
  const mf = marketFacts();
  const share = Math.pow((p.pctl ?? 50) / 100, 3) / DB.sumWeight3;
  // Confidence haircut: an estimated/unproven concept (or one the model itself flags Low
  // confidence on) shouldn't be shown the same revenue as an already-released, well-signalled
  // real title at the same raw percentile — that overstates an unlaunched concept's revenue.
  // This only discounts the OUTPUT number for presentation; it never touches the real pctl.
  const confHaircut = p._synth
    ? 0.45
    : p.conf === "Low"
      ? 0.6
      : p.conf === "Medium"
        ? 0.8
        : 1;
  const years = [0, 1, 2, 3, 4, 5].map((n) => {
    // low/high band uses the MID market-size estimate at the low/high CAGR (not the low/high
    // market-size estimate too) — stacking best-case size with best-case growth in the same
    // band double-counts optimism and makes the "high" case look inflated.
    const lowMkt = mf.size25.mid * Math.pow(1 + mf.cagr.low, n);
    const highMkt = mf.size25.mid * Math.pow(1 + mf.cagr.high, n);
    const midMkt =
      mf.size25.mid * Math.pow(1 + (mf.cagr.low + mf.cagr.high) / 2, n);
    return {
      n,
      low: lowMkt * share * confHaircut,
      mid: midMkt * share * confHaircut,
      high: highMkt * share * confHaircut,
    };
  });
  return { mf, share, years, confHaircut };
}

const AGE_GROUPS = [
  {
    key: "kids",
    label: "Kids (6–12)",
    hint: "Light action, comedy, slice-of-life, monster-collecting/adventure formats, short episodes, Hindi dub-first.",
  },
  {
    key: "teens",
    label: "Teens (13–17)",
    hint: "Shonen action, school/sports drama, isekai, fast-paced power-fantasy — strong Shorts/Reels virality.",
  },
  {
    key: "ya",
    label: "Young Adults (18–24)",
    hint: "Seinen/psychological thrillers, dark fantasy, romance drama, prestige streaming originals, campus fandom edits.",
  },
  {
    key: "adults",
    label: "Adults (25–34)",
    hint: "Nostalgia-driven franchise sequels, mature seinen, slow-burn drama, prestige theatrical releases, collector merch.",
  },
  {
    key: "mature",
    label: "35+",
    hint: "Classic franchise revivals, arthouse/Ghibli-style films, nostalgia re-releases, family co-viewing and theatrical events.",
  },
];

async function runAgeAdvisor(mode) {
  const out = $("ageAdvisorOut");
  if (!out) return;
  const sel = $("ageGroupSelect");
  const txt = $("ageIdeaInput");
  const ag =
    AGE_GROUPS.find((a) => a.key === (sel && sel.value)) || AGE_GROUPS[1];
  const idea = ((txt && txt.value) || "").trim();
  const p = PROFILE;
  out.innerHTML = `<div class="loading"><div class="spin"></div> ${t("ai.loading")}</div>`;
  const langSuffix =
    LANG === "hi"
      ? " Respond only in Hindi (Devanagari script)."
      : LANG === "ja"
        ? " Respond only in Japanese."
        : "";
  const askAlt = mode === "alt" || !idea;
  const prompt = askAlt
    ? `You are an India anime market strategist. Context title: "${p ? p.t : "a new anime concept"}" (genres: ${p ? p.g.join(", ") : "unspecified"}). Suggest ONE concrete, specific anime concept (genre mix, tone, format) that would work well in India for the ${ag.label} age group. 2-3 sentences, specific tropes not vague categories. No markdown, no headers, no bullets.${langSuffix}`
    : `You are an India anime market strategist evaluating a user's own anime idea for a specific age group. Age group: ${ag.label}. User's idea: "${idea.replace(/"/g, "'")}". First state in one clear sentence whether this is a GOOD FIT or NEEDS TWEAKS for that age group in the India market. Then, if it needs tweaks, give 2-3 sentences of specific concrete changes (genre, tone, pacing, format, platform) to make it land better with that age group in India. If it's already a good fit, say briefly why. No markdown, no headers, no bullet lists.${langSuffix}`;
  const result = await geminiGenerate(prompt);
  if ($("ageAdvisorOut") !== out) return; // stale if tab/profile changed mid-request
  if (result) {
    out.innerHTML = `<div class="gen-text"><p>${esc(result.text)}</p></div><p class="note">${t("ai.live")}</p>`;
  } else {
    const fb = askAlt
      ? `For ${ag.label}, consider: ${ag.hint}`
      : `Gemini is unavailable right now. As a rule of thumb for ${ag.label}: ${ag.hint} Compare your idea's genre, tone and pacing against that profile and adjust accordingly.`;
    out.innerHTML = `<div class="gen-text"><p>${esc(fb)}</p></div><p class="note">${t("ai.fallback")}</p>`;
  }
}

function renderRevenue() {
  const el = $("revenueBody");
  if (!PROFILE) {
    el.innerHTML = emptyState();
    return;
  }
  const p = PROFILE;
  const { mf, share, years, confHaircut } = revenueProjection(p);
  const maxV = Math.max(...years.map((y) => y.high));
  const W = 760,
    H = 260,
    padL = 50,
    padB = 30,
    padT = 14;
  const x = (n) => padL + (n / 5) * (W - padL - 20);
  const y = (v) => H - padB - (v / maxV) * (H - padB - padT);
  const pathOf = (key) =>
    years
      .map((yy, i) => `${i === 0 ? "M" : "L"}${x(yy.n)},${y(yy[key])}`)
      .join(" ");
  const bandPath = `${years.map((yy, i) => `${i === 0 ? "M" : "L"}${x(yy.n)},${y(yy.high)}`).join(" ")} ${[
    ...years,
  ]
    .reverse()
    .map((yy) => `L${x(yy.n)},${y(yy.low)}`)
    .join(" ")} Z`;
  let gridSvg = "";
  for (let i = 0; i <= 4; i++) {
    const v = (maxV / 4) * i;
    gridSvg += `<line x1="${padL}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="#262a3a"/><text x="${padL - 6}" y="${y(v) + 4}" fill="#8a90a8" font-size="10" text-anchor="end">$${v.toFixed(0)}M</text>`;
  }
  el.innerHTML = `
    ${gist("💰", t("tile.revenue"), fmtCr(years[1].mid), esc(t("rev.gist.sub", { pct: (share * 100).toFixed(2), mkt: mf.size25.mid.toFixed(0) })))}
    <div class="card proCard" style="margin-top:14px">
      <h3>${esc(t("rev.year1"))}</h3>
      <div class="grid3" style="margin-top:14px">
        <div class="stat"><b>${fmtCr(years[1].low)}–${fmtCr(years[1].high)}</b><span>${esc(t("rev.range"))} (mid ${fmtCr(years[1].mid)})</span></div>
        <div class="stat"><b>${(share * 100).toFixed(3)}%</b><span>${esc(t("rev.share"))}</span></div>
        <div class="stat"><b>${(mf.cagr.low * 100).toFixed(1)}–${(mf.cagr.high * 100).toFixed(1)}%</b><span>${esc(t("rev.cagr"))}</span></div>
      </div>
      ${confHaircut < 1 ? `<p class="note" style="margin-top:10px">${esc(t("rev.haircut", { pct: Math.round((1 - confHaircut) * 100) }))}</p>` : ""}
      ${details(t("rev.details"), `<p class="note" style="margin-top:10px">This title's weight = (percentile/100)³ relative to the sum of that same weight across all 825 trained titles → that fraction of India's real estimated anime market size. Power-law exponent (3) assumes a small share of titles capture a disproportionate share of spend — consistent with the model's own precision_at_top20% statistic (${(DB.meta.demand_cv.precision_at_top20pct * 100).toFixed(0)}%). ${confHaircut < 1 ? `A confidence-based haircut of ${Math.round((1 - confHaircut) * 100)}% is applied below because this title is ${p._synth ? "an unproven concept, not a released title" : `flagged ${esc(p.conf)} confidence by the model`} — an unlaunched or low-signal title shouldn't be shown the same number as an already-proven one at the same raw percentile.</p>` : "</p>"}`)}
    </div>
    <div class="card proCard" style="margin-top:18px">
      <h3>${esc(t("rev.trend"))}</h3>
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="margin-top:10px">
        ${gridSvg}
        <path d="${bandPath}" fill="rgba(255,45,79,.15)" stroke="none"/>
        <path d="${pathOf("mid")}" fill="none" stroke="#fbbf24" stroke-width="2.5"/>
        <path d="${pathOf("low")}" fill="none" stroke="#262a3a" stroke-width="1" stroke-dasharray="3 3"/>
        <path d="${pathOf("high")}" fill="none" stroke="#262a3a" stroke-width="1" stroke-dasharray="3 3"/>
        ${years.map((yy) => `<circle cx="${x(yy.n)}" cy="${y(yy.mid)}" r="3.5" fill="#fbbf24"/><text x="${x(yy.n)}" y="${H - 10}" fill="#8a90a8" font-size="10" text-anchor="middle">Yr ${yy.n}</text>`).join("")}
      </svg>
    </div>
    <div class="card proCard" style="margin-top:18px">
      <h3>${esc(t("rev.commentary"))}</h3>
      <div id="revGemini"></div>
    </div>
    <div class="card proCard" style="margin-top:18px">
      <h3>${esc(t("rev.age.title"))}</h3>
      <p class="note">${esc(t("rev.age.sub"))}</p>
      <div class="grid3" style="margin-top:10px">
        ${AGE_GROUPS.map((ag) => `<div class="stat"><b>${esc(ag.label)}</b><span style="font-size:11px">${esc(ag.hint)}</span></div>`).join("")}
      </div>
      <div style="margin-top:14px">
        <select id="ageGroupSelect" class="input" style="margin-bottom:6px">
          ${AGE_GROUPS.map((ag) => `<option value="${ag.key}">${esc(ag.label)}</option>`).join("")}
        </select>
        <textarea id="ageIdeaInput" class="input" rows="3" placeholder="${esc(t("rev.age.placeholder"))}" style="width:100%;margin-top:6px"></textarea>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" id="ageCheckBtn">${esc(t("rev.age.check"))}</button>
          <button class="btn ghost" id="ageAltBtn">${esc(t("rev.age.alt"))}</button>
        </div>
        <div id="ageAdvisorOut" style="margin-top:12px"></div>
      </div>
    </div>
    <div class="card" style="margin-top:18px">
      ${details(t("rev.sources"), `<div style="margin-top:10px">${DB.market.raw_facts.map((r) => `<div class="srcbox"><b>${esc(r.metric)}:</b>&nbsp;${esc(r.value)} <span style="margin-left:auto">${esc(r.source)}, ${esc(r.date)}</span></div>`).join("")}<p class="note">Illustrative only — no India box-office/streaming/merch ground truth. Treat as a planning input, not a guarantee.</p></div>`)}
    </div>`;
  const ageCheckBtn = $("ageCheckBtn");
  if (ageCheckBtn) ageCheckBtn.onclick = () => runAgeAdvisor("check");
  const ageAltBtn = $("ageAltBtn");
  if (ageAltBtn) ageAltBtn.onclick = () => runAgeAdvisor("alt");
  const g = $("revGemini");
  renderGeminiBlock(
    g,
    "revenue",
    () => {
      const top = hubAgg(p.sd)[0];
      return `You are a skeptical media-industry analyst fact-checking a revenue model, not just describing it. This app's formula estimates "${p.t}" (genres: ${p.g.join(", ")}; format: ${p.fmt}; source: ${p.src}${p._synth ? "; this is an UNPROVEN CONCEPT, not a released title" : ""}) will generate roughly ${fmtCr(years[1].mid)} (range ${fmtCr(years[1].low)}-${fmtCr(years[1].high)}) in Year-1 India revenue, and about ${fmtCr(years[5].mid)} by Year 5, out of India's real ~$${mf.size25.mid.toFixed(0)}M (2025) anime market growing ${(mf.cagr.low * 100).toFixed(1)}-${(mf.cagr.high * 100).toFixed(1)}% CAGR. First, in 1-2 sentences, say plainly whether that Year-1 number looks realistic, too high, or too low for a title like this given real India anime/streaming economics — be direct, this is a sanity check, not a pitch. Then in 2 short paragraphs (no headers, no bullet lists, no markdown) explain the realistic revenue MIX: the split between streaming licensing, theatrical (if relevant for a ${p.fmt}), and merchandise, grounded in its strongest hub (${top.hub}) and audience skew (${genderSplit(p.demo).skew.toLowerCase()}). Do not invent specific partner/company names.`;
    },
    () => {
      const g2 = genderSplit(p.demo);
      return `Streaming licensing is the fastest and lowest-risk channel for "${p.t}" — it monetises on day one via a platform deal rather than waiting on box office or merch lead times, and fits a ${g2.skew.toLowerCase()} ${p.fmt.toLowerCase()} well.\n\n${p.fmt === "MOVIE" ? "As a movie, a limited theatrical window alongside the streaming release can meaningfully add to Year 1 revenue in cinema-friendly states, before shifting to streaming as the long tail." : "As a " + p.fmt + ", theatrical plays a minor role; most revenue compounds through the streaming window and social virality instead."}\n\nMerchandise ramps slower — it typically becomes a meaningful share only after 2-3 quarters of audience build, once fandom and recognisable iconography exist to sell against.`;
    },
  );
}

function renderLaunch() {
  const el = $("launchBody");
  if (!PROFILE) {
    el.innerHTML = emptyState();
    return;
  }
  const p = PROFILE;
  const g = genderSplit(p.demo);
  const hubs = hubAgg(p.sd);
  const topOpp = p.topopp.slice(0, 3);
  const topAff = p.topaff.slice(0, 3);
  const topHubLang = hubLangZ(hubs[0].hub);
  const dub =
    topHubLang.hindi >= topHubLang.english ? t("loc.dub.hi") : t("loc.dub.en");
  const topFactor = [...p.attr].sort((a, b) => b.p - a.p)[0];
  const social = DB.social;

  el.innerHTML = `
    ${gist("🚀", t("tile.launch"), esc(hubs[0].hub), esc(t("launch.gist.sub", { dub, hub: hubs[0].hub })))}
    <h3 style="margin-top:18px">${esc(t("launch.roadmap"))}</h3>
    <div class="phases" style="margin-top:12px">
      <div class="phase proCard"><h3>${esc(t("launch.phase1"))}</h3><small class="mono">0–3 months</small><ul>
        <li>${esc(dub)} first, in ${esc(hubs[0].hub)} (fit ${hubs[0].mps}/100).</li>
        <li>Seed community in ${topAff.map(esc).join(", ")}.</li>
        <li>Lean into ${esc(topFactor.f)} (${topFactor.p > 0 ? "+" : ""}${topFactor.p} pts) — the strongest driver of this score.</li>
        <li>Messaging skew: ${esc(g.skew)} (${g.male}% male / ${g.female}% female).</li>
      </ul></div>
      <div class="phase proCard"><h3>${esc(t("launch.phase2"))}</h3><small class="mono">3–9 months</small><ul>
        <li>Scale into ${topOpp.map(esc).join(", ")}.</li>
        <li>Second language track: ${esc(hubs[1]?.hub || "—")} (fit ${hubs[1]?.mps ?? "—"}).</li>
        <li>Use comparable-title fandoms (${(p.cmp || []).slice(0, 2).map(esc).join(", ") || "closest archetypes"}) as lookalikes.</li>
      </ul></div>
      <div class="phase proCard"><h3>${esc(t("launch.phase3"))}</h3><small class="mono">6–12 months</small><ul>
        <li>Streaming licensing first, ${p.fmt === "MOVIE" ? "plus a limited theatrical window." : "merch following once fandom is established."}</li>
        <li>Price merch for the middle of the wallet.</li>
        <li>Revisit the Revenue tab's 5-year trend to time the ramp.</li>
      </ul></div>
    </div>

    <div class="card proCard" style="margin-top:18px">
      <h3>${esc(t("launch.improve"))}</h3>
      <p class="note">${esc(t("launch.improve.sub", { pctl: p.pctl }))}</p>
      <div style="margin-top:10px">${[...p.attr]
        .sort((a, b) => a.p - b.p)
        .slice(0, 5)
        .map((a) => factorAdvice(a))
        .join("")}</div>
      <div id="improveGemini" style="margin-top:12px"></div>
    </div>

    <div class="grid2" style="margin-top:18px">
      <div class="card proCard">
        <h3>${esc(t("launch.angle"))}</h3>
        <div id="launchGemini"></div>
      </div>
      <div class="card proCard">
        <h3>${esc(t("launch.merch"))}</h3>
        <div id="merchGemini"></div>
        ${details(
          "Instagram signal",
          `<p class="note" style="margin-top:10px">${social.n_posts_analyzed} posts sampled: ${social.merch_hashtags
            .slice(0, 6)
            .map(([h, c]) => `#${esc(h)} (${c})`)
            .join(", ")}.</p>`,
        )}
      </div>
    </div>

    <div class="card" style="margin-top:18px">
      <h3>${esc(t("launch.risks"))}</h3>
      <div class="risk"><span class="lv ${p.conf === "Low" ? "HIGH" : p.conf === "Medium" ? "MEDIUM" : "LOW"}">${p.conf === "Low" ? "HIGH" : p.conf === "Medium" ? "MEDIUM" : "LOW"}</span><div><b>Model confidence: ${esc(p.conf)}</b><br><span style="color:var(--mute)">${p._synth ? "Estimated concept — treat numbers as directional." : "Based on the model's own calibration."}</span></div></div>
      <div class="risk"><span class="lv WATCH">WATCH</span><div><b>No India revenue ground truth</b><br><span style="color:var(--mute)">${esc(DB.meta.limitations[0])}</span></div></div>
      <div class="risk"><span class="lv WATCH">WATCH</span><div><b>Small-state Trends noise</b><br><span style="color:var(--mute)">${DB.meta.trends_reliability.missing_cells_imputed} of ${DB.meta.trends_reliability.total_cells} cells imputed (ρ=${DB.meta.trends_reliability.imputation_holdout_spearman.toFixed(2)}).</span></div></div>
      <div class="risk"><span class="lv MEDIUM">MEDIUM</span><div><b>Survey vs. search-interest disagreement</b><br><span style="color:var(--mute)">See Localization for details.</span></div></div>
    </div>`;

  const gEl = $("launchGemini");
  renderGeminiBlock(
    gEl,
    "strategy",
    () =>
      `You are a marketing strategist. In 2 short paragraphs (no headers, no markdown, no bullets), propose the single best marketing angle/campaign hook for launching the anime "${p.t}" in India (genres: ${p.g.join(", ")}; format ${p.fmt}; audience skew: ${g.skew}, strongest state: ${topOpp[0]}, strongest hub: ${hubs[0].hub}). Suggest concrete channels (which social platforms, creator types, event formats) appropriate for an India anime audience. Do not invent real company/platform partner names beyond generic platform categories.`,
    () =>
      `Lead with a ${esc(hubs[0].hub)}-first campaign built around ${esc(dub)}, since that's where this title's fit is strongest (${hubs[0].mps}/100). Partner with India anime creators on Instagram and YouTube Shorts — the format that already drives the community (avg ${social.avg_likes} likes per post in the sample analysed) — for reaction/edit content timed to each episode drop.\n\nBecause the audience skews ${g.skew.toLowerCase()}, keep key art and trailers centered on ${g.male >= g.female ? "the power-fantasy/action beats" : "the character relationships and emotional arcs"}, and run the campaign hardest in ${topOpp.join(", ")} where the addressable audience is largest.`,
  );

  const iEl = $("improveGemini");
  renderGeminiBlock(
    iEl,
    "improve",
    () => {
      const worst = [...p.attr].sort((a, b) => a.p - b.p).slice(0, 4);
      return `You are a development/greenlight consultant. The anime "${p.t}" (genres: ${p.g.join(", ")}; format ${p.fmt}; source ${p.src}) scored a Market Potential Score of ${p.mps}/100, beating only ${p.pctl}% of the ${DB.meta.counts.titles_scored} real titles this model was trained on. The factors dragging the score down the most are: ${worst.map((a) => `${a.f} (${a.p} pts)`).join(", ")}. In 2-3 short paragraphs (no headers, no markdown, no bullets), give concrete, different strategic options for raising this title's India market-fit — e.g. changing format, adjusting genre mix/tags, choice of studio, release timing, or source material — grounded in which specific factors are weakest. Be direct about trade-offs, not just encouraging.`;
    },
    () => {
      const worst = [...p.attr].sort((a, b) => a.p - b.p).slice(0, 3);
      return `This title beats only ${p.pctl}% of the ${DB.meta.counts.titles_scored} real titles the model was trained on, mainly dragged down by: ${worst.map((a) => `${esc(a.f)} (${a.p} pts)`).join(", ")}. The concrete levers available are listed above — the biggest wins usually come from fixing whichever factor is most negative, since the model's own factor-importance ranking (see Market Score tab) shows these aren't evenly weighted.\n\nIf the weakest factor is something structural (source material, studio, franchise position), the realistic options are either accepting that ceiling and targeting a smaller, higher-affinity niche audience instead of a mass launch, or revisiting the format/genre mix before greenlighting — both are legitimate strategies, not just "market it harder."`;
    },
  );

  const mEl = $("merchGemini");
  renderGeminiBlock(
    mEl,
    "merch",
    () =>
      `You are a merchandise strategist. In 2-3 short paragraphs (no headers, no markdown, no bullet lists), suggest which 4-5 merchandise categories would work best for the anime "${p.t}" — genres: ${p.g.join(", ")}, tags: ${(p.tg || []).join(", ")}, audience skew: ${g.skew} (male ${g.male}%, female ${g.female}%), closest archetypes: ${p.arch.map((a) => a.l).join("; ")}. Ground recommendations in what's realistic for the India market and price them for a middle-income fan, not just premium collectors. You may reference that real India anime-community Instagram hashtags include: ${social.merch_hashtags
        .slice(0, 8)
        .map(([h]) => h)
        .join(", ")}.`,
    () => {
      const action = p.g.some((x) =>
        ["Action", "Adventure", "Sci-Fi", "Supernatural", "Mecha"].includes(x),
      );
      const soft = p.g.some((x) =>
        ["Romance", "Slice of Life", "Comedy", "Drama"].includes(x),
      );
      const ideas = [];
      if (action)
        ideas.push(
          "Articulated action figures and weapon replicas for the leads",
        );
      if (soft)
        ideas.push(
          "Acrylic stands, charms and stationery sets around the main cast",
        );
      ideas.push(
        "Streetwear — graphic tees and hoodies using the key-art palette, which already trends under #animestreetwear in the India community",
      );
      ideas.push(
        "Mobile accessories (phone cases, pop-grips) as a low-price entry point",
      );
      if (g.female > g.male)
        ideas.push(
          "Enamel pins and plush collectibles aimed at the skew-female audience",
        );
      else
        ideas.push(
          "Trading cards / gacha-style blind boxes for the skew-male collector audience",
        );
      return `Realistic merch mix for "${p.t}": ${ideas.join("; ")}.\n\nPrice most items in the ₹299–₹1,499 range to match what the dataset's survey shows most India fans actually spend per 6 months, reserving premium figures (₹3,000+) for a smaller collector tier.`;
    },
  );
}

/* ------------------------------------------------------------- ROUTING */
const PAGES = [
  "analyzer",
  "dashboard",
  "score",
  "regions",
  "localization",
  "revenue",
  "launch",
];
const RENDERERS = {
  dashboard: renderDashboard,
  score: renderScore,
  regions: renderRegions,
  localization: renderLocalization,
  revenue: renderRevenue,
  launch: renderLaunch,
};
function showPage(key) {
  if (!PAGES.includes(key)) key = "analyzer";
  document
    .querySelectorAll("[data-page]")
    .forEach((el) =>
      el.classList.toggle("active-page", el.dataset.page === key),
    );
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    const t = (a.getAttribute("href") || "").slice(1) || "analyzer";
    a.classList.toggle("active", t === key);
  });
  if (RENDERERS[key]) RENDERERS[key]();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}
function routeFromHash() {
  showPage((location.hash || "#analyzer").slice(1));
}
function setupRouting() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      e.preventDefault();
      if (location.hash === href) routeFromHash();
      else location.hash = href;
    });
  });
  window.addEventListener("hashchange", routeFromHash);
  routeFromHash();
}

/* -------------------------------------------------------------- BOOT */
function hideSplash() {
  const s = $("splash");
  if (!s) return;
  setTimeout(() => {
    s.classList.add("hide");
    setTimeout(() => s.remove(), 700);
  }, 500);
}
function spawnPetals() {
  for (let i = 0; i < 14; i++) {
    const p = document.createElement("div");
    p.className = "petal";
    p.style.left = Math.random() * 100 + "vw";
    p.style.animationDuration = 12 + Math.random() * 14 + "s";
    p.style.animationDelay = -Math.random() * 20 + "s";
    p.style.transform = `scale(${0.6 + Math.random()})`;
    document.body.appendChild(p);
  }
}
async function boot() {
  try {
    await loadAll();
    document
      .querySelectorAll("#langToggle button")
      .forEach((b) => b.classList.toggle("on", b.dataset.lang === LANG));
    applyI18N();
    populateControls();
    setupControls();
    setupRouting();
    spawnPetals();
    hideSplash();
  } catch (e) {
    console.error(e);
    const s = $("splash");
    if (s)
      s.innerHTML = `<div style="text-align:center;color:#ff2d4f;padding:20px"><b>Could not load the dataset files.</b><br><span style="color:#8a90a8;font-size:13px">Make sure index.html, app.js and the data/ folder are kept together, then reload.</span></div>`;
  }
}
boot();
