/*
 * ASISTEN REKON — MODE BACA
 * Muncul sendiri sebagai tombol "Asisten Rekon" di kanan bawah saat halaman
 * Kas & Bank > Rekonsiliasi Bank dibuka. Di halaman Accurate lain tombolnya disembunyikan.
 *
 * Yang dilakukan:   membaca kartu jurnal yang tampil, membaca file mutasi bank yang Anda pilih,
 *                   mencocokkan, lalu MEWARNAI kartu (hijau = pasti, kuning = saran) dan
 *                   menampilkan ringkasan di panel.
 * Yang TIDAK dilakukan: tidak mengklik tombol Accurate, tidak menyimpan, tidak mengirim data
 *                   ke mana pun. File mutasi hanya dibaca di browser ini.
 * Mematikan:        Tampermonkey > nonaktifkan "Asisten Rekon Bank".
 */
(() => {
'use strict';
if (window.__AR_ON__) { const b0 = document.getElementById('ar-launch'); if (b0) b0.click(); return; }
const VERSION = '1.3.2-beta';
// Fase 3 ("Centang semua hijau") hanya aktif di versi beta sampai disetujui untuk tim.
const BATCH = true;
let ackAll = false;
const DAY = 86400000;
const MONTHS = {jan:1,feb:2,peb:2,mar:3,apr:4,mei:5,may:5,jun:6,jul:7,agu:8,agt:8,ags:8,aug:8,sep:9,okt:10,oct:10,nov:11,nop:11,des:12,dec:12};
const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

/* ---------- pembaca angka & tanggal ---------- */
function mk(y, mo, d){ if(!(mo>=1&&mo<=12&&d>=1&&d<=31&&y>1900)) return null; return Date.UTC(y, mo-1, d); }
function parseDate(v, defYear, order){
  if (v instanceof Date && !isNaN(v)) { const t = new Date(v.getTime() + 12*3600e3); return Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()); }
  if (typeof v === 'number') { if (v > 20000 && v < 80000) return Math.round(v - 25569) * DAY; return null; }
  const s = String(v ?? '').trim().replace(/^['"`]+/, ''); if (!s) return null;
  let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if (m) return mk(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?(?![\d])/);
  if (m) { let y = m[3] ? +m[3] : defYear; if (y < 100) y += 2000; return order === 'mdy' ? mk(y, +m[1], +m[2]) : mk(y, +m[2], +m[1]); }
  m = s.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]{3,})\.?[\s\-\/]+(\d{2,4})/);
  if (m) { const mo = MONTHS[m[2].slice(0,3).toLowerCase()]; let y = +m[3]; if (y < 100) y += 2000; return mo ? mk(y, mo, +m[1]) : null; }
  return null;
}
function normInd(v){
  const s = String(v ?? '').trim().toUpperCase().replace(/[^A-Z]/g,'');
  if (!s) return null;
  if (/^(CR|C|K|KR|KREDIT|CREDIT)$/.test(s)) return 'CR';
  if (/^(DB|DR|D|DEBIT|DEBET)$/.test(s)) return 'DB';
  return null;
}
function parseAmount(v){
  if (typeof v === 'number') return {v: isFinite(v) ? Math.round(v*100) : null, flag:null};
  let s = String(v ?? '').trim(); if (!s) return {v:null, flag:null};
  let flag = null;
  const fm = s.match(/[\s\d](CR|DB|DR|D|K)\.?\s*$/i);
  if (fm) { flag = normInd(fm[1]); s = s.slice(0, fm.index + 1).trim(); }
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/^\s*(Rp\.?\s*)?-|-\s*$/i.test(s)) neg = true;
  if (/[A-Za-z]{2,}/.test(s.replace(/^Rp\.?/i, ''))) return {v:null, flag:null};
  s = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return {v:null, flag};
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  let dec = '';
  if (lc >= 0 && ld >= 0) dec = lc > ld ? ',' : '.';
  else if (lc >= 0) { const p = s.split(','); dec = (p.length === 2 && p[1].length !== 3) ? ',' : ''; }
  else if (ld >= 0) { const p = s.split('.'); dec = (p.length === 2 && p[1].length !== 3) ? '.' : ''; }
  let ip = s, fr = '';
  if (dec) { const i = s.lastIndexOf(dec); ip = s.slice(0, i); fr = s.slice(i+1); }
  ip = ip.replace(/[.,]/g, '');
  const n = Number(ip || '0') + (fr ? Number('0.' + fr) : 0);
  if (!isFinite(n)) return {v:null, flag};
  let c = Math.round(n*100); if (neg) c = -c;
  return {v:c, flag};
}
function parseCSV(text){
  const first = text.split(/\r?\n/).slice(0, 15).join('\n');
  const counts = {',':0, ';':0, '\t':0, '|':0};
  for (const ch of first) if (ch in counts) counts[ch]++;
  const delim = Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim()));
}

/* ---------- pembaca file mutasi bank ---------- */
const KW = {
  date:/^(tgl|tanggal|date|post(ing)? ?date|trans(action)? ?date|value date|tgl\.? ?trans)/i,
  desc:/keterangan|deskripsi|uraian|description|remark|berita|memo|narasi|detail/i,
  ref:/no\.? ?(bukti|ref|referensi|transaksi)|journal|^ref|referensi/i,
  bal:/saldo|balance/i,
  debit:/^(debit|debet|db|dr|mutasi debet|mutasi debit|keluar|penarikan|withdraw)$/i,
  credit:/^(kredit|credit|cr|mutasi kredit|masuk|setoran|deposit)$/i,
  amount:/^(mutasi|nominal|jumlah|amount|nilai)/i,
  ind:/^(d\/?k|db\/?cr|cr\/?db|d\/?c|dc|dk|tipe mutasi|debit\/credit)$/i
};
function detectHeader(rows){
  let best = 0, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    let sc = 0;
    for (const c of rows[i] || []) { const s = String(c ?? '').trim(); if (!s || s.length > 40) continue; for (const k in KW) if (KW[k].test(s)) { sc++; break; } }
    if (sc > bestScore) { bestScore = sc; best = i; }
  }
  return bestScore >= 2 ? best : 0;
}
function detectIndCol(rows, h, skip){
  let n = 0; for (let i = h + 1; i < Math.min(rows.length, h + 60); i++) n = Math.max(n, (rows[i] || []).length);
  for (let c = 0; c < n; c++) {
    if (skip.includes(c)) continue;
    let filled = 0, hits = 0;
    for (let i = h + 1; i < Math.min(rows.length, h + 60); i++) {
      const v = String((rows[i] || [])[c] ?? '').trim(); if (!v) continue;
      filled++; if (normInd(v)) hits++;
    }
    if (hits >= 3 && hits / filled >= 0.8) return c;
  }
  return -1;
}
function guessMap(rows, h){
  const head = (rows[h] || []).map(x => String(x ?? '').trim());
  const find = (re, not=[]) => head.findIndex((s, i) => s && re.test(s) && !not.includes(i));
  const m = {date:find(KW.date), desc:-1, ref:-1, in:-1, out:-1, amount:-1, ind:-1, bal:find(KW.bal)};
  const deb = find(KW.debit, [m.bal]), cre = find(KW.credit, [m.bal]);
  m.desc = find(KW.desc, [m.date, m.bal, deb, cre]);
  m.ref = find(KW.ref, [m.date, m.desc, m.bal, deb, cre]);
  let mode = 'split';
  if (deb >= 0 && cre >= 0) { m.in = cre; m.out = deb; }
  else {
    mode = 'single';
    m.amount = find(KW.amount, [m.bal, m.desc]);
    if (m.amount < 0) m.amount = deb >= 0 ? deb : cre;
    m.ind = find(KW.ind);
    if (m.ind < 0) m.ind = detectIndCol(rows, h, [m.date, m.desc, m.amount, m.bal, m.ref]);
  }
  if (m.date < 0) m.date = 0;
  return {map:m, mode};
}
function detectDateOrder(rows, h, c){
  const A = new Set(), B = new Set(); let aBig = false, bBig = false;
  for (let i = h + 1; i < Math.min(rows.length, h + 600); i++) {
    const v = (rows[i] || [])[c]; if (typeof v !== 'string') continue;
    const m = v.trim().replace(/^['"`]+/, '').match(/^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.]\d{2,4})?(?!\d)/); if (!m) continue;
    const a = +m[1], b = +m[2]; A.add(a); B.add(b); if (a > 12) aBig = true; if (b > 12) bBig = true;
  }
  if (aBig) return 'dmy';
  if (bBig) return 'mdy';
  return A.size === 1 && B.size > 1 ? 'mdy' : 'dmy';
}
function findAcctNo(rows, h){
  for (let i = 0; i < Math.max(h, 0) && i < 30; i++) for (const c of rows[i] || []) {
    const d = String(c ?? '').replace(/[\s\-.]/g, '').match(/\d{8,16}/);
    if (d && !/^20\d{6}$/.test(d[0])) return d[0];
  }
  return '';
}
const LABEL_RE = /^(saldo awal|saldo akhir|opening balance|closing balance|beginning balance|ending balance)\b/i;
function rowLabel(r){ for (const c of r) { const m = String(c ?? '').trim().match(LABEL_RE); if (m) return /awal|opening|beginning/i.test(m[1]) ? 'open' : 'close'; } return null; }
function lastNumber(r){ for (let i = r.length - 1; i >= 0; i--) { const s = r[i]; if (s === '' || s == null || LABEL_RE.test(String(s).trim())) continue; const p = parseAmount(s); if (p.v != null) return p.v; } return null; }

function parseBank(rows, defYear){
  const h = detectHeader(rows), {map:m, mode} = guessMap(rows, h);
  const order = detectDateOrder(rows, h, m.date);
  const yr = rows.slice(0, h).flat().join(' ').match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-](20\d\d)\b/);
  const y = yr ? +yr[1] : defYear;
  const recs = []; let open = null, close = null;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const lab = rowLabel(r);
    if (lab) { const v = lastNumber(r); if (v != null) { if (lab === 'open') { if (open == null) open = v; } else close = v; } continue; }
    const date = parseDate(r[m.date], y, order); if (date == null) continue;
    let amt = 0;
    if (mode === 'split') amt = Math.abs(parseAmount(r[m.in]).v || 0) - Math.abs(parseAmount(r[m.out]).v || 0);
    else {
      const p = parseAmount(r[m.amount]); if (p.v == null) continue;
      const ind = m.ind >= 0 ? normInd(r[m.ind]) : p.flag;
      amt = ind ? (ind === 'CR' ? Math.abs(p.v) : -Math.abs(p.v)) : p.v;
    }
    if (!amt) continue;
    recs.push({id:'b' + i, side:'bank', date, amt, desc: m.desc >= 0 ? String(r[m.desc] ?? '').trim() : '', ref: m.ref >= 0 ? String(r[m.ref] ?? '').trim() : '',
      bal: m.bal >= 0 ? parseAmount(r[m.bal]).v : null});
  }
  const wb = recs.filter(r => r.bal != null);
  if (wb.length) {
    const rev = recs.length > 1 && recs[0].date > recs[recs.length - 1].date;
    const f = rev ? wb[wb.length - 1] : wb[0], l = rev ? wb[0] : wb[wb.length - 1];
    if (open == null) open = f.bal - f.amt;
    if (close == null) close = l.bal;
  }
  return {recs, open, close, acctNo: findAcctNo(rows, h), header: (rows[h] || []).join(' | ')};
}

