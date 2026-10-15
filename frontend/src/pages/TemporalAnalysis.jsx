import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageWrapper from '../components/PageWrapper';
import { useData } from '../context/DataContext';
import api from '../api/client';
import {
    Clock, Download, Moon, Calendar, TrendingUp, Zap, AlertTriangle,
    Loader2, XCircle, CheckCircle2, ChevronDown, ChevronUp
} from 'lucide-react';
import {
    ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell, ReferenceLine, ReferenceArea,
    BarChart
} from 'recharts';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABELS = { 0: '12AM', 3: '3AM', 6: '6AM', 9: '9AM', 12: '12PM', 15: '3PM', 18: '6PM', 21: '9PM' };

function pct(v) { return v == null ? '0.00%' : (v * 100).toFixed(2) + '%'; }
function pct1(v) { return v == null ? '0.0%' : (v * 100).toFixed(1) + '%'; }

function upliftColor(u) {
    if (u > 1.5) return { text: 'text-red-400', bg: 'bg-red-500/10', fill: 'bg-red-500' };
    if (u > 1.2) return { text: 'text-amber-400', bg: 'bg-amber-500/10', fill: 'bg-amber-500' };
    return { text: 'text-green-400', bg: 'bg-green-500/10', fill: 'bg-green-500' };
}
function burstColor(n) {
    if (n > 10) return upliftColor(2);
    if (n > 5) return upliftColor(1.3);
    return upliftColor(1);
}

function DarkTip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
        <div className="bg-[#1A2035] border border-auditiq-border rounded-lg p-3 text-xs shadow-lg min-w-[160px] z-50">
            <p className="text-white font-medium mb-1">{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.stroke || p.fill || '#8899AA' }}>{p.name}: {typeof p.value === 'number' && p.name?.includes('Rate') ? pct(p.value) : p.value?.toLocaleString()}</p>
            ))}
            {d?.is_anomalous && <p className="text-red-400 mt-1 font-medium">⚠ Anomalous</p>}
        </div>
    );
}

function heatColor(rate, total) {
    if (total === 0) return '#0D1117';
    if (rate === 0) return '#1A2035';
    if (rate < 0.01) return '#1E4080';
    if (rate < 0.03) return '#2E75B6';
    if (rate < 0.06) return '#F59E0B';
    return '#EF4444';
}

