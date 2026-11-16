import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Compass,
  Bookmark,
  FolderKanban,
  Users2,
  MessageSquare,
  ShieldAlert,
  Settings,
  X,
  FileText,
  Sparkles,
  FolderTree,
  Tag,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLibrary } from '../../context/LibraryContext';
import Badge from '../common/Badge';

export default function Sidebar({ isOpen, onClose }) {
  const { user, isAdmin } = useAuth();
  const { bookmarks, collections } = useLibrary();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('crpe_sidebar_collapsed') === 'true';
    } catch (_) {}
    return false;
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('crpe_sidebar_collapsed', String(next));
      } catch (_) {}
      return next;
    });
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Explore Papers', href: '/explore', icon: Compass },
    {
      name: 'Library & Bookmarks',
      href: '/library',
      icon: Bookmark,
      count: bookmarks?.length || 0,
    },
    {
      name: 'Collections',
      href: '/collections',
      icon: FolderKanban,
      count: collections?.length || 0,
    },
    { name: 'Collaborations', href: '/collaborations', icon: Users2 },
    { name: 'Discussions', href: '/discussions', icon: MessageSquare },
    { name: 'Researchers', href: '/researchers', icon: GraduationCap },
    { name: 'Topic Taxonomy', href: '/taxonomy', icon: FolderTree },
    { name: 'Paper Tagging', href: '/tagging', icon: Tag },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden animate-fadeIn"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 bg-[#161827] border-r border-white/[0.08] flex flex-col transition-all duration-300 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isCollapsed ? 'md:w-20' : 'md:w-64'} w-64`}
      >
        {/* Top Header */}
        <div className="h-16 flex items-center justify-between px-4 sm:px-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5 font-bold text-[#F8FAFC]">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-sm shadow-violet-600/30">
              <FileText className="w-4 h-4" />
            </div>
            {!isCollapsed && (
              <span className="font-extrabold text-sm tracking-tight truncate text-[#F8FAFC]">
                Scholar<span className="text-violet-400">Sphere</span>
              </span>
            )}
          </div>

          <div className="flex items-center">
            {/* Collapse toggle (desktop only) */}
            <button
              type="button"
              onClick={toggleCollapse}
              className="hidden md:flex p-1.5 text-[#71758B] hover:text-[#F8FAFC] rounded-lg hover:bg-white/5 transition cursor-pointer"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>

            {/* Close button (mobile only) */}
            <button
              type="button"
              onClick={onClose}
              className="md:hidden p-1.5 text-[#71758B] hover:text-[#F8FAFC] rounded-lg hover:bg-white/5 transition cursor-pointer"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          {/* Main Workspace Section */}
          <div>
            {!isCollapsed && (
              <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-[#71758B]">
                Workspace
              </div>
            )}
            <nav className="space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={onClose}
                    title={isCollapsed ? item.name : undefined}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2.5 text-xs font-semibold rounded-xl transition-all group ${
                        isActive
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-600/30 font-bold'
                          : 'text-[#A1A1B5] hover:text-[#F8FAFC] hover:bg-white/[0.06]'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 transition-colors ${
                              isActive
                                ? 'text-white'
                                : 'text-[#71758B] group-hover:text-violet-400'
                            }`}
                          />
                          {!isCollapsed && (
                            <span className="truncate">{item.name}</span>
                          )}
                        </div>
                        {!isCollapsed && item.count !== undefined && item.count > 0 && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : 'bg-[#23263A] text-[#A1A1B5] border border-white/10'
                            }`}
                          >
                            {item.count}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Admin Section (Conditional) */}
          {isAdmin && (
            <div>
              {!isCollapsed && (
                <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  Administration
                </div>
              )}
              <nav className="space-y-1">
                <NavLink
                  to="/admin/monitoring"
                  onClick={onClose}
                  title={isCollapsed ? 'Monitoring & Metrics' : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl transition-all ${
                      isActive
                        ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/25 font-bold'
                        : 'text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10'
                    }`
                  }
                >
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span>Monitoring & Metrics</span>}
                </NavLink>
              </nav>
            </div>
          )}

          {/* AI Features Notice (Expanded mode only) */}
          {!isCollapsed && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-violet-950/40 to-indigo-950/30 border border-violet-500/20 text-[#F8FAFC]">
              <div className="flex items-center gap-2 text-violet-300 text-xs font-bold mb-1">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>AI Multi-Perspective</span>
              </div>
              <p className="text-[11px] text-[#A1A1B5] leading-relaxed">
                Synthesize Layman, Executive, or Deep Technical breakdowns for any paper.
              </p>
            </div>
          )}
        </div>

        {/* User Footer */}
        <div className="p-3.5 border-t border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
              {user?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#F8FAFC] truncate">
                  {user?.full_name || 'Scholar'}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="primary" size="xs">
                    {user?.role || 'STUDENT'}
                  </Badge>
                </div>
              </div>
            )}
            {!isCollapsed && (
              <NavLink
                to="/settings"
                onClick={onClose}
                className="p-1.5 text-[#71758B] hover:text-[#F8FAFC] rounded-lg hover:bg-white/5 transition"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </NavLink>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
