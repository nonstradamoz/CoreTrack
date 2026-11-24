'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff, ArrowLeft, Home } from 'lucide-react';

interface AccessDeniedProps {
  module?: string;
  requiredRole?: string;
}

export function AccessDenied({ module, requiredRole }: AccessDeniedProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      {/* Icon */}
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900">
        <ShieldOff className="h-8 w-8 text-rose-500 dark:text-rose-400" />
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
        Access Denied
      </h1>

      {/* Sub */}
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-1">
        You don&apos;t have permission to access
        {module ? ` the ${module} module` : ' this page'}.
      </p>
      {requiredRole && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">
          Required role: <span className="font-semibold text-slate-600 dark:text-slate-300">{requiredRole}</span>
        </p>
      )}
      {!requiredRole && <div className="mb-6" />}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </button>
        <button
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition"
        >
          <Home className="h-4 w-4" />
          Dashboard
        </button>
      </div>

      {/* 403 label */}
      <p className="mt-8 text-[11px] font-mono text-slate-300 dark:text-slate-700">403 — Forbidden</p>
    </div>
  );
}
