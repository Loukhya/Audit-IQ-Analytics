import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function PageWrapper({ title, children }) {
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    const [sidebarHidden, setSidebarHidden] = useState(false);

    // Responsive sidebar
    useEffect(() => {
        const handleResize = () => {
            const w = window.innerWidth;
            if (w < 900) {
                setSidebarHidden(true);
                setCollapsed(false);
            } else if (w < 1280) {
                setSidebarHidden(false);
                setCollapsed(true);
            } else {
                setSidebarHidden(false);
                setCollapsed(false);
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const marginLeft = sidebarHidden ? 0 : (collapsed ? 64 : 240);

    return (
        <div className="min-h-screen bg-auditiq-bg flex">
            <Sidebar
                collapsed={collapsed}
                hidden={sidebarHidden}
                onToggle={() => {
                    if (sidebarHidden) setSidebarHidden(false);
                    else setCollapsed(!collapsed);
                }}
            />
            <div
                className="flex-1 flex flex-col transition-all duration-300"
                style={{ marginLeft }}
            >
                <Topbar
                    title={title}
                    collapsed={collapsed}
                    sidebarHidden={sidebarHidden}
                    onToggleSidebar={() => setSidebarHidden(!sidebarHidden)}
                />
                <main className="mt-[56px] p-6 text-auditiq-text h-[calc(100vh-56px)] overflow-y-auto">
                    <div key={location.pathname} style={{ animation: 'fadeIn 0.3s ease-out' }}>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
