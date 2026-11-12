import { useState, useEffect, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import MobileNavigation from './MobileNavigation';
import PaperUploadModal from '../papers/PaperUploadModal';
import { useToast } from '../../context/ToastContext';
import { Loader2 } from 'lucide-react';

function ContentLoader() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center animate-fadeIn">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      <span className="mt-3 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
        Loading view...
      </span>
    </div>
  );
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const { addToast } = useToast();
  const location = useLocation();

  // Close mobile sidebar automatically whenever navigation occurs
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleUploadSuccess = (paper) => {
    addToast({
      type: 'success',
      title: 'Paper Added Successfully',
      message: `"${paper?.title || 'Paper'}" is now available in the explorer.`,
    });
    // Trigger global custom event so pages can refresh if needed
    window.dispatchEvent(new CustomEvent('paper:created', { detail: paper }));
  };

  return (
    <div className="min-h-screen bg-slate-100/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased flex flex-col">
      {/* Top Navbar */}
      <Navbar
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onOpenUpload={() => setUploadModalOpen(true)}
      />

      {/* Main Container */}
      <div className="flex-1 flex w-full">
        {/* Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Content Area */}
        <main className="flex-1 md:pl-64 flex flex-col min-w-0 pb-16 md:pb-6 transition-all">
          <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <Suspense fallback={<ContentLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNavigation />

      {/* Global Upload Paper / ArXiv Modal */}
      <PaperUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}
