'use client';

import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
}

export function Logo({ size = 'md', showWordmark = true }: LogoProps) {
  const sizeMap = {
    sm: { box: 'h-7 w-7', icon: 'h-4 w-4', text: 'text-sm' },
    md: { box: 'h-8 w-8', icon: 'h-4.5 w-4.5', text: 'text-base' },
    lg: { box: 'h-10 w-10', icon: 'h-5 w-5', text: 'text-lg' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className="flex items-center gap-2.5 group select-none">
      {/* Precision Geometric Vector Mark */}
      <div
        className={`${currentSize.box} rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs transition-transform duration-200 group-hover:scale-[1.03]`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={currentSize.icon}
        >
          {/* Coordinate Precision Track */}
          <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="2" />
          <path d="M7 14L11 10L14 13L17 9" />
          <circle cx="17" cy="9" r="1" fill="currentColor" />
        </svg>
      </div>

      {showWordmark && (
        <div className="flex items-center gap-1.5">
          <span className={`${currentSize.text} font-semibold tracking-tight text-slate-900 dark:text-slate-100`}>
            CoreTrack
          </span>
          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            v0.1
          </span>
        </div>
      )}
    </div>
  );
}
