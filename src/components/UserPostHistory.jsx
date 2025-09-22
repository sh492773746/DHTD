import React from 'react';
import { useQuery } from '@tanstack/react-query';
import WeChatPostCard from '@/components/WeChatPostCard';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const mapPost = (p) => ({
  id: p.id,
  content: p.content,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
  is_ad: p.isAd,
  is_pinned: p.isPinned,
  status: p.status,
  rejection_reason: p.rejectionReason,
  image_urls: Array.isArray(p.images) ? p.images : (() => { try { return JSON.parse(p.images || '[]'); } catch { return []; } })(),
  edit_count: p.editCount,
  tenant_id: p.tenantId,
  author: p.author,
  comments_count: p.commentsCount || 0,
  likes_count: p.likesCount || 0,
  likes: [],
  comments: [],
});

const fetchUserPosts = async (userId, isAd) => {
  if (!userId) return [];
  const url = `/api/shared/posts?authorId=${encodeURIComponent(userId)}&page=0&size=50`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load user posts');
  const data = await res.json();
  return (data || []).map(mapPost).filter(p => !!p);
};

const PostSkeleton = () => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-100 mb-4 p-4 md:p-6">
    <div className="flex items-start space-x-3 mb-4">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  </div>
);

const UserPostHistory = ({ userId }) => {
  const [tab, setTab] = React.useState('social');
  const isAd = tab === 'ads';
  const { siteSettings } = useAuth();

  const { data: posts, isLoading, isError, error } = useQuery({
    queryKey: ['userPosts', userId, tab],
    queryFn: () => fetchUserPosts(userId, isAd),
    enabled: !!userId,
  });

  return (
    <div className="mt-6">
      <div className="sticky top-16 bg-background/80 backdrop-blur-sm z-10 p-2 rounded-b-lg">
        <div className="flex bg-muted p-1 rounded-full">
          <button onClick={() => setTab('social')} className={`w-full py-2 rounded-full transition-colors text-sm font-semibold ${tab === 'social' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>朋友圈</button>
          <button onClick={() => setTab('ads')} className={`w-full py-2 rounded-full transition-colors text-sm font-semibold ${tab === 'ads' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>白菜区</button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-4 mt-4">
          <PostSkeleton />
          <PostSkeleton />
        </div>
      )}

      {isError && (
        <div className="text-center py-12 text-red-500 mt-4">
          <p>加载动态失败: {error.message}</p>
        </div>
      )}

      {!isLoading && !isError && (!posts || posts.length === 0) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-12 bg-gray-50 rounded-lg mt-4"
        >
          <div className="text-5xl mb-4">🤷‍♂️</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-1">{tab === 'social' ? '朋友圈空空如也' : '白菜区暂无内容'}</h3>
          <p className="text-sm text-gray-500">该用户还没有发布过任何{tab === 'social' ? '朋友圈内容' : '白菜内容'}。</p>
        </motion.div>
      )}

      {!isLoading && !isError && posts && posts.length > 0 && (
        <div className="space-y-4 mt-4">
          {posts.map(post => (
            <WeChatPostCard key={post.id} post={post} onPostUpdated={() => {}} onDeletePost={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
};

export default UserPostHistory;