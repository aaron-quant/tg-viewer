"use strict";
/* easychartgo viewer — charts (TradingView Lightweight Charts), documents (markdown), wallets, images */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, kids = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v; else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(kids)) if (c != null && c !== false) e.append(c);
  return e;
};
const ext = (href, text, cls = "btn sm ext") => el("a", { href, target: "_blank", rel: "noopener noreferrer", class: cls, text });
const fmtUsd = x => {
  if (x == null || isNaN(x)) return "–";
  const a = Math.abs(x), s = x < 0 ? "−" : "";
  if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(1) + "K";
  return s + "$" + (a < 0.005 ? "0" : a.toFixed(a >= 100 ? 0 : 2));
};
const fmtAmt = x => {
  if (x == null || isNaN(x)) return "–";
  const a = Math.abs(x);
  if (a < 1e-9) return "0";
  if (a >= 1e8) return (x / 1e8).toFixed(2) + "억";
  if (a >= 1e4) return (x / 1e4).toFixed(1) + "만";
  if (a >= 100) return Math.round(x).toLocaleString("en-US");
  return x.toFixed(a >= 1 ? 2 : 4);
};
const fmtPx = x => x == null ? "–" : "$" + (x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 1 }) : x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(3) : x.toPrecision(4));
const fmtPct = x => x == null ? "–" : (x >= 0 ? "+" : "−") + Math.abs(x * 100).toFixed(Math.abs(x) >= 1 ? 0 : 1) + "%";
const KST = 9 * 3600, p2 = n => String(n).padStart(2, "0");
const kd = ts => new Date((ts + KST) * 1000);
const fmtDay = ts => { const d = kd(ts); return p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()); };
const fmtTime = ts => { const d = kd(ts); return fmtDay(ts) + " " + p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()); };
const short = a => a && a.length > 14 ? a.slice(0, 6) + "…" + a.slice(-4) : (a || "");
const delta = (x, f = fmtUsd) => x == null || isNaN(x) ? el("span", { class: "mu", text: "–" }) : el("span", { class: x >= 0 ? "up" : "dn", text: (x >= 0 && f === fmtUsd ? "+" : "") + f(x) });
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ------------------------------------------------------------------ data */
const cache = {};
async function getJson(url, ms) {
  const ctl = ms ? new AbortController() : null, timer = ms ? setTimeout(() => ctl.abort(), ms) : null;
  try { const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined); if (!r.ok) return null; return await r.json(); }
  catch (e) { return null; } finally { if (timer) clearTimeout(timer); }
}
async function api(name) {
  if (cache[name]) return cache[name];
  const d = await getJson("api/" + name + ".json");
  if (!d) throw new Error("데이터 파일을 불러오지 못했습니다 (" + name + ")");
  return (cache[name] = d);
}
// Binance public market data allows cross-origin requests, so the browser can ask it directly
async function binanceLive(sym, interval) {
  for (const [perp, base] of [[false, "https://data-api.binance.vision/api/v3/klines"], [true, "https://fapi.binance.com/fapi/v1/klines"]]) {
    const d = await getJson(`${base}?symbol=${sym}USDT&interval=${interval}&limit=1000`, 5000);
    if (Array.isArray(d) && d.length) return {
      sym, chain: "binance", live: true, source: `Binance ${sym}USDT ${perp ? "무기한 선물" : "현물"}`, tv: `BINANCE:${sym}USDT${perp ? ".P" : ""}`,
      source_url: `https://www.binance.com/en/${perp ? "futures/" + sym + "USDT" : "trade/" + sym + "_USDT"}`,
      candles: d.map(c => [Math.floor(c[0] / 1000), +c[1], +c[2], +c[3], +c[4], +c[7]]) };
  }
  return null;
}
async function loadCandles(key, tf) {
  const [chain, sym] = key.split(":");
  if (chain === "binance") {
    const live = await binanceLive(sym, tf === "15m" ? "15m" : "1h");
    if (live) return live;
    if (tf === "15m") throw new Error("15분봉은 Binance에 실시간으로 물어봐야 하는데 연결되지 않습니다. 1시간봉 이상은 저장된 데이터로 볼 수 있습니다.");
  }
  const saved = await getJson(`api/ohlcv/${chain}_${sym}.json`);
  if (!saved) throw new Error(chain === "binance" ? sym + "USDT 가격을 Binance에서 찾지 못했습니다." : "저장된 가격 데이터가 없습니다.");
  return saved;
}
const CH = { ethereum: "Ethereum", bsc: "BNB Chain", solana: "Solana", robinhood: "Robinhood Chain", base: "Base", hyperliquid: "Hyperliquid", binance: "Binance" };
const EXPL = {
  ethereum: ["Etherscan", "https://etherscan.io/address/", "https://etherscan.io/tx/"], bsc: ["BscScan", "https://bscscan.com/address/", "https://bscscan.com/tx/"],
  base: ["BaseScan", "https://basescan.org/address/", "https://basescan.org/tx/"], solana: ["Solscan", "https://solscan.io/account/", "https://solscan.io/tx/"],
  robinhood: ["Robinhood Blockscout", "https://robinhoodchain.blockscout.com/address/", "https://robinhoodchain.blockscout.com/tx/"],
  hyperliquid: ["Hyperliquid 익스플로러", "https://app.hyperliquid.xyz/explorer/address/", "https://app.hyperliquid.xyz/explorer/tx/"],
};
const DEXS = { ethereum: "ethereum", bsc: "bsc", base: "base", solana: "solana", robinhood: "robinhood" };
const addrUrl = (chain, a) => EXPL[chain] ? EXPL[chain][1] + a : null;
const txUrl = (chain, h) => EXPL[chain] && h ? EXPL[chain][2] + h : null;
const tgUrl = id => "https://t.me/easychartgo/" + id;

/* ------------------------------------------------------------------ modal */
function openModal(kids) { $("#modalbox").replaceChildren(el("div", { class: "row" }, [el("div", { class: "grow" }), el("button", { class: "btn sm", text: "닫기", onclick: closeModal })]), ...[].concat(kids)); $("#modal").classList.add("on"); }
function closeModal() { $("#modal").classList.remove("on"); }
$("#modal").addEventListener("click", ev => { if (ev.target.id === "modal") closeModal(); });
document.addEventListener("keydown", ev => { if (ev.key === "Escape") closeModal(); });
const KIND = { price_chart: "가격 차트", indicator_chart: "지표 차트", onchain_wallet: "온체인 지갑", onchain_flow: "온체인 자금흐름", news_capture: "뉴스·트윗 캡처", table: "표", other: "기타" };
async function openImage(file) {
  const imgs = await api("images").catch(() => []);
  const c = imgs.find(i => i.file === file);
  const kids = [el("img", { src: "photos/" + file, alt: c ? c.subject : file })];
  if (c) {
    kids.unshift(el("div", {}, [el("div", { style: "font-weight:650", text: c.subject }), el("div", { class: "sec sm" }, [document.createTextNode(fmtTime(c.ts) + " KST · " + KIND[c.kind] + " · " + c.tool + (c.conf !== "high" ? " · 판독 신뢰도 " + (c.conf === "low" ? "낮음" : "보통") : "") + " ")])]));
    kids.push(el("div", { class: "row", style: "margin:8px 0" }, [ext(tgUrl(c.id), "텔레그램 원문 #" + c.id), ...c.tickers.map(t => el("a", { class: "btn sm", href: "#/chart/" + symKeyFor(t), text: t + " 차트", onclick: closeModal }))]),
      el("div", {}, c.tags.map(t => el("span", { class: "badge", text: t }))), el("h3", { text: "이미지 설명" }), el("div", { text: c.text }));
    if (c.meaning) kids.push(el("h3", { text: "글의 요지" }), el("div", { text: c.meaning }));
  }
  openModal(kids);
}
function symKeyFor(sym) { const s = (cache.symbols || []).find(x => x.sym === sym); return s ? s.key : "binance:" + sym; }

