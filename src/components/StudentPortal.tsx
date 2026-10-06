import React, { useState, useEffect } from 'react';
import { Quiz, Question, ThemeColor } from '../types';
import { getSavedQuiz, applyGlobalTheme, subscribeToMessages, supabase } from '../supabase';
import { ShieldAlert, CheckCircle, AlertTriangle, Maximize, Clock, Trophy, AlertOctagon } from 'lucide-react';

interface StudentPortalProps {
  quizId?: string;
  quizIdFromUrl?: string;
  onExit?: () => void;
}

// Fisher-Yates shuffle algorithm
const shuffleQuestions = (items: Question[]): Question[] => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Retrieve or generate randomized question order for this device
const getOrSetShuffledQuestions = (quizId: string, originalQuestions: Question[]): Question[] => {
  if (!originalQuestions || originalQuestions.length === 0) return [];

  const storageKey = `quizguard_q_order_${quizId}`;
  const savedOrderRaw = localStorage.getItem(storageKey);

  if (savedOrderRaw) {
    try {
      const savedIds: string[] = JSON.parse(savedOrderRaw);
      const qMap = new Map(originalQuestions.map((q) => [q.id, q]));
      const restored: Question[] = [];

      savedIds.forEach((id) => {
        const q = qMap.get(id);
        if (q) {
          restored.push(q);
          qMap.delete(id);
        }
      });

      qMap.forEach((q) => restored.push(q));

      if (restored.length > 0) return restored;
    } catch (e) {}
  }

  const randomized = shuffleQuestions(originalQuestions);
  localStorage.setItem(storageKey, JSON.stringify(randomized.map((q) => q.id)));
  return randomized;
};

