import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageWrapper from '../components/PageWrapper';
import { useData } from '../context/DataContext';
import api from '../api/client';
import {
    Shield, Download, AlertTriangle, Loader2, XCircle,
    ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
    Search, Filter, Target, Gauge, BarChart3, TrendingUp,
    Activity, Zap, Clock, Hash, Users, ArrowUpRight
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';

/* ───── helpers ───── */
function fmt(v) { return v == null ? '—' : '$ ' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pct(v) { return v == null ? '0.0%' : v.toFixed(1) + '%'; }

const BAND_META = {
    LOW:      { color: 'text-green-400',  bg: 'bg-green-500/15',  bar: 'bg-green-500',  border: 'border-green-500/30' },
    MEDIUM:   { color: 'text-amber-400',  bg: 'bg-amber-500/15',  bar: 'bg-amber-500',  border: 'border-amber-500/30' },
    HIGH:     { color: 'text-orange-400', bg: 'bg-orange-500/15', bar: 'bg-orange-500', border: 'border-orange-500/30' },
    CRITICAL: { color: 'text-red-400',    bg: 'bg-red-500/15',    bar: 'bg-red-500',    border: 'border-red-500/30' },
};

const FACTOR_META = {
    amount_deviation:      { label: 'Amount Deviation',      icon: TrendingUp, max: 25, desc: 'Z-score vs type mean' },
    type_risk:             { label: 'Transaction Type',      icon: Activity,   max: 15, desc: 'Base risk by type' },
    balance_inconsistency: { label: 'Balance Inconsistency', icon: Target,     max: 20, desc: 'Expected vs actual balance' },
    temporal_risk:         { label: 'Temporal Risk',         icon: Clock,      max: 15, desc: 'Late night / weekend / EOM' },
    round_number:          { label: 'Round Number',          icon: Hash,       max: 10, desc: 'Multiples of 10/100/1K/10K' },
    dest_account:          { label: 'Destination Account',   icon: Users,      max:  5, desc: 'Merchant vs C-to-C transfer' },
    account_velocity:      { label: 'Account Velocity',      icon: Zap,        max: 10, desc: 'Per-account txn frequency' },
};

const HIST_COLORS = ['#22c55e', '#22c55e', '#22c55e', '#f59e0b', '#f59e0b', '#f97316', '#f97316', '#ef4444', '#ef4444', '#dc2626'];

function DarkTip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#1A2035] border border-auditiq-border rounded-lg p-3 text-xs shadow-lg min-w-[140px] z-50">
            <p className="text-white font-medium mb-1">{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.fill || p.stroke || '#8899AA' }}>{p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</p>
            ))}
        </div>
    );
}

