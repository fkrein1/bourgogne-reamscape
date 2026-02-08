import { motion } from "framer-motion";
import { Grape, MapPinned, Wine } from "lucide-react";

type Props = {
  counts: {
    wines: number;
    producers: number;
    grapes: number;
  };
};

export function Hero({ counts }: Props) {
  return (
    <section className="bourgogne-hero">
      <motion.p initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.45 }}>
        Immersive Atlas
      </motion.p>
      <motion.h1 initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.65 }}>
        Bourgogne Dreamscape
      </motion.h1>
      <motion.div
        className="bourgogne-statbar"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.6 }}
      >
        <span>
          <Wine size={14} /> {counts.wines} wines
        </span>
        <span>
          <MapPinned size={14} /> {counts.producers} producers
        </span>
        <span>
          <Grape size={14} /> {counts.grapes} grapes
        </span>
      </motion.div>
    </section>
  );
}
