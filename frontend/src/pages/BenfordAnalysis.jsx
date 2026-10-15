import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageWrapper from '../components/PageWrapper';
import { useData } from '../context/DataContext';
import api from '../api/client';
import {
    BarChart2, Download, CheckCircle2, XCircle, Shield, Activity,
    TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Loader2, Info
} from 'lucide-react';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend as RLegend
} from 'recharts';

// ── helpers ──
function riskColor(risk) {
    if (risk === 'LOW') return { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', fill: 'bg-green-500' };
    if (risk === 'MEDIUM') return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', fill: 'bg-amber-500' };
    return { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', fill: 'bg-red-500' };
}
function madColor(interp) {
    if (interp?.startsWith('Close') || interp?.startsWith('Acceptable')) return riskColor('LOW');
    if (interp?.startsWith('Marginal')) return riskColor('MEDIUM');
    return riskColor('HIGH');
}
function fmtCur(v) { return v == null ? '—' : '$ ' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const TYPE_BADGES = { 'CASH-IN': 'bg-green-500/20 text-green-400', 'CASH-OUT': 'bg-red-500/20 text-red-400', 'TRANSFER': 'bg-amber-500/20 text-amber-400', 'PAYMENT': 'bg-blue-500/20 text-blue-400', 'DEBIT': 'bg-purple-500/20 text-purple-400' };

function BenfordTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
        <div className="bg-[#1A2035] border border-auditiq-border rounded-lg p-3 text-xs shadow-lg min-w-[180px]">
            <p className="text-auditiq-text font-medium mb-1">Digit {d?.digit}</p>
            <p className="text-auditiq-teal">Actual: {d?.actual_pct?.toFixed(2)}%</p>
            <p className="text-white">Expected: {d?.expected_pct?.toFixed(2)}%</p>
            <p className={d?.deviation_pct > 0 ? 'text-amber-400' : 'text-blue-400'}>Deviation: {d?.deviation_pct > 0 ? '+' : ''}{d?.deviation_pct?.toFixed(2)}%</p>
            <p className="text-auditiq-muted">Z-Score: {d?.z_score?.toFixed(2)}</p>
            {d?.is_significant && <p className="text-red-400 mt-1 font-medium">⚠ Statistically significant</p>}
        </div>
    );
}

function barColor(d) {
    if (d.is_significant) return '#EF4444';
    if (d.deviation_pct > 0) return '#F59E0B';
    if (d.deviation_pct < 0) return '#2E75B6';
    return '#00C2CB';
}

function DigitChart({ data, title, xKey }) {
    return (
        <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
            <h3 className="text-base font-semibold text-auditiq-text mb-4">{title}</h3>
            <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" />
                    <XAxis dataKey="digit" tick={{ fill: '#8899AA', fontSize: 12 }} axisLine={false} />
                    <YAxis tick={{ fill: '#8899AA', fontSize: 11 }} axisLine={false} domain={[0, 35]} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<BenfordTooltip />} />
                    <Bar dataKey="actual_pct" name="Actual %" radius={[4, 4, 0, 0]} barSize={28}>
                        {data.map((d, i) => <Cell key={i} fill={barColor(d)} />)}
                    </Bar>
                    <Line type="monotone" dataKey="expected_pct" name="Expected (Benford) %" stroke="#E8EDF5" strokeWidth={2} strokeDasharray="5 3" dot={{ fill: '#E8EDF5', r: 4, strokeWidth: 0 }} />
                    {data.filter(d => d.is_significant).map((d, i) => (
                        <ReferenceLine key={i} x={d.digit} stroke="#EF4444" strokeDasharray="3 3" label={{ value: '⚠', position: 'top', fill: '#EF4444', fontSize: 14 }} />
                    ))}
                </ComposedChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-2 text-xs text-auditiq-muted">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-auditiq-teal" />Actual %</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-white rounded" />Expected %</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500" />Flagged</span>
            </div>
        </div>
    );
}

