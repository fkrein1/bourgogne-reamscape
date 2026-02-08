import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { SceneSubRegion } from "@/features/bourgogne/types";
import { money } from "@/features/bourgogne/lib/map-utils";

type Props = {
  chapters: SceneSubRegion[];
  storyIndex: number;
  storyAutoplay: boolean;
  onPrev: () => void;
  onToggleAutoplay: () => void;
  onNext: () => void;
  onSelectChapter: (index: number) => void;
};

export function StoryPanel({
  chapters,
  storyIndex,
  storyAutoplay,
  onPrev,
  onToggleAutoplay,
  onNext,
  onSelectChapter,
}: Props) {
  const activeChapter = chapters.length > 0 ? chapters[storyIndex % chapters.length] : null;
  const leadGrape = activeChapter
    ? Object.entries(activeChapter.grapes || {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ""
    : "";

  return (
    <section className="bourgogne-story">
      <div className="bourgogne-story-header">
        <p>Story Chapters</p>
        <div className="bourgogne-story-controls">
          <button type="button" disabled={chapters.length === 0} onClick={onPrev}>
            <SkipBack size={14} />
          </button>
          <button type="button" disabled={chapters.length === 0} onClick={onToggleAutoplay}>
            {storyAutoplay ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button type="button" disabled={chapters.length === 0} onClick={onNext}>
            <SkipForward size={14} />
          </button>
        </div>
      </div>

      {activeChapter ? (
        <div className="bourgogne-story-meta">
          <strong>{activeChapter.name}</strong>
          <span>
            {activeChapter.wine_count} wines • {activeChapter.producer_count} producers • lead grape {leadGrape || "mixed"}
          </span>
          <span>Average bottle: {money(activeChapter.price.avg)}</span>
        </div>
      ) : null}

      <div className="bourgogne-story-list">
        {chapters.map((chapter, idx) => (
          <button
            key={chapter.id}
            className={`bourgogne-story-pill ${storyIndex === idx ? "is-active" : ""}`}
            onClick={() => onSelectChapter(idx)}
            type="button"
          >
            {chapter.name}
          </button>
        ))}
      </div>
    </section>
  );
}
