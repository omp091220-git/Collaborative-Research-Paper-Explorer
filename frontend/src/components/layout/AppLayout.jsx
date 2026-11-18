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
    <div className="min-h-[50vh] flex flex-col items-center justify-center animate-fadeIn text-theme-main">
      <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      <span className="mt-3 text-xs font-bold text-theme-secondary uppercase tracking-widest">
        Loading view...
      </span>
    </div>
  );
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('crpe_sidebar_collapsed') === 'true';
    } catch (_) {
      return false;
    }
  });
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
      <div className="h-screen w-screen overflow-hidden bg-theme-main text-theme-main antialiased flex flex-col">
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
    <div className="min-h-screen bg-theme-main text-theme-main antialiased flex flex-col selection:bg-violet-500/30 selection:text-theme-main">
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
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />

        {/* Content Area */}
        <main
          className={`flex-1 flex flex-col min-w-0 pb-20 md:pb-6 transition-[padding] duration-300 ease-out ${
            sidebarCollapsed ? 'md:pl-20' : 'md:pl-64'
          }`}
        >
          <div key={location.pathname} className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fadeIn">
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
