import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutTemplate, ArrowLeft, Brush, Home } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

const TenantAdminSidebar = ({ onLinkClick }) => {
  const { profile, signOut, siteSettings } = useAuth();
  const navigate = useNavigate();
  
  const navItems = [
    { to: '/tenant-admin', icon: Home, label: '仪表盘' },
    { to: '/tenant-admin/page-content', icon: LayoutTemplate, label: '页面内容管理' },
    { to: '/tenant-admin/site-settings', icon: Brush, label: '站点设置' },
    { to: '/tenant-admin/seo', icon: LayoutTemplate, label: 'SEO 建议' },
  ];

  const handleNavLinkClick = () => {
    if (onLinkClick) {
      onLinkClick();
    }
  };

  return (
    <aside className="w-64 flex-shrink-0 bg-card border-r border-border min-h-screen flex flex-col h-full">
      <div className="p-4 border-b border-border hidden md:block">
        <h2 className="text-xl font-bold text-foreground">{siteSettings.site_name || "分站管理"}</h2>
        <span className="text-sm text-muted-foreground">分站管理后台</span>
      </div>
       <div className="p-4 border-b border-border md:hidden">
        <h2 className="text-xl font-bold text-foreground">菜单</h2>
      </div>
      <ScrollArea className="flex-1">
        <nav className="px-4 py-4 space-y-2">
          {navItems.map(item => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.to === '/tenant-admin'}
              onClick={handleNavLinkClick}
              className={({ isActive }) =>
                `flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'
                }`
              }
            >
              <item.icon className="h-5 w-5 mr-3" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
      <div className="p-4 border-t border-border">
         <div className="flex items-center space-x-3 mb-4">
            <Avatar className="h-10 w-10">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback>{profile?.username?.[0]}</AvatarFallback>
            </Avatar>
            <div>
                <p className="font-semibold text-sm text-foreground">{profile?.username}</p>
                <p className="text-xs text-muted-foreground">分站管理员</p>
            </div>
        </div>
        <Button onClick={() => navigate('/')} variant="outline" className="w-full mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回应用
        </Button>
        <Button onClick={signOut} variant="ghost" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive-foreground">
          登出
        </Button>
      </div>
    </aside>
  );
};

export default TenantAdminSidebar;