import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  BookOpen,
  LogOut,
  User,
  Settings,
  Shield,
  Upload,
  Sun,
  Moon,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import NotificationBell from '../NotificationBell';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { ROLE_LABELS, ROLE_COLORS } from '../../utils/constants';

export default function Navbar({ onToggleSidebar, onOpenUpload, sidebarCollapsed = false }) {
  const { user, logout, isAdmin, hasPermission } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const canUpload = hasPermission('papers:upload') || isAdmin;

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  return (
    <header className={`sticky top-0 z-30 h-16 glass-nav transition-[padding] duration-300 ease-out ${
      sidebarCollapsed ? 'md:pl-20' : 'md:pl-64'
    }`}>
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Left: Mobile hamburger & Mobile Logo */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="md:hidden p-2 -ml-2 text-theme-secondary hover:text-theme-main rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Link
            to="/dashboard"
            className="flex md:hidden items-center gap-2.5 font-bold text-lg text-theme-main group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-violet-600/30 group-hover:scale-105 transition-transform">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="leading-tight text-theme-main font-extrabold tracking-tight text-base">
                Scholar<span className="text-violet-400">Sphere</span>
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-theme-muted">
                Research Explorer
              </span>
            </div>
          </Link>
        </div>

        {/* Middle: Global Quick Jump / Search Trigger */}
        <div className="hidden md:flex flex-1 max-w-md mx-4">
          <button
            type="button"
            onClick={() => navigate('/explore')}
            className="w-full flex items-center justify-between px-3.5 py-2 text-sm text-theme-secondary bg-theme-secondary border border-white/10 rounded-xl hover:border-violet-500/40 hover:bg-theme-elevated transition-all cursor-pointer group shadow-2xs"
          >
            <span className="flex items-center gap-2.5 text-theme-secondary group-hover:text-theme-main font-medium">
              <Search className="w-4 h-4 text-theme-muted group-hover:text-violet-400 transition-colors" />
              <span>Search papers, topics, authors...</span>
            </span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-mono font-bold text-theme-muted bg-theme-elevated border border-white/10 rounded-lg shadow-2xs">
              /
            </kbd>
          </button>
        </div>

        {/* Right: Actions, Notifications, Theme Toggle, Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Explore Link */}
          <Link to="/explore" className="hidden xl:inline-flex">
            <Button variant="ghost" size="xs" className="text-xs">
              Explore
            </Button>
          </Link>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 text-theme-secondary hover:text-theme-main rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-violet-400" />
            )}
          </button>

          {canUpload && (
            <Button
              variant="primary"
              size="sm"
              onClick={onOpenUpload}
              iconLeft={Upload}
              className="hidden sm:inline-flex"
            >
              Upload Paper
            </Button>
          )}

          {/* Notification Bell */}
          <div className="relative">
            <NotificationBell />
          </div>

          {/* User Profile Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-2 p-1 rounded-xl hover:bg-white/5 transition-colors cursor-pointer border border-transparent hover:border-white/10"
              aria-label="User profile menu"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 via-indigo-600 to-cyan-400 flex items-center justify-center text-white text-xs font-bold uppercase ring-2 ring-white/10 shadow-sm">
                {user?.full_name ? user.full_name.charAt(0) : user?.email?.charAt(0) || 'U'}
              </div>
              <div className="hidden lg:flex flex-col text-left">
                <span className="text-xs font-semibold text-theme-main line-clamp-1 max-w-[120px]">
                  {user?.full_name || 'My Account'}
                </span>
                <span className="text-[10px] text-theme-muted">
                  {ROLE_LABELS[user?.role] || user?.role || 'Guest'}
                </span>
              </div>
            </button>

            {profileDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setProfileDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-theme-card rounded-2xl shadow-2xl shadow-black/70 border border-white/10 py-2 z-50 animate-scaleUp text-sm text-theme-main">
                  <div className="px-4 py-3 border-b border-theme-subtle">
                    <p className="font-semibold text-theme-main truncate">
                      {user?.full_name || (user?.role === 'STUDENT' ? 'Student Scholar' : 'Research Scholar')}
                    </p>
                    <p className="text-xs text-theme-secondary truncate mt-0.5">
                      {user?.email}
                    </p>
                    <div className="mt-2.5">
                      <Badge variant={ROLE_COLORS[user?.role] || 'primary'} size="sm">
                        {ROLE_LABELS[user?.role] || user?.role}
                      </Badge>
                    </div>
                  </div>

                  <div className="py-1">
                    <Link
                      to="/profile"
                      onClick={() => setProfileDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-theme-secondary hover:text-theme-main hover:bg-white/5 transition-colors text-xs font-medium"
                    >
                      <User className="w-4 h-4 text-theme-muted" />
                      <span>My Profile</span>
                    </Link>
                    <Link
                      to="/settings"
                      onClick={() => setProfileDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-theme-secondary hover:text-theme-main hover:bg-white/5 transition-colors text-xs font-medium"
                    >
                      <Settings className="w-4 h-4 text-theme-muted" />
                      <span>Settings & Preferences</span>
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin/monitoring"
                        onClick={() => setProfileDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-amber-400 hover:bg-amber-500/10 transition-colors text-xs font-semibold"
                      >
                        <Shield className="w-4 h-4" />
                        <span>Admin Monitoring</span>
                      </Link>
                    )}
                  </div>

                  <div className="pt-1 border-t border-theme-subtle">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-rose-400 hover:bg-rose-500/10 transition-colors text-left text-xs font-medium cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
