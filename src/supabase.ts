import { createClient } from '@supabase/supabase-js';
import { Quiz, ThemeColor } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Multi-tab BroadcastChannel ensures 0ms cross-tab delivery on the same device
const localBus = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('quizguard_realtime_bus') 
  : null;

export const broadcastMessage = (payload: any) => {
  if (localBus) {
    try { localBus.postMessage(payload); } catch (e) {}
  }
  if (supabase) {
    try {
      const channel = supabase.channel('quizguard_global');
      channel.send({
        type: 'broadcast',
        event: 'message',
        payload,
      });
    } catch (e) {}
  }
};

export const subscribeToMessages = (callback: (payload: any) => void) => {
  const localHandler = (e: MessageEvent) => {
    if (e.data) callback(e.data);
  };
  if (localBus) {
    localBus.addEventListener('message', localHandler);
  }

  let channel: any = null;
  if (supabase) {
    channel = supabase.channel('quizguard_global')
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        callback(payload);
      })
      .subscribe();
  }

  return () => {
    if (localBus) {
      localBus.removeEventListener('message', localHandler);
    }
    if (channel && supabase) {
      supabase.removeChannel(channel);
    }
  };
};

export const saveQuiz = async (quiz: Quiz) => {
  localStorage.setItem(`quizguard_quiz_${quiz.id}`, JSON.stringify(quiz));
  if (supabase) {
    try {
      await supabase.from('quizzes').upsert({
        id: quiz.id,
        title: quiz.title,
        questions: quiz.questions,
        theme: quiz.theme,
        pacing_mode: quiz.pacingMode,
        status: quiz.status,
        updated_at: new Date().toISOString()
      });
    } catch (e) {}
  }
};

export const getSavedQuiz = async (id: string): Promise<Quiz | null> => {
  const local = localStorage.getItem(`quizguard_quiz_${id}`);
  if (local) {
    try { return JSON.parse(local); } catch (e) {}
  }
  if (supabase) {
    try {
      const { data } = await supabase.from('quizzes').select('*').eq('id', id).maybeSingle();
      if (data) {
        return {
          id: data.id,
          hostEmail: '',
          title: data.title,
          createdAt: data.created_at || '',
          pacingMode: data.pacing_mode || 'manual',
          theme: data.theme || 'slate',
          questions: data.questions || [],
          status: data.status || 'live',
          participants: {}
        };
      }
    } catch (e) {}
  }
  return null;
};

export const applyGlobalTheme = (theme: ThemeColor) => {
  document.documentElement.setAttribute('data-theme', theme);
};
