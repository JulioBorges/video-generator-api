import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import type { SceneMedia } from "../../../types/video.types";

interface Props { media: SceneMedia; durationFrames: number }

export const ImageScene: React.FC<Props> = ({ media, durationFrames }) => {
  const frame = useCurrentFrame();
  const mode = media.displayMode ?? "ken_burns";

  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  if (mode === "ken_burns") {
    scale = interpolate(frame, [0, durationFrames], [1, 1.08]);
    translateY = interpolate(frame, [0, durationFrames], [0, -20]);
  } else if (mode === "slide") {
    translateX = interpolate(frame, [0, durationFrames], [0, -80]);
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={media.url}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
        }}
      />
    </AbsoluteFill>
  );
};
