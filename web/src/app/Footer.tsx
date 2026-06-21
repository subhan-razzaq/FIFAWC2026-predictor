import { useStore } from "../store/store";

export function Footer() {
  const model = useStore((s) => s.model);
  return (
    <footer className="site-footer">
      <div className="wrap" style={{ display: "grid", gap: "var(--s-3)" }}>
        <div className="eyebrow">WELTMEISTER — World Cup 2026 prediction engine</div>
        <p style={{ maxWidth: "62ch" }}>
          An independent portfolio project. Not affiliated with or endorsed by FIFA. The badges and
          motifs are original work in the spirit of the 2026 identity, not official marks.
        </p>
        {model && (
          <p className="mono" style={{ fontSize: "var(--t-xs)" }}>
            model snapshot {model.meta.snapshot_date} · fit on {model.meta.n_fit_matches.toLocaleString()} matches ·
            sources: {model.meta.sources.join("; ")}
          </p>
        )}
      </div>
    </footer>
  );
}
