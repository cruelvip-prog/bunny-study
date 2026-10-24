import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './ThemeContext';
import { AuthProvider } from './auth/AuthProvider';
import './index.css';
import 'katex/dist/katex.min.css';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ThemeProvider>,
);
