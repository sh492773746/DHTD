import React, { useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Gamepad2, Info, Download, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { decryptUrl } from '@/lib/urlEncryption';

const GameCard = ({ game, priority = false }) => {
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const longPressTimeoutRef = useRef(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // 🔒 解密游戏路径（防爬虫）
  const decryptedPath = useMemo(() => decryptUrl(game?.path), [game?.path]);

  const isExternal = (path) => /^https?:\/\//i.test(String(path || ''));

  const handleNavigate = (path, requiresAuth) => {
    if (!path) return;
    if (isExternal(path)) {
      window.open(path, '_blank', 'noopener,noreferrer');
      return;
    }
    if (requiresAuth) {
      toast({
        title: "请先登录",
        description: "登录后才能访问该页面。",
        variant: "destructive",
      });
      navigate('/auth');
    } else {
      navigate(path);
    }
  };

  const handleLongPress = (e) => {
    e.preventDefault();
    setIsAlertOpen(true);
  };
  
  const handleDescClick = (e) => {
    e.stopPropagation();
    setIsPopoverOpen(true);
  };

  const handleAddToDesktop = () => {
    toast({
      title: "🚧 功能正在开发中",
      description: "添加到桌面功能即将推出，敬请期待！",
    });
    setIsAlertOpen(false);
  };

  if (!game) {
    return null;
  }

  const truncatedDescription = game.description && game.description.length > 7
    ? `${game.description.substring(0, 7)}...`
    : game.description;

  return (
    <>
      <motion.div
        onContextMenu={handleLongPress}
        whileTap={{ scale: 0.95 }}
        className="relative"
      >
        <Card
          className="bg-secondary rounded-lg shadow-sm border border-border text-center p-1.5 sm:p-1 flex flex-col items-center justify-between aspect-square cursor-pointer card-hover"
          onClick={() => handleNavigate(decryptedPath, game.requiresAuth)}
        >
          {game.isOfficial && (
            <div className="absolute top-0 right-0 z-10 scale-[0.65] sm:scale-[0.9] transform translate-x-[25%] translate-y-[-25%]">
               <Badge
                className="bg-gradient-to-r from-vercel-blue to-vercel-cyan text-white border-2 border-border shadow-lg"
              >
                <Crown className="w-3 h-3 mr-1" />
                官方
              </Badge>
            </div>
          )}
          <div className="w-12 h-12 sm:w-10 sm:h-10 rounded-md flex items-center justify-center mt-0.5 mb-0.5 overflow-hidden bg-secondary">
             {game.iconUrl ? (
                <img 
                  src={game.iconUrl} 
                  alt={game.title} 
                  className="w-full h-full object-contain bg-transparent"
                  loading={priority ? 'eager' : 'lazy'}
                  decoding="async"
                />
              ) : (
                <Gamepad2 className="w-6 h-6 text-foreground" />
              )}
          </div>
          <h3 className="text-[11px] sm:text-xs font-semibold text-foreground mb-0 line-clamp-1">
            {game.title}
          </h3>
          <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                  <p 
                    className="text-[10px] text-muted-foreground mb-0 leading-tight scale-90 truncate w-full px-1 cursor-pointer"
                    onClick={handleDescClick}
                  >
                    {truncatedDescription}
                  </p>
              </PopoverTrigger>
              <PopoverContent className="w-60 text-sm bg-popover border-border text-popover-foreground" side="top" align="center">
                  {game.description}
              </PopoverContent>
          </Popover>
          <div className="flex items-center justify-center text-muted-foreground text-[10px] mb-0 scale-95 sm:scale-90">
             <Info className="w-2.5 h-2.5 mr-0.5 text-foreground" />
             {game.info}
          </div>
          <Button variant="default" className="w-full text-xs h-7 sm:h-6 mt-0.5">
            进入游戏
          </Button>
        </Card>
      </motion.div>
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent className="bg-secondary border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>{game.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {game.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button onClick={handleAddToDesktop} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              添加到桌面
            </Button>
            <AlertDialogAction onClick={() => handleNavigate(decryptedPath, game.requiresAuth)}>
              进入游戏
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default GameCard;