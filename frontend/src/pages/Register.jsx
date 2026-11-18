import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const POPULAR_INTERESTS = [
  'Machine Learning',
  'Natural Language Processing',
  'Computer Vision',
  'Deep Learning',
  'Quantum Computing',
  'Bioinformatics',
  'Robotics',
  'Cybersecurity',
  'Human-Computer Interaction',
  'Data Science',
];

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [researchInterests, setResearchInterests] = useState([]);
  const [customInterest, setCustomInterest] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState('STUDENT');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState(null);

  const { register } = useAuth();

  // Password policy criteria
  const isLengthValid = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9\s]/.test(password);
  const isPasswordStrong =
    isLengthValid && hasUpper && hasLower && hasNumber && hasSpecial;

  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;

  const handleAddInterest = (tag) => {
    const trimmed = (tag || customInterest).trim();
    if (!trimmed) return;

    if (researchInterests.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      setError(`"${trimmed}" is already added.`);
      return;
    }

    if (researchInterests.length >= 20) {
      setError('You can add up to 20 research interests.');
      return;
    }

    if (trimmed.length > 50) {
      setError('Research interest cannot exceed 50 characters.');
      return;
    }

    setError('');
    setResearchInterests([...researchInterests, trimmed]);
    setCustomInterest('');
  };

  const handleRemoveInterest = (tagToRemove) => {
    setResearchInterests(researchInterests.filter((tag) => tag !== tagToRemove));
  };

  const handleKeyDownInterest = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddInterest();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (
      !fullName.trim() ||
      !email.trim() ||
      !affiliation.trim() ||
      !password ||
      !confirmPassword ||
      !role
    ) {
      setError('Please fill in all required fields.');
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
      await register({
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role,
        affiliation: affiliation.trim(),
        research_interests: researchInterests,
      });

      setRegisteredEmail(email.trim());
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (registeredEmail) {
    return (
      <div className="auth-shell">
        <div className="auth-card auth-card-wide text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg text-3xl text-white">
            ✉️
          </div>
          <h2 className="auth-title !text-2xl mb-2">
            Verify Your Email Address
          </h2>
          <p className="text-theme-secondary text-sm mb-4 leading-relaxed">
            Your account has been created successfully! We sent a verification link to:
          </p>
          <div className="p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg text-violet-300 font-semibold text-sm mb-6 break-all">
            {registeredEmail}
          </div>
          <p className="text-theme-muted text-xs mb-6">
            Please check your inbox and click the verification link to activate your account before logging in. If you don't see it, check your spam folder.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              to="/login"
              className="auth-submit"
            >
              Go to Sign In
            </Link>
            <Link
              to={`/verify-email?email=${encodeURIComponent(registeredEmail)}`}
              className="auth-secondary"
            >
              Verify Token or Resend Link
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      {/* Decorative background blobs */}
      <div className="hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
      </div>

      <div className="auth-card auth-card-wide">
        {/* Brand/Logo */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-2xl">📄</span>
          </div>
        </div>

        <h1 className="auth-title mb-1">
          Create an Account
        </h1>
        <p className="text-center text-theme-muted text-sm mb-6">
          Join <span className="font-semibold text-violet-400">Paper Explorer</span> today
        </p>

        {/* Error Alert */}
        {error && (
          <div className="flex items-start gap-2 auth-error mb-5">
            <span className="text-base leading-none mt-0.5">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Role Selection */}
          <div className="mb-5">
            <label className="auth-label">
              I am joining as a...
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* STUDENT Option */}
              <label
                className={`cursor-pointer border-2 rounded-xl p-3 text-center transition duration-200 ${
                  role === 'STUDENT'
                    ? 'border-violet-500 bg-violet-500/10 shadow-sm'
                    : 'border-theme-subtle hover:border-violet-400/50 hover:bg-theme-elevated'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="STUDENT"
                  checked={role === 'STUDENT'}
                  onChange={(e) => setRole(e.target.value)}
                  className="hidden"
                />
                <div className="text-xl">🎓</div>
                <div className="font-semibold text-theme-main text-sm mt-1">
                  Student
                </div>
                <div className="text-xs text-theme-muted mt-1">
                  Learning & exploring
                </div>
              </label>

              {/* RESEARCHER Option */}
              <label
                className={`cursor-pointer border-2 rounded-xl p-3 text-center transition duration-200 ${
                  role === 'RESEARCHER'
                    ? 'border-violet-500 bg-violet-500/10 shadow-sm'
                    : 'border-theme-subtle hover:border-violet-400/50 hover:bg-theme-elevated'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="RESEARCHER"
                  checked={role === 'RESEARCHER'}
                  onChange={(e) => setRole(e.target.value)}
                  className="hidden"
                />
                <div className="text-xl">🔬</div>
                <div className="font-semibold text-theme-main text-sm mt-1">
                  Researcher
                </div>
                <div className="text-xs text-theme-muted mt-1">
                  Publishing & collaborating
                </div>
              </label>
            </div>
            {role === 'RESEARCHER' && (
              <div className="mt-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 p-2.5 rounded-lg flex items-start gap-1.5">
                <span className="font-bold text-sm leading-none mt-0.5">ℹ️</span>
                <span>
                  Researcher accounts require an approved institutional email address (e.g. university or research institution domain).
                </span>
              </div>
            )}
          </div>

          {/* Full Name */}
          <div className="mb-4">
            <label
              htmlFor="fullName"
              className="auth-label"
            >
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted text-base">
                👤
              </span>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Jane Smith or Alex Doe"
                autoComplete="name"
                required
                className="auth-input pl-10"
              />
            </div>
          </div>

          {/* Email */}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="auth-label"
            >
              Email Address <span className="text-red-500">*</span>
              {role === 'RESEARCHER' && (
                <span className="text-xs font-normal text-violet-400 ml-1">
                  (Institutional email)
                </span>
              )}
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
                placeholder={role === 'RESEARCHER' ? 'jane@stanford.edu' : 'alex@example.com'}
                autoComplete="email"
                required
                className="auth-input pl-10"
              />
            </div>
          </div>

          {/* Affiliation / Institution */}
          <div className="mb-4">
            <label
              htmlFor="affiliation"
              className="auth-label"
            >
              Affiliation / Institution <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted text-base">
                🏛️
              </span>
              <input
                id="affiliation"
                type="text"
                value={affiliation}
                onChange={(e) => setAffiliation(e.target.value)}
                placeholder="e.g. Stanford University, MIT, Oxford, IISc"
                maxLength={255}
                required
                className="auth-input pl-10"
              />
            </div>
          </div>

          {/* Research Interests (Tags) */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="customInterest"
                className="auth-label inline"
              >
                Research Interests
              </label>
              <span className="text-xs text-theme-muted">
                {researchInterests.length}/20 added
              </span>
            </div>

            {/* Input + Add button */}
            <div className="flex gap-2 mb-2">
              <input
                id="customInterest"
                type="text"
                value={customInterest}
                onChange={(e) => setCustomInterest(e.target.value)}
                onKeyDown={handleKeyDownInterest}
                placeholder="Type an interest and press Enter or Add"
                maxLength={50}
                className="auth-input flex-1"
              />
              <button
                type="button"
                onClick={() => handleAddInterest()}
                disabled={!customInterest.trim() || researchInterests.length >= 20}
                className="px-4 py-2 bg-gradient-violet text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                + Add
              </button>
            </div>

            {/* Selected Tags Display */}
            {researchInterests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-theme-secondary border border-theme-subtle rounded-lg mb-2.5">
                {researchInterests.map((interest) => (
                  <span
                    key={interest}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-500/15 text-violet-300 rounded-full text-xs font-medium"
                  >
                    <span>{interest}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveInterest(interest)}
                      aria-label={`Remove ${interest}`}
                      className="hover:text-red-600 rounded-full focus:outline-none font-bold ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Popular Suggestions */}
            <div>
              <p className="text-xs text-theme-muted mb-1.5">Suggested interests (click to add):</p>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_INTERESTS.filter(
                  (item) => !researchInterests.some((t) => t.toLowerCase() === item.toLowerCase())
                ).slice(0, 7).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handleAddInterest(item)}
                    disabled={researchInterests.length >= 20}
                    className="text-xs px-2.5 py-1 border border-theme-subtle bg-theme-secondary hover:bg-violet-500/10 hover:border-violet-400/40 text-theme-secondary rounded-full transition disabled:opacity-50"
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="mb-3">
            <label
              htmlFor="password"
              className="auth-label"
            >
              Password <span className="text-red-500">*</span>
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

          {/* Confirm Password */}
          <div className="mb-5">
            <label
              htmlFor="confirmPassword"
              className="auth-label"
            >
              Confirm Password <span className="text-red-500">*</span>
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
                    ? 'border-theme-strong focus:ring-violet-500 focus:border-transparent'
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
                {passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
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
            {loading
              ? 'Creating Account...'
              : `Register as ${
                  role === 'STUDENT' ? 'Student' : 'Researcher'
                }`}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-[var(--border-strong)]" />
          <span className="px-3 text-xs text-theme-muted font-medium">OR</span>
          <div className="flex-1 h-px bg-[var(--border-strong)]" />
        </div>

        {/* Sign In CTA */}
        <p className="text-center text-sm text-theme-secondary">
          Already have an account?{' '}
          <Link
            to="/login"
            className="auth-link"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}