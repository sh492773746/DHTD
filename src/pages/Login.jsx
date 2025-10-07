import React, { useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, supabase } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // 前端验证
    if (!email.trim()) {
      toast({
        variant: "destructive",
        title: "请输入邮箱",
        description: "邮箱地址不能为空。",
      });
      return;
    }
    
    if (!password) {
      toast({
        variant: "destructive",
        title: "请输入密码",
        description: "密码不能为空。",
      });
      return;
    }
    
    setLoading(true);
    
    const { error } = await signIn(email.trim(), password);

    if (!error) {
      // Toast 已在 AuthContext 中处理
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
    setLoading(false);
  };
  
  const handleMagicLink = async (e) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({ 
        variant: "destructive", 
        title: "请输入邮箱", 
        description: "我们需要您的邮箱地址来发送魔法登录链接。",
        duration: 4000,
      });
      return;
    }
    
    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast({ 
        variant: "destructive", 
        title: "邮箱格式不正确", 
        description: "请输入有效的邮箱地址，如 example@email.com",
        duration: 4000,
      });
      return;
    }
    
    setLoading(true);

    if (!supabase) {
      toast({ 
        variant: "destructive", 
        title: "认证服务暂时不可用", 
        description: "请稍后重试，或使用密码登录。",
        duration: 4000,
      });
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      const errorMessage = error.message?.toLowerCase() || '';
      let description = error.message;
      
      if (errorMessage.includes('invalid email')) {
        description = "邮箱格式不正确，请检查后重试。";
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
        description = "发送过于频繁，请稍等片刻后再试。";
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        description = "网络连接失败，请检查网络后重试。";
      }
      
      toast({ 
        variant: "destructive", 
        title: "发送失败", 
        description: description,
        duration: 5000,
      });
    } else {
      toast({ 
        title: "邮件已发送！", 
        description: "📧 请检查您的邮箱（包括垃圾邮件箱），点击链接即可登录。链接有效期为 1 小时。",
        duration: 8000,
      });
    }
    setLoading(false);
  };

  return (
    <motion.div 
      className="mt-8 sm:mx-auto sm:w-full sm:max-w-md"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <form className="space-y-6" onSubmit={handleLogin}>
          <div>
            <Label htmlFor="email">邮箱地址</Label>
            <div className="mt-1">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">密码</Label>
              <span className="text-xs text-gray-500">
                忘记密码？请使用下方的魔法链接登录
              </span>
            </div>
            <div className="mt-1">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <Button type="submit" disabled={loading} className="w-full" variant="gradient">
              {loading ? '登录中...' : '登录'}
            </Button>
          </div>
        </form>
        
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">或</span>
            </div>
          </div>

          <div className="mt-6">
             <Button variant="outline" onClick={handleMagicLink} disabled={loading} className="w-full">
              使用魔法链接登录
            </Button>
          </div>
        </div>

      </div>
    </motion.div>
  );
};

export default Login;