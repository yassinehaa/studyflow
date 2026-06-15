import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BrainCircuit, CheckCircle2, XCircle, Loader2, ArrowRight, Trophy, Sparkles } from 'lucide-react';
import { api } from '../api';
import { callGroq } from '../groq';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Question {
  question: string;
  options: string[];
  correctAnswerIndex: number;
}

interface QuizModalProps {
  topicId: number;
  topicName: string;
  onClose: () => void;
  onComplete: (score: number) => void;
}

export function QuizModal({ topicId, topicName, onClose, onComplete }: QuizModalProps) {
  const [quiz, setQuiz] = useState<Question[] | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    generateQuiz();
  }, [topicId]);

  const generateQuiz = async () => {
    setIsLoading(true);
    try {
      const apiKey = process.env.VITE_GROQ_API_KEY;
      if (!apiKey) {
        throw new Error("VITE_GROQ_API_KEY is not configured.");
      }

      const prompt = `Generate a 5-question multiple choice quiz for the topic "${topicName}". 
Ensure all questions and options are written in the same language as the topic name "${topicName}".

You MUST respond with a JSON object containing a "questions" field which is an array of objects. Each object must have:
- "question": string
- "options": array of exactly 4 strings
- "correctAnswerIndex": number (0-3)

Example format:
{
  "questions": [
    {
      "question": "What is 2+2?",
      "options": ["3", "4", "5", "6"],
      "correctAnswerIndex": 1
    }
  ]
}`;

      const responseText = await callGroq([
        { role: "system", content: "You are a helpful quiz generator that outputs strictly valid JSON." },
        { role: "user", content: prompt }
      ], {
        response_format: { type: "json_object" },
        temperature: 0.5
      });

      if (!responseText) throw new Error("No response from AI");

      const data = JSON.parse(responseText);
      const quizData = data.questions || [];
      if (!Array.isArray(quizData) || quizData.length === 0) {
        throw new Error("Quiz data is empty or invalid format");
      }
      setQuiz(quizData);
    } catch (error: any) {
      console.error("Failed to generate quiz:", error);
      alert("Failed to generate quiz. Please check your VITE_GROQ_API_KEY configuration. " + (error.message || ""));
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptionSelect = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
  };

  const handleConfirm = () => {
    if (selectedOption === null || isAnswered) return;
    setIsAnswered(true);
    if (selectedOption === quiz![currentQuestionIndex].correctAnswerIndex) {
      setScore(s => s + 1);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < quiz!.length - 1) {
      setCurrentQuestionIndex(i => i + 1);
      setSelectedOption(null);
      setIsAnswered(false);
    } else {
      setIsFinished(true);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const finalScore = (score / quiz!.length) * 100;
      await api.post('/api/quiz/submit', { topicId, score: finalScore });
      onComplete(finalScore);
    } catch (error) {
      console.error("Failed to submit quiz:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl flex items-center justify-center z-[60]">
        <div className="text-center space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full animate-pulse" />
            <BrainCircuit className="w-16 h-16 text-emerald-400 mx-auto animate-bounce relative z-10" />
          </div>
          <h3 className="text-2xl font-black text-white uppercase tracking-[0.2em]">Generating AI Quiz...</h3>
          <p className="text-zinc-500 font-bold tracking-widest uppercase text-xs">Analyzing topic: {topicName}</p>
          <div className="flex justify-center gap-2">
            {[1, 2, 3].map(i => <div key={i} className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}
          </div>
        </div>
      </div>
    );
  }

  if (isFinished) {
    const finalScore = Math.round((score / quiz!.length) * 100);
    return (
      <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl flex items-center justify-center z-[60] p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-xl bg-zinc-900 rounded-[4rem] border border-white/10 p-12 text-center space-y-8 shadow-2xl"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/10 blur-3xl rounded-full" />
            <Trophy className="w-20 h-20 text-emerald-400 mx-auto relative z-10" />
          </div>
          <div className="space-y-2">
            <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Quiz Complete!</h3>
            <p className="text-zinc-500 font-bold tracking-widest uppercase text-xs">Topic Mastery Performance</p>
          </div>

          <div className="py-12 bg-white/5 rounded-[3rem] border border-white/5">
            <div className="text-7xl font-black text-white mb-2">{finalScore}%</div>
            <div className="text-zinc-500 font-black uppercase tracking-[0.3em] text-[10px]">Score Achieved</div>
          </div>

          <div className="space-y-4">
            <p className="text-zinc-400 text-sm font-medium px-8">
              {finalScore >= 80 ? "Outstanding! Your mastery of this topic is solidifying." :
                finalScore >= 50 ? "Good progress. A few more sessions will help bridge the gaps." :
                  "Keep at it. Reviewing the core concepts will help improve your score."}
            </p>
            <p className="text-[10px] text-emerald-500/50 uppercase font-black tracking-widest">
              Mastery score updated in your strategy plan
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-6 bg-emerald-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-[0.2em] hover:bg-emerald-400 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="animate-spin" /> : "Finalize & Continue"}
            <ArrowRight size={20} />
          </button>
        </motion.div>
      </div>
    );
  }

  const currentQuestion = quiz![currentQuestionIndex];

  return (
    <div className="fixed inset-0 bg-zinc-950/90 backdrop-blur-xl flex items-center justify-center z-[60] p-6">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-3xl bg-zinc-900 rounded-[4rem] border border-white/10 overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="p-10 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-2xl">
              <Sparkles className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-black text-xl text-white tracking-tight">AI Mastery Quiz</h3>
              <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em]">{topicName}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-white">{currentQuestionIndex + 1}<span className="text-zinc-600">/{quiz!.length}</span></div>
            <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em]">Question</p>
          </div>
        </div>

        {/* Question Area */}
        <div className="p-12 space-y-10 flex-1">
          <h4 className="text-2xl font-bold text-white leading-tight">
            {currentQuestion.question}
          </h4>

          <div className="grid grid-cols-1 gap-4">
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedOption === index;
              const isCorrect = index === currentQuestion.correctAnswerIndex;
              const showResult = isAnswered;

              return (
                <button
                  key={index}
                  onClick={() => handleOptionSelect(index)}
                  disabled={showResult}
                  className={cn(
                    "p-6 rounded-3xl border text-left transition-all flex items-center justify-between group",
                    !showResult
                      ? isSelected
                        ? "bg-white/10 border-white/40 text-white ring-2 ring-white/20"
                        : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 text-zinc-300"
                      : isSelected && isCorrect
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                        : isSelected && !isCorrect
                          ? "bg-red-500/20 border-red-500 text-red-400"
                          : isCorrect
                            ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                            : "bg-white/5 border-white/5 opacity-50 text-zinc-500"
                  )}
                >
                  <span className="font-bold text-lg">{option}</span>
                  {showResult && isCorrect && <CheckCircle2 size={24} className="text-emerald-500" />}
                  {showResult && isSelected && !isCorrect && <XCircle size={24} className="text-red-500" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-10 bg-white/5 border-t border-white/5 flex justify-end">
          {!isAnswered ? (
            <button
              onClick={handleConfirm}
              disabled={selectedOption === null}
              className="px-10 py-5 bg-emerald-500 text-zinc-950 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-emerald-400 transition-all flex items-center gap-3 disabled:opacity-50"
            >
              Confirm Answer
              <CheckCircle2 size={18} />
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-10 py-5 bg-white text-zinc-950 rounded-2xl font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center gap-3"
            >
              {currentQuestionIndex === quiz!.length - 1 ? "Finish Quiz" : "Next Question"}
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
