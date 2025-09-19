import React, { useRef, useCallback, Fragment } from 'react';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThumbsUp, MessageCircle, Star, Bell, CheckCheck, Info, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInView } from 'react-intersection-observer';

const NOTIFICATIONS_PER_PAGE = 20;

const NotificationIcon = ({ type }) => {
  switch (type) {
    case 'like':
      return <div className="bg-red-100 rounded-full p-2"><ThumbsUp className="w-5 h-5 text-red-500" /></div>;
    case 'comment':
      return <div className="bg-blue-100 rounded-full p-2"><MessageCircle className="w-5 h-5 text-blue-500" /></div>;
    case 'system':
      return <div className="bg-purple-100 rounded-full p-2"><Info className="w-5 h-5 text-purple-500" /></div>;
    case 'shop_redemption_update':
      return <div className="bg-emerald-100 rounded-full p-2"><Info className="w-5 h-5 text-emerald-600" /></div>;
    default:
      return <div className="bg-yellow-100 rounded-full p-2"><Star className="w-5 h-5 text-yellow-500" /></div>;
  }
};

const NotificationSkeleton = () => (
  <div className="flex items-center space-x-4 p-4">
    <Skeleton className="h-10 w-10 rounded-full" />
    <div className="space-y-2 flex-grow">
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-1/4" />
    </div>
  </div>
);

async function bffFetch(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

const fetchNotifications = async ({ pageParam = 0, token }) => {
  const data = await bffFetch(`/api/notifications?page=${pageParam}&size=${NOTIFICATIONS_PER_PAGE}`, { token });
  return { data: data?.data || [], nextPage: data?.nextPage };
};

const Notifications = () => {
  const { user, siteSettings, session } = useAuth();
  const token = session?.access_token || null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { ref, inView } = useInView();

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ['notifications', user?.id],
    queryFn: ({ pageParam }) => fetchNotifications({ pageParam, token }),
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!user && !!token,
  });

  React.useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!user || !token) return;
      await bffFetch('/api/notifications/mark-read-all', { token, method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount', user?.id] });
      toast({ title: '所有通知已标记为已读' });
    },
    onError: (error) => {
      toast({ title: '无法标记为已读', description: error.message, variant: 'destructive' });
    },
  });

  const markOneAsReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      if (!token) return;
      await bffFetch(`/api/notifications/${notificationId}/mark-read`, { token, method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotificationsCount', user?.id] });
    },
  });

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      markOneAsReadMutation.mutate(notification.id);
    }

    if (notification.type !== 'system' && notification.related_post_id) {
      navigate(`/social#post-${notification.related_post_id}`);
    }
  };

  const safeText = (v) => {
    if (v == null) return '';
    if (typeof v === 'string') {
      const s = v.trim();
      if (s === '[object Object]' || s === 'object Object' || s === 'Object object') return '';
      return s;
    }
    try { return JSON.stringify(v); } catch { return String(v); }
  };

  const getNotificationText = (notification) => {
    const c = notification?.content || {};
    const message = safeText(c?.message) || safeText(c?.title);
    switch (notification?.type) {
      case 'like':
        return `${c?.liker_username || '有人'} 点赞了你的帖子。`;
      case 'comment':
        return `${c?.commenter_username || '有人'} 评论了: "${String(c?.comment_content || '').substring(0, 50)}..."`;
      case 'system':
        return message || '系统通知';
      case 'shop_redemption_update': {
        const base = message || `兑换状态更新${c?.product_name ? `：「${c.product_name}」` : ''}${c?.status_zh ? `（${c.status_zh}）` : ''}`;
        const notes = safeText(c?.notes);
        return notes ? `${base}（备注：${notes}）` : base;
      }
      default:
        return message || '你有一条新通知。';
    }
  };

  const allNotifications = data?.pages.flatMap(page => page.data) ?? [];

  return (
    <>
      <Helmet>
        <title>{String('通知中心 - ' + (siteSettings?.site_name ?? '大海团队'))}</title>
        <meta name="description" content="查看您的所有通知" />
      </Helmet>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-6 h-6 text-gray-700" />
              <CardTitle>通知中心</CardTitle>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending || !allNotifications.some(n => !n.is_read)}
            >
              {markAllAsReadMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-2" />}
              全部已读
            </Button>
          </CardHeader>
          <CardContent>
            {status === 'pending' ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <NotificationSkeleton key={i} />)}
              </div>
            ) : status === 'error' ? (
              <div className="text-center py-12 text-red-500">
                <p>加载通知失败: {error.message}</p>
              </div>
            ) : allNotifications.length > 0 ? (
              <div className="space-y-2">
                {data.pages.map((page, i) => (
                  <Fragment key={i}>
                    {page.data.map((notification) => (
                      <div
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`flex items-center space-x-4 p-3 rounded-lg cursor-pointer transition-colors ${
                          notification.is_read ? 'bg-white' : 'bg-blue-50 hover:bg-blue-100'
                        }`}
                      >
                        <NotificationIcon type={notification.type} />
                        <div className="flex-grow">
                          <p className="text-sm text-gray-800">
                            {getNotificationText(notification)}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: zhCN })}
                          </p>
                        </div>
                        {!notification.is_read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" aria-label="Unread"></div>
                        )}
                      </div>
                    ))}
                  </Fragment>
                ))}
                <div ref={ref} className="flex justify-center items-center p-4">
                  {isFetchingNextPage ? (
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  ) : hasNextPage ? (
                    <Button variant="outline" onClick={() => fetchNextPage()}>加载更多</Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">没有更多通知了</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Bell className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold">没有新通知</h3>
                <p>当有新动态时，我们会在这里通知你。</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Notifications;