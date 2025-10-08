import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('🔐 AuthCallback 页面加载');
        console.log('📍 当前 URL:', window.location.href);
        console.log('🔑 Hash:', window.location.hash);
        console.log('🔍 Search:', window.location.search);
        
        // 解析 URL 参数
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const searchParams = new URLSearchParams(window.location.search);
        
        // 检查错误参数（可能在 hash 或 search 中）
        const errorCode = searchParams.get('error') || hashParams.get('error');
        const errorDescription = searchParams.get('error_description') || hashParams.get('error_description');
        
        if (errorCode) {
          console.error('❌ URL 中包含错误:', errorCode, errorDescription);
          throw new Error(errorDescription || errorCode);
        }
        
        // 🔑 PKCE Flow: 检查 query string 中的 code 参数（邮箱验证使用此方式）
        const code = searchParams.get('code');
        
        if (code) {
          console.log('🔑 检测到 PKCE code，开始交换 session...');
          console.log('📝 Code:', code.substring(0, 20) + '...');
          
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.error('❌ 交换 code 失败:', error);
            throw error;
          }
          
          if (data.session) {
            console.log('✅ Session 交换成功！');
            console.log('👤 用户:', data.session.user.email);
            console.log('🆔 用户 ID:', data.session.user.id);
            setProcessing(false);
            return;
          } else {
            console.error('❌ 交换成功但未返回 session');
            throw new Error('未能创建会话');
          }
        }
        
        // 🔑 Implicit Flow: 检查 hash 中的 access_token（某些 OAuth 使用此方式）
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        if (accessToken && refreshToken) {
          console.log('🔑 检测到 access_token，设置 session...');
          
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (error) {
            console.error('❌ 设置 session 失败:', error);
            throw error;
          }
          
          if (data.session) {
            console.log('✅ Session 设置成功！');
            console.log('👤 用户:', data.session.user.email);
            setProcessing(false);
            return;
          }
        }
        
        // 🔄 如果没有 code 或 token，可能是直接访问或其他情况
        console.warn('⚠️ 未检测到 code 或 token，尝试获取当前 session...');
        
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ 获取 session 失败:', error);
          throw error;
        }
        
        if (currentSession) {
          console.log('✅ 当前已有 session:', currentSession.user.email);
          setProcessing(false);
          return;
        }
        
        // 没有找到任何认证信息
        console.error('❌ 未找到任何认证信息');
        throw new Error('未找到认证参数，请重新验证');
        
      } catch (error) {
        console.error('❌ 认证回调处理失败:', error);
        console.error('❌ 错误详情:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
        });
        setProcessing(false);
        
        // 更友好的错误提示
        let errorMessage = '无法完成邮箱验证，请重试。';
        
        if (error.message?.includes('expired') || error.message?.includes('Expired')) {
          errorMessage = '验证链接已过期，请重新注册获取新的验证邮件。';
        } else if (error.message?.includes('invalid') || error.message?.includes('Invalid')) {
          errorMessage = '验证链接无效或已被使用，请重新注册。';
        } else if (error.message?.includes('already') || error.message?.includes('Already')) {
          errorMessage = '此邮箱已经被验证过，请直接登录。';
        } else if (error.message?.includes('not found') || error.message?.includes('Not found')) {
          errorMessage = '验证链接无效，请确认链接是否完整。';
        }
        
        toast({
          variant: 'destructive',
          title: '验证失败',
          description: errorMessage,
          duration: 6000,
        });
        setTimeout(() => navigate('/auth'), 3000);
      }
    };

    handleAuthCallback();
  }, [toast, navigate]);

  useEffect(() => {
    if (!processing && session) {
      console.log('🎉 验证成功！Session 已获取:', session.user.email);
      toast({
        title: '🎉 邮箱验证成功！',
        description: `欢迎回来，${session.user.email}!`,
        duration: 4000,
      });
      
      // 延迟跳转，让用户看到成功提示
      setTimeout(() => {
        console.log('🏠 跳转到首页');
        navigate('/');
      }, 1000);
    }
  }, [processing, session, navigate, toast]);

  useEffect(() => {
    if (!processing && !session) {
      console.warn('⚠️ Processing 完成但没有 session，等待8秒后超时');
      const timeoutId = setTimeout(() => {
        console.error('❌ 登录超时：8秒后仍未获取到 session');
        toast({
          variant: 'destructive',
          title: '登录超时',
          description: '未能获取您的会话信息，请重试。可能是 token 已过期或无效。',
          duration: 6000,
        });
        navigate('/auth');
      }, 8000); // 延长到 8 秒

      return () => clearTimeout(timeoutId);
    }
  }, [processing, session, navigate, toast]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-blue-100 to-purple-100">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, type: 'spring' }}
        className="flex flex-col items-center space-y-4"
      >
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-purple-500"></div>
        <p className="text-lg font-semibold text-gray-700">正在安全地将您登录...</p>
        <p className="text-sm text-gray-500">请稍候，我们正在验证您的会话。</p>
        {processing && (
          <p className="text-xs text-gray-400 mt-2">处理中...</p>
        )}
        {!processing && !session && (
          <p className="text-xs text-yellow-600 mt-2">等待会话更新...</p>
        )}
        {import.meta.env.DEV && (
          <div className="mt-4 p-3 bg-white/50 rounded text-xs text-gray-600 max-w-md">
            <p>调试信息：</p>
            <p>Processing: {processing ? '是' : '否'}</p>
            <p>Session: {session ? '已获取' : '未获取'}</p>
            <p className="break-all">Hash: {window.location.hash.substring(0, 50)}...</p>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AuthCallback;