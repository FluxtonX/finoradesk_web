export default function Loading() {
  return (
    <div className="loading-state" role="status" aria-label="Loading workspace">
      <div className="skeleton" style={{ width: 180, height: 18 }} />
      <div
        className="skeleton"
        style={{ width: 300, height: 42, marginTop: 16 }}
      />
      <div className="stats-grid">
        {[1, 2, 3, 4].map((n) => (
          <div className="skeleton" style={{ height: 140 }} key={n} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 320 }} />
      <span className="sr-only">Loading your business records…</span>
    </div>
  );
}
