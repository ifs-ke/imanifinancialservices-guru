const fs = require('fs');
const content = fs.readFileSync('src/components/ui/sidebar.tsx', 'utf8');

const auditButton = `
            {/* Security Audit Button */}
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const passed = syncManager.performSecurityAudit();
                      if (passed) {
                        alert('Security Audit Passed: Local store is clean and securely isolated.');
                      } else {
                        alert('Security Audit Failed: Data leak detected! Leaked data has been securely wiped.');
                      }
                    }}
                    className={cn(
                      "w-full justify-start text-sm h-9 mt-1",
                      sidebarActualState === "collapsed" && "justify-center px-0 w-9 h-9",
                      "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    aria-label="Security Audit"
                  >
                    <ShieldAlert size={18} className="flex-shrink-0 text-primary" />
                    <span className={cn("ml-2 truncate text-xs", sidebarActualState === "collapsed" && "hidden")}>
                      Security Audit
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Run Client-Side Data Leak Audit</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
`;

const newContent = content.replace("{/* Sync Button */}", auditButton + "\n            {/* Sync Button */}");
fs.writeFileSync('src/components/ui/sidebar.tsx', newContent);