export default function RiskScoring() {
    const { dataLoaded, setDataLoaded, setDataStats } = useData();
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    /* table state */
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [bandFilter, setBandFilter] = useState('ALL');
    const [sortCol, setSortCol] = useState('rank');
    const [sortAsc, setSortAsc] = useState(true);
    const [expandedRow, setExpandedRow] = useState(null);
    const rowsPerPage = 15;

    /* account lookup */
    const [acctQuery, setAcctQuery] = useState('');
    const [acctResult, setAcctResult] = useState(null);
    const [acctLoading, setAcctLoading] = useState(false);
    const [acctError, setAcctError] = useState(null);

    useEffect(() => {
        api.get('/upload/status').then(r => { if (r.data.loaded) { setDataLoaded(true); setDataStats(r.data); } }).catch(() => {});
    }, []);

    /* ── run scoring ── */
    const runScoring = async () => {
        setLoading(true); setError(null);
        try { const r = await api.get('/risk/score'); setResult(r.data); }
        catch (err) { setError(err.code === 'ERR_NETWORK' ? 'Backend server not running.' : (err.response?.data?.detail || 'Scoring failed')); }
        setLoading(false);
    };

    /* ── export ── */
    const exportCSV = async () => {
        try {
            const r = await api.get('/risk/export', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([r.data]));
            const a = document.createElement('a'); a.href = url; a.download = 'risk_scored_transactions.csv'; document.body.appendChild(a); a.click(); a.remove();
        } catch (_) {}
    };

    /* ── account lookup ── */
    const lookupAccount = async () => {
        if (!acctQuery.trim()) return;
        setAcctLoading(true); setAcctError(null); setAcctResult(null);
        try { const r = await api.get(`/risk/transaction/${acctQuery.trim()}`); setAcctResult(r.data); }
        catch (err) { setAcctError(err.response?.data?.detail || 'Lookup failed'); }
        setAcctLoading(false);
    };

    /* ── filtered & sorted table ── */
    const topCritical = result?.top_critical || [];
    const filtered = useMemo(() => {
        let rows = topCritical;
        if (searchTerm) rows = rows.filter(r => r.nameOrig.toLowerCase().includes(searchTerm.toLowerCase()) || r.nameDest.toLowerCase().includes(searchTerm.toLowerCase()));
        if (bandFilter !== 'ALL') rows = rows.filter(r => r.risk_band === bandFilter);
        rows = [...rows].sort((a, b) => {
            const va = a[sortCol], vb = b[sortCol];
            if (typeof va === 'number') return sortAsc ? va - vb : vb - va;
            return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });
        return rows;
    }, [topCritical, searchTerm, bandFilter, sortCol, sortAsc]);

    const totalPages = Math.ceil(filtered.length / rowsPerPage);
    const pagedRows = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    const handleSort = (col) => { if (sortCol === col) setSortAsc(!sortAsc); else { setSortCol(col); setSortAsc(col === 'rank'); } setPage(1); };

    const s = result?.summary;

    /* ── account timeline chart ── */
    const acctChartData = useMemo(() => {
        if (!acctResult?.transactions) return [];
        return acctResult.transactions.map((t, i) => ({ name: `Txn ${i + 1}`, score: t.final_score, amount: t.amount, type: t.type }));
    }, [acctResult]);

    return (
        <PageWrapper title="Risk Scoring">
            <div className="flex flex-col gap-5">

                {/* ═══ SECTION 1 — HEADER ═══ */}
                <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-white text-lg font-semibold mb-1">Multi-Factor Risk Scoring Engine</h2>
                        <p className="text-auditiq-muted text-sm">7 weighted scoring factors — amount deviation, type risk, balance gaps, temporal patterns, round numbers, destination type, account velocity</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={runScoring} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 transition-colors text-sm font-medium disabled:opacity-60">
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
                            {loading ? 'Scoring...' : 'Run Scoring'}
                        </button>
                        <button onClick={exportCSV} disabled={!result} className="flex items-center gap-2 px-4 py-2 border border-auditiq-teal text-auditiq-teal rounded-lg hover:bg-auditiq-teal/10 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">
                            <Download size={16} /> Export
                        </button>
                    </div>
                </div>

                {/* alerts */}
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

                {/* loading */}
                {loading && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-16 flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-auditiq-teal/30 border-t-auditiq-teal rounded-full animate-spin" />
                        <p className="text-white font-medium">Computing risk scores across all transactions...</p>
                        <p className="text-auditiq-muted text-sm">Evaluating 7 weighted factors per transaction</p>
                    </div>
                )}

                {/* empty state */}
                {!loading && !result && dataLoaded && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-16 flex flex-col items-center gap-4">
                        <Shield size={64} className="text-auditiq-teal opacity-30" />
                        <p className="text-white font-medium text-lg">Run the Risk Scoring Engine to evaluate every transaction</p>
                        <p className="text-auditiq-muted text-sm">Scores range 0–100 across 7 factors: Amount, Type, Balance, Temporal, Round, Destination, Velocity</p>
                        <button onClick={runScoring} className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 font-medium text-sm"><Shield size={16} /> Run Scoring</button>
                    </div>
                )}

                {result && (
                    <>
                        {/* ═══ SECTION 2 — SCORE BAND CARDS ═══ */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(band => {
                                const meta = BAND_META[band];
                                const count = s.score_distribution[band] || 0;
                                const pctVal = s.score_distribution_pct[band] || 0;
                                return (
                                    <div key={band} className={`bg-auditiq-card border ${meta.border} rounded-xl p-5 relative overflow-hidden`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>{band}</span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.bg} ${meta.color}`}>{pct(pctVal)}</span>
                                        </div>
                                        <div className="text-3xl font-bold text-white mb-1">{count.toLocaleString()}</div>
                                        <p className="text-xs text-auditiq-muted">transactions</p>
                                        <div className="absolute bottom-0 left-0 right-0 h-1">
                                            <div className={`h-full ${meta.bar} transition-all`} style={{ width: `${pctVal}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* ═══ SECTION 3 — SCORE QUALITY ═══ */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Separation */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <p className="text-xs text-auditiq-muted mb-2 uppercase tracking-wider">Score Separation</p>
                                <div className="text-2xl font-bold text-white mb-1">{s.score_separation} pts</div>
                                <p className="text-xs text-auditiq-muted">Fraud avg <span className="text-red-400">{s.confirmed_fraud_mean_score}</span> vs Legit avg <span className="text-green-400">{s.legitimate_mean_score}</span></p>
                                <div className="mt-3 h-2 bg-auditiq-border rounded-full overflow-hidden flex">
                                    <div className="h-full bg-green-500" style={{ width: `${s.legitimate_mean_score}%` }} />
                                    <div className="h-full bg-red-500" style={{ width: `${Math.max(s.confirmed_fraud_mean_score - s.legitimate_mean_score, 0)}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-auditiq-muted mt-1">
                                    <span>0</span><span>Legit avg</span><span>Fraud avg</span><span>100</span>
                                </div>
                            </div>

                            {/* Mean Score Ring */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5 flex items-center gap-5">
                                <div className="relative w-20 h-20 shrink-0">
                                    <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                                        <circle cx="40" cy="40" r="34" fill="none" stroke="#1E2D45" strokeWidth="8" />
                                        <circle cx="40" cy="40" r="34" fill="none" stroke={s.mean_score > 50 ? '#EF4444' : s.mean_score > 30 ? '#F59E0B' : '#22C55E'} strokeWidth="8" strokeDasharray={`${(s.mean_score / 100) * 213.6} 213.6`} strokeLinecap="round" />
                                    </svg>
                                    <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-lg">{s.mean_score}</span>
                                </div>
                                <div>
                                    <p className="text-xs text-auditiq-muted uppercase tracking-wider mb-1">Mean Risk Score</p>
                                    <p className="text-sm text-auditiq-text">Median: <span className="text-white font-medium">{s.median_score}</span></p>
                                    <p className="text-sm text-auditiq-text">Total scored: <span className="text-white font-medium">{s.total_scored.toLocaleString()}</span></p>
                                </div>
                            </div>

                            {/* High + Critical */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <p className="text-xs text-auditiq-muted mb-2 uppercase tracking-wider">High + Critical</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-bold text-red-400">{s.high_critical_count.toLocaleString()}</span>
                                    <span className="text-sm text-auditiq-muted">/ {s.total_scored.toLocaleString()}</span>
                                </div>
                                <p className="text-xs text-auditiq-muted mt-1">{pct(s.high_critical_pct)} of all transactions require attention</p>
                                <div className="mt-3 h-2 bg-auditiq-border rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${s.high_critical_pct}%` }} />
                                </div>
                            </div>
                        </div>

                        {/* ═══ SECTION 4 — CHARTS ROW ═══ */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                            {/* Histogram */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h3 className="text-base font-semibold text-auditiq-text mb-4">Score Distribution Histogram</h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={result.score_histogram}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
                                        <XAxis dataKey="bucket" tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} />
                                        <YAxis tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} />
                                        <Tooltip content={<DarkTip />} />
                                        <Bar dataKey="count" name="Transactions" radius={[4, 4, 0, 0]}>
                                            {result.score_histogram.map((_, i) => <Cell key={i} fill={HIST_COLORS[i] || '#22c55e'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                <p className="text-[10px] text-auditiq-muted text-center mt-2">Color gradient: green (low risk) → red (critical)</p>
                            </div>

                            {/* Risk by type */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h3 className="text-base font-semibold text-auditiq-text mb-4">Risk Profile by Transaction Type</h3>
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart data={Object.entries(result.risk_by_type).map(([type, v]) => ({ type, meanScore: v.mean_score, hcPct: v.high_critical_pct, count: v.count }))} layout="vertical" margin={{ left: 20, right: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" horizontal={false} />
                                        <XAxis type="number" tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} />
                                        <YAxis type="category" dataKey="type" width={90} tick={{ fill: '#E8EDF5', fontSize: 12 }} axisLine={false} />
                                        <Tooltip content={<DarkTip />} />
                                        <Bar dataKey="meanScore" name="Mean Score" barSize={20} radius={[0, 4, 4, 0]}>
                                            {Object.entries(result.risk_by_type).map(([type], i) => {
                                                const v = result.risk_by_type[type];
                                                return <Cell key={i} fill={v.mean_score > 40 ? '#EF4444' : v.mean_score > 25 ? '#F59E0B' : '#22C55E'} />;
                                            })}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                <div className="flex flex-wrap gap-2 mt-3 justify-center">
                                    {Object.entries(result.risk_by_type).map(([type, v]) => (
                                        <span key={type} className="text-[10px] px-2 py-1 rounded-full bg-auditiq-bg text-auditiq-muted">
                                            {type}: <span className={v.high_critical_pct > 10 ? 'text-red-400' : 'text-auditiq-text'}>{pct(v.high_critical_pct)}</span> H/C
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ═══ SECTION 5 — FACTOR BREAKDOWN ═══ */}
                        <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                            <h3 className="text-base font-semibold text-auditiq-text mb-1">Factor Contribution Breakdown</h3>
                            <p className="text-xs text-auditiq-muted mb-5">Each factor's average contribution to the total risk score (max 100 pts combined)</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                                {Object.entries(FACTOR_META).map(([key, meta]) => {
                                    const fa = result.factor_analysis[key];
                                    if (!fa) return null;
                                    const fillPct = Math.min((fa.mean_contribution / meta.max) * 100, 100);
                                    const barColor = fillPct > 60 ? 'bg-red-500' : fillPct > 30 ? 'bg-amber-500' : 'bg-auditiq-teal';
                                    return (
                                        <div key={key} className="bg-auditiq-bg border border-auditiq-border rounded-lg p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className="w-8 h-8 rounded-lg bg-auditiq-teal/10 flex items-center justify-center">
                                                    <meta.icon size={16} className="text-auditiq-teal" />
                                                </div>
                                                <div>
                                                    <p className="text-xs text-white font-medium">{meta.label}</p>
                                                    <p className="text-[10px] text-auditiq-muted">Max {meta.max} pts</p>
                                                </div>
                                            </div>
                                            <div className="flex items-baseline gap-1 mb-1">
                                                <span className="text-lg font-bold text-white">{fa.mean_contribution}</span>
                                                <span className="text-xs text-auditiq-muted">avg pts</span>
                                            </div>
                                            <div className="h-1.5 bg-auditiq-border rounded-full overflow-hidden mb-2">
                                                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${fillPct}%` }} />
                                            </div>
                                            <p className="text-[10px] text-auditiq-muted">{meta.desc}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ═══ SECTION 6 — TOP CRITICAL TABLE ═══ */}
                        <div className="bg-auditiq-card border border-auditiq-border rounded-xl overflow-hidden">
                            {/* Controls */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-auditiq-border">
                                <div>
                                    <h3 className="text-base font-semibold text-auditiq-text">Top Risk Transactions</h3>
                                    <p className="text-xs text-auditiq-muted mt-0.5">{filtered.length} transactions shown — click row to expand factor breakdown</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-auditiq-muted" />
                                        <input type="text" placeholder="Search account..." value={searchTerm}
                                            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                                            className="bg-auditiq-bg border border-auditiq-border rounded-lg pl-9 pr-3 py-2 text-sm text-auditiq-text placeholder:text-auditiq-muted focus:outline-none focus:border-auditiq-teal w-48" />
                                    </div>
                                    <div className="relative">
                                        <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-auditiq-muted pointer-events-none" />
                                        <select value={bandFilter} onChange={e => { setBandFilter(e.target.value); setPage(1); }}
                                            className="bg-auditiq-bg border border-auditiq-border rounded-lg pl-9 pr-3 py-2 text-sm text-auditiq-text focus:outline-none focus:border-auditiq-teal appearance-none cursor-pointer">
                                            <option value="ALL">All Bands</option>
                                            <option value="CRITICAL">CRITICAL</option>
                                            <option value="HIGH">HIGH</option>
                                            <option value="MEDIUM">MEDIUM</option>
                                            <option value="LOW">LOW</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-auditiq-bg sticky top-0 z-10">
                                        <tr>
                                            {[
                                                { key: 'rank', label: '#' },
                                                { key: 'final_score', label: 'Score' },
                                                { key: 'risk_band', label: 'Band' },
                                                { key: 'type', label: 'Type' },
                                                { key: 'amount', label: 'Amount' },
                                                { key: 'nameOrig', label: 'Sender' },
                                                { key: 'nameDest', label: 'Receiver' },
                                                { key: 'step', label: 'Step' },
                                                { key: 'isFraud', label: 'Fraud' },
                                            ].map(col => (
                                                <th key={col.key} onClick={() => handleSort(col.key)}
                                                    className="text-left px-3 py-2 text-auditiq-teal uppercase tracking-wider font-medium cursor-pointer hover:text-white select-none">
                                                    <span className="flex items-center gap-1">
                                                        {col.label}
                                                        {sortCol === col.key && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                                                    </span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pagedRows.map((row, idx) => {
                                            const bm = BAND_META[row.risk_band] || BAND_META.LOW;
                                            const isExpanded = expandedRow === row.rank;
                                            return (
                                                <React.Fragment key={row.rank}>
                                                    <tr onClick={() => setExpandedRow(isExpanded ? null : row.rank)}
                                                        className={`border-t border-auditiq-border/50 cursor-pointer hover:bg-[rgba(0,194,203,0.04)] transition-colors ${idx % 2 === 0 ? 'bg-auditiq-card' : 'bg-[#1A2035]'}`}>
                                                        <td className="px-3 py-2 text-auditiq-muted">{row.rank}</td>
                                                        <td className="px-3 py-2">
                                                            <span className={`font-bold ${row.final_score >= 75 ? 'text-red-400' : row.final_score >= 50 ? 'text-orange-400' : row.final_score >= 25 ? 'text-amber-400' : 'text-green-400'}`}>
                                                                {row.final_score}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-medium ${bm.bg} ${bm.color}`}>{row.risk_band}</span></td>
                                                        <td className="px-3 py-2 text-auditiq-text">{row.type}</td>
                                                        <td className="px-3 py-2 text-auditiq-text whitespace-nowrap">{fmt(row.amount)}</td>
                                                        <td className="px-3 py-2 text-auditiq-text font-mono">{row.nameOrig?.substring(0, 14)}</td>
                                                        <td className="px-3 py-2 text-auditiq-text font-mono">{row.nameDest?.substring(0, 14)}</td>
                                                        <td className="px-3 py-2 text-auditiq-muted">{row.step}</td>
                                                        <td className="px-3 py-2">{row.isFraud === 1 && <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-medium">FRAUD</span>}</td>
                                                    </tr>
                                                    {isExpanded && (
                                                        <tr className="bg-[rgba(0,194,203,0.03)]">
                                                            <td colSpan={9} className="px-4 py-4">
                                                                <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                                                                    {Object.entries(row.factor_breakdown || {}).map(([key, val]) => {
                                                                        const fm = FACTOR_META[key];
                                                                        if (!fm) return null;
                                                                        const fillPct = (val / fm.max) * 100;
                                                                        return (
                                                                            <div key={key} className="bg-auditiq-bg border border-auditiq-border rounded-lg p-2.5 text-center">
                                                                                <p className="text-[10px] text-auditiq-muted mb-1">{fm.label}</p>
                                                                                <p className="text-sm font-bold text-white">{val}<span className="text-auditiq-muted font-normal">/{fm.max}</span></p>
                                                                                <div className="h-1 bg-auditiq-border rounded-full overflow-hidden mt-1.5">
                                                                                    <div className={`h-full rounded-full ${fillPct > 60 ? 'bg-red-500' : fillPct > 30 ? 'bg-amber-500' : 'bg-auditiq-teal'}`} style={{ width: `${fillPct}%` }} />
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <div className="flex flex-wrap gap-4 mt-3 text-xs text-auditiq-muted">
                                                                    <span>Balance: {fmt(row.oldbalanceOrg)} → {fmt(row.newbalanceOrig)}</span>
                                                                    <span>Dest Balance: {fmt(row.oldbalanceDest)} → {fmt(row.newbalanceDest)}</span>
                                                                    <span>Hour: {row.hour} | Day: {row.day}</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-between px-4 py-3 border-t border-auditiq-border">
                                <span className="text-auditiq-muted text-xs">
                                    {filtered.length > 0 ? `Rows ${(page - 1) * rowsPerPage + 1}–${Math.min(page * rowsPerPage, filtered.length)} of ${filtered.length}` : 'No results'}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded text-auditiq-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
                                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                        let p;
                                        if (totalPages <= 7) p = i + 1;
                                        else if (page <= 4) p = i + 1;
                                        else if (page >= totalPages - 3) p = totalPages - 6 + i;
                                        else p = page - 3 + i;
                                        return (
                                            <button key={p} onClick={() => setPage(p)}
                                                className={`w-7 h-7 rounded text-xs font-medium transition-colors ${p === page ? 'bg-auditiq-teal text-white' : 'text-auditiq-muted hover:text-white hover:bg-white/5'}`}>
                                                {p}
                                            </button>
                                        );
                                    })}
                                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded text-auditiq-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
                                </div>
                            </div>
                        </div>

                        {/* ═══ SECTION 7 — ACCOUNT LOOKUP ═══ */}
                        <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                            <h3 className="text-base font-semibold text-auditiq-text mb-1">Account Risk Lookup</h3>
                            <p className="text-xs text-auditiq-muted mb-4">Search by account ID (nameOrig) to see all scored transactions for that account</p>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="relative flex-1 max-w-md">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-auditiq-muted" />
                                    <input type="text" placeholder="e.g. C1234567890" value={acctQuery}
                                        onChange={e => setAcctQuery(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && lookupAccount()}
                                        className="w-full bg-auditiq-bg border border-auditiq-border rounded-lg pl-9 pr-3 py-2 text-sm text-auditiq-text placeholder:text-auditiq-muted focus:outline-none focus:border-auditiq-teal" />
                                </div>
                                <button onClick={lookupAccount} disabled={acctLoading || !acctQuery.trim()}
                                    className="flex items-center gap-2 px-4 py-2 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 text-sm font-medium disabled:opacity-40">
                                    {acctLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpRight size={14} />} Lookup
                                </button>
                            </div>

                            {acctError && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2 mb-4">
                                    <XCircle className="text-red-500" size={14} /><span className="text-red-400 text-sm">{acctError}</span>
                                </div>
                            )}

                            {acctResult && (
                                <div className="space-y-4">
                                    {/* Account summary */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[
                                            { label: 'Account', value: acctResult.account?.substring(0, 14), c: 'text-auditiq-teal' },
                                            { label: 'Transactions', value: acctResult.total_transactions, c: 'text-white' },
                                            { label: 'Mean Score', value: acctResult.mean_risk_score, c: acctResult.mean_risk_score > 50 ? 'text-red-400' : 'text-amber-400' },
                                            { label: 'Max Score', value: acctResult.max_risk_score, c: acctResult.max_risk_score >= 75 ? 'text-red-400' : 'text-amber-400' },
                                        ].map((s, i) => (
                                            <div key={i} className="bg-auditiq-bg border border-auditiq-border rounded-lg p-3 text-center">
                                                <p className="text-[10px] text-auditiq-muted uppercase mb-1">{s.label}</p>
                                                <p className={`text-lg font-bold ${s.c}`}>{s.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Timeline chart */}
                                    {acctChartData.length > 0 && (
                                        <div>
                                            <p className="text-xs text-auditiq-muted mb-2">Risk Score Timeline</p>
                                            <ResponsiveContainer width="100%" height={180}>
                                                <BarChart data={acctChartData}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
                                                    <XAxis dataKey="name" tick={{ fill: '#8899AA', fontSize: 9 }} axisLine={false} />
                                                    <YAxis tick={{ fill: '#8899AA', fontSize: 10 }} axisLine={false} domain={[0, 100]} />
                                                    <Tooltip content={<DarkTip />} />
                                                    <Bar dataKey="score" name="Risk Score" radius={[4, 4, 0, 0]}>
                                                        {acctChartData.map((d, i) => <Cell key={i} fill={d.score >= 75 ? '#EF4444' : d.score >= 50 ? '#F97316' : d.score >= 25 ? '#F59E0B' : '#22C55E'} />)}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}

                                    {/* Account transactions table */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead className="bg-auditiq-bg">
                                                <tr>
                                                    {['Score', 'Band', 'Type', 'Amount', 'Receiver', 'Step', 'Fraud'].map(h => (
                                                        <th key={h} className="text-left px-3 py-2 text-auditiq-teal uppercase tracking-wider font-medium">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {acctResult.transactions.map((t, i) => {
                                                    const bm = BAND_META[t.risk_band] || BAND_META.LOW;
                                                    return (
                                                        <tr key={i} className={`border-t border-auditiq-border/50 ${i % 2 === 0 ? 'bg-auditiq-card' : 'bg-[#1A2035]'}`}>
                                                            <td className="px-3 py-2"><span className={`font-bold ${t.final_score >= 75 ? 'text-red-400' : t.final_score >= 50 ? 'text-orange-400' : 'text-amber-400'}`}>{t.final_score}</span></td>
                                                            <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-medium ${bm.bg} ${bm.color}`}>{t.risk_band}</span></td>
                                                            <td className="px-3 py-2 text-auditiq-text">{t.type}</td>
                                                            <td className="px-3 py-2 text-auditiq-text whitespace-nowrap">{fmt(t.amount)}</td>
                                                            <td className="px-3 py-2 text-auditiq-text font-mono">{t.nameDest?.substring(0, 14)}</td>
                                                            <td className="px-3 py-2 text-auditiq-muted">{t.step}</td>
                                                            <td className="px-3 py-2">{t.isFraud === 1 && <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-medium">FRAUD</span>}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </PageWrapper>
    );
}
