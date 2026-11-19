import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LibraryProvider } from './context/LibraryContext';
import { ThemeProvider } from './context/ThemeContext';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <LibraryProvider>
            <AppRoutes />
          </LibraryProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
