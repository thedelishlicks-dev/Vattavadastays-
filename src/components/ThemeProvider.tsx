import { useEffect, useLayoutEffect } from 'react';
import { useProperty } from '@/hooks/useProperty';
import { useOwnerProperty } from '@/hooks/useOwnerProperty';
import { parseTheme, applyTheme, type ThemeName } from '@/lib/theme';
import { getSubdomain } from '@/lib/subdomain';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const subdomain = getSubdomain();
  const { data: guestProperty } = useProperty(subdomain);
  const { data: ownerProperty } = useOwnerProperty();

  // Apply cached theme immediately to prevent FOUC
  useLayoutEffect(() => {
    const cachedTheme = localStorage.getItem('vattavadastays-theme') as ThemeName | null;
    if (cachedTheme) {
      applyTheme(cachedTheme);
    }
  }, []);

  useEffect(() => {
    const property = guestProperty || ownerProperty;
    if (property) {
      const theme = parseTheme(property.shared_amenities);
      applyTheme(theme);
    }
  }, [guestProperty, ownerProperty]);

  return <>{children}</>;
}
