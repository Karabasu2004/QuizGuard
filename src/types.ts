export type ThemeColor = 'academic' | 'slate' | 'navy' | 'emerald' | 'crimson';

export type QuestionType = 'mcq' | 'fib' | 'multi_fib';
export type QuizMode = 'classic' | 'marks_challenge';

export interface QuizSection {
  id: string;
  name: string;
  marksPerQuestion: number;
  negativeMarkingEnabled: boolean;
  negativeMarking: number;
}

export interface Question {
  id: string;
  sectionId?: string;
  type?: QuestionType;
  text: string;
  options?: string[];
  correctAnswer: number | string | string[];
  timeLimit?: number;
  marks?: number;
  explanation?: string;
}

export interface QuestionBankItem extends Question {
  bankId: string;
  createdAt: string;
}

export interface Violation {
  timestamp: string;
  message: string;
}

export interface SectionSummary {
  sectionId: string;
  sectionName: string;
  earnedMarks: number;
  maxMarks: number;
  correct: number;
  wrong: number;
  skipped: number;
}

export interface QuestionScoreDetail {
  questionId: string;
  earnedMarks: number;
  maxMarks: number;
  status: 'correct' | 'partial' | 'wrong' | 'skipped';
  blankResults?: boolean[];
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
  sectionSummaries?: Record<string, SectionSummary>;
  questionDetails?: Record<string, QuestionScoreDetail>;
  totalCorrect?: number;
  totalWrong?: number;
  totalSkipped?: number;
}

export interface Quiz {
  id: string;
  hostEmail: string;
  title: string;
  createdAt: string;
  mode?: QuizMode;
  totalDurationMinutes?: number;
  sections?: QuizSection[];
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  pacingMode: 'manual' | 'auto' | 'ended';
  theme: ThemeColor;
  questions: Question[];
  status: 'live' | 'ended';
  participants: Record<string, StudentResult>;
}

export const THEME_CONFIG: Record<ThemeColor, { name: string; glow: string; bg: string; isLight?: boolean }> = {
  academic: {
    name: 'Academic Light (University)',
    glow: 'rgba(37, 99, 235, 0.08)',
    bg: '#F8FAFC',
    isLight: true,
  },
  slate: {
    name: 'Institutional Slate (Dark)',
    glow: 'rgba(56, 189, 248, 0.12)',
    bg: '#0F172A',
    isLight: false,
  },
  navy: {
    name: 'Cobalt Navy',
    glow: 'rgba(59, 130, 246, 0.15)',
    bg: '#030712',
    isLight: false,
  },
  emerald: {
    name: 'Sage Green',
    glow: 'rgba(16, 185, 129, 0.12)',
    bg: '#062016',
    isLight: false,
  },
  crimson: {
    name: 'Academic Crimson',
    glow: 'rgba(239, 68, 68, 0.12)',
    bg: '#1C0606',
    isLight: false,
  },
};
