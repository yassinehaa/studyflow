import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  Trash2,
  Settings,
  LayoutDashboard,
  BrainCircuit,
  LogOut,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  Target,
  ArrowRight,
  BarChart3,
  Pause,
  Play,
  Sparkles,
  Loader2,
  Pencil
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { api } from './api';
import { User, Subject, Topic, Availability, Risk, PlanItem, OptimizerData } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { callGroq } from './groq';
import { AICoachChat } from './components/AICoachChat';
import { QuizModal } from './components/QuizModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- UI Components ---

const Card = ({ children, className, title, subtitle, icon: Icon }: { children: React.ReactNode, className?: string, title?: string, subtitle?: string, icon?: any }) => (
  <div className={cn("bg-white rounded-[2.5rem] border border-zinc-200/50 shadow-[0_8px_30px_rgb(0,0,0,0.02)] overflow-hidden flex flex-col", className)}>
    {(title || subtitle) && (
      <div className="px-10 py-8 border-b border-zinc-100/80 flex items-center justify-between">
        <div>
          {title && <h3 className="text-lg font-bold text-zinc-900 tracking-tight">{title}</h3>}
          {subtitle && <p className="text-sm text-zinc-400 font-medium mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="p-3 bg-zinc-50 rounded-2xl text-zinc-400">
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    )}
    <div className="p-10 flex-1">{children}</div>
  </div>
);

const Button = ({ children, onClick, variant = 'primary', className, disabled, type = 'button' }: { children: React.ReactNode, onClick?: (e: React.MouseEvent) => void, variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'emerald', className?: string, disabled?: boolean, type?: 'button' | 'submit' }) => {
  const variants = {
    primary: 'bg-zinc-900 text-white hover:bg-zinc-800 shadow-lg shadow-zinc-900/10 active:scale-[0.98]',
    secondary: 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50 active:scale-[0.98]',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 active:scale-[0.98]',
    ghost: 'bg-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 active:scale-[0.98]',
    emerald: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/10 active:scale-[0.98]'
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn("px-6 py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed", variants[variant], className)}
    >
      {children}
    </button>
  );
};

