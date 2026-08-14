// Lightweight skeleton primitives for elegant loading states.

export function SkeletonLine({ width = "100%", height = 14, style }: { width?: string | number; height?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width, height, ...style }} aria-hidden />;
}

export function SkeletonBlock({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={className ?? ""} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} style={{ height: 16, marginBottom: 14 }} />
      ))}
    </div>
  );
}
