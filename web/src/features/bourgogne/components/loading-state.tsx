import { Sparkles } from "lucide-react";

export function LoadingState() {
  return (
    <main className="bourgogne-shell">
      <div className="bourgogne-loading">
        <Sparkles size={30} />
        <p>Preparing the Bourgogne dreamscape...</p>
      </div>
    </main>
  );
}
