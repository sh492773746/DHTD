import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useInView } from 'react-intersection-observer';
import WeChatPostCard from '@/components/WeChatPostCard';
import PostSkeleton from '@/components/PostSkeleton';
import FloatingCreatePostButton from '@/components/FloatingCreatePostButton';
import { motion } from 'framer-motion';
import NeonAd from '@/components/NeonAd';
import { usePageContent } from '@/hooks/usePageContent';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

const POSTS_PER_PAGE = 20;

const NotLoggedInPrompt = () => {
    const navigate = useNavigate();
    return (
        <Card className="my-8 text-center bg-secondary/30 border-primary/20">
            <CardHeader>
                <CardTitle className="flex items-center justify-center gap-2">
                    <LogIn className="w-6 h-6 text-primary" />
                    解锁全部内容
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground mb-4">
                    登录后查看更多精彩内容，并与大家互动！
                </p>
                <Button onClick={() => navigate('/login')} className="bg-primary hover:bg-primary/90">
                    立即登录/注册
                </Button>
            </CardContent>
        </Card>
    );
};


const SocialFeed = () => {
    const { siteSettings, isInitialized, user, session } = useAuth();
    const { isLoading: isTenantLoading } = useTenant();
    const [activeTab, setActiveTab] = useState('social');
    const { ref, inView } = useInView({ threshold: 0.5 });
    
    const { data: pinnedAds, isLoading: isPinnedAdsLoading } = usePageContent('social', 'pinned_ads');
    
    const fetchPosts = async ({ pageParam = 0 }) => {
        const sharedMode = String(siteSettings?.social_forum_mode || '').toLowerCase() === 'shared';
        const base = sharedMode
          ? `/api/shared/posts?page=${pageParam}&size=${POSTS_PER_PAGE}`
          : `/api/posts?tab=${activeTab}&page=${pageParam}&size=${POSTS_PER_PAGE}`;
        // for independent mode, allow reading global main-site posts when on sub-sites
        const url = sharedMode ? base : `${base}&source=tenant`;
        const token = session?.access_token || null;
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error('Failed to load posts');
        const rows = await res.json();
        const normalized = (rows || []).map(r => {
          let image_urls = [];
          if (Array.isArray(r.images)) image_urls = r.images;
          else if (typeof r.images === 'string') { try { image_urls = JSON.parse(r.images || '[]'); } catch { image_urls = []; } }
          return { ...r, image_urls };
        });
        return {
            data: normalized,
            nextPage: normalized.length === POSTS_PER_PAGE ? pageParam + 1 : undefined,
        };
    };
    
    const {
        data,
        error,
        fetchNextPage,
        hasNextPage,
        isFetching,
        isFetchingNextPage,
        status,
        refetch
    } = useInfiniteQuery({
        queryKey: ['posts', activeTab, !!user, siteSettings?.social_forum_mode || ''],
        queryFn: fetchPosts,
        initialPageParam: 0,
        getNextPageParam: (lastPage) => lastPage.nextPage,
        enabled: isInitialized && !isTenantLoading,
    });

    React.useEffect(() => {
        if (inView && hasNextPage && !isFetching) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetching, fetchNextPage]);
    
    const handlePostUpdated = () => {
        refetch();
    };

    const handleDeletePost = () => {
        refetch();
    };
    
    const allPosts = useMemo(() => data?.pages.flatMap(page => page.data) ?? [], [data]);

    const rowVirtualizer = useWindowVirtualizer({
        count: allPosts.length,
        estimateSize: () => 360,
        overscan: 8,
    });
    const virtualItems = rowVirtualizer.getVirtualItems();

    const renderSkeletons = () => (
        Array.from({ length: 3 }).map((_, index) => <PostSkeleton key={index} />)
    );

    const renderFeedContent = () => {
        if (status === 'pending' || (isFetching && !isFetchingNextPage)) {
            return renderSkeletons();
        }
        if (status === 'error') {
            return (
                <div className="text-center py-10 text-red-500">
                    <p>加载失败: {error.message}</p>
                    <button onClick={() => refetch()} className="mt-2 px-4 py-2 bg-blue-500 text-white rounded">
                        重试
                    </button>
                </div>
            );
        }
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
            >
                {allPosts.length > 0 ? (
                    <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                        {virtualItems.map((v) => {
                            const post = allPosts[v.index];
                            if (!post) return null;
                            return (
                                <div
                                    key={post.id ?? v.key}
                                    ref={rowVirtualizer.measureElement}
                                    data-index={v.index}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        transform: `translateY(${v.start}px)`,
                                    }}
                                >
                                    <WeChatPostCard key={post.id} post={post} onPostUpdated={handlePostUpdated} onDeletePost={handleDeletePost} />
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-20">
                        <p className="text-muted-foreground">这里还没有内容，快来发布第一条吧！</p>
                    </div>
                )}
                 {!user && <NotLoggedInPrompt />}
                <div ref={ref} className="h-10">
                  {isFetchingNextPage && <PostSkeleton />}
                  {!hasNextPage && allPosts.length > 0 && <p className="text-center text-muted-foreground py-4">没有更多内容了</p>}
                </div>
            </motion.div>
        );
    };

    return (
        <>
            <Helmet>
                <title>{`${siteSettings?.site_name || '大海团队'} - ${activeTab === 'social' ? '朋友圈' : '白菜专区'}`}</title>
                <meta name="description" content={`看看大家在${siteSettings?.site_name || '大海团队'}的${activeTab === 'social' ? '朋友圈' : '白菜专区'}分享了什么新鲜事。`} />
            </Helmet>

            <div className="max-w-xl mx-auto pb-20">
                <div className="sticky top-16 bg-background/80 backdrop-blur-sm z-10 p-2 rounded-b-lg">
                    <div className="flex bg-muted p-1 rounded-full">
                        <button onClick={() => setActiveTab('social')} className={`w-full py-2 rounded-full transition-colors text-sm font-semibold ${activeTab === 'social' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                            朋友圈
                        </button>
                        <button onClick={() => setActiveTab('ads')} className={`w-full py-2 rounded-full transition-colors text-sm font-semibold ${activeTab === 'ads' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                            白菜专区
                        </button>
                    </div>
                </div>

                <div className="pt-4 space-y-4 px-2 md:px-0">
                   {isPinnedAdsLoading ? <Skeleton className="w-full h-[120px] rounded-lg" /> :
                     pinnedAds && pinnedAds.length > 0 && (
                        <div className="space-y-2 mb-4">
                            {pinnedAds.map((ad, index) => (
                                <NeonAd 
                                    key={index} 
                                    title={ad.title} 
                                    description={ad.description} 
                                    link={ad.link_url} 
                                    imageUrl={ad.background_image_url} 
                                />
                            ))}
                        </div>
                   )}
                   {renderFeedContent()}
                </div>
            </div>
            
            <FloatingCreatePostButton onPostCreated={refetch} />
        </>
    );
};

export default SocialFeed;