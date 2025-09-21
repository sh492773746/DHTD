import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@/index.css';
import { AuthProvider, useAuth } from '@/contexts/SupabaseAuthContext';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from '@/components/ui/toaster';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/contexts/ThemeProvider';
import { TenantProvider } from '@/contexts/TenantContext';
import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error.message.includes('Failed to fetch') || (error instanceof TypeError && error.message === 'Failed to fetch')) {
          return failureCount < 2;
        }
        return false;
      },
    },
  },
});

function FaviconUpdater() {
  const { siteSettings } = useAuth();
  React.useEffect(() => {
    const href = siteSettings?.site_favicon || siteSettings?.logo_url || siteSettings?.site_logo || null;
    if (!href) return;
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = href;
  }, [siteSettings?.site_favicon, siteSettings?.logo_url, siteSettings?.site_logo]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <HelmetProvider>
          <ThemeProvider>
            <TenantProvider>
              <AuthProvider>
                <FaviconUpdater />
                <App />
                <Analytics />
                <SpeedInsights />
                <Toaster />
              </AuthProvider>
            </TenantProvider>
          </ThemeProvider>
        </HelmetProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);