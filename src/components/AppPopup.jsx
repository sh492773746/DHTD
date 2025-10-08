import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useTheme } from '@/contexts/ThemeProvider';

const AppPopup = () => {
  const [popups, setPopups] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [copiedStates, setCopiedStates] = useState({});
  const { toast } = useToast();
  const { theme } = useTheme();

  useEffect(() => {
    fetchPopups();
  }, []);

  const fetchPopups = async () => {
    try {
      const res = await fetch('/api/popups');
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.length > 0) {
        setPopups(data);
        setIsOpen(true);
      }
    } catch (e) {
      console.error('Failed to fetch popups:', e);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleNext = () => {
    if (currentIndex < popups.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleButtonClick = async (popup) => {
    const url = popup.buttonUrl || '';
    const buttonText = popup.buttonText || '';
    
    // 复制按钮文字
    if (buttonText) {
      try {
        await navigator.clipboard.writeText(buttonText);
        setCopiedStates({ ...copiedStates, [popup.id]: true });
        toast({
          title: '已复制',
          description: `"${buttonText}" 已复制到剪贴板`,
          duration: 2000,
        });
        
        // 2秒后重置复制状态
        setTimeout(() => {
          setCopiedStates({ ...copiedStates, [popup.id]: false });
        }, 2000);
      } catch (e) {
        console.error('Copy failed:', e);
      }
    }
    
    // 跳转链接
    if (url) {
      // 检查是否是旺旺协议或其他特殊协议
      if (url.startsWith('wangwang://') || url.includes('://')) {
        window.location.href = url;
      } else {
        window.open(url, '_blank');
      }
    }
  };

  if (!isOpen || popups.length === 0) return null;

  const currentPopup = popups[currentIndex];
  
  // 主题颜色适配
  const isDark = theme === 'dark';
  const bgColor = isDark ? 'bg-gray-800' : 'bg-white';
  const textColor = isDark ? 'text-white' : 'text-gray-900';
  const mutedColor = isDark ? 'text-gray-300' : 'text-gray-600';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', duration: 0.5 }}
          className={`relative w-full max-w-lg rounded-2xl ${bgColor} shadow-2xl overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 背景图片（如果有） */}
          {currentPopup.backgroundImage && (
            <div 
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{ 
                backgroundImage: `url(${currentPopup.backgroundImage})`,
                opacity: 1 // 100% 透明度（完全显示）
              }}
            />
          )}

          {/* 内容区域 */}
          <div className={`relative z-10 p-6 ${currentPopup.backgroundImage ? 'backdrop-blur-sm bg-black/20' : ''}`}>
            {/* 关闭按钮 */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/30 backdrop-blur-sm transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* 标题 */}
            {currentPopup.title && (
              <h2 className={`text-2xl font-bold mb-4 pr-10 ${currentPopup.backgroundImage ? 'text-white drop-shadow-lg' : textColor}`}>
                {currentPopup.title}
              </h2>
            )}

            {/* 内容 */}
            {currentPopup.content && (
              <div className={`mb-6 whitespace-pre-wrap ${currentPopup.backgroundImage ? 'text-white drop-shadow' : mutedColor}`}>
                {currentPopup.content}
              </div>
            )}

            {/* 按钮 */}
            {currentPopup.buttonText && (
              <div className="flex justify-center mb-6">
                <Button
                  onClick={() => handleButtonClick(currentPopup)}
                  size="lg"
                  className="relative px-8 py-6 text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
                >
                  {copiedStates[currentPopup.id] ? (
                    <div className="flex items-center gap-2">
                      <Check className="w-5 h-5" />
                      <span>已复制</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Copy className="w-4 h-4" />
                      <span>{currentPopup.buttonText}</span>
                    </div>
                  )}
                </Button>
              </div>
            )}

            {/* 分页指示器 */}
            {popups.length > 1 && (
              <div className="flex items-center justify-between mt-6">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className={currentPopup.backgroundImage ? 'text-white hover:bg-white/20' : ''}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  上一页
                </Button>

                <div className={`flex items-center gap-2 ${currentPopup.backgroundImage ? 'text-white' : mutedColor}`}>
                  {popups.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentIndex(index)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentIndex 
                          ? 'w-6 bg-primary' 
                          : currentPopup.backgroundImage 
                            ? 'bg-white/50 hover:bg-white/70' 
                            : 'bg-gray-300 hover:bg-gray-400'
                      }`}
                    />
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNext}
                  disabled={currentIndex === popups.length - 1}
                  className={currentPopup.backgroundImage ? 'text-white hover:bg-white/20' : ''}
                >
                  下一页
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}

            {/* 页码提示 */}
            {popups.length > 1 && (
              <div className={`text-center text-sm mt-4 ${currentPopup.backgroundImage ? 'text-white/80' : mutedColor}`}>
                {currentIndex + 1} / {popups.length}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AppPopup;

