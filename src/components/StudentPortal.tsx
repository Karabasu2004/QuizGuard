import React, { useState, useEffect, useRef } from 'react';
import { Quiz, Question, QuizSection, ThemeColor, SectionSummary, QuestionScoreDetail, StudentResult } from '../types';
import { getSavedQuiz, applyGlobalTheme, subscribeToMessages, supabase, broadcastMessage } from '../supabase';
import { 
  ShieldAlert, CheckCircle, AlertTriangle, Maximize, Clock, Trophy, 
  AlertOctagon, Edit3, Award, Bookmark, Flag, ArrowRight, ArrowLeft, 
  RotateCcw, Check, Layers, Loader2, Menu, X, AlertCircle, HelpCircle, BarChart3, RefreshCw,
  Printer, BellRing, Sparkles, ChevronDown
} from 'lucide-react';

interface StudentPortalProps {
  quizId?: string;
  quizIdFromUrl?: string;
  onExit?: () => void;
  isLight?: boolean;
}

interface StoredExamSession {
  participantId: string;
  name: string;
  startedAt: number;
  totalDurationSeconds: number;
}

const getOrSetRandomizedQuestions = (quiz: Quiz, quizId: string): Question[] => {
  const cacheKey = `quizguard_student_q_${quizId}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length === quiz.questions.length) {
        return parsed;
      }
    } catch (e) {}
  }

  let questions = [...quiz.questions];

  if (quiz.shuffleQuestions) {
    if (quiz.sections && quiz.sections.length > 0) {
      const grouped: Record<string, Question[]> = {};
      quiz.sections.forEach(s => { grouped[s.id] = []; });
      grouped['default'] = [];

      questions.forEach(q => {
        const sId = q.sectionId || 'default';
        if (!grouped[sId]) grouped[sId] = [];
        grouped[sId].push(q);
      });

      const shuffledBySection: Question[] = [];
      quiz.sections.forEach(s => {
        const list = grouped[s.id] || [];
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        shuffledBySection.push(...list);
      });

      if (grouped['default'].length > 0) {
        const list = grouped['default'];
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        shuffledBySection.push(...list);
      }

      questions = shuffledBySection;
    } else {
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
    }
  }

  if (quiz.shuffleOptions) {
    questions = questions.map(q => {
      if (q.type === 'mcq' && q.options && q.options.length > 1) {
        const origCorrectIdx = Number(q.correctAnswer);
        const correctText = q.options[origCorrectIdx];

        const shuffledOpts = [...q.options];
        for (let i = shuffledOpts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledOpts[i], shuffledOpts[j]] = [shuffledOpts[j], shuffledOpts[i]];
        }

        const newCorrectIdx = shuffledOpts.findIndex(opt => opt === correctText);

        return {
          ...q,
          options: shuffledOpts,
          correctAnswer: newCorrectIdx >= 0 ? newCorrectIdx : q.correctAnswer
        };
      }
      return q;
    });
  }

  localStorage.setItem(cacheKey, JSON.stringify(questions));
  return questions;
};

// Reusable evaluation function for real-time live score computation
const evaluateQuizAnswers = (quiz: Quiz, answers: Record<string, any>) => {
  let totalScore = 0;
  let totalCorrect = 0;
  let totalWrong = 0;
  let totalSkipped = 0;

  const sectionMap = new Map((quiz.sections || []).map((s) => [s.id, s]));
  const calculatedSummaries: Record<string, SectionSummary> = {};
  const calculatedDetails: Record<string, QuestionScoreDetail> = {};

  (quiz.sections || []).forEach((sec) => {
    calculatedSummaries[sec.id] = {
      sectionId: sec.id,
      sectionName: sec.name,
      earnedMarks: 0,
      maxMarks: 0,
      correct: 0,
      wrong: 0,
      skipped: 0
    };
  });

  quiz.questions.forEach((q) => {
    const qSection = q.sectionId ? sectionMap.get(q.sectionId) : undefined;
    const isNegativeEnabled = qSection?.negativeMarkingEnabled ?? true;
    const penalty = isNegativeEnabled ? (qSection?.negativeMarking || 0) : 0;
    const qMarks = q.marks !== undefined ? Number(q.marks) : 10;
    const userAns = answers[q.id];

    const secSummary = q.sectionId ? calculatedSummaries[q.sectionId] : undefined;
    if (secSummary) {
      secSummary.maxMarks += qMarks;
    }

    let qEarned = 0;
    let qStatus: 'correct' | 'partial' | 'wrong' | 'skipped' = 'skipped';
    let blankFlags: boolean[] | undefined = undefined;

    if (q.type === 'multi_fib') {
      const correctList = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
      const studentList = Array.isArray(userAns) ? userAns : [];
      const blanksCount = correctList.length || 1;
      const markPerBlank = qMarks / blanksCount;

      let blanksMatched = 0;
      let attempted = false;
      blankFlags = [];

      correctList.forEach((corr, bIdx) => {
        const sVal = String(studentList[bIdx] || '').trim().toLowerCase();
        if (sVal.length > 0) attempted = true;
        const isMatched = sVal === String(corr).trim().toLowerCase();
        blankFlags!.push(isMatched);
        if (isMatched) blanksMatched++;
      });

      if (blanksMatched === blanksCount) {
        qEarned = qMarks;
        qStatus = 'correct';
        totalCorrect++;
        if (secSummary) secSummary.correct++;
      } else if (blanksMatched > 0) {
        qEarned = Number((blanksMatched * markPerBlank).toFixed(2));
        qStatus = 'partial';
        totalCorrect++;
        if (secSummary) secSummary.correct++;
      } else if (attempted) {
        qEarned = penalty > 0 ? -penalty : 0;
        qStatus = 'wrong';
        totalWrong++;
        if (secSummary) secSummary.wrong++;
      } else {
        qStatus = 'skipped';
        totalSkipped++;
        if (secSummary) secSummary.skipped++;
      }
    } else if (q.type === 'fib') {
      const studentText = String(userAns || '').trim().toLowerCase();
      const expectedText = String(q.correctAnswer || '').trim().toLowerCase();

      if (studentText.length > 0) {
        if (studentText === expectedText) {
          qEarned = qMarks;
          qStatus = 'correct';
          totalCorrect++;
          if (secSummary) secSummary.correct++;
        } else {
          qEarned = penalty > 0 ? -penalty : 0;
          qStatus = 'wrong';
          totalWrong++;
          if (secSummary) secSummary.wrong++;
        }
      } else {
        qStatus = 'skipped';
        totalSkipped++;
        if (secSummary) secSummary.skipped++;
      }
    } else {
      if (userAns !== undefined && userAns !== null) {
        if (Number(userAns) === Number(q.correctAnswer)) {
          qEarned = qMarks;
          qStatus = 'correct';
          totalCorrect++;
          if (secSummary) secSummary.correct++;
        } else {
          qEarned = penalty > 0 ? -penalty : 0;
          qStatus = 'wrong';
          totalWrong++;
          if (secSummary) secSummary.wrong++;
        }
      } else {
        qStatus = 'skipped';
        totalSkipped++;
        if (secSummary) secSummary.skipped++;
      }
    }

    totalScore += qEarned;
    if (secSummary) {
      secSummary.earnedMarks += qEarned;
    }

    calculatedDetails[q.id] = {
      questionId: q.id,
      earnedMarks: qEarned,
      maxMarks: qMarks,
      status: qStatus,
      blankResults: blankFlags
    };
  });

  return {
    score: Math.max(0, Number(totalScore.toFixed(2))),
    totalCorrect,
    totalWrong,
    totalSkipped,
    sectionSummaries: calculatedSummaries,
    questionDetails: calculatedDetails
  };
};

export const StudentPortal: React.FC<StudentPortalProps> = ({ 
  quizId: propQuizId, 
  quizIdFromUrl, 
  onExit, 
  isLight = false 
}) => {
  const [resolvedQuizId, setResolvedQuizId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''));
    return params.get('quiz') || params.get('quizId') || quizIdFromUrl || propQuizId || '';
  });

  const isAlreadyDisqualified = resolvedQuizId 
    ? localStorage.getItem(`quizguard_disqualified_${resolvedQuizId}`) === 'true' 
    : false;

  const getStoredSession = (): StoredExamSession | null => {
    if (!resolvedQuizId) return null;
    try {
      const raw = localStorage.getItem(`quizguard_session_${resolvedQuizId}`);
      if (raw) return JSON.parse(raw);
      const oldStart = localStorage.getItem(`quizguard_start_time_${resolvedQuizId}`);
      const oldPid = localStorage.getItem(`quizguard_pid_${resolvedQuizId}`);
      const oldName = localStorage.getItem(`quizguard_name_${resolvedQuizId}`);
      if (oldStart && oldPid) {
        return {
          participantId: oldPid,
          name: oldName || '',
          startedAt: Number(oldStart),
          totalDurationSeconds: 1200
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const initialSession = getStoredSession();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState<boolean>(true);

  const [name, setName] = useState<string>(() => {
    if (initialSession?.name) return initialSession.name;
    return resolvedQuizId ? (localStorage.getItem(`quizguard_name_${resolvedQuizId}`) || '') : '';
  });

  const [isJoined, setIsJoined] = useState<boolean>(() => {
    if (isAlreadyDisqualified) return true;
    return !!initialSession?.startedAt;
  });

  const [participantId, setParticipantId] = useState<string>(() => {
    if (initialSession?.participantId) return initialSession.participantId;
    const saved = resolvedQuizId ? localStorage.getItem(`quizguard_pid_${resolvedQuizId}`) : null;
    return saved || ('p_' + Math.random().toString(36).substring(2, 9));
  });

  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    if (!resolvedQuizId) return 0;
    const saved = localStorage.getItem(`quizguard_current_idx_${resolvedQuizId}`);
    return saved ? Number(saved) : 0;
  });

  const [isPaletteOpenMobile, setIsPaletteOpenMobile] = useState<boolean>(false);
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>('all');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'correct' | 'wrong' | 'skipped'>('all');
  
  const [liveProctorWarning, setLiveProctorWarning] = useState<string | null>(null);

  // 5-Second Stylish Thank You Screen States
  const [showThankYou, setShowThankYou] = useState<boolean>(false);
  const [thankYouCountdown, setThankYouCountdown] = useState<number>(5);

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

  const [visitedIndices, setVisitedIndices] = useState<Record<number, boolean>>(() => {
    if (!resolvedQuizId) return { 0: true };
    try {
      const saved = localStorage.getItem(`quizguard_visited_${resolvedQuizId}`);
      return saved ? JSON.parse(saved) : { 0: true };
    } catch (e) {
      return { 0: true };
    }
  });

  const [startedAtTimestamp, setStartedAtTimestamp] = useState<number | null>(() => initialSession?.startedAt || null);
  const [totalDurationSec, setTotalDurationSec] = useState<number>(() => initialSession?.totalDurationSeconds || 1200);

  const [totalSecondsLeft, setTotalSecondsLeft] = useState<number>(() => {
    if (!initialSession?.startedAt) return 1200;
    const elapsed = Math.floor((Date.now() - initialSession.startedAt) / 1000);
    return Math.max(0, (initialSession.totalDurationSeconds || 1200) - elapsed);
  });

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

  const [sectionSummaries, setSectionSummaries] = useState<Record<string, SectionSummary>>({});
  const [questionDetails, setQuestionDetails] = useState<Record<string, QuestionScoreDetail>>({});
  const [overallStats, setOverallStats] = useState<{ correct: number; wrong: number; skipped: number }>({ correct: 0, wrong: 0, skipped: 0 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search || (window.location.hash.includes('?') ? window.location.hash.split('?')[1] : ''));
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
    try {
      if (localStorage.getItem(`quizguard_disqualified_${id}`) === 'true') {
        setDisqualified(true);
        setIsFinished(true);
        setIsJoined(true);
        setStrikes(3);
      }

      let loaded: Quiz | null = null;
      const direct = localStorage.getItem(`quizguard_quiz_${id}`);
      if (direct) {
        try { loaded = JSON.parse(direct); } catch (e) {}
      }

      if (!loaded) {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('quizguard_host_quizzes_')) {
            try {
              const list: Quiz[] = JSON.parse(localStorage.getItem(key) || '[]');
              const found = list.find((q) => q.id === id);
              if (found) { loaded = found; break; }
            } catch (e) {}
          }
        }
      }

      if (!loaded) {
        loaded = await getSavedQuiz(id);
      }

      if (loaded) {
        loaded.questions = getOrSetRandomizedQuestions(loaded, id);
        setQuiz(loaded);

        if (loaded.pacingMode === 'ended' || (loaded as any).status === 'ended') {
          setIsAssessmentStopped(true);
        } else {
          setIsAssessmentStopped(false);
        }

        const quizDurationSec = (loaded.mode === 'marks_challenge' 
          ? (loaded.totalDurationMinutes || 20) 
          : (loaded.questions?.length || 20) * 1) * 60;

        setTotalDurationSec(quizDurationSec);

        const currentSession = getStoredSession();
        if (currentSession) {
          currentSession.totalDurationSeconds = quizDurationSec;
          localStorage.setItem(`quizguard_session_${id}`, JSON.stringify(currentSession));
        }
      }

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
            } else if (pData.status === 'Completed') {
              setIsFinished(true);
              setIsJoined(true);
              setScore(pData.score || 0);
              setTimeTaken(pData.time_taken || 0);
            }
          }
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error loading quiz:', err);
    } finally {
      setLoadingQuiz(false);
    }
  };

  // 5-Second Countdown trigger to stylish Thank You screen
  useEffect(() => {
    if (!isFinished || showThankYou) return;

    const timer = setInterval(() => {
      setThankYouCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setShowThankYou(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isFinished, showThankYou]);

  // Transmit live score updates to host in real-time
  const syncLiveProgress = (updatedAnswers: Record<string, any>) => {
    if (!quiz || !resolvedQuizId) return;

    const evalResult = evaluateQuizAnswers(quiz, updatedAnswers);
    const elapsed = startedAtTimestamp ? Math.max(0, Math.floor((Date.now() - startedAtTimestamp) / 1000)) : timeTaken;

    const liveParticipant: StudentResult = {
      id: participantId,
      name: name,
      score: evalResult.score,
      timeTakenSeconds: elapsed,
      strikes: strikes,
      status: 'Active',
      violations: violations,
      answers: updatedAnswers,
      reviewFlags: reviewFlags,
      sectionSummaries: evalResult.sectionSummaries,
      questionDetails: evalResult.questionDetails,
      totalCorrect: evalResult.totalCorrect,
      totalWrong: evalResult.totalWrong,
      totalSkipped: evalResult.totalSkipped,
      submittedAt: new Date().toLocaleTimeString()
    };

    // 1. Instant Broadcast to Host
    broadcastMessage({
      type: 'PARTICIPANT_LIVE_UPDATE' as any,
      quizId: resolvedQuizId,
      participant: liveParticipant
    });

    // 2. Local Storage Sync
    try {
      const qKey = `quizguard_quiz_${resolvedQuizId}`;
      const qRaw = localStorage.getItem(qKey);
      if (qRaw) {
        const qObj = JSON.parse(qRaw);
        if (!qObj.participants) qObj.participants = {};
        qObj.participants[participantId] = liveParticipant;
        localStorage.setItem(qKey, JSON.stringify(qObj));
      }

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('quizguard_host_quizzes_')) {
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          const idx = list.findIndex((item: any) => item.id === resolvedQuizId);
          if (idx >= 0) {
            if (!list[idx].participants) list[idx].participants = {};
            list[idx].participants[participantId] = liveParticipant;
            localStorage.setItem(key, JSON.stringify(list));
          }
        }
      }
    } catch (e) {}

    // 3. Supabase Live Sync (safe standard columns)
    if (supabase) {
      supabase.from('participants').upsert({
        id: participantId,
        quiz_id: resolvedQuizId,
        name: name,
        score: evalResult.score,
        time_taken: elapsed,
        strikes: strikes,
        status: 'Active',
        violations: violations,
        updated_at: new Date().toISOString()
      }).then(() => {});
    }
  };

  const handleRetakeExam = () => {
    if (!resolvedQuizId) return;
    localStorage.removeItem(`quizguard_session_${resolvedQuizId}`);
    localStorage.removeItem(`quizguard_answers_${resolvedQuizId}`);
    localStorage.removeItem(`quizguard_review_${resolvedQuizId}`);
    localStorage.removeItem(`quizguard_visited_${resolvedQuizId}`);
    localStorage.removeItem(`quizguard_start_time_${resolvedQuizId}`);
    localStorage.removeItem(`quizguard_pid_${resolvedQuizId}`);
    localStorage.removeItem(`quizguard_current_idx_${resolvedQuizId}`);
    localStorage.removeItem(`quizguard_student_q_${resolvedQuizId}`);

    const newPid = 'p_' + Math.random().toString(36).substring(2, 9);
    setParticipantId(newPid);
    setAnswers({});
    setReviewFlags({});
    setVisitedIndices({ 0: true });
    setCurrentIdx(0);
    setIsFinished(false);
    setShowThankYou(false);
    setThankYouCountdown(5);
    setIsJoined(false);
    setStartedAtTimestamp(null);
    setTotalSecondsLeft(totalDurationSec || 1200);
    setScore(0);
    hasAutoSubmitted.current = false;

    if (quiz) {
      const reshuffled = getOrSetRandomizedQuestions(quiz, resolvedQuizId);
      setQuiz({ ...quiz, questions: reshuffled });
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToMessages((msg: any) => {
      if (msg.type === 'STOP_QUIZ' && msg.quizId === resolvedQuizId) {
        setIsAssessmentStopped(true);
      }
      if (msg.type === 'RESUME_QUIZ' && msg.quizId === resolvedQuizId) {
        setIsAssessmentStopped(false);
      }
      if (msg.type === 'PROCTOR_WARNING' && msg.quizId === resolvedQuizId && (msg.targetParticipantId === participantId || !msg.targetParticipantId)) {
        setLiveProctorWarning(msg.message || 'Direct Notice from Proctor: Maintain assessment focus.');
      }
      if (msg.type === 'PROCTOR_STRIKE_ADJUST' && msg.quizId === resolvedQuizId && msg.targetParticipantId === participantId) {
        if (typeof msg.newStrikes === 'number') {
          setStrikes(msg.newStrikes);
          if (msg.newStrikes >= 3) {
            setDisqualified(true);
            setIsFinished(true);
          } else {
            setDisqualified(false);
          }
        }
      }
    });
    return () => unsubscribe();
  }, [resolvedQuizId, participantId]);

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
      try {
        await supabase.from('participants').upsert({
          id: participantId,
          quiz_id: resolvedQuizId,
          name: name,
          strikes: newStrikes,
          status: isDisq ? 'Disqualified' : 'Active',
          violations: updatedViolations,
          updated_at: new Date().toISOString()
        });
      } catch (e) {}
    }

    broadcastMessage({
      type: 'PARTICIPANT_INCIDENT' as any,
      quizId: resolvedQuizId,
      participantId,
      name,
      reason,
      strikes: newStrikes
    });
  };

  useEffect(() => {
    if (!isJoined || isFinished || disqualified || isAssessmentStopped || !startedAtTimestamp) return;

    const computeTime = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - startedAtTimestamp) / 1000));
      const remaining = Math.max(0, totalDurationSec - elapsed);
      setTotalSecondsLeft(remaining);
      setTimeTaken(elapsed);

      if (remaining <= 0 && !hasAutoSubmitted.current) {
        hasAutoSubmitted.current = true;
        setIsAutoSubmitting(true);
        setTimeout(() => {
          handleSubmit(true);
        }, 1000);
      }
    };

    computeTime();
    const interval = setInterval(computeTime, 1000);
    return () => clearInterval(interval);
  }, [isJoined, isFinished, disqualified, isAssessmentStopped, startedAtTimestamp, totalDurationSec]);

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

    const existing = getStoredSession();
    const startMs = existing?.startedAt || Date.now();
    const durationSec = totalDurationSec || 1200;

    const newSession: StoredExamSession = {
      participantId,
      name,
      startedAt: startMs,
      totalDurationSeconds: durationSec
    };

    localStorage.setItem(`quizguard_session_${resolvedQuizId}`, JSON.stringify(newSession));
    localStorage.setItem(`quizguard_pid_${resolvedQuizId}`, participantId);
    localStorage.setItem(`quizguard_name_${resolvedQuizId}`, name);
    localStorage.setItem(`quizguard_start_time_${resolvedQuizId}`, String(startMs));

    setStartedAtTimestamp(startMs);
    setIsJoined(true);

    if (supabase && resolvedQuizId) {
      try {
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
      } catch (e) {}
    }
  };

  const handleSelectOption = (qId: string, optIdx: number) => {
    if (isAssessmentStopped || isAutoSubmitting) return;
    const updated = { ...answers, [qId]: optIdx };
    setAnswers(updated);
    localStorage.setItem(`quizguard_answers_${resolvedQuizId}`, JSON.stringify(updated));
    syncLiveProgress(updated);
  };

  const handleTextAnswer = (qId: string, val: string) => {
    if (isAssessmentStopped || isAutoSubmitting) return;
    const updated = { ...answers, [qId]: val };
    setAnswers(updated);
    localStorage.setItem(`quizguard_answers_${resolvedQuizId}`, JSON.stringify(updated));
    syncLiveProgress(updated);
  };

  const handleMultiBlankAnswer = (qId: string, blankIdx: number, val: string) => {
    if (isAssessmentStopped || isAutoSubmitting) return;
    const currentList = Array.isArray(answers[qId]) ? [...answers[qId]] : [];
    currentList[blankIdx] = val;
    const updated = { ...answers, [qId]: currentList };
    setAnswers(updated);
    localStorage.setItem(`quizguard_answers_${resolvedQuizId}`, JSON.stringify(updated));
    syncLiveProgress(updated);
  };

  const handleClearResponse = (qId: string) => {
    if (isAutoSubmitting) return;
    const updated = { ...answers };
    delete updated[qId];
    setAnswers(updated);
    localStorage.setItem(`quizguard_answers_${resolvedQuizId}`, JSON.stringify(updated));
    syncLiveProgress(updated);
  };

  const toggleReviewFlag = (qId: string) => {
    if (isAutoSubmitting) return;
    const updated = { ...reviewFlags, [qId]: !reviewFlags[qId] };
    setReviewFlags(updated);
    localStorage.setItem(`quizguard_review_${resolvedQuizId}`, JSON.stringify(updated));
  };

  const navigateTo = (index: number) => {
    if (isAutoSubmitting || !quiz) return;
    setCurrentIdx(index);
    localStorage.setItem(`quizguard_current_idx_${resolvedQuizId}`, String(index));

    const updatedVisited = { ...visitedIndices, [index]: true };
    setVisitedIndices(updatedVisited);
    localStorage.setItem(`quizguard_visited_${resolvedQuizId}`, JSON.stringify(updatedVisited));

    if (isPaletteOpenMobile) setIsPaletteOpenMobile(false);
  };

  const handleMarkReviewAndNext = (qId: string) => {
    toggleReviewFlag(qId);
    if (quiz && currentIdx < quiz.questions.length - 1) {
      navigateTo(currentIdx + 1);
    }
  };

  const handleSubmit = async (forced = false) => {
    if (!quiz || isAssessmentStopped) return;
    setShowSubmitModal(false);

    const evalResult = evaluateQuizAnswers(quiz, answers);
    setScore(evalResult.score);
    setSectionSummaries(evalResult.sectionSummaries);
    setQuestionDetails(evalResult.questionDetails);
    setOverallStats({ 
      correct: evalResult.totalCorrect, 
      wrong: evalResult.totalWrong, 
      skipped: evalResult.totalSkipped 
    });

    setIsFinished(true);
    setThankYouCountdown(5);
    setIsAutoSubmitting(false);

    const studentResultObj: StudentResult = {
      id: participantId,
      name: name,
      score: evalResult.score,
      timeTakenSeconds: timeTaken,
      strikes: strikes,
      status: disqualified ? 'Disqualified' : 'Completed',
      violations: violations,
      answers: answers,
      reviewFlags: reviewFlags,
      sectionSummaries: evalResult.sectionSummaries,
      questionDetails: evalResult.questionDetails,
      totalCorrect: evalResult.totalCorrect,
      totalWrong: evalResult.totalWrong,
      totalSkipped: evalResult.totalSkipped,
      submittedAt: new Date().toLocaleTimeString()
    };

    // 1. Instant Broadcast to Host
    broadcastMessage({
      type: 'PARTICIPANT_SUBMITTED' as any,
      quizId: resolvedQuizId,
      participant: studentResultObj
    });

    // 2. Instant Local Storage Update
    try {
      const qKey = `quizguard_quiz_${resolvedQuizId}`;
      const qRaw = localStorage.getItem(qKey);
      if (qRaw) {
        const qObj = JSON.parse(qRaw);
        if (!qObj.participants) qObj.participants = {};
        qObj.participants[participantId] = studentResultObj;
        localStorage.setItem(qKey, JSON.stringify(qObj));
      }

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('quizguard_host_quizzes_')) {
          const list = JSON.parse(localStorage.getItem(key) || '[]');
          const idx = list.findIndex((item: any) => item.id === resolvedQuizId);
          if (idx >= 0) {
            if (!list[idx].participants) list[idx].participants = {};
            list[idx].participants[participantId] = studentResultObj;
            localStorage.setItem(key, JSON.stringify(list));
          }
        }
      }
    } catch (e) {}

    // 3. Supabase Safe Upsert
    if (supabase && resolvedQuizId) {
      try {
        await supabase.from('participants').upsert({
          id: participantId,
          quiz_id: resolvedQuizId,
          name: name,
          score: evalResult.score,
          time_taken: timeTaken,
          strikes: strikes,
          status: disqualified ? 'Disqualified' : 'Completed',
          violations: violations,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('Supabase submission sync error:', err);
      }
    }
  };

  const handlePrintScorecard = () => {
    window.print();
  };

  const cardCls = isLight 
    ? 'bg-white border-slate-200 text-slate-900 shadow-sm' 
    : 'bg-slate-900 border-slate-800 text-white shadow-xl';

  const subCardCls = isLight 
    ? 'bg-slate-50 border-slate-200 text-slate-900' 
    : 'bg-slate-950 border-slate-800 text-white';

  const inputCls = isLight 
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600' 
    : 'bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-500';

  const textMuted = isLight ? 'text-slate-500' : 'text-slate-400';
  const textPrimary = isLight ? 'text-slate-900' : 'text-white';
  const buttonSecCls = isLight 
    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300' 
    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700';

  if (loadingQuiz) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <div className={`w-12 h-12 border-4 rounded-full animate-spin mb-4 ${isLight ? 'border-blue-600 border-t-transparent' : 'border-cyan-500 border-t-transparent'}`} />
        <p className={`font-medium ${textMuted}`}>Connecting to examination canvas...</p>
      </div>
    );
  }

  if (disqualified) {
    return (
      <div className={`max-w-lg mx-auto my-12 p-8 border rounded-3xl text-center shadow-2xl ${
        isLight ? 'bg-white border-rose-200' : 'bg-slate-900 border-rose-500/30'
      }`}>
        <div className={`p-3 rounded-2xl w-fit mx-auto mb-4 border ${isLight ? 'bg-rose-50 border-rose-200' : 'bg-rose-500/10 border-rose-500/20'}`}>
          <ShieldAlert className={`w-12 h-12 ${isLight ? 'text-rose-600' : 'text-rose-500'}`} />
        </div>
        <h2 className={`text-2xl font-black mb-2 ${isLight ? 'text-rose-600' : 'text-rose-400'}`}>Session Disqualified</h2>
        <p className={`text-xs mb-6 leading-relaxed ${textMuted}`}>
          This session exceeded the maximum integrity threshold (3 strikes). Your examination has been locked.
        </p>
        <div className={`p-4 rounded-2xl border text-left space-y-2 text-xs font-mono max-h-48 overflow-y-auto ${subCardCls}`}>
          <span className={`block font-bold mb-1 ${textMuted}`}>Recorded Proctor Violations:</span>
          {violations.map((v, i) => (
            <div key={i} className={isLight ? 'text-rose-600' : 'text-rose-400'}>• [{v.timestamp}] {v.message}</div>
          ))}
        </div>
      </div>
    );
  }

  if (isAssessmentStopped) {
    return (
      <div className={`max-w-md mx-auto my-12 p-8 border rounded-3xl text-center shadow-2xl ${cardCls}`}>
        <div className={`p-3 rounded-2xl w-fit mx-auto mb-4 border ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/20'}`}>
          <AlertOctagon className={`w-12 h-12 text-red-600` } />
        </div>
        <h2 className="text-2xl font-bold mb-2">Examination Concluded</h2>
        <p className={`text-xs mb-6 leading-relaxed ${textMuted}`}>
          This assessment has been paused or concluded by the proctor. Please wait if the session is resumed.
        </p>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className={`max-w-md mx-auto my-12 p-8 border rounded-2xl text-center shadow-xl ${cardCls}`}>
        <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Assessment Not Found</h2>
        <p className={`text-xs mb-6 ${textMuted}`}>
          The assessment URL or ID is invalid. Verify the link from your instructor.
        </p>
        <button
          onClick={() => window.location.href = window.location.origin + window.location.pathname}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold transition text-white ${
            isLight ? 'bg-blue-700 hover:bg-blue-800' : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          Return to Portal
        </button>
      </div>
    );
  }

  // Stylish Thank You Celebration Card after 5 Seconds
  if (isFinished && showThankYou) {
    const totalMax = quiz.questions.reduce((sum, q) => sum + (q.marks || 10), 0);

    return (
      <div className="max-w-xl mx-auto my-12 p-8 sm:p-12 border rounded-3xl text-center shadow-2xl space-y-6 animate-fade-in relative overflow-hidden transition-colors"
        style={{
          background: isLight 
            ? 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' 
            : 'linear-gradient(135deg, #0f172a 0%, #020617 100%)',
          borderColor: isLight ? '#cbd5e1' : '#1e293b'
        }}
      >
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 animate-bounce">
          <Sparkles className="w-10 h-10" />
        </div>

        <div>
          <span className="text-xs font-mono font-bold tracking-widest uppercase text-emerald-500 block mb-2">
            Assessment Completed
          </span>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 mb-2">
            THANK YOU!
          </h1>
          <p className={`text-sm ${textMuted}`}>
            Your answers have been securely evaluated and submitted to your institution.
          </p>
        </div>

        <div className={`p-6 rounded-2xl border text-center space-y-2 ${subCardCls}`}>
          <div className="flex justify-between items-center text-xs font-mono pb-2 border-b border-slate-700/40">
            <span className={textMuted}>Candidate:</span>
            <strong className={textPrimary}>{name}</strong>
          </div>
          <div className="flex justify-between items-center text-xs font-mono pb-2 border-b border-slate-700/40">
            <span className={textMuted}>Total Evaluation Score:</span>
            <strong className={`text-base ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>{score} / {totalMax} pts</strong>
          </div>
          <div className="flex justify-between items-center text-xs font-mono">
            <span className={textMuted}>Completion Time:</span>
            <strong className={textPrimary}>{Math.floor(timeTaken / 60)}m {timeTaken % 60}s</strong>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            onClick={() => setShowThankYou(false)}
            className={`w-full py-3 rounded-xl text-xs font-bold border transition ${buttonSecCls}`}
          >
            Review Detailed Answer Key
          </button>
          <button
            onClick={handleRetakeExam}
            className={`w-full py-3 text-white font-bold rounded-xl text-xs transition ${
              isLight ? 'bg-blue-700 hover:bg-blue-800' : 'bg-cyan-600 hover:bg-cyan-500'
            }`}
          >
            Retake Exam (Test Mode)
          </button>
        </div>
      </div>
    );
  }

  // Initial 5-Second Scorecard Screen
  if (isFinished) {
    const totalMax = quiz.questions.reduce((sum, q) => sum + (q.marks || 10), 0);
    const percentage = totalMax > 0 ? ((score / totalMax) * 100).toFixed(1) : '0';

    return (
      <div className="max-w-4xl mx-auto my-8 space-y-8 animate-fade-in print:my-0 print:space-y-4">
        {/* 5-Second Progress Notice Bar */}
        <div className="p-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-2xl text-center text-xs font-bold font-mono flex items-center justify-center gap-2 shadow-md">
          <Sparkles className="w-4 h-4 animate-spin" />
          <span>Showing results... Transitioning to Thank You screen in {thankYouCountdown}s</span>
          <button 
            onClick={() => setShowThankYou(true)}
            className="underline ml-2 text-white/90 hover:text-white"
          >
            Skip now →
          </button>
        </div>

        <div className={`p-8 border rounded-3xl text-center shadow-2xl space-y-6 ${cardCls} print:shadow-none print:border-black print:p-4`}>
          <div className="flex justify-between items-center print:hidden">
            <span className={`text-xs font-mono uppercase font-bold tracking-widest ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
              Academic Evaluation Statement
            </span>
            <button
              onClick={handlePrintScorecard}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${buttonSecCls}`}
              title="Print or Save as PDF"
            >
              <Printer className="w-4 h-4 text-emerald-600" /> Print / Save PDF
            </button>
          </div>

          <div className={`inline-block p-4 rounded-3xl border print:hidden ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20'}`}>
            <Trophy className={`w-14 h-14 ${isLight ? 'text-amber-500' : 'text-amber-400'}`} />
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-black">{quiz.title}</h2>
            <p className={`text-xs mt-1 font-mono ${textMuted}`}>
              Candidate: <strong className={isLight ? 'text-blue-700' : 'text-cyan-300'}>{name}</strong> • Time Taken: {Math.floor(timeTaken / 60)}m {timeTaken % 60}s • ID: {participantId}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            <div className={`p-4 rounded-2xl border text-center ${subCardCls}`}>
              <span className={`text-[10px] uppercase font-mono block mb-1 ${textMuted}`}>Final Score</span>
              <span className={`text-2xl sm:text-3xl font-black ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>{score}</span>
              <span className={`text-xs block ${textMuted}`}>/ {totalMax} pts</span>
            </div>
            <div className={`p-4 rounded-2xl border text-center ${subCardCls}`}>
              <span className={`text-[10px] uppercase font-mono block mb-1 ${textMuted}`}>Percentage</span>
              <span className="text-2xl sm:text-3xl font-black text-purple-600">{percentage}%</span>
              <span className={`text-xs block ${textMuted}`}>Total Share</span>
            </div>
            <div className={`p-4 rounded-2xl border text-center ${subCardCls}`}>
              <span className={`text-[10px] uppercase font-mono block mb-1 ${textMuted}`}>Correct</span>
              <span className="text-2xl sm:text-3xl font-black text-emerald-600">{overallStats.correct}</span>
              <span className={`text-xs block ${textMuted}`}>Questions</span>
            </div>
            <div className={`p-4 rounded-2xl border text-center ${subCardCls}`}>
              <span className={`text-[10px] uppercase font-mono block mb-1 ${textMuted}`}>Penalized / Skipped</span>
              <span className="text-2xl sm:text-3xl font-black text-rose-600">{overallStats.wrong}</span>
              <span className={`text-xs block ${textMuted}`}>/ {overallStats.skipped} skipped</span>
            </div>
          </div>
        </div>

        {Object.keys(sectionSummaries).length > 0 && (
          <div className={`p-6 rounded-3xl border space-y-4 shadow-xl ${cardCls} print:shadow-none print:border-black`}>
            <h3 className="text-base font-bold flex items-center gap-2">
              <BarChart3 className={`w-5 h-5 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Section-Wise Performance Card
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.values(sectionSummaries).map((sec) => (
                <div key={sec.sectionId} className={`p-4 rounded-2xl border space-y-2 ${subCardCls}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold">{sec.sectionName}</span>
                    <span className={`text-xs font-mono font-bold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                      {Math.max(0, sec.earnedMarks).toFixed(1)} / {sec.maxMarks}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 pt-1 text-[11px] font-mono text-center">
                    <div className={`p-1 rounded border ${isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-emerald-950/40 text-emerald-300 border-emerald-900/40'}`}>
                      ✓ {sec.correct}
                    </div>
                    <div className={`p-1 rounded border ${isLight ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-rose-950/40 text-rose-300 border-rose-900/40'}`}>
                      ✗ {sec.wrong}
                    </div>
                    <div className={`p-1 rounded border ${buttonSecCls}`}>
                      — {sec.skipped}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Join Exam Screen
  if (!isJoined) {
    return (
      <div className={`max-w-md mx-auto my-8 p-6 sm:p-8 border rounded-3xl shadow-2xl transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-900 shadow-xl' : 'bg-slate-900 border-slate-800 text-white'
      }`}>
        <h2 className="text-xl font-bold mb-2">{quiz.title}</h2>
        <span className={`text-xs font-mono block mb-4 ${isLight ? 'text-blue-700 font-bold' : 'text-cyan-400'}`}>
          {quiz.mode === 'marks_challenge' ? `Marks Challenge • ${quiz.totalDurationMinutes || 20} Minutes Total` : 'Classic Proctored Assessment'}
        </span>

        <div className={`p-4 rounded-xl mb-6 text-left border ${
          isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/20 text-amber-200/80'
        }`}>
          <div className={`flex items-center gap-2 font-semibold text-xs mb-2 ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
            <AlertTriangle className="w-4 h-4" /> Examination Rules
          </div>
          <ul className="text-xs space-y-1 list-disc list-inside">
            <li>Questions and multiple-choice options are randomized per student.</li>
            <li>Negative marking applies according to section rules.</li>
            <li>Multi-blank questions award pro-rated partial marks.</li>
            <li>Tab switching or exiting fullscreen logs proctor strikes (3 strikes = Disqualification).</li>
          </ul>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className={`block text-xs font-medium mb-1 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              Candidate / Team Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none transition ${inputCls}`}
            />
          </div>

          <button
            type="submit"
            className={`w-full py-3 text-white rounded-xl font-medium text-sm transition flex items-center justify-center gap-2 ${
              isLight 
                ? 'bg-blue-700 hover:bg-blue-800 shadow-sm' 
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 shadow-lg shadow-cyan-600/20'
            }`}
          >
            <Maximize className="w-4 h-4" /> Enter Fullscreen & Start Exam
          </button>
        </form>
      </div>
    );
  }

  const currentQ = quiz.questions[currentIdx] || quiz.questions[0];
  const sectionMap = new Map((quiz.sections || []).map((s) => [s.id, s]));
  const currentSec = currentQ?.sectionId ? sectionMap.get(currentQ.sectionId) : undefined;

  const isQuestionAnswered = (q: Question) => {
    const val = answers[q.id];
    return val !== undefined && val !== null && (
      Array.isArray(val) ? val.some((v: string) => v && v.trim().length > 0) : String(val).trim().length > 0
    );
  };

  const getQuestionStatus = (q: Question, idx: number) => {
    const isAns = isQuestionAnswered(q);
    const isFlagged = !!reviewFlags[q.id];
    const isVisited = !!visitedIndices[idx];

    if (isAns && isFlagged) return 'answered_review';
    if (isFlagged) return 'review';
    if (isAns) return 'answered';
    if (isVisited) return 'skipped';
    return 'not_visited';
  };

  const answeredQuestions = quiz.questions.filter(isQuestionAnswered);
  const answeredCount = answeredQuestions.length;
  const unansweredCount = quiz.questions.length - answeredCount;
  const flaggedCount = Object.values(reviewFlags).filter(Boolean).length;
  const notVisitedCount = quiz.questions.filter((_, idx) => !visitedIndices[idx]).length;

  const isTimerCritical = totalSecondsLeft <= 60;
  const isTimerWarning = totalSecondsLeft <= 300 && totalSecondsLeft > 60;

  const groupedSections: Record<string, { section?: QuizSection; questions: Array<{ q: Question; originalIdx: number }> }> = {};

  if (quiz.sections && quiz.sections.length > 0) {
    quiz.sections.forEach((sec) => {
      groupedSections[sec.id] = { section: sec, questions: [] };
    });
    quiz.questions.forEach((q, idx) => {
      const sId = q.sectionId || quiz.sections![0].id;
      if (!groupedSections[sId]) groupedSections[sId] = { questions: [] };
      groupedSections[sId].questions.push({ q, originalIdx: idx });
    });
  } else {
    groupedSections['default'] = {
      questions: quiz.questions.map((q, idx) => ({ q, originalIdx: idx }))
    };
  }

  return (
    <div className="max-w-7xl mx-auto my-4 space-y-5 relative animate-fade-in">
      {liveProctorWarning && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full px-4 animate-bounce">
          <div className="bg-rose-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3 border border-rose-400">
            <div className="flex items-center gap-2.5">
              <BellRing className="w-5 h-5 shrink-0" />
              <div className="text-xs font-bold leading-tight">
                <span className="block uppercase text-[10px] tracking-wider text-rose-200">Official Proctor Alert:</span>
                {liveProctorWarning}
              </div>
            </div>
            <button
              onClick={() => setLiveProctorWarning(null)}
              className="text-white hover:text-rose-200 text-xs px-2 py-1 bg-rose-700 rounded-lg shrink-0"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {isAutoSubmitting && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6 text-center">
          <div className="p-4 bg-rose-500/10 rounded-3xl border border-rose-500/30 mb-4 animate-bounce">
            <Clock className="w-12 h-12 text-rose-500" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Time Expired!</h2>
          <p className="text-slate-400 text-sm max-w-sm mb-6">
            The exam timer has reached zero. Evaluating responses...
          </p>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold">
            <Loader2 className="w-4 h-4 animate-spin" /> Recording final evaluation...
          </div>
        </div>
      )}

      {/* Top Status Bar */}
      <div className={`flex flex-wrap items-center justify-between p-4 rounded-3xl border gap-4 ${
        isLight ? 'bg-white border-slate-200 text-slate-900 shadow-sm' : 'bg-slate-900 border-slate-800 text-white'
      }`}>
        <div>
          <h2 className="text-base font-bold">{quiz.title}</h2>
          <span className={`text-xs font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Candidate: <strong className={isLight ? 'text-blue-700' : 'text-cyan-300'}>{name}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border font-mono text-sm font-bold transition-colors ${
            isTimerCritical 
              ? (isLight ? 'bg-rose-50 border-rose-400 text-rose-600 animate-pulse' : 'bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse ring-2 ring-rose-500/30')
              : isTimerWarning
              ? (isLight ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-amber-500/20 border-amber-500/40 text-amber-400')
              : (isLight ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-slate-950 border-slate-800 text-cyan-400')
          }`}>
            <Clock className={`w-4 h-4 ${isTimerCritical ? 'animate-spin' : ''}`} />
            <span>
              {Math.floor(totalSecondsLeft / 60).toString().padStart(2, '0')}:{(totalSecondsLeft % 60).toString().padStart(2, '0')}
            </span>
          </div>

          <div className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold ${
            strikes > 0 
              ? (isLight ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-rose-500/20 text-rose-400') 
              : (isLight ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-emerald-500/20 text-emerald-400')
          }`}>
            {strikes}/3 Strikes
          </div>

          <button
            onClick={() => setIsPaletteOpenMobile(!isPaletteOpenMobile)}
            className={`lg:hidden p-2.5 rounded-xl border transition ${buttonSecCls}`}
            title="Toggle Question Palette"
          >
            {isPaletteOpenMobile ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setShowSubmitModal(true)}
            className={`px-4 py-2 font-bold rounded-xl text-xs transition text-white ${
              isLight ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            Submit Quiz
          </button>
        </div>
      </div>

      {/* Section Quick Jump Tabs */}
      {quiz.sections && quiz.sections.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveSectionFilter('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeSectionFilter === 'all'
                ? (isLight ? 'bg-blue-700 text-white shadow-sm' : 'bg-cyan-600 text-white shadow-md')
                : (isLight ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white')
            }`}
          >
            All Sections ({quiz.questions.length}Q)
          </button>
          {quiz.sections.map((sec) => {
            const secQuestions = quiz.questions.filter((q) => q.sectionId === sec.id);
            const firstIdx = quiz.questions.findIndex((q) => q.sectionId === sec.id);
            const secAnswered = secQuestions.filter(isQuestionAnswered).length;

            return (
              <button
                key={sec.id}
                onClick={() => {
                  setActiveSectionFilter(sec.id);
                  if (firstIdx !== -1) navigateTo(firstIdx);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-2 ${
                  activeSectionFilter === sec.id || currentQ?.sectionId === sec.id
                    ? (isLight ? 'bg-blue-700 text-white shadow-sm' : 'bg-cyan-600 text-white shadow-md')
                    : (isLight ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white')
                }`}
              >
                <span>{sec.name}</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                  activeSectionFilter === sec.id 
                    ? 'bg-black/20 text-white' 
                    : (isLight ? 'bg-slate-100 text-slate-700' : 'bg-black/40 text-slate-300')
                }`}>
                  {secAnswered}/{secQuestions.length} Done
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Examination Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className={`p-6 sm:p-8 rounded-3xl border space-y-6 ${
            isLight ? 'bg-white border-slate-200 text-slate-900 shadow-sm' : 'bg-slate-900 border-slate-800 text-white shadow-xl'
          }`}>
            <div className={`flex flex-wrap items-center justify-between gap-3 border-b pb-4 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-xs font-bold font-mono uppercase tracking-wider ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                  Question {currentIdx + 1} of {quiz.questions.length}
                </span>
                {currentSec && (
                  <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                    isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-cyan-950 text-cyan-300 border-cyan-800'
                  }`}>
                    {currentSec.name}
                  </span>
                )}
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                  isLight ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}>
                  +{currentQ?.marks || 10} Marks
                </span>
                {currentSec && currentSec.negativeMarkingEnabled && currentSec.negativeMarking > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                    isLight ? 'bg-rose-50 text-rose-600 border-rose-200' : 'text-rose-400 bg-rose-950/40 border-rose-900/40'
                  }`}>
                    (-{currentSec.negativeMarking} on Wrong)
                  </span>
                )}
              </div>

              <button
                onClick={() => handleClearResponse(currentQ.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                  isLight ? 'bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border-slate-200' : 'bg-slate-800 hover:bg-rose-950/40 border-slate-700 hover:border-rose-500/40 text-slate-400 hover:text-rose-300'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Clear Response
              </button>
            </div>

            <h2 className="text-lg font-semibold leading-relaxed">{currentQ?.text}</h2>

            {currentQ?.type === 'multi_fib' ? (
              <div className={`p-5 rounded-2xl border space-y-4 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <div className="flex justify-between items-center text-xs">
                  <span className={`font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Fill in all blanks (Partial marks awarded):</span>
                  <span className={`font-mono font-bold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                    +{((currentQ?.marks || 10) / (Array.isArray(currentQ?.correctAnswer) ? currentQ.correctAnswer.length : 1)).toFixed(2)} pts/blank
                  </span>
                </div>
                {(Array.isArray(currentQ?.correctAnswer) ? currentQ.correctAnswer : ['', '']).map((_, bIdx) => (
                  <div key={bIdx} className="space-y-1">
                    <label className={`text-xs font-mono font-bold flex items-center gap-1.5 ${isLight ? 'text-blue-800' : 'text-cyan-400'}`}>
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] border ${
                        isLight ? 'bg-blue-100 text-blue-700 border-blue-300' : 'bg-cyan-900 text-cyan-300 border-cyan-700'
                      }`}>
                        {bIdx + 1}
                      </span>
                      Blank {bIdx + 1}:
                    </label>
                    <input
                      type="text"
                      disabled={isAutoSubmitting}
                      placeholder={`Enter answer for Blank ${bIdx + 1}...`}
                      value={(answers[currentQ.id]?.[bIdx] as string) || ''}
                      onChange={(e) => handleMultiBlankAnswer(currentQ.id, bIdx, e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none ${inputCls}`}
                    />
                  </div>
                ))}
              </div>
            ) : currentQ?.type === 'fib' ? (
              <div className={`p-5 rounded-2xl border space-y-2 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}>
                <label className={`text-xs font-medium block ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Your Answer:</label>
                <input
                  type="text"
                  disabled={isAutoSubmitting}
                  placeholder="Type your response here..."
                  value={(answers[currentQ.id] as string) || ''}
                  onChange={(e) => handleTextAnswer(currentQ.id, e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl border text-sm font-medium focus:outline-none ${inputCls}`}
                />
              </div>
            ) : (
              <div className="space-y-3">
                {(currentQ?.options || []).map((opt, oIdx) => {
                  const isSelected = answers[currentQ.id] === oIdx;
                  return (
                    <button
                      key={oIdx}
                      disabled={isAutoSubmitting}
                      onClick={() => handleSelectOption(currentQ.id, oIdx)}
                      className={`w-full text-left p-4 rounded-2xl border text-sm font-medium transition flex items-center justify-between ${
                        isSelected
                          ? (isLight 
                              ? 'bg-blue-50 border-blue-600 text-blue-950 ring-2 ring-blue-500/20 font-bold' 
                              : 'bg-cyan-600/20 border-cyan-500 text-white shadow-sm shadow-cyan-600/20')
                          : (isLight 
                              ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800' 
                              : 'bg-slate-800/60 hover:border-slate-600 border-slate-700/60 text-slate-300')
                      }`}
                    >
                      <span>{opt}</span>
                      {isSelected && <CheckCircle className={`w-4 h-4 shrink-0 ml-2 ${isLight ? 'text-blue-600' : 'text-cyan-400'}`} />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bottom Navigation Toolbar */}
            <div className={`flex flex-wrap items-center justify-between gap-3 pt-5 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateTo(Math.max(0, currentIdx - 1))}
                  disabled={currentIdx === 0 || isAutoSubmitting}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-30 border ${buttonSecCls}`}
                >
                  <ArrowLeft className="w-4 h-4" /> Previous
                </button>

                <button
                  onClick={() => handleMarkReviewAndNext(currentQ.id)}
                  disabled={isAutoSubmitting}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
                    reviewFlags[currentQ.id]
                      ? (isLight ? 'bg-purple-50 border-purple-400 text-purple-700' : 'bg-purple-600/30 border-purple-500 text-purple-300')
                      : buttonSecCls
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" />
                  {reviewFlags[currentQ.id] ? 'Unmark & Next' : 'Mark Review & Next'}
                </button>
              </div>

              <button
                onClick={() => navigateTo(Math.min(quiz.questions.length - 1, currentIdx + 1))}
                disabled={currentIdx === quiz.questions.length - 1 || isAutoSubmitting}
                className={`flex items-center gap-1.5 px-6 py-2.5 text-white rounded-xl text-xs font-bold transition disabled:opacity-30 ${
                  isLight ? 'bg-blue-700 hover:bg-blue-800 shadow-sm' : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 shadow-md shadow-cyan-600/20'
                }`}
              >
                Save & Next <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Palette */}
        <div className={`space-y-5 ${isPaletteOpenMobile ? 'block' : 'hidden lg:block'}`}>
          <div className={`p-6 rounded-3xl border space-y-5 ${cardCls}`}>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Bookmark className={`w-4 h-4 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Question Palette
            </h3>

            <div className={`grid grid-cols-2 gap-2 text-[10px] font-mono border-b pb-4 ${
              isLight ? 'border-slate-200 text-slate-600' : 'border-slate-800 text-slate-400'
            }`}>
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
                <span className={`w-3 h-3 rounded border ${
                  isLight ? 'bg-slate-100 border-slate-300' : 'bg-slate-800 border-slate-700'
                }`}></span> Not Visited ({notVisitedCount})
              </div>
            </div>

            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {Object.entries(groupedSections).map(([secId, group]) => {
                if (group.questions.length === 0) return null;
                if (activeSectionFilter !== 'all' && secId !== activeSectionFilter) return null;

                const secAnswered = group.questions.filter(({ q }) => isQuestionAnswered(q)).length;

                return (
                  <div key={secId} className={`p-3 rounded-2xl border space-y-2 ${subCardCls}`}>
                    <div className="flex justify-between items-center text-[11px] font-mono font-bold">
                      <span className={isLight ? 'text-blue-800' : 'text-cyan-400'}>{group.section ? group.section.name : 'Questions'}</span>
                      <span className={textMuted}>{secAnswered}/{group.questions.length} Attempted</span>
                    </div>

                    <div className="grid grid-cols-5 gap-2 pt-1">
                      {group.questions.map(({ q, originalIdx }) => {
                        const status = getQuestionStatus(q, originalIdx);
                        const isCurrent = currentIdx === originalIdx;

                        let badgeColor = isLight 
                          ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' 
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500';

                        if (status === 'answered') badgeColor = 'bg-emerald-600 text-white border-emerald-500 shadow-sm';
                        else if (status === 'review') badgeColor = 'bg-purple-600 text-white border-purple-500 shadow-sm';
                        else if (status === 'answered_review') badgeColor = 'bg-purple-600 text-white border-purple-500 ring-2 ring-emerald-400';
                        else if (status === 'skipped') badgeColor = 'bg-amber-600 text-white border-amber-500';

                        return (
                          <button
                            key={q.id}
                            disabled={isAutoSubmitting}
                            onClick={() => navigateTo(originalIdx)}
                            className={`h-10 rounded-xl border text-xs font-mono font-bold transition flex items-center justify-center relative ${badgeColor} ${
                              isCurrent ? (isLight ? 'ring-2 ring-blue-600 ring-offset-2 ring-offset-white scale-105' : 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900 scale-105') : ''
                            }`}
                          >
                            {originalIdx + 1}
                            {status === 'answered_review' && (
                              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-300 ring-1 ring-black"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Pre-Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className={`max-w-lg w-full border p-6 sm:p-8 rounded-3xl space-y-6 shadow-2xl ${cardCls}`}>
            <div className="text-center space-y-1">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-2 border ${
                isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20'
              }`}>
                <AlertCircle className={`w-6 h-6 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
              </div>
              <h3 className="text-xl font-bold">Confirm Examination Submission</h3>
              <p className={`text-xs ${textMuted}`}>
                Please review your question attempts before confirming final submission.
              </p>
            </div>

            <div className={`p-3 rounded-2xl border flex justify-between items-center text-xs font-mono ${subCardCls}`}>
              <span className={`flex items-center gap-1.5 ${textMuted}`}>
                <Clock className={`w-4 h-4 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Time Remaining:
              </span>
              <span className={`font-bold text-sm ${isLight ? 'text-blue-700' : 'text-cyan-300'}`}>
                {Math.floor(totalSecondsLeft / 60)}m {totalSecondsLeft % 60}s
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center text-xs font-mono">
              <div className={`p-3 rounded-2xl border ${isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-950/30 border-emerald-900/50'}`}>
                <span className={`font-black text-xl block ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{answeredCount}</span>
                <span className="text-[10px] uppercase tracking-wider block mt-0.5 font-bold opacity-80">Answered</span>
              </div>
              <div className={`p-3 rounded-2xl border ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/30 border-amber-900/50'}`}>
                <span className={`font-black text-xl block ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{unansweredCount}</span>
                <span className="text-[10px] uppercase tracking-wider block mt-0.5 font-bold opacity-80">Unanswered</span>
              </div>
              <div className={`p-3 rounded-2xl border ${isLight ? 'bg-purple-50 border-purple-200' : 'bg-purple-950/30 border-purple-900/50'}`}>
                <span className={`font-black text-xl block ${isLight ? 'text-purple-700' : 'text-purple-400'}`}>{flaggedCount}</span>
                <span className="text-[10px] uppercase tracking-wider block mt-0.5 font-bold opacity-80">Review</span>
              </div>
              <div className={`p-3 rounded-2xl border ${subCardCls}`}>
                <span className="font-black text-xl block">{notVisitedCount}</span>
                <span className="text-[10px] uppercase tracking-wider block mt-0.5 opacity-80">Not Visited</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowSubmitModal(false)}
                className={`flex-1 py-3 font-bold rounded-xl text-xs border transition ${buttonSecCls}`}
              >
                ← Return to Test
              </button>
              <button
                onClick={() => handleSubmit(false)}
                className={`flex-1 py-3 font-bold rounded-xl text-xs transition text-white ${
                  isLight ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm' : 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
                }`}
              >
                Confirm Final Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
