// src/app/page.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ShieldCheck, 
  TrendingUp, 
  PieChart, 
  Users, 
  Lock, 
  ArrowRight, 
  CheckCircle2, 
  Sparkles, 
  Scale, 
  FileText,
  DollarSign,
  Activity
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function PublicLandingPage() {
  const { isSignedIn, isLoaded } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20">
      
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <TrendingUp className="h-5 w-5 stroke-[2.25]" />
            </div>
            <span className="font-bold text-base tracking-tight font-sans text-foreground">Imani Financial</span>
          </div>

          <div className="flex items-center gap-3">
            {isLoaded && isSignedIn ? (
              <Link href="/dashboard">
                <Button size="sm" className="h-9 px-4 text-xs font-semibold rounded-xl gap-1.5 shadow-sm">
                  Go to Dashboard <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in">
                  <Button variant="ghost" size="sm" className="h-9 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    Sign In
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button size="sm" className="h-9 px-4 text-xs font-semibold rounded-xl gap-1.5 shadow-sm">
                    Get Started <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Landing Content */}
      <main className="flex-1">
        
        {/* Hero Section */}
        <section className="relative py-20 lg:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide border border-primary/20">
            <Sparkles className="h-3.5 w-3.5" /> Kenya Data Protection Act (DPA, 2019) Certified
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground max-w-4xl mx-auto leading-[1.15]">
            Master Your Wealth with <span className="text-primary">Absolute Confidence</span>
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            The all-in-one financial dashboard designed for modern wealth management, intelligent budgeting, debt tracking, and secure peer-to-peer review collaboration.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            {isLoaded && isSignedIn ? (
              <Link href="/dashboard">
                <Button size="lg" className="h-11 px-8 text-sm font-semibold rounded-xl gap-2 shadow-md">
                  Open Your Dashboard <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-up">
                  <Button size="lg" className="h-11 px-8 text-sm font-semibold rounded-xl gap-2 shadow-md">
                    Start Free Today <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/sign-in">
                  <Button variant="outline" size="lg" className="h-11 px-8 text-sm font-semibold rounded-xl border-border/60">
                    Existing User Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 text-left max-w-5xl mx-auto">
            
            <Card className="border border-border/40 bg-card/60 backdrop-blur-xs rounded-2xl p-6 shadow-xs space-y-3">
              <div className="p-3 bg-primary/10 text-primary rounded-xl w-fit">
                <PieChart className="h-6 w-6 stroke-[1.75]" />
              </div>
              <h3 className="text-base font-bold text-foreground">Intelligent Budgeting</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Track categories, set monthly limits, and monitor spending velocity with automated real-time analytics.
              </p>
            </Card>

            <Card className="border border-border/40 bg-card/60 backdrop-blur-xs rounded-2xl p-6 shadow-xs space-y-3">
              <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl w-fit">
                <Users className="h-6 w-6 stroke-[1.75]" />
              </div>
              <h3 className="text-base font-bold text-foreground">Collaborative Reviews</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Securely share weekly or monthly reviews with advisors or peers with read-and-comment rights only.
              </p>
            </Card>

            <Card className="border border-border/40 bg-card/60 backdrop-blur-xs rounded-2xl p-6 shadow-xs space-y-3">
              <div className="p-3 bg-primary/10 text-primary rounded-xl w-fit">
                <ShieldCheck className="h-6 w-6 stroke-[1.75]" />
              </div>
              <h3 className="text-base font-bold text-foreground">Bank-Grade Security</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Strict adherence to Kenya&apos;s Data Protection Act, role-based access control, and encrypted storage.
              </p>
            </Card>

          </div>
        </section>

      </main>

      {/* Professional Footer Section */}
      <footer className="border-t border-border/40 bg-muted/20 py-12 px-4 sm:px-6 lg:px-8 text-xs font-sans">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-border/20">
          
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <TrendingUp className="h-4 w-4 stroke-[2.25]" />
              </div>
              <span className="font-bold text-sm tracking-tight text-foreground">Imani Financial</span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Empowering financial wellness, budgeting discipline, and collaborative wealth management in Kenya and beyond.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Platform</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link></li>
              <li><Link href="/weekly-review" className="hover:text-foreground transition-colors">Weekly Review</Link></li>
              <li><Link href="/budget" className="hover:text-foreground transition-colors">Budget Planner</Link></li>
              <li><Link href="/transactions" className="hover:text-foreground transition-colors">Transactions</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Legal & Compliance</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy (DPA 2019)</Link></li>
              <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms & Conditions</Link></li>
              <li><span className="text-muted-foreground/60">ODPC Reg: Reg/DPO/2026</span></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-foreground uppercase tracking-wider text-[11px]">Security</h4>
            <p className="text-muted-foreground leading-relaxed">
              Protected by encrypted sessions, Firestore secure rules, and strict DPO standards.
            </p>
          </div>

        </div>

        <div className="max-w-7xl mx-auto pt-8 flex flex-col sm:flex-row items-center justify-between text-muted-foreground gap-4">
          <p>© {new Date().getFullYear()} Imani Financial. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
            <span>•</span>
            <Link href="/terms" className="hover:underline">Terms of Service</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
