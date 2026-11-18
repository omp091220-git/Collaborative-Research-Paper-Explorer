import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import CreateGroupModal from './CreateGroupModal';

export default function GroupList() {
  const { user } = useAuth();

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'my'
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Group Details Roster Modal state
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);

  // Fetch groups from backend
  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/groups', {
        params: {
          filter: activeTab,
          search: searchQuery.trim() || undefined,
        },
        withCredentials: true,
      });
      setGroups(res.data.groups || []);
    } catch (err) {
      setError(
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to load messaging groups.'
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchGroups();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchGroups]);

  // Open group details & member roster
  const handleOpenDetails = async (group) => {
    setSelectedGroup(group);
    setLoadingDetails(true);
    setDetailsError(null);
    try {
      const res = await axios.get(`/api/groups/${group.id}`, {
        withCredentials: true,
      });
      setGroupDetails(res.data);
    } catch (err) {
      setDetailsError(
        err.response?.data?.error || 'Failed to load group details and roster.'
      );
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCloseDetails = () => {
    setSelectedGroup(null);
    setGroupDetails(null);
    setDetailsError(null);
  };

  const handleGroupCreated = (newGroup) => {
    // Refresh group list and optionally switch to 'my' tab
    fetchGroups();
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
      {/* Header with Title and Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">👥</span>
            <h2 className="text-xl font-bold text-slate-800">
              Research Groups
            </h2>
            <span className="px-2 py-0.5 text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
              FR-32
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Create and organize collaborative groups for paper discussions and research domains.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition duration-200 cursor-pointer"
        >
          <span>＋</span>
          <span>Create Group</span>
        </button>
      </div>

      {/* Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 my-5">
        <div className="flex items-center bg-slate-100 p-1 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            All Groups
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'my'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            My Groups
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Filter groups by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={fetchGroups}
            className="font-bold underline hover:no-underline ml-2 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Groups Grid / List */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs animate-pulse">
          Loading research groups...
        </div>
      ) : groups.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl p-6">
          <span className="text-3xl block mb-2">🏷️</span>
          <p className="text-sm font-semibold text-slate-700 mb-1">
            {searchQuery
              ? 'No groups match your search criteria.'
              : activeTab === 'my'
              ? 'You have not created or joined any groups yet.'
              : 'No research groups have been created yet.'}
          </p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            {activeTab === 'my'
              ? 'Create a new group to start collaborating on specialized research topics.'
              : 'Be the first to create a research group and invite peers.'}
          </p>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            Create First Group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((grp) => {
            const isOwner = grp.my_role === 'OWNER' || grp.created_by === user?.id;
            const isMember = Boolean(grp.my_role || grp.is_member);

            return (
              <div
                key={grp.id}
                className="p-5 border border-slate-200 rounded-2xl hover:border-indigo-300 hover:shadow-xs transition duration-200 bg-white flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-base font-bold text-slate-800 line-clamp-1">
                      {grp.name}
                    </h3>

                    {/* Role Badges */}
                    {isOwner ? (
                      <span className="shrink-0 px-2.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-[10px] font-bold">
                        👑 Owner
                      </span>
                    ) : isMember ? (
                      <span className="shrink-0 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold">
                        ✓ Member
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-slate-600 mb-3 line-clamp-2 min-h-[2rem]">
                    {grp.description || (
                      <span className="text-slate-400 italic">No description provided.</span>
                    )}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-medium text-slate-600">
                      <span>👥</span> {grp.member_count || 1} {grp.member_count === 1 ? 'member' : 'members'}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate max-w-[130px]">
                      By {grp.creator_name || 'Researcher'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenDetails(grp)}
                    className="px-2.5 py-1 text-xs text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg font-semibold transition cursor-pointer"
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onGroupCreated={handleGroupCreated}
      />

      {/* Group Details & Member Roster Modal */}
      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="text-2xl">👥</span>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{selectedGroup.name}</h3>
                  <p className="text-xs text-slate-500">Group Metadata & Member Roster</p>
                </div>
              </div>
              <button
                onClick={handleCloseDetails}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {detailsError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
                  {detailsError}
                </div>
              )}

              {loadingDetails ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">
                  Loading roster...
                </div>
              ) : (
                <>
                  {/* Metadata */}
                  <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-100 text-xs">
                    <p className="text-slate-700">
                      <strong className="text-slate-900">Description:</strong>{' '}
                      {selectedGroup.description || 'None'}
                    </p>
                    <p className="text-slate-700">
                      <strong className="text-slate-900">Created by:</strong>{' '}
                      {selectedGroup.creator_name} ({selectedGroup.creator_email})
                    </p>
                    <p className="text-slate-700">
                      <strong className="text-slate-900">Total Members:</strong>{' '}
                      {groupDetails?.members?.length || selectedGroup.member_count || 1}
                    </p>
                  </div>

                  {/* Members Roster */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                      Enrolled Members ({groupDetails?.members?.length || 0})
                    </h4>
                    <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 bg-white max-h-48 overflow-y-auto">
                      {groupDetails?.members?.map((m) => (
                        <div key={m.user_id} className="p-3 text-xs flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-800">{m.full_name}</p>
                            <p className="text-[11px] text-slate-400">{m.email} {m.affiliation ? `• ${m.affiliation}` : ''}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.role === 'OWNER'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : m.role === 'ADMIN'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {m.role === 'OWNER' ? '👑 Owner' : m.role === 'ADMIN' ? '🛡️ Admin' : '👤 Member'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Architecture & Next Steps Notice */}
                  <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 space-y-1">
                    <p className="font-semibold">💡 Collaboration Features Integration:</p>
                    <p className="text-slate-600">
                      • <strong>FR-33 (Join Existing Groups)</strong>: Available to researchers to self-enroll.
                    </p>
                    <p className="text-slate-600">
                      • <strong>FR-34 (Group Messaging)</strong>: Group chat feeds directly authorize enrolled members.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end bg-slate-50/50">
              <button
                type="button"
                onClick={handleCloseDetails}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
