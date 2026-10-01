export type ThemeColor = 'slate' | 'midnight' | 'cyberpunk' | 'emerald' | 'crimson';

export const THEME_CONFIG: Record<ThemeColor, { bg: string; text: string; glow: string; name: string }> = {
  slate: { bg: '#020617', text: '#f8fafc', glow: 'rgba(6, 182, 212, 0.12)', name: 'Slate Obsidian' },
  midnight: { bg: '#070e24', text: '#e2e8f0', glow: 'rgba(59, 130, 246, 0.18)', name: 'Midnight Cobalt' },
  cyberpunk: { bg: '#170428', text: '#fae8ff', glow: 'rgba(217, 70, 239, 0.20)', name: 'Cyberpunk Neon' },
  emerald: { bg: '#021a0f', text: '#ecfdf5', glow: 'rgba(16, 185, 129, 0.18)', name: 'Emerald Terminal' },
  crimson: { bg: '#1c0407', text: '#ffe4e6', glow: 'rgba(239, 68, 68, 0.18)', name: 'Crimson Ember' },
};

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  timeLimit: number;
}

export interface ViolationLog {
  id: string;
  type: 'fullscreen_exit' | 'tab_switch' | 'blur';
  timestamp: string;
  message: string;
}

export interface StudentResult {
  id: string;
  name: string;
  score: number;
  totalQuestions: number;
  strikes: number;
  status: 'Active' | 'Disqualified' | 'Completed';
  completedAt?: string;
  violations: ViolationLog[];
  answers: Record<number, number>;
}

export interface Quiz {
  id: string;
  hostEmail: string;
  title: string;
  createdAt: string;
  pacingMode: 'manual' | 'auto';
  theme: ThemeColor;
  questions: Question[];
  status: 'draft' | 'live' | 'completed';
  participants: Record<string, StudentResult>;
}

export interface QuizBroadcastMessage {
  type: 'STUDENT_SUBMIT' | 'STUDENT_VIOLATION' | 'HOST_SYNC' | 'THEME_CHANGE';
  quizId: string;
  quiz?: Quiz;
  student?: StudentResult;
  theme?: ThemeColor;
}
