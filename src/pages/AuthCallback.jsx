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
        
        // 让 Supabase 自动处理 URL 中的认证参数
        // Supabase SDK 会自动检测并处理 hash 或 query 中的 token
        console.log('⏳ 让 Supabase SDK 自动处理认证...');
        
        // 等待 Supabase 完成处理（通常需要1-3秒）
        // Supabase 会通过 onAuthStateChange 触发 session 更新
        for (let i = 0; i < 6; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const { data: { session: currentSession }, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('❌ 获取会话失败:', error);
            throw error;
          }
          
          if (currentSession) {
            console.log('✅ 会话已获取:', currentSession.user.email);
            console.log('👤 用户 ID:', currentSession.user.id);
            console.log(`⏱️ 用时: ${(i + 1) * 500}ms`);
            setProcessing(false);
            return;
          }
          
          console.log(`⏳ 等待中... (${(i + 1) * 500}ms)`);
        }
        
        // 3秒后仍未获取到 session
        console.warn('⚠️ 3秒后仍未获取到会话');
        setProcessing(false);
        
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
        
        if (error.message.includes('expired')) {
          errorMessage = '验证链接已过期，请重新注册获取新的验证邮件。';
        } else if (error.message.includes('invalid')) {
          errorMessage = '验证链接无效，请确认链接是否完整。';
        } else if (error.message.includes('already')) {
          errorMessage = '此邮箱已经被验证过，请直接登录。';
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