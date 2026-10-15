export default function LoadingSpinner({ size = 'md', color = '#14b8a6', label = '' }) {
  const sizes = { sm: 20, md: 36, lg: 56 };
  const dim = sizes[size] || sizes.md;
  const border = dim < 30 ? 2 : dim < 50 ? 3 : 4;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: dim, height: dim, borderRadius: '50%',
        border: `${border}px solid rgba(255,255,255,0.1)`,
        borderTopColor: color,
        animation: 'spin 0.8s linear infinite',
      }} />
      {label && <span style={{ color: '#94a3b8', fontSize: 13 }}>{label}</span>}
    </div>
  );
}
