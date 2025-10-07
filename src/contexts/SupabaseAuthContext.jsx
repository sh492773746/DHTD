
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase as supabaseClient } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '@/contexts/TenantContext';
import { fetchWithRetry } from '@/lib/api';

const AuthContext = createContext(undefined);

const fetchSiteSettings = async (currentTenantId) => {
  if (currentTenantId === undefined || currentTenantId === null) return {};
  try {
    const res = await fetch(`/api/settings?t=${Date.now()}`);
    if (!res.ok) return {};
    const map = await res.json();
    return map || {};
  } catch (e) {
    console.error('Error fetching settings via Turso:', e);
    throw e;
  }
};

const fetchMainSiteSettings = async () => {
  try {
    const res = await fetch('/api/settings?scope=main');
    if (!res.ok) return {};
    const map = await res.json();
    return map || {};
  } catch (e) {
    console.error('Error fetching MAIN settings via Turso:', e);
    return {};
    }
};

const fetchProfile = async (userId, token) => {
  if (!userId || !token) return null;
  const res = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}&ensure=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`profile fetch failed: ${res.status} ${text}`);
    }
  return await res.json();
}

const checkSuperAdmin = async (token) => {
  if (!token) return false;
  try {
    const res = await fetch('/api/admin/is-super-admin', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const j = await res.json();
    return !!j?.isSuperAdmin;
  } catch {
        return false;
    }
};

const fetchTenantAdmins = async (token) => {
  if (!token) return [];
  try {
    const res = await fetch('/api/admin/tenant-admins', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return [];
    const arr = await res.json();
    return Array.isArray(arr) ? arr.map(id => ({ tenant_id: id })) : [];
  } catch {
    return [];
  }
};

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeTenantId: tenantId, isLoading: isTenantLoading } = useTenant();

  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [siteSettings, setSiteSettings] = useState({});
  const [areSettingsLoading, setAreSettingsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(null);
  
  const { data: profile, isLoading: isProfileLoading } = useQuery({
      queryKey: ['profile', user?.id, session?.access_token],
      queryFn: () => fetchProfile(user?.id, session?.access_token),
      enabled: sessionLoaded && !!user && !!session?.access_token,
  });

  const { data: isSuperAdmin, isLoading: isSuperAdminLoading } = useQuery({
      queryKey: ['isSuperAdmin', session?.access_token],
      queryFn: () => checkSuperAdmin(session?.access_token),
      enabled: sessionLoaded && !!session?.access_token,
  });
  
  const { data: tenantAdminData, isLoading: isTenantAdminLoading } = useQuery({
      queryKey: ['tenantAdmin', session?.access_token],
      queryFn: () => fetchTenantAdmins(session?.access_token),
      enabled: sessionLoaded && !!session?.access_token,
  });

  const isTenantAdmin = tenantAdminData && tenantAdminData.length > 0;
  
  const userTenantId = useMemo(() => {
    if (isTenantAdmin) return tenantAdminData[0]?.tenant_id;
    return profile?.tenant_id;
  }, [profile, isTenantAdmin, tenantAdminData]);


  useEffect(() => {
    const loadSettings = async () => {
      if (tenantId !== undefined && tenantId !== null) {
        setAreSettingsLoading(true);
        try {
          const settings = await fetchSiteSettings(tenantId);
          setSiteSettings(settings);
        } catch (e) {
          if (e.message.includes('Failed to fetch')) {
            setConnectionError("无法连接到数据库。请检查您的网络设置或完成Supabase集成。");
          }
        } finally {
          setAreSettingsLoading(false);
        }
      }
    };
    if (!isTenantLoading) {
      loadSettings();
    }
  }, [tenantId, isTenantLoading]);

  const signOut = useCallback(async () => {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            if (!error.message.includes('session_not_found') && !error.message.includes('Socket closed')) {
               console.error("Caught unexpected exception during sign out:", error);
               throw error;
            }
        }
        toast({ title: "登出成功", description: "您已安全退出，期待您的下次访问。" });
    } catch (e) {
        console.error("Error during sign out process:", e);
        if (!e.message.includes('Failed to fetch')) {
          toast({
              variant: "destructive",
              title: "登出时发生错误",
              description: e.message
          });
        }
    } finally {
        queryClient.clear();
        setUser(null);
        setSession(null);
    }
  }, [toast, queryClient]);
  
  const handleSessionChange = useCallback(async (currentSession) => {
    setSession(currentSession);
    const currentUser = currentSession?.user ?? null;
    setUser(currentUser);

    if (!currentUser) {
      queryClient.setQueryData(['profile', undefined], null);
      queryClient.setQueryData(['isSuperAdmin', undefined], false);
      queryClient.setQueryData(['tenantAdmin', undefined], []);
    }
    
    if(!sessionLoaded) setSessionLoaded(true);
  }, [queryClient, sessionLoaded]);

  useEffect(() => {
    let isMounted = true;
    if (!supabaseClient) {
      setConnectionError("Supabase 未能正确初始化。请检查您的 .env 文件并确保 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 已正确设置。");
      setSessionLoaded(true);
      return;
    }

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      (_event, session) => {
        if(isMounted) {
          handleSessionChange(session);
        }
      }
    );
    
    supabaseClient.auth.getSession().then(({ data: { session }, error }) => {
        if (!isMounted) return;

        if (error) {
            console.error("Error getting session:", error);
            if (error.message.includes('Failed to fetch')) {
                setConnectionError("无法连接到数据库。请检查您的网络设置或完成Supabase集成。");
            }
            handleSessionChange(null);
        } else {
            handleSessionChange(session);
        }
    }).catch(err => {
        console.error("Critical error in getSession promise:", err);
        if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
            setConnectionError("无法连接到数据库。请检查您的网络设置或完成Supabase集成。");
        }
        if (isMounted) {
          handleSessionChange(null);
        }
    }).finally(() => {
      if (isMounted && !sessionLoaded) {
        setSessionLoaded(true);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [handleSessionChange, sessionLoaded, signOut]);

  const isAdmin = !!isSuperAdmin || isTenantAdmin;

  const isInitialized = useMemo(() => {
    if (isTenantLoading || !sessionLoaded || areSettingsLoading) return false;
    if (user) {
        return !isProfileLoading && !isSuperAdminLoading && !isTenantAdminLoading;
    }
    return true;
  }, [isTenantLoading, sessionLoaded, user, isProfileLoading, isSuperAdminLoading, isTenantAdminLoading, areSettingsLoading]);

  const loading = !isInitialized;
  
  // 将 Supabase 错误转换为人性化的中文提示
  const getHumanReadableError = useCallback((error) => {
    if (!error) return "发生未知错误";
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || '';
    
    // 邮箱相关错误
    if (errorMessage.includes('user already registered') || errorCode === 'user_already_exists') {
      return "该邮箱已被注册。如果是您的账号，请直接登录；如果忘记密码，可以使用找回密码功能。";
    }
    
    if (errorMessage.includes('email not confirmed') || errorMessage.includes('email address not confirmed')) {
      return "您的邮箱尚未验证。请检查您的邮箱（包括垃圾邮件箱），点击验证链接后再登录。";
    }
    
    // 密码相关错误
    if (errorMessage.includes('invalid login credentials') || errorMessage.includes('invalid credentials')) {
      return "邮箱或密码错误。请检查您的输入，或使用找回密码功能。";
    }
    
    if (errorMessage.includes('password should be at least') || errorMessage.includes('password is too short')) {
      return "密码太短，至少需要 6 个字符。请设置一个更强的密码。";
    }
    
    if (errorMessage.includes('password') && errorMessage.includes('weak')) {
      return "密码强度不够。建议使用字母、数字和特殊字符的组合。";
    }
    
    // 邮箱格式错误
    if (errorMessage.includes('invalid email') || errorMessage.includes('unable to validate email')) {
      return "邮箱格式不正确。请输入有效的邮箱地址，如 example@email.com";
    }
    
    // 网络相关错误
    if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
      return "网络连接失败。请检查您的网络连接后重试。";
    }
    
    if (errorMessage.includes('timeout')) {
      return "请求超时。网络可能较慢，请稍后重试。";
    }
    
    // 频率限制
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      return "操作过于频繁。请稍等片刻后再试。";
    }
    
    // 验证码相关
    if (errorMessage.includes('otp') && errorMessage.includes('expired')) {
      return "验证码已过期。请重新获取验证码。";
    }
    
    if (errorMessage.includes('otp') && errorMessage.includes('invalid')) {
      return "验证码不正确。请检查您输入的验证码。";
    }
    
    // 邮件发送
    if (errorMessage.includes('email') && errorMessage.includes('send')) {
      return "邮件发送失败。请检查邮箱地址是否正确，或稍后重试。";
    }
    
    // 账号被禁用
    if (errorMessage.includes('user banned') || errorMessage.includes('account disabled')) {
      return "您的账号已被禁用。如有疑问，请联系管理员。";
    }
    
    // 会话过期
    if (errorMessage.includes('session') && errorMessage.includes('expired')) {
      return "登录已过期。请重新登录。";
    }
    
    // 默认返回原始错误（如果没有匹配到）
    return error.message || "操作失败，请稍后重试。";
  }, []);

  const signUp = useCallback(async (email, password, options) => {
    // 动态设置重定向 URL，支持多个域名和分站
    const redirectUrl = `${window.location.origin}/auth/callback`;
    
    const { data, error } = await fetchWithRetry(() => supabaseClient.auth.signUp({ 
      email, 
      password, 
      options: { 
        ...options, 
        emailRedirectTo: redirectUrl,  // 动态重定向到当前域名
        data: { 
          hostname: window.location.hostname 
        } 
      }
    }));
    if (error) {
      const humanError = getHumanReadableError(error);
      toast({ 
        variant: "destructive", 
        title: "注册失败", 
        description: humanError,
        duration: 6000, // 显示更长时间，让用户看清详细信息
      });
    } else if (data.user) {
      // 检查是否已注册但未验证
      if (data.user.identities && data.user.identities.length === 0) {
        toast({
          variant: "destructive",
          title: "该邮箱已被注册",
          description: "此邮箱已注册但尚未验证。请检查您的邮箱（包括垃圾邮件箱）完成验证，或使用其他邮箱注册。",
          duration: 8000,
        });
      } else {
        toast({ 
          title: "注册成功！", 
          description: "📧 验证邮件已发送到您的邮箱，请查收并点击链接完成验证。如未收到，请检查垃圾邮件箱。",
          duration: 8000,
        });
      }
    }
    return { data, error };
  }, [toast, getHumanReadableError]);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await fetchWithRetry(() => supabaseClient.auth.signInWithPassword({ email, password }));
    if (error) {
      const humanError = getHumanReadableError(error);
      toast({ 
        variant: "destructive", 
        title: "登录失败", 
        description: humanError,
        duration: 6000,
      });
    } else if (data.user) {
      toast({ 
        title: "登录成功！", 
        description: `🎉 欢迎回来，${data.user.email}!`,
        duration: 3000,
      });
    }
    return { data, error };
  }, [toast, getHumanReadableError]);

  const refreshProfile = useCallback(() => {
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      }
  }, [user, queryClient]);

  const refreshSiteSettings = useCallback(() => {
    if (tenantId !== undefined) {
      setAreSettingsLoading(true);
      fetchSiteSettings(tenantId).then(settings => {
        setSiteSettings(settings);
        setAreSettingsLoading(false);
      });
    }
  }, [tenantId]);

  const value = {
    user,
    session,
    profile,
    siteSettings: siteSettings || {},
    loading,
    isInitialized,
    isAdmin,
    isSuperAdmin: !!isSuperAdmin,
    isTenantAdmin,
    tenantId, 
    userTenantId,
    connectionError,
    signUp,
    signIn,
    signOut,
    refreshProfile,
    refreshSiteSettings,
    supabase: supabaseClient
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