/* ------------------------------------------------------------------ chart view */
let tv = null;
function destroyChart() { if (tv) { try { tv.chart.remove(); } catch (e) { /* already gone */ } tv = null; } }
function aggregate(c, sec) {
  if (sec <= 3600) return c;
  const out = []; let cur = null;
  for (const r of c) {
    const b = Math.floor((r[0] + KST) / sec) * sec - KST;
    if (!cur || cur[0] !== b) { cur = [b, r[1], r[2], r[3], r[4], r[5]]; out.push(cur); }
    else { cur[2] = Math.max(cur[2], r[2]); cur[3] = Math.min(cur[3], r[3]); cur[4] = r[4]; cur[5] += r[5]; }
  }
  return out;
}
const TF = [["15m", "15분", 900], ["1h", "1시간", 3600], ["4h", "4시간", 14400], ["1d", "1일", 86400]];
async function viewChart(key) {
  const [syms, posts, wallets] = await Promise.all([api("symbols"), api("posts"), api("wallets")]);
  cache.symbols = syms;
  key = key || localStorage.getItem("sym") || (syms.find(s => s.posts && s.wallets) || syms[0]).key;
  let info = syms.find(s => s.key === key);
  if (!info) { const [chain, sym] = key.split(":"); info = { key, sym: (sym || "").toUpperCase(), chain, source: "", posts: 0, wallets: 0 }; }
  localStorage.setItem("sym", key);
  const S = { tf: localStorage.getItem("tf") || "1h", showPosts: true, showFlows: true };
  const isBinance = info.chain === "binance";
  if (!isBinance && S.tf === "15m") S.tf = "1h";

  // symbol list
  const listBox = el("div"), search = el("input", { type: "search", placeholder: "종목 검색" });
  const side = el("aside", { class: "symlist card" }, [el("div", { class: "row", style: "margin-bottom:6px" }, [el("b", { class: "grow", text: "종목" }), el("button", { class: "btn sm sheet", text: "닫기", onclick: () => side.classList.remove("open") })]), search, listBox]);
  const drawList = () => {
    const q = search.value.trim().toUpperCase();
    listBox.replaceChildren(...syms.filter(s => !q || s.sym.includes(q)).slice(0, 200).map(s => el("a", { class: "sym" + (s.key === key ? " on" : ""), href: "#/chart/" + s.key, style: "color:inherit" }, [
      el("div", {}, [el("b", { text: s.sym }), el("small", { text: s.nodata ? "가격 데이터 없음" : (CH[s.chain] || s.chain) })]),
      el("div", { class: "num" }, [el("small", { text: "글 " + s.posts + (s.wallets ? " · 지갑 " + s.wallets : "") }), s.last != null ? el("small", { text: fmtPx(s.last) }) : null])])));
  };
  search.addEventListener("input", drawList); drawList();

  const head = el("div", { class: "chead" }), tools = el("div", { class: "row", style: "margin-bottom:8px" }), links = el("div", { class: "row", style: "margin:8px 0" });
  const ohlc = el("div", { id: "ohlc" }), box = el("div", { id: "tv" }, [ohlc]);
  const postBox = el("div", { class: "card" }), walBox = el("div");
  const legend = el("div", { style: "margin-top:8px" }, [el("span", { class: "key" }, [el("i", { class: "p" }), "채널 글"]), el("span", { class: "key" }, [el("i", { class: "i" }), "지갑 입금(매수·수령)"]), el("span", { class: "key" }, [el("i", { class: "o" }), "지갑 출금(매도·전송)"]), el("span", { class: "mu sm", text: "시각은 한국시간 · 표식을 누르면 아래 목록의 해당 글로 이동" })]);
  const main = el("section", {}, [head, tools, box, legend, links, el("h3", { text: "이 종목이 나온 채널 글" }), postBox, el("h3", { text: "관련 지갑" }), walBox]);
  $("#view").replaceChildren(el("div", { class: "chartwrap" }, [side, main]));

  const myPosts = posts.filter(p => p.tickers.includes(info.sym)).sort((a, b) => b.ts - a.ts);
  const myWallets = wallets.filter(w => w.tokens.some(t => t.sym === info.sym && (isBinance || t.chain === info.chain)));
  const myFlows = myWallets.flatMap(w => w.flows.filter(f => f.sym === info.sym && (isBinance || f.chain === info.chain)).map(f => ({ ...f, w })));

  // posts list
  postBox.replaceChildren(...(myPosts.length ? myPosts.map(p => el("div", { class: "post", id: "post-" + p.id }, [
    el("div", { class: "row sm" }, [el("b", { text: fmtTime(p.ts) + " KST" }), p.fwd ? el("span", { class: "badge", text: "전달: " + p.fwd }) : null, el("span", { class: "grow" }),
      el("button", { class: "btn sm", text: "차트에서 보기", onclick: () => focusTime(p.ts) }), ext(tgUrl(p.id), "원문 #" + p.id)]),
    (() => { const t = el("div", { class: "t", text: p.text || "(본문 없음)" }); t.addEventListener("click", () => t.classList.toggle("open")); return t; })(),
    p.images.length ? el("div", { class: "thumbs" }, p.images.map(im => el("img", { src: "thumbs/" + im.file, loading: "lazy", alt: im.subject, title: im.subject, onclick: () => openImage(im.file) }))) : null,
    p.meaning ? el("div", { class: "sec sm", text: "요지: " + p.meaning }) : null,
  ])) : [el("div", { class: "empty", text: "이 종목을 $티커로 언급한 글이 없습니다." })]));
  walBox.replaceChildren(myWallets.length ? el("div", { class: "wgrid" }, myWallets.map(walletCard)) : el("div", { class: "empty card", text: "이 종목과 연결된 지갑이 없습니다." }));

  let data = null, bars = [];
  function focusTime(ts) {
    if (!tv || !bars.length) return;
    const sec = TF.find(t => t[0] === S.tf)[2], span = sec * 60;
    tv.chart.timeScale().setVisibleRange({ from: ts - span + KST, to: Math.min(ts + span, bars[bars.length - 1][0]) + KST });
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function drawTools() {
    tools.replaceChildren(el("button", { class: "btn sheet", text: "종목 선택", onclick: () => side.classList.add("open") }),
      ...TF.filter(t => isBinance || t[0] !== "15m").map(t => el("button", { class: "btn" + (S.tf === t[0] ? " on" : ""), text: t[1], onclick: () => { S.tf = t[0]; localStorage.setItem("tf", S.tf); load(); } })),
      el("button", { class: "btn" + (S.showPosts ? " on" : ""), text: "글 표시", onclick: () => { S.showPosts = !S.showPosts; drawTools(); setMarkers(); } }),
      el("button", { class: "btn" + (S.showFlows ? " on" : ""), text: "지갑 표시", onclick: () => { S.showFlows = !S.showFlows; drawTools(); setMarkers(); } }),
      el("button", { class: "btn", text: "전체 보기", onclick: () => tv && tv.chart.timeScale().fitContent() }));
  }
  function barTime(ts) { // open time of the bar containing ts (or the last bar before it)
    let lo = 0, hi = bars.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m][0] <= ts) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans < 0 ? null : bars[ans][0];
  }
  function setMarkers() {
    if (!tv) return;
    const m = [], byBar = new Map();
    if (S.showPosts) for (const p of myPosts) { const t = barTime(p.ts); if (t == null) continue; const k = "p" + t; const g = byBar.get(k) || { t, kind: "p", n: 0, ids: [] }; g.n++; g.ids.push(p.id); byBar.set(k, g); }
    if (S.showFlows) for (const f of myFlows) { const t = barTime(f.ts); if (t == null) continue; const k = f.dir + t; const g = byBar.get(k) || { t, kind: f.dir, amt: 0, n: 0 }; g.amt += f.amt; g.n++; byBar.set(k, g); }
    const groups = [...byBar.values()].sort((a, b) => a.t - b.t), label = groups.length <= (innerWidth < 820 ? 14 : 30);
    tv.postBars = new Map(groups.filter(g => g.kind === "p").map(g => [g.t + KST, g.ids]));
    for (const g of groups) {
      if (g.kind === "p") m.push({ time: g.t + KST, position: "aboveBar", color: css("--post"), shape: "circle", text: label ? (g.n > 1 ? "글 " + g.n : "글") : undefined });
      else if (g.kind === "in") m.push({ time: g.t + KST, position: "belowBar", color: css("--in"), shape: "arrowUp", text: label ? "+" + fmtAmt(g.amt) : undefined });
      else m.push({ time: g.t + KST, position: "aboveBar", color: css("--out"), shape: "arrowDown", text: label ? "−" + fmtAmt(g.amt) : undefined });
    }
    tv.candles.setMarkers(m);
  }
  function drawHead() {
    const last = bars[bars.length - 1], dayAgo = bars.find(b => b[0] >= last[0] - 86400) || bars[0];
    head.replaceChildren(el("span", { class: "name", text: info.sym }), el("span", { class: "badge", text: data.source }), el("span", { class: "px", text: fmtPx(last[4]) }), delta(last[4] / dayAgo[1] - 1, fmtPct), el("span", { class: "mu sm", text: "24시간 · 마지막 봉 " + fmtTime(last[0]) + (data.live ? " · 실시간 조회" : " · 저장된 데이터") }));
    const l = [];
    if (data.source_url) l.push(ext(data.source_url, data.chain === "binance" || data.pool === "binance" ? "Binance" : data.chain === "hyperliquid" ? "Hyperliquid" : "GeckoTerminal", "btn ext"));
    const tvSym = data.tv || (data.pool === "binance" ? "BINANCE:" + data.token + (data.source.includes("선물") ? ".P" : "") : null);
    if (tvSym) l.push(ext("https://www.tradingview.com/chart/?symbol=" + encodeURIComponent(tvSym), "TradingView에서 열기", "btn ext"));
    if (DEXS[data.chain] && data.pool && data.pool !== "binance") l.push(ext("https://dexscreener.com/" + DEXS[data.chain] + "/" + data.pool, "DEX Screener", "btn ext"));
    if (EXPL[data.chain] && data.token && data.pool !== "binance" && data.chain !== "hyperliquid") l.push(ext((data.chain === "solana" ? "https://solscan.io/token/" : EXPL[data.chain][1].replace("/address/", "/token/")) + data.token, "토큰 컨트랙트", "btn ext"));
    links.replaceChildren(el("span", { class: "sec sm", text: "외부에서 보기" }), ...l);
  }
  async function load() {
    drawTools(); destroyChart();
    box.replaceChildren(ohlc, el("div", { class: "loading", text: "차트 불러오는 중…" })); ohlc.textContent = "";
    try { data = await loadCandles(key, S.tf); }
    catch (e) { box.replaceChildren(el("div", { class: "empty", text: "가격 데이터를 불러오지 못했습니다. " + e.message })); head.replaceChildren(el("span", { class: "name", text: info.sym })); links.replaceChildren(); return; }
    bars = S.tf === "15m" ? data.candles : aggregate(data.candles, TF.find(t => t[0] === S.tf)[2]);
    if (!bars.length) { box.replaceChildren(el("div", { class: "empty", text: "봉 데이터가 없습니다." })); return; }
    box.replaceChildren(ohlc);
    const px = bars[bars.length - 1][4], dec = Math.min(10, Math.max(2, Math.ceil(-Math.log10(px)) + 3));
    const chart = LightweightCharts.createChart(box, {
      autoSize: true, layout: { background: { color: css("--panel") }, textColor: css("--ts"), fontSize: 12 },
      grid: { vertLines: { color: css("--line") }, horzLines: { color: css("--line") } }, rightPriceScale: { borderColor: css("--line") },
      timeScale: { borderColor: css("--line"), timeVisible: S.tf !== "1d", secondsVisible: false, rightOffset: 4 }, crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    });
    const candles = chart.addCandlestickSeries({ upColor: css("--up"), downColor: css("--down"), borderVisible: false, wickUpColor: css("--up"), wickDownColor: css("--down"), priceFormat: { type: "price", precision: dec, minMove: Math.pow(10, -dec) } });
    const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.2 } });
    candles.setData(bars.map(b => ({ time: b[0] + KST, open: b[1], high: b[2], low: b[3], close: b[4] })));
    vol.setData(bars.map(b => ({ time: b[0] + KST, value: b[5], color: (b[4] >= b[1] ? css("--up") : css("--down")) + "66" })));
    tv = { chart, candles, vol, postBars: new Map() };
    const show = b => { ohlc.replaceChildren(...[["시", b[1]], ["고", b[2]], ["저", b[3]], ["종", b[4]]].flatMap(([k, v]) => [document.createTextNode(k + " "), el("b", { text: fmtPx(v).slice(1) })]), document.createTextNode("거래 "), el("b", { text: fmtUsd(b[5]) }), delta(b[4] / b[1] - 1, fmtPct)); };
    const byTime = new Map(bars.map(b => [b[0] + KST, b]));
    show(bars[bars.length - 1]);
    chart.subscribeCrosshairMove(p => show(p && p.time != null && byTime.get(p.time) || bars[bars.length - 1]));
    chart.subscribeClick(p => {
      const ids = p && p.time != null && tv.postBars.get(p.time);
      if (!ids) return;
      document.querySelectorAll(".post.hl").forEach(n => n.classList.remove("hl"));
      const n = document.getElementById("post-" + ids[0]); if (n) { ids.forEach(i => { const x = document.getElementById("post-" + i); if (x) x.classList.add("hl"); }); n.scrollIntoView({ behavior: "smooth", block: "center" }); }
    });
    setMarkers(); drawHead();
    const first = myPosts.length ? Math.min(...myPosts.map(p => p.ts)) : null, sec = TF.find(t => t[0] === S.tf)[2];
    if (first && first > bars[0][0]) chart.timeScale().setVisibleRange({ from: Math.max(bars[0][0], first - sec * 120) + KST, to: bars[bars.length - 1][0] + KST });
    else chart.timeScale().fitContent();
  }
  await load();
}

