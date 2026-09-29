import { createContext, useContext, type ReactNode } from "react";
import { useCurrentFrame } from "remotion";

// Scenes live inside <Sequence>s, but every cue in timeline.json (and in the audio) is a GLOBAL
// frame. useG() returns the global frame so scene code can use timeline numbers verbatim.
const Offset = createContext(0);

export function SceneClock({ start, children }: { start: number; children: ReactNode }) {
  return <Offset.Provider value={start}>{children}</Offset.Provider>;
}

export function useG() {
  return useCurrentFrame() + useContext(Offset);
}
