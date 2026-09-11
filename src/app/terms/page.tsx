// src/app/terms/page.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ArrowLeft, ShieldCheck, Scale, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Navigation back */}
        <div className="flex items-center justify-between">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Return to Dashboard
            </Button>
          </Link>
          <span className="text-xs text-muted-foreground font-mono">Governed by Kenyan Law</span>
        </div>

        {/* Header Card */}
        <Card className="border border-border/40 shadow-sm bg-card rounded-2xl overflow-hidden">
          <CardHeader className="p-8 pb-6 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/20">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                <Scale className="h-7 w-7 stroke-[2]" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold text-foreground tracking-tight">Terms and Conditions</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Last updated: September 11, 2026 • Imani Financial Platform Agreement
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-8 space-y-8 text-foreground/90 text-sm leading-relaxed">
            
            {/* 1. Acceptance of Terms */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">01.</span> Acceptance of Terms
              </h2>
              <p>
                By accessing, registering for, or using Imani Financial (&ldquo;the Platform&rdquo;), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, you must refrain from using the platform immediately.
              </p>
              <p>
                These terms constitute a legally binding agreement between you and Imani Financial, operating in accordance with the laws of the Republic of Kenya.
              </p>
            </section>

            {/* 2. Account Registration & Security */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">02.</span> User Accounts & Security
              </h2>
              <p>
                You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use or security breach.
              </p>
            </section>

            {/* 3. Financial Tools & Disclaimer */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">03.</span> Financial Advisory Disclaimer
              </h2>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Not Certified Financial Advice</span>
                </div>
                <p>
                  Imani Financial provides budgeting tools, financial analytics, and AI-assisted coaching for informational and organizational purposes only. We are not a licensed financial institution or certified investment advisor. Users should consult professional advisors before making major financial commitments.
                </p>
              </div>
            </section>

            {/* 4. Data Protection & Privacy Compliance */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">04.</span> Data Protection & Privacy
              </h2>
              <p>
                Our collection and processing of your personal and financial data is governed by our <Link href="/privacy" className="text-primary underline font-medium">Privacy Policy</Link>, which complies fully with <strong>Kenya&apos;s Data Protection Act, 2019</strong>. By using our platform, you consent to such processing and warrant that all data provided by you is accurate.
              </p>
            </section>

            {/* 5. Limitation of Liability */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">05.</span> Limitation of Liability
              </h2>
              <p>
                To the maximum extent permitted by Kenyan law, Imani Financial shall not be liable for any indirect, incidental, special, or consequential damages resulting from your use of the platform, transaction inaccuracies, or third-party service interruptions.
              </p>
            </section>

            {/* 6. Governing Law */}
            <section className="space-y-3 pt-4 border-t border-border/30">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">06.</span> Governing Law & Dispute Resolution
              </h2>
              <p className="text-xs text-muted-foreground">
                These terms shall be governed by and construed in accordance with the laws of the Republic of Kenya. Any disputes arising hereunder shall be resolved through amicable negotiation or, failing that, submitted to the competent courts located in Nairobi, Kenya.
              </p>
            </section>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
