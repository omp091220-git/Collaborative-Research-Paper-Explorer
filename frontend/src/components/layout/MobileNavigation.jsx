import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Compass, Bookmark, FolderKanban, User } from 'lucide-react';

export default function MobileNavigation() {
  const tabs = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Explore', href: '/explore', icon: Compass },
    { name: 'Library', href: '/library', icon: Bookmark },
    { name: 'Collections', href: '/collections', icon: FolderKanban },
    { name: 'Profile', href: '/profile', icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1 safe-bottom">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.name}
              to={tab.href}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1.5 px-3 min-w-[56px] text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`
              }
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{tab.name}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
