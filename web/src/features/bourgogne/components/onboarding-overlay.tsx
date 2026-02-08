import { motion } from "framer-motion";
import { Compass, Grape, Map, Sparkles } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function OnboardingOverlay({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <motion.section
      className="bourgogne-onboarding"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Map onboarding"
    >
      <motion.div
        className="bourgogne-onboarding-card"
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <p>
          <Sparkles size={15} /> Welcome to Bourgogne Dreamscape
        </p>
        <h2>Quick start</h2>
        <ul>
          <li>
            <Map size={14} /> Hover polygons and beacons for instant context.
          </li>
          <li>
            <Compass size={14} /> Story mode drives a cinematic chapter tour.
          </li>
          <li>
            <Grape size={14} /> Filter by grape/price, then click producers for fan-out labels.
          </li>
        </ul>
        <button type="button" onClick={onClose}>
          Start exploring
        </button>
      </motion.div>
    </motion.section>
  );
}
