import React, { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, AlertCircle, Maximize2, Minimize2 } from 'lucide-react';
import { decryptGameUrl } from '@/lib/obfuscator';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const GamePlayer = () => {
  const { siteSettings } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!token) {
      setError('缺少游戏令牌');
      setLoading(false);
      return;
    }

    // 解密游戏URL
    const decrypted = decryptGameUrl(token);
    
    if (!decrypted || !decrypted.url) {
      setError('无效或已过期的游戏链接');
      setLoading(false);
      return;
    }

    // 🔐 使用后端代理完全隐藏真实URL
    // iframe只能看到后端代理地址，无法获取真实游戏URL
    setLoading(false);
  }, [token]);

  // 获取代理URL（通过后端转发，隐藏真实URL）
  const getProxyUrl = () => {
    if (!token) return '';
    // iframe的src指向后端代理，传递加密token
    return `/api/game-proxy?t=${encodeURIComponent(token)}`;
  };

  const handleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('全屏失败:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">加载游戏中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <Helmet>
          <title>加载失败 - {siteSettings?.site_name || '大海团队'}</title>
        </Helmet>
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full">
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                {error}
              </AlertDescription>
            </Alert>
            <Button 
              onClick={() => navigate('/games')} 
              className="w-full"
              variant="outline"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回游戏中心
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>游戏中 - {siteSettings?.site_name || '大海团队'}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      
      <div 
        ref={containerRef}
        className={`relative ${isFullscreen ? 'w-screen h-screen' : 'min-h-screen'} bg-black flex flex-col`}
      >
        {/* 顶部工具栏 */}
        <div className={`bg-gray-900 border-b border-gray-800 ${isFullscreen ? 'absolute top-0 left-0 right-0 z-50' : ''}`}>
          <div className="flex items-center justify-between p-2 sm:p-3">
            <Button
              onClick={() => navigate('/games')}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-gray-800"
            >
              <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">返回</span>
            </Button>
            
            <div className="flex items-center space-x-2">
              <Button
                onClick={handleFullscreen}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-gray-800"
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">退出全屏</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">全屏</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* iframe 游戏容器 - 使用后端代理隐藏真实URL */}
        <div className={`flex-1 ${isFullscreen ? 'pt-12' : ''}`}>
          <iframe
            ref={iframeRef}
            src={getProxyUrl()}
            className="w-full h-full border-0"
            title="游戏"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-pointer-lock allow-top-navigation"
          />
        </div>

        {/* 防盗链水印（半透明） */}
        <div className="absolute bottom-4 right-4 pointer-events-none opacity-20 text-white text-xs hidden sm:block">
          {siteSettings?.site_name || 'Powered by Horizons'}
        </div>
      </div>
    </>
  );
};

export default GamePlayer;

