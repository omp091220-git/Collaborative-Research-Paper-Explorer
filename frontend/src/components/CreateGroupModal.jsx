import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function CreateGroupModal({ isOpen, onClose, onGroupCreated }) {
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Search users to add as initial members
  const searchUsers = useCallback(async (query) => {
    setIsSearching(true);
    try {
      const res = await axios.get(`/api/groups/users?q=${encodeURIComponent(query)}`, {
        withCredentials: true,
      });
      setSearchResults(res.data.users || []);
    } catch (err) {
      console.error('Failed to search users:', err.message);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setSelectedMembers([]);
      setSearchQuery('');
      setSearchResults([]);
      setError(null);
      setIsSubmitting(false);
      return;
    }

    // Initial search when modal opens
    searchUsers('');
  }, [isOpen, searchUsers]);

  if (!isOpen) return null;

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    searchUsers(val);
  };

  const handleToggleMember = (candidate) => {
    setSelectedMembers((prev) => {
      const exists = prev.some((m) => m.id === candidate.id);
      if (exists) {
        return prev.filter((m) => m.id !== candidate.id);
      } else {
        if (prev.length >= 50) return prev;
        return [...prev, candidate];
      }
    });
  };

  const handleRemoveMember = (memberId) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setError('Group name must be at least 2 characters long.');
      return;
    }

    if (trimmedName.length > 100) {
      setError('Group name cannot exceed 100 characters.');
      return;
    }

    if (description.trim().length > 500) {
      setError('Group description cannot exceed 500 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: trimmedName,
        description: description.trim() || undefined,
        initialMemberIds: selectedMembers.map((m) => m.id),
      };

      const res = await axios.post('/api/groups', payload, {
        withCredentials: true,
      });

      if (onGroupCreated) {
        onGroupCreated(res.data.group);
      }
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to create group. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">👥</span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Create Research Group</h2>
              <p className="text-xs text-slate-500">Collaborate with peers on topics or projects</p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
              {error}
            </div>
          )}

          {/* Group Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Group Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              placeholder="e.g. Generative AI Reading Group"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            <div className="flex justify-between mt-1 text-[11px] text-slate-400">
              <span>Required, 2–100 characters</span>
              <span>{name.length}/100</span>
            </div>
          </div>

          {/* Group Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Description <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </label>
            <textarea
              rows={3}
              maxLength={500}
              placeholder="Brief description of research focus, meeting times, or collaboration goals..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition resize-none"
            />
            <div className="flex justify-between mt-1 text-[11px] text-slate-400">
              <span>Max 500 characters</span>
              <span>{description.length}/500</span>
            </div>
          </div>

          {/* Initial Members Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Add Initial Members <span className="text-slate-400 font-normal lowercase">(optional)</span>
            </label>

            {/* Selected Member Chips */}
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {selectedMembers.map((m) => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-medium"
                  >
                    <span>{m.full_name || m.email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.id)}
                      className="text-indigo-400 hover:text-indigo-700 cursor-pointer"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Member Search Input */}
            <div className="relative mb-2">
              <input
                type="text"
                placeholder="Search colleagues by name or email..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              {isSearching && (
                <div className="absolute right-3 top-2.5 text-xs text-slate-400 animate-pulse">
                  Searching...
                </div>
              )}
            </div>

            {/* Search Results List */}
            <div className="max-h-36 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 bg-white">
              {searchResults.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400">
                  {searchQuery ? 'No matching researchers found.' : 'Search researchers to invite.'}
                </div>
              ) : (
                searchResults.map((candidate) => {
                  const isSelected = selectedMembers.some((m) => m.id === candidate.id);
                  return (
                    <div
                      key={candidate.id}
                      onClick={() => handleToggleMember(candidate)}
                      className={`p-2.5 text-xs flex items-center justify-between cursor-pointer transition ${
                        isSelected ? 'bg-indigo-50/60 text-indigo-900' : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div>
                        <p className="font-semibold">{candidate.full_name}</p>
                        <p className="text-[11px] text-slate-400">{candidate.email} • {candidate.role}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {isSelected ? '✓ Added' : '+ Add'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              You will automatically be assigned as the group <strong>Owner</strong>.
            </p>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer flex items-center gap-2"
            >
              {isSubmitting ? 'Creating Group...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