/* ---------- pencocokan ---------- */
const STOP = /^(TRSF|E-BANKING|BANKING|BANK|PEMBAYARAN|PENERIMAAN|BAYAR|TRANSFER|SETORAN|DARI|UNTUK|KEPADA|FTSCY|SWITCHING|KLIRING|JURNAL|UMUM|UTANG|PIUTANG|BEBAN|BIAYA|ADMIN|ADMINISTRASI|PAYMENT|FULL|CAMPAIGN|MARKETING|LAINNYA|INFLUENCER|INDONESIA|TRANSAKSI|ONLINE|KORSET|RORO|JONGGRANG|JONGGRAN|MATERNITY|NURSING|WEAR|OWNING|KONTEN|KONTE|AFFILIATE|REWARD|STREAMING|LIVE|PROJECT|JANUARI|FEBRUARI|MARET|APRIL|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER|PELUNASAN|\d{1,4})$/;
function tokens(s){ return (String(s).toUpperCase().match(/[A-Z0-9][A-Z0-9\-]{3,}/g) || []).filter(t => !STOP.test(t)); }
// Berita transfer = keterangan mutasi tanpa kode teknis bank (jenis transaksi, kode cabang/terminal,
// nomor referensi, nominal). Contoh: "TRSF E-BANKING DB - 2610/FTSCY/WS95321 BCA2610261435 DP Ranis" -> "DP RANIS".
function berita(desc){
  return String(desc || '').toUpperCase()
    .replace(/^(TRSF E-BANKING|BI-FAST|SWITCHING|KR OTOMATIS|BYR VIA E-BANKING|FLAZZ BCA|KARTU KREDIT|TRF|TRANSFER)\s*(DB|CR)?\s*-?\s*/, '')
    .replace(/\b\d{4}\/[A-Z]{5}\/[A-Z]{2}\d{5}\b/g, ' ')
    .replace(/\bBCA\d{8,}\b/g, ' ')
    .replace(/\bBIF (TRANSFER|BIAYA TXN) (KE|DR)\b|\bMBB\b|\/KPO BCA\b/g, ' ')
    .replace(/\b\d+([.,]\d+)*\b/g, ' ')
    .replace(/[-\/:]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// Nama perusahaan di mutasi yang sebenarnya merek marketplace.
const ALIAS = {ECART:'LAZADA', SHOPEEPAY:'SHOPEE', AIRPAY:'SHOPEE', TOKOPEDIA:'TOKOPEDIA', TIKTOK:'TIKTOK'};
// Berita "berisi" kalau ada kata yang bisa dibandingkan. Pembayaran Virtual Account (FTFVA) tidak membawa berita.
// Kata yang muncul di banyak transaksi bulan itu (mis. "KORSET", "RORO", "MATERNITY", "KOL") tidak
// membedakan apa pun, jadi tidak dihitung sebagai bukti kecocokan. Dihitung ulang setiap pencocokan.
let GENERIC = new Set();
const KEEP = /^(GAJI|PAYROLL|BPJS|PAJAK|PPH|PLN|LISTRIK|SEWA|LAZADA|SHOPEE|TOKOPEDIA|TIKTOK)$/;
function buildGeneric(bank, book){
  const df = docs => { const m = new Map(); docs.forEach(d => new Set(tokens(d)).forEach(t => m.set(t, (m.get(t) || 0) + 1))); return m; };
  const kb = df(book.map(k => k.desc)), bb = df(bank.map(b => berita(b.desc)));
  const limK = Math.max(2, book.length * 0.1), limB = Math.max(5, bank.length * 0.03);
  GENERIC = new Set();
  kb.forEach((n, t) => { if (n > limK && !KEEP.test(t)) GENERIC.add(t); });
  bb.forEach((n, t) => { if (n > limB && !KEEP.test(t)) GENERIC.add(t); });
}
function informative(b){
  if (/\/FTFVA\//i.test(b.desc)) return false;
  return tokens(berita(b.desc)).some(t => /[A-Z]{4,}/.test(t) && !GENERIC.has(t));
}
// Nama dicocokkan per kata utuh ("BANK" tidak cocok dengan "E-BANKING"); kata panjang boleh terpotong
// (bank sering memotong nama: "MAHARD" = "MAHARDIKA"). KlikBCA juga menyisipkan spasi di tengah kata
// ("transpor t", "Ning sih"), jadi kata ≥5 huruf dicari juga di berita yang spasinya dihapus.
function nameScore(bank, book){
  let full = String(bank.desc + ' ' + bank.ref).toUpperCase();
  for (const k in ALIAS) if (full.includes(k)) full += ' ' + ALIAS[k];
  const bw = full.match(/[A-Z0-9]+/g) || [];
  const squash = full.replace(/[^A-Z0-9]/g, '');
  let n = 0;
  for (const t of new Set(tokens(book.desc + ' ' + book.ref))) {
    if (GENERIC.has(t)) continue;
    if ((t.includes('-') && full.includes(t)) || bw.some(w => w === t || (w.length >= 5 && t.startsWith(w)) || (t.length >= 5 && w.startsWith(t)))
      || (t.length >= 5 && !/^\d+$/.test(t) && squash.includes(t))) n++;
  }
  return Math.min(n, 3);
}
function subset(cands, target, maxN, budget){
  const c = cands.slice().sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt));
  const a = c.map(x => Math.abs(x.amt)), T = Math.abs(target), n = a.length;
  const suf = new Array(n + 1).fill(0); for (let i = n - 1; i >= 0; i--) suf[i] = suf[i+1] + a[i];
  let res = null; const pick = [];
  const go = (i, sum) => {
    if (res || --budget < 0) return;
    if (sum === T) { if (pick.length >= 2) res = pick.map(j => c[j]); return; }
    if (i >= n || pick.length >= maxN || sum + suf[i] < T) return;
    for (let j = i; j < n && !res; j++) {
      if (sum + a[j] > T) continue;
      if (sum + suf[j] < T) break;
      pick.push(j); go(j + 1, sum + a[j]); pick.pop();
    }
  };
  go(0, 0);
  return res;
}
/* Biaya BI-FAST ("BIAYA TXN KE 009 NAMA") hanya boleh menempel ke transfer ke penerima yang sama
   ("TRANSFER KE 009 NAMA") di hari yang sama. Jurnal Accurate sering mencatat transfer + biaya sekaligus. */
function feeBundles(bank){
  const key = (r, kind) => { const m = String(r.desc).toUpperCase().match(new RegExp(kind + '\\s+KE\\s+(\\d{3}\\s+.+?)\\s+MBB')); return m ? m[1].replace(/\s+/g, ' ') : null; };
  const fees = bank.filter(r => key(r, 'BIAYA TXN')), out = [], taken = new Set();
  for (const t of bank) {
    const kt = key(t, 'TRANSFER'); if (!kt) continue;
    const f = fees.find(x => !taken.has(x.id) && x.date === t.date && key(x, 'BIAYA TXN') === kt && Math.sign(x.amt) === Math.sign(t.amt));
    if (!f) continue;
    taken.add(f.id);
    out.push({id:'fee:' + t.id, side:'bank', bundle:[t, f], date:t.date, amt:t.amt + f.amt, desc:t.desc + ' (+ biaya BI-FAST)', ref:''});
  }
  return out;
}
/* Hijau (pasti): 1 mutasi = 1 jurnal, nominal persis, tanggal ±3 hari, dan tidak ada kandidat lain
   dengan nominal sama di sekitarnya. Semua yang lain kuning (saran) dan harus dicek manusia.
   cutoff: mutasi bank s.d. tanggal ini dianggap sudah direkon mingguan; hanya dipakai sebagai pasangan
   untuk kartu yang masih tersisa, tidak dilaporkan sebagai "hanya bank". */
function classify(bank, book, cutoff){
  buildGeneric(bank, book);
  const used = new Set(), pasti = [], saran = [];
  const tol = 3 * DAY;
  const parts = b => b.bundle || [b];
  const free = b => parts(b).every(x => !used.has(x.id));
  const take = b => parts(b).forEach(x => used.add(x.id));
  const flat = list => list.flatMap(parts);
  const cands = bank.concat(feeBundles(bank));
  const pairs = [];
  for (const b of cands) for (const k of book) if (b.amt === k.amt) {
    const dd = Math.abs(b.date - k.date); if (dd <= 14 * DAY) pairs.push({b, k, dd, ns: nameScore(b, k)});
  }
  const near = pairs.filter(p => p.dd <= tol), cb = new Map(), ck = new Map();
  near.forEach(p => { cb.set(p.b.id, (cb.get(p.b.id) || 0) + 1); ck.set(p.k.id, (ck.get(p.k.id) || 0) + 1); });
  // Transfer tanpa biaya didahulukan; paket transfer+biaya hanya bila transfernya sendiri tidak pas.
  near.sort((x, y) => ((x.b.bundle ? 1 : 0) - (y.b.bundle ? 1 : 0)) || (x.dd / DAY - x.ns * 0.6) - (y.dd / DAY - y.ns * 0.6));
  for (const p of near) {
    if (!free(p.b) || used.has(p.k.id)) continue;
    take(p.b); used.add(p.k.id);
    const unique = cb.get(p.b.id) === 1 && ck.get(p.k.id) === 1;
    if (p.b.bundle) {
      if (unique && p.ns) pasti.push({b:p.b.bundle, k:[p.k], why:'Transfer + biaya BI-FAST ke penerima yang sama'});
      else saran.push({b:p.b.bundle, k:[p.k], why:'Transfer + biaya BI-FAST ke penerima yang sama' + (p.ns ? ' · nama mirip' : '')});
    } else if (!unique && p.ns && near.every(q => q === p || (q.k !== p.k && q.b !== p.b) || !q.ns)) {
      // Nominal kembar, tapi hanya pasangan ini yang namanya cocok (dari sisi bank maupun jurnal).
      pasti.push({b:[p.b], k:[p.k], why:'Nominal kembar, dipastikan lewat nama di berita transfer'});
    } else if (unique && (p.ns || !informative(p.b))) pasti.push({b:[p.b], k:[p.k], why: p.ns ? 'Nominal, tanggal & berita cocok' : 'Nominal & tanggal cocok (mutasi tanpa berita)'});
    else if (unique) saran.push({b:[p.b], k:[p.k], why:'Nominal sama, tapi berita transfer berbeda dengan keterangan jurnal'});
    else saran.push({b:[p.b], k:[p.k], why:'Ada nominal kembar di sekitar tanggal ini' + (p.ns ? ' · nama mirip' : ' · pastikan pasangannya')});
  }
  const left = () => [cands.filter(free), book.filter(x => !used.has(x.id))];
  // Gabungan: dengan kesamaan nama boleh banyak jurnal (±3 hari); tanpa kesamaan nama maksimal 3 jurnal di hari yang sama.
  let [ub, uk] = left();
  for (const s of ub.filter(b => !b.bundle).sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt))) {
    if (!free(s)) continue;
    const base = uk.filter(k => !used.has(k.id) && Math.sign(k.amt) === Math.sign(s.amt) && Math.abs(k.amt) < Math.abs(s.amt) && Math.abs(k.date - s.date) <= tol);
    if (base.length < 2) continue;
    const named = base.filter(k => nameScore(s, k) > 0), sameDay = base.filter(k => k.date === s.date);
    let f = null, why = '';
    if (named.length >= 2 && (f = subset(named, s.amt, 16, 150000))) why = `Transfer gabungan ${f.length} jurnal · nama mirip`;
    else if (sameDay.length >= 2 && (f = subset(sameDay, s.amt, 3, 60000))) why = `Transfer gabungan ${f.length} jurnal di hari yang sama`;
    if (!f) continue;
    take(s); f.forEach(x => used.add(x.id));
    saran.push({b:[s], k:f, why});
  }
  // 1 jurnal dibayar beberapa kali: semua mutasinya harus menyebut nama yang sama dengan jurnal.
  [ub, uk] = left();
  for (const k of uk.slice().sort((a, b) => Math.abs(b.amt) - Math.abs(a.amt))) {
    if (used.has(k.id)) continue;
    const base = flat(ub).filter(b => !used.has(b.id) && Math.sign(b.amt) === Math.sign(k.amt) && Math.abs(b.amt) < Math.abs(k.amt) && Math.abs(b.date - k.date) <= tol && nameScore(b, k) > 0);
    const f = base.length >= 2 ? subset(base, k.amt, 6, 60000) : null;
    if (!f) continue;
    f.forEach(x => used.add(x.id)); used.add(k.id);
    saran.push({b:f, k:[k], why:`1 jurnal dibayar ${f.length}× di bank · nama mirip`});
  }
  // Bagian dari transfer massal (mis. payroll): jurnal bernama sama dengan mutasi yang lebih besar, ±1 hari.
  // Sisa nominal mutasi itu dianggap milik jurnal yang sudah dicentang sebelumnya.
  [ub, uk] = left();
  for (const b of flat(ub).filter(x => !used.has(x.id)).sort((x, y) => Math.abs(y.amt) - Math.abs(x.amt))) {
    const ks = uk.filter(k => !used.has(k.id) && Math.sign(k.amt) === Math.sign(b.amt) && Math.abs(k.amt) < Math.abs(b.amt) && Math.abs(k.date - b.date) <= DAY && nameScore(b, k) > 0);
    const tot = ks.reduce((s, k) => s + Math.abs(k.amt), 0);
    if (!ks.length || tot > Math.abs(b.amt)) continue;
    used.add(b.id); ks.forEach(k => used.add(k.id));
    saran.push({b:[b], k:ks, partial:true, why:`Bagian dari transfer massal ${fmt(b.amt)} (sisa ${fmt(Math.sign(b.amt) * (Math.abs(b.amt) - tot))} kemungkinan sudah dicentang sebelumnya)`});
  }
  // Nominal sama tapi tanggal lebih jauh (s.d. 14 hari).
  for (const p of pairs.filter(p => !p.b.bundle).sort((x, y) => x.dd - y.dd)) {
    if (!free(p.b) || used.has(p.k.id)) continue;
    // Tanggal jauh DAN berita menyebut hal lain: hampir pasti transaksi berbeda, jangan disarankan.
    if (!p.ns && informative(p.b)) continue;
    take(p.b); used.add(p.k.id);
    saran.push({b:[p.b], k:[p.k], why:`Nominal sama, beda ${Math.round(p.dd / DAY)} hari${p.ns ? ' · nama mirip' : ''}`});
  }
  const rest = bank.filter(b => !used.has(b.id));
  const isOld = b => cutoff != null && b.date <= cutoff;
  return {pasti, saran, bankOnly: rest.filter(b => !isOld(b)), bankOld: rest.filter(isOld), bookOnly: book.filter(k => !used.has(k.id))};
}
function guessCat(r){
  const s = (r.desc + ' ' + r.ref).toUpperCase();
  if (/PAJAK|PPH|TAX/.test(s)) return 'Beban pajak bunga (PPh final)';
  if (/BUNGA|JASA GIRO|INTEREST/.test(s)) return 'Pendapatan bunga / jasa giro';
  if (/BIAYA|ADM|ADMIN|FEE|CHARGE|PROVISI|MATERAI|BI-?FAST|SKN|RTGS|TXN/.test(s)) return 'Beban administrasi bank';
  if (r.amt > 0) return 'Penerimaan belum dicatat: telusuri pengirimnya';
  return 'Pengeluaran belum dicatat: telusuri';
}

