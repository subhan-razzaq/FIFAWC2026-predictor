import { useStore } from "../../store/store";

export function BracketView() {
  const single = useStore((s) => s.single);
  return (
    <div className="wrap">
      <div className="section-head">
        <h2>Bracket</h2>
      </div>
      <p className="mono" style={{ color: "var(--text-faint)" }}>
        {single ? `Champion: ${single.champion}` : "The live bracket reveal is built next."}
      </p>
    </div>
  );
}
