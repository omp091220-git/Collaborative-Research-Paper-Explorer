import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoConfig, setSsoConfig] = useState(null);

  const { login, getSsoConfig } = useAuth();
  const navigate = useNavigate();

  // Derive initial error from query params (e.g. SSO redirect errors)
  const [error, setError] = useState(() => {
    const errorParam = searchParams.get('error');
    const messageParam = searchParams.get('message');

    if (errorParam === 'session_expired') {
      return (
        messageParam ||
        'Your session has expired due to 30 minutes of inactivity. Please sign in again.'
      );
    } else if (errorParam === 'institutional_domain_required') {
      return (
        messageParam ||
        'Institutional email required: Your Google account domain is not authorized for institutional access.'
      );
    } else if (errorParam === 'sso_failed') {
      return (
        messageParam ||
        'Institutional SSO login failed. Please ensure you authorize the application or try again.'
      );
    } else if (errorParam) {
      return messageParam || `Authentication error (${errorParam}). Please try again.`;
    }
    return '';
  });

  // Fetch SSO configuration
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await getSsoConfig();
        setSsoConfig(config);
      } catch {
        // SSO config endpoint unavailable or disabled
        setSsoConfig({ enabled: false });
      }
    };
    fetchConfig();
  }, [getSsoConfig]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setUnverifiedEmail('');

    if (!email.trim() || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      const responseData = err.response?.data;
      if (responseData?.unverified) {
        setUnverifiedEmail(email.trim());
        setError(
          responseData.error ||
            'Your email address is not verified. Please verify your email before logging in.'
        );
      } else {
        setError(responseData?.error || 'Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSsoClick = () => {
    // Navigate to backend SSO endpoint which initiates OIDC authorization
    window.location.href = '/api/auth/sso/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-purple-100 font-sans p-4">
      {/* Decorative background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
      </div>

      <div className="relative bg-white/90 backdrop-blur-sm p-8 md:p-10 rounded-2xl shadow-2xl w-full max-w-md border border-white/50">
        {/* Brand/Logo */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-2xl">📄</span>
          </div>
        </div>

        <h1 className="text-2xl md:text-3xl font-extrabold text-center text-slate-900 mb-1">
          Welcome Back
        </h1>
        <p className="text-center text-slate-600 text-sm mb-6 font-medium">
          Sign in to continue to <span className="font-bold text-indigo-700">ScholarSphere</span>
        </p>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-5 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-base leading-none mt-0.5">⚠️</span>
              <div className="flex-1">
                <span>{error}</span>
                {unverifiedEmail && (
                  <div className="mt-2 pt-2 border-t border-red-200">
                    <Link
                      to={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`}
                      className="font-semibold underline hover:text-red-900 inline-block"
                    >
                      Resend verification email or enter token →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Institutional SSO Button */}
        {ssoConfig?.enabled && (
          <div className="mb-5">
            <button
              type="button"
              onClick={handleSsoClick}
              className="w-full py-2.5 px-4 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold shadow-sm hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100 transition flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{ssoConfig.buttonText || 'Sign in with Institutional SSO'}</span>
            </button>

            <div className="flex items-center my-5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="px-3 text-xs text-slate-400 font-medium">OR WITH PASSWORD</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className="mb-5">
            <label
              htmlFor="email"
              className="block mb-2 text-sm font-semibold text-slate-700"
            >
              Email Address
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">
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
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="password"
                className="text-sm font-semibold text-slate-700"
              >
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium transition"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">
                🔒
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full pl-10 pr-11 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm focus:outline-none"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold shadow-md hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg active:scale-[0.99] transition duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="px-3 text-xs text-slate-400 font-medium">OR</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Register CTA */}
        <p className="text-center text-sm text-slate-600">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="text-indigo-600 font-semibold hover:text-indigo-800 hover:underline transition"
          >
            Create one
          </Link>
        </p>

        {/* Verify Email link */}
        <p className="text-center text-xs text-slate-400 mt-3">
          Need to verify your email?{' '}
          <Link
            to="/verify-email"
            className="text-slate-600 hover:text-indigo-600 underline transition"
          >
            Verify here
          </Link>
        </p>
      </div>
    </div>
  );
}