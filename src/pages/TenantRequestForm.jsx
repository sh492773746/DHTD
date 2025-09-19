import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Globe, MessageSquare, Send, Loader2, CheckCircle, XCircle, Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

async function bffJson(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

const TenantRequestForm = ({ onSuccess, isAdminCreation = false }) => {
  const { user, session } = useAuth();
  const token = session?.access_token || null;
  const { toast } = useToast();
  const [desiredDomain, setDesiredDomain] = useState('');
  const [contactWangWang, setContactWangWang] = useState('');
  const [loading, setLoading] = useState(false);
  const [isCheckingDomain, setIsCheckingDomain] = useState(false);
  const [domainAvailability, setDomainAvailability] = useState(null);
  const [targetUserId, setTargetUserId] = useState('');
  const [searchUid, setSearchUid] = useState('');
  const [searchedUser, setSearchedUser] = useState(null);

  const debouncedDomain = useDebounce(desiredDomain, 500);

  const checkDomainAvailability = useCallback(async () => {
    if (!debouncedDomain) {
      setDomainAvailability(null);
      return;
    }
    setIsCheckingDomain(true);
    setDomainAvailability(null);
    try {
      const data = await bffJson(`/api/admin/tenant-requests/check-domain?domain=${encodeURIComponent(debouncedDomain)}`, { token });
      if (data?.available) {
        setDomainAvailability('available');
      } else {
        setDomainAvailability('unavailable');
      }
    } catch (error) {
      setDomainAvailability('error');
      toast({
        variant: 'destructive',
        title: '域名检查失败',
        description: error.message || '无法连接到服务，请稍后重试。',
      });
    } finally {
      setIsCheckingDomain(false);
    }
  }, [debouncedDomain, toast, token]);

  useEffect(() => {
    if (debouncedDomain) {
      checkDomainAvailability();
    }
  }, [debouncedDomain, checkDomainAvailability]);
  

  const handleSearchUser = async () => {
      if (!searchUid) return;

      const uidRegex = /^[0-9]+$/;
      if (!uidRegex.test(searchUid)) {
        toast({ title: '输入错误', description: '用户 UID 必须为纯数字。', variant: 'destructive'});
        return;
      }

      setLoading(true);
      try {
        const list = await bffJson('/api/admin/users', { token });
        const found = (list || []).find(u => String(u.uid) === String(searchUid));
        if (!found) {
          toast({ title: '用户未找到', description: `未找到 UID 为 ${searchUid} 的用户`, variant: 'destructive'});
          setSearchedUser(null);
        } else {
          setSearchedUser(found);
          setTargetUserId(found.id);
        }
      } catch (e) {
        toast({ title: '用户未找到', description: `未找到 UID 为 ${searchUid} 的用户`, variant: 'destructive'});
        setSearchedUser(null);
      }
      setLoading(false);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!desiredDomain.trim() || !contactWangWang.trim() || (isAdminCreation && !targetUserId)) {
      toast({ variant: 'destructive', title: '错误', description: '请填写所有必填项。' });
      return;
    }
    if (domainAvailability !== 'available') {
      toast({ variant: 'destructive', title: '域名不可用', description: '请确保域名可用。' });
      return;
    }
    setLoading(true);

    const userIdToSubmit = isAdminCreation ? targetUserId : user.id;

    try {
      await bffJson('/api/admin/tenant-requests', { token, method: 'POST', body: { targetUserId: userIdToSubmit, desiredDomain, contactWangWang } });
    } catch (error) {
      setLoading(false);
      toast({ variant: 'destructive', title: '提交申请失败', description: error.message });
      return;
    }

    setLoading(false);

    toast({ title: '申请已提交', description: '分站申请已成功提交，请等待管理员审核。' });
    setDesiredDomain('');
    setContactWangWang('');
    setSearchUid('');
    setSearchedUser(null);
    setDomainAvailability(null);
    if (onSuccess) onSuccess();
  };

  const renderDomainStatus = () => {
    if (isCheckingDomain) return <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />;
    if (domainAvailability === 'available') return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (domainAvailability === 'unavailable' || domainAvailability === 'error') return <XCircle className="h-4 w-4 text-red-500" />;
    return null;
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 py-4">
      {isAdminCreation && (
          <div className="space-y-2">
              <Label htmlFor="searchUid">用户 UID</Label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <Input id="searchUid" value={searchUid} onChange={(e) => setSearchUid(e.target.value)} placeholder="输入用户UID搜索" className="flex-grow"/>
                  <Button type="button" variant="outline" onClick={handleSearchUser} disabled={loading || !searchUid} className="w-full sm:w-auto">
                    <Search className="mr-2 h-4 w-4" /> 搜索
                  </Button>
              </div>
              {searchedUser && (
                  <div className="text-sm text-green-600 p-2 border border-green-200 rounded-md bg-green-50 mt-2">
                      已找到用户: {searchedUser.username} (UID: {searchedUser.uid})
                  </div>
              )}
          </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="desiredDomain">期望的域名</Label>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="desiredDomain"
            placeholder="例如：myapp.com"
            value={desiredDomain}
            onChange={(e) => { setDesiredDomain(e.target.value); setDomainAvailability(null); }}
            required
            className="pl-10 pr-8"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{renderDomainStatus()}</div>
        </div>
        {domainAvailability === 'available' && <p className="text-sm text-green-600">恭喜！该域名可用。</p>}
        {domainAvailability === 'unavailable' && <p className="text-sm text-red-600">抱歉，该域名已被占用。</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactWangWang">旺旺号</Label>
         <div className="relative">
          <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="contactWangWang"
            type="text"
            placeholder="用于接收审核结果和重要通知"
            value={contactWangWang}
            onChange={(e) => setContactWangWang(e.target.value)}
            required
            className="pl-10"
          />
        </div>
      </div>
      <Button type="submit" disabled={loading || domainAvailability !== 'available'} className="w-full mt-4">
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在提交...</> : <><Send className="mr-2 h-4 w-4" /> 提交申请</>}
      </Button>
    </form>
  );
};

export default TenantRequestForm;