import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  Bell,
  Shield,
  BarChart,
  Globe,
  Palette,
  ShoppingBag,
  Wand2,
  Database,
  Activity,
  BookOpen,
} from 'lucide-react';

export const mainNavItems = [
  { to: '/', label: '首页', icon: LayoutDashboard },
  { to: '/social', label: '朋友圈', icon: Users },
  { to: '/games', label: '游戏中心', icon: Palette },
  { to: '/points-center', label: '积分中心', icon: Shield },
];

export const adminNavItems = [
  {
    title: '管理',
    items: [
      { to: '/admin', label: '仪表盘', icon: LayoutDashboard },
      { to: '/admin/users', label: '用户管理', icon: Users },
      { to: '/admin/content', label: '内容审核', icon: FileText },
      { to: '/admin/notifications', label: '系统通知', icon: Bell },
      { to: '/admin/invitations', label: '邀请分析', icon: BarChart },
      { to: '/admin/shop', label: '商城管理', icon: ShoppingBag },
    ],
  },
  {
    title: '网站设置',
    items: [
      { to: '/admin/site-settings', label: '主站设置', icon: Settings },
      { to: '/admin/page-content', label: '页面内容', icon: Palette },
      { to: '/admin/seo', label: 'SEO 建议', icon: Wand2 },
    ],
  },
  {
    title: 'SaaS',
    items: [
      { to: '/admin/saas', label: '分站管理', icon: Globe },
      { to: '/admin/databases', label: '数据库管理', icon: Database },
    ],
  },
  {
    title: '系统监控',
    items: [
      { to: '/admin/api-monitor', label: 'API 监控', icon: Activity },
      { to: '/admin/api-docs', label: 'API 文档', icon: BookOpen },
      { to: '/admin/audit-logs', label: '审计日志', icon: FileText },
    ],
  },
];