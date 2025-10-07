import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageContent } from '@/hooks/usePageContent';

const variants = {
  enter: (direction) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    x: direction < 0 ? '100%' : '-100%',
    opacity: 0,
  }),
};

const InteractiveCarousel = ({ tenantId }) => {
  const { data: slides, isLoading } = usePageContent('home', 'carousel', tenantId);
  const [[page, direction], setPage] = useState([0, 0]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Reset carousel to first slide if slides data changes
    setPage([0, 0]);
  }, [slides]);

  if (isLoading) {
    return <Skeleton className="w-full h-[200px] rounded-xl bg-secondary" />;
  }

  if (!slides || slides.length === 0) {
    return null;
  }

  const imageIndex = Math.abs(page % slides.length);

  const paginate = (newDirection) => {
    if (isExpanded) return;
    setPage([page + newDirection, newDirection]);
  };
  
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  }

  const currentSlide = slides[imageIndex];
  const overlayOpacity = currentSlide?.overlay_opacity !== undefined && currentSlide?.overlay_opacity !== '' 
    ? parseFloat(currentSlide.overlay_opacity) 
    : 20;

  const overlayBgColor = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, overlayOpacity / 100))})`;

  // 性能优化：首屏图片优先加载
  const isFirstSlide = imageIndex === 0;

  return (
    <motion.div
      layout
      className="relative w-full rounded-xl overflow-hidden shadow-md bg-black flex items-center justify-center"
      animate={{ height: isExpanded ? '380px' : '200px' }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="absolute inset-0 w-full h-full">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={page}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="absolute w-full h-full"
            style={{ willChange: 'transform, opacity' }}
          >
            <img 
              alt={currentSlide?.title || '轮播图'}
              className="w-full h-full object-cover"
              src={currentSlide?.image_url}
              loading={isFirstSlide ? 'eager' : 'lazy'}
              decoding={isFirstSlide ? 'sync' : 'async'}
              fetchpriority={isFirstSlide ? 'high' : 'auto'}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="absolute inset-0" style={{ backgroundColor: overlayBgColor }} />
      
      <motion.button
        layout="position"
        className="absolute top-1/2 left-2 transform -translate-y-1/2 z-20 bg-black/30 text-white rounded-full p-1 hover:bg-black/50 transition-colors"
        onClick={() => paginate(-1)}
      >
        <ChevronLeft className="w-5 h-5" />
      </motion.button>
      <motion.button
        layout="position"
        className="absolute top-1/2 right-2 transform -translate-y-1/2 z-20 bg-black/30 text-white rounded-full p-1 hover:bg-black/50 transition-colors"
        onClick={() => paginate(1)}
      >
        <ChevronRight className="w-5 h-5" />
      </motion.button>

      <div className="relative z-10 text-center text-white p-2 flex flex-col items-center">
        <motion.div layout="position" className="flex flex-col items-center">
          <motion.h1
            key={`title-${imageIndex}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="text-2xl md:text-3xl font-bold mb-1 shadow-text"
          >
            {currentSlide?.title}
          </motion.h1>
          <motion.p
            key={`desc-${imageIndex}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="text-sm md:text-base mb-3 shadow-text max-w-md"
          >
            {currentSlide?.description}
          </motion.p>
        </motion.div>
        
        <motion.button 
          layout
          onClick={toggleExpand}
          className="bg-black/50 rounded-full flex items-center justify-center space-x-1.5 text-white transition-all duration-300 border border-white/20"
          animate={{ 
            width: isExpanded ? 140 : 100,
            height: isExpanded ? 40 : 50,
            borderRadius: isExpanded ? '20px' : '50%'
          }}
          whileHover={{ scale: 1.05, backgroundColor: 'rgba(0,0,0,0.7)' }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div layout="position">
            <Eye className="w-4 h-4"/>
          </motion.div>
          <AnimatePresence>
            {!isExpanded && (
              <motion.span
                layout="position"
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -5 }}
                className="text-xs font-semibold"
              >
                了解更多
              </motion.span>
            )}
          </AnimatePresence>
           <AnimatePresence>
            {isExpanded && (
               <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs font-semibold"
              >
                收起
              </motion.span>
            )}
           </AnimatePresence>
        </motion.button>
        
        <motion.div 
            layout="position"
            className="flex space-x-2 mt-auto"
        >
        {isExpanded && (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="mt-4 text-center"
            >
                <h3 className="font-bold text-base mb-1">{currentSlide?.details_title || '更多详情'}</h3>
                <p className="text-xs max-w-xs text-white/80">{currentSlide?.details_content || '这里是展开后显示的详细信息。'}</p>
            </motion.div>
        )}
        </motion.div>
      </div>

       <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex space-x-1.5">
            {slides.map((_, i) => (
              <motion.div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === imageIndex ? 'bg-white w-4' : 'bg-white/50 w-1.5'}`}
              />
            ))}
        </div>
    </motion.div>
  );
};

export default InteractiveCarousel;