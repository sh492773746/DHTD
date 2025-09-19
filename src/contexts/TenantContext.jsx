import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { getTenantIdByHostname } from '@/lib/utils';
import { useTenantUtils } from '@/lib/tenantUtils';

const TenantContext = createContext({
  activeTenantId: 0,
  isLoading: true,
});

export const TenantProvider = ({ children }) => {
  const [activeTenantId, setActiveTenantId] = useState(0); 
  const [isLoading, setIsLoading] = useState(true);
  const { logTenantInfo } = useTenantUtils();

  useEffect(() => {
    const identifyTenant = async () => {
      setIsLoading(true);
      const host = window.location.hostname;
      const idFromHost = await getTenantIdByHostname(host);
      
      setActiveTenantId(idFromHost);
      logTenantInfo(host, idFromHost);
      
      setIsLoading(false);
    };

    identifyTenant();
  }, []); 
  
  const value = useMemo(() => ({
      activeTenantId,
      isLoading,
  }), [activeTenantId, isLoading]);

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};