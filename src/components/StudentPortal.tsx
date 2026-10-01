import React, { useState, useEffect, useRef } from 'react';
import { Quiz, Question, StudentResult, ViolationLog } from '../types';
import { getSavedQuiz, broadcastMessage } from '../supabase';
import { PieChart } from './PieChart';
import { 
  Shield, AlertOctagon, CheckCircle2, Volume2, Maximize, AlertTriangle, 
  Clock, ShieldAlert, MonitorOff, Award, HelpCircle, Check
} from 'lucide-react';

const COLOR_VARIANTS = [
  { border: 'border-rose-500/70', bg: 'bg-rose-500/15', text: 'text-rose-200', active: 'bg-rose-600/30 border-rose-400' },
  { border: 'border-sky-500/70', bg: 'bg-sky-500/15', text: 'text-sky-200', active: 'bg-sky-600/30 border-sky-400' },
  { border: 'border-amber-500/70', bg: 'bg-amber-500/15', text: 'text-amber-200', active: 'bg-amber-600/30 border-amber-400' },
  { border: 'border-emerald-500/70', bg: 'bg-emerald-500/15', text: 'text-emerald-200', active: 'bg-emerald-600/30 border-emerald-400' },
];

export const StudentPortal: React.FC<{ quizIdFromUrl?: string }> = ({ quizIdFromUrl }) => {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [studentName, setStudentName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [audioTested, setAudioTested] = useState(false);
  const [rulesAgreed, setRulesAgreed] = useState(false);

  // Exam Progress
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [strikes, setStrikes] = useState(0);
  const [disqualified, setDisqualified] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [violations, setViolations] = useState<ViolationLog[]>([]);

  // Silent 15-second color swapper
  const [colorShift, setColorShift] = useState(0);

  // Auto-Mode Countdown Timer
  const [timeLeft, setTimeLeft] = useState(30);

  const studentIdRef = useRef(`stu_${Date.now().toString(36)}`);

  useEffect(() => {
    if (quizIdFromUrl) {
      const loaded = getSavedQuiz(quizIdFromUrl);
      if (loaded) {
        setQuiz(loaded);
        if (loaded.questions[0]) setTimeLeft(loaded.questions[0].timeLimit || 30);
      }
    }
  }, [quizIdFromUrl]);

  // Silent 15-Second Color-Box Swapping (No countdown text)
  useEffect(() => {
    if (!isJoined || isFinished || disqualified) return;

    const interval = setInterval(() => {
      setColorShift((shift) => (shift + 1) % 4);
    }, 15000);

    return () => clearInterval(interval);
  }, [isJoined, isFinished, disqualified]);

  // Automated Question Timer
  useEffect(() => {
    if (!isJoined || isFinished || disqualified || !quiz) return;
    if (quiz.pacingMode !== 'auto') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (currentIdx + 1 < quiz.questions.length) {
            const nextIdx = currentIdx + 1;
            setCurrentIdx(nextIdx);
            return quiz.questions[nextIdx].timeLimit || 30;
          } else {
            handleSubmitFinal();
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isJoined, isFinished, disqualified, quiz, currentIdx, answers]);

  const playBuzzer = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      setAudioTested(true);
    } catch (e) {
      console.warn('AudioContext error', e);
    }
  };

  const reportToHost = (
    updatedStrikes = strikes, 
    isDisq = disqualified, 
    isDone = isFinished,
    finalViolations = violations
  ) => {
    if (!quiz) return;

    let calculatedScore = 0;
    quiz.questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) calculatedScore += 10;
    });

    const studentData: StudentResult = {
      id: studentIdRef.current,
      name: studentName,
      score: calculatedScore,
      totalQuestions: quiz.questions.length,
      strikes: updatedStrikes,
      status: isDisq ? 'Disqualified' : isDone ? 'Completed' : 'Active',
      completedAt: new Date().toLocaleTimeString(),
      violations: finalViolations,
      answers,
    };

    broadcastMessage({
      type: 'STUDENT_SUBMIT',
      quizId: quiz.id,
      student: studentData,
    });
  };

  const recordViolation = (type: ViolationLog['type'], message: string) => {
    if (disqualified || isFinished || !isJoined) return;
    playBuzzer();

    const newViolation: ViolationLog = {
      id: `v_${Date.now()}`,
      type,
      timestamp: new Date().toLocaleTimeString(),
      message,
    };

    const nextStrikes = strikes + 1;
    const nextViolations = [...violations, newViolation];
    setStrikes(nextStrikes);
    setViolations(nextViolations);

    if (nextStrikes >= 3) {
      setDisqualified(true);
      reportToHost(nextStrikes, true, false, nextViolations);
    } else {
      reportToHost(nextStrikes, false, false, nextViolations);
    }
  };

  // Anti-Cheat Engine Listeners
  useEffect(() => {
    if (!isJoined || disqualified || isFinished) return;

    const handleVisibility = () => {
      if (document.hidden) recordViolation('tab_switch', 'Switched browser tab or minimized window');
    };
    const handleBlur = () => recordViolation('blur', 'Lost window focus to another application');
    const handleFullscreen = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (!active) recordViolation('fullscreen_exit', 'Exited mandatory fullscreen mode');
    };
    const handleKeys = (e: KeyboardEvent) => {
      if (e.key === 'F12' || (e.ctrlKey && ['c', 'v', 'u', 'a'].includes(e.key.toLowerCase())) || e.altKey) {
        e.preventDefault();
        recordViolation('tab_switch', `Intercepted prohibited key: ${e.key}`);
      }
    };
    const blockContext = (e: MouseEvent) => e.preventDefault();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreen);
    window.addEventListener('keydown', handleKeys);
    window.addEventListener('contextmenu', blockContext);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreen);
      window.removeEventListener('keydown', handleKeys);
      window.removeEventListener('contextmenu', blockContext);
    };
  }, [isJoined, strikes, disqualified, isFinished, violations, answers]);

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) return;
    if (!rulesAgreed) {
      alert('You must acknowledge and accept the assessment integrity rules to proceed.');
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
      setIsJoined(true);
      reportToHost(0, false, false, []);
    } catch {
      alert('Fullscreen permission is required to enter the proctored exam.');
    }
  };

  const reEnterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } catch (e) {
      console.warn('Fullscreen trigger failed', e);
    }
  };

  const handleSelectOption = (optIdx: number) => {
    setAnswers({ ...answers, [currentIdx]: optIdx });
  };

  const handleNext = () => {
    if (!quiz) return;
    const nextIdx = currentIdx + 1;
    if (nextIdx < quiz.questions.length) {
      setCurrentIdx(nextIdx);
      setTimeLeft(quiz.questions[nextIdx].timeLimit || 30);
    }
  };

  const handlePrevious = () => {
    if (!quiz) return;
    const prevIdx = currentIdx - 1;
    if (prevIdx >= 0) {
      setCurrentIdx(prevIdx);
      setTimeLeft(quiz.questions[prevIdx].timeLimit || 30);
    }
  };

  const handleSubmitFinal = () => {
    setIsFinished(true);
    reportToHost(strikes, false, true, violations);
  };

  if (!quiz) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-center p-6">
        <div className="max-w-md bg-slate-900 border border-slate-800 p-8 rounded-3xl space-y-3">
          <AlertOctagon className="w-12 h-12 text-amber-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Assessment Link Not Found</h2>
          <p className="text-xs text-slate-400">
            Please make sure you entered the correct participant link provided by your host.
          </p>
        </div>
      </div>
    );
  }

  // PRE-EXAM SCREEN WITH DETAILED RULES & TOTAL QUESTIONS
  if (!isJoined) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] py-8 px-4">
        <div className="bg-slate-900/90 border border-slate-800 p-8 rounded-3xl max-w-xl w-full shadow-2xl backdrop-blur-xl space-y-6">
          <div className="flex items-center gap-3 text-emerald-400">
            <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white">{quiz.title}</h2>
              <span className="text-xs text-slate-400 font-mono">Candidate Integrity Briefing</span>
            </div>
          </div>

          {/* Assessment Specifications */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800/80 text-xs font-mono">
            <div>
              <span className="text-slate-500 block">Total Questions</span>
              <strong className="text-white text-base">{quiz.questions.length} Questions</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Total Marks</span>
              <strong className="text-cyan-400 text-base">{quiz.questions.length * 10} Points</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Pacing Mode</span>
              <strong className="text-emerald-400 text-base uppercase">{quiz.pacingMode}</strong>
            </div>
          </div>

          {/* OFFICIAL QUIZ RULES CARD */}
          <div className="space-y-3 bg-slate-950/60 p-5 rounded-2xl border border-slate-800 text-xs">
            <h4 className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" /> Mandatory Proctoring Rules:
            </h4>
            <ul className="space-y-2 text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">1.</span>
                <span><strong>Mandatory Fullscreen:</strong> You must remain in fullscreen mode throughout the test. Exiting fullscreen logs a violation.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">2.</span>
                <span><strong>No Tab Switching or Window Blur:</strong> Navigating away from this exam or clicking outside the window triggers an immediate strike and warning buzzer.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">3.</span>
                <span><strong>Key Shortcuts Prohibited:</strong> Developer Tools (F12), Copy/Paste (Ctrl+C/V), and Alt+Tab are intercepted and recorded.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">4.</span>
                <span><strong>3 Strikes Disqualification:</strong> Reaching 3 integrity strikes will permanently lock your assessment and report your violations to the host.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">5.</span>
                <span><strong>Silent Anti-Peeking Shuffler:</strong> The 4 colored option cards rotate visual colors silently every 15 seconds to prevent neighboring screen peeking.</span>
              </li>
            </ul>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Audio Warning Buzzer:</span>
              <button 
                type="button" 
                onClick={playBuzzer}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs transition flex items-center gap-1.5"
              >
                <Volume2 className="w-3.5 h-3.5" /> {audioTested ? 'Sound Verified ?' : 'Test Warning Buzzer'}
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleStartExam} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1 font-medium">Candidate Registered Name</label>
              <input
                type="text"
                required
                placeholder="Enter your full registered name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-white text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
              <input 
                type="checkbox" 
                required 
                checked={rulesAgreed} 
                onChange={(e) => setRulesAgreed(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
              />
              <span>I have read and agree to follow all proctoring and anti-cheat rules.</span>
            </label>

            <button 
              type="submit" 
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white font-bold rounded-xl text-sm shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2"
            >
              <Maximize className="w-4 h-4" /> Lock Fullscreen & Start Assessment
            </button>
          </form>
        </div>
      </div>
    );
  }

  // FINAL COMPLETED SCREEN
  if (isFinished) {
    let correctCount = 0;
    quiz.questions.forEach((q, i) => {
      if (answers[i] === q.correctAnswer) correctCount += 1;
    });
    const incorrectCount = quiz.questions.length - correctCount;

    const studentResultChart = [
      { label: 'Correct Answers', value: correctCount, color: '#10b981' },
      { label: 'Incorrect Answers', value: incorrectCount, color: '#f43f5e' },
    ];

    return (
      <div className="max-w-md mx-auto space-y-6 select-none py-8">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl space-y-4 shadow-2xl text-center">
          <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
          <h2 className="text-2xl font-bold text-white">Assessment Submitted</h2>
          <p className="text-xs text-slate-400">Your answers and integrity log have been submitted to the host console.</p>
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 font-mono text-cyan-400 text-2xl font-bold">
            Score: {correctCount * 10} / {quiz.questions.length * 10} pts
          </div>
        </div>

        <PieChart title="Performance Breakdown" data={studentResultChart} />
      </div>
    );
  }

  const currentQ = quiz.questions[currentIdx];
  const progressPercent = Math.round(((currentIdx + 1) / quiz.questions.length) * 100);

  return (
    <div className="max-w-3xl mx-auto space-y-6 select-none">
      {/* Fullscreen Escape Overlay */}
      {!isFullscreen && !disqualified && (
        <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-50 flex items-center justify-center p-6 text-center">
          <div className="max-w-md bg-amber-950/30 border border-amber-500/40 p-8 rounded-3xl space-y-4">
            <AlertTriangle className="w-14 h-14 text-amber-400 mx-auto animate-bounce" />
            <h2 className="text-xl font-bold text-white">Fullscreen Required</h2>
            <p className="text-xs text-amber-200/80">Re-enter fullscreen immediately to avoid strike disqualification.</p>
            <button onClick={reEnterFullscreen} className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl text-sm">
              Resume Fullscreen
            </button>
          </div>
        </div>
      )}

      {/* Disqualification Screen */}
      {disqualified && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-50 flex items-center justify-center p-6 text-center">
          <div className="max-w-md bg-red-950/40 border border-red-500/50 p-8 rounded-3xl space-y-4">
            <AlertOctagon className="w-16 h-16 text-red-500 mx-auto animate-pulse" />
            <h2 className="text-2xl font-bold text-white">Disqualified</h2>
            <p className="text-xs text-red-300">You accumulated 3 integrity strikes. Session terminated.</p>
          </div>
        </div>
      )}

      {/* Top HUD with Progress Bar and Question Status Indicator */}
      <div className="bg-slate-900/60 border border-slate-800 p-5 rounded-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Candidate</span>
            <p className="font-bold text-white text-sm">{studentName}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-center">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Strikes</span>
              <span className={`font-mono font-bold text-sm ${strikes > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {strikes}/3
              </span>
            </div>

            {quiz.pacingMode === 'auto' && (
              <div className="text-center pl-3 border-l border-slate-800">
                <span className="text-[10px] font-mono uppercase text-slate-400 block flex items-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-400" /> Time Left
                </span>
                <span className={`font-mono font-bold text-sm ${timeLeft <= 5 ? 'text-red-400 animate-ping' : 'text-cyan-400'}`}>
                  {timeLeft}s
                </span>
              </div>
            )}

            <div className="text-center pl-3 border-l border-slate-800">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Progress</span>
              <span className="font-mono font-bold text-cyan-400 text-sm">
                Question {currentIdx + 1} of {quiz.questions.length}
              </span>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
          <div 
            className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Question Numbers Quick Navigator */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {quiz.questions.map((_, i) => (
            <button
              key={i}
              disabled={quiz.pacingMode === 'auto'}
              onClick={() => {
                setCurrentIdx(i);
                setTimeLeft(quiz.questions[i].timeLimit || 30);
              }}
              className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition flex items-center justify-center ${
                currentIdx === i
                  ? 'bg-cyan-500 text-black shadow-md'
                  : answers[i] !== undefined
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Question Card with Silent 15s Color Rotation */}
      <div className="bg-slate-900/80 border border-slate-800 p-8 rounded-3xl space-y-6 shadow-2xl">
        <div className="flex justify-between items-center text-xs font-mono text-slate-400">
          <span>QUESTION {currentIdx + 1} OF {quiz.questions.length}</span>
          <span className="text-emerald-400 font-semibold">10 Points</span>
        </div>

        <h3 className="text-xl font-bold text-white leading-relaxed">{currentQ.text}</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentQ.options.map((opt, idx) => {
            const colorIdx = (idx + colorShift) % 4;
            const themeVariant = COLOR_VARIANTS[colorIdx];
            const isSelected = answers[currentIdx] === idx;

            return (
              <button
                key={idx}
                onClick={() => handleSelectOption(idx)}
                className={`p-5 rounded-2xl text-left font-medium text-sm border-2 transition-all duration-500 flex items-center justify-between ${
                  isSelected 
                    ? `${themeVariant.active} ring-2 ring-white/50 shadow-lg scale-[1.02]` 
                    : `${themeVariant.bg} ${themeVariant.border}${themeVariant.text} hover:scale-[1.01] hover:brightness-110`
                }`}
              >
                <span>
                  <span className="font-mono font-black text-white mr-2.5 px-2 py-0.5 rounded bg-black/40">
                    {String.fromCharCode(65 + idx)}
                  </span> 
                  {opt}
                </span>
                {isSelected && <CheckCircle2 className="w-5 h-5 text-white" />}
              </button>
            );
          })}
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-slate-800/80">
          <button
            disabled={currentIdx === 0 || quiz.pacingMode === 'auto'}
            onClick={handlePrevious}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-20 text-white text-xs font-semibold rounded-xl"
          >
            ? Previous
          </button>

          {currentIdx + 1 < quiz.questions.length ? (
            <button
              onClick={handleNext}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-xl"
            >
              Next Question ?
            </button>
          ) : (
            <button
              onClick={handleSubmitFinal}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20"
            >
              Submit Assessment
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
