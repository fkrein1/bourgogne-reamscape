import { money } from "@/features/bourgogne/lib/map-utils";
import type { SceneProducer, SceneWine } from "@/features/bourgogne/types";

type Props = {
  producer: SceneProducer | null;
  wines: SceneWine[];
};

export function ProducerCard({ producer, wines }: Props) {
  if (!producer) return null;

  const leadGrapeEntry = Object.entries(producer.grapes ?? {}).sort(
    (a, b) => b[1] - a[1],
  )[0];
  const leadGrape = leadGrapeEntry?.[0] ?? "Mixed";
  const leadGrapeCount = leadGrapeEntry?.[1] ?? 0;
  const totalGrapeCount = Object.values(producer.grapes ?? {}).reduce(
    (sum, value) => sum + value,
    0,
  );
  const leadGrapeShare =
    totalGrapeCount > 0 ? Math.round((leadGrapeCount / totalGrapeCount) * 100) : null;

  return (
    <section className="bourgogne-panel">
      <header>
        <p>Producer Card</p>
        <h2>{producer.name}</h2>
        <span>
          {producer.primary_sub_region || "Unknown sub-region"} • {producer.wine_count} wines
        </span>
      </header>

      <div className="bourgogne-panel-grid">
        <article>
          <h3>Average Bottle</h3>
          <p>{money(producer.price.avg)}</p>
          <small>
            {money(producer.price.min)} to {money(producer.price.max)}
          </small>
        </article>
        <article>
          <h3>Lead Grape</h3>
          <p>{leadGrape}</p>
          <small>
            {leadGrapeCount} labels
            {leadGrapeShare !== null ? ` • ${leadGrapeShare}% share` : ""}
          </small>
        </article>
      </div>

      <div className="bourgogne-wine-list">
        {wines.map((wine) => (
          <button
            key={wine.id}
            onClick={() => window.open(wine.url, "_blank", "noopener,noreferrer")}
            title="Open wine page"
            type="button"
          >
            <p>{wine.title}</p>
            <span>
              {wine.grape || "Unknown grape"} • {wine.sub_region || "Unknown sub-region"}
            </span>
            <strong>{money(wine.price)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
