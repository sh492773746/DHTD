import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePageContent } from '@/hooks/usePageContent';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExternalLink, Sparkles, TrendingUp, Users, Zap } from 'lucide-react';

// 检测是否在微信/QQ内置浏览器中
const isWeChatOrQQ = () => {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('micromessenger') || ua.includes('qq/');
};

// 防红提示组件
const AntiBlockAlert = ({ onClose }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="max-w-md w-full bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl p-8 text-center shadow-2xl"
      >
        {/* 动画箭头 */}
        <motion.div
          animate={{ 
            y: [0, -10, 0],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ 
            duration: 1.5, 
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="mb-6"
        >
          <div className="inline-block bg-white/20 rounded-full p-4">
            <ExternalLink className="w-12 h-12 text-white" />
          </div>
        </motion.div>

        <h2 className="text-2xl font-bold text-white mb-4">
          请使用浏览器打开
        </h2>
        
        <div className="space-y-3 text-white/90 mb-6">
          <p className="flex items-center justify-center gap-2">
            <span className="text-3xl">👆</span>
            <span>点击右上角</span>
            <span className="font-bold text-white">···</span>
          </p>
          <p className="text-lg font-medium">
            选择 <span className="text-yellow-300 font-bold">「在浏览器打开」</span>
          </p>
        </div>

        {/* 动画指示器 */}
        <motion.div
          className="flex justify-center gap-2 mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-3 h-3 bg-white rounded-full"
              animate={{ 
                scale: [1, 1.5, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2
              }}
            />
          ))}
        </motion.div>

        <p className="text-sm text-white/70">
          为了获得最佳体验，请使用系统浏览器访问
        </p>
      </motion.div>
    </motion.div>
  );
};

