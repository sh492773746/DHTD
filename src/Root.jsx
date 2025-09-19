import React from 'react';
import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { Helmet, HelmetProvider } from 'react-helmet-async';

const AppContent = () => {
  return (
    <>
      <Helmet>
        <title>大海团队官网</title>
        <meta name="description" content="一个由大海团队创建的应用。" />
      </Helmet>
      <Outlet />
    </>
  );
};

const Root = () => {
  return (
    <HelmetProvider>
        <AppContent />
        <Toaster />
    </HelmetProvider>
  );
};

export default Root;