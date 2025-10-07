import React, { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import GameCard from '@/components/GameCard';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageContent } from '@/hooks/usePageContent';
import { Search, X } from 'lucide-react';

const IconRenderer = ({ iconName }) => {
    const IconComponent = LucideIcons[iconName] || LucideIcons.Gamepad2;
    return <IconComponent className="mr-2 h-5 w-5" />;
};

const GameCenter = () => {
    const { siteSettings, isInitialized } = useAuth();
    const [activeCategory, setActiveCategory] = useState(null);
    const [searchKeyword, setSearchKeyword] = useState('');

    const { data: categories, isLoading: categoriesLoading } = usePageContent('games', 'game_categories');
    const { data: games, isLoading: gamesLoading } = usePageContent('games', 'game_cards');
    
    const isLoading = categoriesLoading || gamesLoading;

    useMemo(() => {
        if (!isLoading && categories.length > 0 && !activeCategory) {
            setActiveCategory(categories[0].slug);
        } else if (!isLoading && categories.length === 0 && !activeCategory) {
            setActiveCategory('all');
        }
    }, [categories, isLoading, activeCategory]);

    const gamesByCat = useMemo(() => games.reduce((acc, game) => {
        const cat = game.category_slug || 'all';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(game);
        return acc;
    }, {}), [games]);

    const renderSkeleton = () => (
        <>
            <div className="flex space-x-2 p-1 overflow-x-auto mb-6">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-24 rounded-full" />
                ))}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 md:gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                     <Skeleton key={i} className="w-full aspect-square rounded-lg" />
                ))}
            </div>
        </>
    );

    const activeGames = useMemo(() => {
        if (!activeCategory) return [];
        
        // 获取当前分类的游戏
        let filteredGames = [];
        if (activeCategory === 'all') {
            filteredGames = Object.values(gamesByCat).flat();
        } else {
            filteredGames = gamesByCat[activeCategory] || [];
        }
        
        // 如果有搜索关键词，进一步过滤
        if (searchKeyword.trim()) {
            const keyword = searchKeyword.toLowerCase().trim();
            filteredGames = filteredGames.filter(game => {
                const title = (game.title || '').toLowerCase();
                const description = (game.description || '').toLowerCase();
                const info = (game.info || '').toLowerCase();
                return title.includes(keyword) || description.includes(keyword) || info.includes(keyword);
            });
        }
        
        return filteredGames;
    }, [activeCategory, gamesByCat, searchKeyword]);
    
    // 清除搜索
    const handleClearSearch = () => {
        setSearchKeyword('');
    };

    return (
        <>
            <Helmet>
                <title>{String('游戏中心 - ' + (siteSettings?.site_name ?? '大海团队官网'))}</title>
                <meta name="description" content={`探索${siteSettings?.site_name || '大海团队官网'}的游戏中心，发现各种精彩游戏。`} />
            </Helmet>
            <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6 sm:py-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h1 className="text-3xl font-bold text-center mb-8 hollow-text">游戏中心</h1>

                    {isLoading || !isInitialized ? renderSkeleton() : (
                        categories.length > 0 ? (
                            <>
                                {/* 分类按钮 */}
                                <div className="flex space-x-2 p-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-x-auto mb-4 sticky top-14 sm:top-16 z-10 backdrop-blur-sm">
                                    {categories.map(category => (
                                        <Button
                                            key={category.slug}
                                            onClick={() => setActiveCategory(category.slug)}
                                            variant="ghost"
                                            className={cn(
                                                "rounded-full flex-shrink-0",
                                                activeCategory === category.slug && 'bg-primary text-primary-foreground hover:bg-primary/90'
                                            )}
                                        >
                                            <IconRenderer iconName={category.icon} />
                                            {category.name}
                                        </Button>
                                    ))}
                                </div>

                                {/* 搜索框 */}
                                <div className="mb-4 sm:mb-6">
                                    <div className="relative max-w-md mx-auto">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            type="text"
                                            placeholder="搜索游戏名称、关键词..."
                                            value={searchKeyword}
                                            onChange={(e) => setSearchKeyword(e.target.value)}
                                            className="pl-10 pr-10 bg-background border-border"
                                        />
                                        {searchKeyword && (
                                            <button
                                                onClick={handleClearSearch}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                                aria-label="清除搜索"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    {searchKeyword && (
                                        <p className="text-center text-sm text-muted-foreground mt-2">
                                            找到 <span className="font-semibold text-foreground">{activeGames.length}</span> 个游戏
                                        </p>
                                    )}
                                </div>

                                {/* 游戏列表 */}
                                <motion.div
                                    key={activeCategory + searchKeyword}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3 md:gap-4"
                                >
                                    {activeGames.map((game, index) => (
                                        <GameCard key={game.id || index} game={game} />
                                    ))}
                                </motion.div>
                                {activeGames.length === 0 && (
                                     <div className="text-center py-16">
                                        <div className="text-5xl mb-4">
                                            {searchKeyword ? '🔍' : '🎮'}
                                        </div>
                                        <p className="text-muted-foreground">
                                            {searchKeyword ? `没有找到与 "${searchKeyword}" 相关的游戏` : '此分类下暂无游戏'}
                                        </p>
                                        {searchKeyword && (
                                            <Button 
                                                onClick={handleClearSearch}
                                                variant="outline"
                                                className="mt-4"
                                            >
                                                清除搜索
                                            </Button>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-16">
                                <div className="text-6xl mb-4">🚧</div>
                                <h3 className="text-2xl font-semibold text-foreground mb-2">内容建设中...</h3>
                                <p className="text-muted-foreground">游戏中心正在火速搭建中，敬请期待！</p>
                            </div>
                        )
                    )}
                </motion.div>
            </div>
        </>
    );
};

export default GameCenter;