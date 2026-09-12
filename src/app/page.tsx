/**
 * @fileoverview Main landing page for IFS-Guru.
 * Implements a clean, streamlined 3-section layout: Hero, Features, and Footer.
 * Engineered with high code standards, zero bloatware, and accessible semantics.
 */
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  ArrowRight, 
  ArrowUp,
  ShieldCheck, 
  FileSpreadsheet, 
  Sun, 
  Moon, 
  LayoutDashboard, 
  Zap, 
  Layers,
  Wallet,
  Compass
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from '@/components/ui/accordion';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from 'next-themes';

/**
 * Functional feature specification for platform capabilities.
 */
interface FeatureItem {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
}

/**
 * Structured FAQ item for homepage knowledge base.
 */
interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: readonly FAQItem[] = [
  {
    id: 'faq-statement-parsing',
    question: 'How does M-Pesa and bank statement import work?',
    answer: 'IFS-Guru processes M-Pesa PDF statements, merchant Till receipts, and Kenyan bank export PDFs directly in your browser. Our engine extracts transactions, categorizes expenses, detects duplicate entries, and populates your journal without sending your raw statement documents to third-party servers.'
  },
  {
    id: 'faq-offline-capability',
    question: 'Can I use IFS-Guru when offline?',
    answer: 'Yes! IFS-Guru is architected as an Offline-First Progressive Web App (PWA). You can view your ledgers, add transactions, adjust budgets, and draft weekly reviews without an active internet connection. All changes are encrypted and queued locally, then automatically synchronized once connection is restored.'
  },
  {
    id: 'faq-debt-strategies',
    question: 'Which debt reduction methodologies are supported?',
    answer: 'We provide automated calculators and amortization tables for both the Debt Avalanche (highest interest rate first for maximum cost savings) and Debt Snowball (smallest balance first for behavioral momentum) payoff strategies, complete with exact projected debt-free milestone dates.'
  },
  {
    id: 'faq-sme-segregation',
    question: 'How does IFS-Guru assist small businesses and SME owners?',
    answer: 'We solve the common challenge of co-mingling personal and business funds. IFS-Guru provides separate ledgers for working capital, tracking supplier payables, inventory costs, and owner drawings so you maintain clear cash runway visibility and accurate tax records.'
  },
  {
    id: 'faq-data-security',
    question: 'How is my financial data protected?',
    answer: 'Your financial privacy is our highest priority. IFS-Guru implements client-side encryption, granular role-based access control (RBAC), and strict adherence to the Kenya Data Protection Act (DPA 2019). We never sell, monetize, or share your financial records with advertisers.'
  },
  {
    id: 'faq-ai-advisor',
    question: 'How does the AI Financial Advisor coaching work?',
    answer: 'Our AI coaching engine is powered by server-side Gemini intelligence tailored for Kenyan economic contexts (KES currency, M-Pesa nuances, and local SME cash flow dynamics). You can launch conversational weekly reviews via the Live Streaming Chat FAB anytime to receive actionable cash flow insights.'
  }
];

const PLATFORM_FEATURES: readonly FeatureItem[] = [
  {
    id: 'feature-financial-statements',
    icon: FileSpreadsheet,
    title: 'Financial Statements',
    description: 'Parse M-Pesa, bank, and merchant Till PDF statements directly into reconciled transaction journals with duplicate detection.'
  },
  {
    id: 'feature-debt-management',
    icon: Zap,
    title: 'Debt Management',
    description: 'Compare Avalanche and Snowball payoff schedules to minimize interest costs and determine exact debt-free calendar targets.'
  },
  {
    id: 'feature-cashflow-management',
    icon: Layers,
    title: 'Cashflow Management',
    description: 'Maintain separate ledgers for business working capital and personal owner withdrawals to prevent operational shortfalls.'
  },
  {
    id: 'feature-budgeting',
    icon: Wallet,
    title: 'Budgeting',
    description: 'Allocate income into zero-based expense envelopes to monitor actual spending against monthly limits and prevent leaks.'
  },
  {
    id: 'feature-financial-coaching',
    icon: Compass,
    title: 'Financial Coaching',
    description: 'Access strategic financial advisory, expert milestone reviews, and tailored action plans to accelerate wealth and SME growth.'
  }
];

