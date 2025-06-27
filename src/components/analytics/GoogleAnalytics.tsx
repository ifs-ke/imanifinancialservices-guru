'use client'

import React, { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Script from 'next/script';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

const GoogleAnalytics = () => {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!GA_MEASUREMENT_ID || typeof (window as any).gtag !== 'function') {
            return;
        }

        const url = pathname + searchParams.toString();
        (window as any).gtag('config', GA_MEASUREMENT_ID, {
            page_path: url,
        });

    }, [pathname, searchParams]);

    if (!GA_MEASUREMENT_ID) {
        return null;
    }

    return (
        <>
            <Script
                strategy="afterInteractive"
                src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            />
            <Script
                id="google-analytics"
                strategy="afterInteractive"
                dangerouslySetInnerHTML={{
                    __html: `
                        window.dataLayer = window.dataLayer || [];
                        function gtag(){dataLayer.push(arguments);}
                        gtag('js', new Date());
                        gtag('config', '${GA_MEASUREMENT_ID}', {
                            page_path: window.location.pathname,
                        });
                    `,
                }}
            />
        </>
    );
};

export default GoogleAnalytics;

// Helper functions for custom events (can be exported and used anywhere in the app)
export const logAnalyticsEvent = (action: string, category: string, label: string, value?: number) => {
    if (typeof (window as any).gtag !== 'function') {
        return;
    }
    (window as any).gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value,
    });
};
