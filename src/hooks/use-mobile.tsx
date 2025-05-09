
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Default to false (desktop) for SSR and initial client render before hydration.
  // This ensures the server-rendered output matches the initial client render.
  const [isMobile, setIsMobile] = React.useState(false);
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true); // Mark as mounted once on the client

    const checkIsMobile = () => {
      if (typeof window !== 'undefined') { // Ensure window is defined
        setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
      }
    };

    checkIsMobile(); // Perform initial check on client mount
    window.addEventListener("resize", checkIsMobile); // Listen for resize events

    return () => window.removeEventListener("resize", checkIsMobile); // Cleanup listener
  }, []); // Empty dependency array ensures this effect runs only once on client mount

  // Return the client-determined value only after the component has mounted.
  // Before mounting (SSR or initial client render), return the default (false).
  return hasMounted ? isMobile : false;
}
