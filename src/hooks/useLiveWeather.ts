import { useQuery } from "@tanstack/react-query";
import { parseWeather } from "@/lib/liveInfo";

/** Current temperature at the property, or null (no location, no weather key, offline, any error). */
export function useLiveWeather(lat: number | null | undefined, lng: number | null | undefined) {
  const has = lat != null && lng != null;
  return useQuery({
    queryKey: ["live-weather", has ? lat!.toFixed(2) : "", has ? lng!.toFixed(2) : ""],
    enabled: has,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      try {
        const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}`);
        if (!res.ok) return null;
        return parseWeather(await res.json());
      } catch {
        return null;
      }
    },
  });
}