const Input = ({ label, ...props }: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="space-y-2">
    {label && <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">{label}</label>}
    <input
      {...props}
      className="input-base"
    />
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<'dashboard' | 'subjects' | 'availability'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [optimizerData, setOptimizerData] = useState<OptimizerData | null>(null);
  const [aiAdvice, setAiAdvice] = useState<string>("");
  const [isAuthMode, setIsAuthMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      fetchData();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchData = async () => {
    try {
      const data = await api.get('/api/optimizer/plan');
      setOptimizerData(data);

      // Generate AI Advice on the frontend
      const highRiskSubject = data.risks.find((r: any) => r.riskLevel === 'HIGH') || data.risks.find((r: any) => r.riskLevel === 'MEDIUM');
      if (highRiskSubject) {
        generateAIAdvice(highRiskSubject);
      } else {
        setAiAdvice("Your plan is well-balanced. Keep up the good work!");
      }
    } catch (e: any) {
      if (e.message?.includes('403') || e.message?.includes('401') || e.message?.includes('Session expired')) {
        logout();
      } else {
        console.error("Fetch data error:", e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const generateAIAdvice = async (riskData: any) => {
    const apiKey = process.env.VITE_GROQ_API_KEY;
    if (!apiKey) {
      setAiAdvice("AI Coach: Please configure your VITE_GROQ_API_KEY.");
      return;
    }

    try {
      const { subjectName, riskLevel, daysLeft, totalRequired, totalAvailable, weakTopics } = riskData;

      const prompt = `Analyze this student's study situation for ${subjectName}:
- Risk Level: ${riskLevel}
- Days Remaining: ${daysLeft}
- Hours Required: ${totalRequired?.toFixed(1)}
- Hours Available: ${totalAvailable?.toFixed(1)}
- Weak Topics: ${weakTopics || 'None specified'}`;

      const responseText = await callGroq([
        { role: "system", content: `You are an elite academic performance coach. Be concise, tactical, and motivating. Keep responses to max 3-4 sentences. Respond in the same language as the subject name: "${subjectName}".` },
        { role: "user", content: prompt }
      ], {
        temperature: 0.7
      });

      if (responseText) {
        setAiAdvice(responseText.trim());
      }
    } catch (error: any) {
      console.error("Groq AI Error:", error.message);
      // Fallback
      if (riskData.riskLevel === 'HIGH') {
        setAiAdvice(`Strategy: Your ${riskData.subjectName} exam is approaching and you have a deficit of ${(riskData.totalRequired - riskData.totalAvailable).toFixed(1)} hours. Prioritize high-impact topics.`);
      } else {
        setAiAdvice("Focus on your highest priority topics first today to bridge the gap.");
      }
    }
  };

  const handleAuth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    try {
      const endpoint = isAuthMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await api.post(endpoint, { username, password });
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      setUser(res.user);
      fetchData();
    } catch (e: any) {
      alert(e.message || "Authentication failed. Please check your credentials.");
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setOptimizerData(null);
    setAiAdvice("");
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
        <p className="text-sm font-medium text-zinc-500">Optimizing your plan...</p>
      </div>
    </div>
  );

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-zinc-900 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-zinc-900/20">
              <BrainCircuit className="text-white w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">StudyFlow AI</h1>
            <p className="text-zinc-500 mt-2">Intelligent exam strategy optimizer</p>
          </div>

          <Card className="p-8">
            <form onSubmit={handleAuth} className="space-y-5">
              <Input name="username" label="Username" placeholder="Enter your username" required />
              <Input name="password" label="Password" type="password" placeholder="••••••••" required />
              <Button type="submit" className="w-full h-12 text-base mt-2">
                {isAuthMode === 'login' ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-8 pt-6 border-t border-zinc-100 text-center">
              <button
                onClick={() => setIsAuthMode(isAuthMode === 'login' ? 'register' : 'login')}
                className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                {isAuthMode === 'login' ? "New here? Create an account" : "Already have an account? Sign in"}
              </button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-80 bg-white border-r border-zinc-200/60 flex flex-col sticky top-0 h-auto md:h-screen z-30">
        <div className="p-10 flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-900 rounded-[1.25rem] flex items-center justify-center shadow-xl shadow-zinc-900/20">
            <BrainCircuit className="text-white w-7 h-7" />
          </div>
          <span className="font-black text-2xl text-zinc-900 tracking-tighter">StudyFlow</span>
        </div>

        <nav className="flex-1 px-6 space-y-3 mt-4">
          <SidebarItem
            active={view === 'dashboard'}
            onClick={() => setView('dashboard')}
            icon={<LayoutDashboard size={20} />}
            label="Dashboard"
          />
          <SidebarItem
            active={view === 'subjects'}
            onClick={() => setView('subjects')}
            icon={<BookOpen size={20} />}
            label="Curriculum"
          />
          <SidebarItem
            active={view === 'availability'}
            onClick={() => setView('availability')}
            icon={<Settings size={20} />}
            label="Capacity"
          />
        </nav>

        <div className="p-8 mt-auto border-t border-zinc-100/80">
          <div className="flex items-center gap-4 px-2 mb-8">
            <div className="w-12 h-12 bg-zinc-50 rounded-2xl flex items-center justify-center text-sm font-black text-zinc-900 border border-zinc-200/60 shadow-sm">
              {user.username[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-zinc-900 truncate">{user.username}</p>
              <p className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest">Study Planner</p>
            </div>
          </div>
          <Button variant="ghost" onClick={logout} className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50 rounded-2xl h-14">
            <LogOut size={18} /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 lg:p-12 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                  <h2 className="text-5xl font-black text-zinc-900 tracking-tighter">Dashboard</h2>
                  <p className="text-zinc-400 mt-3 text-xl font-medium italic">Your optimized strategy for {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</p>
                </div>
                <div className="bg-white px-6 py-4 rounded-3xl border border-zinc-200/60 shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 bg-zinc-50 rounded-xl flex items-center justify-center text-zinc-400">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-black text-zinc-900 uppercase tracking-widest">{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</span>
                </div>
              </header>

              {/* Stats Bento Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  label="Daily Study Goal"
                  value={`${(optimizerData?.todayPlan || []).reduce((s, p) => s + p.hours, 0).toFixed(1)}h`}
                  subtext="Scheduled for today"
                  icon={Clock}
                  color="zinc"
                />
                <StatCard
                  label="Risk Level"
                  value={(optimizerData?.risks || []).filter(r => r.riskLevel === 'HIGH').length || 0}
                  subtext="High risk subjects"
                  icon={AlertTriangle}
                  color="amber"
                  isRisk
                />
                <StatCard
                  label="Mastery Progress"
                  value={(() => {
                    const topics = optimizerData?.scoredTopics || [];
                    if (topics.length === 0) return '0%';
                    const totalStudied = topics.reduce((acc: number, t: any) => acc + (t.studied_minutes || 0), 0);
                    const totalRequired = topics.reduce((acc: number, t: any) => acc + (t.required_minutes > 0 ? t.required_minutes : t.base_required_minutes || 300), 0);
                    if (totalRequired === 0) return '0%';
                    return `${Math.min(100, Math.round((totalStudied / totalRequired) * 100))}%`;
                  })()}
                  subtext="Total mastery across all topics"
                  icon={Target}
                  color="emerald"
                />
                <StatCard
                  label="Active Subjects"
                  value={(optimizerData?.risks || []).length || 0}
                  subtext="Currently tracking"
                  icon={BookOpen}
                  color="blue"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Today's Plan */}
                <div className="lg:col-span-2 space-y-6">
                  <Card title="Today's Focus Plan" subtitle="AI-prioritized study sessions" icon={TrendingUp} className="neo-shadow">
                    <div className="space-y-5">
                      {(optimizerData?.todayPlan || []).map((item, i) => (
                        <motion.div
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
                          key={item.topicId}
                          className="group flex items-center justify-between p-6 bg-zinc-50/50 hover:bg-white rounded-[2.5rem] transition-all border border-transparent hover:border-zinc-100 hover:shadow-xl hover:shadow-zinc-900/5"
                        >
                          <div className="flex items-center gap-6">
                            <div className="w-16 h-16 bg-white rounded-[1.5rem] flex items-center justify-center text-zinc-900 font-black text-lg shadow-sm border border-zinc-100 group-hover:scale-110 transition-transform duration-300">
                              {Math.round(item.hours * 60)}m
                            </div>
                            <div>
                              <p className="font-black text-xl text-zinc-900 tracking-tight">{item.topicName}</p>
                              <p className="text-[10px] text-zinc-400 font-black uppercase tracking-[0.2em] mt-1.5 italic">{item.subjectName}</p>
                            </div>
                          </div>
                          <div className="w-12 h-12 rounded-2xl bg-zinc-50 flex items-center justify-center text-zinc-300 group-hover:bg-zinc-900 group-hover:text-white transition-all">
                            <ChevronRight className="w-6 h-6" />
                          </div>
                        </motion.div>
                      ))}
                      {(optimizerData?.todayPlan || []).length === 0 && (
                        <div className="text-center py-12 bg-zinc-50 rounded-3xl border border-dashed border-zinc-200">
                          <p className="text-zinc-400 font-medium">No sessions scheduled for today. Rest up!</p>
                        </div>
                      )}
                    </div>
                  </Card>

                  <Card title="Risk Visibility" subtitle="Required vs Available hours per subject" icon={BarChart3} className="neo-shadow">
                    <div className="h-[350px] w-full mt-8">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={optimizerData?.risks || []} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#f0f0f0" />
                          <XAxis
                            dataKey="subjectName"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: '#a1a1aa', fontSize: 10, fontWeight: 800 }}
                            interval={0}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis hide />
                          <Tooltip
                            cursor={{ fill: '#f8f9fa', radius: 12 }}
                            contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 40px -10px rgb(0 0 0 / 0.1)', padding: '20px' }}
                            formatter={(value: any, name: string) => [`${Number(value).toFixed(1)}h`, name]}
                          />
                          <Bar dataKey="totalRequired" name="Required Hours" radius={[12, 12, 0, 0]} barSize={28}>
                            {(optimizerData?.risks || []).map((entry, index) => (
                              <Cell key={`req-${index}`} fill={entry.riskLevel === 'HIGH' ? '#ef4444' : entry.riskLevel === 'MEDIUM' ? '#f59e0b' : '#10b981'} />
                            ))}
                          </Bar>
                          <Bar dataKey="totalAvailable" name="Available Hours" radius={[12, 12, 0, 0]} barSize={28} fill="#e4e4e7" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-6 mt-4 px-2">
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /><span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Required (Low)</span></div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-400" /><span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Required (Med)</span></div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Required (High)</span></div>
                      <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-zinc-200" /><span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Available</span></div>
                    </div>
                  </Card>
                </div>

                {/* AI Coach & Quick Actions */}
                <div className="space-y-8">
                  <AICoachChat optimizerData={optimizerData} initialAdvice={aiAdvice} />

                  <Card title="Risk Summary" subtitle="Subjects needing attention">
                    <div className="space-y-4">
                      {(optimizerData?.risks || []).map(risk => (
                        <div key={risk.subjectId} className="flex items-center justify-between p-4 rounded-2xl border border-zinc-100 bg-zinc-50/50">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-zinc-900 truncate">{risk.subjectName}</p>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase mt-0.5">{Math.round(risk.totalRequired * 60)}m remaining</p>
                          </div>
                          <div className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            risk.riskLevel === 'HIGH' ? "bg-red-100 text-red-700" :
                              risk.riskLevel === 'MEDIUM' ? "bg-amber-100 text-amber-700" :
                                "bg-emerald-100 text-emerald-700"
                          )}>
                            {risk.riskLevel}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'subjects' && (
            <motion.div
              key="subjects"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-5xl mx-auto space-y-10"
            >
              <header className="flex justify-between items-end">
                <div>
                  <h2 className="text-4xl font-bold text-zinc-900 tracking-tight">Subjects</h2>
                  <p className="text-zinc-500 mt-2 text-lg">Manage your curriculum and exam dates</p>
                </div>
                <AddSubjectModal onAdd={fetchData} />
              </header>

              <SubjectList
                subjects={optimizerData?.subjects || []}
                onUpdate={fetchData}
              />
            </motion.div>
          )}

          {view === 'availability' && (
            <motion.div
              key="availability"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl mx-auto space-y-10"
            >
              <header>
                <h2 className="text-4xl font-bold text-zinc-900 tracking-tight">Study Settings</h2>
                <p className="text-zinc-500 mt-2 text-lg">Configure your weekly study capacity and AI coach integration</p>
              </header>

              <AvailabilitySettings onUpdate={fetchData} />
              <ApiKeySettings />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-components ---

function SidebarItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-sm font-bold transition-all",
        active ? "bg-zinc-900 text-white shadow-xl shadow-zinc-900/10" : "text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"
      )}
    >
      <span className={cn("transition-colors", active ? "text-white" : "text-zinc-400")}>{icon}</span>
      {label}
    </button>
  );
}

function StatCard({ label, value, subtext, icon: Icon, color, isRisk }: { label: string, value: string | number, subtext: string, icon: any, color: string, isRisk?: boolean }) {
  const colors: any = {
    zinc: 'bg-zinc-900 text-white border-zinc-900',
    amber: 'bg-white text-zinc-900 border-zinc-200/60',
    emerald: 'bg-white text-zinc-900 border-zinc-200/60',
    blue: 'bg-white text-zinc-900 border-zinc-200/60'
  };

  const iconColors: any = {
    zinc: 'bg-white/10 text-white',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600'
  };

  return (
    <div className={cn("p-10 rounded-[3rem] border shadow-sm flex flex-col justify-between h-64 transition-all hover:shadow-md", colors[color])}>
      <div className="flex justify-between items-start">
        <div className={cn("p-4 rounded-2xl", iconColors[color])}>
          <Icon className="w-6 h-6" />
        </div>
        <span className={cn("text-[11px] font-bold uppercase tracking-[0.15em]", color === 'zinc' ? 'text-white/40' : 'text-zinc-400')}>
          {label}
        </span>
      </div>
      <div>
        <h4 className={cn("text-5xl font-extrabold tracking-tighter", isRisk && Number(value) > 0 ? "text-red-500" : "")}>{value}</h4>
        <p className={cn("text-sm mt-2 font-semibold", color === 'zinc' ? 'text-white/50' : 'text-zinc-500')}>{subtext}</p>
      </div>
    </div>
  );
}

function AddSubjectModal({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(true);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const subjectName = formData.get('name') as string;

    try {
      const subjectRes = await api.post('/api/subjects', {
        name: subjectName,
        exam_date: formData.get('exam_date')
      });

      if (autoGenerate && subjectRes.id) {
        const apiKey = process.env.VITE_GROQ_API_KEY;
        if (apiKey) {
          const prompt = `Break down the subject "${subjectName}" into 6-10 core topics for exam preparation.
For each topic, provide a name, a difficulty level (1-5), and estimated total study minutes required.
Ensure all topic names are in the same language as the subject name "${subjectName}".

You MUST respond with a JSON object containing a "topics" field which is an array of topics. Each topic object must have:
- "name": string
- "difficulty": number (1 to 5)
- "minutes": number

Example format:
{
  "topics": [
    { "name": "Introduction", "difficulty": 2, "minutes": 180 }
  ]
}`;

          const responseText = await callGroq([
            { role: "system", content: "You are a helpful curriculum assistant that outputs strictly valid JSON." },
            { role: "user", content: prompt }
          ], {
            response_format: { type: "json_object" },
            temperature: 0.5
          });

          const data = JSON.parse(responseText || "{}");
          const topics = data.topics || [];
          for (const t of topics) {
            await api.post(`/api/subjects/${subjectRes.id}/topics`, {
              name: t.name,
              difficulty: t.difficulty,
              base_required_minutes: t.minutes
            });
          }
        }
      }

      setOpen(false);
      onAdd();
    } catch (err: any) {
      console.error("Subject auto-generation error:", err);
      setError("AI Generation failed. The subject was created, but we couldn't auto-generate topics. Please check your VITE_GROQ_API_KEY.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button onClick={() => { setOpen(true); setError(null); }} className="rounded-2xl px-6"><Plus size={18} /> Add Subject</Button>
      {open && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <Card className="w-full max-w-md shadow-2xl" title="New Subject" subtitle="Add a subject and its exam date">
              <form onSubmit={handleSubmit} className="space-y-6">
                <Input name="name" label="Subject Name" placeholder="e.g. Advanced Mathematics" required />
                <Input name="exam_date" label="Exam Date" type="date" required />

                <div className="flex items-center gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                  <input
                    type="checkbox"
                    id="autoGen"
                    checked={autoGenerate}
                    onChange={(e) => setAutoGenerate(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                  />
                  <label htmlFor="autoGen" className="text-sm font-semibold text-zinc-700 cursor-pointer flex items-center gap-2">
                    <Sparkles size={14} className="text-emerald-500" />
                    Auto-generate core topics with AI
                  </label>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm">
                    <AlertTriangle size={16} className="flex-shrink-0" />
                    <p>{error}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1" disabled={isSubmitting}>Cancel</Button>
                  <Button type="submit" className="flex-1" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        {autoGenerate ? "Analyzing..." : "Creating..."}
                      </div>
                    ) : 'Create Subject'}
                  </Button>
                </div>
              </form>
            </Card>
          </motion.div>
        </div>
      )}
    </>
  );
}

function SubjectList({ subjects, onUpdate }: { subjects: any[], onUpdate: () => void }) {
  const [topics, setTopics] = useState<Record<number, Topic[]>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sessionModal, setSessionModal] = useState<{ topicId: number, topicName: string } | null>(null);
  const [quizModal, setQuizModal] = useState<{ topicId: number, topicName: string } | null>(null);
  const [quizPrompt, setQuizPrompt] = useState<{ topicId: number, topicName: string } | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [expandedGoalsTopic, setExpandedGoalsTopic] = useState<number | null>(null);
  const [topicGoals, setTopicGoals] = useState<Record<number, string[]>>({});
  const [loadingGoals, setLoadingGoals] = useState<number | null>(null);

  const fetchTopics = async (subjectId: number) => {
    try {
      const data = await api.get(`/api/subjects/${subjectId}/topics`);
      setTopics(prev => ({ ...prev, [subjectId]: data }));
    } catch (e) {
      console.error("Failed to fetch topics:", e);
    }
  };

  useEffect(() => {
    subjects.forEach(s => fetchTopics(s.id));
  }, [subjects]);

  const handleLogSession = async (topicId: number, duration: number) => {
    try {
      const res = await api.post('/api/study-sessions', { topic_id: topicId, duration_minutes: duration });
      if (res.insight) {
        setInsight(res.insight);
        setTimeout(() => setInsight(null), 8000);
      }
      onUpdate();
      subjects.forEach(s => fetchTopics(s.id));
      const topicName = sessionModal?.topicName || "";
      setSessionModal(null);
      // Show opt-in quiz prompt instead of forcing the quiz
      setQuizPrompt({ topicId, topicName });
    } catch (e) {
      console.error("Failed to log session:", e);
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [editTopic, setEditTopic] = useState<Topic | null>(null);

  const handleDeleteSubject = async (subjectId: number) => {
    try {
      await api.delete(`/api/subjects/${subjectId}`);
      onUpdate();
      setDeleteConfirm(null);
    } catch (err: any) {
      console.error("Subject deletion failed:", err);
      alert(`Failed to delete subject: ${err.message}`);
    }
  };

  const [topicDeleteConfirm, setTopicDeleteConfirm] = useState<number | null>(null);

  const generateTopicGoals = async (topicId: number, topicName: string) => {
    // Toggle off if already expanded
    if (expandedGoalsTopic === topicId) {
      setExpandedGoalsTopic(null);
      return;
    }
    setExpandedGoalsTopic(topicId);

    // Use cached goals if available
    if (topicGoals[topicId]) return;

    setLoadingGoals(topicId);
    try {
      const apiKey = process.env.VITE_GROQ_API_KEY;
      if (!apiKey) {
        setTopicGoals(prev => ({ ...prev, [topicId]: ["VITE_GROQ_API_KEY not configured. Unable to generate goals."] }));
        return;
      }

      const prompt = `List the 5 most important learning goals a student should focus on when studying the topic "${topicName}".
Each goal should be a short, actionable sentence (max 15 words).
Ensure all goals are written in the same language as the topic name "${topicName}".

You MUST respond with a JSON object containing a "goals" field which is an array of strings.
Example format:
{
  "goals": [
    "Understand the basic concepts of X.",
    "Be able to apply formula Y to solve problems."
  ]
}`;

      const responseText = await callGroq([
        { role: "system", content: "You are a helpful study assistant that outputs strictly valid JSON." },
        { role: "user", content: prompt }
      ], {
        response_format: { type: "json_object" },
        temperature: 0.5
      });

      const data = JSON.parse(responseText || "{}");
      const goals = data.goals || [];
      setTopicGoals(prev => ({ ...prev, [topicId]: goals }));
    } catch (error: any) {
      console.error("Failed to generate goals:", error);
      setTopicGoals(prev => ({ ...prev, [topicId]: ["Failed to generate goals. Please try again."] }));
    } finally {
      setLoadingGoals(null);
    }
  };

  const handleDeleteTopic = async (topicId: number, subjectId: number) => {
    try {
      await api.delete(`/api/topics/${topicId}`);
      fetchTopics(subjectId);
      onUpdate();
      setTopicDeleteConfirm(null);
    } catch (err: any) {
      console.error("Topic deletion failed:", err);
      alert(`Failed to delete topic: ${err.message}`);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <AnimatePresence>
        {topicDeleteConfirm && (
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Card className="w-full max-w-sm shadow-2xl" title="Delete Topic" subtitle="This action cannot be undone.">
                <div className="space-y-6">
                  <p className="text-sm text-zinc-600 font-medium">Are you sure you want to delete this topic?</p>
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => setTopicDeleteConfirm(null)} className="flex-1">Cancel</Button>
                    <Button variant="danger" onClick={() => {
                      const topic = Object.values(topics).flat().find(t => t.id === topicDeleteConfirm);
                      if (topic) handleDeleteTopic(topic.id, topic.subject_id);
                    }} className="flex-1">Delete</Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Card className="w-full max-w-sm shadow-2xl" title="Confirm Delete" subtitle="This action cannot be undone.">
                <div className="space-y-6">
                  <p className="text-sm text-zinc-600 font-medium">Are you sure you want to delete this subject and all its topics?</p>
                  <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => setDeleteConfirm(null)} className="flex-1">Cancel</Button>
                    <Button variant="danger" onClick={() => handleDeleteSubject(deleteConfirm)} className="flex-1">Delete</Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        )}
        {insight && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4"
          >
            <div className="bg-zinc-950/90 backdrop-blur-2xl text-white p-8 rounded-[2.5rem] shadow-2xl border border-white/10 flex items-center gap-6 neo-shadow">
              <div className="p-4 bg-emerald-500/20 rounded-2xl">
                <BrainCircuit className="w-7 h-7 text-emerald-400" />
              </div>
              <p className="text-base font-bold leading-relaxed tracking-tight">{insight}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {subjects.map(s => (
        <Card key={s.id} className="group">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-900 border border-zinc-100 group-hover:bg-zinc-900 group-hover:text-white transition-all duration-300">
                <BookOpen size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-900">{s.name}</h3>
                <div className="flex items-center gap-4 mt-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    <Calendar size={12} /> Exam: {new Date(s.exam_date).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    <Target size={12} /> {topics[s.id]?.length || 0} Topics
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="rounded-2xl">
                {expanded === s.id ? 'Hide Topics' : 'Manage Topics'}
              </Button>
              <Button
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirm(s.id);
                }}
                className="rounded-2xl p-2.5"
              >
                <Trash2 size={18} />
              </Button>
            </div>
          </div>

          <AnimatePresence>
            {expanded === s.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-8 mt-8 border-t border-zinc-100">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-6">Mastery Inventory</h4>
                      <div className="space-y-4">
                        {topics[s.id]?.map(t => {
                          const mastery = Math.round(((t.studied_minutes || 0) / (t.required_minutes || 1)) * 100);
                          const isDelayed = t.predicted_completion_date && new Date(t.predicted_completion_date) > new Date(s.exam_date);
                          const isClose = t.predicted_completion_date &&
                            (new Date(s.exam_date).getTime() - new Date(t.predicted_completion_date).getTime()) < (2 * 24 * 60 * 60 * 1000);

                          return (
                            <div key={t.id} className="p-6 bg-zinc-50/50 rounded-[2.5rem] border border-zinc-100/80 space-y-5 transition-all hover:bg-white hover:shadow-xl hover:shadow-zinc-900/5 group/topic">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-5">
                                  <button
                                    onClick={async () => {
                                      await api.patch(`/api/topics/${t.id}`, { is_completed: !t.is_completed });
                                      fetchTopics(s.id);
                                      onUpdate();
                                    }}
                                    className={cn(
                                      "w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all",
                                      t.is_completed ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-200 bg-white group-hover/topic:border-zinc-400"
                                    )}
                                  >
                                    {t.is_completed && <CheckCircle2 size={16} />}
                                  </button>
                                  <button
                                    onClick={() => generateTopicGoals(t.id, t.name)}
                                    className="text-left group/name"
                                  >
                                    <div className="flex items-center gap-2">
                                      <p className={cn("text-base font-bold tracking-tight group-hover/name:text-emerald-600 transition-colors", t.is_completed && "line-through text-zinc-300")}>{t.name}</p>
                                      <ChevronDown size={14} className={cn("text-zinc-400 transition-transform duration-200", expandedGoalsTopic === t.id && "rotate-180")} />
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5">
                                      <span className={cn(
                                        "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                                        isDelayed ? "bg-red-50 text-red-600" : isClose ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                                      )}>
                                        {isDelayed ? 'At Risk' : isClose ? 'Slightly Delayed' : 'On Track'}
                                      </span>
                                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest italic">Difficulty {t.difficulty}/5</span>
                                    </div>
                                  </button>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover/topic:opacity-100 transition-opacity">
                                  <Button variant="secondary" onClick={() => setSessionModal({ topicId: t.id, topicName: t.name })} className="p-2.5 rounded-xl text-zinc-600 h-10 w-10">
                                    <Clock size={18} />
                                  </Button>
                                  <Button variant="secondary" onClick={() => setEditTopic(t)} className="p-2.5 rounded-xl text-zinc-600 h-10 w-10">
                                    <Pencil size={18} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    className="p-2.5 rounded-xl text-zinc-400 hover:text-red-500 h-10 w-10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTopicDeleteConfirm(t.id);
                                    }}
                                  >
                                    <Trash2 size={18} />
                                  </Button>
                                </div>
                              </div>

                              {/* Expandable Goals Section */}
                              <AnimatePresence>
                                {expandedGoalsTopic === t.id && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="pt-4 pb-2 px-2 border-t border-zinc-100/80 mt-2">
                                      <div className="flex items-center gap-2 mb-4">
                                        <Target size={14} className="text-emerald-500" />
                                        <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Key Learning Goals</span>
                                      </div>
                                      {loadingGoals === t.id ? (
                                        <div className="flex items-center gap-3 py-4">
                                          <Loader2 size={16} className="text-emerald-500 animate-spin" />
                                          <span className="text-xs text-zinc-400 font-medium">Generating goals...</span>
                                        </div>
                                      ) : (
                                        <ul className="space-y-2.5">
                                          {(topicGoals[t.id] || []).map((goal, idx) => (
                                            <motion.li
                                              key={idx}
                                              initial={{ opacity: 0, x: -10 }}
                                              animate={{ opacity: 1, x: 0 }}
                                              transition={{ delay: idx * 0.05 }}
                                              className="flex items-start gap-3 text-sm text-zinc-600 font-medium leading-relaxed"
                                            >
                                              <span className="w-5 h-5 mt-0.5 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                                              {goal}
                                            </motion.li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              <div className="space-y-3">
                                <div className="flex justify-between text-[10px] font-black text-zinc-400 uppercase tracking-[0.15em]">
                                  <div className="flex gap-4">
                                    <span className="text-zinc-900">Mastery {mastery}%</span>
                                    {t.mastery_score > 0 && (
                                      <span className="text-emerald-500">Quiz: {Math.round(t.mastery_score)}%</span>
                                    )}
                                  </div>
                                  <span>{Math.round(t.remaining_minutes || 0)}m remaining</span>
                                </div>
                                <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, mastery)}%` }}
                                    className={cn(
                                      "h-full transition-all",
                                      mastery >= 100 ? "bg-emerald-500" : isDelayed ? "bg-red-500" : "bg-zinc-900"
                                    )}
                                  />
                                </div>
                                {t.predicted_completion_date && (
                                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest text-right italic">
                                    Est. Completion: {new Date(t.predicted_completion_date).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {topics[s.id]?.length === 0 && <p className="text-sm text-zinc-400 italic">No topics added yet.</p>}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-6">Add New Topic</h4>
                      <AddTopicForm subjectId={s.id} onAdd={() => { fetchTopics(s.id); onUpdate(); }} />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      ))}

      {sessionModal && (
        <StudyTimerModal
          topicId={sessionModal.topicId}
          topicName={sessionModal.topicName}
          onClose={() => setSessionModal(null)}
          onComplete={handleLogSession}
        />
      )}

      {editTopic && (
        <EditTopicModal
          topic={editTopic}
          onClose={() => setEditTopic(null)}
          onSave={async (updates) => {
            await api.patch(`/api/topics/${editTopic.id}`, updates);
            setEditTopic(null);
            subjects.forEach(s => fetchTopics(s.id));
            onUpdate();
          }}
        />
      )}

      {subjects.length === 0 && (
        <div className="text-center py-24 bg-white rounded-[3rem] border border-dashed border-zinc-200">
          <BookOpen className="w-16 h-16 text-zinc-200 mx-auto mb-6" />
          <h3 className="text-2xl font-bold text-zinc-900">No subjects tracked</h3>
          <p className="text-zinc-500 mt-2 mb-8">Add your first subject to start optimizing your study plan.</p>
          <AddSubjectModal onAdd={onUpdate} />
        </div>
      )}

      {quizPrompt && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <Card className="w-full max-w-sm shadow-2xl" title="Session Complete! 🎉" subtitle="Want to test your knowledge?">
              <div className="space-y-6">
                <p className="text-sm text-zinc-600 font-medium">
                  Great work on <span className="font-bold text-zinc-900">"{quizPrompt.topicName}"</span>. Taking a quick quiz now helps reinforce what you just studied.
                </p>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setQuizPrompt(null)} className="flex-1">Skip</Button>
                  <Button variant="emerald" onClick={() => { setQuizModal({ topicId: quizPrompt.topicId, topicName: quizPrompt.topicName }); setQuizPrompt(null); }} className="flex-1">
                    <Sparkles size={16} /> Take Quiz
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      )}

      {quizModal && (
        <QuizModal
          topicId={quizModal.topicId}
          topicName={quizModal.topicName}
          onClose={() => setQuizModal(null)}
          onComplete={(score) => {
            setQuizModal(null);
            onUpdate();
            subjects.forEach(s => fetchTopics(s.id));
          }}
        />
      )}
    </div>
  );
}

function StudyTimerModal({ topicId, topicName, onClose, onComplete }: { topicId: number, topicName: string, onClose: () => void, onComplete: (id: number, duration: number) => void }) {
  const [duration, setDuration] = useState(25); // minutes
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (timeLeft === 0 && hasStarted) {
      setIsActive(false);
      setIsFinished(true);
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, hasStarted]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = (duration * 60 - timeLeft) / (duration * 60);
  const radius = 160;
  const circumference = 2 * Math.PI * radius;

  const handleStart = () => {
    setIsActive(true);
    setHasStarted(true);
  };

  const handleFinish = () => {
    const studiedMinutes = Math.round((duration * 60 - timeLeft) / 60);
    if (studiedMinutes > 0) {
      onComplete(topicId, studiedMinutes);
    } else {
      onClose();
    }
  };

  const handleCloseAttempt = () => {
    if (hasStarted && !isFinished) {
      if (confirm("Are you sure you want to abort? Your current session progress will be lost unless you click 'Complete' first.")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const changeDuration = (mins: number) => {
    if (!hasStarted) {
      setDuration(mins);
      setTimeLeft(mins * 60);
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950/95 backdrop-blur-3xl flex items-center justify-center z-50 p-6">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-3xl bg-zinc-900 rounded-[5rem] shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/5 relative overflow-hidden flex flex-col items-center justify-center p-12 md:p-20"
      >
        {/* Hardware Details */}
        <div className="absolute top-12 left-12 flex items-center gap-3">
          <div className={cn("w-2 h-2 rounded-full animate-pulse shadow-[0_0_10px_rgba(255,68,68,0.5)]", isActive ? "bg-red-500" : "bg-zinc-700")} />
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Status: {!hasStarted ? 'Idle' : isActive ? 'Focusing' : 'Paused'}</span>
        </div>
        <div className="absolute top-12 right-12">
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Model: SF-25-PRO</span>
        </div>

        {/* Duration Selector (Only visible before starting) */}
        {!hasStarted && (
          <div className="absolute top-32 flex gap-4 z-20">
            {[15, 25, 45, 60].map(m => (
              <button
                key={m}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  changeDuration(m);
                }}
                className={cn(
                  "px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all border shadow-lg",
                  duration === m
                    ? "bg-white text-zinc-900 border-white scale-110"
                    : "bg-zinc-800 text-zinc-500 border-white/5 hover:border-white/20 hover:text-zinc-300"
                )}
              >
                {m}m
              </button>
            ))}
          </div>
        )}

        {/* Radial Progress & Timer */}
        <div className="relative w-full max-w-md aspect-square flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 400 400">
            {/* Background Track */}
            <circle
              cx="200"
              cy="200"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-white/5"
            />
            {/* Dashed Track */}
            <circle
              cx="200"
              cy="200"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 8"
              className="text-white/10"
            />
            {/* Progress Bar */}
            <motion.circle
              cx="200"
              cy="200"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset: circumference * (1 - progress) }}
              transition={{ duration: 1, ease: "linear" }}
              className="text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            />
          </svg>

          <div className="relative flex flex-col items-center justify-center text-center">
            <span className="text-[5rem] md:text-[6.5rem] font-black tabular-nums leading-none tracking-tight text-white font-mono drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
              {minutes}<span className={cn(isActive ? "animate-pulse" : "")}>:</span>{seconds < 10 ? `0${seconds}` : seconds}
            </span>
            <div className="mt-2 space-y-1">
              <h3 className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.4em]">Current Objective</h3>
              <p className="text-lg font-bold text-zinc-300 tracking-tight max-w-[220px] truncate px-4">{topicName}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-16 w-full max-w-md grid grid-cols-2 gap-6">
          {!hasStarted ? (
            <button
              onClick={handleStart}
              className="col-span-2 h-20 rounded-[2rem] bg-white text-zinc-900 font-black uppercase tracking-widest text-xs hover:bg-zinc-100 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] flex items-center justify-center gap-3"
            >
              <Play size={18} />
              Start Session
            </button>
          ) : (
            <>
              <button
                onClick={() => setIsActive(!isActive)}
                className={cn(
                  "h-20 rounded-[2rem] font-black uppercase tracking-widest text-xs transition-all border flex items-center justify-center gap-3",
                  isActive
                    ? "bg-zinc-800 border-white/10 text-zinc-400 hover:bg-zinc-700"
                    : "bg-white border-white text-zinc-900 hover:bg-zinc-100 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
                )}
              >
                {isActive ? <Pause size={18} /> : <Play size={18} />}
                {isActive ? "Pause" : "Resume"}
              </button>
              <button
                onClick={handleFinish}
                className="h-20 rounded-[2rem] bg-emerald-500 border-emerald-400 text-white font-black uppercase tracking-widest text-xs hover:bg-emerald-400 transition-all shadow-[0_0_40px_rgba(16,185,129,0.2)] flex items-center justify-center gap-3"
              >
                <CheckCircle2 size={18} />
                Complete
              </button>
            </>
          )}
        </div>

        <button
          onClick={handleCloseAttempt}
          className="mt-10 text-zinc-600 hover:text-red-500 font-black uppercase tracking-[0.3em] text-[9px] transition-colors"
        >
          Abort Mission
        </button>

        {isFinished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-emerald-500/95 backdrop-blur-md flex flex-col items-center justify-center text-white p-16 z-20"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              className="p-10 bg-white/20 rounded-[4rem] mb-10 shadow-2xl"
            >
              <CheckCircle2 size={100} className="text-white" />
            </motion.div>
            <h2 className="text-6xl font-black mb-6 tracking-tighter">Session Secured</h2>
            <p className="text-emerald-50 text-center mb-16 text-xl font-medium max-w-sm leading-relaxed">
              Mastery successfully synchronized. Your study trajectory has been updated.
            </p>
            <Button onClick={handleFinish} className="bg-white text-emerald-600 hover:bg-emerald-50 w-full max-w-md h-24 text-xl rounded-[3rem] border-none font-black uppercase tracking-widest">
              Return to Base
            </Button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function AddTopicForm({ subjectId, onAdd }: { subjectId: number, onAdd: () => void }) {
  const [topicName, setTopicName] = useState('');
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [suggestions, setSuggestions] = useState<{ name: string, difficulty: number, minutes: number }[] | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await api.post(`/api/subjects/${subjectId}/topics`, {
      name: formData.get('name'),
      difficulty: parseInt(formData.get('difficulty') as string),
      base_required_minutes: parseInt(formData.get('base_required_minutes') as string)
    });
    setTopicName('');
    (e.target as HTMLFormElement).reset();
    onAdd();
  };

  const handleAiBreakdown = async () => {
    if (!topicName.trim()) return;

    const apiKey = process.env.VITE_GROQ_API_KEY;
    if (!apiKey) {
      alert("Please configure your VITE_GROQ_API_KEY to use AI breakdown.");
      return;
    }

    setIsBreakingDown(true);
    try {
      const prompt = `Break down the topic "${topicName}" into 5-8 granular subtopics for exam preparation.
For each subtopic, provide a name, a difficulty level (1-5), and estimated total study minutes required.
Ensure all subtopic names are in the same language as the topic name "${topicName}".

You MUST respond with a JSON object containing a "subtopics" field which is an array of objects. Each object must have:
- "name": string
- "difficulty": number (1 to 5)
- "minutes": number

Example format:
{
  "subtopics": [
    { "name": "Subtopic A", "difficulty": 3, "minutes": 60 }
  ]
}`;

      const responseText = await callGroq([
        { role: "system", content: "You are a helpful curriculum assistant that outputs strictly valid JSON." },
        { role: "user", content: prompt }
      ], {
        response_format: { type: "json_object" },
        temperature: 0.5
      });

      const data = JSON.parse(responseText || "{}");
      const subtopics = data.subtopics || [];
      setSuggestions(subtopics);
    } catch (error: any) {
      console.error("AI Breakdown Error:", error);
      alert("Failed to generate subtopics. Please check your VITE_GROQ_API_KEY configuration and try again. " + (error.message || ""));
    } finally {
      setIsBreakingDown(false);
    }
  };

  const handleAddAll = async () => {
    if (!suggestions) return;

    try {
      for (const s of suggestions) {
        await api.post(`/api/subjects/${subjectId}/topics`, {
          name: s.name,
          difficulty: s.difficulty,
          base_required_minutes: s.minutes
        });
      }
      setSuggestions(null);
      setTopicName('');
      onAdd();
    } catch (error) {
      console.error("Bulk Add Error:", error);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-8 bg-zinc-50/50 p-10 rounded-[3rem] border border-zinc-100/80">
        <div className="relative">
          <Input
            name="name"
            label="Topic Name"
            placeholder="e.g. Organic Chemistry"
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={handleAiBreakdown}
            disabled={isBreakingDown || !topicName.trim()}
            className="absolute right-4 bottom-4 p-2 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
          >
            {isBreakingDown ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AI Breakdown
          </button>
        </div>

        {!suggestions && (
          <>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Difficulty (1-5)</label>
                <select name="difficulty" defaultValue="3" className="input-base">
                  <option value="1">1 - Very Easy</option>
                  <option value="2">2 - Easy</option>
                  <option value="3">3 - Medium</option>
                  <option value="4">4 - Hard</option>
                  <option value="5">5 - Expert</option>
                </select>
              </div>
              <Input name="base_required_minutes" label="Base Minutes" type="number" defaultValue="300" placeholder="300" required />
            </div>
            <Button type="submit" className="w-full rounded-[1.5rem] h-14">Add Topic</Button>
          </>
        )}
      </form>

      {suggestions && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-900 rounded-[3rem] p-10 border border-white/5 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-1">
              <h3 className="text-white font-bold text-xl tracking-tight">AI Breakdown Suggestions</h3>
              <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest">Generated for "{topicName}"</p>
            </div>
            <Sparkles className="text-emerald-500" size={24} />
          </div>

          <div className="space-y-4 mb-10">
            {suggestions.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/5">
                <div className="space-y-1">
                  <p className="text-zinc-200 font-bold">{s.name}</p>
                  <div className="flex gap-4">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Diff: {s.difficulty}</span>
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Time: {s.minutes}m</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <Button onClick={handleAddAll} className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl h-16 font-bold uppercase tracking-widest text-xs">
              Add All Subtopics
            </Button>
            <Button onClick={() => setSuggestions(null)} variant="secondary" className="flex-1 rounded-2xl h-16 font-bold uppercase tracking-widest text-xs">
              Cancel
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function EditTopicModal({ topic, onClose, onSave }: { topic: Topic, onClose: () => void, onSave: (updates: any) => Promise<void> }) {
  const [name, setName] = useState(topic.name);
  const [difficulty, setDifficulty] = useState(String(topic.difficulty));
  const [minutes, setMinutes] = useState(String(Math.round(topic.base_required_minutes)));
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSave({ name, difficulty: parseInt(difficulty), base_required_minutes: parseInt(minutes) });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <Card className="w-full max-w-md shadow-2xl" title="Edit Topic" subtitle="Update topic details">
          <form onSubmit={handleSave} className="space-y-6">
            <Input label="Topic Name" value={name} onChange={e => setName(e.target.value)} required />
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Difficulty (1-5)</label>
                <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="input-base">
                  <option value="1">1 - Very Easy</option>
                  <option value="2">2 - Easy</option>
                  <option value="3">3 - Medium</option>
                  <option value="4">4 - Hard</option>
                  <option value="5">5 - Expert</option>
                </select>
              </div>
              <Input label="Base Minutes" type="number" value={minutes} onChange={e => setMinutes(e.target.value)} required />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}

function ApiKeySettings() {
  const [key, setKey] = useState(() => localStorage.getItem('GEMINI_API_KEY') || '');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (key.trim()) {
      localStorage.setItem('GEMINI_API_KEY', key.trim());
    } else {
      localStorage.removeItem('GEMINI_API_KEY');
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    window.dispatchEvent(new Event('storage'));
  };

  const handleClear = () => {
    localStorage.removeItem('GEMINI_API_KEY');
    setKey('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    window.dispatchEvent(new Event('storage'));
  };

  const hasEnvKey = !!process.env.GEMINI_API_KEY;
  const customKey = localStorage.getItem('GEMINI_API_KEY');

  let statusBadge = (
    <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700">
      Not Configured
    </span>
  );
  if (customKey) {
    statusBadge = (
      <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
        Using Custom Key
      </span>
    );
  } else if (hasEnvKey) {
    statusBadge = (
      <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-100 text-zinc-700">
        Using System Default
      </span>
    );
  }

  return (
    <Card
      title="Gemini AI Key Configuration"
      subtitle="Set your personal Gemini API Key for AI Strategy Coaching and Quiz features."
      icon={BrainCircuit}
      className="neo-shadow mt-10"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-zinc-900">Active API Key Status</span>
          {statusBadge}
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Gemini API Key</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={hasEnvKey ? "••••••••••••••••••••••••••••••••" : "AI Studio Gemini API Key"}
              className="input-base pr-20 text-zinc-900 placeholder:text-zinc-400"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 hover:text-zinc-600 tracking-wider uppercase"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <p className="text-[11px] text-zinc-400 font-medium leading-relaxed mt-1">
            Need an API key? You can get a free one from{" "}
            <a
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-900 underline hover:text-emerald-500 transition-colors"
            >
              Google AI Studio
            </a>.
          </p>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <Button onClick={handleSave} className="px-10">
            Save API Key
          </Button>
          {customKey && (
            <Button variant="secondary" onClick={handleClear} className="px-10">
              Reset to Default
            </Button>
          )}
          {saved && (
            <span className="text-sm font-bold text-emerald-600 flex items-center gap-2">
              <CheckCircle2 size={16} /> Saved!
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function AvailabilitySettings({ onUpdate }: { onUpdate: () => void }) {
  const [avail, setAvail] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  useEffect(() => {
    api.get('/api/availability')
      .then(data => {
        setAvail(data);
        setLoading(false);
      })
      .catch(e => {
        console.error("Failed to fetch availability:", e);
        setLoading(false);
      });
  }, []);

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const entry of avail) {
        await api.post('/api/availability', { day_of_week: entry.day_of_week, hours: entry.hours });
      }
      // Also save days that might not be in avail yet (0 hours days)
      for (let i = 0; i < 7; i++) {
        if (!avail.find(a => a.day_of_week === i)) {
          await api.post('/api/availability', { day_of_week: i, hours: 0 });
        }
      }
      onUpdate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Failed to save availability:", e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card title="Weekly Capacity" subtitle="Loading your schedule..." icon={Clock}>
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zinc-900"></div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Weekly Capacity" subtitle="How many hours can you study each day?" icon={Clock} className="neo-shadow">
      <div className="grid grid-cols-1 gap-4">
        {days.map((day, i) => {
          const currentHours = avail.find(a => a.day_of_week === i)?.hours ?? 0;
          return (
            <div key={day} className="flex items-center justify-between p-8 bg-zinc-50/50 rounded-[2.5rem] border border-zinc-100/80 transition-all hover:bg-white hover:border-zinc-200 hover:shadow-xl hover:shadow-zinc-900/5 group">
              <span className="font-black text-xl text-zinc-900 tracking-tight">{day}</span>
              <div className="flex items-center gap-6">
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="24"
                    value={currentHours}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setAvail(prev => {
                        const existing = prev.find(a => a.day_of_week === i);
                        if (existing) {
                          return prev.map(a => a.day_of_week === i ? { ...a, hours: val } : a);
                        }
                        return [...prev, { user_id: 0, day_of_week: i, hours: val }];
                      });
                    }}
                    className="w-32 px-6 py-4 bg-white border border-zinc-200 rounded-2xl text-center font-black text-xl text-zinc-900 focus:outline-none focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all"
                  />
                </div>
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Hours</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-8 pt-6 border-t border-zinc-100 flex items-center gap-4">
        <Button onClick={saveAll} disabled={saving} className="px-10">
          {saving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Save Schedule'}
        </Button>
        {saved && <span className="text-sm font-bold text-emerald-600 flex items-center gap-2"><CheckCircle2 size={16} /> Saved!</span>}
      </div>
    </Card>
  );
}
