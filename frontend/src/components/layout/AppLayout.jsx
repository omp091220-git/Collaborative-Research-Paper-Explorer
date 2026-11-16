import { useState, useEffect, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Sidebar from './Sidebar';
import MobileNavigation from './MobileNavigation';
import PaperUploadModal from '../papers/PaperUploadModal';
import ErrorBoundary from '../common/ErrorBoundary';
import { useToast } from '../../context/ToastContext';
import { Loader2 } from 'lucide-react';

function ContentLoader() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center animate-fadeIn text-[#F8FAFC]">
      <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      <span className="mt-3 text-xs font-bold text-[#A1A1B5] uppercase tracking-widest">
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
    window.dispatchEvent(new CustomEvent('paper:created', { detail: paper }));
  };

  // Dedicated full-screen reading workspace mode when viewing paper PDF
  const searchParams = new URLSearchParams(location.search);
  const isReadingWorkspace =
    location.pathname.startsWith('/papers/') &&
    (!searchParams.get('tab') || searchParams.get('tab') === 'pdf');

  if (isReadingWorkspace) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#10111B] text-[#F8FAFC] antialiased flex flex-col">
        <main className="flex-1 flex flex-col min-w-0 h-full w-full overflow-hidden p-0 m-0">
          <ErrorBoundary title="ScholarSphere Research Workspace Error">
            <Suspense fallback={<ContentLoader />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#10111B] text-[#F8FAFC] antialiased flex flex-col selection:bg-violet-500/30 selection:text-white">
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
        <main className="flex-1 md:pl-64 flex flex-col min-w-0 pb-16 md:pb-6 transition-all duration-300">
          <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <ErrorBoundary title="ScholarSphere View Error">
              <Suspense fallback={<ContentLoader />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
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
