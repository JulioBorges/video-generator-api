import React from "react";
import { AbsoluteFill, OffthreadVideo } from "remotion";
import type { SceneMedia } from "../../../types/video.types";

interface Props { media: SceneMedia }

export const VideoScene: React.FC<Props> = ({ media }) => (
  <AbsoluteFill>
    <OffthreadVideo
      src={media.url}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  </AbsoluteFill>
);
