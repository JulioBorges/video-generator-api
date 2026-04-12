import React from "react";
import { VideoComposition, type VideoCompositionProps } from "./VideoComposition";

export const YouTubeVideo: React.FC<VideoCompositionProps> = (props) => (
  <VideoComposition {...props} />
);
