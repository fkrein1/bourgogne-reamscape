import { motion } from "framer-motion";
import type { SceneWine } from "@/features/bourgogne/types";
import { money } from "@/features/bourgogne/lib/map-utils";

type Props = {
  center: { x: number; y: number } | null;
  wines: SceneWine[];
};

export function WineFanout({ center, wines }: Props) {
  if (!center || wines.length === 0) return null;

  const fanWines = wines.slice(0, 6);
  const startAngle = -125;
  const endAngle = 55;

  return (
    <div className="bourgogne-fanout-layer" aria-hidden>
      {fanWines.map((wine, idx) => {
        const t = fanWines.length === 1 ? 0.5 : idx / (fanWines.length - 1);
        const angleDeg = startAngle + (endAngle - startAngle) * t;
        const angle = (angleDeg * Math.PI) / 180;
        const radius = 112 + (idx % 2) * 18;
        const x = center.x + Math.cos(angle) * radius;
        const y = center.y + Math.sin(angle) * radius;

        return (
          <motion.button
            key={wine.id}
            className="bourgogne-fanout-card"
            style={{ left: x, top: y }}
            initial={{ opacity: 0, scale: 0.7, x: center.x - x, y: center.y - y }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.28 }}
            onClick={() => window.open(wine.url, "_blank", "noopener,noreferrer")}
            title="Open wine page"
            type="button"
          >
            <span>{wine.title}</span>
            <strong>{money(wine.price)}</strong>
          </motion.button>
        );
      })}
    </div>
  );
}