export default function BenfordAnalysis() {
    const { dataLoaded, setDataLoaded, setDataStats } = useData();
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showSecond, setShowSecond] = useState(false);
    const [expandedSamples, setExpandedSamples] = useState({});
    const [showTooltip, setShowTooltip] = useState(false);

    // Check upload status on mount so dataLoaded is always fresh
    useEffect(() => {
        api.get('/upload/status')
            .then(res => {
                if (res.data.loaded) {
                    setDataLoaded(true);
                    setDataStats(res.data);
                }
            })
            .catch(() => { });
    }, []);

    const runAnalysis = async () => {
        setLoading(true); setError(null);
        try {
            const res = await api.get('/benford/analysis');
            setResult(res.data);
        } catch (err) {
            const msg = err.code === 'ERR_NETWORK'
                ? 'Backend server not running.'
                : (err.response?.data?.detail || 'Analysis failed');
            setError(msg);
        }
        setLoading(false);
    };

    const exportResults = async () => {
        try {
            const res = await api.get('/benford/export', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a'); a.href = url; a.download = 'benford_analysis.json'; document.body.appendChild(a); a.click(); a.remove();
        } catch (_) { }
    };

    const s = result?.summary;

    const MAD_TABLE = [
        { range: '< 0.006', label: 'Close Conformity', color: 'text-green-400', bg: 'bg-green-500/10' },
        { range: '< 0.012', label: 'Acceptable Conformity', color: 'text-green-400', bg: 'bg-green-500/10' },
        { range: '< 0.015', label: 'Marginal Conformity', color: 'text-amber-400', bg: 'bg-amber-500/10' },
        { range: '≥ 0.015', label: 'Non-Conformity', color: 'text-red-400', bg: 'bg-red-500/10' },
    ];

    const recommendations = {
        LOW: ['Dataset shows natural financial distribution', 'No immediate action required', 'Consider monitoring future batches'],
        MEDIUM: ['Review transactions with leading digits showing deviation', 'Cross-check with approval records', 'Flag for secondary review'],
        HIGH: ['Immediate forensic investigation recommended', 'Isolate flagged transactions for manual review', 'Escalate to senior audit partner', 'Document findings for regulatory submission'],
        CRITICAL: ['Immediate forensic investigation recommended', 'Isolate flagged transactions for manual review', 'Escalate to senior audit partner', 'Document findings for regulatory submission'],
    };

    return (
        <PageWrapper title="Benford's Law Analysis">
            <div className="flex flex-col gap-5">

                {/* ═══ SECTION 1 — HEADER ═══ */}
                <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1 relative">
                            <h2 className="text-white text-lg font-semibold">Benford's Law Analysis</h2>
                            <button className="text-auditiq-muted hover:text-white relative" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
                                <Info size={16} />
                                {showTooltip && (
                                    <div className="absolute left-6 top-0 z-20 bg-[#1A2035] border border-auditiq-border rounded-lg p-3 text-xs text-auditiq-text w-64 shadow-lg">
                                        Benford's Law states that leading digits in financial data follow a logarithmic distribution. Deviations indicate potential fabrication or manipulation.
                                    </div>
                                )}
                            </button>
                        </div>
                        <p className="text-auditiq-muted text-sm">Statistical first-digit distribution test for fabricated amount detection</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={runAnalysis} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 transition-colors text-sm font-medium disabled:opacity-60">
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <BarChart2 size={16} />}
                            {loading ? 'Analyzing...' : 'Run Analysis'}
                        </button>
                        <button onClick={exportResults} disabled={!result} className="flex items-center gap-2 px-4 py-2 border border-auditiq-teal text-auditiq-teal rounded-lg hover:bg-auditiq-teal/10 transition-colors text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">
                            <Download size={16} /> Export Results
                        </button>
                    </div>
                </div>

                {/* No dataset warning */}
                {!dataLoaded && !loading && !result && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="text-amber-500" size={18} />
                            <span className="text-amber-400 text-sm">Dataset required — upload your PaySim CSV first</span>
                        </div>
                        <Link to="/upload" className="text-auditiq-teal text-sm hover:underline">Go to Upload →</Link>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3"><XCircle className="text-red-500" size={18} /><span className="text-red-400 text-sm">{error}</span></div>
                        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300"><XCircle size={16} /></button>
                    </div>
                )}

                {/* Loading overlay */}
                {loading && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-16 flex flex-col items-center justify-center gap-4">
                        <div className="w-12 h-12 border-4 border-auditiq-teal/30 border-t-auditiq-teal rounded-full animate-spin" />
                        <p className="text-white font-medium">Running statistical analysis...</p>
                        <p className="text-auditiq-muted text-sm">Computing digit frequencies and z-scores</p>
                    </div>
                )}

                {/* Empty state */}
                {!loading && !result && dataLoaded && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-16 flex flex-col items-center justify-center gap-4">
                        <BarChart2 size={64} className="text-auditiq-teal opacity-30" />
                        <p className="text-white font-medium text-lg">Run Benford Analysis to detect fabricated amounts</p>
                        <p className="text-auditiq-muted text-sm">Analyzes first and second digit distribution of all transaction amounts</p>
                        <button onClick={runAnalysis} className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 transition-colors font-medium text-sm">
                            <BarChart2 size={16} /> Run Analysis
                        </button>
                    </div>
                )}

                {/* ═══ RESULTS ═══ */}
                {result && (
                    <>
                        {/* ═══ SECTION 2 — SUMMARY CARDS ═══ */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            {/* Conformity */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${madColor(s.mad_interpretation).bg}`}>
                                        {s.mad_interpretation === 'Non-Conformity' ? <XCircle className="text-red-400" size={20} /> : <CheckCircle2 className={madColor(s.mad_interpretation).text} size={20} />}
                                    </div>
                                    <span className="text-sm text-auditiq-muted">Conformity Status</span>
                                </div>
                                <div className={`text-xl font-bold mb-1 ${madColor(s.mad_interpretation).text}`}>{s.mad_interpretation}</div>
                            </div>
                            {/* MAD */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${madColor(s.mad_interpretation).bg}`}>
                                        <Activity className={madColor(s.mad_interpretation).text} size={20} />
                                    </div>
                                    <span className="text-sm text-auditiq-muted">MAD Score</span>
                                </div>
                                <div className={`text-2xl font-bold mb-1 ${madColor(s.mad_interpretation).text}`}>{s.mad_score.toFixed(5)}</div>
                                <p className="text-xs text-auditiq-muted">Mean Absolute Deviation</p>
                            </div>
                            {/* p-value */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.p_value < 0.05 ? 'bg-red-500/15' : 'bg-green-500/15'}`}>
                                        <TrendingUp className={s.p_value < 0.05 ? 'text-red-400' : 'text-green-400'} size={20} />
                                    </div>
                                    <span className="text-sm text-auditiq-muted">Chi-Square p-value</span>
                                </div>
                                <div className="text-2xl font-bold text-white mb-1">{s.p_value.toFixed(4)}</div>
                                <p className={`text-xs ${s.p_value < 0.05 ? 'text-red-400' : 'text-green-400'}`}>
                                    {s.p_value < 0.05 ? 'Significant deviation detected' : 'No significant deviation'}
                                </p>
                            </div>
                            {/* Risk */}
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${riskColor(s.overall_risk).bg}`}>
                                        <Shield className={riskColor(s.overall_risk).text} size={20} />
                                    </div>
                                    <span className="text-sm text-auditiq-muted">Overall Risk</span>
                                </div>
                                <span className={`text-lg font-bold px-3 py-1 rounded-lg ${riskColor(s.overall_risk).bg} ${riskColor(s.overall_risk).text} ${s.overall_risk === 'CRITICAL' ? 'animate-pulse' : ''}`}>
                                    {s.overall_risk}
                                </span>
                            </div>
                        </div>

                        {/* ═══ SECTION 3 — MAIN CHART + TABLE ═══ */}
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                            <div className="xl:col-span-2">
                                <DigitChart data={result.first_digit} title="First Digit Distribution — Actual vs Expected" />
                            </div>
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5 overflow-auto max-h-[420px]">
                                <h3 className="text-base font-semibold text-auditiq-text mb-3">Digit-by-Digit Breakdown</h3>
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-auditiq-bg z-10">
                                        <tr>{['Digit', 'Actual%', 'Expected%', 'Dev', 'Z-Score', 'Status'].map(h => (
                                            <th key={h} className="text-left px-2 py-2 text-auditiq-teal uppercase tracking-wider font-medium">{h}</th>
                                        ))}</tr>
                                    </thead>
                                    <tbody>
                                        {result.first_digit.map((d, i) => (
                                            <tr key={i} className={`border-t border-auditiq-border/50 ${d.is_significant ? 'bg-[rgba(239,68,68,0.08)] border-l-[3px] border-l-red-500' : d.deviation_pct > 0 ? 'bg-amber-500/[0.03]' : d.deviation_pct < 0 ? 'bg-blue-500/[0.03]' : ''}`}>
                                                <td className="px-2 py-2 text-white font-medium">{d.digit}</td>
                                                <td className="px-2 py-2 text-auditiq-text">{d.actual_pct.toFixed(2)}%</td>
                                                <td className="px-2 py-2 text-auditiq-muted">{d.expected_pct.toFixed(2)}%</td>
                                                <td className={`px-2 py-2 ${d.deviation_pct > 0 ? 'text-amber-400' : 'text-blue-400'}`}>{d.deviation_pct > 0 ? '+' : ''}{d.deviation_pct.toFixed(2)}%</td>
                                                <td className={`px-2 py-2 font-medium ${Math.abs(d.z_score) > 2.58 ? 'text-red-400 font-bold' : Math.abs(d.z_score) > 1.96 ? 'text-amber-400' : 'text-auditiq-muted'}`}>{d.z_score.toFixed(2)}</td>
                                                <td className="px-2 py-2">
                                                    {d.is_significant ? <span className="bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-medium">⚠ Flagged</span>
                                                        : Math.abs(d.z_score) > 1.65 ? <span className="bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-medium">Watch</span>
                                                            : <span className="bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded text-[10px] font-medium">Normal</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* ═══ SECTION 4 — SECOND DIGIT ═══ */}
                        <div className="bg-auditiq-card border border-auditiq-border rounded-xl overflow-hidden">
                            <button onClick={() => setShowSecond(!showSecond)} className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors">
                                <h3 className="text-base font-semibold text-auditiq-text">Second Digit Analysis</h3>
                                {showSecond ? <ChevronUp size={18} className="text-auditiq-muted" /> : <ChevronDown size={18} className="text-auditiq-muted" />}
                            </button>
                            {showSecond && (
                                <div className="px-5 pb-5">
                                    <p className="text-xs text-auditiq-muted mb-4">Second digit analysis provides additional confirmation. Anomalies here alongside first digit flags significantly increase fraud confidence.</p>
                                    <DigitChart data={result.second_digit} title="Second Digit Distribution — Actual vs Expected" />
                                </div>
                            )}
                        </div>

                        {/* ═══ SECTION 5 — BY TRANSACTION TYPE ═══ */}
                        <div>
                            <h3 className="text-sm uppercase tracking-widest text-auditiq-muted mb-4">Conformity by Transaction Type</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                                {Object.entries(result.by_transaction_type).map(([type, info]) => {
                                    const rc = riskColor(info.risk);
                                    const barW = Math.min((info.mad / 0.020) * 100, 100);
                                    return (
                                        <div key={type} className="bg-auditiq-card border border-auditiq-border rounded-xl p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-white font-medium text-sm">{type}</span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${TYPE_BADGES[type] || ''}`}>{type}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="flex-1 h-2 bg-auditiq-border rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full ${rc.fill}`} style={{ width: `${barW}%` }} />
                                                </div>
                                                <span className={`text-xs font-medium ${rc.text}`}>{info.mad.toFixed(4)}</span>
                                            </div>
                                            <p className={`text-xs ${rc.text}`}>
                                                {info.mad < 0.006 ? 'Close Conformity' : info.mad < 0.012 ? 'Acceptable' : info.mad < 0.015 ? 'Marginal' : 'Non-Conformity'}
                                            </p>
                                            <p className="text-[10px] text-auditiq-muted mt-1">χ² = {info.chi2.toFixed(2)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ═══ SECTION 6 — FLAGGED SAMPLES ═══ */}
                        {result.flagged_samples.length > 0 && (
                            <div>
                                <h3 className="text-sm uppercase tracking-widest text-auditiq-muted mb-1">Evidence — Transactions Driving Deviations</h3>
                                <p className="text-xs text-auditiq-muted mb-4">Sample transactions for statistically flagged digits</p>
                                <div className="flex flex-col gap-3">
                                    {result.flagged_samples.map((fs, i) => (
                                        <div key={i} className="bg-auditiq-card border border-auditiq-border rounded-xl overflow-hidden">
                                            <button onClick={() => setExpandedSamples(p => ({ ...p, [i]: !p[i] }))}
                                                className={`w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors ${Math.abs(fs.z_score) > 2.58 ? 'border-l-[3px] border-l-red-500' : 'border-l-[3px] border-l-amber-500'}`}>
                                                <span className="text-sm text-white font-medium">
                                                    Digit {fs.digit} — Z-Score: <span className={Math.abs(fs.z_score) > 2.58 ? 'text-red-400' : 'text-amber-400'}>{fs.z_score.toFixed(2)}</span> — {fs.sample_transactions.length} sample transactions
                                                </span>
                                                {expandedSamples[i] ? <ChevronUp size={16} className="text-auditiq-muted" /> : <ChevronDown size={16} className="text-auditiq-muted" />}
                                            </button>
                                            {expandedSamples[i] && (
                                                <div className="overflow-x-auto border-t border-auditiq-border">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-auditiq-bg">
                                                            <tr>{['Amount', 'Type', 'Origin', 'Destination', 'Fraud'].map(h => (
                                                                <th key={h} className="text-left px-4 py-2 text-auditiq-teal uppercase tracking-wider font-medium">{h}</th>
                                                            ))}</tr>
                                                        </thead>
                                                        <tbody>
                                                            {fs.sample_transactions.map((tx, j) => (
                                                                <tr key={j} className={`border-t border-auditiq-border/50 ${tx.isFraud === 1 ? 'bg-red-500/[0.06]' : ''}`}>
                                                                    <td className="px-4 py-2 text-auditiq-text">{fmtCur(tx.amount)}</td>
                                                                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${TYPE_BADGES[tx.type] || ''}`}>{tx.type}</span></td>
                                                                    <td className="px-4 py-2 text-auditiq-text font-mono">{tx.nameOrig?.substring(0, 12)}</td>
                                                                    <td className="px-4 py-2 text-auditiq-text font-mono">{tx.nameDest?.substring(0, 12)}</td>
                                                                    <td className="px-4 py-2">{tx.isFraud === 1 ? <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-medium">FRAUD</span> : ''}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ═══ SECTION 7 — INTERPRETATION PANEL ═══ */}
                        <div className="bg-[rgba(0,194,203,0.04)] border border-[rgba(0,194,203,0.15)] rounded-xl p-6">
                            <h3 className="text-base font-semibold text-auditiq-text mb-5">How to Interpret These Results</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* MAD table */}
                                <div>
                                    <h4 className="text-sm text-auditiq-muted font-medium mb-3">What the MAD Score Means</h4>
                                    <div className="flex flex-col gap-1">
                                        {MAD_TABLE.map((m, i) => {
                                            const isCurrent = (i === 0 && s.mad_score < 0.006) || (i === 1 && s.mad_score >= 0.006 && s.mad_score < 0.012) || (i === 2 && s.mad_score >= 0.012 && s.mad_score < 0.015) || (i === 3 && s.mad_score >= 0.015);
                                            return (
                                                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${isCurrent ? m.bg + ' ring-1 ring-current' : ''}`}>
                                                    <span className={`font-mono ${m.color}`}>{m.range}</span>
                                                    <span className={isCurrent ? `${m.color} font-semibold` : 'text-auditiq-muted'}>{m.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                {/* Deviations */}
                                <div>
                                    <h4 className="text-sm text-auditiq-muted font-medium mb-3">Significant Deviations Found</h4>
                                    {s.significant_deviations.length === 0 ? (
                                        <div className="flex items-center gap-2 text-green-400 text-sm"><CheckCircle2 size={16} /><span>No significant digit deviations found. Dataset shows natural Benford distribution.</span></div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            {result.first_digit.filter(d => d.is_significant).map((d, i) => (
                                                <div key={i} className={`text-sm ${Math.abs(d.z_score) > 2.58 ? 'text-red-400' : 'text-amber-400'}`}>
                                                    Digit {d.digit}: {d.deviation_pct > 0 ? 'Over' : 'Under'}-represented by {d.deviation_pct > 0 ? '+' : ''}{d.deviation_pct.toFixed(2)}% (Z={d.z_score.toFixed(2)})
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {/* Recommendations */}
                                <div>
                                    <h4 className="text-sm text-auditiq-muted font-medium mb-3">Recommended Actions</h4>
                                    <ul className="flex flex-col gap-2">
                                        {(recommendations[s.overall_risk] || recommendations.LOW).map((rec, i) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-auditiq-text">
                                                <span className="text-auditiq-teal mt-0.5">•</span>{rec}
                                            </li>
                                        ))}
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
