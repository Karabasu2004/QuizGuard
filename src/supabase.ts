import { createClient } from '@supabase/supabase-js';
import { Quiz, ThemeColor } from './types';

const supabaseUrl = 'https://xpmmjwltjwaoadncomjs.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwbW1qd2x0andhb2FkbmNvbWpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NzcxNTQsImV4cCI6MjEwNjM1MzE1NH0.MdaTeVN0nwqUZIel6SjBRL-cSaxH7xT2fIpBeuaNkts';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
      const { error } = await supabase.from('quizzes').upsert({
        id: quiz.id,
        host_email: quiz.hostEmail || '',
        title: quiz.title,
        questions: quiz.questions,
        theme: quiz.theme || 'slate',
        pacing_mode: quiz.pacingMode || 'manual',
        status: quiz.status || 'live',
        updated_at: new Date().toISOString()
      });

      if (error) {
        console.error('Supabase saveQuiz rejected:', error.message);
      } else {
        console.log('Quiz successfully stored in Supabase cloud:', quiz.id);
      }
    } catch (e) {
      console.error('saveQuiz exception:', e);
    }
  }
};

export const getSavedQuiz = async (id: string): Promise<Quiz | null> => {
  const local = localStorage.getItem(`quizguard_quiz_${id}`);
  if (local) {
    try { return JSON.parse(local); } catch (e) {}
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.from('quizzes').select('*').eq('id', id).maybeSingle();
      if (error) {
        console.error('Supabase cloud fetch error:', error.message);
        return null;
      }
      if (data) {
        return {
          id: data.id,
          hostEmail: data.host_email || '',
          title: data.title,
          createdAt: data.created_at || new Date().toLocaleString(),
          mode: 'marks_challenge',
          totalDurationMinutes: 20,
          sections: [
            { id: 'sec_3m', name: 'Section A (3M)', marksPerQuestion: 3, negativeMarkingEnabled: true, negativeMarking: 1 },
            { id: 'sec_5m', name: 'Section B (5M)', marksPerQuestion: 5, negativeMarkingEnabled: true, negativeMarking: 1 },
            { id: 'sec_7m', name: 'Section C (7M)', marksPerQuestion: 7, negativeMarkingEnabled: true, negativeMarking: 2 },
            { id: 'sec_10m', name: 'Section D (10M)', marksPerQuestion: 10, negativeMarkingEnabled: true, negativeMarking: 2 },
          ],
          shuffleQuestions: true,
          shuffleOptions: true,
          pacingMode: data.pacing_mode || 'manual',
          theme: data.theme || 'slate',
          questions: Array.isArray(data.questions) ? data.questions : [],
          status: data.status || 'live',
          participants: {}
        };
      }
    } catch (e) {
      console.error('getSavedQuiz exception:', e);
    }
  }
  return null;
};

export const applyGlobalTheme = (theme: ThemeColor) => {
  document.documentElement.setAttribute('data-theme', theme);
};
