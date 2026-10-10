import React, { useState, useEffect } from 'react';
import { HostDashboard } from './components/HostDashboard';
import { StudentPortal } from './components/StudentPortal';
import { ThemeColor, THEME_CONFIG } from './types';
import { subscribeToMessages, applyGlobalTheme, getSavedQuiz } from './supabase';
import { GraduationCap, BookOpen, ArrowRight, Sun, Moon } from 'lucide-react';

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

  const [activeTheme, setActiveTheme] = useState<ThemeColor>('academic');
  const isLight = THEME_CONFIG[activeTheme]?.isLight ?? true;

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
      applyGlobalTheme('academic');
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

  const toggleLightDark = () => {
    const nextTheme: ThemeColor = isLight ? 'slate' : 'academic';
    handleHostThemeChange(nextTheme);
  };

  return (
    <div 
      className={`min-h-screen flex flex-col justify-between transition-colors duration-200 ${
        isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'
      }`}
    >
      <header className={`border-b sticky top-0 z-40 transition-colors ${
        isLight ? 'bg-white/95 border-slate-200 backdrop-blur-md' : 'bg-slate-900/90 border-slate-800 backdrop-blur-md'
      }`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div 
            onClick={() => setRole('landing')} 
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className={`p-2.5 rounded-xl shadow-sm transition ${isLight ? 'bg-blue-700 text-white hover:bg-blue-800' : 'bg-cyan-600 text-white hover:bg-cyan-500'}`}>
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-black tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  QuizGuard
                </span>
                <span className={`text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded-full border ${
                  isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-blue-950 text-blue-300 border-blue-800'
                }`}>
                  Academic Assessment System
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleLightDark}
              className={`p-2 rounded-xl border text-xs flex items-center gap-1.5 transition ${
                isLight 
                  ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200' 
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Toggle Light / Dark Institutional Canvas"
            >
              {isLight ? <Moon className="w-4 h-4 text-slate-600" /> : <Sun className="w-4 h-4 text-amber-400" />}
              <span className="hidden sm:inline font-medium">{isLight ? 'Dark Mode' : 'Light Mode'}</span>
            </button>

            {role === 'host' && (
              <button 
                onClick={() => setRole('landing')}
                className={`text-xs font-semibold text-white px-4 py-2 rounded-xl border shadow-sm transition ${
                  isLight ? 'bg-blue-700 hover:bg-blue-800 border-blue-700' : 'bg-blue-600 hover:bg-blue-500 border-blue-500'
                }`}
              >
                Back
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {role === 'landing' && (
          <div className="py-12 sm:py-20 space-y-10 text-center max-w-2xl mx-auto">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${
              isLight ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-blue-950 border-blue-800 text-blue-300'
            }`}>
              <BookOpen className="w-4 h-4" /> Standardized Computer-Based Testing Portal
            </div>

            <h1 className={`text-4xl sm:text-5xl font-black tracking-tight leading-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Institutional Examination & Proctoring Platform
            </h1>
            
            <p className={`text-sm sm:text-base leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Secure examination delivery with sectional marking, multi-blank partial credit, anti-cheating browser lockdown, and instant scorecards designed for educators.
            </p>

            <div 
              onClick={() => setRole('host')}
              className={`group border p-8 rounded-3xl cursor-pointer transition shadow-lg max-w-md mx-auto text-left ${
                isLight 
                  ? 'bg-white border-slate-200 hover:border-blue-500 shadow-slate-200/50' 
                  : 'bg-slate-900/80 border-slate-800 hover:border-cyan-500 shadow-black/40'
              }`}
            >
              <div className={`p-3 w-fit rounded-2xl mb-4 group-hover:scale-105 transition ${
                isLight ? 'bg-blue-50 text-blue-700' : 'bg-cyan-500/10 text-cyan-400'
              }`}>
                <GraduationCap className="w-8 h-8" />
              </div>
              <h3 className={`text-xl font-bold mb-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>Faculty & Proctor Portal</h3>
              <p className={`text-xs mb-6 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                Sign in to construct sectional assessments, configure negative marking penalties, manage your Question Bank, and view real-time class leaderboards.
              </p>
              <div className={`flex items-center text-xs font-bold group-hover:translate-x-1 transition-transform ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                Open Faculty Studio <ArrowRight className="w-4 h-4 ml-1.5" />
              </div>
            </div>
          </div>
        )}

        {role === 'host' && (
          <HostDashboard 
            onLogout={() => setRole('landing')} 
            onThemeChange={handleHostThemeChange} 
            isLight={isLight}
          />
        )}
        
        {role === 'student' && (
          <StudentPortal 
            quizId={quizIdFromUrl || undefined}
            quizIdFromUrl={quizIdFromUrl || undefined} 
            isLight={isLight}
          />
        )}
      </main>

      <footer className={`border-t py-4 text-center text-xs ${
        isLight ? 'border-slate-200 bg-white text-slate-500' : 'border-slate-900 bg-slate-950 text-slate-600'
      }`}>
        QuizGuard Assessment System • High-Integrity Academic Examination Portal
      </footer>
    </div>
  );
}
