import { createClient } from '@supabase/supabase-js';
import { Quiz, ThemeColor, THEME_CONFIG, QuizBroadcastMessage } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xpmmjwltjwaoadncomjs.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwbW1qd2x0andhb2FkbmNvbWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NzcxNTQsImV4cCI6MjEwNjM1MzE1NH0.MdaTeVN0nwqUZIel6SjBRL-cSaxH7xT2fIpBeuaNkts';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

export const saveQuiz = async (quiz: Quiz): Promise<boolean> => {
  try {
    localStorage.setItem(`quizguard_quiz_${quiz.id}`, JSON.stringify(quiz));
  } catch (e) {}

  if (supabase) {
    try {
      const { error } = await supabase.from('quizzes').upsert({
        id: quiz.id,
        host_email: quiz.hostEmail || 'host@quizguard.live',
        title: quiz.title,
        pacing_mode: quiz.pacingMode,
        theme: quiz.theme || 'slate',
        questions: quiz.questions
      });

      if (error) {
        console.error('Supabase save error:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Error syncing quiz to Supabase:', e);
      return false;
    }
  }
  return true;
};

export const getSavedQuiz = async (quizId: string): Promise<Quiz | null> => {
  if (!quizId) return null;

  // 1. Try local storage first
  try {
    const local = localStorage.getItem(`quizguard_quiz_${quizId}`);
    if (local) {
      return JSON.parse(local);
    }
  } catch (e) {}

  // 2. Query Supabase Cloud Database
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .maybeSingle();

      if (error) {
        console.error('Supabase fetch error:', error);
      }

      if (data) {
        let parsedQuestions = data.questions;
        if (typeof parsedQuestions === 'string') {
          try {
            parsedQuestions = JSON.parse(parsedQuestions);
          } catch (e) {
            parsedQuestions = [];
          }
        }

        return {
          id: data.id,
          hostEmail: data.host_email,
          title: data.title,
          pacingMode: data.pacing_mode || 'manual',
          theme: data.theme || 'slate',
          questions: Array.isArray(parsedQuestions) ? parsedQuestions : [],
          createdAt: data.created_at,
          participants: {}
        } as Quiz;
      }
    } catch (e) {
      console.error('Error fetching quiz from Supabase:', e);
    }
  }
  return null;
};