/**
 * SinglePageHome renders the core 3-section landing interface.
 */
export default function SinglePageHome() {
  const { isSignedIn, isLoaded, role } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const scrollToTop = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const dashboardUrl = role === 'admin' ? '/admin' : role === 'auditor' ? '/auditor' : '/dashboard';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-jakarta antialiased selection:bg-gold/20 text-[16px] leading-[1.6]">
      
      {/* ========================================================================= */}
      {/* GLOBAL HEADER */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          
          <Link href="/" id="brand-logo-link" className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-navy flex items-center justify-center text-gold shadow-xs">
              <TrendingUp className="h-4 w-4 stroke-[2.5]" />
            </div>
            <span className="font-bold text-base tracking-tight text-foreground">IFS-Guru</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-8 text-sm font-medium text-muted-foreground">
            <a href="#hero" className="hover:text-foreground transition-colors">Overview</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            {mounted && (
              <Button
                id="theme-toggle-btn"
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            )}

            {isLoaded && isSignedIn ? (
              <Link href={dashboardUrl}>
                <Button id="nav-dashboard-btn" size="sm" className="h-9 px-4 text-xs font-semibold rounded-lg gap-2 shadow-xs bg-navy text-gold hover:bg-navy-mid dark:bg-gold dark:text-navy dark:hover:bg-gold-bright">
                  <LayoutDashboard className="h-4 w-4" />
                  <span>Dashboard</span>
                </Button>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/sign-in">
                  <Button id="nav-signin-btn" variant="ghost" size="sm" className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground font-medium">
                    Sign In
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button id="nav-signup-btn" size="sm" className="h-9 px-4 text-xs font-semibold rounded-lg gap-1.5 shadow-xs bg-navy text-gold hover:bg-navy-mid dark:bg-gold dark:text-navy dark:hover:bg-gold-bright">
                    <span>Get Started</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* ========================================================================= */}
      {/* SECTION 1: HERO */}
      {/* ========================================================================= */}
      <section id="hero" className="py-20 lg:py-28 border-b border-border/40 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            
            {/* Column 1: Core Content */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="lg:col-span-6 space-y-6 text-left"
            >
              
              {/* Main Headline & Description */}
              <div className="space-y-4">
                <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15]">
                  Financial Clarity for <span className="text-gold dark:text-gold-bright">Personal</span> & <span className="text-gold dark:text-gold-bright">SME Finance</span>
                </h1>
                <p className="text-base text-muted-foreground max-w-xl leading-relaxed font-normal">
                  Consolidate M-Pesa records, structure zero-based budget envelopes, automate debt payoff schedules, and project business cash runway with precision.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Link href={isLoaded && isSignedIn ? dashboardUrl : "/sign-up"} className="sm:w-auto">
                  <Button id="hero-primary-cta" className="w-full sm:w-auto h-11 px-6 text-sm font-semibold rounded-lg gap-2 shadow-xs bg-navy text-gold hover:bg-navy-mid dark:bg-gold dark:text-navy dark:hover:bg-gold-bright">
                    <span>{isLoaded && isSignedIn ? "Go to Dashboard" : "Open Financial Dashboard"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="#features" className="sm:w-auto">
                  <Button id="hero-secondary-cta" variant="outline" className="w-full sm:w-auto h-11 px-6 text-sm font-semibold rounded-lg border-border/80 text-foreground">
                    <span>Core Features</span>
                  </Button>
                </a>
              </div>

            </motion.div>

            {/* Column 2: Clean Visual Framing */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="lg:col-span-6"
            >
              <div className="relative rounded-2xl overflow-hidden border border-border/80 shadow-md bg-muted aspect-4/3">
                <img
                  src="/images/personal_relief.jpg"
                  alt="Financial management and clarity"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </motion.div>

          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: CORE FEATURES */}
      {/* ========================================================================= */}
      <section id="features" className="py-20 lg:py-28 bg-muted/20 border-b border-border/40 scroll-mt-16 relative">
        <span id="manage" className="absolute -top-16" />
        <div className="max-w-7xl mx-auto px-6 lg:px-8 space-y-12">
          
          {/* Section Header */}
          <div className="max-w-3xl mx-auto text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Core Features
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Essential financial tools engineered for personal cash planning and enterprise ledger segregation.
            </p>
          </div>

          {/* Features Grid (5 Cards) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {PLATFORM_FEATURES.map((item, idx) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.id}
                  id={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: 0.05 * idx }}
                  className="p-6 rounded-2xl border border-border/70 bg-card hover:border-gold/40 transition-all duration-200 shadow-xs flex flex-col items-center text-center justify-between space-y-4"
                >
                  <div className="space-y-3 flex flex-col items-center text-center">
                    <div className="h-12 w-12 rounded-xl bg-navy-pale dark:bg-navy-mid text-navy dark:text-gold flex items-center justify-center mx-auto">
                      <Icon className="h-6 w-6" />
                    </div>

                    <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: FREQUENTLY ASKED QUESTIONS (FAQ) */}
      {/* ========================================================================= */}
      <section id="faq" className="py-20 lg:py-28 border-b border-border/40 scroll-mt-16">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 space-y-12">
          
          {/* Section Header */}
          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Frequently Asked Questions
            </h2>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed font-normal">
              Everything you need to know about M-Pesa statements, privacy protocols, debt reduction models, and offline operations.
            </p>
          </div>

          {/* Accordion List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-border/70 bg-card p-4 sm:p-6 shadow-xs"
          >
            <Accordion type="single" collapsible className="w-full space-y-3">
              {FAQ_ITEMS.map((faq) => (
                <AccordionItem 
                  key={faq.id} 
                  value={faq.id}
                  id={faq.id}
                  className="border border-border/50 rounded-xl px-4 sm:px-5 data-[state=open]:border-gold/50 data-[state=open]:bg-muted/30 transition-colors"
                >
                  <AccordionTrigger className="text-left text-sm sm:text-base font-semibold text-foreground py-4 hover:no-underline hover:text-gold dark:hover:text-gold-bright transition-colors">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed pt-1 pb-4">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: FOOTER */}
      {/* ========================================================================= */}
      <footer id="footer" className="py-14 bg-background text-xs text-muted-foreground">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 space-y-8">
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-border/40">
            
            {/* Brand identity */}
            <div className="space-y-1.5 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2">
                <div className="h-6 w-6 rounded-md bg-navy flex items-center justify-center text-gold">
                  <TrendingUp className="h-3.5 w-3.5 stroke-[2.5]" />
                </div>
                <span className="font-bold text-sm text-foreground tracking-tight">IFS-Guru</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Personal & SME Cash Management • Offline-First Progressive Web App
              </p>
            </div>

            {/* Navigation links */}
            <div className="flex items-center gap-6 text-xs">
              <a href="#hero" className="hover:text-foreground transition-colors">Overview</a>
              <a href="#features" className="hover:text-foreground transition-colors">Features</a>
              <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            </div>

            {/* Back to Top */}
            <div>
              <Button 
                id="footer-back-to-top-btn" 
                size="sm" 
                variant="outline"
                onClick={scrollToTop}
                className="h-8 px-3 text-xs font-semibold rounded-lg gap-1.5 shadow-xs border-border/80 text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <span>Back to Top</span>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
            </div>

          </div>

          {/* Legal and Compliance */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <div>
              © {new Date().getFullYear()} IFS-Guru. All rights reserved.
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span>Compliant with the Kenya Data Protection Act (DPA 2019).</span>
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}
