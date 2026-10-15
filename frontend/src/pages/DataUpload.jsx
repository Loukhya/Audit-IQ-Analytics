import React, { useState, useRef, useCallback } from 'react';
import PageWrapper from '../components/PageWrapper';
import { useData } from '../context/DataContext';
import api from '../api/client';
import {
    Upload, Download, CheckCircle2, XCircle, CloudUpload,
    Search, Filter, ChevronLeft, ChevronRight, ArrowRight,
    Database, AlertTriangle, Shield, TrendingUp, Layers
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, LabelList
} from 'recharts';

const TYPE_COLORS = {
    'CASH-IN': 'bg-green-500/20 text-green-400',
    'CASH-OUT': 'bg-red-500/20 text-red-400',
    'TRANSFER': 'bg-amber-500/20 text-amber-400',
    'PAYMENT': 'bg-blue-500/20 text-blue-400',
    'DEBIT': 'bg-purple-500/20 text-purple-400',
};

function formatCurrency(val) {
    if (val == null) return '—';
    return '$ ' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DataUpload() {
    const { setDataLoaded, setDataStats, setPreviewData } = useData();

    const [file, setFile] = useState(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [statusMsg, setStatusMsg] = useState('');
    const [uploadDone, setUploadDone] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [responseData, setResponseData] = useState(null);

    // Table state
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const rowsPerPage = 20;

    const fileInputRef = useRef(null);

    // ──────────────── Drag & Drop ────────────────
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);
    const handleDragLeave = useCallback(() => setIsDragOver(false), []);
    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) {
            if (!dropped.name.endsWith('.csv')) {
                setUploadError('Please upload a CSV file');
                return;
            }
            setFile(dropped);
            setUploadError(null);
            setUploadDone(false);
            setResponseData(null);
        }
    }, []);

    const handleFileSelect = (e) => {
        const selected = e.target.files[0];
        if (selected) {
            if (!selected.name.endsWith('.csv')) {
                setUploadError('Please upload a CSV file');
                return;
            }
            setFile(selected);
            setUploadError(null);
            setUploadDone(false);
            setResponseData(null);
        }
    };

    // ──────────────── Upload ────────────────
    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        setUploadProgress(0);
        setUploadError(null);
        setUploadDone(false);

        const messages = ['Parsing CSV...', 'Validating columns...', 'Computing statistics...'];
        let msgIdx = 0;
        setStatusMsg(messages[0]);
        const interval = setInterval(() => {
            msgIdx = Math.min(msgIdx + 1, messages.length - 1);
            setStatusMsg(messages[msgIdx]);
        }, 800);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await api.post('/upload/file', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(pct);
                },
            });

            clearInterval(interval);
            setUploading(false);
            setUploadDone(true);
            setStatusMsg('Dataset loaded successfully');
            setResponseData(res.data);
            setPreviewData(res.data.preview || []);
            setDataStats(res.data);
            setDataLoaded(true);
            setPage(1);
        } catch (err) {
            clearInterval(interval);
            setUploading(false);
            const msg =
                err.response?.data?.detail ||
                (err.code === 'ERR_NETWORK'
                    ? 'Backend server not running. Start with: uvicorn main:app --reload'
                    : 'Upload failed');
            setUploadError(msg);
        }
    };

    // ──────────────── Sample Download ────────────────
    const handleDownloadSample = async () => {
        try {
            const res = await api.get('/upload/sample', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'paysim_sample_500.csv');
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            setUploadError(
                err.code === 'ERR_NETWORK'
                    ? 'Backend server not running. Start with: uvicorn main:app --reload'
                    : 'Failed to download sample'
            );
        }
    };

    // ──────────────── Filtered Data ────────────────
    const preview = responseData?.preview || [];
    const filteredRows = preview.filter((row) => {
        const matchesSearch =
            !searchTerm ||
            (row.nameOrig && row.nameOrig.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (row.nameDest && row.nameDest.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesType = typeFilter === 'ALL' || row.type === typeFilter;
        return matchesSearch && matchesType;
    });
    const totalPages = Math.ceil(filteredRows.length / rowsPerPage);
    const pagedRows = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    // ──────────────── Chart data ────────────────
    const chartData = responseData
        ? Object.entries(responseData.transaction_types).map(([name, count]) => ({ name, count }))
        : [];

    // ──────────────── Stat cards config ────────────────
    const statCards = responseData
        ? [
            { label: 'Total Rows', value: responseData.rows.toLocaleString(), icon: Database, color: 'text-auditiq-teal', bg: 'bg-auditiq-teal/15' },
            { label: 'Fraud Transactions', value: responseData.fraud_count.toLocaleString(), icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-500/15' },
            { label: 'Flagged by System', value: responseData.flagged_count.toLocaleString(), icon: Shield, color: 'text-amber-500', bg: 'bg-amber-500/15' },
            { label: 'Avg Transaction', value: formatCurrency(responseData.amount_stats?.mean), icon: TrendingUp, color: 'text-auditiq-teal', bg: 'bg-auditiq-teal/15' },
            { label: 'Transaction Types', value: Object.keys(responseData.transaction_types).length, icon: Layers, color: 'text-auditiq-blue', bg: 'bg-auditiq-blue/15' },
        ]
        : [];

    return (
        <PageWrapper title="Data Upload">
            <div className="flex flex-col gap-6">
                {/* ════ ERROR BANNER ════ */}
                {uploadError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <XCircle className="text-red-500 shrink-0" size={20} />
                            <span className="text-red-400 text-sm">{uploadError}</span>
                        </div>
                        <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-300">
                            <XCircle size={16} />
                        </button>
                    </div>
                )}

                {/* ════ SECTION 1 — TOP INSTRUCTION BANNER ════ */}
                <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-white text-lg font-medium mb-1">Load Your Financial Dataset</h2>
                        <p className="text-auditiq-muted text-sm">
                            Upload a PaySim-format CSV file or download our 500-row sample to get started immediately.
                        </p>
                    </div>
                    <button
                        onClick={handleDownloadSample}
                        className="flex items-center gap-2 px-4 py-2 border border-auditiq-teal text-auditiq-teal rounded-lg hover:bg-auditiq-teal/10 transition-colors text-sm whitespace-nowrap"
                    >
                        <Download size={16} />
                        Download Sample CSV
                    </button>
                </div>

                {/* ════ SECTION 2 — UPLOAD DROPZONE ════ */}
                {!uploadDone && (
                    <div
                        className={`relative min-h-[200px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${isDragOver
                                ? 'border-auditiq-teal bg-[rgba(0,194,203,0.05)]'
                                : 'border-auditiq-border bg-auditiq-bg'
                            }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => !file && fileInputRef.current?.click()}
                    >
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            className="hidden"
                            onChange={handleFileSelect}
                        />

                        {!file ? (
                            <>
                                <CloudUpload size={48} className="text-auditiq-teal mb-4" />
                                <p className="text-white font-medium mb-1">
                                    {isDragOver ? 'Drop to upload' : 'Drag & drop your PaySim CSV here'}
                                </p>
                                <p className="text-auditiq-muted text-sm mb-2">or click to browse files</p>
                                <p className="text-auditiq-muted text-xs">Supports CSV up to 500MB</p>
                            </>
                        ) : !uploading ? (
                            <div className="flex flex-col items-center gap-4">
                                <div className="text-center">
                                    <p className="text-white font-medium">{file.name}</p>
                                    <p className="text-auditiq-muted text-sm">
                                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleUpload(); }}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 transition-colors font-medium text-sm"
                                    >
                                        <Upload size={16} />
                                        Upload & Analyze
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                        className="px-5 py-2.5 border border-auditiq-border text-auditiq-muted rounded-lg hover:text-white hover:border-white/20 transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}

                {/* ════ SECTION 3 — UPLOAD PROGRESS ════ */}
                {uploading && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-6">
                        <div className="w-full bg-auditiq-border rounded-full h-2.5 mb-3 overflow-hidden">
                            <div
                                className="h-full bg-auditiq-teal rounded-full transition-all duration-300"
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                        <p className="text-auditiq-muted text-sm text-center animate-pulse">{statusMsg}</p>
                    </div>
                )}

                {uploadDone && !uploading && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
                        <CheckCircle2 className="text-green-500" size={20} />
                        <span className="text-green-400 text-sm font-medium">{statusMsg}</span>
                    </div>
                )}

                {/* ════ SECTION 4 — DATASET STATS CARDS ════ */}
                {responseData && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                        {statCards.map((card, i) => (
                            <div key={i} className="bg-auditiq-card border border-auditiq-border rounded-xl p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.bg}`}>
                                        <card.icon className={card.color} size={18} />
                                    </div>
                                </div>
                                <div className="text-2xl font-bold text-white mb-1">{card.value}</div>
                                <div className="text-xs text-auditiq-muted">{card.label}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ════ SECTION 5 — TRANSACTION TYPE CHART ════ */}
                {responseData && chartData.length > 0 && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-6">
                        <h3 className="text-white font-medium mb-4">Transaction Type Distribution</h3>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1E2D45" horizontal={false} />
                                <XAxis type="number" tick={{ fill: '#8899AA', fontSize: 12 }} />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={90}
                                    tick={{ fill: '#E8EDF5', fontSize: 13 }}
                                />
                                <Tooltip
                                    contentStyle={{ background: '#161B27', border: '1px solid #1E2D45', borderRadius: '8px', color: '#E8EDF5' }}
                                />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                    {chartData.map((_, idx) => (
                                        <Cell key={idx} fill="#00C2CB" />
                                    ))}
                                    <LabelList dataKey="count" position="right" fill="#E8EDF5" fontSize={12} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* ════ SECTION 6 — DATA PREVIEW TABLE ════ */}
                {responseData && preview.length > 0 && (
                    <div className="bg-auditiq-card border border-auditiq-border rounded-xl overflow-hidden">
                        {/* Controls */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-auditiq-border">
                            <h3 className="text-white font-medium">Data Preview</h3>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-auditiq-muted" />
                                    <input
                                        type="text"
                                        placeholder="Search by account..."
                                        value={searchTerm}
                                        onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                                        className="bg-auditiq-bg border border-auditiq-border rounded-lg pl-9 pr-3 py-2 text-sm text-auditiq-text placeholder:text-auditiq-muted focus:outline-none focus:border-auditiq-teal w-52"
                                    />
                                </div>
                                <div className="relative">
                                    <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-auditiq-muted pointer-events-none" />
                                    <select
                                        value={typeFilter}
                                        onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                                        className="bg-auditiq-bg border border-auditiq-border rounded-lg pl-9 pr-3 py-2 text-sm text-auditiq-text focus:outline-none focus:border-auditiq-teal appearance-none cursor-pointer"
                                    >
                                        <option value="ALL">All Types</option>
                                        <option value="CASH-IN">CASH-IN</option>
                                        <option value="CASH-OUT">CASH-OUT</option>
                                        <option value="TRANSFER">TRANSFER</option>
                                        <option value="PAYMENT">PAYMENT</option>
                                        <option value="DEBIT">DEBIT</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-auditiq-bg sticky top-0 z-10">
                                    <tr>
                                        {['step', 'type', 'amount', 'nameOrig', 'oldbalanceOrg', 'newbalanceOrig', 'nameDest', 'oldbalanceDest', 'newbalanceDest', 'isFraud', 'isFlaggedFraud'].map((col) => (
                                            <th key={col} className="text-left px-4 py-3 text-auditiq-teal text-xs uppercase font-medium tracking-wider whitespace-nowrap">
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedRows.map((row, idx) => (
                                        <tr
                                            key={idx}
                                            className={`border-t border-auditiq-border hover:bg-[rgba(0,194,203,0.04)] transition-colors ${idx % 2 === 0 ? 'bg-auditiq-card' : 'bg-[#1A2035]'
                                                }`}
                                        >
                                            <td className="px-4 py-3 text-auditiq-text whitespace-nowrap">Hour {row.step}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[row.type] || ''}`}>
                                                    {row.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-auditiq-text whitespace-nowrap">{formatCurrency(row.amount)}</td>
                                            <td className="px-4 py-3 text-auditiq-text font-mono whitespace-nowrap">{row.nameOrig?.substring(0, 12)}</td>
                                            <td className="px-4 py-3 text-auditiq-text whitespace-nowrap">{formatCurrency(row.oldbalanceOrg)}</td>
                                            <td className="px-4 py-3 text-auditiq-text whitespace-nowrap">{formatCurrency(row.newbalanceOrig)}</td>
                                            <td className="px-4 py-3 text-auditiq-text font-mono whitespace-nowrap">{row.nameDest?.substring(0, 12)}</td>
                                            <td className="px-4 py-3 text-auditiq-text whitespace-nowrap">{formatCurrency(row.oldbalanceDest)}</td>
                                            <td className="px-4 py-3 text-auditiq-text whitespace-nowrap">{formatCurrency(row.newbalanceDest)}</td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {row.isFraud === 1 && (
                                                    <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full font-medium">FRAUD</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {row.isFlaggedFraud === 1 && (
                                                    <span className="bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full font-medium">FLAGGED</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-auditiq-border">
                            <span className="text-auditiq-muted text-xs">
                                Showing rows {((page - 1) * rowsPerPage) + 1}–{Math.min(page * rowsPerPage, filteredRows.length)} of {filteredRows.length}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => p - 1)}
                                    className="p-1.5 rounded text-auditiq-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                                    <button
                                        key={p}
                                        onClick={() => setPage(p)}
                                        className={`w-7 h-7 rounded text-xs font-medium transition-colors ${p === page
                                                ? 'bg-auditiq-teal text-white'
                                                : 'text-auditiq-muted hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        {p}
                                    </button>
                                ))}
                                <button
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((p) => p + 1)}
                                    className="p-1.5 rounded text-auditiq-muted hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ════ SECTION 7 — READY BANNER ════ */}
                {uploadDone && responseData && (
                    <div className="bg-gradient-to-r from-[rgba(0,194,203,0.1)] to-[rgba(46,117,182,0.1)] border border-[rgba(0,194,203,0.3)] rounded-xl p-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="text-auditiq-teal" size={20} />
                            <span className="text-white font-medium text-sm">Dataset ready for analysis</span>
                        </div>
                        <a
                            href="/benford"
                            className="flex items-center gap-2 px-5 py-2.5 bg-auditiq-teal text-white rounded-lg hover:bg-auditiq-teal/90 transition-colors font-medium text-sm"
                        >
                            Start Analysis
                            <ArrowRight size={16} />
                        </a>
                    </div>
                )}
            </div>
        </PageWrapper>
    );
}
