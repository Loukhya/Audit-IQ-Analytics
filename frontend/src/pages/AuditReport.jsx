import React, { useState, useRef, useEffect } from 'react';
import api from '../api/client';
import ReactMarkdown from 'react-markdown';
import html2pdf from 'html2pdf.js';
import {
    Download, PlayCircle, Loader2, FileText, FileCheck2,
    Printer, Clock, AlertTriangle, CheckCircle2, Settings2
} from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import { useData } from '../context/DataContext';

const PROGRESS_STEPS = [
    'Collecting dataset overview...',
    'Analyzing Benford\'s Law results...',
    'Processing temporal patterns...',
    'Evaluating risk scores...',
    'Scanning for duplicates...',
    'Generating AI narrative...',
    'Finalizing report...',
];

export default function AuditReport() {
    const { dataLoaded } = useData();
    const [report, setReport] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [progressStep, setProgressStep] = useState(0);
    const [generatedAt, setGeneratedAt] = useState(null);
    const [showConfig, setShowConfig] = useState(false);
    const [copied, setCopied] = useState(false);
    const contentRef = useRef();

    // Animated progress during generation
    useEffect(() => {
        if (!loading) return;
        const interval = setInterval(() => {
            setProgressStep(prev => (prev < PROGRESS_STEPS.length - 1 ? prev + 1 : prev));
        }, 3000);
        return () => clearInterval(interval);
    }, [loading]);

    // Check if report was already generated
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const res = await api.get('/report/status');
                if (res.data.generated) {
                    // Load the cached report
                    const reportRes = await api.get('/report/generate');
                    setReport(reportRes.data.report);
                    setGeneratedAt(new Date().toLocaleString());
                }
            } catch { }
        };
        checkStatus();
    }, []);

    const generateReport = async () => {
        setLoading(true);
        setError(null);
        setProgressStep(0);
        try {
            const response = await api.get('/report/generate');
            setReport(response.data.report);
            setGeneratedAt(new Date().toLocaleString());
        } catch (err) {
            console.error("Failed to generate report", err);
            setError("Failed to generate report. Please ensure the backend server is running and try again.");
        } finally {
            setLoading(false);
        }
    };

    const downloadPDF = () => {
        if (!contentRef.current) return;
        const opt = {
            margin: 0.5,
            filename: 'AuditIQ_Executive_Report.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        html2pdf().set(opt).from(contentRef.current).save();
    };

    const exportHTML = async () => {
        try {
            const res = await api.get('/report/export-html', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'AuditIQ_Report.html';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch {
            setError('Failed to export HTML report.');
        }
    };

    const handlePrint = () => window.print();

    return (
        <PageWrapper title="Executive Audit Report">
            <div className="h-full flex flex-col pt-4">
                <div className="flex justify-between items-end mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Executive Audit Report</h2>
                        <p className="text-sm text-auditiq-muted mt-1">
                            Generate a comprehensive, AI-driven report summarizing all analytical findings.
                        </p>
                    </div>
                    <div className="flex gap-3 no-print">
                        {report && (
                            <>
                                <button onClick={handlePrint}
                                    className="flex items-center gap-2 bg-auditiq-card border border-auditiq-border hover:bg-white/5 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                                    <Printer size={16} /> Print
                                </button>
                                <button onClick={exportHTML}
                                    className="flex items-center gap-2 bg-auditiq-card border border-auditiq-border hover:bg-white/5 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                                    <Download size={16} /> Export HTML
                                </button>
                                <button onClick={downloadPDF}
                                    className="flex items-center gap-2 bg-auditiq-card border border-auditiq-border hover:bg-white/5 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                                    <Download size={16} /> Export PDF
                                </button>
                            </>
                        )}
                        <button onClick={generateReport} disabled={loading}
                            className="flex items-center gap-2 bg-auditiq-teal hover:bg-[#00D4DE] text-gray-900 px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                            {report ? "Regenerate Report" : "Generate Report"}
                        </button>
                    </div>
                </div>

                {/* Report Content Area */}
                <div className="flex-1 flex gap-5">
                    {/* Main Report */}
                    <div className="flex-1 bg-auditiq-card border border-auditiq-border rounded-xl overflow-hidden flex flex-col report-viewer">
                        {!report && !loading && !error && (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-auditiq-border">
                                    <FileText size={24} className="text-auditiq-teal" />
                                </div>
                                <h3 className="text-lg font-medium text-white">Generate Your First Report</h3>
                                <p className="text-sm text-auditiq-muted max-w-sm mt-2">
                                    AuditIQ will analyze data from Benford's Law, temporal patterns, risk scoring, and duplicate detection to generate a comprehensive executive report.
                                </p>
                                {!dataLoaded && (
                                    <div className="flex items-center gap-2 mt-4 text-amber-400 text-xs">
                                        <AlertTriangle size={14} />
                                        Upload a dataset first for meaningful analysis
                                    </div>
                                )}
                                <button onClick={generateReport}
                                    className="mt-6 flex items-center gap-2 bg-auditiq-border hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm transition-colors font-medium border border-transparent hover:border-white/10">
                                    <PlayCircle size={16} className="text-auditiq-teal" />
                                    Start Analysis
                                </button>
                            </div>
                        )}

                        {loading && (
                            <div className="flex-1 flex flex-col items-center justify-center p-8">
                                <Loader2 size={32} className="text-auditiq-teal animate-spin mb-6" />
                                <h3 className="text-white font-medium mb-4">Generating Report</h3>
                                {/* Progress steps */}
                                <div className="w-full max-w-xs space-y-2">
                                    {PROGRESS_STEPS.map((step, i) => (
                                        <div key={i} className={`flex items-center gap-2 text-xs transition-all duration-300 ${i < progressStep ? 'text-green-400' : i === progressStep ? 'text-auditiq-teal' : 'text-auditiq-muted/40'}`}>
                                            {i < progressStep ? (
                                                <CheckCircle2 size={12} className="text-green-500 flex-shrink-0" />
                                            ) : i === progressStep ? (
                                                <Loader2 size={12} className="animate-spin text-auditiq-teal flex-shrink-0" />
                                            ) : (
                                                <div className="w-3 h-3 rounded-full border border-auditiq-border flex-shrink-0" />
                                            )}
                                            {step}
                                        </div>
                                    ))}
                                </div>
                                <div className="w-full max-w-xs mt-4 h-1 bg-auditiq-border rounded-full overflow-hidden">
                                    <div className="h-full bg-auditiq-teal rounded-full transition-all duration-500"
                                        style={{ width: `${((progressStep + 1) / PROGRESS_STEPS.length) * 100}%` }} />
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="flex-1 flex flex-col items-center justify-center p-8">
                                <div className="text-red-400 font-medium mb-2">Error Processing Request</div>
                                <p className="text-sm text-auditiq-muted">{error}</p>
                                <button onClick={generateReport} className="mt-4 px-4 py-2 bg-white/5 border border-auditiq-border rounded text-white text-sm hover:bg-white/10">Try Again</button>
                            </div>
                        )}

                        {report && !loading && (
                            <div className="flex-1 overflow-auto p-8 custom-scrollbar relative">
                                <div ref={contentRef} className="bg-auditiq-card p-6 md:p-8 rounded-lg max-w-4xl mx-auto shadow-sm ring-1 ring-white/5">
                                    <div className="border-b border-auditiq-border pb-6 mb-6">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-8 h-8 bg-auditiq-teal rounded flex items-center justify-center text-gray-900">
                                                <FileCheck2 size={18} />
                                            </div>
                                            <h1 className="text-2xl font-bold text-white m-0">AuditIQ Executive Report</h1>
                                        </div>
                                        <p className="text-sm text-gray-400 m-0">AI-Generated Synthesis from Analytical Modules</p>
                                    </div>
                                    <div className="prose prose-invert prose-teal max-w-none 
                                        prose-h1:text-xl prose-h1:font-bold prose-h1:text-white prose-h1:border-b prose-h1:border-white/10 prose-h1:pb-2
                                        prose-h2:text-lg prose-h2:font-semibold prose-h2:text-gray-200 prose-h2:mt-6
                                        prose-h3:text-base prose-h3:font-medium prose-h3:text-gray-300
                                        prose-p:text-gray-400 prose-p:leading-relaxed
                                        prose-ul:text-gray-400 prose-li:my-1
                                        prose-strong:text-auditiq-teal prose-strong:font-semibold">
                                        <ReactMarkdown>{report}</ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Metadata Sidebar */}
                    {report && !loading && (
                        <div className="w-64 flex-shrink-0 hidden lg:flex flex-col gap-4 no-print">
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-4">
                                <h4 className="text-xs uppercase tracking-widest text-auditiq-muted mb-3">Report Info</h4>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-xs">
                                        <Clock size={12} className="text-auditiq-muted" />
                                        <span className="text-auditiq-muted">Generated:</span>
                                        <span className="text-auditiq-text">{generatedAt}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        <FileText size={12} className="text-auditiq-muted" />
                                        <span className="text-auditiq-muted">Words:</span>
                                        <span className="text-auditiq-text">{report.split(/\s+/).length}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        <CheckCircle2 size={12} className="text-green-500" />
                                        <span className="text-auditiq-muted">Status:</span>
                                        <span className="text-green-400">Complete</span>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-auditiq-card border border-auditiq-border rounded-xl p-4">
                                <h4 className="text-xs uppercase tracking-widest text-auditiq-muted mb-3">Quick Actions</h4>
                                <div className="space-y-2">
                                    <button onClick={() => {
                                        navigator.clipboard.writeText(report);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    }} className="w-full flex items-center gap-2 text-xs text-auditiq-text hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors">
                                        {copied ? <CheckCircle2 size={14} className="text-green-400" /> : <FileText size={14} />}
                                        {copied ? 'Copied!' : 'Copy to Clipboard'}
                                    </button>
                                    <button onClick={() => {
                                        const subject = encodeURIComponent('AuditIQ Executive Report');
                                        const body = encodeURIComponent(`Audit report generated on ${generatedAt}.\n\nPlease find the report attached or view it in the AuditIQ platform.`);
                                        window.open(`mailto:?subject=${subject}&body=${body}`);
                                    }} className="w-full flex items-center gap-2 text-xs text-auditiq-text hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors">
                                        <Settings2 size={14} /> Share via Email
                                    </button>
                                    <button onClick={() => {
                                        const el = contentRef.current;
                                        if (el) {
                                            const heading = el.querySelector('h1, h2');
                                            if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }
                                    }} className="w-full flex items-center gap-2 text-xs text-auditiq-text hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors">
                                        <FileCheck2 size={14} /> Jump to Findings
                                    </button>
                                    <button onClick={() => {
                                        const words = report.split(/\s+/).length;
                                        const readTime = Math.ceil(words / 200);
                                        alert(`Report Statistics:\n• Words: ${words}\n• Estimated read time: ${readTime} min\n• Sections: ${(report.match(/^#+\s/gm) || []).length}\n• Generated: ${generatedAt}`);
                                    }} className="w-full flex items-center gap-2 text-xs text-auditiq-text hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors">
                                        <AlertTriangle size={14} /> Report Statistics
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </PageWrapper>
    );
}