/* ---------- pembaca layar Accurate ---------- */
// Accurate membuka modul sebagai tab di dalam halaman; pakai halaman rekonsiliasi yang sedang terlihat.
const visibleRoot = () => [...document.querySelectorAll('.bank-reconcile-content')].find(e => e.offsetParent !== null) || null;
function readAccurate(){
  const root = visibleRoot();
  if (!root) return {error:'Halaman Rekonsiliasi Bank tidak ditemukan. Buka Kas & Bank → Rekonsiliasi Bank dulu.'};
  const cards = [...root.querySelectorAll('.panelreconcilenotmatche')];
  const recs = [], bad = [];
  cards.forEach((card, i) => {
    const lines = card.innerText.split('\n').map(s => s.trim()).filter(Boolean);
    const dl = lines.find(l => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(l));
    const al = lines.find(l => /^\((Cr|Dr)\)\s*[\d.,]+$/i.test(l));
    if (!dl || !al) { bad.push(i); return; }
    const am = al.match(/^\((Cr|Dr)\)\s*([\d.,]+)$/i), v = parseAmount(am[2]).v;
    const isRef = l => !/\s/.test(l) && /\d/.test(l) && /[.\-\/]/.test(l) && l !== dl && l.length < 40;
    // Nomor bukti (mis. JV.2026.10.86783) ada di baris bawah, di luar kotak kartu.
    const box = card.parentElement && card.parentElement.querySelectorAll('.panelreconcilenotmatche').length === 1 ? card.parentElement : card;
    const outer = box.innerText.split('\n').map(s => s.trim()).filter(Boolean);
    const ref = [...lines].reverse().find(isRef) || [...outer].reverse().find(isRef) || '';
    const desc = lines.filter(l => l !== dl && l !== al && l !== ref).join(' · ');
    let row = card, guard = 0;
    while (row.parentElement && guard++ < 10 && !row.querySelector('button[name="btnAddStatement"]')) row = row.parentElement;
    const btn = row.querySelector('button[name="btnAddStatement"]');
    const own = btn && row.querySelectorAll('.panelreconcilenotmatche').length === 1;
    recs.push({id:'k' + i, side:'book', card, box, btn: own ? btn : null, date: parseDate(dl, 2000, 'dmy'), amt: /dr/i.test(am[1]) ? v : -v, desc, ref});
  });
  const txt = root.innerText;
  const sm = txt.match(/Saldo\s+Rp\s*(-?[\d.,]+)/i);
  const pm = txt.match(/(\d+)\s+data belum cocok/i);
  // Accurate membuka modul lain (Histori Bank, Rekening Koran) sebagai tab tersembunyi yang juga punya
  // kotak rekening & tanggal: hanya baca yang sedang terlihat.
  const visible = e => e.offsetParent !== null;
  let acct = '';
  for (const e of document.querySelectorAll('span, div, li, a, label')) {
    if (e.children.length || e.closest('.panelreconcilenotmatche') || e.closest('#ar-panel') || !visible(e)) continue;
    const t = (e.textContent || '').trim();
    if (/\|\|\s*\d{6,}/.test(t) && t.length < 80) { acct = t; break; }
  }
  const dates = [...document.querySelectorAll('input')].filter(visible).map(x => x.value).filter(v => /^\d{2}\/\d{2}\/\d{4}$/.test(v));
  // Tampilan terbalik (Rekening Bank di kiri) memakai susunan kartu lain: jangan dicentang dari asisten.
  const up = txt.toUpperCase(), ij = up.indexOf('JURNAL ACCURATE'), ib = up.indexOf('REKENING BANK');
  const reversed = ij > -1 && ib > -1 && ib < ij;
  const more = findMore(root);
  return {recs, bad, saldo: sm ? parseAmount(sm[1]).v : null, pending: pm ? +pm[1] : null, acct, dateFrom: dates[0] || '', dateTo: dates[1] || '', reversed, hasMore: !!more};
}
// Tombol "Tampilkan Selanjutnya" milik Accurate (memuat kartu berikutnya; tidak mengubah data).
function findMore(root){
  const re = /^\s*Tampilkan Selanjutnya\s*$/i;
  const scope = root.parentElement || document;
  return [...scope.querySelectorAll('button, a, span, div')].find(e => e.offsetParent !== null && re.test(e.textContent || '') && ![...e.children].some(c => re.test(c.textContent || ''))) || null;
}

