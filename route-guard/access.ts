export function routeGuardAccessState({ premium, localDevelopment = false, usageReady, routeScansUsed }: {
  premium: boolean;
  localDevelopment?: boolean;
  usageReady: boolean;
  routeScansUsed: number;
}) {
  return {
    canAccess: premium || localDevelopment,
    allowanceReady: localDevelopment || usageReady,
    hasAllowance: localDevelopment || (usageReady && routeScansUsed < 100),
  };
}

export function shouldRecordRouteUsage(access?: { mode: 'local-development' | 'subscription' }) {
  return access?.mode !== 'local-development';
}
