import { createClient } from '@supabase/supabase-js';
import { Quiz, ThemeColor, THEME_CONFIG, QuizBroadcastMessage } from './types';

const env = (import.meta as any).env || {};
const supabaseUrl: string = env.VITE_SUPABASE_URL || '';
const supabaseAnonKey: string = env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

const fallbackChannel = typeof window !== 'undefined' ? new BroadcastChannel('quizguard_live_channel') : null;

export const applyGlobalTheme = (theme: ThemeColor) => {
  const conf = THEME_CONFIG[theme] || THEME_CONFIG.slate;
  if (typeof document !== 'undefined') {
    document.body.style.backgroundColor = conf.bg;
    document.body.style.color = conf.text;
    document.documentElement.style.backgroundColor = conf.bg;
  }
};

export const broadcastMessage = (message: QuizBroadcastMessage) => {
  if (fallbackChannel) {
    fallbackChannel.postMessage(message);
  }
};

export const subscribeToMessages = (callback: (msg: QuizBroadcastMessage) => void) => {
  if (!fallbackChannel) return () => {};
  
  const handler = (event: MessageEvent<QuizBroadcastMessage>) => {
    callback(event.data);
  };

  fallbackChannel.addEventListener('message', handler);
  return () => {
    fallbackChannel.removeEventListener('message', handler);
  };
};

export const getSavedQuiz = (quizId: string): Quiz | null => {
  const data = localStorage.getItem(`quizguard_quiz_${quizId}`);
  return data ? JSON.parse(data) : null;
};

export const saveQuiz = (quiz: Quiz) => {
  localStorage.setItem(`quizguard_quiz_${quiz.id}`, JSON.stringify(quiz));
};
