// src/components/investments/PortfolioDiversityDashboard.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { useInvestmentStore } from '@/store/investmentStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ShieldCheck, Target, RefreshCw, Sparkles, Scale, Info, CheckCircle2, AlertTriangle, Coins } from 'lucide-react';
import { ASSET_CLASSES } from './InvestmentFormPopover';

const PRESET_ALLOCATIONS: Record<string, Record<string, number>> = {
  'Conservative': {
    'Equities / Stocks': 20,
    'Fixed Income / Bonds': 50,
    'Real Estate': 10,
    'Mutual Funds / ETFs': 5,
    'Crypto': 0,
    'Cash / Cash Equivalents': 15,
    'Alternatives': 0,
  },
  'Balanced / Moderate': {
    'Equities / Stocks': 40,
    'Fixed Income / Bonds': 30,
    'Real Estate': 15,
    'Mutual Funds / ETFs': 10,
    'Crypto': 0,
    'Cash / Cash Equivalents': 5,
    'Alternatives': 0,
  },
  'Aggressive Growth': {
    'Equities / Stocks': 65,
    'Fixed Income / Bonds': 10,
    'Real Estate': 5,
    'Mutual Funds / ETFs': 10,
    'Crypto': 5,
    'Cash / Cash Equivalents': 5,
    'Alternatives': 0,
  }
};

const CLASS_COLORS: Record<string, string> = {
  'Equities / Stocks': '#171717',     // Pure Off-Black
  'Fixed Income / Bonds': '#404040',   // Deep Charcoal
  'Real Estate': '#737373',           // Medium Slate Gray
  'Mutual Funds / ETFs': '#a3a3a3',   // Soft Silver Gray
  'Crypto': '#d4d4d4',                // Light Gray Accent
  'Cash / Cash Equivalents': '#e5e5e5', // High Contrast Pale Gray
  'Alternatives': '#262626',          // Warm Off-Black
};

// Robust helper to map arbitrary/custom inputs back to standard asset classes
export function mapToStandardAssetClass(typeStr: string): typeof ASSET_CLASSES[number] {
  const normalized = (typeStr || '').toLowerCase().trim();
  
  if (normalized.includes('stock') || normalized.includes('equity') || normalized.includes('equities') || normalized.includes('share') || normalized.includes('shares')) {
    return 'Equities / Stocks';
  }
  if (normalized.includes('bond') || normalized.includes('bonds') || normalized.includes('fixed income') || normalized.includes('treasury') || normalized.includes('bill')) {
    return 'Fixed Income / Bonds';
  }
  if (normalized.includes('real estate') || normalized.includes('property') || normalized.includes('land') || normalized.includes('reit')) {
    return 'Real Estate';
  }
  if (normalized.includes('etf') || normalized.includes('mutual fund') || normalized.includes('fund') || normalized.includes('funds') || normalized.includes('unit trust')) {
    return 'Mutual Funds / ETFs';
  }
  if (normalized.includes('crypto') || normalized.includes('bitcoin') || normalized.includes('ethereum') || normalized.includes('solana') || normalized.includes('coin')) {
    return 'Crypto';
  }
  if (normalized.includes('cash') || normalized.includes('savings') || normalized.includes('m-pesa') || normalized.includes('mpesa') || normalized.includes('bank') || normalized.includes('fixed deposit')) {
    return 'Cash / Cash Equivalents';
  }
  
  // Standard list exact check
  const matched = ASSET_CLASSES.find(cls => cls.toLowerCase() === normalized);
  if (matched) return matched;

  return 'Alternatives';
}

