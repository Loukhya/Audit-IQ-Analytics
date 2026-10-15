import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import DataUpload from './pages/DataUpload';
import BenfordAnalysis from './pages/BenfordAnalysis';
import TemporalAnalysis from './pages/TemporalAnalysis';
import RiskScoring from './pages/RiskScoring';
import DuplicateDetection from './pages/DuplicateDetection';
import BehavioralProfiling from './pages/BehavioralProfiling';
import NLQuery from './pages/NLQuery';
import AuditReport from './pages/AuditReport';

function KeyboardShortcuts() {
    const navigate = useNavigate();

    useEffect(() => {
        const handler = (e) => {
            // Only when no input is focused
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;

            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case '1': e.preventDefault(); navigate('/'); break;
                    case '2': e.preventDefault(); navigate('/upload'); break;
                    case '3': e.preventDefault(); navigate('/benford'); break;
                    case '4': e.preventDefault(); navigate('/temporal'); break;
                    case '5': e.preventDefault(); navigate('/risk'); break;
                    case '6': e.preventDefault(); navigate('/duplicates'); break;
                    case '7': e.preventDefault(); navigate('/behavioral'); break;
                    case '8': e.preventDefault(); navigate('/nlquery'); break;
                    case '9': e.preventDefault(); navigate('/report'); break;
                    case 'p': e.preventDefault(); window.print(); break;
                    default: break;
                }
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [navigate]);

    return null;
}

function App() {
    return (
        <Router>
            <KeyboardShortcuts />
            <ErrorBoundary>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/upload" element={<DataUpload />} />
                    <Route path="/benford" element={<BenfordAnalysis />} />
                    <Route path="/temporal" element={<TemporalAnalysis />} />
                    <Route path="/risk" element={<RiskScoring />} />
                    <Route path="/duplicates" element={<DuplicateDetection />} />
                    <Route path="/behavioral" element={<BehavioralProfiling />} />
                    <Route path="/nlquery" element={<NLQuery />} />
                    <Route path="/report" element={<AuditReport />} />
                </Routes>
            </ErrorBoundary>
        </Router>
    );
}

export default App;
