import React, { useState, useEffect, useRef } from 'react';
import { Quiz, Question, ThemeColor } from '../types';
import { getSavedQuiz, applyGlobalTheme, subscribeToMessages, supabase } from '../supabase';
import { 
  ShieldAlert, CheckCircle, AlertTriangle, Maximize, Clock, Trophy, 
  AlertOctagon, Edit3, Award, Bookmark, Flag, ArrowRight, ArrowLeft, Loader2
} from 'lucide-react';

interface StudentPortalProps {
  quizId?: string;
  quizIdFromUrl?: string;
  onExit?: () => void;
}

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

  // Navigation and Responses
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, any>>(() => {
    if (!resolvedQuizId) return {};
    try {
      const saved = localStorage.getItem(`quizguard_answers_${resolvedQuizId}`);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [reviewFlags, setReviewFlags] = useState<Record<string, boolean>>(() => {
    if (!resolvedQuizId) return {};
    try {
      const saved = localStorage.getItem(`quizguard_review_${resolvedQuizId}`);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [visitedIndices, setVisitedIndices] = useState<Record<number, boolean>>({ 0: true });

  // Stage 2: Server-Anchored Timer States
  const [startedAtTimestamp, setStartedAtTimestamp] = useState<number | null>(null);
  const [totalSecondsLeft, setTotalSecondsLeft] = useState<number>(1200);
  const [isAutoSubmitting, setIsAutoSubmitting] = useState<boolean>(false);
  const hasAutoSubmitted = useRef<boolean>(false);

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
  const [timeTaken, setTimeTaken] = useState<number>(0);
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);

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
      setQuiz(loaded);
      if (loaded.theme) applyGlobalTheme(loaded.theme);
      if (loaded.pacingMode === 'ended' || (loaded as any).status === 'ended') {
        setIsAssessmentStopped(true);
      } else {
        setIsAssessmentStopped(false);
      }
    }

    // Fetch participant record from Supabase to sync started_at and status
    if (supabase && participantId) {
      try {
        const { data: pData } = await supabase
          .from('participants')
          .select('*')
          .eq('id', participantId)
          .maybeSingle();

        if (pData) {
          if (pData.status === 'Disqualified') {
            setDisqualified(true);
            setIsFinished(true);
            setIsJoined(true);
            setStrikes(pData.strikes || 3);
            localStorage.setItem(`quizguard_disqualified_${id}`, 'true');
          } else if (pData.status === 'Completed') {
            setIsFinished(true);
            setIsJoined(true);
            setScore(pData.score || 0);
            setTimeTaken(pData.time_taken || 0);
          }

          // Restore server started_at timestamp
          if (pData.started_at) {
            const serverStartMs = new Date(pData.started_at).getTime();
            setStartedAtTimestamp(serverStartMs);
            localStorage.setItem(`quizguard_start_time_${id}`, String(serverStartMs));
            setIsJoined(true);
          }
        }
      } catch (e) {}
    }

    // Fallback to local stored start time if Supabase has not yet loaded it
    if (!startedAtTimestamp) {
      const localStart = localStorage.getItem(`quizguard_start_time_${id}`);
      if (localStart) {
        setStartedAtTimestamp(Number(localStart));
      }
    }

    setLoadingQuiz(false);
  };

  // Real-time Stop / Resume Listener
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

  // Anti-Cheat Listeners
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

  // Stage 2: Server-Anchored Total Timer Engine with Auto-Submit
  useEffect(() => {
    if (!isJoined || isFinished || disqualified || isAssessmentStopped || !quiz || !startedAtTimestamp) return;

    const totalAllowedSec = (quiz.mode === 'marks_challenge' 
      ? (quiz.totalDurationMinutes || 20) 
      : (quiz.questions.length * 1)) * 60;

    const timer = setInterval(() => {
      const now = Date.now();
      const elapsedSec = Math.max(0, Math.floor((now - startedAtTimestamp) / 1000));
      const remainingSec = Math.max(0, totalAllowedSec - elapsedSec);

      setTotalSecondsLeft(remainingSec);
      setTimeTaken(elapsedSec);

      // Auto-submit when time reaches zero
      if (remainingSec <= 0 && !hasAutoSubmitted.current) {
        hasAutoSubmitted.current = true;
        clearInterval(timer);
        setIsAutoSubmitting(true);
        setTimeout(() => {
          handleSubmit(true);
        }, 1200);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isJoined, isFinished, disqualified, isAssessmentStopped, quiz, startedAtTimestamp]);

  // Joining and Anchoring Start Timestamp
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

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    setStartedAtTimestamp(nowMs);
    setIsJoined(true);
    localStorage.setItem(`quizguard_pid_${resolvedQuizId}`, participantId);
    localStorage.setItem(`quizguard_name_${resolvedQuizId}`, name);
    localStorage.setItem(`quizguard_start_time_${resolvedQuizId}`, String(nowMs));

    if (supabase && resolvedQuizId) {
      await supabase.from('participants').upsert({
        id: participantId,
        quiz_id: resolvedQuizId,
        name: name,
        score: 0,
        strikes: 0,
        status: 'Active',
        violations: [],
        started_at: nowIso,
        updated_at: nowIso
      });
    }
  };

  const handleSelectOption = (qId: string, optIdx: number) => {
    if (isAssessmentStopped || isAutoSubmitting) return;
    const updated = { ...answers, [qId]: optIdx };
    setAnswers(updated);
    localStorage.setItem(`quizguard_answers_${resolvedQuizId}`, JSON.stringify(updated));
  };

  const handleTextAnswer = (qId: string, val: string) => {
    if (isAssessmentStopped || isAutoSubmitting) return;
    const updated = { ...answers, [qId]: val };
    setAnswers(updated);
    localStorage.setItem(`quizguard_answers_${resolvedQuizId}`, JSON.stringify(updated));
  };

  const handleMultiBlankAnswer = (qId: string, blankIdx: number, val: string) => {
    if (isAssessmentStopped || isAutoSubmitting) return;
    const currentList = Array.isArray(answers[qId]) ? [...answers[qId]] : [];
    currentList[blankIdx] = val;
    const updated = { ...answers, [qId]: currentList };
    setAnswers(updated);
    localStorage.setItem(`quizguard_answers_${resolvedQuizId}`, JSON.stringify(updated));
  };

  const toggleReviewFlag = (qId: string) => {
    if (isAutoSubmitting) return;
    const updated = { ...reviewFlags, [qId]: !reviewFlags[qId] };
    setReviewFlags(updated);
    localStorage.setItem(`quizguard_review_${resolvedQuizId}`, JSON.stringify(updated));
  };

  const navigateTo = (index: number) => {
    if (isAutoSubmitting) return;
    setCurrentIdx(index);
    setVisitedIndices((prev) => ({ ...prev, [index]: true }));
  };

  const handleSubmit = async (forced = false) => {
    if (!quiz || isAssessmentStopped) return;
    setShowSubmitModal(false);

    let totalScore = 0;
    const sectionMap = new Map((quiz.sections || []).map((s) => [s.id, s]));

    quiz.questions.forEach((q) => {
      const qSection = q.sectionId ? sectionMap.get(q.sectionId) : undefined;
      const penalty = qSection ? qSection.negativeMarking : 0;
      const qMarks = q.marks !== undefined ? Number(q.marks) : 10;
      const userAns = answers[q.id];

      if (q.type === 'multi_fib') {
        const correctList = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
        const studentList = Array.isArray(userAns) ? userAns : [];
        const blanksCount = correctList.length || 1;
        const markPerBlank = qMarks / blanksCount;

        let blanksMatched = 0;
        let attempted = false;

        correctList.forEach((corr, bIdx) => {
          const sVal = String(studentList[bIdx] || '').trim().toLowerCase();
          if (sVal.length > 0) attempted = true;
          if (sVal === String(corr).trim().toLowerCase()) {
            blanksMatched++;
          }
        });

        if (blanksMatched > 0) {
          totalScore += blanksMatched * markPerBlank;
        } else if (attempted && penalty > 0) {
          totalScore -= penalty;
        }
      } else if (q.type === 'fib') {
        const studentText = String(userAns || '').trim().toLowerCase();
        const expectedText = String(q.correctAnswer || '').trim().toLowerCase();

        if (studentText.length > 0) {
          if (studentText === expectedText) {
            totalScore += qMarks;
          } else if (penalty > 0) {
            totalScore -= penalty;
          }
        }
      } else {
        // MCQ
        if (userAns !== undefined && userAns !== null) {
          if (Number(userAns) === Number(q.correctAnswer)) {
            totalScore += qMarks;
          } else if (penalty > 0) {
            totalScore -= penalty;
          }
        }
      }
    });

    const finalScore = Math.max(0, Number(totalScore.toFixed(1)));
    setScore(finalScore);
    setIsFinished(true);
    setIsAutoSubmitting(false);

    if (supabase && resolvedQuizId) {
      await supabase.from('participants').upsert({
        id: participantId,
        quiz_id: resolvedQuizId,
        name: name,
        score: finalScore,
        time_taken: timeTaken,
        strikes: strikes,
        status: disqualified ? 'Disqualified' : 'Completed',
        violations: violations,
        answers: answers,
        review_flags: reviewFlags,
        updated_at: new Date().toISOString()
      });
    }
  };

  if (loadingQuiz) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-300 font-medium">Connecting to assessment...</p>
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
          This device exceeded the maximum integrity threshold (3 strikes). Your session is permanently locked.
        </p>
        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-left space-y-2 text-xs font-mono max-h-48 overflow-y-auto">
          <span className="text-slate-400 block font-bold mb-1">Recorded Proctor Violations:</span>
          {violations.map((v, i) => (
            <div key={i} className="text-rose-400">• [{v.timestamp}] {v.message}</div>
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
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center shadow-xl">
        <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Assessment Not Found</h2>
      </div>
    );
  }

  // Answer Review & Results Screen
  if (isFinished) {
    const totalMax = quiz.questions.reduce((sum, q) => sum + (q.marks || 10), 0);

    return (
      <div className="max-w-3xl mx-auto my-8 space-y-8">
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl text-center shadow-2xl space-y-4">
          <Trophy className="w-16 h-16 text-amber-400 mx-auto" />
          <h2 className="text-2xl font-bold text-white">Assessment Submitted Successfully!</h2>
          <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 inline-block px-10">
            <span className="text-xs uppercase font-mono tracking-wider text-slate-400 block mb-1">Your Total Score</span>
            <span className="text-4xl font-black text-cyan-400">{score} / {totalMax} pts</span>
            <span className="text-xs text-slate-400 block mt-2">
              Time Taken: {Math.floor(timeTaken / 60)}m {timeTaken % 60}s
            </span>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" /> Detailed Answer Key & Review
          </h3>

          <div className="space-y-4">
            {quiz.questions.map((q, idx) => {
              const userAns = answers[q.id];
              return (
                <div key={q.id} className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-cyan-400 font-bold">Q{idx + 1} ({q.marks} Marks)</span>
                    <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {q.type}
                    </span>
                  </div>
                  <p className="text-white text-sm font-semibold">{q.text}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono">
                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block mb-0.5">Your Response:</span>
                      <span className="text-amber-300 font-bold">
                        {userAns !== undefined ? (Array.isArray(userAns) ? userAns.join(', ') : (q.type === 'mcq' ? q.options?.[userAns] : String(userAns))) : 'Skipped'}
                      </span>
                    </div>

                    <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-slate-400 block mb-0.5">Correct Answer:</span>
                      <span className="text-emerald-400 font-bold">
                        {Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : (q.type === 'mcq' ? q.options?.[Number(q.correctAnswer)] : String(q.correctAnswer))}
                      </span>
                    </div>
                  </div>

                  {q.explanation && (
                    <div className="text-slate-300 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60 text-[11px] leading-relaxed">
                      ?? <strong>Explanation:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (!isJoined) {
    return (
      <div className="max-w-md mx-auto my-8 p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-xl">
        <h2 className="text-xl font-bold text-white mb-2">{quiz.title}</h2>
        <span className="text-xs text-cyan-400 font-mono block mb-4">
          {quiz.mode === 'marks_challenge' ? `Marks Challenge • ${quiz.totalDurationMinutes || 20} Minutes Total` : 'Classic Proctored Assessment'}
        </span>

        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-6 text-left">
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-2">
            <AlertTriangle className="w-4 h-4" /> Integrity & Timer Notice
          </div>
          <ul className="text-xs text-amber-200/80 space-y-1 list-disc list-inside">
            <li>The total exam timer starts as soon as you enter and cannot be paused or reset.</li>
            <li>Tab switching, window minimization, or app blurring triggers a strike.</li>
            <li>Exiting fullscreen triggers a strike (3 strikes = Disqualification).</li>
            <li>At 00:00, your exam will auto-submit automatically.</li>
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
            <Maximize className="w-4 h-4" /> Enter Fullscreen & Start Exam
          </button>
        </form>
      </div>
    );
  }

  const currentQ = quiz.questions[currentIdx];
  const sectionMap = new Map((quiz.sections || []).map((s) => [s.id, s]));
  const currentSec = currentQ.sectionId ? sectionMap.get(currentQ.sectionId) : undefined;

  const getQuestionStatus = (q: Question, idx: number) => {
    const isAnswered = answers[q.id] !== undefined && (
      Array.isArray(answers[q.id]) 
        ? answers[q.id].some((v: string) => v && v.trim().length > 0)
        : String(answers[q.id]).trim().length > 0
    );
    const isFlagged = !!reviewFlags[q.id];
    const isVisited = !!visitedIndices[idx];

    if (isFlagged) return 'review';
    if (isAnswered) return 'answered';
    if (isVisited) return 'skipped';
    return 'not_visited';
  };

  const answeredCount = quiz.questions.filter((q) => {
    const val = answers[q.id];
    return val !== undefined && (Array.isArray(val) ? val.some(v => v && v.trim().length > 0) : String(val).trim().length > 0);
  }).length;
  const flaggedCount = Object.values(reviewFlags).filter(Boolean).length;
  const unansweredCount = quiz.questions.length - answeredCount;

  // Visual Timer Styling
  const isTimerCritical = totalSecondsLeft <= 60;
  const isTimerWarning = totalSecondsLeft <= 300 && totalSecondsLeft > 60;

  return (
    <div className="max-w-6xl mx-auto my-6 space-y-6 relative">
      {/* Auto-Submit Fullscreen Lockout Overlay */}
      {isAutoSubmitting && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="p-4 bg-rose-500/10 rounded-3xl border border-rose-500/30 mb-4 animate-bounce">
            <Clock className="w-12 h-12 text-rose-500" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Time Expired!</h2>
          <p className="text-slate-400 text-sm max-w-sm mb-6">
            The allotted exam timer has completed. Your responses are being recorded and submitted...
          </p>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold">
            <Loader2 className="w-4 h-4 animate-spin" /> Finalizing assessment telemetry...
          </div>
        </div>
      )}

      {/* Top CBT Status Bar */}
      <div className="flex flex-wrap items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-3xl gap-4">
        <div>
          <h2 className="text-base font-bold text-white">{quiz.title}</h2>
          <span className="text-xs text-slate-400 font-mono">Candidate: <strong className="text-cyan-300">{name}</strong></span>
        </div>

        <div className="flex items-center gap-4">
          {/* Stage 2 Hardened Countdown Badge */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border font-mono text-sm font-bold transition-colors ${
            isTimerCritical 
              ? 'bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse ring-2 ring-rose-500/30' 
              : isTimerWarning
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              : 'bg-slate-950 border-slate-800 text-cyan-400'
          }`}>
            <Clock className={`w-4 h-4 ${isTimerCritical ? 'animate-spin' : ''}`} />
            <span>
              {Math.floor(totalSecondsLeft / 60).toString().padStart(2, '0')}:{(totalSecondsLeft % 60).toString().padStart(2, '0')}
            </span>
            {isTimerCritical && (
              <span className="text-[10px] uppercase tracking-wider text-rose-300 ml-1 font-bold">
                (Final Minute)
              </span>
            )}
          </div>

          {/* Strikes Counter */}
          <div className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold ${
            strikes > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            {strikes}/3 Strikes
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition"
          >
            Submit Quiz
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Interactive Question Canvas */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-slate-900 border border-slate-800 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-cyan-400 uppercase tracking-wider">
                  Question {currentIdx + 1} of {quiz.questions.length}
                </span>
                {currentSec && (
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {currentSec.name}
                  </span>
                )}
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  +{currentQ.marks || 10} Marks
                </span>
                {currentSec && currentSec.negativeMarking > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono text-rose-400">
                    (-{currentSec.negativeMarking} penalty)
                  </span>
                )}
              </div>

              <button
                onClick={() => toggleReviewFlag(currentQ.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  reviewFlags[currentQ.id]
                    ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                {reviewFlags[currentQ.id] ? 'Flagged for Review' : 'Mark for Review'}
              </button>
            </div>

            <h2 className="text-lg font-semibold text-white leading-relaxed">{currentQ.text}</h2>

            {currentQ.type === 'multi_fib' ? (
              <div className="space-y-4 bg-slate-950 p-5 rounded-2xl border border-slate-800">
                <span className="text-xs font-medium text-slate-400 block">Fill in all blanks:</span>
                {(Array.isArray(currentQ.correctAnswer) ? currentQ.correctAnswer : ['', '']).map((_, bIdx) => (
                  <div key={bIdx} className="space-y-1">
                    <label className="text-xs text-cyan-400 font-mono">Blank {bIdx + 1}:</label>
                    <input
                      type="text"
                      disabled={isAutoSubmitting}
                      placeholder={`Enter answer for Blank ${bIdx + 1}...`}
                      value={(answers[currentQ.id]?.[bIdx] as string) || ''}
                      onChange={(e) => handleMultiBlankAnswer(currentQ.id, bIdx, e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                ))}
              </div>
            ) : currentQ.type === 'fib' ? (
              <div className="space-y-2 bg-slate-950 p-5 rounded-2xl border border-slate-800">
                <label className="text-xs font-medium text-slate-400 block">Your Answer:</label>
                <input
                  type="text"
                  disabled={isAutoSubmitting}
                  placeholder="Type your answer here..."
                  value={(answers[currentQ.id] as string) || ''}
                  onChange={(e) => handleTextAnswer(currentQ.id, e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            ) : (
              <div className="space-y-3">
                {(currentQ.options || []).map((opt, oIdx) => {
                  const isSelected = answers[currentQ.id] === oIdx;
                  return (
                    <button
                      key={oIdx}
                      disabled={isAutoSubmitting}
                      onClick={() => handleSelectOption(currentQ.id, oIdx)}
                      className={`w-full text-left p-4 rounded-2xl border text-sm font-medium transition flex items-center justify-between ${
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
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                onClick={() => navigateTo(Math.max(0, currentIdx - 1))}
                disabled={currentIdx === 0 || isAutoSubmitting}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 rounded-xl text-xs font-bold transition"
              >
                <ArrowLeft className="w-4 h-4" /> Previous
              </button>

              <button
                onClick={() => navigateTo(Math.min(quiz.questions.length - 1, currentIdx + 1))}
                disabled={currentIdx === quiz.questions.length - 1 || isAutoSubmitting}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 disabled:opacity-30 text-white rounded-xl text-xs font-bold transition"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Question Palette */}
        <div className="space-y-5">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-cyan-400" /> Question Palette
            </h3>

            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-400 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500"></span> Answered ({answeredCount})
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-purple-500"></span> Review ({flaggedCount})
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-500"></span> Skipped
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700"></span> Not Visited
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
              {quiz.questions.map((q, idx) => {
                const status = getQuestionStatus(q, idx);
                const isCurrent = currentIdx === idx;

                let badgeColor = 'bg-slate-800 text-slate-400 border-slate-700';
                if (status === 'answered') badgeColor = 'bg-emerald-600 text-white border-emerald-500';
                else if (status === 'review') badgeColor = 'bg-purple-600 text-white border-purple-500';
                else if (status === 'skipped') badgeColor = 'bg-amber-600 text-white border-amber-500';

                return (
                  <button
                    key={q.id}
                    disabled={isAutoSubmitting}
                    onClick={() => navigateTo(idx)}
                    className={`h-10 rounded-xl border text-xs font-mono font-bold transition flex items-center justify-center relative ${badgeColor} ${
                      isCurrent ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900 scale-105' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white text-center">Confirm Assessment Submission</h3>
            <p className="text-xs text-slate-400 text-center">
              Please review your question attempts before submitting:
            </p>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="p-2 rounded-xl bg-emerald-950/30 border border-emerald-900/40">
                <span className="text-emerald-400 font-bold text-base block">{answeredCount}</span>
                <span className="text-[10px] text-slate-400">Answered</span>
              </div>
              <div className="p-2 rounded-xl bg-amber-950/30 border border-amber-900/40">
                <span className="text-amber-400 font-bold text-base block">{unansweredCount}</span>
                <span className="text-[10px] text-slate-400">Unanswered</span>
              </div>
              <div className="p-2 rounded-xl bg-purple-950/30 border border-purple-900/40">
                <span className="text-purple-400 font-bold text-base block">{flaggedCount}</span>
                <span className="text-[10px] text-slate-400">Review Flags</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition"
              >
                Resume Test
              </button>
              <button
                onClick={() => handleSubmit(false)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/20"
              >
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
