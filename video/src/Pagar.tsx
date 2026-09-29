import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { SceneClock } from "./clock";
import { Grain } from "./components/Base";
import { SCENES } from "./theme";
import { ColdOpen, Hook, Problem } from "./scenes/Intro";
import { Reveal } from "./scenes/Reveal";
import { Attack1, Attack2, Happy } from "./scenes/Attacks";
import { End, Proof } from "./scenes/Outro";

const ORDER: [keyof typeof SCENES, () => React.JSX.Element][] = [
  ["cold", ColdOpen],
  ["hook", Hook],
  ["problem", Problem],
  ["reveal", Reveal],
  ["attack1", Attack1],
  ["attack2", Attack2],
  ["happy", Happy],
  ["proof", Proof],
  ["end", End],
];

export function Pagar({ withAudio = true }: { withAudio?: boolean }) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0B09" }}>
      {ORDER.map(([key, Scene]) => {
        const [from, to] = SCENES[key];
        return (
          <Sequence key={key} name={key} from={from} durationInFrames={to - from}>
            <SceneClock start={from}>
              <Scene />
            </SceneClock>
          </Sequence>
        );
      })}
      <Grain />
      {withAudio && <Audio src={staticFile("audio/score.wav")} />}
    </AbsoluteFill>
  );
}