/* ------------------------------------------------------------------ wallets */
function walletCard(w) {
  const t = w.total;
  return el("a", { class: "card wcard", href: "#/wallets/" + w.addr }, [
    el("div", { class: "row" }, [el("span", { class: "mono", text: short(w.addr) }), el("span", { class: "grow" }), el("span", { class: "mu sm", text: fmtDay(w.post_ts) + " · #" + w.posts[0] })]),
    el("div", { class: "sec sm", text: w.who.length > 60 ? w.who.slice(0, 60) + "…" : w.who }),
    el("div", { style: "margin-top:6px" }, [...w.chains.map(c => el("span", { class: "badge", text: CH[c] })), el("span", { class: "badge", text: w.role_ko }), el("span", { class: "sm", text: w.tokens.slice(0, 3).map(x => x.sym).join(", ") + (w.tokens.length > 3 ? " 외" : "") })]),
    el("div", { class: "kv" }, [el("div", {}, ["현재 평가액", el("b", { text: fmtUsd(t.now_usd) })]), el("div", {}, ["추정 손익", el("b", {}, [w.pnl_ok ? delta(t.pnl) : el("span", { class: "mu", text: "해당 없음" })])]),
      el("div", {}, ["글 이후 손익" + (t.assumed ? " (가정)" : ""), el("b", {}, [w.pnl_ok ? delta(t.since_post) : el("span", { class: "mu", text: "해당 없음" })])])]),
  ]);
}
const ORDER = ["ethereum", "bsc", "solana", "robinhood", "base", "hyperliquid"];
async function viewWallets(addr) {
  const ws = await api("wallets");
  if (addr) return walletDetail(ws.find(w => w.addr.toLowerCase() === addr.toLowerCase()));
  const S = { tab: sessionStorage.getItem("wtab") || "all", sort: sessionStorage.getItem("wsort") || "post" };
  const SORT = { post: ["최신 글 순", w => -w.post_ts], pnl: ["추정 손익 큰 순", w => -(w.pnl_ok && w.total.pnl != null ? w.total.pnl : -Infinity)], loss: ["추정 손익 작은 순", w => (w.pnl_ok && w.total.pnl != null ? w.total.pnl : Infinity)],
    since: ["글 이후 손익 큰 순", w => -(w.pnl_ok && w.total.since_post != null ? w.total.since_post : -Infinity)], now: ["평가액 큰 순", w => -(w.total.now_usd || 0)] };
  const chips = el("div", { class: "chips" }), tiles = el("div", { class: "tiles" }), grid = el("div", { class: "wgrid" });
  const sel = el("select", {}, Object.entries(SORT).map(([k, v]) => el("option", { value: k, text: v[0] })));
  sel.value = S.sort; sel.addEventListener("change", () => { S.sort = sel.value; sessionStorage.setItem("wsort", S.sort); draw(); });
  function draw() {
    const list = ws.filter(w => S.tab === "all" || w.chains.includes(S.tab)).sort((a, b) => SORT[S.sort][1](a) - SORT[S.sort][1](b));
    chips.replaceChildren(...[["all", "전체", ws.length]].concat(ORDER.map(c => [c, CH[c], ws.filter(w => w.chains.includes(c)).length]).filter(x => x[2])).map(([k, n, c]) =>
      el("button", { class: "btn" + (S.tab === k ? " on" : ""), text: n + " " + c, onclick: () => { S.tab = k; sessionStorage.setItem("wtab", k); draw(); } })));
    const pn = list.filter(w => w.pnl_ok && w.total.pnl != null), sp = list.filter(w => w.pnl_ok && w.total.since_post != null), sum = (a, f) => a.reduce((s, w) => s + f(w), 0);
    const tile = (l, v, h) => el("div", { class: "tile" }, [el("div", { class: "l", text: l }), el("div", { class: "v" }, [v]), el("div", { class: "h", text: h })]);
    tiles.replaceChildren(tile("지갑", list.length + "개", "글에 주소가 적힌 지갑"), tile("현재 평가액 합계", fmtUsd(sum(list.filter(w => w.pnl_ok), w => w.total.now_usd || 0)), "거래소·컨트랙트·경유 제외"),
      tile("추정 손익 합계", pn.length ? delta(sum(pn, w => w.total.pnl)) : "–", "전송 이력 있는 " + pn.length + "개"), tile("글 이후 손익 합계", sp.length ? delta(sum(sp, w => w.total.since_post)) : "–", sp.length + "개 · 일부 잔고 불변 가정"));
    grid.replaceChildren(...list.map(walletCard));
  }
  $("#view").replaceChildren(chips, el("div", { class: "row" }, [el("span", { class: "sec sm grow", text: "온체인 기준 시각 2026-11-17 12:00 KST · 카드를 누르면 상세와 외부 사이트 링크가 나옵니다" }), sel]), tiles, grid);
  draw();
}
function walletLinks(w) {
  const l = [], evm = w.addr.startsWith("0x");
  for (const c of w.chains) if (EXPL[c]) l.push(ext(addrUrl(c, w.addr), EXPL[c][0], "btn ext"));
  if (w.tab === "hyperliquid") l.push(ext("https://hyperdash.com/track/" + w.addr, "Hyperdash", "btn ext"));
  if (evm) l.push(ext("https://debank.com/profile/" + w.addr, "DeBank", "btn ext"));
  l.push(ext("https://intel.arkm.com/explorer/address/" + w.addr, "Arkham", "btn ext"));
  for (const id of w.posts) l.push(ext(tgUrl(id), "채널 글 #" + id, "btn ext"));
  return l;
}
function walletDetail(w) {
  if (!w) { $("#view").replaceChildren(el("div", { class: "empty", text: "지갑을 찾지 못했습니다." })); return; }
  const t = w.total, tile = (l, v, h) => el("div", { class: "tile" }, [el("div", { class: "l", text: l }), el("div", { class: "v" }, [v]), h ? el("div", { class: "h", text: h }) : null]);
  const note = el("div", { class: "note" }); note.innerHTML = DOMPurify.sanitize(w.note.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>"));
  const kids = [
    el("div", { class: "row" }, [el("a", { class: "btn sm", href: "#/wallets", text: "← 목록" })]),
    el("div", { class: "addr mono", style: "margin-top:10px", text: w.addr }),
    el("div", { class: "sec sm" }, [...w.chains.map(c => el("span", { class: "badge", text: CH[c] })), el("span", { class: "badge", text: w.role_ko }), document.createTextNode(w.who + " · 글 게시 " + fmtTime(w.post_ts) + " KST")]),
    el("div", { class: "row", style: "margin:10px 0" }, walletLinks(w)), note,
    el("div", { class: "tiles" }, [tile("현재 평가액", fmtUsd(t.now_usd), "가격 확인된 보유 토큰"), tile("추정 손익", w.pnl_ok ? delta(t.pnl) : "해당 없음", w.pnl_ok ? (t.pnl == null ? "전송 이력 없음" : "받은 시점 시가 기준") : w.role_ko + " 주소"),
      tile("글 이후 손익", w.pnl_ok ? delta(t.since_post) : "해당 없음", t.assumed ? "잔고가 그대로였다고 가정" : null), tile("유입액", t.in_usd ? fmtUsd(t.in_usd) : "–", "받은 물량의 당시 시가"), tile("유출액", t.out_usd ? fmtUsd(t.out_usd) : "–", "내보낸 물량의 당시 시가")]),
  ];
  if (w.tab === "bsc" || w.tab === "base") kids.push(el("div", { class: "card", style: "padding:10px 13px;margin-bottom:10px" }, [el("span", { class: "sec sm", text: CH[w.tab] + "은(는) 과거 전송 이력을 조회하지 못해 현재 잔고만 있습니다. 전체 이력은 위의 익스플로러·DeBank 링크에서 볼 수 있습니다." })]));
  const th = (heads, nums) => el("thead", {}, [el("tr", {}, heads.map((x, i) => el("th", { class: nums.includes(i) ? "num" : "", text: x })))]);
  kids.push(el("h3", { text: "토큰별 손익" }), el("div", { class: "scroll" }, [el("table", {}, [th(["토큰", "보유량", "가격 (글 시점 → 현재)", "가격 변화", "유입", "유출", "추정 손익", "글 이후 손익", ""], [1, 2, 3, 4, 5, 6, 7]),
    el("tbody", {}, w.tokens.map(r => el("tr", {}, [el("td", {}, [document.createTextNode(r.sym + " "), el("span", { class: "badge", text: CH[r.chain] })]), el("td", { class: "num", text: fmtAmt(r.bal) }),
      el("td", { class: "num", text: fmtPx(r.px_post) + " → " + fmtPx(r.px_now) }), el("td", { class: "num" }, [delta(r.chg_since_post, fmtPct)]),
      el("td", { class: "num", text: r.in_usd ? fmtAmt(r.in_amt) + " · " + fmtUsd(r.in_usd) : "–" }), el("td", { class: "num", text: r.out_usd ? fmtAmt(r.out_amt) + " · " + fmtUsd(r.out_usd) : "–" }),
      el("td", { class: "num" }, [w.pnl_ok && r.pnl != null ? delta(r.pnl) : el("span", { class: "mu", text: "–" })]), el("td", { class: "num" }, [w.pnl_ok && r.since_post != null ? delta(r.since_post) : el("span", { class: "mu", text: "–" })]),
      el("td", {}, [r.px_now != null ? el("a", { class: "btn sm", href: "#/chart/" + r.chain + ":" + r.sym, text: "차트" }) : null])])))])]));
  if (w.hold.length) kids.push(el("h3", { text: "현재 보유 (평가액 순)" }), el("div", { class: "scroll" }, [el("table", {}, [th(["토큰", "체인", "수량", "평가액"], [2, 3]),
    el("tbody", {}, w.hold.map(h => el("tr", {}, [el("td", { text: h.sym }), el("td", { class: "sec", text: CH[h.chain] }), el("td", { class: "num", text: fmtAmt(h.amt) }), el("td", { class: "num", text: fmtUsd(h.usd) })])))])]));
  if (w.extra.staking) {
    const name = s => s.kind === "delegate" ? (s.isUndelegate ? "위임 해제(언스테이킹)" : "위임(스테이킹)") : s.kind === "withdrawal" ? (s.phase === "initiated" ? "출금 신청(7일 대기)" : "출금 완료") : s.kind === "cDeposit" ? "스테이킹 계정 입금" : s.kind;
    kids.push(el("h3", { text: "스테이킹 기록 (Hyperliquid)" }), el("div", { class: "scroll" }, [el("table", {}, [th(["시각(KST)", "동작", "수량(HYPE)", ""], [2]),
      el("tbody", {}, w.extra.staking.slice().sort((a, b) => b.ts - a.ts).map(s => el("tr", {}, [el("td", { text: fmtTime(s.ts) }), el("td", { text: name(s) }), el("td", { class: "num", text: Math.round(+s.amount).toLocaleString("en-US") }), el("td", {}, [s.ts > w.post_ts ? el("span", { class: "badge", text: "글 이후" }) : null])])))])]));
  }
  kids.push(el("h3", { text: "활동 기록" + (w.n_flows ? " (" + w.n_flows + "건" + (w.n_flows > w.flows.length ? ", 최근 " + w.flows.length + "건 표시" : "") + ")" : "") }));
  if (!w.flows.length) kids.push(el("div", { class: "empty card", text: "조회된 전송 기록이 없습니다. 위의 외부 링크에서 전체 이력을 확인하세요." }));
  else kids.push(el("div", { class: "scroll", style: "max-height:560px" }, [el("table", {}, [th(["시각(KST)", "방향", "수량", "당시 금액", "상대 주소", "거래", ""], [2, 3]),
    el("tbody", {}, w.flows.map(f => el("tr", {}, [el("td", { text: fmtTime(f.ts), style: "white-space:nowrap" }), el("td", { class: f.dir === "in" ? "up" : "dn", text: f.dir === "in" ? "입금" : "출금", style: "white-space:nowrap" }),
      el("td", { class: "num", text: fmtAmt(f.amt) + " " + f.sym }), el("td", { class: "num", text: fmtUsd(f.usd) }),
      el("td", {}, [f.cp && addrUrl(f.chain, f.cp) ? ext(addrUrl(f.chain, f.cp), short(f.cp), "mono ext") : el("span", { class: "mono", text: short(f.cp) }), f.label ? el("div", { class: "mu sm", text: f.label }) : null]),
      el("td", {}, [txUrl(f.chain, f.tx) ? ext(txUrl(f.chain, f.tx), "보기", "ext sm") : null]), el("td", {}, [f.after ? el("span", { class: "badge", text: "글 이후" }) : null])])))])]));
  $("#view").replaceChildren(...kids);
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ docs */
const slug = s => s.toLowerCase().replace(/[^\w가-힣\s-]/g, "").trim().replace(/\s+/g, "-");
function renderMd(md, goAnchor) {
  const box = el("div", { class: "md" });
  box.innerHTML = DOMPurify.sanitize(marked.parse(md, { gfm: true, breaks: false }), { ADD_ATTR: ["target", "open"] });
  box.querySelectorAll("h1,h2,h3").forEach(h => { h.id = slug(h.textContent); });
  box.querySelectorAll("img").forEach(im => {
    const m = /(?:^|\/)data\/photos\/([^/?#]+)$/.exec(im.getAttribute("src") || "");
    if (m) { im.src = "photos/" + m[1]; im.addEventListener("click", () => openImage(m[1])); }
    im.loading = "lazy";
  });
  box.querySelectorAll("table").forEach(t => { const w = el("div", { class: "tw" }); t.replaceWith(w); w.append(t); });
  box.querySelectorAll("a[href]").forEach(a => {
    const h = a.getAttribute("href");
    if (/^https?:/.test(h)) { a.target = "_blank"; a.rel = "noopener noreferrer"; a.classList.add("ext"); }
    else if (h.startsWith("#")) a.addEventListener("click", ev => { ev.preventDefault(); goAnchor(decodeURIComponent(h.slice(1))); });
    else if (/^[^/]+\.md$/.test(h)) a.setAttribute("href", "#/docs/" + h);
    else a.removeAttribute("href");
  });
  // wallet addresses in running text -> explorer links
  return box;
}
async function viewDocs(name, sec) {
  if (!name) {
    const list = await api("docs");
    $("#view").replaceChildren(el("h2", { text: "문서" }), el("div", { class: "card doclist" }, list.map(d => el("a", { href: "#/docs/" + encodeURIComponent(d.name) }, [el("div", { style: "font-weight:600", text: d.title }),
      el("div", { class: "mu sm", text: d.name + " · " + (d.size / 1024).toFixed(0) + " KB · " + new Date(d.mtime * 1000).toLocaleDateString("ko-KR") })]))));
    return;
  }
  const key = "doc:" + name;
  if (!cache[key]) { const r = await fetch("docs/" + encodeURIComponent(name)); if (!r.ok) throw new Error("문서를 찾지 못했습니다"); cache[key] = await r.text(); }
  const text = cache[key];
  let parts = [{ title: "처음", body: text }];
  if (text.length > 60000) {
    const lines = text.split("\n"); parts = []; let cur = { title: "처음", lines: [] };
    for (const ln of lines) { if (ln.startsWith("## ")) { parts.push(cur); cur = { title: ln.slice(3).trim(), lines: [ln] }; } else cur.lines.push(ln); }
    parts.push(cur); parts = parts.map(p => ({ title: p.title, body: p.lines.join("\n") })).filter(p => p.body.trim());
  }
  let i = Math.min(parts.length - 1, Math.max(0, parseInt(sec || "0", 10) || 0));
  const body = el("div"), bar = el("div", { class: "docbar" });
  const go = (n, anchor) => { i = Math.min(parts.length - 1, Math.max(0, n)); history.replaceState(null, "", "#/docs/" + encodeURIComponent(name) + "/" + i); draw(anchor); };
  const goAnchor = a => {
    const here = document.getElementById(a) || document.getElementById(slug(a));
    if (here && body.contains(here)) return here.scrollIntoView({ behavior: "smooth" });
    const n = parts.findIndex(p => slug(p.title) === slug(a) || p.title === a);
    if (n >= 0) go(n); else { const m = parts.findIndex(p => p.body.includes("# " + a)); if (m >= 0) go(m, a); }
  };
  const q = el("input", { type: "search", placeholder: "문서 안에서 찾기", style: "flex:1;min-width:110px;max-width:260px" }), found = el("div");
  q.addEventListener("keydown", ev => {
    if (ev.key !== "Enter") return;
    const s = q.value.trim().toLowerCase();
    if (!s) return found.replaceChildren();
    const hits = parts.map((p, n) => [n, p.title, p.body.toLowerCase().split(s).length - 1]).filter(x => x[2]);
    found.replaceChildren(el("div", { class: "card", style: "padding:10px 13px;margin:6px 0" }, hits.length ? [el("div", { class: "sec sm", text: `"${q.value}" — ${hits.reduce((a, x) => a + x[2], 0)}곳` }),
      ...hits.map(([n, t, c]) => el("div", {}, [el("a", { href: "#", text: `${t} (${c})`, onclick: ev2 => { ev2.preventDefault(); go(n); } })]))] : [el("span", { class: "mu", text: "찾는 내용이 없습니다." })]));
  });
  function draw(anchor) {
    const sel = el("select", {}, parts.map((p, n) => el("option", { value: n, text: p.title })));
    sel.value = i; sel.addEventListener("change", () => go(+sel.value));
    bar.replaceChildren(el("a", { class: "btn sm", href: "#/docs", text: "← 목록" }), parts.length > 1 ? el("button", { class: "btn sm", text: "‹ 이전", disabled: i === 0, onclick: () => go(i - 1) }) : null, parts.length > 1 ? sel : el("b", { class: "grow", text: name }),
      parts.length > 1 ? el("button", { class: "btn sm", text: "다음 ›", disabled: i === parts.length - 1, onclick: () => go(i + 1) }) : null, q);
    body.replaceChildren(renderMd(parts[i].body, goAnchor));
    if (parts.length > 1) body.append(el("div", { class: "row", style: "margin-top:24px" }, [el("button", { class: "btn", text: "‹ 이전", disabled: i === 0, onclick: () => go(i - 1) }), el("span", { class: "grow" }), el("button", { class: "btn", text: "다음 ›", disabled: i === parts.length - 1, onclick: () => go(i + 1) })]));
    const t = anchor && (document.getElementById(anchor) || document.getElementById(slug(anchor)));
    if (t) t.scrollIntoView(); else window.scrollTo(0, 0);
  }
  $("#view").replaceChildren(bar, found, body); draw();
}

/* ------------------------------------------------------------------ images */
async function viewImages() {
  const all = await api("images"); await api("symbols").then(s => { cache.symbols = s; });
  const F = { kind: "", tool: "", tag: "", tf: "", q: "", n: 48 };
  const filtered = skip => { const q = F.q.trim().toLowerCase(); return all.filter(c => (skip === "kind" || !F.kind || c.kind === F.kind) && (skip === "tool" || !F.tool || c.tool === F.tool) && (skip === "tag" || !F.tag || c.tags.includes(F.tag)) && (skip === "tf" || !F.tf || c.tf === F.tf) && (!q || (c.subject + " " + c.text + " " + c.tickers.join(" ") + " " + c.caption).toLowerCase().includes(q))); };
  const count = (list, f) => { const m = new Map(); for (const c of list) for (const k of [].concat(f(c))) if (k) m.set(k, (m.get(k) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const filters = el("div", { class: "row", style: "margin-bottom:12px" }), stats = el("div", { class: "bars" }), gal = el("div", { class: "gal" }), more = el("button", { class: "btn", style: "display:block;margin:16px auto", text: "더 보기" });
  const q = el("input", { type: "search", placeholder: "종목·키워드 검색", style: "flex:1;min-width:140px;max-width:300px" });
  q.addEventListener("input", () => { F.q = q.value; F.n = 48; draw(); }); more.addEventListener("click", () => { F.n += 48; draw(); });
  const bars = (title, rows, key, lab) => { const mx = Math.max(1, ...rows.map(r => r[1])); return el("div", { class: "card" }, [el("h3", { text: title }), ...rows.map(([k, n]) => el("div", { class: "br" + (F[key] === k ? " on" : ""), onclick: () => { if (key === "q") { F.q = F.q === k ? "" : k; q.value = F.q; } else F[key] = F[key] === k ? "" : k; F.n = 48; draw(); } }, [el("span", { text: lab ? lab(k) : k }), el("div", {}, [el("i", { style: `width:${n / mx * 100}%` })]), el("b", { text: n })]))]); };
  function draw() {
    const list = filtered(), mk = (key, label, opts, lab) => { const s = el("select", {}, [el("option", { value: "", text: label + " 전체" }), ...opts.map(([k, n]) => el("option", { value: k, text: (lab ? lab(k) : k) + " (" + n + ")" }))]); s.value = F[key]; s.addEventListener("change", () => { F[key] = s.value; F.n = 48; draw(); }); return s; };
    filters.replaceChildren(mk("kind", "종류", count(filtered("kind"), c => c.kind), k => KIND[k]), mk("tool", "도구", count(filtered("tool"), c => c.tool)), mk("tag", "형태 태그", count(filtered("tag"), c => c.tags)), mk("tf", "기간·봉", count(filtered("tf"), c => c.tf)), q,
      el("button", { class: "btn", text: "초기화", onclick: () => { Object.assign(F, { kind: "", tool: "", tag: "", tf: "", q: "", n: 48 }); q.value = ""; draw(); } }), el("span", { class: "sec sm", text: `${list.length}장 / 전체 ${all.length}장` }));
    stats.replaceChildren(bars("종류", count(filtered("kind"), c => c.kind), "kind", k => KIND[k]), bars("도구·화면", count(filtered("tool"), c => c.tool).slice(0, 10), "tool"), bars("형태 태그 (설명문 키워드 기준)", count(filtered("tag"), c => c.tags).slice(0, 12), "tag"), bars("많이 올라온 종목", count(list, c => c.tickers).slice(0, 12), "q"));
    gal.replaceChildren(...list.slice().sort((a, b) => b.ts - a.ts).slice(0, F.n).map(c => el("div", { class: "card g", onclick: () => openImage(c.file) }, [el("img", { src: "thumbs/" + c.file, loading: "lazy", alt: c.subject }),
      el("div", {}, [el("u", { text: c.subject.length > 60 ? c.subject.slice(0, 59) + "…" : c.subject }), el("span", { class: "mu", text: fmtTime(c.ts) + " · " + KIND[c.kind] + (c.tickers.length ? " · " + c.tickers.slice(0, 2).join(", ") : "") }), el("div", { style: "margin-top:4px" }, c.tags.slice(0, 3).map(t => el("span", { class: "badge", text: t })))])])));
    more.style.display = list.length > F.n ? "block" : "none";
  }
  $("#view").replaceChildren(filters, stats, gal, more); draw();
}


/* ------------------------------------------------------------------ wallet hunt (registry) */
const HTYPE = { mm: "마켓메이커·OTC", foundation_team: "재단·팀", vc_fund: "VC·펀드", institution: "기관", hl_trader: "HL 트레이더", whale: "고래", named_individual: "실명·닉네임 개인", exchange: "거래소", hacker: "해커·세탁", contract: "컨트랙트", other: "기타" };
const HORDER = ["mm", "foundation_team", "vc_fund", "institution", "hl_trader", "whale", "named_individual", "exchange", "hacker", "contract", "other"];
const GRADE_TXT = { A: "A · 글이 단정 + 공개 라벨 일치 또는 작성자 2곳 이상", B: "B · 한 작성자가 단정 또는 두 작성자가 추정", C: "C · 한 작성자의 추정", "별칭": "별칭 · 별명·핸들일 뿐 실제 주인 미확인", "-": "주체 미상" };
const HEXPL = { ethereum: "Etherscan", bsc: "BscScan", base: "BaseScan", arbitrum: "Arbiscan", solana: "Solscan", bitcoin: "mempool", tron: "Tronscan", hyperliquid: "Hypurrscan" };
const srcName = u => /t\.me\//.test(u) ? "텔레그램" : /x\.com|twitter\.com/.test(u) ? "X" : "출처";
const hlLinks = a => [ext("https://hypurrscan.io/address/" + a, "Hypurrscan"), ext("https://hyperdash.com/track/" + a, "Hyperdash"), ext("https://www.coinglass.com/hyperliquid/" + a, "CoinGlass"), ext("https://app.hyperliquid.xyz/explorer/address/" + a, "HL 익스플로러")];
const posText = p => `${p.coin} ${p.size > 0 ? "롱" : "숏"} ${fmtUsd(Math.abs(p.value))}`;
async function viewHunt() {
  const [H, syms, HLD] = await Promise.all([api("hunt"), api("symbols"), api("hl").catch(() => ({ accounts: [] }))]); cache.symbols = syms;
  const hlBy = new Map(HLD.accounts.map(w => [w.addr, w]));
  const all = H.wallets.map(r => { const w = hlBy.get(r.address); return w ? { ...r, hl: { av: w.av, perp_value: w.perp_value, month_pnl: (w.perf.month || {}).pnl, positions: w.positions.slice(0, 5) } } : { ...r, hl: null }; }), F = { type: sessionStorage.getItem("htype") || "", grade: "", chain: "", q: "", sort: "n", n: 40 };
  const chips = el("div", { class: "chips" }), bar = el("div", { class: "row", style: "margin-bottom:10px" }), grid = el("div", { class: "wgrid" }), more = el("button", { class: "btn", style: "display:block;margin:16px auto", text: "더 보기" });
  const q = el("input", { type: "search", placeholder: "주체·주소·종목 검색", style: "flex:1;min-width:150px;max-width:320px" });
  q.addEventListener("input", () => { F.q = q.value; F.n = 40; draw(); }); more.addEventListener("click", () => { F.n += 40; draw(); });
  const GO = { A: 0, B: 1, C: 2, "별칭": 3, "-": 4 };
  const SORT = { n: ["언급 많은 순", r => -r.n_mentions], last: ["최근 언급 순", r => -r.last], grade: ["등급 순", r => GO[r.grade] * 1e6 - r.n_mentions] };
  function card(r) {
    const links = [];
    if (r.explorer) links.push(ext(r.explorer, HEXPL[r.chain] || "DeBank"));
    if (r.address.startsWith("0x") && r.chain !== "hyperliquid") links.push(ext("https://debank.com/profile/" + r.address, "DeBank"));
    if (r.chain === "hyperliquid") links.push(ext("https://hyperdash.com/track/" + r.address, "Hyperdash"));
    links.push(ext("https://intel.arkm.com/explorer/address/" + r.address, "Arkham"));
    r.sources.slice(0, 3).forEach((u, i) => links.push(ext(u, srcName(u) + " 글 " + (i + 1))));
    return el("div", { class: "card wcard", style: "cursor:default" }, [
      el("div", { class: "row" }, [el("b", { text: r.entity || "(주체 미상)" }), el("span", { class: "badge", title: GRADE_TXT[r.grade], text: r.grade === "-" ? "미상" : "등급 " + r.grade }), el("span", { class: "grow" }), el("span", { class: "mu sm", text: fmtDay(r.first) + "~" + fmtDay(r.last) })]),
      el("div", { style: "margin:4px 0" }, [el("span", { class: "badge", text: HTYPE[r.type] || r.type }), el("span", { class: "badge", text: r.chain }), r.public_label ? el("span", { class: "badge", title: "Blockscout 공개 라벨", text: "공개 라벨: " + r.public_label.slice(0, 28) }) : null,
        ...r.tokens.slice(0, 4).map(t => el("a", { class: "badge", href: "#/chart/" + symKeyFor(t.toUpperCase()), text: t }))]),
      el("div", { class: "mono", style: "word-break:break-all", text: r.address }),
      el("div", { style: "margin:6px 0", text: r.summary }),
      r.hl ? el("div", { class: "sec sm" }, [document.createTextNode(`HL 평가액 ${fmtUsd(r.hl.av != null ? r.hl.av : r.hl.perp_value)} · 한 달 손익 `), delta(r.hl.month_pnl), document.createTextNode(r.hl.positions.length ? " · " + r.hl.positions.slice(0, 3).map(posText).join(", ") : " · 포지션 없음"), document.createTextNode(" "), el("a", { href: "#/hl/" + r.address, text: "자세히" })]) : null,
      el("div", { class: "mu sm", text: `언급 ${r.n_mentions}회 · ${r.authors.slice(0, 4).join(", ")}` }),
      el("div", { class: "row", style: "margin-top:8px" }, links)]);
  }
  function draw() {
    const s = F.q.trim().toLowerCase();
    const base = all.filter(r => (!F.grade || r.grade === F.grade) && (!F.chain || r.chain === F.chain) && (!s || (r.entity + " " + r.address + " " + r.tokens.join(" ") + " " + r.summary).toLowerCase().includes(s)));
    const list = base.filter(r => !F.type || r.type === F.type).sort((a, b) => SORT[F.sort][1](a) - SORT[F.sort][1](b));
    chips.replaceChildren(el("button", { class: "btn" + (!F.type ? " on" : ""), text: "전체 " + base.length, onclick: () => { F.type = ""; sessionStorage.setItem("htype", ""); F.n = 40; draw(); } }),
      ...HORDER.map(t => [t, base.filter(r => r.type === t).length]).filter(x => x[1]).map(([t, n]) => el("button", { class: "btn" + (F.type === t ? " on" : ""), text: HTYPE[t] + " " + n, onclick: () => { F.type = t; sessionStorage.setItem("htype", t); F.n = 40; draw(); } })));
    const mk = (key, label, opts, lab) => { const x = el("select", {}, [el("option", { value: "", text: label }), ...opts.map(o => el("option", { value: o, text: lab ? lab(o) : o }))]); x.value = F[key]; x.addEventListener("change", () => { F[key] = x.value; F.n = 40; draw(); }); return x; };
    const sortSel = el("select", {}, Object.entries(SORT).map(([k, v]) => el("option", { value: k, text: v[0] }))); sortSel.value = F.sort; sortSel.addEventListener("change", () => { F.sort = sortSel.value; draw(); });
    bar.replaceChildren(mk("grade", "등급 전체", ["A", "B", "C", "별칭", "-"], g => GRADE_TXT[g]), mk("chain", "체인 전체", [...new Set(all.map(r => r.chain))].sort()), sortSel, q, el("span", { class: "sec sm", text: list.length + "개" }));
    grid.replaceChildren(...list.slice(0, F.n).map(card));
    more.style.display = list.length > F.n ? "block" : "none";
  }
  $("#view").replaceChildren(el("div", { class: "sec sm", style: "margin-bottom:8px", text: "텔레그램 온체인 알림 채널과 X에서 최근 30일간 언급된 지갑입니다. 주체 이름은 출처 글의 주장이며, 등급에 마우스를 올리면 기준이 나옵니다." }), chips, bar, grid, more);
  draw();
}

/* ------------------------------------------------------------------ Hyperliquid whales */
async function viewHL(addr) {
  const [H, syms, EV] = await Promise.all([api("hl"), api("symbols"), api("hl_events").catch(() => [])]); cache.symbols = syms;
  const all = H.accounts.map(w => ({ ...w, posSum: w.positions.reduce((s, p) => s + Math.abs(p.value), 0), nm: (w.label && w.label.entity) || w.name || "", m: (w.perf.month || {}), at: (w.perf.allTime || {}) }));
  const F = { show: sessionStorage.getItem("hlshow") || "pos", sort: "pos", n: 40 };
  const SHOW = { pos: ["포지션 있음", w => w.positions.length], all: ["전체", () => true], named: ["글에서 언급", w => w.why.some(x => x.includes("언급"))], idle: ["보유 전용", w => w.why.some(x => x.includes("거래 없는"))] };
  const SORT = { pos: ["포지션 합계 큰 순", w => -w.posSum], av: ["평가액 큰 순", w => -(w.av != null ? w.av : w.perp_value)], mp: ["한 달 수익 큰 순", w => -(w.m.pnl ?? -Infinity)], ml: ["한 달 손실 큰 순", w => (w.m.pnl ?? Infinity)], at: ["누적 수익 큰 순", w => -(w.at.pnl ?? -Infinity)], vol: ["한 달 거래량 큰 순", w => -(w.m.vlm ?? 0)] };
  const tile = (l, v, h) => el("div", { class: "tile" }, [el("div", { class: "l", text: l }), el("div", { class: "v" }, [v]), h ? el("div", { class: "h", text: h }) : null]);
  const chips = el("div", { class: "chips" }), grid = el("div", { class: "wgrid" }), more = el("button", { class: "btn", style: "display:block;margin:16px auto", text: "더 보기" });
  more.addEventListener("click", () => { F.n += 40; draw(); });
  const sortSel = el("select", {}, Object.entries(SORT).map(([k, v]) => el("option", { value: k, text: v[0] }))); sortSel.addEventListener("change", () => { F.sort = sortSel.value; draw(); });
  // long/short totals per coin across tracked accounts
  const coin = new Map();
  for (const w of all) for (const p of w.positions) { const c = coin.get(p.coin) || { coin: p.coin, long: 0, short: 0, n: 0 }; if (p.size > 0) c.long += Math.abs(p.value); else c.short += Math.abs(p.value); c.n++; coin.set(p.coin, c); }
  const coins = [...coin.values()].sort((a, b) => (b.long + b.short) - (a.long + a.short)).slice(0, 12);
  const totL = [...coin.values()].reduce((s, c) => s + c.long, 0), totS = [...coin.values()].reduce((s, c) => s + c.short, 0);
  const th = (heads, nums) => el("thead", {}, [el("tr", {}, heads.map((x, i) => el("th", { class: nums.includes(i) ? "num" : "", text: x })))]);
  function card(w) {
    const av = w.av != null ? w.av : w.perp_value;
    return el("div", { class: "card wcard", style: "cursor:default", id: "hl-" + w.addr }, [
      el("div", { class: "row" }, [el("b", { text: w.nm || "(이름 없음)" }), w.label ? el("span", { class: "badge", text: HTYPE[w.label.type] || w.label.type }) : null, el("span", { class: "grow" }), el("span", { class: "mu sm", text: w.why.map(x => x.replace("매매하는 계정 중 ", "").replace("최근 ", "")).slice(0, 2).join(" · ") })]),
      el("div", { class: "mono sm", style: "word-break:break-all", text: w.addr }),
      el("div", { class: "kv", style: "grid-template-columns:repeat(4,1fr)" }, [el("div", {}, ["평가액", el("b", { text: fmtUsd(av) })]), el("div", {}, ["한 달 손익", el("b", {}, [delta(w.m.pnl)])]), el("div", {}, ["누적 손익", el("b", {}, [delta(w.at.pnl)])]), el("div", {}, ["한 달 거래량", el("b", { text: fmtUsd(w.m.vlm) })])]),
      w.positions.length ? el("div", { class: "scroll", style: "margin-top:8px" }, [el("table", {}, [th(["포지션", "규모", "미실현", "배율", "청산가"], [1, 2, 3, 4]),
        el("tbody", {}, w.positions.slice(0, 6).map(p => el("tr", {}, [el("td", {}, [el("a", { href: "#/chart/" + symKeyFor(p.coin.replace(/^k/, "").toUpperCase()), text: p.coin }), el("span", { class: p.size > 0 ? "up" : "dn", style: "margin-left:6px", text: p.size > 0 ? "롱" : "숏" })]),
          el("td", { class: "num", text: fmtUsd(Math.abs(p.value)) }), el("td", { class: "num" }, [delta(p.upnl)]), el("td", { class: "num", text: p.lev ? p.lev + "x" : "–" }), el("td", { class: "num", text: p.liq ? fmtPx(p.liq) : "–" })])))])]) : el("div", { class: "mu sm", style: "margin-top:6px", text: "무기한 포지션 없음" + (w.spot.length ? " · 현물: " + w.spot.slice(0, 3).map(x => x.coin + " " + fmtAmt(x.total)).join(", ") : "") }),
      w.n_positions > 6 ? el("div", { class: "mu sm", text: `외 ${w.n_positions - 6}개 포지션` }) : null,
      w.label && w.label.summary ? el("div", { class: "sec sm", style: "margin-top:6px", text: "글 요약: " + w.label.summary + " (" + w.label.authors.slice(0, 3).join(", ") + ")" }) : null,
      el("div", { class: "row", style: "margin-top:8px" }, hlLinks(w.addr))]);
  }
  function draw() {
    const list = (addr ? all.filter(w => w.addr === addr.toLowerCase()) : all.filter(SHOW[F.show][1])).sort((a, b) => SORT[F.sort][1](a) - SORT[F.sort][1](b));
    chips.replaceChildren(...(addr ? [el("a", { class: "btn", href: "#/hl", text: "← 전체 목록" })] : Object.entries(SHOW).map(([k, v]) => el("button", { class: "btn" + (F.show === k ? " on" : ""), text: v[0] + " " + all.filter(v[1]).length, onclick: () => { F.show = k; sessionStorage.setItem("hlshow", k); F.n = 40; draw(); } }))), addr ? null : sortSel);
    grid.replaceChildren(...list.slice(0, F.n).map(card));
    more.style.display = list.length > F.n ? "block" : "none";
  }
  const checked = H.checked || Math.max(...all.map(w => w.checked || 0));
  const byAddr = new Map(all.map(w => [w.addr, w]));
  const side = e => e.side === "long" ? "롱" : "숏";
  const evText = e => e.kind === "open" ? `${e.coin} ${side(e)} 신규 진입 ${fmtUsd(e.value)}${e.lev ? " · " + e.lev + "x" : ""}`
    : e.kind === "close" ? `${e.coin} ${side(e)} 포지션 종료 (직전 규모 ${fmtUsd(e.value)}, 직전 미실현 ${e.last_upnl >= 0 ? "+" : ""}${fmtUsd(e.last_upnl)})`
    : e.kind === "flip" ? `${e.coin} 방향 전환 → ${side(e)} ${fmtUsd(e.value)}`
    : e.kind === "increase" ? `${e.coin} ${side(e)} 확대 ${fmtUsd(e.prev_value)} → ${fmtUsd(e.value)}`
    : e.kind === "decrease" ? `${e.coin} ${side(e)} 축소 ${fmtUsd(e.prev_value)} → ${fmtUsd(e.value)}`
    : `계좌 평가액 ${fmtUsd(e.prev_value)} → ${fmtUsd(e.value)} (입출금 또는 손익)`;
  const evs = (addr ? EV.filter(e => e.addr === addr.toLowerCase()) : EV).slice(0, addr ? 60 : 40);
  const evBox = el("div", { class: "card" }, evs.length ? evs.map(e => { const w = byAddr.get(e.addr) || {}; return el("div", { class: "post" }, [el("div", { class: "row sm" }, [el("b", { text: fmtTime(e.ts) }),
    el("a", { href: "#/hl/" + e.addr, text: w.nm || short(e.addr) }), w.label ? el("span", { class: "badge", text: HTYPE[w.label.type] || w.label.type }) : null]), el("div", { text: evText(e) })]); })
    : [el("div", { class: "empty", text: (H.runs || 0) < 2 ? "추적을 막 시작했습니다. 다음 조회(1시간 간격)부터 변화가 기록됩니다." : "최근 7일간 기록된 큰 변화가 없습니다." })]);
  $("#view").replaceChildren(
    el("div", { class: "sec sm", text: `하이퍼리퀴드 공식 리더보드 상위 계정과 텔레그램·X에서 언급된 계정입니다. 1시간 간격으로 포지션을 다시 읽습니다. 마지막 조회 ${fmtTime(checked)} KST.` }),
    el("div", { class: "tiles" }, [tile("추적 계정", all.length + "개", "포지션 보유 " + all.filter(w => w.positions.length).length + "개"), tile("롱 합계", fmtUsd(totL), "추적 계정의 무기한 롱"), tile("숏 합계", fmtUsd(totS), "추적 계정의 무기한 숏"), tile("롱 비중", (totL + totS ? (totL / (totL + totS) * 100).toFixed(0) : "–") + "%", "명목 금액 기준")]),
    addr ? null : el("h3", { text: "코인별 롱·숏 합계 (추적 계정)" }),
    addr ? null : el("div", { class: "scroll" }, [el("table", {}, [th(["코인", "롱", "숏", "순(롱−숏)", "포지션 수"], [1, 2, 3, 4]), el("tbody", {}, coins.map(c => el("tr", {}, [el("td", {}, [el("a", { href: "#/chart/" + symKeyFor(c.coin.replace(/^k/, "").toUpperCase()), text: c.coin })]), el("td", { class: "num", text: fmtUsd(c.long) }), el("td", { class: "num", text: fmtUsd(c.short) }), el("td", { class: "num" }, [delta(c.long - c.short)]), el("td", { class: "num", text: c.n })])))])]),
    el("h3", { text: addr ? "이 계정의 최근 변화" : "최근 변화 (포지션 $1M 이상의 진입·종료·방향 전환·30% 이상 증감)" }), evBox,
    el("h3", { text: addr ? "계정" : "계정 목록" }), chips, grid, more);
  sortSel.value = F.sort; draw();
}

/* ------------------------------------------------------------------ router */
async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent), tab = parts[0] || "chart";
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  destroyChart(); closeModal();
  if (tab !== "docs" || parts.length < 3) $("#view").replaceChildren(el("div", { class: "loading", text: "불러오는 중…" }));
  try {
    if (tab === "chart") await viewChart(parts[1]);
    else if (tab === "docs") await viewDocs(parts[1], parts[2]);
    else if (tab === "wallets") await viewWallets(parts[1]);
    else if (tab === "images") await viewImages();
    else if (tab === "hunt") await viewHunt();
    else if (tab === "hl") await viewHL(parts[1]);
    else location.hash = "#/chart";
  } catch (e) {
    $("#view").replaceChildren(el("div", { class: "err", text: "화면을 표시하지 못했습니다: " + (e && e.message || e) }));
  }
}
window.addEventListener("hashchange", route);
window.addEventListener("error", e => { const v = $("#view"); if (v && !v.querySelector(".err")) v.prepend(el("div", { class: "err", text: "스크립트 오류: " + (e.message || e) })); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if ((location.hash || "#/chart").startsWith("#/chart")) route(); });
getJson("api/meta.json").then(m => { if (m && m.hunt) document.querySelectorAll('#nav a[hidden]').forEach(a => a.removeAttribute("hidden")); });
route();
