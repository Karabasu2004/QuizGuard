import React, { useState, useEffect } from 'react';
import { Quiz, Question, ThemeColor } from '../types';
import { getSavedQuiz, applyGlobalTheme, subscribeToMessages, supabase } from '../supabase';
import { ShieldAlert, CheckCircle, AlertTriangle, Maximize, Clock, Trophy } from 'lucide-react';

interface StudentPortalProps {
  quizId?: string;
  quizIdFromUrl?: string;
  onExit?: () => void;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({ quizId: propQuizId, quizIdFromUrl, onExit }) => {
  const [resolvedQuizId, setResolvedQuizId] = useState<string>('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState<boolean>(true);
  const [name, setName] = useState<string>('');
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [participantId] = useState<string>(() => 'p_' + Math.random().toString(36).substring(2, 9));
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [strikes, setStrikes] = useState<number>(0);
  const [violations, setViolations] = useState<Array<{ timestamp: string; message: string }>>([]);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [disqualified, setDisqualified] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);

  // Extract quiz ID from all possible sources
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('quiz') || params.get('quizId') || quizIdFromUrl || propQuizId || '';
    
    if (targetId) {
      setResolvedQuizId(targetId);
      loadQuiz(targetId);
    } else {
      setLoadingQuiz(false);
    }
  }, [propQuizId, quizIdFromUrl]);

  const loadQuiz = async (id: string) => {
    setLoadingQuiz(true);
    const loaded = await getSavedQuiz(id);
    if (loaded) {
      setQuiz(loaded);
      if (loaded.theme) applyGlobalTheme(loaded.theme);
      if (loaded.questions && loaded.questions[0]) {
        setTimeLeft(loaded.questions[0].timeLimit || 30);
      }
    }
    setLoadingQuiz(false);
  };

  // Live theme listener from host
  useEffect(() => {
    const unsubscribe = subscribeToMessages((msg) => {
      if (msg.type === 'THEME_CHANGE' && msg.theme) {
        applyGlobalTheme(msg.theme);
      }
    });
    return () => unsubscribe();
  }, []);

  // Anti-cheat detection listeners
  useEffect(() => {
    if (!isJoined || isFinished || disqualified) return;

    const handleVisibilityChange = () => {
      if (document.hidden) recordViolation('Tab Switch / Minimized Window');
    };

    const handleWindowBlur = () => {
      recordViolation('Focus Lost (App or window switched)');
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        recordViolation('Exited Fullscreen Mode');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isJoined, isFinished, disqualified, strikes]);

  const recordViolation = async (reason: string) => {
    const newStrikes = strikes + 1;
    const newViolationItem = { timestamp: new Date().toLocaleTimeString(), message: reason };
    const updatedViolations = [...violations, newViolationItem];
    
    setStrikes(newStrikes);
    setViolations(updatedViolations);

    const isDisq = newStrikes >= 3;
    if (isDisq) {
      setDisqualified(true);
      setIsFinished(true);
    }

    if (supabase && resolvedQuizId) {
      await supabase.from('participants').upsert({
        id: participantId,
        quiz_id: resolvedQuizId,
        name: name,
        strikes: newStrikes,
        status: isDisq ? 'Disqualified' : 'Active',
        violations: updatedViolations,
        updated_at: new Date().toISOString()
      });
    }
  };

  // Automated countdown logic
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
            handleSubmit();
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isJoined, isFinished, disqualified, quiz, currentIdx, answers]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) {}

    setIsJoined(true);

    if (supabase && resolvedQuizId) {
      await supabase.from('participants').upsert({
        id: participantId,
        quiz_id: resolvedQuizId,
        name: name,
        score: 0,
        strikes: 0,
        status: 'Active',
        violations: [],
        updated_at: new Date().toISOString()
      });
    }
  };

  const handleSelectOption = (optIdx: number) => {
    if (!quiz) return;
    const currentQ = quiz.questions[currentIdx];
    setAnswers((prev) => ({ ...prev, [currentQ.id]: optIdx }));
  };

  const handleSubmit = async () => {
    if (!quiz) return;
    let totalScore = 0;
    quiz.questions.forEach((q) => {
      if (answers[q.id] === q.correctAnswer) {
        totalScore += 10;
      }
    });

    setScore(totalScore);
    setIsFinished(true);

    if (supabase && resolvedQuizId) {
      await supabase.from('participants').upsert({
        id: participantId,
        quiz_id: resolvedQuizId,
        name: name,
        score: totalScore,
        strikes: strikes,
        status: disqualified ? 'Disqualified' : 'Completed',
        violations: violations,
        answers: answers,
        updated_at: new Date().toISOString()
      });
    }
  };

  if (loadingQuiz) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-300 font-medium">Connecting to live assessment...</p>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center shadow-xl">
        <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Assessment Not Found</h2>
        <p className="text-slate-400 mb-6 text-sm">
          Please check the URL or ask the assessment host for an updated invitation link.
        </p>
        <button
          onClick={() => window.location.href = window.location.origin}
          className="px-6 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-medium transition"
        >
          Go to Home
        </button>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="max-w-lg mx-auto my-12 p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center shadow-2xl">
        {disqualified ? (
          <div>
            <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-rose-400 mb-2">Session Disqualified</h2>
            <p className="text-slate-400 text-sm mb-6">
              You exceeded the integrity threshold (3 strikes). Your responses and violation telemetry have been recorded for host audit.
            </p>
          </div>
        ) : (
          <div>
            <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Assessment Submitted!</h2>
            <p className="text-slate-400 text-sm mb-6">Great job! Your responses have been submitted to the host portal.</p>
            <div className="bg-slate-800/60 p-6 rounded-xl mb-6">
              <span className="text-slate-400 text-xs uppercase tracking-wider block mb-1">Your Score</span>
              <span className="text-4xl font-extrabold text-cyan-400">{score} pts</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
        <h2 className="text-xl font-bold text-white mb-1">{quiz.title}</h2>
        <p className="text-slate-400 text-xs mb-6">Live Proctored Session • Pacing: {quiz.pacingMode}</p>

        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-6 text-left">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-2">
            <AlertTriangle className="w-4 h-4" /> Integrity Notice
          </div>
          <ul className="text-xs text-amber-200/80 space-y-1 list-disc list-inside">
            <li>Tab switching, window minimization, or app blurring triggers a strike.</li>
            <li>Exiting fullscreen triggers a strike.</li>
            <li>Reaching 3 strikes results in immediate disqualification.</li>
          </ul>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
            <input
              type="text"
              required
              placeholder="e.g. John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 text-white rounded-xl font-medium text-sm transition flex items-center justify-center gap-2"
          >
            <Maximize className="w-4 h-4" /> Enter Fullscreen & Start
          </button>
        </form>
      </div>
    );
  }

  const currentQ = quiz.questions[currentIdx];

  return (
    <div className="max-w-2xl mx-auto my-6 p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
        <div>
          <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
            Question {currentIdx + 1} of {quiz.questions.length}
          </span>
          <h3 className="text-sm font-medium text-slate-300">{quiz.title}</h3>
        </div>

        <div className="flex items-center gap-3">
          {quiz.pacingMode === 'auto' && (
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              timeLeft <= 5 ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-slate-800 text-slate-300'
            }`}>
              <Clock className="w-3.5 h-3.5" /> {timeLeft}s
            </div>
          )}

          <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            strikes > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            {strikes}/3 Strikes
          </div>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-bold text-white mb-6 leading-relaxed">{currentQ.text}</h2>
        <div className="space-y-3">
          {currentQ.options.map((opt, oIdx) => {
            const isSelected = answers[currentQ.id] === oIdx;
            return (
              <button
                key={oIdx}
                onClick={() => handleSelectOption(oIdx)}
                className={`w-full text-left p-4 rounded-xl border text-sm font-medium transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-cyan-600/20 border-cyan-500 text-white'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:border-slate-600'
                }`}
              >
                <span>{opt}</span>
                {isSelected && <CheckCircle className="w-4 h-4 text-cyan-400 shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-800">
        <button
          onClick={() => {
            if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
          }}
          disabled={currentIdx === 0 || quiz.pacingMode === 'auto'}
          className="px-4 py-2 bg-slate-800 disabled:opacity-30 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
        >
          Previous
        </button>

        {currentIdx + 1 < quiz.questions.length ? (
          <button
            onClick={() => {
              const nextIdx = currentIdx + 1;
              setCurrentIdx(nextIdx);
              if (quiz.pacingMode === 'auto') {
                setTimeLeft(quiz.questions[nextIdx].timeLimit || 30);
              }
            }}
            className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 text-white rounded-xl text-xs font-medium transition"
          >
            Next Question
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium transition"
          >
            Submit Assessment
          </button>
        )}
      </div>
    </div>
  );
};
