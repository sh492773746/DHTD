import React, { useState } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';

const Register = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get('invite_code');

  const handleRegister = async (e) => {
    e.preventDefault();
    
    // 前端验证
    if (!username.trim()) {
      toast({
        variant: "destructive",
        title: "请输入用户名",
        description: "用户名不能为空，这将是您在平台上的昵称。",
      });
      return;
    }
    
    if (username.trim().length < 2) {
      toast({
        variant: "destructive",
        title: "用户名太短",
        description: "用户名至少需要 2 个字符。",
      });
      return;
    }
    
    if (password.length < 6) {
      toast({
        variant: "destructive",
        title: "密码太短",
        description: "为了您的账号安全，密码至少需要 6 个字符。建议使用字母、数字和符号的组合。",
        duration: 5000,
      });
      return;
    }
    
    setLoading(true);

    const { data, error } = await signUp(email, password, {
      data: {
        username: username.trim(),
        invited_by: inviteCode,
        hostname: window.location.hostname,
      },
    });

    // Toast 已在 AuthContext 中处理，这里不需要额外提示
    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md mx-auto bg-white p-8 rounded-lg shadow-md"
    >
      <form onSubmit={handleRegister} className="space-y-6">
        <div>
          <Label htmlFor="username">用户名</Label>
          <Input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="mt-1"
            placeholder="您的昵称"
          />
        </div>
        <div>
          <Label htmlFor="email">邮箱</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <Label htmlFor="password">密码</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength="6"
            className="mt-1"
            placeholder="至少6位字符"
          />
          <p className="mt-1 text-xs text-gray-500">
            建议使用字母、数字和特殊字符的组合，提高账号安全性
          </p>
        </div>
        {inviteCode && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3">
            <p className="text-sm text-blue-800">
              您正在使用邀请码: <span className="font-bold">{inviteCode}</span>
            </p>
          </div>
        )}
        <div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </Button>
        </div>
      </form>
    </motion.div>
  );
};

export default Register;