// 粒子背景效果
const ParticleBackground = () => {
  const particles = Array.from({ length: 50 }, (_, i) => i);
  
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-primary/20 rounded-full"
          initial={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
          }}
          animate={{
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
          }}
          transition={{
            duration: Math.random() * 20 + 10,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
};

const LandingPage = () => {
  const navigate = useNavigate();
  const { siteSettings } = useAuth();
  const [showAlert, setShowAlert] = useState(false);

  // 获取 Landing 页面内容
  const { data: heroData } = usePageContent('landing', 'landing_hero');
  const { data: features } = usePageContent('landing', 'landing_features');
  const { data: ctaButtons } = usePageContent('landing', 'landing_cta');
  const { data: stats } = usePageContent('landing', 'landing_stats');

  // 从数据中提取内容，使用可选链和空值合并
  const hero = heroData && heroData.length > 0 ? heroData[0] : {};
  const primaryCTA = ctaButtons && ctaButtons.length > 0 ? ctaButtons[0] : {};

  // 调试日志（开发环境）
  if (import.meta.env.DEV) {
    console.log('Landing Page Data:', {
      heroData,
      hero,
      features,
      ctaButtons,
      stats
    });
  }

  // 检测微信/QQ浏览器
  useEffect(() => {
    if (isWeChatOrQQ()) {
      setShowAlert(true);
    }
  }, []);

  // 按钮样式
  const getButtonStyle = (style) => {
    const styles = {
      'primary': 'bg-primary hover:bg-primary/90 text-primary-foreground',
      'gradient-blue': 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white',
      'gradient-purple': 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white',
      'gradient-green': 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white',
      'neon': 'bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 hover:from-cyan-500 hover:via-blue-600 hover:to-purple-700 text-white shadow-lg shadow-blue-500/50',
    };
    return styles[style] || styles.primary;
  };

  const handleCTAClick = (link) => {
    if (!link) return;
    if (link.startsWith('http')) {
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      navigate(link);
    }
  };

  return (
    <>
      <Helmet>
        <title>{hero.title || siteSettings?.site_name || '欢迎'}</title>
        <meta name="description" content={hero.subtitle || '体验极致娱乐'} />
      </Helmet>

      {/* 防红提示 */}
      <AnimatePresence>
        {showAlert && <AntiBlockAlert onClose={() => setShowAlert(false)} />}
      </AnimatePresence>

      {/* 主内容 */}
      <div className="min-h-screen relative overflow-hidden bg-background">
        {/* 粒子背景 */}
        <ParticleBackground />

        {/* 背景图片 */}
        {hero.background_image && (
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-10"
            style={{ backgroundImage: `url(${hero.background_image})` }}
          />
        )}

        {/* 渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />

        {/* 内容容器 */}
        <div className="relative z-10 min-h-screen flex flex-col">
          {/* Hero Section */}
          <section className="flex-1 flex items-center justify-center px-4 py-16">
            <div className="max-w-4xl mx-auto text-center">
              {/* Logo 动画 */}
              {hero.logo_url && (
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ 
                    type: 'spring',
                    stiffness: 200,
                    damping: 20
                  }}
                  className="mb-8 inline-block"
                >
                  <div className="relative">
                    <motion.div
                      className="absolute inset-0 bg-primary/20 rounded-full blur-2xl"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.5, 0.8, 0.5],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                      }}
                    />
                    <img 
                      src={hero.logo_url} 
                      alt="Logo" 
                      className="w-24 h-24 md:w-32 md:h-32 rounded-full shadow-2xl relative z-10"
                    />
                  </div>
                </motion.div>
              )}

              {/* 主标题 */}
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6"
              >
                <motion.span
                  className="inline-block bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent"
                  animate={{
                    backgroundPosition: ['0%', '100%', '0%'],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                  }}
                >
                  {hero.title || '欢迎来到我们的平台'}
                </motion.span>
              </motion.h1>

              {/* 副标题 */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto"
              >
                {hero.subtitle || '体验极致娱乐，开启精彩旅程'}
              </motion.p>

              {/* CTA 按钮 */}
              {primaryCTA.text && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    size="lg"
                    className={cn(
                      "text-lg px-8 py-6 rounded-full shadow-2xl transform transition-all duration-300",
                      getButtonStyle(primaryCTA.style)
                    )}
                    onClick={() => handleCTAClick(primaryCTA.link)}
                  >
                    <Sparkles className="mr-2 h-5 w-5" />
                    {primaryCTA.text}
                  </Button>
                </motion.div>
              )}

              {/* 数据统计 */}
              {stats.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6"
                >
                  {stats.map((stat, index) => {
                    const IconComponent = LucideIcons[stat.icon] || Users;
                    return (
                      <motion.div
                        key={index}
                        whileHover={{ y: -5 }}
                        className="text-center"
                      >
                        <Card className="bg-card/50 backdrop-blur-sm border-border p-6">
                          <IconComponent className="w-8 h-8 mx-auto mb-2 text-primary" />
                          <div className="text-3xl font-bold text-foreground mb-1">
                            {stat.value}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {stat.label}
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </div>
          </section>

          {/* 特色功能 */}
          {features.length > 0 && (
            <section className="py-16 px-4">
              <div className="max-w-6xl mx-auto">
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="text-3xl md:text-4xl font-bold text-center text-foreground mb-12"
                >
                  平台特色
                </motion.h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {features.map((feature, index) => {
                    const IconComponent = LucideIcons[feature.icon] || Zap;
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ 
                          y: -10,
                          transition: { type: 'spring', stiffness: 300 }
                        }}
                      >
                        <Card className={cn(
                          "relative overflow-hidden p-6 h-full",
                          "bg-gradient-to-br",
                          feature.gradient || "from-blue-500/10 to-cyan-500/10",
                          "border-border hover:shadow-2xl transition-all duration-300"
                        )}>
                          {/* 背景装饰 */}
                          <motion.div
                            className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-primary/10"
                            animate={{
                              scale: [1, 1.2, 1],
                              rotate: [0, 90, 0],
                            }}
                            transition={{
                              duration: 4,
                              repeat: Infinity,
                            }}
                          />

                          <div className="relative z-10">
                            <div className="mb-4 inline-block p-3 bg-background/50 rounded-xl">
                              <IconComponent className="w-8 h-8 text-primary" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2">
                              {feature.title}
                            </h3>
                            <p className="text-muted-foreground">
                              {feature.description}
                            </p>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Footer */}
          <motion.footer
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="py-8 text-center text-muted-foreground"
          >
            <p>© 2025 {siteSettings?.site_name || '大海团队'}. All rights reserved.</p>
          </motion.footer>
        </div>
      </div>
    </>
  );
};

export default LandingPage;