export const StudentPortal: React.FC<StudentPortalProps> = ({ quizId: propQuizId, quizIdFromUrl, onExit }) => {
  const [resolvedQuizId, setResolvedQuizId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('quiz') || params.get('quizId') || quizIdFromUrl || propQuizId || '';
  });

  const isAlreadyDisqualified = resolvedQuizId 
    ? localStorage.getItem(`quizguard_disqualified_${resolvedQuizId}`) === 'true' 
    : false;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState<boolean>(true);
  const [name, setName] = useState<string>(() => {
    return resolvedQuizId ? (localStorage.getItem(`quizguard_name_${resolvedQuizId}`) || '') : '';
  });
  
  const [isJoined, setIsJoined] = useState<boolean>(isAlreadyDisqualified);
  const [participantId] = useState<string>(() => {
    const saved = resolvedQuizId ? localStorage.getItem(`quizguard_pid_${resolvedQuizId}`) : null;
    return saved || ('p_' + Math.random().toString(36).substring(2, 9));
  });

  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [strikes, setStrikes] = useState<number>(isAlreadyDisqualified ? 3 : 0);
  const [violations, setViolations] = useState<Array<{ timestamp: string; message: string }>>(() => {
    if (!resolvedQuizId) return [];
    try {
      const saved = localStorage.getItem(`quizguard_violations_${resolvedQuizId}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [isFinished, setIsFinished] = useState<boolean>(isAlreadyDisqualified);
  const [disqualified, setDisqualified] = useState<boolean>(isAlreadyDisqualified);
  const [isAssessmentStopped, setIsAssessmentStopped] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('quiz') || params.get('quizId') || quizIdFromUrl || propQuizId || '';
    if (targetId && targetId !== resolvedQuizId) {
      setResolvedQuizId(targetId);
    }
  }, [propQuizId, quizIdFromUrl]);

  useEffect(() => {
    if (!resolvedQuizId) {
      setLoadingQuiz(false);
      return;
    }
    loadQuiz(resolvedQuizId);
  }, [resolvedQuizId]);

  const loadQuiz = async (id: string) => {
    setLoadingQuiz(true);
    
    if (localStorage.getItem(`quizguard_disqualified_${id}`) === 'true') {
      setDisqualified(true);
      setIsFinished(true);
      setIsJoined(true);
      setStrikes(3);
    }

    const loaded = await getSavedQuiz(id);
    if (loaded) {
      if (loaded.questions && loaded.questions.length > 0) {
        loaded.questions = getOrSetShuffledQuestions(id, loaded.questions);
      }

      setQuiz(loaded);
      if (loaded.theme) applyGlobalTheme(loaded.theme);
      if (loaded.pacingMode === 'ended' || (loaded as any).status === 'ended') {
        setIsAssessmentStopped(true);
      } else {
        setIsAssessmentStopped(false);
      }
      if (loaded.questions && loaded.questions[0]) {
        setTimeLeft(loaded.questions[0].timeLimit || 30);
      }
    }

    if (supabase && participantId) {
      try {
        const { data: pData } = await supabase
          .from('participants')
          .select('*')
          .eq('id', participantId)
          .maybeSingle();

        if (pData?.status === 'Disqualified') {
          setDisqualified(true);
          setIsFinished(true);
          setIsJoined(true);
          setStrikes(pData.strikes || 3);
          localStorage.setItem(`quizguard_disqualified_${id}`, 'true');
        } else if (pData?.status === 'Completed') {
          setIsFinished(true);
          setIsJoined(true);
          setScore(pData.score || 0);
        }
      } catch (e) {}
    }

    setLoadingQuiz(false);
  };

  useEffect(() => {
    const unsubscribe = subscribeToMessages((msg: any) => {
      if (msg.type === 'THEME_CHANGE' && msg.theme) {
        applyGlobalTheme(msg.theme);
      }
      if (msg.type === 'STOP_QUIZ' && msg.quizId === resolvedQuizId) {
        setIsAssessmentStopped(true);
      }
      if (msg.type === 'RESUME_QUIZ' && msg.quizId === resolvedQuizId) {
        setIsAssessmentStopped(false);
      }
    });
    return () => unsubscribe();
  }, [resolvedQuizId]);

  useEffect(() => {
    if (!resolvedQuizId || !supabase) return;

    const checkHostStop = async () => {
      try {
        const { data: ctrlData } = await supabase
          .from('participants')
          .select('status')
          .eq('id', `QUIZ_STATE_${resolvedQuizId}`)
          .maybeSingle();

        if (ctrlData) {
          if (ctrlData.status === 'ENDED') {
            setIsAssessmentStopped(true);
            return;
          } else if (ctrlData.status === 'LIVE') {
            setIsAssessmentStopped(false);
            return;
          }
        }

        const { data: qData } = await supabase
          .from('quizzes')
          .select('pacing_mode')
          .eq('id', resolvedQuizId)
          .maybeSingle();

        if (qData) {
          if (qData.pacing_mode === 'ended') {
            setIsAssessmentStopped(true);
          } else {
            setIsAssessmentStopped(false);
          }
        }
      } catch (e) {}
    };

    const interval = setInterval(checkHostStop, 2000);
    return () => clearInterval(interval);
  }, [resolvedQuizId]);

  useEffect(() => {
    if (!isJoined || isFinished || disqualified || isAssessmentStopped) return;

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
  }, [isJoined, isFinished, disqualified, isAssessmentStopped, strikes]);

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

      localStorage.setItem(`quizguard_disqualified_${resolvedQuizId}`, 'true');
      localStorage.setItem(`quizguard_status_${resolvedQuizId}`, 'Disqualified');
      localStorage.setItem(`quizguard_violations_${resolvedQuizId}`, JSON.stringify(updatedViolations));
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

  useEffect(() => {
    if (!isJoined || isFinished || disqualified || isAssessmentStopped || !quiz) return;
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
  }, [isJoined, isFinished, disqualified, isAssessmentStopped, quiz, currentIdx, answers]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (localStorage.getItem(`quizguard_disqualified_${resolvedQuizId}`) === 'true') {
      setDisqualified(true);
      setIsFinished(true);
      return;
    }

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) {}

    setIsJoined(true);
    localStorage.setItem(`quizguard_pid_${resolvedQuizId}`, participantId);
    localStorage.setItem(`quizguard_name_${resolvedQuizId}`, name);

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
    if (!quiz || isAssessmentStopped) return;
    const currentQ = quiz.questions[currentIdx];
    setAnswers((prev) => ({ ...prev, [currentQ.id]: optIdx }));
  };

  const handleSubmit = async () => {
    if (!quiz || isAssessmentStopped) return;
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

  if (disqualified) {
    return (
      <div className="max-w-lg mx-auto my-12 p-8 bg-slate-900 border border-rose-500/30 rounded-3xl text-center shadow-2xl">
        <div className="p-3 bg-rose-500/10 rounded-2xl w-fit mx-auto mb-4 border border-rose-500/20">
          <ShieldAlert className="w-12 h-12 text-rose-500" />
        </div>
        <h2 className="text-2xl font-black text-rose-400 mb-2">Session Disqualified</h2>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          This device exceeded the maximum integrity threshold (3 strikes). Your session is locked and cannot be retaken for this assessment.
        </p>
        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-left space-y-2 text-xs font-mono max-h-48 overflow-y-auto">
          <span className="text-slate-400 block font-bold mb-1">Recorded Proctor Violations:</span>
          {violations.map((v, i) => (
            <div key={i} className="text-rose-400">
              • [{v.timestamp}] {v.message}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isAssessmentStopped) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center shadow-2xl">
        <div className="p-3 bg-red-500/10 rounded-2xl w-fit mx-auto mb-4 border border-red-500/20">
          <AlertOctagon className="w-12 h-12 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Assessment Ended</h2>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
          This assessment has been paused or closed by the host. Please wait if the host resumes the session.
        </p>
        {score > 0 && (
          <div className="bg-slate-800/60 p-4 rounded-xl mb-4 border border-slate-700/60">
            <span className="text-slate-400 text-xs uppercase tracking-wider block mb-1">Your Recorded Score</span>
            <span className="text-3xl font-black text-cyan-400">{score} pts</span>
          </div>
        )}
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
        <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Assessment Submitted!</h2>
        <p className="text-slate-400 text-sm mb-6">Great job! Your responses have been submitted to the host portal.</p>
        <div className="bg-slate-800/60 p-6 rounded-xl mb-6">
          <span className="text-slate-400 text-xs uppercase tracking-wider block mb-1">Your Score</span>
          <span className="text-4xl font-extrabold text-cyan-400">{score} pts</span>
        </div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
        <h2 className="text-xl font-bold text-white mb-4">{quiz.title}</h2>

        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-6 text-left">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-2">
            <AlertTriangle className="w-4 h-4" /> Integrity Notice
          </div>
          <ul className="text-xs text-amber-200/80 space-y-1 list-disc list-inside">
            <li>Tab switching, window minimization, or app blurring triggers a strike.</li>
            <li>Exiting fullscreen triggers a strike.</li>
            <li>Reaching 3 strikes results in permanent disqualification for this session.</li>
          </ul>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Team Name</label>
            <input
              type="text"
              required
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
