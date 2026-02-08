import { useEffect, useState } from "react";
import { Compass, Filter, Menu, X } from "lucide-react";
import type { Mode, PriceBucket } from "@/features/bourgogne/types";

type Props = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  grapes: string[];
  selectedGrape: string;
  onGrapeChange: (grape: string) => void;
  selectedPriceBucket: PriceBucket;
  onPriceBucketChange: (priceBucket: PriceBucket) => void;
};

export function Controls({
  mode,
  onModeChange,
  grapes,
  selectedGrape,
  onGrapeChange,
  selectedPriceBucket,
  onPriceBucketChange,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      if (window.innerWidth > 940) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const closeOnMobile = () => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 940px)").matches
    ) {
      setMobileOpen(false);
    }
  };

  return (
    <>
      <button
        className="bourgogne-controls-toggle"
        onClick={() => setMobileOpen((prev) => !prev)}
        type="button"
        aria-expanded={mobileOpen}
        aria-controls="bourgogne-controls-panel"
      >
        {mobileOpen ? <X size={16} /> : <Menu size={16} />}
        <span>Filters</span>
      </button>

      {mobileOpen ? (
        <button
          className="bourgogne-controls-backdrop"
          onClick={() => setMobileOpen(false)}
          type="button"
          aria-label="Close filters"
        />
      ) : null}

      <section
        id="bourgogne-controls-panel"
        className={`bourgogne-controls ${mobileOpen ? "is-open" : ""}`}
      >
        <div className="bourgogne-control-group">
          <p>
            <Compass size={14} /> Mode
          </p>
          {(["explore", "story"] as Mode[]).map((entry) => (
            <button
              key={entry}
              className={mode === entry ? "is-active" : ""}
              onClick={() => {
                onModeChange(entry);
                closeOnMobile();
              }}
              type="button"
            >
              {entry}
            </button>
          ))}
        </div>

        <div className="bourgogne-control-group">
          <p>
            <Filter size={14} /> Grape
          </p>
          <select
            value={selectedGrape}
            onChange={(event) => {
              onGrapeChange(event.target.value);
              closeOnMobile();
            }}
          >
            {grapes.map((grape) => (
              <option key={grape} value={grape}>
                {grape}
              </option>
            ))}
          </select>
        </div>

        <div className="bourgogne-control-group">
          <p>Price</p>
          <select
            value={selectedPriceBucket}
            onChange={(event) => {
              onPriceBucketChange(event.target.value as PriceBucket);
              closeOnMobile();
            }}
          >
            <option value="all">All</option>
            <option value="entry">Entry</option>
            <option value="mid">Mid</option>
            <option value="premium">Premium</option>
            <option value="iconic">Iconic</option>
          </select>
        </div>
      </section>
    </>
  );
}
