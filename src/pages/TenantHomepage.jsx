import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePageContent } from '@/hooks/usePageContent';
import InteractiveCarousel from '@/components/InteractiveCarousel';
import AnnouncementBar from '@/components/AnnouncementBar';
import GameCard from '@/components/GameCard';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';

const FeatureCard = ({ title, description, path, icon, style }) => {
    const IconComponent = LucideIcons[icon];
    const isExternal = /^https?:\/\//i.test(String(path || ''));
    if (isExternal) {
        return (
            <a href={path} target="_blank" rel="noopener noreferrer" className={`block p-6 rounded-2xl bg-gradient-to-br ${style} text-white shadow-lg transform hover:-translate-y-1 transition-transform duration-300`}>
                <div className="flex items-center mb-2">
                    {IconComponent && <IconComponent className="w-6 h-6 mr-3" />}
                    <h3 className="font-bold text-lg">{title}</h3>
                </div>
                <p className="text-sm opacity-90">{description}</p>
            </a>
        );
    }
    return (
        <Link to={path} className={`block p-6 rounded-2xl bg-gradient-to-br ${style} text-white shadow-lg transform hover:-translate-y-1 transition-transform duration-300`}>
            <div className="flex items-center mb-2">
                {IconComponent && <IconComponent className="w-6 h-6 mr-3" />}
                <h3 className="font-bold text-lg">{title}</h3>
            </div>
            <p className="text-sm opacity-90">{description}</p>
        </Link>
    );
};

const SectionWrapper = ({ children, className }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={className}
    >
        {children}
    </motion.div>
);

const TenantHomepage = () => {
    const { siteSettings, tenantId, isInitialized } = useAuth();
    
    const { data: announcements, isLoading: isAnnouncementsLoading } = usePageContent('home', 'announcements', tenantId);
    const { data: featureCards, isLoading: isFeaturesLoading } = usePageContent('home', 'feature_cards', tenantId);
    const { data: hotGames, isLoading: isHotGamesLoading } = usePageContent('home', 'hot_games', tenantId);
    
    const isLoading = isAnnouncementsLoading || isFeaturesLoading || isHotGamesLoading;

    if (!isInitialized || isLoading) {
      return (
        <div className="flex justify-center items-center h-screen bg-background">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      );
    }
    
    return (
        <>
            <Helmet>
                <title>{siteSettings?.site_name || '分站首页'}</title>
                <meta name="description" content={siteSettings?.site_description || '欢迎来到我们的分站'} />
            </Helmet>

            <div className="space-y-8 md:space-y-12">
                <SectionWrapper>
                    <InteractiveCarousel tenantId={tenantId} />
                </SectionWrapper>
                
                <SectionWrapper>
                    <AnnouncementBar announcements={announcements} />
                </SectionWrapper>

                <SectionWrapper className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                    {featureCards.map((card) => (
                        <FeatureCard key={card.id} {...card} />
                    ))}
                </SectionWrapper>

                {hotGames.length > 0 && (
                  <SectionWrapper>
                      <h2 className="text-2xl font-bold mb-4 text-foreground">热门推荐</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {hotGames.map((game) => (
                              <GameCard key={game.id} game={game} />
                          ))}
                      </div>
                  </SectionWrapper>
                )}
            </div>
        </>
    );
};

export default TenantHomepage;