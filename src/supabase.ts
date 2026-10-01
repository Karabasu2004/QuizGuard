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

export const saveQuiz = async (quiz: Quiz) => {
  localStorage.setItem(`quizguard_quiz_${quiz.id}`, JSON.stringify(quiz));
  if (supabase) {
    try {
      await supabase.from('quizzes').upsert({
        id: quiz.id,
        host_email: quiz.hostEmail || 'host@quizguard.live',
        title: quiz.title,
        pacing_mode: quiz.pacingMode,
        theme: quiz.theme || 'slate',
        questions: quiz.questions
      });
    } catch (e) {
      console.error('Error syncing quiz to Supabase:', e);
    }
  }
};

export const getSavedQuiz = async (quizId: string): Promise<Quiz | null> => {
  const local = localStorage.getItem(`quizguard_quiz_${quizId}`);
  if (local) {
    try { return JSON.parse(local); } catch (e) {}
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .single();

      if (data && !error) {
        return {
          id: data.id,
          hostEmail: data.host_email,
          title: data.title,
          pacingMode: data.pacing_mode,
          theme: data.theme,
          questions: data.questions,
          createdAt: data.created_at
        } as Quiz;
      }
    } catch (e) {
      console.error('Error fetching quiz from Supabase:', e);
    }
  }
  return null;
};
