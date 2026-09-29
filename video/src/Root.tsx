import { Composition } from "remotion";
import { Pagar } from "./Pagar";
import { SUBMISSION_FRAMES, Submission } from "./Demo";
import timeline from "./timeline.json";

export function RemotionRoot() {
  return (
    <>
      <Composition id="Pagar" component={Pagar} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={1920} height={1080} defaultProps={{ withAudio: true }} />
      <Composition id="PagarSilent" component={Pagar} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={1920} height={1080} defaultProps={{ withAudio: false }} />
      <Composition id="Submission" component={Submission} durationInFrames={SUBMISSION_FRAMES} fps={timeline.fps} width={1920} height={1080} />
    </>
  );
}
