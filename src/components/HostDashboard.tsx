import React, { useState, useEffect } from 'react';
import { Quiz, Question, StudentResult, ThemeColor, THEME_CONFIG } from '../types';
import { broadcastMessage, subscribeToMessages, saveQuiz, applyGlobalTheme, supabase } from '../supabase';
import { PieChart } from './PieChart';
import { 
  Shield, Plus, Copy, Check, ExternalLink, LogOut, Trash2, Users, 
  Clock, Palette, CheckCircle2, Lock, Mail, User, RefreshCw, StopCircle
} from 'lucide-react';

interface HostProps {
  onLogout: () => void;
  onThemeChange: (theme: ThemeColor) => void;
}

export const HostDashboard: React.FC<HostProps> = ({ onLogout, onThemeChange }) => {
  const [hostEmail, setHostEmail] = useState<string>('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regCaptcha, setRegCaptcha] = useState('');
  const [generatedCaptcha, setGeneratedCaptcha] = useState('');
  const [regSuccessMsg, setRegSuccessMsg] = useState(false);
  const [regError, setRegError] = useState('');

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [pacingMode, setPacingMode] = useState<'manual' | 'auto'>('manual');
  const [selectedTheme, setSelectedTheme] = useState<ThemeColor>('slate');

  const [qText, setQText] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState<number>(0);
  const [qTimer, setQTimer] = useState<number>(30);
  const [draftQuestions, setDraftQuestions] = useState<Question[]>([]);

  const [copied, setCopied] = useState(false);
  const [inspectedStudent, setInspectedStudent] = useState<StudentResult | null>(null);

  const refreshCaptcha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGeneratedCaptcha(code);
  };

  useEffect(() => {
    refreshCaptcha();
  }, []);

  useEffect(() => {
    if (hostEmail) {
      const stored = localStorage.getItem(`quizguard_host_quizzes_${hostEmail}`);
      if (stored) setQuizzes(JSON.parse(stored));
    }
  }, [hostEmail]);

  // Real-time Cloud Sync: Poll Supabase for cross-device participants
  useEffect(() => {
    if (!activeQuiz || !supabase) return;

    const fetchLiveParticipants = async () => {
      try {
        const { data, error } = await supabase
          .from('participants')
          .select('*')
          .eq('quiz_id', activeQuiz.id);

        if (data && !error) {
          const pMap: Record<string, StudentResult> = {};
          data.filter((p: any) => !p.id.startsWith('QUIZ_STATE_')).forEach((p: any) => {
            let vList = p.violations;
            if (typeof vList === 'string') {
              try { vList = JSON.parse(vList); } catch (e) { vList = []; }
            }

            pMap[p.id] = {
              id: p.id,
              name: p.name,
              score: p.score || 0,
              strikes: p.strikes || 0,
              status: p.status || 'Active',
              violations: Array.isArray(vList) ? vList : [],
              answers: p.answers || {},
              submittedAt: p.updated_at
            };
          });

          setActiveQuiz((prev) => (prev ? { ...prev, participants: pMap } : null));
        }
      } catch (e) {}
    };

    fetchLiveParticipants();
    const interval = setInterval(fetchLiveParticipants, 2000);
    return () => clearInterval(interval);
  }, [activeQuiz?.id]);

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');

    if (regCaptcha.trim().toUpperCase() !== generatedCaptcha) {
      setRegError('Invalid Captcha code. Please try again.');
      refreshCaptcha();
      return;
    }

    const dbRaw = localStorage.getItem('quizguard_registered_hosts');
    const db = dbRaw ? JSON.parse(dbRaw) : {};

    if (db[regEmail.toLowerCase()]) {
      setRegError('An account with this email already exists.');
      return;
    }

    db[regEmail.toLowerCase()] = {
      name: regName,
      email: regEmail.toLowerCase(),
      password: regPassword,
    };

    localStorage.setItem('quizguard_registered_hosts', JSON.stringify(db));
    setRegSuccessMsg(true);

    setTimeout(() => {
      setRegSuccessMsg(false);
      setLoginEmail(regEmail);
      setAuthMode('login');
      refreshCaptcha();
    }, 1500);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const dbRaw = localStorage.getItem('quizguard_registered_hosts');
    const db = dbRaw ? JSON.parse(dbRaw) : {};

    const user = db[loginEmail.toLowerCase()];

    if (!user || user.password !== loginPassword) {
      setLoginError('Invalid email or password.');
      return;
    }

    setHostEmail(user.email);
  };

  const handleSignOut = () => {
    setHostEmail('');
    setLoginPassword('');
    onLogout();
  };

  const handleAddQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qText.trim() || !optA.trim() || !optB.trim() || !optC.trim() || !optD.trim()) {
      alert('Please fill out question prompt and all 4 options.');
      return;
    }

    const newQ: Question = {
      id: `q_${Date.now()}`,
      text: qText,
      options: [optA, optB, optC, optD],
      correctAnswer: correctOpt,
      timeLimit: Number(qTimer) || 30,
    };

    setDraftQuestions([...draftQuestions, newQ]);
    setQText('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setCorrectOpt(0);
  };

  const handleLaunchQuiz = async () => {
    if (!newTitle.trim()) {
      alert('Please enter an assessment title.');
      return;
    }
    if (draftQuestions.length === 0) {
      alert('Please add at least 1 question.');
      return;
    }

    const newQuiz: Quiz = {
      id: `quiz_${Date.now().toString(36)}`,
      hostEmail,
      title: newTitle,
      createdAt: new Date().toLocaleString(),
      pacingMode,
      theme: selectedTheme,
      questions: draftQuestions,
      status: 'live',
      participants: {},
    };

    await saveQuiz(newQuiz);
    const updated = [newQuiz, ...quizzes];
    setQuizzes(updated);
    localStorage.setItem(`quizguard_host_quizzes_${hostEmail}`, JSON.stringify(updated));

    setActiveQuiz(newQuiz);
    onThemeChange(selectedTheme);
    applyGlobalTheme(selectedTheme);
    setDraftQuestions([]);
    setNewTitle('');
  };

  const handleThemeSwitch = (theme: ThemeColor) => {
    if (!activeQuiz) return;
    const updated: Quiz = { ...activeQuiz, theme };
    setActiveQuiz(updated);
    saveQuiz(updated);

    onThemeChange(theme);
    applyGlobalTheme(theme);

    broadcastMessage({
      type: 'THEME_CHANGE',
      quizId: activeQuiz.id,
      theme,
    });
  };

  // Host Stop Assessment: affects all participants
  const handleStopAssessment = async () => {
    if (!activeQuiz) return;
    if (!window.confirm('Are you sure you want to stop this assessment? All connected participants will be halted immediately.')) {
      return;
    }

    const updated: Quiz = { ...activeQuiz, status: 'ended' };
    setActiveQuiz(updated);
    saveQuiz(updated);

    // 1. Broadcast stop event locally
    broadcastMessage({
      type: 'STOP_QUIZ' as any,
      quizId: activeQuiz.id,
    });

    // 2. Persist stop state to Supabase for all participant devices
    if (supabase) {
      try {
        await supabase.from('participants').upsert({
          id: `QUIZ_STATE_${activeQuiz.id}`,
          quiz_id: activeQuiz.id,
          name: '__QUIZ_STATE__',
          status: 'ENDED',
          score: 0,
          strikes: 0,
          violations: [],
          updated_at: new Date().toISOString()
        });

        await supabase.from('quizzes').update({ pacing_mode: 'ended' }).eq('id', activeQuiz.id);
      } catch (e) {}
    }
  };

  const shareableUrl = activeQuiz 
    ? `${window.location.origin}${window.location.pathname}?quiz=${activeQuiz.id}`
    : '';

  const copyShareLink = () => {
    navigator.clipboard.writeText(shareableUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!hostEmail) {
    return (
      <div className="flex items-center justify-center min-h-[65vh] px-4">
        <div className="bg-slate-900/90 border border-slate-800 p-8 rounded-3xl max-w-md w-full shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 text-cyan-400 mb-6">
            <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Host Security Portal</h2>
              <span className="text-xs text-slate-400">Authentication Required</span>
            </div>
          </div>

          <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-6">
            <button
              onClick={() => { setAuthMode('login'); setLoginError(''); setRegError(''); }}
              className={`py-2 text-xs font-bold rounded-xl transition ${authMode === 'login' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('register'); setLoginError(''); setRegError(''); refreshCaptcha(); }}
              className={`py-2 text-xs font-bold rounded-xl transition ${authMode === 'register' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              Register
            </button>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                  {loginError}
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" /> Host Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@university.edu"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1.5 font-medium flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" /> Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-cyan-600/20 transition mt-2"
              >
                Sign In to Studio
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              {regError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                  {regError}
                </div>
              )}
              {regSuccessMsg && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 font-mono">
                  Registration successful! Redirecting to login...
                </div>
              )}

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-cyan-400" /> Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Professor / Proctor Name"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" /> Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="host@university.edu"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" /> Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Create secure password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Security Captcha</label>
                <div className="flex items-center gap-3 mb-2">
                  <div className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl font-mono text-lg font-black tracking-widest text-cyan-400 select-none">
                    {generatedCaptcha}
                  </div>
                  <button
                    type="button"
                    onClick={refreshCaptcha}
                    className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Enter characters above"
                  value={regCaptcha}
                  onChange={(e) => setRegCaptcha(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs uppercase tracking-wider focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-600/20 transition mt-2"
              >
                Create Host Account
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (activeQuiz) {
    // Sorted by score descending; Disqualified candidates placed last
    const participantsList = Object.values(activeQuiz.participants || {}).sort((a, b) => {
      const aDisq = a.status === 'Disqualified';
      const bDisq = b.status === 'Disqualified';
      if (aDisq && !bDisq) return 1;
      if (!aDisq && bDisq) return -1;
      return (b.score || 0) - (a.score || 0);
    });
    
    const completedCount = participantsList.filter(s => s.status === 'Completed').length;
    const disqualifiedCount = participantsList.filter(s => s.status === 'Disqualified').length;
    const activeCount = participantsList.filter(s => s.status === 'Active').length;

    const statusChartData = [
      { label: 'Completed', value: completedCount, color: '#10b981' },
      { label: 'Disqualified', value: disqualifiedCount, color: '#ef4444' },
      { label: 'In Exam', value: activeCount, color: '#38bdf8' },
    ];

    const totalMax = activeQuiz.questions.length * 10;
    const highScore = participantsList.filter(s => s.score >= totalMax * 0.8).length;
    const medScore = participantsList.filter(s => s.score >= totalMax * 0.5 && s.score < totalMax * 0.8).length;
    const lowScore = participantsList.filter(s => s.score < totalMax * 0.5).length;

    const scoreChartData = [
      { label: 'High (=80%)', value: highScore, color: '#8b5cf6' },
      { label: 'Average (50-79%)', value: medScore, color: '#f59e0b' },
      { label: 'Review (<50%)', value: lowScore, color: '#ec4899' },
    ];

    const isQuizEnded = activeQuiz.status === 'ended';

    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between bg-slate-900/60 border border-slate-800 p-5 rounded-3xl gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isQuizEnded ? 'bg-red-400' : 'bg-emerald-400 animate-ping'}`}></span>
              <span className={`text-xs font-mono uppercase tracking-wider font-bold ${isQuizEnded ? 'text-red-400' : 'text-emerald-400'}`}>
                {isQuizEnded ? 'Assessment Concluded' : 'Live Assessment'}
              </span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">{activeQuiz.title}</h1>
            <p className="text-xs text-slate-400">
              {activeQuiz.questions.length} Questions • Pacing: <span className="font-mono uppercase text-cyan-400">{activeQuiz.pacingMode}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Theme Switcher */}
            <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-2xl border border-slate-800">
              <span className="text-xs text-slate-400 flex items-center gap-1.5 px-2">
                <Palette className="w-3.5 h-3.5 text-cyan-400" /> Theme:
              </span>
              {[
                { id: 'slate', color: '#0f172a' },
                { id: 'midnight', color: '#1d4ed8' },
                { id: 'cyberpunk', color: '#a21caf' },
                { id: 'emerald', color: '#047857' },
                { id: 'crimson', color: '#b91c1c' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleThemeSwitch(t.id as ThemeColor)}
                  className={`w-6 h-6 rounded-full border-2 transition ${
                    activeQuiz.theme === t.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: t.color }}
                  title={`Switch theme to ${t.id}`}
                />
              ))}
            </div>

            {/* Stop Assessment Button */}
            <button
              onClick={handleStopAssessment}
              disabled={isQuizEnded}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition border ${
                isQuizEnded
                  ? 'bg-red-950/40 text-red-400/60 border-red-900/40 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-500 text-white border-red-500 shadow-lg shadow-red-600/20'
              }`}
            >
              <StopCircle className="w-4 h-4" />
              {isQuizEnded ? 'Assessment Stopped' : 'Stop Assessment'}
            </button>

            <button 
              onClick={() => setActiveQuiz(null)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700"
            >
              ? Back to Quiz Builder
            </button>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-cyan-500/30 p-6 rounded-3xl shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-cyan-400 font-bold">
              Candidate Invitation Link
            </span>
            <span className="text-xs text-slate-400">Share with candidates</span>
          </div>
          <div className="flex items-center gap-3">
            <input 
              readOnly 
              value={shareableUrl} 
              className="flex-1 px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-cyan-300 select-all"
            />
            <button 
              onClick={copyShareLink} 
              className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 text-white font-bold rounded-xl text-sm flex items-center gap-2 transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied Link!' : 'Copy Link'}
            </button>
            <a 
              href={shareableUrl} 
              target="_blank" 
              rel="noreferrer" 
              className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700"
              title="Open test link in new tab"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PieChart title="Candidate Integrity Breakdown" data={statusChartData} />
          <PieChart title="Score Distribution Brackets" data={scoreChartData} />
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-cyan-400" /> Participant Telemetry & Audit ({participantsList.length})
            </h3>
            <span className="text-xs font-mono text-slate-400">Ranked by Score (Disqualified at end)</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 text-xs font-mono border-b border-slate-800">
                  <th className="py-3 px-4">Candidate</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Strikes</th>
                  <th className="py-3 px-4">Proctor Audit Trail</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {participantsList.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/20 transition">
                    <td className="py-3 px-4 font-semibold text-white">{s.name}</td>
                    <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                      {s.score} / {activeQuiz.questions.length * 10} pts
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        s.status === 'Disqualified'
                          ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                        s.strikes === 0 ? 'bg-slate-800 text-slate-400' :
                        s.strikes >= 3 ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {s.strikes}/3 Strikes
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400">
                      {s.violations.length === 0 ? (
                        <span className="text-emerald-400 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> 100% Clean</span>
                      ) : (
                        <span className="text-red-400 font-mono">
                          {s.violations.length} incidents logged
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button 
                        onClick={() => setInspectedStudent(s)}
                        className="px-3 py-1 bg-slate-800 hover:bg-cyan-600/30 text-cyan-300 text-xs font-medium rounded-lg border border-slate-700 transition"
                      >
                        Inspect Log
                      </button>
                    </td>
                  </tr>
                ))}
                {participantsList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500 text-xs font-mono">
                      No candidate submissions yet. Share the invitation link above with participants.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {inspectedStudent && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className="max-w-lg w-full bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4 shadow-2xl">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Integrity Audit: {inspectedStudent.name}</h3>
                <button onClick={() => setInspectedStudent(null)} className="text-slate-400 hover:text-white text-xs">? Close</button>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 max-h-60 overflow-y-auto space-y-2 text-xs font-mono">
                {inspectedStudent.violations.length === 0 ? (
                  <p className="text-emerald-400">Zero violations recorded. Clean session.</p>
                ) : (
                  inspectedStudent.violations.map((v, i) => (
                    <div key={i} className="text-red-400 bg-red-950/20 p-2 rounded border border-red-500/20">
                      • [{v.timestamp}] {v.message}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between bg-slate-900/60 border border-slate-800 p-5 rounded-3xl gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Quiz Studio</h1>
          <p className="text-xs font-mono text-slate-400">Host: <span className="text-cyan-300">{hostEmail}</span></p>
        </div>
        <button onClick={handleSignOut} className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-red-500/10 text-slate-300 hover:text-red-400 rounded-xl text-xs font-semibold border border-slate-700 transition">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="text-cyan-400 w-5 h-5" /> Add Question & Set Timer
            </h2>
            <form onSubmit={handleAddQuestion} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Question Prompt</label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Which consensus mechanism avoids forks under network partition?"
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: 'Option A', val: optA, set: setOptA, idx: 0 },
                  { label: 'Option B', val: optB, set: setOptB, idx: 1 },
                  { label: 'Option C', val: optC, set: setOptC, idx: 2 },
                  { label: 'Option D', val: optD, set: setOptD, idx: 3 },
                ].map((item) => (
                  <div key={item.idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{item.label}</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="correctOption"
                          checked={correctOpt === item.idx}
                          onChange={() => setCorrectOpt(item.idx)}
                          className="accent-cyan-500"
                        />
                        <span className={correctOpt === item.idx ? 'text-cyan-400 font-bold' : ''}>Correct</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder={`Enter ${item.label}`}
                      value={item.val}
                      onChange={(e) => item.set(e.target.value)}
                      className={`w-full px-3 py-2 rounded-xl bg-slate-800 border text-white text-sm focus:outline-none ${correctOpt === item.idx ? 'border-cyan-500/80 bg-cyan-950/20' : 'border-slate-700'}`}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <label className="text-xs text-slate-400 font-medium">Question Timer Limit:</label>
                <select
                  value={qTimer}
                  onChange={(e) => setQTimer(Number(e.target.value))}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                >
                  <option value={15}>15 Seconds</option>
                  <option value={30}>30 Seconds</option>
                  <option value={45}>45 Seconds</option>
                  <option value={60}>60 Seconds</option>
                  <option value={90}>90 Seconds</option>
                </select>
              </div>

              <button type="submit" className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs border border-slate-700 transition">
                + Append Question to Assessment
              </button>
            </form>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              Questions in Assessment ({draftQuestions.length})
            </h3>
            {draftQuestions.map((q, i) => (
              <div key={q.id} className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-cyan-400 font-mono">Q{i + 1} ({q.timeLimit}s)</span>
                  <p className="text-sm font-semibold text-white">{q.text}</p>
                  <p className="text-xs text-emerald-400 font-mono mt-0.5">
                    Correct: Option {String.fromCharCode(65 + q.correctAnswer)} ({q.options[q.correctAnswer]})
                  </p>
                </div>
                <button onClick={() => setDraftQuestions(draftQuestions.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-red-400 p-2">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {draftQuestions.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6 border border-dashed border-slate-800 rounded-2xl font-mono">
                No questions added yet. Use the form above to build questions.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-3xl space-y-4">
            <h3 className="text-base font-bold text-white">Assessment Launch Config</h3>
            <div>
              <label className="text-xs text-slate-400 block mb-1 font-medium">Assessment Title</label>
              <input
                type="text"
                placeholder="e.g. Distributed Consensus Exam"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1 font-medium">Pacing Mode</label>
              <select
                value={pacingMode}
                onChange={(e) => setPacingMode(e.target.value as 'manual' | 'auto')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm"
              >
                <option value="manual">Manual (Student navigates freely)</option>
                <option value="auto">Automated (Per-question countdown auto-advances)</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1 font-medium">Initial Assessment Theme</label>
              <select
                value={selectedTheme}
                onChange={(e) => setSelectedTheme(e.target.value as ThemeColor)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm capitalize"
              >
                <option value="slate">Slate Obsidian</option>
                <option value="midnight">Midnight Cobalt</option>
                <option value="cyberpunk">Cyberpunk Neon</option>
                <option value="emerald">Emerald Matrix</option>
                <option value="crimson">Crimson Ember</option>
              </select>
            </div>

            <div className="p-3.5 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
              <div>• Questions Staged: <strong className="text-white">{draftQuestions.length}</strong></div>
              <div>• 15s Color Rotation: <strong className="text-emerald-400">Silent Swapping Active</strong></div>
              <div>• Proctoring Enforced: <strong className="text-cyan-400">Fullscreen + Tab Tracking</strong></div>
            </div>

            <button
              onClick={handleLaunchQuiz}
              disabled={draftQuestions.length === 0 || !newTitle.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm shadow-lg shadow-emerald-600/20 transition"
            >
              Launch Assessment & Generate Link
            </button>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Saved Assessments</h4>
            {quizzes.map((q) => (
              <div 
                key={q.id} 
                onClick={() => {
                  setActiveQuiz(q);
                  onThemeChange(q.theme);
                  applyGlobalTheme(q.theme);
                }}
                className="p-3 bg-slate-800/60 hover:bg-slate-800 rounded-xl cursor-pointer border border-slate-700/60 text-xs transition flex justify-between items-center"
              >
                <div>
                  <span className="font-bold text-white block">{q.title}</span>
                  <span className="text-slate-400">{q.questions.length} questions • {Object.keys(q.participants || {}).length} attended</span>
                </div>
                <span className="text-cyan-400 font-bold">Open ?</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
