'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loginUser, fetchAvailableUsers, UserPersona } from '../../lib/api';
import { Logo } from '../../components/brand/Logo';
import {
  Shield,
  Code2,
  User,
  Lock,
  Mail,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Eye,
  EyeOff,
  Zap,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'QUICK' | 'MANUAL'>('QUICK');
  const [email, setEmail] = useState('admin@coretrack.internal');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch all available seeded test personas
  const { data: availableUsers = [] } = useQuery({
    queryKey: ['availableUsers'],
    queryFn: fetchAvailableUsers,
  });

  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password?: string }) =>
      loginUser(credentials.email, credentials.password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      queryClient.invalidateQueries({ queryKey: ['currentUserPermissions'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['portfolioDashboard'] });
      router.push('/dashboard');
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || 'Login failed. Please check credentials.');
    },
  });

  const handleQuickLogin = (targetEmail: string) => {
    setErrorMessage(null);
    loginMutation.mutate({ email: targetEmail, password: 'password123' });
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email) {
      setErrorMessage('Please enter an email address.');
      return;
    }
    loginMutation.mutate({ email, password });
  };

  const personas = [
    {
      email: 'admin@coretrack.internal',
      role: 'Super Admin',
      tag: 'Full Access (0x1)',
      desc: 'Full bypass rights across all modules, projects, member roles, automations, and settings.',
      icon: Shield,
      accent: 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
      badge: 'bg-blue-600 text-white',
    },
    {
      email: 'engineer@coretrack.internal',
      role: 'Team Lead',
      tag: 'Technical Lead',
      desc: 'Can manage sprints, move Kanban tickets, link dependencies, view reports & all tasks table.',
      icon: Code2,
      accent: 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
      badge: 'bg-emerald-600 text-white',
    },
    {
      email: 'employee@coretrack.internal',
      role: 'Employee',
      tag: 'Service Desk Portal',
      desc: 'Can view dashboard, assigned board tasks, and submit service catalog tickets.',
      icon: User,
      accent: 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300',
      badge: 'bg-purple-600 text-white',
    },
  ];

  return (
    <div className="min-h-screen w-screen flex flex-col justify-center items-center p-4 bg-[#F5F6F8] dark:bg-[#111318] text-[#17191F] dark:text-[#F3F4F6] selection:bg-blue-100 selection:text-blue-900 transition-colors">
      {/* Background Decorative Blur Rings */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xl p-8 z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <Logo size="lg" showWordmark={true} />
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mt-4">
            Sign in to CoreTrack
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
            Enterprise Task Management, ITSM Ticketing &amp; Agile Delivery Platform
          </p>
        </div>

        {/* Tab Toggle: Quick Test Personas vs Manual Credentials */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('QUICK')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'QUICK'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>Quick Test Personas</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MANUAL')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'MANUAL'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            <span>Credentials</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* TAB 1: 1-CLICK QUICK TEST PERSONA LOGIN */}
        {activeTab === 'QUICK' && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-400 text-center font-medium mb-1">
              Select any pre-configured test account to sign in immediately:
            </p>

            {personas.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.email}
                  onClick={() => handleQuickLogin(p.email)}
                  className={`group p-4 rounded-2xl border transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 shadow-2xs hover:scale-[1.01] hover:border-blue-500 ${p.accent}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 shadow-2xs shrink-0">
                      <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {p.role}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${p.badge}`}>
                          {p.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {p.email}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 line-clamp-1">
                        {p.desc}
                      </p>
                    </div>
                  </div>

                  <div className="h-8 w-8 rounded-full bg-white dark:bg-slate-800 text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 dark:group-hover:bg-blue-950 flex items-center justify-center shrink-0 shadow-2xs transition">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 2: MANUAL CREDENTIALS LOGIN FORM */}
        {activeTab === 'MANUAL' && (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="name@coretrack.internal"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition shadow-2xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter test password (e.g. password123)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Tip: Test password <span className="font-mono font-semibold">password123</span> or any text works.
              </p>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => setEmail('admin@coretrack.internal')}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
              >
                Use admin email
              </button>
            </div>

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white text-xs font-bold shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loginMutation.isPending ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer Info */}
        <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 text-center text-[11px] text-slate-400">
          <p className="flex items-center justify-center gap-1.5 font-medium">
            <Zap className="h-3 w-3 text-emerald-500" />
            <span>Fastify 64-bit Bitmask RBAC Active</span>
          </p>
        </div>
      </div>
    </div>
  );
}