export default function PortfolioDiversityDashboard() {
  const { investmentItems, targetAllocations, setTargetAllocations } = useInvestmentStore();
  const { toast } = useToast();

  const [customTargets, setCustomTargets] = useState<Record<string, number>>(() => ({
    ...targetAllocations
  }));

  const [newCapital, setNewCapital] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'analyzer' | 'target-planner' | 'rebalance'>('analyzer');

  // Math: Calculate Actual Asset Class distribution
  const totalValue = useMemo(() => {
    return investmentItems.reduce((sum, item) => sum + (item.currentValue || 0), 0);
  }, [investmentItems]);

  const actualAllocations = useMemo(() => {
    const classValues: Record<string, number> = {};
    ASSET_CLASSES.forEach(cls => { classValues[cls] = 0; });

    investmentItems.forEach(item => {
      const cls = mapToStandardAssetClass(item.type);
      classValues[cls] = (classValues[cls] || 0) + (item.currentValue || 0);
    });

    const breakdown = ASSET_CLASSES.map(cls => {
      const value = classValues[cls] || 0;
      const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
      return {
        name: cls,
        value,
        percentage,
        color: CLASS_COLORS[cls],
      };
    });

    return breakdown;
  }, [investmentItems, totalValue]);

  // Diversification Score Math
  const scoreMetrics = useMemo(() => {
    if (totalValue === 0) {
      return { score: 0, rating: 'Unallocated', advice: ['Add assets to analyze portfolio diversity.'], color: 'text-muted-foreground' };
    }

    // 1. Asset Class Breadth Score (max 50 points)
    // Counts classes that are >= 2% of the portfolio
    const significantClassesCount = actualAllocations.filter(cls => cls.percentage >= 2).length;
    let breadthScore = 0;
    if (significantClassesCount === 1) breadthScore = 15;
    else if (significantClassesCount === 2) breadthScore = 30;
    else if (significantClassesCount === 3) breadthScore = 42;
    else if (significantClassesCount >= 4) breadthScore = 50;

    // 2. Target Alignment Score (max 50 points)
    let totalAbsDeviation = 0;
    ASSET_CLASSES.forEach(cls => {
      const currentPct = actualAllocations.find(a => a.name === cls)?.percentage || 0;
      const targetPct = targetAllocations[cls] || 0;
      totalAbsDeviation += Math.abs(currentPct - targetPct);
    });

    // Max absolute deviation is 200%. Let's scale alignment score.
    const alignmentScore = Math.max(0, 50 * (1 - (totalAbsDeviation / 180)));

    const rawScore = breadthScore + alignmentScore;
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    let rating = 'Highly Concentrated';
    let color = 'text-red-500';
    if (score >= 80) {
      rating = 'Optimized & Diverse';
      color = 'text-emerald-500';
    } else if (score >= 60) {
      rating = 'Balanced';
      color = 'text-green-500';
    } else if (score >= 40) {
      rating = 'Moderately Diversified';
      color = 'text-amber-500';
    }

    // Dynamic advice generator
    const advice: string[] = [];
    if (significantClassesCount <= 2) {
      advice.push("Spread your capital across at least 3-4 distinct asset classes to lower systemic risk.");
    }
    
    const cryptoPct = actualAllocations.find(a => a.name === 'Crypto')?.percentage || 0;
    if (cryptoPct > 15) {
      advice.push("High Crypto exposure (exceeding 15%): Consider taking profits to secure gains into stable assets like Cash or Bonds.");
    }

    const stocksPct = actualAllocations.find(a => a.name === 'Equities / Stocks')?.percentage || 0;
    if (stocksPct > 70) {
      advice.push("Heavy Equity concentration: Your portfolio might experience sharp volatility. Balanced portfolios typically include fixed income.");
    }

    if (totalAbsDeviation > 40) {
      advice.push("High drift from targets: Your actual holdings differ significantly from your allocation blueprint. Review the Rebalancing Guide.");
    }

    if (advice.length === 0) {
      advice.push("Outstanding job! Your portfolio is exceptionally balanced and closely aligned with your target blueprint.");
    }

    return { score, rating, advice, color };
  }, [actualAllocations, totalValue, targetAllocations]);

  // Target Planner Logic
  const totalCustomTargetSum = useMemo(() => {
    return Object.values(customTargets).reduce((sum, val) => sum + val, 0);
  }, [customTargets]);

  const handleApplyPreset = (presetName: string) => {
    const preset = PRESET_ALLOCATIONS[presetName];
    if (preset) {
      setCustomTargets({ ...preset });
      toast({
        title: 'Preset Applied',
        description: `Loaded target percentages for the "${presetName}" profile. Please save to apply.`,
      });
    }
  };

  const handleSaveTargets = () => {
    if (Math.abs(totalCustomTargetSum - 100) > 0.01) {
      toast({
        title: 'Allocation Error',
        description: `Total target allocation must sum to exactly 100%. Currently it is ${totalCustomTargetSum}%.`,
        variant: 'destructive',
      });
      return;
    }

    setTargetAllocations(customTargets);
    toast({
      title: 'Targets Updated',
      description: 'Your strategic asset allocation targets have been saved successfully.',
    });
    setActiveTab('analyzer');
  };

  // Smart Rebalancing Deployer Logic
  const rebalanceData = useMemo(() => {
    return ASSET_CLASSES.map(cls => {
      const currentVal = actualAllocations.find(a => a.name === cls)?.value || 0;
      const currentPct = totalValue > 0 ? (currentVal / totalValue) * 100 : 0;
      const targetPct = targetAllocations[cls] || 0;
      const targetValue = (targetPct / 100) * totalValue;
      const deviation = currentPct - targetPct; // positive = surplus, negative = deficit
      const requiredAdjustment = targetValue - currentVal; // positive = buy, negative = sell/trim

      return {
        class: cls,
        currentVal,
        currentPct,
        targetPct,
        deviation,
        requiredAdjustment,
        color: CLASS_COLORS[cls],
      };
    });
  }, [actualAllocations, totalValue, targetAllocations]);

  // Smart capital allocation logic (waterfall / deficit-filling algorithm)
  const deployedCapitalAllocation = useMemo(() => {
    if (newCapital <= 0 || totalValue === 0) return null;

    // Distribute new capital to minimize target deviation
    // Target balance for each class after deploying newCapital = Target % * (totalValue + newCapital)
    const newTotalValue = totalValue + newCapital;
    const allocationResults = rebalanceData.map(item => {
      const finalTargetValue = (item.targetPct / 100) * newTotalValue;
      const deficit = Math.max(0, finalTargetValue - item.currentVal);
      return {
        class: item.class,
        currentVal: item.currentVal,
        deficit,
      };
    });

    const totalDeficit = allocationResults.reduce((sum, r) => sum + r.deficit, 0);

    // If there is some deficit, allocate proportionally to deficits to bring closer to targets
    const allocationByClass: Record<string, number> = {};
    ASSET_CLASSES.forEach(cls => { allocationByClass[cls] = 0; });

    if (totalDeficit > 0) {
      let remainingToDeploy = newCapital;
      // Pro-rata distribution of new capital based on deficit sizes
      allocationResults.forEach(r => {
        const portion = (r.deficit / totalDeficit) * newCapital;
        const allocated = Math.min(remainingToDeploy, portion);
        allocationByClass[r.class] = Math.round(allocated * 100) / 100;
        remainingToDeploy -= allocated;
      });

      // Distribute any rounding residuals to the highest deficit class
      if (remainingToDeploy > 0.01) {
        const highestDeficitClass = [...allocationResults].sort((a, b) => b.deficit - a.deficit)[0]?.class;
        if (highestDeficitClass) {
          allocationByClass[highestDeficitClass] = (allocationByClass[highestDeficitClass] || 0) + remainingToDeploy;
        }
      }
    } else {
      // Portfolio is fully balanced or in surplus. Distribute exactly matching target percentages
      ASSET_CLASSES.forEach(cls => {
        const targetPct = targetAllocations[cls] || 0;
        allocationByClass[cls] = Math.round((targetPct / 100) * newCapital * 100) / 100;
      });
    }

    return allocationByClass;
  }, [newCapital, totalValue, rebalanceData, targetAllocations]);

  // Chart rendering data
  const chartData = useMemo(() => {
    return actualAllocations.filter(item => item.value > 0);
  }, [actualAllocations]);

  return (
    <Card className="shadow-md border border-border/60 overflow-hidden bg-card rounded-2xl">
      <CardHeader className="bg-muted/30 border-b border-border/40 py-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl flex items-center gap-2 font-bold tracking-tight text-foreground">
              <Scale className="h-5.5 w-5.5 text-primary" /> Strategic Diversity Engine
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Analyze asset distribution, optimize target weights, and receive instant rebalancing recommendations to lower portfolio risk.
            </CardDescription>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full md:w-auto">
            <TabsList className="grid grid-cols-3 w-full md:w-[360px] h-9 p-1 bg-muted rounded-xl">
              <TabsTrigger value="analyzer" className="text-xs rounded-lg font-medium py-1">Diversity Analyzer</TabsTrigger>
              <TabsTrigger value="target-planner" className="text-xs rounded-lg font-medium py-1">Target Planner</TabsTrigger>
              <TabsTrigger value="rebalance" className="text-xs rounded-lg font-medium py-1">Rebalancer</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <Tabs value={activeTab}>
          {/* TAB 1: PORTFOLIO DIVERSITY ANALYZER */}
          <TabsContent value="analyzer" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Diverification Score */}
              <div className="lg:col-span-5 flex flex-col justify-between p-5 rounded-2xl border border-border/50 bg-muted/20 relative">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Portfolio Diversity Rating</span>
                    <Badge variant={scoreMetrics.score >= 60 ? "outline" : "secondary"} className="h-6 text-[10px] px-2 bg-background border-border/50 font-medium">
                      {scoreMetrics.rating}
                    </Badge>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className={`text-5xl font-black font-mono tracking-tight ${scoreMetrics.color}`}>
                      {scoreMetrics.score}
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground">/ 100</span>
                  </div>

                  <Progress value={scoreMetrics.score} className="h-2 bg-muted-foreground/10" />

                  <div className="pt-2">
                    <h4 className="text-xs font-bold flex items-center gap-1 text-foreground mb-1.5">
                      <ShieldCheck className="h-4 w-4 text-primary" /> Personalized Optimization Strategy
                    </h4>
                    <ul className="space-y-2 text-xs text-muted-foreground">
                      {scoreMetrics.advice.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="block h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    Target allocations used as balance benchmark.
                  </span>
                  <Button variant="ghost" size="xs" onClick={() => setActiveTab('target-planner')} className="h-7 text-xs text-primary px-2 hover:bg-primary/5">
                    Adjust Targets
                  </Button>
                </div>
              </div>

              {/* Chart Visualization */}
              <div className="lg:col-span-7 flex flex-col p-5 rounded-2xl border border-border/50 bg-background">
                <h3 className="text-sm font-bold text-foreground mb-1">Asset Allocation Chart</h3>
                <p className="text-[11px] text-muted-foreground mb-4">Current weighting across asset classes based on total currentValue.</p>
                
                {chartData.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
                    <div className="p-3 bg-muted rounded-full mb-3">
                      <Scale className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground">No asset allocation data to chart</span>
                    <span className="text-[10px] text-muted-foreground/80 mt-1 max-w-[250px]">
                      Add investments with defined values and classes to see your diversity pie chart.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-6 h-[200px] w-full flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: any) => [`${formatCurrency(Number(value))}`, 'Value']}
                            contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Legend */}
                    <div className="md:col-span-6 space-y-2">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Class Distribution</div>
                      {actualAllocations.map((item) => (
                        <div key={item.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate pr-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="truncate text-foreground font-medium">{item.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-muted-foreground font-mono">{item.percentage.toFixed(1)}%</span>
                            <span className="font-semibold text-foreground/80 font-mono text-[11px]">({formatCurrency(item.value)})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: ALLOCATION TARGET PLANNER */}
          <TabsContent value="target-planner" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Asset Weighting Blueprint</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Define the target percentages for each asset class. Your current blueprint must sum to exactly 100%.
                  </p>
                </div>
                
                {/* Preset Fast Actions */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Presets:</span>
                  {Object.keys(PRESET_ALLOCATIONS).map((preset) => (
                    <Button 
                      key={preset} 
                      variant="outline" 
                      size="xs" 
                      onClick={() => handleApplyPreset(preset)} 
                      className="h-7 text-xs font-semibold px-2.5 rounded-lg border-border/60 hover:bg-muted"
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Dynamic Target Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {ASSET_CLASSES.map((cls) => {
                  const val = customTargets[cls] || 0;
                  const actualVal = actualAllocations.find(a => a.name === cls)?.percentage || 0;
                  return (
                    <div key={cls} className="p-4 border border-border/50 rounded-xl bg-muted/10 flex flex-col justify-between space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CLASS_COLORS[cls] }} />
                          <span className="text-xs font-bold text-foreground truncate">{cls}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">Current: {actualVal.toFixed(1)}%</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          className="h-8 font-mono text-xs w-24 rounded-lg px-2.5"
                          value={val}
                          onChange={(e) => {
                            const newPct = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                            setCustomTargets(prev => ({ ...prev, [cls]: newPct }));
                          }}
                        />
                        <span className="text-xs font-bold text-foreground">%</span>
                        <Progress value={val} className="h-1.5 flex-1 bg-muted-foreground/10" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Targets Summary Validation bar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/20 gap-4 mt-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full shrink-0 ${Math.abs(totalCustomTargetSum - 100) < 0.01 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                    {Math.abs(totalCustomTargetSum - 100) < 0.01 ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <AlertTriangle className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground">
                      Total Allocated Target Percentage: <span className="font-mono">{totalCustomTargetSum}%</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {Math.abs(totalCustomTargetSum - 100) < 0.01 ? (
                        <span className="text-emerald-500 font-semibold">Perfect! Ready to save changes.</span>
                      ) : (
                        `Allocation target sum must equal 100%. Adjust weights by ${Math.round((100 - totalCustomTargetSum) * 100) / 100}%`
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setCustomTargets({ ...targetAllocations })} 
                    className="h-8 text-xs font-semibold rounded-lg hover:bg-background"
                  >
                    Reset Changes
                  </Button>
                  <Button 
                    disabled={Math.abs(totalCustomTargetSum - 100) > 0.01} 
                    onClick={handleSaveTargets} 
                    size="sm" 
                    className="h-8 text-xs font-semibold rounded-lg"
                  >
                    Save Allocation Strategy
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* TAB 3: SMART REBALANCER */}
          <TabsContent value="rebalance" className="m-0 focus-visible:outline-none focus-visible:ring-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Table of Rebalancing comparisons */}
              <div className="lg:col-span-8 flex flex-col p-4 rounded-2xl border border-border/50 bg-background overflow-x-auto">
                <h3 className="text-xs font-bold text-foreground mb-0.5">Portfolio Rebalancing Guide</h3>
                <p className="text-[10px] text-muted-foreground mb-4">Compares current allocations with strategic target percentages to identify surplus and deficit weights.</p>
                
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-border/30">
                      <TableHead className="py-2">Asset Class</TableHead>
                      <TableHead className="text-right py-2">Current Value</TableHead>
                      <TableHead className="text-right py-2">Current %</TableHead>
                      <TableHead className="text-right py-2">Target %</TableHead>
                      <TableHead className="text-right py-2">Deviation</TableHead>
                      <TableHead className="text-right py-2">Required Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rebalanceData.map((row) => {
                      const absoluteDeviation = Math.abs(row.deviation);
                      const isUnder = row.deviation < -2;
                      const isOver = row.deviation > 2;

                      return (
                        <TableRow key={row.class} className="hover:bg-muted/10 border-b border-border/30 py-1.5">
                          <TableCell className="font-semibold py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                              <span className="truncate max-w-[140px] text-foreground">{row.class}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono py-2">{formatCurrency(row.currentVal)}</TableCell>
                          <TableCell className="text-right font-mono py-2 text-muted-foreground">{row.currentPct.toFixed(1)}%</TableCell>
                          <TableCell className="text-right font-mono py-2 font-medium">{row.targetPct}%</TableCell>
                          <TableCell className={`text-right font-mono py-2 font-bold ${isUnder ? 'text-red-500' : isOver ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {row.deviation > 0 ? '+' : ''}{row.deviation.toFixed(1)}%
                          </TableCell>
                          <TableCell className="text-right py-2">
                            {isUnder ? (
                              <Badge variant="outline" className="text-[10px] font-semibold border-red-500/40 text-red-500 bg-red-500/5 py-0 px-2 rounded-lg">
                                Buy {formatCurrency(row.requiredAdjustment)}
                              </Badge>
                            ) : isOver ? (
                              <Badge variant="outline" className="text-[10px] font-semibold border-amber-500/40 text-amber-500 bg-amber-500/5 py-0 px-2 rounded-lg">
                                Trim / Hold
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-semibold border-emerald-500/40 text-emerald-500 bg-emerald-500/5 py-0 px-2 rounded-lg">
                                On Target
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Smart Capital Deployer Slider/Form */}
              <div className="lg:col-span-4 flex flex-col justify-between p-5 rounded-2xl border border-border/50 bg-muted/20 relative">
                <div className="space-y-4">
                  <div className="flex items-center gap-1.5">
                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                      <Sparkles className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-foreground">Smart Capital Deployer</h4>
                      <p className="text-[10px] text-muted-foreground">Type in an amount of new money you want to invest. The algorithm will optimally distribute it to bring you closest to your target allocations.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-foreground">New Capital to Invest (KES)</label>
                    <div className="relative">
                      <Coins className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="number"
                        min="0"
                        step="1000"
                        placeholder="e.g. 50000"
                        className="h-8.5 text-xs font-mono pl-8 rounded-lg"
                        value={newCapital || ''}
                        onChange={(e) => setNewCapital(Math.max(0, parseFloat(e.target.value) || 0))}
                      />
                    </div>
                  </div>

                  {deployedCapitalAllocation && newCapital > 0 && (
                    <div className="space-y-2 border-t border-border/40 pt-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Optimal Deployment Strategy</div>
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                        {ASSET_CLASSES.map(cls => {
                          const allocatedAmount = deployedCapitalAllocation[cls] || 0;
                          if (allocatedAmount <= 0) return null;
                          return (
                            <div key={cls} className="flex justify-between items-center text-xs p-1.5 rounded-lg bg-background border border-border/40 font-medium">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CLASS_COLORS[cls] }} />
                                <span className="truncate text-foreground text-[11px]">{cls}</span>
                              </div>
                              <span className="font-mono font-bold text-emerald-500 shrink-0">
                                +{formatCurrency(allocatedAmount)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-border/40 text-[10px] text-muted-foreground flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3 shrink-0 text-primary" />
                  Calculations update dynamically based on live portfolio currentValue.
                </div>
              </div>

            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
