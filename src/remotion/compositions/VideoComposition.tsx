import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import type { SceneMedia, Caption, MusicTrack, SrtStyle } from "../../types/video.types";
import { ImageScene } from "./scenes/ImageScene";
import { AnimatedTextScene } from "./scenes/AnimatedTextScene";
import { FormulaScene } from "./scenes/FormulaScene";
import { Subtitles } from "./overlays/Subtitles";

export interface VideoCompositionProps {
  scenes: Array<{
    media: SceneMedia;
    durationMs: number;
    captions: Caption[];
    audioUrl?: string;
  }>;
  music?: MusicTrack;
  config: {
    durationMs: number;
    orientation: string;
    useSrt: boolean;
    srtStyle?: Partial<SrtStyle>;
    musicVolume?: string;
    paddingBack?: number;
  };
}

export function calculateVolume(volume?: string): number {
  switch (volume) {
    case "muted": return 0;
    case "low": return 0.2;
    case "medium": return 0.45;
    case "high": return 0.7;
    default: return 0.45;
  }
}

export function VideoComposition({ scenes, music, config }: VideoCompositionProps) {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  let offsetFrames = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>

      {/* Music */}
      {music && (
        <Audio
          src={music.url}
          startFrom={Math.round(music.start * fps)}
          endAt={Math.round(music.end * fps)}
          volume={calculateVolume(config.musicVolume)}
        />
      )}

      {/* Scenes */}
      {scenes.map((scene, i) => {
        const durationFrames = Math.round((scene.durationMs / 1000) * fps);
        const startFrame = offsetFrames;
        offsetFrames += durationFrames;

        return (
          <Sequence key={i} from={startFrame} durationInFrames={durationFrames}>
            <AbsoluteFill>
              {/* Background media */}
              {scene.media.type === "image" && <ImageScene media={scene.media} durationFrames={durationFrames} />}
              {scene.media.type === "animated_text" && <AnimatedTextScene media={scene.media} />}
              {scene.media.type === "formula" && <FormulaScene media={scene.media} />}
              
              {/* Scene Audio */}
              {scene.audioUrl && <Audio src={scene.audioUrl} />}
              
              {/* Subtitles Overlay */}
              {config.useSrt && scene.captions.length > 0 && (
                <Subtitles
                  captions={scene.captions}
                  style={config.srtStyle}
                />
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
