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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLibrary } from '../../context/LibraryContext';
import Badge from '../common/Badge';

export default function Sidebar({ isOpen, onClose }) {
  const { user, isAdmin } = useAuth();
  const { bookmarks, collections } = useLibrary();

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
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-50 dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Header on Mobile */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 md:hidden">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <FileText className="w-4 h-4" />
            </div>
            <span>ScholarSphere</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {/* Main workspace navigation */}
          <div>
            <div className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Workspace
            </div>
            <nav className="space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2 text-sm font-medium rounded-xl transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-3">
                          <Icon
                            className={`w-4 h-4 ${
                              isActive ? 'text-white' : 'text-slate-400'
                            }`}
                          />
                          <span>{item.name}</span>
                        </div>
                        {item.count !== undefined && item.count > 0 && (
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              isActive
                                ? 'bg-indigo-700 text-white'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
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
              <div className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500">
                System Administration
              </div>
              <nav className="space-y-1">
                <NavLink
                  to="/admin/monitoring"
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-xl transition-all ${
                      isActive
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                    }`
                  }
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Monitoring & Metrics</span>
                </NavLink>
              </nav>
            </div>
          )}

          {/* AI Features Notice */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/20 border border-indigo-100 dark:border-indigo-900/50">
            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 text-xs font-bold mb-1">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span>AI Multi-Perspective</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Generate Layman, Executive, or Technical summaries for any paper instantly.
            </p>
          </div>
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
              {user?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {user?.full_name || 'Scholar'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="indigo" size="sm">
                  {user?.role || 'STUDENT'}
                </Badge>
              </div>
            </div>
            <NavLink
              to="/settings"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </NavLink>
          </div>
        </div>
      </aside>
    </>
  );
}
