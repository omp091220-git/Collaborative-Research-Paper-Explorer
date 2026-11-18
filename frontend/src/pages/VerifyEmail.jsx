import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const initialEmail = searchParams.get('email') || '';

  const { verifyEmail, resendVerification } = useAuth();

  const [verificationStatus, setVerificationStatus] = useState(token ? 'verifying' : 'idle');
  const [verificationMessage, setVerificationMessage] = useState('');
  
  const [resendEmail, setResendEmail] = useState(initialEmail);
  const [resendStatus, setResendStatus] = useState('idle'); // idle, sending, sent, error
  const [resendMessage, setResendMessage] = useState('');

  const verificationAttempted = useRef(false);

  useEffect(() => {
    if (!token || verificationAttempted.current) return;
    verificationAttempted.current = true;

    const runVerification = async () => {
      try {
        const res = await verifyEmail(token);
        setVerificationStatus('success');
        setVerificationMessage(res.message || 'Your email address has been verified successfully.');
      } catch (err) {
        setVerificationStatus('error');
        setVerificationMessage(
          err.response?.data?.error || 'Verification link is invalid or has expired.'
        );
      }
    };

    runVerification();
  }, [token, verifyEmail]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail.trim()) {
      setResendStatus('error');
      setResendMessage('Please enter your email address.');
      return;
    }

    setResendStatus('sending');
    setResendMessage('');

    try {
      const res = await resendVerification(resendEmail.trim());
      setResendStatus('sent');
      setResendMessage(
        res.message || 'If an account exists with this email, a verification link has been sent.'
      );
    } catch (err) {
      setResendStatus('error');
      setResendMessage(
        err.response?.data?.error || 'Unable to send verification email. Please try again later.'
      );
    }
  };

  return (
    <div className="auth-shell">
      {/* Decorative background blobs */}
      <div className="hidden">
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" />
      </div>

      <div className="auth-card text-center">
        {/* Brand / Logo */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-2xl">📄</span>
          </div>
        </div>

        {/* Verifying Spinner State */}
        {verificationStatus === 'verifying' && (
          <div className="py-8">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mb-4" />
            <h1 className="auth-title !text-xl mb-2">Verifying Your Email...</h1>
            <p className="text-theme-muted text-sm">Please wait while we confirm your email token.</p>
          </div>
        )}

        {/* Verification Success State */}
        {verificationStatus === 'success' && (
          <div className="py-4">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl font-bold shadow-sm">
              ✓
            </div>
            <h1 className="auth-title !text-2xl mb-2">Email Verified!</h1>
            <p className="text-theme-secondary text-sm mb-6 leading-relaxed">
              {verificationMessage}
            </p>
            <Link
              to="/login"
              className="inline-block auth-submit"
            >
              Sign In to Your Account
            </Link>
          </div>
        )}

        {/* Verification Error or Idle (Resend UI) */}
        {(verificationStatus === 'error' || verificationStatus === 'idle') && (
          <div>
            {verificationStatus === 'error' ? (
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center text-3xl shadow-sm">
                  ⚠️
                </div>
                <h1 className="auth-title !text-xl mb-2">
                  Verification Failed
                </h1>
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
                  {verificationMessage}
                </p>
              </div>
            ) : (
              <div className="mb-6">
                <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-3xl shadow-sm">
                  ✉️
                </div>
                <h1 className="auth-title !text-2xl mb-1">
                  Email Verification
                </h1>
                <p className="text-theme-muted text-sm">
                  Need a new verification link? Enter your email address below.
                </p>
              </div>
            )}

            {/* Resend Success Message */}
            {resendStatus === 'sent' && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg mb-4 text-sm text-left">
                <span className="text-base leading-none mt-0.5">✓</span>
                <span>{resendMessage}</span>
              </div>
            )}

            {/* Resend Error Message */}
            {resendStatus === 'error' && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm text-left">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <span>{resendMessage}</span>
              </div>
            )}

            <form onSubmit={handleResend} noValidate className="text-left mb-6">
              <label htmlFor="resendEmail" className="auth-label">
                Email Address
              </label>
              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted text-base">
                  ✉️
                </span>
                <input
                  id="resendEmail"
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="auth-input pl-10"
                />
              </div>

              <button
                type="submit"
                disabled={resendStatus === 'sending'}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-semibold shadow hover:from-indigo-700 hover:to-purple-700 active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {resendStatus === 'sending' ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span>Sending Link...</span>
                  </>
                ) : (
                  'Resend Verification Link'
                )}
              </button>
            </form>

            <div className="border-t border-theme-subtle pt-4">
              <Link
                to="/login"
                className="text-sm auth-link"
              >
                ← Back to Sign In
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
