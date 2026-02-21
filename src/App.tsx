import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Zap, 
  Activity, 
  Settings, 
  Plus, 
  Send, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  ChevronRight,
  Database,
  Mail,
  Globe,
  BarChart3,
  ShieldCheck,
  RefreshCw,
  Clock,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { format } from 'date-fns';

// --- Types ---

interface Workflow {
  id: string;
  name: string;
  description: string;
  original_prompt: string;
  steps_json: string;
  created_at: string;
}

interface Execution {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at?: string;
  error_message?: string;
  steps?: ExecutionStep[];
}

interface ExecutionStep {
  id: string;
  execution_id: string;
  step_index: number;
  name: string;
  agent_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result_json?: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

interface Analytics {
  totalWorkflows: number;
  totalExecutions: number;
  successRate: number;
  statusBreakdown: { status: string; count: number }[];
}

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-4 w-full px-6 py-4 transition-all duration-200 group relative overflow-hidden",
      active 
        ? "bg-[#141414] text-[#E4E3E0]" 
        : "text-[#141414]/50 hover:bg-[#141414]/5 hover:text-[#141414]"
    )}
  >
    <Icon size={18} className={cn("transition-transform duration-200", active ? "scale-110" : "group-hover:scale-110")} />
    <span className="font-bold uppercase tracking-widest text-[10px]">{label}</span>
    {active && (
      <motion.div 
        layoutId="sidebar-active"
        className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"
      />
    )}
  </button>
);

