import React, { useState, useEffect } from 'react';
import { HostDashboard } from './components/HostDashboard';
import { StudentPortal } from './components/StudentPortal';
import { ThemeColor, THEME_CONFIG } from './types';
import { subscribeToMessages, applyGlobalTheme, getSavedQuiz } from './supabase';
import { Shield, MonitorCheck, ArrowRight } from 'lucide-react';

export default function App() {
  const [role, setRole] = useState<'landing' | 'host' | 'student'>(() => {
    const rawSearch = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    const params = new URLSearchParams(rawSearch);
    return (params.get('quiz') || params.get('quizId')) ? 'student' : 'landing';
  });

  const [quizIdFromUrl, setQuizIdFromUrl] = useState<string | null>(() => {
    const rawSearch = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    const params = new URLSearchParams(rawSearch);
    return params.get('quiz') || params.get('quizId') || null;
  });

  const [activeTheme, setActiveTheme] = useState<ThemeColor>('slate');

  useEffect(() => {
    const rawSearch = window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '');
    const params = new URLSearchParams(rawSearch);
    const quizId = params.get('quiz') || params.get('quizId');
    if (quizId) {
      setQuizIdFromUrl(quizId);
      setRole('student');
      getSavedQuiz(quizId).then((loaded) => {
        if (loaded?.theme) {
          setActiveTheme(loaded.theme);
          applyGlobalTheme(loaded.theme);
        }
      });
    } else {
      applyGlobalTheme('slate');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToMessages((msg) => {
      if (msg.type === 'THEME_CHANGE' && msg.theme) {
        setActiveTheme(msg.theme);
        applyGlobalTheme(msg.theme);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleHostThemeChange = (newTheme: ThemeColor) => {
    setActiveTheme(newTheme);
    applyGlobalTheme(newTheme);
  };

  return (
    <div 
      className="min-h-screen flex flex-col justify-between"
      style={{
        background: `radial-gradient(circle at 50% 0%, ${THEME_CONFIG[activeTheme].glow} 0%, transparent 65%)`
      }}
    >
      <header className="border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-40 bg-black/40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div 
            onClick={() => setRole('landing')} 
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="p-2 bg-gradient-to-tr from-cyan-600 to-blue-600 rounded-xl shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="leading-tight">
              <span className="text-lg font-black tracking-wider text-white">
                QUIZGUARD
              </span>
            </div>
          </div>

          {role === 'host' && (
            <button 
              onClick={() => setRole('landing')}
              className="text-xs font-semibold text-white px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 border border-blue-500 shadow-md shadow-blue-600/20 transition"
            >
              Back
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {role === 'landing' && (
          <div className="py-16 space-y-12 text-center max-w-2xl mx-auto">
            <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight">
              Proctored Live Assessments
            </h1>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              Anti-cheat browser lockdown, real-time question pacing, live theme broadcasting, and instant telemetry reports.
            </p>

            <div 
              onClick={() => setRole('host')}
              className="group bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 p-8 rounded-3xl cursor-pointer transition shadow-xl max-w-md mx-auto text-left"
            >
              <MonitorCheck className="w-10 h-10 text-cyan-400 mb-4 group-hover:scale-110 transition" />
              <h3 className="text-xl font-bold text-white mb-2">Host Portal</h3>
              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                Register or sign in, construct questions with timers, switch assessment themes live, and inspect participant integrity charts.
              </p>
              <div className="flex items-center text-xs font-bold text-cyan-400 group-hover:translate-x-1 transition-transform">
                Open Host Studio <ArrowRight className="w-4 h-4 ml-1.5" />
              </div>
            </div>
          </div>
        )}

        {role === 'host' && (
          <HostDashboard 
            onLogout={() => setRole('landing')} 
            onThemeChange={handleHostThemeChange} 
          />
        )}
        
        {role === 'student' && (
          <StudentPortal 
            quizId={quizIdFromUrl || undefined}
            quizIdFromUrl={quizIdFromUrl || undefined} 
          />
        )}
      </main>

      <footer className="border-t border-slate-900/60 bg-black/40 py-4"></footer>
    </div>
  );
}
