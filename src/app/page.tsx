'use client';

import { useEffect, useState, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Filler, Tooltip
} from 'chart.js';
import type { FunnelRow } from '@/lib/storage';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

// ── helpers ──────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function pct(a: number, b: number) { return b > 0 ? Math.round(a / b * 1000) / 10 : 0; }
function weekStart(weeksAgo = 0) {
  const d = new Date(); const dow = d.getDay() || 7;
  d.setDate(d.getDate() - dow + 1 - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}
function weekEnd(weeksAgo = 0) {
  const d = new Date(weekStart(weeksAgo)); d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}
function sumRows(rows: FunnelRow[]) {
  const n = (k: keyof FunnelRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return {
    bs: n('bot_sent'), br: n('bot_received'), bd: n('bot_dialled'),
    bc: n('bot_connected'), bq: n('bot_qualified'),
    cs: n('cc_sent'), cc: n('cc_connected'), cv: n('cc_converted'),
  };
}

// ── styles ────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  topbar:    { background:'#fff', borderBottom:'1px solid #e2e1db', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:52, position:'sticky', top:0, zIndex:100 },
  logo:      { fontSize:13, fontWeight:600, letterSpacing:'-.01em' },
  lastUpd:   { fontSize:11, color:'#9b9b96', background:'#f5f5f3', padding:'3px 8px', borderRadius:20 },
  nav:       { background:'#fff', borderBottom:'1px solid #e2e1db', padding:'0 24px', display:'flex', gap:0, overflowX:'auto' },
  tab:       { padding:'10px 16px', fontSize:13, color:'#6b6b67', cursor:'pointer', borderBottom:'2px solid transparent', marginBottom:-1, whiteSpace:'nowrap' },
  tabActive: { padding:'10px 16px', fontSize:13, color:'#185FA5', cursor:'pointer', borderBottom:'2px solid #185FA5', marginBottom:-1, fontWeight:500, whiteSpace:'nowrap' },
  main:      { padding:'20px 24px', maxWidth:1200, margin:'0 auto' },
  filterBar: { display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' as const },
  label:     { fontSize:12, color:'#6b6b67' },
  select:    { fontSize:13, padding:'6px 10px', border:'1px solid #e2e1db', borderRadius:8, background:'#fff', color:'#1a1a18', outline:'none' },
  input:     { fontSize:13, padding:'6px 10px', border:'1px solid #e2e1db', borderRadius:8, background:'#fff', color:'#1a1a18', outline:'none' },
  kpiRow:    { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 },
  kpi:       { background:'#fff', border:'1px solid #e2e1db', borderRadius:12, padding:'14px 16px' },
  kpiLabel:  { fontSize:11, color:'#9b9b96', textTransform:'uppercase' as const, letterSpacing:'.05em', marginBottom:6 },
  kpiVal:    { fontSize:24, fontWeight:500, lineHeight:1 },
  kpiSub:    { fontSize:11, color:'#9b9b96', marginTop:4 },
  grid2:     { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 },
  card:      { background:'#fff', border:'1px solid #e2e1db', borderRadius:12, padding:'16px 18px' },
  cardTitle: { fontSize:11, fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'.06em', color:'#9b9b96', marginBottom:14, display:'flex', alignItems:'center', gap:8 },
  badgeBot:  { display:'inline-block', padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600, background:'#E6F1FB', color:'#185FA5' },
  badgeCC:   { display:'inline-block', padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600, background:'#EAF3DE', color:'#27500A' },
  stageMeta: { display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 },
  stageName: { fontSize:12, fontWeight:500 },
  stageNum:  { fontSize:13, fontWeight:500 },
  barTrack:  { height:6, background:'#eeede8', borderRadius:3, overflow:'hidden' },
  stageDrop: { fontSize:11, color:'#9b9b96', marginTop:2, textAlign:'right' as const },
  wowGrid:   { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginTop:8 },
  wowCell:   { background:'#f5f5f3', borderRadius:8, padding:'10px 12px' },
  wowLabel:  { fontSize:10, color:'#9b9b96', textTransform:'uppercase' as const, letterSpacing:'.04em', marginBottom:4 },
  wowCurr:   { fontSize:16, fontWeight:500 },
  wowPrev:   { fontSize:11, color:'#9b9b96', marginTop:2 },
  empty:     { textAlign:'center' as const, padding:40, color:'#9b9b96', fontSize:13, lineHeight:1.8 },
  logTable:  { width:'100%', borderCollapse:'collapse' as const, fontSize:12 },
  errBanner: { background:'#FCEBEB', border:'1px solid #F7C1C1', borderRadius:8, padding:'12px 16px', fontSize:13, color:'#A32D2D', marginBottom:16 },
  btn:       { padding:'6px 14px', fontSize:12, border:'1px solid #e2e1db', borderRadius:8, background:'#fff', cursor:'pointer', color:'#1a1a18', marginLeft:'auto' },
};

// ── component ─────────────────────────────────────────────────
export default function Dashboard() {
  const [rows, setRows]       = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [tab, setTab]         = useState('funnel');

  // funnel filters
  const [fMode, setFMode]     = useState<'day'|'range'>('day');
  const [fDay, setFDay]       = useState(todayStr());
  const [fFrom, setFFrom]     = useState(weekStart(0));
  const [fTo, setFTo]         = useState(todayStr());

  // trends filters
  const [tMetric, setTMetric] = useState('bot_sent');
  const [tPeriod, setTPeriod] = useState('14');

  // wow filter
  const [wowEnd, setWowEnd]   = useState(todayStr());

  // log filters
  const [lFrom, setLFrom]     = useState(weekStart(0));
  const [lTo, setLTo]         = useState(todayStr());

  useEffect(() => {
    fetch('/api/data')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setRows(d.rows || []); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const lastDate = rows.length ? rows[rows.length - 1].date : '—';

  // ── funnel data ──
  const fRows = fMode === 'day'
    ? rows.filter(r => r.date === fDay)
    : rows.filter(r => r.date >= fFrom && r.date <= fTo);
  const fs = sumRows(fRows);

  // ── trends data ──
  let tRows = [...rows];
  if (tPeriod !== 'all') {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - +tPeriod);
    const cutStr = cutoff.toISOString().slice(0, 10);
    tRows = tRows.filter(r => r.date >= cutStr);
  }

  const METRIC_LABELS: Record<string, string> = {
    bot_sent:'Bot leads sent', bot_received:'Bot received', bot_dialled:'Bot dialled',
    bot_connected:'Bot connected', bot_qualified:'Bot qualified',
    cc_sent:'CC sent', cc_connected:'CC connected', cc_converted:'CC converted',
    bot_connect_rate:'Bot connect %', bot_qualify_rate:'Bot qualify %',
    cc_convert_rate:'CC convert %', e2e_rate:'End-to-end %',
  };
  const isRate = tMetric.includes('rate');
  const tLabels = tRows.map(r => r.date.slice(5));
  const tVals   = tRows.map(r => {
    const v = Number(r[tMetric as keyof FunnelRow]) || 0;
    return isRate ? Math.round(v * 10000) / 100 : v;
  });

  // ── wow data ──
  const wEnd = new Date(wowEnd);
  const wStart = new Date(wEnd); wStart.setDate(wEnd.getDate() - 6);
  const pwEnd = new Date(wStart); pwEnd.setDate(wStart.getDate() - 1);
  const pwStart = new Date(pwEnd); pwStart.setDate(pwEnd.getDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const currRows = rows.filter(r => r.date >= fmt(wStart) && r.date <= fmt(wEnd));
  const prevRows = rows.filter(r => r.date >= fmt(pwStart) && r.date <= fmt(pwEnd));
  const sc = sumRows(currRows), sp = sumRows(prevRows);

  const wowMetrics = [
    { l:'Bot leads sent',  c:sc.bs, p:sp.bs },
    { l:'Bot connected',   c:sc.bc, p:sp.bc },
    { l:'Bot qualified',   c:sc.bq, p:sp.bq },
    { l:'CC converted',    c:sc.cv, p:sp.cv },
    { l:'Connect rate',    c:pct(sc.bc,sc.bd), p:pct(sp.bc,sp.bd), isPct:true },
    { l:'Qualify rate',    c:pct(sc.bq,sc.bc), p:pct(sp.bq,sp.bc), isPct:true },
    { l:'CC convert rate', c:pct(sc.cv,sc.cc), p:pct(sp.cv,sp.cc), isPct:true },
    { l:'End-to-end',      c:pct(sc.cv,sc.bs), p:pct(sp.cv,sp.bs), isPct:true },
  ];

  // ── log data ──
  const lRows = [...rows].filter(r => r.date >= lFrom && r.date <= lTo).reverse();

  function exportCSV() {
    if (!lRows.length) return;
    const keys = Object.keys(lRows[0]) as (keyof FunnelRow)[];
    const csv  = [keys.join(','), ...lRows.map(r => keys.map(k => r[k]).join(','))].join('\n');
    const a    = document.createElement('a');
    a.href     = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `funnel_${lFrom}_${lTo}.csv`;
    a.click();
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#9b9b96', gap:10 }}>
      <div style={{ width:16, height:16, border:'2px solid #e2e1db', borderTopColor:'#378ADD', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
      Loading dashboard...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <>
      {/* topbar */}
      <div style={S.topbar}>
        <div style={S.logo}>Paytm Insurance &nbsp;<span style={{ color:'#185FA5' }}>/ Voicebot Funnel</span></div>
        <div style={S.lastUpd}>Last data: {lastDate}</div>
      </div>

      {/* nav */}
      <div style={S.nav}>
        {(['funnel','trends','wow','log'] as const).map(t => (
          <div key={t} style={tab===t ? S.tabActive : S.tab} onClick={() => setTab(t)}>
            {t === 'wow' ? 'Week on week' : t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      <div style={S.main}>
        {error && <div style={S.errBanner}>{error}</div>}

        {/* ── FUNNEL ── */}
        {tab === 'funnel' && (
          <>
            <div style={S.filterBar}>
              <span style={S.label}>View</span>
              <select style={S.select} value={fMode} onChange={e => setFMode(e.target.value as any)}>
                <option value="day">Single day</option>
                <option value="range">Date range</option>
              </select>
              {fMode === 'day' && (
                <input style={S.input} type="date" value={fDay} onChange={e => setFDay(e.target.value)} />
              )}
              {fMode === 'range' && (
                <>
                  <input style={S.input} type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} />
                  <span style={{ fontSize:12, color:'#9b9b96' }}>to</span>
                  <input style={S.input} type="date" value={fTo} onChange={e => setFTo(e.target.value)} />
                </>
              )}
            </div>

            {/* KPIs */}
            <div style={S.kpiRow}>
              {[
                { l:'Bot connect rate',   v:pct(fs.bc,fs.bd)+'%', s:`${fs.bc} / ${fs.bd} dialled` },
                { l:'Bot qualify rate',   v:pct(fs.bq,fs.bc)+'%', s:`${fs.bq} / ${fs.bc} connected` },
                { l:'CC convert rate',    v:pct(fs.cv,fs.cc)+'%', s:`${fs.cv} / ${fs.cc} connected` },
                { l:'End-to-end convert', v:pct(fs.cv,fs.bs)+'%', s:`${fs.cv} from ${fs.bs} leads` },
              ].map(k => (
                <div key={k.l} style={S.kpi}>
                  <div style={S.kpiLabel}>{k.l}</div>
                  <div style={S.kpiVal}>{k.v}</div>
                  <div style={S.kpiSub}>{k.s}</div>
                </div>
              ))}
            </div>

            <div style={S.grid2}>
              <div style={S.card}>
                <div style={S.cardTitle}><span style={S.badgeBot}>Voicebot</span> Top of funnel</div>
                <FunnelSide stages={[
                  { name:'Leads sent',      val:fs.bs },
                  { name:'Leads received',  val:fs.br },
                  { name:'Leads dialled',   val:fs.bd },
                  { name:'Leads connected', val:fs.bc },
                  { name:'Leads qualified', val:fs.bq },
                ]} color="#378ADD" hasData={rows.length > 0} />
              </div>
              <div style={S.card}>
                <div style={S.cardTitle}><span style={S.badgeCC}>Call centre</span> Bottom of funnel</div>
                <FunnelSide stages={[
                  { name:'Leads sent',      val:fs.cs },
                  { name:'Leads connected', val:fs.cc },
                  { name:'Leads converted', val:fs.cv },
                ]} color="#639922" hasData={rows.length > 0} />
              </div>
            </div>
          </>
        )}

        {/* ── TRENDS ── */}
        {tab === 'trends' && (
          <>
            <div style={S.filterBar}>
              <span style={S.label}>Metric</span>
              <select style={S.select} value={tMetric} onChange={e => setTMetric(e.target.value)}>
                <optgroup label="Voicebot">
                  {['bot_sent','bot_received','bot_dialled','bot_connected','bot_qualified','bot_connect_rate','bot_qualify_rate'].map(k => (
                    <option key={k} value={k}>{METRIC_LABELS[k]}</option>
                  ))}
                </optgroup>
                <optgroup label="Call centre">
                  {['cc_sent','cc_connected','cc_converted','cc_convert_rate'].map(k => (
                    <option key={k} value={k}>{METRIC_LABELS[k]}</option>
                  ))}
                </optgroup>
                <optgroup label="Combined">
                  <option value="e2e_rate">End-to-end %</option>
                </optgroup>
              </select>
              <span style={S.label}>Period</span>
              <select style={S.select} value={tPeriod} onChange={e => setTPeriod(e.target.value)}>
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
                <option value="all">All time</option>
              </select>
            </div>
            <div style={S.card}>
              {tRows.length === 0 ? (
                <div style={S.empty}><strong style={{ display:'block', fontSize:15, color:'#6b6b67', marginBottom:4 }}>No data</strong>No records in this period.</div>
              ) : (
                <div style={{ position:'relative', height:260 }}>
                  <Line
                    data={{
                      labels: tLabels,
                      datasets: [{
                        label: METRIC_LABELS[tMetric],
                        data: tVals,
                        borderColor: '#378ADD',
                        backgroundColor: '#378ADD18',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 4,
                        pointBackgroundColor: '#378ADD',
                      }]
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => isRate ? c.parsed.y.toFixed(1)+'%' : c.parsed.y.toLocaleString() }}},
                      scales: {
                        x: { ticks: { color:'#9b9b96', font:{size:11} }, grid: { color:'#e2e1db' }},
                        y: { ticks: { color:'#9b9b96', font:{size:11}, callback: (v) => isRate ? v+'%' : Number(v).toLocaleString() }, grid: { color:'#e2e1db' }, beginAtZero: true }
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* ── WEEK ON WEEK ── */}
        {tab === 'wow' && (
          <>
            <div style={S.filterBar}>
              <span style={S.label}>Week ending</span>
              <input style={S.input} type="date" value={wowEnd} onChange={e => setWowEnd(e.target.value)} />
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>
                {fmt(wStart)} — {fmt(wEnd)} &nbsp;vs&nbsp; {fmt(pwStart)} — {fmt(pwEnd)}
              </div>
              <div style={S.wowGrid}>
                {wowMetrics.map(m => {
                  const delta = m.p > 0 ? Math.round((m.c - m.p) / m.p * 100) : null;
                  const col   = delta === null ? '#9b9b96' : delta > 0 ? '#3B6D11' : '#A32D2D';
                  const arrow = delta === null ? '—' : (delta > 0 ? '↑ ' : '↓ ') + Math.abs(delta) + '%';
                  const f     = (v: number) => m.isPct ? v + '%' : v.toLocaleString();
                  return (
                    <div key={m.l} style={S.wowCell}>
                      <div style={S.wowLabel}>{m.l}</div>
                      <div style={S.wowCurr}>{f(m.c)}</div>
                      <div style={S.wowPrev}>Prev: {f(m.p)}</div>
                      <div style={{ fontSize:11, fontWeight:500, marginTop:2, color:col }}>{arrow}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── DATA LOG ── */}
        {tab === 'log' && (
          <>
            <div style={S.filterBar}>
              <span style={S.label}>From</span>
              <input style={S.input} type="date" value={lFrom} onChange={e => setLFrom(e.target.value)} />
              <span style={S.label}>To</span>
              <input style={S.input} type="date" value={lTo} onChange={e => setLTo(e.target.value)} />
              <button style={S.btn} onClick={exportCSV}>Export CSV</button>
            </div>
            <div style={{ ...S.card, overflowX:'auto' }}>
              {lRows.length === 0 ? (
                <div style={S.empty}><strong style={{ display:'block', fontSize:15, color:'#6b6b67', marginBottom:4 }}>No records</strong>Adjust the date range or wait for the daily pipeline to run.</div>
              ) : (
                <table style={S.logTable}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid #e2e1db' }}>
                      {['Date','Bot sent','Received','Dialled','Connected','Qualified','CC sent','CC conn','CC conv','Connect %','Qualify %','CC conv %','E2E %'].map(h => (
                        <th key={h} style={{ textAlign:'left', padding:'7px 10px', fontWeight:500, color:'#6b6b67', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lRows.map(r => (
                      <tr key={r.date} style={{ borderBottom:'1px solid #eeede8' }}>
                        <td style={{ padding:'7px 10px', whiteSpace:'nowrap' }}>{r.date}</td>
                        {([r.bot_sent,r.bot_received,r.bot_dialled,r.bot_connected,r.bot_qualified,r.cc_sent,r.cc_connected,r.cc_converted] as number[]).map((v,i) => (
                          <td key={i} style={{ padding:'7px 10px', textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{v.toLocaleString()}</td>
                        ))}
                        {([r.bot_connect_rate,r.bot_qualify_rate,r.cc_convert_rate,r.e2e_rate] as number[]).map((v,i) => (
                          <td key={i} style={{ padding:'7px 10px', textAlign:'right', color:'#185FA5' }}>{Math.round(v*10000)/100}%</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── funnel side component ─────────────────────────────────────
function FunnelSide({ stages, color, hasData }: { stages:{name:string,val:number}[], color:string, hasData:boolean }) {
  const top = stages[0].val || 1;
  if (!hasData) return <div style={S.empty}><strong style={{ display:'block', fontSize:15, color:'#6b6b67', marginBottom:4 }}>No data yet</strong>Data will appear after the daily pipeline runs.</div>;
  if (!stages[0].val) return <div style={S.empty}><strong style={{ display:'block', fontSize:15, color:'#6b6b67', marginBottom:4 }}>No data</strong>No records for this date range.</div>;
  return (
    <>
      {stages.map((st, i) => {
        const w = Math.max(4, Math.round(st.val / top * 100));
        const fromTop  = i > 0 ? pct(st.val, top) : null;
        const fromPrev = i > 0 ? pct(st.val, stages[i-1].val) : null;
        return (
          <div key={st.name} style={{ marginBottom:10 }}>
            <div style={S.stageMeta}>
              <span style={S.stageName}>{st.name}</span>
              <span style={S.stageNum}>{st.val.toLocaleString()}</span>
            </div>
            <div style={S.barTrack}>
              <div style={{ height:'100%', borderRadius:3, background:color, width:`${w}%`, transition:'width .5s ease' }} />
            </div>
            <div style={S.stageDrop}>
              {fromPrev !== null && `Step: ${fromPrev}%`}
              {fromTop  !== null && fromPrev !== null && ' · '}
              {fromTop  !== null && `Top: ${fromTop}%`}
            </div>
          </div>
        );
      })}
    </>
  );
}
