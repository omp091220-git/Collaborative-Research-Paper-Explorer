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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#10111B]/95 backdrop-blur-md border-t border-white/[0.08] px-2 py-1 safe-bottom">
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
                    ? 'text-violet-400 font-bold'
                    : 'text-[#71758B] hover:text-[#F8FAFC]'
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
