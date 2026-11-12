import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LibraryProvider } from './context/LibraryContext';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <LibraryProvider>
          <AppRoutes />
        </LibraryProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
