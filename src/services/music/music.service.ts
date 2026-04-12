import path from "path";
import fs from "fs-extra";
import type { MusicMood, MusicTrack } from "../../types/video.types";
import { logger } from "../../logger";

const MUSIC_LIST: Array<{ file: string; start: number; end: number; mood: MusicMood }> = [
  { file: "Sly Sky - Telecasted.mp3", start: 0, end: 152, mood: "melancholic" },
  { file: "No.2 Remembering Her - Esther Abrami.mp3", start: 2, end: 134, mood: "melancholic" },
  { file: "Champion - Telecasted.mp3", start: 0, end: 142, mood: "chill" },
  { file: "Oh Please - Telecasted.mp3", start: 0, end: 154, mood: "chill" },
  { file: "Jetski - Telecasted.mp3", start: 0, end: 142, mood: "uneasy" },
  { file: "Phantom - Density & Time.mp3", start: 0, end: 178, mood: "uneasy" },
  { file: "On The Hunt - Andrew Langdon.mp3", start: 0, end: 95, mood: "uneasy" },
  { file: "Name The Time And Place - Telecasted.mp3", start: 0, end: 142, mood: "excited" },
  { file: "Delayed Baggage - Ryan Stasik.mp3", start: 3, end: 108, mood: "euphoric" },
  { file: "Like It Loud - Dyalla.mp3", start: 4, end: 160, mood: "euphoric" },
  { file: "Organic Guitar House - Dyalla.mp3", start: 2, end: 160, mood: "euphoric" },
  { file: "Honey, I Dismembered The Kids - Ezra Lipp.mp3", start: 2, end: 144, mood: "dark" },
  { file: "Night Hunt - Jimena Contreras.mp3", start: 0, end: 88, mood: "dark" },
  { file: "Curse of the Witches - Jimena Contreras.mp3", start: 0, end: 102, mood: "dark" },
  { file: "Restless Heart - Jimena Contreras.mp3", start: 0, end: 94, mood: "sad" },
  { file: "Heartbeat Of The Wind - Asher Fulero.mp3", start: 0, end: 124, mood: "sad" },
  { file: "Hopeless - Jimena Contreras.mp3", start: 0, end: 250, mood: "sad" },
  { file: "Touch - Anno Domini Beats.mp3", start: 0, end: 165, mood: "happy" },
  { file: "Cafecito por la Manana - Cumbia Deli.mp3", start: 0, end: 184, mood: "happy" },
  { file: "Aurora on the Boulevard - National Sweetheart.mp3", start: 0, end: 130, mood: "happy" },
  { file: "Buckle Up - Jeremy Korpas.mp3", start: 0, end: 128, mood: "angry" },
  { file: "Twin Engines - Jeremy Korpas.mp3", start: 0, end: 120, mood: "angry" },
  { file: "Hopeful - Nat Keefe.mp3", start: 0, end: 175, mood: "hopeful" },
  { file: "Hopeful Freedom - Asher Fulero.mp3", start: 1, end: 172, mood: "hopeful" },
  { file: "Crystaline - Quincas Moreira.mp3", start: 0, end: 140, mood: "contemplative" },
  { file: "Final Soliloquy - Asher Fulero.mp3", start: 1, end: 178, mood: "contemplative" },
  { file: "Seagull - Telecasted.mp3", start: 0, end: 123, mood: "funny" },
  { file: "Banjo Doops - Joel Cummins.mp3", start: 0, end: 98, mood: "funny" },
  { file: "Baby Animals Playing - Joel Cummins.mp3", start: 0, end: 124, mood: "funny" },
  { file: "Sinister - Anno Domini Beats.mp3", start: 0, end: 215, mood: "dark" },
  { file: "Traversing - Godmode.mp3", start: 0, end: 95, mood: "dark" },
];

export class MusicService {
  constructor(private musicDirPath: string, private serverBaseUrl: string) {}

  listStyles(): MusicMood[] {
    return [...new Set(MUSIC_LIST.map((m) => m.mood))];
  }

  pickTrack(mood?: MusicMood): MusicTrack {
    const candidates = mood
      ? MUSIC_LIST.filter((m) => m.mood === mood)
      : MUSIC_LIST;

    const track = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      ...track,
      url: `${this.serverBaseUrl}/music/${encodeURIComponent(track.file)}`,
    };
  }

  ensureMusicFilesExist(): void {
    for (const track of MUSIC_LIST) {
      const filePath = path.join(this.musicDirPath, track.file);
      if (!fs.existsSync(filePath)) {
        logger.warn({ file: track.file }, "Music file missing — copy from short-video-maker/static/music/");
      }
    }
  }
}
