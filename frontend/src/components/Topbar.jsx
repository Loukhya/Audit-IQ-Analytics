import React from 'react';
import { Menu } from 'lucide-react';

export default function Topbar({ title, collapsed, sidebarHidden, onToggleSidebar }) {
    const leftOffset = sidebarHidden ? 0 : (collapsed ? 64 : 240);

    return (
        <div
            className="fixed top-0 right-0 h-[56px] bg-auditiq-sidebar border-b border-auditiq-border flex items-center justify-between px-6 z-10 transition-all duration-300"
            style={{ left: leftOffset }}
        >
            <div className="flex items-center gap-3">
                {sidebarHidden && (
                    <button
                        onClick={onToggleSidebar}
                        className="text-auditiq-muted hover:text-white transition-colors mr-2"
                    >
                        <Menu size={22} />
                    </button>
                )}
                <div className="text-white font-medium text-lg">
                    {title}
                </div>
            </div>
            <div className="flex items-center gap-6">
                <div className="hidden md:flex items-center gap-2 bg-[#1A2534] pl-2 pr-3 py-1.5 rounded-full border border-auditiq-border">
                    <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse" />
                    <span className="text-xs text-green-400 font-medium tracking-wide items-center leading-none mt-0.5 shadow-sm">Live Analysis</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="text-white text-sm leading-tight">Auditor</span>
                        <span className="text-auditiq-muted text-xs">Senior Analyst</span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-auditiq-teal flex items-center justify-center text-white font-medium text-sm">
                        AU
                    </div>
                </div>
            </div>
        </div>
    );
}
