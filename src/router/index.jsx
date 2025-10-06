import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import Root from '@/Root';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
import TenantAdminRoute from '@/components/TenantAdminRoute';

// Layouts
import MainLayout from '@/components/MainLayout';
import TenantAdminLayout from '@/components/TenantAdminLayout';

// Main Pages
import SocialFeed from '@/pages/SocialFeed';
import Prediction from '@/pages/Prediction';
import PredictionJnd28 from '@/pages/PredictionJnd28';
import PredictionFf28 from '@/pages/PredictionFf28';
import PredictionBit28 from '@/pages/PredictionBit28';
import PredictionGame from '@/pages/PredictionGame';
import Profile from '@/pages/Profile';
import EditProfile from '@/pages/EditProfile';
import PointsCenter from '@/pages/PointsCenter';
import PointsHistory from '@/pages/PointsHistory';
import Notifications from '@/pages/Notifications';
import Dashboard from '@/pages/Dashboard';
import GameCenter from '@/pages/GameCenter';
// import PointsMall from '@/pages/PointsMall';

// Auth Pages
import AuthPage from '@/pages/AuthPage';
import AuthCallback from '@/pages/AuthCallback';
import EmailConfirmation from '@/pages/EmailConfirmation';
import InvitePage from '@/pages/InvitePage';

// Admin Pages
import AdminDashboard from '@/pages/AdminDashboard';
import UserManagement from '@/pages/UserManagement';
import ContentModeration from '@/pages/ContentModeration';
import AdminSiteSettings from '@/pages/AdminSiteSettings';
import PageContentManager from '@/pages/PageContentManager';
import AdminNotifications from '@/pages/AdminNotifications';
import InvitationAnalytics from '@/pages/InvitationAnalytics';
import AdminSaasManagement from '@/pages/AdminSaasManagement';
import AdminShopManagement from '@/pages/AdminShopManagement';
import AdminDatabases from '@/pages/AdminDatabases';
import AdminSEO from '@/pages/AdminSEO';
import AdminAPIMonitor from '@/pages/AdminAPIMonitor';
import AdminAPIDocs from '@/pages/AdminAPIDocs';
import AdminAuditLogs from '@/pages/AdminAuditLogs';

// Tenant Admin Pages
import TenantDashboard from '@/pages/TenantDashboard';
import TenantHomepage from '@/pages/TenantHomepage';


const routerConfig = [
  {
    path: '/',
    element: <Root />,
    children: [
      {
        path: 'auth',
        element: <AuthPage />,
      },
      {
        path: 'auth/callback',
        element: <AuthCallback />,
      },
      {
        path: 'invite/:inviteCode',
        element: <InvitePage />,
      },
      {
        path: 'confirm-email',
        element: <EmailConfirmation />,
      },
      {
        element: <MainLayout />,
        children: [
          {
            index: true,
            element: <Dashboard />,
          },
          {
            path: 'social',
            element: <SocialFeed />,
          },
          {
            path: 'prediction',
            element: <ProtectedRoute><Prediction /></ProtectedRoute>,
          },
          {
            path: 'prediction/jnd28',
            element: <ProtectedRoute><PredictionJnd28 /></ProtectedRoute>,
          },
          {
            path: 'prediction/ff28',
            element: <ProtectedRoute><PredictionFf28 /></ProtectedRoute>,
          },
          {
            path: 'prediction/bit28',
            element: <ProtectedRoute><PredictionBit28 /></ProtectedRoute>,
          },
          {
            path: 'games',
            element: <GameCenter />,
          },
          {
            path: 'games/prediction-28',
            element: <ProtectedRoute><PredictionGame /></ProtectedRoute>,
          },
          {
            path: 'notifications',
            element: <ProtectedRoute><Notifications /></ProtectedRoute>,
          },
          {
            path: 'profile',
            element: <ProtectedRoute><Profile /></ProtectedRoute>,

          },
          {
            path: 'profile/:userId',
            element: <Profile />,
          },
          {
            path: 'profile/edit',
            element: <ProtectedRoute><EditProfile /></ProtectedRoute>,
          },
          {
            path: 'points-center',
            element: <ProtectedRoute><PointsCenter /></ProtectedRoute>,
          },
          // Legacy redirect for removed route
          { path: 'points-mall', element: <Navigate to="/points-center" replace /> },
          {
            path: 'points-history',
            element: <ProtectedRoute><PointsHistory /></ProtectedRoute>,
          },
          {
            path: 'tenant/:tenantId/home',
            element: <TenantHomepage />,
          }
        ],
      },
      {
        path: 'admin',
        element: <AdminRoute />,
        children: [
            { index: true, element: <AdminDashboard /> },
            { path: 'users', element: <UserManagement /> },
            { path: 'content', element: <ContentModeration /> },
            { path: 'site-settings', element: <AdminSiteSettings /> },
            { path: 'site-settings/:tenantId', element: <AdminSiteSettings /> },
            { path: 'page-content', element: <PageContentManager /> },
            { path: 'page-content/:tenantId', element: <PageContentManager /> },
            { path: 'notifications', element: <AdminNotifications /> },
            { path: 'invitations', element: <InvitationAnalytics /> },
            { path: 'saas', element: <AdminSaasManagement /> },
            { path: 'settings', element: <Navigate to="/admin/site-settings" replace /> },
            { path: 'databases', element: <AdminDatabases /> },
            { path: 'shop', element: <AdminShopManagement /> },
            { path: 'seo', element: <AdminSEO /> },
            { path: 'api-monitor', element: <AdminAPIMonitor /> },
            { path: 'api-docs', element: <AdminAPIDocs /> },
            { path: 'audit-logs', element: <AdminAuditLogs /> },
        ]
      },
      {
        path: 'tenant-admin',
        element: (
          <TenantAdminRoute>
            <TenantAdminLayout />
          </TenantAdminRoute>
        ),
        children: [
          { index: true, element: <TenantDashboard /> },
          { path: 'page-content', element: <PageContentManager /> },
          { path: 'site-settings', element: <AdminSiteSettings /> },
          { path: 'seo', element: <AdminSEO /> },
        ],
      },
    ],
  },
];

const router = createBrowserRouter(routerConfig);


export default routerConfig;