import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { supabaseClient } from '@/lib/supabaseClient';

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { toast } = useToast();
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // 处理 URL 中的认证参数
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        
        // 检查是否有 access_token (hash) 或 code (query)
        const hasToken = hashParams.get('access_token') || queryParams.get('code');
        
        if (hasToken) {
          console.log('🔐 检测到认证 token，正在处理...');
          
          // 让 Supabase 处理认证回调
          const { data, error } = await supabaseClient.auth.getSession();
          
          if (error) {
            console.error('❌ 会话获取失败:', error);
            throw error;
          }
          
          if (data.session) {
            console.log('✅ 会话已获取:', data.session.user.email);
            // 等待一小段时间确保 AuthContext 更新
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        setProcessing(false);
      } catch (error) {
        console.error('❌ 认证回调处理失败:', error);
        setProcessing(false);
        toast({
          variant: 'destructive',
          title: '验证失败',
          description: error.message || '无法完成邮箱验证，请重试。',
        });
        setTimeout(() => navigate('/auth'), 2000);
      }
    };

    handleAuthCallback();
  }, [location, toast, navigate]);

  useEffect(() => {
    if (!processing && session) {
      toast({
        title: '🎉 邮箱验证成功！',
        description: `欢迎回来，${session.user.email}!`,
        duration: 4000,
      });
      
      // 延迟跳转，让用户看到成功提示
      setTimeout(() => {
        navigate('/');
      }, 1000);
    }
  }, [processing, session, navigate, toast]);

  useEffect(() => {
    if (!processing && !session) {
      const timeoutId = setTimeout(() => {
        toast({
          variant: 'destructive',
          title: '登录超时',
          description: '未能获取您的会话信息，请重试。',
        });
        navigate('/auth');
      }, 5000); // 5 second timeout

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
      </motion.div>
    </div>
  );
};

export default AuthCallback;