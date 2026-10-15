import React, { useState, useEffect, useMemo } from 'react';
import PageWrapper from '../components/PageWrapper';
import api from '../api/client';
import {
    Copy, Download, Clock, GitBranch, Layers, ArrowLeftRight,
    AlertTriangle, Search, ChevronDown, ChevronUp, Loader2, ChevronLeft, ChevronRight, Zap
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Cell, ReferenceLine, Legend
} from 'recharts';

/* ───── colours ───── */
const BAND_CLR = { CRITICAL: '#EF4444', HIGH: '#F97316', MEDIUM: '#F59E0B', LOW: '#22C55E' };
const PAT_CLR = { EXACT_DUPLICATE: '#EF4444', NEAR_TIME_CLONE: '#F59E0B', AMOUNT_CLONE: '#8B5CF6', STRUCTURING: '#EF4444', MIRROR: '#F59E0B' };
const PAT_LABELS = { EXACT_DUPLICATE: 'Exact Duplicates', NEAR_TIME_CLONE: 'Near-Time Clones', AMOUNT_CLONE: 'Amount Cloning', STRUCTURING: 'Structuring', MIRROR: 'Mirror Txns' };

const fmt$ = (v) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtN = (v) => Number(v).toLocaleString();

const TABS = [
    { key: 'exact', label: 'Exact Duplicates', field: 'exact_duplicates', countKey: 'exact_duplicates_found' },
    { key: 'clones', label: 'Near-Time Clones', field: 'near_time_clones', countKey: 'near_time_clones_found' },
    { key: 'amount', label: 'Amount Cloning', field: 'amount_clones', countKey: 'amount_clone_groups' },
    { key: 'structuring', label: 'Structuring', field: 'structuring', countKey: 'structuring_groups_found' },
    { key: 'mirror', label: 'Mirror Txns', field: 'mirror_transactions', countKey: 'mirror_pairs_found' },
];

const LOADING_MSGS = [
    'Detecting exact duplicates…', 'Finding near-time clones…', 'Identifying amount cloning…',
    'Analyzing structuring patterns…', 'Mapping mirror transactions…',
];

const RECS = {
    CRITICAL: [
        'Freeze flagged accounts pending investigation',
        'File Suspicious Activity Reports (SARs) for structuring groups',
        'Escalate mirror transactions to AML team',
        'Engage forensic accounting for full review',
        'Preserve transaction audit trail for regulators',
    ],
    HIGH: [
        'Initiate secondary review of flagged transactions',
        'Cross-reference against customer KYC records',
        'Alert compliance team to structuring patterns',
        'Request source of funds documentation',
    ],
    MEDIUM: [
        'Monitor flagged accounts for continued activity',
        'Document findings in audit workpapers',
        'Schedule follow-up review in 30 days',
    ],
    LOW: [
        'No immediate action required',
        'Patterns within acceptable thresholds',
        'Continue routine transaction monitoring',
    ],
};

/* helper: circular risk badge */
function RiskBadge({ score }) {
    const clr = score >= 75 ? '#EF4444' : score >= 50 ? '#F97316' : score >= 30 ? '#F59E0B' : '#22C55E';
    return (
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold border-2" style={{ borderColor: clr, color: clr }}>
            {score}
        </div>
    );
}

