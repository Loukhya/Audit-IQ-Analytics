import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'auditiq-bg': '#0D1117',
                'auditiq-sidebar': '#0A0F1A',
                'auditiq-card': '#161B27',
                'auditiq-border': '#1E2D45',
                'auditiq-teal': '#00C2CB',
                'auditiq-blue': '#2E75B6',
                'auditiq-text': '#E8EDF5',
                'auditiq-muted': '#8899AA',
            }
        },
    },
    plugins: [
        typography,
    ],
};
