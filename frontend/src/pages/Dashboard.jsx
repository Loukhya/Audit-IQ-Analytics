import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageWrapper from '../components/PageWrapper';
import { useData } from '../context/DataContext';
import api from '../api/client';
import {
    Database, AlertTriangle, Shield, TrendingUp, ArrowRight,
    CheckCircle2, Circle, Upload as UploadIcon, X, Zap, Clock,
    DollarSign, BarChart2, Copy, UserSearch, MessageSquare,
    FileText, LayoutDashboard, Play, Search, Download
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

// ── Helpers ──
function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
function fmtCurrency(v) {
    if (v == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}
function fmtCurrencyFull(v) {
    if (v == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

const PIE_COLORS = { 'CASH-IN': '#22C55E', 'CASH-OUT': '#EF4444', 'TRANSFER': '#F59E0B', 'PAYMENT': '#2E75B6', 'DEBIT': '#8B5CF6' };

const MODULE_LIST = [
    { name: "Benford's Law", route: '/benford', icon: BarChart2, desc: 'First-digit distribution analysis', color: 'text-auditiq-teal', bg: 'bg-auditiq-teal/15', ai: false },
    { name: 'Temporal Analysis', route: '/temporal', icon: Clock, desc: 'Out-of-hours transaction detection', color: 'text-auditiq-blue', bg: 'bg-auditiq-blue/15', ai: false },
    { name: 'Risk Scoring', route: '/risk', icon: Shield, desc: 'Composite risk matrix scoring', color: 'text-amber-500', bg: 'bg-amber-500/15', ai: false },
    { name: 'Duplicate Detect', route: '/duplicates', icon: Copy, desc: 'Exact and fuzzy duplicate scan', color: 'text-red-500', bg: 'bg-red-500/15', ai: false },
    { name: 'Behavioral Profile', route: '/behavioral', icon: UserSearch, desc: 'Vendor baseline deviation', color: 'text-purple-500', bg: 'bg-purple-500/15', ai: false },
    { name: 'NL Query', route: '/nlquery', icon: MessageSquare, desc: 'Natural language data queries', color: 'text-auditiq-teal', bg: 'bg-auditiq-teal/15', ai: true },
    { name: 'Audit Report', route: '/report', icon: FileText, desc: 'AI-generated audit summaries', color: 'text-auditiq-blue', bg: 'bg-auditiq-blue/15', ai: true },
    { name: 'Data Upload', route: '/upload', icon: UploadIcon, desc: 'Import & manage datasets', color: 'text-green-500', bg: 'bg-green-500/15', ai: false },
];

// ── Custom tooltip ──
function DarkTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#1A2035] border border-auditiq-border rounded-lg p-3 text-xs shadow-lg">
            <p className="text-auditiq-text font-medium mb-1">{label}</p>
            {payload.map((p, i) => (
                <p key={i} style={{ color: p.stroke || p.fill }} className="flex gap-2">
                    <span>{p.name}:</span><span className="font-medium">{fmt(p.value)}</span>
                </p>
            ))}
            {payload.length >= 2 && payload[1].value > 0 && (
                <p className="text-auditiq-muted mt-1">Fraud rate: {((payload[1].value / (payload[0].value || 1)) * 100).toFixed(2)}%</p>
            )}
        </div>
    );
}

function PieTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-[#1A2035] border border-auditiq-border rounded-lg p-3 text-xs shadow-lg">
            <p className="text-auditiq-text font-medium">{payload[0].name}: {fmt(payload[0].value)}</p>
        </div>
    );
}

// ── Mock data generators ──
function mockTrendData(mode) {
    const pts = mode === 'Hourly' ? 24 : mode === 'Daily' ? 30 : 4;
    return Array.from({ length: pts }, (_, i) => ({
        label: mode === 'Hourly' ? `Hour ${i + 1}` : mode === 'Daily' ? `Day ${i + 1}` : `Week ${i + 1}`,
        all: Math.floor(3000 + 1500 * Math.sin(i / (pts / 6)) + Math.random() * 800),
        fraud: Math.floor(30 + 20 * Math.sin(i / (pts / 4)) + Math.random() * 15),
    }));
}

function mockHeatmap() {
    const grid = [];
    for (let d = 0; d < 7; d++) {
        const row = [];
        for (let h = 0; h < 24; h++) {
            const count = Math.floor(Math.random() * 100);
            const fraud = Math.random() < 0.12 ? Math.floor(Math.random() * 5) : 0;
            row.push({ count, fraud });
        }
        grid.push(row);
    }
    return grid;
}

export default function Dashboard() {
    const { dataLoaded, dataStats, setDataLoaded, setDataStats, previewData, setPreviewData, setModulesCompleted } = useData();
    const [checkedBackend, setCheckedBackend] = useState(false);
    const [showBanner, setShowBanner] = useState(true);
    const [trendTab, setTrendTab] = useState('Hourly');
    const [hoverCell, setHoverCell] = useState(null);
    const [moduleStatuses, setModuleStatuses] = useState({});
    const navigate = useNavigate();

    // ── Fetch module statuses ──
    const fetchModuleStatuses = useCallback(async () => {
        const modules = [
            { key: 'benford', path: '/benford/status' },
            { key: 'temporal', path: '/temporal/status' },
            { key: 'risk', path: '/risk/status' },
            { key: 'duplicates', path: '/duplicates/status' },
            { key: 'report', path: '/report/status' },
        ];
        const statuses = {};
        await Promise.allSettled(
            modules.map(async (m) => {
                try {
                    const res = await api.get(m.path);
                    statuses[m.key] = res.data;
                } catch {
                    statuses[m.key] = { run: false };
                }
            })
        );
        setModuleStatuses(statuses);
        const completed = Object.values(statuses).filter(s => s.run).length;
        setModulesCompleted(completed);
    }, [setModulesCompleted]);

    useEffect(() => {
        if (dataLoaded) fetchModuleStatuses();
    }, [dataLoaded, fetchModuleStatuses]);

    // ── Fetch status on mount ──
    useEffect(() => {
        const load = async () => {
            try {
                const statusRes = await api.get('/upload/status');
                if (statusRes.data.loaded) {
                    setDataLoaded(true);
                    setDataStats(statusRes.data);
                    try {
                        const prevRes = await api.get('/upload/preview');
                        setPreviewData(prevRes.data);
                    } catch (_) { }
                }
            } catch (_) { }
            setCheckedBackend(true);
        };
        if (!dataLoaded) load();
        else {
            setCheckedBackend(true);
            if (previewData.length === 0) {
                api.get('/upload/preview').then(r => setPreviewData(r.data)).catch(() => { });
            }
        }
    }, []);

    // ── Auto-dismiss success banner ──
    useEffect(() => {
        if (dataLoaded && showBanner) {
            const t = setTimeout(() => setShowBanner(false), 5000);
            return () => clearTimeout(t);
        }
    }, [dataLoaded, showBanner]);

    // ── Computed values from preview data ──
    const rows = previewData || [];
    const totalVolume = useMemo(() => rows.reduce((s, r) => s + (r.amount || 0), 0), [rows]);
    const avgPerTxn = rows.length ? totalVolume / rows.length : 0;
    const fraudRate = dataStats ? ((dataStats.fraud_count || 0) / (dataStats.rows || 1) * 100).toFixed(2) : '1.29';

    const peakHour = useMemo(() => {
        if (!rows.length) return 14;
        const hourMap = {};
        rows.forEach(r => { if (r.isFraud === 1) hourMap[r.step] = (hourMap[r.step] || 0) + 1; });
        let maxH = 0, maxC = 0;
        Object.entries(hourMap).forEach(([h, c]) => { if (c > maxC) { maxC = c; maxH = Number(h); } });
        return maxH || 14;
    }, [rows]);

    const largestFraud = useMemo(() => {
        if (!rows.length) return 9999559;
        const fraudAmounts = rows.filter(r => r.isFraud === 1).map(r => r.amount || 0);
        return fraudAmounts.length ? Math.max(...fraudAmounts) : 0;
    }, [rows]);

    // ── Trend chart data ──
    const trendData = useMemo(() => {
        if (!rows.length) return mockTrendData(trendTab);
        const bucketSize = trendTab === 'Hourly' ? 1 : trendTab === 'Daily' ? 24 : 168;
        const map = {};
        rows.forEach(r => {
            const bucket = Math.ceil((r.step || 1) / bucketSize);
            if (!map[bucket]) map[bucket] = { all: 0, fraud: 0 };
            map[bucket].all++;
            if (r.isFraud === 1) map[bucket].fraud++;
        });
        return Object.entries(map).sort((a, b) => a[0] - b[0]).map(([k, v]) => ({
            label: trendTab === 'Hourly' ? `Hour ${k}` : trendTab === 'Daily' ? `Day ${k}` : `Week ${k}`,
            all: v.all,
            fraud: v.fraud,
        }));
    }, [rows, trendTab]);

    // ── Pie chart data ──
    const pieData = useMemo(() => {
        if (dataStats?.transaction_types) {
            return Object.entries(dataStats.transaction_types).map(([name, value]) => ({ name, value }));
        }
        return [
            { name: 'PAYMENT', value: 2233384 }, { name: 'CASH-OUT', value: 2237500 },
            { name: 'CASH-IN', value: 1399284 }, { name: 'TRANSFER', value: 532909 }, { name: 'DEBIT', value: 41432 },
        ];
    }, [dataStats]);
    const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

    // ── Heatmap data ──
    const heatData = useMemo(() => {
        if (!rows.length) return mockHeatmap();
        const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ count: 0, fraud: 0 })));
        rows.forEach(r => {
            const h = ((r.step || 1) - 1) % 24;
            const d = Math.floor(((r.step || 1) - 1) / 24) % 7;
            grid[d][h].count++;
            if (r.isFraud === 1) grid[d][h].fraud++;
        });
        return grid;
    }, [rows]);

    // ── Top flagged accounts ──
    const topAccounts = useMemo(() => {
        if (!rows.length) {
            return Array.from({ length: 8 }, (_, i) => ({ id: `C${1000000000 + i * 1111}`, count: 8 - i }));
        }
        const map = {};
        rows.filter(r => r.isFraud === 1).forEach(r => { if (r.nameOrig) map[r.nameOrig] = (map[r.nameOrig] || 0) + 1; });
        return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, count]) => ({ id, count }));
    }, [rows]);
    const maxAcctCount = topAccounts.length ? topAccounts[0].count : 1;

    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    function heatCellColor(count, fraud) {
        const maxCount = 20;
        const intensity = Math.min(count / maxCount, 1);
        if (fraud > 0) {
            const fi = Math.min(fraud / 3, 1);
            return `rgba(239, 68, 68, ${0.15 + fi * 0.35})`;
        }
        if (intensity < 0.25) return '#1A2035';
        if (intensity < 0.5) return '#1E4080';
        return '#2E75B6';
    }

    // ── KPI cards ──
    const kpiCards = [
        {
            label: 'Total Transactions', icon: Database, color: 'text-auditiq-teal',
            bg: 'bg-auditiq-teal/15', shadow: 'rgba(0,194,203,0.08)',
            value: dataLoaded && dataStats ? fmt(dataStats.rows) : '6,362,620',
            sub: 'Across 30-day simulation period',
            trend: dataLoaded ? '↑ 100% loaded' : null, trendColor: 'text-green-400 bg-green-500/10',
        },
        {
            label: 'Confirmed Fraud', icon: AlertTriangle, color: 'text-red-500',
            bg: 'bg-red-500/15', shadow: 'rgba(239,68,68,0.08)',
            value: dataLoaded && dataStats ? fmt(dataStats.fraud_count) : '8,213',
            sub: 'isFraud = 1 transactions',
            trend: `${fraudRate}% of total`, trendColor: 'text-red-400 bg-red-500/10',
        },
        {
            label: 'High Risk Flagged', icon: Shield, color: 'text-amber-500',
            bg: 'bg-amber-500/15', shadow: 'rgba(245,158,11,0.08)',
            value: dataLoaded && dataStats ? fmt(dataStats.flagged_count) : '24,891',
            sub: 'Exceed risk threshold',
            trend: 'Requires review', trendColor: 'text-amber-400 bg-amber-500/10',
        },
        {
            label: 'Total Volume', icon: TrendingUp, color: 'text-auditiq-blue',
            bg: 'bg-auditiq-blue/15', shadow: 'rgba(46,117,182,0.08)',
            value: dataLoaded && rows.length ? fmtCurrency(totalVolume) : '$54.2B',
            sub: 'Combined transaction value',
            trend: dataLoaded && rows.length ? `Avg ${fmtCurrency(avgPerTxn)} per txn` : 'Avg $8,533 per txn',
            trendColor: 'text-blue-400 bg-blue-500/10',
        },
    ];

    return (
        <PageWrapper title="Dashboard">
            <div className="flex flex-col gap-5">

                {/* ═══ SECTION 1 — ALERT BANNER ═══ */}
                {checkedBackend && showBanner && !dataLoaded && (
                    <div className="bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.3)] rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="text-amber-500 shrink-0" size={18} />
                            <span className="text-amber-400 text-sm">No dataset loaded — analysis modules are in preview mode with sample data</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link to="/upload" className="flex items-center gap-2 px-4 py-1.5 border border-amber-500 text-amber-400 rounded-lg hover:bg-amber-500/10 transition-colors text-sm whitespace-nowrap">
                                Upload Dataset
                            </Link>
                            <button onClick={() => setShowBanner(false)} className="text-amber-400 hover:text-amber-300"><X size={16} /></button>
                        </div>
                    </div>
                )}
                {checkedBackend && showBanner && dataLoaded && (
                    <div className="bg-[rgba(0,194,203,0.06)] border border-[rgba(0,194,203,0.2)] rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="text-green-500 shrink-0" size={18} />
                            <span className="text-auditiq-text text-sm">PaySim dataset loaded — all analysis modules are ready</span>
                        </div>
                        <button className="flex items-center gap-2 px-4 py-1.5 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 transition-colors text-sm whitespace-nowrap">
                            Run Full Analysis
                        </button>
                    </div>
                )}

                {/* ═══ SECTION 2 — KPI CARDS ═══ */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                    {kpiCards.map((kpi, i) => (
                        <div key={i}
                            className="bg-auditiq-card border border-auditiq-border rounded-xl p-5 transition-all duration-200 hover:border-opacity-40 group"
                            style={{ boxShadow: `0 4px 20px ${kpi.shadow}` }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = kpi.shadow.replace('0.08', '0.4')}
                            onMouseLeave={e => e.currentTarget.style.borderColor = ''}
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.bg}`}>
                                    <kpi.icon className={kpi.color} size={20} />
                                </div>
                                <span className="text-sm text-auditiq-muted">{kpi.label}</span>
                            </div>
                            <div className="text-2xl font-bold text-white mb-1">{kpi.value}</div>
                            <div className="text-xs text-auditiq-muted mb-2">{kpi.sub}</div>
                            {kpi.trend && (
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${kpi.trendColor}`}>{kpi.trend}</span>
                            )}
                        </div>
                    ))}
                </div>

                {/* ═══ SECTION 3 — MIDDLE ROW ═══ */}
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                    {/* Fraud Trend Chart (col-span-3) */}
                    <div className="xl:col-span-3 bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-semibold text-auditiq-text">Fraud Activity Over Time</h3>
                            <div className="flex gap-1 bg-auditiq-bg rounded-lg p-0.5">
                                {['Hourly', 'Daily', 'Weekly'].map(tab => (
                                    <button key={tab} onClick={() => setTrendTab(tab)}
                                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${trendTab === tab ? 'text-auditiq-teal border-b-2 border-auditiq-teal bg-auditiq-card' : 'text-auditiq-muted hover:text-white'}`}
                                    >{tab}</button>
                                ))}
                            </div>
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={trendData}>
                                <defs>
                                    <linearGradient id="gradAll" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2E75B6" stopOpacity={0.2} /><stop offset="95%" stopColor="#2E75B6" stopOpacity={0} /></linearGradient>
                                    <linearGradient id="gradFraud" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#EF4444" stopOpacity={0.25} /><stop offset="95%" stopColor="#EF4444" stopOpacity={0} /></linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
                                <XAxis dataKey="label" tick={{ fill: '#8899AA', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: '#8899AA', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip content={<DarkTooltip />} />
                                <Area type="monotone" dataKey="all" name="All Transactions" stroke="#2E75B6" strokeWidth={2} fill="url(#gradAll)" />
                                <Area type="monotone" dataKey="fraud" name="Fraud Transactions" stroke="#EF4444" strokeWidth={2} strokeDasharray="4 2" fill="url(#gradFraud)" />
                            </AreaChart>
                        </ResponsiveContainer>
                        <div className="flex justify-center gap-6 mt-3">
                            <div className="flex items-center gap-2 text-xs"><span className="w-3 h-0.5 bg-[#2E75B6] rounded" />
                                <span className="text-auditiq-muted">All Transactions</span></div>
                            <div className="flex items-center gap-2 text-xs"><span className="w-3 h-0.5 bg-[#EF4444] rounded" style={{ borderTop: '2px dashed #EF4444', height: 0 }} />
                                <span className="text-auditiq-muted">Fraud Transactions</span></div>
                        </div>
                    </div>

                    {/* Transaction Mix + Mini Stats (col-span-2) */}
                    <div className="xl:col-span-2 flex flex-col gap-5">
                        {/* Donut */}
                        <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5 flex-1">
                            <h3 className="text-base font-semibold text-auditiq-text mb-2">Transaction Types</h3>
                            <div className="relative">
                                <ResponsiveContainer width="100%" height={180}>
                                    <PieChart>
                                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={2}>
                                            {pieData.map((entry, i) => (<Cell key={i} fill={PIE_COLORS[entry.name] || '#8899AA'} />))}
                                        </Pie>
                                        <Tooltip content={<PieTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-xl font-bold text-white">{fmt(pieTotal)}</span>
                                    <span className="text-[10px] text-auditiq-muted">transactions</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                                {pieData.map((d, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[d.name] }} />
                                        <span className="text-auditiq-muted truncate">{d.name}</span>
                                        <span className="ml-auto text-auditiq-text font-medium">{(d.value / pieTotal * 100).toFixed(1)}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Mini stat pills */}
                        <div className="flex flex-col gap-2">
                            {[
                                { icon: Zap, color: 'text-auditiq-teal', label: 'Fraud Rate', value: `${fraudRate}%` },
                                { icon: Clock, color: 'text-auditiq-blue', label: 'Peak Hour', value: `Hour ${peakHour}` },
                                { icon: DollarSign, color: 'text-amber-500', label: 'Largest Fraud', value: fmtCurrencyFull(largestFraud) },
                            ].map((pill, i) => (
                                <div key={i} className="bg-auditiq-bg border border-auditiq-border rounded-lg px-4 py-3 flex items-center gap-3">
                                    <pill.icon size={16} className={pill.color} />
                                    <span className="text-xs text-auditiq-muted flex-1">{pill.label}</span>
                                    <span className="text-sm font-medium text-white">{pill.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ═══ SECTION 4 — LOWER ROW ═══ */}
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                    {/* Heatmap (col-span-3) */}
                    <div className="xl:col-span-3 bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                        <h3 className="text-base font-semibold text-auditiq-text">Transaction Activity Heatmap — Hour vs. Day of Week</h3>
                        <p className="text-xs text-auditiq-muted mt-1 mb-4">Darker = more transactions. Red tint = fraud activity</p>
                        <div className="overflow-x-auto">
                            <div className="inline-flex flex-col gap-1">
                                {heatData.map((row, d) => (
                                    <div key={d} className="flex items-center gap-1">
                                        <span className="w-8 text-[10px] text-auditiq-muted text-right mr-1">{DAYS[d]}</span>
                                        {row.map((cell, h) => (
                                            <div key={h}
                                                className="w-[22px] h-[22px] rounded-sm cursor-pointer transition-all duration-150 hover:ring-1 hover:ring-auditiq-teal relative"
                                                style={{ backgroundColor: heatCellColor(cell.count, cell.fraud) }}
                                                onMouseEnter={() => setHoverCell({ d, h, ...cell })}
                                                onMouseLeave={() => setHoverCell(null)}
                                            >
                                                {hoverCell && hoverCell.d === d && hoverCell.h === h && (
                                                    <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1A2035] border border-auditiq-border rounded-lg p-2 text-[10px] whitespace-nowrap shadow-lg pointer-events-none">
                                                        <p className="text-auditiq-text font-medium">{DAYS[d]}, Hour {h}:00</p>
                                                        <p className="text-auditiq-muted">Transactions: {cell.count}</p>
                                                        <p className="text-red-400">Fraud: {cell.fraud}</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                                <div className="flex items-center gap-1 ml-10 mt-1">
                                    {[0, 4, 8, 12, 16, 20, 23].map(h => (
                                        <span key={h} className="text-[9px] text-auditiq-muted" style={{ width: 22, textAlign: 'center', marginLeft: h === 0 ? 0 : (h === 4 ? 22 * 3 : h === 23 ? 22 * 2 : 22 * 3) + 'px', position: h === 0 ? 'relative' : undefined }}>{h}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-[10px] text-auditiq-muted">
                            <div className="flex items-center gap-1">
                                <span>Low</span>
                                {['#1A2035', '#1E4080', '#2E75B6'].map((c, i) => <span key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />)}
                                <span>High density</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(239,68,68,0.35)' }} />
                                <span>Fraud indicator</span>
                            </div>
                        </div>
                    </div>

                    {/* Top Flagged Accounts (col-span-2) */}
                    <div className="xl:col-span-2 bg-auditiq-card border border-auditiq-border rounded-xl p-5 flex flex-col">
                        <h3 className="text-base font-semibold text-auditiq-text">Top Flagged Accounts</h3>
                        <p className="text-xs text-auditiq-muted mt-1 mb-4">Accounts with highest fraud transaction count</p>
                        <div className="flex flex-col flex-1 gap-0.5">
                            {topAccounts.map((acct, i) => {
                                const riskColor = i < 2 ? 'bg-red-500' : i < 5 ? 'bg-amber-500' : 'bg-auditiq-blue';
                                const hoverBg = i < 2 ? 'hover:bg-red-500/5' : i < 5 ? 'hover:bg-amber-500/5' : 'hover:bg-blue-500/5';
                                return (
                                    <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${hoverBg} ${i < topAccounts.length - 1 ? 'border-b border-auditiq-border/50' : ''}`}>
                                        <div className={`w-7 h-7 rounded-full ${riskColor}/20 flex items-center justify-center text-[10px] font-bold ${i < 2 ? 'text-red-400' : i < 5 ? 'text-amber-400' : 'text-blue-400'}`}>
                                            {acct.id.substring(0, 2)}
                                        </div>
                                        <span className="font-mono text-xs text-auditiq-text truncate flex-1">{acct.id.substring(0, 12)}</span>
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-auditiq-border rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full ${riskColor}`} style={{ width: `${(acct.count / maxAcctCount) * 100}%` }} />
                                            </div>
                                            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${i < 2 ? 'text-red-400 bg-red-500/10' : i < 5 ? 'text-amber-400 bg-amber-500/10' : 'text-blue-400 bg-blue-500/10'}`}>
                                                {acct.count}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <Link to="/risk" className="flex items-center gap-1 text-auditiq-teal text-xs font-medium mt-3 hover:underline">
                            View All <ArrowRight size={12} />
                        </Link>
                    </div>
                </div>

                {/* ═══ SECTION 5 — MODULE STATUS GRID ═══ */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm uppercase tracking-widest text-auditiq-muted">Analysis Modules</h3>
                        <button className="flex items-center gap-2 px-4 py-1.5 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 transition-colors text-sm font-medium active:scale-95">
                            <Play size={14} /> Run All
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                        {MODULE_LIST.map((mod, i) => {
                            const statusKey = mod.route.replace('/', '');
                            const modStatus = moduleStatuses[statusKey];
                            const isRun = modStatus?.run;
                            const statusLabel = !dataLoaded ? 'Needs Data' : isRun ? 'Complete' : 'Ready';
                            const statusClass = !dataLoaded ? 'bg-amber-500/10 text-amber-400' : isRun ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400';
                            return (
                                <div key={i} onClick={() => navigate(mod.route)}
                                    className="bg-auditiq-card border border-auditiq-border rounded-xl p-4 cursor-pointer transition-all duration-200 hover:border-[rgba(0,194,203,0.4)] hover:-translate-y-0.5 group"
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${mod.bg}`}>
                                            <mod.icon className={mod.color} size={18} />
                                        </div>
                                        <div className="flex gap-1.5">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
                                                {statusLabel}
                                            </span>
                                            {mod.ai && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400">AI Powered</span>
                                            )}
                                        </div>
                                    </div>
                                    <h4 className="text-white font-semibold text-sm mb-1">{mod.name}</h4>
                                    <p className="text-xs text-auditiq-muted mb-3">{mod.desc}</p>
                                    {isRun && modStatus && (
                                        <div className="text-[10px] text-auditiq-muted mb-2 flex items-center gap-1">
                                            <CheckCircle2 size={10} className="text-green-500" />
                                            {modStatus.risk && <span>Risk: {modStatus.risk}</span>}
                                            {modStatus.critical_count != null && <span>Critical: {modStatus.critical_count}</span>}
                                            {modStatus.total_flagged != null && <span>Flagged: {modStatus.total_flagged}</span>}
                                        </div>
                                    )}
                                    <span className="text-auditiq-teal text-xs font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        Open Module <ArrowRight size={12} />
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ═══ SECTION 6 — GETTING STARTED STEPPER ═══ */}
                <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-6">
                    <h3 className="text-sm uppercase tracking-widest text-auditiq-muted mb-6">Getting Started Workflow</h3>
                    <div className="flex items-center justify-between relative px-4">
                        {(() => {
                            const completedCount = Object.values(moduleStatuses).filter(s => s.run).length;
                            const reportDone = moduleStatuses.report?.run;
                            const steps = [
                                { label: 'Upload Dataset', icon: UploadIcon, done: dataLoaded },
                                { label: 'Run Analyses', icon: Play, done: completedCount >= 1 },
                                { label: 'Review Findings', icon: Search, done: completedCount >= 3 },
                                { label: 'Export Report', icon: Download, done: !!reportDone },
                            ];
                            return steps.map((step, i, arr) => {
                                const isDone = step.done;
                                const isCurrent = !isDone && (i === 0 || arr[i - 1].done);
                                return (
                                    <React.Fragment key={i}>
                                        {i > 0 && (
                                            <div className={`flex-1 h-0.5 mx-2 ${arr[i - 1].done ? 'bg-auditiq-teal' : 'border-t-2 border-dashed border-auditiq-border'}`} />
                                        )}
                                        <div className="flex flex-col items-center gap-2 relative z-10">
                                            {isDone ? (
                                                <div className="w-10 h-10 rounded-full bg-auditiq-teal flex items-center justify-center">
                                                    <CheckCircle2 size={20} className="text-white" />
                                                </div>
                                            ) : isCurrent ? (
                                                <div className="w-10 h-10 rounded-full border-2 border-auditiq-teal flex items-center justify-center relative">
                                                    <span className="absolute inset-0 rounded-full border-2 border-auditiq-teal animate-ping opacity-30" />
                                                    <span className="text-auditiq-teal font-bold text-sm">{i + 1}</span>
                                                </div>
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-auditiq-border flex items-center justify-center">
                                                    <span className="text-auditiq-muted font-medium text-sm">{i + 1}</span>
                                                </div>
                                            )}
                                            <span className={`text-xs font-medium whitespace-nowrap ${isDone || isCurrent ? (isDone ? 'text-white' : 'text-auditiq-teal') : 'text-auditiq-muted'}`}>
                                                {step.label}
                                            </span>
                                        </div>
                                    </React.Fragment>
                                );
                            });
                        })()}
                    </div>
                    <p className="text-xs text-auditiq-muted italic text-center mt-5">
                        {dataLoaded
                            ? '→ Dataset loaded! Choose an analysis module above to begin'
                            : '→ Start by uploading your PaySim CSV on the Data Upload page'}
                    </p>
                </div>
            </div>
        </PageWrapper>
    );
}