export default function TemporalAnalysis() {
    const { dataLoaded, setDataLoaded, setDataStats } = useData();
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hoverCell, setHoverCell] = useState(null);

    useEffect(() => {
        api.get('/upload/status').then(r => { if (r.data.loaded) { setDataLoaded(true); setDataStats(r.data); } }).catch(() => { });
    }, []);

    const runAnalysis = async () => {
        setLoading(true); setError(null);
        try { const r = await api.get('/temporal/analysis'); setResult(r.data); }
        catch (err) { setError(err.code === 'ERR_NETWORK' ? 'Backend server not running.' : (err.response?.data?.detail || 'Analysis failed')); }
        setLoading(false);
    };

    const exportFlagged = async () => {
        try {
            const r = await api.get('/temporal/flagged-transactions');
            const rows = r.data;
            if (!rows.length) return;
            const cols = Object.keys(rows[0]);
            const csvContent = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'flagged_temporal.csv'; document.body.appendChild(a); a.click(); a.remove();
        } catch (_) { }
    };

    const s = result?.summary;
    const peakWindows = result?.peak_windows || [];
    const peakSet = useMemo(() => new Set(peakWindows.map(p => `${DAYS.indexOf(p.day_name)}-${p.hour}`)), [peakWindows]);

    return (
        <PageWrapper title="Temporal Analysis">
            <div className="flex flex-col gap-5">

                {/* ═══ HEADER ═══ */}
                <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-white text-lg font-semibold mb-1">Temporal Anomaly Detection</h2>
                        <p className="text-auditiq-muted text-sm">Time-pattern analysis to detect when fraud concentrates — late night, weekends, end-of-month surges</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={runAnalysis} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 transition-colors text-sm font-medium disabled:opacity-60">
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />}
                            {loading ? 'Analyzing...' : 'Run Analysis'}
                        </button>
                        <button onClick={exportFlagged} disabled={!result} className="flex items-center gap-2 px-4 py-2 border border-auditiq-teal text-auditiq-teal rounded-lg hover:bg-auditiq-teal/10 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">
                            <Download size={16} /> Export Flagged
                        </button>
                    </div>
                </div>

                {!dataLoaded && !loading && !result && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3"><AlertTriangle className="text-amber-500" size={18} /><span className="text-amber-400 text-sm">Dataset required — upload your PaySim CSV first</span></div>
                        <Link to="/upload" className="text-auditiq-teal text-sm hover:underline">Go to Upload →</Link>
                    </div>
                )}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3"><XCircle className="text-red-500" size={18} /><span className="text-red-400 text-sm">{error}</span></div>
                        <button onClick={() => setError(null)} className="text-red-400"><XCircle size={16} /></button>
                    </div>
                )}
                {loading && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-16 flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-auditiq-teal/30 border-t-auditiq-teal rounded-full animate-spin" />
                        <p className="text-white font-medium">Analyzing time patterns across 744 hours...</p>
                        <p className="text-auditiq-muted text-sm">Computing hourly, daily, and burst patterns</p>
                    </div>
                )}
                {!loading && !result && dataLoaded && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-16 flex flex-col items-center gap-4">
                        <Clock size={64} className="text-auditiq-teal opacity-30" />
                        <p className="text-white font-medium text-lg">Run Temporal Analysis to detect time-based fraud patterns</p>
                        <p className="text-auditiq-muted text-sm">Analyzes 30 days × 24 hours of transaction timing</p>
                        <button onClick={runAnalysis} className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 font-medium text-sm"><Clock size={16} /> Run Analysis</button>
                    </div>
                )}

                {result && (
                    <>
                        {/* ═══ SECTION 2 — UPLIFT CARDS ═══ */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            {[
                                { label: 'Late Night Uplift', icon: Moon, value: `${s.late_night_uplift}x above average`, sub: `${result.late_night.fraud_count} fraud txns between 10PM–5AM`, uc: upliftColor(s.late_night_uplift) },
                                { label: 'Weekend Uplift', icon: Calendar, value: `${s.weekend_uplift}x above average`, sub: 'Fraud rate on Sat/Sun vs weekdays', uc: upliftColor(s.weekend_uplift) },
                                { label: 'End of Month Uplift', icon: TrendingUp, value: `${s.end_of_month_uplift}x above average`, sub: `${result.end_of_month.fraud_count} fraud in last 3 days`, uc: upliftColor(s.end_of_month_uplift) },
                                { label: 'Burst Accounts', icon: Zap, value: `${s.burst_accounts_found} accounts`, sub: 'Accounts with rapid consecutive transactions', uc: burstColor(s.burst_accounts_found) },
                            ].map((c, i) => (
                                <div key={i} className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.uc.bg}`}><c.icon className={c.uc.text} size={20} /></div>
                                        <span className="text-sm text-auditiq-muted">{c.label}</span>
                                    </div>
                                    <div className={`text-xl font-bold mb-1 ${c.uc.text}`}>{c.value}</div>
                                    <p className="text-xs text-auditiq-muted">{c.sub}</p>
                                </div>
                            ))}
                        </div>

                        {/* ═══ SECTION 3 — PEAK BANNER ═══ */}
                        {peakWindows.length > 0 && (
                            <div className="bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.25)] rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <AlertTriangle className="text-red-400 shrink-0" size={18} />
                                    <span className="text-red-300 text-sm font-medium">Peak Fraud Window: {s.peak_fraud_window}</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {peakWindows.map((pw, i) => (
                                        <span key={i} className={`text-[10px] px-2 py-1 rounded-full font-medium ${i < 2 ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`} title={`Total: ${pw.total_count}, Fraud: ${pw.fraud_count}, Score: ${pw.anomaly_score}`}>
                                            {pw.day_name} {pw.hour}:00 — {pct1(pw.fraud_rate)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ═══ SECTION 4 — CHARTS ROW ═══ */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                            {/* Hourly */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h3 className="text-base font-semibold text-auditiq-text mb-4">Hourly Transaction Pattern</h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <ComposedChart data={result.hourly}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
                                        <XAxis dataKey="hour_of_day" tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} tickFormatter={v => HOUR_LABELS[v] || ''} />
                                        <YAxis yAxisId="left" tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} tickFormatter={v => pct1(v)} />
                                        <Tooltip content={<DarkTip />} />
                                        <ReferenceArea yAxisId="left" x1={22} x2={23} fill="rgba(239,68,68,0.06)" />
                                        <ReferenceArea yAxisId="left" x1={0} x2={5} fill="rgba(239,68,68,0.06)" label={{ value: 'Late Night', fill: '#8899AA', fontSize: 9, position: 'insideTop' }} />
                                        <ReferenceLine yAxisId="right" y={s.overall_fraud_rate} stroke="#8899AA" strokeDasharray="4 2" label={{ value: 'Avg', position: 'right', fill: '#8899AA', fontSize: 10 }} />
                                        <Bar yAxisId="left" dataKey="total_count" name="All Transactions" barSize={12} radius={[2, 2, 0, 0]}>
                                            {result.hourly.map((h, i) => <Cell key={i} fill={h.is_anomalous ? '#EF4444' : 'rgba(46,117,182,0.7)'} />)}
                                        </Bar>
                                        <Bar yAxisId="left" dataKey="fraud_count" name="Fraud Txns" barSize={8} fill="rgba(239,68,68,0.5)" radius={[2, 2, 0, 0]} />
                                        <Line yAxisId="right" type="monotone" dataKey="fraud_rate" name="Fraud Rate" stroke="#F59E0B" strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                                <p className="text-[10px] text-auditiq-muted text-center mt-2">Red shading = late night window (10PM–5AM)</p>
                            </div>

                            {/* Day of week */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h3 className="text-base font-semibold text-auditiq-text mb-4">Day of Week Fraud Distribution</h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <ComposedChart data={result.day_of_week}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
                                        <XAxis dataKey="day_name" tick={{ fill: '#8899AA', fontSize: 11 }} axisLine={false} />
                                        <YAxis yAxisId="left" tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} tickFormatter={v => pct1(v)} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} />
                                        <Tooltip content={<DarkTip />} />
                                        <Bar yAxisId="left" dataKey="fraud_rate" name="Fraud Rate" barSize={32} radius={[4, 4, 0, 0]}>
                                            {result.day_of_week.map((d, i) => <Cell key={i} fill={d.is_weekend ? '#EF4444' : '#2E75B6'} />)}
                                        </Bar>
                                        <Line yAxisId="right" type="monotone" dataKey="total_count" name="Total Txns" stroke="#00C2CB" strokeWidth={2} dot={{ fill: '#00C2CB', r: 3 }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                                {result.day_of_week.length > 0 && (() => {
                                    const wd = result.day_of_week.filter(d => !d.is_weekend);
                                    const we = result.day_of_week.filter(d => d.is_weekend);
                                    const wdAvg = wd.length ? wd.reduce((s, d) => s + d.fraud_rate, 0) / wd.length : 0;
                                    const weAvg = we.length ? we.reduce((s, d) => s + d.fraud_rate, 0) / we.length : 0;
                                    return (
                                        <div className="flex items-center justify-center gap-3 mt-3 text-xs">
                                            <span className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full">Weekday avg: {pct(wdAvg)}</span>
                                            <span className="text-auditiq-muted">↑ {s.weekend_uplift}x uplift</span>
                                            <span className="bg-red-500/10 text-red-400 px-3 py-1 rounded-full">Weekend avg: {pct(weAvg)}</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* ═══ SECTION 5 — HEATMAP ═══ */}
                        <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-6">
                            <h3 className="text-base font-semibold text-auditiq-text">Fraud Concentration Heatmap — Day × Hour</h3>
                            <p className="text-xs text-auditiq-muted mt-1 mb-4">Each cell = one (day of week, hour) combination. Color intensity = fraud rate. Hover for exact counts.</p>
                            {/* Hour labels */}
                            <div className="flex ml-[60px] mb-1">
                                {[0, 4, 8, 12, 16, 20].map(h => (
                                    <span key={h} className="text-[9px] text-auditiq-muted" style={{ width: `${100 / 6}%` }}>
                                        {['12AM', '4AM', '8AM', '12PM', '4PM', '8PM'][h / 4]}
                                    </span>
                                ))}
                            </div>
                            {/* Grid */}
                            <div className="flex flex-col gap-[2px]">
                                {DAYS.map((day, d) => (
                                    <div key={d} className="flex items-center gap-0">
                                        <span className={`w-[60px] text-xs text-right pr-3 shrink-0 ${d >= 5 ? 'text-red-400' : 'text-auditiq-muted'}`}>{day}</span>
                                        <div className="flex-1 flex gap-[2px]">
                                            {Array.from({ length: 24 }, (_, h) => {
                                                const cell = result.heatmap.find(c => c.day === d && c.hour === h) || { total: 0, fraud: 0, rate: 0 };
                                                const isPeak = peakSet.has(`${d}-${h}`);
                                                return (
                                                    <div key={h} className="flex-1 h-[32px] rounded-sm cursor-pointer relative transition-all hover:ring-1 hover:ring-white/30"
                                                        style={{ backgroundColor: heatColor(cell.rate, cell.total), minWidth: 0 }}
                                                        onMouseEnter={() => setHoverCell({ d, h, ...cell, isPeak })}
                                                        onMouseLeave={() => setHoverCell(null)}>
                                                        {isPeak && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full" />}
                                                        {hoverCell && hoverCell.d === d && hoverCell.h === h && (
                                                            <div className="absolute z-40 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1A2035] border border-auditiq-border rounded-lg p-2.5 text-[10px] whitespace-nowrap shadow-xl pointer-events-none">
                                                                <p className="text-white font-medium">{DAYS[d]}, {h}:00 – {h + 1}:00</p>
                                                                <p className="text-auditiq-muted">Transactions: {cell.total}</p>
                                                                <p className="text-red-400">Fraud: {cell.fraud} ({pct1(cell.rate)})</p>
                                                                {isPeak && <p className="text-red-400 font-medium mt-0.5">⚠ Peak anomaly window</p>}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Legend */}
                            <div className="flex items-center justify-between mt-4 ml-[60px]">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-40 rounded-full" style={{ background: 'linear-gradient(to right, #1A2035, #1E4080, #2E75B6, #F59E0B, #EF4444)' }} />
                                    <div className="flex gap-4 text-[9px] text-auditiq-muted">
                                        <span>0%</span><span>Low</span><span>Medium</span><span>High</span><span>6%+</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 text-[9px] text-auditiq-muted">
                                    <span className="w-2 h-2 bg-red-500 rounded-full" />Peak window
                                </div>
                            </div>
                        </div>

                        {/* ═══ SECTION 6 — 30-DAY TREND ═══ */}
                        <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                            <h3 className="text-base font-semibold text-auditiq-text mb-4">30-Day Transaction & Fraud Trend</h3>
                            <ResponsiveContainer width="100%" height={220}>
                                <ComposedChart data={result.daily}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
                                    <XAxis dataKey="day_of_month" tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} tickFormatter={v => `D${v}`} />
                                    <YAxis yAxisId="left" tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} tickFormatter={v => pct1(v)} />
                                    <Tooltip content={<DarkTip />} />
                                    <ReferenceArea yAxisId="left" x1={28} x2={30} fill="rgba(239,68,68,0.06)" label={{ value: 'EOM', fill: '#EF4444', fontSize: 9, position: 'insideTopRight' }} />
                                    <Area yAxisId="left" type="monotone" dataKey="total_count" name="Total Txns" fill="rgba(46,117,182,0.15)" stroke="#2E75B6" />
                                    <Bar yAxisId="left" dataKey="fraud_count" name="Fraud Count" barSize={10} radius={[2, 2, 0, 0]}>
                                        {result.daily.map((d, i) => <Cell key={i} fill={d.is_anomalous ? '#EF4444' : 'rgba(239,68,68,0.7)'} />)}
                                    </Bar>
                                    <Line yAxisId="right" type="monotone" dataKey="fraud_rate" name="Fraud Rate" stroke="#F59E0B" strokeWidth={2} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>

                        {/* ═══ SECTION 7 — BURST ACCOUNTS ═══ */}
                        {result.burst_accounts.length > 0 && (
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-base font-semibold text-auditiq-text">Burst Transaction Accounts</h3>
                                        <p className="text-xs text-auditiq-muted mt-1">Accounts making multiple transactions within 2-hour windows — potential automated fraud</p>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-auditiq-bg">
                                            <tr>{['Rank', 'Account ID', 'Burst Pairs', 'Total Txns', 'Fraud Txns', 'Fraud Rate', 'Risk Level'].map(h => (
                                                <th key={h} className="text-left px-3 py-2 text-auditiq-teal uppercase tracking-wider font-medium">{h}</th>
                                            ))}</tr>
                                        </thead>
                                        <tbody>
                                            {result.burst_accounts.map((a, i) => {
                                                const fr = a.total_txns ? a.fraud_txns / a.total_txns : 0;
                                                const risk = (a.burst_pairs >= 10 && a.fraud_txns > 0) ? 'CRITICAL' : (a.burst_pairs >= 5 && a.fraud_txns > 0) ? 'HIGH' : a.burst_pairs >= 3 ? 'MEDIUM' : 'LOW';
                                                const riskCls = risk === 'CRITICAL' || risk === 'HIGH' ? 'bg-red-500/15 text-red-400' : risk === 'MEDIUM' ? 'bg-amber-500/15 text-amber-400' : 'bg-green-500/15 text-green-400';
                                                const border = i < 3 ? 'border-l-[3px] border-l-red-500' : i < 10 ? 'border-l-[3px] border-l-amber-500' : '';
                                                return (
                                                    <tr key={i} className={`border-t border-auditiq-border/50 ${border}`}>
                                                        <td className="px-3 py-2 text-auditiq-muted">{i + 1}</td>
                                                        <td className="px-3 py-2 text-white font-mono">{a.account?.substring(0, 14)}</td>
                                                        <td className="px-3 py-2 text-white font-medium">{a.burst_pairs}</td>
                                                        <td className="px-3 py-2 text-auditiq-text">{a.total_txns}</td>
                                                        <td className="px-3 py-2 text-auditiq-text">{a.fraud_txns}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${fr > 0.5 ? 'bg-red-500/15 text-red-400' : fr > 0.2 ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>{pct(fr)}</span>
                                                        </td>
                                                        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-medium ${riskCls}`}>{risk}</span></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ═══ SECTION 8 — INTERPRETATION ═══ */}
                        <div className="bg-[rgba(0,194,203,0.04)] border border-[rgba(0,194,203,0.15)] rounded-xl p-6">
                            <h3 className="text-base font-semibold text-auditiq-text mb-5">How to Interpret These Results</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Col 1 — Time risk */}
                                <div>
                                    <h4 className="text-sm text-auditiq-muted font-medium mb-3">Time Risk Summary</h4>
                                    {[
                                        { label: 'Late Night', uplift: s.late_night_uplift, count: result.late_night.fraud_count },
                                        { label: 'Weekend', uplift: s.weekend_uplift, count: result.day_of_week.filter(d => d.is_weekend).reduce((a, d) => a + d.fraud_count, 0) },
                                        { label: 'End of Month', uplift: s.end_of_month_uplift, count: result.end_of_month.fraud_count },
                                    ].map((t, i) => {
                                        const uc = upliftColor(t.uplift);
                                        return (
                                            <div key={i} className="flex items-center gap-3 mb-3">
                                                <div className="flex-1">
                                                    <div className="flex justify-between text-xs mb-1"><span className="text-auditiq-text">{t.label}</span><span className={uc.text}>{t.uplift}x</span></div>
                                                    <div className="h-1.5 bg-auditiq-border rounded-full overflow-hidden"><div className={`h-full rounded-full ${uc.fill}`} style={{ width: `${Math.min(t.uplift / 3 * 100, 100)}%` }} /></div>
                                                    <p className="text-[10px] text-auditiq-muted mt-0.5">{t.count} fraud transactions</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {/* Col 2 — Key findings */}
                                <div>
                                    <h4 className="text-sm text-auditiq-muted font-medium mb-3">Key Findings</h4>
                                    <ul className="flex flex-col gap-2 text-sm text-auditiq-text">
                                        {(() => {
                                            const findings = [];
                                            const peakHour = result.hourly.reduce((a, b) => b.fraud_rate > a.fraud_rate ? b : a, result.hourly[0]);
                                            const peakDay = result.day_of_week.reduce((a, b) => b.fraud_rate > a.fraud_rate ? b : a, result.day_of_week[0]);
                                            findings.push(`Peak fraud hour: Hour ${peakHour.hour_of_day} (${pct(peakHour.fraud_rate)} fraud rate)`);
                                            findings.push(`Peak fraud day: ${peakDay.day_name} (${pct(peakDay.fraud_rate)} fraud rate)`);
                                            if (s.late_night_uplift > 1.5) findings.push(`⚠ Late night fraud rate is ${s.late_night_uplift}x the daytime average`);
                                            if (s.weekend_uplift > 1.3) findings.push('⚠ Weekend transactions show elevated fraud patterns');
                                            if (s.end_of_month_uplift > 1.4) findings.push('⚠ End-of-month spike detected — review approval controls');
                                            if (s.burst_accounts_found > 5) findings.push(`⚠ ${s.burst_accounts_found} burst accounts detected — possible automated fraud`);
                                            return findings.map((f, i) => <li key={i} className="flex items-start gap-2"><span className="text-auditiq-teal mt-0.5">•</span>{f}</li>);
                                        })()}
                                    </ul>
                                </div>
                                {/* Col 3 — Actions */}
                                <div>
                                    <h4 className="text-sm text-auditiq-muted font-medium mb-3">Recommended Actions</h4>
                                    <ul className="flex flex-col gap-2 text-sm text-auditiq-text">
                                        {(() => {
                                            const maxU = Math.max(s.late_night_uplift, s.weekend_uplift, s.end_of_month_uplift);
                                            const actions = maxU > 2
                                                ? ['Immediate review of late-night approval workflows', 'Implement time-based transaction controls', 'Require dual authorization for off-hours transactions', 'Audit approver activity logs for flagged windows']
                                                : maxU > 1.3
                                                    ? ['Monitor off-hours transaction patterns', 'Set automated alerts for late-night postings', 'Review weekend approval delegation policies']
                                                    : ['Temporal patterns within normal range', 'Continue routine monitoring', 'Consider scheduled reporting for trend changes'];
                                            return actions.map((a, i) => <li key={i} className="flex items-start gap-2"><span className="text-auditiq-teal mt-0.5">•</span>{a}</li>);
                                        })()}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </PageWrapper>
    );
}
