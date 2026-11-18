import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const { forgotPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    const emailRegex = /^[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const data = await forgotPassword(trimmedEmail);
      setSuccessMessage(
        data.message ||
          'If an account with that email exists, a password reset link has been sent.'
      );
    } catch (err) {
      setError(
        err.response?.data?.error ||
          'Unable to request password reset. Please try again later.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      {/* Decorative background blobs */}
      <div className="hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
      </div>

      <div className="auth-card">
        {/* Brand/Logo */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-2xl">🔑</span>
          </div>
        </div>

        <h1 className="auth-title mb-1">
          Forgot Password?
        </h1>
        <p className="auth-subtitle mb-8">
          No worries — we'll help you get back in
        </p>

        {successMessage ? (
          /* ---------- Success State ---------- */
          <div className="space-y-4">
            <div className="auth-success text-center">
              <div className="text-3xl mb-2">✉️</div>
              <p className="font-semibold mb-1">Check your inbox</p>
              <p>{successMessage}</p>
              <p className="text-xs text-emerald-600 mt-2">
                The link is valid for 15 minutes and can only be used once.
              </p>
            </div>

            <div className="text-center pt-2">
              <Link
                to="/login"
                className="auth-link text-sm"
              >
                ← Back to Sign In
              </Link>
            </div>
          </div>
        ) : (
          /* ---------- Form State ---------- */
          <form onSubmit={handleSubmit} noValidate>
            {/* Error Alert */}
            {error && (
              <div className="flex items-start gap-2 auth-error mb-5">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Email */}
            <div className="mb-6">
              <label
                htmlFor="email"
                className="auth-label"
              >
                Email Address
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted text-base">
                  ✉️
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="auth-input pl-10"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="auth-submit"
            >
              {loading && (
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              )}
              {loading ? 'Sending Reset Link...' : 'Send Reset Link'}
            </button>

            {/* Divider */}
            <div className="flex items-center my-6">
              <div className="flex-1 h-px bg-[var(--border-strong)]" />
              <span className="px-3 text-xs text-theme-muted font-medium">OR</span>
              <div className="flex-1 h-px bg-[var(--border-strong)]" />
            </div>

            <p className="text-center text-sm text-theme-secondary">
              Remember your password?{' '}
              <Link
                to="/login"
                className="auth-link"
              >
                Sign In
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}