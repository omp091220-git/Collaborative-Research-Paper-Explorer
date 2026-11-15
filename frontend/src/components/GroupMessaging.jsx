import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function GroupMessaging() {
  const { user } = useAuth();

  // Tab State: 'explore' (FR-33) vs 'chat' (FR-34)
  const [activeTab, setActiveTab] = useState('explore');

  // Groups list and state
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Active chat state
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  // Create Group Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIsPrivate, setNewIsPrivate] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'chat' && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, activeTab]);

  // Fetch discoverable groups (FR-33)
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    let ignore = false;
    const fetchGroups = async () => {
      setLoadingGroups(true);
      try {
        const res = await axios.get('/api/groups', {
          params: { search: searchQuery },
          withCredentials: true,
        });
        if (!ignore) {
          setGroups(res.data.groups || []);
        }
      } catch (err) {
        if (!ignore) {
          setActionError(err.response?.data?.error || 'Failed to load research groups.');
        }
      } finally {
        if (!ignore) {
          setLoadingGroups(false);
        }
      }
    };

    fetchGroups();
    return () => {
      ignore = true;
    };
  }, [searchQuery, reloadTrigger]);

  // Fetch active group details & messages (FR-34)
  useEffect(() => {
    if (!selectedGroupId || activeTab !== 'chat') return;

    let ignore = false;
    const fetchGroupConversation = async () => {
      setLoadingMessages(true);
      try {
        const [detailsRes, messagesRes] = await Promise.all([
          axios.get(`/api/groups/${selectedGroupId}`, { withCredentials: true }),
          axios.get(`/api/groups/${selectedGroupId}/messages`, { withCredentials: true }),
        ]);
        if (!ignore) {
          setGroupDetails(detailsRes.data);
          setMessages(messagesRes.data.messages || []);
        }
      } catch (err) {
        if (!ignore) {
          setActionError(err.response?.data?.error || 'Failed to load group messages.');
        }
      } finally {
        if (!ignore) {
          setLoadingMessages(false);
        }
      }
    };

    fetchGroupConversation();
    return () => {
      ignore = true;
    };
  }, [selectedGroupId, activeTab]);

  const refreshGroups = () => setReloadTrigger((n) => n + 1);

  // Handle Create Group (FR-32 foundation)
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setCreatingGroup(true);
    setActionError(null);
    try {
      const res = await axios.post(
        '/api/groups',
        {
          title: newTitle.trim(),
          description: newDescription.trim() || null,
          is_private: newIsPrivate,
        },
        { withCredentials: true }
      );

      setActionSuccess(`Group "${res.data.group.title}" created successfully!`);
      setNewTitle('');
      setNewDescription('');
      setNewIsPrivate(false);
      setShowCreateModal(false);

      refreshGroups();
      setSelectedGroupId(res.data.group.id);
      setActiveTab('chat');
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  // Handle Join Group (FR-33)
  const handleJoinGroup = async (group) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await axios.post(`/api/groups/${group.id}/join`, {}, { withCredentials: true });
      if (res.data.status === 'joined') {
        setActionSuccess(`You have joined "${group.title}"!`);
        refreshGroups();
        setSelectedGroupId(group.id);
        setActiveTab('chat');
      } else if (res.data.status === 'pending_approval') {
        setActionSuccess(`Join request submitted for "${group.title}". Awaiting admin approval.`);
        refreshGroups();
      }
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to join group.');
    }
  };

  // Handle Leave Group (FR-33 / FR-34)
  const handleLeaveGroup = async (groupId) => {
    if (!window.confirm('Are you sure you want to leave this group? You will lose message access.')) {
      return;
    }
    setActionError(null);
    try {
      await axios.post(`/api/groups/${groupId}/leave`, {}, { withCredentials: true });
      setActionSuccess('You have left the group.');
      setSelectedGroupId(null);
      setGroupDetails(null);
      setMessages([]);
      refreshGroups();
      setActiveTab('explore');
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to leave group.');
    }
  };

  // Handle Admin Approve/Reject Join Request (FR-33)
  const handleReviewRequest = async (targetUserId, action) => {
    if (!selectedGroupId) return;
    try {
      await axios.post(
        `/api/groups/${selectedGroupId}/members/${targetUserId}/review`,
        { action },
        { withCredentials: true }
      );
      setActionSuccess(`Member request ${action}d successfully.`);
      const [detailsRes, messagesRes] = await Promise.all([
        axios.get(`/api/groups/${selectedGroupId}`, { withCredentials: true }),
        axios.get(`/api/groups/${selectedGroupId}/messages`, { withCredentials: true }),
      ]);
      setGroupDetails(detailsRes.data);
      setMessages(messagesRes.data.messages || []);
    } catch (err) {
      setActionError(err.response?.data?.error || `Failed to ${action} request.`);
    }
  };

  // Handle Send Message (FR-34)
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedGroupId) return;

    setSendingMessage(true);
    setActionError(null);
    try {
      const res = await axios.post(
        `/api/groups/${selectedGroupId}/messages`,
        { content: messageInput.trim() },
        { withCredentials: true }
      );
      setMessages((prev) => [
        ...prev,
        {
          ...res.data.data,
          sender_name: user?.full_name || 'You',
          sender_email: user?.email,
        },
      ]);
      setMessageInput('');
      scrollToBottom();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to send message.');
    } finally {
      setSendingMessage(false);
    }
  };

  const joinedGroups = groups.filter((g) => g.membership_status === 'joined');

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Component Header */}
      <div className="p-6 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">👥</span>
            <h2 className="text-xl font-bold text-slate-800">
              Research Groups & Messaging
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
              FR-33 & FR-34
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Discover peer groups, manage join rules, and collaborate in real-time.
          </p>
        </div>

        {/* Action Button: Create Group */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer shrink-0"
        >
          <span>＋</span>
          <span>New Research Group</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-6">
        <button
          onClick={() => setActiveTab('explore')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'explore'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🔍</span>
          <span>Explore & Join Groups (FR-33)</span>
          <span className="px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600 rounded-full">
            {groups.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('chat');
            if (!selectedGroupId && joinedGroups.length > 0) {
              setSelectedGroupId(joinedGroups[0].id);
            }
          }}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'chat'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>💬</span>
          <span>Group Discussions (FR-34)</span>
          <span className="px-2 py-0.5 text-[10px] bg-indigo-50 text-indigo-700 font-bold rounded-full">
            {joinedGroups.length}
          </span>
        </button>
      </div>

      {/* Alerts */}
      {actionError && (
        <div className="m-4 p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} className="font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}
      {actionSuccess && (
        <div className="m-4 p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center justify-between">
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="font-bold cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: Explore & Join Groups (FR-33) */}
      {activeTab === 'explore' && (
        <div className="p-6 space-y-5">
          {/* Search bar */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search groups by topic or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-800"
            />
            <button
              onClick={refreshGroups}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium border border-slate-200 transition cursor-pointer"
            >
              Search
            </button>
          </div>

          {/* Group Cards Grid */}
          {loadingGroups ? (
            <div className="py-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
              Loading research groups...
            </div>
          ) : groups.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No groups found. Create the first one above!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map((group) => {
                const isJoined = group.membership_status === 'joined';
                const isPending = group.membership_status === 'pending_approval';

                return (
                  <div
                    key={group.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-bold text-slate-800 text-sm">{group.title}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                            group.is_private
                              ? 'bg-purple-100 text-purple-700 border border-purple-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {group.is_private ? '🔒 Private' : '🌐 Public'}
                        </span>
                      </div>

                      {group.description && (
                        <p className="text-xs text-slate-600 line-clamp-2 mb-3">
                          {group.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mb-4">
                        <span>👤 {group.member_count} member{group.member_count !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span>Lead: {group.creator_name || 'Admin'}</span>
                      </div>
                    </div>

                    {/* Join / Chat Action */}
                    <div className="pt-3 border-t border-slate-200/60 flex items-center justify-between">
                      {isJoined ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <span>✓</span> Member
                            {group.user_role === 'admin' && ' (Admin)'}
                          </span>
                          <button
                            onClick={() => {
                              setSelectedGroupId(group.id);
                              setActiveTab('chat');
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            Open Chat →
                          </button>
                        </>
                      ) : isPending ? (
                        <>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                            <span>⏳</span> Awaiting Admin Approval
                          </span>
                          <span className="text-[11px] text-slate-400 italic">Request sent</span>
                        </>
                      ) : (
                        <>
                          <span className="text-[11px] text-slate-400">
                            {group.is_private ? 'Requires admin approval' : 'Instant free access'}
                          </span>
                          <button
                            onClick={() => handleJoinGroup(group)}
                            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
                          >
                            {group.is_private ? 'Request to Join 🔒' : 'Join Group ＋'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Group Discussions & Messaging (FR-34) */}
      {activeTab === 'chat' && (
        <div className="flex flex-col md:flex-row min-h-[500px]">
          {/* Left Groups Sidebar */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-200 p-4 bg-slate-50/60 shrink-0 space-y-2">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Joined Groups ({joinedGroups.length})
            </p>

            {joinedGroups.length === 0 ? (
              <div className="text-xs text-slate-400 p-3 text-center">
                You haven&apos;t joined any groups yet. Switch to the Explore tab!
              </div>
            ) : (
              joinedGroups.map((grp) => (
                <button
                  key={grp.id}
                  onClick={() => setSelectedGroupId(grp.id)}
                  className={`w-full text-left p-3 rounded-xl transition text-xs cursor-pointer flex items-center justify-between ${
                    selectedGroupId === grp.id
                      ? 'bg-indigo-600 text-white font-bold shadow-xs'
                      : 'hover:bg-slate-200/60 text-slate-700'
                  }`}
                >
                  <span className="truncate">{grp.title}</span>
                  <span className="text-[10px] opacity-80 shrink-0">
                    {grp.is_private ? '🔒' : '🌐'}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Right Main Chat Panel */}
          <div className="flex-1 flex flex-col justify-between bg-white">
            {selectedGroupId && groupDetails?.group ? (
              <>
                {/* Active Group Top Banner */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/40 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <span>{groupDetails.group.title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-700">
                        {groupDetails.group.is_private ? 'Private Group' : 'Public Group'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                      {groupDetails.group.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleLeaveGroup(selectedGroupId)}
                      className="px-2.5 py-1 text-[11px] text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg font-semibold transition cursor-pointer"
                    >
                      Leave Group
                    </button>
                  </div>
                </div>

                {/* Admin Panel for Pending Requests (FR-33) */}
                {groupDetails.user_role === 'admin' && (
                  (() => {
                    const pendingUsers = groupDetails.members?.filter(
                      (m) => m.status === 'pending_approval'
                    ) || [];
                    if (pendingUsers.length === 0) return null;

                    return (
                      <div className="p-3 bg-amber-50 border-b border-amber-200 text-xs">
                        <p className="font-bold text-amber-900 mb-2">
                          Pending Join Requests ({pendingUsers.length})
                        </p>
                        <div className="space-y-1.5">
                          {pendingUsers.map((p) => (
                            <div
                              key={p.user_id}
                              className="flex items-center justify-between bg-white p-2 rounded-lg border border-amber-100"
                            >
                              <span className="font-medium text-slate-700">
                                {p.full_name} ({p.email})
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleReviewRequest(p.user_id, 'approve')}
                                  className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[11px] font-bold hover:bg-emerald-700"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReviewRequest(p.user_id, 'reject')}
                                  className="px-2 py-0.5 bg-rose-600 text-white rounded text-[11px] font-bold hover:bg-rose-700"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()
                )}

                {/* Message Feed (FR-34) */}
                <div className="flex-1 p-4 overflow-y-auto max-h-[380px] space-y-3 bg-slate-50/20">
                  {loadingMessages ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      Loading messages...
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      No messages in this group yet. Send the first greeting!
                    </div>
                  ) : (
                    messages.map((msg) => {
                      const isMe = msg.sender_id === user?.id;

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5 px-1">
                            <span className="text-[10px] font-bold text-slate-600">
                              {isMe ? 'You' : msg.sender_name}
                            </span>
                            {msg.sender_group_role === 'admin' && (
                              <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 rounded font-semibold">
                                Admin
                              </span>
                            )}
                            <span className="text-[9px] text-slate-400">
                              {new Date(msg.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div
                            className={`px-3.5 py-2 rounded-2xl text-xs max-w-sm sm:max-w-md break-words ${
                              isMe
                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-2xs'
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Composer Input */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder="Type a group message..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    disabled={sendingMessage}
                    className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <button
                    type="submit"
                    disabled={sendingMessage || !messageInput.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Send ↵
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 text-xs">
                <span className="text-4xl mb-2">💬</span>
                <p>Select a group from the sidebar to view conversations.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Group Modal (FR-32 foundation) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm">Create New Research Group</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Group Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Deep Learning & Computer Vision Study Group"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="What is this group about? (optional)"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <p className="text-xs font-bold text-slate-800">Private Group</p>
                  <p className="text-[11px] text-slate-500">
                    Require administrator approval before new members can join
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={newIsPrivate}
                  onChange={(e) => setNewIsPrivate(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup || !newTitle.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold"
                >
                  {creatingGroup ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
