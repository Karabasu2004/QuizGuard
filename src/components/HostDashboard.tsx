import React, { useState, useEffect } from 'react';
import { Quiz, Question, QuestionType, QuizMode, QuizSection, StudentResult, ThemeColor, THEME_CONFIG, QuestionBankItem } from '../types';
import { saveQuiz, supabase, subscribeToMessages, broadcastMessage } from '../supabase';
import { PieChart } from './PieChart';
import { 
  Shield, Plus, Copy, Check, ExternalLink, LogOut, Trash2, Users, 
  Clock, Palette, CheckCircle2, Lock, Mail, User, RefreshCw, StopCircle, 
  PlayCircle, Edit3, Award, Download, Layers, HelpCircle, AlertOctagon, Settings2, 
  BarChart2, Trophy, Shuffle, Database, Search, FolderPlus, ArrowDownToLine, X,
  FileEdit, ChevronLeft, ChevronRight, BellRing, UserCheck, ShieldAlert
} from 'lucide-react';

interface HostProps {
  onLogout: () => void;
  onThemeChange?: (theme: ThemeColor) => void;
  isLight?: boolean;
}

const DEFAULT_SECTIONS: QuizSection[] = [
  { id: 'sec_3m', name: 'Section A (3M)', marksPerQuestion: 3, negativeMarkingEnabled: true, negativeMarking: 1 },
  { id: 'sec_5m', name: 'Section B (5M)', marksPerQuestion: 5, negativeMarkingEnabled: true, negativeMarking: 1 },
  { id: 'sec_7m', name: 'Section C (7M)', marksPerQuestion: 7, negativeMarkingEnabled: true, negativeMarking: 2 },
  { id: 'sec_10m', name: 'Section D (10M)', marksPerQuestion: 10, negativeMarkingEnabled: true, negativeMarking: 2 },
];

