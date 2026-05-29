import { useEffect, useLayoutEffect } from "react";
import { useProperty } from "@/hooks/useProperty";
import { useOwnerProperty } from "@/hooks/useOwnerProperty";
import { parseTheme, applyTheme, parseFont, applyFont, type ThemeName } from "@/lib/theme";
import { getSubdomain } from "@/lib/subdomain";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const subdomain = getSubdomain();
  const { data: guestProperty } = useProperty(subdomain);
  const { data: ownerProperty } = useOwnerProperty();

  // Apply cached theme and font immediately to prevent FOUC
  useLayoutEffect(() => {
    const cachedTheme = localStorage.getItem("stayidom-theme") as ThemeName | null;
    if (cachedTheme) {
      applyTheme(cachedTheme);
    }
    const cachedFont = localStorage.getItem("stayidom-font");
    if (cachedFont) {
      applyFont(cachedFont);
    }
  }, []);

  useEffect(() => {
    const property = guestProperty || ownerProperty;
    if (property) {
      const theme = parseTheme(property);
      applyTheme(theme);

      const font = parseFont(property);
      applyFont(font);
    }
  }, [guestProperty, ownerProperty]);

  return <>{children}</>;
}
