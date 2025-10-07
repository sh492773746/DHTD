import React from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Gamepad2, Settings } from 'lucide-react';
import InteractiveCarousel from '@/components/InteractiveCarousel';
import AnnouncementBar from '@/components/AnnouncementBar';
import { Skeleton } from '@/components/ui/skeleton';
import GameCard from '@/components/GameCard';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePageContent } from '@/hooks/usePageContent';

const FeatureCarousel = ({ cards }) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const featureCardIcons = {
    'MessageSquare': MessageSquare,
    'Gamepad2': Gamepad2,
    'Settings': Settings,
    ...LucideIcons
  };

  const isExternal = (path) => /^https?:\/\//i.test(String(path || ''));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((card, index) => {
        const IconComponent = featureCardIcons[card.icon] || LucideIcons.AppWindow;
        return (
          <motion.div
            key={index}
            whileHover={{ scale: 1.03, y: -3 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="cursor-pointer"
          >
            <Button
              variant="secondary"
              className={cn("h-20 w-full rounded-xl shadow-lg border border-border hover:bg-secondary/80")}
              onClick={() => {
                if (!card.path) { toast({ title: "🚧 该功能正在开发中", description: "敬请期待更多精彩！" }); return; }
                if (isExternal(card.path)) { window.open(card.path, '_blank', 'noopener,noreferrer'); return; }
                navigate(card.path);
              }}
            >
              <div className="flex items-center h-full w-full">
                <motion.div
                  whileHover={{ rotate: [0, 10, -10, 0], transition: { duration: 0.5, repeat: Infinity } }}
                >
                  <IconComponent className="h-10 w-10 text-foreground" />
                </motion.div>
                <div className="ml-4 text-left">
                    <h3 className="text-md font-bold text-foreground">{card.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
                </div>
              </div>
            </Button>
          </motion.div>
        );
      })}
    </div>
  );
};


const Dashboard = () => {
  const navigate = useNavigate();
  const { user, siteSettings, isInitialized } = useAuth();
  
  const { data: carouselData, isLoading: isCarouselLoading } = usePageContent('home', 'carousel');
  const { data: announcements, isLoading: isAnnouncementsLoading } = usePageContent('home', 'announcements');
  const { data: featureCards, isLoading: isFeaturesLoading } = usePageContent('home', 'feature_cards');
  const { data: hotGames, isLoading: isHotGamesLoading } = usePageContent('home', 'hot_games');

  const isLoading = isCarouselLoading || isAnnouncementsLoading || isFeaturesLoading || isHotGamesLoading;
  
  const renderSkeleton = (type) => {
    if (type === 'carousel') {
      return <Skeleton className="w-full h-48 md:h-64 rounded-xl mb-6 bg-secondary" />;
    }
    if (type === 'announcement') {
      return <Skeleton className="w-full h-10 rounded-lg mb-6 bg-secondary" />;
    }
    if (type === 'feature_cards') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-20 rounded-xl bg-secondary" />
          ))}
        </div>
      );
    }
    if (type === 'hot_games') {
      return (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
             <Skeleton key={i} className="w-full aspect-square rounded-lg bg-secondary" />
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <>
      <Helmet>
        <title>{String(siteSettings?.site_name ?? '大海团队官网')} - 首页</title>
        <meta name="description" content={`欢迎来到${siteSettings?.site_name || '大海团队官网'}的首页，体验精彩内容。`} />
      </Helmet>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          {isLoading ? renderSkeleton('carousel') : carouselData.length > 0 && (
            <InteractiveCarousel />
          )}

          {isLoading ? renderSkeleton('announcement') : announcements.length > 0 && (
            <AnnouncementBar announcements={announcements} />
          )}
          
          {isLoading ? renderSkeleton('hot_games') : hotGames.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold mb-4 text-center text-foreground">热门推荐</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-4">
                {hotGames.map((game, index) => (
                  <GameCard 
                    key={game.id || index} 
                    game={game} 
                    priority={index < 6}
                  />
                ))}
              </div>
            </section>
          )}

          {isLoading ? renderSkeleton('feature_cards') : featureCards.length > 0 && (
            <section>
              <h2 className="text-2xl font-bold mb-4 text-center text-foreground">精选功能</h2>
              <FeatureCarousel cards={featureCards} />
            </section>
          )}
          

          {!isLoading && (carouselData.length === 0 && announcements.length === 0 && featureCards.length === 0 && hotGames.length === 0) && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <div className="text-6xl mb-4">🚧</div>
              <h3 className="text-2xl font-semibold text-foreground mb-2">内容建设中...</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                首页内容正在准备中，敬请期待！
              </p>
              {user && (
                <div className="mt-6 flex justify-center space-x-4">
                  <Button onClick={() => navigate('/social')} variant="outline">
                    <MessageSquare className="mr-2 h-4 w-4" /> 去朋友圈看看
                  </Button>
                  <Button onClick={() => navigate('/games')}>
                    <Gamepad2 className="mr-2 h-4 w-4" /> 探索游戏中心
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>
    </>
  );
};

export default Dashboard;