import React from 'react';
import { useGlossary } from '../context/GlossaryContext';
import { TERM_CATEGORIES } from '../data/financialTerms';
import { BookOpen, X, Sparkles, Check } from 'lucide-react';

export const ContextualTermBanner: React.FC = () => {
  const { contextualTerm, dismissContextualTerm, openDrawer, toggleTermLearned, isTermLearned } = useGlossary();

  if (!contextualTerm) return null;

  const category = TERM_CATEGORIES[contextualTerm.c];
  const learned = isTermLearned(contextualTerm.id);

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-slate-900 border-2 border-amber-400 text-white rounded-3xl p-4 shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{category.icon}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>情境教學小學堂</span>
              </span>
            </div>
            <h4 className="text-sm font-black text-white mt-0.5">{contextualTerm.t}</h4>
          </div>
        </div>

        <button
          type="button"
          onClick={dismissContextualTerm}
          className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-slate-200 leading-relaxed mb-3 font-normal">{contextualTerm.s}</p>

      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => toggleTermLearned(contextualTerm.id)}
          className={`px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer border ${
            learned
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          <span>{learned ? '已掌握' : '學會了'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            dismissContextualTerm();
            openDrawer(contextualTerm.id, contextualTerm.c);
          }}
          className="flex-1 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black rounded-xl shadow-xs flex items-center justify-center gap-1 cursor-pointer active:scale-98"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>查看完整小學堂</span>
        </button>
      </div>
    </div>
  );
};
