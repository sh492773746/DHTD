import React, { useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Bell, Send, User, Users, Search, XCircle, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const AdminNotifications = () => {
  const [target, setTarget] = useState('all');
  const [uid, setUid] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchedUser, setSearchedUser] = useState(null);
  const { toast } = useToast();
  const { session } = useAuth();
  
  const debouncedSearchTerm = useDebounce(uid, 500);

  const searchUserByUid = useCallback(async (searchUid) => {
    if (!searchUid || searchUid.length < 6) {
      setSearchedUser(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/users`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } });
      const list = await res.json();
      const found = Array.isArray(list) ? list.find(u => String(u.uid || '').includes(searchUid)) : null;
      setSearchedUser(found || null);
    } catch (e) {
      toast({ variant: 'destructive', title: '搜索用户失败', description: e.message || '网络错误' });
    } finally {
    setSearching(false);
    }
  }, [toast, session?.access_token]);

  React.useEffect(() => {
    if (debouncedSearchTerm) {
      searchUserByUid(debouncedSearchTerm);
    } else {
      setSearchedUser(null);
    }
  }, [debouncedSearchTerm, searchUserByUid]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) {
      toast({ variant: 'destructive', title: '错误', description: '通知内容不能为空。' });
      return;
    }

    if (target === 'specific' && !searchedUser) {
      toast({ variant: 'destructive', title: '错误', description: '请先搜索并确认一个有效的用户UID。' });
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({
          content: { message: content, type: 'system' },
          target: target === 'all' ? 'all' : 'user',
          uid: target === 'all' ? undefined : searchedUser?.uid,
        })
      });
      if (!res.ok) throw new Error(`发送失败(${res.status})`);
      toast({ title: '发送成功', description: `通知已发送给 ${target === 'all' ? '所有用户' : `用户 ${searchedUser.username}`}` });
      setContent('');
      setUid('');
      setSearchedUser(null);
    } catch (e) {
      toast({ variant: 'destructive', title: '发送失败', description: e.message || '网络错误' });
    } finally {
      setLoading(false);
    }
  };
  
  const handleClear = () => {
    setUid('');
    setSearchedUser(null);
  };


  return (
    <>
      <Helmet>
        <title>{String('通知管理 - 管理后台')}</title>
        <meta name="description" content="向用户发送系统通知" />
      </Helmet>
      <div className="max-w-2xl mx-auto overflow-x-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Bell className="w-6 h-6" />
              发送系统通知
            </CardTitle>
            <CardDescription>
              创建并向您的用户发送系统级通知。
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="target">发送目标</Label>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger id="target">
                    <SelectValue placeholder="选择发送目标" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span>全部用户</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="specific">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>特定用户</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {target === 'specific' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="uid">用户 UID</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="uid"
                        placeholder="输入用户的UID进行搜索..."
                        value={uid}
                        onChange={(e) => setUid(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                        className="pl-10"
                      />
                       {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
                    </div>
                  </div>

                  {searchedUser && (
                    <Card className="bg-gray-50 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Avatar>
                            <AvatarImage src={searchedUser.avatar_url} />
                            <AvatarFallback>{searchedUser.username?.[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold">{searchedUser.username}</p>
                            <p className="text-sm text-gray-500">UID: {searchedUser.uid}</p>
                            <p className="text-sm text-gray-500">积分: {searchedUser.points}</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleClear}>
                            <XCircle className="h-5 w-5 text-gray-500 hover:text-red-500" />
                        </Button>
                      </div>
                    </Card>
                  )}
                  {debouncedSearchTerm && !searching && !searchedUser && (
                     <p className="text-sm text-center text-red-500">未找到UID为 {debouncedSearchTerm} 的用户。</p>
                  )}

                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="content">通知内容</Label>
                <Textarea
                  id="content"
                  placeholder="输入通知内容..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={5}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={loading || (target === 'specific' && !searchedUser)} className="w-full">
                {loading ? '发送中...' : <><Send className="w-4 h-4 mr-2" /> 发送通知</>}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </>
  );
};

export default AdminNotifications;