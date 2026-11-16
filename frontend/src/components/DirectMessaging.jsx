import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

export default function DirectMessaging() {
  const { user } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [error, setError] = useState(null);

  // New Chat Modal state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [initiatingChat, setInitiatingChat] = useState(false);

  // Filter conversations in sidebar
  const [conversationFilter, setConversationFilter] = useState('');

  // Mobile navigation: toggle between list view and chat view
  const [mobileView, setMobileView] = useState('list'); // 'list' | 'chat'

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Fetch all user conversations
  const fetchConversations = useCallback(async (selectConversationId = null) => {
    try {
      const res = await axios.get('/api/direct-messages/conversations', {
        withCredentials: true,
      });
      const convList = res.data.conversations || [];
      setConversations(convList);

      if (selectConversationId) {
        const found = convList.find((c) => c.id === selectConversationId);
        if (found) {
          setActiveConversation(found);
          setMobileView('chat');
        }
      }
    } catch (err) {
      setError(
        err.response?.data?.error || 'Failed to load conversations.'
      );
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(
    async (conversationId, silent = false) => {
      if (!conversationId) return;
      if (!silent) setLoadingMessages(true);
      try {
        const res = await axios.get(
          `/api/direct-messages/conversations/${conversationId}/messages`,
          { withCredentials: true }
        );
        setMessages(res.data.messages || []);
        if (res.data.otherUser) {
          setActiveConversation((prev) =>
            prev ? { ...prev, otherUser: res.data.otherUser } : prev
          );
        }
      } catch (err) {
        if (!silent) {
          setError(
            err.response?.data?.error || 'Failed to load message history.'
          );
        }
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Periodic polling for new messages & unread counts every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      if (activeConversation?.id) {
        fetchMessages(activeConversation.id, true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchConversations, fetchMessages, activeConversation?.id]);

  // When active conversation changes, fetch its messages
  useEffect(() => {
    if (activeConversation?.id) {
      fetchMessages(activeConversation.id);
    } else {
      setMessages([]);
    }
  }, [activeConversation?.id, fetchMessages]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Search available users for new chat
  const handleSearchUsers = async (query) => {
    setUserSearchQuery(query);
    setSearchingUsers(true);
    try {
      const res = await axios.get(
        `/api/direct-messages/users?q=${encodeURIComponent(query)}`,
        { withCredentials: true }
      );
      setAvailableUsers(res.data.users || []);
    } catch {
      setAvailableUsers([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  // Open New Chat Modal
  const openNewChatModal = () => {
    setShowNewChatModal(true);
    setUserSearchQuery('');
    handleSearchUsers('');
  };

  // Start chat with selected user
  const handleSelectUserToChat = async (recipient) => {
    setInitiatingChat(true);
    setError(null);
    try {
      const res = await axios.post(
        '/api/direct-messages/conversations',
        { recipientId: recipient.id },
        { withCredentials: true }
      );
      const conversation = res.data.conversation;
      setShowNewChatModal(false);
      await fetchConversations(conversation.id);
      setActiveConversation(conversation);
      setMobileView('chat');
    } catch (err) {
      setError(
        err.response?.data?.error || 'Failed to initiate conversation.'
      );
    } finally {
      setInitiatingChat(false);
    }
  };

  // Send a direct message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed || !activeConversation?.id || sendingMessage) return;

    setSendingMessage(true);
    setError(null);

    // Optimistic temporary message
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      conversation_id: activeConversation.id,
      sender_id: user.id,
      sender_name: user.full_name,
      sender_email: user.email,
      content: trimmed,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setMessageText('');

    try {
      const res = await axios.post(
        `/api/direct-messages/conversations/${activeConversation.id}/messages`,
        { content: trimmed },
        { withCredentials: true }
      );

      const serverMsg = res.data.data;
      // Replace optimistic message with server returned message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? serverMsg : m))
      );
      // Refresh conversation list to update snippet
      fetchConversations();
    } catch (err) {
      // Revert optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setMessageText(trimmed);
      setError(
        err.response?.data?.error || 'Failed to send direct message.'
      );
    } finally {
      setSendingMessage(false);
    }
  };

  // Filter conversations in sidebar
  const filteredConversations = conversations.filter((c) => {
    if (!conversationFilter) return true;
    const q = conversationFilter.toLowerCase();
    return (
      c.other_user_name?.toLowerCase().includes(q) ||
      c.other_user_email?.toLowerCase().includes(q) ||
      c.last_message_content?.toLowerCase().includes(q)
    );
  });

  const totalUnreadCount = conversations.reduce(
    (acc, c) => acc + (c.unread_count || 0),
    0
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[650px]">
      {/* Top Banner Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💬</span>
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              Direct Messages
              {totalUnreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-bold bg-indigo-600 text-white rounded-full">
                  {totalUnreadCount} new
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500">
              Private one-to-one messaging with fellow researchers and students.
            </p>
          </div>
        </div>

        <button
          onClick={openNewChatModal}
          className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition duration-200 flex items-center gap-1.5 cursor-pointer"
        >
          <span>+</span>
          <span>New Chat</span>
        </button>
      </div>

      {/* Global Error Notice */}
      {error && (
        <div className="px-4 py-2.5 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Two-Pane Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Pane: Conversations List */}
        <div
          className={`w-full md:w-80 border-r border-slate-200 flex flex-col bg-slate-50/30 ${
            mobileView === 'chat' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Conversation Search Bar */}
          <div className="p-3 border-b border-slate-200">
            <input
              type="search"
              placeholder="Filter conversations..."
              value={conversationFilter}
              onChange={(e) => setConversationFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-400 text-slate-800"
            />
          </div>

          {/* Conversations Scrollable Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingConversations ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <span className="w-5 h-5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                <span>Loading chats...</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                <span className="text-2xl block">📭</span>
                <p>
                  {conversationFilter
                    ? 'No conversations match your filter.'
                    : 'No conversations yet.'}
                </p>
                {!conversationFilter && (
                  <button
                    onClick={openNewChatModal}
                    className="text-indigo-600 hover:underline font-semibold mt-1 inline-block"
                  >
                    Start a conversation
                  </button>
                )}
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = activeConversation?.id === conv.id;
                const unread = conv.unread_count > 0;
                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setActiveConversation(conv);
                      setMobileView('chat');
                    }}
                    className={`w-full text-left p-3.5 transition flex items-start gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 border-l-4 border-indigo-600'
                        : 'hover:bg-slate-100/70'
                    }`}
                  >
                    {/* User Avatar Circle */}
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-200">
                      {conv.other_user_name
                        ? conv.other_user_name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()
                        : '?'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <h4
                          className={`text-xs truncate ${
                            unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'
                          }`}
                        >
                          {conv.other_user_name || 'Unknown User'}
                        </h4>
                        {conv.last_message_created_at && (
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {new Date(conv.last_message_created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>

                      <p
                        className={`text-xs truncate mt-0.5 ${
                          unread ? 'font-semibold text-indigo-900' : 'text-slate-500'
                        }`}
                      >
                        {conv.last_message_content || 'No messages yet.'}
                      </p>

                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] text-slate-400 truncate">
                          {conv.other_user_role || 'User'}
                        </span>
                        {unread && (
                          <span className="ml-auto px-1.5 py-0.2 bg-indigo-600 text-white text-[10px] font-bold rounded-full">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat Area */}
        <div
          className={`flex-1 flex flex-col bg-white ${
            mobileView === 'list' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {activeConversation ? (
            <>
              {/* Chat Header */}
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Mobile Back Button */}
                  <button
                    onClick={() => setMobileView('list')}
                    className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition text-xs"
                    title="Back to conversations"
                  >
                    ←
                  </button>

                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-200">
                    {activeConversation.other_user_name
                      ? activeConversation.other_user_name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()
                      : '?'}
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-800 truncate">
                      {activeConversation.other_user_name || 'Participant'}
                    </h3>
                    <p className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                      <span>{activeConversation.other_user_email}</span>
                      {activeConversation.other_user_affiliation && (
                        <>
                          <span>•</span>
                          <span>{activeConversation.other_user_affiliation}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded-md border border-slate-200">
                    {activeConversation.other_user_role || 'RESEARCHER'}
                  </span>
                  <button
                    onClick={() => fetchMessages(activeConversation.id)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition text-xs cursor-pointer"
                    title="Refresh conversation messages"
                  >
                    ↺
                  </button>
                </div>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-3 bg-slate-50/20">
                {loadingMessages ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                    <span className="w-6 h-6 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                    <span>Loading conversation history...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs text-center space-y-2">
                    <span className="text-3xl">👋</span>
                    <p className="font-semibold text-slate-600">
                      No messages in this conversation yet.
                    </p>
                    <p className="max-w-xs text-slate-400">
                      Send a message below to start sharing research insights and collaboration thoughts.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.sender_id === user.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${
                          isMe ? 'items-end' : 'items-start'
                        }`}
                      >
                        {!isMe && (
                          <span className="text-[10px] text-slate-400 mb-1 ml-1 font-medium">
                            {msg.sender_name || 'Participant'}
                          </span>
                        )}

                        <div
                          className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-xs shadow-2xs whitespace-pre-wrap break-words leading-relaxed ${
                            isMe
                              ? 'bg-indigo-600 text-white rounded-br-xs'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                          }`}
                        >
                          {msg.content}
                        </div>

                        <span className="text-[10px] text-slate-400 mt-1 mx-1">
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 border-t border-slate-100 bg-white flex items-center gap-2"
              >
                <textarea
                  rows={1}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type a direct message... (Enter to send, Shift+Enter for newline)"
                  className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white resize-none text-slate-800 placeholder-slate-400"
                />

                <button
                  type="submit"
                  disabled={!messageText.trim() || sendingMessage}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition duration-200 shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  {sendingMessage ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Send</span>
                  )}
                </button>
              </form>
            </>
          ) : (
            /* Empty State when no conversation selected */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
              <span className="text-4xl">💬</span>
              <h3 className="text-base font-bold text-slate-700">
                Your Direct Messages
              </h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Select an existing conversation from the list, or start a new private discussion with any registered platform user.
              </p>
              <button
                onClick={openNewChatModal}
                className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
              >
                + Start New Conversation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New Chat User Selection Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col max-h-[500px]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-lg">✉️</span>
                <h3 className="font-bold text-slate-800 text-sm">
                  Start Direct Message
                </h3>
              </div>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200 transition"
              >
                ✕
              </button>
            </div>

            {/* User Search Input */}
            <div className="p-3 border-b border-slate-100">
              <input
                type="search"
                autoFocus
                placeholder="Search registered users by name or email..."
                value={userSearchQuery}
                onChange={(e) => handleSearchUsers(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800"
              />
            </div>

            {/* Users List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
              {searchingUsers ? (
                <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <span className="w-5 h-5 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
                  <span>Searching registered users...</span>
                </div>
              ) : availableUsers.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  {userSearchQuery
                    ? 'No registered users match your search.'
                    : 'No other users found.'}
                </div>
              ) : (
                availableUsers.map((targetUser) => (
                  <button
                    key={targetUser.id}
                    disabled={initiatingChat}
                    onClick={() => handleSelectUserToChat(targetUser)}
                    className="w-full p-2.5 rounded-xl hover:bg-slate-50 transition flex items-center justify-between text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-200">
                        {targetUser.full_name
                          ? targetUser.full_name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()
                          : '?'}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600">
                          {targetUser.full_name}
                        </h4>
                        <p className="text-[11px] text-slate-400 truncate">
                          {targetUser.email}
                        </p>
                      </div>
                    </div>

                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md border border-slate-200 shrink-0 ml-2">
                      {targetUser.role || 'USER'}
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setShowNewChatModal(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg transition font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