const AgentIcon = ({ type, size = 16 }: { type: string, size?: number }) => {
  switch (type) {
    case 'data': return <Database size={size} className="text-blue-500" />;
    case 'communication': return <Mail size={size} className="text-purple-500" />;
    case 'integration': return <Globe size={size} className="text-emerald-500" />;
    case 'analysis': return <BarChart3 size={size} className="text-amber-500" />;
    case 'validation': return <ShieldCheck size={size} className="text-indigo-500" />;
    case 'recovery': return <RefreshCw size={size} className="text-rose-500" />;
    default: return <Zap size={size} className="text-zinc-500" />;
  }
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles = {
    completed: "bg-emerald-500 text-white",
    failed: "bg-rose-500 text-white",
    running: "bg-blue-500 text-white",
    pending: "bg-[#141414]/10 text-[#141414]/50",
  };
  return (
    <span className={cn("px-3 py-1 text-[9px] font-mono font-bold uppercase tracking-widest", styles[status as keyof typeof styles])}>
      {status}
    </span>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'workflows' | 'executions' | 'analytics'>('dashboard');
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    fetchData();
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    
    socket.onopen = () => {
      console.log('WebSocket connected');
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'execution_update' || data.type === 'step_update') {
          fetchData();
        }
      } catch (err) {
        console.error("WS message error:", err);
      }
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(socket);
    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, []);

  useEffect(() => {
    if (selectedExecution?.id) {
      fetchExecutionDetails(selectedExecution.id);
    }
  }, [selectedExecution?.id]);

  const fetchData = async () => {
    try {
      const [wRes, eRes, aRes] = await Promise.all([
        fetch('/api/workflows'),
        fetch('/api/executions'),
        fetch('/api/analytics/overview')
      ]);
      setWorkflows(await wRes.json());
      setExecutions(await eRes.json());
      setAnalytics(await aRes.json());
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  const fetchExecutionDetails = async (id: string) => {
    const res = await fetch(`/api/executions/${id}`);
    setSelectedExecution(await res.json());
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/workflows/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create workflow');
      }
      const data = await res.json();
      setWorkflows([data, ...workflows]);
      setPrompt('');
      setActiveTab('workflows');
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleExecute = async (workflowId: string) => {
    try {
      const res = await fetch('/api/executions/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId })
      });
      const { executionId } = await res.json();
      setActiveTab('executions');
      fetchExecutionDetails(executionId);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen bg-[#E4E3E0] text-[#141414] font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-[#141414] bg-[#E4E3E0] flex flex-col">
        <div className="p-8 border-b border-[#141414]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#141414] rounded-sm flex items-center justify-center">
              <Zap size={20} className="text-[#E4E3E0]" />
            </div>
            <h1 className="text-xl font-bold tracking-tighter uppercase">Nexus AI</h1>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <SidebarItem icon={Zap} label="Workflows" active={activeTab === 'workflows'} onClick={() => setActiveTab('workflows')} />
          <SidebarItem icon={Activity} label="Executions" active={activeTab === 'executions'} onClick={() => setActiveTab('executions')} />
          <SidebarItem icon={BarChart3} label="Analytics" active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
        </nav>

        <div className="p-4 border-t border-[#141414] bg-[#D6D5D2]">
          <div className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 h-8 rounded-full bg-[#141414]/10 border border-[#141414]/20" />
            <div className="flex-1">
              <div className="text-xs font-bold uppercase tracking-wider">System Admin</div>
              <div className="text-[10px] opacity-50 font-mono">v1.0.4-stable</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Background Grid */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#141414 1px, transparent 0)', backgroundSize: '40px 40px' }} />

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-12 space-y-12 relative z-10"
            >
              <header className="flex justify-between items-end border-b border-[#141414] pb-8">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] mb-4 opacity-50">Operational Overview</div>
                  <h2 className="text-6xl font-black tracking-tighter uppercase italic leading-none">Command Center</h2>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono mb-1">SYSTEM_UPTIME</div>
                  <div className="text-2xl font-mono font-bold">142:12:04:55</div>
                </div>
              </header>

              {/* Stats Grid */}
              <div className="grid grid-cols-4 border border-[#141414] divide-x divide-[#141414]">
                {[
                  { label: 'Workflows', value: analytics?.totalWorkflows || 0, icon: Zap },
                  { label: 'Executions', value: analytics?.totalExecutions || 0, icon: Activity },
                  { label: 'Success Rate', value: `${analytics?.successRate || 0}%`, icon: CheckCircle2 },
                  { label: 'Latency', value: '42ms', icon: Clock },
                ].map((stat, i) => (
                  <div key={i} className="p-8 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors group">
                    <div className="flex justify-between items-start mb-6">
                      <stat.icon size={20} className="opacity-50 group-hover:opacity-100" />
                      <div className="text-[10px] font-mono opacity-30 group-hover:opacity-50">0{i+1}</div>
                    </div>
                    <div className="text-4xl font-mono font-bold tracking-tighter mb-1">{stat.value}</div>
                    <div className="text-xs font-bold uppercase tracking-widest opacity-50 group-hover:opacity-100">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Quick Create */}
              <div className="border border-[#141414] bg-white p-10 shadow-[8px_8px_0px_0px_rgba(20,20,20,1)]">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] mb-6">Initialize New Autonomous Workflow</h3>
                <form onSubmit={handleCreateWorkflow} className="space-y-4">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe workflow objectives..."
                      className="w-full bg-[#F5F5F3] border border-[#141414] px-6 py-5 focus:outline-none focus:bg-white transition-all text-xl font-medium placeholder:italic placeholder:opacity-30"
                    />
                    {isCreating && (
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-3 text-xs font-mono font-bold">
                        <Loader2 className="animate-spin" size={16} />
                        PARSING_INTENT...
                      </div>
                    )}
                  </div>
                  {error && (
                    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono flex items-center gap-2">
                      <XCircle size={14} />
                      ERROR: {error}
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <div className="text-[10px] font-mono opacity-40 max-w-md">
                      Natural language inputs are processed via Gemini 3.1 Pro. 
                      Agents will be automatically provisioned based on detected requirements.
                    </div>
                    <button 
                      disabled={isCreating || !prompt.trim()}
                      className="bg-[#141414] text-[#E4E3E0] px-10 py-5 font-bold uppercase tracking-widest hover:bg-zinc-800 disabled:opacity-50 transition-all active:translate-x-1 active:translate-y-1 active:shadow-none"
                    >
                      Execute Generation
                    </button>
                  </div>
                </form>
              </div>

              {/* Recent Executions */}
              <div className="border border-[#141414]">
                <div className="px-8 py-4 border-b border-[#141414] bg-[#D6D5D2] flex justify-between items-center">
                  <h3 className="font-bold uppercase tracking-widest text-xs italic">Live Execution Feed</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-mono font-bold uppercase">System Live</span>
                  </div>
                </div>
                <div className="divide-y divide-[#141414]">
                  {executions.length === 0 ? (
                    <div className="p-12 text-center text-xs font-mono opacity-30 italic">No active execution history detected.</div>
                  ) : (
                    executions.slice(0, 5).map((exec) => (
                      <div 
                        key={exec.id} 
                        className="px-8 py-6 flex items-center justify-between hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors cursor-pointer group" 
                        onClick={() => { setSelectedExecution(exec); setActiveTab('executions'); fetchExecutionDetails(exec.id); }}
                      >
                        <div className="flex items-center gap-8">
                          <div className="text-xs font-mono opacity-30 group-hover:opacity-50">{exec.id.slice(0, 8)}</div>
                          <div>
                            <div className="font-bold uppercase tracking-tight text-lg">{exec.workflow_name}</div>
                            <div className="text-[10px] font-mono opacity-50 flex items-center gap-2">
                              <Clock size={10} /> {format(new Date(exec.started_at), 'yyyy-MM-dd HH:mm:ss')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-[10px] font-mono opacity-50 uppercase tracking-widest hidden md:block">
                            {exec.status === 'completed' ? 'Success' : exec.status === 'failed' ? 'Critical Failure' : 'In Progress'}
                          </div>
                          <StatusBadge status={exec.status} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'workflows' && (
            <motion.div
              key="workflows"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-12 space-y-12"
            >
              <header className="flex justify-between items-center border-b border-[#141414] pb-8">
                <h2 className="text-5xl font-black uppercase italic tracking-tighter">Workflow Assets</h2>
                <button 
                  onClick={() => setActiveTab('dashboard')}
                  className="border border-[#141414] px-6 py-3 font-bold uppercase text-xs tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                >
                  + New Asset
                </button>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-[#141414] border border-[#141414]">
                {workflows.map((workflow) => (
                  <div key={workflow.id} className="bg-[#E4E3E0] p-8 hover:bg-white transition-colors group flex flex-col h-full">
                    <div className="flex justify-between items-start mb-8">
                      <div className="w-12 h-12 bg-[#141414] flex items-center justify-center text-[#E4E3E0]">
                        <Zap size={24} />
                      </div>
                      <button 
                        onClick={() => handleExecute(workflow.id)}
                        className="w-10 h-10 border border-[#141414] flex items-center justify-center hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight mb-3">{workflow.name}</h3>
                    <p className="text-xs font-medium opacity-60 mb-8 flex-1 leading-relaxed">{workflow.description}</p>
                    
                    <div className="flex flex-wrap gap-1 mb-8">
                      {JSON.parse(workflow.steps_json).map((step: any, i: number) => (
                        <div key={i} className="px-2 py-1 bg-[#141414]/5 border border-[#141414]/10 flex items-center gap-1.5" title={step.name}>
                          <AgentIcon type={step.agentType} size={10} />
                          <span className="text-[9px] font-mono font-bold uppercase opacity-50">{step.agentType}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center pt-6 border-t border-[#141414]/10">
                      <span className="text-[10px] font-mono opacity-40">{format(new Date(workflow.created_at), 'yyyy.MM.dd')}</span>
                      <div className="text-[10px] font-bold uppercase tracking-widest opacity-30">Asset_{workflow.id.slice(0,4)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'executions' && (
            <motion.div
              key="executions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-full"
            >
              <div className="w-96 border-r border-[#141414] flex flex-col bg-[#D6D5D2]">
                <div className="p-8 border-b border-[#141414]">
                  <h2 className="text-2xl font-black uppercase italic tracking-tighter">History</h2>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-[#141414]/20">
                  {executions.map((exec) => (
                    <div 
                      key={exec.id} 
                      onClick={() => fetchExecutionDetails(exec.id)}
                      className={cn(
                        "p-6 transition-all cursor-pointer",
                        selectedExecution?.id === exec.id 
                          ? "bg-white" 
                          : "hover:bg-[#E4E3E0]"
                      )}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="font-bold uppercase tracking-tight text-sm">{exec.workflow_name}</div>
                        <StatusBadge status={exec.status} />
                      </div>
                      <div className="text-[10px] font-mono opacity-40 flex justify-between">
                        <span>{format(new Date(exec.started_at), 'HH:mm:ss')}</span>
                        <span>ID: {exec.id.slice(0, 8)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-white overflow-hidden">
                {selectedExecution ? (
                  <>
                    <div className="p-12 border-b border-[#141414] bg-[#E4E3E0]">
                      <div className="flex justify-between items-end mb-6">
                        <div>
                          <div className="text-[10px] font-mono opacity-40 mb-2">EXECUTION_ID: {selectedExecution.id}</div>
                          <h3 className="text-4xl font-black uppercase italic tracking-tighter leading-none">{selectedExecution.workflow_name}</h3>
                        </div>
                        <StatusBadge status={selectedExecution.status} />
                      </div>
                      <div className="flex gap-8 text-[10px] font-mono font-bold uppercase tracking-widest opacity-50">
                        <div className="flex items-center gap-2"><Clock size={12} /> Start: {format(new Date(selectedExecution.started_at), 'HH:mm:ss')}</div>
                        {selectedExecution.completed_at && (
                          <div className="flex items-center gap-2"><CheckCircle2 size={12} /> End: {format(new Date(selectedExecution.completed_at), 'HH:mm:ss')}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 p-12 overflow-y-auto space-y-1">
                      {selectedExecution.steps?.map((step, i) => (
                        <div key={step.id} className="flex gap-6 group">
                          <div className="flex flex-col items-center">
                            <div className={cn(
                              "w-8 h-8 flex items-center justify-center border border-[#141414] z-10",
                              step.status === 'completed' ? "bg-emerald-500 text-white" :
                              step.status === 'failed' ? "bg-rose-500 text-white" :
                              step.status === 'running' ? "bg-blue-500 text-white animate-pulse" :
                              "bg-[#E4E3E0] text-[#141414]/30"
                            )}>
                              <span className="text-[10px] font-mono font-bold">{i+1}</span>
                            </div>
                            {i < (selectedExecution.steps?.length || 0) - 1 && (
                              <div className="w-px h-full bg-[#141414]/10 my-1" />
                            )}
                          </div>

                          <div className="flex-1 pb-12">
                            <div className="border border-[#141414] p-6 group-hover:shadow-[4px_4px_0px_0px_rgba(20,20,20,1)] transition-all bg-[#F8F9FA]">
                              <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-3">
                                  <AgentIcon type={step.agent_type} size={16} />
                                  <span className="font-bold uppercase tracking-tight">{step.name}</span>
                                </div>
                                <div className="text-[9px] font-mono font-bold text-[#141414]/40 uppercase tracking-widest border border-[#141414]/10 px-2 py-0.5">
                                  {step.agent_type}_agent
                                </div>
                              </div>
                              
                              {step.status === 'completed' && step.result_json && (
                                <div className="mt-4 p-6 bg-[#141414] text-[#E4E3E0] text-xs font-mono overflow-x-auto">
                                  <div className="flex items-center gap-2 mb-4 opacity-30 border-b border-[#E4E3E0]/10 pb-2">
                                    <Database size={12} />
                                    <span>OUTPUT_DATA_STREAM</span>
                                  </div>
                                  <pre className="whitespace-pre-wrap leading-relaxed">{JSON.stringify(JSON.parse(step.result_json), null, 2)}</pre>
                                </div>
                              )}
                              
                              {step.status === 'failed' && (
                                <div className="mt-4 p-6 bg-rose-900 text-rose-100 text-xs font-mono border border-rose-500/50">
                                  <div className="flex items-center gap-2 mb-2 font-bold">
                                    <XCircle size={14} />
                                    <span>CRITICAL_STEP_FAILURE</span>
                                  </div>
                                  <p className="opacity-80">{step.error_message}</p>
                                </div>
                              )}

                              {step.status === 'running' && (
                                <div className="mt-4 flex items-center gap-3 text-[10px] font-mono font-bold uppercase tracking-widest opacity-40">
                                  <Loader2 size={12} className="animate-spin" />
                                  Processing_Instruction...
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-[#141414]/10 p-20 text-center">
                    <Activity size={120} className="mb-8" />
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter text-[#141414]/20">Awaiting Selection</h3>
                    <p className="max-w-xs text-xs font-mono uppercase tracking-widest">Select a historical or active execution trace to begin analysis.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'analytics' && (
             <motion.div
              key="analytics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-12 space-y-12"
            >
              <header className="border-b border-[#141414] pb-8">
                <h2 className="text-5xl font-black uppercase italic tracking-tighter">Performance Metrics</h2>
              </header>
              
              <div className="grid grid-cols-12 gap-8">
                <div className="col-span-8 border border-[#141414] p-10 bg-white">
                   <div className="flex justify-between items-center mb-10">
                    <h3 className="font-bold uppercase tracking-widest text-xs flex items-center gap-2"><Activity size={16} /> Throughput_Analysis_24H</h3>
                    <div className="text-[10px] font-mono opacity-40">UNIT: EXECUTIONS/HOUR</div>
                   </div>
                   <div className="h-80 flex items-end gap-3">
                      {[40, 65, 30, 85, 45, 90, 55, 70, 40, 60, 80, 50, 65, 40, 30, 75, 95, 60, 45, 80, 55, 70, 40, 50].map((h, i) => (
                        <div key={i} className="flex-1 bg-[#141414]/5 relative group h-full">
                          <motion.div 
                            initial={{ height: 0 }}
                            animate={{ height: `${h}%` }}
                            className="absolute bottom-0 left-0 right-0 bg-[#141414] transition-all group-hover:bg-blue-600"
                          />
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[8px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                            {h}
                          </div>
                        </div>
                      ))}
                   </div>
                   <div className="flex justify-between mt-6 text-[10px] font-mono opacity-40 uppercase tracking-widest">
                      <span>00:00</span>
                      <span>06:00</span>
                      <span>12:00</span>
                      <span>18:00</span>
                      <span>23:59</span>
                   </div>
                </div>

                <div className="col-span-4 border border-[#141414] p-10 bg-[#D6D5D2] flex flex-col">
                  <h3 className="font-bold uppercase tracking-widest text-xs mb-10 flex items-center gap-2"><ShieldCheck size={16} /> Reliability_Score</h3>
                  <div className="flex-1 flex flex-col justify-center gap-8">
                    {analytics?.statusBreakdown.map((item, i) => (
                      <div key={i} className="space-y-3">
                        <div className="flex justify-between text-[10px] font-mono font-bold uppercase tracking-widest">
                          <span>{item.status}</span>
                          <span>{item.count}</span>
                        </div>
                        <div className="h-1 bg-[#141414]/10 overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(item.count / analytics.totalExecutions) * 100}%` }}
                            className={cn(
                              "h-full",
                              item.status === 'completed' ? "bg-emerald-500" :
                              item.status === 'failed' ? "bg-rose-500" : "bg-blue-500"
                            )}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-10 pt-10 border-t border-[#141414]/10">
                    <div className="text-5xl font-black italic tracking-tighter leading-none mb-2">{analytics?.successRate}%</div>
                    <div className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-40">Aggregate_Success_Probability</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="border border-[#141414] p-10 bg-white">
                   <h3 className="font-bold uppercase tracking-widest text-xs mb-8">High_Frequency_Assets</h3>
                   <div className="space-y-2">
                      {workflows.slice(0, 3).map((w, i) => (
                        <div key={i} className="flex items-center justify-between p-5 border border-[#141414]/5 hover:border-[#141414] transition-all group cursor-pointer">
                          <div className="flex items-center gap-6">
                            <div className="text-xs font-mono opacity-20 group-hover:opacity-100">0{i+1}</div>
                            <span className="font-bold uppercase tracking-tight">{w.name}</span>
                          </div>
                          <div className="flex items-center gap-6 text-[10px] font-mono font-bold uppercase tracking-widest opacity-40">
                            <span>98.2%_REL</span>
                            <ArrowRight size={14} />
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
                <div className="bg-[#141414] text-[#E4E3E0] p-10 shadow-[8px_8px_0px_0px_rgba(214,213,210,1)] relative overflow-hidden flex flex-col justify-between">
                   <div className="relative z-10">
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter mb-4">Enterprise_Scale</h3>
                    <p className="text-xs opacity-50 mb-8 max-w-xs leading-relaxed">Unlock unlimited autonomous agents, custom model fine-tuning, and sub-millisecond execution latency.</p>
                    <button className="bg-[#E4E3E0] text-[#141414] px-8 py-4 font-bold uppercase text-xs tracking-widest hover:bg-white transition-colors">Upgrade_Infrastructure</button>
                   </div>
                   <Zap size={160} className="absolute -right-12 -bottom-12 text-white/5 rotate-12" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
