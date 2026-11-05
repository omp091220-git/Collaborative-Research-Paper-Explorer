import { useState } from 'react';
import { Mail, Building2, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/layout/PageHeader';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { ROLE_LABELS, ROLE_COLORS, RESEARCH_AREAS } from '../../utils/constants';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const { addToast } = useToast();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [affiliation, setAffiliation] = useState(user?.affiliation || '');
  const [researchInterests, setResearchInterests] = useState(
    Array.isArray(user?.research_interests)
      ? user.research_interests
      : []
  );
  const [customTag, setCustomTag] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddTag = (tag) => {
    const trimmed = (tag || customTag).trim();
    if (!trimmed) return;
    if (researchInterests.includes(trimmed)) return;
    setResearchInterests([...researchInterests, trimmed]);
    setCustomTag('');
  };

  const handleRemoveTag = (tagToRemove) => {
    setResearchInterests(researchInterests.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({
        full_name: fullName,
        affiliation,
        research_interests: researchInterests,
      });
      addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your research profile information was saved.',
      });
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: err.response?.data?.error || 'Could not update profile.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      {/* Page Header */}
      <PageHeader
        title="Scholar Profile"
        description="Manage your academic credentials, university affiliation, and research interests."
      />

      {/* User Hero Banner */}
      <div className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center sm:items-start gap-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-extrabold shadow-lg shadow-indigo-500/20 shrink-0">
          {fullName.charAt(0) || user?.email?.charAt(0) || 'U'}
        </div>

        <div className="flex-1 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {fullName || 'Academic Scholar'}
            </h2>
            <Badge variant={ROLE_COLORS[user?.role] || 'indigo'} size="sm">
              {ROLE_LABELS[user?.role] || user?.role}
            </Badge>
          </div>

          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-center sm:justify-start gap-1.5">
            <Mail className="w-4 h-4 text-slate-400" />
            <span>{user?.email}</span>
          </p>

          {affiliation && (
            <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center justify-center sm:justify-start gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>{affiliation}</span>
            </p>
          )}
        </div>
      </div>

      {/* Edit Profile Form */}
      <form
        onSubmit={handleSubmit}
        className="p-6 sm:p-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6"
      >
        <h3 className="text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
          Personal Details & Affiliation
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Full Legal Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Dr. Jane Doe"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Affiliation / University / Lab
            </label>
            <input
              type="text"
              value={affiliation}
              onChange={(e) => setAffiliation(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Stanford AI Lab"
            />
          </div>
        </div>

        {/* Research Interests */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Research Interests & Topics
          </label>
          <p className="text-xs text-slate-500 mb-3">
            Select predefined research areas or add custom keywords below:
          </p>

          {/* Quick preset suggestions */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {RESEARCH_AREAS.slice(0, 8).map((area) => (
              <button
                key={area}
                type="button"
                onClick={() => handleAddTag(area)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  researchInterests.includes(area)
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                + {area}
              </button>
            ))}
          </div>

          {/* Current tags */}
          <div className="flex flex-wrap gap-2 p-3 min-h-[48px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 mb-3">
            {researchInterests.length === 0 ? (
              <span className="text-xs text-slate-400">No research interests specified yet.</span>
            ) : (
              researchInterests.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold"
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-rose-500 cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Add custom tag */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Add another topic or keyword..."
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleAddTag()}
            >
              Add Topic
            </Button>
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={saving}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Save Profile Changes</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
