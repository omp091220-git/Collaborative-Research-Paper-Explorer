import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Bell, Clock, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/common/Button';

export default function SettingsPage() {
  const { logout } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Notification toggles
  const [notifyDiscussions, setNotifyDiscussions] = useState(true);
  const [notifyInvites, setNotifyInvites] = useState(true);
  const [notifyRecommendations, setNotifyRecommendations] = useState(false);

  const handleSaveNotifications = (e) => {
    e.preventDefault();
    addToast({
      type: 'success',
      title: 'Preferences Saved',
      message: 'Notification settings have been updated.',
    });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Settings & Preferences"
        description="Configure session security, notifications, and application preferences."
      />

      {/* Security & Inactivity Policy */}
      <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Session Inactivity Policy (FR-04)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automatic idle expiration for institutional security compliance
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
          <p>
            For privacy and institutional compliance, user sessions are protected by a{' '}
            <strong>30-minute rolling inactivity window</strong>. Any authenticated API request
            or user interaction keeps your session active.
          </p>
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold pt-1">
            <Shield className="w-4 h-4" />
            <span>A 2-minute countdown warning modal will prompt you before expiration.</span>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <form
        onSubmit={handleSaveNotifications}
        className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Notification Preferences
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Control which paper activities trigger alerts in your notification center
            </p>
          </div>
        </div>

        <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          <div className="flex items-center justify-between pt-4 first:pt-0">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">
                Collaboration Invitations
              </p>
              <p className="text-xs text-slate-500">
                Receive notifications when colleagues invite you to join research papers.
              </p>
            </div>
            <input
              type="checkbox"
              checked={notifyInvites}
              onChange={(e) => setNotifyInvites(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">
                Discussion Replies & Mentions
              </p>
              <p className="text-xs text-slate-500">
                Notify when collaborators reply to your threads or annotations.
              </p>
            </div>
            <input
              type="checkbox"
              checked={notifyDiscussions}
              onChange={(e) => setNotifyDiscussions(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between pt-4">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">
                AI Research Recommendations
              </p>
              <p className="text-xs text-slate-500">
                Weekly digest of preprints matching your research interests.
              </p>
            </div>
            <input
              type="checkbox"
              checked={notifyRecommendations}
              onChange={(e) => setNotifyRecommendations(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded-md focus:ring-indigo-500 cursor-pointer"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button type="submit" variant="primary" size="sm">
            Save Preferences
          </Button>
        </div>
      </form>

      {/* Account Termination & Logout */}
      <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-rose-200 dark:border-rose-950/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-rose-600 dark:text-rose-400">
            Sign Out of ScholarSphere
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            End your authenticated session across active browser tabs.
          </p>
        </div>

        <Button
          variant="danger"
          size="sm"
          onClick={handleLogout}
          className="gap-2 self-start sm:self-auto"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </Button>
      </div>
    </div>
  );
}
