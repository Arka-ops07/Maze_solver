import { useState, useEffect, useRef } from 'react';
import { LogMessage } from '../types';
import { Terminal, Trash2, Filter, AlertTriangle, ShieldCheck } from 'lucide-react';

interface ConsoleLogsProps {
  logs: LogMessage[];
  onClear: () => void;
}

export default function ConsoleLogs({ logs, onClear }: ConsoleLogsProps) {
  const [filter, setFilter] = useState<string>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, filter]);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'ALL') return true;
    return log.type === filter;
  });

  return (
    <div id="logs-container" className="flex flex-col h-full bg-[#0a0a0a]/90 border border-[#222222] rounded p-2.5 shadow-none">
      <div className="flex items-center justify-between border-b border-[#111111] pb-1.5 mb-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[#00ff88] animate-pulse" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#00ff88]">
            Navigation Diagnostics Control
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onClear}
            className="p-1 text-neutral-500 hover:text-red-400 hover:bg-[#1a1a1a] rounded transition cursor-pointer"
            title="Clear Terminal Outputs"
          >
            <Trash2 className="w-3" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1 mb-2">
        {['ALL', 'SYSTEM', 'EXPLORE', 'GEAR', 'COMPRESSION', 'SPEEDRUN'].map((category) => (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={`px-1.5 py-0.5 rounded-sm text-[9px] font-mono font-medium transition cursor-pointer ${
              filter === category
                ? 'bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/30'
                : 'text-neutral-500 hover:text-[#00ff88] hover:bg-[#111111] border border-transparent'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Messages Output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800"
        style={{ minHeight: '120px', maxHeight: '180px' }}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-slate-500">
            <ShieldCheck className="w-6 h-6 mb-1 text-slate-600" />
            <span className="text-[10px]">NO ACTIVE LOGS IN CURRENT FILTERS</span>
          </div>
        ) : (
          filteredLogs.map((log) => {
            let color = 'text-slate-300';
            let label = '[SYS]';
            if (log.type === 'EXPLORE') {
              color = 'text-cyan-400';
              label = '[EXPL]';
            } else if (log.type === 'GEAR') {
              color = 'text-rose-400 font-bold';
              label = '[GEAR]';
            } else if (log.type === 'COMPRESSION') {
              color = 'text-teal-400';
              label = '[COMP]';
            } else if (log.type === 'SPEEDRUN') {
              color = 'text-amber-400';
              label = '[RUN ]';
            } else if (log.type === 'ERROR') {
              color = 'text-red-400 font-semibold';
              label = '[ERR ]';
            }

            return (
              <div key={log.id} className="flex items-start text-left shrink-0">
                <span className="text-slate-600 select-none mr-1.5">[{log.timestamp}]</span>
                <span className={`${color} mr-1.5 font-bold shrink-0`}>{label}</span>
                <span className="text-slate-300 break-words">{log.text}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
