// src/app/privacy/page.tsx
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Lock, FileText, ArrowLeft, Mail, Database, UserCheck, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
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
          <span className="text-xs text-muted-foreground font-mono">Kenya DPA 2019 Compliant</span>
        </div>

        {/* Header Card */}
        <Card className="border border-border/40 shadow-sm bg-card rounded-2xl overflow-hidden">
          <CardHeader className="p-8 pb-6 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/20">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 text-primary rounded-2xl">
                <ShieldCheck className="h-7 w-7 stroke-[2]" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold text-foreground tracking-tight">Privacy Policy</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Last updated: September 11, 2026 • Pursuant to Kenya&apos;s Data Protection Act, 2019 (ODPC)
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-8 space-y-8 text-foreground/90 text-sm leading-relaxed">
            
            {/* 1. Introduction */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">01.</span> Introduction & Scope
              </h2>
              <p>
                IFS-Guru (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) is committed to safeguarding your personal and financial data. This Privacy Policy is structured in strict compliance with <strong>Kenya&apos;s Data Protection Act, No. 24 of 2019</strong> and the regulations issued by the <strong>Office of the Data Protection Commissioner (ODPC)</strong>.
              </p>
              <p>
                This policy governs how we collect, use, store, process, and protect your personal data when you use our financial dashboard, budgeting tools, investment trackers, and collaborative weekly reviews.
              </p>
            </section>

            {/* 2. Data Collection */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">02.</span> Categories of Data We Collect
              </h2>
              <p>In accordance with the principle of data minimization, we only collect information necessary to provide and improve our financial management services:</p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li><strong className="text-foreground">Identity & Account Data:</strong> Full name, email address, secure authentication credentials, and user profile role.</li>
                <li><strong className="text-foreground">Financial Records:</strong> Transaction histories, budgets, savings goals, debt management logs, and investment portfolios entered or imported by you.</li>
                <li><strong className="text-foreground">Collaboration & Feedback Data:</strong> Comments, peer notes, and shared review logs generated when you collaborate with financial advisors or peers.</li>
                <li><strong className="text-foreground">Technical Telemetry:</strong> Log records, IP addresses, browser specifications, and session identifiers strictly required for platform stability and security audits.</li>
              </ul>
            </section>

            {/* 3. Lawful Basis for Processing */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">03.</span> Lawful Basis for Processing
              </h2>
              <p>We process your personal data under the following lawful bases as stipulated in Section 30 of the Kenya Data Protection Act:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-1">
                  <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">Explicit Consent</h3>
                  <p className="text-xs text-muted-foreground">You give clear, affirmative consent upon account registration and when sharing reviews.</p>
                </div>
                <div className="p-4 rounded-xl bg-muted/30 border border-border/40 space-y-1">
                  <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">Contractual Necessity</h3>
                  <p className="text-xs text-muted-foreground">Processing is necessary to deliver the financial tools and budgeting calculators you requested.</p>
                </div>
              </div>
            </section>

            {/* 4. Data Subject Rights */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">04.</span> Your Rights as a Data Subject
              </h2>
              <p>Under Section 26 of the Data Protection Act, you retain full rights regarding your personal information:</p>
              <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                <li><strong className="text-foreground">Right to be Informed:</strong> Know what data is collected and how it is processed (detailed in this policy).</li>
                <li><strong className="text-foreground">Right of Access:</strong> Request a complete export of all personal and financial data associated with your account.</li>
                <li><strong className="text-foreground">Right to Correction:</strong> Rectify inaccurate, outdated, or incomplete personal data instantly through your profile or by contacting us.</li>
                <li><strong className="text-foreground">Right to Erasure (&ldquo;Right to be Forgotten&rdquo;):</strong> Request the permanent deletion of your account and associated records.</li>
                <li><strong className="text-foreground">Right to Object:</strong> Restrict or object to specific automated processing or AI-driven analytics.</li>
              </ul>
            </section>

            {/* 5. Data Security & Storage */}
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">05.</span> Security Safeguards & Localization
              </h2>
              <p>
                We implement robust technical and organizational security measures, including end-to-end encryption in transit (HTTPS/TLS 1.3), secure Firestore database security rules, role-based access control (RBAC), and strict server-side API proxying for AI features to ensure your financial credentials remain private.
              </p>
            </section>

            {/* 6. Contact DPO */}
            <section className="space-y-3 pt-4 border-t border-border/30">
              <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                <span className="text-primary font-mono text-sm">06.</span> Data Protection Officer (DPO) Contact
              </h2>
              <p className="text-xs text-muted-foreground">
                For any inquiries, data access requests, or complaints regarding data privacy under Kenyan law, you may contact our designated Data Protection Officer:
              </p>
              <div className="p-4 bg-muted/40 rounded-xl border border-border/40 text-xs space-y-1 font-mono">
                <p><strong className="text-foreground">Entity:</strong> IFS-Guru DPO Office</p>
                <p><strong className="text-foreground">Location:</strong> Nairobi, Kenya</p>
                <p><strong className="text-foreground">Email:</strong> privacy@ifs-guru.com</p>
                <p><strong className="text-foreground">ODPC Registration Reference:</strong> Reg/DPO/2026/08942</p>
              </div>
            </section>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
