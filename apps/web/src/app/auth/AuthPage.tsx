'use client';

import { useState } from 'react';
import { useAuthStore } from '@realestate-crm/hooks';

type Mode = 'login' | 'signup' | 'forgot';

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');

  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const enterDemoMode = useAuthStore((s) => s.enterDemoMode);
  const authError = useAuthStore((s) => s.authError);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setAuthError = useAuthStore((s) => s.setAuthError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setAuthError(null);

    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else if (mode === 'signup') {
        await signUp(email, password, displayName);
      } else {
        await resetPassword(email);
        setMessage('Check your email for a password reset link.');
      }
    } catch {
      // Error is set in the store
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setAuthError(null);
    setMessage('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-lg font-bold text-white">
            RE
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Real Estate CRM</h1>
          <p className="mt-1 text-sm text-gray-500">
            {mode === 'login' && 'Sign in to your account'}
            {mode === 'signup' && 'Create a new account'}
            {mode === 'forgot' && 'Reset your password'}
          </p>
        </div>

        {/* Form */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Your name"
                  required
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="you@example.com"
                required
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Enter password"
                  required
                  minLength={6}
                />
              </div>
            )}

            {authError && (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {authError}
              </p>
            )}
            {message && (
              <p className="rounded-lg bg-green-50 p-3 text-sm text-green-600">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {isLoading
                ? 'Loading...'
                : mode === 'login'
                  ? 'Sign In'
                  : mode === 'signup'
                    ? 'Create Account'
                    : 'Send Reset Link'}
            </button>
          </form>

          {/* Mode switches */}
          <div className="mt-4 space-y-2 text-center text-sm">
            {mode === 'login' && (
              <>
                <p className="text-gray-500">
                  Don&apos;t have an account?{' '}
                  <button
                    onClick={() => switchMode('signup')}
                    className="font-medium text-primary-500 hover:text-primary-600"
                  >
                    Sign up
                  </button>
                </p>
                <p>
                  <button
                    onClick={() => switchMode('forgot')}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    Forgot password?
                  </button>
                </p>
              </>
            )}
            {mode === 'signup' && (
              <p className="text-gray-500">
                Already have an account?{' '}
                <button
                  onClick={() => switchMode('login')}
                  className="font-medium text-primary-500 hover:text-primary-600"
                >
                  Sign in
                </button>
              </p>
            )}
            {mode === 'forgot' && (
              <p className="text-gray-500">
                <button
                  onClick={() => switchMode('login')}
                  className="font-medium text-primary-500 hover:text-primary-600"
                >
                  Back to sign in
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Demo mode */}
        <div className="mt-4 text-center">
          <button
            onClick={enterDemoMode}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Try Demo Mode
          </button>
          <p className="mt-2 text-xs text-gray-400">
            Explore with local data, no account needed
          </p>
        </div>
      </div>
    </div>
  );
}
