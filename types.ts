
export enum VisualStyle {
  RealPerson = 'Real Person',
  Animation3D = '3D Animation',
  Anime2D = '2D Anime',
  Cinematic = 'Cinematic',
  Cyberpunk = 'Cyberpunk',
  Studio = 'Studio'
}

export enum VideoMode {
  Similar = 'similar',
  Different = 'different'
}

export interface PromptRow {
  stt: number;
  prompt: string;
  voice: string;
}

export interface VideoConfig {
  summary: string;
  styleAnalysis: string;
  mode: VideoMode;
  topic: string;
  visualStyle: VisualStyle;
  aspectRatio: '16:9' | '9:16';
  durationMin: number;
  voiceLang: string;
  channelName: string;
  background: string;
  timeline: string;
  prompts: PromptRow[];
}
