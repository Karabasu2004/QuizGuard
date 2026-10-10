export type ThemeColor = 'slate' | 'midnight' | 'cyberpunk' | 'emerald' | 'crimson';

export type QuestionType = 'mcq' | 'fib' | 'multi_fib';
export type QuizMode = 'classic' | 'marks_challenge';

export interface QuizSection {
  id: string;
  name: string;
  marksPerQuestion: number;
  negativeMarking: number; // e.g. 0, 1, 2
}

export interface Question {
  id: string;
  sectionId?: string;
  text: string;
  type?: QuestionType;
  options?: string[];
  correctAnswer: number | string | string[]; // string[] for multi_fib
  timeLimit?: number;
  marks?: number;
  explanation?: string;
}

export interface Violation {
  timestamp: string;
  message: string;
}

export interface StudentResult {
  id: string;
  name: string;
  score: number;
  timeTakenSeconds?: number;
  strikes: number;
  status: 'Active' | 'Completed' | 'Disqualified';
  violations: Violation[];
  answers?: Record<string, any>;
  reviewFlags?: Record<string, boolean>;
  submittedAt?: string;
  sectionScores?: Record<string, number>;
}

export interface Quiz {
  id: string;
  hostEmail: string;
  title: string;
  createdAt: string;
  mode?: QuizMode;
  totalDurationMinutes?: number; // e.g. 20 for marks_challenge
  sections?: QuizSection[];
  pacingMode: 'manual' | 'auto' | 'ended';
  theme: ThemeColor;
  questions: Question[];
  status: 'live' | 'ended';
  participants: Record<string, StudentResult>;
}

export const THEME_CONFIG: Record<ThemeColor, { name: string; glow: string; bg: string }> = {
  slate: {
    name: 'Slate Obsidian',
    glow: 'rgba(56, 189, 248, 0.15)',
    bg: '#020617',
  },
  midnight: {
    name: 'Midnight Cobalt',
    glow: 'rgba(59, 130, 246, 0.2)',
    bg: '#030712',
  },
  cyberpunk: {
    name: 'Cyberpunk Neon',
    glow: 'rgba(217, 70, 239, 0.2)',
    bg: '#0a0518',
  },
  emerald: {
    name: 'Emerald Matrix',
    glow: 'rgba(16, 185, 129, 0.2)',
    bg: '#021810',
  },
  crimson: {
    name: 'Crimson Ember',
    glow: 'rgba(239, 68, 68, 0.2)',
    bg: '#180404',
  },
};