export default function DuplicateDetection() {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [msgIdx, setMsgIdx] = useState(0);
    const [activeTab, setActiveTab] = useState('exact');
    const [expandedRows, setExpandedRows] = useState({});
    const [sortCol, setSortCol] = useState('risk_score');
    const [sortDir, setSortDir] = useState('desc');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;

    useEffect(() => {
        if (!loading) return;
        const t = setInterval(() => setMsgIdx(i => (i + 1) % LOADING_MSGS.length), 2200);
        return () => clearInterval(t);
    }, [loading]);

    const runAnalysis = async () => {
        setLoading(true); setResult(null); setMsgIdx(0);
        try { const r = await api.get('/duplicates/analysis'); setResult(r.data); }
        catch (e) { alert(e.response?.data?.detail || 'Analysis failed'); }
        finally { setLoading(false); }
    };

    const exportPattern = async (pat) => {
        try {
            const r = await api.get(`/duplicates/export/${pat}`, { responseType: 'blob' });
            const url = URL.createObjectURL(r.data);
            const a = document.createElement('a'); a.href = url; a.download = `duplicates_${pat}.csv`; document.body.appendChild(a); a.click(); a.remove();
        } catch { alert('Export failed — run analysis first'); }
    };

    const toggleRow = (id) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

    /* sorted/paged data for current tab */
    const tabData = useMemo(() => {
        if (!result) return [];
        const tab = TABS.find(t => t.key === activeTab);
        let items = [...(result[tab.field] || [])];
        items.sort((a, b) => {
            const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0;
            return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
        });
        return items;
    }, [result, activeTab, sortCol, sortDir]);

    const pagedData = tabData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(tabData.length / PAGE_SIZE));

    const s = result?.summary;
    const ps = result?.pattern_summary;

    /* ── chart data ── */
    const distChartData = ps ? Object.entries(PAT_LABELS).map(([k, label]) => ({
        name: label, count: ps[k]?.count || 0, fill: PAT_CLR[k],
    })) : [];

    const riskChartData = ps ? Object.entries(PAT_LABELS).map(([k, label]) => ({
        name: label.length > 12 ? label.slice(0, 12) + '…' : label,
        meanRisk: ps[k]?.mean_risk || 0,
        fill: PAT_CLR[k],
    })) : [];

    /* ═══════════════ RENDER ═══════════════ */
    return (
        <PageWrapper title="Duplicate Detection">
            <div className="space-y-6 pb-12">

                {/* ── SECTION 1: HEADER ── */}
                <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-white text-lg font-semibold mb-1">Transaction Duplication &amp; Structuring Detection</h2>
                        <p className="text-auditiq-muted text-sm">Detects exact duplicates, near-time clones, amount cloning, structuring (smurfing), and mirror transaction fraud</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={runAnalysis} disabled={loading} className="flex items-center gap-2 bg-auditiq-teal text-black font-semibold px-5 py-2.5 rounded-lg hover:brightness-110 disabled:opacity-50 transition">
                            {loading ? <Loader2 className="animate-spin" size={16} /> : <Copy size={16} />} Run Detection
                        </button>
                        {result && (
                            <button onClick={() => exportPattern('all')} className="flex items-center gap-2 border border-auditiq-border text-auditiq-text px-4 py-2.5 rounded-lg hover:bg-white/5 transition">
                                <Download size={16} /> Export All
                            </button>
                        )}
                    </div>
                </div>

                {/* sample banner */}
                {result && s.sample_used && (
                    <div className="bg-amber-500/8 border border-amber-500/20 rounded-lg px-4 py-3 flex items-center gap-2 text-amber-400 text-sm">
                        <Zap size={16} /> Analysis ran on a {fmtN(s.sample_size)}-row stratified sample (all fraud rows included) for performance.
                    </div>
                )}

                {/* ── LOADING STATE ── */}
                {loading && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-12 flex flex-col items-center gap-4">
                        <Loader2 className="animate-spin text-auditiq-teal" size={40} />
                        <p className="text-white font-medium">{LOADING_MSGS[msgIdx]}</p>
                    </div>
                )}

                {/* ── EMPTY STATE ── */}
                {!result && !loading && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-16 flex flex-col items-center gap-5">
                        <Copy className="text-auditiq-teal opacity-30" size={56} />
                        <p className="text-white font-medium text-lg">Run Detection to find duplicate and structuring patterns</p>
                        <div className="flex gap-3">
                            {['Exact & Near Duplicates', 'Structuring / Smurfing', 'Mirror Round-Trips'].map(t => (
                                <span key={t} className="px-3 py-1 bg-auditiq-teal/10 text-auditiq-teal text-xs rounded-full">{t}</span>
                            ))}
                        </div>
                        <button onClick={runAnalysis} className="mt-2 flex items-center gap-2 bg-auditiq-teal text-black font-semibold px-6 py-2.5 rounded-lg hover:brightness-110 transition">
                            <Copy size={16} /> Run Detection
                        </button>
                    </div>
                )}

                {/* ═══════════ RESULTS ═══════════ */}
                {result && (
                    <>
                        {/* ── SECTION 2: SUMMARY CARDS ── */}
                        <div className="grid grid-cols-5 gap-4">
                            {[
                                { icon: Copy, label: 'Exact Duplicates', val: s.exact_duplicates_found, sub: 'Identical txns within 3hrs', clr: s.exact_duplicates_found > 0 ? '#EF4444' : '#22C55E' },
                                { icon: Clock, label: 'Near-Time Clones', val: s.near_time_clones_found, sub: 'Same txn repeated 4–24hrs later', clr: s.near_time_clones_found > 5 ? '#F59E0B' : '#22C55E' },
                                { icon: GitBranch, label: 'Amount Cloning', val: s.amount_clone_groups, sub: 'Same amount to multiple dests', clr: s.amount_clone_groups > 10 ? '#F59E0B' : '#22C55E' },
                                { icon: Layers, label: 'Structuring Groups', val: s.structuring_groups_found, sub: 'Split txns near thresholds', clr: s.structuring_groups_found > 0 ? '#EF4444' : '#22C55E', pulse: s.structuring_groups_found > 0 },
                                { icon: ArrowLeftRight, label: 'Mirror Transactions', val: s.mirror_pairs_found, sub: 'Round-trip transaction pairs', clr: s.mirror_pairs_found > 20 ? '#EF4444' : s.mirror_pairs_found > 5 ? '#F59E0B' : '#22C55E' },
                            ].map((c, i) => (
                                <div key={i} className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: c.clr + '15' }}>
                                            <c.icon size={18} style={{ color: c.clr }} />
                                        </div>
                                        <span className="text-xs text-auditiq-muted">{c.label}</span>
                                    </div>
                                    <div className={`text-2xl font-bold mb-1 ${c.pulse ? 'animate-pulse' : ''}`} style={{ color: c.clr }}>{fmtN(c.val)}</div>
                                    <p className="text-[10px] text-auditiq-muted">{c.sub}</p>
                                </div>
                            ))}
                        </div>

                        {/* total flagged banner */}
                        <div className="bg-red-500/6 border border-red-500/20 rounded-lg px-5 py-3 flex items-center justify-between">
                            <span className="text-red-400 text-sm font-medium">
                                Total flagged transactions: <strong>{fmtN(s.total_flagged_transactions)}</strong> | Estimated fraudulent value: <strong>{fmt$(s.estimated_fraudulent_value)}</strong>
                            </span>
                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${s.overall_risk === 'CRITICAL' ? 'bg-red-500/20 text-red-400 animate-pulse' : s.overall_risk === 'HIGH' ? 'bg-orange-500/20 text-orange-400' : s.overall_risk === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}>
                                {s.overall_risk}
                            </span>
                        </div>

                        {/* ── SECTION 3: CHARTS ── */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* pattern distribution */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h3 className="text-base font-semibold text-auditiq-text mb-4">Pattern Distribution</h3>
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={distChartData} layout="vertical" margin={{ left: 20, right: 30 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                                        <XAxis type="number" tick={{ fill: '#8899AA', fontSize: 11 }} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: '#8899AA', fontSize: 10 }} width={100} />
                                        <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8 }} />
                                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                                            {distChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                        </Bar>
                                        <ReferenceLine x={0} stroke="#334155" label={{ value: 'None', fill: '#64748B', fontSize: 10, position: 'right' }} />
                                    </BarChart>
                                </ResponsiveContainer>
                                <p className="text-xs text-auditiq-muted mt-2">
                                    Highest risk pattern: <span className="text-red-400 font-medium">{PAT_LABELS[s.highest_risk_pattern] || 'None'}</span>
                                </p>
                            </div>

                            {/* risk scores */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h3 className="text-base font-semibold text-auditiq-text mb-4">Mean Risk Score per Pattern</h3>
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={riskChartData} margin={{ left: 0, right: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                                        <XAxis dataKey="name" tick={{ fill: '#8899AA', fontSize: 9 }} />
                                        <YAxis tick={{ fill: '#8899AA', fontSize: 11 }} domain={[0, 100]} />
                                        <Tooltip contentStyle={{ background: '#0F172A', border: '1px solid #1E293B', borderRadius: 8 }} />
                                        <ReferenceLine y={50} stroke="#F59E0B" strokeDasharray="6 3" label={{ value: 'HIGH', fill: '#F59E0B', fontSize: 10 }} />
                                        <ReferenceLine y={75} stroke="#EF4444" strokeDasharray="6 3" label={{ value: 'CRITICAL', fill: '#EF4444', fontSize: 10 }} />
                                        <Bar dataKey="meanRisk" radius={[4, 4, 0, 0]} barSize={28}>
                                            {riskChartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* ── SECTION 4: TABBED EXPLORER ── */}
                        <div className="bg-auditiq-card border border-auditiq-border rounded-xl overflow-hidden">
                            {/* tab bar */}
                            <div className="flex border-b border-auditiq-border overflow-x-auto">
                                {TABS.map(tab => {
                                    const cnt = s[tab.countKey] || 0;
                                    const isActive = activeTab === tab.key;
                                    return (
                                        <button key={tab.key}
                                            onClick={() => { setActiveTab(tab.key); setPage(1); setExpandedRows({}); }}
                                            className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${isActive ? 'text-auditiq-teal border-auditiq-teal bg-[rgba(0,194,203,0.06)]' : 'text-auditiq-muted border-transparent hover:text-white'}`}
                                        >
                                            {tab.label}
                                            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${cnt > 0 ? 'bg-red-500/20 text-red-400' : 'bg-gray-600/30 text-gray-500'}`}>
                                                {cnt || 'None'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* table */}
                            <div className="p-4">
                                {tabData.length === 0 ? (
                                    <div className="text-center py-12 text-auditiq-muted">No patterns found in this category</div>
                                ) : (
                                    <>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-auditiq-border">
                                                        {activeTab === 'mirror'
                                                            ? ['risk_score', 'account_a', 'account_b', 'forward_amount', 'reverse_amount', 'step_gap', 'forward_fraud'].map(h => (
                                                                <th key={h} className="px-3 py-2 text-left text-auditiq-muted text-xs uppercase cursor-pointer hover:text-white"
                                                                    onClick={() => { setSortCol(h); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); setPage(1); }}>
                                                                    {h.replace(/_/g, ' ')} {sortCol === h && (sortDir === 'asc' ? '↑' : '↓')}
                                                                </th>
                                                            ))
                                                            : activeTab === 'amount'
                                                                ? ['risk_score', 'nameOrig', 'amount', 'destination_count', 'fraud_count'].map(h => (
                                                                    <th key={h} className="px-3 py-2 text-left text-auditiq-muted text-xs uppercase cursor-pointer hover:text-white"
                                                                        onClick={() => { setSortCol(h); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); setPage(1); }}>
                                                                        {h.replace(/_/g, ' ')} {sortCol === h && (sortDir === 'asc' ? '↑' : '↓')}
                                                                    </th>
                                                                ))
                                                                : activeTab === 'structuring'
                                                                    ? ['risk_score', 'nameOrig', 'type', 'transaction_count', 'total_amount', 'nearest_threshold', 'threshold_proximity_pct', 'fraud_count'].map(h => (
                                                                        <th key={h} className="px-3 py-2 text-left text-auditiq-muted text-xs uppercase cursor-pointer hover:text-white"
                                                                            onClick={() => { setSortCol(h); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); setPage(1); }}>
                                                                            {h === 'threshold_proximity_pct' ? 'Proximity %' : h.replace(/_/g, ' ')} {sortCol === h && (sortDir === 'asc' ? '↑' : '↓')}
                                                                        </th>
                                                                    ))
                                                                    : ['risk_score', 'type', 'amount', 'nameOrig', 'nameDest', 'occurrences', 'min_step_gap', 'fraud_count'].map(h => (
                                                                        <th key={h} className="px-3 py-2 text-left text-auditiq-muted text-xs uppercase cursor-pointer hover:text-white"
                                                                            onClick={() => { setSortCol(h); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); setPage(1); }}>
                                                                            {h.replace(/_/g, ' ')} {sortCol === h && (sortDir === 'asc' ? '↑' : '↓')}
                                                                        </th>
                                                                    ))
                                                        }
                                                        <th className="px-3 py-2 text-left text-auditiq-muted text-xs"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {pagedData.map((row, ri) => {
                                                        const rowKey = `${activeTab}-${ri}-${page}`;
                                                        const expanded = expandedRows[rowKey];
                                                        return (
                                                            <React.Fragment key={rowKey}>
                                                                <tr className="border-b border-auditiq-border/50 hover:bg-white/[0.02] transition">
                                                                    {activeTab === 'mirror' ? (
                                                                        <>
                                                                            <td className="px-3 py-2"><RiskBadge score={row.risk_score} /></td>
                                                                            <td className="px-3 py-2 text-auditiq-text font-mono text-xs">{row.account_a}</td>
                                                                            <td className="px-3 py-2 text-auditiq-text font-mono text-xs">{row.account_b}</td>
                                                                            <td className="px-3 py-2 text-white">{fmt$(row.forward_amount)}</td>
                                                                            <td className="px-3 py-2 text-white">{fmt$(row.reverse_amount)}</td>
                                                                            <td className="px-3 py-2">
                                                                                <span className={`text-xs font-medium ${row.step_gap < 12 ? 'text-red-400' : row.step_gap < 24 ? 'text-amber-400' : 'text-auditiq-muted'}`}>
                                                                                    {row.step_gap}hrs {row.step_gap < 12 && '⚡'}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-3 py-2">
                                                                                {(row.forward_fraud && row.reverse_fraud) ? <span className="text-red-400 text-xs font-medium">✓ Both Fraud</span>
                                                                                    : (row.forward_fraud || row.reverse_fraud) ? <span className="text-amber-400 text-xs">Partial</span>
                                                                                        : null}
                                                                            </td>
                                                                        </>
                                                                    ) : activeTab === 'amount' ? (
                                                                        <>
                                                                            <td className="px-3 py-2"><RiskBadge score={row.risk_score} /></td>
                                                                            <td className="px-3 py-2 text-auditiq-text font-mono text-xs">{row.nameOrig}</td>
                                                                            <td className="px-3 py-2 text-white">{fmt$(row.amount)}</td>
                                                                            <td className="px-3 py-2"><span className="bg-purple-500/15 text-purple-400 text-xs px-2 py-0.5 rounded">{row.destination_count}</span></td>
                                                                            <td className="px-3 py-2">{row.fraud_count > 0 && <span className="bg-red-500/15 text-red-400 text-xs px-2 py-0.5 rounded">{row.fraud_count}</span>}</td>
                                                                        </>
                                                                    ) : activeTab === 'structuring' ? (
                                                                        <>
                                                                            <td className="px-3 py-2"><RiskBadge score={row.risk_score} /></td>
                                                                            <td className="px-3 py-2 text-auditiq-text font-mono text-xs">{row.nameOrig}</td>
                                                                            <td className="px-3 py-2 text-white">{row.type}</td>
                                                                            <td className="px-3 py-2 text-white">{row.transaction_count}</td>
                                                                            <td className="px-3 py-2 text-white">{fmt$(row.total_amount)}</td>
                                                                            <td className="px-3 py-2 text-auditiq-muted">{fmt$(row.nearest_threshold)}</td>
                                                                            <td className="px-3 py-2">
                                                                                <span className={`text-xs font-medium ${row.threshold_proximity_pct < 1 ? 'text-red-400 font-bold' : row.threshold_proximity_pct < 3 ? 'text-amber-400' : 'text-auditiq-muted'}`}>
                                                                                    {row.threshold_proximity_pct}%{row.threshold_proximity_pct < 1 && ' — near exact'}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-3 py-2">{row.fraud_count > 0 && <span className="bg-red-500/15 text-red-400 text-xs px-2 py-0.5 rounded">{row.fraud_count}</span>}</td>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <td className="px-3 py-2"><RiskBadge score={row.risk_score} /></td>
                                                                            <td className="px-3 py-2 text-white">{row.type}</td>
                                                                            <td className="px-3 py-2 text-white">{fmt$(row.amount)}</td>
                                                                            <td className="px-3 py-2 text-auditiq-text font-mono text-xs">{row.nameOrig}</td>
                                                                            <td className="px-3 py-2 text-auditiq-text font-mono text-xs">{row.nameDest}</td>
                                                                            <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded ${row.occurrences >= 3 ? 'bg-red-500/15 text-red-400' : 'bg-auditiq-border text-auditiq-muted'}`}>{row.occurrences}</span></td>
                                                                            <td className="px-3 py-2">
                                                                                <span className={`text-xs ${row.min_step_gap <= 1 ? 'text-red-400 font-medium' : row.min_step_gap <= 3 ? 'text-amber-400' : 'text-auditiq-muted'}`}>
                                                                                    {row.min_step_gap}hrs
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-3 py-2">{row.fraud_count > 0 && <span className="bg-red-500/15 text-red-400 text-xs px-2 py-0.5 rounded">{row.fraud_count}</span>}</td>
                                                                        </>
                                                                    )}
                                                                    <td className="px-3 py-2">
                                                                        <button onClick={() => toggleRow(rowKey)} className="text-auditiq-teal hover:text-white transition text-xs flex items-center gap-1">
                                                                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                                {/* expanded detail */}
                                                                {expanded && (
                                                                    <tr><td colSpan={20} className="px-4 py-4 bg-[#0A1628]">
                                                                        {activeTab === 'mirror' ? (
                                                                            <div className="grid grid-cols-3 gap-4 text-xs">
                                                                                <div className="bg-auditiq-card border border-auditiq-border rounded-lg p-3">
                                                                                    <p className="text-auditiq-muted mb-1">Forward: {row.account_a} → {row.account_b}</p>
                                                                                    <p className="text-white font-medium">{fmt$(row.forward_amount)}</p>
                                                                                    <p className="text-auditiq-muted">Step {row.forward_step} | Fraud: {row.forward_fraud ? '✓' : '✗'}</p>
                                                                                </div>
                                                                                <div className="flex items-center justify-center">
                                                                                    <div className="text-center">
                                                                                        <ArrowLeftRight className="text-auditiq-teal mx-auto mb-1" size={24} />
                                                                                        <p className="text-auditiq-muted">Difference: {fmt$(row.amount_difference)}</p>
                                                                                        <p className="text-auditiq-muted">{row.step_gap} hrs apart</p>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="bg-auditiq-card border border-auditiq-border rounded-lg p-3">
                                                                                    <p className="text-auditiq-muted mb-1">Reverse: {row.account_b} → {row.account_a}</p>
                                                                                    <p className="text-white font-medium">{fmt$(row.reverse_amount)}</p>
                                                                                    <p className="text-auditiq-muted">Step {row.reverse_step} | Fraud: {row.reverse_fraud ? '✓' : '✗'}</p>
                                                                                </div>
                                                                            </div>
                                                                        ) : activeTab === 'structuring' ? (
                                                                            <div>
                                                                                <p className="text-auditiq-muted text-xs mb-3">Individual transactions in this structuring group:</p>
                                                                                <div className="flex items-end gap-1 mb-3" style={{ height: 60 }}>
                                                                                    {(row.amounts || []).map((amt, ai) => {
                                                                                        const maxAmt = Math.max(...(row.amounts || [1]));
                                                                                        const pct = (amt / maxAmt) * 100;
                                                                                        return (
                                                                                            <div key={ai} className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
                                                                                                <div className="w-full rounded-t" style={{ height: `${pct}%`, minHeight: 4, background: row.fraud_count > 0 ? '#EF4444' : '#00C2CB' }} />
                                                                                                <span className="text-[9px] text-auditiq-muted">{fmt$(amt)}</span>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                                <div className="flex items-center gap-2 text-xs text-auditiq-muted">
                                                                                    <div className="h-px flex-1 border-t border-dashed border-red-500/40" />
                                                                                    <span className="text-red-400">Threshold: {fmt$(row.nearest_threshold)}</span>
                                                                                    <div className="h-px flex-1 border-t border-dashed border-red-500/40" />
                                                                                </div>
                                                                                <p className="text-auditiq-muted text-xs mt-3">
                                                                                    Total: {fmt$(row.total_amount)} ({row.threshold_proximity_pct}% of threshold) | Steps {row.step_window_start}–{row.step_window_end}
                                                                                </p>
                                                                            </div>
                                                                        ) : activeTab === 'amount' ? (
                                                                            <div className="text-xs">
                                                                                <p className="text-auditiq-muted mb-2">Destinations receiving {fmt$(row.amount)} from {row.nameOrig}:</p>
                                                                                <div className="flex flex-wrap gap-2">
                                                                                    {(row.destinations || []).map((d, di) => (
                                                                                        <span key={di} className="bg-purple-500/10 text-purple-400 px-2 py-1 rounded font-mono">{d}</span>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="text-xs">
                                                                                <p className="text-auditiq-muted mb-2">Duplicate transactions at steps: {(row.steps || []).join(', ')}</p>
                                                                                <p className="text-auditiq-muted">Min gap: {row.min_step_gap} hours | Fraud in group: {row.fraud_count}</p>
                                                                            </div>
                                                                        )}
                                                                    </td></tr>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        {/* pagination */}
                                        <div className="flex items-center justify-between mt-3 text-xs text-auditiq-muted">
                                            <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, tabData.length)} of {tabData.length}</span>
                                            <div className="flex gap-2">
                                                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 border border-auditiq-border rounded disabled:opacity-30 hover:bg-white/5"><ChevronLeft size={14} /></button>
                                                <span className="px-2 py-1">{page}/{totalPages}</span>
                                                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 border border-auditiq-border rounded disabled:opacity-30 hover:bg-white/5"><ChevronRight size={14} /></button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* ── SECTION 5: STRUCTURING DEEP DIVE ── */}
                        {(result.structuring || []).length > 0 && (
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h3 className="text-base font-semibold text-white mb-1">Structuring Analysis — Split Transaction Evidence</h3>
                                <p className="text-auditiq-muted text-xs mb-5">Visual breakdown of top suspected smurfing attempts</p>
                                <div className="space-y-4">
                                    {result.structuring.slice(0, 3).map((grp, gi) => {
                                        const maxAmt = Math.max(...grp.amounts);
                                        return (
                                            <div key={gi} className="bg-[#0A1628] border border-auditiq-border rounded-lg p-4">
                                                <p className="text-sm text-white font-medium mb-3">
                                                    Account {grp.nameOrig} — {grp.transaction_count} splits totaling {fmt$(grp.total_amount)} <span className="text-auditiq-muted">(target: {fmt$(grp.nearest_threshold)})</span>
                                                </p>
                                                {/* visual timeline */}
                                                <div className="relative mb-3" style={{ height: 120 }}>
                                                    {/* threshold line */}
                                                    <div className="absolute w-full border-t-2 border-dashed border-red-500/50" style={{ top: `${Math.max(5, 100 - (grp.nearest_threshold / (maxAmt * grp.amounts.length) * 100))}%` }}>
                                                        <span className="absolute right-0 -top-4 text-[9px] text-red-400">Threshold: {fmt$(grp.nearest_threshold)}</span>
                                                    </div>
                                                    {/* bars */}
                                                    <div className="flex items-end gap-2 h-full pt-6">
                                                        {grp.amounts.map((amt, ai) => {
                                                            const pct = Math.max(8, (amt / maxAmt) * 85);
                                                            return (
                                                                <div key={ai} className="flex flex-col items-center" style={{ flex: 1 }}>
                                                                    <div className="w-full rounded-t transition-all" style={{ height: `${pct}%`, background: grp.fraud_count > 0 ? '#EF4444' : '#00C2CB', opacity: 0.8 }} />
                                                                    <span className="text-[8px] text-auditiq-muted mt-1">{fmt$(amt)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <p className="text-xs text-auditiq-muted bg-red-500/5 rounded px-3 py-2 border border-red-500/10">
                                                    <AlertTriangle className="inline text-amber-400 mr-1" size={12} />
                                                    This account made {grp.transaction_count} {grp.type} transactions totaling {fmt$(grp.total_amount)} over {grp.step_window_end - grp.step_window_start} hours. This amount is within {grp.threshold_proximity_pct}% of the {fmt$(grp.nearest_threshold)} reporting threshold, suggesting intentional transaction splitting to avoid detection controls.
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── SECTION 6: MIRROR NETWORK ── */}
                        {(result.mirror_transactions || []).length > 0 && (
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h3 className="text-base font-semibold text-white mb-1">Mirror Transaction Network</h3>
                                <p className="text-auditiq-muted text-xs mb-4">Accounts engaged in round-trip transactions (top 15)</p>
                                <MirrorNetwork pairs={result.mirror_transactions.slice(0, 15)} />
                                <div className="flex gap-6 mt-4 text-[10px] text-auditiq-muted">
                                    <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-auditiq-teal inline-block" /> Forward txn</span>
                                    <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-red-500 inline-block border-t border-dashed" /> Reverse txn</span>
                                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500/30 inline-block" /> Fraud involved</span>
                                </div>
                            </div>
                        )}

                        {/* ── SECTION 7: INTERPRETATION ── */}
                        <div className="grid grid-cols-3 gap-4">
                            {/* col 1: pattern risk summary */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h4 className="text-sm font-semibold text-auditiq-text mb-3">Pattern Risk Summary</h4>
                                <table className="w-full text-xs">
                                    <thead><tr className="border-b border-auditiq-border">
                                        {['Pattern', 'Found', 'Fraud', 'Risk'].map(h => <th key={h} className="px-2 py-1.5 text-left text-auditiq-muted">{h}</th>)}
                                    </tr></thead>
                                    <tbody>
                                        {Object.entries(PAT_LABELS).map(([k, label]) => {
                                            const p = ps[k] || {};
                                            const riskLvl = (p.mean_risk || 0) >= 75 ? 'CRITICAL' : (p.mean_risk || 0) >= 50 ? 'HIGH' : (p.mean_risk || 0) >= 30 ? 'MEDIUM' : 'LOW';
                                            return (
                                                <tr key={k} className="border-b border-auditiq-border/30">
                                                    <td className="px-2 py-1.5 text-auditiq-text">{label}</td>
                                                    <td className="px-2 py-1.5 text-white font-medium">{p.count || 0}</td>
                                                    <td className="px-2 py-1.5">{p.fraud_involved > 0 ? <span className="text-red-400">{p.fraud_involved}</span> : <span className="text-gray-600">0</span>}</td>
                                                    <td className="px-2 py-1.5"><span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: (BAND_CLR[riskLvl] || '#22C55E') + '20', color: BAND_CLR[riskLvl] || '#22C55E' }}>{riskLvl}</span></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* col 2: key findings */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h4 className="text-sm font-semibold text-auditiq-text mb-3">Key Findings</h4>
                                <ul className="space-y-2 text-xs text-auditiq-muted">
                                    <li>• {fmtN(s.total_flagged_transactions)} transactions flagged across 5 duplication pattern types</li>
                                    {s.exact_duplicates_found > 0 && <li className="text-amber-400">• ⚠ {s.exact_duplicates_found} exact duplicate transaction groups — should be impossible in legitimate systems</li>}
                                    {s.structuring_groups_found > 0 && <li className="text-red-400">• 🚨 {s.structuring_groups_found} structuring groups detected — potential smurfing below {fmt$(result.structuring?.[0]?.nearest_threshold || 100000)} threshold</li>}
                                    {s.mirror_pairs_found > 0 && <li className="text-amber-400">• ⚠ {s.mirror_pairs_found} mirror transaction pairs — possible round-trip money laundering</li>}
                                    {s.near_time_clones_found > 0 && <li>• {s.near_time_clones_found} near-time clone groups detected</li>}
                                    {s.amount_clone_groups > 0 && <li>• {s.amount_clone_groups} amount cloning groups identified</li>}
                                    {s.total_flagged_transactions === 0 && <li className="text-green-400">• ✓ No significant duplication patterns detected</li>}
                                </ul>
                            </div>

                            {/* col 3: recommended actions */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <h4 className="text-sm font-semibold text-auditiq-text mb-3">Recommended Actions</h4>
                                <ul className="space-y-2 text-xs text-auditiq-muted">
                                    {(RECS[s.overall_risk] || RECS.LOW).map((r, i) => <li key={i}>• {r}</li>)}
                                </ul>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </PageWrapper>
    );
}


/* ──────────────────────────────────────────
   MIRROR NETWORK SVG COMPONENT
   ────────────────────────────────────────── */
function MirrorNetwork({ pairs }) {
    const [hovered, setHovered] = useState(null);

    // Build unique nodes
    const nodeSet = new Set();
    pairs.forEach(p => { nodeSet.add(p.account_a); nodeSet.add(p.account_b); });
    const nodes = [...nodeSet];

    const W = 700, H = 400, CX = W / 2, CY = H / 2, R = Math.min(W, H) / 2 - 50;
    const nodeR = 22;
    const positions = {};
    nodes.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        positions[n] = { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
    });

    // Node colors — check if any pair involving this node has fraud
    const nodeColors = {};
    nodes.forEach(n => {
        const involved = pairs.filter(p => p.account_a === n || p.account_b === n);
        const hasFraud = involved.some(p => p.forward_fraud || p.reverse_fraud);
        const highRisk = involved.some(p => p.risk_score >= 75);
        nodeColors[n] = hasFraud ? '#EF4444' : highRisk ? '#F59E0B' : '#2E75B6';
    });

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 400 }}>
            <defs>
                <marker id="arrowTeal" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#00C2CB" /></marker>
                <marker id="arrowRed" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#EF4444" /></marker>
            </defs>

            {/* edges */}
            {pairs.map((p, i) => {
                const a = positions[p.account_a], b = positions[p.account_b];
                if (!a || !b) return null;
                const dx = b.x - a.x, dy = b.y - a.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                const nx = dx / len, ny = dy / len;
                // offset lines slightly to avoid overlap
                const off = 5;
                const x1f = a.x + nx * nodeR + ny * off, y1f = a.y + ny * nodeR - nx * off;
                const x2f = b.x - nx * (nodeR + 10) + ny * off, y2f = b.y - ny * (nodeR + 10) - nx * off;
                const x1r = b.x - nx * nodeR - ny * off, y1r = b.y - ny * nodeR + nx * off;
                const x2r = a.x + nx * (nodeR + 10) - ny * off, y2r = a.y + ny * (nodeR + 10) + nx * off;
                const isHovered = hovered === `edge-${i}`;
                return (
                    <g key={`e-${i}`} onMouseEnter={() => setHovered(`edge-${i}`)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
                        {/* forward */}
                        <line x1={x1f} y1={y1f} x2={x2f} y2={y2f} stroke="#00C2CB" strokeWidth={isHovered ? 2.5 : 1.5} markerEnd="url(#arrowTeal)" opacity={isHovered ? 1 : 0.6} />
                        {/* reverse */}
                        <line x1={x1r} y1={y1r} x2={x2r} y2={y2r} stroke="#EF4444" strokeWidth={isHovered ? 2.5 : 1.5} strokeDasharray="5,3" markerEnd="url(#arrowRed)" opacity={isHovered ? 1 : 0.6} />
                        {/* edge label */}
                        {isHovered && (
                            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} textAnchor="middle" fill="#CBD5E1" fontSize="9">{fmt$(p.forward_amount)} ↔ {fmt$(p.reverse_amount)} | Risk: {p.risk_score}</text>
                        )}
                    </g>
                );
            })}

            {/* nodes */}
            {nodes.map((n, i) => {
                const pos = positions[n];
                const isHovered2 = hovered === `node-${i}`;
                const clr = nodeColors[n];
                return (
                    <g key={`n-${i}`} onMouseEnter={() => setHovered(`node-${i}`)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
                        <circle cx={pos.x} cy={pos.y} r={isHovered2 ? nodeR + 3 : nodeR} fill={clr + '25'} stroke={clr} strokeWidth={2} />
                        <text x={pos.x} y={pos.y + 3.5} textAnchor="middle" fill={clr} fontSize="8" fontWeight="bold" fontFamily="monospace">{n.slice(0, 8)}</text>
                        {isHovered2 && (
                            <>
                                <rect x={pos.x - 60} y={pos.y - nodeR - 38} width={120} height={30} rx={4} fill="#0F172A" stroke="#1E293B" />
                                <text x={pos.x} y={pos.y - nodeR - 20} textAnchor="middle" fill="#CBD5E1" fontSize="8">{n} | {pairs.filter(p => p.account_a === n || p.account_b === n).length} pairs</text>
                            </>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