export const HostDashboard: React.FC<HostProps> = ({ onLogout, isLight = false }) => {
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

  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [quizSearch, setQuizSearch] = useState<string>('');
  const [quizPage, setQuizPage] = useState<number>(1);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);

  const [customWarningText, setCustomWarningText] = useState<string>('');
  const [targetStudentForWarning, setTargetStudentForWarning] = useState<string | null>(null);
  const [incidentLogs, setIncidentLogs] = useState<Array<{ timestamp: string; studentName: string; reason: string; strikes: number }>>([]);

  const [quizMode, setQuizMode] = useState<QuizMode>('marks_challenge');
  const [newTitle, setNewTitle] = useState('');
  const [totalDurationMin, setTotalDurationMin] = useState<number>(20);
  const [pacingMode, setPacingMode] = useState<'manual' | 'auto'>('manual');
  const [sections, setSections] = useState<QuizSection[]>(DEFAULT_SECTIONS);
  const [showSectionConfig, setShowSectionConfig] = useState<boolean>(false);

  const [shuffleQuestions, setShuffleQuestions] = useState<boolean>(true);
  const [shuffleOptions, setShuffleOptions] = useState<boolean>(true);

  const [questionBank, setQuestionBank] = useState<QuestionBankItem[]>([]);
  const [isBankModalOpen, setIsBankModalOpen] = useState<boolean>(false);
  const [bankSearchQuery, setBankSearchQuery] = useState<string>('');
  const [bankTypeFilter, setBankTypeFilter] = useState<'all' | 'mcq' | 'fib' | 'multi_fib'>('all');

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
  const [saveAlsoToBank, setSaveAlsoToBank] = useState<boolean>(false);

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

      const storedBank = localStorage.getItem(`quizguard_bank_${hostEmail}`);
      if (storedBank) {
        try { setQuestionBank(JSON.parse(storedBank)); } catch (e) {}
      }
    }
  }, [hostEmail]);

  const saveBankToStorage = (updated: QuestionBankItem[]) => {
    setQuestionBank(updated);
    if (hostEmail) {
      localStorage.setItem(`quizguard_bank_${hostEmail}`, JSON.stringify(updated));
    }
  };

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

  const addToBank = (q: Question) => {
    const bankItem: QuestionBankItem = {
      ...q,
      bankId: `bank_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      createdAt: new Date().toLocaleDateString()
    };
    const updated = [bankItem, ...questionBank];
    saveBankToStorage(updated);
  };

  const deleteFromBank = (bankId: string) => {
    const updated = questionBank.filter(item => item.bankId !== bankId);
    saveBankToStorage(updated);
  };

  const importFromBank = (bankItem: QuestionBankItem) => {
    const newQ: Question = {
      ...bankItem,
      id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      sectionId: quizMode === 'marks_challenge' ? selectedSectionId : undefined,
      marks: quizMode === 'marks_challenge' 
        ? (sections.find(s => s.id === selectedSectionId)?.marksPerQuestion || bankItem.marks || 3)
        : (bankItem.marks || 10)
    };
    setDraftQuestions(prev => [...prev, newQ]);
  };

  // Real-time broadcast and participant submission listener
  useEffect(() => {
    if (!activeQuiz) return;

    const unsubscribe = subscribeToMessages((msg: any) => {
      if (msg.type === 'PARTICIPANT_INCIDENT' && msg.quizId === activeQuiz.id) {
        setIncidentLogs(prev => [
          {
            timestamp: new Date().toLocaleTimeString(),
            studentName: msg.name || 'Candidate',
            reason: msg.reason,
            strikes: msg.strikes
          },
          ...prev.slice(0, 19)
        ]);
      }

      if (msg.type === 'PARTICIPANT_SUBMITTED' && msg.quizId === activeQuiz.id && msg.participant) {
        setActiveQuiz(prev => {
          if (!prev) return null;
          return {
            ...prev,
            participants: {
              ...(prev.participants || {}),
              [msg.participant.id]: msg.participant
            }
          };
        });
      }
    });

    return () => unsubscribe();
  }, [activeQuiz?.id]);

  // Robust live participant fetcher with local storage fallback
  useEffect(() => {
    if (!activeQuiz) return;

    const fetchLiveParticipants = async () => {
      const pMap: Record<string, StudentResult> = {};

      // 1. Read locally cached participant results
      try {
        const localDirect = localStorage.getItem(`quizguard_quiz_${activeQuiz.id}`);
        if (localDirect) {
          const parsed = JSON.parse(localDirect);
          if (parsed.participants) {
            Object.assign(pMap, parsed.participants);
          }
        }
      } catch (e) {}

      // 2. Fetch from Supabase and decode evaluation results
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('participants')
            .select('*')
            .eq('quiz_id', activeQuiz.id);

          if (data && !error) {
            data.filter((p: any) => !p.id.startsWith('QUIZ_STATE_')).forEach((p: any) => {
              let vList = p.violations;
              if (typeof vList === 'string') {
                try { vList = JSON.parse(vList); } catch (e) { vList = []; }
              }

              let pAnswers = p.answers || {};
              if (typeof pAnswers === 'string') {
                try { pAnswers = JSON.parse(pAnswers); } catch (e) { pAnswers = {}; }
              }

              const pEval = pAnswers.__evaluation || {};

              let totalCorrect = p.total_correct ?? pEval.totalCorrect;
              let totalWrong = p.total_wrong ?? pEval.totalWrong;
              let totalSkipped = p.total_skipped ?? pEval.totalSkipped;

              // Automatic fallback calculation if metrics were not stored directly
              if (totalCorrect === undefined && activeQuiz.questions && (p.status === 'Completed' || p.score > 0)) {
                let c = 0, w = 0, s = 0;
                activeQuiz.questions.forEach(q => {
                  const ans = pAnswers[q.id];
                  if (ans === undefined || ans === null || String(ans).trim() === '') s++;
                  else if (q.type === 'mcq' && Number(ans) === Number(q.correctAnswer)) c++;
                  else if (q.type === 'fib' && String(ans).trim().toLowerCase() === String(q.correctAnswer).trim().toLowerCase()) c++;
                  else if (q.type === 'multi_fib') {
                    const cList = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
                    const uList = Array.isArray(ans) ? ans : [];
                    const matches = cList.filter((exp, idx) => String(uList[idx] || '').trim().toLowerCase() === String(exp).trim().toLowerCase()).length;
                    if (matches > 0) c++; else w++;
                  } else w++;
                });
                totalCorrect = c;
                totalWrong = w;
                totalSkipped = s;
              }

              pMap[p.id] = {
                id: p.id,
                name: p.name,
                score: typeof p.score === 'number' ? p.score : Number(p.score || 0),
                timeTakenSeconds: p.time_taken || 0,
                strikes: p.strikes || 0,
                status: p.status || 'Active',
                violations: Array.isArray(vList) ? vList : [],
                answers: pAnswers,
                reviewFlags: p.review_flags || pEval.reviewFlags || {},
                sectionSummaries: p.section_summaries || pEval.sectionSummaries || {},
                questionDetails: p.question_details || pEval.questionDetails || {},
                totalCorrect: totalCorrect ?? 0,
                totalWrong: totalWrong ?? 0,
                totalSkipped: totalSkipped ?? 0,
                submittedAt: p.updated_at
              };
            });
          }
        } catch (e) {}
      }

      setActiveQuiz((prev) => (prev ? { ...prev, participants: pMap } : null));
    };

    fetchLiveParticipants();
    const interval = setInterval(fetchLiveParticipants, 2000);
    return () => clearInterval(interval);
  }, [activeQuiz?.id]);

  const handleSendProctorWarning = () => {
    if (!activeQuiz || !customWarningText.trim()) return;

    broadcastMessage({
      type: 'PROCTOR_WARNING' as any,
      quizId: activeQuiz.id,
      targetParticipantId: targetStudentForWarning,
      message: customWarningText.trim()
    });

    alert(targetStudentForWarning ? 'Direct warning transmitted to candidate!' : 'Broadcast warning displayed to all candidates!');
    setCustomWarningText('');
    setTargetStudentForWarning(null);
  };

  const handleAdjustStrikes = async (student: StudentResult, newStrikes: number) => {
    if (!activeQuiz) return;
    const clamped = Math.max(0, Math.min(3, newStrikes));
    const newStatus = clamped >= 3 ? 'Disqualified' : 'Active';

    if (supabase) {
      await supabase.from('participants').update({
        strikes: clamped,
        status: newStatus
      }).eq('id', student.id);
    }

    broadcastMessage({
      type: 'PROCTOR_STRIKE_ADJUST' as any,
      quizId: activeQuiz.id,
      targetParticipantId: student.id,
      newStrikes: clamped
    });
  };

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

  const handleEditSavedQuiz = (q: Quiz) => {
    setEditingQuizId(q.id);
    setNewTitle(q.title);
    setQuizMode(q.mode || 'marks_challenge');
    setTotalDurationMin(q.totalDurationMinutes || 20);
    setSections(q.sections || DEFAULT_SECTIONS);
    setShuffleQuestions(q.shuffleQuestions ?? true);
    setShuffleOptions(q.shuffleOptions ?? true);
    setDraftQuestions([...q.questions]);
    setEditingQuestionIndex(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelQuizEdit = () => {
    setEditingQuizId(null);
    setNewTitle('');
    setDraftQuestions([]);
    setEditingQuestionIndex(null);
  };

  const handleDeleteSavedQuiz = async (quizId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this assessment?')) {
      return;
    }

    const updated = quizzes.filter(q => q.id !== quizId);
    setQuizzes(updated);
    localStorage.setItem(`quizguard_host_quizzes_${hostEmail}`, JSON.stringify(updated));
    localStorage.removeItem(`quizguard_quiz_${quizId}`);

    if (editingQuizId === quizId) {
      handleCancelQuizEdit();
    }
    if (activeQuiz?.id === quizId) {
      setActiveQuiz(null);
    }

    if (supabase) {
      try {
        await supabase.from('quizzes').delete().eq('id', quizId);
      } catch (err) {}
    }
  };

  const handleEditDraftQuestion = (index: number) => {
    const q = draftQuestions[index];
    if (!q) return;

    setEditingQuestionIndex(index);
    setQType(q.type || 'mcq');
    setQText(q.text);
    setQExplanation(q.explanation || '');
    if (q.sectionId) setSelectedSectionId(q.sectionId);
    if (q.timeLimit) setQTimerClassic(q.timeLimit);
    if (q.marks) setCustomClassicMarks(q.marks);

    if (q.type === 'mcq') {
      setOptA(q.options?.[0] || '');
      setOptB(q.options?.[1] || '');
      setOptC(q.options?.[2] || '');
      setOptD(q.options?.[3] || '');
      setCorrectOpt(Number(q.correctAnswer) || 0);
    } else if (q.type === 'fib') {
      setSingleFibAnswer(String(q.correctAnswer || ''));
    } else if (q.type === 'multi_fib') {
      const arr = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
      setBlankCount(arr.length || 3);
      setBlankAnswers(arr.length > 0 ? [...arr] : ['', '', '']);
    }
  };

  const handleCancelQuestionEdit = () => {
    setEditingQuestionIndex(null);
    setQText('');
    setOptA(''); setOptB(''); setOptC(''); setOptD('');
    setCorrectOpt(0);
    setSingleFibAnswer('');
    setBlankAnswers(['', '', '']);
    setQExplanation('');
  };

  const handleAddOrUpdateQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qText.trim()) {
      alert('Please enter question text.');
      return;
    }

    const currentSection = sections.find((s) => s.id === selectedSectionId);
    const marksAssigned = quizMode === 'marks_challenge' 
      ? (currentSection ? currentSection.marksPerQuestion : 3) 
      : customClassicMarks;

    let targetQuestion: Question;

    if (qType === 'mcq') {
      if (!optA.trim() || !optB.trim() || !optC.trim() || !optD.trim()) {
        alert('Please fill out all 4 options.');
        return;
      }
      targetQuestion = {
        id: editingQuestionIndex !== null ? draftQuestions[editingQuestionIndex].id : `q_${Date.now()}`,
        sectionId: quizMode === 'marks_challenge' ? selectedSectionId : undefined,
        type: 'mcq',
        text: qText.trim(),
        options: [optA.trim(), optB.trim(), optC.trim(), optD.trim()],
        correctAnswer: correctOpt,
        marks: marksAssigned,
        timeLimit: qTimerClassic,
        explanation: qExplanation.trim(),
      };
      setOptA(''); setOptB(''); setOptC(''); setOptD('');
      setCorrectOpt(0);
    } else if (qType === 'fib') {
      if (!singleFibAnswer.trim()) {
        alert('Please enter expected correct answer.');
        return;
      }
      targetQuestion = {
        id: editingQuestionIndex !== null ? draftQuestions[editingQuestionIndex].id : `q_${Date.now()}`,
        sectionId: quizMode === 'marks_challenge' ? selectedSectionId : undefined,
        type: 'fib',
        text: qText.trim(),
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
      targetQuestion = {
        id: editingQuestionIndex !== null ? draftQuestions[editingQuestionIndex].id : `q_${Date.now()}`,
        sectionId: quizMode === 'marks_challenge' ? selectedSectionId : undefined,
        type: 'multi_fib',
        text: qText.trim(),
        correctAnswer: blankAnswers.map((a) => a.trim()),
        marks: marksAssigned,
        timeLimit: qTimerClassic,
        explanation: qExplanation.trim(),
      };
      setBlankAnswers(['', '', '']);
    }

    if (saveAlsoToBank) {
      addToBank(targetQuestion);
    }

    if (editingQuestionIndex !== null) {
      const updated = [...draftQuestions];
      updated[editingQuestionIndex] = targetQuestion;
      setDraftQuestions(updated);
      setEditingQuestionIndex(null);
    } else {
      setDraftQuestions([...draftQuestions, targetQuestion]);
    }

    setQText('');
    setQExplanation('');
    setSaveAlsoToBank(false);
  };

  const handleLaunchOrUpdateQuiz = async () => {
    let currentDrafts = [...draftQuestions];

    if (!newTitle.trim()) {
      alert('Please enter an Assessment Title before launching.');
      return;
    }

    if (currentDrafts.length === 0) {
      alert('Please add at least 1 question to the assessment.');
      return;
    }

    const quizId = editingQuizId || `quiz_${Date.now().toString(36)}`;
    const existingQuiz = quizzes.find(q => q.id === editingQuizId);

    const savedQuizObj: Quiz = {
      id: quizId,
      hostEmail,
      title: newTitle.trim(),
      createdAt: existingQuiz ? existingQuiz.createdAt : new Date().toLocaleString(),
      mode: quizMode,
      totalDurationMinutes: quizMode === 'marks_challenge' ? totalDurationMin : undefined,
      sections: quizMode === 'marks_challenge' ? sections : undefined,
      shuffleQuestions,
      shuffleOptions,
      pacingMode,
      theme: 'slate',
      questions: currentDrafts,
      status: 'live',
      participants: existingQuiz ? existingQuiz.participants : {},
    };

    localStorage.setItem(`quizguard_quiz_${savedQuizObj.id}`, JSON.stringify(savedQuizObj));
    const updated = quizzes.filter(q => q.id !== savedQuizObj.id);
    updated.unshift(savedQuizObj);
    setQuizzes(updated);
    localStorage.setItem(`quizguard_host_quizzes_${hostEmail}`, JSON.stringify(updated));

    setActiveQuiz(savedQuizObj);
    setEditingQuizId(null);
    setDraftQuestions([]);
    setNewTitle('');
    setQText('');
    setOptA(''); setOptB(''); setOptC(''); setOptD('');
    setSingleFibAnswer('');
    setBlankAnswers(['', '', '']);
    setQExplanation('');
    setEditingQuestionIndex(null);

    try {
      await saveQuiz(savedQuizObj);
    } catch (err) {
      console.warn('Background sync note:', err);
    }
  };

  const handleStopAssessment = async () => {
    if (!activeQuiz) return;
    if (!window.confirm('Are you sure you want to conclude this assessment? All connected participants will be halted.')) {
      return;
    }

    const updated: Quiz = { ...activeQuiz, status: 'ended' };
    setActiveQuiz(updated);
    saveQuiz(updated);

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

  const filteredBank = questionBank.filter(item => {
    const matchesSearch = item.text.toLowerCase().includes(bankSearchQuery.toLowerCase());
    const matchesType = bankTypeFilter === 'all' || item.type === bankTypeFilter;
    return matchesSearch && matchesType;
  });

  const filteredQuizzes = quizzes.filter(q => q.title.toLowerCase().includes(quizSearch.toLowerCase()));
  const totalQuizPages = Math.ceil(filteredQuizzes.length / 5) || 1;
  const paginatedQuizzes = filteredQuizzes.slice((quizPage - 1) * 5, quizPage * 5);

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

  if (!hostEmail) {
    return (
      <div className="flex items-center justify-center min-h-[65vh] px-4">
        <div className={`border p-8 rounded-3xl max-w-md w-full shadow-xl transition-colors ${cardCls}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className={`p-2.5 rounded-xl border ${isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'}`}>
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${textPrimary}`}>Faculty Studio Sign In</h2>
              <span className={`text-xs ${textMuted}`}>Academic Verification Required</span>
            </div>
          </div>

          <div className={`grid grid-cols-2 p-1 rounded-2xl border mb-6 ${subCardCls}`}>
            <button
              onClick={() => { setAuthMode('login'); setLoginError(''); setRegError(''); }}
              className={`py-2 text-xs font-bold rounded-xl transition ${authMode === 'login' ? (isLight ? 'bg-blue-700 text-white shadow-sm' : 'bg-cyan-600 text-white shadow-md') : `${textMuted} hover:${textPrimary}`}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('register'); setLoginError(''); setRegError(''); refreshCaptcha(); }}
              className={`py-2 text-xs font-bold rounded-xl transition ${authMode === 'register' ? (isLight ? 'bg-blue-700 text-white shadow-sm' : 'bg-cyan-600 text-white shadow-md') : `${textMuted} hover:${textPrimary}`}`}
            >
              Register
            </button>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-500 font-medium">
                  {loginError}
                </div>
              )}
              <div>
                <label className={`text-xs block mb-1.5 font-medium flex items-center gap-1.5 ${textMuted}`}>
                  <Mail className={`w-3.5 h-3.5 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Faculty Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="professor@university.edu"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none ${inputCls}`}
                />
              </div>

              <div>
                <label className={`text-xs block mb-1.5 font-medium flex items-center gap-1.5 ${textMuted}`}>
                  <Lock className={`w-3.5 h-3.5 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none ${inputCls}`}
                />
              </div>

              <button
                type="submit"
                className={`w-full py-3 text-white font-bold rounded-xl text-sm transition mt-2 ${isLight ? 'bg-blue-700 hover:bg-blue-800 shadow-sm shadow-blue-700/20' : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 shadow-lg shadow-cyan-600/20'}`}
              >
                Sign In to Faculty Portal
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-3.5">
              {regError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-500 font-medium">
                  {regError}
                </div>
              )}
              {regSuccessMsg && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-600 font-mono">
                  Registration successful! Redirecting to login...
                </div>
              )}

              <div>
                <label className={`text-xs block mb-1 font-medium flex items-center gap-1.5 ${textMuted}`}>
                  <User className={`w-3.5 h-3.5 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Prof. John Doe"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs focus:outline-none ${inputCls}`}
                />
              </div>

              <div>
                <label className={`text-xs block mb-1 font-medium flex items-center gap-1.5 ${textMuted}`}>
                  <Mail className={`w-3.5 h-3.5 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="faculty@university.edu"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs focus:outline-none ${inputCls}`}
                />
              </div>

              <div>
                <label className={`text-xs block mb-1 font-medium flex items-center gap-1.5 ${textMuted}`}>
                  <Lock className={`w-3.5 h-3.5 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Create secure password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs focus:outline-none ${inputCls}`}
                />
              </div>

              <div>
                <label className={`text-xs block mb-1 font-medium ${textMuted}`}>Security Captcha</label>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`px-4 py-2 rounded-xl font-mono text-lg font-black tracking-widest select-none border ${subCardCls} ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                    {generatedCaptcha}
                  </div>
                  <button
                    type="button"
                    onClick={refreshCaptcha}
                    className={`p-2 rounded-xl border transition ${buttonSecCls}`}
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
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs uppercase tracking-wider focus:outline-none ${inputCls}`}
                />
              </div>

              <button
                type="submit"
                className={`w-full py-2.5 text-white font-bold rounded-xl text-xs transition mt-2 ${isLight ? 'bg-blue-700 hover:bg-blue-800' : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500'}`}
              >
                Create Faculty Account
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
      { label: 'Completed', value: completedCount, color: '#16a34a' },
      { label: 'Disqualified', value: disqualifiedCount, color: '#dc2626' },
      { label: 'In Exam', value: activeCount, color: '#2563eb' },
    ];

    const totalMax = activeQuiz.questions.reduce((sum, q) => sum + (q.marks || 10), 0);
    const highScore = participantsList.filter(s => s.score >= totalMax * 0.8).length;
    const medScore = participantsList.filter(s => s.score >= totalMax * 0.5 && s.score < totalMax * 0.8).length;
    const lowScore = participantsList.filter(s => s.score < totalMax * 0.5).length;

    const scoreChartData = [
      { label: 'High (≥80%)', value: highScore, color: '#7c3aed' },
      { label: 'Average (50-79%)', value: medScore, color: '#ea580c' },
      { label: 'Review (<50%)', value: lowScore, color: '#db2777' },
    ];

    const isQuizEnded = activeQuiz.status === 'ended';

    return (
      <div className="space-y-8 animate-fade-in">
        <div className={`flex flex-wrap items-center justify-between p-6 rounded-3xl border gap-4 ${cardCls}`}>
          <div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isQuizEnded ? 'bg-amber-500' : 'bg-emerald-500 animate-ping'}`}></span>
              <span className={`text-xs font-mono uppercase tracking-wider font-bold ${isQuizEnded ? 'text-amber-600' : 'text-emerald-600'}`}>
                {isQuizEnded ? 'Assessment Concluded' : 'Live Examination Active'}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase border font-bold ${
                isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-cyan-950 text-cyan-300 border-cyan-800'
              }`}>
                {activeQuiz.mode === 'marks_challenge' ? 'Marks Challenge' : 'Classic Mode'}
              </span>
            </div>
            <h1 className={`text-2xl font-black mt-1 ${textPrimary}`}>{activeQuiz.title}</h1>
            <p className={`text-xs ${textMuted}`}>
              {activeQuiz.questions.length} Questions • Maximum Score: <span className={`font-mono font-bold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>{totalMax} pts</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={exportResultsCSV}
              className={`flex items-center gap-1.5 px-3.5 py-2 font-bold rounded-xl text-xs border transition ${buttonSecCls}`}
              title="Download results as CSV"
            >
              <Download className="w-4 h-4 text-emerald-600" /> Export CSV
            </button>

            {isQuizEnded ? (
              <button
                onClick={() => handleResumeAssessment()}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition"
              >
                <PlayCircle className="w-4 h-4" /> Resume Exam
              </button>
            ) : (
              <button
                onClick={handleStopAssessment}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-sm transition"
              >
                <StopCircle className="w-4 h-4" /> Conclude Exam
              </button>
            )}

            <button 
              onClick={() => setActiveQuiz(null)}
              className={`px-4 py-2 text-xs font-semibold rounded-xl border transition ${
                isLight ? 'bg-blue-700 hover:bg-blue-800 text-white border-blue-700' : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500'
              }`}
            >
              ← Back to Studio
            </button>
          </div>
        </div>

        {/* Candidate Invitation Link */}
        <div className={`p-6 rounded-3xl border shadow-sm space-y-3 ${isLight ? 'bg-blue-50/60 border-blue-200' : 'bg-slate-900/80 border-cyan-500/30'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-mono uppercase tracking-widest font-bold ${isLight ? 'text-blue-800' : 'text-cyan-400'}`}>
              Student Examination Link
            </span>
            <span className={`text-xs ${textMuted}`}>Distribute to candidates</span>
          </div>
          <div className="flex items-center gap-3">
            <input 
              readOnly 
              value={shareableUrl} 
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-mono select-all border ${
                isLight ? 'bg-white border-blue-200 text-blue-900 font-medium' : 'bg-slate-950 border-slate-800 text-cyan-300'
              }`}
            />
            <button 
              onClick={copyShareLink} 
              className={`px-6 py-3 text-white font-bold rounded-xl text-sm flex items-center gap-2 transition ${
                isLight ? 'bg-blue-700 hover:bg-blue-800 shadow-sm' : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 shadow-lg'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied Link!' : 'Copy Link'}
            </button>
            <a 
              href={shareableUrl} 
              target="_blank" 
              rel="noreferrer" 
              className={`p-3 rounded-xl border transition ${buttonSecCls}`}
              title="Open test link in new tab"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* Live Proctor Interventions */}
        <div className={`p-6 rounded-3xl border space-y-5 ${cardCls}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div>
              <h3 className={`text-base font-bold flex items-center gap-2 ${textPrimary}`}>
                <BellRing className="w-5 h-5 text-purple-600" /> Live Proctor Interventions & Announcements
              </h3>
              <p className={`text-xs ${textMuted}`}>Transmit direct warning banners to individual candidates or broadcast to the entire room.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <label className={`text-xs font-bold block ${textMuted}`}>Warning or Notice Text:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Please look directly at your screen and exit all background apps."
                  value={customWarningText}
                  onChange={(e) => setCustomWarningText(e.target.value)}
                  className={`flex-1 px-4 py-2.5 rounded-xl border text-xs focus:outline-none ${inputCls}`}
                />
                <button
                  onClick={handleSendProctorWarning}
                  className={`px-5 py-2.5 font-bold rounded-xl text-xs text-white transition ${
                    isLight ? 'bg-blue-700 hover:bg-blue-800' : 'bg-purple-600 hover:bg-purple-500'
                  }`}
                >
                  Dispatch Alert
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className={`text-xs font-bold block ${textMuted}`}>Target Candidate:</label>
              <select
                value={targetStudentForWarning || ''}
                onChange={(e) => setTargetStudentForWarning(e.target.value ? e.target.value : null)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none ${inputCls}`}
              >
                <option value="">Broadcast to All Connected Candidates</option>
                {participantsList.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.strikes}/3 Strikes)</option>
                ))}
              </select>
            </div>
          </div>

          {incidentLogs.length > 0 && (
            <div className={`p-4 rounded-2xl border space-y-2 text-xs font-mono ${subCardCls}`}>
              <span className={`block font-bold ${textMuted}`}>Live Security Incident Stream:</span>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {incidentLogs.map((log, idx) => (
                  <div key={idx} className="flex justify-between items-center text-rose-500">
                    <span>• [{log.timestamp}] <strong>{log.studentName}</strong>: {log.reason}</span>
                    <span className="font-bold">({log.strikes}/3 Strikes)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PieChart title="Integrity Breakdown" data={statusChartData} isLight={isLight} />
          <PieChart title="Score Brackets" data={scoreChartData} isLight={isLight} />
        </div>

        {/* Live Examination Scoreboard */}
        <div className={`p-6 rounded-3xl border space-y-4 ${cardCls}`}>
          <div className="flex justify-between items-center">
            <h3 className={`text-lg font-bold flex items-center gap-2 ${textPrimary}`}>
              <Trophy className="w-5 h-5 text-amber-500" /> Examination Scoreboard ({participantsList.length})
            </h3>
            <span className={`text-xs font-mono ${textMuted}`}>Ranked by Score • Tie-breaker: Time</span>
          </div>

          <div className={`overflow-x-auto rounded-2xl border ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className={`text-xs font-mono border-b ${isLight ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-slate-950/80 text-slate-400 border-slate-800'}`}>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Candidate / Team</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Time Taken</th>
                  <th className="py-3 px-4">Performance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Strikes Control</th>
                  <th className="py-3 px-4 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-200 bg-white' : 'divide-slate-800/60'}`}>
                {participantsList.map((s, idx) => (
                  <tr key={s.id} className={`transition ${isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/20'}`}>
                    <td className="py-3 px-4 font-mono font-bold">
                      <div className="flex items-center gap-1.5">
                        {idx === 0 && s.status !== 'Disqualified' && <Trophy className="w-4 h-4 text-amber-500 shrink-0" />}
                        {idx === 1 && s.status !== 'Disqualified' && <Award className="w-4 h-4 text-slate-400 shrink-0" />}
                        {idx === 2 && s.status !== 'Disqualified' && <Award className="w-4 h-4 text-amber-700 shrink-0" />}
                        <span className={isLight ? 'text-blue-700' : 'text-cyan-400'}>#{idx + 1}</span>
                      </div>
                    </td>
                    <td className={`py-3 px-4 font-semibold ${textPrimary}`}>{s.name}</td>
                    <td className={`py-3 px-4 font-mono font-bold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                      {s.score} / {totalMax} pts
                    </td>
                    <td className={`py-3 px-4 font-mono text-xs ${textMuted}`}>
                      {s.timeTakenSeconds ? `${Math.floor(s.timeTakenSeconds / 60)}m ${s.timeTakenSeconds % 60}s` : '0m 0s'}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                          <Check className="w-3.5 h-3.5" /> {s.totalCorrect || 0}
                        </span>
                        <span className="text-rose-600 font-bold flex items-center gap-0.5">
                          <X className="w-3.5 h-3.5" /> {s.totalWrong || 0}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        s.status === 'Disqualified'
                          ? 'bg-red-50 text-red-600 border border-red-200'
                          : s.status === 'Completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleAdjustStrikes(s, s.strikes - 1)}
                          disabled={s.strikes === 0}
                          className={`px-1.5 py-0.5 rounded text-[10px] border disabled:opacity-30 ${buttonSecCls}`}
                          title="Forgive strike"
                        >
                          -
                        </button>
                        <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                          s.strikes === 0 ? (isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-400') :
                          s.strikes >= 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {s.strikes}/3
                        </span>
                        <button
                          onClick={() => handleAdjustStrikes(s, s.strikes + 1)}
                          disabled={s.strikes >= 3}
                          className={`px-1.5 py-0.5 rounded text-[10px] border disabled:opacity-30 ${buttonSecCls}`}
                          title="Add manual strike"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button 
                        onClick={() => { setInspectedStudent(s); setInspectTab('sections'); }}
                        className={`px-3 py-1 text-xs font-medium rounded-lg border transition ${buttonSecCls}`}
                      >
                        Inspect Log
                      </button>
                    </td>
                  </tr>
                ))}
                {participantsList.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400 text-xs font-mono">
                      No candidate submissions recorded yet. Share the invitation link above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Candidate Audit Modal */}
        {inspectedStudent && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <div className={`max-w-xl w-full border p-6 rounded-3xl space-y-4 shadow-2xl ${cardCls}`}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className={`text-lg font-bold ${textPrimary}`}>Candidate Audit: {inspectedStudent.name}</h3>
                  <span className={`text-xs font-mono ${textMuted}`}>
                    Score: {inspectedStudent.score}/{totalMax} pts • Time: {Math.floor((inspectedStudent.timeTakenSeconds || 0) / 60)}m {(inspectedStudent.timeTakenSeconds || 0) % 60}s
                  </span>
                </div>
                <button onClick={() => setInspectedStudent(null)} className={`text-xs ${textMuted} hover:${textPrimary}`}>✕ Close</button>
              </div>

              <div className={`flex gap-2 border-b pb-2 text-xs ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                <button
                  onClick={() => setInspectTab('sections')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${inspectTab === 'sections' ? (isLight ? 'bg-blue-700 text-white' : 'bg-cyan-600 text-white') : textMuted}`}
                >
                  Section Breakdown
                </button>
                <button
                  onClick={() => setInspectTab('audit')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${inspectTab === 'audit' ? (isLight ? 'bg-blue-700 text-white' : 'bg-cyan-600 text-white') : textMuted}`}
                >
                  Proctor Strikes ({inspectedStudent.violations.length})
                </button>
              </div>

              {inspectTab === 'sections' ? (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {inspectedStudent.sectionSummaries && Object.keys(inspectedStudent.sectionSummaries).length > 0 ? (
                    Object.values(inspectedStudent.sectionSummaries).map((sec) => (
                      <div key={sec.sectionId} className={`p-3 rounded-xl border flex justify-between items-center text-xs ${subCardCls}`}>
                        <div>
                          <strong className={`block ${textPrimary}`}>{sec.sectionName}</strong>
                          <span className={`text-[11px] font-mono ${textMuted}`}>
                            Correct: {sec.correct} • Wrong: {sec.wrong} • Skipped: {sec.skipped}
                          </span>
                        </div>
                        <span className={`font-mono font-bold text-sm ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                          {Math.max(0, sec.earnedMarks).toFixed(1)} / {sec.maxMarks} pts
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className={`text-xs font-mono py-4 text-center ${textMuted}`}>No detailed section breakdown recorded.</p>
                  )}
                </div>
              ) : (
                <div className={`p-4 rounded-2xl border max-h-60 overflow-y-auto space-y-2 text-xs font-mono ${subCardCls}`}>
                  {inspectedStudent.violations.length === 0 ? (
                    <p className="text-emerald-600">Zero violations recorded. 100% clean session.</p>
                  ) : (
                    inspectedStudent.violations.map((v, i) => (
                      <div key={i} className="text-red-600 bg-red-50 p-2 rounded border border-red-200">
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
    <div className="space-y-8 animate-fade-in">
      <div className={`flex flex-wrap items-center justify-between p-5 rounded-3xl border gap-4 ${cardCls}`}>
        <div>
          <h1 className={`text-xl font-bold ${textPrimary}`}>Faculty Assessment Studio</h1>
          <p className={`text-xs font-mono ${textMuted}`}>Host: <span className={isLight ? 'text-blue-700 font-bold' : 'text-cyan-300'}>{hostEmail}</span></p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsBankModalOpen(true)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
              isLight ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200' : 'bg-purple-950/60 hover:bg-purple-900 text-purple-300 border-purple-800'
            }`}
          >
            <Database className="w-4 h-4 text-purple-600" /> Question Bank ({questionBank.length})
          </button>
          <button onClick={handleSignOut} className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${buttonSecCls}`}>
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>

      {editingQuizId && (
        <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <FileEdit className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Currently Editing Assessment: <strong className="underline">{newTitle || 'Untitled'}</strong></span>
          </div>
          <button
            onClick={handleCancelQuizEdit}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${buttonSecCls}`}
          >
            Cancel Edit & Start New
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className={`p-6 rounded-3xl border space-y-5 ${cardCls}`}>
            <div className={`p-1.5 rounded-2xl border flex flex-wrap gap-2 ${subCardCls}`}>
              <button
                type="button"
                onClick={() => setQuizMode('marks_challenge')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  quizMode === 'marks_challenge' 
                    ? (isLight ? 'bg-blue-700 text-white shadow-sm' : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md')
                    : `${textMuted} hover:${textPrimary}`
                }`}
              >
                <Award className="w-4 h-4" /> Marks Challenge (Sectional 3M-10M, 20 Min)
              </button>
              <button
                type="button"
                onClick={() => setQuizMode('classic')}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                  quizMode === 'classic' 
                    ? (isLight ? 'bg-blue-700 text-white shadow-sm' : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md')
                    : `${textMuted} hover:${textPrimary}`
                }`}
              >
                <Clock className="w-4 h-4" /> Classic Mode (Per-Question Timer)
              </button>
            </div>

            {/* Negative Marking Customization Accordion */}
            {quizMode === 'marks_challenge' && (
              <div className={`p-4 rounded-2xl border space-y-3 ${subCardCls}`}>
                <div className="flex justify-between items-center">
                  <span className={`text-xs font-bold flex items-center gap-1.5 ${textPrimary}`}>
                    <Settings2 className={`w-4 h-4 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Section Negative Marking Rules
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowSectionConfig(!showSectionConfig)}
                    className={`text-xs font-mono font-bold ${isLight ? 'text-blue-700 hover:text-blue-800' : 'text-cyan-400 hover:text-cyan-300'}`}
                  >
                    {showSectionConfig ? 'Hide Rules ▲' : 'Customize Penalties ▼'}
                  </button>
                </div>

                {showSectionConfig && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {sections.map((sec) => (
                      <div key={sec.id} className={`p-3 rounded-xl border space-y-2 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                        <div className="flex justify-between items-center">
                          <span className={`text-xs font-bold ${textPrimary}`}>{sec.name}</span>
                          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={sec.negativeMarkingEnabled}
                              onChange={() => handleToggleNegativeMarking(sec.id)}
                              className="accent-blue-600 rounded"
                            />
                            <span className={sec.negativeMarkingEnabled ? 'text-rose-600 font-bold' : textMuted}>
                              {sec.negativeMarkingEnabled ? 'Active' : 'Off'}
                            </span>
                          </label>
                        </div>
                        {sec.negativeMarkingEnabled && (
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] ${textMuted}`}>Wrong deduction:</span>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="10"
                              value={sec.negativeMarking}
                              onChange={(e) => handleNegativeMarkValueChange(sec.id, Number(e.target.value))}
                              className={`w-16 px-2 py-1 rounded-lg text-xs font-mono font-bold text-rose-600 text-center border ${inputCls}`}
                            />
                            <span className={`text-[11px] ${textMuted}`}>marks</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Target Section Chooser */}
            {quizMode === 'marks_challenge' && (
              <div className="space-y-2">
                <label className={`text-xs font-medium block flex items-center gap-1.5 ${textMuted}`}>
                  <Layers className={`w-3.5 h-3.5 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Target Section for New Question:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSectionId(s.id)}
                      className={`p-3 rounded-2xl border text-left transition ${
                        selectedSectionId === s.id
                          ? (isLight ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-cyan-500 bg-cyan-950/30')
                          : (isLight ? 'border-slate-200 bg-slate-50 hover:bg-slate-100' : 'border-slate-800 bg-slate-950 hover:border-slate-700')
                      }`}
                    >
                      <span className={`text-xs font-bold block ${textPrimary}`}>{s.name}</span>
                      <span className={`text-[11px] font-mono block ${isLight ? 'text-blue-700 font-bold' : 'text-cyan-400'}`}>+{s.marksPerQuestion} Marks</span>
                      <span className="text-[10px] text-rose-600 font-mono">
                        {s.negativeMarkingEnabled ? `-${s.negativeMarking} on Wrong` : '0 penalty'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Question Format Toggle */}
            <div className={`flex flex-wrap items-center justify-between gap-3 border-t pt-4 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <h2 className={`text-sm font-bold flex items-center gap-2 ${textPrimary}`}>
                {editingQuestionIndex !== null ? (
                  <span className="text-amber-600 flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4" /> Edit Question #{editingQuestionIndex + 1}
                  </span>
                ) : (
                  <span className={`flex items-center gap-1.5 ${textPrimary}`}>
                    <Plus className={`w-4 h-4 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Add Question Content
                  </span>
                )}
              </h2>

              <div className={`flex items-center gap-1.5 p-1 rounded-xl border ${subCardCls}`}>
                <button
                  type="button"
                  onClick={() => setQType('mcq')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    qType === 'mcq' ? (isLight ? 'bg-blue-700 text-white shadow-sm' : 'bg-cyan-600 text-white') : textMuted
                  }`}
                >
                  MCQ
                </button>
                <button
                  type="button"
                  onClick={() => setQType('fib')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    qType === 'fib' ? (isLight ? 'bg-blue-700 text-white shadow-sm' : 'bg-cyan-600 text-white') : textMuted
                  }`}
                >
                  Single Blank
                </button>
                <button
                  type="button"
                  onClick={() => setQType('multi_fib')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    qType === 'multi_fib' ? (isLight ? 'bg-blue-700 text-white shadow-sm' : 'bg-cyan-600 text-white') : textMuted
                  }`}
                >
                  Multi-Blank
                </button>
              </div>
            </div>

            <form onSubmit={handleAddOrUpdateQuestion} className="space-y-4">
              <div>
                <label className={`text-xs block mb-1 font-medium ${textMuted}`}>Question Prompt</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Type examination question prompt here..."
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none ${inputCls}`}
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
                      <div className={`flex items-center justify-between text-xs ${textMuted}`}>
                        <span>{item.label}</span>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name="correctOption"
                            checked={correctOpt === item.idx}
                            onChange={() => setCorrectOpt(item.idx)}
                            className="accent-blue-600"
                          />
                          <span className={correctOpt === item.idx ? (isLight ? 'text-blue-700 font-bold' : 'text-cyan-400 font-bold') : ''}>Correct</span>
                        </label>
                      </div>
                      <input
                        type="text"
                        required
                        placeholder={`Enter ${item.label}`}
                        value={item.val}
                        onChange={(e) => item.set(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl border text-sm focus:outline-none ${inputCls}`}
                      />
                    </div>
                  ))}
                </div>
              )}

              {qType === 'fib' && (
                <div className={`p-4 rounded-2xl border space-y-1.5 ${subCardCls}`}>
                  <label className={`text-xs font-medium block ${isLight ? 'text-blue-800' : 'text-cyan-300'}`}>Expected Answer (Case-Insensitive)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PBFT"
                    value={singleFibAnswer}
                    onChange={(e) => setSingleFibAnswer(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none ${inputCls}`}
                  />
                </div>
              )}

              {qType === 'multi_fib' && (
                <div className={`p-4 rounded-2xl border space-y-3 ${subCardCls}`}>
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-medium ${isLight ? 'text-blue-800' : 'text-cyan-300'}`}>Number of Blanks:</label>
                    <div className="flex gap-2">
                      {[2, 3, 4].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => handleBlankCountChange(cnt)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                            blankCount === cnt ? (isLight ? 'bg-blue-700 text-white' : 'bg-cyan-600 text-white') : buttonSecCls
                          }`}
                        >
                          {cnt} Blanks
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {blankAnswers.map((ans, idx) => (
                      <div key={idx} className="space-y-1">
                        <label className={`text-xs ${textMuted}`}>Blank {idx + 1} Answer Key:</label>
                        <input
                          type="text"
                          required
                          placeholder={`Key for [Blank ${idx + 1}]`}
                          value={ans}
                          onChange={(e) => handleBlankAnswerChange(idx, e.target.value)}
                          className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none ${inputCls}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={`text-xs block mb-1 font-medium flex items-center gap-1.5 ${textMuted}`}>
                  <HelpCircle className={`w-3.5 h-3.5 ${isLight ? 'text-blue-700' : 'text-cyan-400'}`} /> Answer Explanation (Shown after exam)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Detailed reasoning shown during post-exam scorecard review."
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-xs focus:outline-none ${inputCls}`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <label className={`flex items-center gap-2 cursor-pointer text-xs ${textMuted}`}>
                  <input
                    type="checkbox"
                    checked={saveAlsoToBank}
                    onChange={(e) => setSaveAlsoToBank(e.target.checked)}
                    className="accent-purple-600 rounded"
                  />
                  <span>Also save copy to Question Bank</span>
                </label>

                <div className="flex items-center gap-2">
                  {editingQuestionIndex !== null && (
                    <button
                      type="button"
                      onClick={handleCancelQuestionEdit}
                      className={`px-4 py-2.5 font-bold rounded-xl text-xs border transition ${buttonSecCls}`}
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button type="submit" className={`px-5 py-2.5 font-bold rounded-xl text-xs border transition ${
                    isLight ? 'bg-blue-700 hover:bg-blue-800 text-white border-blue-700 shadow-sm' : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                  }`}>
                    {editingQuestionIndex !== null ? `✓ Update Question #${editingQuestionIndex + 1}` : '+ Append Question to Assessment'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Staged Question List */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className={`text-sm font-bold uppercase tracking-wider ${textMuted}`}>
                Staged Questions ({draftQuestions.length})
              </h3>
              {draftQuestions.length > 0 && (
                <button
                  onClick={() => {
                    draftQuestions.forEach(q => addToBank(q));
                    alert(`Saved ${draftQuestions.length} questions to Question Bank!`);
                  }}
                  className="text-xs text-purple-600 font-bold flex items-center gap-1.5"
                >
                  <FolderPlus className="w-3.5 h-3.5" /> Save All to Bank
                </button>
              )}
            </div>

            {draftQuestions.map((q, i) => {
              const sec = sections.find((s) => s.id === q.sectionId);
              const isBeingEdited = editingQuestionIndex === i;

              return (
                <div 
                  key={q.id} 
                  className={`p-4 rounded-2xl border flex items-center justify-between transition ${
                    isBeingEdited 
                      ? 'border-amber-500 bg-amber-50/40 ring-1 ring-amber-500' 
                      : (isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-900/60 border-slate-800')
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-mono font-bold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>Q{i + 1}</span>
                      {sec && (
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold border ${
                          isLight ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-cyan-950 text-cyan-300 border-cyan-800'
                        }`}>
                          {sec.name}
                        </span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${buttonSecCls}`}>
                        {q.type}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        {q.marks} Marks
                      </span>
                      {isBeingEdited && (
                        <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider font-mono">
                          (Editing)
                        </span>
                      )}
                    </div>
                    <p className={`text-sm font-semibold mt-1 ${textPrimary}`}>{q.text}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditDraftQuestion(i)}
                      className={`p-2 rounded-lg border transition ${buttonSecCls}`}
                      title="Edit this question"
                    >
                      <Edit3 className="w-4 h-4 text-amber-600" />
                    </button>
                    <button
                      onClick={() => { addToBank(q); alert('Saved to Question Bank!'); }}
                      className={`p-2 rounded-lg border transition ${buttonSecCls}`}
                      title="Save copy to Question Bank"
                    >
                      <Database className="w-4 h-4 text-purple-600" />
                    </button>
                    <button onClick={() => setDraftQuestions(draftQuestions.filter((_, idx) => idx !== i))} className={`p-2 rounded-lg border transition ${buttonSecCls}`}>
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </button>
                  </div>
                </div>
              );
            })}
            {draftQuestions.length === 0 && (
              <p className={`text-xs py-6 border border-dashed rounded-2xl font-mono text-center ${isLight ? 'border-slate-300 text-slate-400 bg-white' : 'border-slate-800 text-slate-500'}`}>
                No questions added yet. Construct a question above or import from Question Bank.
              </p>
            )}
          </div>
        </div>

        {/* Launch Config & Saved Assessments Sidebar */}
        <div className="space-y-6">
          <div className={`p-6 rounded-3xl border space-y-4 ${cardCls}`}>
            <h3 className={`text-base font-bold ${textPrimary}`}>Assessment Launch Config</h3>
            <div>
              <label className={`text-xs block mb-1 font-medium ${textMuted}`}>Assessment Title</label>
              <input
                type="text"
                placeholder="e.g. Distributed Systems Midterm"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none ${inputCls}`}
              />
            </div>

            {quizMode === 'marks_challenge' && (
              <div>
                <label className={`text-xs block mb-1 font-medium ${textMuted}`}>Total Duration (Minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={totalDurationMin}
                  onChange={(e) => setTotalDurationMin(Math.max(1, Number(e.target.value)))}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm font-bold focus:outline-none ${inputCls}`}
                />
              </div>
            )}

            <div className={`p-3.5 rounded-2xl border space-y-2.5 ${subCardCls}`}>
              <span className={`text-xs font-bold flex items-center gap-1.5 ${textPrimary}`}>
                <Shuffle className="w-3.5 h-3.5 text-purple-600" /> Anti-Cheating Randomization
              </span>
              <label className={`flex items-center justify-between text-xs cursor-pointer ${textMuted}`}>
                <span>Shuffle Questions in Section:</span>
                <input
                  type="checkbox"
                  checked={shuffleQuestions}
                  onChange={(e) => setShuffleQuestions(e.target.checked)}
                  className="accent-purple-600 rounded"
                />
              </label>
              <label className={`flex items-center justify-between text-xs cursor-pointer ${textMuted}`}>
                <span>Shuffle MCQ Options (A, B, C, D):</span>
                <input
                  type="checkbox"
                  checked={shuffleOptions}
                  onChange={(e) => setShuffleOptions(e.target.checked)}
                  className="accent-purple-600 rounded"
                />
              </label>
            </div>

            <div className={`p-3.5 rounded-xl border text-xs space-y-1 ${subCardCls}`}>
              <div>• Questions: <strong className={textPrimary}>{draftQuestions.length}</strong></div>
              <div>• Total Marks: <strong className="text-amber-600">{draftQuestions.reduce((sum, q) => sum + (q.marks || 10), 0)} pts</strong></div>
            </div>

            <button
              onClick={handleLaunchOrUpdateQuiz}
              type="button"
              className={`w-full py-3.5 font-bold rounded-xl text-sm transition cursor-pointer text-white shadow-sm ${
                isLight ? 'bg-blue-700 hover:bg-blue-800' : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500'
              }`}
            >
              {editingQuizId ? 'Save & Update Assessment' : 'Launch Assessment & Generate Link'}
            </button>
          </div>

          {/* 5-Item Paginated Saved Assessments Section */}
          <div className={`p-6 rounded-3xl border space-y-4 ${cardCls}`}>
            <div className="flex justify-between items-center">
              <h4 className={`text-xs font-bold uppercase tracking-wider ${textMuted}`}>
                Saved Assessments ({quizzes.length})
              </h4>
              <span className={`text-[10px] font-mono ${textMuted}`}>5 / page</span>
            </div>

            <div className="relative">
              <Search className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${textMuted}`} />
              <input
                type="text"
                placeholder="Search assessments..."
                value={quizSearch}
                onChange={(e) => { setQuizSearch(e.target.value); setQuizPage(1); }}
                className={`w-full pl-8 pr-3 py-1.5 rounded-xl text-xs border focus:outline-none ${inputCls}`}
              />
            </div>

            <div className="space-y-2.5">
              {paginatedQuizzes.map((q) => (
                <div 
                  key={q.id}
                  className={`p-3.5 rounded-2xl border text-xs transition space-y-2 ${subCardCls}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className={`font-bold block truncate max-w-[190px] ${textPrimary}`}>{q.title}</span>
                      <span className={`text-[11px] block font-mono ${textMuted}`}>
                        {q.questions.length}Q • {q.questions.reduce((sum, item) => sum + (item.marks || 10), 0)} pts • {Object.keys(q.participants || {}).length} attended
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleResumeAssessment(q)}
                        className={`px-2.5 py-1 font-bold rounded-lg border transition text-[11px] ${
                          isLight ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' : 'bg-cyan-600/20 text-cyan-300 border-cyan-500/30'
                        }`}
                        title="Open live telemetry & link"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => handleEditSavedQuiz(q)}
                        className={`p-1.5 rounded-lg border transition ${buttonSecCls}`}
                        title="Edit assessment"
                      >
                        <FileEdit className="w-3.5 h-3.5 text-amber-600" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteSavedQuiz(q.id, e)}
                        className={`p-1.5 rounded-lg border transition ${buttonSecCls}`}
                        title="Delete assessment"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredQuizzes.length === 0 && (
                <p className={`text-xs font-mono py-6 text-center ${textMuted}`}>
                  {quizzes.length === 0 ? 'No saved assessments yet.' : 'No assessments match search.'}
                </p>
              )}
            </div>

            {totalQuizPages > 1 && (
              <div className={`flex items-center justify-between pt-2 border-t text-xs font-mono ${isLight ? 'border-slate-200' : 'border-slate-800'} ${textMuted}`}>
                <span>Page {quizPage} of {totalQuizPages}</span>
                <div className="flex gap-1.5">
                  <button
                    disabled={quizPage === 1}
                    onClick={() => setQuizPage(p => Math.max(1, p - 1))}
                    className={`p-1.5 rounded-lg border disabled:opacity-30 ${buttonSecCls}`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={quizPage === totalQuizPages}
                    onClick={() => setQuizPage(p => Math.min(totalQuizPages, p + 1))}
                    className={`p-1.5 rounded-lg border disabled:opacity-30 ${buttonSecCls}`}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Question Bank Modal */}
      {isBankModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className={`max-w-2xl w-full border p-6 rounded-3xl space-y-5 shadow-2xl max-h-[85vh] flex flex-col ${cardCls}`}>
            <div className={`flex justify-between items-center border-b pb-3 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
              <div className="flex items-center gap-2 text-purple-600">
                <Database className="w-5 h-5" />
                <h3 className={`text-lg font-bold ${textPrimary}`}>Question Bank Repository</h3>
              </div>
              <button 
                onClick={() => setIsBankModalOpen(false)}
                className={`p-1 ${textMuted} hover:${textPrimary}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 relative">
                <Search className={`w-4 h-4 absolute left-3 top-3 ${textMuted}`} />
                <input
                  type="text"
                  placeholder="Search repository questions..."
                  value={bankSearchQuery}
                  onChange={(e) => setBankSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs border focus:outline-none ${inputCls}`}
                />
              </div>

              <div className="flex gap-1.5 text-xs">
                {(['all', 'mcq', 'fib', 'multi_fib'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setBankTypeFilter(type)}
                    className={`px-3 py-1.5 rounded-xl font-bold uppercase text-[10px] transition border ${
                      bankTypeFilter === type 
                        ? (isLight ? 'bg-purple-700 text-white border-purple-700' : 'bg-purple-600 text-white border-purple-600')
                        : buttonSecCls
                    }`}
                  >
                    {type.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {filteredBank.map((item) => (
                <div key={item.bankId} className={`p-4 rounded-2xl border flex justify-between items-start gap-4 ${subCardCls}`}>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase border ${buttonSecCls}`}>
                        {item.type}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        {item.marks || 10} Marks
                      </span>
                      <span className={`text-[10px] font-mono ${textMuted}`}>{item.createdAt}</span>
                    </div>
                    <p className={`text-xs font-semibold ${textPrimary}`}>{item.text}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { importFromBank(item); alert('Imported to current assessment!'); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5" /> Import
                    </button>
                    <button
                      onClick={() => deleteFromBank(item.bankId)}
                      className={`p-1.5 rounded-lg border transition ${buttonSecCls}`}
                      title="Delete from bank"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </button>
                  </div>
                </div>
              ))}
              {filteredBank.length === 0 && (
                <p className={`text-xs font-mono py-12 text-center ${textMuted}`}>
                  {questionBank.length === 0 
                    ? 'No questions in bank yet. Check "Also save copy to Question Bank" when adding questions.' 
                    : 'No questions match search.'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