/* ---------- panel ---------- */
const fmt = c => c == null ? '—' : (c < 0 ? '−' : '') + (Math.abs(c) / 100).toLocaleString('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2});
const fd = t => { const d = new Date(t); return `${String(d.getUTCDate()).padStart(2,'0')} ${BULAN[d.getUTCMonth()]}`; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sum = a => a.reduce((s, r) => s + r.amt, 0);
let bankData = null, result = null, acc = null;
/* ---------- Fase 2: centang satu per satu ----------
   Asisten hanya menekan tombol asli "Ada di Rekening Koran" milik Accurate (alur Accurate tetap
   berlaku, termasuk dialog konfirmasinya), satu kartu hijau setiap kali, setelah dua kali klik
   di panel. Setelah itu asisten menunggu sampai Accurate benar-benar menandai kartu itu;
   kalau tidak terjadi dalam 60 detik, asisten berhenti dan tidak mengklik apa pun lagi. */
let busy = false, halted = '', armed = -1, armTimer = null;
const LOG_KEY = 'asisten-rekon-log';
function readLog(){ try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch (e) { return []; } }
function addLog(x){ try { const l = readLog(); l.push(x); localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(-500))); } catch (e) {} }
const sessionLog = [];
// Mutasi bank yang sudah dipakai untuk mencentang diingat (per rekening, di browser ini), supaya tidak
// muncul lagi sebagai "hanya bank" atau dipasangkan ke jurnal lain setelah kartunya hilang dari layar.
const usedKey = () => 'asisten-rekon-usedbank:' + ((acc && acc.acct) || '');
function getUsed(){ try { return new Set(JSON.parse(localStorage.getItem(usedKey()) || '[]')); } catch (e) { return new Set(); } }
function addUsed(list){ try { const s = getUsed(); list.forEach(b => s.add(b.sig)); localStorage.setItem(usedKey(), JSON.stringify([...s].slice(-3000))); } catch (e) {} }
function signBank(recs){ const seen = {}; recs.forEach(r => { const base = `${r.date}|${r.amt}|${r.desc}`; seen[base] = (seen[base] || 0) + 1; r.sig = base + '#' + seen[base]; }); }
function waitFor(test, ms){
  return new Promise(res => { const t0 = Date.now(); const iv = setInterval(() => { let ok = false; try { ok = test(); } catch (e) {} if (ok || Date.now() - t0 > ms) { clearInterval(iv); res(ok); } }, 400); });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let batch = null, stopBatch = false, clickedOnce = false;
// Satu centang: cari ulang kartunya di layar (daftar Accurate bisa digambar ulang setelah centang
// sebelumnya), periksa isinya masih sama, tekan tombol aslinya, lalu tunggu Accurate menandainya.
async function tickOne(g){
  const k0 = g.k[0];
  if (acc && acc.reversed) { halted = 'Tampilan Rekonsiliasi Bank sedang terbalik (Rekening Bank di kiri). Kembalikan ke Jurnal Accurate di kiri, lalu Baca ulang.'; return false; }
  const fresh = readAccurate();
  const k = (fresh.recs || []).find(x => x.amt === k0.amt && x.date === k0.date && (k0.ref ? x.ref === k0.ref : x.desc === k0.desc));
  if (!k || !k.btn || !k.btn.isConnected || k.btn.offsetParent === null) { halted = `Kartu ${k0.ref || ''} ${fmt(k0.amt)} tidak ditemukan lagi di layar. Klik "Baca ulang Accurate" dulu.`; return false; }
  // Kartu + baris nomor bukti di bawahnya (nomor bukti berada di luar kotak kartu).
  const txt = (k.box && k.box.isConnected ? k.box : k.card).innerText;
  const amtTxt = (Math.abs(k.amt) / 100).toLocaleString('id-ID', {maximumFractionDigits:2});
  if ((k0.ref && !txt.includes(k0.ref)) || !txt.replace(/\s/g, '').includes(amtTxt.replace(/\s/g, ''))) { halted = 'Isi kartu tidak sama dengan saat dicocokkan. Klik "Baca ulang Accurate" dulu.'; return false; }
  k.card.scrollIntoView({block:'center', behavior:'smooth'});
  k.btn.click();
  // Klik pertama di sesi ini menunggu dialog konfirmasi Accurate, jadi diberi waktu lebih lama.
  const ok = await waitFor(() => !k.btn.isConnected || k.btn.offsetParent === null || !k.card.isConnected, clickedOnce ? 30000 : 60000);
  if (!ok) { halted = `Accurate belum menandai ${k0.ref || 'kartu'} (mungkin dialog konfirmasi dibatalkan atau ada pesan error). Asisten berhenti mengklik. Periksa kartunya, lalu klik "Baca ulang Accurate" untuk melanjutkan.`; return false; }
  clickedOnce = true;
  const entry = {waktu: new Date().toISOString(), rekening: acc.acct, noBukti: k0.ref || k0.desc.slice(0, 30), tanggal: fd(k0.date), nominal: fmt(k0.amt), keterangan: k0.desc.slice(0, 80),
    alasan: g.why, mutasiBank: g.b.map(b => `${fd(b.date)} ${fmt(b.amt)} ${b.desc.slice(0, 80)}`).join(' + '), sigs: g.b.map(b => b.sig)};
  sessionLog.push(entry); addLog(entry); addUsed(g.b);
  return true;
}
async function tickCard(i){
  if (busy || halted || !result) return;
  const g = result.pasti[i]; if (!g || g.k.length !== 1) return;
  busy = true; render();
  const ok = await tickOne(g);
  busy = false;
  if (ok) setTimeout(run, 1200); else render();
}
// Fase 3 (hanya di versi beta): semua kartu hijau dicentang berurutan, berhenti di kartu pertama yang janggal.
async function tickAll(){
  if (busy || halted || !result) return;
  const list = result.pasti.filter(g => g.k.length === 1 && g.k[0].btn);
  if (!list.length) return;
  busy = true; stopBatch = false; batch = {done:0, total:list.length}; render();
  for (const g of list) {
    if (stopBatch) break;
    if (!(await tickOne(g))) break;
    batch.done++; render();
    await sleep(700);
  }
  infoNote = stopBatch ? `Dihentikan setelah ${batch.done} dari ${batch.total} kartu.` : (halted ? '' : `${batch.done} kartu hijau tercentang.`);
  batch = null; busy = false; stopBatch = false;
  render();
  setTimeout(run, 1200);
}
// Klik "Tampilkan Selanjutnya" berulang sampai semua kartu belum cocok termuat. Tidak mengubah data.
async function loadAll(){
  if (busy) return;
  const root = visibleRoot(); if (!root) return;
  busy = true; batch = {loading:true}; render();
  for (let i = 0; i < 80; i++) {
    const a0 = readAccurate();
    if (a0.pending != null && a0.recs.length >= a0.pending) break;
    const more = findMore(root); if (!more) break;
    const before = root.querySelectorAll('.panelreconcilenotmatche').length;
    more.click();
    if (!(await waitFor(() => root.querySelectorAll('.panelreconcilenotmatche').length > before, 20000))) break;
    await sleep(300);
  }
  batch = null; busy = false; run();
}
let infoNote = '';
// "Rekon terakhir sampai tanggal" diingat per rekening di browser ini (format yyyy-mm-dd).
const cutKey = () => 'asisten-rekon-cutoff:' + ((acc && acc.acct) || '');
function getCut(){ try { return localStorage.getItem(cutKey()) || ''; } catch (e) { return ''; } }
function setCut(v){ try { if (v) localStorage.setItem(cutKey(), v); else localStorage.removeItem(cutKey()); } catch (e) {} }
function cutTs(){ const v = getCut(); const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }

function css(){
  if (document.getElementById('ar-style')) return;
  const st = document.createElement('style'); st.id = 'ar-style';
  st.textContent = `
  #ar-panel{position:fixed;right:16px;bottom:16px;width:420px;max-height:82vh;overflow:auto;z-index:99999;background:#fff;color:#17201c;border:1px solid #c9d3ce;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
  #ar-panel .h{position:sticky;top:0;background:#1d5c4f;color:#fff;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;border-radius:10px 10px 0 0}
  #ar-panel .h b{font-size:14px} #ar-panel .h span{font-size:11px;background:#fff3;padding:2px 7px;border-radius:9px}
  #ar-panel .b{padding:12px;display:flex;flex-direction:column;gap:12px}
  #ar-panel button{font:inherit;border:1px solid #1d5c4f;background:#1d5c4f;color:#fff;border-radius:6px;padding:6px 10px;cursor:pointer}
  #ar-panel button.q{background:#fff;color:#1d5c4f}
  #ar-panel .row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  #ar-panel .chk{display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #eef1ef}
  #ar-panel .ok{color:#277447;font-weight:600} #ar-panel .bad{color:#ad342d;font-weight:600} #ar-panel .warn{color:#8d5a0c;font-weight:600}
  #ar-panel .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  #ar-panel .tile{border-radius:8px;padding:6px 8px;background:#f2f4f2} #ar-panel .tile b{display:block;font-size:17px}
  #ar-panel .t-ok{background:#ddf0e3} #ar-panel .t-sr{background:#fbefcf} #ar-panel .t-b{background:#f7e1df}
  #ar-panel h4{margin:0 0 4px;font-size:13px}
  #ar-panel .it{padding:6px 8px;border:1px solid #e3e8e5;border-radius:6px;margin-top:4px;cursor:pointer}
  #ar-panel .it:hover{background:#f6f8f7}
  #ar-panel .it small{color:#5a6761} #ar-panel .n{font-family:ui-monospace,Menlo,monospace;white-space:nowrap}
  #ar-panel .rl{display:flex;justify-content:space-between;gap:8px;padding:2px 0} #ar-panel .rl.t{border-top:1px solid #17201c;font-weight:700;margin-top:2px}
  #ar-panel .note{background:#f2f4f2;border-radius:6px;padding:8px;color:#4a5751;font-size:12px}
  .ar-ok,.ar-sr,.ar-no{position:relative !important;border-radius:6px}
  .ar-ok{box-shadow:0 0 0 4px #1f9d55, inset 10px 0 0 #1f9d55 !important}
  .ar-sr{box-shadow:0 0 0 4px #f0a500, inset 10px 0 0 #f0a500 !important}
  .ar-no{box-shadow:0 0 0 4px #d64541, inset 10px 0 0 #d64541 !important}
  .ar-ok{background-color:#cdf3d9 !important} .ar-sr{background-color:#ffeab3 !important} .ar-no{background-color:#fcdcda !important}
  .ar-ok *,.ar-sr *,.ar-no *{background-color:transparent !important}
  .ar-ok::after,.ar-sr::after,.ar-no::after{content:attr(data-ar);position:absolute;right:10px;bottom:8px;max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:4px 12px;border-radius:14px;font:700 12.5px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;z-index:3;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,.2)}
  .ar-ok::after{background:#1f9d55} .ar-sr::after{background:#c98400} .ar-no::after{background:#d64541}
  #ar-launch{position:fixed;right:16px;bottom:16px;z-index:99999;border:0;border-radius:22px;padding:10px 16px;background:#1d5c4f;color:#fff;font:600 13px system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.2);cursor:pointer}
  .ar-flash{animation:arf .7s 4}@keyframes arf{50%{box-shadow:0 0 0 12px rgba(29,92,79,.55) !important}}`;
  document.head.appendChild(st);
}
function clearMarks(){ document.querySelectorAll('.ar-ok,.ar-sr,.ar-no').forEach(e => { e.classList.remove('ar-ok','ar-sr','ar-no'); e.removeAttribute('data-ar'); }); }
function mark(){
  clearMarks(); if (!result) return;
  // Ditandai di kotak luar (kartu + baris no. bukti) supaya bingkai dan label tidak terpotong.
  const tag = (k, cls, text) => { const t = target(k); t.classList.add(cls); t.setAttribute('data-ar', text); };
  result.pasti.forEach(g => g.k.forEach(k => tag(k, 'ar-ok', `✓ PASTI · bank ${fd(g.b[0].date)} · ${shortB(g.b[0]).slice(0, 40)}`)));
  result.saran.forEach(g => g.k.forEach(k => tag(k, 'ar-sr', `? CEK · ${g.why}`)));
  result.bookOnly.forEach(k => tag(k, 'ar-no', '✕ BELUM DI BANK'));
}
const target = k => (k.box && k.box.isConnected ? k.box : k.card);
// Baris mutasi bank di panel: berita transfer ditonjolkan, keterangan lengkap muncul saat mouse diarahkan.
const shortB = b => { const t = berita(b.desc); return t || b.desc; };
const bankLine = b => `<div class="rl" title="${esc(b.desc)}"><span>Bank ${fd(b.date)} · <b>${esc(shortB(b).slice(0, 70))}</b>${/\/FTFVA\//i.test(b.desc) ? ' <small>(VA, tanpa berita)</small>' : ''}</span><span class="n">${fmt(b.amt)}</span></div>`;
// Gulir ke kartu di daftar Accurate dan buat berkedip.
function goTo(k){
  if (!k) return;
  const t = target(k); if (!t || !t.isConnected) return;
  t.scrollIntoView({block:'center', behavior:'smooth'});
  t.classList.remove('ar-flash'); void t.offsetWidth; t.classList.add('ar-flash');
  setTimeout(() => t.classList.remove('ar-flash'), 3000);
}
function run(){
  acc = readAccurate();
  if (acc.error || !bankData) { result = null; clearMarks(); render(); return; }
  // Rekening di layar diganti tapi file mutasinya masih rekening lain: jangan cocokkan apa pun.
  const accDigits = (acc.acct.match(/\d{6,}/) || [''])[0];
  if (bankData.acctNo && accDigits && bankData.acctNo !== accDigits) { result = null; clearMarks(); render(); return; }
  // Kartu yang pernah dicentang asisten tapi muncul lagi di layar berarti centangnya dibatalkan
  // (mis. lewat Histori Bank): tandai di riwayat dan lepaskan mutasinya supaya dicocokkan ulang.
  const onScreen = new Set(acc.recs.map(k => k.ref).filter(Boolean));
  const undone = sessionLog.filter(e => !e.batal && e.noBukti && onScreen.has(e.noBukti));
  if (undone.length) {
    undone.forEach(e => { e.batal = true; addLog({...e, waktu: new Date().toISOString(), catatan: 'dibatalkan di Accurate'}); });
    try { const s = getUsed(); undone.forEach(e => (e.sigs || []).forEach(x => s.delete(x))); localStorage.setItem(usedKey(), JSON.stringify([...s])); } catch (e) {}
  }
  const usedSet = getUsed();
  const fresh = bankData.recs.filter(b => !usedSet.has(b.sig));
  result = classify(fresh, acc.recs, cutTs());
  result.preUsed = bankData.recs.length - fresh.length;
  mark(); render();
}
function render(){
  let p = document.getElementById('ar-panel');
  if (!p) { p = document.createElement('div'); p.id = 'ar-panel'; document.body.appendChild(p); }
  const a = acc || readAccurate();
  let body = '';
  if (a.error) body = `<div class="note bad">${esc(a.error)}</div>`;
  else {
    const accDigits = (a.acct.match(/\d{6,}/) || [''])[0];
    const checks = [
      ['Rekening di Accurate', a.acct ? esc(a.acct) : '<span class="warn">tidak terbaca</span>'],
      ['Periode di Accurate', `${esc(a.dateFrom)} s/d ${esc(a.dateTo)}`],
      ['Kartu jurnal terbaca', a.pending != null && a.pending > a.recs.length
        ? `<span class="bad">${a.recs.length} dari ${a.pending}</span> <button class="q" id="ar-loadall" style="padding:1px 6px" ${busy ? 'disabled' : ''}>${batch && batch.loading ? 'Memuat…' : 'Muat semua kartu'}</button>`
        : `<span class="ok">${a.recs.length}${a.pending != null ? ' dari ' + a.pending : ''}</span>`],
      ['Kartu tanpa tombol pasangan', a.recs.filter(r => !r.btn).length ? `<span class="warn">${a.recs.filter(r => !r.btn).length}</span>` : '<span class="ok">0</span>'],
      ['Saldo buku (layar Accurate)', fmt(a.saldo)]
    ];
    if (bankData) {
      const ds = bankData.recs.map(r => r.date);
      checks.push(['File mutasi', `${esc(bankData.name)} · ${bankData.recs.length} transaksi · ${fd(Math.min(...ds))}–${fd(Math.max(...ds))}`]);
      checks.push(['No. rekening di file', !bankData.acctNo ? '<span class="warn">tidak ada di file</span>'
        : bankData.acctNo === accDigits ? `<span class="ok">${bankData.acctNo} ✓ sama</span>` : `<span class="bad">${bankData.acctNo} ✕ BERBEDA dengan Accurate</span>`]);
      checks.push(['Saldo bank (file)', `${fmt(bankData.open)} → ${fmt(bankData.close)}`]);
      checks.push(['Rekon mingguan terakhir s.d.', `<input type="date" id="ar-cut" value="${esc(getCut())}" style="font:inherit;padding:2px 4px;border:1px solid #c9d3ce;border-radius:4px">`]);
    }
    body += `<div>${checks.map(([k, v]) => `<div class="chk"><span>${k}</span><span style="text-align:right">${v}</span></div>`).join('')}</div>`;
    // Peringatan yang menentukan benar/tidaknya hasil: tampilan terbalik, kartu belum termuat, rentang tanggal.
    const warns = [];
    if (a.reversed) warns.push('Tampilan sedang terbalik (Rekening Bank di kiri). Asisten hanya bekerja dengan Jurnal Accurate di kiri; centang dinonaktifkan.');
    if (a.pending != null && a.pending > a.recs.length) warns.push(`Baru ${a.recs.length} dari ${a.pending} kartu yang termuat. Klik <b>Muat semua kartu</b> sebelum mencentang, supaya pasangan tidak salah.`);
    if (bankData) {
      const pd = s => { const m = String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null; };
      const f0 = Math.min(...bankData.recs.map(r => r.date)), f1 = Math.max(...bankData.recs.map(r => r.date));
      const a0 = pd(a.dateFrom), a1 = pd(a.dateTo);
      if (a1 != null && a1 < f1) warns.push(`Tanggal akhir di Accurate (${esc(a.dateTo)}) lebih awal dari mutasi terakhir di file (${fd(f1)}). Jurnal setelah ${esc(a.dateTo)} tidak tampil, jadi mutasinya terbaca "hanya bank". Samakan tanggal akhirnya.`);
      if (a0 != null && a0 > f0 && !(cutTs() != null && cutTs() >= a0 - DAY)) warns.push(`Tanggal awal di Accurate (${esc(a.dateFrom)}) lebih lambat dari awal file (${fd(f0)}). Mundurkan tanggal awal (mis. awal tahun) agar jurnal lama yang belum cocok ikut tampil.`);
    }
    if (warns.length) body += warns.map(w => `<div class="note warn">${w}</div>`).join('');
    body += `<div class="row"><button id="ar-file">${bankData ? 'Ganti file mutasi' : 'Pilih file mutasi bank'}</button><button class="q" id="ar-reload">Baca ulang Accurate</button></div>`;
    if (!bankData) body += `<div class="note">Pilih file mutasi dari internet banking (KlikBCA Bisnis / BNIDirect), bukan laporan Accurate. Isinya cukup hari-hari yang <b>belum</b> direkon (sejak rekon mingguan terakhir). File hanya dibaca di browser ini.</div>`;
  }
  if (result && !a.error) {
    const r = result, nS = r.saran.reduce((s, g) => s + g.k.length, 0), nP = r.pasti.length;
    body += `<div class="tiles"><div class="tile t-ok">Pasti<b>${nP}</b></div><div class="tile t-sr">Saran<b>${nS}</b></div><div class="tile t-b">Hanya bank<b>${r.bankOnly.length}</b></div><div class="tile">Hanya Accurate<b>${r.bookOnly.length}</b></div></div>
      <div class="note">Kartu hijau = pasangan pasti, bisa dicentang dari daftar di bawah (satu per satu). Kuning = saran: periksa, lalu klik sendiri di Accurate bila benar. Merah putus-putus = belum ada di bank, biarkan.</div>
      ${halted ? `<div class="note bad">${esc(halted)}</div>` : ''}
      ${infoNote && !busy ? `<div class="note ok">${esc(infoNote)}</div>` : ''}
      ${batch && batch.total ? `<div class="note"><b>Mencentang ${batch.done} dari ${batch.total}…</b> Jangan menutup atau mengganti tab. <button class="q" id="ar-stop" style="padding:1px 8px">Hentikan</button></div>` : ''}
      ${r.preUsed ? `<div class="note">${r.preUsed} mutasi bank sudah dipakai untuk mencentang lewat asisten, jadi tidak dicocokkan lagi. Kalau centangnya dibatalkan di Accurate, klik <button class="q" id="ar-forget" style="padding:1px 6px">Lupakan</button> supaya mutasinya dicocokkan ulang.</div>` : ''}
      ${r.bankOld.length ? `<div class="note">${r.bankOld.length} mutasi s.d. ${esc(getCut())} tidak punya pasangan di layar dan dianggap <b>sudah direkon sebelumnya</b>, jadi tidak dihitung.</div>`
        : (!getCut() && r.bankOnly.length > 30 ? `<div class="note warn">Banyak mutasi "hanya bank". Kalau tim sudah rekon mingguan, isi tanggal <b>Rekon mingguan terakhir s.d.</b> di atas.</div>` : '')}`;
    const item = (g, i, kind) => `<div class="it" data-go="${kind}:${i}"><small>${esc(g.why)}</small>
      ${g.b.map(bankLine).join('')}
      ${g.k.map(k => `<div class="rl"><span>Accurate ${fd(k.date)} · ${esc(k.ref || k.desc.slice(0, 40))}</span><span class="n">${fmt(k.amt)}</span></div>`).join('')}</div>`;
    const canTick = !busy && !halted && !a.reversed && !(a.pending != null && a.pending > a.recs.length);
    const nAll = r.pasti.filter(g => g.k.length === 1 && g.k[0].btn).length, totAll = r.pasti.reduce((s, g) => s + g.k[0].amt, 0);
    if (r.pasti.length) body += `<div><h4>Siap dicentang · pasti (${r.pasti.length})</h4>
      <div class="note">Klik <b>Centang</b>, lalu klik sekali lagi untuk yakin. Klik pertama di sesi ini memunculkan konfirmasi dari Accurate: pilih Ya/OK di sana.</div>
      ${BATCH && nAll > 1 ? `<div class="note" style="background:#e7f4ec"><label style="display:flex;gap:6px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="ar-ack" ${ackAll ? 'checked' : ''} ${canTick ? '' : 'disabled'}> <span>Saya sudah memeriksa daftar hijau di bawah dan kartu hijau di layar Accurate.</span></label>
        <div class="row" style="margin-top:6px"><button id="ar-tickall" ${canTick && ackAll ? '' : 'disabled style="opacity:.5"'}>Centang semua hijau (${nAll} · ${fmt(totAll)})</button></div>
        <small>Dicentang satu per satu secara berurutan dan berhenti di kartu pertama yang janggal.</small></div>` : ''}
      ${r.pasti.map((g, i) => { const k = g.k[0], live = canTick;
        return `<div class="it" data-go="p:${i}" title="Klik untuk menampilkan kartunya di Accurate"><small>${esc(g.why)} · klik untuk lihat kartu</small>
        ${g.b.map(bankLine).join('')}
        <div class="rl"><span>Accurate ${fd(k.date)} · ${esc(k.ref || k.desc.slice(0, 40))}</span><span class="n">${fmt(k.amt)}</span></div>
        <div class="row" style="justify-content:flex-end;margin-top:4px">${k.btn ? `<button data-tick="${i}" ${live ? '' : 'disabled'} style="${live ? '' : 'opacity:.5'}">${armed === i ? `Yakin centang ${esc(k.ref || '')} ${fmt(k.amt)}?` : (busy ? 'Menunggu Accurate…' : 'Centang di Accurate')}</button>` : '<small class="warn">Tombol Accurate tidak ditemukan untuk kartu ini</small>'}</div></div>`; }).join('')}</div>`;
    if (sessionLog.length) body += `<div><h4>Sudah dicentang sesi ini (${sessionLog.filter(e => !e.batal).length})</h4>${sessionLog.map(e => e.batal
        ? `<div class="rl" style="color:#8d5a0c"><span>↩ <s>${esc(e.noBukti)}</s> · dibatalkan di Accurate</span><span class="n"><s>${esc(e.nominal)}</s></span></div>`
        : `<div class="rl"><span>✓ ${esc(e.noBukti)} · ${esc(e.tanggal)}</span><span class="n">${esc(e.nominal)}</span></div>`).join('')}
      <div class="note" style="margin-top:6px">Salah centang? Buka Kas &amp; Bank → <b>Histori Bank</b>, cari no. bukti di atas, klik tanda ✓ di kolom # untuk membatalkan. Saat kembali ke sini, asisten mendeteksi pembatalannya sendiri.</div></div>`;
    if (r.saran.length) body += `<div><h4>Saran untuk dicek (${r.saran.length})</h4>${r.saran.map((g, i) => item(g, i, 's')).join('')}</div>`;
    if (r.bookOnly.length) body += `<div><h4>Belum ada di mutasi bank (${r.bookOnly.length}): biarkan</h4>${r.bookOnly.map((k, i) => `<div class="it" data-go="n:${i}" title="Klik untuk menampilkan kartunya di Accurate"><div class="rl"><span>Accurate ${fd(k.date)} · ${esc(k.ref || k.desc.slice(0, 40))}</span><span class="n">${fmt(k.amt)}</span></div></div>`).join('')}</div>`;
    if (r.bankOnly.length) body += `<div><h4>Hanya di mutasi bank (${r.bankOnly.length}): perlu jurnal di Accurate</h4>${r.bankOnly.map(b => `<div class="it">${bankLine(b)}<small>Usulan: ${esc(guessCat(b))}</small></div>`).join('')}</div>`;
    if (bankData.close != null && a.saldo != null) {
      const adjB = bankData.close + sum(r.bookOnly), adjK = a.saldo + sum(r.bankOnly), diff = adjB - adjK;
      body += `<div><h4>Rekonsiliasi (dengan asumsi semua saran benar)</h4>
        <div class="rl"><span>Saldo bank (file)</span><span class="n">${fmt(bankData.close)}</span></div>
        <div class="rl"><span>+/− pos belum di bank (${r.bookOnly.length})</span><span class="n">${fmt(sum(r.bookOnly))}</span></div>
        <div class="rl t"><span>Bank disesuaikan</span><span class="n">${fmt(adjB)}</span></div>
        <div class="rl"><span>Saldo buku (Accurate)</span><span class="n">${fmt(a.saldo)}</span></div>
        <div class="rl"><span>+/− pos hanya di bank (${r.bankOnly.length})</span><span class="n">${fmt(sum(r.bankOnly))}</span></div>
        <div class="rl t"><span>Buku disesuaikan</span><span class="n">${fmt(adjK)}</span></div>
        <div class="rl t"><span>Selisih</span><span class="n ${diff === 0 ? 'ok' : 'bad'}">${diff === 0 ? 'Seimbang · 0,00' : fmt(diff)}</span></div>
        ${diff === 0 ? '' : `<div class="note">Selisih biasanya berarti: file mutasi memuat hari yang sudah direkon sebelumnya (jurnalnya sudah dicentang sehingga tidak tampil di layar), tanggal akhir di Accurate berbeda dengan tanggal akhir file, atau tanggal awal di Accurate kurang mundur sehingga pos lama tidak tampil.</div>`}</div>`;
    }
    body += `<div class="row"><button class="q" id="ar-export">Unduh kertas kerja (CSV)</button><button class="q" id="ar-copy">Salin hasil untuk Claude</button></div>`;
  }
  p.innerHTML = `<div class="h"><b>Asisten Rekon <small style="font-weight:400;opacity:.8">v${VERSION}</small></b><span>${BATCH ? 'BETA · centang semua' : 'centang satu per satu'}</span><button class="q" id="ar-close" style="padding:2px 8px">×</button></div><div class="b">${body}</div>`;
  const on = (id, fn) => { const e = p.querySelector('#' + id); if (e) e.onclick = fn; };
  on('ar-close', () => { clearMarks(); p.remove(); });
  on('ar-reload', () => { halted = ''; run(); });
  on('ar-forget', () => { try { localStorage.removeItem(usedKey()); } catch (e) {} run(); });
  on('ar-file', pickFile);
  on('ar-copy', copyResult);
  on('ar-export', exportCsv);
  on('ar-loadall', loadAll);
  on('ar-stop', () => { stopBatch = true; });
  on('ar-tickall', () => { if (ackAll) { ackAll = false; infoNote = ''; tickAll(); } });
  const ack = p.querySelector('#ar-ack'); if (ack) ack.onchange = () => { ackAll = ack.checked; render(); };
  p.querySelectorAll('[data-tick]').forEach(el => el.onclick = ev => {
    ev.stopPropagation();
    const i = +el.dataset.tick;
    if (armed !== i) { armed = i; clearTimeout(armTimer); armTimer = setTimeout(() => { armed = -1; render(); }, 5000); render(); goTo(result.pasti[i] && result.pasti[i].k[0]); return; }
    armed = -1; clearTimeout(armTimer); tickCard(i);
  });
  const cutIn = p.querySelector('#ar-cut'); if (cutIn) cutIn.onchange = () => { setCut(cutIn.value); run(); };
  p.querySelectorAll('[data-go]').forEach(el => el.onclick = () => {
    const [kind, i] = el.dataset.go.split(':');
    const k = kind === 's' ? (result.saran[+i] || {k:[]}).k[0] : kind === 'p' ? (result.pasti[+i] || {k:[]}).k[0] : result.bookOnly[+i];
    goTo(k);
  });
}
function pickFile(){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.txt,.xlsx,.xls';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      let rows;
      if (/\.(csv|txt)$/i.test(f.name)) rows = parseCSV(await f.text());
      else {
        if (!window.XLSX) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
          // Dikunci ke isi file yang sudah diperiksa: kalau file di CDN berubah, browser menolak menjalankannya.
          s.integrity = 'sha512-r22gChDnGvBylk90+2e/ycr3RVrDi8DIOkIGNhJlKfuyQM4tIRAI062MaV8sfjQKYVGjOBaZBOA87z+IhZE9DA=='; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = () => no(new Error('Pembaca Excel tidak bisa dimuat di halaman ini. Simpan file sebagai CSV lalu coba lagi.')); document.head.appendChild(s); });
        const wb = XLSX.read(await f.arrayBuffer(), {type:'array', cellDates:true});
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, raw:true, defval:''});
      }
      const a = readAccurate(), y = a.dateTo ? +a.dateTo.slice(6) : new Date().getFullYear();
      const pb = parseBank(rows, y);
      if (/no\.? ?bukti|nama perkiraan|kode #|tipe transaksi|no\.? ?sumber/i.test(pb.header))
        throw new Error('File ini adalah laporan dari Accurate (Histori Buku Besar), bukan mutasi bank. Sisi Accurate sudah dibaca langsung dari layar. Pilih file mutasi yang diunduh dari KlikBCA Bisnis / BNIDirect.');
      if (!pb.recs.length) throw new Error('Tidak ada transaksi terbaca. Judul kolom yang terbaca: ' + pb.header);
      if (!pb.acctNo) { const m = f.name.match(/\d{8,16}/); if (m) pb.acctNo = m[0]; }
      signBank(pb.recs);
      bankData = {...pb, name: f.name};
      run();
    } catch (e) { alert('Asisten Rekon: ' + e.message); }
  };
  inp.click();
}
// Kertas kerja untuk arsip/atasan/auditor: semua pasangan, pos rekonsiliasi, ringkasan saldo, dan
// riwayat centang lewat asisten untuk rekening ini. Dibuat di browser, langsung diunduh.
function exportCsv(){
  if (!result || !acc || !bankData) return;
  const r = result, ac = acc, rows = [];
  const num = c => c == null ? '' : (c / 100).toFixed(2);
  // Format tahun-bulan-hari: dibaca benar oleh Excel di setelan Indonesia maupun Amerika.
  const dt = t => new Date(t).toISOString().slice(0, 10);
  rows.push([`Kertas kerja rekonsiliasi bank · Asisten Rekon v${VERSION}`]);
  rows.push(['Rekening', ac.acct]); rows.push(['Periode di Accurate', `${ac.dateFrom} s/d ${ac.dateTo}`]);
  rows.push(['File mutasi', bankData.name]); rows.push(['Rekon mingguan terakhir s.d.', getCut() || '-']); rows.push(['Dibuat', new Date().toLocaleString('id-ID')]);
  rows.push([]);
  rows.push(['Status', 'Alasan', 'Tanggal jurnal', 'No. bukti', 'Keterangan jurnal', 'Nominal jurnal', 'Tanggal bank', 'Keterangan / berita bank', 'Nominal bank']);
  const grp = (status, g) => { const n = Math.max(g.k.length, g.b.length); for (let i = 0; i < n; i++) { const k = g.k[i], b = g.b[i];
    rows.push([i ? '' : status, i ? '' : g.why, k ? dt(k.date) : '', k ? k.ref : '', k ? k.desc : '', k ? num(k.amt) : '', b ? dt(b.date) : '', b ? b.desc : '', b ? num(b.amt) : '']); } };
  r.pasti.forEach(g => grp('PASTI', g));
  r.saran.forEach(g => grp('SARAN - PERLU DICEK', g));
  r.bookOnly.forEach(k => rows.push(['BELUM DI BANK', 'Jurnal belum ada di mutasi bank', dt(k.date), k.ref, k.desc, num(k.amt), '', '', '']));
  r.bankOnly.forEach(b => rows.push(['HANYA DI BANK', 'Usulan: ' + guessCat(b), '', '', '', '', dt(b.date), b.desc, num(b.amt)]));
  if (bankData.close != null && ac.saldo != null) {
    const adjB = bankData.close + sum(r.bookOnly), adjK = ac.saldo + sum(r.bankOnly);
    rows.push([]); rows.push(['Rekonsiliasi (dengan asumsi semua saran benar)']);
    rows.push(['Saldo bank (file)', num(bankData.close)]); rows.push(['+/- pos belum di bank', num(sum(r.bookOnly))]); rows.push(['Bank disesuaikan', num(adjB)]);
    rows.push(['Saldo buku (Accurate)', num(ac.saldo)]); rows.push(['+/- pos hanya di bank', num(sum(r.bankOnly))]); rows.push(['Buku disesuaikan', num(adjK)]);
    rows.push(['Selisih', num(adjB - adjK)]);
  }
  rows.push([]); rows.push(['Riwayat centang lewat asisten untuk rekening ini (tersimpan di browser ini)']);
  rows.push(['Waktu', 'No. bukti', 'Tanggal', 'Nominal', 'Keterangan', 'Pasangan mutasi bank', 'Catatan']);
  readLog().filter(e => e.rekening === ac.acct).forEach(e => rows.push([e.waktu, e.noBukti, e.tanggal, e.nominal, e.keterangan, e.mutasiBank, e.catatan || '']));
  const cell = c => { const s = String(c ?? ''); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + rows.map(x => x.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url; link.download = `Rekon ${(ac.acct.match(/\d{6,}/) || ['bank'])[0]} ${ac.dateFrom.replace(/\//g, '-')} sd ${ac.dateTo.replace(/\//g, '-')}.csv`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function copyResult(){
  const r = result, a = acc, L = [];
  L.push(`ASISTEN REKON v${VERSION} · ${a.acct} · ${a.dateFrom}-${a.dateTo} · file ${bankData.name}`);
  if (sessionLog.length) { L.push('--- SUDAH DICENTANG SESI INI'); sessionLog.forEach(e => L.push(`  ${e.batal ? '[DIBATALKAN] ' : ''}${e.noBukti} ${e.tanggal} ${e.nominal} <- ${e.mutasiBank}`)); }
  if (halted) L.push('--- BERHENTI: ' + halted);
  L.push(`Kartu ${a.recs.length}/${a.pending} · saldo buku ${fmt(a.saldo)} · saldo bank ${fmt(bankData.open)} -> ${fmt(bankData.close)} · no rek file ${bankData.acctNo}`);
  L.push(`PASTI ${r.pasti.length} · SARAN ${r.saran.length} · HANYA BANK ${r.bankOnly.length} · HANYA ACCURATE ${r.bookOnly.length} · SUDAH DIREKON SEBELUMNYA ${r.bankOld.length} (s.d. ${getCut() || '-'})`);
  const g = x => x.b.map(b => `  B ${fd(b.date)} ${fmt(b.amt)} ${b.desc.slice(0, 60)} | berita: ${berita(b.desc).slice(0, 60)}`).concat(x.k.map(k => `  A ${fd(k.date)} ${fmt(k.amt)} ${k.ref} ${k.desc.slice(0, 50)}`)).join('\n');
  L.push('--- SARAN'); r.saran.forEach(x => L.push('* ' + x.why + '\n' + g(x)));
  L.push('--- HANYA BANK'); r.bankOnly.forEach(b => L.push(`  ${fd(b.date)} ${fmt(b.amt)} ${b.desc.slice(0, 60)}`));
  L.push('--- HANYA ACCURATE'); r.bookOnly.forEach(k => L.push(`  ${fd(k.date)} ${fmt(k.amt)} ${k.ref} ${k.desc.slice(0, 50)}`));
  L.push('--- PASTI (contoh 10)'); r.pasti.slice(0, 10).forEach(x => L.push(g(x)));
  const t = L.join('\n');
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => alert('Hasil tersalin. Tempel (Cmd + V) di chat Claude.'), () => { if (typeof copy === 'function') { copy(t); alert('Hasil tersalin.'); } else prompt('Salin teks ini:', t); });
}

window.__ASISTEN_REKON__ = {parseCSV, parseBank, classify, parseAmount, parseDate};
if (typeof document === 'undefined' || !document.body) return;

// Tombol "Asisten Rekon" hanya tampil saat halaman Rekonsiliasi Bank terlihat. Saat akun atau tanggal
// di layar diganti (daftar kartu berubah), panel membaca ulang dan mencocokkan ulang sendiri.
let watched = null, mo = null, deb = null;
function tick(){
  const root = visibleRoot();
  const panel = document.getElementById('ar-panel');
  let btn = document.getElementById('ar-launch');
  if (!root) { if (btn) btn.remove(); if (panel) panel.style.display = 'none'; return; }
  css();
  if (panel) panel.style.display = '';
  else if (!btn) {
    btn = document.createElement('button'); btn.id = 'ar-launch'; btn.type = 'button'; btn.textContent = 'Asisten Rekon';
    btn.onclick = () => { btn.remove(); if (bankData) run(); else { acc = readAccurate(); render(); } };
    document.body.appendChild(btn);
  }
  if (root !== watched) {
    if (mo) mo.disconnect();
    watched = root;
    mo = new MutationObserver(() => {
      clearTimeout(deb);
      deb = setTimeout(() => { if (!busy && document.getElementById('ar-panel')) { if (bankData) run(); else { acc = readAccurate(); render(); } } }, 900);
    });
    mo.observe(root, {childList:true, subtree:true});
  }
}
window.__AR_ON__ = true;
setInterval(tick, 1500);
tick();
{ const b1 = document.getElementById('ar-launch'); if (b1) b1.click(); else alert('Asisten Rekon aktif. Buka Kas & Bank > Rekonsiliasi Bank, tombolnya muncul di kanan bawah.'); }
})();
