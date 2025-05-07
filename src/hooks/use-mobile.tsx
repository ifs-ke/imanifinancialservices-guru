
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Initialize state based on whether window exists (safer for SSR)
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
      typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : undefined
  );

  React.useEffect(() => {
    // Only run effect logic if window exists
    if (typeof window === 'undefined') {
        return;
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      // Check window.innerWidth directly inside the handler
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    // Initial check immediately after mount
    onChange();

    mql.addEventListener("change", onChange)
    // Cleanup listener on unmount
    return () => mql.removeEventListener("change", onChange)
  }, []) // Empty dependency array ensures this runs once on mount/client-side

  // Return the determined state, could still be undefined initially on the server
  return isMobile;
}

