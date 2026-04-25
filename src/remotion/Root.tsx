import React from "react";
import { Composition, registerRoot } from "remotion";
import { YouTubeVideo } from "./compositions/YouTubeVideo";
import { ShortsVideo } from "./compositions/ShortsVideo";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadOpenSans } from "@remotion/google-fonts/OpenSans";

// Load common fonts
loadInter(undefined, { ignoreTooManyRequestsWarning: true });
loadRoboto(undefined, { ignoreTooManyRequestsWarning: true });
loadMontserrat(undefined, { ignoreTooManyRequestsWarning: true });
loadOpenSans(undefined, { ignoreTooManyRequestsWarning: true });

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="YouTubeVideo"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={YouTubeVideo as React.ComponentType<any>}
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          scenes: [],
          voiceover: { url: "" },
          music: undefined,
          config: {
            durationMs: 10000,
            orientation: "landscape",
            useSrt: true,
            musicVolume: "medium",
            paddingBack: 1500,
          },
        }}
        calculateMetadata={({ props }) => {
          return {
            durationInFrames: Math.ceil((((props as any).config?.durationMs || 10000) / 1000) * 30),
          };
        }}
      />
      <Composition
        id="ShortsVideo"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={ShortsVideo as React.ComponentType<any>}
        durationInFrames={300}
        fps={30}
        width={720}
        height={1280}
        defaultProps={{
          scenes: [],
          voiceover: { url: "" },
          music: undefined,
          config: {
            durationMs: 10000,
            orientation: "portrait",
            useSrt: true,
            musicVolume: "medium",
            paddingBack: 1500,
          },
        }}
        calculateMetadata={({ props }) => {
          return {
            durationInFrames: Math.ceil((((props as any).config?.durationMs || 10000) / 1000) * 30),
          };
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
