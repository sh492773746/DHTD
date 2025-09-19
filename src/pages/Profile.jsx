import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Loader2, Edit, Award, Users, Share2, LogOut, ShieldCheck, UserCog, Coins, Gift } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import TenantRequestForm from './TenantRequestForm';
import TenantInfo from '@/components/TenantInfo';
import UserPostHistory from '@/components/UserPostHistory';

async function bffFetchProfile(userId, token, ensure = true, scope) {
  const url = `/api/profile?userId=${encodeURIComponent(userId)}&ensure=${ensure ? '1' : '0'}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`profile request failed: ${res.status}`);
  return res.json();
}

function sameShanghaiDay(a, b) {
  try {
    const fmt = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(a) === fmt.format(b);
  } catch { return false; }
}

const Profile = () => {
  const { user, profile: authProfile, loading: authLoading, signOut, isSuperAdmin, isTenantAdmin, tenantId, siteSettings, session, refreshProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [managedTenantId, setManagedTenantId] = useState(null);
  const { userId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isOwnProfile = !userId || (user && user.id === userId);
  const targetUserId = userId || user?.id;
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkedInToday, setCheckedInToday] = useState(false);

  const fetchProfileData = useCallback(async () => {
    setLoading(true);

    if (!targetUserId) {
      setLoading(false);
      return;
    }

    try {
      let currentProfile = null;
      if (isOwnProfile && authProfile) {
        currentProfile = authProfile;
      } else if (session?.access_token) {
        currentProfile = await bffFetchProfile(targetUserId, session.access_token, false, isOwnProfile ? 'combined' : undefined);
      }

      if (!currentProfile) {
        setLoading(false);
        return;
      }

      setProfile(currentProfile);

      // managedTenantId 依赖 Supabase RPC，先跳过或后续用 BFF 提供
      setManagedTenantId(null);
    } catch (e) {
      console.error('Error fetching profile:', e);
      toast({
        title: '获取个人资料失败',
        description: '无法加载用户数据。',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [targetUserId, isOwnProfile, authProfile, session?.access_token, toast]);

  useEffect(() => {
    if (!authLoading) {
      fetchProfileData();
    }
  }, [authLoading, fetchProfileData]);

  const refreshCheckinStatus = useCallback(async () => {
    try {
      if (!session?.access_token || !isOwnProfile) return;
      const res = await fetch('/api/points/history', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) return;
      const list = await res.json();
      const today = new Date();
      const done = Array.isArray(list) && list.some(item => item?.reason === '每日签到' && item?.created_at && sameShanghaiDay(new Date(item.created_at), today));
      setCheckedInToday(!!done);
    } catch {}
  }, [session?.access_token, isOwnProfile]);

  useEffect(() => {
    refreshCheckinStatus();
  }, [refreshCheckinStatus]);

  const handleDailyCheckin = async () => {
    if (!session?.access_token) return;
    setCheckinLoading(true);
    try {
      const res = await fetch('/api/points/checkin', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        toast({ title: '签到成功', description: `获得 ${data.reward ?? 0} 积分` });
        setCheckedInToday(true);
        refreshProfile && refreshProfile();
      } else if (data?.reason === 'already-done') {
        toast({ title: '今日已签到', description: '明天再来～' });
        setCheckedInToday(true);
      } else {
        toast({ variant: 'destructive', title: '签到失败', description: data?.error || `status ${res.status}` });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: '签到失败', description: e.message });
    } finally {
      setCheckinLoading(false);
    }
  };

  const handleCopyInviteLink = () => {
    const inviteLink = `${window.location.origin}/invite/${profile.invite_code}`;
    navigator.clipboard.writeText(inviteLink);
    toast({
      title: '邀请链接已复制',
      description: '快去分享给好友吧！',
    });
  };

  if (loading || authLoading) {
    return <div className="flex justify-center items-center h-screen"><Loader2 className="h-16 w-16 animate-spin" /></div>;
  }

  if (!profile) {
    return <div className="text-center py-10">无法找到该用户。</div>;
  }

  const showAdminButton = isSuperAdmin;
  const showTenantAdminButton = isTenantAdmin;
  
  return (
    <>
      <Helmet>
        <title>{String(profile.username + '的个人主页 - ' + (siteSettings?.site_name ?? '大海团队'))}</title>
        <meta name="description" content={`查看${profile.username}在${siteSettings?.site_name || '大海团队'}上的个人资料和动态。`} />
      </Helmet>
      <motion.div 
        className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="overflow-hidden shadow-lg border-none bg-gradient-to-br from-blue-50 to-purple-50">
          <CardHeader className="text-center p-6 bg-white/50">
            <motion.div whileHover={{ scale: 1.1 }} className="relative inline-block mx-auto">
              <Avatar className="w-24 h-24 border-4 border-white shadow-md">
                <AvatarImage src={profile.avatar_url} alt={profile.username} />
                <AvatarFallback className="text-3xl bg-gray-200">{profile.username?.[0].toUpperCase()}</AvatarFallback>
              </Avatar>
            </motion.div>
            <h1 className="text-2xl font-bold text-gray-800 mt-4">{profile.username}</h1>
            <p className="text-sm text-gray-500">UID: {profile.uid}</p>
            {isOwnProfile && (
              <div className="mt-3">
                <Button size="sm" onClick={handleDailyCheckin} disabled={checkinLoading || checkedInToday} className="bg-green-600 hover:bg-green-700 text-white">
                  {checkinLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 签到中...</> : (checkedInToday ? '今日已签到' : '每日签到')}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-white/60 rounded-lg">
                <p className="text-sm text-gray-500">积分</p>
                <p className="text-2xl font-semibold text-blue-600">{profile.points}</p>
              </div>
              <div className="p-3 bg-white/60 rounded-lg">
                <p className="text-sm text-gray-500">虚拟分</p>
                <p className="text-2xl font-semibold text-purple-600">{profile.virtual_currency}</p>
              </div>
            </div>

            <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center bg-white/60 p-3 rounded-lg">
                    <span className="text-gray-600 flex items-center"><Award className="w-4 h-4 mr-2 text-yellow-500" />邀请用户数</span>
                    <span className="font-medium text-gray-800">{profile.invited_users_count || 0} 人</span>
                </div>
                <div className="flex justify-between items-center bg-white/60 p-3 rounded-lg">
                    <span className="text-gray-600 flex items-center"><Users className="w-4 h-4 mr-2 text-green-500" />邀请总积分</span>
                    <span className="font-medium text-gray-800">{profile.invitation_points || 0}</span>
                </div>
                <div className="flex justify-between items-center bg-white/60 p-3 rounded-lg">
                    <span className="text-gray-600 flex items-center"><Gift className="w-4 h-4 mr-2 text-red-500" />免费发布次数</span>
                    <span className="font-medium text-gray-800">{profile.free_posts_count || 0} 次</span>
                </div>
                 {profile.role === 'admin' && (
                    <div className="flex justify-start items-center bg-green-100 p-3 rounded-lg">
                        <span className="text-green-800 flex items-center font-semibold"><ShieldCheck className="w-4 h-4 mr-2" />超级管理员</span>
                    </div>
                )}
                 {isTenantAdmin && (
                    <div className="flex justify-start items-center bg-indigo-100 p-3 rounded-lg">
                        <span className="text-indigo-800 flex items-center font-semibold"><UserCog className="w-4 h-4 mr-2" />分站管理员</span>
                    </div>
                )}
            </div>

            {isOwnProfile && (
              <div className="space-y-3">
                 <Button onClick={() => navigate('/profile/edit')} className="w-full" variant="outline">
                    <Edit className="w-4 h-4 mr-2" />编辑个人资料
                 </Button>
                <Button onClick={handleCopyInviteLink} className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white">
                  <Share2 className="w-4 h-4 mr-2" />复制邀请链接
                </Button>
                
                 <Button onClick={() => navigate('/points-center')} className="w-full" variant="outline">
                    <Coins className="w-4 h-4 mr-2" />积分中心
                 </Button>
                
                {showAdminButton && (
                  <Button onClick={() => navigate('/admin')} className="w-full bg-gradient-to-r from-red-500 to-orange-500 text-white">
                    <ShieldCheck className="w-4 h-4 mr-2" />进入超级后台
                  </Button>
                )}
                {showTenantAdminButton && (
                  <Button onClick={() => navigate('/tenant-admin')} className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                    <UserCog className="w-4 h-4 mr-2" />进入分站后台
                  </Button>
                )}

                 {!isTenantAdmin && !isSuperAdmin && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button className="w-full" variant="secondary">申请成为站长</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>申请成为分站站长</DialogTitle>
                        <DialogDescription>
                          提交申请，创建属于您自己的个性化站点。
                        </DialogDescription>
                      </DialogHeader>
                      <TenantRequestForm />
                    </DialogContent>
                  </Dialog>
                )}
                 <Button onClick={signOut} className="w-full" variant="destructive">
                  <LogOut className="w-4 h-4 mr-2" />登出
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {isOwnProfile && isTenantAdmin && managedTenantId && (
            <TenantInfo tenantId={managedTenantId} />
        )}

        <UserPostHistory userId={targetUserId} />

      </motion.div>
    </>
  );
};

export default Profile;