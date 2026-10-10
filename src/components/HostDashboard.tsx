import React, { useState, useEffect } from 'react';
import { Quiz, Question, QuestionType, QuizMode, QuizSection, StudentResult, ThemeColor, THEME_CONFIG } from '../types';
import { broadcastMessage, subscribeToMessages, saveQuiz, applyGlobalTheme, supabase } from '../supabase';
import { PieChart } from './PieChart';
import { 
  Shield, Plus, Copy, Check, ExternalLink, LogOut, Trash2, Users, 
  Clock, Palette, CheckCircle2, Lock, Mail, User, RefreshCw, StopCircle, 
  PlayCircle, Edit3, Award, Download, Layers, HelpCircle, AlertOctagon, Settings2, BarChart2, Trophy
} from 'lucide-react';

interface HostProps {
  onLogout: () => void;
  onThemeChange: (theme: ThemeColor) => void;
}

const DEFAULT_SECTIONS: QuizSection[] = [
  { id: 'sec_3m', name: 'Section A (3M)', marksPerQuestion: 3, negativeMarkingEnabled: true, negativeMarking: 1 },
  { id: 'sec_5m', name: 'Section B (5M)', marksPerQuestion: 5, negativeMarkingEnabled: true, negativeMarking: 1 },
  { id: 'sec_7m', name: 'Section C (7M)', marksPerQuestion: 7, negativeMarkingEnabled: true, negativeMarking: 2 },
  { id: 'sec_10m', name: 'Section D (10M)', marksPerQuestion: 10, negativeMarkingEnabled: true, negativeMarking: 2 },
];

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

  const [quizMode, setQuizMode] = useState<QuizMode>('marks_challenge');
  const [newTitle, setNewTitle] = useState('');
  const [totalDurationMin, setTotalDurationMin] = useState<number>(20);
  const [pacingMode, setPacingMode] = useState<'manual' | 'auto'>('manual');
  const [selectedTheme, setSelectedTheme] = useState<ThemeColor>('slate');
  const [sections, setSections] = useState<QuizSection[]>(DEFAULT_SECTIONS);
  const [showSectionConfig, setShowSectionConfig] = useState<boolean>(false);

  const [selectedSectionId, setSelectedSectionId] = useState<string>('sec_3m');
  const [qType, setQType] = useState<QuestionType>('mcq');
  const [qText, setQText] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctOpt, setCorrectOpt] = useState<number>(0);
  const [singleFibAnswer, setSingleFibAnswer] = useState('');
  
  const [blankCount, setBlankCount] = useState<number>(3);
  const [blankAnswers, setBlankAnswers] = useState<string[]>(['', '', '']);
  const [qExplanation, setQExplanation] = useState('');
  const [qTimerClassic, setQTimerClassic] = useState<number>(60);
  const [customClassicMarks, setCustomClassicMarks] = useState<number>(10);

  const [draftQuestions, setDraftQuestions] = useState<Question[]>([]);
  const [copied, setCopied] = useState(false);
  const [inspectedStudent, setInspectedStudent] = useState<StudentResult | null>(null);
  const [inspectTab, setInspectTab] = useState<'audit' | 'sections'>('sections');

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

  const handleBlankCountChange = (count: number) => {
    setBlankCount(count);
    const newArr = [...blankAnswers];
    while (newArr.length < count) newArr.push('');
    setBlankAnswers(newArr.slice(0, count));
  };

  const handleBlankAnswerChange = (index: number, val: string) => {
    const updated = [...blankAnswers];
    updated[index] = val;
    setBlankAnswers(updated);
  };

  const handleToggleNegativeMarking = (secId: string) => {
    setSections(sections.map(s => s.id === secId ? { ...s, negativeMarkingEnabled: !s.negativeMarkingEnabled } : s));
  };

  const handleNegativeMarkValueChange = (secId: string, val: number) => {
    setSections(sections.map(s => s.id === secId ? { ...s, negativeMarking: Math.max(0, val) } : s));
  };

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
              timeTakenSeconds: p.time_taken || 0,
              strikes: p.strikes || 0,
              status: p.status || 'Active',
              violations: Array.isArray(vList) ? vList : [],
              answers: p.answers || {},
              reviewFlags: p.review_flags || {},
              sectionSummaries: p.section_summaries || {},
              questionDetails: p.question_details || {},
              totalCorrect: p.total_correct || 0,
              totalWrong: p.total_wrong || 0,
              totalSkipped: p.total_skipped || 0,
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
    if (!qText.trim()) {
      alert('Please enter question text.');
      return;
    }

    const currentSection = sections.find((s) => s.id === selectedSectionId);
    const marksAssigned = quizMode === 'marks_challenge' 
      ? (currentSection ? currentSection.marksPerQuestion : 3) 
      : customClassicMarks;

    let newQ: Question;

    if (qType === 'mcq') {
      if (!optA.trim() || !optB.trim() || !optC.trim() || !optD.trim()) {
        alert('Please fill out all 4 options.');
        return;
      }
      newQ = {
        id: `q_${Date.now()}`,
        sectionId: quizMode === 'marks_challenge' ? selectedSectionId : undefined,
        type: 'mcq',
        text: qText,
        options: [optA, optB, optC, optD],
        correctAnswer: correctOpt,
        marks: marksAssigned,
        timeLimit: qTimerClassic,
        explanation: qExplanation.trim(),
      };
      setOptA('');
      setOptB('');
      setOptC('');
      setOptD('');
      setCorrectOpt(0);
    } else if (qType === 'fib') {
      if (!singleFibAnswer.trim()) {
        alert('Please enter expected correct answer.');
        return;
      }
      newQ = {
        id: `q_${Date.now()}`,
        sectionId: quizMode === 'marks_challenge' ? selectedSectionId : undefined,
        type: 'fib',
        text: qText,
        correctAnswer: singleFibAnswer.trim(),
        marks: marksAssigned,
        timeLimit: qTimerClassic,
        explanation: qExplanation.trim(),
      };
      setSingleFibAnswer('');
    } else {
      if (blankAnswers.some((a) => !a.trim())) {
        alert('Please fill out answers for all blanks.');
        return;
      }
      newQ = {
        id: `q_${Date.now()}`,
        sectionId: quizMode === 'marks_challenge' ? selectedSectionId : undefined,
        type: 'multi_fib',
        text: qText,
        correctAnswer: blankAnswers.map((a) => a.trim()),
        marks: marksAssigned,
        timeLimit: qTimerClassic,
        explanation: qExplanation.trim(),
      };
      setBlankAnswers(['', '', '']);
    }

    setDraftQuestions([...draftQuestions, newQ]);
    setQText('');
    setQExplanation('');
  };

  const handleLaunchQuiz = async () => {
    let currentDrafts = [...draftQuestions];

    if (qText.trim()) {
      const currentSection = sections.find((s) => s.id === selectedSectionId);
      const marksAssigned = quizMode === 'marks_challenge' 
        ? (currentSection ? currentSection.marksPerQuestion : 3) 
        : customClassicMarks;

      if (qType === 'mcq' && optA.trim() && optB.trim() && optC.trim() && optD.trim()) {
        currentDrafts.push({
          id: `q_${Date.now()}`,
          sectionId: quizMode === 'marks_challenge' ? selectedSectionId : undefined,
          type: 'mcq',
          text: qText.trim(),
          options: [optA.trim(), optB.trim(), optC.trim(), optD.trim()],
          correctAnswer: correctOpt,
          marks: marksAssigned,
          timeLimit: qTimerClassic,
          explanation: qExplanation.trim(),
        });
      } else if (qType === 'fib' && singleFibAnswer.trim()) {
        currentDrafts.push({
          id: `q_${Date.now()}`,
          sectionId: quizMode === 'marks_challenge' ? selectedSectionId : undefined,
          type: 'fib',
          text: qText.trim(),
          correctAnswer: singleFibAnswer.trim(),
          marks: marksAssigned,
          timeLimit: qTimerClassic,
          explanation: qExplanation.trim(),
        });
      } else if (qType === 'multi_fib' && blankAnswers.every(a => a.trim())) {
        currentDrafts.push({
          id: `q_${Date.now()}`,
          sectionId: quizMode === 'marks_challenge' ? selectedSectionId : undefined,
          type: 'multi_fib',
          text: qText.trim(),
          correctAnswer: blankAnswers.map(a => a.trim()),
          marks: marksAssigned,
          timeLimit: qTimerClassic,
          explanation: qExplanation.trim(),
        });
      }
    }

    if (!newTitle.trim()) {
      alert('Please enter an Assessment Title under "Assessment Launch Config" before launching.');
      return;
    }

    if (currentDrafts.length === 0) {
      alert('Please add at least 1 question. Fill out the question builder and click "+ Append Question to Assessment".');
      return;
    }

    const newQuiz: Quiz = {
      id: `quiz_${Date.now().toString(36)}`,
      hostEmail,
      title: newTitle.trim(),
      createdAt: new Date().toLocaleString(),
      mode: quizMode,
      totalDurationMinutes: quizMode === 'marks_challenge' ? totalDurationMin : undefined,
      sections: quizMode === 'marks_challenge' ? sections : undefined,
      pacingMode,
      theme: selectedTheme,
      questions: currentDrafts,
      status: 'live',
      participants: {},
    };

    localStorage.setItem(`quizguard_quiz_${newQuiz.id}`, JSON.stringify(newQuiz));
    const updated = [newQuiz, ...quizzes.filter(q => q.id !== newQuiz.id)];
    setQuizzes(updated);
    localStorage.setItem(`quizguard_host_quizzes_${hostEmail}`, JSON.stringify(updated));

    setActiveQuiz(newQuiz);
    onThemeChange(selectedTheme);
    applyGlobalTheme(selectedTheme);
    setDraftQuestions([]);
    setNewTitle('');
    setQText('');
    setOptA(''); setOptB(''); setOptC(''); setOptD('');
    setSingleFibAnswer('');
    setBlankAnswers(['', '', '']);
    setQExplanation('');

    try {
      await saveQuiz(newQuiz);
    } catch (err) {
      console.warn('Background sync note:', err);
    }
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

  const handleStopAssessment = async () => {
    if (!activeQuiz) return;
    if (!window.confirm('Are you sure you want to stop this assessment? All connected participants will be halted.')) {
      return;
    }

    const updated: Quiz = { ...activeQuiz, status: 'ended' };
    setActiveQuiz(updated);
    saveQuiz(updated);

    broadcastMessage({
      type: 'STOP_QUIZ' as any,
      quizId: activeQuiz.id,
    });

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

  const handleResumeAssessment = async (quizToResume?: Quiz) => {
    const targetQuiz = quizToResume || activeQuiz;
    if (!targetQuiz) return;

    const updated: Quiz = { ...targetQuiz, status: 'live' };
    setActiveQuiz(updated);
    saveQuiz(updated);

    const stored = localStorage.getItem(`quizguard_host_quizzes_${hostEmail}`);
    if (stored) {
      const list: Quiz[] = JSON.parse(stored);
      const updatedList = list.map(q => q.id === targetQuiz.id ? updated : q);
      setQuizzes(updatedList);
      localStorage.setItem(`quizguard_host_quizzes_${hostEmail}`, JSON.stringify(updatedList));
    }

    onThemeChange(updated.theme);
    applyGlobalTheme(updated.theme);

    broadcastMessage({
      type: 'RESUME_QUIZ' as any,
      quizId: targetQuiz.id,
    });

    if (supabase) {
      try {
        await supabase.from('participants').upsert({
          id: `QUIZ_STATE_${targetQuiz.id}`,
          quiz_id: targetQuiz.id,
          name: '__QUIZ_STATE__',
          status: 'LIVE',
          score: 0,
          strikes: 0,
          violations: [],
          updated_at: new Date().toISOString()
        });
        await supabase.from('quizzes').update({ pacing_mode: targetQuiz.pacingMode || 'manual' }).eq('id', targetQuiz.id);
      } catch (e) {}
    }
  };

  const exportResultsCSV = () => {
    if (!activeQuiz) return;
    const participants = Object.values(activeQuiz.participants || {});
    if (participants.length === 0) {
      alert('No participant submissions to export yet.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    const sectionHeaders = (activeQuiz.sections || []).map(s => `"${s.name} Marks"`).join(',');
    csvContent += `Rank,Team Name,Total Score,Time Taken (sec),Correct Count,Wrong Count,Skipped Count,Status,Strikes,${sectionHeaders ? sectionHeaders + ',' : ''}Submission Date\n`;

    const sorted = [...participants].sort((a, b) => {
      const aDisq = a.status === 'Disqualified';
      const bDisq = b.status === 'Disqualified';
      if (aDisq && !bDisq) return 1;
      if (!aDisq && bDisq) return -1;
      if (b.score !== a.score) return (b.score || 0) - (a.score || 0);
      return (a.timeTakenSeconds || 0) - (b.timeTakenSeconds || 0);
    });

    sorted.forEach((p, index) => {
      const secVals = (activeQuiz.sections || []).map(s => {
        const secSum = p.sectionSummaries?.[s.id];
        return secSum ? Math.max(0, secSum.earnedMarks).toFixed(1) : '0';
      }).join(',');

      const row = [
        index + 1,
        `"${p.name.replace(/"/g, '""')}"`,
        p.score,
        p.timeTakenSeconds || 0,
        p.totalCorrect || 0,
        p.totalWrong || 0,
        p.totalSkipped || 0,
        p.status,
        p.strikes,
        secVals ? secVals + ',' : '',
        p.submittedAt ? `"${p.submittedAt}"` : 'N/A'
      ];
      csvContent += row.join(',') + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeQuiz.title.replace(/\s+/g, '_')}_Leaderboard_Results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
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
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
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
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs uppercase tracking-wider focus:outline-none focus:border-cyan-500"
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
    const participantsList = Object.values(activeQuiz.participants || {}).sort((a, b) => {
      const aDisq = a.status === 'Disqualified';
      const bDisq = b.status === 'Disqualified';
      if (aDisq && !bDisq) return 1;
      if (!aDisq && bDisq) return -1;
      if ((b.score || 0) !== (a.score || 0)) {
        return (b.score || 0) - (a.score || 0);
      }
      return (a.timeTakenSeconds || 0) - (b.timeTakenSeconds || 0);
    });
    
    const completedCount = participantsList.filter(s => s.status === 'Completed').length;
    const disqualifiedCount = participantsList.filter(s => s.status === 'Disqualified').length;
    const activeCount = participantsList.filter(s => s.status === 'Active').length;

    const statusChartData = [
      { label: 'Completed', value: completedCount, color: '#10b981' },
      { label: 'Disqualified', value: disqualifiedCount, color: '#ef4444' },
      { label: 'In Exam', value: activeCount, color: '#38bdf8' },
    ];

    const totalMax = activeQuiz.questions.reduce((sum, q) => sum + (q.marks || 10), 0);
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
              <span className={`w-2.5 h-2.5 rounded-full ${isQuizEnded ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'}`}></span>
              <span className={`text-xs font-mono uppercase tracking-wider font-bold ${isQuizEnded ? 'text-amber-400' : 'text-emerald-400'}`}>
                {isQuizEnded ? 'Assessment Paused / Stopped' : 'Live Assessment Active'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono uppercase bg-cyan-950 text-cyan-300 border border-cyan-800">
                {activeQuiz.mode === 'marks_challenge' ? 'Marks Challenge' : 'Classic Mode'}
              </span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">{activeQuiz.title}</h1>
            <p className="text-xs text-slate-400">
              {activeQuiz.questions.length} Questions • Total Marks: <span className="font-mono text-cyan-400 font-bold">{totalMax} pts</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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

            <button
              onClick={exportResultsCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs border border-slate-700 transition"
              title="Download results as CSV"
            >
              <Download className="w-4 h-4 text-cyan-400" /> Export CSV
            </button>

            {isQuizEnded ? (
              <button
                onClick={() => handleResumeAssessment()}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs border border-emerald-500 shadow-lg shadow-emerald-600/20 transition"
              >
                <PlayCircle className="w-4 h-4" /> Resume Assessment
              </button>
            ) : (
              <button
                onClick={handleStopAssessment}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xs border border-red-500 shadow-lg shadow-red-600/20 transition"
              >
                <StopCircle className="w-4 h-4" /> Stop Assessment
              </button>
            )}

            <button 
              onClick={() => setActiveQuiz(null)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl border border-blue-500 shadow-md shadow-blue-600/20 transition"
            >
              ? Back to Quiz Builder
            </button>
          </div>
        </div>

        {/* Candidate Invitation Link Banner */}
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

        {/* Live Examination Leaderboard */}
        <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" /> Live Examination Leaderboard ({participantsList.length})
            </h3>
            <span className="text-xs font-mono text-slate-400">Ranked by Score • Tie-breaker: Time Taken</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 text-xs font-mono border-b border-slate-800">
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Team Name</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Time Taken</th>
                  <th className="py-3 px-4">Performance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Strikes</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {participantsList.map((s, idx) => {
                  let rankBadge = `#${idx + 1}`;
                  if (idx === 0 && s.status !== 'Disqualified') rankBadge = '?? 1st';
                  else if (idx === 1 && s.status !== 'Disqualified') rankBadge = '?? 2nd';
                  else if (idx === 2 && s.status !== 'Disqualified') rankBadge = '?? 3rd';

                  return (
                    <tr key={s.id} className="hover:bg-slate-800/20 transition">
                      <td className="py-3 px-4 font-mono font-bold text-cyan-400">{rankBadge}</td>
                      <td className="py-3 px-4 font-semibold text-white">{s.name}</td>
                      <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                        {s.score} / {totalMax} pts
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">
                        {s.timeTakenSeconds ? `${Math.floor(s.timeTakenSeconds / 60)}m ${s.timeTakenSeconds % 60}s` : 'N/A'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        <span className="text-emerald-400 font-bold">{s.totalCorrect || 0}?</span>{' '}
                        <span className="text-rose-400 font-bold">{s.totalWrong || 0}?</span>
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
                      <td className="py-3 px-4 text-right">
                        <button 
                          onClick={() => { setInspectedStudent(s); setInspectTab('sections'); }}
                          className="px-3 py-1 bg-slate-800 hover:bg-cyan-600/30 text-cyan-300 text-xs font-medium rounded-lg border border-slate-700 transition"
                        >
                          Inspect Log
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {participantsList.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500 text-xs font-mono">
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
            <div className="max-w-xl w-full bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4 shadow-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white">Candidate Audit: {inspectedStudent.name}</h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Score: {inspectedStudent.score}/{totalMax} pts • Time: {Math.floor((inspectedStudent.timeTakenSeconds || 0) / 60)}m {(inspectedStudent.timeTakenSeconds || 0) % 60}s
                  </span>
                </div>
                <button onClick={() => setInspectedStudent(null)} className="text-slate-400 hover:text-white text-xs">? Close</button>
              </div>

              <div className="flex gap-2 border-b border-slate-800 pb-2 text-xs">
                <button
                  onClick={() => setInspectTab('sections')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${inspectTab === 'sections' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Sectional Breakdown
                </button>
                <button
                  onClick={() => setInspectTab('audit')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${inspectTab === 'audit' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  Proctor Strikes ({inspectedStudent.violations.length})
                </button>
              </div>

              {inspectTab === 'sections' ? (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {inspectedStudent.sectionSummaries && Object.keys(inspectedStudent.sectionSummaries).length > 0 ? (
                    Object.values(inspectedStudent.sectionSummaries).map((sec) => (
                      <div key={sec.sectionId} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                        <div>
                          <strong className="text-white block">{sec.sectionName}</strong>
                          <span className="text-slate-400 text-[11px] font-mono">
                            Correct: {sec.correct} • Wrong: {sec.wrong} • Skipped: {sec.skipped}
                          </span>
                        </div>
                        <span className="text-cyan-400 font-mono font-bold text-sm">
                          {Math.max(0, sec.earnedMarks).toFixed(1)} / {sec.maxMarks} pts
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500 text-xs font-mono py-4 text-center">No detailed section breakdown recorded for this submission.</p>
                  )}
                </div>
              ) : (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 max-h-60 overflow-y-auto space-y-2 text-xs font-mono">
                  {inspectedStudent.violations.length === 0 ? (
                    <p className="text-emerald-400">Zero violations recorded. 100% clean session.</p>
                  ) : (
                    inspectedStudent.violations.map((v, i) => (
                      <div key={i} className="text-red-400 bg-red-950/20 p-2 rounded border border-red-500/20">
                        • [{v.timestamp}] {v.message}
                      </div>
                    ))
                  )}
                </div>
              )}
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
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl space-y-5">
            <div className="bg-slate-950 p-2 rounded-2xl border border-slate-800 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setQuizMode('marks_challenge')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  quizMode === 'marks_challenge' 
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/20' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Award className="w-4 h-4" /> Marks Challenge (Sectional 3M-10M, 20 Min)
              </button>
              <button
                type="button"
                onClick={() => setQuizMode('classic')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  quizMode === 'classic' 
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/20' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Clock className="w-4 h-4" /> Classic Mode (Per-Question Timer)
              </button>
            </div>

            {quizMode === 'marks_challenge' && (
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Settings2 className="w-4 h-4 text-cyan-400" /> Section Negative Marking Rules
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSectionConfig(!showSectionConfig)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-mono"
                  >
                    {showSectionConfig ? 'Hide Rules ?' : 'Customize Penalties ?'}
                  </button>
                </div>

                {showSectionConfig && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {sections.map((sec) => (
                      <div key={sec.id} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-white">{sec.name}</span>
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={sec.negativeMarkingEnabled}
                              onChange={() => handleToggleNegativeMarking(sec.id)}
                              className="accent-cyan-500 rounded"
                            />
                            <span className={sec.negativeMarkingEnabled ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                              {sec.negativeMarkingEnabled ? 'Penalty Active' : 'No Penalty'}
                            </span>
                          </label>
                        </div>
                        {sec.negativeMarkingEnabled && (
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400">Wrong deduction:</span>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="10"
                              value={sec.negativeMarking}
                              onChange={(e) => handleNegativeMarkValueChange(sec.id, Number(e.target.value))}
                              className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono font-bold text-rose-400 text-center focus:outline-none"
                            />
                            <span className="text-[11px] text-slate-400">marks</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {quizMode === 'marks_challenge' && (
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-medium block flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" /> Target Section for New Question:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSectionId(s.id)}
                      className={`p-3 rounded-2xl border text-left transition ${
                        selectedSectionId === s.id
                          ? 'border-cyan-500 bg-cyan-950/30'
                          : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold text-white block">{s.name}</span>
                      <span className="text-[11px] text-cyan-400 font-mono block">+{s.marksPerQuestion} Marks</span>
                      <span className="text-[10px] text-rose-400 font-mono">
                        {s.negativeMarkingEnabled ? `-${s.negativeMarking} on Wrong` : '0 penalty'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="text-cyan-400 w-4 h-4" /> Add Question Content
              </h2>

              <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setQType('mcq')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    qType === 'mcq' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  MCQ
                </button>
                <button
                  type="button"
                  onClick={() => setQType('fib')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    qType === 'fib' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Single Blank
                </button>
                <button
                  type="button"
                  onClick={() => setQType('multi_fib')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    qType === 'multi_fib' ? 'bg-cyan-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Multi-Blank (Partial Marks)
                </button>
              </div>
            </div>

            <form onSubmit={handleAddQuestion} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Question Prompt</label>
                <textarea
                  required
                  rows={2}
                  placeholder={
                    qType === 'multi_fib'
                      ? "e.g. In PBFT, the phases are: 1. [Blank 1], 2. [Blank 2], 3. [Blank 3]"
                      : "e.g. Which consensus mechanism avoids forks under network partition?"
                  }
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>

              {qType === 'mcq' && (
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
              )}

              {qType === 'fib' && (
                <div className="space-y-1.5 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                  <label className="text-xs text-cyan-300 font-medium block">Expected Answer (Case-Insensitive)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PBFT"
                    value={singleFibAnswer}
                    onChange={(e) => setSingleFibAnswer(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              {qType === 'multi_fib' && (
                <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-cyan-300 font-medium">Number of Blanks:</label>
                    <div className="flex gap-2">
                      {[2, 3, 4].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => handleBlankCountChange(cnt)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold ${
                            blankCount === cnt ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {cnt} Blanks
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {blankAnswers.map((ans, idx) => (
                      <div key={idx} className="space-y-1">
                        <label className="text-xs text-slate-400">Blank {idx + 1} Answer Key:</label>
                        <input
                          type="text"
                          required
                          placeholder={`Key for [Blank ${idx + 1}]`}
                          value={ans}
                          onChange={(e) => handleBlankAnswerChange(idx, e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="p-2.5 bg-cyan-950/40 rounded-xl border border-cyan-800/40 text-[11px] text-cyan-300 font-mono">
                    ? Partial Scoring: Each correct blank awards +{((sections.find(s => s.id === selectedSectionId)?.marksPerQuestion || 10) / blankCount).toFixed(2)} marks.
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-cyan-400" /> Answer Explanation (Shown after exam)
                </label>
                <input
                  type="text"
                  placeholder="e.g. PBFT uses pre-prepare, prepare, and commit phases."
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>

              {quizMode === 'classic' && (
                <div className="flex flex-wrap items-center gap-5 pt-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <label className="text-xs text-slate-400 font-medium">Timer per Question:</label>
                    <select
                      value={qTimerClassic}
                      onChange={(e) => setQTimerClassic(Number(e.target.value))}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs"
                    >
                      <option value={30}>30s</option>
                      <option value={60}>60s</option>
                      <option value={90}>90s</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    <label className="text-xs text-slate-400 font-medium">Marks:</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={customClassicMarks}
                      onChange={(e) => setCustomClassicMarks(Math.max(1, Number(e.target.value)))}
                      className="w-16 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs text-center font-bold focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <button type="submit" className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs border border-slate-700 transition">
                + Append Question to Assessment
              </button>
            </form>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
              Staged Questions ({draftQuestions.length})
            </h3>
            {draftQuestions.map((q, i) => {
              const sec = sections.find((s) => s.id === q.sectionId);
              return (
                <div key={q.id} className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-cyan-400 font-mono">Q{i + 1}</span>
                      {sec && (
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                          {sec.name}
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                        {q.type}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        {q.marks} Marks
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white mt-1">{q.text}</p>
                  </div>
                  <button onClick={() => setDraftQuestions(draftQuestions.filter((_, idx) => idx !== i))} className="text-slate-500 hover:text-red-400 p-2">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            {draftQuestions.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6 border border-dashed border-slate-800 rounded-2xl font-mono">
                No questions added yet. Use the builder above to stage questions.
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
                placeholder="e.g. Distributed Consensus Marks Challenge"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>

            {quizMode === 'marks_challenge' && (
              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">Total Duration (Minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={totalDurationMin}
                  onChange={(e) => setTotalDurationMin(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-cyan-500 font-bold"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 block mb-1 font-medium">Theme</label>
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
              <div>• Total Questions: <strong className="text-white">{draftQuestions.length}</strong></div>
              <div>• Total Maximum Marks: <strong className="text-amber-400">{draftQuestions.reduce((sum, q) => sum + (q.marks || 10), 0)} pts</strong></div>
            </div>

            <button
              onClick={handleLaunchQuiz}
              type="button"
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-emerald-600/20 transition cursor-pointer"
            >
              Launch Assessment & Generate Link
            </button>
          </div>

          <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saved Assessments</h4>
            {quizzes.map((q) => (
              <div 
                key={q.id} 
                onClick={() => handleResumeAssessment(q)}
                className="p-3 bg-slate-800/60 hover:bg-slate-800 rounded-xl cursor-pointer border border-slate-700/60 text-xs transition flex justify-between items-center"
              >
                <div>
                  <span className="font-bold text-white block">{q.title}</span>
                  <span className="text-slate-400">
                    {q.questions.length} questions • {q.questions.reduce((sum, item) => sum + (item.marks || 10), 0)} pts • {Object.keys(q.participants || {}).length} attended
                  </span>
                </div>
                <span className="text-cyan-400 font-bold">Open & Resume ?</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
