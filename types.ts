// Extend Window interface for Web Speech API
export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

export interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

// Game Types
export interface CharacterStats {
  health: number;
  resolve: number;
  suspicion: number;
}

export interface Achievement {
  id: string; // unique slug
  title: string;
  description: string;
}

export interface GameCharacter {
  name: string;
  description: string;
  status: 'Alive' | 'Dead' | 'Missing' | 'Unknown';
}

export interface StoryResponse {
  narrative: string;
  stats: CharacterStats;
  inventory: string[];
  characters: GameCharacter[];
  new_achievements?: Achievement[];
}

export interface DiaryEntry {
  id: string;
  text: string;
  timestamp: string;
  isUserAction?: boolean;
}

export interface GameSettings {
  textSize: 'sm' | 'base' | 'lg' | 'xl';
  typingSpeed: number; // ms per char
}

export interface SaveData {
  entries: DiaryEntry[];
  stats: CharacterStats;
  inventory: string[];
  characters: GameCharacter[];
  achievements: Achievement[];
  premise: string;
  timestamp: string;
}

export enum GameState {
  START,
  LOADING_ANIMATION,
  PLAYING,
  ERROR
}