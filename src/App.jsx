
import React from 'react';
import { useRoutes } from 'react-router-dom';
import routerConfig from '@/router';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Toaster } from '@/components/ui/toaster';
import { HelmetProvider } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from '@/contexts/ThemeProvider';
import { AlertTriangle } from 'lucide-react';
import AppPopup from '@/components/AppPopup';

const LoadingScreen = () => {
  const { siteSettings } = useAuth();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
      <div className="text-center">
        <div className="relative w-24 h-24 flex items-center justify-center">
           <motion.div
                className="absolute w-24 h-24 border-4 border-primary/20 rounded-full"
            ></motion.div>
            <motion.div
                className="absolute w-24 h-24 border-4 border-primary border-t-transparent border-l-transparent rounded-full animate-spin"
                 style={{ animationDuration: '1.5s' }}
            ></motion.div>
            <Avatar className="h-16 w-16">
              <AvatarImage src={siteSettings?.site_logo || "https://horizons-cdn.hostinger.com/05c1c223-1f7f-4436-89e0-214b6c7f1cc7/ca5e112327f3a69b9d57fc879b1a816d.png"} alt={siteSettings?.site_name} />
              <AvatarFallback className="bg-secondary text-secondary-foreground font-bold text-xl">
                {siteSettings?.site_name?.[0] || 'D'}
              </AvatarFallback>
            </Avatar>
        </div>
        <motion.h2 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, type: 'spring' }}
          className="mt-6 text-xl font-semibold text-foreground tracking-widest"
        >
          正在加载...
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground mt-1"
        >
          {siteSettings?.site_name || '大海团队'}
        </motion.p>
      </div>
    </div>
  );
};

const ErrorScreen = ({ title, message }) => (
    <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center p-8 border rounded-lg shadow-lg bg-card max-w-md mx-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
            <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-destructive mb-2">{title}</h1>
          <p className="text-muted-foreground">{message}</p>
          <p className="text-sm text-muted-foreground mt-4">
            这通常是由于网络问题或服务配置不正确引起的。请检查您的Supabase集成状态并稍后重试。
          </p>
        </div>
    </div>
);


function App() {
  const { isInitialized, supabase, loading, connectionError } = useAuth();
  const { theme } = useTheme();
  const element = useRoutes(routerConfig);
  const [forceRender, setForceRender] = React.useState(false);

  React.useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.setAttribute('data-theme', theme);
    root.classList.add(theme);
  }, [theme]);

  // 添加超时保护：如果 10 秒后仍在加载，强制渲染应用
  React.useEffect(() => {
    if (loading && !forceRender) {
      console.log('⏳ 应用加载中...');
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ 加载超时（10秒），强制渲染应用');
        setForceRender(true);
      }, 10000); // 10 秒超时

      return () => clearTimeout(timeoutId);
    }
  }, [loading, forceRender]);

  if (connectionError) {
      return <ErrorScreen title="连接错误" message={connectionError} />;
  }

  if (!supabase && isInitialized) {
    return <ErrorScreen title="配置错误" message="Supabase 未能正确初始化。请检查您的 .env 文件并确保 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 已正确设置。" />;
  }

  return (
    <>
      <AnimatePresence>
        {loading && !forceRender && <LoadingScreen />}
      </AnimatePresence>
      {(!loading || forceRender) && element}
      {(!loading || forceRender) && <AppPopup />}
    </>
  );
}
export default App;
