import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard, Upload, BarChart2, Clock,
    Shield, Copy, UserSearch, MessageSquare,
    FileText, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useData } from '../context/DataContext';

const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", route: "/" },
    { icon: Upload, label: "Data Upload", route: "/upload" },
    { icon: BarChart2, label: "Benford Analysis", route: "/benford" },
    { icon: Clock, label: "Temporal Analysis", route: "/temporal" },
    { icon: Shield, label: "Risk Scoring", route: "/risk" },
    { icon: Copy, label: "Duplicate Detect", route: "/duplicates" },
    { icon: UserSearch, label: "Behavioral Profile", route: "/behavioral" },
    { icon: MessageSquare, label: "NL Query", route: "/nlquery" },
    { icon: FileText, label: "Audit Report", route: "/report" }
];

export default function Sidebar({ collapsed, onToggle, hidden }) {
    const { dataLoaded, dataStats, modulesCompleted } = useData();

    if (hidden) return null;

    const width = collapsed ? 64 : 240;

    const formatRows = (n) => {
        if (!n) return '0';
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
        return n.toString();
    };

    return (
        <div
            className="fixed top-0 left-0 h-full bg-auditiq-sidebar flex flex-col pt-6 border-r border-auditiq-border z-20 transition-all duration-300"
            style={{ width }}
        >
            {/* Logo */}
            <div className="px-4 mb-8 flex items-center gap-2" style={{ justifyContent: collapsed ? 'center' : 'flex-start', paddingLeft: collapsed ? 0 : 24 }}>
                <div className="w-6 h-6 bg-auditiq-teal rounded-sm flex items-center justify-center text-white flex-shrink-0" />
                {!collapsed && <span className="text-white font-bold text-lg leading-none mt-1">AuditIQ</span>}
            </div>

            {/* Nav */}
            <nav className="flex-1 flex flex-col gap-1 w-full">
                {navItems.map((item) => (
                    <NavLink
                        key={item.route}
                        to={item.route}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                            `flex items-center gap-3 py-3 text-sm transition-colors relative ` +
                            (collapsed ? 'justify-center px-0 ' : 'px-6 ') +
                            (isActive
                                ? "text-auditiq-teal bg-[rgba(0,194,203,0.08)] border-l-4 border-auditiq-teal"
                                : "text-auditiq-muted border-l-4 border-transparent hover:text-white hover:bg-white/5")
                        }
                    >
                        <item.icon size={18} />
                        {!collapsed && item.label}
                    </NavLink>
                ))}
            </nav>

            {/* Collapse toggle */}
            <button
                onClick={onToggle}
                className="absolute top-1/2 -right-3 transform -translate-y-1/2 w-6 h-6 rounded-full bg-auditiq-sidebar border border-auditiq-border flex items-center justify-center text-auditiq-muted hover:text-white transition-colors z-30"
            >
                {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            {/* Dataset indicator */}
            <div className="p-4 border-t border-auditiq-border mt-auto">
                {collapsed ? (
                    <div className="flex justify-center">
                        <span className={`w-2.5 h-2.5 rounded-full ${dataLoaded ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                    </div>
                ) : (
                    <div>
                        <div className="text-xs text-auditiq-muted mb-1">Dataset</div>
                        {dataLoaded && dataStats ? (
                            <div className="flex items-center gap-2 text-sm text-auditiq-text">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                                <span className="truncate">{formatRows(dataStats.rows)} rows</span>
                                <span className="text-auditiq-muted text-xs">· {modulesCompleted}/5</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-auditiq-muted">
                                <span className="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0" />
                                No dataset loaded
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
