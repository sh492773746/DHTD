import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronsUpDown, PanelRightClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminNavItems } from '@/config/navigationConfig';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { motion } from 'framer-motion';

const NavGroup = ({ title, children }) => (
  <div>
    {title && <h3 className="px-3 text-xs font-semibold uppercase text-gray-400 tracking-wider">{title}</h3>}
    <div className="mt-2 space-y-1">
      {children}
    </div>
  </div>
);

const AdminSidebar = ({ onLinkClick, className }) => {
  const navigate = useNavigate();
  const { siteSettings } = useAuth();

  const handleNavLinkClick = (e, path) => {
    if (!path) e.preventDefault();
    if (onLinkClick) {
      onLinkClick();
    }
  };

  return (
    <aside className={cn("w-full lg:w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full", className)}>
      <div className="relative">
        <motion.div
          whileHover={{ x: -4 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="absolute top-5 right-[-14px] hidden lg:block z-10"
        >
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-full shadow-md bg-white hover:bg-gray-100"
            onClick={() => console.log("Sidebar toggle clicked")}
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </motion.div>
        
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={siteSettings.site_logo || siteSettings.logo_url} />
                        <AvatarFallback>{siteSettings.site_name?.[0] || 'D'}</AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-sm truncate">{siteSettings.site_name || '大海团队'}</span>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </Button>
            </DropdownMenuTrigger>
             <DropdownMenuContent className="w-56">
                  <DropdownMenuLabel>切换团队</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                      主站点
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                      分站A (敬请期待)
                  </DropdownMenuItem>
              </DropdownMenuContent>
           </DropdownMenu>
        </div>
      </div>
      
      <div className='flex-1 min-h-0'>
        <ScrollArea className="h-full">
            <nav className="px-3 py-4 space-y-6">
            {adminNavItems.map((group, index) => (
                <NavGroup title={group.title} key={index}>
                {group.items.map(item => (
                    <NavLink
                    key={item.label}
                    to={item.to || '#'}
                    end={item.to === '/admin'}
                    onClick={(e) => handleNavLinkClick(e, item.to)}
                    className={({ isActive }) =>
                        `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                        isActive ? 'bg-gray-100 text-gray-900' : `text-gray-500 hover:bg-gray-100 hover:text-gray-900 ${!item.to && 'cursor-not-allowed opacity-50'}`
                        }`
                    }
                    >
                    <item.icon className="h-5 w-5 mr-3 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                    </NavLink>
                ))}
                </NavGroup>
            ))}
            </nav>
        </ScrollArea>
      </div>

      <div className="p-4 border-t border-gray-200">
        <Button onClick={() => navigate('/')} variant="ghost" className="w-full justify-start text-gray-500 hover:text-gray-900">
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回应用
        </Button>
      </div>
    </aside>
  );
};

export default AdminSidebar;