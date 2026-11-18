import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  // Password policy criteria (consistent with Register.jsx and backend)
  const isLengthValid = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9\s]/.test(password);
  const isPasswordStrong =
    isLengthValid && hasUpper && hasLower && hasNumber && hasSpecial;

  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError(
        'Missing or invalid reset token. Please request a new password reset link.'
      );
      return;
    }

    if (!password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (!isPasswordStrong) {
      setError(
        'Password must be at least 8 characters long and contain uppercase, lowercase, a number, and a special character.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          'Failed to reset password. The token may be expired or already used.'
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
            <span className="text-2xl">🔐</span>
          </div>
        </div>

        <h1 className="auth-title mb-1">
          Set New Password
        </h1>
        <p className="auth-subtitle mb-8">
          Create a strong, new password for your account
        </p>

        {!token ? (
          /* ---------- Missing Token State ---------- */
          <div className="text-center space-y-4">
            <div className="auth-warn">
              <div className="text-2xl mb-2">⚠️</div>
              <p className="font-semibold mb-1">
                Invalid or Missing Reset Link
              </p>
              <p>
                No password reset token was found in the link. Please request a
                new password reset link.
              </p>
            </div>
            <Link
              to="/forgot-password"
              className="auth-submit !w-auto px-5"
            >
              Request New Reset Link →
            </Link>
          </div>
        ) : success ? (
          /* ---------- Success State ---------- */
          <div className="text-center space-y-4">
            <div className="auth-success">
              <div className="text-3xl mb-2">🎉</div>
              <p className="font-semibold mb-1">Password Reset Complete!</p>
              <p>
                Your password has been updated. Redirecting you to sign in...
              </p>
            </div>
            <Link
              to="/login"
              className="auth-submit !w-auto px-5"
            >
              Sign In Now →
            </Link>
          </div>
        ) : (
          /* ---------- Reset Form State ---------- */
          <form onSubmit={handleSubmit} noValidate>
            {/* Error Alert */}
            {error && (
              <div className="flex items-start gap-2 auth-error mb-5">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* New Password */}
            <div className="mb-3">
              <label
                htmlFor="password"
                className="auth-label"
              >
                New Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted text-base">
                  🔒
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  className="auth-input pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-secondary text-sm focus:outline-none"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Password Policy Guidelines */}
            <div className="mb-4 p-3 bg-theme-secondary border border-theme-subtle rounded-lg text-xs space-y-1.5">
              <p className="font-semibold text-theme-secondary mb-1">
                Password requirements:
              </p>
              <div
                className={`flex items-center gap-1.5 transition ${
                  isLengthValid
                    ? 'text-emerald-600 font-medium'
                    : 'text-theme-muted'
                }`}
              >
                <span>{isLengthValid ? '✓' : '○'}</span>
                <span>At least 8 characters long</span>
              </div>
              <div
                className={`flex items-center gap-1.5 transition ${
                  hasUpper && hasLower
                    ? 'text-emerald-600 font-medium'
                    : 'text-theme-muted'
                }`}
              >
                <span>{hasUpper && hasLower ? '✓' : '○'}</span>
                <span>Both uppercase (A-Z) and lowercase (a-z) letters</span>
              </div>
              <div
                className={`flex items-center gap-1.5 transition ${
                  hasNumber ? 'text-emerald-600 font-medium' : 'text-theme-muted'
                }`}
              >
                <span>{hasNumber ? '✓' : '○'}</span>
                <span>At least one number (0-9)</span>
              </div>
              <div
                className={`flex items-center gap-1.5 transition ${
                  hasSpecial ? 'text-emerald-600 font-medium' : 'text-theme-muted'
                }`}
              >
                <span>{hasSpecial ? '✓' : '○'}</span>
                <span>At least one special character (!@#$%^&*)</span>
              </div>
            </div>

            {/* Confirm New Password */}
            <div className="mb-5">
              <label
                htmlFor="confirmPassword"
                className="auth-label"
              >
                Confirm New Password
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted text-base">
                  🔒
                </span>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                  className={`w-full pl-10 pr-11 py-2.5 border auth-input text-theme-main placeholder-slate-400 focus:outline-none focus:ring-2 transition duration-200 ${
                    confirmPassword.length === 0
                      ? 'border-theme-strong focus:ring-indigo-500 focus:border-transparent'
                      : passwordsMatch
                      ? 'border-emerald-400 focus:ring-emerald-500 focus:border-transparent'
                      : 'border-red-300 focus:ring-red-500 focus:border-transparent'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={
                    showConfirmPassword ? 'Hide password' : 'Show password'
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-secondary text-sm focus:outline-none"
                >
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <p
                  className={`text-xs mt-1.5 ${
                    passwordsMatch ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {passwordsMatch
                    ? '✓ Passwords match'
                    : '✗ Passwords do not match'}
                </p>
              )}
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
              {loading ? 'Resetting Password...' : 'Reset Password'}
            </button>

            <p className="text-center mt-6 text-sm text-theme-secondary">
              <Link
                to="/login"
                className="auth-link"
              >
                ← Back to Sign In
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}