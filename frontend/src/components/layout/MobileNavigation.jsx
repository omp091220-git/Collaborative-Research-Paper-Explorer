import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Compass, Bookmark, FolderKanban, User, Globe } from 'lucide-react';

export default function MobileNavigation() {
  const tabs = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Explore', href: '/explore', icon: Compass },
    { name: 'Feed', href: '/feed', icon: Globe },
    { name: 'Library', href: '/library', icon: Bookmark },
    { name: 'Collections', href: '/collections', icon: FolderKanban },
    { name: 'Profile', href: '/profile', icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-theme-main backdrop-blur-md border-t border-theme-subtle px-2 py-1 safe-bottom">
      <div className="flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.name}
              to={tab.href}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center min-h-12 py-1.5 px-1 flex-1 min-w-0 text-[10px] sm:text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-violet-400 font-bold'
                    : 'text-theme-muted hover:text-theme-main'
                }`
              }
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="max-w-full truncate">{tab.name}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
