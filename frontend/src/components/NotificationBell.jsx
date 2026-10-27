import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationBell({ onNavigateToPaper }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const dropdownRef = useRef(null);

  const fetchNotifications = useCallback(async (unreadOnly = filterUnread) => {
    setLoading(true);
    try {
      const res = await axios.get('/api/notifications', {
        params: { unread_only: unreadOnly ? 'true' : 'false', limit: 30 },
        withCredentials: true,
      });
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [filterUnread]);

  // Real-time notification subscription via Server-Sent Events (SSE) (FR-19)
  useEffect(() => {
    let eventSource = null;
    let reconnectTimeout = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/notifications/stream', {
          withCredentials: true,
        });

        eventSource.addEventListener('notification', (e) => {
          try {
            const newNotif = JSON.parse(e.data);
            setNotifications((prev) => [
              newNotif,
              ...prev.filter((n) => n.id !== newNotif.id),
            ]);
            setUnreadCount((count) => count + 1);
          } catch (parseErr) {
            console.error('Failed to parse incoming SSE notification:', parseErr);
          }
        });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          // Reconnect after delay
          reconnectTimeout = setTimeout(connectSSE, 5000);
        };
      } catch (err) {
        console.error('SSE initialization error:', err);
      }
    };

    connectSSE();

    // Secondary fallback periodic check
    const checkCount = () => {
      axios
        .get('/api/notifications/unread-count', { withCredentials: true })
        .then((res) => {
          setUnreadCount(res.data.unread_count || 0);
        })
        .catch(() => {});
    };

    checkCount();
    const interval = setInterval(checkCount, 30_000);

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
      clearInterval(interval);
    };
  }, []);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      fetchNotifications();
    }
  };

  const handleFilterChange = (unreadOnly) => {
    setFilterUnread(unreadOnly);
    fetchNotifications(unreadOnly);
  };

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await axios.patch(`/api/notifications/${id}/read`, {}, { withCredentials: true });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await axios.patch('/api/notifications/read-all', {}, { withCredentials: true });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const handleNotificationClick = async (item) => {
    if (!item.is_read) {
      await handleMarkAsRead(item.id);
    }
    setIsOpen(false);
    if (onNavigateToPaper && item.paper_id) {
      onNavigateToPaper(item.paper_id);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'MENTION':
        return '💬';
      case 'PAPER_TAG_CHANGE':
        return '🏷️';
      case 'PAPER_NOTE_ADDED':
        return '📌';
      case 'PAPER_METADATA_UPDATE':
        return '📝';
      default:
        return '🔔';
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-2 text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
        title="Notifications"
        aria-label="View notifications"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-4 text-center border-2 border-white animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden font-sans">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-800 text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-medium">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Filter Bar */}
          <div className="flex border-b border-slate-100 text-xs bg-slate-50/30">
            <button
              type="button"
              onClick={() => handleFilterChange(false)}
              className={`flex-1 py-2 text-center font-medium transition cursor-pointer ${
                !filterUnread
                  ? 'border-b-2 border-indigo-600 text-indigo-700 font-semibold bg-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange(true)}
              className={`flex-1 py-2 text-center font-medium transition cursor-pointer ${
                filterUnread
                  ? 'border-b-2 border-indigo-600 text-indigo-700 font-semibold bg-white'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Unread only
            </button>
          </div>

          {/* List Content */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {loading && notifications.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-xs">
                Loading notifications…
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs space-y-1">
                <span className="text-2xl block mb-1">🎉</span>
                <p className="font-medium text-slate-600">All caught up!</p>
                <p>No {filterUnread ? 'unread ' : ''}notifications at this time.</p>
              </div>
            )}

            {notifications.map((item) => (
              <div
                key={item.id}
                onClick={() => handleNotificationClick(item)}
                className={`p-3.5 flex items-start gap-3 transition cursor-pointer hover:bg-slate-50 ${
                  !item.is_read ? 'bg-indigo-50/40' : 'bg-white'
                }`}
              >
                <span className="text-lg shrink-0 mt-0.5">{getTypeIcon(item.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p
                      className={`text-xs leading-snug line-clamp-1 ${
                        !item.is_read
                          ? 'font-bold text-slate-900'
                          : 'font-semibold text-slate-700'
                      }`}
                    >
                      {item.title}
                    </p>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {formatTimestamp(item.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                    {item.message}
                  </p>
                  {item.paper_title && (
                    <span className="inline-block mt-1 text-[11px] font-medium text-indigo-600 truncate max-w-full">
                      📄 {item.paper_title}
                    </span>
                  )}
                </div>

                {!item.is_read && (
                  <button
                    type="button"
                    onClick={(e) => handleMarkAsRead(item.id, e)}
                    className="shrink-0 w-2.5 h-2.5 rounded-full bg-indigo-600 hover:bg-indigo-800 transition"
                    title="Mark as read"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
